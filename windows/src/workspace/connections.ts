import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
import {managedGateway} from './managed-gateway';

export type Service='gateway'|'notebook'|'nextcloud'|'cal'|'n8n'|'media';
export type View={service:Service;endpoint:string;origin:string;username:string;model:string;enabled:boolean;hasSecret:boolean};
type Source={name:string;text:string;pages:{number:number;text:string;ocr:boolean}[];path:string|null};
type Result={message?:string;text?:string;id?:string;items?:{id:string;name:string}[];source?:Source;pack?:string;status?:string;outputs?:string[]};
type Action={service:Service;operation:string;id?:string;title?:string;text?:string;eventId?:string};
type Adapter={allowed:()=>boolean;projectId:()=>string;sources:()=>Source[];draft:()=>{title:string;text:string};importSource:(source:Source)=>Promise<void>;useManaged?:()=>void};

const definitions:ReadonlyArray<{id:Service;name:string;hint:string;placeholder:string}>=[
 {id:'gateway',name:'AI gateway · OmniRoute',hint:'OpenAI-compatible API base including /v1. Use the gateway key, not a provider password. Select Gateway in Chat to send a question there.',placeholder:'http://127.0.0.1:20128/v1'},
 {id:'notebook',name:'Open Notebook',hint:'API server root. Use its shared password if enabled. Source exports may invoke processing on that server.',placeholder:'http://127.0.0.1:5055'},
 {id:'nextcloud',name:'Nextcloud encrypted backups',hint:'Full WebDAV directory URL for an existing folder. Use your username and an app password. Only encrypted AnF packs are transferred.',placeholder:'https://cloud.example/remote.php/dav/files/username/AnF'},
 {id:'cal',name:'Cal.diy scheduling',hint:'Your booking page URL. Booking, timezone selection and calendar authorization happen on that page.',placeholder:'https://calendar.example/your-name/meeting'},
 {id:'n8n',name:'n8n draft export',hint:'Production webhook URL. Configure n8n Header Auth as Authorization: Bearer <your secret>. The receiver must deduplicate eventId values.',placeholder:'https://automation.example/webhook/your-workflow'},
 {id:'media',name:'Creative media · Muapi',hint:'API root used by Open Generative AI. Enter a text-to-image/video model endpoint. This sends prompts to a separate provider and may incur charges.',placeholder:'https://api.muapi.ai'},
];

export function createConnections(a:Adapter){
 const notice=h('p',{role:'status',class:'hint'}),cards=h('div');
 const root=h('details',{'aria-label':'Connected services'},h('summary',{text:'Connected services'}),
  h('p',{text:'Optional connections use your own services and accounts. Nothing connects or uploads automatically. Saved secrets stay in the operating system credential store.'}),notice,cards);
 let busy=false,loaded=false;
 const loaders=new Map<Service,(view?:View)=>void>();
 const button=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
 const field=(label:string,type='text',placeholder='')=>h('input',{'aria-label':label,type,placeholder,autocomplete:'off',maxlength:1000});
 async function run(fn:()=>Promise<void>){
  if(busy||!a.allowed())return;
  busy=true;
  const controls=Array.from(root.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('input,button,select,textarea'));
  for(const control of controls)control.disabled=true;
  notice.textContent='Working with the selected service…';
  try{await fn();}catch(error){notice.textContent=String(error).replace(/^Error: /,'');}
  finally{busy=false;for(const control of controls)control.disabled=false;}
 }
 async function refresh(){
  const views=await invoke<View[]>('connection_list');
  for(const def of definitions)loaders.get(def.id)?.(views.find(v=>v.service===def.id));
  loaded=true;notice.textContent='Connections loaded. Choose a service to configure or use it.';
 }
 root.addEventListener('toggle',()=>{if(root.open&&!loaded)void run(refresh);});

 for(const def of definitions){
  const endpoint=field(def.name+' address','url',def.placeholder),secret=field(def.name+' secret','password','Leave blank to keep the saved secret');
  const clear=field(def.name+' clear saved secret','checkbox'),enabled=field(def.name+' enabled','checkbox');
  const username=field(def.name+' username'),model=field(def.name+' model','text',def.id==='gateway'?'provider/model · choose explicitly':'e.g. flux-schnell');
  model.maxLength=160;username.maxLength=160;
  const state=h('p',{class:'hint',text:'Not configured.'}),output=h('div',{class:'connection-result'}),preview=h('section',{'aria-label':def.name+' action preview',hidden:true});
  let current:View|undefined;
  const invalidate=()=>{preview.hidden=true;preview.replaceChildren();};
  const action=async(value:Omit<Action,'service'>)=>invoke<Result>('connection_action',{action:{service:def.id,...value}});
  const describe=()=>{if(!current?.enabled)throw Error('Save and enable this connection first.');return current.origin;};
  function review(title:string,body:string,send:()=>Promise<void>){
   if(busy||!a.allowed())return;
   try{
    const destination=describe();
    preview.replaceChildren(h('h4',{text:title}),h('p',{text:'Destination: '+destination}),h('pre',{text:body}),
     button('Send this action',()=>{invalidate();void run(send);}),button('Keep local',()=>{invalidate();notice.textContent='Nothing sent.';}));
    preview.hidden=false;
   }catch(error){notice.textContent=String(error).replace(/^Error: /,'');}
  }
  const save=button('Save connection',()=>void run(async()=>{
   const view=await invoke<View>('connection_save',{input:{service:def.id,endpoint:endpoint.value,username:username.value,model:model.value,enabled:enabled.checked,
    ...(clear.checked?{secret:''}:secret.value?{secret:secret.value}:{})}});
   loaders.get(def.id)?.(view);invalidate();notice.textContent='Connection saved. No service request was sent.';
  }));
  const forget=button('Forget connection',()=>void run(async()=>{await invoke('connection_forget',{service:def.id});loaders.get(def.id)?.();invalidate();notice.textContent='Saved connection and secret removed. Remote accounts and content were not changed.';}));
  const test=button(def.id==='n8n'||def.id==='media'?'Validate address':'Test connection',()=>void run(async()=>{
   describe();const result=await action({operation:'test'});notice.textContent=result.message||'Check completed.';
  }));
  const card=h('details',{'data-service':def.id},h('summary',{text:def.name}),h('p',{text:def.hint}),state,
   endpoint, h('label',{},enabled,' Enable this connection'),
   ...(def.id==='nextcloud'?[username]:[]),...(def.id==='gateway'||def.id==='media'?[model]:[]),
   ...(def.id!=='cal'?[secret,h('label',{},clear,' Clear saved secret on save')]:[]),
   h('div',{class:'row'},save,test,forget));
  for(const input of [endpoint,secret,clear,enabled,username,model])input.addEventListener('input',invalidate);
  loaders.set(def.id,view=>{
   current=view;endpoint.value=view?.endpoint||'';secret.value='';clear.checked=false;enabled.checked=view?.enabled||false;
   username.value=view?.username||'';model.value=view?.model||'';
   if(def.id==='n8n'&&view)endpoint.placeholder='Saved webhook at '+view.origin+' · blank keeps its private path';
   state.textContent=view?`${view.enabled?'Enabled':'Disabled'} · ${view.origin} · ${view.hasSecret?'secret saved':'no secret saved'}${def.id==='gateway'?' · Saved route: '+(view.model||'choose a model'):''}`:'Not configured.';
  });

  if(def.id==='gateway'){
   const external=card.children.item(2);
   card.insertBefore(managedGateway(()=>a.useManaged?.(),message=>{notice.textContent=message;}),external);
   card.insertBefore(h('h4',{text:'External gateway connection'}),external);
   function savedGateway(){describe();if(endpoint.value.trim()!==current?.endpoint||secret.value||clear.checked||enabled.checked!==current.enabled)throw Error('Save your gateway address, credentials and enabled state before checking it.');}
   const catalog=h('select',{'aria-label':'Discovered gateway models'},h('option',{value:'',text:'Discover models first…'}));
   const route=h('p',{class:'hint',text:'No model selected. AnF will not choose an automatic provider.'});
   model.addEventListener('input',()=>{route.textContent=model.value?'Requested route: '+model.value+'. Save before using Chat.':'No model selected.';});
   catalog.addEventListener('change',()=>{if(catalog.value){model.value=catalog.value;route.textContent='Requested route: '+catalog.value+'. Save connection to use this model.';invalidate();}});
   const guide=h('details',{},h('summary',{text:'Set up local OmniRoute'}),
    h('ol',{},h('li',{text:'Install Node.js 24 LTS, then install the pinned gateway with npm install -g omniroute@3.8.51. Review upstream installation documentation first.'}),
     h('li',{text:'In PowerShell set $env:OMNIROUTE_SERVER_HOST="127.0.0.1", then run omniroute serve. Open its dashboard at http://127.0.0.1:20128. Configure a provider you are authorized to use, or a local OpenAI-compatible model. Cloud providers may require accounts, keys, subscriptions or payment.'}),
     h('li',{text:'In OmniRoute create a gateway API key if authentication is enabled. Enter that key here; provider credentials remain in OmniRoute. Save and enable the /v1 address, then Discover gateway models.'}),
     h('li',{text:'Choose a specific provider/model, save again and optionally run the small generation check. Select Gateway in Chat only when you intend to send that question and selected context to this gateway.'})),
    h('p',{text:'AnF does not install or start third-party software automatically. No silent cloud fallback. Explicit auto/combo routes can switch providers according to your OmniRoute configuration; choose a provider/model to pin your request.'}),
    h('a',{href:'https://github.com/diegosouzapw/OmniRoute#-quick-start',target:'_blank',rel:'noopener noreferrer',text:'Official OmniRoute setup'}));
   card.append(guide,button('Use local OmniRoute address',()=>{endpoint.value='http://127.0.0.1:20128/v1';invalidate();notice.textContent='Local address filled. Enter your gateway key if required, enable and save; nothing connected.';}),
    button('Discover gateway models',()=>void run(async()=>{savedGateway();const result=await action({operation:'models'});catalog.replaceChildren(h('option',{value:'',text:'Choose a provider/model…'}),...(result.items||[]).map(item=>h('option',{value:item.id,text:item.id})));notice.textContent=result.message||'Catalog loaded.';})),catalog,route,
    h('p',{class:'hint',text:'The next check sends a small fixed prompt with no document or conversation content. The selected provider may charge for generation. It is never retried automatically.'}),
    button('Run gateway generation check',()=>void run(async()=>{savedGateway();if(model.value!==current?.model)throw Error('Save your selected gateway model before generating.');const result=await action({operation:'probe'});output.replaceChildren(h('p',{text:result.message||'Check completed.'}),h('pre',{text:result.text||''}));notice.textContent=result.message||'Check completed.';})));
  }

  if(def.id==='cal')card.append(button('Open booking page',()=>void run(async()=>{describe();await invoke('connection_open_booking');notice.textContent='Booking page opened. Review and complete scheduling there.';})));

  if(def.id==='notebook'){
   const notebooks=h('select',{'aria-label':'Target notebook'}),remoteSources=h('select',{'aria-label':'Remote notebook source'}),localSources=h('select',{'aria-label':'Local source to export'});
   const listNotebooks=button('List notebooks',()=>void run(async()=>{
    describe();const result=await action({operation:'list'});
    notebooks.replaceChildren(...(result.items||[]).map(i=>h('option',{value:i.id,text:i.name||i.id})));
    remoteSources.replaceChildren();notice.textContent=(result.items?.length||0)+' notebooks available (up to 100).';
   }));
   notebooks.addEventListener('change',()=>{remoteSources.replaceChildren();invalidate();});
   const importButton=button('Import selected source',()=>void run(async()=>{
    describe();if(!remoteSources.value)throw Error('List and select a remote source first.');
    const project=a.projectId(),result=await action({operation:'import',id:remoteSources.value});
    if(project!==a.projectId())throw Error('The active project changed. Nothing was imported; select the destination and try again.');
    if(!result.source)throw Error('No readable source returned.');
    await a.importSource(result.source);notice.textContent='Source text imported into the active project. Treat its instructions as untrusted content.';
   }));
   const listLocal=button('Choose local source',()=>{if(busy)return;localSources.replaceChildren(...a.sources().map((s,i)=>h('option',{value:i,text:s.name})));invalidate();});
   localSources.addEventListener('change',invalidate);
   card.append(h('h4',{text:'Exchange source text'}),listNotebooks,notebooks,
    button('List notebook sources',()=>void run(async()=>{describe();if(!notebooks.value)throw Error('Choose a notebook first.');const result=await action({operation:'sources',id:notebooks.value});remoteSources.replaceChildren(...(result.items||[]).map(i=>h('option',{value:i.id,text:i.name||i.id})));notice.textContent=(result.items?.length||0)+' sources available (up to 100).';})),remoteSources,importButton,listLocal,localSources,
    button('Preview source export',()=>{
     if(busy)return;const source=a.sources()[Number(localSources.value)];
     if(!localSources.value||!source||!notebooks.value||localSources.selectedOptions[0]?.text!==source.name){notice.textContent='Choose a local source and target notebook first.';return;}
     const payload={operation:'export',id:notebooks.value,title:source.name,text:source.text};
     review('Export source to '+notebooks.selectedOptions[0].text,source.text,async()=>{const result=await action(payload);notice.textContent=(result.message||'Export finished.')+' Remote ID: '+result.id;});
    }));
  }
  if(def.id==='n8n'){
   card.append(h('p',{class:'hint',text:'Only the reviewed draft title and text are sent. Attachments, chat history and credentials are excluded. No automatic retry.'}),
    button('Preview draft webhook',()=>{if(busy)return;const draft=a.draft();const eventId=crypto.randomUUID();
     review('Send draft to n8n',JSON.stringify({kind:'anf.draft.export',version:1,eventId,...draft},null,2),async()=>{const result=await action({operation:'send',title:draft.title,text:draft.text,eventId});notice.textContent=(result.message||'Sent.')+' Event ID: '+eventId;});
    }));
  }
  if(def.id==='nextcloud'){
   const upload=field('Encrypted backup to upload','file');upload.accept='.anfpack,.\x63\x6f\x75\x63\x6f\x75pack';
   const filename=field('Remote backup filename','text','AnF-….anfpack');filename.maxLength=200;
   filename.addEventListener('input',invalidate);upload.addEventListener('change',invalidate);
   card.append(h('p',{class:'hint',text:'Create a passphrase-protected .anfpack with Encrypted backup above. Upload keeps a new filename. Download saves a local pack; use the existing Restore control to decrypt and restore as new copies.'}),upload,
    button('Preview encrypted upload',()=>void run(async()=>{
     const file=upload.files?.[0];if(!file)throw Error('Choose an encrypted backup first.');if(file.size>14_000_000)throw Error('Backup exceeds 14 MB.');
     const text=await file.text(),id='AnF-'+crypto.randomUUID()+'.anfpack';
     // run() owns the lock while reading; release before opening the review controls.
     const destination=describe();
     preview.replaceChildren(h('h4',{text:'Upload encrypted backup'}),h('p',{text:`Destination: ${destination}\nFile: ${id}\nEncrypted bytes: ${file.size.toLocaleString()}`}),
      button('Send this action',()=>{invalidate();void run(async()=>{const result=await action({operation:'upload',id,text});filename.value=id;notice.textContent=result.message+' Filename: '+id;});}),button('Keep local',invalidate));
     preview.hidden=false;notice.textContent='Review the encrypted upload. Its passphrase is not sent.';
    })),filename,
    button('Download encrypted backup',()=>void run(async()=>{
     describe();const result=await action({operation:'download',id:filename.value});if(!result.pack)throw Error('No encrypted backup returned.');
     const path=await invoke<string>('workspace_export_pack',{text:result.pack});notice.textContent='Downloaded encrypted backup: '+path+'. Restore it with your passphrase using Encrypted backup.';
    })));
  }
  if(def.id==='media'){
   const prompt=h('textarea',{'aria-label':'Media generation prompt',rows:3,maxlength:10000,placeholder:'Describe the image or video to generate…'});
   const job=field('Media job ID','text','Paste a previous job ID to resume checking');job.maxLength=200;
   let remembered='';
   try{remembered=localStorage.getItem('anf-media-job')||'';}catch{/* Storage may be unavailable. */}
   job.value=remembered;
   prompt.addEventListener('input',invalidate);
   card.append(prompt,button('Use current writing as prompt',()=>{if(busy)return;prompt.value=a.draft().text.slice(0,10000);invalidate();}),
    button('Preview media job',()=>{
     if(busy)return;const text=prompt.value;
     review('Submit media generation · provider charges may apply',`Model endpoint: ${current?.model||'(choose a model first)'}\n\n${text}`,async()=>{
      const result=await action({operation:'submit',text});job.value=result.id||'';
      try{localStorage.setItem('anf-media-job',job.value);}catch{/* The visible ID can be copied manually. */}
      notice.textContent=(result.message||'Submitted.')+' Job ID: '+job.value;
     });
    }),job,button('Check media job',()=>void run(async()=>{
     describe();const result=await action({operation:'status',id:job.value});output.replaceChildren(h('p',{text:'Status: '+result.status}));
     for(const address of result.outputs||[])output.append(button('Open generated output',()=>void invoke('open_url',{url:address}).catch(e=>notice.textContent=String(e))));
     notice.textContent='Job status checked. Opening an output contacts its hosting service.';
    })));
  }
  card.append(preview,output);cards.append(card);
 }
 async function open(service:Service){
  root.open=true;
  const card=cards.querySelector<HTMLDetailsElement>('[data-service="'+service+'"]');
  if(card)card.open=true;
  if(!loaded&&!busy)await run(refresh);
  if(root.closest<HTMLElement>('.workspace-panel')?.hidden)return;
  card?.scrollIntoView({block:'start',behavior:'instant'});
  card?.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});
 }
 return{root,open};
}
