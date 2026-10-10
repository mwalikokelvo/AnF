// Official CPU runtime + official Qwen model, pinned and verified before use.
import { mkdir, stat, rename, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../local-ai/', import.meta.url));
await mkdir(root, {recursive:true});
async function hash(file) {
  const h = createHash('sha256');
  for await (const part of createReadStream(file)) h.update(part);
  return h.digest('hex');
}
async function download(url, name, expected) {
  const file = path.join(root,name);
  if (await stat(file).catch(()=>null)) {
    if (!expected || await hash(file) === expected) { console.log(`${name}: verified cached file`); return; }
    throw Error(`${name}: cached checksum mismatch; move the file aside before retrying.`);
  }
  console.log(`Downloading ${name}`);
  const r = await fetch(url);
  if (!r.ok) throw Error(`${name}: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file+'.partial'));
  if (expected && await hash(file+'.partial') !== expected) throw Error(`${name}: checksum mismatch`);
  await rename(file+'.partial',file);
  console.log(`${name}: download verified`);
}
await Promise.all([
  download('https://github.com/ggml-org/llama.cpp/releases/download/b11380/llama-b11380-bin-win-cpu-x64.zip', 'runtime.zip','14745434896a9ffc7acc21f0c11ac95eb7c3d33589def679c7ff1aca3a1dbd4c'),
  download('https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf', 'model-source.gguf','061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a'),
  download('https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf', 'model-fast.gguf','9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031'),
  download('https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.rten','ocr-detection.rten','f15cfb56bd02c4bf478a20343986504a1f01e1665c2b3a0ad66340f054b1b5ca'),
  download('https://ocrs-models.s3-accelerate.amazonaws.com/text-recognition.rten','ocr-recognition.rten','e484866d4cce403175bd8d00b128feb08ab42e208de30e42cd9889d8f1735a6e'),
  download('https://huggingface.co/robertknight/ocrs/resolve/df0edd170279ab971b53e094c627255a87e1a503/README.md','OCR-LICENSE.txt','dd8758be23f3c41367104b17936afbd4833bffdefccf76d30b010924e99faea1'),
  download('https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt','OCR-CC-BY-SA-LICENSE.txt'),
  download('https://raw.githubusercontent.com/ggml-org/llama.cpp/b11380/LICENSE','llama-LICENSE.txt'),
  download('https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/LICENSE','Qwen-LICENSE.txt'),
]);
await writeFile(path.join(root,'NOTICE.txt'), `Coucou offline components (0.1.4)
Runtime: llama.cpp b11380 (MIT), https://github.com/ggml-org/llama.cpp
Fast: official Qwen3-0.6B Q8_0, unmodified (Apache-2.0), https://huggingface.co/Qwen/Qwen3-0.6B-GGUF
Balanced: Qwen3-1.7B (Apache-2.0), https://huggingface.co/Qwen/Qwen3-1.7B-GGUF
Balanced weights were MODIFIED: requantized Q8_0 to Q4_K_M with llama-quantize b11380 --allow-requantize, 4 threads.
Source SHA256: 061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a
Derived model.gguf SHA256: 54c0f1203a724e9f33e76916beab3bdfaffef56cf7b42a93b1bc21319fc0bf97
Fast SHA256: 9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031
Runtime ZIP SHA256: 14745434896a9ffc7acc21f0c11ac95eb7c3d33589def679c7ff1aca3a1dbd4c
OCR: Robert Knight / Ocrs pre-trained models, unmodified, CC-BY-SA 4.0.
https://huggingface.co/robertknight/ocrs/tree/df0edd170279ab971b53e094c627255a87e1a503
https://creativecommons.org/licenses/by-sa/4.0/
Models trained on HierText (Google Research) and synthetic data. Attribution and license accompany these files.
Stable RTen export files from the project's official ocrs-models.s3-accelerate.amazonaws.com distribution, last modified 2024-01-01, pinned by these checksums.
Detection SHA256: f15cfb56bd02c4bf478a20343986504a1f01e1665c2b3a0ad66340f054b1b5ca
Recognition SHA256: e484866d4cce403175bd8d00b128feb08ab42e208de30e42cd9889d8f1735a6e
Model usage has no recurring hosted quota, but finite context, RAM, speed and quality.
`);
console.log('Run prepare-offline.ps1 to extract the CPU runtime and quantize the Balanced model.');
