"""Exercise release APK upgrades on an isolated emulator with a disposable CI key."""
import argparse
import os
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
for name in ['baseline','candidate','test','output']:
    p.add_argument('--'+name,required=True)
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
keystore=out/'ci-signing.jks'
run(['keytool','-genkeypair','-keystore',str(keystore),'-storepass','android',
     '-keypass','android','-alias','qa','-keyalg','RSA','-keysize','2048',
     '-validity','365','-dname','CN=Coucou installation test'])
for name,source in [('baseline',a.baseline),('candidate',a.candidate),('test',a.test)]:
    destination=out/(name+'.apk')
    # A fresh disposable key signs all three APKs; production keys remain local.
    run([signer,'sign','--ks',str(keystore),'--ks-pass','pass:android','--key-pass','pass:android','--out',str(destination),source])
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
        (out/(phase+'-logcat.txt')).write_text(run(device+['logcat','-d','-t','150','-s','chromium','AndroidRuntime','TestRunner']))
        raise SystemExit('Installed Android app failed phase: '+phase)
print('PASS: Android release startup, encrypted and legacy saved data, writing, PDF/text import and restart')
