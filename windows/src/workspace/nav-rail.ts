// Glass navigation rail for the Windows workspace sidebar.
// Wide windows: a floating rail that tucks into an icon column after 4 s without pointer or keyboard focus,
// and opens again on hover or focus. Narrow windows (< 768 px): a floating bottom bar of section icons.
import {h} from '../views/dom';
import './nav-rail.css';

const IDLE_MS = 4000, PIN_KEY = 'anf-rail-pinned';

export function attachNavRail(rail:HTMLElement, layout:HTMLElement) {
  const wide = matchMedia('(min-width:768px)');
  let timer:ReturnType<typeof setTimeout>|undefined;
  let pinned = false;
  try { pinned = localStorage.getItem(PIN_KEY) === '1'; } catch { /* storage can be unavailable */ }
  const pin = h('button',{type:'button',class:'rail-pin','aria-pressed':String(pinned),title:'Keep the sidebar open','aria-label':'Keep the sidebar open'},'Keep open') as HTMLButtonElement;
  rail.prepend(pin);
  rail.classList.add('glass-rail');
  layout.classList.add('has-glass-rail');
  document.body.classList.add('has-glass-rail');
  const paintPinned = () => {
    layout.dataset.railPinned = String(pinned);
    document.body.dataset.railPinned = String(pinned);
  };
  paintPinned();

  const engaged = () => rail.matches(':hover') || rail.contains(document.activeElement);
  const set = (collapsed:boolean) => { rail.dataset.rail = collapsed ? 'collapsed' : 'open'; };
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  function arm() {
    cancel();
    if (!wide.matches || pinned) return;
    timer = setTimeout(() => { timer = undefined; if (!engaged()) set(true); }, IDLE_MS);
  }
  const open = () => { cancel(); set(false); };

  rail.addEventListener('pointerenter', open);
  rail.addEventListener('pointermove', () => { if (rail.dataset.rail === 'collapsed') open(); });
  rail.addEventListener('pointerleave', arm);
  rail.addEventListener('focusin', open);
  rail.addEventListener('focusout', event => { if (!rail.contains(event.relatedTarget as Node|null)) arm(); });
  rail.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.workspace-navigation button[data-view]')) return;
    // A selected section hands focus back to its content. Otherwise the focused
    // sidebar keeps the overlay open and can block that section's own controls.
    const panel = layout.querySelector<HTMLElement>('.workspace-panel:not([hidden])');
    if (panel) {
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      panel.focus({preventScroll:true});
    }
    if (wide.matches && !pinned) { cancel(); set(true); }
  });
  wide.addEventListener('change', () => { set(false); arm(); });
  pin.addEventListener('click', () => {
    pinned = !pinned;
    pin.setAttribute('aria-pressed', String(pinned));
    paintPinned();
    try { localStorage.setItem(PIN_KEY, pinned ? '1' : '0'); } catch { /* the choice lasts for this session */ }
    if (pinned) open(); else arm();
  });

  set(false);
  arm();
}
