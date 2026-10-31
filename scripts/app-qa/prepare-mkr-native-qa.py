"""Create a fresh, source-isolated AnF engineering workspace, never a release.

Generated AAC + a test-only Java catalog replace provider access. The actual
AnF Tauri backend, owned-child supervisor and WinRT decoder remain in use.
No runtime override is added to production source or its inventory gate.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import uuid
import re

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT.parent / 'anf-pr47-evidence'
JDK = ROOT.parent / '2026-10-03/https-github-com-louis-cfm-coucou/work/android-tools/jdk/jdk-21.0.12.1+1'

def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def copy(source, dest):
    if source.is_symlink() or source.is_junction() or not source.is_file():
        raise ValueError('Source must be a regular unlinked file')
    dest.parent.mkdir(parents=True, exist_ok=True)
    with source.open('rb') as src, dest.open('xb') as dst:
        shutil.copyfileobj(src, dst)

def copy_tree(source, dest):
    if source.is_symlink() or source.is_junction():
        raise ValueError('Linked source refused')
    for path in source.rglob('*'):
        if path.is_symlink() or path.is_junction():
            raise ValueError('Linked tree entry refused')
        if path.is_file():
            copy(path, dest / path.relative_to(source))

def run(args, cwd):
    result = subprocess.run([str(a) for a in args], cwd=cwd, capture_output=True,
                            timeout=90, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('Engineering fixture tool failed: ' + result.stderr.decode('utf-8', 'replace')[:3000])

def main():
    pointer = json.loads((ROOT/'integrations/mkr-music/engine/build/reports/latest-runtime-candidate.json').read_text(encoding='utf-8'))
    candidate = Path(pointer['bundle'])
    approved = json.loads(Path(pointer['manifest']).read_text(encoding='utf-8'))
    assert candidate.is_relative_to(ROOT/'integrations/mkr-music/engine/build/runtime-candidates')
    assert Path(pointer['manifest']).parent == candidate.parent
    assert approved['schema'] == 1 and 0 < len(approved['files']) <= 4096
    for rel, expected in approved['files'].items():
        assert all(part not in ('', '.', '..') and re.fullmatch(r'[A-Za-z0-9_.-]+',part) for part in rel.split('/'))
        assert re.fullmatch(r'[a-f0-9]{64}',expected)
    audio = EVIDENCE/'mkr-native-audio/fixture.m4a'
    assert 0 < audio.stat().st_size <= 5_242_880
    out = EVIDENCE/('mkr-workspace-qa-'+str(uuid.uuid4()))
    out.mkdir(exist_ok=False)
    source = out/'source'
    app = source/'windows/src-tauri'
    binary_dir = out/'bin'
    runtime = binary_dir/'mkr-runtime'
    for rel in ['src', 'icons', 'capabilities', 'nsis']:
        copy_tree(ROOT/'windows/src-tauri'/rel, app/rel)
    for rel in ['Cargo.toml', 'build.rs', 'tauri.conf.json']:
        copy(ROOT/'windows/src-tauri'/rel, app/rel)
    copy_tree(ROOT/'windows/dist', source/'windows/dist')
    copy(ROOT/'scripts/local-voice-job.py', source/'scripts/local-voice-job.py')
    copy(ROOT/'windows/target/release/anf-hook.exe', source/'windows/target/release/anf-hook.exe')
    copy(ROOT/'windows/Cargo.toml', source/'windows/Cargo.toml')
    copy(ROOT/'windows/Cargo.lock', source/'windows/Cargo.lock')
    workspace = source/'windows/Cargo.toml'
    workspace.write_text(workspace.read_text(encoding='utf-8').replace('members = ["src-tauri", "hook"]','members = ["src-tauri"]')+'\n[profile.dev.package.anf-mkr-qa]\ndebug = 0\n',encoding='utf-8')
    manifest = app/'Cargo.toml'
    text = manifest.read_text(encoding='utf-8').replace('name = "anf"','name = "anf-mkr-qa"',1).replace('name = "anf_lib"','name = "anf_mkr_qa_lib"',1)
    # The QA executable needs an rlib, not redundant DLL/static-library outputs.
    # Limit app debug metadata on the user's 8 GB machine; production untouched.
    text = text.replace('crate-type = ["staticlib", "cdylib", "rlib"]','crate-type = ["rlib"]')
    path = (ROOT/'integrations/mkr-music/windows-native').as_posix()
    text = text.replace('path = "../../integrations/mkr-music/windows-native"',f'path = "{path}"')
    manifest.write_text(text,encoding='utf-8')
    lock = source/'windows/Cargo.lock'
    lock.write_text(lock.read_text(encoding='utf-8').replace('name = "anf"\nversion = "0.1.42"','name = "anf-mkr-qa"\nversion = "0.1.42"',1),encoding='utf-8')
    main_rs = app/'src/main.rs'
    main_rs.write_text(main_rs.read_text(encoding='utf-8').replace('anf_lib::run()','anf_mkr_qa_lib::run()'),encoding='utf-8')
    config = json.loads((app/'tauri.conf.json').read_text(encoding='utf-8'))
    config.update(productName='AnF MKR Engineering QA',identifier='fr.louisraille.anf.qa',mainBinaryName='anf-mkr-qa')
    config['bundle']['active'] = False
    config['bundle']['resources'] = {}
    (app/'tauri.conf.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    for rel, expected in approved['files'].items():
        if not rel.startswith('runtime/'):
            continue
        origin = candidate/rel
        assert digest(origin) == expected, 'Existing candidate changed'
        copy(origin, runtime/rel)
        assert digest(runtime/rel) == expected, 'Copied JRE changed'
    classes = out/'fixture-classes'
    classes.mkdir()
    fixture = ROOT/'scripts/app-qa/fixtures/WindowsCatalogSidecarKt.java'
    run([JDK/'bin/javac.exe','--release','21','-d',classes,fixture],out)
    (runtime/'lib').mkdir(parents=True)
    run([JDK/'bin/jar.exe','--create','--file',runtime/'lib/fixture.jar','-C',classes,'.','-C',audio.parent,audio.name],out)
    files = {p.relative_to(runtime).as_posix():digest(p) for p in sorted(runtime.rglob('*')) if p.is_file()}
    inventory = {'schema':1,'java':'runtime/bin/java.exe','classpath':['lib/fixture.jar'],'files':files}
    (app/'mkr-engineering-manifest.json').write_text(json.dumps(inventory,sort_keys=True),encoding='utf-8')
    backend = app/'src/mkr_native.rs'
    text = backend.read_text(encoding='utf-8')
    original = "const REVIEWED_MANIFEST: Option<&'static str> = None;"
    assert text.count(original) == 1
    text = text.replace(original, "const REVIEWED_MANIFEST: Option<&'static str> = Some(include_str!(\"../mkr-engineering-manifest.json\"));")
    assert text.count('PlaybackHost::launch(runtime, false)') == 1
    text = text.replace('PlaybackHost::launch(runtime, false)','PlaybackHost::launch(runtime, true)')
    backend.write_text(text,encoding='utf-8')
    main_lib = app/'src/lib.rs'
    text = main_lib.read_text(encoding='utf-8')
    assert text.count('pipe::start(handle.clone());') == 1
    text = text.replace('pipe::start(handle.clone());','// Engineering QA: never bind the installed app relay pipe.')
    main_lib.write_text(text,encoding='utf-8')
    profile = out/'profile'
    profile.mkdir()
    report = {'engineeringOnly':True,'readyForPublication':False,'providerBacked':False,
              'source':str(source),'binaryDir':str(binary_dir),'profile':str(profile),
              'cargoTarget':str(ROOT/'windows/target'),'binaryName':'anf-mkr-qa.exe',
              'fixtureSha256':digest(audio),'fixtureSourceSha256':digest(fixture),
              'productionBackendSha256':digest(ROOT/'windows/src-tauri/src/mkr_native.rs'),
              'inventorySha256':digest(app/'mkr-engineering-manifest.json'),
              'runtimeFiles':len(files)}
    (out/'engineering.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (EVIDENCE/'latest-mkr-workspace-qa.json').write_text(json.dumps({'directory':str(out)},indent=2),encoding='utf-8')
    print(json.dumps({'directory':str(out),'runtimeFiles':len(files),'readyForPublication':False}))

if __name__ == '__main__':
    main()
