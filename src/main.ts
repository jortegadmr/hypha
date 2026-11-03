import './style.css';
import { europeScene, randomScene, spainScene, type Scene } from './geo';
import { Sim, type Layout } from './sim';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('stage');
const labelsEl = $('labels');
const tip = $('tip');
const toast = $('toast');
const panel = $('panel');
const brand = $('brand');
const sub = $('sub');

const SUBTITLES: Record<string, string> = {
  spain: 'A slime mould is wiring up the capitals of Spain. Click to feed it a new city.',
  europe: 'The same mould, set loose on the capitals of Europe. Click to feed it a new city.',
  random: 'Cities scattered at random. The mould finds its own roads. Click to add or remove one.',
};

function showFallback(msg: string): void {
  console.warn(msg);
  $('nogl').hidden = false;
  for (const el of [panel, brand, canvas, labelsEl]) el.hidden = true;
}

function start(): void {
  let sim: Sim;
  try {
    sim = new Sim(canvas);
  } catch (err) {
    showFallback(err instanceof Error ? err.message : String(err));
    return;
  }

  const params = new URLSearchParams(location.search);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  sim.params.reducedMotion = reduced.matches;
  if (params.has('fixed')) sim.adaptive = false;
  const tier = Number(params.get('tier'));
  if (tier > 0) sim.setTier(tier);

  const speedEl = $<HTMLInputElement>('speed');
  const decayEl = $<HTMLInputElement>('decay');
  if (reduced.matches) speedEl.value = '0.7';
  sim.params.speed = Number(speedEl.value);
  sim.params.decay = Number(decayEl.value);

  let presetId = params.get('preset') ?? 'spain';
  if (!(presetId in SUBTITLES)) presetId = 'spain';

  function layout(): Layout {
    const narrow = window.innerWidth < 720;
    const panelRect = panel.getBoundingClientRect();
    document.documentElement.style.setProperty('--panel-h', `${Math.round(panelRect.height + 16)}px`);
    const brandRect = brand.getBoundingClientRect();
    return {
      top: narrow ? brandRect.bottom + 6 : 22,
      bottom: panelRect.height + 34,
      left: narrow ? 8 : 26,
      right: narrow ? 8 : 26,
    };
  }

  function availableAspect(): number {
    const l = layout();
    return (window.innerWidth - l.left - l.right) / Math.max(1, window.innerHeight - l.top - l.bottom);
  }

  function makeScene(id: string): Scene {
    if (id === 'europe') return europeScene();
    if (id === 'random') return randomScene(availableAspect());
    return spainScene();
  }

  function refreshLabels(): void {
    labelsEl.textContent = '';
    const frag = document.createDocumentFragment();
    for (const n of sim.nodes) {
      if (!n.major || !n.name) continue;
      const p = sim.worldToCss(n);
      const s = document.createElement('span');
      s.textContent = n.name;
      s.style.left = `${p.x}px`;
      s.style.top = `${p.y}px`;
      frag.appendChild(s);
    }
    labelsEl.appendChild(frag);
  }

  let toastTimer = 0;
  function say(msg: string): void {
    toast.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function applySize(): void {
    sim.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, layout());
  }

  function loadPreset(id: string): void {
    presetId = id;
    sim.setScene(makeScene(id));
    sub.textContent = SUBTITLES[id];
    document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.preset === id));
    });
    refreshLabels();
  }

  // The scene must exist before the first resize so the fit has a world.
  sim.scene = makeScene(presetId);
  applySize();
  loadPreset(presetId);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const keep = sim.scene!;
      const nodes = sim.nodes.map((n) => ({ ...n }));
      applySize();
      sim.setScene({ ...keep, nodes });
      refreshLabels();
    }, 180);
  });

  reduced.addEventListener('change', () => {
    sim.params.reducedMotion = reduced.matches;
  });

  // ------------------------------------------------------------ controls
  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => loadPreset(b.dataset.preset!));
  });
  speedEl.addEventListener('input', () => (sim.params.speed = Number(speedEl.value)));
  decayEl.addEventListener('input', () => (sim.params.decay = Number(decayEl.value)));
  $('regrow').addEventListener('click', () => {
    sim.regrow();
    say('Regrowing from the cities');
  });
  $('clear').addEventListener('click', () => {
    sim.clearNodes();
    refreshLabels();
    say('No cities left. Click to place the first one.');
  });
  const pauseBtn = $<HTMLButtonElement>('pause');
  const setPaused = (p: boolean): void => {
    sim.params.paused = p;
    pauseBtn.setAttribute('aria-pressed', String(p));
    pauseBtn.textContent = p ? 'Resume' : 'Pause';
  };
  pauseBtn.addEventListener('click', () => setPaused(!sim.params.paused));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      setPaused(!sim.params.paused);
    }
  });

  // ------------------------------------------------------------- pointer
  let down: { x: number; y: number; id: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 10) return;
    const p = sim.cssToWorld(e.clientX, e.clientY);
    const res = sim.toggleNode(p, 16 * sim.worldPerCssPx);
    if (res === 'blocked') say(presetId === 'spain' ? 'Cities need land. Try inland.' : 'No room for more cities.');
    tip.hidden = true;
    refreshLabels();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = sim.cssToWorld(e.clientX, e.clientY);
    const i = sim.nearestNode(p, 18 * sim.worldPerCssPx);
    sim.hover = i;
    const n = i >= 0 ? sim.nodes[i] : null;
    if (n) {
      const c = sim.worldToCss(n);
      tip.hidden = false;
      tip.textContent = n.name ?? 'Your city (click to remove)';
      tip.style.left = `${c.x}px`;
      tip.style.top = `${c.y}px`;
    } else {
      tip.hidden = true;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    sim.hover = -1;
    tip.hidden = true;
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showFallback('WebGL context lost');
  });

  const loop = (now: number): void => {
    sim.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

start();
