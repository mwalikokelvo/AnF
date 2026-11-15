"""Pinned archived legacy baseline for disposable-emulator QA; no signing keys."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

SPEC = json.loads(Path(__file__).with_name('android-upgrade-baselines.json').read_text())['legacy']


def validate_inputs(run, archive):
    if archive not in ('', 'none', 'legacy-0.1.22'):
        raise ValueError('Unknown archived Android baseline.')
    if run and not re.fullmatch(r'[0-9]+', run):
        raise ValueError('Baseline run must be a numeric Actions run ID.')
    if run and archive == 'legacy-0.1.22':
        raise ValueError('Choose an Actions baseline or archived baseline, not both.')


def verify_archive(path, certificates, badging, spec=SPEC):
    if hashlib.sha256(path.read_bytes()).hexdigest() != spec['sha256']:
        raise ValueError('Archived baseline bytes changed.')
    signers = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})$', certificates, re.M)
    if signers != [spec['signerSha256']]:
        raise ValueError('Archived baseline signer mismatch.')
    if not re.search(r"^package: name='" + re.escape(spec['applicationId']) + r"'", badging, re.M):
        raise ValueError('Archived baseline application identity mismatch.')


def select_baseline(directory, spec=SPEC):
    unsigned = sorted(directory.glob('*-unsigned.apk'))
    if len(unsigned) == 1:
        return unsigned[0]
    if unsigned:
        raise ValueError('Expected exactly one previous unsigned APK.')
    provenance = directory / 'archive-provenance.json'
    if not provenance.is_file():
        raise ValueError('No unsigned baseline or verified archive provenance.')
    report = json.loads(provenance.read_text())
    if report.get('baseline') != spec or report.get('originalBaselineSignerVerified') is not True:
        raise ValueError('Archived baseline provenance mismatch.')
    selected = directory / spec['filename']
    if not selected.is_file() or hashlib.sha256(selected.read_bytes()).hexdigest() != spec['sha256']:
        raise ValueError('Archived baseline bytes changed after verification.')
    return selected


def download(directory):
    repository = os.environ.get('GITHUB_REPOSITORY', '')
    if repository != 'mwalikokelvo/AnF':
        raise ValueError('Archived baseline belongs to the AnF repository.')
    directory.mkdir(parents=True, exist_ok=True)
    if any(directory.iterdir()):
        raise ValueError('Baseline download directory must be empty.')
    subprocess.run(['gh', 'release', 'download', SPEC['tag'], '--repo', repository,
                    '--pattern', SPEC['filename'], '--dir', str(directory)], check=True)
    original = directory / SPEC['filename']
    # Reject changed bytes before asking SDK parsers to inspect the file.
    if hashlib.sha256(original.read_bytes()).hexdigest() != SPEC['sha256']:
        raise ValueError('Archived baseline bytes changed.')
    tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
    certificates = subprocess.check_output([str(tools / 'apksigner'), 'verify', '--print-certs', str(original)], text=True)
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(original)], text=True)
    verify_archive(original, certificates, badging)
    report = {'baseline': SPEC, 'originalBaselineSignerVerified': True,
              'emulatorUpgradeUsesDisposableSigner': True,
              'candidateProductionSignerVerified': False, 'readyForPublication': False}
    (directory / 'archive-provenance.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Verified archived legacy APK hash, original signature and package identity. Emulator upgrade uses a disposable signer.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['validate-inputs', 'download', 'select'])
    args = parser.parse_args()
    if args.mode == 'validate-inputs':
        validate_inputs(os.environ.get('BASELINE_RUN', ''), os.environ.get('BASELINE_ARCHIVE', 'none'))
    elif args.mode == 'download':
        download(Path('previous-android'))
    else:
        print(select_baseline(Path('previous-android')))
