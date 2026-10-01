/**
 * 실행 환경 기능 감지.
 * 모든 브라우저 API 사용 전에 여기서 지원 여부를 확인합니다.
 * (모바일 앱으로 전환할 때는 이 파일과 각 Driver 만 교체하면 됩니다)
 */
export function detectCapabilities() {
  const hasWindow = typeof window !== 'undefined';
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  return {
    secureContext: hasWindow ? window.isSecureContext !== false : true,
    geolocation: !!nav.geolocation,
    vibration: typeof nav.vibrate === 'function',
    speech:
      hasWindow &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function',
    wakeLock: !!nav.wakeLock && typeof nav.wakeLock.request === 'function',
    permissions: !!(nav.permissions && typeof nav.permissions.query === 'function'),
    touch: hasWindow && ('ontouchstart' in window || (nav.maxTouchPoints || 0) > 0),
    protocol: hasWindow ? window.location.protocol : '',
  };
}

/** 위치 권한 상태 조회 ('granted' | 'denied' | 'prompt' | 'unknown') */
export async function queryGeolocationPermission() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state || 'unknown';
  } catch {
    return 'unknown';
  }
}
