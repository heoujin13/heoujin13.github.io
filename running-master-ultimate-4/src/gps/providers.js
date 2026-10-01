/**
 * 위치 제공자 (Provider)
 *
 * GpsService 는 Provider 인터페이스만 알고 있습니다.
 *   - supported: boolean
 *   - kind: 'device' | 'simulation'
 *   - getCurrent(options): Promise<Position>
 *   - watch(onPosition, onError, options): () => void (중지 함수)
 *   - setRunning?(running: boolean)  (선택)
 *
 * 모바일 앱(Capacitor 등)으로 전환할 때는 이 인터페이스를 구현한
 * NativeGeolocationProvider 를 만들어 끼우기만 하면 됩니다.
 */

/** 브라우저 Position 객체 → 앱 내부 형식 */
export function normalizePosition(pos, receivedAt = Date.now()) {
  const c = (pos && pos.coords) || {};
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
    altitude: Number.isFinite(c.altitude) ? c.altitude : null,
    speed: Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : null,
    heading: Number.isFinite(c.heading) ? c.heading : null,
    // 기기 timestamp 는 기기마다 기준이 들쭉날쭉하여, 거리/속도 계산에는 수신 시각을 사용
    t: receivedAt,
    deviceTime: pos && Number.isFinite(pos.timestamp) ? pos.timestamp : null,
  };
}

/** GeolocationPositionError → 앱 내부 오류 형식 */
export function normalizeGeoError(err) {
  if (err && err.code && typeof err.code === 'string') return err; // 이미 변환됨
  const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
  const raw = err && typeof err.code === 'number' ? err.code : 0;
  if (raw === 1) {
    if (insecure || /secure origin/i.test(err?.message || '')) {
      return {
        code: 'insecure',
        message: 'HTTPS 또는 localhost 에서만 GPS를 사용할 수 있습니다.',
      };
    }
    return {
      code: 'denied',
      message: '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.',
    };
  }
  if (raw === 2) {
    return { code: 'unavailable', message: '현재 위치를 확인할 수 없습니다. 하늘이 트인 곳으로 이동해 보세요.' };
  }
  if (raw === 3) {
    return { code: 'timeout', message: 'GPS 응답이 늦어지고 있습니다.' };
  }
  return { code: 'unknown', message: err?.message || '알 수 없는 GPS 오류가 발생했습니다.' };
}

export class BrowserGeolocationProvider {
  constructor() {
    this.kind = 'device';
  }

  get supported() {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  }

  getCurrent(options) {
    return new Promise((resolve, reject) => {
      if (!this.supported) {
        reject({ code: 'unsupported', message: '이 브라우저는 GPS(위치 정보)를 지원하지 않습니다.' });
        return;
      }
      try {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(normalizePosition(p)),
          (e) => reject(normalizeGeoError(e)),
          options,
        );
      } catch (e) {
        reject(normalizeGeoError(e));
      }
    });
  }

  watch(onPosition, onError, options) {
    if (!this.supported) {
      onError({ code: 'unsupported', message: '이 브라우저는 GPS(위치 정보)를 지원하지 않습니다.' });
      return () => {};
    }
    let id = null;
    try {
      id = navigator.geolocation.watchPosition(
        (p) => onPosition(normalizePosition(p)),
        (e) => onError(normalizeGeoError(e)),
        options,
      );
    } catch (e) {
      onError(normalizeGeoError(e));
    }
    return () => {
      if (id !== null) {
        try {
          navigator.geolocation.clearWatch(id);
        } catch {
          /* 무시 */
        }
      }
    };
  }
}
