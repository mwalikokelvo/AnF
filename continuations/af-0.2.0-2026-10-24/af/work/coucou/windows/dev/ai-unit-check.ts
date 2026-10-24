import { strict as assert } from "node:assert";
import { chatIdentity, trimChatHistory, AI_LABELS } from "../src/core/ai";
import { DEFAULT_SETTINGS, type ChatMessage } from "../src/core/state";
const history: ChatMessage[] = [];
for (let i=0;i<400;i++) {
  history.push({id:i,role:i%2 ? "assistant" : "user",content:`turn ${i}`});
  trimChatHistory(history);
  assert(history.length <= 60);
  assert.equal(history[0].role,"user");
  assert.equal(history.at(-1)!.id,i);
}
assert.equal(history.at(-1)!.id,399);
assert.equal(AI_LABELS.local,"Offline AI");
assert.equal(chatIdentity({...DEFAULT_SETTINGS,openaiModel:"different"}),chatIdentity(DEFAULT_SETTINGS));
assert.notEqual(chatIdentity({...DEFAULT_SETTINGS,chatProvider:"openai"}),chatIdentity(DEFAULT_SETTINGS));
assert.notEqual(chatIdentity({...DEFAULT_SETTINGS,chatMode:"browser",browserProvider:"notebook"}),chatIdentity(DEFAULT_SETTINGS));
console.log("PASS: 400 chat messages stay bounded, new messages survive the cap, complete turns remain visible, and provider identities stay distinct.");
