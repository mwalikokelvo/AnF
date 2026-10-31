import {h} from '../views/dom';

const escapeIcs=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r\n?|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const xml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function calendarEvent(title:string,start:string,minutes:number,notes:string){
 const date=new Date(start);if(!title.trim()||!start||!Number.isFinite(date.getTime())||!Number.isInteger(minutes)||minutes<5||minutes>1440)throw Error('Enter a title, a valid local date and time, and a duration from 5 to 1,440 minutes.');
 const utc=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AnF//Local planner//EN','BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@anf.local','DTSTAMP:'+utc(new Date()),'DTSTART:'+utc(date),'DTEND:'+utc(new Date(date.getTime()+minutes*60000)),'SUMMARY:'+escapeIcs(title),'DESCRIPTION:'+escapeIcs(notes),'END:VEVENT','END:VCALENDAR'];
 // RFC 5545 folds at 75 octets, without splitting UTF-8 characters.
 return lines.map(line=>{let out='',bytes=0;for(const char of line){const length=new TextEncoder().encode(char).length;if(bytes+length>75){out+='\r\n ';bytes=1;}out+=char;bytes+=length;}return out;}).join('\r\n')+'\r\n';
}
export function storyboardSvg(title:string,scenes:string){
 const items=scenes.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,8);if(!title.trim()||!items.length)throw Error('Add a title and at least one scene.');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${120+items.length*150}"><rect width="100%" height="100%" fill="#f3f5ef"/><desc>${xml(items.map((s,i)=>`Scene ${i+1}: ${s}`).join("; "))}</desc><text x="40" y="60" font-family="sans-serif" font-size="28" fill="#143f35">${xml(title.slice(0,60))}</text>${items.map((s,i)=>`<rect x="40" y="${100+i*150}" width="920" height="125" rx="12" fill="white" stroke="#8aada2"/><text x="65" y="${140+i*150}" font-family="sans-serif" font-size="18" fill="#143f35">Scene ${i+1}</text>${(s.match(/.{1,85}(?:\s|$)|.{1,85}/gu)||[]).slice(0,2).map((line,j)=>`<text x="65" y="${170+i*150+j*23}" font-family="sans-serif" font-size="16" fill="#24463e">${xml(line)}</text>`).join('')}`).join('')}</svg>`;
}
export function createLocalTools(a:{allowed:()=>boolean;append:(text:string)=>void;save:(title:string,text:string,format:'ics'|'svg')=>Promise<string>}){
 const drafts=new Map<string,string[]>();let activeKind='';
 const heading=h('h3',{tabindex:-1}),content=h('div'),notice=h('p',{role:'status'});
 const root=h('section',{class:'local-tools',hidden:true,'aria-label':'Local tool workspace'},heading,content,notice);
 const button=(text:string,action:()=>void|Promise<void>)=>h('button',{type:'button',text,onclick:()=>{if(!a.allowed())return;void Promise.resolve().then(action).catch(error=>{notice.textContent=String(error).replace(/^Error: /,'');});}});
 const field=(label:string,input:HTMLElement)=>h('label',{},h('span',{text:label}),input);
 function open(kind:'cal'|'media'|'n8n'){
  if(activeKind)drafts.set(activeKind,Array.from(content.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')).map(el=>el.value));activeKind=kind;root.hidden=false;notice.textContent='';content.replaceChildren();
  if(kind==='cal'){
   heading.textContent='Local planner';
   const title=h('input',{'aria-label':'Event title',maxlength:200}),date=h('input',{type:'datetime-local','aria-label':'Event start'}),duration=h('input',{type:'number',value:30,min:5,max:1440,'aria-label':'Duration in minutes'}),notes=h('textarea',{'aria-label':'Event notes',maxlength:4000});
   content.append(h('p',{text:'Plan offline and export a calendar file. Import it into your calendar for reminders; AnF does not run background alarms.'}),field('Title',title),field('Start · this computer’s local time',date),field('Duration in minutes',duration),field('Notes',notes),button('Export calendar event',async()=>{const text=calendarEvent(title.value,date.value,Number(duration.value),notes.value);notice.textContent='Saved: '+await a.save(title.value,text,'ics');}),button('Save event to writing',()=>{calendarEvent(title.value,date.value,Number(duration.value),notes.value);a.append('## '+title.value+'\n\n'+date.value.replace('T',' ')+' · '+duration.value+' minutes\n\n'+notes.value);notice.textContent='Event appended to your saved writing draft.';}));
  }else if(kind==='media'){
   heading.textContent='Offline storyboard';const title=h('input',{'aria-label':'Storyboard title',maxlength:100}),scenes=h('textarea',{'aria-label':'Storyboard scenes',maxlength:8000,placeholder:'One scene per line · up to eight scenes'});
   content.append(h('p',{text:'Create an SVG planning board from your own scene descriptions, without a model or API key. This creates a text storyboard, not generated photos or video.'}),field('Title',title),field('Scenes',scenes),button('Export SVG storyboard',async()=>{notice.textContent='Saved: '+await a.save(title.value,storyboardSvg(title.value,scenes.value),'svg');}),button('Save storyboard to writing',()=>{storyboardSvg(title.value,scenes.value);a.append('## '+title.value+'\n\n'+scenes.value.split('\n').filter(s=>s.trim()).slice(0,8).map((s,i)=>`${i+1}. ${s}`).join('\n'));notice.textContent='Storyboard appended to your saved writing draft.';}));
  }else{
   heading.textContent='Local workflow recipes';
   const recipes=[['Study session','- [ ] Choose a document and read a section\n- [ ] Highlight evidence and add notes\n- [ ] Prepare a research brief in local Chat\n- [ ] Check citations against the source\n- [ ] Write a reflection'],['Writing session','- [ ] Capture the main claim\n- [ ] Collect supporting excerpts\n- [ ] Draft in your own voice\n- [ ] Run local writing review\n- [ ] Accept only useful changes'],['Weekly review','- [ ] Review open tasks on Home\n- [ ] Move unfinished tasks into a plan\n- [ ] Export an encrypted backup\n- [ ] Schedule the next study session']];
   content.append(h('p',{text:'Add a repeatable checklist to your saved writing draft. You control each step. These recipes do not send webhooks or execute unattended jobs.'}),...recipes.map(([name,text])=>button('Add '+name,()=>{a.append('## '+name+'\n\n'+text);notice.textContent=name+' added to writing.';})));
  }
  const previous=drafts.get(kind);if(previous)Array.from(content.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')).forEach((el,i)=>{if(previous[i]!==undefined)el.value=previous[i];});
  content.append(h('p',{class:'hint',text:'Unsaved entries stay in this session only. Save to writing to keep them after closing the app.'}));
  content.append(button('Close local tool',()=>{root.hidden=true;}));root.scrollIntoView({block:'start',behavior:'instant'});heading.focus({preventScroll:true});
 }
 return{root,open};
}
