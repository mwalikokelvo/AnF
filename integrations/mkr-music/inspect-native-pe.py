"""Bounded read-only PE64 structure evidence. Never loads or modifies a DLL."""
import hashlib, struct

MAX_BYTES=16*1024*1024

def inspect(data):
    if not 256 <= len(data) <= MAX_BYTES: raise ValueError('PE byte bound')
    def span(offset,size):
        if offset<0 or size<0 or offset+size>len(data):raise ValueError('PE range outside file')
        return data[offset:offset+size]
    def u16(offset):return struct.unpack('<H',span(offset,2))[0]
    def u32(offset):return struct.unpack('<I',span(offset,4))[0]
    if span(0,2)!=b'MZ':raise ValueError('Missing DOS signature')
    pe=u32(60)
    if span(pe,4)!=b'PE\0\0' or u16(pe+4)!=0x8664:raise ValueError('Expected AMD64 PE')
    count=u16(pe+6);optional_size=u16(pe+20);opt=pe+24
    if not 1<=count<=96 or optional_size<240 or u16(opt)!=0x20b:raise ValueError('Expected bounded PE64 headers')
    span(opt,optional_size);sections=[]
    for index in range(count):
        start=opt+optional_size+40*index;span(start,40)
        name=span(start,8).split(b'\0',1)[0].decode('ascii')
        if any(ord(c)<32 for c in name):raise ValueError('Invalid section name')
        virtual_size=u32(start+8);rva=u32(start+12);size=u32(start+16);offset=u32(start+20)
        body=span(offset,size)
        sections.append(dict(name=name,rva=rva,virtualSize=virtual_size,rawSize=size,
            rawOffset=offset,characteristics=u32(start+36),sha256=hashlib.sha256(body).hexdigest()))
    def address(rva,size):
        matches=[s for s in sections if s['rva']<=rva and rva+size<=s['rva']+s['rawSize']]
        if len(matches)!=1:raise ValueError('Ambiguous or unbacked RVA')
        return matches[0]['rawOffset']+rva-matches[0]['rva']
    def string(rva):
        offset=address(rva,1);section=next(s for s in sections if s['rawOffset']<=offset<s['rawOffset']+s['rawSize'])
        limit=min(512,section['rawOffset']+section['rawSize']-offset);raw=span(offset,limit)
        if b'\0' not in raw:raise ValueError('Unterminated export')
        result=raw.split(b'\0',1)[0].decode('ascii')
        if not result or any(ord(c)<32 or ord(c)>126 for c in result):raise ValueError('Invalid export name')
        return result
    exports=[];export_rva=u32(opt+112)
    if export_rva:
        directory=address(export_rva,40);names=u32(directory+24)
        if names>4096:raise ValueError('Export count exceeds bound')
        table=address(u32(directory+32),4*names)
        exports=[string(u32(table+4*i)) for i in range(names)]
        if len(set(exports))!=len(exports):raise ValueError('Duplicate exports')
    return dict(schema=1,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),
        machine='AMD64',timestamp=u32(pe+8),linkerVersion=list(span(opt+2,2)),
        subsystem=u16(opt+68),dllCharacteristics=u16(opt+70),
        sections=sections,exports=sorted(exports),readyForPublication=False)

def compare(published,rebuilt):
    old=inspect(published);new=inspect(rebuilt)
    def codes(report):return [(s['name'],s['rawSize'],s['sha256']) for s in report['sections'] if s['characteristics'] & 0x20]
    # Report a bounded exact byte delta; never normalize timestamps or data.
    changed=[];different=0;start=None
    size=max(len(published),len(rebuilt))
    for index in range(size+1):
        differs=index<size and (index>=len(published) or index>=len(rebuilt) or published[index]!=rebuilt[index])
        if differs:
            different+=1
            if start is None:start=index
        elif start is not None:
            if len(changed)<32:
                changed.append(dict(offset=start,length=index-start,
                    publishedHex=published[start:min(index,start+32)].hex(),
                    rebuiltHex=rebuilt[start:min(index,start+32)].hex(),
                    bytesTruncated=index-start>32))
            start=None
    return dict(schema=1,published=old,rebuilt=new,
        changedByteCount=different,changedRanges=changed,
        changedBytesIncluded=sum(min(d['length'],32) for d in changed),
        identicalBytes=published==rebuilt,identicalExportNames=old['exports']==new['exports'],
        identicalCodeSections=codes(old)==codes(new),
        readyForPublication=False,binarySourceCorrespondenceApproved=False,
        note='Matching exports/sections do not prove behavior, source provenance or safe publication.')
