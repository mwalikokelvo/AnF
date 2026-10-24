export type Highlight={id:string;start:number;end:number;quote:string;color:'gold'|'green'|'pink';note:string};
export type ReadingState={offset:number;bookmarks:number[];annotations:Highlight[]};
export type ReadingSource={name:string;text:string;reading?:ReadingState|null};
export type ReadingSection={start:number;end:number;label:string};
export function sectionIndex(parts:ReadingSection[],offset:number){const found=parts.findIndex(p=>p.end>offset);return found<0?Math.max(0,parts.length-1):found;}
export function sections(text:string):ReadingSection[]{
  const result:ReadingSection[]=[];let start=0;
  while(start<text.length){let end=Math.min(start+3500,text.length);if(end<text.length){const line=text.lastIndexOf('\n',end-1);if(line>start+600)end=line+1;else {const space=text.lastIndexOf(' ',end-1);if(space>start+3000)end=space+1;else if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}}
    const first=text.slice(start,end).trim().split('\n')[0]||'';const label=/^(#{1,6}\s|chapter\b|part\b|\[Page\s)/i.test(first)?first.replace(/^#+\s*/,'').slice(0,90):'Section '+(result.length+1);
    result.push({start,end,label});start=end;
  }
  return result.length?result:[{start:0,end:0,label:'Empty document'}];
}
export function readingState(value:unknown,text:string):ReadingState{
  if(value==null)return{offset:0,bookmarks:[],annotations:[]};
  const v=value as ReadingState;const index=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=text.length;
  if(!index(v.offset)||!Array.isArray(v.bookmarks)||v.bookmarks.length>100||v.bookmarks.some(n=>!index(n))||!Array.isArray(v.annotations)||v.annotations.length>100)throw Error('Invalid reading notes or position.');
  const ids=new Set<string>();
  const annotations=v.annotations.map(a=>{if(!a||typeof a.id!=='string'||a.id.length>80||!a.id||ids.has(a.id)||!index(a.start)||!index(a.end)||a.end<=a.start||a.end-a.start>2000||typeof a.quote!=='string'||text.slice(a.start,a.end)!==a.quote||!['gold','green','pink'].includes(a.color)||typeof a.note!=='string'||a.note.length>1000)throw Error('A reading note no longer matches its source.');ids.add(a.id);return{id:a.id,start:a.start,end:a.end,quote:a.quote,color:a.color,note:a.note};});
  return{offset:v.offset,bookmarks:[...new Set(v.bookmarks)],annotations};
}
export function addHighlight(state:ReadingState,text:string,start:number,end:number,color:Highlight['color'],note:string,id:string){
  return readingState({...state,annotations:[...state.annotations,{id,start,end,quote:text.slice(start,end),color,note}]},text);
}
export function clipText(draft:string,quote:string,source:string){
  const next=draft+(draft.trim()?'\n\n':'')+quote+'\n\nSource: '+source;
  if(new TextEncoder().encode(next).length>200000)throw Error('This clip exceeds the writing limit. Start a new draft or shorten it.');return next;
}
