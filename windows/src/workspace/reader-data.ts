export type Highlight={id:string;start:number;end:number;quote:string;color:'gold'|'green'|'pink';note:string};
export type ReadingState={offset:number;bookmarks:number[];annotations:Highlight[]};
export type ReadingSource={name:string;text:string;path?:string|null;pages?:{number:number;text:string;ocr?:boolean}[];reading?:ReadingState|null};
export type ReadingSection={start:number;end:number;label:string};
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

/** Use real page boundaries only when their text exactly reconstructs the source.
 * Existing note anchors always address the unchanged source text. */
export function sourceSections(source:ReadingSource):ReadingSection[]{
 if(source.pages?.length && source.pages.map(p=>p.text).join('\n\n')===source.text){
  let offset=0;return source.pages.map((page,i)=>{const start=offset;offset+=page.text.length+(i<source.pages!.length-1?2:0);return{start,end:offset,label:'Page '+page.number+(page.ocr?' \u00b7 OCR':'')};});
 }
 return sections(source.text);
}

export function readingNotesMarkdown(source:ReadingSource){
 const state=readingState(source.reading,source.text),parts=sourceSections(source);
 const label=(offset:number)=>parts.find(p=>p.end>offset)?.label||parts[parts.length-1].label;
 const quote=(text:string)=>text.split(/\r?\n/).map(line=>'> '+line).join('\n');
 return '# Reading notes: '+source.name.replace(/[\r\n]/g,' ')+'\n\n'+(state.annotations.length?state.annotations.map(a=>'## '+label(a.start)+'\n\n'+quote(a.quote)+(a.note?'\n\nNote:\n'+quote(a.note):'')).join('\n\n'):'No highlights saved.')+'\n\n## Bookmarks\n\n'+(state.bookmarks.length?state.bookmarks.map(n=>'- '+label(n)).join('\n'):'No bookmarks saved.')+'\n';
}
export function documentMatches(text:string,query:string,matchCase=false):{start:number;end:number}[]{
 if(!query.trim())return[];
 const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),regex=new RegExp(escaped,matchCase?'gu':'giu'),result:{start:number;end:number}[]=[];
 for(const match of text.matchAll(regex)){result.push({start:match.index!,end:match.index!+match[0].length});if(result.length>=5000)break;}
 return result;
}
