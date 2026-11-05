"""Offline archive/integrity tests for the isolated native source rebuild."""
import importlib.util,io,tempfile,unittest,zipfile,hashlib
from pathlib import Path
from unittest.mock import patch,MagicMock
spec=importlib.util.spec_from_file_location('rebuild',Path(__file__).resolve().parents[1]/'integrations/mkr-music/rebuild-quickjs-windows.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Guards(unittest.TestCase):
    def test_safe_archive_and_traversal_rejection(self):
        for name,valid in [('src/file.c',True),('../file.c',False),('C:/file.c',False),('/file.c',False),('src\\file.c',False)]:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp:
                p=Path(tmp);archive=p/'source.zip'
                with zipfile.ZipFile(archive,'w') as z:z.writestr(name,'fixture')
                if valid:
                    m.unpack(archive,p/'out');self.assertEqual((p/'out/src/file.c').read_text(),'fixture')
                else:
                    with self.assertRaises(ValueError):m.unpack(archive,p/'out')
    def test_hash_or_bound_failure_never_writes(self):
        for digest,limit in [('0'*64,99),(hashlib.sha256(b'fixture').hexdigest(),3)]:
            with tempfile.TemporaryDirectory() as tmp:
                target=Path(tmp)/'archive.zip'
                response=MagicMock();response.__enter__.return_value.read.return_value=b'fixture'
                opener=MagicMock();opener.open.return_value=response
                with patch.object(m.urllib.request,'build_opener',return_value=opener):
                    with self.assertRaises(ValueError):m.fetch_exact('https://example.invalid',target,digest,limit)
                self.assertFalse(target.exists())
if __name__=='__main__':unittest.main()
