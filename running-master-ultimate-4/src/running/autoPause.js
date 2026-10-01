/**
 * Auto Pause (자동 일시정지/재개) 판정
 *
 * GPS 오류와 실제 정지를 구분하기 위한 원칙
 *  1) 정확도가 나쁜 위치(> 20m)로는 아무 판단도 하지 않는다
 *  2) GPS 신호가 끊겨 위치가 안 들어오면 정지로 보지 않는다 (위치가 와야 판단)
 *  3) 정지: 최근 6초 동안의 '정확한' 위치들이 모두 작은 반경 안에 있을 때
 *  4) 재개: 정지 지점에서 벗어난 위치가 '연속 2회' 확인될 때 (튐 1회로는 재개 안 함)
 *
 * 순수 로직이며 타이머·UI 는 RunSession 이 처리합니다.
 */
import { AUTO_PAUSE_CONFIG } from '../core/config.js';
import { centroid, haversineM } from '../core/geo.js';
import { clamp } from '../core/utils.js';

export class AutoPauseDetector {
  constructor({ enabled = true, config = AUTO_PAUSE_CONFIG } = {}) {
    this.cfg = config;
    this.enabled = enabled;
    this.reset(0);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.reset(0);
  }

  /** 시작/수동 재개 직후 호출. rearmDelayMs 동안 판단 유예 */
  reset(now) {
    this.buffer = [];
    this.paused = false;
    this.anchor = null;
    this.moveCount = 0;
    this.armedAt = (now || 0) + this.cfg.rearmDelayMs;
  }

  /**
   * @param {{lat:number,lng:number,accuracy:number,t:number,speed?:number|null}} p 원본 위치
   * @returns {'pause'|'resume'|null}
   */
  update(p) {
    if (!this.enabled || !p) return null;
    const acc = Number.isFinite(p.accuracy) ? p.accuracy : 999;
    if (acc > this.cfg.maxAccuracyM) return null; // 판단 보류

    if (!this.paused) {
      if (p.t < this.armedAt) return null;
      this.buffer.push({ lat: p.lat, lng: p.lng, t: p.t, acc });
      const keepFrom = p.t - this.cfg.stopWindowMs * 2;
      while (this.buffer.length && this.buffer[0].t < keepFrom) this.buffer.shift();

      // 기기가 알려 주는 속도가 충분하면 정지 아님
      if (Number.isFinite(p.speed) && p.speed > 1.0) return null;

      const windowStart = p.t - this.cfg.stopWindowMs;
      if (!this.buffer.length || this.buffer[0].t > windowStart) return null; // 관찰 시간 부족
      const pts = this.buffer.filter((b) => b.t >= windowStart);
      if (pts.length < 2) return null;

      const radius = clamp(Math.max(this.cfg.stopRadiusM, acc * 0.8), this.cfg.stopRadiusM, this.cfg.maxStopRadiusM);
      const latest = pts[pts.length - 1];
      const stationary = pts.every((b) => haversineM(b, latest) <= radius);
      if (stationary) {
        this.paused = true;
        this.anchor = centroid(pts);
        this.moveCount = 0;
        return 'pause';
      }
      return null;
    }

    // 자동 일시정지 상태 → 움직임 확인
    const d = haversineM(this.anchor, p);
    const moving =
      d > Math.max(this.cfg.resumeRadiusM, acc) ||
      (Number.isFinite(p.speed) && p.speed >= this.cfg.resumeSpeedMps);
    if (moving) {
      this.moveCount += 1;
      if (this.moveCount >= this.cfg.resumeConfirmCount) {
        this.paused = false;
        this.anchor = null;
        this.moveCount = 0;
        this.buffer = [{ lat: p.lat, lng: p.lng, t: p.t, acc }];
        this.armedAt = p.t; // 재개 직후 바로 다시 판단 가능 (단, 6초 관찰 필요)
        return 'resume';
      }
    } else {
      this.moveCount = 0;
    }
    return null;
  }
}
