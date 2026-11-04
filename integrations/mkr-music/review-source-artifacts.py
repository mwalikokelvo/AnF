"""Offline source/binary correspondence inventory, not a licensing approval."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import zipfile

HERE=Path(__file__).resolve().parent
NATIVE=re.compile(r'\.(dll|dylib|so|a)(\.\d+)*$',re.I)
SOURCE={'.kt','.java','.scala','.rs','.c','.cpp','.h','.hpp'}

def sha(file):
    if not file.is_file() or file.is_symlink() or file.is_junction() or file.stat().st_size>64*1024*1024:
        raise ValueError('Unsupported review input')
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def header_signals(text):
    # Observed strings in bounded source prefixes, never a grant/approval finding.
    signals=[]
    spdx=re.search(r'SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)',text)
    if spdx:signals.append('SPDX-prefix:'+spdx.group(1))
    if re.search(r'Apache License,?\s+(Version\s+)?2\.0',text,re.I):signals.append('Apache-2.0-header-hint')
    if 'Permission is hereby granted, free of charge' in text:signals.append('MIT-header-hint')
    if re.search(r'GNU (?:Lesser )?General Public License',text,re.I):signals.append('GNU-license-header-hint')
    return signals

def review(audit_file, sources_file):
    audit_file=audit_file.resolve();sources_file=sources_file.resolve()
    if audit_file.stat().st_size>1048576 or sources_file.stat().st_size>1048576:
        raise ValueError('Review metadata exceeds bound')
    audit_bytes=audit_file.read_bytes()
    audit=json.loads(audit_bytes)
    downloaded=json.loads(sources_file.read_text(encoding='utf-8'))
    if (downloaded['auditSha256']!=hashlib.sha256(audit_bytes).hexdigest() or
        downloaded.get('readyForPublication') is not False or len(downloaded['artifacts'])>128):
        raise ValueError('Source evidence does not match the exact runtime audit')
    expected={item['coordinate']:item for item in audit['dependencies']}
    entries=[]
    for artifact in downloaded['artifacts']:
        binary=expected.get(artifact['coordinate'])
        if not binary or artifact['binarySha256']!=binary['sha256']:
            raise ValueError('Source-to-binary coordinate/hash changed')
        if artifact['status']!='downloaded':
            continue
        source=Path(artifact['file'])
        if source.parent!=sources_file.parent or sha(source)!=artifact['sha256'] or sha(Path(binary['file']))!=binary['sha256']:
            raise ValueError('Downloaded or runtime artifact changed')
        counts=Counter();samples={};source_count=0;native_source_count=0
        with zipfile.ZipFile(source) as archive:
            for item in archive.infolist():
                suffix=Path(item.filename).suffix.lower()
                if not item.is_dir() and suffix in SOURCE:
                    source_count+=1;native_source_count+=suffix in {'.c','.cpp','.h','.hpp','.rs'}
                    with archive.open(item) as stream:text=stream.read(8192).decode('utf-8','replace')
                    for signal in header_signals(text):
                        counts[signal]+=1
                        if len(samples.setdefault(signal,[]))<3:samples[signal].append(item.filename)
        with zipfile.ZipFile(binary['file']) as archive:
            natives=[item.filename for item in archive.infolist() if not item.is_dir() and NATIVE.search(item.filename)]
        entries.append({'coordinate':artifact['coordinate'],'binarySha256':binary['sha256'],
                        'sourceUrl':artifact['url'],'sourceSha256':artifact['sha256'],
                        'sourceArchiveName':source.name,'sourceBytes':artifact['bytes'],
                        'repositorySha256Matches':artifact.get('repositorySha256Matches'),
                        'sourceFiles':source_count,'nativeSourceFilesInJar':native_source_count,
                        'namedNoticeEntries':artifact['archive']['noticeEntryNames'],
                        'observedHeaderSignals':dict(counts),'signalSamplePaths':samples,
                        'runtimeNativeEntryNames':natives,'nativeSourceReviewRequired':bool(natives),
                        'licenseAndSourceCorrespondenceApproved':False})
    coordinates=[e['coordinate'] for e in entries]
    if len(set(coordinates))!=len(coordinates):raise ValueError('Duplicate source coordinates')
    return {'schema':1,'readyForPublication':False,'sourceCompleteDistributionPrepared':False,
            'runtimeAuditSha256':downloaded['auditSha256'],'dependencyCount':len(expected),
            'downloadedSourceCount':len(entries),'missingSourceCoordinates':sorted(set(expected)-set(coordinates)),
            'dependencies':entries,'jdkAndNativeBuildSourceReviewComplete':False,
            'notes':['Downloaded sources are evidence, not license or complete-source approval.',
                     'Header signals are bounded text observations, not module-wide license conclusions.',
                     'Publisher checksums from the same host are not independent signature authentication.',
                     'Native code, toolchain sources/build recipes and complete notices require separate review.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources',type=Path,required=True)
    parser.add_argument('--audit',type=Path,default=HERE/'engine/build/reports/runtime-dependencies.json')
    parser.add_argument('--output',type=Path,default=HERE/'source-artifact-evidence.json')
    args=parser.parse_args();result=review(args.audit,args.sources)
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'downloaded':result['downloadedSourceCount'],'dependencies':result['dependencyCount'],
                      'nativeReviewRequired':[d['coordinate'] for d in result['dependencies'] if d['nativeSourceReviewRequired']],
                      'readyForPublication':False}))
