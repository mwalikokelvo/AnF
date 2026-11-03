// Dialogs: focus lands inside, Escape closes, focus returns to a real control (not <body>).
import {start,go,seedTracks} from './fixture.mjs';
const fx=await start();
const sizes=JSON.parse(process.env.SIZES||'[[1280,800],[600,500]]');
const rows=[];
async function check(page,name,opener,find,{w,h}){
  const r={name,size:`${w}x${h}`};
  try{
    await opener();await page.waitForTimeout(350);
    const dlg=page.locator(find).first();
    r.open=await dlg.isVisible();
    if(!r.open){r.err='not visible';rows.push(r);return;}
    r.role=await dlg.evaluate(d=>({tag:d.tagName,role:d.getAttribute('role'),modal:d.getAttribute('aria-modal'),label:d.getAttribute('aria-label')||d.getAttribute('aria-labelledby')||(d.querySelector('h2,h3')?.textContent)||null,isModalNative:d.tagName==='DIALOG'&&d.matches(':modal')}));
    r.focusInside=await page.evaluate(f=>{const d=document.querySelector(f);return d.contains(document.activeElement)&&document.activeElement!==d||document.activeElement===d},find);
    r.initialFocus=await page.evaluate(()=>{const e=document.activeElement;return (e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,30)});
    let outsideF=0,outsideB=0;
    for(let i=0;i<45;i++){await page.keyboard.press('Tab');if(!await page.evaluate(f=>document.querySelector(f).contains(document.activeElement),find))outsideF++;}
    for(let i=0;i<45;i++){await page.keyboard.press('Shift+Tab');if(!await page.evaluate(f=>document.querySelector(f).contains(document.activeElement),find))outsideB++;}
    r.leakedFwd=outsideF;r.leakedBack=outsideB;
    // bounds
    r.fits=await dlg.evaluate(d=>{const b=d.getBoundingClientRect();return b.left>=-1&&b.top>=-1&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1});
    await page.keyboard.press('Escape');await page.waitForTimeout(250);
    r.closedByEsc=!(await dlg.isVisible().catch(()=>false));
    r.focusReturn=await page.evaluate(()=>{const e=document.activeElement;return e===document.body?'body':(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,30)});
  }catch(e){r.err=String(e).split('\n')[0]}
  rows.push(r);
  // cleanup
  await page.keyboard.press('Escape').catch(()=>{});await page.waitForTimeout(150);
}
for(const [w,h] of sizes){
  const {context,page}=await fx.open({width:w,height:h});
  await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
  const S={w,h};
  await go(page,'home');
  await check(page,'quick-note',()=>page.getByRole('button',{name:'Quick note'}).click(),'dialog[open]',S);
  await check(page,'search',()=>page.getByRole('button',{name:'Search and commands'}).click(),'.studio-dialog:not([hidden])',S);
  await go(page,'documents');
  await go(page,'music');await page.locator('.music-card').first().waitFor();
  await check(page,'recap',async()=>{await page.locator('.music-listening-options summary').click();await page.getByRole('button',{name:/Listening recap/}).click();},'dialog.music-dialog[open]',S);
  await check(page,'details',async()=>{await page.locator('details.music-item-actions summary').first().click();await page.getByRole('button',{name:/^Details for/}).first().click();},'dialog.music-dialog[open]',S);
  // The Equalizer button is only in the wide-layout dock; narrow layouts have no way to open it (reported, not fixed here).
  if(w>=1280)await check(page,'eq',()=>page.getByRole('button',{name:'Equalizer'}).first().click(),'dialog[open]',S);
  await page.locator('.music-card-play[aria-label^="Play Morning"]').click().catch(()=>{});await page.waitForTimeout(400);
  await check(page,'full-player',()=>page.getByRole('button',{name:'Open full player'}).click(),'dialog.music-full-player[open]',S);
  await context.close();
}
const bad=rows.filter(r=>!r.open||!r.focusInside||!r.closedByEsc||r.focusReturn==='body'||!r.fits||r.err);
for(const r of bad)console.error('FAIL',JSON.stringify(r));
await fx.close();
if(bad.length||fx.problems.length){console.error(fx.problems);process.exit(1);}
console.log(`PASS: ${rows.length} dialogs open with focus inside, close on Escape and return focus to a control. Browser fixture, not the installed app.`);
