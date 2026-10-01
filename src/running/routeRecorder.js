/**
 * GPS 경로 기록
 *
 * 경로는 '세그먼트(끊기지 않은 선)'의 배열로 관리합니다.
 * 수동 일시정지 후 재개하거나 GPS 기준점이 재설정되면 새 세그먼트가 시작되어
 * 지도에 끊긴 사이의 엉뚱한 직선이 그려지지 않습니다.
 *
 * 저장 시에는 Douglas–Peucker 로 점 개수를 줄여 localStorage 용량을 아낍니다.
 */
import { STORAGE_CONFIG } from '../core/config.js';
import { simplifyPath } from '../core/geo.js';

export class RouteRecorder {
  constructor() {
    this.reset();
  }

  reset() {
    this.segments = [[]];
    this.pointCount = 0;
  }

  get current() {
    return this.segments[this.segments.length - 1];
  }

  /** 다음 점부터 새 세그먼트 */
  newSegment() {
    if (this.current.length > 0) this.segments.push([]);
  }

  add(point) {
    this.current.push([point.lat, point.lng]);
    this.pointCount += 1;
  }

  /** 비어 있지 않은 세그먼트들 */
  getSegments() {
    return this.segments.filter((s) => s.length > 0);
  }

  /**
   * 저장용 압축 경로
   * @returns {Array<Array<[number, number]>>}
   */
  toCompact({
    toleranceM = STORAGE_CONFIG.routeSimplifyToleranceM,
    maxPoints = STORAGE_CONFIG.maxRoutePoints,
    decimals = STORAGE_CONFIG.coordDecimals,
  } = {}) {
    const segs = this.getSegments();
    const f = 10 ** decimals;
    const round = (v) => Math.round(v * f) / f;
    let tol = toleranceM;
    let result = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      result = segs.map((s) => simplifyPath(s, tol));
      const total = result.reduce((sum, s) => sum + s.length, 0);
      if (total <= maxPoints) break;
      tol *= 1.8;
    }
    return result
      .map((s) => s.map(([lat, lng]) => [round(lat), round(lng)]))
      .filter((s) => s.length > 0);
  }

  serialize() {
    return { segments: this.toCompact({ toleranceM: 1.5, maxPoints: 4000 }) };
  }

  restore(data) {
    this.reset();
    const segs = Array.isArray(data?.segments) ? data.segments : [];
    this.segments = segs
      .filter((s) => Array.isArray(s))
      .map((s) => s.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])));
    if (!this.segments.length) this.segments = [[]];
    this.pointCount = this.segments.reduce((sum, s) => sum + s.length, 0);
    this.segments.push([]); // 복구 후 재개하면 새 세그먼트
  }
}
