/**
 * 테마 (시스템 / 라이트 / 다크)
 */
export class ThemeController {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this.mode = 'system';
    this.mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    this._onSystem = () => {
      if (this.mode === 'system') this._apply();
    };
    this.mq?.addEventListener?.('change', this._onSystem);
  }

  get isDark() {
    if (this.mode === 'dark') return true;
    if (this.mode === 'light') return false;
    return !!this.mq?.matches;
  }

  setMode(mode) {
    this.mode = ['light', 'dark'].includes(mode) ? mode : 'system';
    this._apply();
  }

  _apply() {
    const root = document.documentElement;
    if (this.mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', this.mode);
    // 브라우저 상단 바 색상도 테마에 맞춤
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
    this.onChange?.(this.isDark);
  }
}
