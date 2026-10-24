import './writing-layout.css';
import {h} from '../views/dom';

/** Deliberately limited Markdown: generated HTML and links are never executed. */
export function renderWriting(text:string):HTMLElement {
  const page=h('div',{class:'writing-preview'});
  let code:string[]|undefined;
  for(const line of text.split('\n')){
    if(line.startsWith('```')){if(code){page.append(h('pre',{},h('code',{text:code.join('\n')})));code=undefined;}else code=[];continue;}
    if(code){code.push(line);continue;}
    const heading=/^(#{1,3})\s+(.*)$/.exec(line),bullet=/^[-*]\s+(.*)$/.exec(line);
    const task=/^- \[([ xX])\] (.*)$/.exec(line);
    const content=task?(task[1]===' '?'☐ ':'☑ ')+task[2]:heading?heading[2]:bullet?'• '+bullet[1]:line;
    const el=heading?h(heading[1].length===1?'h1':heading[1].length===2?'h2':'h3'):h('p');
    for(const part of content.split(/(\[\[[^\]\n]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*)/g)){
      if(part.startsWith('[[')&&part.endsWith(']]')){const [target,label]=part.slice(2,-2).split('|');el.append(h('button',{type:'button',class:'wiki-link',text:label||target,onclick:()=>document.dispatchEvent(new CustomEvent('coucou-open-note',{detail:target.trim()}))}));}
      else if(part.length>4&&part.startsWith('**')&&part.endsWith('**'))el.append(h('strong',{text:part.slice(2,-2)}));
      else if(part.length>2&&part.startsWith('*')&&part.endsWith('*'))el.append(h('em',{text:part.slice(1,-1)}));
      else el.append(document.createTextNode(part));
    }
    if(!content)el.append(h('br'));
    page.append(el);
  }
  if(code)page.append(h('pre',{},h('code',{text:code.join('\n')})));
  return page;
}

export function createWritingEditor(draft:HTMLTextAreaElement,changed:()=>void,notify:(text:string)=>void){
  let noteNames:()=>Promise<{name:string}[]>=async()=>[];
  const tools=h('div',{class:'editor-tools','aria-label':'Writing tools'}),count=h('p',{class:'word-count'});
  const preview=h('div',{class:'preview-paper','aria-label':'Document preview'});
  const proposal=h('section',{class:'revision-panel','aria-label':'Suggested revision'});proposal.hidden=true;
  const undo:string[]=[],redo:string[]=[];let previous=draft.value,key='',pending:{original:string;next:string}|undefined;
  let live:Awaited<ReturnType<typeof import('./live-editor')['liveEditor']>>|undefined,loading=false,readOnly=false;
  const liveHost=h('div',{class:'live-markdown'});
  let previewTimer:ReturnType<typeof setTimeout>|undefined,lastPreview:string|undefined;
  function paintPreview(){previewTimer=undefined;if(lastPreview===draft.value)return;lastPreview=draft.value;preview.replaceChildren(renderWriting(draft.value||'Your document preview will appear here.'));}
  function refresh(projectKey=key){
    live?.sync();
    if(previewTimer)clearTimeout(previewTimer);
    if(projectKey!==key){key=projectKey;undo.length=0;redo.length=0;pending=undefined;proposal.hidden=true;previous=draft.value;}
    else if(previous!==draft.value){undo.push(previous);if(undo.length>40)undo.shift();redo.length=0;previous=draft.value;}
    count.textContent=`${draft.value.trim()?draft.value.trim().split(/\s+/u).length:0} words · ${Array.from(draft.value).length.toLocaleString()} characters`;
    if(mode.value==='preview'||mode.value==='split'){if(draft.value.length>12000)previewTimer=setTimeout(paintPreview,180);else paintPreview();}
  }
  function commit(value:string){if(readOnly){notify('Writing is temporarily locked. Wait for the current operation to finish.');return false;}if(new TextEncoder().encode(value).length>200000){notify('This change would exceed the writing size limit. Shorten the draft first.');return false;}draft.value=value;refresh();changed();return true;}
  function tool(label:string,action:()=>void){const b=h('button',{text:label,type:'button'});b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>{if(readOnly){notify('Writing is temporarily locked. Wait for the current operation to finish.');return;}action();if(mode.value==='live')live?.focusSelection();});tools.append(b);return b;}
  function wrap(prefix:string,suffix=''){
    const start=draft.selectionStart,end=draft.selectionEnd;
    const selected=draft.value.slice(start,end)||'Your text';
    commit(draft.value.slice(0,start)+prefix+selected+suffix+draft.value.slice(end));
    draft.focus();draft.setSelectionRange(start+prefix.length,start+prefix.length+selected.length);live?.focusSelection();
  }
  tool('H1',()=>{const start=draft.value.lastIndexOf('\n',draft.selectionStart-1)+1;commit(draft.value.slice(0,start)+'# '+draft.value.slice(start));});
  tool('Heading',()=>{const pos=draft.selectionStart,start=draft.value.lastIndexOf('\n',pos-1)+1;commit(draft.value.slice(0,start)+'## '+draft.value.slice(start));});
  tool('Bold',()=>wrap('**','**'));tool('Italic',()=>wrap('*','*'));
  tool('Bullet list',()=>{const start=draft.value.lastIndexOf('\n',draft.selectionStart-1)+1;const end=draft.value.indexOf('\n',draft.selectionEnd);const stop=end<0?draft.value.length:end;commit(draft.value.slice(0,start)+draft.value.slice(start,stop).split('\n').map(l=>'- '+l).join('\n')+draft.value.slice(stop));});
  tool('Checklist',()=>{const start=draft.value.lastIndexOf('\n',draft.selectionStart-1)+1;const end=draft.value.indexOf('\n',draft.selectionEnd);const stop=end<0?draft.value.length:end;commit(draft.value.slice(0,start)+draft.value.slice(start,stop).split('\n').map(l=>/^- \[[ xX]\] /.test(l)?l:'- [ ] '+l).join('\n')+draft.value.slice(stop));});
  tool('Quote',()=>wrap('> '));tool('Wiki link',()=>wrap('[[',']]'));
  tool('Code block',()=>wrap('\n```\n','\n```\n'));
  const undoButton=tool('Undo',()=>{if(!undo.length)return;redo.push(draft.value);draft.value=undo.pop()!;previous=draft.value;refresh();changed();});
  const redoButton=tool('Redo',()=>{if(!redo.length)return;undo.push(draft.value);draft.value=redo.pop()!;previous=draft.value;refresh();changed();});
  draft.addEventListener('input',()=>refresh());
  const mode=h('select',{'aria-label':'Writing view'},h('option',{value:'live',text:'Live Markdown'}),h('option',{value:'write',text:'Markdown source'}),h('option',{value:'preview',text:'Preview'}),h('option',{value:'split',text:'Split view'}));
  const focus=h('button',{type:'button',text:'Focus mode','aria-pressed':false});
  const root=h('div',{class:'writing-editor','data-mode':'live'},h('div',{class:'editor-view-controls'},mode,focus),tools,liveHost,h('div',{class:'editor-columns'},h('div',{class:'editor-draft'},h('h3',{text:'Draft'}),draft,count),h('div',{class:'editor-preview'},h('h3',{text:'Preview'}),preview)),proposal);
  async function activateLive(){if(mode.value!=='live'||live||loading)return;if(typeof document.createRange!=='function'){mode.value='write';root.setAttribute('data-mode','write');return;}loading=true;try{const {liveEditor}=await import('./live-editor');live=liveEditor(liveHost,draft,()=>{refresh();changed();},()=>undoButton.click(),()=>redoButton.click(),notify,()=>noteNames());live.setReadOnly(readOnly);}catch(e){mode.value='write';root.setAttribute('data-mode','write');notify('Live editor unavailable; Markdown source remains available.');}finally{loading=false;}}
  mode.addEventListener('change',()=>{root.setAttribute('data-mode',mode.value);refresh();void activateLive();});
  void activateLive();
  let focused=false;
  const setFocus=(value:boolean)=>{focused=value;root.setAttribute('data-focus',String(value));focus.textContent=value?'Exit focus mode':'Focus mode';focus.setAttribute('aria-pressed',String(value));};
  focus.addEventListener('click',()=>setFocus(!focused));root.addEventListener('keydown',e=>{if(e.key==='Escape'&&focused){e.preventDefault();setFocus(false);}});
  return {root,refresh,setNoteProvider(provider:()=>Promise<{name:string}[]>){noteNames=provider;},reveal(offset:number){draft.focus();draft.setSelectionRange(offset,offset);live?.focusSelection();},setReadOnly(value:boolean){readOnly=value;draft.readOnly=value;live?.setReadOnly(value);},offer(original:string,next:string,review:boolean){
    pending=review?undefined:{original,next};proposal.hidden=false;
    const close=h('button',{text:review?'Close review':'Keep original'});
    close.addEventListener('click',()=>{pending=undefined;proposal.hidden=true;notify('Original draft kept.');});
    const actions=h('div',{class:'row'},close);
    if(!review){const accept=h('button',{text:'Accept changes',class:'primary'});accept.addEventListener('click',()=>{if(!pending)return;if(draft.value!==pending.original){notify('The draft has changed. Request a new suggestion before accepting.');return;}if(!commit(pending.next))return;pending=undefined;proposal.hidden=true;notify('Revision accepted. Use Undo to restore the previous draft.');});actions.append(accept);}
    proposal.replaceChildren(h('h3',{text:review?'Writing feedback':'Review suggested changes'}),h('div',{class:'revision-columns'},h('div',{},h('h4',{text:'Original'}),h('pre',{text:original})),h('div',{},h('h4',{text:review?'Feedback':'Suggestion'}),h('pre',{text:next}))),actions);
  }};
}

