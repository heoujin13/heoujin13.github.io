# Running Master Ultimate 4.0

목표 페이스에서 벗어나면 **진동으로 알려 주는 페이스 코치**가 핵심인 러닝 웹앱입니다.
빌드 과정 없이 HTML·CSS·JavaScript(ES Modules)·Leaflet·localStorage 만으로 동작합니다.

---

## 1. 실행 방법 (VS Code + Live Server)

1. 압축을 풉니다.
2. VS Code 에서 **파일 → 폴더 열기** 로 `running-master-ultimate-4` **폴더 전체**를 엽니다.
   (파일 하나만 열거나 `tests` 같은 하위 폴더를 열면 앱이 동작하지 않습니다.)
3. 확장 프로그램 **Live Server**(ritwickdey.LiveServer)를 설치합니다. 폴더를 열면 설치 추천 알림이 뜹니다.
4. 왼쪽 탐색기에서 **맨 위에 있는 `index.html`** 을 우클릭 → **Open with Live Server**
5. Chrome 에서 `http://127.0.0.1:5500/index.html` 이 열립니다.

> - 화면에 "핵심 로직 테스트 … 실행 중…" 이 보이면 앱이 아니라 **개발용 테스트 화면**을 연 것입니다. 위 2번처럼 폴더 전체를 열고 맨 위 `index.html` 을 실행하세요.
> - `index.html` 을 더블클릭해서 `file://` 로 열면 ES Module 이 막혀 동작하지 않습니다.

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
| **A. HTTPS 무료 호스팅 (권장)** | 폴더 전체를 GitHub Pages, Netlify Drop, Cloudflare Pages 등에 올리면 HTTPS 주소가 생깁니다. 한 번 열면 앱 파일이 휴대폰에 저장되어 **다음부터는 데이터를 거의 쓰지 않고 바로 시작**하며, 인터넷이 없어도 열립니다. 홈 화면에 추가하면 앱처럼 쓸 수 있습니다. |
| **B. USB 포트 포워딩 (Android)** | 휴대폰 개발자 옵션 → USB 디버깅 켜기 → USB 연결 → PC Chrome 에서 `chrome://inspect/#devices` → **Port forwarding** 에 `5500` → `localhost:5500` 추가 → 휴대폰 Chrome 에서 `http://localhost:5500` 접속 |
| **C. 테스트용 예외 (Android Chrome)** | 휴대폰 Chrome 에서 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 에 `http://PC주소:5500` 입력 → 사용 설정 → 재시작 |

---

## 2. 화면을 끄고 달리고 싶을 때 — "화면 끄기 모드"

**전원 버튼으로 화면을 끄면 브라우저가 GPS 와 진동을 멈춥니다.** 화면에 보이지 않는 웹페이지의 위치 수신을
막는 것은 Chrome 자체의 정책이라, 웹앱에서는 바꿀 수 없습니다.

그래서 러닝 화면의 **화면 끄기 모드** 버튼(또는 설정 → 화면 → "시작 10초 뒤 화면 끄기 모드")을 사용합니다.

- 화면 전체가 검게 바뀌고 터치가 잠깁니다. 주머니 속에서 잘못 눌리지 않습니다.
- 앱은 계속 실행됩니다. **GPS 기록, 페이스 코치, 진동, 음성 안내가 모두 그대로 동작**합니다.
- OLED 화면 휴대폰(대부분의 최신 갤럭시·아이폰)은 검은 화소가 꺼진 것과 같아 배터리를 거의 쓰지 않습니다.
- 화면 갱신과 지도 그리기를 멈춰서 배터리를 더 아낍니다.
- 가운데 원을 **1.5초 길게 누르면** 원래 화면으로 돌아옵니다. (PC 에서는 Esc)

전원 버튼으로 화면이 꺼졌다가 다시 켜지면, 꺼져 있던 시간과 그 구간이 직선 거리로만 기록되었다는 안내가 나오고
기록 상세에도 남습니다.

> **완전히 화면을 끈 상태**(주머니에서 잠금 화면)로 GPS·진동을 쓰려면 이 웹앱을 Android 앱으로 감싸야 합니다.
> 구조는 이미 그에 맞춰 나뉘어 있습니다(9장 참고).

---

## 3. 데이터(인터넷) 절약

GPS 자체는 인터넷 데이터를 쓰지 않습니다. 데이터는 거의 **지도 배경 이미지(타일)** 와 **앱 파일**에 쓰입니다.

| 항목 | 처리 |
|---|---|
| 지도 배경 이미지 | 설정 → 데이터 절약 → **지도 배경 이미지** <br>· 러닝 중엔 끄기 (기본값) — 달리는 동안 0, 경로 선은 그대로 그림 <br>· 항상 끄기 — 언제나 0 <br>· 항상 받기 <br>휴대폰의 '데이터 절약 모드'가 켜져 있으면 기본값에서도 받지 않습니다. |
| 지도 해상도 | 고해상도(@2x) 대신 일반 타일 사용 → 같은 화면을 약 1/4 데이터로 |
| 지도 예비 타일 | 화면 밖 타일을 미리 받지 않고, 지도가 멈췄을 때만 새로 받음 |
| 받은 지도 저장 | 한 번 받은 타일은 최대 800장(약 12MB)까지 저장해 다시 받지 않음. 같은 코스는 두 번째부터 0. 설정에서 개수 확인·비우기 가능 |
| 숫자 글꼴 | 인터넷(Google Fonts)에서 받지 않고 프로젝트에 포함 (영문·숫자만 남겨 18KB) |
| 지도 라이브러리 | 프로젝트에 포함 (vendor/leaflet) |
| 앱 파일 | HTTPS 주소로 올렸을 때 서비스 워커(`sw.js`)가 저장 → 다음 실행부터 거의 0 |

> 개발 중(localhost·127.0.0.1)에는 코드를 고친 내용이 바로 보이도록 앱 파일을 저장하지 않습니다. 지도 타일만 저장합니다.

---

## 4. 시작 속도

- JavaScript 모듈 50개를 `modulepreload` 로 한꺼번에 받아, 하나씩 차례로 받던 대기 시간을 없앴습니다.
- 외부 글꼴을 쓰지 않아 첫 화면이 인터넷 연결을 기다리지 않습니다.
- 지도 라이브러리는 첫 화면이 뜬 뒤에 불러옵니다.
- HTTPS 로 배포하면 두 번째 실행부터 저장된 파일로 바로 시작합니다.
- 페이스 코치는 러닝 시작 후 **20초**부터 동작합니다. (출발 가속 8초를 빼고 12초 이상 모인 뒤 판단. 코치 카드에 남은 초가 표시됨)

---

## 5. 폴더 구조

```
running-master-ultimate-4/
├── index.html                  앱 화면 (러닝 / 기록 / 통계 / 설정 / 기록 상세 / 화면 끄기 모드)
├── sw.js                       서비스 워커 (앱 파일·지도 타일 저장 → 데이터 절약, 빠른 시작, 오프라인)
├── manifest.webmanifest        홈 화면 추가(PWA)용 정보
├── package.json                테스트 실행용 (빌드 도구 없음)
├── .vscode/                    Live Server 설정, 추천 확장
├── assets/icons/               앱 아이콘
├── assets/fonts/               숫자 글꼴 Barlow Condensed (SIL OFL 1.1)
├── vendor/leaflet/             Leaflet 1.9.4
├── css/
│   ├── base.css                색상 토큰(라이트/다크), 글꼴, 리셋
│   ├── layout.css              상단 바, 하단 탭, 조작 바, 상세 시트
│   ├── components.css          버튼, 스위치, 입력, 토스트, 대화상자
│   ├── run.css                 러닝 화면, 페이스 코치, 지도, 랩, 화면 끄기 모드
│   └── screens.css             기록 / 통계 / 설정 / 기록 상세
├── src/
│   ├── main.js                 진입점 (전역 오류 처리, 서비스 워커 등록)
│   ├── app.js                  모든 모듈을 연결하는 곳 (Composition Root)
│   ├── core/                   config(튜닝 값), eventBus, format, geo, utils, platform, wakeLock, serviceWorker
│   ├── gps/                    gpsService, providers(브라우저 GPS), gpsSimulator, gpsFilter, kalmanFilter
│   ├── running/                runSession, runTimer, distanceTracker, paceCalculator, speedCalculator,
│   │                           calorieCalculator, lapManager, autoPause, routeRecorder
│   ├── coach/                  ★ paceCoach(목표 비교), coachNotifier(진동·음성 전달), coachMessages
│   ├── vibration/              vibrationManager (Web Vibration API)
│   ├── voice/                  voiceManager (Web Speech API)
│   ├── map/                    leafletLoader, mapView
│   ├── storage/                safeStorage, settingsStore, runRepository, activeRunStore, backup
│   ├── stats/                  statsService
│   ├── chart/                  barChart (Canvas)
│   └── ui/                     runScreen, controlBar, pocketMode(화면 끄기 모드), historyScreen,
│                               runDetailView, statsScreen, settingsScreen, modal, toast, router, theme, dom
└── tests/                      개발용 (앱 실행에는 필요 없음)
    ├── suite.js                핵심 로직 테스트 41개
    ├── run-tests.html          브라우저에서 테스트 실행
    └── run-tests.mjs           Node 로 테스트 실행 (`node tests/run-tests.mjs`)
```

---

## 6. 구조: GPS → Distance → Pace → Pace Coach → Vibration / Voice

```
GpsService ──(위치)──▶ RunSession
                         ├─ AutoPauseDetector   정지/재개 판정 (정확도 나쁘면 판단 보류)
                         ├─ GpsFilter           비정상 위치 제거 + 칼만 필터
                         ├─ DistanceTracker     채택된 위치로 거리 누적
                         ├─ PaceCalculator      현재/평균 페이스 (기기 GPS 속도 우선)
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

## 7. ★ 목표 페이스 진동 코치

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
4. 시작 직후 20초, 재개·목표 변경 직후 15초는 알림을 보류합니다. 코치 카드에 남은 시간이 표시됩니다.
5. 일시정지(수동·자동) 중에는 알림이 없습니다.

알림이 너무 잦다고 느껴지면 허용 오차를 ±10~15초로 늘리거나, '계속 벗어나 있으면 다시 알림'을 끄세요.

---

## 8. 그 밖의 기능과 안정성

- **러닝**: 시작 / 일시정지 / 재개 / 종료(실수 방지를 위해 1초 길게 누르기, 키보드는 확인 대화상자)
- **GPS 필터**: 정확도 기준(기본 ±30m) 초과 제외, 시속 40km 를 넘는 순간 이동(튐) 제거, 정지 중 잔떨림 무시, 잘못된 첫 위치에 고착되지 않도록 기준점 재설정, 칼만 필터
- **시간**: 일시정지 시간 제외, 벽시계 기준이라 브라우저 타이머가 밀려도 정확
- **Auto Pause**: 6초 동안 거의 움직이지 않으면 자동 일시정지(서 있던 6초도 제외), 연속 2회 이동 확인 시 자동 재개. GPS 정확도가 나쁘거나 신호가 끊기면 정지로 판단하지 않음
- **랩**: 자동(0.5/1/2/5km, 경계 시각 보간) + 수동, 목표 대비 색 표시, 음성 안내
- **기록**: localStorage 에 요약과 경로를 분리 저장, 용량 부족 시 경로를 더 줄여서라도 저장
- **복구**: 러닝 중 15초마다 백업. 브라우저가 꺼졌다 다시 열리면 이어서 달리기 / 저장 / 삭제 선택
- **통계**: 총 횟수·거리·시간·칼로리·평균 페이스, 월간 목표, 일별/주별/월별 거리 그래프, 개인 기록

| 상황 | 처리 |
|---|---|
| GPS 권한 거부 / 미지원 / HTTP 주소 | 원인과 해결 방법 안내, "GPS 없이 시작(시간만 기록)" 또는 시뮬레이션 선택 |
| GPS 신호 불량·끊김 | 상태 표시, 시간은 계속 기록, 30초 이상 위치가 없으면 수신 자동 재시작 |
| 전원 버튼으로 화면 꺼짐 | 다시 켜질 때 꺼져 있던 시간 안내, 기록에 남김, 화면 끄기 모드 권유 |
| Vibration / 음성 / 화면 꺼짐 방지 미지원 | 지원 여부 확인 후 조용히 건너뜀 (설정 화면에서 지원 상태 확인 가능) |
| 지도 로딩 실패·오프라인 | 경로 선만 표시 |
| localStorage 사용 불가 / 손상 / 용량 초과 | 메모리 저장으로 전환, 손상 데이터는 기본값, 용량 부족 시 경로 축소 후 재시도 |
| 앱 파일 일부를 못 불러옴 | 4초 뒤 안내 화면 표시 (멈춘 채로 두지 않음) |
| 잘못된 목표 페이스·설정 입력 | 저장하지 않고 입력란 아래에 이유 표시 |
| 버튼 연타 | 처리 중이거나 0.7초 이내 재입력 무시, 랩은 3초 미만 무시 |

---

## 9. 모바일 앱으로 전환할 때 (완전히 화면을 끈 상태로 달리기)

Capacitor 등으로 감싸면 HTML/CSS/JS 를 그대로 쓰고 아래 세 부분만 네이티브로 바꾸면 됩니다.
Android 의 '포그라운드 서비스'를 쓰는 위치 플러그인을 사용하면 화면이 꺼져도 GPS 를 받을 수 있습니다.

| 기능 | 지금 | 교체 방법 |
|---|---|---|
| GPS | `BrowserGeolocationProvider` | 같은 메서드(`getCurrent`, `watch`)를 가진 `NativeGeolocationProvider` 를 만들어 `app.js` 의 `_createProvider` 에서 반환 |
| 진동 | `WebVibrationDriver` | `supported`, `vibrate(pattern)`, `cancel()` 을 가진 드라이버를 `new VibrationManager({ driver })` 로 전달 |
| 음성 | `WebSpeechDriver` | `supported`, `speak(text, opts)`, `cancel()` 을 가진 TTS 드라이버를 `new VoiceManager({ driver })` 로 전달 |

---

## 10. 테스트 (개발용)

```bash
node tests/run-tests.mjs     # Node 18 이상
```
또는 Live Server 실행 중에 `http://127.0.0.1:5500/tests/run-tests.html` 을 엽니다.

## 11. 조정하고 싶을 때

- 알고리즘 수치: `src/core/config.js` (필터 기준, 코치 판정 시간·구간, Auto Pause 반경 등)
- 사용자 설정 기본값과 허용 범위: `src/storage/settingsStore.js`
- 진동 패턴: `src/vibration/vibrationManager.js` 의 `VIBRATION_PATTERNS`
- 안내 문구: `src/coach/coachMessages.js`
- 색상: `css/base.css` 맨 위의 토큰
- HTTPS 로 다시 배포할 때: `sw.js` 의 `VERSION` 을 바꾸면 휴대폰에 저장된 앱 파일이 확실히 새로 바뀝니다.

지도 라이브러리: Leaflet 1.9.4 (BSD-2-Clause, `vendor/leaflet/LICENSE`) · 숫자 글꼴: Barlow Condensed (SIL OFL 1.1, `assets/fonts/OFL.txt`) · 지도 데이터 © OpenStreetMap, © CARTO
