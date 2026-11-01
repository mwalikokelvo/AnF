// Rendering regression for the header/player arrangement shown in the user recording.
// Uses the real shared styles; this does not replace native playback/upgrade QA.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root=new URL('../../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const css=(await Promise.all(['windows/src/workspace/workspace.css','windows/src/workspace/anf-design.css'].map(read))).join('\n');
const music=await readFile(process.argv[2]||fileURLToPath(new URL('windows/src/workspace/music-hub.css',root)),'utf8');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const width of [1278,820,390]){
  const page=await browser.newPage({viewport:{width,height:700}});
  await page.setContent(`<style>${css}\n${music}</style><div id="workspace-root"><div class="music-hub" data-music-theme="ember"><header class="music-heading"><div><h2>Music Hub</h2><p>Music, audiobooks, and podcasts. Local first.</p></div><label class="music-search"><input type="search" aria-label="Search music" placeholder="Search songs, artists, albums or playlists…"></label><select aria-label="Music theme"><option>Ember</option></select><span class="music-monogram">AF</span></header><div class="music-toolbar"><button>Import files</button><button>Import folder</button><label class="music-sort">Sort<select aria-label="Sort library"><option>A–Z</option></select></label><button>Play all</button></div></div><aside class="music-player"><div class="music-now"><div class="music-player-art">♫</div><button class="music-now-info"><strong>291-audio-final-with-a-long-title</strong><span>Audiobook · Unknown artist · MPEG Layer 3 · 2%</span></button><button aria-label="Like">♡</button></div><div class="music-transport"><div class="music-controls"><button>Previous</button><button>Play</button><button>Next</button></div></div><div class="music-extras"><button>Back 15s</button><button>Forward 15s</button></div></aside></div>`);
  const box=await page.evaluate(()=>{
   const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return{x:r.x,width:r.width,height:r.height,right:r.right,scroll:e.scrollWidth,client:e.clientWidth};};
   return{search:rect('.music-search'),theme:rect('.music-heading select'),toolbar:rect('.music-toolbar'),title:rect('.music-now-info'),now:rect('.music-now'),page:document.documentElement.scrollWidth};
  });
  assert(box.theme.width<170,`Theme selector consumes the search row: ${JSON.stringify({width,...box})}`);
  assert(box.search.width>=Math.min(200,width-80),`Search collapsed: ${JSON.stringify({width,...box})}`);
  assert(box.title.right<=box.now.right+1&&box.title.scroll<=box.title.client+1,`Player metadata overlaps controls: ${JSON.stringify({width,...box})}`);
  if(width>=820)assert(box.toolbar.height<100,`Desktop import controls split across rows: ${JSON.stringify({width,...box})}`);
  assert(box.page<=width+1,`Horizontal overflow at ${width}: ${box.page}`);
  await page.close();
 }
 console.log('PASS: Music search/theme sizing, import toolbar and player metadata at recording, tablet and phone widths.');
}finally{await browser.close();}
