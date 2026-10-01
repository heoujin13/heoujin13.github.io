/**
 * 서비스 워커 등록 및 지도 저장소(캐시) 관리
 *
 * 서비스 워커(sw.js)는 앱 파일과 지도 배경 이미지를 저장해
 * 다시 실행할 때 인터넷 데이터를 거의 쓰지 않고 빠르게 시작하게 합니다.
 * HTTPS 또는 localhost 에서만 동작하며, 지원하지 않으면 아무 일도 하지 않습니다.
 */
export const TILE_CACHE = 'rmu4-tiles';

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof window !== 'undefined' && window.isSecureContext === false) return;
  const register = () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[SW] 서비스 워커를 등록하지 못했습니다:', err?.message || err);
    });
  };
  // 첫 화면이 다 뜬 뒤에 등록 (시작 속도에 영향 없도록)
  if (document.readyState === 'complete') setTimeout(register, 1500);
  else window.addEventListener('load', () => setTimeout(register, 1500), { once: true });
}

/** 저장된 지도 이미지 개수 (지원하지 않으면 null) */
export async function getTileCacheCount() {
  try {
    if (typeof caches === 'undefined') return null;
    if (!(await caches.has(TILE_CACHE))) return 0;
    const cache = await caches.open(TILE_CACHE);
    return (await cache.keys()).length;
  } catch {
    return null;
  }
}

export async function clearTileCache() {
  try {
    if (typeof caches === 'undefined') return false;
    return await caches.delete(TILE_CACHE);
  } catch {
    return false;
  }
}
