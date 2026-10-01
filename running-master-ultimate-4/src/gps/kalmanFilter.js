/**
 * 위경도 칼만 필터 (1차원 등방성 모델)
 *
 * GPS 좌표의 잔떨림을 줄여 거리 과대 측정을 막습니다.
 * 각 위치의 정확도(accuracy)를 측정 오차로 사용하므로
 * 정확도가 나쁜 위치일수록 결과에 덜 반영됩니다.
 */
export class KalmanLatLng {
  /** @param {number} processNoiseMps 이동 불확실성 (m/s) */
  constructor(processNoiseMps = 3) {
    this.q = processNoiseMps;
    this.reset();
  }

  reset() {
    this.variance = -1; // 음수 = 초기화 전
    this.lat = 0;
    this.lng = 0;
    this.t = 0;
  }

  /**
   * @param {number} lat
   * @param {number} lng
   * @param {number} accuracy 미터
   * @param {number} tMs 밀리초 시각
   * @returns {{lat: number, lng: number}}
   */
  process(lat, lng, accuracy, tMs) {
    const acc = Math.max(1, Number.isFinite(accuracy) ? accuracy : 10);
    if (this.variance < 0) {
      this.lat = lat;
      this.lng = lng;
      this.t = tMs;
      this.variance = acc * acc;
      return { lat, lng };
    }
    const dt = tMs - this.t;
    if (dt > 0) {
      this.variance += (dt * this.q * this.q) / 1000;
      this.t = tMs;
    }
    const k = this.variance / (this.variance + acc * acc);
    this.lat += k * (lat - this.lat);
    this.lng += k * (lng - this.lng);
    this.variance = (1 - k) * this.variance;
    return { lat: this.lat, lng: this.lng };
  }
}
