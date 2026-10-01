/**
 * 대화상자 (확인 / 선택 / 페이스 입력)
 * 모두 Promise 를 반환합니다. 한 번에 하나만 열립니다.
 */
import { COACH_CONFIG } from '../core/config.js';
import { formatPace, parsePace } from '../core/format.js';
import { h } from './dom.js';

let host = null;
let current = null; // {close: (value) => void}

export function initModal(el) {
  host = el;
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]
 * @param {Node} [opts.body]
 * @param {Array<{id: string, label: string, variant?: string}>} opts.actions
 * @param {boolean} [opts.dismissible]
 * @param {(id: string) => boolean} [opts.beforeClose] false 를 반환하면 닫지 않음 (입력 검증)
 * @param {() => any} [opts.getValue]
 */
export function openDialog({ title, message, body, actions, dismissible = true, beforeClose, getValue }) {
  if (!host) return Promise.resolve(null);
  if (current) current.close(null);

  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const titleId = `dlg-${Date.now()}`;
    const buttons = actions.map((a) =>
      h('button', {
        className: `btn btn--${a.variant || 'ghost'}`,
        text: a.label,
        attrs: { type: 'button' },
        dataset: { action: a.id },
      }),
    );
    const dialog = h('div', { className: 'dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } }, [
      h('h2', { className: 'dialog__title', text: title, attrs: { id: titleId } }),
      message ? h('p', { className: 'dialog__message', text: message }) : null,
      body || null,
      h('div', { className: 'dialog__actions' }, buttons),
    ]);
    const backdrop = h('div', { className: 'dialog-backdrop' }, [dialog]);

    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 180);
      if (current && current.close === close) current = null;
      try {
        previousFocus?.focus?.({ preventScroll: true });
      } catch {
        /* 무시 */
      }
      resolve(value);
    };

    const choose = (id) => {
      if (beforeClose && beforeClose(id) === false) return;
      close(getValue ? getValue(id) : id);
    };

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Tab') {
        // 간단한 포커스 가두기
        const focusables = dialog.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    buttons.forEach((b) => b.addEventListener('click', () => choose(b.dataset.action)));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && dismissible) close(null);
    });
    document.addEventListener('keydown', onKey, true);

    host.appendChild(backdrop);
    current = { close };
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      const input = dialog.querySelector('input');
      (input || buttons.find((b) => b.classList.contains('btn--primary')) || buttons[0])?.focus();
      if (input) input.select?.();
    });
  });
}

export async function confirmDialog({ title, message, confirmText = '확인', cancelText = '취소', danger = false }) {
  const id = await openDialog({
    title,
    message,
    actions: [
      { id: 'cancel', label: cancelText, variant: 'ghost' },
      { id: 'ok', label: confirmText, variant: danger ? 'danger' : 'primary' },
    ],
  });
  return id === 'ok';
}

/** @returns {Promise<string|null>} 선택한 id */
export function choiceDialog({ title, message, choices, dismissible = true }) {
  return openDialog({ title, message, actions: choices, dismissible });
}

/**
 * 페이스 입력 대화상자
 * @returns {Promise<number|null>} 초/km
 */
export function paceDialog({ title = '목표 페이스', initialSec = 330, hint } = {}) {
  const input = h('input', {
    className: 'pace-input num',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      'aria-label': '페이스 (분:초)',
      placeholder: '5:30',
      value: formatPace(initialSec),
      maxlength: '8',
    },
  });
  const error = h('p', { className: 'field-error', attrs: { role: 'alert' } });
  const body = h('div', { className: 'pace-field' }, [
    h('div', { className: 'pace-field__row' }, [input, h('span', { className: 'pace-field__unit', text: '/km' })]),
    h('p', {
      className: 'field-hint',
      text: hint || `분:초 형식으로 입력하세요. (${formatPace(COACH_CONFIG.minTargetPaceSec)} ~ ${formatPace(COACH_CONFIG.maxTargetPaceSec)})`,
    }),
    error,
  ]);
  let parsed = null;
  input.addEventListener('input', () => {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      body.closest('.dialog')?.querySelector('[data-action="ok"]')?.click();
    }
  });

  return openDialog({
    title,
    body,
    actions: [
      { id: 'cancel', label: '취소', variant: 'ghost' },
      { id: 'ok', label: '저장', variant: 'primary' },
    ],
    beforeClose: (id) => {
      if (id !== 'ok') return true;
      const r = parsePace(input.value, { min: COACH_CONFIG.minTargetPaceSec, max: COACH_CONFIG.maxTargetPaceSec });
      if (!r.ok) {
        error.textContent = r.error;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return false;
      }
      parsed = r.sec;
      return true;
    },
    getValue: (id) => (id === 'ok' ? parsed : null),
  });
}

/** 숫자 입력 대화상자 */
export function numberDialog({ title, initial, unit = '', min, max, hint }) {
  const input = h('input', {
    className: 'pace-input num',
    attrs: { type: 'number', inputmode: 'decimal', value: String(initial), min: String(min), max: String(max), step: 'any', 'aria-label': title },
  });
  const error = h('p', { className: 'field-error', attrs: { role: 'alert' } });
  const body = h('div', { className: 'pace-field' }, [
    h('div', { className: 'pace-field__row' }, [input, h('span', { className: 'pace-field__unit', text: unit })]),
    hint ? h('p', { className: 'field-hint', text: hint }) : null,
    error,
  ]);
  let value = null;
  return openDialog({
    title,
    body,
    actions: [
      { id: 'cancel', label: '취소', variant: 'ghost' },
      { id: 'ok', label: '저장', variant: 'primary' },
    ],
    beforeClose: (id) => {
      if (id !== 'ok') return true;
      const n = Number(String(input.value).replace(',', '.'));
      if (!Number.isFinite(n) || n < min || n > max) {
        error.textContent = `${min} ~ ${max} 사이의 숫자를 입력하세요.`;
        input.focus();
        return false;
      }
      value = n;
      return true;
    },
    getValue: (id) => (id === 'ok' ? value : null),
  });
}
