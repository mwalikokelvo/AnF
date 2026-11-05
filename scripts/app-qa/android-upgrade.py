"""Exercise release APK upgrades on an isolated emulator with a disposable CI key."""
import argparse
import os
import re
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
for name in ['baseline','candidate','test','output']:
    p.add_argument('--'+name,required=True)
p.add_argument('--application-id',choices=['com.coucou.workspace','com.anf.workspace'],default='com.coucou.workspace')
a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
sdk=Path(os.environ['ANDROID_HOME'])
adb=str(sdk/'platform-tools/adb')
signer=str(sdk/'build-tools/36.0.0/apksigner')

def run(args,timeout=120):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if result.returncode:
        raise RuntimeError(Path(args[0]).name+' failed:\n'+result.stdout+result.stderr)
    return result.stdout+result.stderr

devices=run([adb,'devices']).splitlines()
serials=[line.split()[0] for line in devices if line.startswith('emulator-') and line.endswith('\tdevice')]
if len(serials)!=1:raise SystemExit('Exactly one isolated Android emulator is required')
device=[adb,'-s',serials[0]]
# Reject mismatched baselines/candidates before touching the emulator.
aapt=str(sdk/'build-tools/36.0.0/aapt')
for source,expected in [(a.baseline,a.application_id),(a.candidate,a.application_id),(a.test,a.application_id+'.test')]:
    badging=run([aapt,'dump','badging',source])
    identity=re.search(r"^package: name='([^']+)'",badging,re.M)
    if not identity or identity.group(1)!=expected:
        raise SystemExit('APK package does not match selected upgrade lineage')
existing=run(device+['shell','pm','list','packages',a.application_id]).splitlines()
if 'package:'+a.application_id in existing or 'package:'+a.application_id+'.test' in existing:
    raise SystemExit('Use a fresh isolated emulator without pre-existing target apps')
keystore=out/'ci-signing.jks'
run(['keytool','-genkeypair','-keystore',str(keystore),'-storepass','android',
     '-keypass','android','-alias','qa','-keyalg','RSA','-keysize','2048',
     '-validity','365','-dname','CN=AnF installation test'])
for name,source in [('baseline',a.baseline),('candidate',a.candidate),('test',a.test)]:
    destination=out/(name+'.apk')
    # A fresh disposable key signs all three APKs; production keys remain local.
    run([signer,'sign','--ks',str(keystore),'--ks-pass','pass:android','--key-pass','pass:android','--out',str(destination),source])
    run([signer,'verify',str(destination)])
run(device+['install','--no-incremental','-r',str(out/'test.apk')])
for storage in ['encrypted','legacy']:
    if storage=='legacy':run(device+['uninstall',a.application_id])
    run(device+['install','--no-incremental','-r',str(out/'baseline.apk')])
    for phase in ['seed','verify','reopen']:
        if phase=='verify':run(device+['install','--no-incremental','-r',str(out/'candidate.apk')])
        run(device+['shell','am','force-stop',a.application_id])
        label=storage+'-'+phase
        result=run(device+['shell','am','instrument','-w','-e','class','com.anf.workspace.UpgradeUiTest','-e','phase',phase,'-e','storage',storage,a.application_id+'.test/androidx.test.runner.AndroidJUnitRunner'],timeout=600)
        (out/(label+'.txt')).write_text(result)
        print(result)
        if 'OK (1 test)' not in result or any(s in result for s in ['FAILURES','Process crashed','INSTRUMENTATION_FAILED']):
            (out/(label+'-logcat.txt')).write_text(run(device+['logcat','-d','-s','chromium','AndroidRuntime','TestRunner']))
            raise SystemExit('Installed Android app failed phase: '+label)
        if phase=='verify':
            # Entry-point assertions belong to the candidate, not the old baseline.
            entries=run(device+['shell','am','instrument','-w','-e','class','com.anf.workspace.EntryPointsTest',a.application_id+'.test/androidx.test.runner.AndroidJUnitRunner'])
            (out/(label+'-entrypoints.txt')).write_text(entries)
            if 'OK (1 test)' not in entries or any(s in entries for s in ['FAILURES','Process crashed','INSTRUMENTATION_FAILED']):
                raise SystemExit('Updated app failed native entry-point checks: '+label)
print('PASS: Android release startup, encrypted and legacy saved data, writing, PDF/text import and restart')
