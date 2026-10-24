import {h} from '../views/dom';
/** Display pagination never truncates the stored response. */
export function responsePages(text:string,limit=1700):string[]{
  if(!Number.isInteger(limit)||limit<1)throw new RangeError('Page size must be a positive integer.');
  const starts=Array.from(text.matchAll(/\S+/gu),m=>m.index!);const pages:string[]=[];
  for(let word=0;word<starts.length;word+=limit){pages.push(text.slice(word===0?0:starts[word],starts[word+limit]??text.length));}
  return pages.length?pages:[text];
}
export function paginatedResponse(text:string):HTMLElement {
  const pages=responsePages(text),body=h('pre',{text:pages[0]}),root=h('div',{class:'response-pages'},body);
  if(pages.length<2)return root;
  let page=0;const label=h('span',{'aria-live':'polite'});
  const previous=h('button',{text:'Previous page',type:'button','data-keep-enabled':true});
  const next=h('button',{text:'Next page',type:'button','data-keep-enabled':true});
  body.tabIndex=0;body.setAttribute('aria-label','Reply page');
  const update=()=>{body.textContent=pages[page];body.scrollTop=0;label.textContent=`Page ${page+1} of ${pages.length} · ${pages[page].match(/\S+/gu)?.length??0} words`;previous.disabled=page===0;next.disabled=page===pages.length-1;};
  body.addEventListener('keydown',event=>{if(event.key==='ArrowRight'&&page<pages.length-1){page++;update();event.preventDefault();}else if(event.key==='ArrowLeft'&&page>0){page--;update();event.preventDefault();}});
  previous.addEventListener('click',()=>{page=Math.max(0,page-1);update();});next.addEventListener('click',()=>{page=Math.min(pages.length-1,page+1);update();});
  root.append(h('div',{class:'response-navigation'},previous,label,next));update();return root;
}
