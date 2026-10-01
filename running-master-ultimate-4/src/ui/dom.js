/**
 * DOM 도우미
 *
 * setText / setAttr 는 값이 바뀔 때만 실제 DOM 을 건드립니다.
 * (러닝 중 0.5초마다 화면을 갱신해도 불필요한 레이아웃 계산이 생기지 않음)
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const textCache = new WeakMap();
const attrCache = new WeakMap();

export function setText(el, value) {
  if (!el) return;
  const v = value === null || value === undefined ? '' : String(value);
  if (textCache.get(el) === v) return;
  textCache.set(el, v);
  el.textContent = v;
}

export function setAttr(el, name, value) {
  if (!el) return;
  let cache = attrCache.get(el);
  if (!cache) {
    cache = new Map();
    attrCache.set(el, cache);
  }
  const v = value === null || value === undefined ? null : String(value);
  if (cache.get(name) === v) return;
  cache.set(name, v);
  if (v === null) el.removeAttribute(name);
  else el.setAttribute(name, v);
}

export function setHidden(el, hidden) {
  if (el && el.hidden !== !!hidden) el.hidden = !!hidden;
}

/**
 * 요소 생성
 * @param {string} tag
 * @param {object} [props] className, text, attrs, dataset, on
 * @param {Array<Node|string>} [children]
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  if (props.dataset) Object.assign(el.dataset, props.dataset);
  if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** 애니메이션 클래스 재시작 */
export function restartAnimation(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // 리플로우로 애니메이션 재시작
  el.classList.add(className);
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
