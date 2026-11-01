// Boot: load models while the lobby is up, then host / join / play solo.
import { Game } from './core/Game.js';
import { CHARACTERS } from './data/models.js';
import { makeRoomCode, cleanRoomCode } from './net/Net.js';

const $ = (id) => document.getElementById(id);
const startEl = $('start');
const errorEl = $('start-error');
const loading = $('loading');
const buttons = [$('host-btn'), $('solo-btn'), $('join-btn')];

// Remember the player's name and character between visits.
const prefs = (() => { try { return JSON.parse(localStorage.getItem('tgit-player') ?? '{}'); } catch { return {}; } })();
$('name').value = prefs.name ?? '';
let model = prefs.model ?? CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
const chars = $('chars');
const renderChars = () => {
  chars.innerHTML = CHARACTERS.map((c) => `<button class="${c.id === model ? 'on' : ''}" data-id="${c.id}">${c.name}</button>`).join('');
};
renderChars();
chars.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { model = b.dataset.id; renderChars(); } });

const params = new URLSearchParams(location.search);
const invited = cleanRoomCode(params.get('room'));
if (invited) {
  $('code').value = invited;
  $('join-btn').classList.add('primary');
  $('host-btn').classList.remove('primary');
}

let game;
try {
  game = await Game.create($('game'), (p) => { loading.textContent = `Loading ${Math.round(p * 100)}%`; });
  window.TGIT = game; // handy for poking at things from the console
  game.graphics.render(0);
  loading.textContent = invited ? `You were invited to room ${invited}. Hit Join!` : '';
  buttons.forEach((b) => { b.disabled = false; });
} catch (err) {
  console.error(err);
  loading.textContent = '';
  errorEl.textContent = `Couldn't start the game: ${err.message}. WebGL may be disabled in this browser.`;
}

async function go(mode) {
  const name = ($('name').value.trim() || 'Trash Goblin').slice(0, 16);
  try { localStorage.setItem('tgit-player', JSON.stringify({ name, model })); } catch { /* private mode */ }
  let room = null;
  if (mode === 'join') {
    room = cleanRoomCode($('code').value);
    if (!room) { errorEl.textContent = 'Type the room code your friend sent you.'; return; }
  } else if (mode === 'host') room = (params.get('auto') && invited) || makeRoomCode();
  buttons.forEach((b) => { b.disabled = true; });
  game.sfx.unlock();
  try {
    await game.begin({ mode, room, name, model });
  } catch (err) {
    console.error(err);
    errorEl.textContent = `Couldn't connect: ${err.message}`;
    buttons.forEach((b) => { b.disabled = false; });
    return;
  }
  if (mode === 'host') history.replaceState(null, '', `?room=${room}${params.get('net') ? `&net=${params.get('net')}` : ''}`);
  startEl.classList.add('hidden');
  game.input.requestLock();
  game.start();
  if (mode === 'host') game.toast(`You're hosting room ${room}. Send your friends the code or the invite link (top of the screen).`, 'info');
  game.toast('Pick up trash, fill bags, sell them at the dumpster in the Dump-n-Go yard. H for controls.', 'info');
}

$('host-btn').addEventListener('click', () => go('host'));
$('solo-btn').addEventListener('click', () => go('solo'));
$('join-btn').addEventListener('click', () => go('join'));
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') go('join'); });

// Test hook: ?auto=host|solo|join starts without clicking (used by the smoke test).
const auto = params.get('auto');
if (auto && game) go(auto);
