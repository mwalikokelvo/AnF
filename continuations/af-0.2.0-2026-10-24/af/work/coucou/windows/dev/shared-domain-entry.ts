import * as core from '../../shared/domain';
import * as legacyEvidence from '../src/workspace/answer-evidence';
import * as legacyReader from '../src/workspace/reader-data';
import * as legacyDashboard from '../src/workspace/dashboard-data';
import * as legacyKnowledge from '../src/workspace/knowledge-data';
import * as legacyLibrary from '../src/workspace/library-data';
import * as legacyFollowups from '../src/workspace/followups';
export {core};
export const legacy={evidence:legacyEvidence,reader:legacyReader,dashboard:legacyDashboard,knowledge:legacyKnowledge,library:legacyLibrary,followups:legacyFollowups};
