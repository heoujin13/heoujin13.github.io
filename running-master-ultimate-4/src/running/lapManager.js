/**
 * 랩(Lap) 기록
 *
 *  - 자동 랩: 설정한 거리(기본 1km)의 배수 지점을 지날 때마다 기록
 *    (경계를 지난 정확한 시각은 직전·현재 위치 사이에서 보간)
 *  - 수동 랩: 사용자가 '랩' 버튼을 누를 때
 *  - 종료 시 마지막 남은 구간을 '마지막 랩'으로 기록
 */
import { clamp } from '../core/utils.js';

export class LapManager {
  constructor({ autoLapM = 1000 } = {}) {
    this.setAutoLapDistance(autoLapM);
    this.reset();
  }

  setAutoLapDistance(meters) {
    this.autoLapM = Number.isFinite(meters) && meters >= 100 ? meters : 0;
  }

  reset() {
    this.laps = [];
    this.lapStart = { t: 0, d: 0 };
    this.prev = { t: 0, d: 0 };
  }

  get count() {
    return this.laps.length;
  }

  /**
   * 거리/시간이 갱신될 때마다 호출
   * @returns {Array<object>} 이번에 새로 생긴 자동 랩들
   */
  update(activeMs, distanceM) {
    const created = [];
    if (this.autoLapM > 0 && distanceM > this.prev.d) {
      let boundary = this._nextBoundary();
      let guard = 0;
      while (distanceM >= boundary && guard++ < 1000) {
        const span = distanceM - this.prev.d;
        const r = span > 0 ? clamp((boundary - this.prev.d) / span, 0, 1) : 1;
        const t = Math.max(this.lapStart.t, this.prev.t + (activeMs - this.prev.t) * r);
        created.push(this._closeLap(t, boundary, 'auto'));
        boundary = this._nextBoundary();
      }
    }
    this.prev = { t: activeMs, d: distanceM };
    return created;
  }

  /** 수동 랩. 너무 짧은 랩(3초 미만)은 무시 */
  manualLap(activeMs, distanceM) {
    if (activeMs - this.lapStart.t < 3000) return null;
    const lap = this._closeLap(activeMs, distanceM, 'manual');
    this.prev = { t: activeMs, d: distanceM };
    return lap;
  }

  /** 종료 시 남은 구간 기록 (10m 이상일 때) */
  finalize(activeMs, distanceM) {
    if (distanceM - this.lapStart.d < 10) return null;
    return this._closeLap(activeMs, distanceM, 'final');
  }

  /** 진행 중인 랩 정보 */
  current(activeMs, distanceM) {
    const d = Math.max(0, distanceM - this.lapStart.d);
    const t = Math.max(0, activeMs - this.lapStart.t);
    return {
      index: this.laps.length + 1,
      distanceM: d,
      durationMs: t,
      paceSec: d >= 50 ? t / 1000 / (d / 1000) : null,
    };
  }

  _nextBoundary() {
    return (Math.floor(this.lapStart.d / this.autoLapM + 1e-9) + 1) * this.autoLapM;
  }

  _closeLap(endT, endD, type) {
    const distanceM = Math.max(0, endD - this.lapStart.d);
    const durationMs = Math.max(0, endT - this.lapStart.t);
    const lap = {
      index: this.laps.length + 1,
      type,
      distanceM,
      durationMs,
      paceSec: distanceM > 0 ? durationMs / 1000 / (distanceM / 1000) : null,
      speedKmh: durationMs > 0 ? distanceM / 1000 / (durationMs / 3600000) : null,
      startDistanceM: this.lapStart.d,
      endDistanceM: endD,
      endElapsedMs: endT,
    };
    this.laps.push(lap);
    this.lapStart = { t: endT, d: endD };
    return lap;
  }

  serialize() {
    return { laps: this.laps.map((l) => ({ ...l })), lapStart: { ...this.lapStart }, prev: { ...this.prev } };
  }

  restore(data) {
    this.reset();
    if (!data) return;
    this.laps = Array.isArray(data.laps) ? data.laps.map((l) => ({ ...l })) : [];
    if (data.lapStart) this.lapStart = { t: +data.lapStart.t || 0, d: +data.lapStart.d || 0 };
    if (data.prev) this.prev = { t: +data.prev.t || 0, d: +data.prev.d || 0 };
  }
}
