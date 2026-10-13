"""Exercise release APK upgrades on an isolated emulator with a disposable CI key."""
import argparse
import os
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
for name in ['baseline','candidate','test','keystore','output']:
    p.add_argument('--'+name,required=True)
a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
sdk=Path(os.environ['ANDROID_HOME'])
adb=str(sdk/'platform-tools/adb')
signer=str(sdk/'build-tools/36.0.0/apksigner')

def run(args,timeout=120):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout,check=True)
    return result.stdout+result.stderr

devices=run([adb,'devices']).splitlines()
serials=[line.split()[0] for line in devices if line.startswith('emulator-') and line.endswith('\tdevice')]
if len(serials)!=1:raise SystemExit('Exactly one isolated Android emulator is required')
device=[adb,'-s',serials[0]]
for name,source in [('baseline',a.baseline),('candidate',a.candidate),('test',a.test)]:
    destination=out/(name+'.apk')
    # This is the standard, disposable Gradle debug key, never a production key.
    run([signer,'sign','--ks',a.keystore,'--ks-pass','pass:android','--key-pass','pass:android','--out',str(destination),source])
    run([signer,'verify',str(destination)])
run(device+['install','--no-incremental','-r',str(out/'baseline.apk')])
run(device+['install','--no-incremental','-r',str(out/'test.apk')])
for phase in ['seed','verify','reopen']:
    if phase=='verify':run(device+['install','--no-incremental','-r',str(out/'candidate.apk')])
    run(device+['shell','am','force-stop','com.coucou.workspace'])
    result=run(device+['shell','am','instrument','-w','-e','phase',phase,'com.coucou.workspace.test/androidx.test.runner.AndroidJUnitRunner'],timeout=600)
    (out/(phase+'.txt')).write_text(result)
    image=subprocess.run(device+['exec-out','screencap','-p'],capture_output=True,check=True,timeout=30)
    (out/(phase+'.png')).write_bytes(image.stdout)
    print(result)
    if 'OK (1 test)' not in result or any(s in result for s in ['FAILURES','Process crashed','INSTRUMENTATION_FAILED']):
        raise SystemExit('Installed Android app failed phase: '+phase)
print('PASS: Android release startup, encrypted and legacy saved data, writing, PDF/text import and restart')
