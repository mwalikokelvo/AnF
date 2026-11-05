import {nextReaderNavMode,readerNavModeAfterFocus,readerNavToggleShortcut,readerNavZone,type ReaderNavMode} from './reader-nav';
import {createSpeechPlayer,type SpeechVoiceProvider} from './speech-player';
import {h} from '../views/dom';
import {sourceSections,readingState,addHighlight,readingNotesMarkdown,documentMatches,type ReadingSource,type ReadingSection,type Highlight} from './reader-data';
import {addToReadingQueue,loadReadingQueue} from './article-publishing';
import {createOcrStatusIndicator} from './ocr-client';
import './reader.css';

export function createReader(changed:()=>void,clip:(text:string,source:string)=>void,notify:(s:string)=>void,ask?:(text:string,source:string)=>void,original?:{available:(source:ReadingSource)=>boolean;render:(source:ReadingSource,page:number)=>Promise<string>},exportNotes?:(text:string,source:string)=>Promise<string>){
  let pdfEpoch=0,pdfBusy=false,pdfWanted=-1;const pdfCache=new Map<number,string>();
  let spokenWord:{start:number;end:number}|undefined;let audioBase=0,speaking:{start:number;end:number}|undefined,found:{start:number;end:number}|undefined;
  const audio=createSpeechPlayer((start,end,word)=>{if(!source)return;spokenWord=word?{start:audioBase+word.start,end:audioBase+word.end}:undefined;speaking={start:audioBase+start,end:audioBase+end};const n=parts.findIndex(p=>p.end>speaking!.start);if(n>=0)index=n;const previousOffset=source.reading?.offset;source.reading={...readingState(source.reading,source.text),offset:speaking.start};if(previousOffset!==speaking.start)changed();render();(page.querySelector('[data-word]')||page.querySelector('[data-speaking]'))?.scrollIntoView({block:'nearest'});});
  let readingMinutes:number[]=[];
  let scrollKey='',scrollTimer:ReturnType<typeof setTimeout>|undefined;
  let source:ReadingSource|undefined,parts:ReadingSection[]=[],index=0,selection:{start:number;end:number}|undefined,previousFocus:HTMLElement|null=null;
  const title=h('h2'),progress=h('p',{class:'reader-progress',role:'status'}),meter=h('div',{class:'reader-meter','aria-hidden':'true'},h('span')),notice=h('p',{role:'status',class:'reader-notice'});
  const page=h('pre',{class:'reader-page',tabindex:0,'aria-label':'Document text — select an excerpt to highlight'}),notes=h('div',{class:'reader-notes'});
  const toc=h('select',{'aria-label':'Reading section'}),bookmarks=h('select',{'aria-label':'Saved bookmarks'});
  const note=h('textarea',{'aria-label':'Note about the selected excerpt',maxlength:1000,placeholder:'Optional note for the selected excerpt'});
  const color=h('select',{'aria-label':'Highlight color'},...['gold','green','pink'].map(value=>h('option',{value,text:value})));
  const select=(label:string,items:[string,string][])=>h('select',{'aria-label':label},...items.map(([value,text])=>h('option',{value,text})));
  const theme=select('Reading theme',[['dark','Soft dark'],['black','AMOLED black'],['sepia','Warm sepia'],['light','Light'],['amber','Night amber']]);
  const font=select('Reading font',[['serif','Serif'],['sans','Sans serif'],['mono','Monospace']]);
  const size=select('Reading font size',[['18','18 px'],['20','20 px'],['24','24 px'],['28','28 px']]);
  const line=select('Reading line spacing',[['1.5','Compact'],['1.8','Comfortable'],['2.1','Spacious']]);
  const width=select('Reading width',[['640','Narrow'],['860','Wide']]);
  const action=(label:string,fn:()=>void)=>{const b=h('button',{text:label,type:'button'});b.addEventListener('click',()=>{try{fn();}catch(e){notice.textContent=String(e).replace(/^Error: /,'');}});return b;};
  const close=()=>{pdfEpoch++;pdfWanted=-1;pdfCache.clear();originalImage.removeAttribute('src');saveScroll();audio.stop();audio.root.hidden=true;speaking=undefined;root.hidden=true;selection=undefined;source=undefined;previousFocus?.focus();};
  const exit=action('Close reader',close);
  const prev=action('Previous section',()=>go(index-1)),next=action('Next section',()=>go(index+1));
  const ocrFileInput=h('input',{type:'file',accept:'image/*,.pdf',style:'display:none'}) as HTMLInputElement;
  const ocrStatus=createOcrStatusIndicator({notify:(msg)=>{notice.textContent=msg;}});
  ocrFileInput.addEventListener('change',async()=>{
    const file=ocrFileInput.files?.[0];if(!file)return;
    const owner=source,epoch=pdfEpoch;
    if(!owner||!confirm('Replace the reading text of '+owner.name+' with the selected scan? Existing highlights will be cleared.')){ocrFileInput.value='';return;}
    notice.textContent='Parsing with Unlimited-OCR…';
    try{
      const {parseImageBlobWithOcr}=await import('./ocr-client');
      const res=await parseImageBlobWithOcr(file);
      if(source===owner&&epoch===pdfEpoch&&!root.hidden){
        audio.stop();pdfEpoch++;pdfWanted=-1;pdfCache.clear();originalImage.removeAttribute('src');
        owner.text=res.markdown;owner.pages=[];owner.reading=undefined;
        parts=sourceSections(owner);index=0;selection=undefined;found=undefined;speaking=undefined;spokenWord=undefined;
        matches=[];matchIndex=-1;search.value='';matchInfo.textContent='';mode.value='text';mode.hidden=true;
        let words=0;readingMinutes=[];for(let n=parts.length-1;n>=0;n--){words+=owner.text.slice(parts[n].start,parts[n].end).split(/\s+/u).filter(Boolean).length;readingMinutes[n]=Math.max(1,Math.ceil(words/220));}
        let hash=2166136261;for(let i=0;i<owner.text.length;i++)hash=Math.imul(hash^owner.text.charCodeAt(i),16777619);scrollKey='coucou-scroll-'+(hash>>>0)+'-'+owner.text.length;toc.replaceChildren(...parts.map((part,i)=>h('option',{value:i,text:part.label})));
        render();changed();notice.textContent=`Parsed with Unlimited-OCR (${res.headings.length} sections, ${res.tablesCount} tables).`;
      }
    }catch(e){
      if(source===owner&&epoch===pdfEpoch&&!root.hidden)notice.textContent='OCR error: '+String(e);
    }finally{ocrFileInput.value='';}
  });
  const search=h('input',{type:'search','aria-label':'Find in document',placeholder:'Find in this document',maxlength:200}),matchInfo=h('span',{role:'status'});
  let matches:{start:number;end:number}[]=[],matchIndex=-1;
  const matchCase=h('input',{type:'checkbox','aria-label':'Match case'});
  function updateMatches(){found=undefined;matchIndex=-1;matches=source?documentMatches(source.text,search.value,matchCase.checked):[];matchInfo.textContent=search.value.trim()?(matches.length?`${matches.length===5000?'At least ':''}${matches.length} matches`:'No matches.') :'';render();}
  search.addEventListener('input',updateMatches);matchCase.addEventListener('change',updateMatches);
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find(e.shiftKey?-1:1);}});
  function find(direction:number){if(!source||!matches.length)return;
    if(matchIndex<0){matchIndex=direction>0?matches.findIndex(m=>m.start>=parts[index].start):matches.reduce((last,m,i)=>m.start<=parts[index].start?i:last,-1);if(matchIndex<0)matchIndex=direction>0?0:matches.length-1;}
    else matchIndex=(matchIndex+direction+matches.length)%matches.length;
    const hit=matches[matchIndex];mode.value='text';go(Math.max(0,parts.findIndex(p=>p.end>hit.start)));found=hit;render();matchInfo.textContent=`Match ${matchIndex+1} of ${matches.length}${matches.length===5000?' shown':''}`;page.querySelector('[data-found]')?.scrollIntoView({block:'center'});
  }
  const mode=select('Document view',[['text','Reading text'],['original','Original PDF page']]);
  const zoom=select('Original page zoom',[['fit','Fit width'],['125','125%'],['150','150%'],['200','200%']]);
  const originalImage=h('img',{class:'reader-original-image',alt:'Original PDF page'}),originalStatus=h('p',{role:'status'});
  const originalView=h('div',{class:'reader-original',hidden:true},originalStatus,originalImage,action('Retry original page',()=>requestOriginal()));
  const footnote=h('p',{class:'reader-footnote'});
  function requestOriginal(){if(root.hidden||!source||mode.value!=='original')return;pdfWanted=index;if(!pdfBusy)void renderOriginal();}
  async function renderOriginal(){pdfBusy=true;
    try{while(pdfWanted>=0&&source&&!root.hidden&&mode.value==='original'){
      const wanted=pdfWanted,document=source,epoch=pdfEpoch;pdfWanted=-1;originalImage.hidden=true;originalStatus.textContent='Rendering original page locally…';originalView.setAttribute('aria-busy','true');
      try{const data=pdfCache.get(wanted)||await original!.render(document,document.pages![wanted].number);
        if(epoch!==pdfEpoch||source!==document||mode.value!=='original'||root.hidden)continue;
        if(wanted!==index){pdfWanted=index;continue;}
        if(data.length>11_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('Invalid page image. Use reading text or retry.');
        pdfCache.set(wanted,data);while(pdfCache.size>2||[...pdfCache.values()].reduce((n,s)=>n+s.length,0)>12_000_000){pdfCache.delete(pdfCache.keys().next().value!);}
        originalImage.src=data;originalImage.alt=`${document.name} · original page ${document.pages![wanted].number}`;originalImage.hidden=false;originalStatus.textContent='Original layout · switch to Reading text to select, highlight or listen.';
      }catch(error){if(epoch===pdfEpoch&&!root.hidden&&wanted===index)originalStatus.textContent=String(error).replace(/^Error: /,'');}
      finally{if(epoch===pdfEpoch)originalView.removeAttribute('aria-busy');}
    }}finally{pdfBusy=false;if(pdfWanted>=0&&source&&!root.hidden&&mode.value==='original')requestOriginal();}
  }
  zoom.addEventListener('change',()=>{originalImage.style.maxWidth=zoom.value==='fit'?'100%':'none';originalImage.style.width=zoom.value==='fit'?'auto':zoom.value+'%';});
  originalImage.addEventListener('error',()=>{pdfCache.delete(index);originalImage.hidden=true;originalStatus.textContent='Page image could not be displayed. Retry or switch to Reading text.';});
  mode.addEventListener('change',()=>{audio.stop();speaking=undefined;render();});
  const notesToggle=action('Notes & highlights',()=>{const visible=root.classList.toggle('reader-show-notes');notesToggle.setAttribute('aria-expanded',String(visible));root.querySelector('.reader-aside')?.setAttribute('aria-hidden',String(!visible));});notesToggle.setAttribute('aria-expanded','false');
  const notesScope=select('Notes shown',[['all','All document notes'],['page','This page or section']]);notesScope.addEventListener('change',()=>render());
  const exportButton=action('Export reading notes',()=>{if(!source)return;if(!exportNotes)throw Error('Note export is unavailable here.');const current=source,state=readingState(current.reading,current.text),part=parts[index],exportSource=notesScope.value==='page'?{...current,reading:{...state,annotations:state.annotations.filter(a=>a.start>=part.start&&a.start<part.end),bookmarks:state.bookmarks.filter(n=>n>=part.start&&n<part.end)}}:current;void exportNotes(readingNotesMarkdown(exportSource),current.name).then(path=>{if(source===current)notice.textContent='Saved reading notes: '+path;}).catch(error=>{if(source===current)notice.textContent=String(error);});});exportButton.hidden=!exportNotes;
  const searchDrawer=h('details',{class:'reader-search-drawer'},h('summary',{text:'Find in document'}),h('div',{class:'reader-search'},search,action('Find next',()=>find(1)),action('Find previous',()=>find(-1)),h('label',{},matchCase,' Match case'),matchInfo));
  const navSlot=h('div',{class:'reader-nav-slot'});
  const root=h('section',{class:'reader-overlay reader-inline','aria-label':'Document reader',hidden:true},
    h('header',{class:'reader-header'},title,mode,zoom,ocrFileInput,action('Scan/OCR',()=>ocrFileInput.click()),...(ocrStatus?.element?[ocrStatus.element]:[]),action('Read aloud',()=>{if(source){mode.value='text';render();audioBase=0;audio.load(source.text,Math.max(parts[index].start,Math.min(source.reading?.offset||0,parts[index].end-1)));}}),exit),
    h('div',{class:'reader-tools'},h('details',{class:'reader-appearance'},h('summary',{text:'Reading appearance'}),h('div',{class:'reader-controls'},theme,font,size,line,width)),searchDrawer,notesToggle),
    navSlot,
    h('div',{class:'reader-navigation'},prev,toc,next,bookmarks,action('Toggle section bookmark',()=>{if(!source)return;const state=readingState(source.reading,source.text);const offset=parts[index].start;if(state.bookmarks.includes(offset)){source.reading={...state,bookmarks:state.bookmarks.filter(n=>n!==offset)};changed();render();notice.textContent='Bookmark removed.';return;}if(state.bookmarks.length>=100)throw Error('This document already has 100 bookmarks.');state.bookmarks.push(offset);source.reading=state;changed();render();notice.textContent='Bookmark saved with this document.';})),
    progress,meter,h('div',{class:'reader-body'},h('div',{class:'reader-content'},page,originalView),h('aside',{class:'reader-aside','aria-hidden':'true'},h('h3',{text:'Highlights & notes'}),h('p',{text:'Select up to 2,000 characters in Reading text, then save a highlight.'}),notesScope,exportButton,h('p',{text:'Export follows the notes filter. Choose this page for large collections.'}),color,note,
      action('Save highlight',()=>{if(!source||!selection)throw Error('Select an excerpt in the document first.');source.reading=addHighlight(readingState(source.reading,source.text),source.text,selection.start,selection.end,color.value as Highlight['color'],note.value,crypto.randomUUID());note.value='';changed();render();notice.textContent='Highlight and note saved.';}),
      action('Clip selection to writing',()=>{if(!source||!selection)throw Error('Select an excerpt first.');clip(source.text.slice(selection.start,selection.end),source.name);notice.textContent='Excerpt appended to your writing draft.';}),
      action('Ask local AI about selection',()=>{if(!source||!selection)throw Error('Select an excerpt first.');if(!ask)throw Error('Local AI is unavailable.');const text=source.text.slice(selection.start,selection.end),name=source.name;close();ask(text,name);}),
      action('Clip this section to writing',()=>{if(source){clip(source.text.slice(parts[index].start,parts[index].end),source.name);notice.textContent='Section appended to your writing draft.';}}),action('Add to reading queue',()=>{if(!source)return;const queue=loadReadingQueue();addToReadingQueue(queue,{title:source.name,source:source.name,text:source.text});notice.textContent='Added to reading queue.';}),notes)),audio.root,notice,
    footnote);
  const navigation=root.querySelector('.reader-navigation') as HTMLElement;
  navSlot.append(navigation);
  audio.root.addEventListener('speech-stop',()=>{speaking=undefined;spokenWord=undefined;if(source&&!root.hidden)render();});
  function saveScroll(){if(scrollTimer)clearTimeout(scrollTimer);if(!source||!scrollKey)return;try{localStorage.setItem(scrollKey,JSON.stringify({section:parts[index].start,top:root.querySelector('.reader-body')!.scrollTop}));}catch{}}
  root.querySelector('.reader-body')?.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,200);});
  let fontFamilies=new Map<string,string>();
  function paintTheme(){root.dataset.theme=theme.value;}
  function paintType(){page.style.fontFamily=fontFamilies.get(font.value)||(font.value==='serif'?'Georgia, serif':font.value==='mono'?'monospace':'system-ui, sans-serif');page.style.fontSize=size.value+'px';page.style.lineHeight=line.value;page.style.maxWidth=width.value+'px';}
  function saveAppearance(){try{localStorage.setItem('anf-reader-style',JSON.stringify([theme.value,font.value,size.value,line.value,width.value]));}catch{}}
  function appearance(){paintTheme();paintType();saveAppearance();}
  size.value='20';line.value='1.8';width.value='860';
  try{const values=JSON.parse(localStorage.getItem('anf-reader-style')||localStorage.getItem('\x63\x6f\x75\x63\x6f\x75-reader-style')||'null');if(Array.isArray(values))[theme,font,size,line,width].forEach((el,i)=>{if(Array.from(el.options).some(o=>o.value===values[i]))el.value=values[i];});}catch{}
  theme.addEventListener('change',()=>{paintTheme();saveAppearance();});
  for(const el of[font,size,line,width])el.addEventListener('change',()=>{paintType();saveAppearance();});
  function go(n:number){if(!source)return;saveScroll();audio.stop();speaking=undefined;found=undefined;index=Math.max(0,Math.min(n,parts.length-1));const state=readingState(source.reading,source.text);state.offset=parts[index].start;source.reading=state;selection=undefined;changed();render();root.querySelector('.reader-body')!.scrollTop=0;saveScroll();}
  function render(){if(!source)return;const originalMode=mode.value==='original';zoom.hidden=!originalMode;page.hidden=originalMode;originalView.hidden=!originalMode;footnote.textContent=originalMode?'Original page rendered on this computer. Text search, selection and read-aloud use the extracted text.':'Reading text may contain OCR errors. Highlights remain anchored to the saved source. Original files are not included in text-only backups.';const current=parts[index],state=readingState(source.reading,source.text);title.textContent=source.name;title.title=source.name;toc.value=String(index);prev.disabled=index===0;next.disabled=index===parts.length-1;prev.textContent=current.label.startsWith('Page ')?'Previous page':'Previous section';next.textContent=current.label.startsWith('Page ')?'Next page':'Next section';
    progress.textContent=`${current.label.startsWith('Page ')?'Page':'Section'} ${index+1} of ${parts.length} · ${Math.round(Math.max(current.start,Math.min(state.offset,current.end))/Math.max(1,source.text.length)*100)}% through text · approximately ${readingMinutes[index]} minutes remaining`;
    (meter.firstElementChild as HTMLElement).style.width=Math.round(Math.max(current.start,Math.min(state.offset,current.end))/Math.max(1,source.text.length)*100)+'%';
    page.replaceChildren();
    const ranges=state.annotations.filter(a=>a.start<current.end&&a.end>current.start);
    const boundaries=new Set([current.start,current.end]);
    for(const range of [...ranges,...(found?[found]:[]),...(speaking?[speaking]:[]),...(spokenWord?[spokenWord]:[])]){boundaries.add(Math.max(current.start,Math.min(current.end,range.start)));boundaries.add(Math.max(current.start,Math.min(current.end,range.end)));}
    const raw=source.text.slice(current.start,current.end);
    for(const match of raw.matchAll(/\n\s*\n/g))boundaries.add(current.start+match.index!+match[0].length);
    const points=[...boundaries].sort((a,b)=>a-b);let paragraph=h('span',{class:'reader-paragraph'});page.append(paragraph);
    for(let n=0;n<points.length-1;n++){const start=points[n],end=points[n+1],text=source.text.slice(start,end);const annotation=ranges.find(a=>a.start<=start&&a.end>=end);const isFound=found&&start>=found.start&&end<=found.end;const isSpeaking=speaking&&start>=speaking.start&&end<=speaking.end;
      paragraph.append(annotation||isFound||isSpeaking?h('mark',{'data-color':annotation?.color,'data-found':isFound?'true':undefined,'data-speaking':isSpeaking?'true':undefined,'data-word':spokenWord&&start>=spokenWord.start&&end<=spokenWord.end?'true':undefined,title:annotation?.note||'',text}):document.createTextNode(text));
      if(/\n\s*\n$/.test(text)&&end<current.end){paragraph=h('span',{class:'reader-paragraph'});page.append(paragraph);}
    }
    bookmarks.replaceChildren(h('option',{value:'',text:'Bookmarks…'}),...state.bookmarks.map(offset=>h('option',{value:offset,text:parts.find(p=>p.start<=offset&&p.end>offset)?.label||'Saved position'})));
    notes.replaceChildren(...state.annotations.filter(a=>notesScope.value==='all'||a.start>=current.start&&a.start<current.end).map(a=>h('article',{},action((parts.find(p=>p.end>a.start)?.label||'Saved position')+' · Go to excerpt',()=>{mode.value='text';go(Math.max(0,parts.findIndex(p=>p.end>a.start)));found={start:a.start,end:a.end};render();page.querySelector('[data-found]')?.scrollIntoView({block:'center'});}),h('blockquote',{text:a.quote}),h('p',{text:a.note||'Highlight'}),action('Clip excerpt',()=>{if(source)clip(a.quote,source.name);}),action('Remove highlight',()=>{if(source){source.reading={...state,annotations:state.annotations.filter(n=>n.id!==a.id)};changed();render();}}))));
    notice.textContent='';if(originalMode)requestOriginal();
  }
  function rememberSelection(){const selected=window.getSelection();if(!source||!selected?.rangeCount||selected.isCollapsed)return;const range=selected.getRangeAt(0);if(!page.contains(range.startContainer)||!page.contains(range.endContainer))return;const before=range.cloneRange();before.selectNodeContents(page);before.setEnd(range.startContainer,range.startOffset);const start=parts[index].start+before.toString().length,end=start+range.toString().length;if(end>parts[index].end||end-start>2000){selection=undefined;notice.textContent='Choose up to 2,000 characters within this section.';return;}selection={start,end};notice.textContent='Excerpt selected. Save a highlight or clip it to writing.';}
  page.addEventListener('mouseup',rememberSelection);page.addEventListener('keyup',rememberSelection);page.addEventListener('touchend',rememberSelection);document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stop();});document.addEventListener('selectionchange',()=>{if(!root.hidden)rememberSelection();});
  toc.addEventListener('change',()=>go(Number(toc.value)));bookmarks.addEventListener('change',()=>{if(bookmarks.value!=='')go(parts.findIndex(p=>p.end>Number(bookmarks.value))<0?parts.length-1:parts.findIndex(p=>p.end>Number(bookmarks.value)));});
  let navMode:ReaderNavMode='open';
  const readingBody=root.querySelector('.reader-body') as HTMLElement;
  let readingScroll=0,pinningScroll=false,freezeReadingScroll=false;
  readingBody.addEventListener('scroll',()=>{if(!pinningScroll&&!freezeReadingScroll)readingScroll=readingBody.scrollTop;},{passive:true});
  function armReadingPlace(){readingScroll=readingBody.scrollTop;freezeReadingScroll=true;}
  function keepReadingPlace(){pinningScroll=true;if(readingBody.scrollTop!==readingScroll)readingBody.scrollTop=readingScroll;pinningScroll=false;}
  function paintNav(next:ReaderNavMode){navMode=next;root.dataset.nav=next;navigation.toggleAttribute('inert',next==='collapsed');}
  function setNavMode(next:ReaderNavMode){if(next===navMode)return;if(next==='collapsed'&&navigation.contains(document.activeElement))page.focus({preventScroll:true});paintNav(next);}
  paintNav('open');
  page.addEventListener('pointerdown',armReadingPlace);
  readingBody.addEventListener('pointerdown',e=>{const target=e.target as HTMLElement|null;if(!target||target.closest('.reader-aside,.reader-original,button,input,select,textarea,a'))return;const focused=page.contains(document.activeElement);armReadingPlace();if(!page.contains(target)){e.preventDefault();page.focus({preventScroll:true});}setNavMode('collapsed');if(focused)requestAnimationFrame(()=>{freezeReadingScroll=false;});});
  root.addEventListener('focusin',e=>{const node=e.target;if(!(node instanceof Node))return;const zone=readerNavZone(page.contains(node),navigation.contains(node));if(zone==='page'){keepReadingPlace();requestAnimationFrame(()=>{keepReadingPlace();requestAnimationFrame(()=>{keepReadingPlace();freezeReadingScroll=false;});});}else freezeReadingScroll=false;setNavMode(readerNavModeAfterFocus(navMode,zone));});
  root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Tab')armReadingPlace();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();searchDrawer.open=true;search.focus();search.select();return;}const field=(e.target as HTMLElement|null)?.closest('input,textarea,select');if(e.key==='Escape'){e.preventDefault();close();}else if(readerNavToggleShortcut(e)){e.preventDefault();setNavMode(nextReaderNavMode(navMode));}else if(!field&&e.key==='ArrowLeft'){e.preventDefault();go(index-1);}else if(!field&&e.key==='ArrowRight'){e.preventDefault();go(index+1);}if(e.key==='Tab'){const items=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),select,textarea,[tabindex="0"]')).filter(el=>!el.closest('[inert]'));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus({preventScroll:true});}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus({preventScroll:true});}}});
  return{root,close,configureAssets(assets:{fonts?:{id:string;label:string;family:string}[];voices?:SpeechVoiceProvider[]}){if(assets.voices)audio.configureVoices(assets.voices);if(assets.fonts){for(const item of assets.fonts){if(!font.querySelector('option[value="'+CSS.escape(item.id)+'"]'))font.append(h('option',{value:item.id,text:item.label}));}fontFamilies=new Map(assets.fonts.map(item=>[item.id,item.family]));appearance();}},open(s:ReadingSource){try{paintNav('open');audio.stop();audio.root.hidden=true;spokenWord=undefined;const state=readingState(s.reading,s.text);pdfEpoch++;pdfCache.clear();pdfWanted=-1;source=s;mode.value='text';mode.hidden=!original?.available(s)||!s.pages?.length||s.pages.map(p=>p.text).join('\n\n')!==s.text;originalView.removeAttribute('aria-busy');let hash=2166136261;for(let i=0;i<s.text.length;i++)hash=Math.imul(hash^s.text.charCodeAt(i),16777619);scrollKey='\x63\x6f\x75\x63\x6f\x75-scroll-'+(hash>>>0)+'-'+s.text.length;parts=sourceSections(s);let words=0;readingMinutes=[];for(let n=parts.length-1;n>=0;n--){words+=s.text.slice(parts[n].start,parts[n].end).split(/\s+/u).filter(Boolean).length;readingMinutes[n]=Math.max(1,Math.ceil(words/220));}const savedIndex=parts.findIndex(p=>p.end>state.offset);index=savedIndex<0?parts.length-1:savedIndex;selection=undefined;found=undefined;speaking=undefined;search.value='';matches=[];matchIndex=-1;matchInfo.textContent='';previousFocus=document.activeElement as HTMLElement;toc.replaceChildren(...parts.map((p,i)=>h('option',{value:i,text:p.label})));root.hidden=false;appearance();render();void ocrStatus?.refresh();try{const position=JSON.parse(localStorage.getItem(scrollKey)||'null');if(position?.section===parts[index].start&&Number.isFinite(position.top)&&position.top>=0)root.querySelector('.reader-body')!.scrollTop=position.top;else root.querySelector('.reader-body')!.scrollTop=0;}catch{}root.scrollIntoView({block:'start'});exit.focus({preventScroll:true});}catch(e){notify(String(e));}}};
}
