/**
 * GPS 시뮬레이터 (테스트용 Provider)
 *
 * PC 의 Chrome 에서는 실제로 달릴 수 없으므로, 타원형 트랙을 도는 가상의 러너를
 * 만들어 실제 GPS 처럼 위치를 보내 줍니다.
 *   - 좌표 잡음(±수 m), 가끔 큰 튐(spike), 가끔 낮은 정확도 → 필터 동작 확인
 *   - 'coach-demo' 시나리오: 목표 유지 → 느림 → 복귀 → 빠름 → 정지(Auto Pause) 반복
 *   - 'steady' 시나리오: 설정한 페이스로 꾸준히 달림
 */
import { offsetLatLng } from '../core/geo.js';

const DEFAULT_ORIGIN = Object.freeze({ lat: 37.5268, lng: 126.9325 }); // 여의도 한강공원 부근

/** 시나리오: [지속 시간(초), 목표 대비 페이스 차이(초) 또는 'stop'] */
export const SIM_SCENARIOS = Object.freeze({
  'coach-demo': [
    [70, 0],
    [50, +32],
    [45, 0],
    [45, -38],
    [30, 0],
    [16, 'stop'],
  ],
  steady: [[600, 0]],
});

function gaussian() {
  // Box–Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class SimulatedGeolocationProvider {
  /**
   * @param {object} opts
   * @param {() => number} opts.getBasePaceSec 기준 페이스(초/km)를 돌려주는 함수
   * @param {'coach-demo'|'steady'} [opts.scenario]
   */
  constructor({ getBasePaceSec, scenario = 'coach-demo', origin = DEFAULT_ORIGIN, intervalMs = 1000 } = {}) {
    this.kind = 'simulation';
    this.getBasePaceSec = typeof getBasePaceSec === 'function' ? getBasePaceSec : () => 330;
    this.scenario = SIM_SCENARIOS[scenario] ? scenario : 'coach-demo';
    this.origin = origin;
    this.intervalMs = intervalMs;

    // 타원 트랙 (동서 350m, 남북 180m 반지름 → 한 바퀴 약 1.7km)
    this.a = 350;
    this.b = 180;
    this.theta = Math.PI / 2;
    this.running = false;
    this.simTimeSec = 0;  // 달린 시간 (시나리오 진행용)
    this.lastStepAt = null;
    this.fixCount = 0;
    this._timer = null;
    this._listeners = new Set();
  }

  get supported() {
    return true;
  }

  setScenario(name) {
    if (SIM_SCENARIOS[name]) {
      this.scenario = name;
      this.simTimeSec = 0;
    }
  }

  /** 러닝 중일 때만 가상의 러너가 움직입니다 */
  setRunning(running) {
    this._advance(Date.now());
    this.running = !!running;
  }

  getCurrent() {
    return new Promise((resolve) => {
      setTimeout(() => resolve(this._makeFix(Date.now())), 300);
    });
  }

  watch(onPosition) {
    const listener = { onPosition };
    this._listeners.add(listener);
    if (!this._timer) {
      this.lastStepAt = Date.now();
      this._timer = setInterval(() => this._emit(), this.intervalMs);
      setTimeout(() => this._emit(), 400); // 첫 위치는 빠르게
    }
    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size === 0 && this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    };
  }

  /** 현재 시나리오 구간 → 이 순간의 목표 속도(m/s). 0 이면 정지 */
  _currentSpeedMps() {
    const base = this.getBasePaceSec() || 330;
    const phases = SIM_SCENARIOS[this.scenario];
    const total = phases.reduce((s, p) => s + p[0], 0);
    let t = this.simTimeSec % total;
    for (const [dur, offset] of phases) {
      if (t < dur) {
        if (offset === 'stop') return 0;
        // 자연스러운 미세 변동 ±2%
        const wobble = 1 + 0.02 * Math.sin(this.simTimeSec / 7);
        return (1000 / (base + offset)) * wobble;
      }
      t -= dur;
    }
    return 1000 / base;
  }

  _advance(now) {
    if (this.lastStepAt === null) {
      this.lastStepAt = now;
      return;
    }
    const dt = Math.min(5, Math.max(0, (now - this.lastStepAt) / 1000));
    this.lastStepAt = now;
    if (!this.running || dt === 0) return;
    const v = this._currentSpeedMps();
    this.simTimeSec += dt;
    const ds = v * dt;
    // 타원 위에서 호 길이 ds 만큼 이동
    const { a, b } = this;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const s = Math.sin(this.theta);
      const c = Math.cos(this.theta);
      const speedFactor = Math.sqrt(a * a * s * s + b * b * c * c);
      this.theta += ds / steps / speedFactor;
    }
    this._speed = v;
  }

  _truePosition() {
    const east = this.a * Math.cos(this.theta);
    const north = this.b * Math.sin(this.theta) - this.b;
    return offsetLatLng(this.origin, east, north);
  }

  _makeFix(now) {
    this._advance(now);
    this.fixCount += 1;
    const truth = this._truePosition();
    const moving = this.running && (this._speed || 0) > 0;

    let accuracy = 4 + Math.random() * 4;
    let noiseE = gaussian() * 1.6;
    let noiseN = gaussian() * 1.6;

    // 가끔 큰 튐 (필터 동작 확인용)
    if (this.fixCount % 53 === 0) {
      noiseE += 140;
      noiseN -= 60;
      accuracy = 6;
    } else if (this.fixCount % 37 === 0) {
      accuracy = 48; // 정확도 낮은 위치 (필터에서 제외됨)
      noiseE += gaussian() * 25;
      noiseN += gaussian() * 25;
    }

    const p = offsetLatLng(truth, noiseE, noiseN);
    return {
      lat: p.lat,
      lng: p.lng,
      accuracy,
      altitude: null,
      speed: moving ? Math.max(0, this._speed + gaussian() * 0.2) : 0,
      heading: null,
      t: now,
      deviceTime: now,
      simulated: true,
    };
  }

  _emit() {
    const fix = this._makeFix(Date.now());
    for (const l of [...this._listeners]) {
      try {
        l.onPosition(fix);
      } catch (err) {
        console.error('[GpsSimulator] 리스너 오류', err);
      }
    }
  }
}
