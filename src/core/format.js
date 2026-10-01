/**
 * 표시 형식 변환 (순수 함수 — DOM/브라우저 API 사용 안 함)
 */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 초/km → "분:초" (예: 330 → "5:30")
 * @param {number|null} sec
 * @param {{unit?: boolean, placeholder?: string}} [opts]
 */
export function formatPace(sec, { unit = false, placeholder = '--:--' } = {}) {
  const suffix = unit ? '/km' : '';
  if (!Number.isFinite(sec) || sec <= 0 || sec >= 100 * 60) return placeholder + suffix;
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}${suffix}`;
}

/** 페이스를 음성으로 읽기 좋은 형태로 (330 → "5분 30초") */
export function paceToSpeech(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/**
 * 밀리초 → "mm:ss" 또는 "h:mm:ss"
 * @param {number} ms
 * @param {{forceHours?: boolean}} [opts]
 */
export function formatDuration(ms, { forceHours = false } = {}) {
  const totalSec = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0 || forceHours) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/** 밀리초 → "1시간 5분", "32분 10초" (요약/음성용) */
export function formatDurationWords(ms) {
  const totalSec = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}

/** 누적 시간 (통계용, 예: "12시간 30분") */
export function formatTotalDuration(ms) {
  const totalMin = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 60000) : 0;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

/**
 * 미터 → km 문자열. 러닝 앱 관례대로 반올림이 아니라 내림합니다.
 * (0.999km 를 1.00km 로 보여주지 않기 위해)
 */
export function formatDistanceKm(meters, decimals = 2) {
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  const factor = 10 ** decimals;
  const km = Math.floor((m / 1000) * factor + 1e-9) / factor;
  return km.toFixed(decimals);
}

/** 거리 음성 표현 (5230 → "5.2킬로미터") */
export function distanceToSpeech(meters) {
  const km = (Math.floor(((meters || 0) / 1000) * 10) / 10).toFixed(1);
  return `${km.endsWith('.0') ? km.slice(0, -2) : km}킬로미터`;
}

/** km/h → "12.3" */
export function formatSpeed(kmh, placeholder = '--.-') {
  if (!Number.isFinite(kmh) || kmh <= 0) return placeholder;
  return kmh.toFixed(1);
}

/** kcal → 정수 문자열 */
export function formatCalories(kcal) {
  if (!Number.isFinite(kcal) || kcal <= 0) return '0';
  return Math.round(kcal).toLocaleString('ko-KR');
}

/** 목표 대비 차이 (초) → "+12초", "-5초" */
export function formatDiffSec(diff) {
  if (!Number.isFinite(diff)) return '--';
  const r = Math.round(diff);
  if (r === 0) return '±0초';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}초`;
}

/**
 * 사용자가 입력한 목표 페이스 문자열을 초로 변환
 * 허용 형식: "5:30", "5'30", "5.30", "5분30초", "5분 30초", "530", "0530", "6분"
 * @returns {{ok: true, sec: number} | {ok: false, error: string}}
 */
export function parsePace(input, { min = 150, max = 900 } = {}) {
  const fail = (error) => ({ ok: false, error });
  if (input === null || input === undefined) return fail('목표 페이스를 입력하세요.');
  const s = String(input)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\/km$/i, '')
    .replace(/[″"]/g, '')
    .replace(/[′’]/g, "'");
  if (!s) return fail('목표 페이스를 입력하세요.');

  let minutes;
  let seconds;
  let match = s.match(/^(\d{1,2})[:'.분](\d{1,2})초?$/);
  if (match) {
    minutes = Number(match[1]);
    seconds = Number(match[2]);
  } else if ((match = s.match(/^(\d{1,2})분$/))) {
    minutes = Number(match[1]);
    seconds = 0;
  } else if ((match = s.match(/^(\d{3,4})$/))) {
    minutes = Number(match[1].slice(0, -2));
    seconds = Number(match[1].slice(-2));
  } else {
    return fail('형식이 올바르지 않습니다. 예: 5:30');
  }

  if (seconds >= 60) return fail('초는 0~59 사이로 입력하세요.');
  const total = minutes * 60 + seconds;
  if (total < min || total > max) {
    return fail(`목표 페이스는 ${formatPace(min)} ~ ${formatPace(max)} 사이로 입력하세요.`);
  }
  return { ok: true, sec: total };
}

const dateFmt = safeDateFormat({ year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const timeFmt = safeDateFormat({ hour: 'numeric', minute: '2-digit' });
const shortDateFmt = safeDateFormat({ month: 'numeric', day: 'numeric', weekday: 'short' });

function safeDateFormat(options) {
  try {
    return new Intl.DateTimeFormat('ko-KR', options);
  } catch {
    return { format: (d) => d.toLocaleString() };
  }
}

/** "2026년 10월 1일 (목)" */
export function formatDate(ts) {
  return dateFmt.format(new Date(ts));
}

/** "오전 7:12" */
export function formatTime(ts) {
  return timeFmt.format(new Date(ts));
}

/** "10. 1. (목)" */
export function formatDateShort(ts) {
  return shortDateFmt.format(new Date(ts));
}

/** "2026년 10월" */
export function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}
