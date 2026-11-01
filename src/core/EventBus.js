// Minimal pub/sub so systems talk without importing each other.
// Event names are 'domain:action' strings, e.g. 'money:changed', 'trash:collected'.
export class EventBus {
  constructor() { this.listeners = new Map(); }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) { this.listeners.get(event)?.delete(fn); }
  emit(event, payload) {
    for (const fn of this.listeners.get(event) ?? []) fn(payload);
  }
}
