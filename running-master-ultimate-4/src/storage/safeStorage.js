/**
 * 안전한 localStorage 래퍼
 *
 *  - localStorage 를 쓸 수 없는 환경(사생활 보호 모드, 차단 설정 등)에서는
 *    메모리 저장소로 자동 전환 → 앱은 계속 동작 (새로고침 시 데이터는 사라짐)
 *  - JSON 파싱 오류(손상된 데이터)는 기본값으로 대체
 *  - 용량 초과(QuotaExceededError)를 구분해서 알려 줌
 */
export class SafeStorage {
  constructor(prefix = '') {
    this.prefix = prefix;
    this.memory = new Map();
    this.available = SafeStorage.test();
    this.lastError = null;
  }

  static test() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const k = '__rmu_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  _key(key) {
    return this.prefix + key;
  }

  getRaw(key) {
    const k = this._key(key);
    if (!this.available) return this.memory.has(k) ? this.memory.get(k) : null;
    try {
      return localStorage.getItem(k);
    } catch (err) {
      this.lastError = err;
      return this.memory.has(k) ? this.memory.get(k) : null;
    }
  }

  /** @returns {{ok: boolean, error?: 'quota'|'unavailable'|'unknown'}} */
  setRaw(key, value) {
    const k = this._key(key);
    if (!this.available) {
      this.memory.set(k, value);
      return { ok: true, memoryOnly: true };
    }
    try {
      localStorage.setItem(k, value);
      return { ok: true };
    } catch (err) {
      this.lastError = err;
      const quota =
        err &&
        (err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          err.code === 22 ||
          err.code === 1014);
      return { ok: false, error: quota ? 'quota' : 'unknown' };
    }
  }

  getJSON(key, fallback = null) {
    const raw = this.getRaw(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Storage] '${key}' 데이터가 손상되어 기본값을 사용합니다.`, err);
      return fallback;
    }
  }

  setJSON(key, value) {
    let text;
    try {
      text = JSON.stringify(value);
    } catch (err) {
      this.lastError = err;
      return { ok: false, error: 'unknown' };
    }
    return this.setRaw(key, text);
  }

  remove(key) {
    const k = this._key(key);
    this.memory.delete(k);
    if (!this.available) return;
    try {
      localStorage.removeItem(k);
    } catch (err) {
      this.lastError = err;
    }
  }

  /** prefix 아래의 키 목록 (prefix 제외) */
  keys() {
    const out = [];
    if (!this.available) {
      for (const k of this.memory.keys()) if (k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
      return out;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
      }
    } catch (err) {
      this.lastError = err;
    }
    return out;
  }

  /** 대략적인 사용량 (바이트, UTF-16 기준) */
  usageBytes() {
    let total = 0;
    for (const key of this.keys()) {
      const v = this.getRaw(key);
      total += (this._key(key).length + (v ? v.length : 0)) * 2;
    }
    return total;
  }
}
