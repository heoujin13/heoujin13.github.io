/**
 * 음성 안내 관리자
 *
 * Web Speech API(speechSynthesis)를 Driver 뒤에 감춰 두었습니다.
 * 모바일 앱 전환 시 NativeTtsDriver 로 교체할 수 있습니다.
 * 지원하지 않는 환경에서는 speak() 가 false 를 반환하고 앱은 계속 동작합니다.
 */

export class WebSpeechDriver {
  constructor(lang = 'ko-KR') {
    this.lang = lang;
    this.voice = null;
    if (this.supported) {
      this._pickVoice();
      try {
        window.speechSynthesis.addEventListener('voiceschanged', () => this._pickVoice());
      } catch {
        /* 구형 브라우저 */
      }
    }
  }

  get supported() {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function'
    );
  }

  _pickVoice() {
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      const lower = this.lang.toLowerCase();
      this.voice =
        voices.find((v) => v.lang?.toLowerCase() === lower) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(lower.slice(0, 2))) ||
        null;
    } catch {
      this.voice = null;
    }
  }

  speak(text, { rate = 1, volume = 1, interrupt = false } = {}) {
    if (!this.supported) return false;
    try {
      const synth = window.speechSynthesis;
      if (interrupt) synth.cancel();
      if (synth.paused) synth.resume();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      if (this.voice) u.voice = this.voice;
      u.rate = rate;
      u.volume = volume;
      u.onerror = (e) => {
        if (e?.error && e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('[Voice] 음성 출력 오류:', e.error);
        }
      };
      synth.speak(u);
      return true;
    } catch (err) {
      console.warn('[Voice] 음성 안내를 사용할 수 없습니다.', err);
      return false;
    }
  }

  cancel() {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* 무시 */
    }
  }
}

export class VoiceManager {
  constructor({ driver = new WebSpeechDriver(), enabled = true, rate = 1.05, volume = 1 } = {}) {
    this.driver = driver;
    this.enabled = enabled;
    this.rate = rate;
    this.volume = volume;
    this.unlocked = false;
    this._last = { text: '', at: 0 };
  }

  get supported() {
    return !!this.driver?.supported;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.cancel();
  }

  /**
   * 모바일 브라우저는 사용자 터치 안에서 처음 음성을 내야 이후 자동 안내가 됩니다.
   * '시작' 버튼을 누른 순간에 호출합니다.
   */
  unlock() {
    if (this.unlocked || !this.supported) return;
    this.unlocked = true;
    this.driver.speak(' ', { volume: 0, rate: 1 });
  }

  /**
   * @param {string} text
   * @param {{interrupt?: boolean, force?: boolean, dedupeMs?: number}} [opts]
   * @returns {boolean} 음성 출력 요청 여부
   */
  speak(text, { interrupt = false, force = false, dedupeMs = 4000 } = {}) {
    if (!text || (!this.enabled && !force) || !this.supported) return false;
    const now = Date.now();
    if (!force && this._last.text === text && now - this._last.at < dedupeMs) return false;
    this._last = { text, at: now };
    return this.driver.speak(text, { rate: this.rate, volume: this.volume, interrupt });
  }

  cancel() {
    this.driver?.cancel();
  }
}
