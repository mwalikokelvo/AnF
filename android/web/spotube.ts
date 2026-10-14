const pending=new Map<string,{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let sequence=0;
declare global{interface Window{anfSpotubeResult:(id:string,error:string)=>void;}}
window.anfSpotubeResult=(id,error)=>{const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timer);if(error)request.reject(Error(error));else request.resolve();};
export function spotubeAvailable(){return window.CoucouAndroid?.spotubeAvailable?.()===true;}
export function spotubeRequest(operation:'open'|'pause'){
 if(!spotubeAvailable())return operation==='pause'?Promise.resolve():Promise.reject(Error('Embedded Spotube is unavailable in this build.'));
 const id=String(++sequence);
 return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Spotube did not respond.'));},12000);pending.set(id,{resolve,reject,timer});try{window.CoucouAndroid!.spotubeRequest!(id,operation);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
}
