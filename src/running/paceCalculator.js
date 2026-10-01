/**
 * 페이스 계산 (초/km)
 *
 *  - 현재 페이스: 최근 N초(기본 20초) 구간으로 계산 → GPS 순간 오차 완화
 *      1순위) 기기가 알려 주는 속도(GPS 도플러 속도)의 구간 평균 — 위치 잡음의 영향을 거의 받지 않음
 *      2순위) 구간 동안 이동한 거리 ÷ 시간 — 속도 정보를 주지 않는 기기/브라우저용
 *      두 값이 크게 다르면(25% 이상) 기기 속도를 믿지 않고 이동 거리 기준을 사용
 *  - 평균 페이스: 전체 달린 시간 ÷ 전체 거리
 *
 * 시간은 '달린 시간(일시정지 제외)' 축을 사용하므로 일시정지가 페이스를 왜곡하지 않습니다.
 */
import { PACE_CONFIG } from '../core/config.js';

const MAX_DEVICE_SPEED_MPS = 12;

export class PaceCalculator {
  constructor({ windowMs = PACE_CONFIG.defaultWindowMs, config = PACE_CONFIG } = {}) {
    this.cfg = config;
    this.windowMs = windowMs;
    this.samples = [];      // {t: 달린 시간 ms, d: 누적 거리 m}
    this.speedSamples = []; // {t: 달린 시간 ms, v: 기기 속도 m/s}
    this.lastSource = null; // 'device' | 'distance' (디버그/표시용)
  }

  setWindowMs(ms) {
    if (Number.isFinite(ms) && ms >= 5000) this.windowMs = ms;
  }

  reset() {
    this.samples = [];
    this.speedSamples = [];
    this.lastSource = null;
  }

  /** 거리 표본 추가 (GPS 위치가 채택될 때마다) */
  addSample(activeMs, distanceM) {
    const last = this.samples[this.samples.length - 1];
    if (last && activeMs < last.t) return;
    if (last && activeMs === last.t) {
      last.d = distanceM;
      return;
    }
    this.samples.push({ t: activeMs, d: distanceM });
    // 오래된 표본 정리 (보간용으로 구간 바깥 1개는 남김)
    const cutoff = activeMs - this._retainMs();
    while (this.samples.length > 2 && this.samples[1].t < cutoff) this.samples.shift();
  }

  /** 기기 속도 표본 추가 (정확도 기준을 통과한 모든 위치) */
  addSpeedSample(activeMs, speedMps) {
    if (!Number.isFinite(speedMps) || speedMps < 0 || speedMps > MAX_DEVICE_SPEED_MPS) return;
    const last = this.speedSamples[this.speedSamples.length - 1];
    if (last && activeMs <= last.t) {
      if (activeMs === last.t) last.v = speedMps;
      return;
    }
    this.speedSamples.push({ t: activeMs, v: speedMps });
    const cutoff = activeMs - this._retainMs();
    while (this.speedSamples.length && this.speedSamples[0].t < cutoff) this.speedSamples.shift();
  }

  /** 보관할 표본 길이 (화면용·코치용 구간 중 긴 쪽의 2배) */
  _retainMs() {
    return Math.max(this.windowMs, this.cfg.coachWindowMs || 0) * 2;
  }

  /**
   * 현재 페이스/속도
   * @param {number} nowActiveMs 현재 달린 시간
   * @param {number} [windowMs] 계산 구간 (생략 시 화면용 구간)
   * @returns {{paceSec: number|null, speedMps: number|null, source: string|null}}
   */
  current(nowActiveMs, windowMs = this.windowMs) {
    const pos = this._distanceSpeed(nowActiveMs, windowMs);
    const dev = this._deviceSpeed(nowActiveMs, windowMs);

    let speed = null;
    let source = null;
    if (dev !== null) {
      const agrees = pos === null || pos < 0.3 || Math.abs(dev - pos) / Math.max(pos, 0.1) <= 0.25;
      if (agrees) {
        speed = dev;
        source = 'device';
      }
    }
    if (speed === null && pos !== null) {
      speed = pos;
      source = 'distance';
    }
    this.lastSource = source;
    if (speed === null) return { paceSec: null, speedMps: null, source: null };
    if (speed < this.cfg.minSpeedMps) return { paceSec: null, speedMps: speed, source };
    if (source === 'distance' && this._windowDistance < this.cfg.minWindowDistanceM) {
      return { paceSec: null, speedMps: speed, source };
    }
    return { paceSec: 1000 / speed, speedMps: speed, source };
  }

  /** 기기 속도 평균 (표본이 충분하고 최신일 때만) */
  _deviceSpeed(nowActiveMs, windowMs) {
    const s = this.speedSamples;
    if (!s.length) return null;
    const last = s[s.length - 1];
    if (nowActiveMs - last.t > 3000) return null; // 최근 표본 없음 → 사용 안 함
    const from = nowActiveMs - windowMs;
    let sum = 0;
    let n = 0;
    let first = null;
    for (let i = s.length - 1; i >= 0 && s[i].t >= from; i--) {
      sum += s[i].v;
      n += 1;
      first = s[i];
    }
    if (n < 4 || !first || last.t - first.t < this.cfg.minWindowMs) return null;
    return sum / n;
  }

  /** 구간 이동 거리 기준 속도 */
  _distanceSpeed(nowActiveMs, windowMs) {
    this._windowDistance = 0;
    const s = this.samples;
    const n = s.length;
    if (n < 2) return null;
    const last = s[n - 1];

    // GPS 사이에는 값을 고정하고, 오래 위치가 없으면(멈춤) 현재 시각까지 늘려 반영
    const endT = nowActiveMs - last.t > this.cfg.staleSampleMs ? nowActiveMs : last.t;
    const endD = last.d;
    const startT = endT - windowMs;

    let startD;
    let effStartT;
    if (startT <= s[0].t) {
      effStartT = s[0].t;
      startD = s[0].d;
    } else if (startT >= last.t) {
      effStartT = startT;
      startD = last.d;
    } else {
      effStartT = startT;
      startD = last.d;
      for (let i = n - 1; i > 0; i--) {
        const a = s[i - 1];
        const b = s[i];
        if (a.t <= startT) {
          const r = b.t === a.t ? 0 : (startT - a.t) / (b.t - a.t);
          startD = a.d + (b.d - a.d) * r;
          break;
        }
      }
    }

    const dt = endT - effStartT;
    if (dt < this.cfg.minWindowMs) return null;
    const dd = Math.max(0, endD - startD);
    this._windowDistance = dd;
    return dd / (dt / 1000);
  }

  /** 평균 페이스 (초/km). 거리가 너무 짧으면 null */
  static average(distanceM, elapsedMs, minDistanceM = PACE_CONFIG.minAvgDistanceM) {
    if (!(distanceM >= minDistanceM) || !(elapsedMs > 0)) return null;
    return elapsedMs / 1000 / (distanceM / 1000);
  }
}
