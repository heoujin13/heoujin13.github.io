/**
 * ★ 목표 페이스 코치 (Running Master Ultimate 4.0 핵심 기능)
 *
 * GPS 를 전혀 모릅니다. '현재 페이스(초/km)'와 '시각'만 입력받아
 *   목표보다 빠름(fast) / 목표 유지(on) / 목표보다 느림(slow)
 * 을 판정하고, 알림이 필요할 때 'alert' 이벤트를 발행합니다.
 * 실제 진동·음성은 CoachNotifier → VibrationManager / VoiceManager 가 담당합니다.
 *
 *   GPS → Distance → Pace → [PaceCoach] → Vibration / Voice
 *
 * GPS 순간 오차로 진동이 계속 울리지 않게 하는 장치
 *   1) 허용 오차(기본 ±8초): 범위 안이면 '목표 유지'
 *   2) 판정 확정 시간(3초): 같은 판정이 3초 유지되어야 구간이 바뀜
 *   3) 쿨다운(기본 25초): 같은 종류 알림은 쿨다운 안에 다시 울리지 않음
 *   4) 시작/재개 직후 유예: 출발 가속 구간에서는 알림 보류
 *      (시작 시에는 '현재 페이스 계산 구간 + 10초' — 구간이 실제 달린 데이터로 채워진 뒤 판단)
 *
 * 알림 규칙
 *   - 정상 범위 → 이탈 확정: 즉시 알림 (단, 같은 종류 알림이 쿨다운 안이면 쿨다운이 끝날 때 알림)
 *   - 이탈 상태가 계속되면: 같은 알림을 반복하지 않음. 쿨다운이 지나도 여전히 이탈 중이면
 *     '반복 알림' 설정이 켜져 있을 때만 다시 알림
 *   - 정상 범위로 복귀 확정 → 이탈 기록 초기화 (다시 벗어나면 다시 알림)
 *
 * 발행 이벤트
 *   - 'state'     : 화면 표시용 상태 (구간/페이스/차이) — 값이 바뀔 때만
 *   - 'alert'     : {type: 'slow'|'fast', severity: 'mild'|'strong', paceSec, targetSec, diffSec, reminder}
 *   - 'recovered' : 알림 후 목표 범위로 돌아왔을 때
 */
import { COACH_CONFIG } from '../core/config.js';
import { EventBus } from '../core/eventBus.js';
import { clamp } from '../core/utils.js';

export const COACH_ZONE = Object.freeze({
  IDLE: 'idle',       // 러닝 전
  OFF: 'off',         // 코치 꺼짐
  WAITING: 'waiting', // 페이스 측정 중 (데이터 부족/유예 시간)
  PAUSED: 'paused',   // 일시정지 중
  ON: 'on',           // 목표 페이스 유지
  SLOW: 'slow',       // 목표보다 느림
  FAST: 'fast',       // 목표보다 빠름
});

const PACE_ZONES = new Set([COACH_ZONE.ON, COACH_ZONE.SLOW, COACH_ZONE.FAST]);

export class PaceCoach extends EventBus {
  constructor(options = {}) {
    super();
    this.cfg = {
      enabled: true,
      targetPaceSec: 330,
      toleranceSec: 8,
      cooldownMs: 25000,
      confirmMs: COACH_CONFIG.confirmMs,
      graceMs: COACH_CONFIG.graceMs,       // 시작 직후 유예
      resumeGraceMs: COACH_CONFIG.graceMs, // 재개·목표 변경 직후 유예
      alertFast: true,
      repeatWhileOff: true,
      strongFactor: COACH_CONFIG.strongFactor,
    };
    this.active = false;
    this.suspended = false;
    this._pendingRegrace = false;
    this.lastNow = 0;
    this.configure(options, { silent: true });
    this._resetRun();
  }

  /** 설정 변경 (러닝 중에도 가능) */
  configure(partial = {}, { silent = false } = {}) {
    const c = this.cfg;
    const prev = { target: c.targetPaceSec, tol: c.toleranceSec, enabled: c.enabled };

    if ('enabled' in partial) c.enabled = !!partial.enabled;
    if (Number.isFinite(partial.targetPaceSec)) {
      c.targetPaceSec = clamp(Math.round(partial.targetPaceSec), COACH_CONFIG.minTargetPaceSec, COACH_CONFIG.maxTargetPaceSec);
    }
    if (Number.isFinite(partial.toleranceSec)) {
      c.toleranceSec = clamp(Math.round(partial.toleranceSec), COACH_CONFIG.minToleranceSec, COACH_CONFIG.maxToleranceSec);
    }
    if (Number.isFinite(partial.cooldownMs)) c.cooldownMs = Math.max(0, partial.cooldownMs);
    if (Number.isFinite(partial.confirmMs)) c.confirmMs = Math.max(0, partial.confirmMs);
    if (Number.isFinite(partial.graceMs)) c.graceMs = Math.max(0, partial.graceMs);
    if (Number.isFinite(partial.resumeGraceMs)) c.resumeGraceMs = Math.max(0, partial.resumeGraceMs);
    if (Number.isFinite(partial.strongFactor)) c.strongFactor = Math.max(1, partial.strongFactor);
    if ('alertFast' in partial) c.alertFast = !!partial.alertFast;
    if ('repeatWhileOff' in partial) c.repeatWhileOff = !!partial.repeatWhileOff;

    if (silent) return;
    const targetChanged = prev.target !== c.targetPaceSec || prev.tol !== c.toleranceSec;
    const reEnabled = !prev.enabled && c.enabled;
    if (this.active && (targetChanged || reEnabled)) {
      // 목표가 바뀌면 처음부터 다시 판단 (다음 update 에서 유예 시간 적용)
      this._pendingRegrace = true;
      this._resetEpisode();
    }
    if (this.active && !this.suspended) {
      this._setZone(c.enabled ? COACH_ZONE.WAITING : COACH_ZONE.OFF, this.state.paceSec);
    } else if (!this.active) {
      this._emitState(true);
    }
  }

  get range() {
    return {
      minSec: this.cfg.targetPaceSec - this.cfg.toleranceSec,
      maxSec: this.cfg.targetPaceSec + this.cfg.toleranceSec,
    };
  }

  /**
   * 페이스(초/km) 분류 — 경계값 포함 (목표 5:30 ±8초 → 5:22~5:38 은 'on')
   * 화면에 표시되는 값과 판정을 일치시키기 위해 정수 초로 반올림해 비교합니다.
   */
  classify(paceSec) {
    const p = Math.round(paceSec);
    const { targetPaceSec: t, toleranceSec: tol } = this.cfg;
    if (p > t + tol) return COACH_ZONE.SLOW;
    if (p < t - tol) return COACH_ZONE.FAST;
    return COACH_ZONE.ON;
  }

  /** 러닝 시작 */
  start(now) {
    this._resetRun();
    this.active = true;
    this.suspended = false;
    this.graceUntil = now + this.cfg.graceMs;
    this.graceLeftSec = Math.ceil(this.cfg.graceMs / 1000);
    this.lastNow = now;
    this._setZone(this.cfg.enabled ? COACH_ZONE.WAITING : COACH_ZONE.OFF, null);
  }

  /** 일시정지 (자동/수동) — 알림 중단 */
  suspend() {
    if (!this.active) return;
    this.suspended = true;
    this.candidate = null;
    this.lastStatAt = null;
    this._setZone(COACH_ZONE.PAUSED, null);
  }

  /** 재개 — 유예 시간 후 다시 판단. 쿨다운 기록은 유지 */
  resume(now) {
    if (!this.active) return;
    this.suspended = false;
    this.graceUntil = now + this.cfg.resumeGraceMs;
    this.lastNow = now;
    this._resetEpisode();
    this._setZone(this.cfg.enabled ? COACH_ZONE.WAITING : COACH_ZONE.OFF, null);
  }

  /** 러닝 종료 */
  stop() {
    this.active = false;
    this.suspended = false;
    this.candidate = null;
    this._setZone(COACH_ZONE.IDLE, null);
  }

  /**
   * 현재 페이스 입력 (주기적으로 호출)
   * @param {number|null} paceSec 코치 판단용 페이스 (초/km, 안정적인 긴 구간). 측정 불가면 null
   * @param {number} now 밀리초 시각
   * @param {number|null} [recentPaceSec] 최근(짧은 구간) 페이스. 주면 알림 직전에 한 번 더 확인
   *        → 이미 목표 범위로 돌아온 뒤에 늦게 울리는 알림을 막음
   * @returns {object|null} 이번 호출에서 발생한 알림/복귀 이벤트
   */
  update(paceSec, now, recentPaceSec = undefined) {
    if (!this.active || this.suspended) return null;
    this.lastNow = now;
    this.recentPaceSec = recentPaceSec;
    if (this._pendingRegrace) {
      this._pendingRegrace = false;
      this.graceUntil = now + this.cfg.resumeGraceMs;
      this._resetEpisode();
    }
    this._accumulate(now);

    if (!this.cfg.enabled) {
      this._setZone(COACH_ZONE.OFF, null);
      return null;
    }

    const valid = Number.isFinite(paceSec) && paceSec > 0;
    if (!valid) {
      this.candidate = null;
      this.graceLeftSec = now < this.graceUntil ? Math.ceil((this.graceUntil - now) / 1000) : 0;
      this._setZone(COACH_ZONE.WAITING, null);
      return null;
    }
    const pace = Math.round(paceSec);

    if (now < this.graceUntil) {
      this.candidate = null;
      this.graceLeftSec = Math.ceil((this.graceUntil - now) / 1000);
      this._setZone(COACH_ZONE.WAITING, pace);
      return null;
    }
    this.graceLeftSec = 0;

    // 판정 확정: 같은 판정이 confirmMs 동안 유지되어야 구간 변경
    const raw = this.classify(pace);
    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSince = now;
    }
    const confirmed = raw === this.zone || now - this.candidateSince >= this.cfg.confirmMs;
    if (!confirmed) {
      this._setZone(this.zone, pace);
      return null;
    }

    this._setZone(raw, pace);
    return this._evaluate(raw, pace, now);
  }

  _evaluate(zone, pace, now) {
    const c = this.cfg;
    if (zone === COACH_ZONE.ON) {
      if (this.episode) {
        const hadAlert = this.episode.alerted;
        this.episode = null;
        if (hadAlert) {
          const ev = { type: 'recovered', paceSec: pace, targetSec: c.targetPaceSec, at: now };
          this.emit('recovered', ev);
          return ev;
        }
      }
      return null;
    }

    // 느림 / 빠름
    if (!this.episode || this.episode.type !== zone) {
      this.episode = { type: zone, startedAt: now, alerted: false };
    }
    if (zone === COACH_ZONE.FAST && !c.alertFast) return null;

    // 최근 페이스가 이미 목표 범위로 돌아왔다면 알림 보류 (돌아오지 않으면 다음 갱신 때 알림)
    const recent = this.recentPaceSec;
    if (Number.isFinite(recent) && recent > 0 && this.classify(recent) !== zone) return null;

    const sinceLast = now - this.lastAlertAt[zone];
    const due = sinceLast >= c.cooldownMs && (!this.episode.alerted || c.repeatWhileOff);
    if (!due) return null;

    const diffSec = pace - c.targetPaceSec;
    const alert = {
      type: zone,
      severity: Math.abs(diffSec) > c.toleranceSec * c.strongFactor ? 'strong' : 'mild',
      paceSec: pace,
      targetSec: c.targetPaceSec,
      toleranceSec: c.toleranceSec,
      diffSec,
      reminder: this.episode.alerted,
      at: now,
    };
    this.episode.alerted = true;
    this.lastAlertAt[zone] = now;
    this.stats.alerts[zone] += 1;
    this.emit('alert', alert);
    return alert;
  }

  /** 구간별 체류 시간 집계 */
  _accumulate(now) {
    if (this.lastStatAt !== null && PACE_ZONES.has(this.zone)) {
      const dt = Math.min(Math.max(0, now - this.lastStatAt), COACH_CONFIG.maxIntervalMs);
      this.stats[`${this.zone}Ms`] += dt;
    }
    this.lastStatAt = now;
  }

  _resetEpisode() {
    this.episode = null;
    this.candidate = null;
    this.candidateSince = 0;
  }

  _resetRun() {
    this._resetEpisode();
    this.graceLeftSec = 0;
    this.zone = COACH_ZONE.IDLE;
    this.graceUntil = 0;
    this.lastStatAt = null;
    this.lastAlertAt = { slow: -Infinity, fast: -Infinity };
    this.stats = { onMs: 0, slowMs: 0, fastMs: 0, alerts: { slow: 0, fast: 0 } };
    this.state = this._buildState(COACH_ZONE.IDLE, null);
  }

  _buildState(zone, paceSec) {
    const c = this.cfg;
    const diffSec = Number.isFinite(paceSec) ? paceSec - c.targetPaceSec : null;
    let severity = null;
    if ((zone === COACH_ZONE.SLOW || zone === COACH_ZONE.FAST) && diffSec !== null) {
      severity = Math.abs(diffSec) > c.toleranceSec * c.strongFactor ? 'strong' : 'mild';
    }
    return {
      zone,
      graceLeftSec: zone === COACH_ZONE.WAITING ? this.graceLeftSec || 0 : 0,
      enabled: c.enabled,
      paceSec: Number.isFinite(paceSec) ? paceSec : null,
      targetSec: c.targetPaceSec,
      toleranceSec: c.toleranceSec,
      diffSec,
      severity,
      alertFast: c.alertFast,
    };
  }

  _setZone(zone, paceSec) {
    this.zone = zone;
    const next = this._buildState(zone, paceSec);
    const prev = this.state;
    const changed =
      !prev ||
      prev.zone !== next.zone ||
      prev.paceSec !== next.paceSec ||
      prev.targetSec !== next.targetSec ||
      prev.toleranceSec !== next.toleranceSec ||
      prev.graceLeftSec !== next.graceLeftSec ||
      prev.enabled !== next.enabled;
    this.state = next;
    if (changed) this.emit('state', next);
  }

  _emitState(force = false) {
    this.state = this._buildState(this.zone, this.state?.paceSec ?? null);
    if (force) this.emit('state', this.state);
  }

  getState() {
    return this.state;
  }

  /** 기록 저장용 코치 통계 */
  getStats() {
    return {
      enabled: this.cfg.enabled,
      targetPaceSec: this.cfg.targetPaceSec,
      toleranceSec: this.cfg.toleranceSec,
      onMs: Math.round(this.stats.onMs),
      slowMs: Math.round(this.stats.slowMs),
      fastMs: Math.round(this.stats.fastMs),
      alerts: { ...this.stats.alerts },
    };
  }

  /** 복구용 */
  restoreStats(stats) {
    if (!stats) return;
    this.stats.onMs = Number(stats.onMs) || 0;
    this.stats.slowMs = Number(stats.slowMs) || 0;
    this.stats.fastMs = Number(stats.fastMs) || 0;
    this.stats.alerts = {
      slow: Number(stats.alerts?.slow) || 0,
      fast: Number(stats.alerts?.fast) || 0,
    };
  }
}
