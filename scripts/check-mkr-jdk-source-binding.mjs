import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkJdkSourceBinding} from '../integrations/mkr-music/jdk-source-binding.mjs';
const release=Buffer.from('JAVA_VERSION="21.0.12.1"\r\nOS_NAME="Windows"\r\nOS_ARCH="x86_64"\r\n');
const record={releaseFileSha256:createHash('sha256').update(release).digest('hex'),javaApiSourcesSha256:'b'.repeat(64),
 commit:'a'.repeat(40),completeSourceArchiveCollected:true,sourceArchiveEvidence:{commit:'a'.repeat(40),archiveSha256:'c'.repeat(64),inventory:{fullPinnedGitTreeMatches:true}}};
const accepted=checkJdkSourceBinding(release,'b'.repeat(64),record);
assert.equal(accepted.releaseAndApiSourceHashesMatch,true);
for(const key of ['binarySourceCorrespondenceApproved','reproducibleBinaryComparisonComplete','completeDistributionSourceReviewApproved'])assert.equal(accepted[key],false);
assert.throws(()=>checkJdkSourceBinding(Buffer.concat([release,Buffer.from('#changed')]),'b'.repeat(64),record),/differs/);
assert.throws(()=>checkJdkSourceBinding(release,'d'.repeat(64),record),/differs/);
assert.throws(()=>checkJdkSourceBinding(Buffer.from(release.toString().replace('Windows','Linux')),'b'.repeat(64),record),/Windows/);
for(const change of [r=>r.sourceArchiveEvidence.commit='d'.repeat(40),r=>r.sourceArchiveEvidence.inventory.fullPinnedGitTreeMatches=false,r=>r.completeSourceArchiveCollected=false,r=>delete r.javaApiSourcesSha256]){
 const bad=structuredClone(record);change(bad);assert.throws(()=>checkJdkSourceBinding(release,'b'.repeat(64),bad),/Incomplete/);
}
console.log('PASS reviewed JDK metadata/source binding; changed toolchain and incomplete record rejected; no binary/publication approval inferred');
