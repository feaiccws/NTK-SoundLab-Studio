/* Android-only presentation and a main-frame, exact-origin MessagePort bridge. */
(() => {
  'use strict';
  let port, seq = 0, exportQueue = Promise.resolve(), exporting = 0;
  const pending = new Map(), blobs = new Map();
  const originalCreate = URL.createObjectURL.bind(URL), originalRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = originalCreate(blob); blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => { blobs.delete(url); originalRevoke(url); };
  const send = data => { if (port) port.postMessage(JSON.stringify(data)); };
  function request(type, values = {}) {
    return new Promise((resolve, reject) => {
      if (!port) return reject(new Error('Android is still opening the studio. Try again.'));
      const key = String(++seq);
      const timer = setTimeout(() => { pending.delete(key); reject(new Error('Android did not finish the export. Try again.')); }, 60000);
      pending.set(key, { resolve, reject, timer }); send({ ...values, type, request: key });
    });
  }
  window.addEventListener('message', event => {
    // Android postWebMessage has an empty source origin and null WindowProxy.
    // Java targets the exact bundled origin and main frame; reject web-frame/synthetic handshakes.
    if (!event.isTrusted || event.source !== null || event.origin !== '' || event.data !== 'ntk-studio-port' || event.ports.length !== 1) return;
    if (port) port.close(); port = event.ports[0];
    port.onmessage = e => { let value; try { value = JSON.parse(e.data); } catch { return; } const p = pending.get(value.request); if (!p) return; pending.delete(value.request); clearTimeout(p.timer); value.ok ? p.resolve(value.value) : p.reject(new Error(value.value)); };
    send({ type: 'ready' });
  });
  async function transfer(blob, name) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error('This export is empty.');
    const id = crypto.randomUUID();
    await request('begin', { id, name, size: blob.size, mime: blob.type || 'application/octet-stream' });
    try {
      for (let offset = 0; offset < blob.size; offset += 196608) {
        const chunk = blob.slice(offset, offset + 196608);
        const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Cannot read the export.')); reader.readAsDataURL(chunk); });
        await request('chunk', { id, data: encoded });
      }
      await request('finish', { id });
    } catch (error) { await request('abort', { id }).catch(() => {}); throw error; }
  }
  function save(blobOrPromise, name) {
    exporting++;
    const result = exportQueue.then(async () => { send({ type: 'busy', value: true }); await transfer(await blobOrPromise, name || 'Studio-export'); });
    exportQueue = result.catch(error => window.app?.showToast(error.message, 'rose')).finally(() => { exporting--; send({ type: 'busy', value: false }); });
    return result;
  }
  function capture(anchor) {
    if (!anchor.download || !/^(blob:|data:)/.test(anchor.href)) return false;
    // Resolve synchronously: some existing exports revoke their URL immediately after click().
    const blob = blobs.get(anchor.href) || fetch(anchor.href).then(r => r.blob());
    save(blob, anchor.download).catch(() => {}); return true;
  }
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!capture(this)) return click.call(this); };
  document.addEventListener('click', e => { const a = e.target.closest?.('a[download]'); if (a && capture(a)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  function renderingBusy() { const op=window.app?.videoStudio?._exportOperation; return !!op && !op.cancelled && !op.completed; }
  function back() {
    if (document.fullscreenElement || document.getElementById('canvasContainer')?.classList.contains('cinema-fullscreen')) { app.exitPreviewFullscreen(); return true; }
    const modals = [...document.querySelectorAll('.modal-overlay.open')];
    if (modals.length) {
      if (renderingBusy() && !confirm('Stop the current video render and go back?')) return true;
      const modal = modals.at(-1); const close = modal.querySelector('[data-close-modal]');
      if (close) close.click(); else { modal.classList.remove('open'); app.stopAllModalAudio(); }
      return true;
    }
    if (document.body.dataset.screen !== 'library') { library(); return true; }
    return false;
  }
  function library() { while (document.querySelector('.modal-overlay.open')) { if (renderingBusy()) { back(); return; } back(); } document.body.dataset.screen = 'library'; window.scrollTo(0,0); }
  function importMedia() { document.getElementById('localAudioFileInput').click(); }
  function tracks() { return JSON.stringify([...document.querySelectorAll('.song-card')].map(card => ({uuid: card.id.replace(/^card-/, ''), title: card.querySelector('.song-title-input')?.value || 'Untitled'}))); }
  async function openStudio(uuid) { await app.openVideoStudio(uuid); app.switchVideoTab('lyrics'); document.getElementById('vtab-lyrics')?.scrollIntoView({block:'start'}); }
  function pause() { app.transcribe?.cancel(); app.player.pause(); const rendering = renderingBusy(); app.stopAllModalAudio(); if (rendering) app.showToast('Render stopped because the app went into the background. Keep the studio open while exporting video.', 'amber'); }
  function connected() { send({type:'state',modal:!!document.querySelector('.modal-overlay.open')}); }
  Object.defineProperty(window, 'AndroidStudio', {value: Object.freeze({ library, importMedia, tracks, openStudio, back, pause, connected, save }), writable:false});

  document.addEventListener('DOMContentLoaded', () => {
    document.body.dataset.screen = 'library';
    // This listener is installed before app.js registers its init listener.
    app.setupPwa = () => {};
    app.triggerDownload = (blob, name) => { save(blob, name).catch(() => {}); };
    const showToast = app.showToast.bind(app);
    app.showToast = (message, color) => showToast(exporting && color === 'emerald' && /export|download/i.test(message) ? 'Export created. Choose Save or Share when it is ready.' : message, color);
    const originalSettings = app.loadVideoStudioSettings.bind(app);
    app.loadVideoStudioSettings = () => { const settings = originalSettings(); if (!localStorage.getItem('ntk_android_video_defaults')) { settings.resolution = '720p'; settings.fps = 30; } return settings; };
    const saveSettings = app.saveVideoStudioSettings.bind(app);
    app.saveVideoStudioSettings = () => { saveSettings(); localStorage.setItem('ntk_android_video_defaults', '1'); };
    app.pasteAndResolveClipboard = async () => { try { document.getElementById('songUrlInput').value = await request('clipboard'); showToast('Link pasted. Tap Extract when you are ready.', 'cyan'); } catch(e) { showToast(e.message,'rose'); } };
    const main = document.querySelector('main');
    const hero = document.createElement('section'); hero.className = 'android-home';
    hero.innerHTML = `<div class="android-eyebrow">MAKE SOMETHING YOURS</div><h2>Your sound.<br><span>Your studio.</span></h2><p>Turn the music on your phone into something worth sharing.</p><button class="android-import" type="button">＋ &nbsp; Import audio or video</button><div class="android-chips"><span>♪ Edit audio</span><span>✦ Add lyrics</span><span>▷ Create video</span></div><details class="android-links"><summary>Have a Suno or direct media link?</summary><p>Internet is required. Some websites need a server that is not included in this app.</p><div id="androidLinkSlot"></div></details>`;
    main.prepend(hero); hero.querySelector('.android-import').onclick = importMedia;
    const inputSection = document.getElementById('songUrlInput').closest('section'); hero.querySelector('#androidLinkSlot').append(inputSection);
    inputSection.querySelector('.input-label span').textContent = 'Paste your media link';
    document.getElementById('songUrlInput').placeholder = 'Paste a Suno song or direct audio/video link';
    const deck = document.getElementById('songsContainer').closest('section'); deck.classList.add('android-library');
    deck.querySelector('.section-title > span:first-child').textContent = 'Your library';
    const render = app.renderSongs.bind(app);
    app.renderSongs = () => { render(); const container = document.getElementById('songsContainer'); if (!container.querySelector('.song-card')) container.innerHTML = `<div class="android-empty"><div class="android-empty-icon">♫</div><h3>A place for your next idea</h3><p>Import a song to start editing.<br>Your library stays on this device.</p></div>`; container.querySelectorAll('iframe').forEach(el => el.remove()); };
    const tabBar=document.querySelector('.studio-tabs-bar'); ['lyrics','export','background','visualizer','artwork','brand','particles','ads'].forEach(name=>{const b=tabBar.querySelector(`[data-vtab="${name}"]`);if(b)tabBar.append(b);});
    const lyricsTab=document.getElementById('vtab-lyrics');
    const editorGroup=document.getElementById('videoLyricsTextarea').closest('.control-group');
    const sourceGroup=document.getElementById('videoLyricsFileInput').closest('.control-group');
    const aiStation=lyricsTab.querySelector('.ai-sync-station');
    const polish=editorGroup.querySelector('[onclick*="aiPolishLyrics"]');
    if(polish){polish.textContent='Polish wording';aiStation.append(polish);}
    editorGroup.querySelector('label').textContent='Live Lyrics Editor';
    lyricsTab.prepend(editorGroup);editorGroup.after(sourceGroup);sourceGroup.after(aiStation);
    const appearance=document.createElement('details');appearance.className='android-appearance';
    const summary=document.createElement('summary');summary.textContent='Lyric appearance';appearance.append(summary);
    [...lyricsTab.children].filter(el=>![editorGroup,sourceGroup,aiStation].includes(el)).forEach(el=>appearance.append(el));lyricsTab.append(appearance);
    document.getElementById('btnToggleTapSync').textContent='Tap to sync';
    const state = new MutationObserver(() => { const modal = !!document.querySelector('.modal-overlay.open'); document.body.classList.toggle('android-modal',modal); send({type:'state',modal}); });
    document.querySelectorAll('.modal-overlay').forEach(el=>state.observe(el,{attributes:true,attributeFilter:['class']}));
    setInterval(()=>send({type:'busy',value:renderingBusy()||exporting>0||!!app.transcribe?.busy}),1000);
    document.addEventListener('focusin',e=>{if(e.target.matches('input,textarea,select'))document.body.classList.add('android-keyboard');});
    document.addEventListener('focusout',()=>setTimeout(()=>{if(!document.activeElement.matches('input,textarea,select'))document.body.classList.remove('android-keyboard');},100));
  });
})();
