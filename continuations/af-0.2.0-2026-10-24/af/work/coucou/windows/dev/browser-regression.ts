import { Ticker } from '../src/views/ticker';
import { onDragDrop, type DragDropPayload } from '../src/core/bridge';
const checks: string[] = [];
function check(ok: boolean, name: string) { if (!ok) throw Error(name); checks.push(name); }
async function run() {
  const ticker = new Ticker();
  ticker.el.style.width = '220px';
  document.body.append(ticker.el);
  ticker.sync({id:'test', steps:['a long command '.repeat(100)], stepIndex:0} as any);
  const layers = ticker.el.querySelectorAll<HTMLElement>('.tick-texts');
  for (const layer of layers) {
    const [a,b] = Array.from(layer.children) as HTMLElement[];
    check(a.getBoundingClientRect().top === b.getBoundingClientRect().top, 'ticker layers share one line');
    check(a.offsetHeight === 22, 'ticker line is 22px before animation scaling');
    check(getComputedStyle(a).whiteSpace === 'nowrap', 'long labels cannot wrap');
  }
  let dropped: DragDropPayload | undefined;
  const unsubscribe = await onDragDrop(e => { if (e.type === 'drop') dropped = e; });
  const transfer = new DataTransfer();
  transfer.items.add(new File(['hello'], 'café notes.txt', {type:'text/plain'}));
  const event = new DragEvent('drop', {dataTransfer:transfer, cancelable:true});
  window.dispatchEvent(event);
  check(event.defaultPrevented, 'file drop accepted by HTML5 handler');
  check((window as any).calls.length === 0, 'file ingestion waits until handler accepts it');
  await dropped!.file!.ingest();
  const call = (window as any).calls[0];
  check(call.command === 'ingest_bytes', 'file bytes routed to Rust');
  check(new TextDecoder().decode(call.args) === 'hello', 'drop preserves file contents');
  check(decodeURIComponent(call.options.headers['x-file-name']) === 'café notes.txt', 'Unicode file name preserved');
  unsubscribe();
  document.body.innerHTML = '<pre id="result">PASS: ' + checks.join('; ') + '</pre>';
}
run().catch(err => { document.body.innerHTML = '<pre id="result">FAIL: ' + err + '</pre>'; });
