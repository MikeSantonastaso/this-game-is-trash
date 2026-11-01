// localStorage persistence. Wrapped in try/catch because storage can be
// unavailable (private windows, blocked site data). The game still runs without it.
const KEY = 'this-game-is-trash/save';
export const SAVE_VERSION = 1;

export const SaveSystem = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.version === SAVE_VERSION ? data : null;
    } catch { return null; }
  },
  save(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ version: SAVE_VERSION, ...state })); return true; }
    catch { return false; }
  },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};
