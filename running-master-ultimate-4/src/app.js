/**
 * Running Master Ultimate 4.0 — 앱 조립(Composition Root)
 *
 * 각 모듈은 서로를 직접 알지 못하고, 이 파일에서만 연결됩니다.
 *
 *   GpsService ──gps:position──▶ RunSession (Filter → Distance → Pace → Lap)
 *                                    │ getMetrics() (0.5초마다)
 *                                    ▼
 *                               PaceCoach (목표 페이스 비교)
 *                                    │ alert
 *                                    ▼
 *                              CoachNotifier ──▶ VibrationManager / VoiceManager
 *
 *   RunSession ──run:point──▶ MapView      RunSession ──finish──▶ RunRepository
 */
import { CoachNotifier } from './coach/coachNotifier.js';
import { alertSpeech } from './coach/coachMessages.js';
import { PaceCoach } from './coach/paceCoach.js';
import { APP_INFO, COACH_CONFIG, PACE_CONFIG, STORAGE_CONFIG, UI_CONFIG } from './core/config.js';
import { EventBus } from './core/eventBus.js';
import {
  distanceToSpeech,
  formatDate,
  formatDistanceKm,
  formatDuration,
  formatDurationWords,
  formatPace,
  formatTime,
  paceToSpeech,
} from './core/format.js';
import { detectCapabilities, queryGeolocationPermission } from './core/platform.js';
import { WakeLockManager } from './core/wakeLock.js';
import { GpsService } from './gps/gpsService.js';
import { SimulatedGeolocationProvider } from './gps/gpsSimulator.js';
import { BrowserGeolocationProvider } from './gps/providers.js';
import { MapView } from './map/mapView.js';
import { RunSession } from './running/runSession.js';
import { ActiveRunStore } from './storage/activeRunStore.js';
import { backupFilename, buildBackup, downloadJSON, readBackupFile } from './storage/backup.js';
import { RunRepository } from './storage/runRepository.js';
import { SafeStorage } from './storage/safeStorage.js';
import { SettingsStore } from './storage/settingsStore.js';
import { ControlBar } from './ui/controlBar.js';
import { $, setHidden, setText } from './ui/dom.js';
import { HistoryScreen } from './ui/historyScreen.js';
import { choiceDialog, confirmDialog, initModal, numberDialog, openDialog, paceDialog } from './ui/modal.js';
import { Router } from './ui/router.js';
import { RunDetailView } from './ui/runDetailView.js';
import { RunScreen } from './ui/runScreen.js';
import { SettingsScreen } from './ui/settingsScreen.js';
import { StatsScreen } from './ui/statsScreen.js';
import { ThemeController } from './ui/theme.js';
import { initToast, toast } from './ui/toast.js';
import { VibrationManager } from './vibration/vibrationManager.js';
import { VoiceManager } from './voice/voiceManager.js';

export class App {
  constructor() {
    this.bus = new EventBus();
    this.storage = new SafeStorage(APP_INFO.storagePrefix);
    this.settings = new SettingsStore(this.storage);
    this.repo = new RunRepository(this.storage);
    this.activeStore = new ActiveRunStore(this.storage);
    this.caps = detectCapabilities();

    const s = this.settings.get();
    this.vibration = new VibrationManager({ enabled: s.coach.vibration });
    this.voice = new VoiceManager({ enabled: s.coach.voice });
    this.wakeLock = new WakeLockManager();
    this.gps = new GpsService({ provider: this._createProvider(s), bus: this.bus });
    this.gps.setMaxAccuracy(s.gps.maxAccuracyM);
    this.coach = new PaceCoach(this._coachOptions(s));

    this.session = null;
    this.map = null;
    this.tickTimer = null;
    this.lastTickAt = 0;
    this.lastBackupAt = 0;
    this.prevRun = { state: 'idle', pauseReason: null };
    this.backupWarned = false;
  }

  // ───────────────────────────── 초기화 ─────────────────────────────

  async init() {
    initToast($('#toastHost'));
    initModal($('#modalHost'));

    this.theme = new ThemeController({ onChange: (dark) => this._onThemeChange(dark) });
    this.runScreen = new RunScreen();
    this.controls = new ControlBar({
      onStart: () => this.startRun(),
      onPause: () => this.pauseRun(),
      onResume: () => this.resumeRun(),
      onLap: () => this.lap(),
      onFinish: () => this.finishRun(),
      onFinishConfirm: async () => {
        const ok = await confirmDialog({ title: '러닝을 종료할까요?', message: '종료하면 기록이 저장됩니다.', confirmText: '종료' });
        if (ok) await this.finishRun();
      },
      onHint: (m) => toast(m),
    });
    this.router = new Router({ root: $('#app'), onChange: (name) => this._onScreenChange(name) });
    this.detail = new RunDetailView({
      repo: this.repo,
      isDark: () => this.theme.isDark,
      onDelete: (id) => this.deleteRun(id),
    });
    this.history = new HistoryScreen({ repo: this.repo, onOpen: (id) => this.detail.open(id) });
    this.stats = new StatsScreen({
      repo: this.repo,
      settings: this.settings,
      onEditGoal: () => this.editMonthlyGoal(),
      onOpenRun: (id) => this.detail.open(id),
    });
    this.settingsScreen = new SettingsScreen({
      settings: this.settings,
      actions: this._settingsActions(),
      getDiagnostics: () => this.getDiagnostics(),
    });
    this.notifier = new CoachNotifier({
      coach: this.coach,
      vibration: this.vibration,
      voice: this.voice,
      getSettings: () => this.settings.get().coach,
      onVisual: (a) => this._onCoachVisual(a),
    });

    this._wireEvents();
    this.theme.setMode(this.settings.get().display.theme);
    this.runScreen.renderIdleMetrics();
    this.runScreen.renderState('idle', null);
    this.runScreen.renderCoach(this.coach.getState());
    this.runScreen.renderGps(this.gps.status, { simulated: this.gps.isSimulation });
    this.controls.setState('idle');
    this._renderEnvBanner();

    // 지도는 비동기로 — 실패해도 앱은 계속 동작
    this.map = new MapView($('#liveMap'), {
      dark: this.theme.isDark,
      live: true,
      onFollowChange: (f) => this.runScreen.setFollow(f),
    });
    this.map.init().then((ok) => {
      if (!ok) toast('지도를 불러오지 못했습니다. 경로는 계속 기록됩니다.', { type: 'warn' });
    });

    if (!this.storage.available) {
      toast('브라우저 저장소를 사용할 수 없어 기록이 이 화면을 닫으면 사라집니다.', { type: 'warn', duration: 6000 });
    }

    document.addEventListener('visibilitychange', () => this._onVisibility());
    window.addEventListener('pagehide', () => this._persistNow());
    window.addEventListener('beforeunload', (e) => {
      this._persistNow();
      if (this.session?.isActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    await this._checkRecovery();
    await this._prewarmGps();
  }

  _wireEvents() {
    const bus = this.bus;
    bus.on('gps:position', (pos) => this._onPosition(pos));
    bus.on('gps:status', (st) => this._onGpsStatus(st));
    bus.on('gps:error', (err) => this._onGpsError(err));
    bus.on('run:state', ({ state, pauseReason }) => this._onRunState(state, pauseReason));
    bus.on('run:point', (p) => this.map?.addRoutePoint(p.lat, p.lng, p.segmentStart));
    bus.on('run:lap', (lap) => this._onLap(lap));
    this.coach.on('state', (s) => this.runScreen.renderCoach(s));
    this.settings.subscribe((s, change) => this._applySettings(s, change));

    $('#coachTargetBtn').addEventListener('click', () => this.editTargetPace());
    $('#gpsChip').addEventListener('click', () => this.showGpsInfo());
    $('#btnRecenter').addEventListener('click', () => this.map?.recenter());
  }

  // ───────────────────────────── 러닝 제어 ─────────────────────────────

  async startRun() {
    if (this.session?.isActive) return;
    // 모바일 브라우저는 사용자 터치 안에서 음성을 한 번 내야 이후 자동 안내가 가능
    this.voice.unlock();

    this._ensureProvider();
    let useGps = true;
    const problem =
      this.gps.preflight() ||
      (this.gps.status.state === 'denied' ? { code: 'denied', message: this.gps.status.message } : null);
    if (problem) {
      const choice = await choiceDialog({
        title: 'GPS를 사용할 수 없습니다',
        message: `${problem.message} GPS 없이 시작하면 시간만 기록됩니다.`,
        choices: [
          { id: 'cancel', label: '취소', variant: 'ghost' },
          { id: 'sim', label: '시뮬레이션', variant: 'ghost' },
          { id: 'nogps', label: 'GPS 없이 시작', variant: 'primary' },
        ],
      });
      if (!choice || choice === 'cancel') return;
      if (choice === 'sim') {
        this.settings.set('gps.simulation', true);
        this._ensureProvider();
      } else {
        useGps = false;
      }
    }

    this.controls.setStarting(true);
    try {
      const s = this.settings.get();
      const now = Date.now();
      this.session = new RunSession({ bus: this.bus, settings: s, simulated: this.gps.isSimulation });
      this.coach.start(now);
      this.map?.startLive();
      this.runScreen.renderLaps([], this._coachTarget());
      this.session.start(now);
      // 미리 잡아 둔 최신 위치(5초 이내)를 출발점으로
      const fix = this.gps.lastFix;
      if (useGps && fix && now - this.gps.lastFixAt < 5000) this.session.seed({ ...fix, t: Math.min(fix.t, now) });
      this.gps.setRunActive(true);
      if (useGps) this.gps.start();
      if (s.display.keepAwake) this.wakeLock.enable();
      this.vibration.play('start');
      this.voice.speak(
        s.coach.enabled
          ? `러닝을 시작합니다. 목표 페이스 ${paceToSpeech(s.coach.targetPaceSec)}.`
          : '러닝을 시작합니다.',
      );
      this._startTicker();
      this._tick(true);
      this._persistActive();
    } catch (err) {
      console.error('[App] 러닝 시작 실패', err);
      toast('러닝을 시작하지 못했습니다. 다시 시도해 주세요.', { type: 'error' });
      this.session = null;
    } finally {
      this.controls.setStarting(false);
    }
  }

  pauseRun() {
    if (!this.session) return;
    const wasAuto = this.session.pauseReason === 'auto';
    if (this.session.pause('manual')) {
      this.vibration.play('pause');
      if (!wasAuto) this.voice.speak('일시정지');
      this._tick(true);
    }
  }

  resumeRun() {
    if (!this.session) return;
    if (this.gps.status.state === 'off' && this.gps.provider.supported) this.gps.start();
    if (this.session.resume()) {
      this.vibration.play('start');
      this.voice.speak('러닝을 재개합니다.');
      this._tick(true);
    }
  }

  lap() {
    if (!this.session) return;
    const lap = this.session.manualLap();
    if (!lap) toast('랩이 너무 짧습니다. 3초 이상 지난 뒤 다시 눌러 주세요.');
  }

  async finishRun() {
    const session = this.session;
    if (!session?.isActive) return;
    const pre = session.getMetrics();

    let save = true;
    if (pre.distanceM < 50) {
      const choice = await choiceDialog({
        title: '기록이 매우 짧습니다',
        message: `거리 ${formatDistanceKm(pre.distanceM)} km, 시간 ${formatDuration(pre.elapsedMs)} 입니다. 저장할까요?`,
        choices: [
          { id: 'continue', label: '계속 달리기', variant: 'ghost' },
          { id: 'discard', label: '저장 안 함', variant: 'ghost' },
          { id: 'save', label: '저장', variant: 'primary' },
        ],
      });
      if (!choice || choice === 'continue') return;
      save = choice === 'save';
    }
    if (this.session !== session || !session.isActive) return;

    const record = session.finish();
    record.coach = this.coach.getStats();
    this.coach.stop();
    this._stopTicker();
    this.gps.setRunActive(false);
    this.wakeLock.disable();
    this.vibration.play('finish');

    let saveNote = '';
    let saved = false;
    if (save) {
      const res = this.repo.save(record, session.getCompactRoute());
      if (res.ok) {
        saved = true;
        if (!res.routeSaved) saveNote = '저장 공간이 부족해 GPS 경로는 저장하지 못했습니다.';
        else if (res.memoryOnly) saveNote = '브라우저 저장소를 쓸 수 없어 이 기록은 화면을 닫으면 사라집니다.';
      } else {
        toast('기록을 저장하지 못했습니다 (저장 공간 부족). 설정 > 데이터 내보내기로 백업 후 오래된 기록을 지워 주세요.', {
          type: 'error',
          duration: 8000,
        });
        downloadJSON({ app: 'running-master-ultimate', version: APP_INFO.version, runs: [{ ...record, route: session.getCompactRoute() }] }, `run-${record.id}.json`);
      }
    }
    this.activeStore.clear();
    this._tick(true, session);
    this.session = null;

    this.voice.speak(
      `러닝을 종료합니다. 거리 ${distanceToSpeech(record.distanceM)}, 시간 ${formatDurationWords(record.durationMs)}` +
        (record.avgPaceSec ? `, 평균 페이스 ${paceToSpeech(record.avgPaceSec)}.` : '.'),
    );
    if (saved) {
      this.detail.open(record.id, { justFinished: true, saveNote });
      toast('기록을 저장했습니다.', { type: 'success' });
    } else if (!save) {
      toast('기록을 저장하지 않고 종료했습니다.');
    }
  }

  async deleteRun(id) {
    const ok = await confirmDialog({
      title: '이 기록을 삭제할까요?',
      message: '삭제한 기록은 되돌릴 수 없습니다.',
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    if (this.repo.delete(id)) {
      this.detail.close();
      toast('기록을 삭제했습니다.');
    } else {
      toast('기록을 삭제하지 못했습니다.', { type: 'error' });
    }
  }

  async editTargetPace() {
    const s = this.settings.get();
    const sec = await paceDialog({ title: '목표 페이스', initialSec: s.coach.targetPaceSec });
    if (sec === null || sec === undefined) return;
    const r = this.settings.set('coach.targetPaceSec', sec);
    if (r.ok) toast(`목표 페이스를 ${formatPace(sec)}/km 로 바꿨습니다.`, { type: 'success' });
  }

  async editMonthlyGoal() {
    const s = this.settings.get();
    const v = await numberDialog({ title: '월간 목표 거리', initial: s.user.monthlyGoalKm, unit: 'km', min: 1, max: 2000 });
    if (v === null || v === undefined) return;
    const r = this.settings.set('user.monthlyGoalKm', Math.round(v));
    if (r.ok) toast(`월간 목표를 ${r.value}km 로 바꿨습니다.`, { type: 'success' });
  }

  async showGpsInfo() {
    const st = this.gps.status;
    if (!this.gps.watching && !['denied', 'insecure', 'unsupported'].includes(st.state)) {
      this._ensureProvider();
      if (this.gps.start()) toast('GPS를 켜는 중입니다.');
      return;
    }
    const acc = Number.isFinite(st.accuracy) ? `현재 정확도 ±${Math.round(st.accuracy)}m. ` : '';
    const limit = this.settings.get().gps.maxAccuracyM;
    const tips = {
      denied: '주소창 왼쪽의 사이트 정보 아이콘 → 위치 → 허용으로 바꾼 뒤 새로고침하세요.',
      insecure: '휴대폰에서는 HTTPS 주소로 접속해야 GPS를 쓸 수 있습니다. README 의 "휴대폰에서 실행하기"를 참고하세요.',
      unsupported: '이 브라우저는 위치 정보를 지원하지 않습니다. 최신 Chrome 을 사용하세요.',
      lost: '건물 안이나 터널에서는 신호가 약합니다. 신호가 돌아오면 자동으로 이어서 기록합니다.',
      poor: '하늘이 트인 곳에서 잠시 기다리면 정확도가 좋아집니다.',
      searching: '처음 위치를 잡는 데 10~30초 걸릴 수 있습니다.',
    };
    await openDialog({
      title: this.gps.isSimulation ? 'GPS 시뮬레이션' : 'GPS 상태',
      message: `${st.message ? `${st.message} ` : ''}${acc}거리 계산에는 정확도 ±${limit}m 이내의 위치만 사용합니다. ${tips[st.state] || ''}`,
      actions: [{ id: 'ok', label: '확인', variant: 'primary' }],
    });
  }

  // ───────────────────────────── 이벤트 처리 ─────────────────────────────

  _onPosition(pos) {
    this.map?.setCurrentPosition(pos.lat, pos.lng, pos.accuracy);
    if (this.session?.isActive) {
      this.session.handlePosition(pos);
      this._tick(false);
    }
  }

  _onGpsStatus(st) {
    this.runScreen.renderGps(st, { simulated: this.gps.isSimulation });
    if (this.session?.state === 'running' && st.state === 'lost') {
      toast('GPS 신호가 끊겼습니다. 시간은 계속 기록되고, 신호가 돌아오면 거리도 이어서 기록합니다.', { type: 'warn', duration: 5000 });
    }
  }

  _onGpsError(err) {
    if (err.code === 'denied') {
      toast(
        this.session?.isActive
          ? '위치 권한이 거부되어 거리 없이 시간만 기록합니다.'
          : '위치 권한이 거부되었습니다. GPS 표시를 눌러 해결 방법을 확인하세요.',
        { type: 'error', duration: 6000 },
      );
    } else if (err.code === 'insecure') {
      toast(err.message, { type: 'error', duration: 6000 });
    } else if (err.code === 'unsupported') {
      toast(err.message, { type: 'error' });
    }
  }

  _onRunState(state, pauseReason) {
    const prev = this.prevRun;
    this.runScreen.renderState(state, pauseReason);
    this.controls.setState(state, pauseReason);
    // 시뮬레이터는 수동 일시정지 때만 멈춤 (자동 일시정지는 '멈춘 결과'이므로 시나리오는 계속 진행)
    this.gps.setRunActive(state === 'running' || (state === 'paused' && pauseReason === 'auto'));
    const now = Date.now();

    if (state === 'paused') {
      this.coach.suspend();
      if (pauseReason === 'auto' && prev.state === 'running') {
        this.vibration.play('pause');
        this.voice.speak('자동 일시정지');
        toast('멈춘 것을 감지해 자동으로 일시정지했습니다. 다시 달리면 자동으로 재개합니다.');
      }
    } else if (state === 'running' && prev.state === 'paused') {
      this.coach.resume(now);
      if (prev.pauseReason === 'auto') {
        this.vibration.play('start');
        this.voice.speak('다시 시작합니다.');
      }
    }
    this.prevRun = { state, pauseReason };
    if (state === 'running' || state === 'paused') this._persistActive();
  }

  _onLap(lap) {
    if (!this.session) return;
    this.runScreen.renderLaps(this.session.laps.laps, this._coachTarget());
    const s = this.settings.get();
    this.vibration.play('lap');
    if (s.run.lapVoice && lap.type !== 'final') {
      const head = lap.type === 'auto' ? distanceToSpeech(lap.endDistanceM) : `랩 ${lap.index}`;
      this.voice.speak(`${head}. 랩 페이스 ${paceToSpeech(lap.paceSec)}.`);
    }
  }

  _onCoachVisual(alert) {
    if (alert.type === 'recovered') return;
    this.runScreen.flashCoach(alert.type);
    if (this.router.current !== 'run') toast(alertSpeech(alert), { type: 'warn' });
  }

  _onScreenChange(name) {
    this.map?.setVisible(name === 'run');
    this.history.setVisible(name === 'history');
    this.stats.setVisible(name === 'stats');
    this.settingsScreen.setVisible(name === 'settings');
  }

  _onThemeChange(dark) {
    this.map?.setDark(dark);
    this.detail?.setDark(dark);
    this.stats?.redrawChart();
  }

  _onVisibility() {
    if (document.visibilityState === 'hidden') {
      this._persistNow();
      // 러닝 중이 아니면 배터리 절약을 위해 GPS 끄기
      if (!this.session?.isActive) this.gps.stop();
    } else {
      if (this.session?.isActive) {
        if (!this.gps.watching) this.gps.start();
        this._tick(true);
      } else {
        this._prewarmGps();
      }
    }
  }

  // ───────────────────────────── 설정 반영 ─────────────────────────────

  _applySettings(s, change = { path: '*' }) {
    const path = change.path;
    this.coach.configure(this._coachOptions(s));
    this.vibration.setEnabled(s.coach.vibration);
    this.voice.setEnabled(s.coach.voice);
    this.gps.setMaxAccuracy(s.gps.maxAccuracyM);
    this.session?.applySettings(s);

    if (path === 'display.theme' || path === '*') this.theme.setMode(s.display.theme);
    if ((path === 'display.keepAwake' || path === '*') && this.session?.isActive) {
      if (s.display.keepAwake) this.wakeLock.enable();
      else this.wakeLock.disable();
    }
    if (['gps.simulation', 'gps.simScenario', '*'].includes(path)) {
      if (this.session?.isActive) {
        if (path === 'gps.simulation') toast('러닝 중에는 GPS 방식을 바꿀 수 없습니다. 다음 러닝부터 적용됩니다.');
      } else {
        this._ensureProvider();
      }
    }
    if (path === 'run.autoLapKm' && this.session?.isActive) {
      toast('자동 랩 거리는 다음 랩부터 적용됩니다.');
    }
    this._renderEnvBanner();
  }

  _coachOptions(s) {
    return {
      enabled: s.coach.enabled,
      targetPaceSec: s.coach.targetPaceSec,
      toleranceSec: s.coach.toleranceSec,
      cooldownMs: s.coach.cooldownSec * 1000,
      // 코치 판단 구간이 실제 달린 데이터로 채워질 때까지(출발 가속 포함) 기다린 뒤 판단
      graceMs: Math.max(COACH_CONFIG.graceMs, Math.max(PACE_CONFIG.coachWindowMs, s.run.paceWindowSec * 1000) + 10000),
      resumeGraceMs: COACH_CONFIG.graceMs,
      alertFast: s.coach.alertFast,
      repeatWhileOff: s.coach.repeatWhileOff,
    };
  }

  _coachTarget() {
    const c = this.settings.get().coach;
    return { targetSec: c.targetPaceSec, toleranceSec: c.toleranceSec };
  }

  _createProvider(s) {
    if (s.gps.simulation) {
      return new SimulatedGeolocationProvider({
        scenario: s.gps.simScenario,
        // 코치 데모는 목표 페이스 기준으로 빨라졌다 느려졌다 함
        getBasePaceSec: () => {
          const cur = this.settings.get();
          return cur.gps.simScenario === 'steady' ? cur.gps.simPaceSec : cur.coach.targetPaceSec;
        },
      });
    }
    return new BrowserGeolocationProvider();
  }

  /** 설정과 현재 Provider 종류가 다르면 교체 (러닝 중에는 교체하지 않음) */
  _ensureProvider() {
    if (this.session?.isActive) return;
    const s = this.settings.get();
    const wantSim = !!s.gps.simulation;
    if (wantSim !== this.gps.isSimulation) {
      this.gps.setProvider(this._createProvider(s));
      this.runScreen?.renderGps(this.gps.status, { simulated: this.gps.isSimulation });
    } else if (wantSim) {
      this.gps.provider.setScenario?.(s.gps.simScenario);
    }
  }

  async _prewarmGps() {
    if (this.gps.watching) return;
    if (this.gps.isSimulation) {
      this.gps.start();
      return;
    }
    if (this.gps.preflight()) {
      this.runScreen.renderGps(
        { state: this.caps.geolocation ? 'insecure' : 'unsupported', accuracy: null, message: this.gps.preflight().message },
        { simulated: false },
      );
      return;
    }
    // 이미 권한이 있으면 미리 위치를 잡아 둠 (시작 즉시 정확한 거리 측정)
    const perm = await queryGeolocationPermission();
    if (perm === 'granted') this.gps.start();
    else if (perm === 'denied') {
      this.runScreen.renderGps({ state: 'denied', accuracy: null, message: '위치 권한이 거부되어 있습니다.' });
    }
  }

  _renderEnvBanner() {
    const banner = $('#envBanner');
    if (!banner) return;
    const s = this.settings.get();
    let text = '';
    if (s.gps.simulation) {
      text = '시뮬레이션 모드입니다. 실제 GPS 대신 가상의 러너가 움직입니다. 설정의 GPS 항목에서 끌 수 있습니다.';
    } else if (!this.caps.secureContext) {
      text = '이 주소(http)에서는 GPS를 쓸 수 없습니다. localhost 또는 HTTPS 로 접속하거나, 설정에서 시뮬레이션 모드를 켜세요.';
    }
    setText(banner, text);
    setHidden(banner, !text);
  }

  // ───────────────────────────── 주기 갱신 & 백업 ─────────────────────────────

  _startTicker() {
    this._stopTicker();
    this.tickTimer = setInterval(() => this._tick(true), UI_CONFIG.tickMs);
  }

  _stopTicker() {
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  /** 지표 계산 → 화면 → 코치. force=false 면 300ms 안의 중복 호출 생략 */
  _tick(force = false, session = this.session) {
    if (!session) return;
    const now = Date.now();
    if (!force && now - this.lastTickAt < 300) return;
    this.lastTickAt = now;
    let m;
    try {
      m = session.getMetrics(now);
    } catch (err) {
      console.error('[App] 지표 계산 오류', err);
      return;
    }
    this.runScreen.renderMetrics(m);
    // 코치: 안정적인 30초 페이스로 판단하고, 최근 페이스로 한 번 더 확인
    if (m.state === 'running') this.coach.update(m.coachPaceSec, now, m.currentPaceSec);
    if (session.isActive && now - this.lastBackupAt >= STORAGE_CONFIG.activeSaveIntervalMs) this._persistActive();
  }

  _persistActive() {
    if (!this.session?.isActive) return;
    const now = Date.now();
    this.lastBackupAt = now;
    try {
      const snapshot = this.session.serialize(now);
      snapshot.coach = { stats: this.coach.getStats() };
      const r = this.activeStore.save(snapshot);
      if (!r.ok && !this.backupWarned) {
        this.backupWarned = true;
        console.warn('[App] 진행 중 러닝 백업 실패:', r.error);
      }
    } catch (err) {
      console.error('[App] 백업 오류', err);
    }
  }

  _persistNow() {
    this.settings.flush();
    this._persistActive();
  }

  async _checkRecovery() {
    const data = this.activeStore.load();
    if (!data) return;
    const dist = formatDistanceKm(data.distance?.totalM || 0);
    const time = formatDuration(data.timer?.elapsedMs || 0);
    const choice = await choiceDialog({
      title: '진행 중이던 러닝이 있습니다',
      message: `${formatDate(data.startedAt)} ${formatTime(data.startedAt)}에 시작한 러닝(${dist} km, ${time})이 저장되지 않았습니다.`,
      choices: [
        { id: 'discard', label: '삭제', variant: 'ghost' },
        { id: 'save', label: '저장하고 끝내기', variant: 'ghost' },
        { id: 'resume', label: '이어서 달리기', variant: 'primary' },
      ],
      dismissible: false,
    });

    if (choice === 'resume') {
      try {
        const s = this.settings.get();
        this.session = RunSession.restore(data, { bus: this.bus, settings: s });
        const now = Date.now();
        this.coach.start(now);
        this.coach.restoreStats(data.coach?.stats);
        this.map?.loadSegments(this.session.route.getSegments());
        this.runScreen.renderLaps(this.session.laps.laps, this._coachTarget());
        this.prevRun = { state: 'running', pauseReason: null };
        this._onRunState('paused', 'manual');
        this._startTicker();
        this._tick(true);
        toast('일시정지 상태로 복구했습니다. 재개를 누르면 이어서 기록합니다.', { type: 'success', duration: 5000 });
      } catch (err) {
        console.error('[App] 복구 실패', err);
        this.session = null;
        this.activeStore.clear();
        toast('이전 러닝을 복구하지 못했습니다.', { type: 'error' });
      }
    } else if (choice === 'save') {
      try {
        const s = this.settings.get();
        const session = RunSession.restore(data, { bus: { emit() {} }, settings: s });
        const record = session.finish();
        if (data.coach?.stats) record.coach = data.coach.stats;
        const res = this.repo.save(record, session.getCompactRoute());
        toast(res.ok ? '이전 러닝을 기록에 저장했습니다.' : '이전 러닝을 저장하지 못했습니다.', { type: res.ok ? 'success' : 'error' });
      } catch (err) {
        console.error('[App] 복구 저장 실패', err);
      }
      this.activeStore.clear();
    } else {
      this.activeStore.clear();
    }
  }

  // ───────────────────────────── 설정 화면 동작 ─────────────────────────────

  _settingsActions() {
    return {
      testVibration: () => {
        const ok = this.vibration.play('test', { force: true });
        toast(ok ? '진동을 보냈습니다. 느껴지지 않으면 휴대폰의 진동 설정을 확인하세요.' : '이 기기/브라우저는 진동을 지원하지 않습니다. (iPhone 과 PC 브라우저는 미지원)', {
          type: ok ? 'success' : 'warn',
        });
      },
      testVoice: () => {
        this.voice.unlock();
        const ok = this.voice.speak('페이스를 조금 올리세요.', { force: true, interrupt: true });
        if (!ok) toast('이 브라우저는 음성 안내를 지원하지 않습니다.', { type: 'warn' });
      },
      checkLocation: async () => {
        this._ensureProvider();
        try {
          const pos = await this.gps.requestCurrent();
          toast(`현재 위치를 확인했습니다. 정확도 ±${Math.round(pos.accuracy || 0)}m`, { type: 'success' });
          this.gps.start();
        } catch (err) {
          toast(err?.message || '현재 위치를 확인하지 못했습니다.', { type: 'error' });
        }
      },
      exportData: () => {
        try {
          downloadJSON(buildBackup(this.repo, this.settings), backupFilename());
          toast('백업 파일을 내려받았습니다.', { type: 'success' });
        } catch (err) {
          console.error(err);
          toast('백업 파일을 만들지 못했습니다.', { type: 'error' });
        }
      },
      importClick: () => $('#importFile')?.click(),
      importFile: async (file) => {
        try {
          const { settings, runs } = await readBackupFile(file);
          const res = this.repo.importRecords(runs);
          if (settings && (await confirmDialog({ title: '설정도 가져올까요?', message: '백업 파일의 설정으로 현재 설정을 바꿉니다.', confirmText: '가져오기' }))) {
            this.settings.replaceAll(settings);
          }
          toast(
            `기록 ${res.added}개를 가져왔습니다.${res.skipped ? ` 이미 있는 ${res.skipped}개는 건너뛰었습니다.` : ''}${res.failed ? ` ${res.failed}개는 저장 공간 부족으로 실패했습니다.` : ''}`,
            { type: res.failed ? 'warn' : 'success', duration: 5000 },
          );
          this.settingsScreen.renderDiagnostics();
        } catch (err) {
          toast(err?.message || '백업 파일을 읽지 못했습니다.', { type: 'error' });
        }
      },
      clearData: async () => {
        const n = this.repo.list().length;
        if (!n) {
          toast('삭제할 기록이 없습니다.');
          return;
        }
        const ok = await confirmDialog({
          title: `기록 ${n}개를 모두 삭제할까요?`,
          message: '삭제한 기록은 되돌릴 수 없습니다. 필요하면 먼저 백업 파일을 내려받으세요.',
          confirmText: '모두 삭제',
          danger: true,
        });
        if (!ok) return;
        this.repo.clearAll();
        this.settingsScreen.renderDiagnostics();
        toast('모든 기록을 삭제했습니다.');
      },
      resetSettings: async () => {
        const ok = await confirmDialog({ title: '설정을 기본값으로 되돌릴까요?', message: '기록은 지워지지 않습니다.', confirmText: '되돌리기' });
        if (ok) {
          this.settings.reset();
          toast('설정을 기본값으로 되돌렸습니다.');
        }
      },
    };
  }

  getDiagnostics() {
    const c = this.caps;
    const runs = this.repo.list().length;
    const kb = Math.round(this.storage.usageBytes() / 1024);
    return {
      items: [
        { label: '보안 연결 (HTTPS·localhost)', ok: c.secureContext, value: c.secureContext ? '예' : '아니요, GPS 사용 불가' },
        { label: 'GPS (위치 정보)', ok: c.geolocation, value: c.geolocation ? (this.gps.isSimulation ? '시뮬레이션 사용 중' : '지원') : '미지원' },
        { label: '진동', ok: this.vibration.supported, value: this.vibration.supported ? '지원' : '미지원, 화면·음성으로 안내' },
        { label: '음성 안내', ok: this.voice.supported, value: this.voice.supported ? '지원' : '미지원' },
        { label: '화면 꺼짐 방지', ok: this.wakeLock.supported, value: this.wakeLock.supported ? '지원' : '미지원, 화면 자동 꺼짐 시간을 늘려 주세요' },
        { label: '기록 저장소', ok: this.storage.available, value: this.storage.available ? 'localStorage' : '임시 메모리 (새로고침 시 삭제)' },
      ],
      storage: `기록 ${runs}개, 약 ${kb.toLocaleString('ko-KR')}KB 사용 중`,
    };
  }
}
