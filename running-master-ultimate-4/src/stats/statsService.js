/**
 * 통계 계산 (순수 함수 — 저장된 기록 요약만 사용)
 */

export function computeTotals(runs) {
  let distanceM = 0;
  let durationMs = 0;
  let calories = 0;
  for (const r of runs) {
    distanceM += r.distanceM || 0;
    durationMs += r.durationMs || 0;
    calories += r.calories || 0;
  }
  return {
    count: runs.length,
    distanceM,
    durationMs,
    calories,
    avgPaceSec: distanceM >= 50 ? durationMs / 1000 / (distanceM / 1000) : null,
  };
}

const sameMonth = (ts, y, m) => {
  const d = new Date(ts);
  return d.getFullYear() === y && d.getMonth() === m;
};

/** 해당 월의 거리(m)와 횟수 */
export function monthSummary(runs, date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  let distanceM = 0;
  let count = 0;
  for (const r of runs) {
    if (sameMonth(r.startedAt, y, m)) {
      distanceM += r.distanceM || 0;
      count += 1;
    }
  }
  return { distanceM, count };
}

/** 개인 기록 */
export function personalRecords(runs) {
  let longest = null;
  let fastest = null;
  let longestTime = null;
  for (const r of runs) {
    if (!longest || r.distanceM > longest.distanceM) longest = r;
    if (!longestTime || r.durationMs > longestTime.durationMs) longestTime = r;
    if (r.distanceM >= 1000 && Number.isFinite(r.avgPaceSec)) {
      if (!fastest || r.avgPaceSec < fastest.avgPaceSec) fastest = r;
    }
  }
  return { longest, fastest, longestTime };
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 이번 달 일별 거리(km) */
export function seriesDaily(runs, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const values = new Array(days).fill(0);
  for (const r of runs) {
    if (sameMonth(r.startedAt, y, m)) values[new Date(r.startedAt).getDate() - 1] += (r.distanceM || 0) / 1000;
  }
  const today = now.getDate();
  return values.map((v, i) => ({
    label: String(i + 1),
    tooltip: `${m + 1}월 ${i + 1}일`,
    value: v,
    current: i + 1 === today,
  }));
}

/** 최근 N주 주별 거리(km) — 월요일 시작 */
export function seriesWeekly(runs, weeks = 12, now = new Date()) {
  const today = startOfDay(now);
  const dow = (today.getDay() + 6) % 7; // 월=0
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - dow);
  const starts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() - i * 7);
    starts.push(d);
  }
  const values = new Array(weeks).fill(0);
  const firstStart = starts[0].getTime();
  for (const r of runs) {
    if (r.startedAt < firstStart) continue;
    for (let i = weeks - 1; i >= 0; i--) {
      if (r.startedAt >= starts[i].getTime()) {
        values[i] += (r.distanceM || 0) / 1000;
        break;
      }
    }
  }
  return starts.map((d, i) => ({
    label: `${d.getMonth() + 1}/${d.getDate()}`,
    tooltip: `${d.getMonth() + 1}월 ${d.getDate()}일 주간`,
    value: values[i],
    current: i === weeks - 1,
  }));
}

/** 최근 N개월 월별 거리(km) */
export function seriesMonthly(runs, months = 12, now = new Date()) {
  const items = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    items.push({ y: d.getFullYear(), m: d.getMonth(), value: 0 });
  }
  for (const r of runs) {
    const d = new Date(r.startedAt);
    const item = items.find((it) => it.y === d.getFullYear() && it.m === d.getMonth());
    if (item) item.value += (r.distanceM || 0) / 1000;
  }
  return items.map((it, i) => ({
    label: `${it.m + 1}월`,
    tooltip: `${it.y}년 ${it.m + 1}월`,
    value: it.value,
    current: i === months - 1,
  }));
}
