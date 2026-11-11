"""Fail closed on release pollution or an unexpected combined review artifact."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

MODULE='com.anf.mkr:anf-mkr-android-catalog:0.1.0-prototype'

def indexed(entries):
    result={}
    for item in entries:
        coordinate=item['coordinate'];group,name,version=coordinate.split(':')
        key=group+':'+name
        if key in result:raise ValueError('Duplicate module: '+key)
        if len(item['sha256'])!=64:raise ValueError('Invalid artifact digest')
        result[key]=(coordinate,item['sha256'])
    return result

def validate(baseline,combined,native,module_hash):
    before=baseline['inventories'];after=combined['inventories']
    if indexed(before['releaseRuntimeClasspath'])!=indexed(after['releaseRuntimeClasspath']):
        raise ValueError('Optional review flag changed the release runtime graph')
    old=indexed(before['reviewRuntimeClasspath']);pinned=indexed(native['dependencies'])
    expected=dict(old);expected.update(pinned)
    expected['com.anf.mkr:anf-mkr-android-catalog']=(MODULE,module_hash)
    actual=indexed(after['reviewRuntimeClasspath'])
    if actual!=expected:
        changed={key:{'expected':expected.get(key),'actual':actual.get(key)} for key in sorted(expected.keys()|actual.keys()) if expected.get(key)!=actual.get(key)}
        raise ValueError('Review runtime differs from baseline plus strictly verified native artifacts: '+json.dumps(changed))
    return {'nativeArtifacts':len(pinned),'combinedArtifacts':len(actual),
            'releaseGraphUnchanged':True,'nativeHashesPreserved':True,
            'baselineModulesUpgradedToPinnedNative':{key:{'baseline':old[key][0],'native':value[0]} for key,value in pinned.items() if key in old and old[key]!=value},
            'readyForPublication':False}

def main():
    root=Path(__file__).resolve().parents[1]
    repo=root/'integrations/mkr-music/android-catalog/build/review-repository/com/anf/mkr/anf-mkr-android-catalog/0.1.0-prototype'
    aar=repo/'anf-mkr-android-catalog-0.1.0-prototype.aar'
    sources=repo/'anf-mkr-android-catalog-0.1.0-prototype-sources.jar'
    result=validate(json.loads((root/'android/gradle-build/mkr-baseline-runtime.json').read_text()),
        json.loads((root/'android/gradle-build/mkr-combined-runtime.json').read_text()),
        json.loads((root/'integrations/mkr-music/android-catalog/build/reports/android-runtime.json').read_text()),
        hashlib.sha256(aar.read_bytes()).hexdigest())
    with zipfile.ZipFile(sources) as z:
        names=z.namelist()
        for required in ('META-INF/licenses/mkr/LICENSE','META-INF/licenses/primary/PRIMARY-LICENSE.txt','META-INF/MKR-REVIEW-NOTICE.md'):
            if required not in names:raise ValueError('Review source artifact lacks notice: '+required)
        if not any(name.endswith('/MkrPageLifecycle.kt') for name in names):raise ValueError('Native facade source missing')
        if any('musixmatch' in name.lower() for name in names):raise ValueError('Restricted source in review artifact')
    result.update(sourceCommit=__import__('os').environ.get('GITHUB_SHA'),moduleSha256=hashlib.sha256(aar.read_bytes()).hexdigest(),
        moduleSourcesSha256=hashlib.sha256(sources.read_bytes()).hexdigest(),fullDependencyAndJniCorrespondingSourceCleared=False)
    out=root/'android/gradle-build/mkr-review-graph-audit.json';out.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':main()
