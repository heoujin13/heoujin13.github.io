/**
 * 진동 관리자
 *
 * Web Vibration API(navigator.vibrate)를 'Driver' 뒤에 감춰 두었습니다.
 * 모바일 앱으로 전환할 때는 같은 메서드(supported, vibrate, cancel)를 가진
 * NativeHapticsDriver 를 만들어 new VibrationManager({ driver }) 로 바꾸기만 하면 됩니다.
 *
 * 지원하지 않는 브라우저(iOS Safari, 대부분의 PC)에서는 조용히 false 를 반환하고
 * 앱은 계속 동작합니다.
 */

/** 진동 패턴 (밀리초: 진동, 쉼, 진동, ...) */
export const VIBRATION_PATTERNS = Object.freeze({
  slow: [260, 120, 260],                   // 느림: 길게 두 번
  slowStrong: [380, 120, 380, 120, 380],   // 많이 느림: 길게 세 번
  fast: [90],                              // 빠름: 짧게 한 번
  fastStrong: [90, 90, 90],                // 많이 빠름: 짧게 두 번
  lap: [60, 80, 60],
  start: [120],
  pause: [60],
  finish: [200, 100, 200, 100, 400],
  test: [260, 120, 260],
});

export class WebVibrationDriver {
  get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  vibrate(pattern) {
    if (!this.supported) return false;
    try {
      return navigator.vibrate(pattern) !== false;
    } catch {
      return false;
    }
  }

  cancel() {
    if (!this.supported) return;
    try {
      navigator.vibrate(0);
    } catch {
      /* 무시 */
    }
  }
}

export class VibrationManager {
  constructor({ driver = new WebVibrationDriver(), enabled = true } = {}) {
    this.driver = driver;
    this.enabled = enabled;
    this.lastResult = null;
  }

  get supported() {
    return !!this.driver?.supported;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.cancel();
  }

  /**
   * @param {keyof VIBRATION_PATTERNS | number | number[]} nameOrPattern
   * @param {{force?: boolean}} [opts] force=true 면 설정과 무관하게 실행 (진동 테스트)
   * @returns {boolean} 진동 요청이 전달되었는지
   */
  play(nameOrPattern, { force = false } = {}) {
    if ((!this.enabled && !force) || !this.supported) {
      this.lastResult = false;
      return false;
    }
    const pattern =
      typeof nameOrPattern === 'string' ? VIBRATION_PATTERNS[nameOrPattern] : nameOrPattern;
    if (!pattern) return false;
    this.lastResult = this.driver.vibrate(pattern);
    return this.lastResult;
  }

  cancel() {
    try {
      this.driver?.cancel();
    } catch {
      /* 무시 */
    }
  }
}
