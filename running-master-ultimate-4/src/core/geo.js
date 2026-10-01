/**
 * 위경도 계산 유틸 (순수 함수)
 */

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;
export const METERS_PER_DEG_LAT = 111320;

export function isValidCoord(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0) // (0,0)은 위치 미확정 기기가 흔히 보내는 값
  );
}

/** 두 지점 사이 거리 (미터, Haversine) */
export function haversineM(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 기준점에서 동(x)·북(y)으로 미터만큼 이동한 좌표 */
export function offsetLatLng(origin, eastM, northM) {
  return {
    lat: origin.lat + northM / METERS_PER_DEG_LAT,
    lng: origin.lng + eastM / (METERS_PER_DEG_LAT * Math.cos(origin.lat * DEG)),
  };
}

/** 여러 점의 중심 */
export function centroid(points) {
  if (!points.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

/**
 * Douglas–Peucker 경로 단순화 (반복문 구현 — 긴 경로에서도 스택 오버플로 없음)
 * @param {Array<[number, number]>} points [lat, lng] 배열
 * @param {number} toleranceM 허용 오차 (미터)
 * @returns {Array<[number, number]>}
 */
export function simplifyPath(points, toleranceM) {
  const n = points.length;
  if (n <= 2 || !(toleranceM > 0)) return points.slice();

  // 평면 근사를 위해 미터 좌표로 투영
  const lat0 = points[0][0] * DEG;
  const kx = METERS_PER_DEG_LAT * Math.cos(lat0);
  const ky = METERS_PER_DEG_LAT;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][1] * kx;
    ys[i] = points[i][0] * ky;
  }

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tol2 = toleranceM * toleranceM;
  const stack = [[0, n - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD2 = 0;
    let index = -1;
    const ax = xs[first];
    const ay = ys[first];
    const dx = xs[last] - ax;
    const dy = ys[last] - ay;
    const len2 = dx * dx + dy * dy;

    for (let i = first + 1; i < last; i++) {
      let px = xs[i] - ax;
      let py = ys[i] - ay;
      if (len2 > 0) {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        px -= t * dx;
        py -= t * dy;
      }
      const d2 = px * px + py * py;
      if (d2 > maxD2) {
        maxD2 = d2;
        index = i;
      }
    }

    if (index !== -1 && maxD2 > tol2) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const result = [];
  for (let i = 0; i < n; i++) if (keep[i]) result.push(points[i]);
  return result;
}

/** 경로 세그먼트들의 경계 상자 */
export function boundsOf(segments) {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const seg of segments) {
    for (const [lat, lng] of seg) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (!Number.isFinite(minLat)) return null;
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
