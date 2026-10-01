/**
 * 지도 표시 (Leaflet)
 *
 * 성능 원칙
 *  - GPS 가 들어올 때마다 지도를 다시 그리지 않음: 위치를 버퍼에 모았다가 1초에 한 번 반영
 *  - 화면에 보이지 않을 때(다른 탭)는 반영하지 않고, 다시 보일 때 한 번에 반영
 *  - Canvas 렌더러 사용 (SVG 보다 점이 많아도 빠름)
 *  - 따라가기(follow)는 현재 위치가 화면 가장자리에 가까워질 때만 이동
 *
 * Leaflet 로딩에 실패하면 간이 캔버스로 경로 선만 그립니다 (지도 없이도 경로 확인 가능).
 */
import { UI_CONFIG } from '../core/config.js';
import { boundsOf } from '../core/geo.js';
import { loadLeaflet } from './leafletLoader.js';

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
const DEFAULT_CENTER = [37.5665, 126.978];

export class MapView {
  /**
   * @param {HTMLElement} container
   * @param {{dark?: boolean, live?: boolean, onFollowChange?: (follow: boolean) => void}} [opts]
   */
  constructor(container, { dark = false, live = true, onFollowChange } = {}) {
    this.container = container;
    this.dark = dark;
    this.live = live;
    this.onFollowChange = onFollowChange;
    this.L = null;
    this.map = null;
    this.ready = false;
    this.failed = false;
    this.visible = true;
    this.follow = true;

    this.polylines = [];
    this.pendingPoints = [];     // 아직 지도에 반영되지 않은 경로 점
    this.pendingPosition = null; // 최신 현재 위치
    this.lastPosition = null;
    this.hasCentered = false;
    this.segments = [];          // 간이 표시용 경로 사본
    this.staticSegments = null;

    this.tileErrors = 0;
    this.tileLoads = 0;
    this._timer = null;
  }

  async init() {
    let L = null;
    try {
      L = await loadLeaflet();
    } catch {
      L = null;
    }
    if (!L) {
      this._useFallback();
      return false;
    }
    try {
      this.L = L;
      this.container.classList.add('map--leaflet');
      this.map = L.map(this.container, {
        preferCanvas: true,
        zoomControl: false,
        attributionControl: true,
        center: DEFAULT_CENTER,
        zoom: 15,
        zoomSnap: 0.5,
        fadeAnimation: false,
      });
      this.map.attributionControl.setPrefix(false);
      this._createTiles();
      this.map.on('dragstart', () => {
        if (this.live && this.follow) {
          this.follow = false;
          this.onFollowChange?.(false);
        }
      });
      this.ready = true;
      if (this.live) this._timer = setInterval(() => this.flush(), UI_CONFIG.mapFlushMs);
      if (this.staticSegments) this.showRoute(this.staticSegments);
      this.flush();
      return true;
    } catch (err) {
      console.error('[Map] 지도 초기화 실패', err);
      this._useFallback();
      return false;
    }
  }

  _createTiles() {
    const L = this.L;
    if (this.tiles) this.map.removeLayer(this.tiles);
    this.tiles = L.tileLayer(this.dark ? TILE_URLS.dark : TILE_URLS.light, {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: ATTRIBUTION,
      crossOrigin: true,
    });
    this.tiles.on('tileerror', () => {
      this.tileErrors += 1;
      if (this.tileErrors >= 4 && this.tileLoads === 0) this._setNotice('지도 이미지를 불러올 수 없습니다 (오프라인). 경로는 계속 표시됩니다.');
    });
    this.tiles.on('tileload', () => {
      this.tileLoads += 1;
      if (this.tileLoads === 1) this._setNotice('');
    });
    this.tiles.addTo(this.map);
  }

  setDark(dark) {
    if (this.dark === dark) return;
    this.dark = dark;
    if (this.ready) {
      this._createTiles();
      const color = this._routeColor();
      this.polylines.forEach((p) => p.setStyle({ color }));
      this._restyleMarkers();
    } else if (this.failed) {
      this._drawFallback();
    }
  }

  /** 화면 표시 여부 (보이지 않는 동안은 갱신 생략) */
  setVisible(visible) {
    this.visible = visible;
    if (visible && this.ready) {
      // 숨겨져 있던 컨테이너는 크기를 다시 계산해야 함
      requestAnimationFrame(() => {
        this.map.invalidateSize(false);
        this.flush();
      });
    } else if (visible && this.failed) {
      requestAnimationFrame(() => this._drawFallback());
    }
  }

  /** 새 러닝 시작 → 경로 초기화 */
  startLive() {
    this.clearRoute();
    this.follow = true;
    this.onFollowChange?.(true);
  }

  clearRoute() {
    if (this.ready) {
      this.polylines.forEach((p) => this.map.removeLayer(p));
      [this.startMarker, this.endMarker].forEach((m) => m && this.map.removeLayer(m));
    }
    this.polylines = [];
    this.startMarker = null;
    this.endMarker = null;
    this.pendingPoints = [];
    this.segments = [];
    if (this.failed) this._drawFallback();
  }

  /** 복구한 러닝의 기존 경로 그리기 */
  loadSegments(segments) {
    this.clearRoute();
    for (const seg of segments) {
      seg.forEach(([lat, lng], i) => this.addRoutePoint(lat, lng, i === 0));
    }
    this.flush(true);
  }

  /** 채택된 경로 점 추가 (즉시 그리지 않고 버퍼에 저장) */
  addRoutePoint(lat, lng, segmentStart = false) {
    this.pendingPoints.push({ lat, lng, segmentStart });
    if (segmentStart || !this.segments.length) this.segments.push([]);
    this.segments[this.segments.length - 1].push([lat, lng]);
  }

  /** 현재 위치 (가장 최근 값만 보관) */
  setCurrentPosition(lat, lng, accuracy) {
    this.pendingPosition = { lat, lng, accuracy };
  }

  /** 버퍼를 지도에 반영 */
  flush(force = false) {
    if (!this.visible && !force) return;
    if (this.failed) {
      if (this.pendingPoints.length || this.pendingPosition) {
        this.pendingPoints = [];
        if (this.pendingPosition) this.lastPosition = this.pendingPosition;
        this.pendingPosition = null;
        this._drawFallback();
      }
      return;
    }
    if (!this.ready) return;
    const L = this.L;

    if (this.pendingPoints.length) {
      const color = this._routeColor();
      let current = this.polylines[this.polylines.length - 1];
      const additions = new Map(); // polyline → 새 점들 (선마다 한 번만 다시 그림)
      for (const p of this.pendingPoints) {
        if (p.segmentStart || !current) {
          current = L.polyline([], {
            color,
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
            smoothFactor: 1.2,
            interactive: false,
          }).addTo(this.map);
          this.polylines.push(current);
        }
        if (!additions.has(current)) additions.set(current, []);
        additions.get(current).push([p.lat, p.lng]);
        if (!this.startMarker) {
          this.startMarker = this._dotMarker([p.lat, p.lng], 'start').addTo(this.map);
        }
      }
      additions.forEach((pts, poly) => poly.setLatLngs(poly.getLatLngs().concat(pts.map((q) => L.latLng(q[0], q[1])))));
      this.pendingPoints = [];
    }

    if (this.pendingPosition) {
      const { lat, lng, accuracy } = this.pendingPosition;
      this.pendingPosition = null;
      this.lastPosition = { lat, lng, accuracy };
      const ll = L.latLng(lat, lng);
      if (!this.posMarker) {
        this.accCircle = L.circle(ll, {
          radius: accuracy || 10,
          stroke: false,
          fillColor: this._accentColor(),
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(this.map);
        this.posMarker = L.circleMarker(ll, {
          radius: 8,
          weight: 3,
          color: '#ffffff',
          fillColor: this._accentColor(),
          fillOpacity: 1,
          interactive: false,
        }).addTo(this.map);
      } else {
        this.posMarker.setLatLng(ll);
        this.accCircle.setLatLng(ll);
        if (Number.isFinite(accuracy)) this.accCircle.setRadius(accuracy);
      }
      if (this.follow) {
        if (!this.hasCentered) {
          this.map.setView(ll, 16, { animate: false });
          this.hasCentered = true;
        } else if (!this.map.getBounds().pad(-0.25).contains(ll)) {
          this.map.panTo(ll, { animate: true, duration: 0.4 });
        }
      }
    }
  }

  /** 따라가기 다시 켜고 현재 위치로 */
  recenter() {
    this.follow = true;
    this.onFollowChange?.(true);
    if (this.ready && this.lastPosition) {
      this.map.setView([this.lastPosition.lat, this.lastPosition.lng], Math.max(this.map.getZoom(), 16));
    }
  }

  /** 기록 상세 화면: 저장된 경로 전체 표시 */
  showRoute(segments) {
    this.staticSegments = segments;
    this.segments = segments.map((s) => s.slice());
    if (this.failed) {
      this._drawFallback();
      return;
    }
    if (!this.ready) return;
    const L = this.L;
    this.clearRoute();
    this.segments = segments.map((s) => s.slice());
    const color = this._routeColor();
    for (const seg of segments) {
      if (!seg.length) continue;
      const poly = L.polyline(seg, { color, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map);
      this.polylines.push(poly);
    }
    const first = segments.find((s) => s.length)?.[0];
    const lastSeg = [...segments].reverse().find((s) => s.length);
    const last = lastSeg?.[lastSeg.length - 1];
    if (first) this.startMarker = this._dotMarker(first, 'start').addTo(this.map);
    if (last) this.endMarker = this._dotMarker(last, 'end').addTo(this.map);
    const b = boundsOf(segments);
    if (b) {
      requestAnimationFrame(() => {
        this.map.invalidateSize(false);
        this.map.fitBounds(b, { padding: [24, 24], maxZoom: 17, animate: false });
      });
    }
  }

  _dotMarker(latlng, kind) {
    return this.L.circleMarker(latlng, {
      radius: 6,
      weight: 3,
      color: kind === 'start' ? '#ffffff' : this._inkColor(),
      fillColor: kind === 'start' ? this._onColor() : '#ffffff',
      fillOpacity: 1,
      interactive: false,
    });
  }

  _restyleMarkers() {
    this.posMarker?.setStyle({ fillColor: this._accentColor() });
    this.accCircle?.setStyle({ fillColor: this._accentColor() });
  }

  _cssVar(name, fallback) {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    } catch {
      return fallback;
    }
  }

  _routeColor() {
    return this._cssVar('--route', this.dark ? '#ffce1f' : '#14181c');
  }

  _accentColor() {
    return this._cssVar('--route-pos', '#2f7bff');
  }

  _onColor() {
    return this._cssVar('--on', '#34c77b');
  }

  _inkColor() {
    return this._cssVar('--text-1', '#14181c');
  }

  _setNotice(text) {
    if (!this.noticeEl) {
      this.noticeEl = document.createElement('div');
      this.noticeEl.className = 'map-notice';
      this.container.appendChild(this.noticeEl);
    }
    this.noticeEl.textContent = text;
    this.noticeEl.hidden = !text;
  }

  // ───────────── Leaflet 을 쓸 수 없을 때의 간이 표시 ─────────────

  _useFallback() {
    this.failed = true;
    this.container.classList.add('map--fallback');
    this.container.innerHTML = '';
    this.fallbackCanvas = document.createElement('canvas');
    this.fallbackCanvas.className = 'map-fallback-canvas';
    this.container.appendChild(this.fallbackCanvas);
    this._setNotice('지도를 불러오지 못해 경로 선만 표시합니다.');
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._drawFallback());
      this._ro.observe(this.container);
    }
    if (this.live) this._timer = setInterval(() => this.flush(), UI_CONFIG.mapFlushMs);
    this._drawFallback();
  }

  _drawFallback() {
    const canvas = this.fallbackCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const segs = this.segments.filter((s) => s.length);
    const pos = this.lastPosition;
    const all = pos ? [...segs, [[pos.lat, pos.lng]]] : segs;
    const b = boundsOf(all);
    if (!b) return;
    const [[minLat, minLng], [maxLat, maxLng]] = b;
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = Math.max((maxLng - minLng) * kx, 1e-5);
    const spanY = Math.max(maxLat - minLat, 1e-5);
    const pad = 20;
    const scale = Math.min((rect.width - pad * 2) / spanX, (rect.height - pad * 2) / spanY);
    const ox = (rect.width - spanX * scale) / 2;
    const oy = (rect.height - spanY * scale) / 2;
    const toXY = ([lat, lng]) => [ox + (lng - minLng) * kx * scale, rect.height - (oy + (lat - minLat) * scale)];

    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this._routeColor();
    for (const seg of segs) {
      ctx.beginPath();
      seg.forEach((p, i) => {
        const [x, y] = toXY(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    if (pos) {
      const [x, y] = toXY([pos.lat, pos.lng]);
      ctx.fillStyle = this._accentColor();
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  destroy() {
    clearInterval(this._timer);
    this._ro?.disconnect();
    if (this.map) {
      try {
        this.map.remove();
      } catch {
        /* 무시 */
      }
    }
    this.map = null;
    this.ready = false;
  }
}
