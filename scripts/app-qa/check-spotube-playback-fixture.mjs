import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withPausedFixture,generatedWave,withDecoderDiagnostics} from './spotube-playback-fixture.mjs';
const source=readFileSync(new URL('../../integrations/spotube/anf_host.dart',import.meta.url),'utf8');
const patched=withPausedFixture(source);
assert(patched.includes('audioPlayer.openPlaylist([SpotubeMedia(track)], autoPlay: false)'));
assert(patched.includes('audioPlayer.setVolume(0)'));
assert(patched.includes('resolveSymbolicLinksSync()')&&patched.includes('qa_crypto.sha256.convert(bytes)'));
assert.equal(patched.split("channel.invokeMethod<void>('ready');").length,2);
assert.throws(()=>withPausedFixture(patched));assert.throws(()=>withPausedFixture(source+source));
assert(!source.includes('ANF_SPOTUBE_QA_FIXTURE'),'Production host must have no fixture path');
assert(!patched.includes('setAudioDevice(')&&!patched.includes("'ao'"),'Keep normal output device selection');
const wave=generatedWave();assert.equal(wave.length,960044);assert.equal(wave.toString('ascii',0,4),'RIFF');
const diagnostic=withDecoderDiagnostics('class Fixture {\n      stream.error.listen((event) {\n});}');
assert(diagnostic.includes('decoder-errors.txt')&&diagnostic.includes('[url]')&&diagnostic.includes('[path]'));
// Execute the emitted regex patterns against synthetic URLs, paths and IDs.
// This catches escaping regressions in the generated Dart diagnostic source.
const patterns=[...diagnostic.matchAll(/RegExp\(r'([^']+)'\)/g)].map(match=>new RegExp(match[1],'g'));
assert.equal(patterns.length,3);
let scrubbed='https://example.invalid/media?key=synthetic C:\\fixture\\sample.wav '+'a'.repeat(40);
for(let i=0;i<patterns.length;i++)scrubbed=scrubbed.replace(patterns[i],['[url]','[path]','[identifier]'][i]);
assert.equal(scrubbed,'[url] [path] [identifier]');
assert.throws(()=>withDecoderDiagnostics(diagnostic));assert.throws(()=>withDecoderDiagnostics('changed'));
assert.equal(wave.toString('ascii',8,16),'WAVEfmt ');assert.equal(wave.readUInt32LE(24),16000);
assert.equal(wave.readUInt32LE(40),960000);assert.equal(wave.readUInt16LE(34),16);
console.log('PASS: generated PCM fixture and QA-only guarded real-player loader; no production host change.');
