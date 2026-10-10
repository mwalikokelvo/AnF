export function documentInfo(source:{name:string;text:string;reading?:{offset:number;annotations:unknown[];bookmarks:number[]}|null}){
 const match=/\.([a-z0-9]+)$/i.exec(source.name),extension=match?.[1].toUpperCase();
 const format=/^https?:\/\//i.test(source.name)?'WEB':extension&&['PDF','EPUB','DOCX','TXT','MD','CSV','JSON','LOG','PNG','JPG','JPEG'].includes(extension)?extension:'TEXT';
 const offset=Math.max(0,Math.min(source.text.length,source.reading?.offset||0));
 return {format,position:source.text.length?Math.floor(offset/source.text.length*100):0,notes:source.reading?.annotations.length||0,bookmarks:source.reading?.bookmarks.length||0};
}
