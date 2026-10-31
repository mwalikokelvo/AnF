const defaults={LASTFM_API_KEY:'',LASTFM_API_SECRET:'',ENABLE_UPDATE_CHECK:'0',RELEASE_CHANNEL:'stable',HIDE_DONATIONS:'1'};
/** Never preserve build-time service credentials in a redistributable module. */
export function embeddedEnvironment(existing) {
  if(existing!==undefined)for(const line of existing.split(/\r?\n/)) {
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const at=line.indexOf('='),name=line.slice(0,at).trim(),value=line.slice(at+1).trim();
    if(at<0||!Object.hasOwn(defaults,name)||value!==defaults[name])throw Error('The generated Spotube environment was changed. Preserve it and prepare a clean module directory; service credentials must not be packaged.');
  }
  return Object.entries(defaults).map(([name,value])=>name+'='+value+'\n').join('');
}
