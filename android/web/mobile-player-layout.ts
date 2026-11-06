/** Keep floating audio above both navigation rows and the changing status footer. */
export function watchMobilePlayerLayout(modeRail:HTMLElement,nav:HTMLElement,status:HTMLElement){
 const place=()=>{const top=Math.min(modeRail.getBoundingClientRect().top,nav.getBoundingClientRect().top);
  document.body.style.setProperty('--mobile-player-bottom',Math.max(0,innerHeight-top)+8+'px');};
 const observer=new ResizeObserver(place);
 for(const element of [modeRail,nav,status])observer.observe(element);
 window.addEventListener('resize',place);place();
 return()=>{observer.disconnect();window.removeEventListener('resize',place);};
}
