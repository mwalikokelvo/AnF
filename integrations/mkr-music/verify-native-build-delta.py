"""Account for exact PE byte deltas; never patch or normalize either binary."""
import argparse,datetime,hashlib,json,struct,zipfile
from pathlib import Path

SOURCE_SHA='c7277b1843c465efc552dbfcfd6d95cedc5206a1b5d1836e3aa051e163f0f2bd'

def canary(timestamp):
    # Semantics of the exact reviewed common/stack_chk.c, not a generic heuristic.
    # __LINE__=13, first __COUNTER__=0; UTC build-hour observation checked by deltas.
    t=datetime.datetime.fromtimestamp(timestamp,datetime.timezone.utc)
    month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.month-1]
    hour=f'{t.hour:02}'
    seed=13*7+ord(month[0])*31+ord(month[2])*37+ord(hour[0])*41+ord(hour[1])*43
    return seed ^ (seed>>16) ^ (seed<<32)

def verify(report,published,source):
    if hashlib.sha256(source).hexdigest()!=SOURCE_SHA:raise ValueError('Reviewed macro source changed')
    if len(published)>16*1024*1024 or len(source)>8192 or len(report['changedRanges'])>32:raise ValueError('Input bounds exceeded')
    a=report['published'];b=report['rebuilt']
    if hashlib.sha256(published).hexdigest()!=a['sha256']:raise ValueError('Published bytes do not match report')
    if not report['identicalCodeSections'] or not report['identicalExportNames']:raise ValueError('Code/export mismatch')
    if report['changedBytesIncluded']!=report['changedByteCount']:raise ValueError('Incomplete delta report')
    expected={}
    def add(offset,before,after):
        for i,(x,y) in enumerate(zip(before,after)):
            if x!=y:expected[offset+i]=(x,y)
    pe=struct.unpack_from('<I',published,60)[0]
    offset=pe+8;old_stamp=struct.pack('<I',a['timestamp']);new_stamp=struct.pack('<I',b['timestamp'])
    if published[offset:offset+4]!=old_stamp:raise ValueError('Timestamp is not at COFF field')
    add(offset,old_stamp,new_stamp)
    data=next(s for s in a['sections'] if s['name']=='.data')
    body=published[data['rawOffset']:data['rawOffset']+data['rawSize']]
    old_canary=struct.pack('<Q',canary(a['timestamp']));new_canary=struct.pack('<Q',canary(b['timestamp']))
    if body.count(old_canary)!=1:raise ValueError('Expected unique reviewed-source guard value')
    guard_offset=data['rawOffset']+body.index(old_canary)
    add(guard_offset,old_canary,new_canary)
    observed={}
    for item in report['changedRanges']:
        if item['bytesTruncated']:raise ValueError('Truncated byte range')
        before=bytes.fromhex(item['publishedHex']);after=bytes.fromhex(item['rebuiltHex'])
        if not len(before)==len(after)==item['length']:raise ValueError('Bad range length')
        for i,(x,y) in enumerate(zip(before,after)):
            pos=item['offset']+i
            if pos in observed or pos>=len(published) or published[pos]!=x or x==y:raise ValueError('Bad reported source byte')
            observed[pos]=(x,y)
    if observed!=expected or len(observed)!=report['changedByteCount']:raise ValueError('Unexplained byte difference')
    return dict(schema=1,allReportedDifferencesAccountedFor=True,changedByteCount=len(observed),
        timestampOffset=offset,guardOffset=guard_offset,publishedGuardHex=old_canary.hex(),rebuiltGuardHex=new_canary.hex(),
        sourceFile='quickjs/native/common/stack_chk.c',sourceSha256=SOURCE_SHA,
        explanation='COFF build timestamp plus the reviewed source-defined date/hour stack canary account for every changed byte.',
        binaryPatched=False,exactFileReproducibility=report['identicalBytes'],readyForPublication=False,
        note='No security, license, JDK or complete-distribution approval is inferred.')

def main():
    p=argparse.ArgumentParser();p.add_argument('--comparison',type=Path,required=True);p.add_argument('--published-jar',type=Path,required=True);p.add_argument('--source-archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    for path,limit in [(args.comparison,1048576),(args.published_jar,64*1024*1024),(args.source_archive,8*1024*1024)]:
        if path.stat().st_size>limit:raise ValueError('Input file exceeds bound')
    report=json.loads(args.comparison.read_text(encoding='utf-8'))
    with zipfile.ZipFile(args.published_jar) as z:
        name='jni/windows_x64/libquickjs.dll'
        if z.getinfo(name).file_size>16*1024*1024:raise ValueError('DLL exceeds bound')
        published=z.read(name)
    with zipfile.ZipFile(args.source_archive) as z:
        names=[n for n in z.namelist() if n.endswith('/quickjs/native/common/stack_chk.c')]
        if len(names)!=1:raise ValueError('Expected exact source path')
        if z.getinfo(names[0]).file_size>8192:raise ValueError('Source exceeds bound')
        source=z.read(names[0])
    result=verify(report,published,source)
    result['comparisonSha256']=hashlib.sha256(args.comparison.read_bytes()).hexdigest()
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
if __name__=='__main__':main()
