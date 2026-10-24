/** Stored excerpts are snapshots: removing a loaded source must not change an old answer. */
export type Evidence={id:number;sourceName:string;page:number|null;text:string;ocr:boolean};

export function copyEvidence(value:unknown):Evidence[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>4)throw Error('Invalid answer evidence.');
  const bytes=(text:string)=>new TextEncoder().encode(text).length;
  const ids=new Set<number>();
  return value.map(item=>{
    if(!item||!Number.isSafeInteger(item.id)||item.id<1||ids.has(item.id)
      ||typeof item.sourceName!=='string'||bytes(item.sourceName)>2000
      ||(item.page!==null&&(!Number.isSafeInteger(item.page)||item.page<1))
      ||typeof item.text!=='string'||bytes(item.text)>2000||typeof item.ocr!=='boolean'){
      throw Error('Invalid answer evidence.');
    }
    ids.add(item.id);
    return {id:item.id,sourceName:item.sourceName,page:item.page,text:item.text,ocr:item.ocr};
  });
}
