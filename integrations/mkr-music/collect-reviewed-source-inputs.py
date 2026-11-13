"""Recover hash-pinned source inputs without rebuilding or trusting installed apps.
Sources are engineering inputs, not complete-source or publication approval.
"""
import argparse,hashlib,importlib.util,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('bounded_sources',HERE/'collect-source-artifacts.py')
bounded=importlib.util.module_from_spec(spec);spec.loader.exec_module(bounded)
def digest(data):return hashlib.sha256(data).hexdigest()
def plan(audit_bytes,evidence):
    audit=json.loads(audit_bytes)
    if (audit.get('schema')!=1 or audit.get('readyForPublication') is not False or
        evidence.get('readyForPublication') is not False or evidence.get('sourceCompleteDistributionPrepared') is not False or
        evidence.get('runtimeAuditSha256')!=digest(audit_bytes)):raise ValueError('Runtime/source ledger mismatch')
    binaries=audit['dependencies'];rows=evidence['dependencies']
    if not 0<len(binaries)<=128 or len(rows)!=len(binaries) or evidence.get('dependencyCount')!=len(rows):raise ValueError('Incomplete source input graph')
    expected={b['coordinate']:b['sha256'] for b in binaries}
    if len(expected)!=len(binaries) or len({r['coordinate'] for r in rows})!=len(rows):raise ValueError('Duplicate source coordinate')
    total=0
    for row in rows:
        coordinate=row['coordinate'];name=coordinate.replace(':','__')+'-sources.jar'
        if (expected.get(coordinate)!=row['binarySha256'] or row['sourceUrl']!=bounded.source_url(coordinate) or
            row['sourceArchiveName']!=name or not re.fullmatch(r'[a-f0-9]{64}',row['sourceSha256']) or
            not re.fullmatch(r'[a-f0-9]{64}',row['binarySha256']) or type(row['sourceBytes']) is not int or
            not 0<row['sourceBytes']<=bounded.MAX_ARCHIVE):raise ValueError('Changed source input identity')
        total+=row['sourceBytes']
    if total>bounded.MAX_TOTAL:raise ValueError('Source inputs exceed total bound')
    return rows

def validate(data,row):
    if len(data)!=row['sourceBytes'] or digest(data)!=row['sourceSha256']:raise ValueError('Source bytes changed')
    return bounded.inspect_archive(data)

def collect(audit_bytes,evidence,output,reuse=None,fetcher=None):
    rows=plan(audit_bytes,evidence);output=Path(output)
    if output.exists():raise ValueError('Refusing to overwrite source inputs')
    cache={}
    if reuse is not None:
        reuse=Path(reuse)
        if not reuse.is_dir() or reuse.is_symlink() or reuse.is_junction():raise ValueError('Unsafe source cache')
        for row in rows:
            file=reuse/row['sourceArchiveName']
            if file.exists() or file.is_symlink():
                if not file.is_file() or file.is_symlink() or file.is_junction() or file.stat().st_size>bounded.MAX_ARCHIVE:raise ValueError('Unsafe cached source')
                data=file.read_bytes();validate(data,row);cache[row['coordinate']]=data
    missing=[r['coordinate'] for r in rows if r['coordinate'] not in cache]
    if missing and fetcher is None:raise ValueError('Missing source inputs; explicit --fetch is required')
    output.mkdir(parents=True,exist_ok=False)
    report={'schema':1,'runtimeAuditSha256':digest(audit_bytes),'readyForPublication':False,
        'sourceCompleteDistributionPrepared':False,'binaryCorrespondenceApproved':False,'inputsComplete':False,'artifacts':[]}
    try:
        for row in rows:
            reused=row['coordinate'] in cache
            data=cache[row['coordinate']] if reused else fetcher(row['sourceUrl'],row['sourceBytes'])
            details=validate(data,row)
            with (output/row['sourceArchiveName']).open('xb') as stream:stream.write(data)
            report['artifacts'].append({'coordinate':row['coordinate'],'binarySha256':row['binarySha256'],
                'sourceSha256':digest(data),'sourceBytes':len(data),'file':row['sourceArchiveName'],
                'sourceUrl':row['sourceUrl'],'reusedVerifiedBytes':reused,'inventory':details})
        report['inputsComplete']=True
    except Exception:
        report['stoppedForReviewError']=True
        raise
    finally:
        (output/'source-inputs.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--reuse-directory',type=Path);parser.add_argument('--fetch',action='store_true');args=parser.parse_args()
    report=collect((HERE/'engine/runtime-evidence.json').read_bytes(),json.loads((HERE/'source-artifact-evidence.json').read_text()),
        args.output,args.reuse_directory,bounded.fetch if args.fetch else None)
    print('Collected '+str(len(report['artifacts']))+' exact source inputs; not distribution or publication clearance.')
