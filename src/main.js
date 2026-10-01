/**
 * Running Master Ultimate 4.0 — 진입점
 */
import { App } from './app.js';
import { registerServiceWorker } from './core/serviceWorker.js';

function showFatal(err) {
  console.error('[Running Master] 시작 오류', err);
  const box = document.getElementById('fatal');
  if (!box) return;
  box.hidden = false;
  const msg = box.querySelector('[data-fatal-message]');
  if (msg) msg.textContent = err?.message || String(err);
}

// 예상하지 못한 오류가 나도 앱 전체가 멈추지 않도록 기록만 남김
window.addEventListener('error', (e) => {
  console.error('[Running Master] 처리되지 않은 오류:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Running Master] 처리되지 않은 Promise 오류:', e.reason);
});

try {
  const app = new App();
  window.__RMU__ = app; // 개발자 도구에서 상태 확인용
  app.init().catch(showFatal);
} catch (err) {
  showFatal(err);
}

// 앱 파일·지도 이미지를 저장해 두는 서비스 워커 (다음 실행부터 빠르고 데이터를 거의 쓰지 않음)
registerServiceWorker();
