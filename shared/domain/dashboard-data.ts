export type DraftTask={line:number;text:string;checked:boolean};
/** Fenced examples are not actionable content. Closing fences must match the
 * opening character and be at least as long, with no trailing information. */
export function outsideCodeLines(text:string):{line:number;text:string}[]{
  const result:{line:number;text:string}[]=[];let fence='',length=0;
  text.split('\n').forEach((text,line)=>{
    const marker=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if(fence){if(marker&&marker[1][0]===fence&&marker[1].length>=length&&!marker[2].trim()){fence='';length=0;}return;}
    if(marker&&!(marker[1][0]==='`'&&marker[2].includes('`'))){fence=marker[1][0];length=marker[1].length;return;}
    result.push({line,text});
  });return result;
}
export function draftTasks(text:string):DraftTask[]{
  return outsideCodeLines(text).flatMap(({line,text})=>{const match=/^\s*[-*] \[([ xX])\] (.+)$/.exec(text);return match?[{line,text:match[2],checked:match[1]!==' '}]:[];});
}
export function dayName(date=new Date()){return 'Daily · '+[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
export const quickCaptureLimit=8000;
export function captureText(draft:string,text:string,date=new Date()){
  if(!text.trim())throw Error('Write a thought first.');if(text.length>quickCaptureLimit)throw Error('Keep quick captures under 8,000 characters.');
  const next=draft+(draft.trim()?'\n\n':'')+'## '+date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'\n\n'+text.trim();
  if(new TextEncoder().encode(next).length>200000)throw Error('Today’s log is full. Export it or start another draft.');return next;
}
