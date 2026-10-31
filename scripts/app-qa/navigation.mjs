// Exercise visible navigation through the mode rail and the primary sidebar.
// Target the sidebar explicitly: context tabs may repeat the same data-view.
export async function navigateWorkspace(page,id,platform='windows') {
  if(platform==='android') {
    const section=page.locator('.bottom-nav button[data-view="'+id+'"]');
    const mode=await section.getAttribute('data-mode');
    if(mode&&mode!=='keep')await page.locator('.mode-rail [data-mode="'+mode+'"]').click();
    await section.click();
    return;
  }
  const rail=page.locator('.history-sidebar');
  if(await rail.count()) {
    const mark=rail.locator('.brand-mark');
    if(page.viewportSize()?.width>=768&&await mark.count())await mark.hover();
    else await rail.locator('.workspace-navigation button:visible').first().hover({position:{x:14,y:14}});
  }
  const section=page.locator('.workspace-navigation [data-view="'+id+'"]');
  const mode=await section.getAttribute('data-mode');
  if(mode&&mode!=='keep') {
    const tab=page.locator('.mode-rail [data-mode="'+mode+'"]');
    if(await tab.count()&&await tab.isVisible())await tab.click();
  }
  await section.click();
  await page.locator('#panel-'+id).waitFor({state:'visible'});
}
