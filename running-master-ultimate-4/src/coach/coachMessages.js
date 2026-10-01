/**
 * 페이스 코치 문구 (화면 / 음성)
 * 문구를 바꾸거나 다국어를 추가할 때는 이 파일만 수정하면 됩니다.
 */
import { COACH_ZONE } from './paceCoach.js';

/** 화면에 표시할 상태 문구 */
export function zoneHeadline(state, runState = 'idle') {
  if (!state) return { title: '', detail: '' };
  switch (state.zone) {
    case COACH_ZONE.OFF:
      return { title: '페이스 코치 꺼짐', detail: '설정에서 코치를 켤 수 있습니다' };
    case COACH_ZONE.IDLE:
      return {
        title: runState === 'finished' ? '러닝 완료' : '목표 페이스로 달려 보세요',
        detail: '시작하면 목표에서 벗어날 때 진동으로 알려 드립니다',
      };
    case COACH_ZONE.PAUSED:
      return { title: '일시정지', detail: '재개하면 코칭을 이어갑니다' };
    case COACH_ZONE.WAITING:
      return {
        title: '페이스 측정 중',
        detail:
          state.graceLeftSec > 0
            ? `${state.graceLeftSec}초 뒤부터 목표 페이스와 비교합니다`
            : 'GPS로 속도를 확인하고 있습니다',
      };
    case COACH_ZONE.ON:
      return { title: '목표 페이스 유지', detail: '지금 속도를 유지하세요' };
    case COACH_ZONE.SLOW:
      return {
        title: state.severity === 'strong' ? '목표보다 많이 느림' : '목표보다 느림',
        detail: '페이스를 조금 올리세요',
      };
    case COACH_ZONE.FAST:
      return {
        title: state.severity === 'strong' ? '목표보다 많이 빠름' : '목표보다 빠름',
        detail: '페이스를 조금 낮추세요',
      };
    default:
      return { title: '', detail: '' };
  }
}

/** 이탈 알림 음성 문구 */
export function alertSpeech(alert) {
  const n = Math.abs(Math.round(alert.diffSec));
  if (alert.type === 'slow') {
    return alert.severity === 'strong'
      ? `페이스를 올리세요. 목표보다 ${n}초 느립니다.`
      : '페이스를 조금 올리세요.';
  }
  return alert.severity === 'strong'
    ? `페이스를 낮추세요. 목표보다 ${n}초 빠릅니다.`
    : '페이스를 조금 낮추세요.';
}

export const RECOVERED_SPEECH = '좋아요. 목표 페이스입니다.';
