/**
 * 토스트 알림 (화면 하단의 짧은 안내)
 */
import { h } from './dom.js';

let host = null;
const recent = new Map(); // 같은 문구 연속 표시 방지

export function initToast(el) {
  host = el;
}

/**
 * @param {string} message
 * @param {{type?: 'info'|'success'|'warn'|'error', duration?: number}} [opts]
 */
export function toast(message, { type = 'info', duration = 3200 } = {}) {
  if (!host || !message) return;
  const now = Date.now();
  if (now - (recent.get(message) || 0) < 4000) return;
  recent.set(message, now);

  while (host.children.length >= 3) host.firstElementChild.remove();
  const el = h('div', { className: `toast toast--${type}`, text: message, attrs: { role: type === 'error' ? 'alert' : 'status' } });
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  const remove = () => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
}
