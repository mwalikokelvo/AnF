import {parseBlob} from 'music-metadata';
import {toLrc} from './lyrics';
export type TrackMetadata={title?:string;artist?:string;album?:string;year?:number;genre?:string;trackNo?:number;trackOf?:number;duration?:number;sourceRate?:number;bitDepth?:number;bitrate?:number;channels?:number;format?:string;cover?:Blob;chapters?:{title:string;start:number}[];lyrics?:string;};
// Embedded lyrics, stored as LRC text: synchronized (millisecond) tags first, then plain lyrics.
function embeddedLyrics(tags:{timeStampFormat?:number;text?:string;syncText?:{text:string;timestamp?:number}[]}[]|undefined){
 const synced=tags?.find(t=>t.timeStampFormat===2&&t.syncText?.length);if(synced)return toLrc(synced.syncText!).slice(0,200_000);
 const text=tags?.find(t=>t.text?.trim())?.text;return text?text.slice(0,200_000):undefined;
}
export async function readAudioMetadata(blob:Blob):Promise<TrackMetadata>{
 const {common,format}=await parseBlob(blob,{duration:false,skipPostHeaders:true});
 const picture=common.picture?.find(p=>['image/jpeg','image/png','image/webp'].includes(p.format)&&p.data.length<=2_000_000);
 const positive=(n:number|undefined)=>n!==undefined&&Number.isFinite(n)&&n>0?n:undefined;
 const rawChapters=((common as {chapters?:{title?:string;start?:number}[]}).chapters||[]).slice(0,200);
 const chapters=rawChapters.map((c,i:number)=>({title:(c.title||'Chapter '+(i+1)).slice(0,120),start:Math.max(0,Number(c.start)||0)})).filter(c=>Number.isFinite(c.start));const track=common.track as {no?:number;of?:number}|undefined;return {title:common.title?.slice(0,160),artist:common.artist?.slice(0,160),album:common.album?.slice(0,160),year:positive(common.year),genre:common.genre?.[0]?.slice(0,80),trackNo:positive(track?.no),trackOf:positive(track?.of),duration:positive(format.duration),sourceRate:positive(format.sampleRate),bitDepth:positive(format.bitsPerSample),bitrate:positive(format.bitrate),channels:positive(format.numberOfChannels),format:format.codec||format.container,cover:picture?new Blob([new Uint8Array(picture.data)],{type:picture.format}):undefined,chapters:chapters.length?chapters:undefined,lyrics:embeddedLyrics(common.lyrics)};
}
export function formatBadge(t:TrackMetadata){return [t.format,t.sourceRate?(t.sourceRate/1000)+' kHz':undefined,t.bitDepth?t.bitDepth+'-bit':undefined,t.bitrate?Math.round(t.bitrate/1000)+' kbps':undefined,t.channels?t.channels+' ch':undefined].filter(Boolean).join(' · ');}
