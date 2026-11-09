import './writing-layout.css';
import {h} from '../views/dom';
import {createOcrStatusIndicator} from './ocr-client';

/** Deliberately limited Markdown: generated HTML and links are never executed. */
export function renderWriting(text:string):HTMLElement {
  const page=h('div',{class:'writing-preview'});
  let bodyText=text;
  if(text.trimStart().startsWith('---')){
    const endMarker=text.indexOf('\n---',3);
    if(endMarker!==-1){
      const rawHeader=text.slice(text.indexOf('---')+3,endMarker).trim();
      bodyText=text.slice(endMarker+4).trimStart();
      const meta:Record<string,string>={};
      for(const line of rawHeader.split('\n')){
        const colon=line.indexOf(':');
        if(colon!==-1){
          meta[line.slice(0,colon).trim().toLowerCase()]=line.slice(colon+1).trim().replace(/^["'](.*)["']$/,'$1');
        }
      }
      const header=h('header',{class:'writing-article-header'});
      if(meta.title)header.append(h('h1',{class:'article-title',text:meta.title}));
      if(meta.subtitle)header.append(h('p',{class:'article-subtitle',text:meta.subtitle}));
      const byline:string[]=[];
      if(meta.author)byline.push('By '+meta.author);
      if(meta.date)byline.push(meta.date);
      if(meta.audience&&meta.audience!=='everyone')byline.push('('+meta.audience+')');
      if(byline.length)header.append(h('div',{class:'article-byline',text:byline.join(' · ')}));
      page.append(header);
    }
  }
  let code:string[]|undefined;
  for(const line of bodyText.split('\n')){
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
  let live:Awaited<ReturnType<typeof import('./live-editor')['liveEditor']>>|undefined,loading=false;
  const liveHost=h('div',{class:'live-markdown'});
  let previewTimer:ReturnType<typeof setTimeout>|undefined,lastPreview:string|undefined;
  function paintPreview(){previewTimer=undefined;if(lastPreview===draft.value)return;lastPreview=draft.value;preview.replaceChildren(renderWriting(draft.value||'Your document preview will appear here.'));}
  function refresh(projectKey=key){
    void ocrStatus?.refresh();
    live?.sync();
    if(previewTimer)clearTimeout(previewTimer);
    if(projectKey!==key){key=projectKey;undo.length=0;redo.length=0;pending=undefined;proposal.hidden=true;previous=draft.value;}
    else if(previous!==draft.value){undo.push(previous);if(undo.length>40)undo.shift();redo.length=0;previous=draft.value;}
    const words=draft.value.trim()?draft.value.trim().split(/\s+/u).length:0,chars=Array.from(draft.value).length,readTime=Math.max(1,Math.ceil(words/200));count.textContent=`${words.toLocaleString()} word${words===1?'':'s'} · ${chars.toLocaleString()} char${chars===1?'':'s'} · ~${readTime} min read`;
    if(mode.value==='preview'||mode.value==='split'){if(draft.value.length>12000)previewTimer=setTimeout(paintPreview,180);else paintPreview();}
  }
  function commit(value:string){if(new TextEncoder().encode(value).length>2_000_000){notify('This formatting change would exceed the 2 MB writing limit. Shorten the draft first.');return;}draft.value=value;refresh();changed();}
  function tool(label:string,action:()=>void){const b=h('button',{text:label,type:'button'});b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>{action();if(mode.value==='live')live?.focusSelection();});tools.append(b);return b;}
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
  tool('Audit SEO',async()=>{
    const {auditSeo}=await import('./article-publishing');
    const res=auditSeo(draft.value);
    const topTip=res.suggestions[0]?` · Tip: ${res.suggestions[0]}`:' · Content & metadata optimized!';
    notify(`SEO Score: ${res.score}/100 (${res.titleStatus==='good'?'Title optimal':'Title needs review'}) · ~${res.estimatedMinutes} min read${topTip}`);
  });
  tool('Storyboard',async()=>{
    if(!draft.value.trim()){notify('Draft is empty. Write an outline or scene text first.');return;}
    const {generateStoryboardFromText,storyboardToMarkdown}=await import('./storyboard');
    const sb=generateStoryboardFromText(draft.value, 'Visual Storyboard');
    const md=storyboardToMarkdown(sb);
    commit(draft.value + (draft.value.endsWith('\n')?'\n':'\n\n') + md);
    notify(`Storyboard generated with Open-Higgsfield-AI (${sb.shots.length} shots, ~${sb.totalDurationSeconds}s).`);
  });
  tool('Swarm Review', async () => {
    if (!draft.value.trim()) { notify('Draft is empty. Write or paste content first.'); return; }
    const { openSwarmDialog } = await import('./swarm-dialog');
    const { parseFrontmatter } = await import('./article-publishing');
    const parsed = parseFrontmatter(draft.value);
    openSwarmDialog({
      topic: parsed.metadata.title || 'Draft Review',
      context: draft.value,
      onAppend: (md) => {
        commit(draft.value + (draft.value.endsWith('\n') ? '\n' : '\n\n') + md);
      },
      notify
    });
  });
  tool('Bionic View',async()=>{
    if(!draft.value.trim()){notify('Draft is empty. Write or paste content first.');return;}
    const {formatBionicText,computeReadingStats}=await import('./bionic-reading');
    const stats=computeReadingStats(draft.value);
    const bionicHtml=formatBionicText(draft.value);
    const dialog=h('dialog',{class:'music-dialog bionic-dialog','aria-label':'Bionic Speed Reader'});
    const closeBtn=h('button',{text:'Close',type:'button',onclick:()=>{dialog.close();dialog.remove();}});
    const content=h('div',{class:'bionic-content'});
    content.innerHTML=bionicHtml.replace(/\n\n/g,'<p></p>').replace(/\n/g,'<br/>');
    dialog.append(
      h('div',{class:'bionic-header'},
        h('h3',{text:'Bionic Speed Reader'}),
        h('p',{class:'hint',text:`${stats.wordCount} words · ~${stats.standardMinutes}m standard read · ~${stats.bionicMinutes}m bionic read (${Math.max(0, stats.standardMinutes - stats.bionicMinutes)}m saved)`})
      ),
      content,
      h('div',{class:'row'},closeBtn)
    );
    dialog.addEventListener('cancel',()=>dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
  tool('Article Frontmatter',()=>{
    if(draft.value.trimStart().startsWith('---')){notify('Draft already contains frontmatter.');return;}
    const today=new Date().toISOString().slice(0,10);
    const template=`---\ntitle: "Untitled Article"\nsubtitle: ""\nauthor: ""\ndate: ${today}\naudience: everyone\ntags: []\n---\n\n`;
    commit(template+draft.value);
    draft.focus();draft.setSelectionRange(12,28);live?.focusSelection();
  });
  tool('Outline', async () => {
    if (!draft.value.trim()) { notify('Draft is empty. Add headings first.'); return; }
    const { openOutlineModal } = await import('./document-outline');
    openOutlineModal(draft.value, (offset) => {
      draft.focus();
      draft.setSelectionRange(offset, offset);
      live?.focusSelection();
    });
  });
  tool('Export Article', async () => {
    if (!draft.value.trim()) { notify('Draft is empty. Write or paste content first.'); return; }
    const { parseFrontmatter, exportArticleHtml, exportArticleRss, auditSeo } = await import('./article-publishing');
    const parsed = parseFrontmatter(draft.value);
    const seo = auditSeo(draft.value);
    const article = {
      id: crypto.randomUUID(),
      metadata: parsed.metadata,
      markdown: parsed.body,
      updatedAt: Date.now()
    };
    const html = exportArticleHtml(article);

    const dialog = h('dialog', { class: 'music-dialog writing-export-dialog', 'aria-label': 'Export Article' });
    const download = (filename: string, content: string, type: string) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify(`Exported ${filename}.`);
    };

    const baseName = (parsed.metadata.title || 'article').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    const exportHtmlBtn = h('button', {
      type: 'button',
      class: 'primary',
      text: 'Export Standalone HTML (.html)',
      onclick: () => download(`${baseName}.html`, html, 'text/html;charset=utf-8')
    });

    const exportRssBtn = h('button', {
      type: 'button',
      text: 'Export RSS 2.0 Feed (.xml)',
      onclick: () => {
        const rss = exportArticleRss(
          { title: parsed.metadata.title, link: parsed.metadata.canonicalUrl || 'https://localhost', description: parsed.metadata.subtitle || 'Article from AnF Workspace', author: parsed.metadata.author },
          [article]
        );
        download(`${baseName}-feed.xml`, rss, 'application/rss+xml;charset=utf-8');
      }
    });

    const exportMdBtn = h('button', {
      type: 'button',
      text: 'Export Markdown (.md)',
      onclick: () => download(`${baseName}.md`, draft.value, 'text/markdown;charset=utf-8')
    });

    const copyHtmlBtn = h('button', {
      type: 'button',
      text: 'Copy HTML to Clipboard',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(html);
          notify('HTML copied to clipboard!');
        } catch {
          notify('Could not copy to clipboard.');
        }
      }
    });

    const closeBtn = h('button', {
      type: 'button',
      text: 'Close',
      onclick: () => { dialog.close(); dialog.remove(); }
    });

    dialog.append(
      h('div', { class: 'writing-export-header' },
        h('h3', { text: `Export "${parsed.metadata.title || 'Untitled Draft'}"` }),
        h('p', { class: 'hint', text: `SEO Score: ${seo.score}/100 · ~${seo.estimatedMinutes} min read · Ready for Substack, Medium, Ghost, or static web hosting.` })
      ),
      h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin:16px 0' },
        exportHtmlBtn,
        copyHtmlBtn,
        exportRssBtn,
        exportMdBtn
      ),
      h('div', { class: 'row' }, closeBtn)
    );
    dialog.addEventListener('cancel', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
  const ocrInput=h('input',{type:'file',accept:'image/*,.pdf',style:'display:none'}) as HTMLInputElement;
  ocrInput.addEventListener('change',async()=>{
    const file=ocrInput.files?.[0];if(!file)return;
    notify('Parsing document with Unlimited-OCR…');
    try{
      const {parseImageBlobWithOcr}=await import('./ocr-client');
      const result=await parseImageBlobWithOcr(file);
      commit(draft.value+(draft.value?'\n\n':'')+result.markdown);
      notify(`Imported via Unlimited-OCR (${result.headings.length} headings, ${result.tablesCount} tables).`);
    }catch(e){
      notify('Unlimited-OCR error: '+String(e));
    }finally{ocrInput.value='';}
  });
  const ocrStatus=createOcrStatusIndicator({notify});
  tools.append(ocrInput);
  tool('Scan/OCR',()=>ocrInput.click());
  if(ocrStatus?.element)tools.append(ocrStatus.element);
  const undoButton=tool('Undo',()=>{if(!undo.length)return;redo.push(draft.value);draft.value=undo.pop()!;previous=draft.value;refresh();changed();});
  const redoButton=tool('Redo',()=>{if(!redo.length)return;undo.push(draft.value);draft.value=redo.pop()!;previous=draft.value;refresh();changed();});
  draft.addEventListener('input',()=>refresh());
  const mode=h('select',{'aria-label':'Writing view'},h('option',{value:'live',text:'Live Markdown'}),h('option',{value:'write',text:'Markdown source'}),h('option',{value:'preview',text:'Preview'}),h('option',{value:'split',text:'Split view'}));
  const focus=h('button',{type:'button',text:'Focus mode','aria-pressed':false});
  const root=h('div',{class:'writing-editor','data-mode':'live'},h('div',{class:'editor-view-controls'},mode,focus),tools,liveHost,h('div',{class:'editor-columns'},h('div',{class:'editor-draft'},h('h3',{text:'Draft'}),draft,count),h('div',{class:'editor-preview'},h('h3',{text:'Preview'}),preview)),proposal);
  async function activateLive(){if(mode.value!=='live'||live||loading)return;if(typeof document.createRange!=='function'){mode.value='write';root.setAttribute('data-mode','write');return;}loading=true;try{const {liveEditor}=await import('./live-editor');live=liveEditor(liveHost,draft,()=>{refresh();changed();},()=>undoButton.click(),()=>redoButton.click(),notify,()=>noteNames());}catch(e){mode.value='write';root.setAttribute('data-mode','write');notify('Live editor unavailable; Markdown source remains available.');}finally{loading=false;}}
  mode.addEventListener('change',()=>{root.setAttribute('data-mode',mode.value);refresh();void activateLive();});
  void activateLive();
  let focused=false;
  const setFocus=(value:boolean)=>{focused=value;root.setAttribute('data-focus',String(value));focus.textContent=value?'Exit focus mode':'Focus mode';focus.setAttribute('aria-pressed',String(value));};
  focus.addEventListener('click',()=>setFocus(!focused));root.addEventListener('keydown',e=>{if(e.key==='Escape'&&focused){e.preventDefault();setFocus(false);}});
  return {root,refresh,setNoteProvider(provider:()=>Promise<{name:string}[]>){noteNames=provider;},reveal(offset:number){draft.focus();draft.setSelectionRange(offset,offset);live?.focusSelection();},setReadOnly(value:boolean){live?.setReadOnly(value);},offer(original:string,next:string,review:boolean){
    pending=review?undefined:{original,next};proposal.hidden=false;
    const close=h('button',{text:review?'Close review':'Keep original'});
    close.addEventListener('click',()=>{pending=undefined;proposal.hidden=true;notify('Original draft kept.');});
    const actions=h('div',{class:'row'},close);
    if(!review){const accept=h('button',{text:'Accept changes',class:'primary'});accept.addEventListener('click',()=>{if(!pending)return;if(draft.value!==pending.original){notify('The draft has changed. Request a new suggestion before accepting.');return;}commit(pending.next);pending=undefined;proposal.hidden=true;notify('Revision accepted. Use Undo to restore the previous draft.');});actions.append(accept);}
    proposal.replaceChildren(h('div',{class:'revision-header'},h('h3',{text:review?'Writing feedback':'Review suggested changes'}),h('p',{class:'hint',text:review?'AI feedback on your draft':'Review side-by-side comparison before accepting.'})),h('div',{class:'revision-columns'},h('div',{class:'diff-card diff-original'},h('h4',{text:'Current draft'}),h('pre',{text:original})),h('div',{class:'diff-card diff-proposal'},h('h4',{text:review?'Feedback':'Proposed revision'}),h('pre',{text:next}))),actions);
  }};
}
