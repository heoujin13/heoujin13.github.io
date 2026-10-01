/**
 * GPS 서비스
 *
 * 책임: 위치 권한 요청, 위치 수신(watch), 신호 상태 판단, 오류 처리.
 * 거리·페이스 계산은 하지 않습니다. 받은 위치를 'gps:position' 이벤트로 넘길 뿐입니다.
 *
 * 발행 이벤트 (bus)
 *   - 'gps:position' : 정규화된 위치 {lat, lng, accuracy, speed, t, ...}
 *   - 'gps:status'   : {state, accuracy, message}
 *       state: off | searching | good | fair | poor | lost | denied | insecure | unsupported | error
 *   - 'gps:error'    : {code, message}
 */
import { GPS_CONFIG, FILTER_CONFIG } from '../core/config.js';

export class GpsService {
  constructor({ provider, bus }) {
    this.provider = provider;
    this.bus = bus;
    this.maxAccuracyM = FILTER_CONFIG.maxAccuracyM;
    this._stopWatch = null;
    this._watchdog = null;
    this.lastFix = null;
    this.lastFixAt = 0;
    this.watchStartedAt = 0;
    this.lastRestartAt = 0;
    this.runActive = false;
    this.status = { state: 'off', accuracy: null, message: '' };
  }

  get watching() {
    return !!this._stopWatch;
  }

  get isSimulation() {
    return this.provider?.kind === 'simulation';
  }

  setMaxAccuracy(m) {
    if (Number.isFinite(m) && m > 0) this.maxAccuracyM = m;
  }

  /** Provider 교체 (예: 실제 GPS ↔ 시뮬레이션). 수신 중이었다면 이어서 수신 */
  setProvider(provider) {
    const wasWatching = this.watching;
    this.stop();
    this.provider = provider;
    this.lastFix = null;
    this.lastFixAt = 0;
    if (this.runActive) this.provider.setRunning?.(true);
    if (wasWatching) this.start();
  }

  /** 러닝 상태를 Provider 에 알려 줌 (시뮬레이터가 사용) */
  setRunActive(active) {
    this.runActive = !!active;
    try {
      this.provider.setRunning?.(this.runActive);
    } catch {
      /* 선택 기능 */
    }
  }

  /** 지원 여부 사전 점검. 문제가 있으면 오류 객체, 없으면 null */
  preflight() {
    if (!this.provider?.supported) {
      return { code: 'unsupported', message: '이 브라우저는 GPS(위치 정보)를 지원하지 않습니다.' };
    }
    if (
      this.provider.kind === 'device' &&
      typeof window !== 'undefined' &&
      window.isSecureContext === false
    ) {
      return {
        code: 'insecure',
        message: 'HTTPS 또는 localhost 주소에서만 GPS를 사용할 수 있습니다. (README 의 휴대폰 실행 방법 참고)',
      };
    }
    return null;
  }

  /** 현재 위치 1회 확인 (권한 요청 포함) */
  async requestCurrent() {
    const problem = this.preflight();
    if (problem) {
      this._applyError(problem);
      throw problem;
    }
    try {
      const pos = await this.provider.getCurrent({
        enableHighAccuracy: GPS_CONFIG.enableHighAccuracy,
        timeout: GPS_CONFIG.timeoutMs,
        maximumAge: 5000,
      });
      this._onPosition(pos);
      return pos;
    } catch (err) {
      this._applyError(err);
      throw err;
    }
  }

  /** 위치 수신 시작 (이미 수신 중이면 무시). 성공 여부 반환 */
  start() {
    if (this.watching) return true;
    const problem = this.preflight();
    if (problem) {
      this._applyError(problem);
      return false;
    }
    this.watchStartedAt = Date.now();
    this._setStatus({ state: 'searching', accuracy: null, message: 'GPS 신호를 찾는 중입니다.' });
    this._stopWatch = this.provider.watch(
      (pos) => this._onPosition(pos),
      (err) => this._onError(err),
      {
        enableHighAccuracy: GPS_CONFIG.enableHighAccuracy,
        timeout: GPS_CONFIG.timeoutMs,
        maximumAge: GPS_CONFIG.maximumAgeMs,
      },
    );
    this._startWatchdog();
    return true;
  }

  stop() {
    if (this._stopWatch) {
      try {
        this._stopWatch();
      } catch {
        /* 무시 */
      }
    }
    this._stopWatch = null;
    clearInterval(this._watchdog);
    this._watchdog = null;
    if (!['denied', 'insecure', 'unsupported'].includes(this.status.state)) {
      this._setStatus({ state: 'off', accuracy: null, message: '' });
    }
  }

  _onPosition(pos) {
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return;
    this.lastFix = pos;
    this.lastFixAt = Date.now();
    const acc = pos.accuracy;
    let state;
    if (!Number.isFinite(acc)) state = 'fair';
    else if (acc <= GPS_CONFIG.goodAccuracyM) state = 'good';
    else if (acc <= this.maxAccuracyM) state = 'fair';
    else state = 'poor';
    const message =
      state === 'poor'
        ? `GPS 정확도가 낮습니다 (±${Math.round(acc)}m). 이 위치는 거리 계산에서 제외됩니다.`
        : '';
    this._setStatus({ state, accuracy: Number.isFinite(acc) ? acc : null, message });
    this.bus.emit('gps:position', pos);
  }

  _onError(err) {
    this._applyError(err);
  }

  _applyError(err) {
    const e = err && typeof err.code === 'string' ? err : { code: 'unknown', message: String(err?.message || err) };
    this.bus.emit('gps:error', e);
    if (e.code === 'denied' || e.code === 'insecure' || e.code === 'unsupported') {
      // 회복 불가능한 오류 → 수신 중지
      if (this._stopWatch) {
        try {
          this._stopWatch();
        } catch {
          /* 무시 */
        }
        this._stopWatch = null;
      }
      clearInterval(this._watchdog);
      this._watchdog = null;
      this._setStatus({ state: e.code, accuracy: null, message: e.message });
      return;
    }
    // 일시적 오류(신호 없음/시간 초과) → 계속 수신 시도
    const hasRecentFix = Date.now() - this.lastFixAt < GPS_CONFIG.signalLostMs;
    if (!hasRecentFix) {
      this._setStatus({
        state: this.lastFixAt ? 'lost' : 'searching',
        accuracy: null,
        message: e.message,
      });
    }
  }

  _startWatchdog() {
    clearInterval(this._watchdog);
    this._watchdog = setInterval(() => {
      if (!this.watching) return;
      const now = Date.now();
      const since = now - (this.lastFixAt || this.watchStartedAt);
      if (since > GPS_CONFIG.signalLostMs && this.lastFixAt) {
        this._setStatus({
          state: 'lost',
          accuracy: null,
          message: 'GPS 신호가 끊겼습니다. 신호가 돌아오면 자동으로 이어서 기록합니다.',
        });
      }
      // 오랫동안 위치가 오지 않으면 watch 재시작 (일부 기기에서 watch 가 멈추는 문제 대응)
      if (since > GPS_CONFIG.watchdogRestartMs && now - this.lastRestartAt > GPS_CONFIG.watchdogRestartMs) {
        this.lastRestartAt = now;
        console.warn('[GPS] 위치 수신이 멈춰 watch 를 재시작합니다.');
        if (this._stopWatch) {
          try {
            this._stopWatch();
          } catch {
            /* 무시 */
          }
        }
        this._stopWatch = null;
        this.start();
      }
    }, 2000);
  }

  _setStatus(next) {
    const prev = this.status;
    const roundedPrev = prev.accuracy === null ? null : Math.round(prev.accuracy);
    const roundedNext = next.accuracy === null ? null : Math.round(next.accuracy);
    if (prev.state === next.state && roundedPrev === roundedNext && prev.message === next.message) {
      return; // 변화 없음 → 이벤트 생략 (불필요한 DOM 갱신 방지)
    }
    this.status = { ...next };
    this.bus.emit('gps:status', this.status);
  }
}
