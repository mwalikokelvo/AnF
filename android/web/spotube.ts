import type {NativeMusicOperation, NativeMusicState} from '../../windows/src/workspace/native-music-player';
const pending = new Map<string, {resolve:(state:NativeMusicState|null)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout>}>();
let sequence = 0;
declare global { interface Window { anfSpotubeResult:(id:string,error:string,value?:string)=>void; } }
window.anfSpotubeResult = (id,error,value) => {
  const request = pending.get(id);
  if (!request) return;
  pending.delete(id); clearTimeout(request.timer);
  if (error) { request.reject(Error(error)); return; }
  try { request.resolve(value ? JSON.parse(value) : null); }
  catch { request.reject(Error('Invalid Spotube playback status.')); }
};
export function spotubeAvailable() { return window.CoucouAndroid?.spotubeAvailable?.() === true; }
export function spotubeRequest(operation:NativeMusicOperation|'open'):Promise<NativeMusicState|null> {
  if (!spotubeAvailable()) return operation === 'pause' || operation === 'status' ? Promise.resolve(null) : Promise.reject(Error('Embedded Spotube is unavailable in this build.'));
  if (pending.size >= 32) return Promise.reject(Error('Music requests are busy.'));
  const id = String(++sequence);
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error('Spotube did not respond.')); },12000);
    pending.set(id,{resolve,reject,timer});
    try { window.CoucouAndroid!.spotubeRequest!(id,operation); }
    catch(error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
