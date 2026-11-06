import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
import struct
spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-apk-native.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


class ApkTest(unittest.TestCase):
    def make(self,path,aligned=False,compressed=False):
        name='lib/arm64-v8a/libfixture.so';entry=zipfile.ZipInfo(name)
        if aligned:
            count=16384-30-len(name.encode())
            entry.extra=struct.pack('<HH',0xcafe,count-4)+bytes(count-4)
        entry.compress_type=zipfile.ZIP_DEFLATED if compressed else zipfile.ZIP_STORED
        with zipfile.ZipFile(path,'w') as z:z.writestr(entry,b'generated non-executable fixture')
    def test_native_alignment(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fixture.apk'
            self.make(p);self.assertFalse(module.inspect(p)['allRequiredEntriesAligned'])
            self.make(p,aligned=True);self.assertTrue(module.inspect(p)['allRequiredEntriesAligned'])
            self.make(p,compressed=True);r=module.inspect(p);self.assertEqual(r['uncompressed64BitEntries'],0);self.assertTrue(r['allRequiredEntriesAligned'])
    def test_missing_native_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fixture.apk'
            with zipfile.ZipFile(p,'w') as z:z.writestr('file.txt','fixture')
            with self.assertRaises(ValueError):module.inspect(p)


if __name__=='__main__':unittest.main()
