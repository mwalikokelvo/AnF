// Keep the same live input reachable when the short-window header is compact.
// Moving one node preserves all existing project loads, autosave and listeners.
export function attachResponsiveProjectName(field:HTMLInputElement,header:HTMLElement,settings:HTMLElement){
 const compact=matchMedia('(max-width:767px) and (max-height:640px)');
 const update=()=>{
  const focused=document.activeElement===field;
  const start=field.selectionStart,end=field.selectionEnd;
  settings.hidden=!compact.matches;
  const destination=compact.matches?settings:header;
  if(field.parentElement!==destination){
   if(compact.matches)destination.append(field);else destination.prepend(field);
   if(focused&&field.getClientRects().length){field.focus({preventScroll:true});if(start!==null&&end!==null)field.setSelectionRange(start,end);}
  }
 };
 compact.addEventListener('change',update);update();
 return ()=>compact.removeEventListener('change',update);
}
