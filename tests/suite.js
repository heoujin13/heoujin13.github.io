/**
 * Running Master Ultimate 4.0 — 테스트 모음
 *
 * 브라우저(tests/run-tests.html)와 Node(tests/run-tests.mjs) 양쪽에서 실행됩니다.
 * DOM 이 필요 없는 핵심 로직(페이스 코치, GPS 필터, 거리/시간/페이스, 랩, Auto Pause, 저장소)을 검증합니다.
 */
import { CoachNotifier } from '../src/coach/coachNotifier.js';
import { PaceCoach } from '../src/coach/paceCoach.js';
import { formatDistanceKm, formatDuration, formatPace, parsePace } from '../src/core/format.js';
import { haversineM, offsetLatLng, simplifyPath } from '../src/core/geo.js';
import { GpsFilter } from '../src/gps/gpsFilter.js';
import { AutoPauseDetector } from '../src/running/autoPause.js';
import { calculateCalories } from '../src/running/calorieCalculator.js';
import { DistanceTracker } from '../src/running/distanceTracker.js';
import { LapManager } from '../src/running/lapManager.js';
import { PaceCalculator } from '../src/running/paceCalculator.js';
import { RunSession } from '../src/running/runSession.js';
import { RunTimer } from '../src/running/runTimer.js';
import { RunRepository } from '../src/storage/runRepository.js';
import { SafeStorage } from '../src/storage/safeStorage.js';
import { DEFAULT_SETTINGS, sanitizeSettings, validateSetting } from '../src/storage/settingsStore.js';
import { VibrationManager } from '../src/vibration/vibrationManager.js';
import { VoiceManager } from '../src/voice/voiceManager.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg} — 기대값: ${JSON.stringify(expected)}, 실제값: ${JSON.stringify(actual)}`);
}
function near(actual, expected, tol, msg) {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg} — 기대값: ${expected}±${tol}, 실제값: ${actual}`);
}

/** 재현 가능한 난수 */
function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ORIGIN = { lat: 37.5268, lng: 126.9325 };

/** 북쪽으로 일정 속도로 달리는 가상의 GPS */
function straightRun({ speedMps, seconds, startT = 0, startM = 0, accuracy = 5, noiseM = 0, seed = 1 }) {
  const rand = rng(seed);
  const out = [];
  for (let i = 1; i <= seconds; i++) {
    const d = startM + speedMps * i;
    const p = offsetLatLng(ORIGIN, (rand() - 0.5) * 2 * noiseM, d + (rand() - 0.5) * 2 * noiseM);
    out.push({ lat: p.lat, lng: p.lng, accuracy, speed: speedMps, t: startT + i * 1000 });
  }
  return out;
}

function makeCoach(opts = {}) {
  const coach = new PaceCoach({
    targetPaceSec: 330,
    toleranceSec: 8,
    cooldownMs: 25000,
    confirmMs: 3000,
    graceMs: 0,
    resumeGraceMs: 0,
    ...opts,
  });
  const alerts = [];
  const recovered = [];
  coach.on('alert', (a) => alerts.push(a));
  coach.on('recovered', (e) => recovered.push(e));
  let t = 0;
  coach.start(t);
  const feed = (pace, seconds) => {
    for (let i = 0; i < seconds; i++) {
      t += 1000;
      coach.update(pace, t);
    }
  };
  return { coach, alerts, recovered, feed, now: () => t };
}

// ═════════════════════════ 페이스 코치 ═════════════════════════

test('코치: 요구사항 7번 예시 (목표 5:30, ±8초)', () => {
  const { coach, alerts, recovered, feed } = makeCoach();
  feed(325, 5); // 1. 5:25
  eq(coach.zone, 'on', '5:25 는 정상');
  feed(332, 5); // 2. 5:32
  eq(coach.zone, 'on', '5:32 는 정상');
  eq(alerts.length, 0, '정상 구간에서는 알림 없음');

  feed(339, 5); // 3. 5:39 → 조금 느림 → 진동
  eq(coach.zone, 'slow', '5:39 는 느림');
  eq(alerts.length, 1, '5:39 에서 알림 1회');
  eq(alerts[0].type, 'slow', '알림 종류');
  eq(alerts[0].severity, 'mild', '조금 느림');

  feed(342, 10); // 4. 5:42 → 같은 알림 반복 안 함
  eq(alerts.length, 1, '느림 상태가 이어져도 반복 알림 없음');

  feed(330, 5); // 5. 5:30 → 정상 복귀
  eq(coach.zone, 'on', '5:30 정상 복귀');
  eq(recovered.length, 1, '복귀 이벤트');

  feed(340, 30); // 6. 다시 5:40 → 다시 진동
  eq(alerts.length, 2, '복귀 후 다시 벗어나면 다시 알림');
  assert(alerts[1].at - alerts[0].at >= 25000, '같은 종류 알림 사이 쿨다운(25초) 유지');
});

test('코치: 요구사항 7번 예시 — 앱 기본 설정(판정 확정 5초)으로도 동일', () => {
  const coach = new PaceCoach({ targetPaceSec: 330, toleranceSec: 8, cooldownMs: 25000, graceMs: 0, resumeGraceMs: 0 });
  const alerts = [];
  coach.on('alert', (a) => alerts.push(a));
  let t = 0;
  coach.start(0);
  const feed = (pace, sec) => {
    for (let i = 0; i < sec; i++) coach.update(pace, (t += 1000));
  };
  feed(325, 8);
  feed(332, 8);
  eq(alerts.length, 0, '5:25, 5:32 정상');
  feed(339, 8);
  eq(alerts.length, 1, '5:39 진동');
  feed(342, 10);
  eq(alerts.length, 1, '5:42 반복 안 함');
  feed(330, 8);
  eq(coach.zone, 'on', '5:30 복귀');
  feed(340, 30);
  eq(alerts.length, 2, '다시 5:40 → 다시 진동');
});

test('코치: 이미 목표로 돌아왔으면 늦은 알림을 울리지 않음', () => {
  const { alerts, feed, coach, now } = makeCoach();
  feed(330, 5);
  let t = now();
  // 긴 구간 페이스는 아직 느리지만, 최근 페이스는 이미 목표 범위
  for (let i = 0; i < 20; i++) coach.update(350, (t += 1000), 332);
  eq(alerts.length, 0, '최근 페이스가 정상이면 보류');
  for (let i = 0; i < 3; i++) coach.update(350, (t += 1000), 352);
  eq(alerts.length, 1, '최근 페이스도 느리면 알림');
});

test('코치: 경계값 포함 (5:22~5:38 은 목표 유지)', () => {
  const coach = new PaceCoach({ targetPaceSec: 330, toleranceSec: 8 });
  eq(coach.classify(322), 'on', '5:22');
  eq(coach.classify(338), 'on', '5:38');
  eq(coach.classify(339), 'slow', '5:39');
  eq(coach.classify(321), 'fast', '5:21');
  eq(coach.classify(338.4), 'on', '화면 표시(5:38)와 같은 판정');
  eq(coach.classify(345), 'slow', '5:45 느림');
  eq(coach.classify(310), 'fast', '5:10 빠름');
});

test('코치: GPS 순간 튐(2초)으로는 알림이 울리지 않음', () => {
  const { alerts, feed } = makeCoach();
  feed(330, 5);
  for (let k = 0; k < 6; k++) {
    feed(370, 2); // 2초짜리 튐
    feed(331, 4);
  }
  eq(alerts.length, 0, '확정 시간(3초) 미만의 이탈은 무시');
});

test('코치: 쿨다운 — 계속 느리면 25초마다 한 번만', () => {
  const { alerts, feed } = makeCoach();
  feed(330, 5);
  feed(360, 60);
  eq(alerts.length, 3, '60초 동안 3회 (즉시, +25초, +50초)');
  for (let i = 1; i < alerts.length; i++) {
    assert(alerts[i].at - alerts[i - 1].at >= 25000, '간격 25초 이상');
    eq(alerts[i].reminder, true, '반복 알림 표시');
  }
});

test('코치: "계속 벗어나 있으면 다시 알림" 끄기', () => {
  const { alerts, feed } = makeCoach({ repeatWhileOff: false });
  feed(330, 5);
  feed(360, 90);
  eq(alerts.length, 1, '복귀 전까지 1회만');
});

test('코치: 빠름 알림과 끄기 옵션', () => {
  const a = makeCoach();
  a.feed(330, 5);
  a.feed(310, 6);
  eq(a.alerts.length, 1, '빠름 알림');
  eq(a.alerts[0].type, 'fast', '종류 fast');

  const b = makeCoach({ alertFast: false });
  b.feed(330, 5);
  b.feed(310, 30);
  eq(b.coach.zone, 'fast', '화면에는 빠름 표시');
  eq(b.alerts.length, 0, '빠름 알림 꺼짐');
});

test('코치: 많이 느리면 strong', () => {
  const { alerts, feed } = makeCoach();
  feed(330, 5);
  feed(360, 5); // +30초 > 16초
  eq(alerts[0].severity, 'strong', '허용오차 2배 초과 → strong');
});

test('코치: 시작 직후 유예 시간에는 알림 없음', () => {
  const { coach, alerts, feed } = makeCoach({ graceMs: 15000 });
  feed(400, 14);
  eq(alerts.length, 0, '유예 중 알림 없음');
  eq(coach.zone, 'waiting', '유예 중에는 측정 중');
  feed(400, 6);
  eq(alerts.length, 1, '유예 후 알림');
});

test('코치: 재개 직후 유예 시간 적용', () => {
  const { coach, alerts, feed, now } = makeCoach({ resumeGraceMs: 15000 });
  feed(330, 5);
  coach.suspend();
  coach.resume(now());
  feed(400, 14);
  eq(alerts.length, 0, '재개 후 15초 동안 알림 없음');
  feed(400, 5);
  eq(alerts.length, 1, '유예 후 알림');
});

test('코치: 일시정지 중에는 알림 없음, 재개 후 다시 판단', () => {
  const { coach, alerts, feed, now } = makeCoach();
  feed(330, 5);
  coach.suspend();
  feed(400, 30);
  eq(alerts.length, 0, '일시정지 중 알림 없음');
  eq(coach.zone, 'paused', '일시정지 표시');
  coach.resume(now());
  feed(400, 5);
  eq(alerts.length, 1, '재개 후 알림');
});

test('코치: 목표 페이스 변경 즉시 반영', () => {
  const { coach, alerts, feed } = makeCoach();
  feed(360, 5);
  eq(alerts.length, 1, '목표 5:30 에서 6:00 은 느림');
  coach.configure({ targetPaceSec: 360 });
  feed(360, 10);
  eq(coach.zone, 'on', '목표 6:00 으로 바꾸면 목표 유지');
});

test('코치 → 진동/음성 전달 (CoachNotifier)', () => {
  const patterns = [];
  const spoken = [];
  const vibration = new VibrationManager({ driver: { supported: true, vibrate: (p) => (patterns.push(p), true), cancel() {} } });
  const voice = new VoiceManager({ driver: { supported: true, speak: (t) => (spoken.push(t), true), cancel() {} } });
  const { feed } = (() => {
    const c = makeCoach();
    new CoachNotifier({ coach: c.coach, vibration, voice, getSettings: () => ({ vibration: true, voice: true, voiceRecovered: true }) });
    return c;
  })();
  feed(330, 5);
  feed(345, 5);
  eq(patterns.length, 1, '진동 1회');
  eq(JSON.stringify(patterns[0]), JSON.stringify([260, 120, 260]), '느림 진동 패턴');
  eq(spoken[0], '페이스를 조금 올리세요.', '느림 음성');
  feed(330, 5);
  eq(spoken[1], '좋아요. 목표 페이스입니다.', '복귀 음성');
});

test('진동/음성 미지원 환경에서도 오류 없음', () => {
  const v = new VibrationManager({ driver: { supported: false, vibrate() { throw new Error('호출되면 안 됨'); }, cancel() {} } });
  eq(v.play('slow'), false, '미지원 → false');
  const broken = new VibrationManager({ driver: { supported: true, vibrate() { return false; }, cancel() {} } });
  eq(broken.play('slow'), false, '거부 → false');
  const voice = new VoiceManager({ driver: { supported: false, speak() { throw new Error('x'); }, cancel() {} } });
  eq(voice.speak('테스트'), false, '음성 미지원 → false');
  const defaultV = new VibrationManager(); // Node 에는 navigator.vibrate 가 없음
  eq(typeof defaultV.play('slow'), 'boolean', '기본 드라이버도 안전');
});

// ═════════════════════════ 형식 ═════════════════════════

test('페이스 입력 파싱', () => {
  eq(parsePace('5:30').sec, 330, '5:30');
  eq(parsePace(" 5'30 ").sec, 330, "5'30");
  eq(parsePace('5.30').sec, 330, '5.30');
  eq(parsePace('530').sec, 330, '530');
  eq(parsePace('5분 30초').sec, 330, '5분 30초');
  eq(parsePace('6분').sec, 360, '6분');
  eq(parsePace('5:30/km').sec, 330, '/km 포함');
  eq(parsePace('5:75').ok, false, '초 60 이상');
  eq(parsePace('abc').ok, false, '문자');
  eq(parsePace('').ok, false, '빈 값');
  eq(parsePace('1:00').ok, false, '범위 밖 (너무 빠름)');
  eq(parsePace('20:00').ok, false, '범위 밖 (너무 느림)');
});

test('표시 형식', () => {
  eq(formatPace(330), '5:30', '페이스');
  eq(formatPace(329.6), '5:30', '반올림');
  eq(formatPace(359.6), '6:00', '59.6초 → 다음 분');
  eq(formatPace(null), '--:--', '없음');
  eq(formatPace(330, { unit: true }), '5:30/km', '단위');
  eq(formatDuration(65000), '01:05', '시간');
  eq(formatDuration(3725000), '1:02:05', '시간(시)');
  eq(formatDistanceKm(999), '0.99', '거리는 내림');
  eq(formatDistanceKm(5234), '5.23', '거리');
});

// ═════════════════════════ GPS 필터 / 거리 ═════════════════════════

test('GPS 필터: 순간 튐(200m) 제거', () => {
  const filter = new GpsFilter();
  const dist = new DistanceTracker();
  const pts = straightRun({ speedMps: 3, seconds: 60 });
  const jump = offsetLatLng(pts[29], 200, 0);
  pts[30] = { ...pts[30], lat: jump.lat, lng: jump.lng };
  let spikes = 0;
  for (const p of pts) {
    const r = filter.process(p);
    if (r.reason === 'spike') spikes += 1;
    if (r.accepted) dist.addPoint(r.point, r.segmentStart);
  }
  eq(spikes, 1, '튐 1회 감지');
  near(dist.meters, 177, 10, '튐 없이 약 180m (칼만 지연 포함)');
});

test('GPS 필터: 정지 중 좌표 흔들림은 거리로 쌓이지 않음', () => {
  const filter = new GpsFilter();
  const dist = new DistanceTracker();
  const pts = straightRun({ speedMps: 0, seconds: 120, noiseM: 3, seed: 7 });
  for (const p of pts) {
    const r = filter.process(p);
    if (r.accepted) dist.addPoint(r.point, r.segmentStart);
  }
  assert(dist.meters < 8, `2분 정지 동안 거리 ${dist.meters.toFixed(1)}m (8m 미만이어야 함)`);
});

test('GPS 필터: 정확도 낮은 위치 제외', () => {
  const filter = new GpsFilter({ maxAccuracyM: 30 });
  const r = filter.process({ lat: 37.5, lng: 127, accuracy: 80, t: 1000 });
  eq(r.accepted, false, '정확도 80m 제외');
  eq(r.reason, 'low_accuracy', '사유');
  eq(filter.process({ lat: NaN, lng: 127, accuracy: 5, t: 2000 }).reason, 'invalid', '잘못된 좌표');
});

test('GPS 필터: 잘못된 첫 위치에 고착되지 않음 (기준점 재설정)', () => {
  const filter = new GpsFilter();
  const dist = new DistanceTracker();
  const bad = offsetLatLng(ORIGIN, 500, 0);
  const pts = [{ lat: bad.lat, lng: bad.lng, accuracy: 6, t: 0 }, ...straightRun({ speedMps: 3, seconds: 60 })];
  for (const p of pts) {
    const r = filter.process(p);
    if (r.accepted) dist.addPoint(r.point, r.segmentStart);
  }
  assert(dist.meters < 200, `500m 떨어진 첫 위치의 거리가 더해지지 않아야 함 (${dist.meters.toFixed(0)}m)`);
  assert(dist.meters > 120, `이후 실제 이동은 기록되어야 함 (${dist.meters.toFixed(0)}m)`);
});

test('거리: 1km 직선 (잡음 ±3m) 오차 3% 이내', () => {
  const filter = new GpsFilter();
  const dist = new DistanceTracker();
  const pts = straightRun({ speedMps: 3, seconds: 334, noiseM: 3, seed: 3 });
  for (const p of pts) {
    const r = filter.process(p);
    if (r.accepted) dist.addPoint(r.point, r.segmentStart);
  }
  const truth = 3 * 333;
  near(dist.meters, truth, truth * 0.03, '1km 거리');
});

// ═════════════════════════ 시간 / 페이스 / 랩 ═════════════════════════

test('시간: 일시정지 시간 제외', () => {
  const t = new RunTimer();
  t.start(0);
  t.pause(10000);
  t.resume(30000);
  eq(t.elapsedMs(40000), 20000, '달린 시간 20초');
  eq(t.pausedMs(40000), 20000, '일시정지 20초');
  t.pause(50000);
  eq(t.pause(55000), false, '중복 일시정지 무시');
  eq(t.elapsedMs(60000), 30000, '일시정지 중 시간 멈춤');
});

test('페이스: 3m/s → 5:33/km', () => {
  const pc = new PaceCalculator({ windowMs: 20000 });
  pc.addSample(0, 0);
  for (let i = 1; i <= 60; i++) pc.addSample(i * 1000, i * 3);
  const cur = pc.current(60000);
  near(cur.paceSec, 333.3, 1, '현재 페이스');
  near(PaceCalculator.average(180, 60000), 333.3, 1, '평균 페이스');
  eq(PaceCalculator.average(30, 60000), null, '거리가 짧으면 평균 페이스 없음');
});

test('페이스: 멈추면 현재 페이스가 사라짐', () => {
  const pc = new PaceCalculator({ windowMs: 20000 });
  pc.addSample(0, 0);
  for (let i = 1; i <= 30; i++) pc.addSample(i * 1000, i * 3);
  eq(pc.current(60000).paceSec, null, '30초 동안 위치 변화가 없으면 --:--');
});

test('랩: 1km 경계 시각 보간', () => {
  const laps = new LapManager({ autoLapM: 1000 });
  laps.update(0, 0);
  laps.update(299000, 995);
  const created = laps.update(301000, 1005);
  eq(created.length, 1, '자동 랩 1개');
  eq(created[0].distanceM, 1000, '랩 거리 1000m');
  eq(created[0].durationMs, 300000, '경계 시각 보간 (5:00)');
  eq(Math.round(created[0].paceSec), 300, '랩 페이스 5:00/km');
  const m = laps.manualLap(400000, 1300);
  eq(m.distanceM, 300, '수동 랩 거리');
  const next = laps.update(500000, 2010);
  eq(next.length, 1, '다음 자동 랩은 2km 지점');
  eq(next[0].endDistanceM, 2000, '2km');
});

test('칼로리: 체중 × 거리', () => {
  near(calculateCalories(10000, 70), 725.2, 0.5, '70kg 10km');
  eq(calculateCalories(0, 70), 0, '0km');
});

// ═════════════════════════ Auto Pause ═════════════════════════

test('Auto Pause: 정지 감지 → 이동 시 재개', () => {
  const ap = new AutoPauseDetector({ enabled: true });
  ap.reset(0);
  let decision = null;
  let t = 0;
  for (let i = 0; i < 10; i++) {
    t = 6000 + i * 1000;
    const r = ap.update({ ...ORIGIN, accuracy: 5, t, speed: 0 });
    if (r) decision = r;
  }
  eq(decision, 'pause', '정지 감지');
  const p1 = offsetLatLng(ORIGIN, 0, 15);
  eq(ap.update({ ...p1, accuracy: 5, t: t + 1000, speed: null }), null, '1회 이동으로는 재개 안 함');
  const p2 = offsetLatLng(ORIGIN, 0, 18);
  eq(ap.update({ ...p2, accuracy: 5, t: t + 2000, speed: null }), 'resume', '연속 2회 이동 → 재개');
});

test('Auto Pause: 정확도가 나쁘면 판단하지 않음 (GPS 오류 ≠ 정지)', () => {
  const ap = new AutoPauseDetector({ enabled: true });
  ap.reset(0);
  for (let i = 0; i < 20; i++) {
    eq(ap.update({ ...ORIGIN, accuracy: 40, t: 6000 + i * 1000 }), null, '판단 보류');
  }
});

// ═════════════════════════ 전체 흐름 ═════════════════════════

test('전체 흐름: GPS → 거리 → 페이스 → 코치 → 진동', () => {
  const bus = { events: [], emit(type, p) { this.events.push([type, p]); } };
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.run.autoPause = false;
  const session = new RunSession({ bus, settings, clock: () => 0 });
  // 앱과 같은 설정: 시작 유예 20초, 판정 확정 5초
  const coach = new PaceCoach({ targetPaceSec: 330, toleranceSec: 8, cooldownMs: 25000, graceMs: 20000 });
  const patterns = [];
  const vibration = new VibrationManager({ driver: { supported: true, vibrate: (p) => (patterns.push(p), true), cancel() {} } });
  const voice = new VoiceManager({ driver: { supported: false } });
  new CoachNotifier({ coach, vibration, voice, getSettings: () => ({ vibration: true, voice: false }) });

  session.start(0);
  coach.start(0);
  // 1분은 목표 페이스(3.03m/s), 다음 1분은 느리게(2.6m/s ≈ 6:25/km)
  const fast = straightRun({ speedMps: 1000 / 330, seconds: 60, noiseM: 1.5, seed: 11 });
  const slow = straightRun({ speedMps: 2.6, seconds: 60, startT: 60000, startM: (1000 / 330) * 60, noiseM: 1.5, seed: 12 });
  let firstAlertAt = null;
  for (const p of [...fast, ...slow]) {
    session.handlePosition(p);
    const m = session.getMetrics(p.t);
    const a = coach.update(m.coachPaceSec, p.t, m.currentPaceSec);
    if (a && a.type === 'slow' && firstAlertAt === null) firstAlertAt = p.t;
  }
  const m = session.getMetrics(120000);
  near(m.distanceM, 182 + 156, 15, '총 거리');
  eq(coach.stats.alerts.fast, 0, '목표 구간에서는 빠름 알림 없음');
  near(coach.stats.slowMs + coach.stats.onMs > 0 ? 1 : 0, 1, 0, '구간 체류 시간 집계');
  assert(firstAlertAt !== null && firstAlertAt > 60000, '느려진 뒤에 느림 알림');
  assert(firstAlertAt - 60000 < 30000, `느려진 뒤 30초 안에 알림 (${(firstAlertAt - 60000) / 1000}초)`);
  assert(patterns.length >= 1, '진동 드라이버까지 전달됨');
});

/** 목표 페이스로 꾸준히 달리는 10분 (GPS 위치 잡음 ±2m, 기기 속도 잡음 ±0.25m/s) */
function steadyCoachRun({ seconds = 600, stepAt = null, stepPace = 360, seed = 5 } = {}) {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.run.autoPause = false;
  const session = new RunSession({ bus: { emit() {} }, settings, clock: () => 0 });
  const coach = new PaceCoach({ targetPaceSec: 330, toleranceSec: 8, cooldownMs: 25000, graceMs: 20000 });
  const alerts = [];
  coach.on('alert', (a) => alerts.push(a));
  session.start(0);
  coach.start(0);
  const rand = rng(seed);
  const g = () => {
    let u = 0;
    let v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  let d = 0;
  for (let i = 1; i <= seconds; i++) {
    const v = 1000 / (stepAt && i > stepAt ? stepPace : 330);
    d += v;
    const p = offsetLatLng(ORIGIN, g() * 2, d + g() * 2);
    session.handlePosition({ ...p, accuracy: 6, speed: v + g() * 0.25, t: i * 1000 });
    const m = session.getMetrics(i * 1000);
    coach.update(m.coachPaceSec, i * 1000, m.currentPaceSec);
  }
  return alerts;
}

test('코치: 목표 페이스로 달릴 때 GPS 잡음으로 인한 거짓 알림이 드묾', () => {
  const counts = [5, 6, 7, 8, 9, 10].map((seed) => steadyCoachRun({ seed }).length);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert(avg <= 3, `10분 평균 거짓 알림 ${avg.toFixed(1)}회 (3회 이하여야 함): ${counts}`);
  assert(Math.max(...counts) <= 6, `가장 많은 경우 ${Math.max(...counts)}회 (6회 이하여야 함)`);
});

test('코치: 시작부터 느리면 30초 안에 첫 알림 (시작 대기 시간이 길지 않음)', () => {
  for (const seed of [5, 6, 7]) {
    const alerts = steadyCoachRun({ seconds: 60, stepAt: 0.5, seed }).filter((a) => a.type === 'slow');
    assert(alerts.length >= 1, '느림 알림 발생');
    assert(alerts[0].at <= 30000, `시작 후 ${alerts[0].at / 1000}초 만에 첫 알림`);
  }
});

test('코치: 실제로 느려지면(5:30 → 6:00) 40초 안에 알림', () => {
  for (const seed of [5, 6, 7]) {
    const alerts = steadyCoachRun({ seconds: 300, stepAt: 200, seed }).filter((a) => a.at > 200000 && a.type === 'slow');
    assert(alerts.length >= 1, '느림 알림 발생');
    assert(alerts[0].at - 200000 <= 40000, `느려진 뒤 ${(alerts[0].at - 200000) / 1000}초 만에 알림`);
  }
});

test('전체 흐름: 수동 일시정지 동안 이동한 거리는 제외', () => {
  const bus = { emit() {} };
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.run.autoPause = false;
  const session = new RunSession({ bus, settings, clock: () => 0 });
  session.start(0);
  straightRun({ speedMps: 3, seconds: 30 }).forEach((p) => session.handlePosition(p));
  session.pause('manual', 30000);
  // 일시정지 중 200m 이동 (기록되면 안 됨)
  straightRun({ speedMps: 3, seconds: 30, startT: 30000, startM: 90 }).forEach((p) => session.handlePosition(p));
  session.resume(60000);
  straightRun({ speedMps: 3, seconds: 30, startT: 60000, startM: 290 }).forEach((p) => session.handlePosition(p));
  const m = session.getMetrics(90000);
  near(m.distanceM, 175, 15, '일시정지 구간 제외 거리');
  eq(m.elapsedMs, 60000, '일시정지 시간 제외');
  eq(session.route.getSegments().length, 2, '경로가 두 구간으로 나뉨');
});

test('전체 흐름: Auto Pause 동작 (서 있던 시간 제외)', () => {
  const bus = { emit() {} };
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const session = new RunSession({ bus, settings, clock: () => 0 });
  session.start(0);
  straightRun({ speedMps: 3, seconds: 40 }).forEach((p) => session.handlePosition(p));
  const stopAt = offsetLatLng(ORIGIN, 0, 120);
  for (let i = 1; i <= 20; i++) session.handlePosition({ ...stopAt, accuracy: 5, speed: 0, t: 40000 + i * 1000 });
  eq(session.state, 'paused', '자동 일시정지');
  eq(session.pauseReason, 'auto', '사유 auto');
  straightRun({ speedMps: 3, seconds: 20, startT: 60000, startM: 120 }).forEach((p) => session.handlePosition(p));
  eq(session.state, 'running', '자동 재개');
  const m = session.getMetrics(80000);
  assert(m.elapsedMs < 64000, `서 있던 20초 대부분 제외 (달린 시간 ${m.elapsedMs / 1000}초)`);
  near(m.distanceM, 180, 15, '거리');
});

test('세션 백업/복구', () => {
  const bus = { emit() {} };
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.run.autoPause = false;
  let now = 0;
  const session = new RunSession({ bus, settings, clock: () => now });
  session.start(0);
  straightRun({ speedMps: 3, seconds: 400 }).forEach((p) => session.handlePosition(p));
  now = 400000;
  const snap = JSON.parse(JSON.stringify(session.serialize()));
  const restored = RunSession.restore(snap, { bus, settings, clock: () => now });
  eq(restored.state, 'paused', '복구는 일시정지 상태');
  near(restored.distance.meters, session.distance.meters, 0.001, '거리 복구');
  eq(restored.timer.elapsedMs(), 400000, '시간 복구');
  eq(restored.laps.count, 1, '랩 복구');
  restored.resume(now);
  eq(restored.state, 'running', '재개 가능');
});

// ═════════════════════════ 저장소 ═════════════════════════

/** 테스트용 메모리 저장소 (localStorage 흉내, 용량 제한 가능) */
function memoryStorage(limitChars = Infinity) {
  const s = new SafeStorage('t:');
  s.available = false; // 메모리 모드
  if (limitChars !== Infinity) {
    const base = s.setRaw.bind(s);
    s.setRaw = (key, value) => {
      let used = 0;
      for (const v of s.memory.values()) used += v.length;
      if (used + value.length > limitChars) return { ok: false, error: 'quota' };
      return base(key, value);
    };
  }
  return s;
}

function sampleRecord(id, startedAt, distanceM = 5000) {
  return { id, startedAt, endedAt: startedAt + 1800000, durationMs: 1800000, distanceM, avgPaceSec: 360, avgSpeedKmh: 10, calories: 300, laps: [] };
}

test('기록 저장소: 저장/목록/경로/삭제', () => {
  const repo = new RunRepository(memoryStorage());
  const route = [[[37.5, 127.0], [37.501, 127.001]], [[37.502, 127.002], [37.503, 127.003]]];
  eq(repo.save(sampleRecord('a', 1000), route).ok, true, '저장');
  repo.save(sampleRecord('b', 2000), []);
  eq(repo.list()[0].id, 'b', '최신순');
  eq(repo.getRoute('a').length, 2, '경로 2구간');
  eq(repo.getRoute('a')[1][1][0], 37.503, '좌표 보존');
  eq(repo.delete('a'), true, '삭제');
  eq(repo.list().length, 1, '1개 남음');
  eq(repo.getRoute('a').length, 0, '경로도 삭제');
});

test('기록 저장소: 용량 부족 시 경로를 줄여서라도 저장', () => {
  const repo = new RunRepository(memoryStorage(6000));
  const seg = [];
  for (let i = 0; i < 600; i++) seg.push([37.5 + i * 0.00001, 127 + Math.sin(i / 10) * 0.00001]);
  const r = repo.save(sampleRecord('big', 1000), [seg]);
  eq(r.ok, true, '요약은 저장됨');
  eq(repo.list().length, 1, '목록에 있음');
});

test('기록 저장소: 손상된 데이터 무시', () => {
  const storage = memoryStorage();
  storage.setRaw('runs', '{망가진 JSON');
  const repo = new RunRepository(storage);
  eq(repo.list().length, 0, '손상 → 빈 목록');
  storage.setRaw('runs', JSON.stringify([{ id: 'x' }, sampleRecord('ok', 5)]));
  const repo2 = new RunRepository(storage);
  eq(repo2.list().length, 1, '잘못된 항목만 제외');
});

test('설정: 검증과 손상 복구', () => {
  eq(validateSetting('coach.targetPaceSec', 100).ok, false, '너무 빠른 목표');
  eq(validateSetting('coach.toleranceSec', '12').value, 12, '문자열 숫자 변환');
  eq(validateSetting('coach.cooldownSec', 10).ok, false, '쿨다운 최소 20초');
  eq(validateSetting('run.autoLapKm', '0.5').value, 0.5, '선택값');
  const s = sanitizeSettings({ coach: { targetPaceSec: 'abc', toleranceSec: 999 }, user: { weightKg: 72.5 } });
  eq(s.coach.targetPaceSec, 330, '잘못된 값 → 기본값');
  eq(s.coach.toleranceSec, 8, '범위 밖 → 기본값');
  eq(s.user.weightKg, 72.5, '정상 값 유지');
  eq(sanitizeSettings(null).coach.enabled, true, 'null → 기본값');
});

test('경로 단순화', () => {
  const pts = [];
  for (let i = 0; i <= 100; i++) pts.push([37.5 + i * 0.0001, 127]);
  const s = simplifyPath(pts, 2);
  eq(s.length, 2, '직선은 양끝 2점');
  near(haversineM({ lat: s[0][0], lng: s[0][1] }, { lat: s[1][0], lng: s[1][1] }), 1113, 2, '길이 보존');
});

// ═════════════════════════ 실행기 ═════════════════════════

export async function runAll(report = () => {}) {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
      report({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
      report({ name: t.name, ok: false, error: err.message });
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  return { total: results.length, passed: results.length - failed, failed, results };
}
