// Chat view — DOM port of PromptView / ChatBubble / TypingDotsView from
// IslandViewContent.swift.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Bridge, type ChatContext } from "../core/bridge";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import type { ViewHost } from "./views";
import { BROWSER_APPS, AI_LABELS, chatIdentity, prepareBrowserPrompt, trimChatHistory } from "../core/ai";
import { ATTACHMENT_ACCEPT } from '../core/attachments';
import {paginatedResponse} from '../workspace/response-pages';

let nextId = 1;

function bubble(message: ChatMessage): HTMLElement {
  if (message.role === "user") {
    return h(
      "div",
      { class: "chat-row user" },
      h("div", { class: "bubble", text: message.content }),
    );
  }
  return h("div", { class: "chat-row" }, h("div", { class: "reply" },paginatedResponse(message.content)));
}

function typingDots(): HTMLElement {
  return h(
    "div",
    { class: "chat-row" },
    h("div", { class: "typing" }, h("i"), h("i"), h("i")),
  );
}

/** The coloured chip showing what the question is about (a dropped file). */
function contextChip(label: string): HTMLElement {
  const chip = h("div", { class: "chip" }, h("i", { class: "chip-dot" }), h("span", { text: label }));
  requestAnimationFrame(() => chip.classList.add("settled"));
  return chip;
}

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const chipRow = h("div", { class: "chip-row" });
  const log = h("div", { class: "chat-log" });
  const input = h("textarea", {
    rows: 2,
    class: "chat-input",
    placeholder: "Ask me anything…",
    spellcheck: "false",
    'aria-label':'Your question',
  }) as HTMLTextAreaElement;
  const send = h("button", { class: "send-btn", title: "Send" }, svg(ICONS.arrowUp, 11));
  const chooseFile = h("input", { type: "file", accept: ATTACHMENT_ACCEPT, "aria-label": "Choose an attachment" }) as HTMLInputElement;
  chooseFile.style.display = "none";
  const attach = h("button", { class: "attach-btn", title: "Attach a file", "aria-label": "Attach a file" }, "＋");
  const bar = h("div", { class: "chat-bar" }, input, attach, send, chooseFile);
  const consent=h('div',{class:'attachment-consent',role:'alert'});consent.hidden=true;

  const el = h(
    "div",
    { class: "view" },
    h("div", { class: "card wash chat-card" }, h("div", { class: "chat-body" }, chipRow, log, consent, bar)),
  );
  (el.querySelector(".card") as HTMLElement).style.setProperty("--wash", "rgba(99,102,241,0.5)");

  let sending = false;
  let renderedCount = -1;
  let renderedLastId = -1;

  async function submit(approved='') {
    const query = input.value.trim();
    if (!query || sending) return;
    const selected=State.droppedFile;
    const permissionKey=chatIdentity(State.settings)+'|'+selected?.path+'|'+query;
    if(selected && /\.(epub|docx)$/i.test(selected.name) && State.settings.chatMode==='api' && State.settings.chatProvider!=='local' && approved!==permissionKey){
      consent.hidden=false;consent.replaceChildren(h('span',{text:`Send excerpts from ${selected.name} to ${AI_LABELS[State.settings.chatProvider]}?`}),h('button',{text:'Send excerpts',onclick:()=>void submit(permissionKey)}),h('button',{text:'Keep local',onclick:()=>{consent.hidden=true;}}));onHeightChange();return;
    }
    consent.hidden=true;
    input.value = "";
    sending = true;
    const identity = chatIdentity(State.settings);
    Sound.play("send");

    State.chatHistory.push({ id: nextId++, role: "user", content: query });
    trimChatHistory(State.chatHistory);
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();

    const file = State.droppedFile;
    const context: ChatContext | null = file ? { kind: "file", name: file.name, path: file.path } : null;

    try {
      if (State.settings.chatMode === "browser") {
        const app = BROWSER_APPS[State.settings.browserProvider];
        const copied = await prepareBrowserPrompt(query);
        await Bridge.openUrl(app.url);
        if (identity !== chatIdentity(State.settings)) return;
        State.chatHistory.push({ id: nextId++, role: "assistant", content: copied
          ? `Question copied. Paste it into ${app.label} in your browser and send it there.${file ? " Attach the file there as well." : ""} Replies stay in your browser account.`
          : `Open ${app.label} in your browser. Copy your question above and paste it there.${file ? " Attach the file there as well." : ""} Replies stay in your browser account.` });
        State.stateOverride = null;
        return;
      }
      const reply = await Bridge.chatSend(query, context);
      if (context?.kind === "file") State.droppedFile = null;
      if (identity !== chatIdentity(State.settings)) return;
      State.chatHistory.push({ id: nextId++, role: "assistant", content: reply.notice ? `${reply.notice}\n\n${reply.text}` : reply.text });
      State.stateOverride = null;
      Sound.play("finish");
    } catch (err) {
      if (identity !== chatIdentity(State.settings)) return;
      State.chatHistory.pop(); // Retry remains a first turn, including its attachment.
      input.value = query;
      State.stateOverride = null;
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      Sound.play("error");
    } finally {
      sending = false;
      trimChatHistory(State.chatHistory);
      State.notify();
      onHeightChange();
      input.focus();
    }
  }

  send.addEventListener("click", () => void submit());
  attach.addEventListener("click", () => chooseFile.click());
  chooseFile.addEventListener("change", () => {
    const selected = chooseFile.files?.[0];
    if (!selected) return;
    if (selected.size > 50 * 1024 * 1024) {
      State.noteMessage = "Choose an attachment under 50 MB.";
      State.view = "note";
      State.notify();
      chooseFile.value = "";
      return;
    }
    void selected.arrayBuffer().then((bytes) => Bridge.ingestBytes(bytes, selected.name)).then((saved) => {
      State.droppedFile = { name: saved.name, path: saved.path };
      State.notify();
    }).catch((err) => {
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      State.notify();
    }).finally(() => { chooseFile.value = ""; });
  });
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter" && !(e as KeyboardEvent).shiftKey && !(e as KeyboardEvent).isComposing) {
      e.preventDefault();
      void submit();
    }
    e.stopPropagation(); // Escape closes the island, not the chat
  });

  return {
    el,
    sync() {
      const file = State.droppedFile;
      const wantChip = file?.name ?? "";
      if (chipRow.dataset.label !== wantChip) {
        chipRow.dataset.label = wantChip;
        clear(chipRow);
        if (wantChip) chipRow.append(contextChip(wantChip));
      }

      const thinking = State.stateOverride === "thinking";
      const count = State.chatHistory.length + (thinking ? 0.5 : 0);
      const lastId = State.chatHistory.at(-1)?.id ?? -1;
      if (count !== renderedCount || lastId !== renderedLastId) {
        renderedCount = count;
        renderedLastId = lastId;
        clear(log);
        for (const m of State.chatHistory) log.append(bubble(m));
        if (thinking) log.append(typingDots());
        log.scrollTop = log.scrollHeight;
      }

      const provider = State.settings.chatMode === "browser" ? State.settings.browserProvider : State.settings.chatProvider;
      input.placeholder = State.settings.chatMode === "browser" ? `Copy question & open ${AI_LABELS[provider]}…`
        : State.chatHistory.length === 0 ? `Ask ${AI_LABELS[provider]}…` : "Continue…";
      send.title = State.settings.chatMode === "browser" ? "Copy question and open browser" : "Send";
      input.disabled = sending;
    },
    focus() {
      input.focus();
      input.select();
    },
  };
}
