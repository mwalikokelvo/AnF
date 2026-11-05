"""Both historical upgrade lineages on a fresh hosted emulator; never signer compatibility."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

root=Path(__file__).resolve().parents[2]
lineage=os.environ['ANF_ENTRYPOINT_LINEAGE']
baselines=json.loads((root/'scripts/app-qa/android-upgrade-baselines.json').read_text(encoding='utf-8'))
if lineage not in baselines:raise SystemExit('Choose an explicit baseline lineage.')
baseline=baselines[lineage]
sdk=Path(os.environ['ANDROID_HOME']);adb=sdk/'platform-tools/adb';tools=sdk/'build-tools/36.0.0'
work=Path(os.environ['RUNNER_TEMP'])/'anf-lineage-upgrade-qa';work.mkdir(parents=True,exist_ok=True)
reports=work/'reports';reports.mkdir(exist_ok=True)
def run(args,timeout=180):
 result=subprocess.run([str(p) for p in args],capture_output=True,text=True,timeout=timeout)
 if result.returncode:raise RuntimeError(str(args[0])+' failed: '+result.stdout+result.stderr)
 return result.stdout
# Existing helper may replace only installations it creates, on this exact AVD.
if run([adb,'shell','getprop','ro.kernel.qemu']).strip()!='1':raise SystemExit('Emulator required.')
if run([adb,'emu','avd','name']).splitlines()[0].strip()!='anf-lineage-upgrade-qa':raise SystemExit('Wrong disposable AVD.')
if run([adb,'shell','getprop','ro.build.version.sdk']).strip()!='35':raise SystemExit('Expected API35.')
version=json.loads((root/'windows/src-tauri/tauri.conf.json').read_text(encoding='utf-8'))['version']
prefix='AnF-Android-Legacy' if lineage=='legacy' else 'AnF-Android'
candidate=root/f'releases/{prefix}-{version}-unsigned.apk'
tests=list(root.glob('android/gradle-build/outputs/apk/androidTest/release/*.apk'))
if not candidate.is_file() or len(tests)!=1:raise SystemExit('Exactly one current candidate and instrumentation APK required.')
run(['gh','release','download',baseline['tag'],'--repo','mwalikokelvo/AnF','--pattern',baseline['filename'],'--dir',work])
original=work/baseline['filename']
if hashlib.sha256(original.read_bytes()).hexdigest()!=baseline['sha256']:raise SystemExit('Original baseline bytes changed.')
certificates=run([tools/'apksigner','verify','--print-certs',original])
match=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})$',certificates,re.M)
if match!=[baseline['signerSha256']]:raise SystemExit('Original baseline signer mismatch.')
badging=run([tools/'aapt','dump','badging',original])
if not re.search(r"^package: name='"+re.escape(baseline['applicationId'])+"'",badging,re.M):raise SystemExit('Wrong original baseline package.')
# The helper re-signs both APKs with a disposable QA key. Fingerprint above is
# independently measured BEFORE any re-signing, not proof of candidate signer custody.
scope={'sourceCommit':os.environ.get('GITHUB_SHA'),'baseline':baseline,'candidateVersion':version,
 'candidateSha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'androidApi':35,
 'originalBaselineSignerVerified':True,'throwawaySigner':True,'originalCandidateSignerVerified':False,
 'productionUpdateCompatibilityVerified':False,'installedBehaviorUpgradeVerified':False,
 'providerPlaybackVerified':False,'readyForPublication':False}
try:
 result=run([sys.executable,root/'scripts/app-qa/android-upgrade.py','--baseline',original,'--candidate',candidate,
             '--test',tests[0],'--application-id',baseline['applicationId'],'--output',reports],timeout=1200)
 (reports/'upgrade-output.txt').write_text(result,encoding='utf-8')
 scope['installedBehaviorUpgradeVerified']=True
 print('PASS installed baseline-to-candidate saved-data, writing, import, restart and component QA. Disposable signer only.')
finally:
 (reports/'scope.json').write_text(json.dumps(scope,indent=2)+'\n',encoding='utf-8')
 # Never include the helper APKs or its temporary signing key in report uploads.
