// ============================================================================
//  MAGIC NOTCH — the little green capsule that slides under the active tab.
// ----------------------------------------------------------------------------
//  The nav is plain buttons. This puts one pill behind them that springs from
//  tab to tab, with a notch scalloped out of its bottom edge and a knob that
//  squashes as it lands — the "magic notch" transition, done with a mask and a
//  transform so it costs nothing on a ₹6,000 phone.
//
//  Rules it follows:
//    • position is measured, never guessed — the pill follows the real button,
//      so a longer Hindi label or a hidden mandi tab cannot break it
//    • it is decoration only: the buttons stay the controls (keyboard, screen
//      readers and every existing test are untouched)
//    • prefers-reduced-motion → no travel, no squash, just a fade
// ============================================================================
const REDUCED = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

let nav = null, glide = null, knob = null, lastView = null;

function ensure(){
  if (glide && document.contains(glide)) return true;
  nav = document.getElementById('mainnav');
  if (!nav) return false;
  glide = nav.querySelector('.navglide');
  if (!glide){
    glide = document.createElement('span');
    glide.className = 'navglide';
    glide.setAttribute('aria-hidden', 'true');
    glide.innerHTML = '<i class="navknob"></i>';
    nav.prepend(glide);
  }
  knob = glide.querySelector('.navknob');
  return true;
}

function activeButton(view){
  if (view) return nav.querySelector(`.navbtn[data-view="${view}"]`);
  return nav.querySelector('.navbtn.on') || nav.querySelector('.navbtn');
}

// Put the pill under a tab. `animate` false = first paint, no slide.
export function placeNavGlide(view, { animate = true } = {}){
  if (!ensure()) return;
  const btn = activeButton(view);
  if (!btn || btn.style.display === 'none' || !btn.offsetWidth){
    glide.style.opacity = '0';
    return;
  }
  const r = btn.getBoundingClientRect();
  const n = nav.getBoundingClientRect();
  const first = glide.style.opacity !== '1';

  if (first || !animate || REDUCED) glide.classList.add('instant');
  glide.style.opacity = '1';
  glide.style.width = `${r.width}px`;
  glide.style.height = `${r.height}px`;
  glide.style.top = `${r.top - n.top}px`;
  glide.style.transform = `translateX(${r.left - n.left}px)`;

  if (first || !animate || REDUCED){
    // next frame the transition is allowed again
    requestAnimationFrame(() => glide.classList.remove('instant'));
    return;
  }

  // landing squash, re-triggered on every move
  glide.classList.remove('land');
  void glide.offsetWidth;
  glide.classList.add('land');
  if (knob){
    knob.classList.remove('flick');
    void knob.offsetWidth;
    knob.classList.add('flick');
  }
}

export function mountNavGlide(){
  if (!ensure()) return;
  placeNavGlide(null, { animate: false });

  // Widths change with language, role and window size — re-measure, never guess.
  if (typeof ResizeObserver === 'function'){
    const ro = new ResizeObserver(() => placeNavGlide(null, { animate: false }));
    ro.observe(nav);
    nav.querySelectorAll('.navbtn').forEach(b => ro.observe(b));
  } else {
    window.addEventListener('resize', () => placeNavGlide(null, { animate: false }));
  }
  window.addEventListener('orientationchange', () => placeNavGlide(null, { animate: false }));
  document.addEventListener('km:role-changed', () => placeNavGlide(null, { animate: false }));
  document.addEventListener('km:lang-changed', () => placeNavGlide(null, { animate: false }));
}

// ui.show() calls this through the window hook, so ui.js keeps zero imports.
if (typeof window !== 'undefined'){
  window.kmNavGlide = view => {
    if (view === lastView) { placeNavGlide(view, { animate: false }); return; }
    lastView = view;
    placeNavGlide(view, { animate: true });
  };
}
