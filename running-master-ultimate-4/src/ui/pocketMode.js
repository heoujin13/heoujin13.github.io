/**
 * 화면 끄기 모드 (포켓 모드)
 *
 * 모바일 브라우저는 전원 버튼으로 화면을 끄면 GPS 수신과 진동을 멈춥니다.
 * (웹 페이지가 화면에 보이지 않을 때 위치·진동을 막는 것은 브라우저 정책이라 웹앱에서는 바꿀 수 없음)
 *
 * 그래서 화면을 '실제로 끄는' 대신
 *   - 화면 전체를 검게 만들고 (OLED 화면은 검은 화소가 꺼진 것과 같아 배터리를 거의 쓰지 않음)
 *   - 주머니 속 오작동을 막기 위해 터치를 잠그고
 *   - 화면 꺼짐 방지(Wake Lock)는 유지해서
 * GPS·페이스 코치·진동·음성이 계속 동작하게 합니다.
 *
 * 가운데 원을 1.5초 길게 누르면 원래 화면으로 돌아옵니다. (PC 에서는 Esc 키)
 */
import { formatDistanceKm, formatDuration } from '../core/format.js';
import { $, setText } from './dom.js';

export class PocketMode {
  constructor({ onEnter, onExit, holdMs = 1500 } = {}) {
    this.el = $('#pocket');
    this.unlockBtn = $('#pocketUnlock');
    this.info = $('#pocketInfo');
    this.distEl = $('#pocketDistance');
    this.timeEl = $('#pocketTime');
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.holdMs = holdMs;
    this.active = false;
    this._holdTimer = null;
    this._moveTimer = null;
    this.lastRenderAt = 0;

    // 잠금 해제: 가운데 원을 길게 누르기
    const btn = this.unlockBtn;
    const cancelHold = () => {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
      btn.classList.remove('is-holding');
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('is-holding');
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        cancelHold();
        this.exit();
      }, this.holdMs);
    });
    btn.addEventListener('pointerup', cancelHold);
    btn.addEventListener('pointercancel', cancelHold);
    btn.addEventListener('pointerleave', cancelHold);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());

    // 그 밖의 터치는 모두 무시 (주머니 속 오작동 방지)
    const block = (e) => {
      if (!this.active) return;
      if (e.target.closest && e.target.closest('#pocketUnlock')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    for (const type of ['pointerdown', 'click', 'dblclick', 'contextmenu']) this.el.addEventListener(type, block);
    this.el.addEventListener('touchmove', (e) => this.active && e.preventDefault(), { passive: false });
    this.el.addEventListener('wheel', (e) => this.active && e.preventDefault(), { passive: false });

    document.addEventListener('keydown', (e) => {
      if (this.active && e.key === 'Escape') this.exit();
    });
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.el.hidden = false;
    document.body.classList.add('pocket-on');
    this.lastRenderAt = 0;
    // 상태 표시줄까지 가리기 (지원하는 브라우저, 사용자 터치 안에서만 동작)
    try {
      const req = document.documentElement.requestFullscreen;
      if (req && !document.fullscreenElement) {
        const p = req.call(document.documentElement, { navigationUI: 'hide' });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      /* 지원하지 않음 */
    }
    // 같은 자리에 오래 표시되지 않도록 1분마다 위치를 조금씩 옮김 (화면 잔상 방지)
    clearInterval(this._moveTimer);
    this._moveTimer = setInterval(() => {
      const y = 12 + Math.floor(Math.random() * 22);
      this.info.style.setProperty('--pocket-y', `${y}%`);
    }, 60000);
    this.unlockBtn.focus({ preventScroll: true });
    this.onEnter?.();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.el.hidden = true;
    document.body.classList.remove('pocket-on');
    clearInterval(this._moveTimer);
    this._moveTimer = null;
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        const p = document.exitFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      /* 무시 */
    }
    this.onExit?.();
  }

  /** 어두운 화면에 거리·시간 표시 (자주 그리지 않음: 5초에 한 번) */
  render(metrics, now = Date.now()) {
    if (!this.active || now - this.lastRenderAt < 5000) return;
    this.lastRenderAt = now;
    setText(this.distEl, formatDistanceKm(metrics.distanceM));
    setText(this.timeEl, formatDuration(metrics.elapsedMs));
  }
}
