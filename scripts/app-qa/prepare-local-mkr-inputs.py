"""Prepare source-bound portable JDK/JRE inputs for isolated desktop QA only.

No installation, environment/registry change, app launch or provider catalog.
The explicit fetch switch permits only the existing pinned vendor archive.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT/'integrations/mkr-music'
EVIDENCE = ROOT.parent/'anf-pr47-evidence'
spec = importlib.util.spec_from_file_location('audit', HERE/'audit-windows-jdk.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch-jdk', action='store_true')
    args = parser.parse_args()
    if os.name != 'nt' or os.environ.get('GITHUB_ACTIONS') == 'true':
        raise ValueError('Explicit local Windows QA inputs only')
    base = EVIDENCE/'mkr-desktop-toolchain'
    base.mkdir(exist_ok=True)
    archive = base/'vendor-jdk.zip'
    pin = json.loads((HERE/'windows-jdk-input.json').read_text())
    source = json.loads((HERE/'native-source-evidence.json').read_text())['jdkSource']
    if not archive.exists():
        if not args.fetch_jdk:
            raise ValueError('Pinned archive missing; --fetch-jdk is required for the download')
        audit.fetch(pin['archiveUrl'], archive)
    proof, _ = audit.inspect(archive, pin, source)
    target = base/'toolchain'
    # Audit every archive entry/path/hash before extraction into a new directory.
    if target.exists():
        raise ValueError('Existing extracted toolchain preserved; inspect it before another preparation')
    target.mkdir()
    with zipfile.ZipFile(archive) as z:
        vendor_root = z.namelist()[0].split('/')[0]
        z.extractall(target)
    jdk = target/vendor_root
    proof['toolchainExtractedForLocalQa'] = True
    proof_file = base/'jdk-input-proof.json'
    proof_file.write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8')
    # No Kotlin/provider engine is needed by the independent Java fixture.
    # Create a distinctly named fixture-only image, never a production candidate.
    candidate = HERE/'engine/build/runtime-candidates'/('fixture-only-'+str(uuid.uuid4()))
    candidate.mkdir(parents=True)
    runtime = candidate/'bundle/runtime'
    command = [str(jdk/'bin/jlink.exe'), '-J-Xmx256m', '--add-modules',
               ','.join(audit.MODULES), '--strip-debug', '--no-header-files',
               '--no-man-pages', '--output', str(runtime)]
    subprocess.run(command, check=True, timeout=180, creationflags=subprocess.CREATE_NO_WINDOW)
    bundle = candidate/'bundle'
    files = {p.relative_to(bundle).as_posix():sha(p) for p in sorted(bundle.rglob('*')) if p.is_file()}
    manifest = candidate/'fixture-runtime-manifest.json'
    manifest.write_text(json.dumps({'schema':1,'files':files}, indent=2)+'\n', encoding='utf-8')
    reports = HERE/'engine/build/reports'
    reports.mkdir(parents=True, exist_ok=True)
    pointer = reports/'latest-runtime-candidate.json'
    if pointer.exists():
        raise ValueError('Existing candidate pointer preserved; do not replace an active build input')
    pointer.write_text(json.dumps({'bundle':str(bundle),'manifest':str(manifest),
                                   'engineeringOnly':True,'fixtureOnly':True,
                                   'providerBacked':False,'readyForPublication':False}, indent=2)+'\n', encoding='utf-8')
    report = {'jdk':str(jdk),'proof':str(proof_file),'bundle':str(bundle),
              'runtimeFileCount':len(files),'engineeringOnly':True,
              'fixtureOnly':True,'readyForPublication':False}
    (base/'local-inputs.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
