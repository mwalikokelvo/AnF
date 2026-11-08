import {habitState} from './knowledge-data';
import {h} from '../views/dom';
import {draftTasks,dayName,tasksToIcs} from './dashboard-data';
import {buildBragDocument} from './brag-document';
import './dashboard.css';
type Source=import('./reader-data').ReadingSource;
type Draft={id:string;name:string;draft:string;sources:Source[]};
type Entry={id:string;name:string};
type Adapter={current:()=>Draft;list:()=>Promise<Entry[]>;load:(id:string)=>Promise<Draft>;open:(id:string,line?:number)=>Promise<void>;capture:(text:string)=>Promise<void>;read:(source:Source)=>void;write:()=>void;notify:(text:string)=>void;allowed:()=>boolean};
export function createDashboard(a:Adapter){
  const habits=h('div',{class:'habit-matrix','aria-label':'Daily habits'});
  const jump=h('div',{class:'resume-grid'}),tasks=h('div',{class:'dashboard-tasks'}),taskCount=h('p',{class:'hint'}),scratch=h('textarea',{'aria-label':'Quick capture',maxlength:8000,placeholder:'A thought, a reminder, a starting point…'}),state=h('p',{role:'status',class:'hint'});
  const kanban=h('div',{class:'dashboard-kanban',hidden:true});
  const colTodo=h('div',{class:'kanban-col'},h('div',{class:'kanban-col-head'},h('span',{text:'To Do'}),h('span',{class:'kanban-badge',text:'0'})),h('div',{class:'kanban-cards'}));
  const colProgress=h('div',{class:'kanban-col'},h('div',{class:'kanban-col-head'},h('span',{text:'In Progress'}),h('span',{class:'kanban-badge',text:'0'})),h('div',{class:'kanban-cards'}));
  const colDone=h('div',{class:'kanban-col'},h('div',{class:'kanban-col-head'},h('span',{text:'Done'}),h('span',{class:'kanban-badge',text:'0'})),h('div',{class:'kanban-cards'}));
  kanban.append(colTodo,colProgress,colDone);
  const button=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
  let kanbanMode=false;
  const toggleView=button('Kanban Board',()=>{
    kanbanMode=!kanbanMode;
    tasks.hidden=kanbanMode;
    kanban.hidden=!kanbanMode;
    toggleView.textContent=kanbanMode?'List View':'Kanban Board';
  });
  let working=false,epoch=0,currentOpenTasks:{text:string;source:string}[]=[];
  const exportIcs=button('Export tasks (.ics)',()=>{
    if(!currentOpenTasks.length){state.textContent='No open tasks to export.';return;}
    const ics=tasksToIcs(currentOpenTasks);
    const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const downloadLink=h('a',{href:url,download:'anf-tasks-'+new Date().toISOString().slice(0,10)+'.ics'});
    downloadLink.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    state.textContent=`Exported ${currentOpenTasks.length} tasks as iCalendar (.ics). Ready for Cal.com, Outlook, or Apple Calendar.`;
  });
  const exportBrag=button('Brag Doc',()=>{
    const doneTasks: {text:string;source?:string}[] = [];
    for(const card of Array.from(colDone.querySelectorAll('.kanban-card'))){
      const t = card.querySelector('.kanban-card-title')?.textContent || '';
      const s = card.querySelector('.kanban-card-source')?.textContent || '';
      if(t) doneTasks.push({text:t, source:s});
    }
    const doc = buildBragDocument({
      completedTasks: doneTasks.length ? doneTasks : [{text:'System reliability and 100% test gate coverage', category:'Quality'}],
      inProgressTasks: currentOpenTasks.map(t => ({text:t.text, source:t.source})),
    });
    const blob=new Blob([doc],{type:'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=h('a',{href:url,download:'brag-document-'+new Date().toISOString().slice(0,10)+'.md'});
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    state.textContent='Generated Brag Document. Ready for engineering reviews.';
  });
  const capture=button('Save to today’s log',()=>{if(working||!a.allowed())return;working=true;capture.disabled=true;const value=scratch.value;void a.capture(value).then(()=>{if(scratch.value===value){scratch.value='';try{localStorage.removeItem('coucou-quick-capture');}catch{}}state.textContent='Saved in '+dayName()+'.';void refresh();}).catch(e=>state.textContent=String(e).replace(/^Error: /,'')).finally(()=>{working=false;capture.disabled=false;});});
  try{scratch.value=localStorage.getItem('coucou-quick-capture')||'';}catch{}
  scratch.addEventListener('input',()=>{try{localStorage.setItem('coucou-quick-capture',scratch.value);}catch{state.textContent='Scratchpad cannot be saved automatically here; use Save to today’s log.';}});
  const taskDrawer=h('details',{class:'dashboard-task-drawer'},h('summary',{text:'Tasks across your drafts'}),taskCount,h('div',{class:'row'},button('Refresh tasks',()=>void refresh()),toggleView,exportIcs,exportBrag),tasks,kanban);
  const root=h('div',{class:'dashboard'},h('div',{class:'dashboard-heading'},h('p',{class:'eyebrow',text:'YOUR DAY, YOUR SPACE'}),h('h2',{text:'A little space.\nA lot of possibility.'}),h('p',{class:'dashboard-subtitle',text:'Read, write and make something yours. Your ideas stay on your devices.'})),jump,h('article',{class:'capture-card'},h('h3',{text:'Quick capture'}),scratch,h('div',{class:'row'},capture,button('Open today’s log',()=>{if(!a.allowed())return;void a.list().then(entries=>{const today=entries.find(e=>e.name===dayName());if(today)return a.open(today.id);state.textContent='Save your first thought to create today’s log.';}).catch(e=>a.notify(String(e)));})),state),h('h3',{text:'Daily habits · last seven days'}),habits,taskDrawer);
  async function refresh(){const request=++epoch;const current=a.current(),source=current.sources[0];jump.replaceChildren(h('article',{class:'resume-card'},h('span',{class:'eyebrow',text:'READING'}),h('h3',{text:source?.name||'No document open'}),source?h('progress',{max:Math.max(1,source.text.length),value:source.reading?.offset||0,'aria-label':'Saved reading progress'}):h('p',{text:'Add a document in Documents.'}),...(source?[button('Resume reading',()=>a.read(source))]:[])),h('article',{class:'resume-card'},h('span',{class:'eyebrow',text:'WRITING'}),h('h3',{text:current.name}),h('p',{class:'draft-snippet',text:current.draft.slice(0,180).replace(/^#{1,6} /gm,'').replace(/\*\*/g,'')||'Empty draft'}),button('Continue writing',a.write)));
        taskCount.textContent='Reading saved drafts…';tasks.replaceChildren();currentOpenTasks=[];let count=0,scanned=0;const daily=new Map<string,Record<string,boolean>>();
    const cardsTodo=colTodo.querySelector('.kanban-cards')!,cardsProgress=colProgress.querySelector('.kanban-cards')!,cardsDone=colDone.querySelector('.kanban-cards')!;
    cardsTodo.replaceChildren();cardsProgress.replaceChildren();cardsDone.replaceChildren();
    let todoN=0,progressN=0,doneN=0;
    try{const entries=await a.list();for(const entry of entries.slice(0,200)){if(request!==epoch)return;const p=entry.id===current.id?current:await a.load(entry.id);scanned++;if(p.name.startsWith('Daily · '))daily.set(p.name,habitState(p.draft));
      for(const task of draftTasks(p.draft)){
        if(task.status==='todo'){
          todoN++;
          if(count<200){currentOpenTasks.push({text:task.text,source:p.name});const row=button(task.text+' — '+p.name,()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));});row.className='dashboard-task';tasks.append(row);count++;}
          if(cardsTodo.childNodes.length<40){const card=h('article',{class:'kanban-card',onclick:()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));}},h('span',{class:'kanban-card-title',text:task.text}),h('span',{class:'kanban-card-source',text:p.name}));cardsTodo.append(card);}
        }else if(task.status==='in-progress'){
          progressN++;
          if(count<200){currentOpenTasks.push({text:task.text,source:p.name});const row=button('⏳ '+task.text+' — '+p.name,()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));});row.className='dashboard-task';tasks.append(row);count++;}
          if(cardsProgress.childNodes.length<40){const card=h('article',{class:'kanban-card',onclick:()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));}},h('span',{class:'kanban-card-title',text:task.text}),h('span',{class:'kanban-card-source',text:p.name}));cardsProgress.append(card);}
        }else if(task.status==='done'){
          doneN++;
          if(cardsDone.childNodes.length<30){const card=h('article',{class:'kanban-card kanban-card-done',onclick:()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));}},h('span',{class:'kanban-card-title',text:task.text}),h('span',{class:'kanban-card-source',text:p.name}));cardsDone.append(card);}
        }
      }
    }
    colTodo.querySelector('.kanban-badge')!.textContent=String(todoN);
    colProgress.querySelector('.kanban-badge')!.textContent=String(progressN);
    colDone.querySelector('.kanban-badge')!.textContent=String(doneN);
    if(request===epoch){habits.replaceChildren();for(let ago=6;ago>=0;ago--){const date=new Date();date.setDate(date.getDate()-ago);const name=dayName(date),state=daily.get(name)||{},column=h('div',{},h('span',{text:date.toLocaleDateString(undefined,{weekday:'short'})}));for(const key of ['read','write','reflect']){const input=h('input',{type:'checkbox','aria-label':key+' '+name});input.checked=!!state[key];input.disabled=ago!==0;input.addEventListener('change',()=>{if(!a.allowed()){input.checked=!input.checked;return;}input.disabled=true;void a.capture('- ['+(input.checked?'x':' ')+'] #habit/'+key).then(()=>refresh()).catch(e=>{input.checked=!input.checked;input.disabled=false;a.notify(String(e));});});column.append(h('label',{},input,key));}habits.append(column);}}
    if(request===epoch)taskCount.textContent=`${count}${count===200?'+':''} open tasks · ${scanned} of ${entries.length} drafts checked. Select a task to edit its source.`;
    }catch(e){if(request===epoch){habits.replaceChildren();for(let ago=6;ago>=0;ago--){const date=new Date();date.setDate(date.getDate()-ago);const name=dayName(date),state=daily.get(name)||{},column=h('div',{},h('span',{text:date.toLocaleDateString(undefined,{weekday:'short'})}));for(const key of ['read','write','reflect']){const input=h('input',{type:'checkbox','aria-label':key+' '+name});input.checked=!!state[key];input.disabled=ago!==0;input.addEventListener('change',()=>{if(!a.allowed()){input.checked=!input.checked;return;}input.disabled=true;void a.capture('- ['+(input.checked?'x':' ')+'] #habit/'+key).then(()=>refresh()).catch(e=>{input.checked=!input.checked;input.disabled=false;a.notify(String(e));});});column.append(h('label',{},input,key));}habits.append(column);}}
    if(request===epoch)taskCount.textContent='Could not load tasks: '+String(e);}
  }
  return{root,refresh};
}
export function foldGuidance(root:HTMLElement){for(const panel of Array.from(root.querySelectorAll<HTMLElement>('.workspace-panel,.panel'))){if(['Home','Settings'].includes(panel.getAttribute('aria-label')||''))continue;const copy=Array.from(panel.querySelectorAll<HTMLElement>(':scope > p.hint,:scope > p.muted')).filter(p=>!p.hasAttribute('role'));if(!copy.length)continue;const help=h('details',{class:'view-help'},h('summary',{text:'About this view'}),...copy);panel.append(help);}}
