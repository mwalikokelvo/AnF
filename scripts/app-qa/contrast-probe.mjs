// Pixel-accurate WCAG text contrast for the browser fixture. For every visible text run it records the computed text
// colour, hides all text, screenshots the page, and measures the real background under the run (so gradients, glass
// blur and cover art count, unlike a computed-style walk). Text covered by something else (the status bar, the
// rail overlay) is skipped. Disabled controls are exempt (WCAG 1.4.3). Browser fixture, not the installed app.
export const collect=()=>{
  const cv=document.createElement('canvas');cv.width=cv.height=1;const cx=cv.getContext('2d',{willReadFrequently:true});
  const rgba=c=>{cx.clearRect(0,0,1,1);cx.fillStyle='#000';cx.fillStyle=c;cx.fillRect(0,0,1,1);const d=cx.getImageData(0,0,1,1).data;return[d[0],d[1],d[2],d[3]/255]};
  const sel=el=>{const p=[];while(el&&el.nodeType===1&&p.length<3){let s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.classList.length)s+='.'+[...el.classList].slice(0,2).join('.');p.unshift(s);el=el.parentElement}return p.join('>')};
  const vis=el=>{for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0||e.hidden)return false}return true};
  const out=[];const seen=new Set();const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let tn;
  while(tn=w.nextNode()){const t=tn.textContent.trim();if(!t)continue;const el=tn.parentElement;if(!el||seen.has(el)||['SCRIPT','STYLE','OPTION'].includes(el.tagName)||!vis(el))continue;seen.add(el);
    const d=el.closest('dialog');if(d&&!d.open)continue;
    {let hiddenInDetails=false;for(let n=el.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS'&&!n.open&&!el.closest('summary')){hiddenInDetails=true;break;}if(hiddenInDetails)continue;} // a closed <details> does not paint its content
    const rg=document.createRange();rg.selectNodeContents(tn);const r=rg.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue;
    // text clipped away by a scrolling or overflow-hidden ancestor is not visible
    {const cx0=r.left+r.width/2,cy0=r.top+r.height/2;let clipped=false;for(let a=el.parentElement;a&&a!==document.documentElement;a=a.parentElement){const o=getComputedStyle(a);if(o.overflowX==='visible'&&o.overflowY==='visible')continue;const ar=a.getBoundingClientRect();if(cx0<ar.left||cx0>ar.right||cy0<ar.top||cy0>ar.bottom){clipped=true;break;}}if(clipped)continue;}
    const top=document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));if(!top||!(top===el||el.contains(top)||top.contains(el)))continue;
    const bar=document.querySelector('.activity-bar');if(bar&&!el.closest('.activity-bar')){const b=bar.getBoundingClientRect();if(r.bottom>b.top&&r.top<b.bottom&&r.right>b.left&&r.left<b.right)continue;} // the status bar ignores the pointer but still paints over scrolled content
    const s=getComputedStyle(el);let op=1;for(let e=el;e;e=e.parentElement)op*=+getComputedStyle(e).opacity;const f=rgba(s.color);
    out.push({sel:sel(el),t:t.slice(0,30),x:Math.max(0,r.left),y:Math.max(0,r.top),w:Math.min(r.width,innerWidth-r.left),h:Math.min(r.height,innerHeight-r.top),fg:[f[0],f[1],f[2],f[3]*op],px:parseFloat(s.fontSize),bold:+s.fontWeight>=700,dis:!!el.closest(':disabled,[aria-disabled=true]'),rail:!!el.closest('.history-sidebar')});}
  return out;};
const HIDE='*,*::before,*::after{transition:none!important;animation:none!important;color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}input::placeholder,textarea::placeholder{color:transparent!important}';
// Returns every text run in the current viewport with its worst-case contrast ratio and the ratio it needs.
// A run only counts when it fails twice, 250ms apart, so a transition caught mid-way cannot fail the check.
export async function measure(page,opts={}){const first=await measureOnce(page,opts);if(!first.length)return first;await page.waitForTimeout(250);const again=new Set((await measureOnce(page,opts)).map(r=>r.sel+'|'+r.t));return first.filter(r=>again.has(r.sel+'|'+r.t));}
async function measureOnce(page,{onlyRail=false}={}){
  // let finite transitions and animations (hover, focus, panel fades) finish so the text positions match the screenshot
  await page.evaluate(()=>Promise.race([Promise.all(document.getAnimations().filter(a=>a.effect&&a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,1500))]));
  const items=(await page.evaluate(collect)).filter(i=>onlyRail?i.rail:true);
  const handle=await page.evaluateHandle(css=>{const st=document.createElement('style');st.textContent=css;document.head.append(st);return st;},HIDE);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); // the style must be painted (no colour transition left) before the screenshot
  const png=(await page.screenshot()).toString('base64');
  await handle.evaluate(st=>st.remove());await handle.dispose();
  const res=await page.evaluate(async({png,items})=>{
    const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
    const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
    return items.map(it=>{const W=Math.max(1,Math.round(it.w)),H=Math.max(1,Math.round(it.h));const d=x.getImageData(Math.round(it.x),Math.round(it.y),W,H).data;const px=[];for(let i=0;i<d.length;i+=4)px.push([d[i],d[i+1],d[i+2]]);
      px.sort((a,b)=>lum(a)-lum(b));const f=it.fg;let worst=99;
      for(const bg of [px[Math.floor(px.length*.1)],px[Math.floor(px.length/2)],px[Math.floor(px.length*.9)]]){const m=f.slice(0,3).map((v,i)=>v*f[3]+bg[i]*(1-f[3]));const a=lum(m),b=lum(bg);worst=Math.min(worst,(Math.max(a,b)+.05)/(Math.min(a,b)+.05));}
      const large=it.px>=24||(it.px>=18.66&&it.bold);return{...it,ratio:worst,need:large?3:4.5};});},{png,items});
  return res.filter(r=>!r.dis&&r.ratio<r.need);
}
// Scroll the visible panel's scroller through the page in viewport-sized steps, measuring at each stop.
export async function measureScrolled(page,opts){
  const found=new Map();
  const add=list=>{for(const r of list)found.set(r.sel+'|'+r.t,r);};
  const info=await page.evaluate(()=>{const s=document.querySelector('.panel-host');return s?{h:s.scrollHeight,c:s.clientHeight}:{h:0,c:0}});
  add(await measure(page,opts));
  for(let y=Math.max(0,info.c-96),n=0;y<info.h-info.c+96&&n<6;y+=Math.max(200,info.c-96),n++){
    await page.evaluate(v=>{const s=document.querySelector('.panel-host');if(s)s.scrollTo({top:v,behavior:'instant'})},y);await page.waitForTimeout(250);add(await measure(page,opts));}
  await page.evaluate(()=>{const s=document.querySelector('.panel-host');if(s)s.scrollTo({top:0,behavior:'instant'})});await page.waitForTimeout(150);
  return[...found.values()];
}
