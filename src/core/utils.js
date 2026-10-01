/**
 * 범용 유틸 (순수 함수)
 */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function roundTo(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, waitMs) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  debounced.flush = (...args) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      fn(...args);
    }
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

/**
 * 버튼 연타 방지 가드.
 * - 실행 중인 동작이 끝나기 전에는 다시 실행하지 않음
 * - 마지막 실행 후 lockMs 이내의 재실행 무시
 * fn 은 동기적으로 호출되므로 사용자 제스처(진동·음성 잠금 해제)가 유지됩니다.
 */
export function createActionGuard(lockMs = 700) {
  let busy = false;
  let lastAt = -Infinity;
  return async function guarded(fn) {
    const now = Date.now();
    if (busy || now - lastAt < lockMs) return undefined;
    busy = true;
    lastAt = now;
    try {
      return await fn();
    } finally {
      busy = false;
      lastAt = Date.now();
    }
  };
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepClone(v) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(v);
    } catch {
      /* 아래 방식으로 */
    }
  }
  return JSON.parse(JSON.stringify(v));
}

/** "coach.targetPaceSec" 같은 경로로 값 읽기 */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** 경로로 값 쓰기 (중간 객체 자동 생성) */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isPlainObject(o[keys[i]])) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
