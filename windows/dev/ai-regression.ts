import { Bridge } from "../src/core/bridge";
import { State, DEFAULT_SETTINGS } from "../src/core/state";
import { BROWSER_APPS, chatIdentity } from "../src/core/ai";
import { buildPrompt } from "../src/views/chat";
import { Sound } from "../src/core/sound";

const checks: string[] = [];
function check(ok: unknown, label: string) { if (!ok) throw Error(label); checks.push(label); }
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 30));
async function run() {
  Sound.enabled = false;
  Bridge.boot = async () => null;
  Bridge.hooksStatus = async () => ({ installed:false,settingsPath:"",hookPath:"",hookReady:false });
  Bridge.secretPresent = async () => false;
  let saved = { ...DEFAULT_SETTINGS };
  Bridge.saveSettings = async value => { saved = {...value}; return null; };
  const credentials: [string,string][] = [];
  Bridge.secretSet = async (key,value) => { credentials.push([key,value]); };
  Bridge.log = async () => null;
  await import("../src/settings/main");
  await settle();
  const mode = document.querySelector<HTMLSelectElement>('[aria-label="Chat connection"]')!;
  const provider = document.querySelector<HTMLSelectElement>('[aria-label="AI provider"]')!;
  check(mode && provider, "settings expose chat mode and provider");
  check(provider.options.length === 4, "in-app chat offers three cloud providers and offline AI");
  provider.value = "openai"; provider.dispatchEvent(new Event("change")); await settle();
  check(saved.chatProvider === "openai", "OpenAI choice saves without changing the Claude model");
  check(saved.model === DEFAULT_SETTINGS.model, "Claude model retained independently");
  const openaiSection = Array.from(document.querySelectorAll("section")).find(s=>s.querySelector("h2")?.textContent?.includes("OpenAI"))!;
  const key = openaiSection.querySelector<HTMLInputElement>('input[type="password"]')!;
  key.value = "fake-test-key";
  Array.from(openaiSection.querySelectorAll("button")).find(b=>b.textContent === "Save key")!.click(); await settle();
  check(credentials[0]?.[0] === "openai-api-key" && key.value === "", "OpenAI key routes to its own credential and field clears");
  mode.value = "browser"; mode.dispatchEvent(new Event("change")); await settle();
  check(provider.options.length === 4, "browser mode includes Gemini Notebook");
  provider.value = "notebook"; provider.dispatchEvent(new Event("change")); await settle();
  check(saved.browserProvider === "notebook" && saved.chatProvider === "openai", "browser and API provider preferences are independent");
  let copied = "", opened = "", calls = 0;
  Object.defineProperty(navigator,"clipboard",{ configurable:true,value:{writeText:async (text:string)=>{copied=text;}} });
  Bridge.openUrl = async url => { opened = url; return null; };
  Bridge.chatSend = async () => { calls++; return {text:"API reply"}; };
  const prompt = buildPrompt(()=>{});
  document.body.append(prompt.el);
  const input = prompt.el.querySelector<HTMLInputElement>("input")!;
  const send = prompt.el.querySelector<HTMLButtonElement>(".send-btn")!;
  for (const id of Object.keys(BROWSER_APPS) as (keyof typeof BROWSER_APPS)[]) {
    State.settings = {...DEFAULT_SETTINGS,chatMode:"browser",browserProvider:id}; State.chatHistory = [];
    prompt.sync(); input.value = "Test question"; send.click(); await settle(); prompt.sync();
    check(copied === "Test question" && opened === BROWSER_APPS[id].url, `${id} browser handoff copies question and opens correct website`);
    check(calls === 0, `${id} browser mode never calls a paid API`);
  }
  Object.defineProperty(navigator,"clipboard",{ configurable:true,value:{writeText:async ()=>{throw Error("denied");}} });
  State.chatHistory = []; input.value = "Manual question"; send.click(); await settle();
  check(State.chatHistory[1]?.content.includes("Copy your question above"), "clipboard failure provides manual handoff");
  State.settings = {...DEFAULT_SETTINGS,chatProvider:"gemini"}; State.chatHistory = [];
  prompt.sync(); input.value = "API question"; send.click(); await settle();
  check(calls === 1 && State.chatHistory[1]?.content === "API reply", "API mode keeps replies inside AnF");
  Bridge.chatSend = async ()=>{throw Error("Invalid API key");};
  State.chatHistory = []; input.value = "Retry question"; send.click(); await settle();
  check(State.chatHistory.length === 0, "failed API turn does not consume first-turn attachment context");
  check(chatIdentity({...DEFAULT_SETTINGS,openaiModel:"other"}) === chatIdentity(DEFAULT_SETTINGS), "inactive model edits leave current chat identity alone");
  document.body.innerHTML = `<pre id="result">PASS: ${checks.join("; ")}</pre>`;
}
run().catch(err=>{document.body.innerHTML = `<pre id="result">FAIL: ${String(err)}</pre>`;});
