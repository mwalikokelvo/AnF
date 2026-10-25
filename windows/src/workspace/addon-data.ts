export type AddonManifest={id:string;name:string;version:string;type:'theme'|'plugin';entry:string;description:string;author:string;downloadUrl?:string;sha256:string};
export const REGISTRY='https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/registry.json';
const keys=new Set(['id','name','version','type','entry','description','author','downloadUrl','sha256']);
export function manifest(value:unknown):AddonManifest {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid add-on manifest.');
 const m={...value} as Record<string,unknown>;
 if(m.author===undefined)m.author='';
 if(Object.keys(m).some(k=>!keys.has(k))||typeof m.id!=='string'||!(/^[a-z0-9-]{1,64}$/).test(m.id)||
 !['theme','plugin'].includes(String(m.type))||m.entry!==(m.type==='theme'?'theme.css':'index.js')||
 typeof m.name!=='string'||!m.name.length||m.name.length>120||typeof m.version!=='string'||!m.version.length||m.version.length>40||
 typeof m.description!=='string'||m.description.length>1000||typeof m.author!=='string'||m.author.length>120||
 typeof m.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(m.sha256))throw Error('Invalid add-on manifest.');
 if(m.downloadUrl!==undefined){if(typeof m.downloadUrl!=='string')throw Error('Invalid download URL.');const u=new URL(m.downloadUrl);if(u.origin!=='https://raw.githubusercontent.com'||!u.pathname.startsWith('/mwalikokelvo/AnF/main/marketplace/')||u.search||u.hash||u.username||u.password)throw Error('Untrusted add-on download URL.');}
 return m as AddonManifest;
}
export function catalog(value:unknown):AddonManifest[]{
 if(!Array.isArray(value)||value.length>100)throw Error('Invalid marketplace catalog.');
 const result=value.map(manifest);if(new Set(result.map(m=>m.id)).size!==result.length)throw Error('Duplicate catalog IDs.');
 return result;
}
const tokens=new Set(['--anf-bg','--anf-surface','--anf-surface-hover','--anf-border','--anf-text-primary','--anf-text-secondary','--anf-accent','--anf-radius']);
export function themeTokens(css:string):Record<string,string>{
 if(css.length>16000)throw Error('Theme exceeds 16 KB.');
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,'').trim(),match=/^:root\s*\{([^{}]*)\}$/.exec(clean);
 if(!match)throw Error('Themes must contain a single :root token block.');
 const result:Record<string,string>={};
 for(const line of match[1].split(';').map(s=>s.trim()).filter(Boolean)){
  const i=line.indexOf(':'),key=line.slice(0,i).trim(),value=line.slice(i+1).trim();
  if(i<1||!tokens.has(key)||key in result)throw Error('Unsupported or repeated theme token.');
  if(key==='--anf-radius'){if(!/^(?:[0-9]|[12][0-9]|3[0-2])px$/.test(value))throw Error('Invalid theme radius.');}
  else if(!/^#[a-fA-F0-9]{6}$/.test(value))throw Error('Theme colors must be six-digit hex colors.');
  result[key]=value;
 }
 if(!Object.keys(result).length)throw Error('Theme has no tokens.');
 return result;
}
export function themeStyle(css:string):string{
 const t=themeTokens(css),mapping:Record<string,string>={'--anf-bg':'--bg','--anf-surface':'--surface','--anf-surface-hover':'--hover','--anf-border':'--line','--anf-text-primary':'--ink','--anf-text-secondary':'--muted','--anf-accent':'--accent'};
 const declarations=Object.entries(t).flatMap(([k,v])=>[k+':'+v,...(mapping[k]?[mapping[k]+':'+v]:[])]);
 if(t['--anf-bg'])declarations.push('--side:'+t['--anf-bg']);
 if(t['--anf-surface'])declarations.push('--paper:'+t['--anf-surface']);
 if(t['--anf-accent']){
  const hex=t['--anf-accent'].slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  declarations.push('--accent-ink:'+(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#111111':'#ffffff'));
 }
 return ':root{'+Object.entries(t).map(([k,v])=>k+':'+v).join(';')+'}#workspace-root#workspace-root{'+declarations.join(';')+'}';
}
