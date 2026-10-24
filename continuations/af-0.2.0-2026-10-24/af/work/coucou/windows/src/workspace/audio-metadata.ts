import {parseBlob} from 'music-metadata';
export type TrackMetadata={title?:string;artist?:string;album?:string;year?:number;duration?:number;sourceRate?:number;bitDepth?:number;bitrate?:number;channels?:number;format?:string;cover?:Blob};
export async function readAudioMetadata(blob:Blob):Promise<TrackMetadata>{
 const {common,format}=await parseBlob(blob,{duration:false,skipPostHeaders:true});
 const picture=common.picture?.find(p=>['image/jpeg','image/png','image/webp'].includes(p.format)&&p.data.length<=2_000_000);
 const positive=(n:number|undefined)=>n!==undefined&&Number.isFinite(n)&&n>0?n:undefined;
 return {title:common.title?.slice(0,160),artist:common.artist?.slice(0,160),album:common.album?.slice(0,160),year:positive(common.year),duration:positive(format.duration),sourceRate:positive(format.sampleRate),bitDepth:positive(format.bitsPerSample),bitrate:positive(format.bitrate),channels:positive(format.numberOfChannels),format:format.codec||format.container,cover:picture?new Blob([new Uint8Array(picture.data)],{type:picture.format}):undefined};
}
export function formatBadge(t:TrackMetadata){return [t.format,t.sourceRate?(t.sourceRate/1000)+' kHz':undefined,t.bitDepth?t.bitDepth+'-bit':undefined,t.bitrate?Math.round(t.bitrate/1000)+' kbps':undefined,t.channels?t.channels+' ch':undefined].filter(Boolean).join(' · ');}
