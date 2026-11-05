"""Single opt-in hosted metadata check; retain enum/counts only, never media URLs."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted':
 raise SystemExit('Disposable hosted runner required; no automatic local/provider probing.')
if len(sys.argv)!=2 or not re.fullmatch(r'[A-Za-z0-9_-]{11}',sys.argv[1]):
 raise SystemExit('Pass one deliberately selected public test video ID.')
video=sys.argv[1]
reports=Path(os.environ['RUNNER_TEMP'])/'anf-mkr-public-metadata';reports.mkdir(exist_ok=True)
marker=reports/'attempt.json'
if marker.exists():raise SystemExit('A probe was already attempted here; no retry.')
report={'sourceCommit':os.environ.get('GITHUB_SHA'),'fixtureIdSha256':hashlib.sha256(video.encode()).hexdigest(),
 'attempted':True,'metadataResolved':False,'nativePlaybackVerified':False,'readyForPublication':False}
marker.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
reason_allow={'VERIFICATION_OR_LIMIT','AUTHENTICATION_REQUIRED','CONTENT_RESTRICTED','NETWORK','PARSER','UNSUPPORTED_AUDIO','UNSUPPORTED_TRANSPORT','ACCESS_DENIED','RATE_LIMITED','NATIVE_ENGINE_UNAVAILABLE','UPSTREAM_FAILURE'}
stop_allow={'ENDPOINT','CREDENTIAL','AUTHENTICATION','DENIED','RATE_LIMIT','REDIRECT','REQUEST_BUDGET','PLAYER_RETRY','PLAYABILITY','PLAYER_BODY'}
try:
 result=subprocess.run([shutil.which('gradle') or 'gradle','--no-daemon','--max-workers=2','probePrimaryResolution','-PmkrProbeVideoId='+video],
  cwd=Path(__file__).resolve().parents[2]/'integrations/mkr-music/engine',capture_output=True,text=True,timeout=90)
 # Do not echo raw process output: third-party causes/URLs are not diagnostics.
 output=(result.stdout+result.stderr)[-2_000_000:]
 report['exitCode']=result.returncode
 report['metadataResolved']=result.returncode==0 and 'MKR metadata diagnostic returned audio/mp4;' in output
 reason=re.search(r'MKR stream resolution failed \(([A-Z_]+)',output)
 if reason and reason[1] in reason_allow:report['reason']=reason[1]
 stop=re.search(r'policy=([A-Z_]+)',output)
 if stop and stop[1] in stop_allow:report['providerStop']=stop[1]
 status=re.search(r'disposition=(OK|LOGIN_REQUIRED|AGE_RESTRICTED|UNAVAILABLE|UNKNOWN)\b',output)
 if status:report['playerDisposition']=status[1]
 for name in ['requests','adaptiveFormats','formats']:
  value=re.search(r'\b'+name+r'=(\d{1,5})\b',output)
  if value:report[name]=int(value[1])
except subprocess.TimeoutExpired:
 report['reason']='PROBE_TIMEOUT'
finally:
 marker.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,sort_keys=True))
if not report['metadataResolved']:raise SystemExit('Metadata acceptance not established. Stopped without retries, identity rotation or another player.')
