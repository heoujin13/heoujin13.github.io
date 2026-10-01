/**
 * 진행 중인 러닝 백업
 *
 * 브라우저가 갑자기 종료되거나 새로고침되어도 러닝을 이어갈 수 있도록
 * 주기적으로(기본 15초) 상태를 저장합니다. GPS 가 들어올 때마다 저장하지 않으므로
 * localStorage 에 과도하게 접근하지 않습니다.
 */
const KEY = 'active';
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24시간 지난 백업은 무시

export class ActiveRunStore {
  constructor(storage) {
    this.storage = storage;
    this.lastSavedAt = 0;
  }

  save(snapshot) {
    const r = this.storage.setJSON(KEY, snapshot);
    if (r.ok) this.lastSavedAt = Date.now();
    return r;
  }

  load() {
    const data = this.storage.getJSON(KEY, null);
    if (!data || data.v !== 1 || !data.timer) return null;
    if (!Number.isFinite(data.savedAt) || Date.now() - data.savedAt > MAX_AGE_MS) {
      this.clear();
      return null;
    }
    if (data.state !== 'running' && data.state !== 'paused') return null;
    return data;
  }

  clear() {
    this.storage.remove(KEY);
    this.lastSavedAt = 0;
  }
}
