// The planet's ECG: a sweeping trace drawn into an SVG, like a bedside
// monitor. Rhythm and shape follow the Condition Index state.
// With prefers-reduced-motion the full trace is drawn once and left still.

const W = 1000;
const H = 200;
const MID = 128;
const AMP = 88;
const SWEEP_SECONDS = 4; // time for the head to cross the screen
const GAP = 36; // blank span ahead of the sweep head
const NS = 'http://www.w3.org/2000/svg';

const gauss = (x, mu, sd) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));

// One heartbeat, phase 0..1. Values roughly -0.3..1.2.
function beat(phase, state, amp) {
  const r = state === 'danger' ? 1.15 : 1;
  let v =
    0.12 * gauss(phase, 0.15, 0.025) -
    0.12 * gauss(phase, 0.27, 0.008) +
    r * amp * gauss(phase, 0.3, 0.01) -
    0.25 * gauss(phase, 0.325, 0.01) +
    (state === 'danger' ? 0.4 : 0.28) * gauss(phase, 0.5, 0.045);
  // Danger: raised segment between the spike and the T wave.
  if (state === 'danger' && phase > 0.33 && phase < 0.47) v += 0.1;
  return v;
}

export function mountEcg(svg, { state = 'stable', bpm = 72 } = {}) {
  svg.replaceChildren();
  const grid = document.createElementNS(NS, 'g');
  grid.setAttribute('class', 'grid');
  for (let x = 0; x <= W; x += 50) grid.append(line(x, 0, x, H));
  for (let y = 0; y <= H; y += 50) grid.append(line(0, y, W, y));
  svg.append(grid);

  const pathA = document.createElementNS(NS, 'path');
  const pathB = document.createElementNS(NS, 'path');
  for (const p of [pathA, pathB]) {
    p.setAttribute('class', 'beat');
    p.setAttribute('stroke', 'currentColor');
    svg.append(p);
  }
  svg.classList.remove('is-stable', 'is-caution', 'is-danger');
  svg.classList.add(`is-${state}`);

  const ys = new Float32Array(W + 1).fill(MID);
  const pxPerSecond = W / SWEEP_SECONDS;
  let interval = 60 / bpm;
  let amp = 1;
  let t = 0; // seconds into the current beat
  let head = 0;

  // Advance the waveform by one x unit and return its y.
  const step = () => {
    t += 1 / pxPerSecond;
    if (t >= interval) {
      t -= interval;
      // Caution: irregular beats. Danger: faster and less variable.
      const jitter = state === 'caution' ? 0.14 : state === 'danger' ? 0.05 : 0.02;
      interval = (60 / bpm) * (1 + (Math.random() * 2 - 1) * jitter);
      amp = 1 + (Math.random() * 2 - 1) * (state === 'caution' ? 0.12 : 0.04);
    }
    return MID - beat(t / interval, state, amp) * AMP;
  };

  const draw = () => {
    const split = Math.floor(head);
    pathA.setAttribute('d', toPath(ys, 0, split));
    pathB.setAttribute('d', toPath(ys, Math.min(W, split + GAP), W));
  };

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  if (still.matches) {
    for (let x = 0; x <= W; x++) ys[x] = step();
    head = W;
    pathA.setAttribute('d', toPath(ys, 0, W));
    pathB.setAttribute('d', '');
    return () => {};
  }

  let last = performance.now();
  let frame = 0;
  let visible = true;
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let n = Math.round(dt * pxPerSecond);
    while (n-- > 0) {
      head = (head + 1) % (W + 1);
      ys[Math.floor(head)] = step();
    }
    draw();
    frame = visible ? requestAnimationFrame(tick) : 0;
  };
  // Pause when the monitor scrolls out of view.
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
  });
  io.observe(svg);
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); io.disconnect(); };
}

function toPath(ys, from, to) {
  if (to - from < 2) return '';
  let d = `M${from} ${ys[from].toFixed(1)}`;
  for (let x = from + 1; x <= to; x++) d += `L${x} ${ys[x].toFixed(1)}`;
  return d;
}

function line(x1, y1, x2, y2) {
  const l = document.createElementNS(NS, 'line');
  Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.setAttribute(k, v));
  return l;
}
