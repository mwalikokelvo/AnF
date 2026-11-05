"""Generated PE fixtures only; no DLL loading or network."""
import importlib.util,struct,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('pe',Path(__file__).resolve().parents[1]/'integrations/mkr-music/inspect-native-pe.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture():
    data=bytearray(1024);data[:2]=b'MZ';struct.pack_into('<I',data,60,128);data[128:132]=b'PE\0\0'
    struct.pack_into('<HH',data,132,0x8664,1);struct.pack_into('<H',data,148,240);struct.pack_into('<H',data,152,0x20b)
    start=392;data[start:start+8]=b'.text\0\0\0';struct.pack_into('<IIII',data,start+8,512,4096,512,512);struct.pack_into('<I',data,start+36,0x20)
    return data
class Checks(unittest.TestCase):
    def test_identical_code_and_export_evidence_does_not_clear_publication(self):
        a=fixture();b=bytearray(a);struct.pack_into('<I',b,136,42)
        r=m.compare(a,b);self.assertFalse(r['identicalBytes']);self.assertTrue(r['identicalCodeSections']);self.assertTrue(r['identicalExportNames']);self.assertFalse(r['readyForPublication'])
        b[512]=1;self.assertFalse(m.compare(a,b)['identicalCodeSections'])
    def test_malformed_or_oversized_headers_fail_closed(self):
        for offset,value in [(60,999999),(132,0),(134,999),(148,0),(408,999999)]:
            data=fixture();struct.pack_into('<I' if offset in (60,408) else '<H',data,offset,value)
            with self.subTest(offset=offset),self.assertRaises(ValueError):m.inspect(data)
        with self.assertRaises(ValueError):m.inspect(b'x'*(m.MAX_BYTES+1))
if __name__=='__main__':unittest.main()
