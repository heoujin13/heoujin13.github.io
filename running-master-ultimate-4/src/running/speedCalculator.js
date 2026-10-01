/**
 * 속도 계산 (km/h)
 */

export const mpsToKmh = (mps) => (Number.isFinite(mps) ? mps * 3.6 : null);

/** 페이스(초/km) → 속도(km/h) */
export function paceToKmh(paceSec) {
  return Number.isFinite(paceSec) && paceSec > 0 ? 3600 / paceSec : null;
}

/** 평균 속도 (km/h) */
export function averageSpeedKmh(distanceM, elapsedMs) {
  if (!(distanceM > 0) || !(elapsedMs >= 1000)) return null;
  return distanceM / 1000 / (elapsedMs / 3600000);
}

/** 러닝 중 최고 속도 추적 (순간 튐을 피하려고 '현재 페이스 구간' 속도만 사용) */
export class MaxSpeedTracker {
  constructor() {
    this.maxKmh = 0;
  }

  update(kmh) {
    // 사람이 낼 수 있는 범위만 인정
    if (Number.isFinite(kmh) && kmh > this.maxKmh && kmh < 40) this.maxKmh = kmh;
    return this.maxKmh;
  }

  reset() {
    this.maxKmh = 0;
  }
}
