/**
 * 설정 화면
 *
 * HTML 의 data-setting="경로" 속성으로 입력 요소와 설정값을 자동 연결합니다.
 *   - checkbox → boolean
 *   - select / number → 값 (SettingsStore 의 SCHEMA 로 검증)
 *   - data-setting-pace → "5:30" 형식 페이스 입력
 * 잘못된 값은 저장하지 않고 입력란 아래에 이유를 표시합니다.
 */
import { COACH_CONFIG } from '../core/config.js';
import { formatPace, parsePace } from '../core/format.js';
import { getPath } from '../core/utils.js';
import { $, $$, h, setHidden, setText } from './dom.js';

export class SettingsScreen {
  constructor({ settings, actions, getDiagnostics }) {
    this.settings = settings;
    this.actions = actions;
    this.getDiagnostics = getDiagnostics;
    this.root = $('#screen-settings');
    this.inputs = $$('[data-setting]', this.root);
    this.paceInputs = $$('[data-setting-pace]', this.root);

    for (const input of this.inputs) {
      input.addEventListener('change', () => this._commit(input));
    }
    for (const input of this.paceInputs) {
      input.addEventListener('change', () => this._commitPace(input));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    }
    $$('[data-action]', this.root).forEach((btn) => {
      btn.addEventListener('click', () => {
        const fn = this.actions[btn.dataset.action];
        if (fn) fn(btn);
      });
    });
    const file = $('#importFile');
    file?.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) this.actions.importFile?.(f);
    });

    settings.subscribe(() => this.sync());
    this.sync();
  }

  setVisible(visible) {
    if (visible) this.renderDiagnostics();
  }

  _errorEl(path) {
    return this.root.querySelector(`[data-error-for="${path}"]`);
  }

  _showError(path, message) {
    const el = this._errorEl(path);
    if (el) {
      el.textContent = message || '';
      el.hidden = !message;
    }
    const input = this.root.querySelector(`[data-setting="${path}"], [data-setting-pace="${path}"]`);
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  _commit(input) {
    const path = input.dataset.setting;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    const r = this.settings.set(path, value);
    if (!r.ok) {
      this._showError(path, r.error);
      this._syncInput(input, true); // 이전 값으로 되돌림
      return;
    }
    this._showError(path, '');
  }

  _commitPace(input) {
    const path = input.dataset.settingPace;
    const r = parsePace(input.value, { min: COACH_CONFIG.minTargetPaceSec, max: COACH_CONFIG.maxTargetPaceSec });
    if (!r.ok) {
      this._showError(path, r.error);
      input.value = formatPace(this.settings.getValue(path));
      return;
    }
    const res = this.settings.set(path, r.sec);
    this._showError(path, res.ok ? '' : res.error);
    input.value = formatPace(this.settings.getValue(path));
  }

  _syncInput(input, force = false) {
    const value = getPath(this.settings.get(), input.dataset.setting);
    if (input.type === 'checkbox') input.checked = !!value;
    else if (force || document.activeElement !== input || input.tagName === 'SELECT') input.value = String(value);
  }

  sync() {
    const s = this.settings.get();
    for (const input of this.inputs) this._syncInput(input);
    for (const input of this.paceInputs) {
      if (document.activeElement !== input) input.value = formatPace(getPath(s, input.dataset.settingPace));
    }
    // 다른 설정이 꺼져 있으면 의존 항목 숨김
    $$('[data-depends]', this.root).forEach((row) => {
      setHidden(row, !getPath(s, row.dataset.depends));
    });
    setText($('#tolExample'), toleranceExample(s.coach.targetPaceSec, s.coach.toleranceSec));
  }

  renderDiagnostics() {
    const list = $('#diagList');
    if (!list) return;
    const d = this.getDiagnostics();
    list.textContent = '';
    for (const item of d.items) {
      list.append(
        h('li', { className: 'diag', dataset: { ok: String(item.ok) } }, [
          h('span', { className: 'diag__mark', attrs: { 'aria-hidden': 'true' }, text: item.ok ? '✓' : '!' }),
          h('span', { className: 'diag__label', text: item.label }),
          h('span', { className: 'diag__value', text: item.value }),
        ]),
      );
    }
    setText($('#storageUsage'), d.storage);
    Promise.resolve(d.tileCount).then((n) => {
      const el = $('#tileCacheInfo');
      if (!el) return;
      if (n === null || n === undefined) {
        setText(el, '이 브라우저에서는 지도 이미지를 따로 저장하지 않습니다.');
      } else {
        const kb = n * 15; // 타일 1장 평균 약 15KB
        const size = kb < 1024 ? `${kb}KB` : `${(kb / 1024).toFixed(1)}MB`;
        setText(el, `지도 이미지 ${n.toLocaleString('ko-KR')}장 저장됨 (약 ${size}). 저장된 곳은 다시 받지 않습니다.`);
      }
    });
  }
}

function toleranceExample(target, tol) {
  return `목표 ${formatPace(target)}/km 이면 ${formatPace(target - tol)} ~ ${formatPace(target + tol)}/km 를 '목표 유지'로 봅니다.`;
}
