/**
 * 러닝 화면 렌더링
 *
 * 값 계산은 하지 않고, 전달받은 지표를 표시만 합니다.
 * setText/setAttr 캐시 덕분에 값이 바뀐 요소만 DOM 이 갱신됩니다.
 */
import { zoneHeadline } from '../coach/coachMessages.js';
import { COACH_ZONE } from '../coach/paceCoach.js';
import {
  formatCalories,
  formatDiffSec,
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatSpeed,
} from '../core/format.js';
import { clamp } from '../core/utils.js';
import { $, h, restartAnimation, setAttr, setHidden, setText } from './dom.js';

const RUN_STATE_TEXT = {
  idle: '준비',
  running: '러닝 중',
  paused: '일시정지',
  auto: '자동 일시정지',
  finished: '완료',
};

const GPS_TEXT = {
  off: 'GPS 꺼짐',
  searching: 'GPS 찾는 중',
  lost: 'GPS 신호 끊김',
  denied: '위치 권한 필요',
  insecure: 'HTTPS 필요',
  unsupported: 'GPS 미지원',
  error: 'GPS 오류',
};

export class RunScreen {
  constructor() {
    this.el = {
      app: $('#app'),
      state: $('#runState'),
      stateText: $('#runStateText'),
      coach: $('#coach'),
      coachTarget: $('#coachTarget'),
      coachTol: $('#coachTolerance'),
      coachDiff: $('#coachDiff'),
      coachTitle: $('#coachTitle'),
      coachDetail: $('#coachDetail'),
      needle: $('#gaugeNeedle'),
      gaugeRange: $('#gaugeRange'),
      distance: $('#mDistance'),
      time: $('#mTime'),
      pace: $('#mPace'),
      avgPace: $('#mAvgPace'),
      speed: $('#mSpeed'),
      avgSpeed: $('#mAvgSpeed'),
      calories: $('#mCalories'),
      lapLabel: $('#mLapLabel'),
      lapPace: $('#mLapPace'),
      lapList: $('#lapList'),
      lapEmpty: $('#lapEmpty'),
      lapCount: $('#lapCount'),
      gpsChip: $('#gpsChip'),
      gpsText: $('#gpsChipText'),
      recenter: $('#btnRecenter'),
      runTab: $('#tab-run'),
    };
    this.runState = 'idle';
    this.renderedLaps = 0;
    this.coachState = null;
  }

  renderMetrics(m) {
    const e = this.el;
    setText(e.distance, formatDistanceKm(m.distanceM));
    setText(e.time, formatDuration(m.elapsedMs));
    setText(e.pace, formatPace(m.currentPaceSec));
    setText(e.avgPace, formatPace(m.avgPaceSec));
    setText(e.speed, formatSpeed(m.currentSpeedKmh));
    setText(e.avgSpeed, formatSpeed(m.avgSpeedKmh));
    setText(e.calories, formatCalories(m.calories));
    const lap = m.currentLap;
    setText(e.lapLabel, lap ? `랩 ${lap.index} 페이스` : '랩 페이스');
    setText(e.lapPace, formatPace(lap?.paceSec));
  }

  renderIdleMetrics() {
    this.renderMetrics({
      distanceM: 0,
      elapsedMs: 0,
      currentPaceSec: null,
      avgPaceSec: null,
      currentSpeedKmh: null,
      avgSpeedKmh: null,
      calories: 0,
      currentLap: { index: 1, paceSec: null },
    });
  }

  renderState(state, pauseReason) {
    this.runState = state;
    const key = state === 'paused' && pauseReason === 'auto' ? 'auto' : state;
    setAttr(this.el.state, 'data-state', key);
    setText(this.el.stateText, RUN_STATE_TEXT[key] || '');
    setAttr(this.el.app, 'data-run-state', key);
    setAttr(this.el.runTab, 'data-live', state === 'running' || state === 'paused' ? 'true' : null);
    if (this.coachState) this.renderCoach(this.coachState);
  }

  renderCoach(state) {
    if (!state) return;
    this.coachState = state;
    const e = this.el;
    setAttr(e.coach, 'data-zone', state.zone);
    setAttr(e.coach, 'data-severity', state.severity || null);
    setText(e.coachTarget, formatPace(state.targetSec));
    setText(e.coachTol, `±${state.toleranceSec}초`);
    setText(e.gaugeRange, `${formatPace(state.targetSec - state.toleranceSec)}–${formatPace(state.targetSec + state.toleranceSec)}`);

    const { title, detail } = zoneHeadline(state, this.runState);
    setText(e.coachTitle, title);
    setText(e.coachDetail, detail);

    const showPace =
      Number.isFinite(state.paceSec) &&
      [COACH_ZONE.ON, COACH_ZONE.SLOW, COACH_ZONE.FAST, COACH_ZONE.WAITING].includes(state.zone);
    setText(e.coachDiff, showPace ? formatDiffSec(state.diffSec) : '');

    // 게이지: 목표 ±(허용오차×3) 범위를 0~100%로. 왼쪽=빠름, 오른쪽=느림
    if (showPace) {
      const span = state.toleranceSec * 3;
      const pct = clamp(50 + (state.diffSec / span) * 50, 0, 100);
      setAttr(e.needle, 'style', `--pos:${pct.toFixed(1)}%`);
      setHidden(e.needle, false);
    } else {
      setHidden(e.needle, true);
    }
  }

  /** 알림 순간 코치 패널 강조 */
  flashCoach(type) {
    setAttr(this.el.coach, 'data-flash', type);
    restartAnimation(this.el.coach, 'is-flashing');
  }

  renderGps(status, { simulated = false } = {}) {
    const e = this.el;
    setAttr(e.gpsChip, 'data-state', status.state);
    let text = GPS_TEXT[status.state];
    if (!text) {
      const acc = Number.isFinite(status.accuracy) ? `±${Math.round(status.accuracy)}m` : '';
      if (status.state === 'poor') text = `정확도 낮음 ${acc}`;
      else text = `${simulated ? '시뮬레이션' : 'GPS'} ${acc}`;
    } else if (simulated && status.state === 'off') {
      text = '시뮬레이션 대기';
    }
    setText(e.gpsText, text);
    setAttr(e.gpsChip, 'title', status.message || text);
  }

  /** 랩 목록 (새 랩만 추가) */
  renderLaps(laps, coachTarget) {
    const e = this.el;
    if (laps.length < this.renderedLaps) {
      e.lapList.textContent = '';
      this.renderedLaps = 0;
    }
    for (let i = this.renderedLaps; i < laps.length; i++) {
      e.lapList.prepend(this._lapItem(laps[i], coachTarget));
    }
    this.renderedLaps = laps.length;
    setHidden(e.lapEmpty, laps.length > 0);
    setText(e.lapCount, laps.length ? `${laps.length}` : '');
  }

  _lapItem(lap, target) {
    let zone = '';
    if (target && Number.isFinite(lap.paceSec)) {
      const p = Math.round(lap.paceSec);
      zone = p > target.targetSec + target.toleranceSec ? 'slow' : p < target.targetSec - target.toleranceSec ? 'fast' : 'on';
    }
    const kind = lap.type === 'manual' ? '수동' : lap.type === 'final' ? '마지막' : '';
    return h('li', { className: 'lap', dataset: { zone } }, [
      h('span', { className: 'lap__index num', text: String(lap.index) }),
      h('span', { className: 'lap__dist' }, [
        `${formatDistanceKm(lap.distanceM)} km`,
        kind ? h('small', { text: ` ${kind}` }) : null,
      ]),
      h('span', { className: 'lap__time num', text: formatDuration(lap.durationMs) }),
      h('span', { className: 'lap__pace num', text: `${formatPace(lap.paceSec)}/km` }),
    ]);
  }

  setFollow(follow) {
    setHidden(this.el.recenter, follow);
  }
}
