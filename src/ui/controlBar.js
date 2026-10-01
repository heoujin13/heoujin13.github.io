/**
 * 러닝 조작 버튼 (시작 / 일시정지 / 재개 / 랩 / 종료)
 *
 *  - 연타 방지: 같은 동작이 처리 중이거나 직전 0.7초 안이면 무시
 *  - 종료는 실수 방지를 위해 '길게 누르기'(1초). 키보드로 누르면 확인 대화상자
 */
import { UI_CONFIG } from '../core/config.js';
import { createActionGuard } from '../core/utils.js';
import { $, setAttr } from './dom.js';

export class ControlBar {
  constructor({ onStart, onPause, onResume, onLap, onFinish, onFinishConfirm, onHint }) {
    this.root = $('#controlBar');
    this.btn = {
      start: $('#btnStart'),
      pause: $('#btnPause'),
      resume: $('#btnResume'),
      lap: $('#btnLap'),
      finish: $('#btnFinish'),
    };
    const guard = createActionGuard(UI_CONFIG.actionLockMs);
    const lapGuard = createActionGuard(1000);

    this.btn.start.addEventListener('click', () => guard(onStart));
    this.btn.pause.addEventListener('click', () => guard(onPause));
    this.btn.resume.addEventListener('click', () => guard(onResume));
    this.btn.lap.addEventListener('click', () => lapGuard(onLap));

    // 종료: 길게 누르기
    const fin = this.btn.finish;
    let timer = null;
    let completed = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      fin.classList.remove('is-holding');
    };
    fin.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      completed = false;
      fin.classList.add('is-holding');
      try {
        fin.setPointerCapture?.(e.pointerId);
      } catch {
        /* 무시 */
      }
      timer = setTimeout(() => {
        timer = null;
        completed = true;
        fin.classList.remove('is-holding');
        guard(onFinish);
      }, UI_CONFIG.finishHoldMs);
    });
    fin.addEventListener('pointerup', () => {
      if (timer) onHint?.('종료하려면 버튼을 길게 누르세요.');
      cancel();
    });
    fin.addEventListener('pointercancel', cancel);
    fin.addEventListener('lostpointercapture', () => {
      if (!completed) cancel();
    });
    fin.addEventListener('contextmenu', (e) => e.preventDefault());
    fin.addEventListener('click', (e) => {
      // 키보드(Enter/Space)로 누른 경우 → 확인 대화상자
      if (e.detail === 0) guard(onFinishConfirm);
    });
  }

  setState(state, pauseReason) {
    const key = state === 'finished' ? 'idle' : state;
    setAttr(this.root, 'data-state', key);
    setAttr(this.root, 'data-pause', state === 'paused' ? pauseReason : null);
  }

  setStarting(starting) {
    this.btn.start.disabled = !!starting;
    this.btn.start.setAttribute('aria-busy', starting ? 'true' : 'false');
  }
}
