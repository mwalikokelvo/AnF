import hashlib, json, os, pathlib, shutil, subprocess, urllib.parse, urllib.request
root=pathlib.Path(__file__).resolve().parent
source=root/'spotube/spotube-master'
module=root/'af/work/af_music'
assert 'project_type: module' in (module/'.metadata').read_text()
manifest=[]
def io(path):
    return pathlib.Path('\\\\?\\'+str(path.resolve())) if os.name=='nt' else path
for directory in ['lib','assets']:
    for path in (source/directory).rglob('*'):
        if not io(path).is_file(): continue
        relative=path.relative_to(source)
        destination=module/relative
        io(destination.parent).mkdir(parents=True,exist_ok=True)
        shutil.copyfile(io(path),io(destination))
        manifest.append({'path':relative.as_posix(),'sha256':hashlib.sha256(io(path).read_bytes()).hexdigest()})
for name in ['LICENSE','l10n.yaml','analysis_options.yaml']:
    if (source/name).exists(): shutil.copyfile(source/name,module/name)
text=(source/'pubspec.yaml').read_text()
text=text.replace('version: 5.1.2+45','version: 0.2.0+2000')
text=text.replace('  integration_test:\n    sdk: flutter\n','')
assert '  integration_test:' not in text
text=text.replace('flutter:\n  generate: true','flutter:\n  module:\n    androidX: true\n    androidPackage: com.coucou.workspace.af_music\n    iosBundleIdentifier: com.coucou.workspace.afMusic\n  generate: true')

# Vendor only the pinned plugin's tracked source, omitting desktop runtime assets
# in the Android module. The shared Pub cache and Windows plugin are unchanged.
config=source/'.dart_tool/package_config.json'
packages=json.loads(config.read_text())['packages']
package=next(p for p in packages if p['name']=='flutter_new_pipe_extractor')
uri=urllib.parse.urljoin(config.as_uri(),package['rootUri'])
plugin=pathlib.Path(urllib.request.url2pathname(urllib.parse.urlparse(uri).path))
revision=subprocess.check_output(['git','-C',str(plugin),'rev-parse','HEAD'],text=True).strip()
assert revision=='41cbd821ce49b9343136f67d83d3117e582dad75'
vendor=module/'vendor/flutter_new_pipe_extractor'
for name in subprocess.check_output(['git','-C',str(plugin),'ls-files','-z']).decode().split('\0'):
    if not name or name.startswith('assets/'): continue
    path=plugin/name
    if not io(path).is_file(): continue
    destination=vendor/name
    assert destination.resolve().is_relative_to(vendor.resolve())
    io(destination.parent).mkdir(parents=True,exist_ok=True)
    shutil.copyfile(io(path),io(destination))
assert io(vendor/'android/src/main/kotlin/dev/krtirtho/flutter_new_pipe_extractor/FlutterNewPipeExtractorPlugin.kt').is_file()
plugin_yaml=(vendor/'pubspec.yaml').read_text()
assert '  assets:\n    - assets/\n' in plugin_yaml
(vendor/'pubspec.yaml').write_text(plugin_yaml.replace('  assets:\n    - assets/\n',''))
text=text.replace('dependency_overrides:\n','dependency_overrides:\n  flutter_new_pipe_extractor:\n    path: vendor/flutter_new_pipe_extractor\n')
(module/'pubspec.yaml').write_text(text)
shutil.copyfile(source/'pubspec.lock',module/'pubspec.lock')
(module/'.env').write_text('LASTFM_API_KEY=\nLASTFM_API_SECRET=\nHIDE_DONATIONS=1\nENABLE_UPDATE_CHECK=0\nRELEASE_CHANNEL=stable\n')
native_properties=module/'.android/gradle.properties'
native_properties.write_text('org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8\norg.gradle.workers.max=2\norg.gradle.daemon=false\nandroid.useAndroidX=true\nkotlin.compiler.execution.strategy=in-process\n')
(root/'verification/music-module-source.json').write_text(json.dumps({'upstreamVersion':'5.1.2+45','moduleVersion':'0.2.0','newPipeRevision':revision,'desktopAssetsExcluded':True,'copiedFiles':manifest},indent=2))
print(f'Prepared Android music module from {len(manifest)} source/asset files; test plugin and desktop runtimes excluded.')
