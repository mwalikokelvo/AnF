// Bundle the shipped port client into a generated instrumentation asset.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
await build({stdin:{contents:`import {createMkrPortClient} from './windows/src/workspace/mkr-web-port';
window.createAnfMkrPortClient=changed=>createMkrPortClient(window,changed);`,resolveDir:root},
 bundle:true,format:'iife',target:'chrome110',outfile:path.join(root,'integrations/mkr-music/android-catalog/src/androidTest/assets/native-web-client.js')});
