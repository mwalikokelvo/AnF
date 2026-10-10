// Overlap-add spectral subtraction with a smoothed gain floor. Conservative
// attenuation reduces musical-noise risk; it cannot guarantee artifact-free speech.
function fft(re:Float64Array,im:Float64Array,inverse=false){
 const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let size=2;size<=n;size*=2){const a=(inverse?2:-2)*Math.PI/size,wr=Math.cos(a),wi=Math.sin(a);for(let base=0;base<n;base+=size){let r=1,m=0;for(let j=0;j<size/2;j++){const p=base+j,q=p+size/2,tr=r*re[q]-m*im[q],ti=r*im[q]+m*re[q];re[q]=re[p]-tr;im[q]=im[p]-ti;re[p]+=tr;im[p]+=ti;const nr=r*wr-m*wi;m=r*wi+m*wr;r=nr;}}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
export async function spectralClean(data:Float32Array,rate:number,startSeconds:number,seconds:number,progress:(fraction:number)=>void=()=>{},cancelled:()=>boolean=()=>false):Promise<Float32Array>{
 if(!Number.isFinite(rate)||rate<8000||rate>192000||!Number.isFinite(startSeconds)||startSeconds<0||seconds<1||seconds>2||!Number.isFinite(seconds)||startSeconds+seconds>data.length/rate)throw Error('Select a noise-only slice between 1 and 2 seconds inside this track.');
 if(data.length>15_000_000)throw Error('Noise profiling supports clips up to five minutes.');
 const n=1024,hop=256,re=new Float64Array(n),im=new Float64Array(n),window=Float64Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/n)),noise=new Float64Array(n),gain=new Float64Array(n).fill(1),out=new Float32Array(data.length),weights=new Float32Array(data.length);
 function frame(at:number){for(let i=0;i<n;i++){re[i]=(data[at+i]||0)*window[i];im[i]=0;}fft(re,im);}
 let count=0;const begin=Math.floor(startSeconds*rate),end=Math.floor((startSeconds+seconds)*rate);
 for(let at=begin;at+n<=end;at+=hop){frame(at);for(let k=0;k<n;k++)noise[k]+=re[k]*re[k]+im[k]*im[k];count++;}
 if(!count)throw Error('The noise profile is too short.');for(let k=0;k<n;k++)noise[k]/=count;
 let frames=0;for(let at=-n+hop;at<data.length;at+=hop){
  if(cancelled())throw Error('Audio processing cancelled.');frame(at);
  const target=new Float64Array(n);for(let k=0;k<n;k++){const power=re[k]*re[k]+im[k]*im[k];target[k]=Math.sqrt(Math.max(.04,1-1.25*noise[k]/Math.max(power,1e-20)));}
  for(let k=0;k<n;k++){const smooth=(target[(k+n-1)%n]+2*target[k]+target[(k+1)%n])/4;gain[k]=.7*gain[k]+.3*smooth;re[k]*=gain[k];im[k]*=gain[k];}fft(re,im,true);
  for(let i=0;i<n;i++){const p=at+i;if(p>=0&&p<data.length){out[p]+=re[i]*window[i];weights[p]+=window[i]*window[i];}}
  if(++frames%32===0){progress(Math.max(0,Math.min(1,at/data.length)));await new Promise(r=>setTimeout(r,0));}
 }
 for(let i=0;i<out.length;i++)out[i]=Math.max(-1,Math.min(1,weights[i]>1e-8?out[i]/weights[i]:data[i]));progress(1);return out;
}
