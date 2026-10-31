/** Escape cancels only an explicitly available task action. Editors and dialogs
 * retain their own Escape behavior; non-cancellable operations stay protected. */
export function cancelTaskFromKeyboard(event:KeyboardEvent,cancel:HTMLButtonElement):boolean{
  if(event.key!=='Escape'||event.defaultPrevented||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return false;
  if(!cancel.isConnected||cancel.disabled||cancel.hidden||cancel.ownerDocument.querySelector('dialog[open]'))return false;
  event.preventDefault();
  cancel.click();
  return true;
}
