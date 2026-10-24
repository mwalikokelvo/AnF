import type { Settings, ChatMessage } from "./state";

export const BROWSER_APPS = {
  claude: { label: "Claude", url: "https://claude.ai/" },
  openai: { label: "ChatGPT", url: "https://chatgpt.com/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/app" },
  notebook: { label: "Gemini Notebook", url: "https://notebook.google/" },
} as const;

export const AI_LABELS = { claude:"Claude", openai:"ChatGPT", gemini:"Gemini", notebook:"Gemini Notebook", local:"Offline AI" } as const;

export function chatIdentity(s: Settings): string {
  return s.chatMode === "browser" ? `browser:${s.browserProvider}`
    : `${s.chatProvider}:${s.chatProvider === "openai" ? s.openaiModel : s.chatProvider === "gemini" ? s.geminiModel : s.chatProvider === "local" ? "offline" : s.model}`;
}

/** Keep very long chats from accumulating an ever-growing DOM and memory use. */
export function trimChatHistory(history: ChatMessage[]): void {
  if (history.length > 60) history.splice(0,history.length - 60);
  while (history.length && history[0].role !== "user") history.shift();
}

/** Clipboard preparation only; the user pastes and sends in their own account. */
export async function prepareBrowserPrompt(query: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(query); return true; }
  catch { return false; }
}
