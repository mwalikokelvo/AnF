// Bind candidate metadata to the reviewed source record; not publisher trust or
// proof that a JDK binary was reproducibly built from those sources.
import {createHash} from 'node:crypto';
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function checkJdkSourceBinding(releaseBytes,apiSourceSha256,record){
 const archive=record?.sourceArchiveEvidence;
 if(!record||!sha(record.releaseFileSha256)||!sha(record.javaApiSourcesSha256)||
    !/^[a-f0-9]{40}$/.test(record.commit||'')||record.completeSourceArchiveCollected!==true||
    archive?.commit!==record.commit||!sha(archive?.archiveSha256)||
    archive?.inventory?.fullPinnedGitTreeMatches!==true)throw Error('Incomplete reviewed JDK source record.');
 const text=Buffer.from(releaseBytes).toString('utf8');
 if(!/^JAVA_VERSION="21\./m.test(text)||!/^OS_NAME="Windows"$/m.test(text.replaceAll('\r',''))||
    !/^OS_ARCH="x86_64"$/m.test(text.replaceAll('\r','')))throw Error('Expected the reviewed Windows x64 JDK21.');
 if(createHash('sha256').update(releaseBytes).digest('hex')!==record.releaseFileSha256||
    apiSourceSha256!==record.javaApiSourcesSha256)throw Error('Candidate JDK differs from the reviewed source record.');
 return {reviewedJdkSourceCommit:record.commit,reviewedJdkSourceArchiveSha256:archive.archiveSha256,
   releaseAndApiSourceHashesMatch:true,binarySourceCorrespondenceApproved:false,
   reproducibleBinaryComparisonComplete:false,completeDistributionSourceReviewApproved:false};
}
