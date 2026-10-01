/**
 * 하단 탭 전환
 */
import { $$ } from './dom.js';

export class Router {
  /**
   * @param {{root: HTMLElement, onChange?: (name: string, prev: string) => void}} opts
   */
  constructor({ root, onChange }) {
    this.root = root;
    this.onChange = onChange;
    this.tabs = $$('[data-target]', root.querySelector('.tabbar'));
    this.screens = $$('.screen[data-screen]', root);
    this.current = 'run';
    this.scroll = {};
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => this.go(tab.dataset.target));
    });
    // 좌우 방향키로 탭 이동 (키보드 접근성)
    root.querySelector('.tabbar')?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = this.tabs.findIndex((t) => t.dataset.target === this.current);
      const next = this.tabs[(i + (e.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
      this.go(next.dataset.target);
      next.focus();
    });
  }

  go(name) {
    if (!name || name === this.current) return;
    const prev = this.current;
    this.scroll[prev] = window.scrollY;
    this.current = name;
    this.screens.forEach((s) => {
      const active = s.dataset.screen === name;
      s.hidden = !active;
      s.classList.toggle('is-active', active);
    });
    this.tabs.forEach((t) => {
      const active = t.dataset.target === name;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    this.root.dataset.screen = name;
    window.scrollTo(0, this.scroll[name] || 0);
    this.onChange?.(name, prev);
  }
}
