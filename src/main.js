import { Game } from './core/Game.js';

const startEl = document.getElementById('start');
const errorEl = document.getElementById('start-error');

try {
  const game = new Game(document.getElementById('game'));
  window.TGIT = game; // handy for poking at things from the console
  game.renderer.render(game.scene, game.camera);
  document.getElementById('start-btn').addEventListener('click', () => {
    startEl.classList.add('hidden');
    game.input.requestLock();
    game.start();
    game.toast('Pick up trash, fill bags, sell them at the dumpster. Press H for controls.', 'info');
  });
} catch (err) {
  console.error(err);
  errorEl.textContent = `Couldn't start the game: ${err.message}. WebGL may be disabled in this browser.`;
}
