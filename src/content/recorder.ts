import type { Step, Locator, Message } from "../shared/types";

const steps: Step[] = [];
let recording = false;

function redact(v: string): string {
  return v.replace(/\b(\d{13,19}|\d{3}-\d{2}-\d{4})\b/g, "•••");
}

function cssPath(el: Element): string {
  if (!(el instanceof Element)) return "";
  const path: string[] = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let sel = el.nodeName.toLowerCase();
    if ((el as HTMLElement).id) { sel += `#${(el as HTMLElement).id}`; path.unshift(sel); break; }
    else {
      let sib: Element | null = el, nth = 1;
      while ((sib = (sib.previousElementSibling as Element))) {
        if (sib.nodeName === el.nodeName) nth++;
      }
      sel += `:nth-of-type(${nth})`;
    }
    path.unshift(sel);
    el = el.parentElement as Element;
  }
  return path.join(" > ");
}

function buildLocator(el: Element): Locator {
  if ((el as HTMLElement).id) return { strategy: "id", value: (el as HTMLElement).id };
  if ((el as HTMLInputElement).name) return { strategy: "name", value: (el as HTMLInputElement).name };
  const tag = el.tagName.toLowerCase();
  if (tag === "button" || tag === "a") {
    const text = (el.textContent || "").trim().slice(0, 80);
    if (text) return { strategy: "text", value: text };
  }
  return { strategy: "css", value: cssPath(el) };
}

function onClick(e: MouseEvent) {
  if (!recording) return;
  const target = e.target as Element;
  const loc = buildLocator(target);
  steps.push({ t: Date.now(), type: "click", loc });
}

function onInput(e: Event) {
  if (!recording) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target) return;
  const isSecret = target.type === "password" || target.autocomplete === "current-password";
  const val = isSecret ? "SECRET" : redact(target.value || "");
  const loc = buildLocator(target);
  steps.push({ t: Date.now(), type: "input", loc, name: target.name, value: val });
}

function onKeydown(e: KeyboardEvent) {
  if (!recording) return;
  steps.push({ t: Date.now(), type: "keydown", key: e.key });
}

function injectOverlay(start: boolean) {
  if (start) {
    chrome.runtime.sendMessage({ kind: "RECORDER:START", workflowName: document.title } satisfies Message);
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("assets/overlay.js");
    document.documentElement.appendChild(s);
  } else {
    const el = document.getElementById("__polly_overlay");
    el?.remove();
  }
}

async function startRecording() {
  if (recording) return;
  recording = true;
  injectOverlay(true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("keydown", onKeydown, true);
}

async function stopRecording() {
  if (!recording) return;
  recording = false;
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("input", onInput, true);
  document.removeEventListener("keydown", onKeydown, true);

  injectOverlay(false);
  steps.push({ t: Date.now(), type: "waitFor", ms: 300 });

  chrome.runtime.sendMessage({ kind: "RECORDER:STOP" } as Message);
  while (steps.length) {
    const step = steps.shift()!;
    chrome.runtime.sendMessage({ kind: "RECORDER:STEP", step } as Message);
  }
}

chrome.runtime.onMessage.addListener((m: Message) => {
  if (m && m.kind === "RECORDER:START") startRecording();
  if (m && m.kind === "RECORDER:STOP") stopRecording();
});
