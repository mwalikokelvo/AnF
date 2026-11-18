// Real browser failures: explicitly cancelled old requests are expected, live failures are not.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start} from './fixture.mjs';
let requested,release;
const entered=new Promise(resolve=>{requested=resolve;});
const held=new Promise(resolve=>{release=resolve;});
const fx=await start({beforeResponse:async url=>{
 if(url.includes('fixture-hold=1')){requested();await held;}
}});
const result={browserFixture:true,failures:[]};
try{
 const {context,page}=await fx.open();
 page.on('requestfailed',r=>result.failures.push({url:r.url(),reason:r.failure()?.errorText}));
 await page.evaluate(()=>{void fetch('/workspace.html?fixture-hold=1').catch(()=>{});});
 await entered;
 await fx.reload(page);
 release();
 result.problemsAfterReload=[...fx.problems];
 result.ignoredCancellations=fx.ignoredCancellations;
 assert.deepEqual(fx.problems,[],'Explicit reload must not report cancelled old-document requests as missing assets');
 assert(fx.ignoredCancellations.some(s=>s.url.includes('fixture-hold=1')&&s.reason==='net::ERR_ABORTED'),'The real cancelled HTTP request must be accounted for');
 await fx.closeContext(context);
 release();
 result.problemsAfterTeardown=[...fx.problems];
 assert.deepEqual(fx.problems,[],'Intentional context close must not report a missing asset');
 const next=await fx.open();
 await next.page.route('**/assets/live-editor-qa-failure.js',route=>route.abort('aborted'));
 await next.page.evaluate(async()=>{await fetch('/assets/live-editor-qa-failure.js').catch(()=>{});});
 assert(fx.problems.some(s=>s.includes('requestfailed:')&&s.includes('live-editor-qa-failure.js')),'Live asset request failure must remain visible');
 await next.page.evaluate(async()=>{await fetch('/assets/live-editor-qa-missing.js');});
 assert(fx.problems.some(s=>s.includes('http 404:')&&s.includes('live-editor-qa-missing.js')),'Real missing asset must remain visible');
 await next.page.evaluate(()=>console.error('live-editor fixture diagnostic'));
 assert(fx.problems.some(s=>s.includes('console.error: live-editor fixture diagnostic')),'Editor errors must remain visible');
 result.unexpectedFailuresRetained=[...fx.problems];result.passed=true;
 console.log('PASS: explicit reload/teardown cancellation is isolated; live failures, 404 and editor errors remain strict.');
}catch(error){result.error=String(error);throw error;}
finally{
 release();
 if(process.env.ANF_FIXTURE_REQUEST_REPORT)await writeFile(process.env.ANF_FIXTURE_REQUEST_REPORT,JSON.stringify(result,null,2));
 await fx.close();
}
