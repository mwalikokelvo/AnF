import {h} from '../views/dom';
export type SearchHit={title:string;url:string;snippet:string};

export function publicSourceAddress(value:string):string|null {
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password)return null;
    for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid|msclkid)$/i.test(key))url.searchParams.delete(key);
    url.hash='';return url.href;
  }catch{return null;}
}
export function searchResult(hit:SearchHit,read:HTMLElement,open:HTMLElement){
  const address=publicSourceAddress(hit.url);if(!address)return null;
  const url=new URL(address);
  return h('article',{class:'source search-result'},
    h('p',{class:'source-domain',text:url.hostname.replace(/^www\./,'')}),
    h('h3',{text:hit.title||url.hostname}),h('p',{class:'source-snippet',text:hit.snippet||'Open this source to read its contents.'}),
    h('div',{class:'row'},read,open));
}
