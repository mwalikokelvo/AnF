// Attach to an isolated QA build with WebView2 debugging enabled. Run at the
// user's actual Windows text/DPI settings; browser DPI emulation misses these.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const version=JSON.parse(await readFile(new URL('../../windows/src-tauri/tauri.conf.json',import.meta.url),'utf8')).version;
const output=new URL(`../../releases/anf-${version}/previews/`,import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.connectOverCDP(`http://127.0.0.1:${process.env.ANF_QA_PORT||9223}`);
try{
  const pages=browser.contexts().flatMap(context=>context.pages());
  const workspace=pages.find(page=>page.url().endsWith('/workspace.html'));
  const island=pages.find(page=>new URL(page.url()).pathname==='/');
  assert(workspace&&island,'Open all windows in the isolated native QA build first.');
  const boot=await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('boot'));
  assert.equal(boot.version,version);
  for(let i=0;i<3;i++){
    await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('show_floating_panel'));
    await island.waitForTimeout(900);
    const geometry=await island.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,rect:document.querySelector('#island').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('#header button')].map(button=>{
      const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {name:button.title,covered:!button.contains(hit),rect:rect.toJSON()};
    })}));
    assert(geometry.rect.left>=0&&geometry.rect.right<=geometry.width+1,JSON.stringify(geometry));
    for(const button of geometry.buttons){assert(!button.covered,button.name+' is covered');assert(button.rect.left>=0&&button.rect.right<=geometry.width+1,button.name+' is clipped');}
    await island.getByRole('button',{name:'Floating settings',exact:true}).click();
    await island.getByRole('button',{name:'Settings…',exact:true}).waitFor();
    await island.waitForTimeout(650);
    if(i===0){await island.screenshot({path:new URL('windows-native-floating-settings.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});console.log('Native floating viewport:',JSON.stringify(geometry));}
    await island.getByRole('button',{name:'Collapse floating panel',exact:true}).click();
  }
  await workspace.locator('.workspace-navigation [data-view="settings"]').click();
  await workspace.getByLabel('Appearance',{exact:true}).selectOption('dark');
  await workspace.getByRole('button',{name:'Export support report',exact:true}).click();
  const reportStatus=workspace.locator('.about-card [role="status"]');
  await reportStatus.filter({hasText:'Support report saved:'}).waitFor();
  const reportPath=(await reportStatus.innerText()).replace('Support report saved: ','');
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  assert.equal(report.version,version);
  assert.deepEqual(Object.keys(report).sort(),['application','architecture','balancedModel','embeddedMusic','fastModel','freeRamBytes','ocr','offlineRuntime','platform','totalRamBytes','version'].sort());
  await workspace.getByRole('button',{name:'Check for updates',exact:true}).click();
  await workspace.waitForFunction(()=>!document.querySelector('.about-card button').disabled,{},{timeout:25000});
  assert(!(await reportStatus.innerText()).includes('Checking public releases'),'Update check did not finish');
  await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('show_floating_panel'));
  await island.getByRole('button',{name:'Home',exact:true}).click();
  await island.getByLabel('Floating quick capture',{exact:true}).fill('QA floating capture');
  await island.getByRole('button',{name:'Save note',exact:true}).click();
  await island.getByText('Saved. Find your note in Home → Recent work.',{exact:true}).waitFor();
  const captures=await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_list_projects',{query:'QA floating capture'}));
  assert(captures.some(entry=>entry.name.includes('QA floating capture')),'Floating capture was not saved');
  await workspace.locator('.workspace-navigation [data-view="music"]').click();
  await workspace.waitForFunction(()=>!document.querySelector('.native-music-player .music-play')?.disabled);
  await workspace.getByRole('button',{name:'Open Spotube',exact:true}).click();
  try{await workspace.waitForFunction(()=>{const host=document.querySelector('.spotube-host');return host&&!host.hidden&&!host.hasAttribute('aria-busy');});}
  catch(error){console.log('Native startup status:',await workspace.locator('.activity-bar').innerText());throw error;}
  const state=await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('music_control',{operation:'status'}));
  assert.equal(typeof state.hasTrack,'boolean');
  // Resolve the actual WebView appearance: Windows accessibility/browser theme
  // flags can differ from Flutter's platform brightness in an embedded child.
  await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('music_control',{operation:getComputedStyle(document.getElementById('workspace-root')).colorScheme.includes('light')?'light':'dark'}));
  for(let i=0;i<3;i++){
    await workspace.waitForTimeout(6000);
    const healthy=await workspace.evaluate(()=>window.__TAURI_INTERNALS__.invoke('music_control',{operation:'status'}));
    assert.equal(typeof healthy.hasTrack,'boolean');
    assert(!/stopped responding|did not respond|could not start/i.test(await workspace.locator('.activity-bar').innerText()),'Native music reported a communication failure');
  }
  if(process.env.ANF_QA_PID){
    const capture=spawnSync(process.env.PYTHON_BIN||'python',[fileURLToPath(new URL('./windows-composed-view.py',import.meta.url)),process.env.ANF_QA_PID,fileURLToPath(new URL('windows-native-workspace.png',output))],{stdio:'inherit'});
    assert.equal(capture.status,0,'Composed Windows view failed; inspect native pixels, not only CDP output.');
  }
  await workspace.locator('.workspace-navigation [data-view="settings"]').click();
  await workspace.locator('.workspace-navigation [data-view="music"]').click();
  await workspace.getByRole('button',{name:'Local library',exact:true}).click();
  await workspace.getByRole('tab',{name:'Explore',exact:true}).waitFor({state:'visible'});
  await workspace.locator('.workspace-navigation [data-view="settings"]').click();
  await workspace.getByLabel('Appearance',{exact:true}).selectOption('light');
  await workspace.locator('.workspace-navigation [data-view="music"]').click();
  await workspace.getByRole('button',{name:'Open Spotube',exact:true}).click();
  await workspace.waitForFunction(()=>!document.querySelector('.spotube-host').hidden&&!document.querySelector('.spotube-host').hasAttribute('aria-busy'));
  assert.equal(await workspace.evaluate(()=>getComputedStyle(document.getElementById('workspace-root')).colorScheme),'light');
  if(process.env.ANF_QA_PID){
    await workspace.waitForTimeout(650);
    const capture=spawnSync(process.env.PYTHON_BIN||'python',[fileURLToPath(new URL('./windows-composed-view.py',import.meta.url)),process.env.ANF_QA_PID,fileURLToPath(new URL('windows-native-workspace-light.png',output))],{stdio:'inherit'});
    assert.equal(capture.status,0);
  }
  console.log('PASS: real WebView2 floating controls, repeated expansion, Settings access and native Spotube startup/navigation at the current Windows accessibility scale.');
}finally{await browser.close();}
