"""Bind a fresh hosted engineering build to its current source and exact binary.

This is an orchestration receipt, not a reproducible-build or release approval.
It never launches a binary, includes file contents, or alters production gates.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT.parent/'anf-pr47-evidence'
INPUTS = ['windows/src', 'windows/src-tauri', 'windows/Cargo.toml',
          'windows/Cargo.lock', 'windows/package.json', 'windows/package-lock.json',
          'windows/vite.config.ts', 'integrations/mkr-music/windows-native',
          'scripts/app-qa']

def sha(file):
    if file.is_symlink() or file.is_junction() or not file.is_file():
        raise ValueError('Receipt requires regular unlinked input files')
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8').strip()

def production_inputs():
    # Tracked source only: never a model, recording, user profile or secret file.
    names = git('ls-files', '--', *INPUTS).splitlines()
    if not names:
        raise ValueError('No tracked engineering source inputs')
    return {name:sha(ROOT/name) for name in names}

def snapshot_inputs(source):
    files = {}
    for file in sorted(source.rglob('*')):
        rel = file.relative_to(source).as_posix()
        # Tauri emits JSON schemas during the build, not compiled source.
        if rel.startswith('windows/src-tauri/gen/'):
            continue
        if file.is_symlink() or file.is_junction():
            raise ValueError('Linked snapshot input refused')
        if file.is_file():
            files[rel] = sha(file)
    if not files:
        raise ValueError('Empty engineering source snapshot')
    return files

def context():
    if os.name != 'nt' or os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Receipt is for a fresh hosted Windows QA build only')
    qa = Path(json.loads((EVIDENCE/'latest-mkr-workspace-qa.json').read_text())['directory'])
    if qa.parent != EVIDENCE or not qa.name.startswith('mkr-workspace-qa-'):
        raise ValueError('Invalid disposable engineering directory')
    descriptor = json.loads((qa/'engineering.json').read_text())
    if descriptor['engineeringOnly'] is not True or descriptor['readyForPublication'] is not False:
        raise ValueError('Not an engineering-only build')
    if Path(descriptor['cargoTarget']) != ROOT/'windows/target':
        raise ValueError('Unexpected QA Cargo target')
    return qa, descriptor, ROOT/'windows/target/debug/anf-mkr-qa.exe'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=['seal', 'built'])
    args = parser.parse_args()
    qa, descriptor, binary = context()
    receipt_file = qa/'source-receipt.json'
    if args.stage == 'seal':
        if binary.exists():
            raise ValueError('Fresh build required; an existing QA binary cannot be certified')
        if git('status', '--porcelain', '--untracked-files=no'):
            raise ValueError('Production source changed while preparing the snapshot')
        receipt = {'schema':1, 'engineeringOnly':True, 'readyForPublication':False,
                   'providerBacked':False, 'reproducibleBuildVerified':False,
                   'headSha':git('rev-parse', 'HEAD'),
                   'productionInputs':production_inputs(),
                   'snapshotInputs':snapshot_inputs(qa/'source')}
        with receipt_file.open('x', encoding='utf-8') as output:
            output.write(json.dumps(receipt, indent=2)+'\n')
    else:
        receipt = json.loads(receipt_file.read_text())
        if receipt['headSha'] != git('rev-parse', 'HEAD') or receipt['productionInputs'] != production_inputs():
            raise ValueError('Production source drift after build seal')
        if receipt['snapshotInputs'] != snapshot_inputs(qa/'source'):
            raise ValueError('Engineering source drift after build seal')
        built = {'schema':1, 'engineeringOnly':True, 'readyForPublication':False,
                 'providerBacked':False, 'headSha':receipt['headSha'],
                 'sourceReceiptSha256':sha(receipt_file), 'binarySha256':sha(binary)}
        with (qa/'built-receipt.json').open('x', encoding='utf-8') as output:
            output.write(json.dumps(built, indent=2)+'\n')
    print('PASS: engineering '+args.stage+' receipt; no release or provider approval')

if __name__ == '__main__':
    main()
