"""Verify fresh private runtime evidence, retaining reports/notices only."""
import argparse,hashlib,json,os,re,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
HERE=Path(__file__).resolve().parent

def sha(file):
    if not file.is_file() or file.is_symlink() or file.is_junction():raise ValueError('Unsafe candidate file')
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def main(output):
    if os.name!='nt' or os.environ.get('GITHUB_ACTIONS')!='true':raise ValueError('Hosted Windows only')
    pointer=json.loads((HERE/'engine/build/reports/latest-runtime-candidate.json').read_text());root=Path(pointer['bundle']).resolve();parent=root.parent
    assert root.is_relative_to((HERE/'engine/build/runtime-candidates').resolve()) and root.name=='bundle'
    status=json.loads((parent/'candidate-status.json').read_text());manifest=json.loads((parent/'runtime-manifest.json').read_text());audit=json.loads((parent/'dependency-audit.json').read_text())
    assert status['engineeringOnly'] and status['readyForPublication'] is False and status['sourceCompleteDistributionPrepared'] is False
    assert status['provenance']['releaseAndApiSourceHashesMatch'] is True and status['provenance']['binarySourceCorrespondenceApproved'] is False
    expected=json.loads((HERE/'engine/runtime-evidence.json').read_text())
    profile=lambda r:{(x['coordinate'],x['sha256']) for x in r['dependencies']}
    assert len(profile(audit))==38 and profile(audit)==profile(expected),'Runtime dependency profile drift'
    files=manifest['files'];actual={p.relative_to(root).as_posix():p for p in root.rglob('*') if p.is_file()}
    assert set(actual)==set(files) and len(actual)==status['files']
    for name,file in actual.items():assert sha(file)==files[name],name
    assert sum(file.stat().st_size for file in actual.values())==status['bytes']
    junit=dict(tests=0,failures=0,errors=0,skipped=0)
    for path in (HERE/'engine/build/test-results').rglob('TEST-*.xml'):
        suite=ET.parse(path).getroot()
        for key in junit:junit[key]+=int(suite.get(key,0))
    assert junit==dict(tests=35,failures=0,errors=0,skipped=0),junit
    handshake=(output/'handshake.txt').read_text(encoding='utf-8-sig')
    assert re.search(r'test result: ok\. 1 passed; 0 failed; 0 ignored;',handshake) and 'real_candidate_inventory_and_child_handshake ... ok' in handshake
    java=root/manifest['java'];version=subprocess.run([str(java),'-version'],capture_output=True,text=True,check=True,timeout=20)
    version_text=version.stdout+version.stderr;assert '21.0.12.1' in version_text and 'Microsoft' in version_text
    module_text=subprocess.check_output([str(java),'--list-modules'],text=True,timeout=20)
    modules={line.split('@')[0] for line in module_text.splitlines()};assert set(status['modules'])<=modules
    legal=[]
    for name,file in actual.items():
        if name.startswith('runtime/legal/'):
            dest=output/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(file.read_bytes());legal.append(name)
    assert legal,'Linked runtime legal notices missing'
    (output/'runtime-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    (output/'candidate-status.json').write_text(json.dumps(status,indent=2)+'\n',encoding='utf-8')
    scope={'sourceCommit':os.environ['GITHUB_SHA'],'candidateInventoryVerified':True,'actualBundledJavaExecuted':True,'nativeCanonicalPathHandshakeVerified':True,'privatePipeReleaseRpcVerified':True,'hostJUnit':junit,'dependenciesMatchPinned38':True,'jdkVersion':version_text,'javaModules':sorted(modules),'legalNoticeCount':len(legal),'candidateFiles':len(actual),'candidateBytes':status['bytes'],'rustToolchain':subprocess.check_output(['rustc','-Vv'],text=True),'providerSearched':False,'actualAnFWorkspaceVerified':False,'nativeDecodedPlaybackVerified':False,'sourceCompleteDistributionPrepared':False,'publisherSignatureVerified':False,'originalSignerVerified':False,'installedUpgradeVerified':False,'readyForPublication':False}
    (output/'scope.json').write_text(json.dumps(scope,indent=2)+'\n',encoding='utf-8')
    print('PASS fresh Windows image inventory, actual native JVM handshake and bundled modules; publication remains held')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);main(p.parse_args().output)
