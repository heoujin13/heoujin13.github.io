/**
 * 기록 상세 화면 (러닝 종료 직후 요약도 이 화면을 사용)
 */
import {
  formatCalories,
  formatDate,
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatSpeed,
  formatTime,
} from '../core/format.js';
import { MapView } from '../map/mapView.js';
import { $, h } from './dom.js';
import { coachOnRatio } from './historyScreen.js';

export class RunDetailView {
  constructor({ repo, isDark, onDelete }) {
    this.repo = repo;
    this.isDark = isDark;
    this.onDelete = onDelete;
    this.sheet = $('#runDetail');
    this.title = $('#detailTitle');
    this.body = $('#detailBody');
    this.currentId = null;
    this.map = null;
    this.pushed = false;

    $('#detailBack').addEventListener('click', () => this.close());
    $('#detailDelete').addEventListener('click', () => {
      if (this.currentId) this.onDelete(this.currentId);
    });
    window.addEventListener('popstate', () => {
      if (this.isOpen) this.close({ fromHistory: true });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen && !document.querySelector('.dialog-backdrop')) this.close();
    });
  }

  get isOpen() {
    return !this.sheet.hidden;
  }

  open(id, { justFinished = false, saveNote = '' } = {}) {
    const r = this.repo.get(id);
    if (!r) return false;
    this.currentId = id;
    this._destroyMap();
    this.title.textContent = justFinished ? '러닝 완료' : formatDate(r.startedAt);
    this.body.textContent = '';
    this.body.append(this._render(r, { justFinished, saveNote }));
    this.sheet.hidden = false;
    document.body.classList.add('has-sheet');
    requestAnimationFrame(() => this.sheet.classList.add('is-open'));
    this.body.scrollTop = 0;

    if (!this.pushed) {
      try {
        history.pushState({ rmuSheet: true }, '');
        this.pushed = true;
      } catch {
        /* 무시 */
      }
    }

    // 지도
    const segments = this.repo.getRoute(id);
    const mapEl = this.body.querySelector('.detail-map');
    if (segments.length && mapEl) {
      this.map = new MapView(mapEl, { dark: this.isDark(), live: false });
      this.map.showRoute(segments);
      this.map.init();
    } else if (mapEl) {
      mapEl.replaceWith(h('p', { className: 'empty-hint', text: 'GPS 경로가 기록되지 않았습니다.' }));
    }
    $('#detailBack').focus({ preventScroll: true });
    return true;
  }

  close({ fromHistory = false } = {}) {
    if (!this.isOpen) return;
    this.sheet.classList.remove('is-open');
    this.sheet.hidden = true;
    document.body.classList.remove('has-sheet');
    this._destroyMap();
    this.currentId = null;
    if (this.pushed) {
      this.pushed = false;
      if (!fromHistory) {
        try {
          history.back();
        } catch {
          /* 무시 */
        }
      }
    }
  }

  setDark(dark) {
    this.map?.setDark(dark);
  }

  _destroyMap() {
    this.map?.destroy();
    this.map = null;
  }

  _render(r, { justFinished, saveNote }) {
    const stat = (label, value, unit = '') =>
      h('div', { className: 'stat' }, [
        h('dt', { text: label }),
        h('dd', {}, [h('span', { className: 'num', text: value }), unit ? h('small', { text: unit }) : null]),
      ]);

    const frag = document.createDocumentFragment();

    frag.append(
      h('section', { className: 'detail-hero' }, [
        h('p', { className: 'detail-hero__when' }, [
          `${formatDate(r.startedAt)} ${formatTime(r.startedAt)}`,
          r.simulated ? h('span', { className: 'tag', text: '시뮬레이션' }) : null,
        ]),
        h('p', { className: 'detail-hero__dist' }, [
          h('span', { className: 'num', text: formatDistanceKm(r.distanceM) }),
          h('span', { className: 'detail-hero__unit', text: 'km' }),
        ]),
        justFinished && saveNote ? h('p', { className: 'detail-hero__note', text: saveNote }) : null,
      ]),
    );

    frag.append(
      h('dl', { className: 'stat-grid' }, [
        stat('시간', formatDuration(r.durationMs)),
        stat('평균 페이스', formatPace(r.avgPaceSec), '/km'),
        stat('평균 속도', formatSpeed(r.avgSpeedKmh), 'km/h'),
        stat('최고 속도', formatSpeed(r.maxSpeedKmh), 'km/h'),
        stat('칼로리', formatCalories(r.calories), 'kcal'),
        stat('일시정지', formatDuration(r.pausedMs || 0)),
      ]),
    );

    if (r.coach) frag.append(this._coachSection(r.coach));

    frag.append(h('section', { className: 'panel detail-map-panel' }, [h('div', { className: 'map detail-map', attrs: { role: 'img', 'aria-label': '러닝 경로' } })]));

    frag.append(this._lapsSection(r));

    const g = r.gps?.filter;
    if (g) {
      const removed = (g.spike || 0) + (g.low_accuracy || 0);
      frag.append(
        h('p', {
          className: 'detail-foot',
          text: `GPS 위치 ${r.gps.pointsUsed || 0}개로 거리를 계산했습니다. 튀거나 부정확한 위치 ${removed}개는 제외했습니다.${r.autoPauseCount ? ` 자동 일시정지 ${r.autoPauseCount}회.` : ''}`,
        }),
      );
    }
    return frag;
  }

  _coachSection(c) {
    const total = (c.onMs || 0) + (c.slowMs || 0) + (c.fastMs || 0);
    const pct = (v) => (total > 0 ? Math.round(((v || 0) / total) * 100) : 0);
    const ratio = coachOnRatio(c);
    const bar = h('div', { className: 'zone-bar', attrs: { role: 'img', 'aria-label': `빠름 ${pct(c.fastMs)}%, 목표 유지 ${pct(c.onMs)}%, 느림 ${pct(c.slowMs)}%` } });
    if (total > 0) {
      for (const [key, v] of [['fast', c.fastMs], ['on', c.onMs], ['slow', c.slowMs]]) {
        if (v > 0) bar.append(h('span', { className: `zone-bar__seg zone-bar__seg--${key}`, attrs: { style: `flex-grow:${v}` } }));
      }
    }
    const legend = h('ul', { className: 'zone-legend' }, [
      ['fast', '빠름', c.fastMs],
      ['on', '목표 유지', c.onMs],
      ['slow', '느림', c.slowMs],
    ].map(([key, label, v]) =>
      h('li', { dataset: { zone: key } }, [
        h('span', { className: 'zone-legend__swatch', attrs: { 'aria-hidden': 'true' } }),
        `${label} `,
        h('strong', { className: 'num', text: `${pct(v)}%` }),
        h('small', { text: ` ${formatDuration(v || 0)}` }),
      ]),
    ));
    return h('section', { className: 'panel coach-summary' }, [
      h('h2', { className: 'panel__title', text: '페이스 코치' }),
      h('p', { className: 'coach-summary__target' }, [
        '목표 ',
        h('strong', { className: 'num', text: `${formatPace(c.targetPaceSec)}/km` }),
        ` ±${c.toleranceSec}초`,
        ratio !== null ? h('span', { className: 'coach-summary__ratio', text: `목표 유지 ${ratio}%` }) : null,
      ]),
      total > 0 ? bar : h('p', { className: 'empty-hint', text: '코칭할 만큼 충분히 달리지 않았습니다.' }),
      total > 0 ? legend : null,
      h('p', { className: 'coach-summary__alerts', text: `느림 알림 ${c.alerts?.slow || 0}회, 빠름 알림 ${c.alerts?.fast || 0}회` }),
    ]);
  }

  _lapsSection(r) {
    const laps = r.laps || [];
    const coach = r.coach;
    const zoneOf = (pace) => {
      if (!coach || !Number.isFinite(pace)) return '';
      const p = Math.round(pace);
      if (p > coach.targetPaceSec + coach.toleranceSec) return 'slow';
      if (p < coach.targetPaceSec - coach.toleranceSec) return 'fast';
      return 'on';
    };
    if (!laps.length) {
      return h('section', { className: 'panel' }, [
        h('h2', { className: 'panel__title', text: '랩' }),
        h('p', { className: 'empty-hint', text: '기록된 랩이 없습니다.' }),
      ]);
    }
    const rows = laps.map((l) =>
      h('tr', { dataset: { zone: zoneOf(l.paceSec) } }, [
        h('td', { className: 'num', text: String(l.index) }),
        h('td', { className: 'num', text: formatDistanceKm(l.distanceM) }),
        h('td', { className: 'num', text: formatDuration(l.durationMs) }),
        h('td', { className: 'num lap-pace-cell', text: formatPace(l.paceSec) }),
      ]),
    );
    return h('section', { className: 'panel' }, [
      h('h2', { className: 'panel__title', text: `랩 ${laps.length}개` }),
      h('table', { className: 'lap-table' }, [
        h('thead', {}, [h('tr', {}, ['#', '거리(km)', '시간', '페이스'].map((t) => h('th', { text: t, attrs: { scope: 'col' } })))]),
        h('tbody', {}, rows),
      ]),
    ]);
  }
}
