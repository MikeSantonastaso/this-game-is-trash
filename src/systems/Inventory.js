// Bag logic. You fill the "current" bag with the picker; when it is full it
// gets tied off and hung on your belt (bagSlots). Sell everything at the dumpster.
// Pure logic, no rendering: each co-op player gets their own Inventory.
const newBag = () => ({ items: [], used: 0, value: 0 });

export class Inventory {
  constructor(getStats) {
    this.getStats = getStats;
    this.current = newBag();
    this.tied = [];
  }

  get capacity() { return this.getStats().bagSize; }
  get slots() { return this.getStats().bagSlots; }
  get hasFreeSlot() { return this.tied.length < this.slots; }
  get isFull() { return this.current.used >= this.capacity && !this.hasFreeSlot; }
  get isEmpty() { return this.current.used === 0 && this.tied.length === 0; }
  get totalValue() { return this.tied.reduce((s, b) => s + b.value, 0) + this.current.value; }

  // Returns { ok, tied, reason }. reason: 'full' when there is nowhere to put it.
  tryAdd(item) {
    let tied = false;
    if (this.current.used + item.space > this.capacity) {
      if (this.current.used > 0 && this.hasFreeSlot) { this.tie(); tied = true; }
      if (this.current.used + item.space > this.capacity) return { ok: false, tied, reason: 'full' };
    }
    this.current.items.push(item.type);
    this.current.used += item.space;
    this.current.value += item.value;
    if (this.current.used >= this.capacity && this.hasFreeSlot) { this.tie(); tied = true; }
    return { ok: true, tied };
  }

  // Tie off the current bag early. Returns false if empty or belt is full.
  tie() {
    if (this.current.used === 0 || !this.hasFreeSlot) return false;
    this.tied.push(this.current);
    this.current = newBag();
    return true;
  }

  // Take one tied bag off the belt (to throw it). Falls back to the current bag.
  popBag() {
    if (this.tied.length) return this.tied.pop();
    if (this.current.used > 0) { const b = this.current; this.current = newBag(); return b; }
    return null;
  }

  // Hang a loose bag back on the belt.
  pushBag(bag) {
    if (!this.hasFreeSlot) return false;
    this.tied.push(bag);
    return true;
  }

  // Empties everything for selling.
  takeAll() {
    const bags = [...this.tied];
    if (this.current.used > 0) bags.push(this.current);
    this.tied = [];
    this.current = newBag();
    return bags;
  }
}
