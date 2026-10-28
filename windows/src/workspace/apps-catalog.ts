// Open-source apps that pair well with AnF. A built-in list: nothing is fetched, downloaded or installed by AnF.
// Each card opens the project's own releases page in the browser, so people always get the author's build.
import {h} from '../views/dom';
import './apps-catalog.css';

type Platform = 'Windows'|'Android'|'macOS'|'Linux';
type Category = 'Reading'|'Listening'|'Notes and study'|'Privacy and sync'|'Local AI';
export type CatalogApp = {
  id:string; name:string; author:string; repo:string; category:Category;
  platforms:Platform[]; license:string; description:string;
};

// Licences as reported by each repository (checked 2026-10-28); "See project" where GitHub cannot name a single licence.
export const CATALOG:CatalogApp[] = [
  {id:'koreader',name:'KOReader',author:'KOReader community',repo:'koreader/koreader',category:'Reading',platforms:['Android','Linux','macOS'],license:'AGPL-3.0',description:'E-book reader for PDF, DjVu, EPUB and FB2 with strong reflow, dictionaries and highlights.'},
  {id:'kiwix-desktop',name:'Kiwix',author:'Kiwix',repo:'kiwix/kiwix-desktop',category:'Reading',platforms:['Windows','Linux'],license:'GPL-3.0',description:'Read Wikipedia and other reference sites completely offline from downloaded archives.'},
  {id:'kiwix-android',name:'Kiwix for Android',author:'Kiwix',repo:'kiwix/kiwix-android',category:'Reading',platforms:['Android'],license:'GPL-3.0',description:'Offline Wikipedia and reference libraries on your phone.'},
  {id:'antennapod',name:'AntennaPod',author:'AntennaPod',repo:'AntennaPod/AntennaPod',category:'Listening',platforms:['Android'],license:'GPL-3.0',description:'Podcast manager with no account, no tracking and offline downloads.'},
  {id:'audacity',name:'Audacity',author:'Audacity',repo:'audacity/audacity',category:'Listening',platforms:['Windows','macOS','Linux'],license:'See project',description:'Record and edit audio: trim narration, clean up noise and export to common formats.'},
  {id:'buzz',name:'Buzz',author:'Chidi Williams',repo:'chidiwilliams/buzz',category:'Listening',platforms:['Windows','macOS','Linux'],license:'MIT',description:'Transcribe and translate recordings offline with Whisper on your own computer.'},
  {id:'joplin',name:'Joplin',author:'Laurent Cozic',repo:'laurent22/joplin',category:'Notes and study',platforms:['Windows','Android','macOS','Linux'],license:'See project',description:'Markdown notes and to-dos with optional end-to-end encrypted sync.'},
  {id:'anki',name:'Anki',author:'Ankitects',repo:'ankitects/anki',category:'Notes and study',platforms:['Windows','macOS','Linux'],license:'See project',description:'Spaced-repetition flashcards for remembering what you read.'},
  {id:'ankidroid',name:'AnkiDroid',author:'AnkiDroid',repo:'ankidroid/Anki-Android',category:'Notes and study',platforms:['Android'],license:'GPL-3.0',description:'Anki flashcards on Android, compatible with Anki decks.'},
  {id:'keepassxc',name:'KeePassXC',author:'KeePassXC team',repo:'keepassxreboot/keepassxc',category:'Privacy and sync',platforms:['Windows','macOS','Linux'],license:'See project',description:'Offline password manager that keeps an encrypted database on your own device.'},
  {id:'localsend',name:'LocalSend',author:'LocalSend',repo:'localsend/localsend',category:'Privacy and sync',platforms:['Windows','Android','macOS','Linux'],license:'Apache-2.0',description:'Send files between your own devices over the local network, without the cloud.'},
  {id:'syncthing',name:'Syncthing',author:'Syncthing',repo:'syncthing/syncthing',category:'Privacy and sync',platforms:['Windows','macOS','Linux'],license:'MPL-2.0',description:'Continuous, private folder sync between your computers.'},
  {id:'syncthing-fork',name:'Syncthing-Fork',author:'Syncthing-Fork contributors',repo:'researchxxl/syncthing-android',category:'Privacy and sync',platforms:['Android'],license:'MPL-2.0',description:'Syncthing on Android, to keep phone and computer folders in step.'},
  {id:'jan',name:'Jan',author:'Jan',repo:'janhq/jan',category:'Local AI',platforms:['Windows','macOS','Linux'],license:'See project',description:'Chat with open models that run fully offline on your computer.'},
  {id:'ollama',name:'Ollama',author:'Ollama',repo:'ollama/ollama',category:'Local AI',platforms:['Windows','macOS','Linux'],license:'MIT',description:'Download and run open language models locally from one command.'},
];

const CATEGORIES:Category[] = ['Reading','Listening','Notes and study','Privacy and sync','Local AI'];

export function appCatalogPanel(open:(url:string)=>Promise<unknown>, here:Platform = 'Windows') {
  let category:Category|'All' = 'All', platform:Platform|'All' = here, query = '';
  const notice = h('p',{role:'status',class:'hint status'});
  const list = h('div',{class:'list'});
  const search = h('input',{type:'search',placeholder:'Search apps…','aria-label':'Search open-source apps',maxlength:80}) as HTMLInputElement;
  const chip = (label:string, pressed:()=>boolean, pick:()=>void) => {
    const b = h('button',{type:'button',class:'chip',text:label}) as HTMLButtonElement;
    b.addEventListener('click',()=>{pick();draw();});
    return {b,sync:()=>b.setAttribute('aria-pressed',String(pressed()))};
  };
  const chips = [
    ...(['All',...CATEGORIES] as const).map(c=>chip(c,()=>category===c,()=>{category=c;})),
  ];
  const platformChips = ([here,'All'] as const).map(p=>chip(p==='All'?'Every platform':`For ${p}`,()=>platform===p,()=>{platform=p;}));
  const go = (app:CatalogApp, url:string, what:string) => {
    notice.textContent = `Opening ${app.name} ${what} in your browser…`;
    open(url).then(()=>{notice.textContent=`Opened ${app.name} ${what} in your browser.`;}).catch(e=>{notice.textContent=String(e).replace(/^Error: /,'');});
  };
  function draw() {
    for (const c of [...chips,...platformChips]) c.sync();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = CATALOG.filter(a=>(category==='All'||a.category===category)&&(platform==='All'||a.platforms.includes(platform))&&
      words.every(w=>`${a.name} ${a.author} ${a.description} ${a.category}`.toLowerCase().includes(w)));
    list.replaceChildren(...shown.map(a=>h('article',{class:'addon'},
      h('div',{class:'head'},h('strong',{text:a.name}),h('span',{class:'ver',text:`${a.author} · ${a.license}`}),h('span',{class:'badge quiet',text:a.category})),
      h('p',{class:'hint',text:a.description}),
      h('p',{class:'platforms',text:a.platforms.join(' · ')}),
      h('div',{class:'actions'},
        h('button',{type:'button',class:'primary',text:'Get it',title:`Open the ${a.name} releases page`,onclick:()=>go(a,`https://github.com/${a.repo}/releases/latest`,'releases page')}),
        h('button',{type:'button',text:'Source code',onclick:()=>go(a,`https://github.com/${a.repo}`,'source code')})))));
    if (!shown.length) list.append(h('p',{class:'hint',text:'No apps match. Try another category or Every platform.'}));
  }
  search.addEventListener('input',()=>{query=search.value;draw();});
  draw();
  return h('details',{class:'addons app-catalog'},h('summary',{text:'Open-source apps'}),
    h('p',{class:'hint',text:'Free, open-source apps that go well with AnF. This list is built in: AnF downloads and installs nothing. Get it opens the author’s own releases page in your browser.'}),
    search,h('div',{class:'chips',role:'group','aria-label':'Category'},...chips.map(c=>c.b)),
    h('div',{class:'chips',role:'group','aria-label':'Platform'},...platformChips.map(c=>c.b)),notice,list);
}
