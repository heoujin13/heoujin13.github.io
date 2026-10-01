# Running Master Ultimate 4.0

목표 페이스에서 벗어나면 **진동으로 알려 주는 페이스 코치**가 핵심인 러닝 웹앱입니다.
빌드 과정 없이 HTML·CSS·JavaScript(ES Modules)·Leaflet·localStorage 만으로 동작합니다.

---

## 1. 실행 방법 (VS Code + Live Server)

1. 압축을 풀고 VS Code 에서 `running-master-ultimate-4` 폴더를 엽니다. (**파일 → 폴더 열기**)
2. 확장 프로그램 **Live Server**(ritwickdey.LiveServer)를 설치합니다. 폴더를 열면 설치 추천 알림이 뜹니다.
3. `index.html` 을 우클릭 → **Open with Live Server**
4. Chrome 에서 `http://127.0.0.1:5500/index.html` 이 열립니다.

> `index.html` 을 더블클릭해서 `file://` 로 열면 ES Module 이 막혀 동작하지 않습니다. 반드시 Live Server 로 여세요.

### PC 에서 모든 기능을 시험해 보기 (GPS 시뮬레이션)

PC 는 실제로 달릴 수 없으므로 **설정 → GPS → GPS 시뮬레이션** 을 켜고 러닝을 시작하세요.
가상의 러너가 한강 공원 타원 트랙을 돌며 실제 GPS 처럼 위치를 보냅니다.

- **코치 시연** 시나리오(기본): 목표 유지 70초 → 느려짐 50초 → 복귀 45초 → 빨라짐 45초 → 복귀 30초 → 정지 16초(Auto Pause) 를 반복
- **일정한 페이스** 시나리오: 지정한 페이스로 꾸준히 달림
- 좌표 잡음, 가끔 큰 튐(spike), 가끔 정확도 낮은 위치를 일부러 섞어 필터가 동작하는 것을 볼 수 있습니다.

PC 브라우저는 진동을 지원하지 않으므로, 코치 알림은 화면 강조와 음성으로 확인됩니다.

### 휴대폰에서 실행하기 (중요)

브라우저는 **HTTPS 또는 localhost 주소에서만 GPS 를 허용**합니다.
휴대폰에서 `http://192.168.x.x:5500` 처럼 PC 주소로 접속하면 GPS 가 막힙니다. 아래 중 하나를 사용하세요.

| 방법 | 설명 |
|---|---|
| **A. USB 포트 포워딩 (Android, 권장)** | 휴대폰 개발자 옵션 → USB 디버깅 켜기 → USB 연결 → PC Chrome 에서 `chrome://inspect/#devices` → **Port forwarding** 에 `5500` → `localhost:5500` 추가 → 휴대폰 Chrome 에서 `http://localhost:5500` 접속 |
| **B. HTTPS 무료 호스팅** | 폴더 전체를 GitHub Pages, Netlify Drop, Cloudflare Pages 등에 올리면 HTTPS 주소가 생깁니다. 실제 야외 러닝에는 이 방법이 가장 편합니다. |
| **C. 테스트용 예외 (Android Chrome)** | 휴대폰 Chrome 에서 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 에 `http://PC주소:5500` 입력 → 사용 설정 → 재시작 |

야외에서 쓸 때는
- 러닝 전에 **설정 → GPS → 현재 위치 확인** 으로 권한을 허용하고 정확도를 확인하세요.
- 러닝 중에는 화면을 켜 두세요(앱이 자동으로 화면 꺼짐을 막습니다). 모바일 브라우저는 화면이 꺼지면 GPS 수신을 멈춥니다.
- 진동은 **Android Chrome** 에서 동작합니다. iPhone(Safari·Chrome 모두)은 웹 진동을 지원하지 않아 음성·화면으로 안내합니다.

---

## 2. 폴더 구조

```
running-master-ultimate-4/
├── index.html                  화면 구조 (러닝 / 기록 / 통계 / 설정 / 기록 상세)
├── manifest.webmanifest        홈 화면 추가(PWA)용 정보
├── package.json                테스트 실행용 (빌드 도구 없음)
├── .vscode/                    Live Server 설정, 추천 확장
├── assets/icons/               앱 아이콘
├── vendor/leaflet/             Leaflet 1.9.4 (오프라인에서도 지도 라이브러리 사용)
├── css/
│   ├── base.css                색상 토큰(라이트/다크), 리셋, 글꼴
│   ├── layout.css              상단 바, 하단 탭, 조작 바, 상세 시트
│   ├── components.css          버튼, 스위치, 입력, 토스트, 대화상자
│   ├── run.css                 러닝 화면 (페이스 코치, 큰 지표, 지도, 랩)
│   └── screens.css             기록 / 통계 / 설정 / 기록 상세
├── src/
│   ├── main.js                 진입점 (전역 오류 처리)
│   ├── app.js                  모든 모듈을 연결하는 곳 (Composition Root)
│   ├── core/                   config(튜닝 값), eventBus, format, geo, utils, platform, wakeLock
│   ├── gps/                    gpsService(수신·권한·상태), providers(브라우저 GPS),
│   │                           gpsSimulator(테스트용), gpsFilter(비정상 데이터), kalmanFilter
│   ├── running/                runSession(한 번의 러닝), runTimer, distanceTracker,
│   │                           paceCalculator, speedCalculator, calorieCalculator,
│   │                           lapManager, autoPause, routeRecorder
│   ├── coach/                  ★ paceCoach(목표 비교), coachNotifier(진동·음성 전달), coachMessages
│   ├── vibration/              vibrationManager (Web Vibration API)
│   ├── voice/                  voiceManager (Web Speech API)
│   ├── map/                    leafletLoader, mapView
│   ├── storage/                safeStorage, settingsStore, runRepository, activeRunStore, backup
│   ├── stats/                  statsService
│   ├── chart/                  barChart (Canvas)
│   └── ui/                     runScreen, controlBar, historyScreen, runDetailView,
│                               statsScreen, settingsScreen, modal, toast, router, theme, dom
└── tests/
    ├── suite.js                핵심 로직 테스트 40개
    ├── index.html              브라우저에서 테스트 실행 (Live Server 로 열기)
    └── run-tests.mjs           Node 로 테스트 실행 (`node tests/run-tests.mjs`)
```

---

## 3. 구조: GPS → Distance → Pace → Pace Coach → Vibration / Voice

```
GpsService ──(위치)──▶ RunSession
                         ├─ AutoPauseDetector   정지/재개 판정 (정확도 나쁘면 판단 보류)
                         ├─ GpsFilter           비정상 위치 제거 + 칼만 필터
                         ├─ DistanceTracker     채택된 위치로 거리 누적
                         ├─ PaceCalculator      현재/평균 페이스
                         ├─ LapManager          자동/수동 랩
                         └─ RouteRecorder       경로
                         │
                    getMetrics() (0.5초마다)
                         ▼
                    PaceCoach  ──alert──▶ CoachNotifier ──▶ VibrationManager (navigator.vibrate)
                                                       └──▶ VoiceManager (speechSynthesis)
```

- **PaceCoach 는 GPS 를 전혀 모릅니다.** 페이스(초/km)와 시각만 받습니다.
- 모듈끼리는 서로 import 하지 않고 `app.js` 에서만 연결되며, 이벤트(`gps:position`, `run:state`, `run:lap` …)로 소통합니다.
- 진동·음성·GPS 는 각각 **Driver/Provider** 뒤에 감춰져 있어, 모바일 앱으로 바꿀 때 그 부분만 교체하면 됩니다.

---

## 4. ★ 목표 페이스 진동 코치

| 항목 | 기본값 | 설명 |
|---|---|---|
| 목표 페이스 | 5:30/km | 코치 카드의 목표 숫자를 눌러 러닝 중에도 바로 변경 |
| 허용 오차 | ±8초 | 5:30 이면 5:22 ~ 5:38 을 '목표 유지'로 봄 (경계값 포함) |
| 같은 알림 반복 간격(쿨다운) | 25초 | 20·25·30·45·60초 중 선택. 같은 종류 알림은 이 시간 안에 다시 울리지 않음 |
| 판정 확정 시간 | 5초 | 같은 판정이 5초 이어져야 구간이 바뀜 (GPS 순간 오차 무시) |
| 계속 벗어나 있으면 다시 알림 | 켜짐 | 끄면 목표로 돌아왔다가 다시 벗어날 때만 알림 |
| 너무 빠를 때도 알림 | 켜짐 | 짧은 진동 + "페이스를 조금 낮추세요" |

**진동 패턴**: 느림 = 길게 두 번, 많이 느림(허용 오차의 2배 초과) = 길게 세 번, 빠름 = 짧게 한 번, 많이 빠름 = 짧게 두 번

**동작 예 (목표 5:30, ±8초)**

```
5:25 → 정상
5:32 → 정상
5:39 → 조금 느림 → 진동 + "페이스를 조금 올리세요"
5:42 → 느림 → 같은 알림 반복 안 함 (쿨다운 25초)
5:30 → 정상 복귀 → "좋아요. 목표 페이스입니다" (선택)
5:40 → 다시 벗어남 → 다시 진동 (직전 느림 알림 후 25초가 안 지났으면 25초가 되는 순간 진동)
```

**GPS 잡음으로 진동이 계속 울리지 않게 하는 장치**

1. 코치 판단용 페이스는 **최근 30초** 기준으로 계산합니다. 화면의 '현재 페이스'(기본 20초)보다 안정적입니다.
2. 기기가 GPS 속도(도플러 속도)를 알려 주면 그 값을 우선 사용합니다. 위치 잔떨림의 영향을 거의 받지 않습니다.
3. 알림 직전에 최근 페이스로 한 번 더 확인합니다. 이미 목표 범위로 돌아왔다면 늦은 알림을 울리지 않습니다.
4. 시작 직후 40초(코치 판단 구간 30초 + 출발 가속 10초), 재개·목표 변경 직후 15초는 알림을 보류합니다. 코치 카드에 남은 시간이 표시됩니다.
5. 일시정지(수동·자동) 중에는 알림이 없습니다.

알림이 너무 잦다고 느껴지면 허용 오차를 ±10~15초로 늘리거나, '계속 벗어나 있으면 다시 알림'을 끄세요.

---

## 5. 그 밖의 기능

- **러닝**: 시작 / 일시정지 / 재개 / 종료(실수 방지를 위해 1초 길게 누르기, 키보드는 확인 대화상자)
- **GPS 필터**: 정확도 기준(기본 ±30m) 초과 제외, 시속 40km 를 넘는 순간 이동(튐) 제거, 정지 중 잔떨림 무시, 잘못된 첫 위치에 고착되지 않도록 기준점 재설정, 칼만 필터로 좌표 다듬기
- **시간**: 일시정지 시간 제외. 브라우저 타이머가 밀려도 벽시계 기준으로 정확
- **Auto Pause**: 6초 동안 거의 움직이지 않으면 자동 일시정지(서 있던 6초도 기록에서 제외), 연속 2회 이동 확인 시 자동 재개. GPS 정확도가 나쁘거나 신호가 끊기면 정지로 판단하지 않음
- **랩**: 자동(0.5/1/2/5km, 경계 시각 보간) + 수동. 랩 페이스를 목표와 비교해 색으로 표시, 음성 안내
- **지도**: 깔끔한 약도(CARTO Positron / Dark Matter). 위치는 1초에 한 번 모아서 반영, 화면에 안 보이면 갱신 생략. Leaflet 로딩 실패 시 간이 캔버스로 경로 선 표시
- **기록**: localStorage 에 요약과 경로를 분리 저장(경로는 단순화해서 최대 1,500점). 용량 부족 시 경로를 더 줄여서라도 저장
- **복구**: 러닝 중 15초마다 백업. 브라우저가 꺼졌다 다시 열리면 이어서 달리기 / 저장 / 삭제 선택
- **통계**: 총 횟수·거리·시간·칼로리·평균 페이스, 월간 목표 진행률, 일별/주별/월별 거리 그래프, 개인 기록
- **설정**: 코치, 러닝, 체중, 월간 목표, 테마(시스템/라이트/다크), 화면 켜 두기, GPS 정확도, 시뮬레이션, 백업 내보내기/가져오기, 기기 지원 상태 점검

---

## 6. 안정성 (앱이 멈추지 않는 상황)

| 상황 | 처리 |
|---|---|
| GPS 권한 거부 / 미지원 / HTTP 주소 | 원인과 해결 방법 안내, "GPS 없이 시작(시간만 기록)" 또는 시뮬레이션 선택 |
| GPS 신호 불량·끊김 | 상태 표시, 시간은 계속 기록, 30초 이상 위치가 없으면 수신 자동 재시작 |
| Vibration / 음성 / 화면 꺼짐 방지 미지원 | 지원 여부 확인 후 조용히 건너뜀 (설정 화면에서 지원 상태 확인 가능) |
| 지도 로딩 실패 | 내장 Leaflet → CDN 2곳 순서로 시도, 모두 실패하면 간이 경로 그림 |
| localStorage 사용 불가 / 손상 / 용량 초과 | 메모리 저장으로 전환, 손상 데이터는 기본값, 용량 부족 시 경로 축소 후 재시도 |
| 잘못된 목표 페이스·설정 입력 | 저장하지 않고 입력란 아래에 이유 표시 ("초는 0~59 사이로 입력하세요" 등) |
| 버튼 연타 | 처리 중이거나 0.7초 이내 재입력 무시, 랩은 3초 미만 무시 |

---

## 7. 테스트

```bash
node tests/run-tests.mjs     # Node 18 이상
```
또는 Live Server 실행 중에 `http://127.0.0.1:5500/tests/index.html` 을 엽니다.

요구사항 7번의 코치 동작 예시, 쿨다운, 순간 튐 무시, GPS 잡음 속 거짓 알림 빈도, 실제로 느려졌을 때의 알림 시간,
GPS 필터, 일시정지 시간 제외, Auto Pause, 랩 보간, 백업/복구, 저장소 용량 부족 등을 확인합니다.

---

## 8. 조정하고 싶을 때

- 알고리즘 수치: `src/core/config.js` (필터 기준, 코치 판정 시간·구간, Auto Pause 반경 등)
- 사용자 설정 기본값과 허용 범위: `src/storage/settingsStore.js`
- 진동 패턴: `src/vibration/vibrationManager.js` 의 `VIBRATION_PATTERNS`
- 안내 문구: `src/coach/coachMessages.js`
- 색상: `css/base.css` 맨 위의 토큰

## 9. 모바일 앱으로 전환할 때

Capacitor 등으로 감싸면 HTML/CSS/JS 를 그대로 쓰고 아래 세 부분만 네이티브로 바꾸면 됩니다.

| 기능 | 지금 | 교체 방법 |
|---|---|---|
| GPS | `BrowserGeolocationProvider` | 같은 메서드(`getCurrent`, `watch`)를 가진 `NativeGeolocationProvider` 를 만들어 `app.js` 의 `_createProvider` 에서 반환. 백그라운드 위치 수신도 이때 가능 |
| 진동 | `WebVibrationDriver` | `supported`, `vibrate(pattern)`, `cancel()` 을 가진 드라이버를 `new VibrationManager({ driver })` 로 전달 (iPhone 진동도 가능해짐) |
| 음성 | `WebSpeechDriver` | `supported`, `speak(text, opts)`, `cancel()` 을 가진 TTS 드라이버를 `new VoiceManager({ driver })` 로 전달 |

## 10. 알아 둘 점

- 지도 이미지(타일)는 인터넷이 필요합니다. 오프라인이면 경로 선만 표시됩니다.
- 숫자 글꼴(Barlow Condensed)은 Google Fonts 에서 받으며, 오프라인이면 시스템 글꼴로 표시됩니다.
- 웹앱은 화면이 꺼지거나 다른 앱으로 전환하면 GPS 가 멈출 수 있습니다. 러닝 중에는 앱 화면을 켜 두세요.
- 칼로리는 `체중(kg) × 거리(km) × 1.036` 근사식입니다.

지도 라이브러리: Leaflet 1.9.4 (BSD-2-Clause, `vendor/leaflet/LICENSE`) · 지도 데이터 © OpenStreetMap, © CARTO
