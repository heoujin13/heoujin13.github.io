/**
 * 기록 목록 화면
 */
import { UI_CONFIG } from '../core/config.js';
import { formatDateShort, formatDistanceKm, formatDuration, formatMonthLabel, formatPace, formatTime } from '../core/format.js';
import { $, h, setHidden } from './dom.js';

export class HistoryScreen {
  constructor({ repo, onOpen }) {
    this.repo = repo;
    this.onOpen = onOpen;
    this.list = $('#historyList');
    this.empty = $('#historyEmpty');
    this.more = $('#historyMore');
    this.limit = UI_CONFIG.historyPageSize;
    this.dirty = true;
    this.visible = false;

    this.more.addEventListener('click', () => {
      this.limit += UI_CONFIG.historyPageSize;
      this.render();
    });
    this.list.addEventListener('click', (e) => {
      const item = e.target.closest('[data-run-id]');
      if (item) this.onOpen(item.dataset.runId);
    });
    repo.subscribe(() => {
      this.dirty = true;
      if (this.visible) this.render();
    });
  }

  setVisible(visible) {
    this.visible = visible;
    if (visible && this.dirty) this.render();
  }

  render() {
    this.dirty = false;
    const runs = this.repo.list();
    setHidden(this.empty, runs.length > 0);
    const shown = runs.slice(0, this.limit);
    setHidden(this.more, runs.length <= this.limit);

    // 월별 합계 (전체 기록 기준)
    const monthTotals = new Map();
    for (const r of runs) {
      const d = new Date(r.startedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const t = monthTotals.get(key) || { count: 0, distanceM: 0 };
      t.count += 1;
      t.distanceM += r.distanceM;
      monthTotals.set(key, t);
    }

    const frag = document.createDocumentFragment();
    let lastKey = null;
    let group = null;
    for (const r of shown) {
      const d = new Date(r.startedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== lastKey) {
        lastKey = key;
        const t = monthTotals.get(key);
        frag.append(
          h('h2', { className: 'history-month' }, [
            h('span', { text: formatMonthLabel(d) }),
            h('span', { className: 'history-month__sum', text: `${t.count}회, ${formatDistanceKm(t.distanceM, 1)} km` }),
          ]),
        );
        group = h('ul', { className: 'history-group' });
        frag.append(group);
      }
      group.append(this._item(r));
    }
    this.list.textContent = '';
    this.list.append(frag);
  }

  _item(r) {
    const coachOn = r.coach && r.coach.enabled !== false ? coachOnRatio(r.coach) : null;
    return h('li', {}, [
      h('button', { className: 'run-card', attrs: { type: 'button' }, dataset: { runId: r.id } }, [
        h('span', { className: 'run-card__date' }, [
          `${formatDateShort(r.startedAt)} ${formatTime(r.startedAt)}`,
          r.simulated ? h('span', { className: 'tag', text: '시뮬레이션' }) : null,
        ]),
        h('span', { className: 'run-card__dist' }, [
          h('span', { className: 'num', text: formatDistanceKm(r.distanceM) }),
          h('small', { text: ' km' }),
        ]),
        h('span', { className: 'run-card__meta' }, [
          h('span', {}, [h('span', { className: 'num', text: formatDuration(r.durationMs) })]),
          h('span', {}, [h('span', { className: 'num', text: formatPace(r.avgPaceSec) }), '/km']),
          coachOn !== null ? h('span', { className: 'run-card__coach', text: `목표 유지 ${coachOn}%` }) : null,
        ]),
      ]),
    ]);
  }
}

export function coachOnRatio(coach) {
  const total = (coach.onMs || 0) + (coach.slowMs || 0) + (coach.fastMs || 0);
  if (total < 10000) return null;
  return Math.round(((coach.onMs || 0) / total) * 100);
}
