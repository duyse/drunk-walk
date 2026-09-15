import { GameApp } from './app/GameApp';
import { Renderer } from './rendering/Renderer';

function boot(): void {
  const noWebgl = document.getElementById('nowebgl')!;
  if (!Renderer.webglAvailable()) {
    noWebgl.classList.add('on');
    return;
  }
  try {
    const app = new GameApp(document.getElementById('c') as HTMLCanvasElement);
    app.boot();
    (window as unknown as { drunkwalk?: GameApp }).drunkwalk = app;
  } catch (err) {
    console.error(err);
    noWebgl.querySelector('h2')!.textContent = 'Something broke';
    noWebgl.querySelector('p')!.textContent = 'The game failed to start. Try reloading or a different browser.';
    noWebgl.classList.add('on');
  }
}

boot();

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
