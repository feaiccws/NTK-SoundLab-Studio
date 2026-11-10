package com.ntkhub.omnistream;

import android.app.*;
import android.content.*;
import android.content.pm.ApplicationInfo;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Native Android navigation and document integration around the shared offline studio engine. */
public final class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final int INK = Color.rgb(11,16,24), SURFACE = Color.rgb(16,25,36), MINT = Color.rgb(86,222,208), MUTED = Color.rgb(157,176,193);
    static final int PICK = 70, SAVE = 71;
    private WebView web;
    private LinearLayout root, toolbar, nav;
    private FrameLayout content;
    private TextView title, subtitle;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private ValueCallback<Uri[]> fileCallback;
    private WebMessagePort channel;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ArrayList<LinearLayout> navItems = new ArrayList<>();
    private File currentExport, saveTarget;
    private String currentName, currentMime, saveName;
    private FileOutputStream exportStream;
    private String exportId;
    private long exportSize, exportWritten;
    private boolean ready, pendingExport;

    private int dp(float n) { return Math.round(n * getResources().getDisplayMetrics().density); }
    private GradientDrawable rounded(int color, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d; }
    private TextView text(String value, int size, int color) { TextView t = new TextView(this); t.setText(value); t.setTextColor(color); t.setTextSize(size); return t; }
    private void toast(String value) { Toast.makeText(this, value, Toast.LENGTH_LONG).show(); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(INK); getWindow().setNavigationBarColor(SURFACE);
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(INK);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> { android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime()); v.setPadding(i.left, i.top, i.right, i.bottom); return insets; });
        }
        toolbar = new LinearLayout(this); toolbar.setGravity(Gravity.CENTER_VERTICAL); toolbar.setPadding(dp(20),0,dp(12),0);
        IconView logo = new IconView(2); logo.setContentDescription("NTK Hub"); toolbar.addView(logo, new LinearLayout.LayoutParams(dp(32),dp(32)));
        LinearLayout titles = new LinearLayout(this); titles.setPadding(dp(12),0,0,0); titles.setOrientation(LinearLayout.VERTICAL);
        title = text("OmniStream",21,Color.WHITE); title.setTypeface(null,1); subtitle = text("NTK HUB  /  YOUR POCKET STUDIO",9,MUTED); subtitle.setLetterSpacing(.1f);
        titles.addView(title); titles.addView(subtitle); toolbar.addView(titles,new LinearLayout.LayoutParams(0,dp(48),1));
        TextView help = text("?",22,MINT); help.setGravity(Gravity.CENTER); help.setContentDescription("Help and guide"); help.setBackground(rounded(SURFACE,24)); help.setOnClickListener(v -> js("app.openTutorialModal()")); toolbar.addView(help,new LinearLayout.LayoutParams(dp(48),dp(48)));
        root.addView(toolbar,new LinearLayout.LayoutParams(-1,dp(72)));
        content = new FrameLayout(this); root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        web = new WebView(this); web.setBackgroundColor(INK); web.setAlpha(0f); content.addView(web,new FrameLayout.LayoutParams(-1,-1));
        nav = new LinearLayout(this); nav.setBackgroundColor(SURFACE); nav.setPadding(dp(8),dp(4),dp(8),dp(4));
        String[] labels = {"Library","Transcribe","Karaoke","Tools"};
        for (int i=0;i<labels.length;i++) {
            final int index=i; LinearLayout item=new LinearLayout(this); item.setOrientation(1); item.setGravity(Gravity.CENTER); item.setContentDescription(labels[i]); item.setFocusable(true); item.setClickable(true);
            IconView icon=new IconView(i); item.addView(icon,new LinearLayout.LayoutParams(dp(26),dp(26))); TextView label=text(labels[i],11,MUTED); label.setGravity(Gravity.CENTER); item.addView(label); item.setOnClickListener(v->navigate(index)); nav.addView(item,new LinearLayout.LayoutParams(0,-1,1)); navItems.add(item);
        }
        root.addView(nav,new LinearLayout.LayoutParams(-1,dp(68))); setContentView(root); selectNav(0);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setMediaPlaybackRequiresUserGesture(false); s.setSupportMultipleWindows(false); s.setJavaScriptCanOpenWindowsAutomatically(false); s.setBuiltInZoomControls(false); s.setTextZoom(100);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE)!=0);
        web.setWebViewClient(new LocalClient()); web.setWebChromeClient(new Chrome());
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){ @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r){ return intercept(r); }});
        web.setDownloadListener((url,agent,disposition,mime,size)->toast("Use the studio Export controls to save or share your file."));
        pruneOldExports();
        if (Build.VERSION.SDK_INT>=33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0,()->back());
        web.loadUrl(ORIGIN+"/index.html");
    }

    private void js(String code) { if (ready) web.evaluateJavascript(code,null); }
    private void selectNav(int index) { for(int i=0;i<navItems.size();i++){ LinearLayout item=navItems.get(i); item.setBackground(rounded(i==index?Color.rgb(25,54,59):SURFACE,18)); ((TextView)item.getChildAt(1)).setTextColor(i==index?MINT:MUTED); } }
    private void navigate(int index) {
        if (!ready) { toast("Opening your studio…"); return; }
        if (index==3) { toolsSheet(); return; }
        if (index==1) { selectNav(index); js("app.transcribe.open()"); return; }
        selectNav(index);
        if (index==0) js("AndroidStudio.library()");
        if (index==2) web.evaluateJavascript("AndroidStudio.tracks()", encoded->{
            try {
                JSONArray songs=new JSONArray(new JSONTokener(encoded).nextValue().toString());
                if(songs.length()==0) { showSheet("Create a karaoke video","Import a song, add its lyrics, then preview and export your video.",new String[]{"Import audio or video"},new Runnable[]{()->js("AndroidStudio.importMedia()")}); return; }
                String[] names=new String[songs.length()]; Runnable[] actions=new Runnable[songs.length()];
                for(int i=0;i<songs.length();i++){ JSONObject song=songs.getJSONObject(i); names[i]=song.optString("title","Untitled"); String id=song.getString("uuid"); actions[i]=()->js("AndroidStudio.openStudio("+JSONObject.quote(id)+")"); }
                showSheet("Choose your song","Open lyrics and video tools",names,actions);
            } catch(Exception e){ toast("The library is still loading. Try again."); }
        });
    }
    private void toolsSheet(){
        showSheet("Studio tools","Your projects stay on this device. AI is optional.",
            new String[]{"Offline storage","AI and lyrics settings","Import a session","Export session metadata","Save or share last export","How to use the studio","About this Android app"},
            new Runnable[]{()->js("app.openVaultModal()"),()->js("app.openAiSettingsModal()"),()->js("document.getElementById('deckJsonFileInput').click()"),()->js("app.exportDeckJson()"),()->{if(currentExport!=null&&currentExport.isFile())exportReady();else toast("Export a file from the studio first.");},()->js("app.openTutorialModal()"),()->new AlertDialog.Builder(this).setTitle("OmniStream Studio · NTK Hub").setMessage("2026.11.3.1 · Android edition\n\nLocal audio, lyrics and karaoke tools open offline. Save copies with Android Files or Share. Keep the app visible while rendering video.\n\nAI recognition needs internet, your own eligible provider account and upload confirmation. Desktop Python helpers and server download/conversion services are not bundled.\n\nUninstalling removes local projects and keys. Export important media and session metadata first; session JSON does not include audio.").setPositiveButton("Done",null).show()});
    }
    private Dialog showSheet(String heading,String detail,String[] labels,Runnable[] actions){
        Dialog dialog=new Dialog(this); LinearLayout box=new LinearLayout(this); box.setOrientation(1); box.setPadding(dp(24),dp(24),dp(24),dp(24)); box.setBackground(rounded(SURFACE,24));
        TextView h=text(heading,24,Color.WHITE); h.setTypeface(null,1); box.addView(h); TextView d=text(detail,14,MUTED); d.setPadding(0,dp(8),0,dp(20)); box.addView(d);
        for(int i=0;i<labels.length;i++){ final int n=i; TextView row=text(labels[i],16,Color.WHITE); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(14),0,dp(14),0); row.setBackground(rounded(INK,12)); row.setFocusable(true); row.setContentDescription(labels[i]); LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(54)); lp.bottomMargin=dp(8); box.addView(row,lp); row.setOnClickListener(v->{dialog.dismiss();actions[n].run();}); }
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(false); scroll.addView(box); dialog.setContentView(scroll); Window w=dialog.getWindow(); if(w!=null){w.setBackgroundDrawableResource(android.R.color.transparent);w.setLayout(-1,-2);w.setGravity(Gravity.BOTTOM);w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);w.setDimAmount(.5f);} dialog.show(); if(w!=null)w.setLayout(-1,-2); return dialog;
    }
    private void back(){
        if(fullscreen!=null){hideFullscreen();return;}
        if(!ready){finish();return;}
        web.evaluateJavascript("AndroidStudio.back()",value->{if(!"true".equals(value))new AlertDialog.Builder(this).setTitle("Close the studio?").setMessage("Your library and saved lyrics stay on this device. Playback and any current render will stop.").setNegativeButton("Keep editing",null).setPositiveButton("Close",(d,w)->finish()).show();});
    }
    @Override public void onBackPressed(){back();}
    @Override protected void onPause(){js("AndroidStudio.pause()");super.onPause();}
    @Override protected void onDestroy(){
        ready=false; if(fileCallback!=null)fileCallback.onReceiveValue(null); if(channel!=null)channel.close(); if(web!=null){web.stopLoading();web.destroy();} io.execute(()->abortExport()); io.shutdown();super.onDestroy();
    }

    private final class LocalClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest r){return intercept(r);}
        @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){
            Uri u=r.getUrl(); if(isLocal(u)&&("/".equals(u.getPath())||"/index.html".equals(u.getPath())))return false;
            if(r.isForMainFrame()&&r.hasGesture()&&("https".equals(u.getScheme())||"http".equals(u.getScheme())))try{startActivity(new Intent(Intent.ACTION_VIEW,u).addCategory(Intent.CATEGORY_BROWSABLE));}catch(ActivityNotFoundException e){toast("No browser is installed.");}
            return true;
        }
        @Override public void onPageFinished(WebView view,String url){
            if(!url.equals(ORIGIN+"/index.html"))return;
            if(channel!=null)channel.close(); WebMessagePort[] ports=web.createWebMessageChannel(); channel=ports[0];
            channel.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort p,WebMessage m){receive(m.getData());}});
            web.postWebMessage(new WebMessage("ntk-studio-port",new WebMessagePort[]{ports[1]}),Uri.parse(ORIGIN));
        }
        @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){ready=false;content.removeView(web);web.destroy();new AlertDialog.Builder(MainActivity.this).setTitle("Studio needs to reopen").setMessage("Android closed the media engine. Your saved library is kept. Try a shorter clip or lower video resolution.").setCancelable(false).setPositiveButton("Reopen",(d,w)->recreate()).show();return true;}
    }
    private boolean isLocal(Uri u){return "https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443);}
    private WebResourceResponse response(int status,String mime,String body){return new WebResourceResponse(mime,"UTF-8",status,status==200?"OK":"Unavailable",Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));}
    private WebResourceResponse intercept(WebResourceRequest r){
        Uri u=r.getUrl();
        if(isLocal(u)){
            String path=u.getPath();if(path==null)return response(404,"text/plain","");
            if(path.equals("/api/desktop/heartbeat"))return response(200,"application/json","{\"ok\":true}");
            if(path.startsWith("/api/"))return response(404,"application/json","{\"error\":\"This Android app has no server download or desktop helper service. Import a local file.\"}");
            if(path.equals("/sw.js"))return response(404,"text/plain","Bundled offline application");
            if(!r.getMethod().equals("GET")||path.contains("..")||path.contains("\\"))return response(403,"text/plain","");
            if(path.equals("/"))path="/index.html";
            try {
                InputStream bytes=getAssets().open("www"+path);String ext=path.substring(path.lastIndexOf('.')+1);String mime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext); if(ext.equals("js"))mime="text/javascript";if(ext.equals("wasm"))mime="application/wasm";if(mime==null)mime="application/octet-stream";
                HashMap<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-cache");headers.put("X-Content-Type-Options","nosniff");headers.put("Content-Security-Policy","default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self' blob:");
                return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,bytes);
            } catch(IOException e){return response(404,"text/plain","Asset not found");}
        }
        String host=u.getHost()==null?"":u.getHost().toLowerCase(Locale.ROOT);
        if(!"https".equals(u.getScheme())||host.equals("localhost")||host.endsWith(".localhost")||host.startsWith("127.")||host.equals("[::1]")||host.equals("10.0.2.2"))return response(403,"text/plain","Blocked local or insecure address");
        return null;
    }
    private final class Chrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
            if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
            LinkedHashSet<String> types=new LinkedHashSet<>(); boolean unknown=false;
            for(String raw:params.getAcceptTypes())for(String type:raw.split(",")){type=type.trim();if(type.startsWith(".")){String m=MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));if(m==null)unknown=true;else types.add(m);}else if(type.contains("/"))types.add(type);}
            if(!unknown&&!types.isEmpty())intent.putExtra(Intent.EXTRA_MIME_TYPES,types.toArray(new String[0]));
            try{startActivityForResult(intent,PICK);}catch(ActivityNotFoundException e){fileCallback.onReceiveValue(null);fileCallback=null;toast("Android Files is unavailable on this device.");}return true;
        }
        @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
        @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setNegativeButton("Cancel",(d,w)->result.cancel()).setPositiveButton("Continue",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
        @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
        @Override public void onShowCustomView(View view,CustomViewCallback callback){if(fullscreen!=null){callback.onCustomViewHidden();return;}fullscreen=view;fullscreenCallback=callback;content.addView(view,new FrameLayout.LayoutParams(-1,-1));toolbar.setVisibility(View.GONE);nav.setVisibility(View.GONE);}
        @Override public void onHideCustomView(){hideFullscreen();}
    }
    private void hideFullscreen(){if(fullscreen!=null){content.removeView(fullscreen);fullscreen=null;fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;toolbar.setVisibility(View.VISIBLE);nav.setVisibility(View.VISIBLE);}}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==PICK&&fileCallback!=null){Uri[] uris=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){ClipData clip=data.getClipData();uris=new Uri[clip.getItemCount()];for(int i=0;i<uris.length;i++)uris[i]=clip.getItemAt(i).getUri();}else if(data.getData()!=null)uris=new Uri[]{data.getData()};}fileCallback.onReceiveValue(uris);fileCallback=null;}
        if(request==SAVE){final File file=saveTarget;final String name=saveName;saveTarget=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&file!=null){Uri dest=data.getData();io.execute(()->{try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(dest,"wt")){if(out==null)throw new IOException();byte[] buffer=new byte[65536];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);runOnUiThread(()->toast("Saved "+name));}catch(Exception e){runOnUiThread(()->toast("Could not save the file. Your export is still available in Tools."));}});}else toast("Save cancelled. You can save or share the export from Tools.");}
    }

    private void receive(String data){
        if(data==null||data.length()>300000)return;
        try{JSONObject m=new JSONObject(data);String type=m.optString("type");
            if(type.equals("ready")){ready=true;web.animate().alpha(1f).setDuration(150).start();js("AndroidStudio.connected()");return;}
            if(type.equals("state")){boolean modal=m.optBoolean("modal");title.setText(modal?"Studio":"OmniStream");nav.setVisibility(modal?View.GONE:View.VISIBLE);if(!modal)selectNav(0);return;}
            if(type.equals("busy")){web.setKeepScreenOn(m.optBoolean("value"));return;}
            if(type.equals("clipboard")){android.content.ClipboardManager cb=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);String value="";if(cb.hasPrimaryClip()&&cb.getPrimaryClip().getItemCount()>0)value=cb.getPrimaryClip().getItemAt(0).coerceToText(this).toString();reply(m.optString("request"),true,value);return;}
            if(type.equals("begin")||type.equals("chunk")||type.equals("finish")||type.equals("abort"))io.execute(()->exportMessage(m));
        }catch(Exception e){toast("The studio could not complete that operation.");}
    }
    private void reply(String request,boolean ok,String value){runOnUiThread(()->{if(channel==null||isDestroyed())return;try{JSONObject o=new JSONObject();o.put("request",request);o.put("ok",ok);o.put("value",value);channel.postMessage(new WebMessage(o.toString()));}catch(Exception ignored){}});}
    private void exportMessage(JSONObject m){String request=m.optString("request");try{
        String type=m.getString("type"),id=m.optString("id");
        if(type.equals("begin")){
            if(exportStream!=null||pendingExport)throw new IOException("Finish the current export first.");long size=m.getLong("size");if(size<=0||size>512L*1024*1024)throw new IOException("Exports must be between 1 byte and 512 MB. Use a shorter clip or lower resolution.");
            String name=m.optString("name","Studio-export").replaceAll("[^a-zA-Z0-9._ -]","_").replace("..","_");if(name.length()>100)name=name.substring(name.length()-100);if(name.isEmpty())name="Studio-export";
            File dir=new File(getCacheDir(),"exports");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("Cannot create export folder.");if(dir.getUsableSpace()<size+16*1024*1024)throw new IOException("Free some device storage and try again.");
            exportId=id;exportSize=size;exportWritten=0;currentName=name;currentMime=m.optString("mime","application/octet-stream").split(";")[0];currentExport=new File(dir,UUID.randomUUID().toString()+"_"+name);exportStream=new FileOutputStream(currentExport);reply(request,true,"");return;
        }
        if(exportStream==null||!id.equals(exportId))throw new IOException("The export session ended. Please export again.");
        if(type.equals("chunk")){byte[] bytes=android.util.Base64.decode(m.getString("data"),android.util.Base64.NO_WRAP);if(bytes.length>196608||exportWritten+bytes.length>exportSize)throw new IOException("Invalid export chunk.");exportStream.write(bytes);exportWritten+=bytes.length;reply(request,true,"");}
        else if(type.equals("finish")){if(exportWritten!=exportSize)throw new IOException("The export was incomplete.");exportStream.close();exportStream=null;pendingExport=true;reply(request,true,"");runOnUiThread(()->{if(!isFinishing())exportReady();else pendingExport=false;});}
        else if(type.equals("abort")){abortExport();reply(request,true,"");}
    }catch(Exception e){abortExport();reply(request,false,e.getMessage()==null?"Export failed. Please try again.":e.getMessage());}}
    private void abortExport(){if(exportStream!=null){try{exportStream.close();}catch(IOException ignored){}exportStream=null;if(currentExport!=null)currentExport.delete();currentExport=null;}exportId=null;}
    private void exportReady(){long size=currentExport.length();String label=size<1024?size+" bytes":size<1048576?String.format(Locale.ROOT,"%.1f KB",size/1024.0):String.format(Locale.ROOT,"%.1f MB",size/1048576.0);showSheet("Your export is ready",currentName+" · "+label,new String[]{"Save a copy to Files","Share with another app"},new Runnable[]{this::saveExport,this::shareExport}).setOnDismissListener(d->pendingExport=false);}
    private void saveExport(){if(saveTarget!=null){toast("Finish the current save first.");return;}saveTarget=currentExport;saveName=currentName;String ext=currentName.substring(currentName.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);String saveMime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);if(saveMime==null)saveMime="application/octet-stream";Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(saveMime).putExtra(Intent.EXTRA_TITLE,currentName);try{startActivityForResult(intent,SAVE);}catch(ActivityNotFoundException e){saveTarget=null;toast("Android Files is unavailable.");}}
    private void shareExport(){Uri uri=new Uri.Builder().scheme("content").authority("com.ntkhub.omnistream.exports").appendPath(currentExport.getName()).build();Intent intent=new Intent(Intent.ACTION_SEND).setType(currentMime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newUri(getContentResolver(),currentName,uri));try{startActivity(Intent.createChooser(intent,"Share your export"));}catch(ActivityNotFoundException e){toast("No app can share this file yet. Save a copy to Files.");}}
    private void pruneOldExports(){File dir=new File(getCacheDir(),"exports");File[] files=dir.listFiles();if(files!=null)for(File f:files)if(f.isFile()&&System.currentTimeMillis()-f.lastModified()>24L*60*60*1000)f.delete();}

    private final class IconView extends View {
        private final int kind; private final Paint paint=new Paint(3);
        IconView(int kind){super(MainActivity.this);this.kind=kind;}
        @Override protected void onDraw(Canvas c){super.onDraw(c);c.save();c.scale(getWidth()/24f,getHeight()/24f);paint.setColor(MINT);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.7f);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
            if(kind==0){c.drawRoundRect(3,4,20,20,3,3,paint);c.drawLine(8,4,8,20,paint);c.drawLine(12,9,16,9,paint);c.drawLine(12,14,16,14,paint);}
            if(kind==1){c.drawRoundRect(3,3,21,21,6,6,paint);c.drawLine(12,7,12,17,paint);c.drawLine(7,12,17,12,paint);}
            if(kind==2){Path p=new Path();p.moveTo(5,3);p.lineTo(22,12);p.lineTo(5,21);p.close();c.drawPath(p,paint);c.drawLine(9,10,9,14,paint);c.drawLine(13,8,13,16,paint);}
            if(kind==3){c.drawLine(4,6,20,6,paint);c.drawLine(4,12,20,12,paint);c.drawLine(4,18,20,18,paint);paint.setStyle(Paint.Style.FILL);c.drawCircle(9,6,2.7f,paint);c.drawCircle(16,12,2.7f,paint);c.drawCircle(8,18,2.7f,paint);}c.restore();
        }
    }
}
