/**
 * 러닝 세션 — 한 번의 러닝을 처음부터 끝까지 관리
 *
 * 데이터 흐름
 *   GPS 위치 → AutoPause 판정 → GpsFilter → DistanceTracker → PaceCalculator / LapManager
 *
 * UI·지도·코치·저장소를 직접 알지 않습니다. 결과는 이벤트로만 알립니다.
 *   - 'run:state'  : {state, pauseReason}
 *   - 'run:point'  : {lat, lng, segmentStart}  (지도 표시용, 채택된 위치)
 *   - 'run:lap'    : lap 객체
 *
 * state: idle → running ⇄ paused(manual|auto) → finished
 */
import { AUTO_PAUSE_CONFIG, PACE_CONFIG } from '../core/config.js';
import { uid } from '../core/utils.js';
import { GpsFilter } from '../gps/gpsFilter.js';
import { AutoPauseDetector } from './autoPause.js';
import { calculateCalories } from './calorieCalculator.js';
import { DistanceTracker } from './distanceTracker.js';
import { LapManager } from './lapManager.js';
import { PaceCalculator } from './paceCalculator.js';
import { RouteRecorder } from './routeRecorder.js';
import { RunTimer } from './runTimer.js';
import { MaxSpeedTracker, averageSpeedKmh, mpsToKmh } from './speedCalculator.js';

export class RunSession {
  /**
   * @param {object} deps
   * @param {{emit: Function}} deps.bus
   * @param {() => number} [deps.clock]
   * @param {object} [deps.settings] 앱 설정 (settingsStore 형식)
   * @param {boolean} [deps.simulated]
   */
  constructor({ bus, clock = () => Date.now(), settings = null, simulated = false } = {}) {
    this.bus = bus || { emit() {} };
    this.clock = clock;
    this.id = uid();
    this.timer = new RunTimer(clock);
    this.filter = new GpsFilter();
    this.distance = new DistanceTracker();
    this.pace = new PaceCalculator();
    this.laps = new LapManager();
    this.autoPause = new AutoPauseDetector();
    this.route = new RouteRecorder();
    this.maxSpeed = new MaxSpeedTracker();

    this.state = 'idle';
    this.pauseReason = null;
    this.startedAt = null;
    this.weightKg = 65;
    this.simulated = !!simulated;
    this.pendingBreak = false;
    this.lastPoint = null;
    this.pendingPoint = null; // 흔들림 기준 때문에 아직 거리에 반영되지 않은 최신 위치
    this.gpsPointsUsed = 0;
    this.autoPauseCount = 0;

    if (settings) this.applySettings(settings);
  }

  get isActive() {
    return this.state === 'running' || this.state === 'paused';
  }

  /** 설정 반영 (러닝 중 변경도 가능) */
  applySettings(s) {
    if (!s) return;
    const autoPauseOn = !!s.run?.autoPause;
    this.autoPause.setEnabled(autoPauseOn);
    if (!autoPauseOn && this.state === 'paused' && this.pauseReason === 'auto') {
      this.resume(this.clock(), { auto: true });
    }
    this.laps.setAutoLapDistance((Number(s.run?.autoLapKm) || 0) * 1000);
    this.pace.setWindowMs((Number(s.run?.paceWindowSec) || 20) * 1000);
    this.filter.setMaxAccuracy(Number(s.gps?.maxAccuracyM) || 30);
    if (Number.isFinite(s.user?.weightKg)) this.weightKg = s.user.weightKg;
  }

  start(now = this.clock()) {
    if (this.state !== 'idle') return false;
    this.timer.start(now);
    this.startedAt = now;
    this.state = 'running';
    this.pauseReason = null;
    this.pace.reset();
    this.pace.addSample(0, 0);
    this.autoPause.reset(now);
    this._emitState();
    return true;
  }

  /**
   * 시작 직전에 받아 둔 위치로 출발점을 정함
   * (시작 버튼을 누른 뒤 첫 GPS 가 오기 전까지 이동한 거리도 기록되도록)
   */
  seed(raw) {
    if (this.state !== 'running' || !raw) return false;
    const r = this.filter.process(raw);
    if (!r.accepted) return false;
    this.distance.addPoint(r.point, true);
    this.route.add(r.point);
    this.lastPoint = r.point;
    this.bus.emit('run:point', { lat: r.point.lat, lng: r.point.lng, segmentStart: true });
    return true;
  }

  /**
   * @param {'manual'|'auto'} reason
   */
  pause(reason = 'manual', now = this.clock()) {
    if (this.state === 'paused') {
      // 자동 일시정지 중에 사용자가 일시정지를 누르면 수동 일시정지로 전환
      if (reason === 'manual' && this.pauseReason === 'auto') {
        this.pauseReason = 'manual';
        this._emitState();
        return true;
      }
      return false;
    }
    if (this.state !== 'running') return false;

    if (reason === 'auto') {
      // 정지를 감지하는 데 걸린 시간만큼 되돌려서 일시정지 (서 있던 시간이 기록되지 않도록)
      const at = Math.max(this.timer.segmentStartedAt ?? now, now - AUTO_PAUSE_CONFIG.stopWindowMs);
      this.timer.pause(at);
      this._clampTimeline(this.timer.elapsedMs());
      this.autoPauseCount += 1;
    } else {
      this.timer.pause(now);
    }
    this.state = 'paused';
    this.pauseReason = reason;
    this._emitState();
    return true;
  }

  /**
   * @param {{auto?: boolean}} [opts] auto=true 는 Auto Pause 에 의한 자동 재개
   */
  resume(now = this.clock(), { auto = false } = {}) {
    if (this.state !== 'paused') return false;
    const wasManual = this.pauseReason === 'manual';
    this.timer.resume(now);
    this.state = 'running';
    this.pauseReason = null;

    if (wasManual) {
      // 수동 일시정지 동안의 이동은 기록하지 않음 → 경로/거리 구간을 끊음
      this.pendingPoint = null;
      this.filter.reset();
      this.distance.breakSegment();
      this.route.newSegment();
      this.pendingBreak = false;
      this.autoPause.reset(now);
    } else if (!auto) {
      // 자동 일시정지 상태에서 사용자가 직접 재개
      this.autoPause.reset(now);
    }
    this._emitState();
    return true;
  }

  /**
   * GPS 위치 처리
   * @returns {object|null} 필터 결과 (디버그/UI 용)
   */
  handlePosition(raw) {
    const autoPaused = this.state === 'paused' && this.pauseReason === 'auto';
    if (this.state !== 'running' && !autoPaused) return null;
    if (!raw || !Number.isFinite(raw.t)) return null;
    const now = raw.t;

    // 1) Auto Pause 판정 (원본 위치로 판단)
    const decision = this.autoPause.update(raw);
    if (decision === 'pause' && this.state === 'running') {
      this.pause('auto', now);
    } else if (decision === 'resume' && this.state === 'paused' && this.pauseReason === 'auto') {
      this.resume(now, { auto: true });
    }

    // 2) 비정상 데이터 필터
    const result = this.filter.process(raw);
    if (result.reason === 'jitter' && this.state === 'running') this.pendingPoint = result.point;
    else if (result.accepted) this.pendingPoint = null;

    // 기기 속도(도플러)는 위치 잔떨림과 무관하므로 흔들림 판정 위치의 값도 사용
    if (this.state === 'running' && (result.accepted || result.reason === 'jitter') && Number.isFinite(raw.speed)) {
      this.pace.addSpeedSample(this.timer.elapsedMs(now), raw.speed);
    }
    if (!result.accepted) return result;

    if (this.state !== 'running') {
      // 자동 일시정지 중: 필터 상태만 유지. 거리는 재개 후 첫 위치에서 한꺼번에 반영됨
      if (result.segmentStart) this.pendingBreak = true;
      return result;
    }

    // 3) 거리 → 경로 → 페이스 표본 → 랩
    const segmentStart = result.segmentStart || this.pendingBreak;
    this.pendingBreak = false;
    if (segmentStart) this.route.newSegment();
    this.distance.addPoint(result.point, segmentStart);
    this.route.add(result.point);
    this.lastPoint = result.point;
    this.gpsPointsUsed += 1;

    const active = this.timer.elapsedMs(now);
    this.pace.addSample(active, this.distance.meters);
    const newLaps = this.laps.update(active, this.distance.meters);
    for (const lap of newLaps) this.bus.emit('run:lap', lap);

    this.bus.emit('run:point', { lat: result.point.lat, lng: result.point.lng, segmentStart });
    return result;
  }

  /** 수동 랩 */
  manualLap(now = this.clock()) {
    if (this.state !== 'running') return null;
    const lap = this.laps.manualLap(this.timer.elapsedMs(now), this.distance.meters);
    if (lap) this.bus.emit('run:lap', lap);
    return lap;
  }

  /** 현재 지표 계산 (화면/코치 갱신 주기마다 호출) */
  getMetrics(now = this.clock()) {
    const elapsedMs = this.timer.elapsedMs(now);
    const distanceM = this.distance.meters;
    const running = this.state === 'running';
    const cur = running ? this.pace.current(elapsedMs) : { paceSec: null, speedMps: null };
    // 코치 판단용 페이스: 화면용보다 긴 구간으로 계산해 GPS 잡음에 덜 흔들림
    // 출발 직후에는 가속 구간(처음 8초)을 빼고, 모인 만큼(최소 12초)으로 판단
    let coachWindow = Math.max(this.pace.windowMs, PACE_CONFIG.coachWindowMs);
    const sinceStart = elapsedMs - PACE_CONFIG.coachStartSkipMs;
    if (sinceStart < coachWindow) coachWindow = Math.max(PACE_CONFIG.coachMinWindowMs, sinceStart);
    const coachPace = running ? this.pace.current(elapsedMs, coachWindow) : { paceSec: null, source: null };
    const currentSpeedKmh = running ? mpsToKmh(cur.speedMps) : null;
    if (cur.paceSec) this.maxSpeed.update(currentSpeedKmh);
    const lastLap = this.laps.laps[this.laps.laps.length - 1] || null;

    return {
      state: this.state,
      pauseReason: this.pauseReason,
      elapsedMs,
      pausedMs: this.timer.pausedMs(now),
      distanceM,
      currentPaceSec: cur.paceSec,
      coachPaceSec: coachPace.paceSec,
      paceSource: coachPace.source, // 'device'(기기 속도) | 'distance'(이동 거리)
      avgPaceSec: PaceCalculator.average(distanceM, elapsedMs),
      currentSpeedKmh,
      avgSpeedKmh: averageSpeedKmh(distanceM, elapsedMs),
      maxSpeedKmh: this.maxSpeed.maxKmh || null,
      calories: calculateCalories(distanceM, this.weightKg),
      lapCount: this.laps.count,
      currentLap: this.laps.current(elapsedMs, distanceM),
      lastLap,
    };
  }

  /**
   * 러닝 종료 → 저장용 기록 반환
   */
  finish(now = this.clock()) {
    if (!this.isActive) return null;
    // 마지막 채택 위치 이후의 작은 이동(흔들림 기준 미만)도 반영
    if (this.pendingPoint && this.distance.last) {
      this.distance.addPoint(this.pendingPoint);
      this.route.add(this.pendingPoint);
      this.pendingPoint = null;
    }
    const elapsedMs = this.timer.elapsedMs(now);
    this.laps.finalize(elapsedMs, this.distance.meters);
    this.timer.stop(now);
    this.state = 'finished';
    this.pauseReason = null;
    this._emitState();
    return this.buildRecord(now);
  }

  buildRecord(now = this.clock()) {
    const durationMs = this.timer.elapsedMs(now);
    const distanceM = this.distance.meters;
    return {
      id: this.id,
      version: 1,
      startedAt: this.startedAt,
      endedAt: this.timer.endedAt ?? now,
      durationMs,
      pausedMs: this.timer.pausedMs(now),
      distanceM,
      avgPaceSec: PaceCalculator.average(distanceM, durationMs),
      avgSpeedKmh: averageSpeedKmh(distanceM, durationMs),
      maxSpeedKmh: this.maxSpeed.maxKmh || null,
      calories: calculateCalories(distanceM, this.weightKg),
      weightKg: this.weightKg,
      laps: this.laps.laps.map((l) => ({ ...l })),
      autoPauseCount: this.autoPauseCount,
      simulated: this.simulated,
      gps: { pointsUsed: this.gpsPointsUsed, filter: { ...this.filter.stats } },
    };
  }

  /** 경로 (저장용으로 단순화된 세그먼트) */
  getCompactRoute(options) {
    return this.route.toCompact(options);
  }

  /** 앱이 갑자기 종료될 때를 대비한 백업 데이터 */
  serialize(now = this.clock()) {
    return {
      v: 1,
      id: this.id,
      startedAt: this.startedAt,
      state: this.state,
      pauseReason: this.pauseReason,
      timer: this.timer.serialize(now),
      distance: this.distance.serialize(),
      laps: this.laps.serialize(),
      route: this.route.serialize(),
      maxSpeedKmh: this.maxSpeed.maxKmh,
      weightKg: this.weightKg,
      simulated: this.simulated,
      autoPauseCount: this.autoPauseCount,
      gpsPointsUsed: this.gpsPointsUsed,
      savedAt: now,
    };
  }

  /** 백업에서 복구 — 항상 '일시정지(수동)' 상태로 되살림 */
  static restore(data, deps = {}) {
    const s = new RunSession(deps);
    const now = s.clock();
    s.id = data.id || s.id;
    s.startedAt = data.startedAt || now;
    s.timer.restore(data.timer || {}, now);
    s.distance.restore(data.distance);
    s.laps.restore(data.laps);
    s.route.restore(data.route);
    s.maxSpeed.maxKmh = Number(data.maxSpeedKmh) || 0;
    if (Number.isFinite(data.weightKg)) s.weightKg = data.weightKg;
    s.simulated = !!data.simulated;
    s.autoPauseCount = Number(data.autoPauseCount) || 0;
    s.gpsPointsUsed = Number(data.gpsPointsUsed) || 0;
    s.state = 'paused';
    s.pauseReason = 'manual';
    s.pace.reset();
    s.pace.addSample(s.timer.elapsedMs(now), s.distance.meters);
    s.laps.prev = { t: s.timer.elapsedMs(now), d: s.distance.meters };
    return s;
  }

  /** 자동 일시정지를 과거 시점으로 되돌렸을 때 표본 시각 보정 */
  _clampTimeline(elapsed) {
    for (const sample of this.pace.samples) if (sample.t > elapsed) sample.t = elapsed;
    // 서 있던 동안의 기기 속도(≈0)는 버림 → 재개 후 페이스가 느리게 왜곡되지 않도록
    this.pace.speedSamples = this.pace.speedSamples.filter((s) => s.t <= elapsed);
    if (this.laps.prev.t > elapsed) this.laps.prev.t = elapsed;
    if (this.laps.lapStart.t > elapsed) this.laps.lapStart.t = elapsed;
  }

  _emitState() {
    this.bus.emit('run:state', { state: this.state, pauseReason: this.pauseReason });
  }
}
