// Kevo float (HUD H.2): each kevo://state value gives the pill the right data-state, loudness drives the pulse only
// while speaking, and nothing runs between events: no timer, interval or animation frame is ever left pending,
// and idle/asleep run no animation at all. Browser fixture only (stubbed IPC and events), not the installed app.
// Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start} from './fixture.mjs';
const fx=await start();
try{
  const {context,page}=await fx.open({width:48,height:28,page:'kevo-float.html',ready:'#kevo-float',init:()=>{
    // Tauri's event plumbing: listen() registers a callback id; __emit calls it like Rust's app.emit would.
    const callbacks=new Map(),listeners={};let next=0;
    window.__TAURI_INTERNALS__.transformCallback=cb=>{callbacks.set(++next,cb);return next;};
    window.__emit=(event,payload)=>{for(const id of listeners[event]||[])callbacks.get(id)({event,id,payload});};
    window.__listening=()=>(listeners['kevo://state']||[]).length;
    window.__ipc={'plugin:event|listen':({event,handler})=>{(listeners[event]||=[]).push(handler);return handler;},
      kevo_hud_now:()=>({state:'idle',line:'',badge:'',level:0})};
    // Every timer the page asks for is counted until it fires or is cleared.
    const pending=new Set(),setT=setTimeout,clearT=clearTimeout;let intervals=0,frames=0;
    window.setTimeout=(f,ms,...a)=>{const id=setT(()=>{pending.delete(id);typeof f==='function'?f(...a):0;},ms);pending.add(id);return id;};
    window.clearTimeout=id=>{pending.delete(id);clearT(id);};
    const setI=setInterval;window.setInterval=(...a)=>{intervals++;return setI(...a);};
    const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>{frames++;return raf(cb);};
    window.__timers=()=>({timeouts:pending.size,intervals,frames});
  }});
  await page.waitForFunction(()=>window.__listening()===1&&document.getElementById('kevo-float').dataset.state==='idle');
  const box=await page.locator('#kevo-float').boundingBox();
  assert.deepEqual([box.width,box.height],[48,28],'State 1 is 48 × 28');
  const show=async(state,level=0)=>{
    await page.evaluate(([state,level])=>window.__emit('kevo://state',{state,line:'',badge:'',level}),[state,level]);
    await page.waitForTimeout(100);
    return page.evaluate(()=>{const pill=document.getElementById('kevo-float');return{
      state:pill.dataset.state,label:pill.getAttribute('aria-label'),level:getComputedStyle(pill).getPropertyValue('--level').trim(),
      timers:window.__timers(),
      // Endless animations only: a 60 ms pulse transition set off by an event ends by itself.
      looping:document.getAnimations().filter(a=>a.playState==='running'&&a.effect.getTiming().iterations===Infinity).map(a=>a.animationName)};});
  };
  for(const state of ['off','idle','listening','thinking','speaking','alert','sleeping','idle']){
    const seen=await show(state,state==='speaking'?0.8:0.6);
    assert.equal(seen.state,state,`kevo://state ${state} gives data-state=${seen.state}`);
    assert.match(seen.label,/^Kevo: /);
    assert.equal(seen.level,state==='speaking'?'0.8':'0','loudness shows only while speaking');
    assert.deepEqual(seen.timers,{timeouts:0,intervals:0,frames:0},`timers pending after ${state}`);
    // Idle and asleep draw nothing between events (0 % CPU); listening and thinking breathe in CSS.
    assert.equal(seen.looping.length>0,['listening','thinking'].includes(state),`looping animations while ${state}: ${seen.looping}`);
  }
  // With reduced motion the pulse jumps to its size (no transition), so the size can be read at once.
  await page.emulateMedia({reducedMotion:'reduce'});
  const loud=await show('speaking',1),quiet=await show('speaking',0.1);
  assert.equal(loud.level,'1');assert.equal(quiet.level,'0.1');
  const scale=await page.evaluate(()=>new DOMMatrix(getComputedStyle(document.querySelector('.kevo-float-pulse')).transform).a);
  assert(scale>1&&scale<1.3,`the pulse follows a quiet level: scale ${scale}`);
  assert.equal((await show('bogus')).state,'off','an unknown state shows as off');
  assert.deepEqual(await page.evaluate(()=>window.__csp),[],'CSP violations');
  await context.close();
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: Kevo float follows every kevo://state value, pulses with loudness only while speaking, and leaves no timer, interval or animation frame pending. Browser fixture, not the installed app.');
}finally{await fx.close();}
