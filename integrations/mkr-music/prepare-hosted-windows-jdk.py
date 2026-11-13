"""Prepare the pinned JDK in an ephemeral Windows job, never the user's PC."""
import argparse,importlib.util,json,os,zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('audit_jdk',HERE/'audit-windows-jdk.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path);args=parser.parse_args()
    if os.name!='nt' or os.environ.get('GITHUB_ACTIONS')!='true':raise ValueError('Explicit hosted Windows engineering job required')
    args.output.mkdir(parents=True,exist_ok=False);archive=args.output/'vendor-jdk.zip'
    pin=json.loads((HERE/'windows-jdk-input.json').read_text());source=json.loads((HERE/'native-source-evidence.json').read_text())['jdkSource']
    audit.fetch(pin['archiveUrl'],archive);report,_=audit.inspect(archive,pin,source)
    # The archive hash, every entry path/link and source metadata were checked
    # before extraction. Nothing is installed and no executable runs here.
    with zipfile.ZipFile(archive) as z:
        root=z.namelist()[0].split('/')[0];z.extractall(args.output/'toolchain')
    jdk=(args.output/'toolchain'/root).resolve();assert (jdk/'bin/java.exe').is_file()
    report['toolchainExtractedForHostedJob']=True;report['binaryExecuted']=False
    (args.output/'jdk-input-proof.json').write_text(json.dumps(report,indent=2)+'\n')
    with open(os.environ['GITHUB_ENV'],'a',encoding='utf-8') as f:f.write('JAVA_HOME='+str(jdk)+'\n')
    with open(os.environ['GITHUB_PATH'],'a',encoding='utf-8') as f:f.write(str(jdk/'bin')+'\n')
    print('Prepared exact verified JDK for this hosted job only; publication remains held.')
