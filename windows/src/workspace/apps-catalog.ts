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
  {id:'voicestudio',name:'VoiceStudio',author:'Deb Palash',repo:'debpalash/voicestudio',category:'Listening',platforms:['Windows','Linux'],license:'MIT',description:'Open-source AI voice workstation and speech synthesis studio.'},
  {id:'openwhispr',name:'OpenWhispr',author:'OpenWhispr contributors',repo:'OpenWhispr/openwhispr',category:'Listening',platforms:['Windows','macOS','Linux'],license:'MIT',description:'Offline Whisper-based voice dictation, speech-to-text, and local transcription.'},
  {id:'appflowy',name:'AppFlowy',author:'AppFlowy team',repo:'appflowy-io/appflowy',category:'Notes and study',platforms:['Windows','Android','macOS','Linux'],license:'AGPL-3.0',description:'Privacy-first open-source workspace for notes, tasks, wikis, and project databases.'},
  {id:'cap',name:'Cap',author:'Cap Software',repo:'capsoftware/cap',category:'Notes and study',platforms:['Windows','macOS','Linux'],license:'AGPL-3.0',description:'Open-source screen recording and instant shareable video messaging.'},
  {id:'open-seo',name:'Open-SEO',author:'Every App',repo:'every-app/open-seo',category:'Notes and study',platforms:['Windows','macOS','Linux'],license:'MIT',description:'Open-source search engine optimization, website auditing, and metadata toolkit.'},
  {id:'chatwoot',name:'Chatwoot',author:'Chatwoot Inc',repo:'chatwoot/chatwoot',category:'Privacy and sync',platforms:['Linux','macOS'],license:'AGPL-3.0',description:'Open-source live chat and multi-channel customer communication platform.'},
  {id:'cal-diy',name:'Cal.diy',author:'Cal.com',repo:'calcom/cal.diy',category:'Notes and study',platforms:['Windows','macOS','Linux'],license:'AGPL-3.0',description:'Self-hosted calendar and appointment scheduling infrastructure.'},
  {id:'openproject',name:'OpenProject',author:'OpenProject GmbH',repo:'opf/openproject',category:'Notes and study',platforms:['Linux','macOS'],license:'GPL-3.0',description:'Open-source project management software for task tracking, roadmaps, and agile teams.'},
  {id:'higgsfield-ai',name:'Open Higgsfield AI',author:'Autom8AI',repo:'Autom8AI/Open-Higgsfield-AI',category:'Local AI',platforms:['Windows','Linux'],license:'Apache-2.0',description:'Open-source video generative AI and motion synthesis toolset.'},
  {id:'clouds-against-humanity',name:'Clouds Against Humanity',author:'ChiefGyk3D',repo:'ChiefGyk3D/Clouds-Against-Humanity',category:'Notes and study',platforms:['Windows','Linux','macOS'],license:'MIT',description:'Cloud security and architecture awareness game engine.'},
  {id:'supoclip',name:'Supoclip',author:'FujiwaraChoki',repo:'FujiwaraChoki/supoclip',category:'Listening',platforms:['Windows','Linux','macOS'],license:'AGPL-3.0',description:'Open-source AI video clipper: extracts moments, tracks speakers in 9:16, and generates word-synced subtitles.'},
  {id:'mirofish',name:'MiroFish',author:'666ghj',repo:'666ghj/MiroFish',category:'Local AI',platforms:['Windows','Linux'],license:'Apache-2.0',description:'Multi-agent simulation and universal swarm intelligence prediction engine using GraphRAG.'},
  {id:'jev-ultrafast',name:'Jev Ultrafast',author:'browser-use',repo:'browser-use/jev-ultrafast',category:'Local AI',platforms:['Windows','macOS','Linux'],license:'MIT',description:'Ultra-fast, token-efficient browser automation agent utilizing compact indexed element tables.'},
  {id:'jcode',name:'JCode',author:'1jehuang',repo:'1jehuang/jcode',category:'Local AI',platforms:['Windows','Linux','macOS'],license:'Apache-2.0',description:'High-performance Rust coding agent harness designed for low-memory multi-agent developer workflows.'},
  {id:'digitalocean',name:'DigitalOcean',author:'DigitalOcean',repo:'digitalocean/doctl',category:'Privacy and sync',platforms:['Windows','macOS','Linux'],license:'Apache-2.0',description:'Deploy and host self-hosted instances (Chatwoot, Cal.com, OpenProject) and S3-compatible cloud storage.'},
  {id:'spotube',name:'Spotube',author:'KRTirtho',repo:'KRTirtho/spotube',category:'Listening',platforms:['Windows','Android','macOS','Linux'],license:'BSD-4-Clause',description:'Open-source Spotify & YouTube music streaming client with zero telemetry and no account needed.'},
  {id:'newpipe',name:'NewPipe',author:'TeamNewPipe',repo:'TeamNewPipe/NewPipe',category:'Listening',platforms:['Android'],license:'GPL-3.0',description:'Lightweight open-source media player and YouTube frontend with background audio and offline downloads.'},
  {id:'echo-music',name:'Echo Music',author:'EchoMusicApp',repo:'EchoMusicApp/Echo-Music',category:'Listening',platforms:['Android'],license:'GPL-3.0',description:'Open-source music streaming application with canvas artwork, synchronized multi-provider lyrics, and smart mixes.'},
  {id:'orion-store',name:'Orion Store',author:'RookieZ',repo:'RookieEnough/Orion-Store',category:'Privacy and sync',platforms:['Android'],license:'GPL-3.0',description:'Serverless open-source Android app manager with zero tracking, direct GitHub/GitLab release tracking, and silent updates.'},
  {id:'innertune',name:'InnerTune',author:'Zhuang',repo:'z-huang/InnerTune',category:'Listening',platforms:['Android'],license:'GPL-3.0',description:'Material 3 YouTube Music client with direct client-side stream playback, offline caching, and synchronized lyrics.'},
  {id:'rimusic',name:'RiMusic',author:'Fast4x',repo:'fast4x/RiMusic',category:'Listening',platforms:['Android'],license:'GPL-3.0',description:'Feature-packed open-source music streaming and offline player powered by direct YouTube Music playback.'},
];

const CATEGORIES:Category[] = ['Reading','Listening','Notes and study','Privacy and sync','Local AI'];

export interface BuiltinAction {
  label: string;
  badge: string;
  action: () => void;
}

export const BUILTIN_ACTIONS: Record<string, BuiltinAction> = {
  cap: {
    label: 'Open Screen Recorder',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'audio' }));
      document.dispatchEvent(new CustomEvent('anf-open-cap'));
    },
  },
  supoclip: {
    label: 'Open Video Clipper',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'audio' }));
      document.dispatchEvent(new CustomEvent('anf-open-supoclip'));
    },
  },
  appflowy: {
    label: 'Open Kanban & Database',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-open-appflowy'));
    },
  },
  'cal-diy': {
    label: 'Open Scheduling Desk',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-open-calcom'));
    },
  },
  chatwoot: {
    label: 'Open Support Inbox',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-open-chatwoot'));
    },
  },
  'clouds-against-humanity': {
    label: 'Open Security Challenge',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-open-security'));
    },
  },
  mirofish: {
    label: 'Run Swarm Review',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-open-swarm'));
    },
  },
  spotube: {
    label: 'Open Music Hub',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'music' }));
    },
  },
  innertune: {
    label: 'Open Music Hub',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'music' }));
    },
  },
  rimusic: {
    label: 'Open Music Hub',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'music' }));
    },
  },
  'echo-music': {
    label: 'Open Music Hub',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'music' }));
    },
  },
  openwhispr: {
    label: 'Open Whisper Transcriber',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'audio' }));
    },
  },
  buzz: {
    label: 'Open Whisper Transcriber',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'audio' }));
    },
  },
  audacity: {
    label: 'Open Audio Studio',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'audio' }));
    },
  },
  voicestudio: {
    label: 'Open Voice Workstation',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'audio' }));
    },
  },
  koreader: {
    label: 'Open Documents & Reader',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'documents' }));
    },
  },
  'kiwix-desktop': {
    label: 'Open ZIM Reader',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'documents' }));
    },
  },
  joplin: {
    label: 'Open Writing Desk',
    badge: 'Built into AnF',
    action: () => {
      document.dispatchEvent(new CustomEvent('anf-switch-view', { detail: 'writing' }));
    },
  },
};

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
    list.replaceChildren(...shown.map(a=>{
      const builtin = BUILTIN_ACTIONS[a.id];
      const primaryBtn = builtin
        ? h('button',{type:'button',class:'primary',text:builtin.label,title:`Launch ${a.name} inside AnF`,onclick:()=>{notice.textContent=`Launched ${a.name} in AnF.`;builtin.action();}})
        : h('button',{type:'button',class:'primary',text:'Get it',title:`Open the ${a.name} releases page`,onclick:()=>go(a,`https://github.com/${a.repo}/releases/latest`,'releases page')});

      return h('article',{class:'addon'},
        h('div',{class:'head'},
          h('strong',{text:a.name}),
          h('span',{class:'ver',text:`${a.author} · ${a.license}`}),
          builtin ? h('span',{class:'badge badge-builtin',text:'✓ Built into AnF'}) : null,
          h('span',{class:'badge quiet',text:a.category})
        ),
        h('p',{class:'hint',text:a.description}),
        h('p',{class:'platforms',text:a.platforms.join(' · ')}),
        h('div',{class:'actions'},
          primaryBtn,
          h('button',{type:'button',text:'Source code',onclick:()=>go(a,`https://github.com/${a.repo}`,'source code')})
        )
      );
    }));
    if (!shown.length) list.append(h('p',{class:'hint',text:'No apps match. Try another category or Every platform.'}));
  }
  search.addEventListener('input',()=>{query=search.value;draw();});
  draw();
  return h('details',{class:'addons app-catalog'},h('summary',{text:'Open-source apps & native workspace tools'}),
    h('p',{class:'hint',text:'Open-source companion applications and built-in workspace tools. Click the action buttons to launch incorporated capabilities (Screen recording, 9:16 Video clipping, Kanban & Databases, Scheduling, Support Inbox, and Music streaming) directly within AnF.'}),
    search,h('div',{class:'chips',role:'group','aria-label':'Category'},...chips.map(c=>c.b)),
    h('div',{class:'chips',role:'group','aria-label':'Platform'},...platformChips.map(c=>c.b)),notice,list);
}
