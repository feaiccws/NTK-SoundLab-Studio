/**
 * NTK SoundLab Studio - Interactive Novice Guide & Onboarding Engine
 * Handles step navigation, visual simulators, audio stem playground, and PWA installation prompts.
 */

export class TutorialManager {
  constructor(app) {
    this.app = app;
    this.currentStep = 0;
    this.totalSteps = 6;
    this.isSimulating = false;

    this.init();
  }

  init() {
    this.bindEvents();
    this.checkFirstVisit();
  }

  bindEvents() {
    // Top pills navigation
    document.querySelectorAll('[data-tut-step]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const step = parseInt(e.currentTarget.getAttribute('data-tut-step'), 10);
        this.goToStep(step);
      });
    });

    // Previous / Next buttons
    const btnPrev = document.getElementById('btnTutPrev');
    const btnNext = document.getElementById('btnTutNext');
    if (btnPrev) btnPrev.addEventListener('click', () => this.prevStep());
    if (btnNext) btnNext.addEventListener('click', () => this.nextStep());

    // Interactive Platform Switcher (iOS / Android / PC)
    document.querySelectorAll('[data-tut-platform]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const platform = e.currentTarget.getAttribute('data-tut-platform');
        this.switchPlatform(platform);
      });
    });

    // Interactive Stem Fader Simulator
    const vocFader = document.getElementById('simVocFader');
    const instFader = document.getElementById('simInstFader');
    if (vocFader) {
      vocFader.addEventListener('input', (e) => this.updateStemFader('voc', e.target.value));
    }
    if (instFader) {
      instFader.addEventListener('input', (e) => this.updateStemFader('inst', e.target.value));
    }

    // Interactive Simulator Trigger
    const btnSimulate = document.getElementById('btnSimulateExtract');
    if (btnSimulate) {
      btnSimulate.addEventListener('click', () => this.runSimulation());
    }
  }

  checkFirstVisit() {
    try {
      const seen = localStorage.getItem('omnistream_tutorial_seen');
      if (!seen) {
        // Highlight the newbie banner with subtle animation
        const banner = document.getElementById('noviceGuideBanner');
        if (banner) {
          banner.style.display = 'flex';
        }
      }
    } catch (_) {}
  }

  open(step = 0) {
    this.goToStep(step);
    const modal = document.getElementById('tutorialModal');
    if (modal) {
      modal.classList.add('open');
    }
  }

  close() {
    const modal = document.getElementById('tutorialModal');
    if (modal) {
      modal.classList.remove('open');
      try {
        localStorage.setItem('omnistream_tutorial_seen', 'true');
      } catch (_) {}
    }
    if (this.app && typeof this.app.showToast === 'function') {
      this.app.showToast('You are ready to rock! Paste your first link below 🎵', 'cyan');
    }
  }

  goToStep(index) {
    if (index < 0) index = 0;
    if (index >= this.totalSteps) {
      this.close();
      return;
    }

    this.currentStep = index;

    // Update slides visibility
    document.querySelectorAll('.tutorial-slide').forEach((slide, idx) => {
      slide.classList.toggle('active', idx === index);
    });

    // Update top pills
    document.querySelectorAll('[data-tut-step]').forEach((pill, idx) => {
      pill.classList.toggle('active', idx === index);
      pill.classList.toggle('completed', idx < index);
    });

    // Update bottom dots
    document.querySelectorAll('.tut-dot').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === index);
    });

    // Update buttons
    const btnPrev = document.getElementById('btnTutPrev');
    const btnNext = document.getElementById('btnTutNext');
    if (btnPrev) {
      btnPrev.style.visibility = index === 0 ? 'hidden' : 'visible';
    }
    if (btnNext) {
      btnNext.textContent = index === this.totalSteps - 1 ? 'Got It! Start Studio 🚀' : 'Next Step →';
    }

    // Update progress text
    const progText = document.getElementById('tutStepCounter');
    if (progText) {
      progText.textContent = `Step ${index + 1} of ${this.totalSteps}`;
    }
  }

  nextStep() {
    this.goToStep(this.currentStep + 1);
  }

  prevStep() {
    this.goToStep(this.currentStep - 1);
  }

  switchPlatform(platform) {
    document.querySelectorAll('[data-tut-platform]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tut-platform') === platform);
    });

    const iosCard = document.getElementById('platformIos');
    const androidCard = document.getElementById('platformAndroid');
    const desktopCard = document.getElementById('platformDesktop');

    if (iosCard) iosCard.style.display = platform === 'ios' ? 'flex' : 'none';
    if (androidCard) androidCard.style.display = platform === 'android' ? 'flex' : 'none';
    if (desktopCard) desktopCard.style.display = platform === 'desktop' ? 'flex' : 'none';
  }

  updateStemFader(stem, val) {
    const num = parseInt(val, 10);
    const badge = document.getElementById(`sim${stem === 'voc' ? 'Voc' : 'Inst'}Badge`);
    if (badge) {
      if (num === 0) {
        badge.textContent = 'MUTED';
        badge.className = 'fader-status-badge badge-muted';
      } else {
        badge.textContent = `${num}%`;
        badge.className = 'fader-status-badge badge-loud';
      }
    }

    const visual = document.getElementById(`sim${stem === 'voc' ? 'Voc' : 'Inst'}Visual`);
    if (visual) {
      visual.style.opacity = (num / 100) * 0.9 + 0.1;
      visual.style.filter = num === 0 ? 'grayscale(1)' : 'none';
    }
  }

  async runSimulation() {
    if (this.isSimulating) return;
    this.isSimulating = true;

    const input = document.getElementById('simUrlInput');
    const progress = document.getElementById('simProgress');
    const result = document.getElementById('simResult');
    const btn = document.getElementById('btnSimulateExtract');

    if (!input || !progress || !result) return;

    btn.disabled = true;
    result.style.display = 'none';
    progress.style.display = 'block';
    progress.value = 10;
    input.value = '';

    const sampleUrl = 'https://suno.com/song/4eed94d1-9d36-4a8b-aa74-71250bbb8b0f';
    for (let i = 0; i < sampleUrl.length; i++) {
      input.value += sampleUrl[i];
      await new Promise((r) => setTimeout(r, 22));
    }

    for (let p = 20; p <= 100; p += 20) {
      progress.value = p;
      await new Promise((r) => setTimeout(r, 120));
    }

    progress.style.display = 'none';
    result.style.display = 'flex';
    btn.disabled = false;
    this.isSimulating = false;
  }
}
