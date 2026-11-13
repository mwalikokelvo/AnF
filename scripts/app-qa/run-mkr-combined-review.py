"""Fresh musicdev emulator install only. No provider calls or production signers."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile
from instrumentation_screenshots import extract_screenshots

root=Path(__file__).resolve().parents[2]
sdk=Path(os.environ['ANDROID_HOME']);tools=sdk/'build-tools/36.0.0';adb=sdk/'platform-tools/adb'
lineage=os.environ['ANF_MKR_REVIEW_LINEAGE']
assert lineage in ('modern','legacy')
identity=('com.coucou.workspace' if lineage=='legacy' else 'com.anf.workspace')+'.musicdev'
reports=Path(os.environ['RUNNER_TEMP'])/'anf-mkr-combined-qa/reports';reports.mkdir(parents=True,exist_ok=True)
def run(args,timeout=180):
    result=subprocess.run([str(x) for x in args],text=True,capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
    return result.stdout
def only(pattern):
    files=list(root.glob(pattern));assert len(files)==1,(pattern,files)
    return files[0]
def absent(package):
    result=subprocess.run([str(adb),'shell','pm','path',package],capture_output=True,text=True,timeout=30)
    assert result.returncode in (0,1) and not result.stderr.strip() and not result.stdout.strip(),'Refusing to replace an installed package'
try:
    assert run([adb,'shell','getprop','ro.kernel.qemu']).strip()=='1'
    assert run([adb,'emu','avd','name']).splitlines()[0].strip()=='anf-mkr-combined-qa'
    assert run([adb,'shell','getprop','ro.build.version.sdk']).strip()=='35'
    absent(identity)
    app=only('android/gradle-build/outputs/apk/review/*.apk')
    test=only('android/gradle-build/outputs/apk/androidTest/review/*.apk')
    badging=run([tools/'aapt','dump','badging',app])
    assert re.search(r"^package: name='([^']+)'",badging,re.M)[1]==identity
    test_id=re.search(r"^package: name='([^']+)'",run([tools/'aapt','dump','badging',test]),re.M)[1];absent(test_id)
    spec=importlib.util.spec_from_file_location('zipaudit',root/'scripts/audit-apk-native.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    native=module.inspect(app);assert native['allRequiredEntriesAligned']
    assert any(x['entry'].endswith('/libquickjs.so') for x in native['nativeEntries'])
    with zipfile.ZipFile(app) as archive:
        for name in ('UPSTREAM-LICENSE.txt','PRIMARY-LICENSE.txt','REVIEW-NOTICE.md'):
            assert archive.read('assets/licenses/mkr/'+name).strip(),name
    (reports/'apk-native.json').write_text(json.dumps(native,indent=2)+'\n')
    work=reports.parent;key=work/'throwaway.p12'
    run(['keytool','-genkeypair','-storetype','PKCS12','-keystore',key,'-storepass','android','-keypass','android','-alias','qa','-keyalg','RSA','-keysize','2048','-validity','2','-dname','CN=AnF combined disposable QA'])
    for index,source in enumerate((app,test)):
        signed=work/f'qa-{index}.apk'
        run([tools/'apksigner','sign','--ks',key,'--ks-pass','pass:android','--key-pass','pass:android','--out',signed,source])
        run([tools/'apksigner','verify',signed]);run([adb,'install','-t',signed])
    result=run([adb,'shell','am','instrument','-w','-r','-e','class','com.anf.workspace.MkrCombinedReviewTest',test_id+'/androidx.test.runner.AndroidJUnitRunner'])
    (reports/'instrumentation.txt').write_text(result)
    assert 'OK (3 tests)' in result and 'FAILURES' not in result and 'INSTRUMENTATION_FAILED' not in result,result
    expected_cases={'packagedNativeChannelStaysInsideAnFAndRecoversWithoutProviderIO','requestedSpeechStopRequiresSuccessAndObservedIdleWithEngineDouble','generatedMusicDecodesThroughActualAnFAndSurvivesPageDetach'}
    assert set(re.findall(r'^INSTRUMENTATION_STATUS: test=(.+)$',result,re.M))==expected_cases,'A combined regression case is missing'
    speech_receipt=re.findall(r'^INSTRUMENTATION_RESULT: anf-speech-stop-accepted=(true|false)$',result,re.M)
    assert len(speech_receipt)==1,'Native speech-stop receipt observation missing'
    assert re.findall(r'^INSTRUMENTATION_RESULT: anf-speech-policy-engine-double=(.*)$',result,re.M)==['success-denial-timeout']
    assert re.findall(r'^INSTRUMENTATION_RESULT: anf-generated-combined-playback=(.*)$',result,re.M)==['decoded-and-detached']
    for name,image in extract_screenshots(result,('mkr-combined-cold.png','mkr-combined-reconnected.png')).items():
        (reports/name).write_bytes(image)
    (reports/'scope.json').write_text(json.dumps({'sourceCommit':os.environ.get('GITHUB_SHA'),'applicationId':identity,'androidApi':35,
        'actualAnFActivity':True,'combinedNativeRuntime':True,'coldChannelAndRendererRecovery':True,
        'nativeSpeechStopReceiptObserved':True,'nativeSpeechStopAccepted':speech_receipt[0]=='true',
        'requestedSpeechStopPolicyWithEngineDouble':True,'activeAudibleSpeechStopVerified':False,
        'providerSearched':False,'nativeDecodedPlaybackVerified':True,'generatedMediaOnly':True,'pageDetachPlaybackVerified':True,'recreatedPagePlaybackVerified':False,'originalSignerVerified':False,
        'installedUpgradeVerified':False,'readyForPublication':False,'throwawaySigner':True},indent=2)+'\n')
    print('PASS actual AnF plus packaged native cold channel, in-app UI and renderer recovery; no provider or release claim')
finally:
    diagnostic=subprocess.run([str(adb),'logcat','-d','-v','brief'],capture_output=True,text=True,timeout=30)
    (reports/'logcat.txt').write_text(diagnostic.stdout)
