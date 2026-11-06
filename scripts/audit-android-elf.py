"""Inspect pinned runtime native ELF headers without loading or altering binaries."""
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path


def inspect(data):
    if len(data) < 16 or data[:4] != b'\x7fELF' or data[4] not in (1, 2) or data[5] not in (1, 2):
        raise ValueError('Invalid ELF identification')
    bits = 64 if data[4] == 2 else 32
    endian = '<' if data[5] == 1 else '>'
    minimum = 64 if bits == 64 else 52
    if len(data) < minimum:
        raise ValueError('Truncated ELF header')
    machine = struct.unpack_from(endian+'H', data, 18)[0]
    offset = struct.unpack_from(endian+('Q' if bits == 64 else 'I'), data, 32 if bits == 64 else 28)[0]
    size, count = struct.unpack_from(endian+'HH', data, 54 if bits == 64 else 42)
    expected = 56 if bits == 64 else 32
    if not count or size < expected or offset < minimum or offset+size*count > len(data):
        raise ValueError('Invalid ELF program-header table')
    loads = []
    for i in range(count):
        base = offset+i*size
        if struct.unpack_from(endian+'I', data, base)[0] != 1:
            continue
        pos = struct.unpack_from(endian+('Q' if bits == 64 else 'I'), data, base+(8 if bits == 64 else 4))[0]
        address = struct.unpack_from(endian+('Q' if bits == 64 else 'I'), data, base+(16 if bits == 64 else 8))[0]
        alignment = struct.unpack_from(endian+('Q' if bits == 64 else 'I'), data, base+(48 if bits == 64 else 28))[0]
        if alignment > 1 and (alignment & (alignment-1) or (address-pos) % alignment):
            raise ValueError('Invalid ELF load-segment alignment')
        loads.append({'offset': pos, 'virtualAddress': address, 'alignment': alignment})
    if not loads:
        raise ValueError('ELF has no load segments')
    return {'bits': bits, 'machine': machine, 'loadSegments': loads,
            'loadSegmentsAligned16KiB': all(x['alignment'] >= 16384 and (x['virtualAddress']-x['offset']) % 16384 == 0 for x in loads)}


def audit(runtime):
    entries = []
    for artifact in runtime['dependencies']:
        path = Path(artifact['file'])
        if hashlib.sha256(path.read_bytes()).hexdigest() != artifact['sha256']:
            raise ValueError('Runtime artifact digest changed')
        with zipfile.ZipFile(path) as archive:
            for name in sorted(archive.namelist()):
                if name.startswith('jni/') and name.endswith('.so'):
                    data = archive.read(name)
                    entries.append({'coordinate': artifact['coordinate'], 'entry': name,
                                    'sha256': hashlib.sha256(data).hexdigest(), **inspect(data)})
    if not entries:
        raise ValueError('No Android native ELF entries found')
    return {'schema': 1, 'readyForPublication': False, 'nativeEntries': entries,
            'scope': 'ELF headers only; no APK ZIP alignment, native source correspondence or 16KB-device execution proof'}


if __name__ == '__main__':
    source, output = map(Path, sys.argv[1:])
    result = audit(json.loads(source.read_text(encoding='utf-8')))
    output.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print('Inspected', len(result['nativeEntries']), 'native ELF entries; publication remains gated.')
