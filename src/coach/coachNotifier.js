/**
 * 코치 알림 전달자
 *
 * PaceCoach 의 판정('alert', 'recovered')을 받아
 * 사용자 설정에 따라 진동(VibrationManager)과 음성(VoiceManager)으로 전달합니다.
 *
 *   PaceCoach ──alert──▶ CoachNotifier ──▶ VibrationManager
 *                                       └─▶ VoiceManager
 *                                       └─▶ 화면 깜빡임 콜백
 */
import { RECOVERED_SPEECH, alertSpeech } from './coachMessages.js';

export class CoachNotifier {
  /**
   * @param {object} deps
   * @param {import('./paceCoach.js').PaceCoach} deps.coach
   * @param {import('../vibration/vibrationManager.js').VibrationManager} deps.vibration
   * @param {import('../voice/voiceManager.js').VoiceManager} deps.voice
   * @param {() => object} deps.getSettings 현재 코치 설정 ({vibration, voice, voiceRecovered})
   * @param {(alert: object) => void} [deps.onVisual] 화면 강조 콜백
   */
  constructor({ coach, vibration, voice, getSettings, onVisual }) {
    this.vibration = vibration;
    this.voice = voice;
    this.getSettings = getSettings;
    this.onVisual = onVisual;
    this.log = []; // 최근 알림 기록 (디버그용)
    this._offs = [
      coach.on('alert', (a) => this.handleAlert(a)),
      coach.on('recovered', (e) => this.handleRecovered(e)),
    ];
  }

  handleAlert(alert) {
    const s = this.getSettings() || {};
    let vibrated = false;
    if (s.vibration !== false) {
      const pattern =
        alert.type === 'slow'
          ? alert.severity === 'strong' ? 'slowStrong' : 'slow'
          : alert.severity === 'strong' ? 'fastStrong' : 'fast';
      vibrated = this.vibration.play(pattern);
    }
    let spoke = false;
    if (s.voice) {
      spoke = this.voice.speak(alertSpeech(alert), { interrupt: true });
    }
    this.log.push({ ...alert, vibrated, spoke });
    if (this.log.length > 50) this.log.shift();
    try {
      this.onVisual?.(alert);
    } catch (err) {
      console.error('[CoachNotifier] 화면 알림 오류', err);
    }
  }

  handleRecovered() {
    const s = this.getSettings() || {};
    if (s.voice && s.voiceRecovered) this.voice.speak(RECOVERED_SPEECH);
    try {
      this.onVisual?.({ type: 'recovered' });
    } catch {
      /* 무시 */
    }
  }

  destroy() {
    this._offs.forEach((off) => off());
  }
}
