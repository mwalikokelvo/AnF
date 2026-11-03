// The Writing toolbar must show every tool at tablet and desktop widths: no horizontal scroll hiding the last buttons, and the editor stays usable.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const fx=await start();
const bad=[];
try{
  for(const [w,h] of [[1920,1080],[1366,768],[1280,800],[900,600],[820,760]]){
    const {context,page}=await fx.open({width:w,height:h});
    await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
    await go(page,'writing');await page.locator('.editor-tools').waitFor();await page.waitForTimeout(400);
    const m=await page.evaluate(()=>{const t=document.querySelector('.editor-tools'),e=document.querySelector('.cm-editor').getBoundingClientRect();return{over:t.scrollWidth-t.clientWidth,editorH:e.height,editorTop:e.top,vh:innerHeight}});
    if(m.over>1)bad.push(`${w}x${h}: toolbar hides ${m.over}px of tools behind a scroll`);
    if(m.editorH<200)bad.push(`${w}x${h}: editor only ${Math.round(m.editorH)}px tall`);
    await context.close();
  }
}finally{await fx.close();}
assert.deepEqual(bad,[]);
assert.deepEqual(fx.problems,[]);
console.log('PASS: Writing toolbar shows every tool at 1920, 1366, 1280, 900 and 820 wide. Browser fixture, not the installed app.');
