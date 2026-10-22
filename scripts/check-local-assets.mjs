import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {fontMagic,extract} from './extract-licensed-fonts.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'anf-fonts-'));
try{
 const cache=path.join(dir,'cache'),out=path.join(dir,'out');await mkdir(cache);
 const font=await readFile(new URL('../windows/src/workspace/assets/Lora.ttf',import.meta.url));assert(fontMagic(font));assert(!fontMagic(Buffer.from('not a font')));assert(!fontMagic(Buffer.alloc(11_000_000)));
 await writeFile(path.join(cache,'no-extension'),font);await writeFile(path.join(cache,'broken.otf'),'broken');
 const result=await extract(cache,out);assert.equal(result.length,1);assert.equal((await readFile(path.join(out,result[0].file))).length,font.length);
 await assert.rejects(extract(cache,path.join(cache,'nested')),/separate/);
 await assert.rejects(extract(cache,dir),/separate/);
 console.log('PASS: font signature/size checks, extensionless licensed cache copy, independent destination, content integrity.');
}finally{await rm(dir,{recursive:true,force:true});}
