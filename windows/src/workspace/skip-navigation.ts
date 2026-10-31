import {h} from '../views/dom';

/** Keep keyboard users one action away from the current workspace. No hash
 * navigation: Android's Back handling and the current panel remain unchanged. */
export function installSkipNavigation(root:HTMLElement,content:HTMLElement){
  if(!content.id)content.id='anf-main-content';
  if(!content.hasAttribute('tabindex'))content.tabIndex=-1;
  const link=h('a',{class:'workspace-skip-link',href:'#'+content.id,text:'Skip to main content'});
  link.addEventListener('click',event=>{event.preventDefault();content.focus({preventScroll:true});});
  root.prepend(link);
  return link;
}
