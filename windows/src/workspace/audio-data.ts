export function peaks(channels:Float32Array[],bins=640):Float32Array {
  if(!channels.length||!channels[0].length)return new Float32Array(0);
  const length=channels[0].length,out=new Float32Array(Math.min(bins,length));
  for(let b=0;b<out.length;b++){let peak=0;for(let i=Math.floor(b*length/out.length);i<Math.floor((b+1)*length/out.length);i++)for(const c of channels)peak=Math.max(peak,Math.abs(c[i]||0));out[b]=Math.min(1,peak);}
  return out;
}
export function level(channels:Float32Array[]){let peak=0,sum=0,n=0;for(const c of channels)for(const x of c){if(!Number.isFinite(x))continue;peak=Math.max(peak,Math.abs(x));sum+=x*x;n++;}return{peak,rms:n?Math.sqrt(sum/n):0};}
export function wav(channels:Float32Array[],rate:number):ArrayBuffer {
  if(channels.length<1||channels.length>2||!Number.isInteger(rate)||rate<16000||rate>48000||channels.some(c=>c.length!==channels[0].length))throw Error('Invalid PCM audio.');
  const size=44+channels[0].length*channels.length*2;if(size>32_000_000)throw Error('WAV exceeds 32 MB. Choose mono or a lower sample rate.');
  const bytes=new ArrayBuffer(size),v=new DataView(bytes);const str=(p:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,size-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels.length,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels.length*2,true);v.setUint16(32,channels.length*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size-44,true);
  let p=44;for(let i=0;i<channels[0].length;i++)for(const c of channels){const x=Number.isFinite(c[i])?Math.max(-1,Math.min(1,c[i])):0;v.setInt16(p,Math.round(x*(x<0?32768:32767)),true);p+=2;}return bytes;
}
export function durationText(seconds:number){const n=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
