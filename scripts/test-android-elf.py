import importlib.util
import struct
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-android-elf.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture(bits, alignment, endian='<'):
    header = 64 if bits == 64 else 52
    size = 56 if bits == 64 else 32
    data = bytearray(header+size)
    data[:6] = b'\x7fELF'+bytes([2 if bits == 64 else 1, 1 if endian == '<' else 2])
    struct.pack_into(endian+'H', data, 18, 183 if bits == 64 else 40)
    struct.pack_into(endian+('Q' if bits == 64 else 'I'), data, 32 if bits == 64 else 28, header)
    struct.pack_into(endian+'HH', data, 54 if bits == 64 else 42, size, 1)
    struct.pack_into(endian+'I', data, header, 1)
    struct.pack_into(endian+('Q' if bits == 64 else 'I'), data, header+(48 if bits == 64 else 28), alignment)
    return data


class ElfTest(unittest.TestCase):
    def test_supported_classes_and_endianness(self):
        for bits in (32,64):
            for endian in ('<','>'):
                self.assertTrue(module.inspect(fixture(bits,16384,endian))['loadSegmentsAligned16KiB'])
    def test_four_k_is_reported_not_silently_approved(self):
        self.assertFalse(module.inspect(fixture(64,4096))['loadSegmentsAligned16KiB'])
    def test_truncated_headers_rejected(self):
        for size in (0,15,30,63,100):
            with self.assertRaises(ValueError): module.inspect(fixture(64,16384)[:size])
    def test_invalid_alignment_rejected(self):
        with self.assertRaises(ValueError): module.inspect(fixture(64,123))
    def test_non_load_table_rejected(self):
        data=fixture(64,16384);struct.pack_into('<I',data,64,2)
        with self.assertRaises(ValueError): module.inspect(data)


if __name__ == '__main__': unittest.main()
