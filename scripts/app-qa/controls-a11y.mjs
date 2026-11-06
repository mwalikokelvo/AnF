// Every visible control must be a usable target and have an accessible name: at least 24x24 CSS px (WCAG 2.2 AA 2.5.8; a checkbox
// counts with the label wrapped around it, inline links inside a sentence are exempt) and a non-empty name (icon-only buttons need an aria-label).
// Closed <details> content is not painted, so it is not measured. Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
const fx=await start();
const audit=()=>{
  const bad=[],sel=el=>{const p=[];while(el&&el.nodeType===1&&p.length<3){let s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.classList.length)s+='.'+el.classList[0];p.unshift(s);el=el.parentElement}return p.join('>')};
  const shown=el=>{if(!el.getClientRects().length)return false;for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||e.hidden)return false;if(e.tagName==='DETAILS'&&!e.open&&el.closest('summary')?.parentElement!==e&&!el.closest('summary'))return false;}const d=el.closest('dialog');return !d||d.open};
  const nameOf=el=>{const t=el.getAttribute('aria-label');if(t&&t.trim())return t;const by=el.getAttribute('aria-labelledby');if(by){const n=by.split(/\s+/).map(i=>document.getElementById(i)?.textContent||'').join(' ').trim();if(n)return n;}
    if(el.labels&&el.labels.length){const n=[...el.labels].map(l=>l.textContent).join(' ').trim();if(n)return n;}const own=(el.innerText||el.textContent||'').trim();if(own)return own;if(el.title&&el.title.trim())return el.title;const alt=el.querySelector('img[alt]');return alt?.alt?.trim()||'';};
  for(const el of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=slider],[role=checkbox],[role=switch]')){
    if(!shown(el)||getComputedStyle(el).position==='fixed'&&false)continue;
    const inline=el.tagName==='A'&&getComputedStyle(el).display==='inline';
    let r=el.getBoundingClientRect();
    if((el.type==='checkbox'||el.type==='radio')&&el.closest('label'))r=el.closest('label').getBoundingClientRect();
    if(!inline&&(r.width<24-.5||r.height<24-.5))bad.push(`too small ${Math.round(r.width)}x${Math.round(r.height)}: ${sel(el)} "${(el.getAttribute('aria-label')||el.innerText||'').trim().slice(0,24)}"`);
    if(!nameOf(el))bad.push(`no accessible name: ${sel(el)}`);
  }
  return bad;
};
try{
  const sizes=JSON.parse(process.env.SIZES||'[[1280,800],[820,760],[600,500]]'),texts=(process.env.TEXTS||'normal').split(',');
  const found=new Set();
  for(const [width,height] of sizes)for(const size of texts){
    const {context,page}=await fx.open({width,height});
    await context.addInitScript(s=>{try{localStorage.setItem('coucou-appearance',JSON.stringify({theme:'dark',size:s}))}catch{}},size);
    await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
    for(const view of ['home','chat','documents','writing','music','audio','settings']){
      await go(page,view);await page.waitForTimeout(350);
      for(const b of await page.evaluate(audit))found.add(`${view} @${width}x${height}/${size}: ${b}`);
    }
    await context.close();
  }
  assert.deepEqual([...found],[],'controls below 24x24 or without a name');
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: every visible control is at least 24x24 and has an accessible name on all seven sections at 1280x800, 820x760 and 600x500. Browser fixture, not the installed app.');
}finally{await fx.close();}
