// UI-only preferences. Never writes farm, price, sale or account data.
const expanded = new Map();
export function detailOpen(key, desktopDefault = false){
  if(expanded.has(key)) return expanded.get(key) ? 'open' : '';
  return desktopDefault && typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches ? 'open' : '';
}
if(typeof document !== 'undefined'){
  document.addEventListener('toggle', event => {
    const el = event.target;
    if(el?.matches?.('details[data-km-detail]')) expanded.set(el.dataset.kmDetail, el.open);
  }, true);
  const mountStatus = () => {
    if(document.getElementById('kmConnection')) return;
    const status = document.createElement('div');
    status.id = 'kmConnection';
    status.className = 'km-connection';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.innerHTML = '<span class="km-connection-dot" aria-hidden="true"></span><span data-i18n="ui.offline">Offline — saved information only. New prices need internet.</span>';
    const update=()=>{ status.hidden = navigator.onLine !== false; };
    update();
    (document.getElementById('app') || document.body).prepend(status);
    window.addEventListener('online',update);
    window.addEventListener('offline',update);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mountStatus,{once:true});
  else mountStatus();
}
