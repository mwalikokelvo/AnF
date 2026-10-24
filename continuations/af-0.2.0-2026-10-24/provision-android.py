import concurrent.futures, hashlib, json, pathlib, sys, urllib.request, xml.etree.ElementTree as ET, zipfile
root = pathlib.Path(__file__).resolve().parent
downloads = root / 'tool-downloads'
tools = root / 'tools'
tools.mkdir(exist_ok=True)
def digest(p, algorithm):
    h = hashlib.new(algorithm)
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024), b''): h.update(block)
    return h.hexdigest()
def install(item):
    name, url, checksum, algorithm, destination = item
    archive = downloads/(name+'.zip')
    if not archive.exists() or digest(archive,algorithm) != checksum:
        print('Downloading '+name, flush=True)
        temporary = archive.with_suffix('.part')
        with urllib.request.urlopen(url, timeout=90) as response, temporary.open('wb') as f:
            while block := response.read(1024*1024): f.write(block)
        assert digest(temporary,algorithm) == checksum, 'Checksum failed: '+name
        temporary.replace(archive)
    print('Verified '+name, flush=True)
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            target=(destination/info.filename).resolve()
            assert target.is_relative_to(destination.resolve()), info.filename
        z.extractall(destination)
    print('Installed '+name, flush=True)
    return {'name':name,'url':url,'checksum':checksum,'algorithm':algorithm,'archiveSha256':digest(archive,'sha256')}

if '--jdk17' in sys.argv:
    url='https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    metadata_path=downloads/'jdk17-release.json'
    if metadata_path.exists(): metadata=json.loads(metadata_path.read_text(encoding='utf-8-sig'))
    else:
        with urllib.request.urlopen(url,timeout=30) as response: metadata=json.load(response)
        metadata_path.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    if isinstance(metadata,list): metadata=metadata[0]
    package=metadata['binary']['package']
    result=install(('jdk17',package['link'],package['checksum'],'sha256',tools/'jdk17'))
    (downloads/'jdk17-inventory.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    sys.exit(0)

jdk = json.loads((downloads/'jdk-release.json').read_text(encoding='utf-8-sig'))
if isinstance(jdk,list): jdk=jdk[0]
package=jdk['binary']['package']
items=[('jdk21',package['link'],package['checksum'],'sha256',tools/'jdk'),
       ('gradle-8.11.1','https://services.gradle.org/distributions/gradle-8.11.1-bin.zip',(downloads/'gradle.sha256').read_text(encoding='utf-8-sig').strip(),'sha256',tools)]
modern='--modern' in sys.argv
if modern:
    items=[('gradle-9.3.1','https://services.gradle.org/distributions/gradle-9.3.1-bin.zip',(downloads/'gradle9.sha256').read_text(encoding='utf-8-sig').strip(),'sha256',tools)]
    if '--platform37only' in sys.argv: items=[]
repo=ET.parse(downloads/('android-repository-modern.xml' if modern else 'android-repository.xml')).getroot()
selected={}
for remote in repo.findall('remotePackage'):
    revision=remote.find('revision')
    if revision.find('preview') is not None: continue
    path=remote.attrib['path']
    rank=tuple(int(revision.findtext(k) or 0) for k in ('major','minor','micro'))
    if path not in selected or rank > selected[path][0]: selected[path]=(rank,remote)
for _,remote in selected.values():
    path=remote.attrib['path']
    wanted={'platforms;android-37.0','build-tools;36.0.0','platform-tools'} if modern else {'platforms;android-35','build-tools;35.0.0'}
    if '--platform37only' in sys.argv: wanted={'platforms;android-37.0'}
    if path not in wanted: continue
    for archive in remote.findall('archives/archive'):
        host=archive.findtext('host-os')
        if host and host != 'windows': continue
        complete=archive.find('complete')
        checksum=complete.find('checksum')
        destination=tools/'android-sdk'
        if path.startswith('platforms;'): destination=destination/'platforms'
        elif path.startswith('build-tools;'): destination=destination/'build-tools'
        items.append((path.replace(';','-'),'https://dl.google.com/android/repository/'+complete.findtext('url'),checksum.text,checksum.attrib.get('type','sha1'),destination))
        break
print('Packages:', [i[0] for i in items], flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    evidence=list(executor.map(install,items))
(downloads/('modern-toolchain-inventory.json' if modern else 'toolchain-inventory.json')).write_text(json.dumps(evidence,indent=2),encoding='utf-8')
print('Android baseline tool downloads complete.',flush=True)
