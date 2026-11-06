"""Read native ZIP offsets; never rewrite or sign an APK."""
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path


def inspect(path):
    entries=[]
    with zipfile.ZipFile(path) as archive, open(path,'rb') as source:
        for item in archive.infolist():
            if not item.filename.startswith('lib/') or not item.filename.endswith('.so'): continue
            source.seek(item.header_offset);header=source.read(30)
            if len(header)!=30 or header[:4]!=b'PK\x03\x04': raise ValueError('Invalid local ZIP header')
            name,extra=struct.unpack_from('<HH',header,26)
            offset=item.header_offset+30+name+extra
            stored=item.compress_type==zipfile.ZIP_STORED
            required=stored and item.filename.split('/')[1] in ('arm64-v8a','x86_64')
            entries.append({'entry':item.filename,'stored':stored,'dataOffset':offset,
                            'requires16KiBAlignment':required,'aligned16KiB':offset%16384==0})
    if not entries: raise ValueError('No native libraries in APK')
    return {'schema':1,'readyForPublication':False,'apkSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'nativeEntries':entries,'uncompressed64BitEntries':sum(x['requires16KiBAlignment'] for x in entries),
            'allRequiredEntriesAligned':all(not x['requires16KiBAlignment'] or x['aligned16KiB'] for x in entries),
            'scope':'ZIP offsets only; not ELF, device execution, production signer or upgrade verification'}


if __name__=='__main__':
    result=inspect(sys.argv[1]);Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n')
    if not result['allRequiredEntriesAligned']: raise SystemExit('Unaligned uncompressed 64-bit native library')
    print('Inspected native APK ZIP offsets; publication remains gated.')
