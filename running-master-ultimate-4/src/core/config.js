/**
 * Running Master Ultimate 4.0 — 앱 전역 상수
 *
 * 사용자가 설정 화면에서 바꿀 수 있는 값은 storage/settingsStore.js 의
 * DEFAULT_SETTINGS 에 있습니다. 여기에는 알고리즘 튜닝 값만 둡니다.
 */

export const APP_INFO = Object.freeze({
  name: 'Running Master Ultimate',
  version: '4.0.0',
  storagePrefix: 'rmu4:',
  schemaVersion: 1,
});

/** GPS 수신 관련 */
export const GPS_CONFIG = Object.freeze({
  enableHighAccuracy: true,
  timeoutMs: 20000,          // 한 번의 위치 응답 대기 한도
  maximumAgeMs: 0,           // 캐시된 위치 사용 안 함
  signalLostMs: 12000,       // 이 시간 동안 위치가 안 오면 '신호 끊김'
  watchdogRestartMs: 30000,  // 이 시간 동안 위치가 안 오면 watch 재시작
  goodAccuracyM: 10,         // 이 이하 → 신호 좋음
});

/** 비정상 GPS 데이터 필터 */
export const FILTER_CONFIG = Object.freeze({
  maxAccuracyM: 30,          // 기본 허용 정확도 (설정에서 변경 가능)
  maxSpeedMps: 11,           // 약 40 km/h. 이보다 빠른 순간 이동은 GPS 튐으로 간주
  spikeResetCount: 5,        // 연속 N회 튐 판정 → 기준점이 잘못된 것으로 보고 재설정
  minMoveM: 3,               // 최소 이동 거리 (정지 중 좌표 흔들림 무시)
  maxMoveThresholdM: 10,     // 흔들림 임계값 상한
  accuracyMoveFactor: 1.5,   // 정확도 × 계수 미만 이동은 흔들림으로 간주 (최대 maxMoveThresholdM)
  kalmanProcessNoiseMps: 3,  // 칼만 필터 프로세스 노이즈 (m/s)
});

/** 페이스 계산 */
export const PACE_CONFIG = Object.freeze({
  defaultWindowMs: 20000,    // 화면에 표시하는 현재 페이스 계산 구간
  coachWindowMs: 30000,      // 코치 판단용 페이스 계산 구간 (화면 구간보다 짧아지지 않음)
                             //  → 위치 잡음에 따른 거짓 알림을 줄이기 위해 조금 더 길게
  minWindowMs: 6000,         // 구간이 이보다 짧으면 계산 보류
  minWindowDistanceM: 15,    // 구간 거리가 이보다 짧으면 계산 보류
  staleSampleMs: 8000,       // 마지막 채택 위치 이후 이 시간이 지나면 '멈춤'을 반영해 페이스를 늦춤
  minSpeedMps: 0.5,          // 이보다 느리면 현재 페이스 '--:--' (약 33:20/km)
  minAvgDistanceM: 50,       // 평균 페이스를 표시하기 위한 최소 거리
});

/** Auto Pause */
export const AUTO_PAUSE_CONFIG = Object.freeze({
  stopWindowMs: 6000,        // 이 시간 동안 거의 움직이지 않으면 정지로 판단
  stopRadiusM: 5,            // 정지 판단 반경 (정확도에 따라 최대 12m 까지 확장)
  maxStopRadiusM: 12,
  resumeRadiusM: 10,         // 정지 지점에서 이 거리 이상 벗어나면 이동
  resumeSpeedMps: 1.5,       // 기기가 주는 속도가 이 이상이면 이동
  resumeConfirmCount: 2,     // 연속 N회 이동 확인 시 재개 (GPS 튐 1회로는 재개 안 함)
  maxAccuracyM: 20,          // 정확도가 이보다 나쁘면 판단 보류 (GPS 오류 ≠ 정지)
  rearmDelayMs: 5000,        // 시작/수동 재개 직후 판단 유예
});

/** 페이스 코치 */
export const COACH_CONFIG = Object.freeze({
  minTargetPaceSec: 150,     // 2:30/km
  maxTargetPaceSec: 900,     // 15:00/km
  minToleranceSec: 3,
  maxToleranceSec: 30,
  cooldownOptionsSec: [20, 25, 30, 45, 60],
  confirmMs: 5000,           // 같은 구간 판정이 이 시간 유지되어야 확정 (순간 오차 무시)
  graceMs: 15000,            // 재개 직후 알림 보류 (시작 직후에는 '코치 판단 구간 + 10초')
  strongFactor: 2,           // 허용 오차의 2배 넘게 벗어나면 '많이' 벗어남
  maxIntervalMs: 5000,       // 구간 체류 시간 집계 시 한 번에 인정하는 최대 간격
});

/** 저장소 */
export const STORAGE_CONFIG = Object.freeze({
  activeSaveIntervalMs: 15000,   // 진행 중 러닝 백업 주기 (localStorage 과다 접근 방지)
  settingsSaveDebounceMs: 300,
  maxRoutePoints: 1500,          // 기록 1건당 저장할 최대 경로 점 수
  routeSimplifyToleranceM: 2.5,  // 경로 단순화 허용 오차
  coordDecimals: 5,              // 좌표 소수점 자리수 (약 1.1m)
});

/** 화면 */
export const UI_CONFIG = Object.freeze({
  tickMs: 500,               // 화면/코치 갱신 주기
  mapFlushMs: 1000,          // 지도 경로 반영 주기
  actionLockMs: 700,         // 버튼 연타 방지
  finishHoldMs: 1000,        // 종료 버튼 길게 누르기 시간
  historyPageSize: 30,
});
