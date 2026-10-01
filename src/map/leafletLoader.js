/**
 * Leaflet 동적 로더
 *
 * 1순위: 프로젝트에 포함된 vendor/leaflet (오프라인에서도 동작)
 * 2순위: CDN (unpkg → jsDelivr)
 * 모두 실패하면 null 을 반환하고, 지도는 간이 경로 그림으로 대체됩니다.
 */
const VERSION = '1.9.4';

const SOURCES = [
  {
    js: new URL('../../vendor/leaflet/leaflet.js', import.meta.url).href,
    css: new URL('../../vendor/leaflet/leaflet.css', import.meta.url).href,
  },
  {
    js: `https://unpkg.com/leaflet@${VERSION}/dist/leaflet.js`,
    css: `https://unpkg.com/leaflet@${VERSION}/dist/leaflet.css`,
  },
  {
    js: `https://cdn.jsdelivr.net/npm/leaflet@${VERSION}/dist/leaflet.js`,
    css: `https://cdn.jsdelivr.net/npm/leaflet@${VERSION}/dist/leaflet.css`,
  },
];

let loading = null;

function loadCss(href) {
  return new Promise((resolve) => {
    if ([...document.styleSheets].some((s) => s.href === href)) return resolve(true);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    document.head.appendChild(link);
  });
}

function loadScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const timer = setTimeout(() => {
      s.remove();
      reject(new Error(`시간 초과: ${src}`));
    }, timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      reject(new Error(`불러오기 실패: ${src}`));
    };
    document.head.appendChild(s);
  });
}

/** @returns {Promise<any|null>} Leaflet 전역 객체(L) 또는 null */
export function loadLeaflet({ timeoutMs = 8000 } = {}) {
  if (typeof window !== 'undefined' && window.L && typeof window.L.map === 'function') {
    return Promise.resolve(window.L);
  }
  if (loading) return loading;
  loading = (async () => {
    for (const src of SOURCES) {
      try {
        const cssOk = await loadCss(src.css);
        if (!cssOk) continue;
        await loadScript(src.js, timeoutMs);
        if (window.L && typeof window.L.map === 'function') return window.L;
      } catch (err) {
        console.warn('[Map]', err.message);
      }
    }
    console.error('[Map] Leaflet 을 불러오지 못했습니다. 간이 경로 표시로 대체합니다.');
    return null;
  })();
  return loading;
}
