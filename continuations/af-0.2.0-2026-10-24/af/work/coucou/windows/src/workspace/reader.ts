import {createSpeechPlayer} from './speech-player';
import {h} from '../views/dom';
import {sections,sectionIndex,readingState,addHighlight,type ReadingSource,type ReadingSection,type Highlight} from './reader-data';
import './reader.css';

export function createReader(changed:()=>void,clip:(text:string,source:string)=>void,notify:(s:string)=>void,ask?:(text:string,source:string)=>void,beforeSpeech?:()=>Promise<void>){
  const audio=createSpeechPlayer(beforeSpeech);
  let scrollKey='',scrollTimer:ReturnType<typeof setTimeout>|undefined;
  let source:ReadingSource|undefined,parts:ReadingSection[]=[],index=0,selection:{start:number;end:number}|undefined,previousFocus:HTMLElement|null=null;
  const title=h('h2'),progress=h('p',{class:'reader-progress',role:'status'}),notice=h('p',{role:'status',class:'reader-notice'});
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
  const close=()=>{saveScroll();audio.stop();root.hidden=true;selection=undefined;source=undefined;previousFocus?.focus();};
  const exit=action('Close reader',close);
  const prev=action('Previous section',()=>go(index-1)),next=action('Next section',()=>go(index+1));
  const root=h('section',{class:'reader-overlay',role:'dialog','aria-modal':true,'aria-label':'Deep reader',hidden:true},
    h('header',{class:'reader-header'},title,action('Read aloud',()=>{if(source)audio.load(source.text.slice(parts[index].start));}),exit),
    h('div',{class:'reader-controls'},theme,font,size,line,width),
    h('div',{class:'reader-navigation'},prev,toc,next,bookmarks,action('Toggle section bookmark',()=>{if(!source)return;const state=readingState(source.reading,source.text);const offset=parts[index].start;if(state.bookmarks.includes(offset)){source.reading={...state,bookmarks:state.bookmarks.filter(n=>n!==offset)};changed();render();notice.textContent='Bookmark removed.';return;}if(state.bookmarks.length>=100)throw Error('This document already has 100 bookmarks.');state.bookmarks.push(offset);source.reading=state;changed();render();notice.textContent='Bookmark saved with this document.';})),
    progress,h('div',{class:'reader-body'},page,h('aside',{class:'reader-aside'},h('h3',{text:'Highlights & notes'}),h('p',{text:'Select up to 2,000 characters in this section, then save a highlight.'}),color,note,
      action('Save highlight',()=>{if(!source||!selection)throw Error('Select an excerpt in the document first.');source.reading=addHighlight(readingState(source.reading,source.text),source.text,selection.start,selection.end,color.value as Highlight['color'],note.value,crypto.randomUUID());note.value='';changed();render();notice.textContent='Highlight and note saved.';}),
      action('Clip selection to writing',()=>{if(!source||!selection)throw Error('Select an excerpt first.');clip(source.text.slice(selection.start,selection.end),source.name);notice.textContent='Excerpt appended to your writing draft.';}),
      action('Ask local AI about selection',()=>{if(!source||!selection)throw Error('Select an excerpt first.');if(!ask)throw Error('Local AI is unavailable.');const text=source.text.slice(selection.start,selection.end),name=source.name;close();ask(text,name);}),
      action('Clip this section to writing',()=>{if(source){clip(source.text.slice(parts[index].start,parts[index].end),source.name);notice.textContent='Section appended to your writing draft.';}}),notes)),audio.root,notice,
    h('p',{class:'reader-footnote',text:'Extracted text view. Original page layout, images and some formatting are not shown. Reading notes sync only with document-text sharing; update both devices.'}));
  function saveScroll(){if(scrollTimer)clearTimeout(scrollTimer);if(!source||!scrollKey)return;try{localStorage.setItem(scrollKey,JSON.stringify({section:parts[index].start,top:root.querySelector('.reader-body')!.scrollTop}));}catch{}}
  root.querySelector('.reader-body')?.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,200);});
  function appearance(){root.dataset.theme=theme.value;page.style.fontFamily=font.value==='serif'?'Georgia, serif':font.value==='mono'?'monospace':'system-ui, sans-serif';page.style.fontSize=size.value+'px';page.style.lineHeight=line.value;page.style.maxWidth=width.value+'px';try{localStorage.setItem('coucou-reader-style',JSON.stringify([theme.value,font.value,size.value,line.value,width.value]));}catch{}}
  try{const values=JSON.parse(localStorage.getItem('coucou-reader-style')||'null');if(Array.isArray(values))[theme,font,size,line,width].forEach((el,i)=>{if(Array.from(el.options).some(o=>o.value===values[i]))el.value=values[i];});}catch{}
  for(const el of[theme,font,size,line,width])el.addEventListener('change',appearance);
  function go(n:number){if(!source)return;saveScroll();audio.stop();index=Math.max(0,Math.min(n,parts.length-1));const state=readingState(source.reading,source.text);state.offset=parts[index].start;source.reading=state;selection=undefined;changed();render();root.querySelector('.reader-body')!.scrollTop=0;saveScroll();}
  function render(){if(!source)return;const current=parts[index],state=readingState(source.reading,source.text);title.textContent=source.name;toc.value=String(index);prev.disabled=index===0;next.disabled=index===parts.length-1;
    progress.textContent=`Section ${index+1} of ${parts.length} · ${Math.round(current.end/Math.max(1,source.text.length)*100)}% through text · approximately ${Math.max(1,Math.ceil(source.text.slice(current.start).split(/\s+/u).length/220))} minutes remaining`;
    page.replaceChildren();const ranges=state.annotations.filter(a=>a.start<current.end&&a.end>current.start).sort((a,b)=>a.start-b.start);let cursor=current.start;
    for(const a of ranges){const start=Math.max(a.start,cursor),end=Math.min(a.end,current.end);if(end<=start)continue;if(start>cursor)page.append(document.createTextNode(source.text.slice(cursor,start)));page.append(h('mark',{'data-color':a.color,title:a.note||'Saved highlight',text:source.text.slice(start,end)}));cursor=end;}if(cursor<current.end)page.append(document.createTextNode(source.text.slice(cursor,current.end)));
    bookmarks.replaceChildren(h('option',{value:'',text:'Bookmarks…'}),...state.bookmarks.map(offset=>h('option',{value:offset,text:parts[sectionIndex(parts,offset)]?.label||'Saved position'})));
    notes.replaceChildren(...state.annotations.filter(a=>a.start>=current.start&&a.start<current.end).map(a=>h('article',{},h('blockquote',{text:a.quote}),h('p',{text:a.note||'Highlight'}),action('Clip excerpt',()=>{if(source)clip(a.quote,source.name);}),action('Remove highlight',()=>{if(source){source.reading={...state,annotations:state.annotations.filter(n=>n.id!==a.id)};changed();render();}}))));
    notice.textContent='';
  }
  function rememberSelection(){const selected=window.getSelection();if(!source||!selected?.rangeCount||selected.isCollapsed)return;const range=selected.getRangeAt(0);if(!page.contains(range.startContainer)||!page.contains(range.endContainer))return;const before=range.cloneRange();before.selectNodeContents(page);before.setEnd(range.startContainer,range.startOffset);const start=parts[index].start+before.toString().length,end=start+range.toString().length;if(end>parts[index].end||end-start>2000){selection=undefined;notice.textContent='Choose up to 2,000 characters within this section.';return;}selection={start,end};notice.textContent='Excerpt selected. Save a highlight or clip it to writing.';}
  page.addEventListener('mouseup',rememberSelection);page.addEventListener('keyup',rememberSelection);page.addEventListener('touchend',rememberSelection);document.addEventListener('selectionchange',()=>{if(!root.hidden)rememberSelection();});
  toc.addEventListener('change',()=>go(Number(toc.value)));bookmarks.addEventListener('change',()=>{if(bookmarks.value!=='')go(sectionIndex(parts,Number(bookmarks.value)));});
  root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const items=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),select,textarea,[tabindex="0"]'));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  return{root,close,stopAudio:audio.stop,open(s:ReadingSource){try{const state=readingState(s.reading,s.text);saveScroll();audio.stop();if(root.hidden)previousFocus=document.activeElement as HTMLElement;source=s;let hash=2166136261;for(let i=0;i<s.text.length;i++)hash=Math.imul(hash^s.text.charCodeAt(i),16777619);scrollKey='coucou-scroll-'+(hash>>>0)+'-'+s.text.length;parts=sections(s.text);index=sectionIndex(parts,state.offset);selection=undefined;toc.replaceChildren(...parts.map((p,i)=>h('option',{value:i,text:p.label})));root.hidden=false;appearance();render();try{const position=JSON.parse(localStorage.getItem(scrollKey)||'null');if(position?.section===parts[index].start&&Number.isFinite(position.top)&&position.top>=0)root.querySelector('.reader-body')!.scrollTop=position.top;else root.querySelector('.reader-body')!.scrollTop=0;}catch{}exit.focus();}catch(e){notify(String(e));}}};
}
