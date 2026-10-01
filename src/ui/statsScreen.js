/**
 * 통계 화면
 */
import { BarChart } from '../chart/barChart.js';
import { formatCalories, formatDateShort, formatDistanceKm, formatDuration, formatMonthLabel, formatPace, formatTotalDuration } from '../core/format.js';
import { computeTotals, monthSummary, personalRecords, seriesDaily, seriesMonthly, seriesWeekly } from '../stats/statsService.js';
import { $, $$, h, setAttr, setText } from './dom.js';

const RANGE_TITLE = {
  daily: '이번 달 일별 거리',
  weekly: '최근 12주 주별 거리',
  monthly: '최근 12개월 월별 거리',
};

export class StatsScreen {
  constructor({ repo, settings, onEditGoal, onOpenRun }) {
    this.repo = repo;
    this.settings = settings;
    this.range = 'daily';
    this.dirty = true;
    this.visible = false;
    this.el = {
      runs: $('#statRuns'),
      distance: $('#statDistance'),
      time: $('#statTime'),
      calories: $('#statCalories'),
      avgPace: $('#statAvgPace'),
      monthLabel: $('#goalMonth'),
      goalDistance: $('#goalDistance'),
      goalTarget: $('#goalTarget'),
      goalBar: $('#goalBar'),
      goalNote: $('#goalNote'),
      goalProgress: $('#goalProgress'),
      chartTitle: $('#chartTitle'),
      chartTable: $('#chartTable'),
      records: $('#recordList'),
    };
    this.chart = new BarChart($('#distanceChart'), { unit: 'km', decimals: 1 });

    $('#goalEdit').addEventListener('click', onEditGoal);
    $$('[data-range]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.range = btn.dataset.range;
        $$('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        this.renderChart();
      }),
    );
    this.el.records.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-run-id]');
      if (btn) onOpenRun(btn.dataset.runId);
    });
    repo.subscribe(() => this._invalidate());
    settings.subscribe((_s, change) => {
      if (change.path === 'user.monthlyGoalKm' || change.path === '*') this._invalidate();
    });
  }

  _invalidate() {
    this.dirty = true;
    if (this.visible) this.render();
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) return;
    if (this.dirty) this.render();
    else requestAnimationFrame(() => this.chart.draw());
  }

  /** 테마 변경 시 다시 그리기 */
  redrawChart() {
    if (this.visible) this.chart.draw();
  }

  render() {
    this.dirty = false;
    const runs = this.repo.list();
    const e = this.el;
    const t = computeTotals(runs);
    setText(e.runs, String(t.count));
    setText(e.distance, formatDistanceKm(t.distanceM, 1));
    setText(e.time, formatTotalDuration(t.durationMs));
    setText(e.calories, formatCalories(t.calories));
    setText(e.avgPace, formatPace(t.avgPaceSec));

    // 월간 목표
    const now = new Date();
    const month = monthSummary(runs, now);
    const goalKm = this.settings.get().user.monthlyGoalKm;
    const doneKm = month.distanceM / 1000;
    const pct = goalKm > 0 ? Math.min(100, (doneKm / goalKm) * 100) : 0;
    setText(e.monthLabel, formatMonthLabel(now));
    setText(e.goalDistance, formatDistanceKm(month.distanceM, 1));
    setText(e.goalTarget, String(goalKm));
    setAttr(e.goalBar, 'style', `width:${pct.toFixed(1)}%`);
    setAttr(e.goalProgress, 'aria-valuenow', String(Math.round(pct)));
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    if (doneKm >= goalKm) {
      setText(e.goalNote, `이번 달 목표를 달성했습니다. ${month.count}회 달렸습니다.`);
    } else {
      const remain = goalKm - doneKm;
      const perDay = daysLeft > 0 ? remain / (daysLeft + 1) : remain;
      setText(
        e.goalNote,
        `목표까지 ${remain.toFixed(1)}km 남았습니다. 남은 ${daysLeft + 1}일 동안 하루 ${perDay.toFixed(1)}km씩 달리면 됩니다.`,
      );
    }

    this._renderRecords(runs);
    this.renderChart();
  }

  renderChart() {
    const runs = this.repo.list();
    const items =
      this.range === 'weekly' ? seriesWeekly(runs) : this.range === 'monthly' ? seriesMonthly(runs) : seriesDaily(runs);
    setText(this.el.chartTitle, RANGE_TITLE[this.range]);
    this.chart.setData(items);

    // 화면 낭독기용 표
    const table = this.el.chartTable;
    table.textContent = '';
    table.append(
      h('caption', { text: RANGE_TITLE[this.range] }),
      h('tbody', {}, items.map((it) => h('tr', {}, [h('th', { text: it.tooltip || it.label, attrs: { scope: 'row' } }), h('td', { text: `${it.value.toFixed(1)} km` })]))),
    );
  }

  _renderRecords(runs) {
    const pr = personalRecords(runs);
    const list = this.el.records;
    list.textContent = '';
    const row = (label, run, value) =>
      h('li', {}, [
        h('button', { className: 'record-row', attrs: { type: 'button', disabled: run ? null : '' }, dataset: run ? { runId: run.id } : {} }, [
          h('span', { className: 'record-row__label', text: label }),
          h('span', { className: 'record-row__value num', text: run ? value : '—' }),
          h('span', { className: 'record-row__date', text: run ? formatDateShort(run.startedAt) : '' }),
        ]),
      ]);
    list.append(
      row('최장 거리', pr.longest, pr.longest ? `${formatDistanceKm(pr.longest.distanceM)} km` : ''),
      row('최고 평균 페이스 (1km 이상)', pr.fastest, pr.fastest ? `${formatPace(pr.fastest.avgPaceSec)}/km` : ''),
      row('최장 시간', pr.longestTime, pr.longestTime ? formatDuration(pr.longestTime.durationMs) : ''),
    );
  }
}
