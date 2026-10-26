// Android: themes are fetched, checked and stored by AddonsBridge.java. This page only names an add-on id.
import {createMarketplace,type Call} from '../../windows/src/workspace/addons-core';
type Pending={resolve:(v:string)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
declare global{interface Window{anfAddonResult:(id:string,value:string,error:string)=>void;}}
const pending=new Map<string,Pending>();let sequence=0;
window.anfAddonResult=(id,value,error)=>{const p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);if(error)p.reject(Error(error));else p.resolve(value);};
const send=(operation:string,data:Record<string,unknown>)=>new Promise<string>((resolve,reject)=>{
 const native=window.AnFAndroid;if(!native?.addonRequest){reject(Error('Themes need the updated Android app.'));return;}
 const id=String(++sequence);
 const timer=setTimeout(()=>{pending.delete(id);reject(Error('The marketplace took too long. Try again.'));},60_000);
 pending.set(id,{resolve,reject,timer});
 try{native.addonRequest(id,operation,JSON.stringify(data));}catch{pending.delete(id);clearTimeout(timer);reject(Error('The marketplace could not start.'));}
});
// Registry and list come back as JSON; a theme comes back as CSS text; install and remove return nothing useful.
const call:Call=async<T>(command:string,args:Record<string,unknown>={})=>{
 const text=await send(command,args);
 return (command==='addons_registry'||command==='addons_list'?JSON.parse(text):text) as T;
};
export const {applyTheme,clearTheme,restoreTheme,marketplacePanel}=createMarketplace(call);
