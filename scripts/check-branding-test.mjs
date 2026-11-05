import assert from 'node:assert/strict';
import {brandingProblems} from './check-branding.mjs';
const good=(name,text)=>assert.deepEqual(brandingProblems(name,text),[],name);
const bad=(name,text)=>assert(brandingProblems(name,text).length>0,name+' should reject visible/unreviewed legacy branding');
good('android/build.gradle',"applicationId 'com.coucou.workspace'");
good('windows/src/workspace/main.ts',"kind:'coucou-windows-backup'");
good('windows/src-tauri/nsis/hooks.nsh','Check $INSTDIR\\coucou.exe and $DESKTOP\\Coucou.lnk');
good('README.md','# AnF\nUpstream Coucou history and existing data identities.');
good('docs/index.html','<title>AnF</title><h1>AnF workspace</h1><p>Based on Coucou.</p>');
good('windows/README.md','# AnF\nPreserve .coucoupack backups.');
bad('windows/src/workspace/main.ts',"title.textContent='Coucou';");
bad('windows/src/workspace/main.ts',"kind:'coucou-windows-backup';title.textContent='Coucou';");
bad('android/res/values/strings.xml','<string name="app_name">Coucou</string>');
bad('docs/index.html','<title>Coucou</title><h1>AnF</h1>');
bad('docs/index.html','<span class="name">Coucou</span>');
bad('README.md','# Coucou\nHistory is allowed, current title is not.');
bad('android/java/com/coucou/workspace/Obsolete.java','package com.anf.workspace;');
bad('android/build.gradle',"applicationId 'com.coucou.workspace';label='Coucou'");
bad('windows/src/workspace/other.ts',"kind:'coucou-windows-backup'");
console.log('PASS: visible branding failures remain enforced while exact legacy identity/payload and historical attribution fixtures pass.');

// Historical component shims preserve pinned system identities, not visible branding.
good('android/java/com/coucou/workspace/QuickNoteTile.java','package com.coucou.workspace;');
good('android/java/com/coucou/workspace/PlaybackService.java','package com.coucou.workspace;');
bad('android/java/com/coucou/workspace/PlaybackService.java','package com.coucou.workspace; String title="Coucou";');
bad('windows/src/workspace/reader.ts',"const key='coucou-scroll-';title='Coucou';");
bad('scripts/app-qa/fixture.mjs',"indexedDB.open('coucou-audio');title='Coucou';");
