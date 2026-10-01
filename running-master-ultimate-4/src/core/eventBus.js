/**
 * 아주 작은 발행/구독(Pub/Sub) 이벤트 버스.
 * 리스너 하나에서 오류가 나도 다른 리스너와 앱 전체는 계속 동작합니다.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /** 구독. 반환값을 호출하면 구독 해제 */
  on(type, fn) {
    if (typeof fn !== 'function') return () => {};
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] '${type}' 리스너에서 오류가 발생했습니다.`, err);
      }
    }
  }

  clear() {
    this._listeners.clear();
  }
}
