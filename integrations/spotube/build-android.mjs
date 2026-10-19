// Build runtime AARs, plugin binaries and source jars. API-doc jars are omitted:
// old plugin Dokka compilers cannot read modern Kotlin metadata and exhaust RAM.
import {spawnTool} from './tool-process.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const module=path.join(root,'android/spotube-module');
const flutter=process.env.FLUTTER_BIN||(process.platform==='win32'?'flutter.bat':'flutter');
const info=spawnTool(flutter,['--version','--machine'],{encoding:'utf8'});
if(info.error)throw info.error;
if(info.status)throw Error('Flutter version could not be read.');
const version=JSON.parse(info.stdout);
if(version.frameworkVersion!=='3.35.2')throw Error('Use the pinned Flutter 3.35.2 toolchain.');
// Flutter exposes its SDK root through the package configuration it generates.
const config=JSON.parse(await readFile(path.join(module,'.dart_tool/package_config.json'),'utf8'));
const flutterPackage=config.packages.find(p=>p.name==='flutter');
const flutterRoot=path.resolve(fileURLToPath(new URL(flutterPackage.rootUri,new URL('file://'+path.join(module,'.dart_tool/package_config.json')))),'../..');
const original=await readFile(path.join(flutterRoot,'packages/flutter_tools/gradle/aar_init_script.gradle'),'utf8');
if(!original.includes('withJavadocJar()'))throw Error('Pinned AAR publishing script changed.');
const script=path.join(module,'.android/anf_aar_init.gradle');
const engineRepository=`
allprojects { project ->
  if (project.rootProject.name != "android_generated") return
  // Rebuild Rust plugins when the required Android ELF page alignment changes.
  project.tasks.matching { it.name.startsWith("cargokitCargoBuild") }.configureEach {
    inputs.property("anfAndroidPageAlignment", "16384-encoded-v1")
  }
  def realm = new File(getFlutterRoot(project), "bin/cache/engine.realm").text.trim()
  def storage = System.getenv('FLUTTER_STORAGE_BASE_URL') ?: "https://storage.googleapis.com"
  def engineRepo = project.repositories.maven { url "$storage/" + (realm ? "$realm/" : "") + "download.flutter.io" }
  project.repositories.exclusiveContent {
    forRepositories(engineRepo)
    filter { includeGroup("io.flutter") }
  }
}
`;
await writeFile(script,original.replaceAll('withJavadocJar()','// Runtime review builds omit API documentation jars.')+engineRepository);
const gradle=path.join(module,'.android',process.platform==='win32'?'gradlew.bat':'gradlew');
for(const variant of (process.argv.includes('--release-only') ? ['Release'] : ['Debug','Release'])){
 const result=spawnTool(gradle,['--no-daemon','--max-workers=2','-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m',
  '-Pkotlin.compiler.execution.strategy=in-process',`-I=${script}`,`-Pflutter-root=${flutterRoot}`,
  `-Poutput-dir=${path.join(module,'build/host')}`,'-Pis-plugin=false','-PbuildNumber=1.0',
  '-Ptarget=lib/main.dart','-Ptarget-platform=android-arm64,android-x64',`assembleAar${variant}`],
 {cwd:path.join(module,'.android'),stdio:'inherit',env:{...process.env,
  // Cargokit merges encoded flags with its NDK workaround and ignores RUSTFLAGS.
  CARGO_ENCODED_RUSTFLAGS:[process.env.CARGO_ENCODED_RUSTFLAGS||'', ...(process.env.CARGO_ENCODED_RUSTFLAGS ? [] : (process.env.RUSTFLAGS||'').split(/\s+/).filter(Boolean)), '-C', 'link-arg=-Wl,-z,max-page-size=16384'].filter(Boolean).join('\x1f'),
  PATH:path.join(flutterRoot,'bin')+path.delimiter+process.env.PATH}});
 if(result.error)throw result.error;if(result.status)process.exit(result.status);
}
