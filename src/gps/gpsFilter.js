/**
 * 비정상 GPS 데이터 필터
 *
 * 들어온 위치 하나를 검사하여 "거리 계산에 써도 되는가?"를 판정합니다.
 *   1) invalid      : 좌표/시각이 이상함
 *   2) low_accuracy : 정확도가 허용치보다 나쁨
 *   3) stale        : 이전보다 오래된(중복) 위치
 *   4) spike        : 사람이 낼 수 없는 속도로 순간 이동 (GPS 튐)
 *   5) jitter       : 정확도 범위 안의 잔떨림 (정지 중 거리 누적 방지)
 * 통과한 위치는 칼만 필터로 다듬어 돌려줍니다.
 *
 * 거리 자체는 계산하지 않습니다 (running/distanceTracker.js 담당).
 */
import { FILTER_CONFIG } from '../core/config.js';
import { haversineM, isValidCoord } from '../core/geo.js';
import { clamp } from '../core/utils.js';
import { KalmanLatLng } from './kalmanFilter.js';

export class GpsFilter {
  constructor(options = {}) {
    this.opts = { ...FILTER_CONFIG, ...options };
    this.kalman = new KalmanLatLng(this.opts.kalmanProcessNoiseMps);
    this.stats = { accepted: 0, invalid: 0, low_accuracy: 0, stale: 0, spike: 0, jitter: 0 };
    this.reset();
  }

  setMaxAccuracy(m) {
    if (Number.isFinite(m) && m > 0) this.opts.maxAccuracyM = m;
  }

  /** 기준점 초기화. 다음 위치는 새 구간의 시작점이 됩니다 (거리 0) */
  reset() {
    this.anchor = null;     // 마지막으로 채택한(다듬은) 위치
    this.lastRaw = null;    // 마지막으로 정상 판정한 원본 위치 (튐 판정 기준)
    this.spikeStreak = 0;
    this.kalman.reset();
  }

  /**
   * @param {{lat:number,lng:number,accuracy:number|null,t:number,speed?:number|null}} raw
   * @returns {{accepted: boolean, reason: string|null, point: object|null, segmentStart: boolean}}
   */
  process(raw) {
    const o = this.opts;
    if (!raw || !isValidCoord(raw.lat, raw.lng) || !Number.isFinite(raw.t)) {
      return this._reject('invalid', null);
    }
    const acc = Number.isFinite(raw.accuracy) ? raw.accuracy : 999;
    if (acc > o.maxAccuracyM) return this._reject('low_accuracy', null);
    if (this.lastRaw && raw.t <= this.lastRaw.t) return this._reject('stale', null);

    let segmentStart = false;

    // 튐(spike) 판정: 직전 정상 위치와 비교한 속도
    if (this.lastRaw) {
      const dt = (raw.t - this.lastRaw.t) / 1000;
      const d = haversineM(this.lastRaw, raw);
      const speed = d / Math.max(dt, 0.001);
      const explainedByAccuracy = d <= acc + this.lastRaw.accuracy;
      if (speed > o.maxSpeedMps && !explainedByAccuracy) {
        this.spikeStreak += 1;
        if (this.spikeStreak < o.spikeResetCount) return this._reject('spike', null);
        // 연속으로 튐 판정 → 오히려 기준점이 잘못되었을 가능성이 큼 → 거리 없이 재설정
        this.reset();
        segmentStart = true;
      } else {
        this.spikeStreak = 0;
      }
    }

    this.lastRaw = { lat: raw.lat, lng: raw.lng, accuracy: acc, t: raw.t };
    const smooth = this.kalman.process(raw.lat, raw.lng, acc, raw.t);
    const point = {
      lat: smooth.lat,
      lng: smooth.lng,
      accuracy: acc,
      t: raw.t,
      speed: Number.isFinite(raw.speed) ? raw.speed : null,
    };

    if (!this.anchor) {
      this.anchor = point;
      this.stats.accepted += 1;
      return { accepted: true, reason: null, point, segmentStart: true };
    }

    // 잔떨림(jitter) 판정: 정확도에 비례한 최소 이동 거리
    const moved = haversineM(this.anchor, point);
    const threshold = clamp(acc * o.accuracyMoveFactor, o.minMoveM, o.maxMoveThresholdM);
    if (moved < threshold) {
      // 기준점은 그대로 둠 → 천천히 움직여도 누적되면 결국 채택됨
      return this._reject('jitter', point);
    }

    this.anchor = point;
    this.stats.accepted += 1;
    return { accepted: true, reason: null, point, segmentStart };
  }

  _reject(reason, point) {
    this.stats[reason] = (this.stats[reason] || 0) + 1;
    return { accepted: false, reason, point, segmentStart: false };
  }
}
