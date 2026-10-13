import {unzipSync,strFromU8} from 'fflate';
// Android devices and emulator images can retain older system WebView versions.
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc='/pdf.worker.mjs';
const LIMIT=2_000_000;
function xml(text:string){const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror')||d.doctype)throw Error('Invalid or unsupported document XML.');return d;}
function tags(d:Document,name:string){return Array.from(d.getElementsByTagNameNS('*',name));}
function path(base:string,ref:string){if(!ref||/[:\\%]/.test(ref)||ref.startsWith('/'))throw Error('Unsupported book resource path.');const parts=base.split('/').filter(Boolean);for(const p of ref.split('#')[0].split('/')){if(p==='..'){if(!parts.pop())throw Error('Invalid book resource path.');}else if(p&&p!=='.')parts.push(p);}return parts.join('/');}
export async function readDocument(file:File,progress:(s:string)=>void):Promise<string>{
  if(file.size>50*1024*1024)throw Error('Choose a file under 50 MB.');
  const ext=file.name.split('.').pop()?.toLowerCase();
  const data=new Uint8Array(await file.arrayBuffer());
  if(ext==='pdf'){
    const loading=getDocument({data,isEvalSupported:false,disableFontFace:true,cMapUrl:'/cmaps/',cMapPacked:true,standardFontDataUrl:'/standard_fonts/',wasmUrl:'/wasm/'});const pdf=await loading.promise;
    try{if(pdf.numPages>600)throw Error('PDFs support up to 600 pages.');let out='';for(let i=1;i<=pdf.numPages;i++){progress(`Reading page ${i} of ${pdf.numPages}…`);const page=await pdf.getPage(i);const content=await page.getTextContent();out+=`\n[Page ${i}]\n`+content.items.map((x:any)=>x.str||'').join(' ')+'\n';page.cleanup();if(out.length>LIMIT)throw Error('Extracted text exceeds 2 MB. Split the document.');}if(!out.replace(/\[Page \d+\]/g,'').trim())throw Error('This PDF needs OCR. This first Android edition reads selectable PDF text.');return out;}finally{await pdf.destroy();}
  }
  if(ext==='docx'||ext==='epub'){
    let total=0;const files=unzipSync(data,{filter:e=>{if(!/\.(xml|opf|xhtml|html|htm)$/i.test(e.name))return false;total+=e.originalSize;if(e.originalSize>LIMIT||total>16_000_000)throw Error('This archive expands beyond the document limit.');return true;}});
    const get=(p:string)=>{if(!files[p])throw Error(`Document section missing: ${p}`);return strFromU8(files[p]);};
    if(ext==='docx'){const d=xml(get('word/document.xml'));return tags(d,'p').map(p=>Array.from(p.getElementsByTagNameNS('*','t')).map(t=>t.textContent).join('')).join('\n');}
    const container=xml(get('META-INF/container.xml'));const root=tags(container,'rootfile')[0]?.getAttribute('full-path');if(!root)throw Error('Book package is missing.');const location=path('',root);const base=location.includes('/')?location.slice(0,location.lastIndexOf('/')):'';const pkg=xml(get(location));const manifest=new Map(tags(pkg,'item').map(e=>[e.getAttribute('id'),e.getAttribute('href')]));const spine=tags(pkg,'itemref');if(!spine.length||spine.length>1000)throw Error('Book must contain 1–1,000 sections.');let out='';for(const section of spine){if(section.getAttribute('linear')==='no')continue;const href=manifest.get(section.getAttribute('idref'));if(!href)throw Error('Book chapter reference is missing.');const d=new DOMParser().parseFromString(get(path(base,href)),'text/html');d.querySelectorAll('script,style,nav,iframe,object').forEach(e=>e.remove());out+=Array.from(d.querySelectorAll('p,h1,h2,h3,h4,li,pre,blockquote,td')).map(e=>e.textContent).join('\n')+'\n\n';if(out.length>LIMIT)throw Error('Book text exceeds 2 MB.');}return out;
  }
  if(data.length>LIMIT)throw Error('Text files must be under 2 MB.');
  return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
