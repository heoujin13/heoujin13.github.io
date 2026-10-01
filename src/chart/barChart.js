/**
 * 가벼운 막대 그래프 (Canvas, 외부 라이브러리 없음)
 *
 *  - 고해상도(레티나) 대응, 컨테이너 크기 변화 시 자동 다시 그리기
 *  - 마우스 올리기 / 손가락 탭으로 값 표시
 *  - 색상은 CSS 변수(--chart-*)에서 읽어 다크 모드를 따라감
 */

function niceMax(v) {
  if (!(v > 0)) return 5;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

function roundedTopRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

export class BarChart {
  constructor(canvas, { unit = 'km', decimals = 1 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.unit = unit;
    this.decimals = decimals;
    this.items = [];
    this.selected = -1;
    this._geom = null;

    this._onPointer = (e) => {
      const idx = this._hitIndex(e);
      if (e.type === 'pointerdown' && idx === this.selected) {
        this.selected = -1; // 같은 막대를 다시 탭하면 닫기
      } else if (idx !== -1 || e.type === 'pointerdown') {
        this.selected = idx;
      }
      this.draw();
    };
    this._onLeave = (e) => {
      if (e.pointerType === 'mouse') {
        this.selected = -1;
        this.draw();
      }
    };
    canvas.addEventListener('pointerdown', this._onPointer);
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this._onPointer(e);
    });
    canvas.addEventListener('pointerleave', this._onLeave);

    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this.draw());
      this._ro.observe(canvas);
    }
  }

  setData(items) {
    this.items = Array.isArray(items) ? items : [];
    this.selected = -1;
    this.draw();
  }

  _hitIndex(e) {
    const g = this._geom;
    if (!g || !this.items.length) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < g.left || x > g.left + g.plotW) return -1;
    const idx = Math.floor((x - g.left) / g.slot);
    return idx >= 0 && idx < this.items.length ? idx : -1;
  }

  draw() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return; // 화면에 보이지 않음
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const css = getComputedStyle(canvas);
    const color = (name, fb) => css.getPropertyValue(name).trim() || fb;
    const cBar = color('--chart-bar', '#6b7682');
    const cCurrent = color('--chart-bar-current', '#ffce1f');
    const cGrid = color('--chart-grid', 'rgba(128,128,128,.25)');
    const cText = color('--text-2', '#888');
    const cText1 = color('--text-1', '#111');
    const cTipBg = color('--chart-tip-bg', '#222');
    const cTipText = color('--chart-tip-text', '#fff');
    const font = css.fontFamily || 'sans-serif';

    const left = 36;
    const right = 6;
    const top = 30;
    const bottom = 22;
    const plotW = rect.width - left - right;
    const plotH = rect.height - top - bottom;
    const n = this.items.length;
    if (n === 0 || plotW <= 0 || plotH <= 0) return;

    const maxVal = niceMax(Math.max(...this.items.map((i) => i.value || 0)));
    const slot = plotW / n;
    const gap = Math.max(2, Math.min(10, slot * 0.3));
    const barW = Math.max(2, slot - gap);
    this._geom = { left, plotW, slot };

    // 그리드 + y축 값 (0, 절반, 최대)
    ctx.font = `12px ${font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = cText;
    ctx.strokeStyle = cGrid;
    ctx.lineWidth = 1;
    for (const frac of [0, 0.5, 1]) {
      const y = Math.round(top + plotH - plotH * frac) + 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotW, y);
      ctx.stroke();
      const v = maxVal * frac;
      ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), left - 6, y);
    }

    // 막대
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      const v = it.value || 0;
      if (v <= 0) continue;
      const h = Math.max(2, (v / maxVal) * plotH);
      const x = left + i * slot + (slot - barW) / 2;
      const y = top + plotH - h;
      ctx.fillStyle = it.current ? cCurrent : cBar;
      ctx.globalAlpha = this.selected === -1 || this.selected === i ? 1 : 0.55;
      roundedTopRect(ctx, x, y, barW, h, 4);
    }
    ctx.globalAlpha = 1;

    // x축 라벨 (겹치지 않게 간격 조절)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const maxLabels = Math.max(2, Math.floor(plotW / 38));
    const step = Math.ceil(n / maxLabels);
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      const show = i % step === 0 || (it.current && i % step >= step / 2);
      if (!show) continue;
      ctx.fillStyle = it.current ? cText1 : cText;
      ctx.fillText(it.label, left + i * slot + slot / 2, rect.height - 6);
    }

    // 선택된 막대 값 표시
    if (this.selected >= 0 && this.selected < n) {
      const it = this.items[this.selected];
      const text = `${it.tooltip || it.label}  ${(it.value || 0).toFixed(this.decimals)} ${this.unit}`;
      ctx.font = `600 13px ${font}`;
      const tw = ctx.measureText(text).width + 16;
      const cx = left + this.selected * slot + slot / 2;
      const bx = Math.min(Math.max(cx - tw / 2, 2), rect.width - tw - 2);
      ctx.fillStyle = cTipBg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, 2, tw, 24, 6);
      else ctx.rect(bx, 2, tw, 24);
      ctx.fill();
      ctx.fillStyle = cTipText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 8, 14);
    }
  }

  destroy() {
    this._ro?.disconnect();
    this.canvas.removeEventListener('pointerdown', this._onPointer);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
  }
}
