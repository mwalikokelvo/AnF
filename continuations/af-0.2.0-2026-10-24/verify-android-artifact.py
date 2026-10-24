import hashlib, json, pathlib, struct, sys, zipfile
path = pathlib.Path(sys.argv[1]).resolve()
with zipfile.ZipFile(path) as archive:
    assert archive.testzip() is None, 'APK CRC failure'
    names = archive.namelist()
    is_aar = path.suffix.lower() == '.aar'
    assert {'AndroidManifest.xml','classes.jar' if is_aar else 'classes.dex'} <= set(names)
    if is_aar:
        assert all(f'jni/{abi}/libapp.so' in names for abi in ('armeabi-v7a','arm64-v8a','x86_64'))
        assert any(n.startswith('assets/flutter_assets/') for n in names)
        assert not any(n.lower().endswith(('.exe','.dll','.jks','.keystore','/.env')) for n in names)
    native = []
    for name in names:
        if not name.startswith(('lib/','jni/')) or not name.endswith('.so'): continue
        data = archive.read(name)
        assert data[:4] == b'\x7fELF', name
        byte_order = '<' if data[5] == 1 else '>'
        if data[4] == 2:
            offset = struct.unpack_from(byte_order+'Q',data,32)[0]
            size, count = struct.unpack_from(byte_order+'HH',data,54)
            loads = [struct.unpack_from(byte_order+'IIQQQQQQ',data,offset+i*size) for i in range(count)]
            aligns = [p[7] for p in loads if p[0] == 1]
        else:
            offset = struct.unpack_from(byte_order+'I',data,28)[0]
            size, count = struct.unpack_from(byte_order+'HH',data,42)
            loads = [struct.unpack_from(byte_order+'IIIIIIII',data,offset+i*size) for i in range(count)]
            aligns = [p[7] for p in loads if p[0] == 1]
        native.append({'file':name,'loadAlignment':aligns,'supports16KAlignment':all(a>=16384 for a in aligns)})
    report = {'path':str(path),'artifactType':'Flutter AAR library' if is_aar else 'APK','bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'crc':'pass','nativeLibraries':native,'embeddedFlutter':any('libflutter.so' in n for n in names),'containsFlutterAot':any('libapp.so' in n for n in names),'runtimeInstallTest':'library only; requires host APK testing' if is_aar else 'not run: no connected Android device'}
destination = pathlib.Path(__file__).parent/'verification'/('android-'+path.stem+'-inventory.json')
destination.write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
