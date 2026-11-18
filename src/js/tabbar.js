// ============================================================================
//  BOTTOM TAB BAR
// ----------------------------------------------------------------------------
//  Ten navigation buttons wrapped into four rows on a phone — that was 26% of
//  the screen spent on a menu, and the first thing anyone notices in a store
//  screenshot. This moves the four everyday tabs into a real bottom bar and
//  puts the rest behind "More".
//
//  The buttons themselves are MOVED, never recreated: the same nodes keep their
//  click handlers, their i18n labels (paintNavLabels looks them up by
//  data-view) and the magic-notch pill keeps measuring real boxes.
// ============================================================================

const PRIMARY = ['sell', 'markets', 'alerts', 'sales'];
const MORE_VIEW = '__more';

export function buildTabBar(){
  const nav = document.getElementById('mainnav');
  if (!nav || nav.dataset.built === '1') return;

  try {
    // ---- the sheet holding the rest --------------------------------------
    const sheet = document.createElement('div');
    sheet.id = 'moresheet';
    sheet.className = 'moresheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'All sections');
    sheet.innerHTML = `
      <div class="msheet-backdrop"></div>
      <div class="msheet-panel">
        <div class="msheet-grab" aria-hidden="true"></div>
        <div class="msheet-title">All sections</div>
        <div class="msheet-grid"></div>
      </div>`;
    document.getElementById('app').appendChild(sheet);

    const grid = sheet.querySelector('.msheet-grid');

    // ---- move everything that is not an everyday tab ---------------------
    nav.querySelectorAll('.navsep').forEach(s => s.remove());
    for (const b of [...nav.querySelectorAll('.navbtn')]){
      if (!PRIMARY.includes(b.dataset.view)) grid.appendChild(b);
    }

    // ---- the "More" tab ---------------------------------------------------
    const more = document.createElement('button');
    more.className = 'navbtn morebtn';
    more.dataset.view = MORE_VIEW;
    more.type = 'button';
    more.innerHTML = '<span class="morelabel">More</span>';
    nav.appendChild(more);

    const open  = () => { sheet.classList.add('open'); more.classList.add('on'); };
    const close = () => { sheet.classList.remove('open'); syncMore(); };

    more.addEventListener('click', () => {
      sheet.classList.contains('open') ? close() : open();
    });
    sheet.querySelector('.msheet-backdrop').addEventListener('click', close);
    // A tab chosen inside the sheet means "take me there" — and the sheet is done.
    grid.addEventListener('click', e => {
      if (e.target.closest('.navbtn')) close();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    // ---- the More tab stays lit while a sheet view is on screen -----------
    function syncMore(){
      const active = document.querySelector('.view.active')?.id?.replace('view-', '');
      const inSheet = active && !PRIMARY.includes(active);
      if (inSheet) more.classList.add('on');
      else if (!sheet.classList.contains('open')) more.classList.remove('on');
    }
    window.addEventListener('km:view-changed', syncMore);
    syncMore();

    nav.dataset.built = '1';
  } catch (e){
    // Navigation is the app. If any of this fails the buttons stay where they
    // were and the app keeps working — just the old layout.
    console.warn('tab bar skipped:', e.message);
  }
}
