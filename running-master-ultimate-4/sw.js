/**
 * Running Master Ultimate 4.0 — 서비스 워커 (데이터 절약 · 빠른 시작 · 오프라인)
 *
 * 1) 앱 파일 (HTML·CSS·JS·글꼴·Leaflet) — 배포된 주소(HTTPS)에서만
 *    - 설치될 때 한 번에 저장 → 다음부터는 인터넷 없이도, 데이터 사용 없이 바로 시작
 *    - 저장본으로 즉시 시작하고 뒤에서 조용히 새 버전 확인
 *    - 개발 중(localhost / 127.0.0.1, Live Server)에는 앱 파일을 저장하지 않음
 *      → 코드를 고치면 바로 반영되고, 같은 주소의 다른 프로젝트에도 영향을 주지 않음
 * 2) 지도 배경 이미지(타일)
 *    - 한 번 받은 타일은 저장해 두고 다시 받지 않음 (같은 코스를 달리면 데이터 0)
 *    - 최대 MAX_TILES 개까지만 보관 (오래된 것부터 삭제)
 *
 * 앱 파일을 고쳐서 다시 배포했다면 VERSION 을 바꿔 주세요. (바꾸지 않아도 다음 실행 때 새 파일로 갱신됨)
 */
const VERSION = 'rmu4-4.1.0';
const APP_CACHE = `${VERSION}-app`;
const TILE_CACHE = 'rmu4-tiles';
const MAX_TILES = 800; // 타일 1장 약 10~20KB → 최대 약 10~15MB
const TILE_HOST = 'basemaps.cartocdn.com';

const IS_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

// APP_FILES_START (자동 생성 목록)
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/run.css',
  './css/screens.css',
  './assets/icons/icon-maskable.svg',
  './assets/icons/icon.svg',
  './assets/fonts/barlow-condensed-bold.woff',
  './assets/fonts/barlow-condensed-semibold.woff',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-shadow.png',
  './src/main.js',
  './src/app.js',
  './src/chart/barChart.js',
  './src/coach/coachMessages.js',
  './src/coach/coachNotifier.js',
  './src/coach/paceCoach.js',
  './src/core/config.js',
  './src/core/eventBus.js',
  './src/core/format.js',
  './src/core/geo.js',
  './src/core/platform.js',
  './src/core/serviceWorker.js',
  './src/core/utils.js',
  './src/core/wakeLock.js',
  './src/gps/gpsFilter.js',
  './src/gps/gpsService.js',
  './src/gps/gpsSimulator.js',
  './src/gps/kalmanFilter.js',
  './src/gps/providers.js',
  './src/map/leafletLoader.js',
  './src/map/mapView.js',
  './src/running/autoPause.js',
  './src/running/calorieCalculator.js',
  './src/running/distanceTracker.js',
  './src/running/lapManager.js',
  './src/running/paceCalculator.js',
  './src/running/routeRecorder.js',
  './src/running/runSession.js',
  './src/running/runTimer.js',
  './src/running/speedCalculator.js',
  './src/stats/statsService.js',
  './src/storage/activeRunStore.js',
  './src/storage/backup.js',
  './src/storage/runRepository.js',
  './src/storage/safeStorage.js',
  './src/storage/settingsStore.js',
  './src/ui/controlBar.js',
  './src/ui/dom.js',
  './src/ui/historyScreen.js',
  './src/ui/modal.js',
  './src/ui/pocketMode.js',
  './src/ui/router.js',
  './src/ui/runDetailView.js',
  './src/ui/runScreen.js',
  './src/ui/settingsScreen.js',
  './src/ui/statsScreen.js',
  './src/ui/theme.js',
  './src/ui/toast.js',
  './src/vibration/vibrationManager.js',
  './src/voice/voiceManager.js',
];
// APP_FILES_END

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (IS_DEV) {
        await self.skipWaiting();
        return;
      }
      const cache = await caches.open(APP_CACHE);
      // 파일 하나가 실패해도 나머지는 저장
      await Promise.all(
        APP_FILES.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => console.warn('[SW] 저장 실패', url, err)),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('rmu4-') && k !== APP_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.hostname.endsWith(TILE_HOST)) {
    event.respondWith(tileFirst(req));
    return;
  }
  if (IS_DEV) return;                               // 개발 중에는 앱 파일을 가로채지 않음
  if (url.origin !== self.location.origin) return; // 그 밖의 외부 요청은 그대로
  if (url.pathname.includes('/tests/')) return;    // 개발용 테스트 페이지는 저장하지 않음

  event.respondWith(cacheFirstThenUpdate(req, event));
});

/** 지도 타일: 저장본이 있으면 인터넷을 쓰지 않음 */
let putCount = 0;
async function tileFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).catch(() => {});
      if (++putCount % 50 === 0) trimTiles(cache);
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function trimTiles(cache) {
  try {
    const keys = await cache.keys();
    const extra = keys.length - MAX_TILES;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]); // 오래된 것부터
  } catch {
    /* 무시 */
  }
}

/** 배포 주소: 저장본으로 즉시 응답하고, 뒤에서 새 버전 확인 */
async function cacheFirstThenUpdate(req, event) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  const update = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  const res = await update;
  if (res) return res;
  if (req.mode === 'navigate') {
    const index = await cache.match('./index.html');
    if (index) return index;
  }
  return new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
