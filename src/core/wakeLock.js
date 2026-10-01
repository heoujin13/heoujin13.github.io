/**
 * 화면 꺼짐 방지 (Screen Wake Lock API)
 *
 * 모바일 브라우저는 화면이 꺼지면 GPS 수신과 타이머가 멈출 수 있으므로
 * 러닝 중에는 화면을 켜 둡니다. 탭을 다시 보면 자동으로 재요청합니다.
 * 지원하지 않는 브라우저에서는 아무 일도 하지 않습니다.
 */
export class WakeLockManager {
  constructor() {
    this.supported =
      typeof navigator !== 'undefined' &&
      !!navigator.wakeLock &&
      typeof navigator.wakeLock.request === 'function';
    this.sentinel = null;
    this.wanted = false;
    this._onVisibility = () => {
      if (this.wanted && document.visibilityState === 'visible' && !this.sentinel) {
        this._request();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  get active() {
    return !!this.sentinel;
  }

  async enable() {
    this.wanted = true;
    await this._request();
  }

  async disable() {
    this.wanted = false;
    const s = this.sentinel;
    this.sentinel = null;
    if (s) {
      try {
        await s.release();
      } catch {
        /* 이미 해제됨 */
      }
    }
  }

  async _request() {
    if (!this.supported || this.sentinel) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
      if (!this.wanted) await this.disable();
    } catch (err) {
      console.warn('[WakeLock] 화면 꺼짐 방지를 사용할 수 없습니다:', err?.message || err);
    }
  }
}
