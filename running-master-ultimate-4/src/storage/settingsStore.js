/**
 * 사용자 설정 저장소
 *
 * 모든 설정값은 SCHEMA 로 검증합니다. 저장된 값이 손상되었거나 범위를 벗어나면
 * 기본값으로 대체하므로 잘못된 설정 때문에 앱이 멈추지 않습니다.
 * 저장은 디바운스되어 localStorage 에 과도하게 접근하지 않습니다.
 */
import { COACH_CONFIG, STORAGE_CONFIG } from '../core/config.js';
import { formatPace } from '../core/format.js';
import { debounce, deepClone, getPath, isPlainObject, setPath } from '../core/utils.js';

const STORAGE_KEY = 'settings';

export const DEFAULT_SETTINGS = Object.freeze({
  coach: {
    enabled: true,
    targetPaceSec: 330,      // 5:30/km
    toleranceSec: 8,         // ±8초
    cooldownSec: 25,         // 같은 알림 반복 금지 시간
    alertFast: true,         // 너무 빠를 때도 알림
    repeatWhileOff: true,    // 쿨다운이 지나도 계속 벗어나 있으면 다시 알림
    vibration: true,
    voice: true,
    voiceRecovered: true,    // 목표 범위 복귀 시 음성
  },
  run: {
    autoPause: true,
    autoLapKm: 1,
    lapVoice: true,
    paceWindowSec: 20,
  },
  user: {
    weightKg: 65,
    monthlyGoalKm: 100,
  },
  display: {
    theme: 'system',
    keepAwake: true,
  },
  gps: {
    maxAccuracyM: 30,
    simulation: false,
    simScenario: 'coach-demo',
    simPaceSec: 330,
  },
});

const bool = { type: 'boolean' };

export const SETTINGS_SCHEMA = Object.freeze({
  'coach.enabled': bool,
  'coach.targetPaceSec': {
    type: 'int',
    min: COACH_CONFIG.minTargetPaceSec,
    max: COACH_CONFIG.maxTargetPaceSec,
    label: '목표 페이스',
    format: formatPace,
  },
  'coach.toleranceSec': {
    type: 'int',
    min: COACH_CONFIG.minToleranceSec,
    max: COACH_CONFIG.maxToleranceSec,
    label: '허용 오차',
    unit: '초',
  },
  'coach.cooldownSec': { type: 'enum', values: COACH_CONFIG.cooldownOptionsSec },
  'coach.alertFast': bool,
  'coach.repeatWhileOff': bool,
  'coach.vibration': bool,
  'coach.voice': bool,
  'coach.voiceRecovered': bool,
  'run.autoPause': bool,
  'run.autoLapKm': { type: 'enum', values: [0, 0.5, 1, 2, 5] },
  'run.lapVoice': bool,
  'run.paceWindowSec': { type: 'enum', values: [10, 20, 30] },
  'user.weightKg': { type: 'number', min: 20, max: 300, decimals: 1, label: '체중', unit: 'kg' },
  'user.monthlyGoalKm': { type: 'int', min: 1, max: 2000, label: '월간 목표', unit: 'km' },
  'display.theme': { type: 'enum', values: ['system', 'light', 'dark'] },
  'display.keepAwake': bool,
  'gps.maxAccuracyM': { type: 'enum', values: [15, 20, 30, 50] },
  'gps.simulation': bool,
  'gps.simScenario': { type: 'enum', values: ['coach-demo', 'steady'] },
  'gps.simPaceSec': {
    type: 'int',
    min: COACH_CONFIG.minTargetPaceSec,
    max: COACH_CONFIG.maxTargetPaceSec,
    label: '시뮬레이션 페이스',
    format: formatPace,
  },
});

/** 받침에 따라 '은/는' 선택 */
function topic(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}은(는)`;
  return (code - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`;
}

/**
 * 설정값 하나 검증
 * @returns {{ok: true, value: any} | {ok: false, error: string}}
 */
export function validateSetting(path, input) {
  const rule = SETTINGS_SCHEMA[path];
  if (!rule) return { ok: false, error: `알 수 없는 설정입니다: ${path}` };

  if (rule.type === 'boolean') {
    if (typeof input === 'boolean') return { ok: true, value: input };
    if (input === 'true' || input === 'false') return { ok: true, value: input === 'true' };
    return { ok: false, error: '켜기/끄기 값이 올바르지 않습니다.' };
  }

  if (rule.type === 'enum') {
    const match = rule.values.find((v) => String(v) === String(input));
    if (match === undefined) return { ok: false, error: '선택할 수 없는 값입니다.' };
    return { ok: true, value: match };
  }

  // number / int
  const text = typeof input === 'string' ? input.trim().replace(',', '.') : input;
  const n = typeof text === 'number' ? text : text === '' ? NaN : Number(text);
  if (!Number.isFinite(n)) return { ok: false, error: `${topic(rule.label || '값')} 숫자로 입력하세요.` };
  const fmt = rule.format || ((v) => `${v}${rule.unit || ''}`);
  if (n < rule.min || n > rule.max) {
    return {
      ok: false,
      error: `${topic(rule.label || '값')} ${fmt(rule.min)} ~ ${fmt(rule.max)} 사이로 입력하세요.`,
    };
  }
  const value = rule.type === 'int' ? Math.round(n) : Number(n.toFixed(rule.decimals ?? 2));
  return { ok: true, value };
}

/** 저장된(또는 가져온) 설정을 기본값과 합치고 잘못된 값은 기본값으로 */
export function sanitizeSettings(raw) {
  const out = deepClone(DEFAULT_SETTINGS);
  if (!isPlainObject(raw)) return out;
  for (const path of Object.keys(SETTINGS_SCHEMA)) {
    const v = getPath(raw, path);
    if (v === undefined) continue;
    const r = validateSetting(path, v);
    if (r.ok) setPath(out, path, r.value);
  }
  return out;
}

export class SettingsStore {
  constructor(storage) {
    this.storage = storage;
    this.settings = sanitizeSettings(storage.getJSON(STORAGE_KEY, null));
    this.listeners = new Set();
    this._save = debounce(() => this._persist(), STORAGE_CONFIG.settingsSaveDebounceMs);
  }

  get() {
    return this.settings;
  }

  getValue(path) {
    return getPath(this.settings, path);
  }

  /**
   * 설정 변경
   * @returns {{ok: boolean, value?: any, error?: string}}
   */
  set(path, input) {
    const r = validateSetting(path, input);
    if (!r.ok) return r;
    if (getPath(this.settings, path) === r.value) return r;
    const next = deepClone(this.settings);
    setPath(next, path, r.value);
    this.settings = next;
    this._save();
    this._notify({ path, value: r.value });
    return r;
  }

  reset() {
    this.settings = deepClone(DEFAULT_SETTINGS);
    this._persist();
    this._notify({ path: '*', value: null });
  }

  /** 백업 파일에서 가져오기 */
  replaceAll(raw) {
    this.settings = sanitizeSettings(raw);
    this._persist();
    this._notify({ path: '*', value: null });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 즉시 저장 (페이지를 떠날 때) */
  flush() {
    this._save.flush();
  }

  _persist() {
    const r = this.storage.setJSON(STORAGE_KEY, this.settings);
    if (!r.ok) console.warn('[Settings] 설정을 저장하지 못했습니다:', r.error);
    return r;
  }

  _notify(change) {
    for (const fn of [...this.listeners]) {
      try {
        fn(this.settings, change);
      } catch (err) {
        console.error('[Settings] 리스너 오류', err);
      }
    }
  }
}
