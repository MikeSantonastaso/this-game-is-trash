import { Game } from './core/Game.js';

const startEl = document.getElementById('start');
const startBtn = document.getElementById('start-btn');
const errorEl = document.getElementById('start-error');

startBtn.disabled = true;
startBtn.textContent = 'Loading 0%';

try {
  const game = await Game.create(document.getElementById('game'), (p) => {
    startBtn.textContent = `Loading ${Math.round(p * 100)}%`;
  });
  window.TGIT = game; // handy for poking at things from the console
  game.graphics.render(0);
  startBtn.disabled = false;
  startBtn.textContent = 'Clock in';
  startBtn.addEventListener('click', () => {
    startEl.classList.add('hidden');
    game.input.requestLock();
    game.start();
    game.toast('Pick up trash, fill bags, sell them at the dumpster. Press H for controls.', 'info');
  });
} catch (err) {
  console.error(err);
  startBtn.textContent = 'Error';
  errorEl.textContent = `Couldn't start the game: ${err.message}. WebGL may be disabled in this browser.`;
}
