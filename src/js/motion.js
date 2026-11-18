// ============================================================================
//  MOTION — anime.js jaisi API, par 6 KB aur zero dependency
// ----------------------------------------------------------------------------
//  anime.js ek animation library hai (framework nahi). Uska site jaisa feel
//  humein chahiye, par CDN script hamare liye nahi chalti:
//    • app offline single-file chalti hai — network se script aayi to offline
//      build me animation gayab;
//    • kisan ka 3G slow hai, 17 KB library + extra request sirf "achha lagta
//      hai" ke liye mehnga padta hai;
//    • in-app preview me external scripts load hi nahi hoti.
//  Isliye wahi API khud likhi — animate(targets, {...}), stagger, timeline,
//  easing curves. requestAnimationFrame + inline transform, koi import nahi.
//
//  Sab kuch prefers-reduced-motion maanta hai: jise motion se dikkat hai, uska
//  screen turant final state me chala jaata hai, animation nahi.
// ============================================================================

export const ease = {
  linear:      p => p,
  outQuad:     p => 1 - (1 - p) * (1 - p),
  outCubic:    p => 1 - Math.pow(1 - p, 3),
  inOutCubic:  p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outExpo:     p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  outBack:     p => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2),
};

const raf = (typeof requestAnimationFrame === 'function')
  ? requestAnimationFrame
  : cb => setTimeout(() => cb(Date.now()), 16);

export function prefersReduced(){
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

const toArray = t =>
  (typeof t === 'string') ? [...document.querySelectorAll(t)]
  : (t && typeof t.length === 'number' && !t.nodeType) ? [...t]
  : t ? [t] : [];

// 0, 40, 80 … — the "one after another" that makes a list look alive.
export function staggers(count, each = 40){
  return Array.from({ length: count }, (_, i) => i * each);
}

// Write one frame of an animation onto an element.
function apply(el, v){
  if (!el || !el.style) return;
  const tr = [];
  if (v.translateY != null) tr.push(`translateY(${v.translateY}px)`);
  if (v.translateX != null) tr.push(`translateX(${v.translateX}px)`);
  if (v.scale != null)      tr.push(`scale(${v.scale})`);
  if (v.rotate != null)     tr.push(`rotate(${v.rotate}deg)`);
  el.style.transform = tr.length ? tr.join(' ') : '';
  if (v.opacity != null) el.style.opacity = String(v.opacity);
}

/**
 * animate(targets, options)
 *   targets  selector | element | array
 *   options  { translateY, translateX, scale, opacity, rotate,
 *              from:{…}, duration=420, delay=0, easing='outCubic',
 *              stagger=0, fill='both', onComplete }
 *   returns  { finished: Promise, stop() }
 * The values in options are the END state; `from` is where it starts.
 */
export function animate(targets, options = {}){
  const els = toArray(targets);
  const {
    duration = 420, delay = 0, easing = 'outCubic', stagger = 0,
    from = {}, onComplete,
  } = options;
  const fn = typeof easing === 'function' ? easing : (ease[easing] || ease.outCubic);

  const keys = ['translateY', 'translateX', 'scale', 'opacity', 'rotate']
    .filter(k => options[k] != null || from[k] != null);
  const start = {};
  const end = {};
  for (const k of keys){
    start[k] = from[k] != null ? from[k] : (k === 'opacity' ? 1 : k === 'scale' ? 1 : 0);
    end[k]   = options[k] != null ? options[k] : (k === 'opacity' ? 1 : k === 'scale' ? 1 : 0);
  }

  if (!els.length || prefersReduced()){
    els.forEach(el => apply(el, end));
    if (onComplete) onComplete();
    return { finished: Promise.resolve(), stop(){} };
  }

  let stopped = false;
  let resolveDone;
  const finished = new Promise(res => { resolveDone = res; });
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const frame = now => {
    if (stopped) return;
    let done = true;
    els.forEach((el, i) => {
      const d = typeof stagger === 'function' ? stagger(i) : stagger * i;
      const p = Math.min(1, Math.max(0, (now - t0 - delay - d) / duration));
      if (p < 1) done = false;
      const e = fn(p);
      const v = {};
      for (const k of keys) v[k] = start[k] + (end[k] - start[k]) * e;
      apply(el, v);
    });
    if (done){ if (onComplete) onComplete(); resolveDone(); return; }
    raf(frame);
  };
  raf(frame);

  return {
    finished,
    stop(){ stopped = true; els.forEach(el => apply(el, end)); resolveDone(); },
  };
}

/**
 * timeline([{ targets, ...options, offset }, …])
 * Steps run one after another; `offset` shifts a step earlier (negative) or
 * later (positive) in ms — same idea as anime.js, minus the 400 options.
 */
export function timeline(steps = []){
  const done = [];
  let at = 0;
  for (const step of steps){
    const gap = (step.offset != null) ? step.offset : 0;
    const when = Math.max(0, at + gap);
    done.push(new Promise(res => setTimeout(() => {
      animate(step.targets, step).finished.then(res);       // step N ends before it resolves
    }, when)));
    at = when + (step.duration || 420);
  }
  return Promise.all(done);
}

/**
 * revealView(viewEl) — every card in a view fades up in a 45 ms crawl.
 * Called by the router after each render. Cheap on purpose: one rAF loop,
 * one transform per card, nothing that invalidates layout.
 */
export function revealView(viewEl, { selector = '.card', each = 45 } = {}){
  if (!viewEl) return;
  const cards = [...viewEl.querySelectorAll(selector)];
  if (!cards.length) return;
  animate(cards, {
    from: { opacity: 0, translateY: 14 },
    opacity: 1, translateY: 0,
    duration: 380, easing: 'outCubic', stagger: each,
  });
}

/**
 * countUp(el, to, { duration, format }) — a number that moves reads as a
 * number that was measured. Everything printed here is a real figure; this
 * only changes how it arrives, never what it says.
 */
export function countUp(el, to, { duration = 700, format } = {}){
  if (!el) return;
  const fmt = format || (n => Math.round(n).toLocaleString('en-IN'));
  const target = Number(to) || 0;
  if (prefersReduced()){ el.textContent = fmt(target); return; }
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const step = now => {
    const p = Math.min(1, (now - t0) / duration);
    el.textContent = fmt(target * ease.outCubic(p));
    if (p < 1) raf(step);
    else el.textContent = fmt(target);        // exact, never a rounded drift
  };
  raf(step);
}
