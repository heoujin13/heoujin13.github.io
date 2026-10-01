/**
 * 러닝 기록 저장소 (localStorage)
 *
 * 저장 구조
 *   rmu4:runs         → 기록 요약 배열 (최신순). 목록·통계는 이것만 읽음
 *   rmu4:route:<id>   → 해당 기록의 GPS 경로. 상세 화면에서만 읽음
 * 경로를 분리해 두면 기록이 많아져도 목록/통계 화면이 빠릅니다.
 */
import { simplifyPath } from '../core/geo.js';

const INDEX_KEY = 'runs';
const routeKey = (id) => `route:${id}`;

function isValidRecord(r) {
  return (
    r &&
    typeof r.id === 'string' &&
    Number.isFinite(r.startedAt) &&
    Number.isFinite(r.distanceM) &&
    r.distanceM >= 0 &&
    Number.isFinite(r.durationMs) &&
    r.durationMs >= 0
  );
}

function normalizeRecord(r) {
  return {
    ...r,
    laps: Array.isArray(r.laps) ? r.laps : [],
    calories: Number.isFinite(r.calories) ? r.calories : 0,
    avgPaceSec: Number.isFinite(r.avgPaceSec) ? r.avgPaceSec : null,
    avgSpeedKmh: Number.isFinite(r.avgSpeedKmh) ? r.avgSpeedKmh : null,
  };
}

/** [[ [lat,lng], ... ], ...] → [[lat,lng,lat,lng,...], ...] (괄호를 줄여 용량 절약) */
function encodeRoute(segments) {
  return { v: 1, s: segments.map((seg) => seg.flat()) };
}

function decodeRoute(data) {
  if (!data || !Array.isArray(data.s)) return [];
  return data.s
    .filter((flat) => Array.isArray(flat))
    .map((flat) => {
      const seg = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        if (Number.isFinite(flat[i]) && Number.isFinite(flat[i + 1])) seg.push([flat[i], flat[i + 1]]);
      }
      return seg;
    })
    .filter((seg) => seg.length > 0);
}

export class RunRepository {
  constructor(storage) {
    this.storage = storage;
    this._runs = null;
    this.listeners = new Set();
  }

  _ensure() {
    if (this._runs) return;
    const raw = this.storage.getJSON(INDEX_KEY, []);
    this._runs = (Array.isArray(raw) ? raw : []).filter(isValidRecord).map(normalizeRecord);
    this._runs.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** 기록 요약 목록 (최신순, 읽기 전용으로 사용) */
  list() {
    this._ensure();
    return this._runs;
  }

  get(id) {
    this._ensure();
    return this._runs.find((r) => r.id === id) || null;
  }

  getRoute(id) {
    return decodeRoute(this.storage.getJSON(routeKey(id), null));
  }

  /**
   * 기록 저장
   * @param {object} record 요약
   * @param {Array} routeSegments 경로
   * @returns {{ok: boolean, routeSaved?: boolean, error?: string}}
   */
  save(record, routeSegments = []) {
    this._ensure();
    if (!isValidRecord(record)) return { ok: false, error: 'invalid' };
    const rec = normalizeRecord({ ...record, routePoints: 0 });

    // 1) 경로 저장 (용량 부족 시 더 단순화해서 재시도)
    let routeSaved = false;
    const segs = Array.isArray(routeSegments) ? routeSegments : [];
    if (segs.length) {
      let attemptSegs = segs;
      for (let attempt = 0; attempt < 3 && !routeSaved; attempt++) {
        const r = this.storage.setJSON(routeKey(rec.id), encodeRoute(attemptSegs));
        if (r.ok) {
          routeSaved = true;
          rec.routePoints = attemptSegs.reduce((s, seg) => s + seg.length, 0);
        } else if (r.error === 'quota') {
          const tol = [8, 20, 50][attempt];
          attemptSegs = segs.map((seg) => simplifyPath(seg, tol));
        } else {
          break;
        }
      }
    }

    // 2) 요약 저장
    const next = [rec, ...this._runs.filter((r) => r.id !== rec.id)].sort((a, b) => b.startedAt - a.startedAt);
    const r2 = this.storage.setJSON(INDEX_KEY, next);
    if (!r2.ok) {
      if (routeSaved) this.storage.remove(routeKey(rec.id));
      return { ok: false, error: r2.error || 'unknown' };
    }
    this._runs = next;
    this._notify();
    return { ok: true, routeSaved: segs.length ? routeSaved : true, memoryOnly: !!r2.memoryOnly };
  }

  delete(id) {
    this._ensure();
    const next = this._runs.filter((r) => r.id !== id);
    if (next.length === this._runs.length) return false;
    const r = this.storage.setJSON(INDEX_KEY, next);
    if (!r.ok) return false;
    this.storage.remove(routeKey(id));
    this._runs = next;
    this._notify();
    return true;
  }

  clearAll() {
    this._ensure();
    for (const key of this.storage.keys()) {
      if (key.startsWith('route:')) this.storage.remove(key);
    }
    this.storage.remove(INDEX_KEY);
    this._runs = [];
    this._notify();
  }

  /** 백업용: 경로 포함 전체 기록 */
  exportAll() {
    return this.list().map((r) => ({ ...r, route: this.getRoute(r.id) }));
  }

  /**
   * 백업 파일에서 가져오기 (같은 id 는 건너뜀)
   * @returns {{added: number, skipped: number, failed: number}}
   */
  importRecords(items) {
    this._ensure();
    let added = 0;
    let skipped = 0;
    let failed = 0;
    const existing = new Set(this._runs.map((r) => r.id));
    for (const item of Array.isArray(items) ? items : []) {
      if (!isValidRecord(item) || existing.has(item.id)) {
        skipped += 1;
        continue;
      }
      const { route, ...record } = item;
      const segs = Array.isArray(route) ? route : [];
      const res = this.save(record, segs);
      if (res.ok) {
        added += 1;
        existing.add(item.id);
      } else {
        failed += 1;
      }
    }
    return { added, skipped, failed };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    for (const fn of [...this.listeners]) {
      try {
        fn(this._runs);
      } catch (err) {
        console.error('[RunRepository] 리스너 오류', err);
      }
    }
  }
}
