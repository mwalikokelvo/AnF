"""Fresh hosted emulator QA with throwaway signing, never baseline signer/upgrade proof."""
import json
import os
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[2]
sdk = Path(os.environ['ANDROID_HOME'])
tools = sdk / 'build-tools/36.0.0'
adb = sdk / 'platform-tools/adb'
lineage = os.environ['ANF_ENTRYPOINT_LINEAGE']
if lineage not in ('modern', 'legacy'):
    raise SystemExit('Choose an explicit QA lineage.')
identity = 'com.coucou.workspace' if lineage == 'legacy' else 'com.anf.workspace'
work = Path(os.environ['RUNNER_TEMP']) / 'anf-entrypoints-qa'
reports = work / 'reports'
reports.mkdir(parents=True, exist_ok=True)


def run(command, timeout=180):
    result = subprocess.run([str(p) for p in command], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{Path(str(command[0])).name} failed: {result.stdout}\n{result.stderr}')
    return result.stdout


def only(pattern):
    matches = list(root.glob(pattern))
    if len(matches) != 1:
        raise RuntimeError('Expected exactly one generated QA input: ' + pattern)
    return matches[0]


def installed(package):
    result = subprocess.run([str(adb), 'shell', 'pm', 'path', package],
                            capture_output=True, text=True, timeout=30)
    if result.returncode not in (0, 1) or result.stderr.strip():
        raise RuntimeError('Could not check emulator package state.')
    if result.stdout.strip() and not result.stdout.startswith('package:'):
        raise RuntimeError('Unexpected package-state response.')
    return bool(result.stdout.strip())


try:
    if run([adb, 'shell', 'getprop', 'ro.kernel.qemu']).strip() != '1':
        raise RuntimeError('This test must not run on a physical device.')
    if run([adb, 'emu', 'avd', 'name']).splitlines()[0].strip() != 'anf-entrypoints-qa':
        raise RuntimeError('This is not the disposable entry-point AVD.')
    if run([adb, 'shell', 'getprop', 'ro.build.version.sdk']).strip() != '35':
        raise RuntimeError('Expected Android15/API35.')
    if installed(identity):
        raise RuntimeError('Refusing to replace an existing installation; fresh-install QA only.')
    target = only('android/gradle-build/outputs/apk/release/*-unsigned.apk')
    test = only('android/gradle-build/outputs/apk/androidTest/release/*.apk')
    # Public fixture password and newly generated key, held only on this runner.
    # It cannot establish compatibility with either original production signer.
    key = work / 'throwaway-qa.p12'
    run(['keytool', '-genkeypair', '-storetype', 'PKCS12', '-keystore', key,
         '-storepass', 'android', '-keypass', 'android', '-alias', 'qa', '-keyalg', 'RSA',
         '-keysize', '2048', '-validity', '2', '-dname', 'CN=AnF disposable entry-point QA'])
    signed = []
    for index, source in enumerate([target, test]):
        apk = work / f'qa-{index}.apk'
        run([tools/'apksigner', 'sign', '--ks', key, '--ks-pass', 'pass:android',
             '--key-pass', 'pass:android', '--out', apk, source])
        run([tools/'apksigner', 'verify', apk])
        signed.append(apk)
    badging = run([tools/'aapt', 'dump', 'badging', signed[0]])
    match = re.search(r"^package: name='([^']+)'", badging, re.M)
    if not match or match[1] != identity:
        raise RuntimeError('Generated QA app has the wrong target identity.')
    test_badging = run([tools/'aapt', 'dump', 'badging', signed[1]])
    test_id = re.search(r"^package: name='([a-zA-Z0-9_.]+)'", test_badging, re.M)[1]
    if installed(test_id):
        raise RuntimeError('Refusing to replace an existing instrumentation package.')
    for apk in signed:
        run([adb, 'install', '-t', apk])
    result = run([adb, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                  'com.anf.workspace.EntryPointsTest,com.anf.workspace.RendererRecoveryTest,com.anf.workspace.EmbeddedMusicActivityTest', test_id+'/androidx.test.runner.AndroidJUnitRunner'])
    (reports/'instrumentation.txt').write_text(result, encoding='utf-8')
    if not re.search(r'OK\s*\(3 tests\)', result) or 'FAILURES!!!' in result or 'INSTRUMENTATION_FAILED' in result:
        raise RuntimeError('Native entry-point assertions did not pass: ' + result)
    run([adb,'pull',f'/sdcard/Android/data/{identity}/files/qa/renderer-recovery.png',reports/'renderer-recovery.png'])
    (reports/'scope.json').write_text(json.dumps({
        'sourceCommit': os.environ.get('GITHUB_SHA'), 'applicationId': identity,
        'androidApi': 35, 'nativePackageManager': True, 'nativeShortcutManager': True,
        'nativeRendererRecovery': True, 'actualRendererTerminatedOnce': True,
        'actualAnFMusicLifecycleCallbacks': True, 'combinedMkrRuntimePackaged': False,
        'freshInstallOnly': True, 'throwawaySigner': True,
        'originalSignerVerified': False, 'installedUpgradeVerified': False,
        'providerPlaybackVerified': False, 'readyForPublication': False,
    }, indent=2)+'\n', encoding='utf-8')
    print('PASS native entry points, real renderer recovery and actual AnF embedded-music lifecycle callbacks with generated saved-file preservation. Fresh emulator/throwaway signer only; combined MKR runtime is not included.')
finally:
    try:
        diagnostic = subprocess.run([str(adb), 'logcat', '-d', '-v', 'brief'], capture_output=True, text=True, timeout=30)
        (reports/'logcat.txt').write_text(diagnostic.stdout, encoding='utf-8')
    except Exception as error:
        (reports/'logcat.txt').write_text('Diagnostic unavailable: '+str(error), encoding='utf-8')
