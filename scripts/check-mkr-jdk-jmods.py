import hashlib,importlib.util,io,stat,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('jmods',root/'integrations/mkr-music/audit-jdk-jmods.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture(extra=None):
 with io.BytesIO() as b:
  with zipfile.ZipFile(b,'w') as z:
   z.writestr('bin/java.exe',b'generated native-data fixture');z.writestr('classes/Example.class',b'generated class-data fixture')
   if extra:extra(z)
  return b'JM\x01\x00'+b.getvalue()
def refuses(action):
 try:action()
 except ValueError:return
 raise AssertionError('Unsafe JMOD accepted')
rows=m.module_entries(fixture());assert rows==[{'entry':'bin/java.exe','bytes':29,'sha256':hashlib.sha256(b'generated native-data fixture').hexdigest()}]
refuses(lambda:m.module_entries(b'bad'+fixture()))
refuses(lambda:m.module_entries(fixture(lambda z:z.writestr('../outside.dll',b'bad'))))
def link(z):
 i=zipfile.ZipInfo('lib/link.dll');i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,b'outside')
refuses(lambda:m.module_entries(fixture(link)))
print('PASS JMOD magic, prefix-aware ZIP, native-only hashes and unsafe-path/link rejection; no execution')
