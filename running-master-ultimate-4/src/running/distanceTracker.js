/**
 * 이동 거리 계산
 *
 * 필터를 통과한 위치만 받아서 직전 위치와의 거리를 누적합니다.
 * 수동 일시정지 후 재개처럼 경로가 끊기는 경우 breakSegment() 로
 * 끊긴 사이의 직선거리가 더해지지 않도록 합니다.
 */
import { haversineM } from '../core/geo.js';

export class DistanceTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalM = 0;
    this.last = null;
  }

  get meters() {
    return this.totalM;
  }

  /** 다음 위치를 새 구간의 시작으로 처리 */
  breakSegment() {
    this.last = null;
  }

  /**
   * @param {{lat:number,lng:number}} point 필터를 통과한 위치
   * @param {boolean} [segmentStart] 새 구간 시작 여부
   * @returns {number} 이번에 더해진 거리(m)
   */
  addPoint(point, segmentStart = false) {
    if (!point) return 0;
    if (segmentStart || !this.last) {
      this.last = { lat: point.lat, lng: point.lng };
      return 0;
    }
    const d = haversineM(this.last, point);
    this.last = { lat: point.lat, lng: point.lng };
    if (!Number.isFinite(d) || d <= 0) return 0;
    this.totalM += d;
    return d;
  }

  serialize() {
    return { totalM: this.totalM };
  }

  restore(data) {
    this.reset();
    this.totalM = Math.max(0, Number(data?.totalM) || 0);
  }
}
