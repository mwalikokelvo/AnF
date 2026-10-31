// Copies the packages Tauri buries in target/release/bundle/ into
// windows/release/, with the names they ship under. Used by `npm run pack` and
// by the release workflows, so both produce exactly the same file names.

import { readFileSync, mkdirSync, copyFileSync, readdirSync, statSync, cpSync, createReadStream, writeFileSync, rmSync, renameSync } from "node:fs";
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = join(root, "target", "release", "bundle");
const outDir = join(root, "release");

const { version } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw Error('Invalid release version.');
}

// What each platform ships: where Tauri puts it, how to recognise it, and the
// names it is published under (the rolling name, when there is one, always
// points at the latest release).
const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
const debArch = process.arch === "arm64" ? "arm64" : "amd64";
const PACKAGES = {
  win32: [
    {
      dir: "nsis",
      suffix: "-setup.exe",
      names: [`AnF-Windows-${version}-setup.exe`, "AnF-Windows-setup.exe"],
    },
  ],
  linux: [
    {
      dir: "appimage",
      suffix: ".AppImage",
      names: [`AnF-Linux-${version}-${arch}.AppImage`, `AnF-Linux-${arch}.AppImage`],
    },
    { dir: "deb", suffix: ".deb", names: [`AnF-Linux-${version}-${debArch}.deb`] },
    { dir: "rpm", suffix: ".rpm", names: [`AnF-Linux-${version}-${arch}.rpm`] },
  ],
};

const packages = PACKAGES[process.platform];
if (!packages) {
  console.error(`Nothing to pack on ${process.platform}.`);
  process.exit(1);
}

/** The newest file in `dir` ending with `suffix`, in case an older build is still lying around. */
function newest(dir, suffix) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(suffix));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  return files
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const { dir, suffix, names } of packages) {
  const built = newest(join(bundleRoot, dir), suffix);
  if (!built) {
    console.error(`No *${suffix} in ${join(bundleRoot, dir)} — run \`npm run tauri build\` first.`);
    process.exit(1);
  }
  for (const name of names) {
    const dest = join(outDir, name);
    copyFileSync(built, dest);
    written.push(dest);
  }
}

console.log("\n  Packages ready\n");
for (const f of written) {
  const mb = (statSync(f).size / 1024 / 1024).toFixed(2);
  console.log(`  ${f}  (${mb} MB)`);
}
console.log();

if (process.platform === 'win32') {
  // A portable release needs the same offline resources as the installer.
  const portable = join(outDir, `AnF-Windows-${version}-portable`);
  // Rebuild only this version's generated directory; old optional runtimes
  // must not leak into a later package built without those features.
  if (dirname(portable) !== outDir) throw Error('Portable output escaped the release directory.');
  rmSync(portable, {recursive:true, force:true});
  mkdirSync(portable, {recursive:true});
  for (const binary of ['AnF.exe','anf-hook.exe']) {
    copyFileSync(join(root,'target/release',binary),join(portable,binary));
  }
  mkdirSync(join(portable,'local-ai'), {recursive:true});
  const required = ['llama-server.exe','model.gguf','model-fast.gguf','ocr-detection.rten','ocr-recognition.rten','NOTICE.txt','vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll','MSVC-LICENSE.txt'];
  const dlls = readdirSync(join(root,'local-ai')).filter(name=>name.endsWith('.dll'));
  if (!dlls.length) throw Error('Portable release has no native runtime DLLs.');
  for(const name of new Set([...required,...dlls,...readdirSync(join(root,'local-ai')).filter(name=>name.includes('LICENSE'))])) {
    copyFileSync(join(root,'local-ai',name),join(portable,'local-ai',name));
  }
  cpSync(join(root,'media'),join(portable,'media'),{recursive:true});
  if(process.argv.includes('--with-spotube')) {
    const music=join(root,'spotube-native/build/windows/x64/runner/Release');
    if(!statSync(join(music,'spotube.exe')).isFile())throw Error('Embedded music executable is missing.');
    cpSync(music,join(portable,'spotube'),{recursive:true});
    copyFileSync(join(root,'../integrations/spotube/LICENSE'),join(portable,'spotube-LICENSE.txt'));
  }
  for(const name of ['THIRD-PARTY-LICENSES.txt','THIRD-PARTY-EDITOR-LICENSES.txt','THIRD-PARTY-STORAGE-LICENSES.txt','THIRD-PARTY-AUDIO-LICENSES.txt']) {
    copyFileSync(join(root,name),join(portable,name));
  }
  console.log(`Portable release with offline resources: ${portable}`);
  const archive = portable + '.zip';
  // Windows 10/11's libarchive-based tar streams ZIP64 archives without the
  // 2 GB file limit of Compress-Archive or a PowerShell execution-policy change.
  const temporary = archive + '.partial';
  const packed = spawnSync('tar.exe', ['--format=zip', '-c', '-f', temporary,
    '-C', outDir, basename(portable)], {stdio:'inherit'});
  if (packed.error) throw packed.error;
  if (packed.status !== 0) process.exit(packed.status || 1);
  renameSync(temporary, archive);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  writeFileSync(join(outDir, 'SHA256SUMS-Windows-portable'),
    `${hash.digest('hex')}  AnF-Windows-${version}-portable.zip\n`);
}
