/**
 * 러닝 시간 측정
 *
 * 벽시계(Date.now) 기준으로 '달린 구간'만 누적합니다.
 *  - 일시정지 시간은 제외
 *  - 브라우저 타이머가 밀리거나(백그라운드 등) 건너뛰어도 시간이 틀어지지 않음
 */
export class RunTimer {
  constructor(clock = () => Date.now()) {
    this.clock = clock;
    this.reset();
  }

  reset() {
    this.state = 'idle'; // idle | running | paused | stopped
    this.startedAt = null;
    this.endedAt = null;
    this.accumulatedMs = 0;   // 확정된 달린 시간
    this.segmentStartedAt = null;
    this.pausedAt = null;
    this.pausedTotalMs = 0;
  }

  start(now = this.clock()) {
    this.reset();
    this.state = 'running';
    this.startedAt = now;
    this.segmentStartedAt = now;
  }

  pause(now = this.clock()) {
    if (this.state !== 'running') return false;
    this.accumulatedMs += Math.max(0, now - this.segmentStartedAt);
    this.segmentStartedAt = null;
    this.pausedAt = now;
    this.state = 'paused';
    return true;
  }

  resume(now = this.clock()) {
    if (this.state !== 'paused') return false;
    this.pausedTotalMs += Math.max(0, now - this.pausedAt);
    this.pausedAt = null;
    this.segmentStartedAt = now;
    this.state = 'running';
    return true;
  }

  stop(now = this.clock()) {
    if (this.state === 'running') this.pause(now);
    if (this.state === 'paused') {
      this.pausedTotalMs += Math.max(0, now - this.pausedAt);
      this.pausedAt = null;
    }
    this.endedAt = now;
    this.state = 'stopped';
  }

  /** 달린 시간 (일시정지 제외) */
  elapsedMs(now = this.clock()) {
    if (this.state === 'running') return this.accumulatedMs + Math.max(0, now - this.segmentStartedAt);
    return this.accumulatedMs;
  }

  /** 일시정지로 보낸 시간 */
  pausedMs(now = this.clock()) {
    if (this.state === 'paused') return this.pausedTotalMs + Math.max(0, now - this.pausedAt);
    return this.pausedTotalMs;
  }

  serialize(now = this.clock()) {
    return {
      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs(now),
      pausedMs: this.pausedMs(now),
    };
  }

  /** 복구 시에는 항상 '일시정지' 상태로 되살립니다 */
  restore(data, now = this.clock()) {
    this.reset();
    this.startedAt = data.startedAt ?? now;
    this.accumulatedMs = Math.max(0, data.elapsedMs || 0);
    this.pausedTotalMs = Math.max(0, data.pausedMs || 0);
    this.pausedAt = now;
    this.state = 'paused';
  }
}
