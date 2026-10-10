export type DraftTask={line:number;text:string;checked:boolean};
export function draftTasks(text:string):DraftTask[]{
  const tasks:DraftTask[]=[];let fence='';
  text.split('\n').forEach((line,index)=>{const marker=/^\s*(`{3,}|~{3,})/.exec(line);if(marker){if(!fence)fence=marker[1][0];else if(marker[1][0]===fence)fence='';return;}if(fence)return;const match=/^\s*[-*] \[([ xX])\] (.+)$/.exec(line);if(match)tasks.push({line:index,text:match[2],checked:match[1]!==' '});});return tasks;
}
export function dayName(date=new Date()){return 'Daily · '+[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
export function captureText(draft:string,text:string,date=new Date()){
  if(!text.trim())throw Error('Write a thought first.');if(text.length>8000)throw Error('Keep quick captures under 8,000 characters.');
  const next=draft+(draft.trim()?'\n\n':'')+'## '+date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'\n\n'+text.trim();
  if(new TextEncoder().encode(next).length>200000)throw Error('Today’s log is full. Export it or start another draft.');return next;
}
