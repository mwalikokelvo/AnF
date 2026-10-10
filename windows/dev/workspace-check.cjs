// Exercise the bundled workspace with a small DOM and an IPC test double.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.textContent='';this.value='';this.disabled=false;this.files=[];}
 setAttribute(k,v){this.attrs[k]=v;if(k==='value')this.value=v;if(k==='disabled')this.disabled=true;}
 hasAttribute(k){return Object.hasOwn(this.attrs,k);}
 getAttribute(k){return this.attrs[k];}
 focus(){}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 append(...items){for(const item of items)item.parent=this;this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=this.children.find(x=>x.tag==='option')?.value??'';}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 replaceChildren(...items){this.children=[];this.append(...items);}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 querySelector(selector){return this.querySelectorAll(selector)[0];}
 querySelectorAll(selector){const tags=selector.split(',');return this.children.flatMap(c=>[...(tags.includes(c.tag)?[c]:[]),...(c.querySelectorAll?.(selector)??[])]);}
 dispatch(k){if(k==='click'&&this.disabled)return;for(const fn of this.listeners[k]??[])fn({target:this});}
}
const root=new Element('div'),calls=[],projects=new Map();let epoch=0,askPending=null,pauseAsk=false;
const body=new Element('body'),windowEvents={};body.append(root);
async function ipc(command,args){calls.push({command,args:structuredClone(args)});switch(command){
 case 'workspace_begin':return ++epoch;
 case 'workspace_cancel':epoch++;return;
 case 'workspace_list_projects':return [...projects.values()].map(p=>({id:p.id,name:p.name,updated:Date.now()}));
 case 'workspace_load_project':return structuredClone(projects.get(args.id));
 case 'workspace_save_project':{const p=structuredClone(args.project);p.id||='a'.repeat(64);projects.set(p.id,p);return p;}
 case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,freeRam:3*1073741824,documents:'C:\\Documents',version:'test',log:'log'};
 case 'workspace_search_web':assert.equal(args.enabled,true);return[{title:'Public sample',url:'https://example.org/article',snippet:'Search summary'}];
 case 'workspace_read_web':assert.equal(args.webEnabled,true);return{name:args.url,text:'A public source passage.',pages:[],path:null};
 case 'workspace_ask':if(pauseAsk)return new Promise(resolve=>askPending=resolve);return{text:args.query.startsWith('Update concise')?'Updated project notes':'A useful answer',notice:'Local reply',evidence:[]};
 case 'workspace_preview_action':return{id:'preview-1',lines:['Create folder C:\\Documents\\Letters']};
 case 'workspace_apply_action':assert.equal(args.id,'preview-1');return'Action finished';
 case 'log_line':return;
 case 'workspace_launch':assert.equal(args.app,'documents');return;
 case 'workspace_save':assert(['docx','txt','md','html','rtf'].includes(args.format));return 'C:\\Documents\\Export.'+args.format;
 default:throw Error('Unexpected IPC '+command);
}}
const context={document:{body,addEventListener:()=>{},getElementById:id=>id==='workspace-root'?root:body.children.find(c=>c.attrs.id===id),createElement:t=>new Element(t),createTextNode:text=>Object.assign(new Element('text'),{textContent:text})},window:{__TAURI_INTERNALS__:{invoke:ipc},addEventListener:(name,fn)=>windowEvents[name]=fn,print:()=>calls.push({command:'print'})},console,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,structuredClone};
vm.runInNewContext(fs.readFileSync('dist/assets/workspace/main.js','utf8'),context);
const flush=()=>new Promise(r=>setImmediate(r));
async function ready(){for(let i=0;i<100;i++){await flush();if(!buttons('Ask local AI').disabled)return;}throw Error('Workspace never became ready');}
const buttons=label=>root.querySelectorAll('button').find(e=>e.textContent===label);
const input=label=>root.querySelectorAll('input,textarea,select').find(e=>e.attrs['aria-label']===label);
(async()=>{
 await ready();assert.equal(projects.size,1);assert.equal(input('Local model').value,'fast');
 const preview=root.querySelectorAll('div').find(e=>e.attrs['aria-label']==='Document preview');
 assert.equal(preview.children.length,0,'Hidden preview should not render while writing');
 input('Writing view').value='preview';input('Writing view').dispatch('change');assert(preview.children.length);
 const previousPreview=preview.children[0];input('Writing view').value='write';input('Writing view').dispatch('change');
 input('Editable reply or document').value='Fresh preview content';input('Editable reply or document').dispatch('input');assert.equal(preview.children[0],previousPreview);
 input('Writing view').value='preview';input('Writing view').dispatch('change');assert.notEqual(preview.children[0],previousPreview);
 assert(preview.querySelectorAll('text').some(e=>e.textContent==='Fresh preview content'));
 input('Editable reply or document').value='';input('Editable reply or document').dispatch('input');input('Writing view').value='write';input('Writing view').dispatch('change');
 const writes=calls.filter(c=>c.command==='workspace_save_project').length;
 buttons('Save project').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_save_project').length,writes);
 assert(root.querySelectorAll('p').some(e=>e.attrs.role==='status'&&e.textContent==='Conversation saved.'),'Keep specific completion messages');
 buttons('Open saved documents').dispatch('click');await ready();assert(root.querySelectorAll('p').some(e=>e.attrs.role==='status'&&e.textContent==='Completed.'),'Successful actions must clear generic working status');
 const existing=[...projects.values()][0];existing.draft='Changed on Android';
 buttons('Refresh history').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_save_project').length,writes);
 input('Saved project').value=existing.id;input('Saved project').dispatch('change');await ready();assert.equal(input('Editable reply or document').value,'Changed on Android');assert.equal(calls.filter(c=>c.command==='workspace_save_project').length,writes);
 console.log('Sync refresh checks passed: unchanged saves do not overwrite remote work; reopening loads the latest saved draft.');
 input('Your question').value='Help me write';buttons('Ask local AI').dispatch('click');await ready();assert.equal(input('Editable reply or document').value,'A useful answer');assert.equal([...projects.values()][0].history.length,2);
 for(let i=0;i<4;i++){input('Your question').value='Another task '+i;buttons('Ask local AI').dispatch('click');await ready();}
 assert.equal(input('Project memory').value,'Updated project notes');assert.equal([...projects.values()][0].history.length,10);
 input('Editable reply or document').value='Edited draft';input('Editable reply or document').dispatch('input');buttons('Save project').dispatch('click');await ready();assert.equal([...projects.values()][0].draft,'Edited draft');
 buttons('Preview creating folder').dispatch('click');await ready();assert.equal(buttons('Apply previewed action').disabled,false);assert(!calls.some(c=>c.command==='workspace_apply_action'));
 input('New folder name').value='Different';input('New folder name').dispatch('input');assert.equal(buttons('Apply previewed action').disabled,true);
 buttons('Preview creating folder').dispatch('click');await ready();buttons('Apply previewed action').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_apply_action').length,1);assert.equal(buttons('Apply previewed action').disabled,true);
 pauseAsk=true;input('Your question').value='Long task';buttons('Ask local AI').dispatch('click');for(let i=0;i<50&&!askPending;i++)await flush();assert(askPending);assert(input('Your question').disabled);assert(!buttons('Cancel').disabled);buttons('Cancel').dispatch('click');await ready();askPending({text:'Late response must be ignored',notice:'late',evidence:[]});await flush();await flush();assert.equal(input('Editable reply or document').value,'Edited draft');assert(calls.some(c=>c.command==='workspace_cancel'));
 assert(!calls.some(c=>c.command.includes('secret')||c.command==='chat_send'));
 pauseAsk=false;
 input('Editable reply or document').value='My current draft with a distinctive phrase.';
 buttons('Improve clarity and flow').dispatch('click');await ready();
 const edit=calls.filter(c=>c.command==='workspace_ask').at(-1).args;
 assert(edit.history[0].content[0].text.includes('distinctive phrase'));
 assert.deepEqual(edit.sources,[]);
 assert.equal(input('Editable reply or document').value,'My current draft with a distinctive phrase.');
 buttons('Accept changes').dispatch('click');assert.equal(input('Editable reply or document').value,'A useful answer');
 buttons('Undo').dispatch('click');assert.equal(input('Editable reply or document').value,'My current draft with a distinctive phrase.');
 buttons('Redo').dispatch('click');assert.equal(input('Editable reply or document').value,'A useful answer');
 for(const format of ['docx','txt','md','html','rtf']){input('Writing export format').value=format;buttons('Export writing').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_save').at(-1).args.format,format);}
 input('Editable reply or document').value='<script>Keep this literal text</script>';
 input('Writing export format').value='pdf';buttons('Export writing').dispatch('click');await ready();
 assert(calls.some(c=>c.command==='print'));const printPage=body.children.find(c=>c.attrs.id==='print-document');const allText=e=>e.textContent+e.children.map(allText).join('');assert(allText(printPage).includes('<script>Keep this literal text</script>'));windowEvents.afterprint();assert(!body.children.includes(printPage));
 for(const label of ['Chat','Documents','Writing','Audio','Settings']){buttons(label).dispatch('click');assert.equal(root.querySelectorAll('section').filter(p=>p.attrs.id?.startsWith('panel-')&&!p.hidden).length,1);}
 input('Response length').value='long';input('Your question').value='Please explain this in detail. '.repeat(150);buttons('Ask local AI').dispatch('click');await ready();
 assert.equal(calls.filter(c=>c.command==='workspace_ask').at(-1).args.longResponse,true);
 const firstPart=input('Editable reply or document').value;buttons('Continue to next part').dispatch('click');await ready();assert(input('Editable reply or document').value.startsWith(firstPart+'\n\n## Part '));
 const beforeTooLong=calls.filter(c=>c.command==='workspace_ask').length;input('Your question').value='🙂'.repeat(2501);input('Your question').dispatch('input');assert.equal(input('Your question').attrs['aria-invalid'],'true');buttons('Ask local AI').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_ask').length,beforeTooLong);
 assert(input('Choose up to four documents').attrs.accept.includes('.epub'));assert(input('Choose up to four documents').attrs.accept.includes('.docx'));
 const webCalls=()=>calls.filter(c=>c.command==='workspace_search_web'||c.command==='workspace_read_web').length;
 buttons('Search web').dispatch('click');await ready();assert.equal(webCalls(),0);
 input('Search the web').checked=true;input('Search the web').dispatch('change');input('Public web search terms').value='public sample';buttons('Search web').dispatch('click');await ready();assert.equal(webCalls(),1);
 const sent=calls.find(c=>c.command==='workspace_search_web').args;assert.deepEqual(Object.keys(sent).sort(),['enabled','job','query']);
 buttons('Read this source').dispatch('click');await ready();assert.equal(webCalls(),2);assert.equal([...projects.values()][0].sources.at(-1).name,'https://example.org/article');
 input('Search the web').checked=false;input('Search the web').dispatch('change');buttons('Read webpage').dispatch('click');await ready();assert.equal(webCalls(),2);
 const asksBefore=calls.filter(c=>c.command==='workspace_ask').length;buttons('Explain simply').dispatch('click');assert(input('Your question').value.includes('loaded documents'));assert.equal(calls.filter(c=>c.command==='workspace_ask').length,asksBefore);
 input('Your question').value='help me';buttons('Ask local AI').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_ask').length,asksBefore);
 input('AI context').value='none';input('Your question').value='Explain how rain forms';buttons('Ask local AI').dispatch('click');await ready();const isolated=calls.filter(c=>c.command==='workspace_ask').at(-1).args;assert.deepEqual(isolated.sources,[]);assert.deepEqual(isolated.history,[]);assert.equal(isolated.memory,'');
 input('AI context').value='draft';input('Editable reply or document').value='A scoped draft.';input('Your question').value='Explain this writing';buttons('Ask local AI').dispatch('click');await ready();assert.equal(calls.filter(c=>c.command==='workspace_ask'&&c.args.query==='Explain this writing').at(-1).args.sources[0].text,'A scoped draft.');
 console.log('Web and follow-up checks passed: off blocks requests, only explicit terms sent, source load/saving, no automatic follow-up send, and ambiguous-question clarification.');
 console.log('New feature checks passed: current-draft editing, five export formats, print cleanup, UTF-8 question limit and EPUB/Word picker.');
 console.log('Workspace checks passed: project saves, full history, automatic memory, local defaults, preview/apply, changed-preview invalidation, and cancellation of stale replies.');
})().catch(e=>{console.error(e);process.exitCode=1;});
