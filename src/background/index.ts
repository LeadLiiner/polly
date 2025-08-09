import { listWorkflows, saveWorkflow, deleteWorkflow } from "../shared/storage";
import type { Message, Workflow, Step, Locator } from "../shared/types";

type RecordingBuffer = { steps: Step[]; url?: string; name?: string };
const recordingByTab = new Map<number, RecordingBuffer>();

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  (async () => {
    if (msg.kind === "GET:WORKFLOWS") return sendResponse(await listWorkflows());
    if (msg.kind === "SET:WORKFLOW") { await saveWorkflow(msg.workflow); return sendResponse({ ok: true }); }
    if (msg.kind === "DELETE:WORKFLOW") { await deleteWorkflow(msg.id); return sendResponse({ ok: true }); }

    if (msg.kind === "RECORDER:START") {
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      recordingByTab.set(tabId, { steps: [], url: sender.tab?.url, name: msg.workflowName });
      return sendResponse({ ok: true });
    }

    if (msg.kind === "RECORDER:STEP") {
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      const buf = recordingByTab.get(tabId);
      if (buf) buf.steps.push(msg.step);
      return sendResponse({ ok: true });
    }

    if (msg.kind === "RECORDER:STOP") {
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      return sendResponse({ ok: true, count: recordingByTab.get(tabId)?.steps.length || 0 });
    }

    if (msg.kind === "GET:PENDING_STEPS") {
      let tabId = msg.tabId ?? sender.tab?.id ?? (await getActiveTabId());
      if (tabId == null) return sendResponse({ ok: false, error: "No tab" });
      const buf = recordingByTab.get(tabId) || { steps: [] };
      return sendResponse({ ok: true, steps: buf.steps, url: buf.url, name: buf.name });
    }

    if (msg.kind === "PLAYER:RUN") {
      let tabId = msg.tabId ?? sender.tab?.id ?? (await getActiveTabId());
      if (tabId == null) return sendResponse({ ok: false, error: "No tab" });
      const wfs = await listWorkflows();
      const wf = wfs.find(w => w.id === msg.workflowId);
      if (!wf) return sendResponse({ ok: false, error: "Workflow not found" });
      try {
        await playOnTab(tabId, wf, msg.variables || {});
        sendResponse({ ok: true });
      } catch (e: any) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    }
  })();
  return true;
});

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// ---- CDP helpers ----
async function playOnTab(tabId: number, wf: Workflow, vars: Record<string,string>) {
  await chrome.debugger.attach({ tabId }, "1.3");
  try {
    if (wf.url) await send(tabId, "Page.navigate", { url: wf.url });
    await send(tabId, "Page.enable", {});
    await send(tabId, "DOM.enable", {});
    await send(tabId, "Runtime.enable", {});
    for (const s of wf.steps) {
      if (s.type === "waitFor") { await sleep(s.ms); continue; }
      if (s.type === "keydown") {
        await send(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: s.key });
        await send(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: s.key });
        continue;
      }
      if (s.type === "click") {
        const pt = await resolvePoint(tabId, s.loc);
        await send(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y });
        await send(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        await send(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        continue;
      }
      if (s.type === "input") {
        const value = typeof s.value === "string" ? s.value : vars[s.value.var] ?? "";
        await focusElement(tabId, s.loc);
        await send(tabId, "Input.insertText", { text: value });
      }
      await sleep(100);
    }
  } finally {
    try { await chrome.debugger.detach({ tabId }); } catch {}
  }
}

async function send(tabId: number, method: string, params: any) {
  return chrome.debugger.sendCommand({ tabId }, method as any, params);
}

async function resolveNodeId(tabId: number, loc: Locator): Promise<number> {
  const { root } = await send(tabId, "DOM.getDocument", { depth: -1 });
  if (loc.strategy === "id") {
    const { nodeId } = await send(tabId, "DOM.querySelector", { nodeId: root.nodeId, selector: `#${cssEscape(loc.value)}` });
    return nodeId;
  }
  if (loc.strategy === "name") {
    const { nodeId } = await send(tabId, "DOM.querySelector", { nodeId: root.nodeId, selector: `[name="${cssEscape(loc.value)}"]` });
    return nodeId;
  }
  if (loc.strategy === "text") {
    const { result } = await send(tabId, "Runtime.evaluate", {
      expression: `(() => {
        const it = document.evaluate('//*[normalize-space(text())="${jsString(loc.value)}"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return it.singleNodeValue;
      })()`,
      returnByValue: false
    });
    if (result.objectId) {
      const { nodeId: nid } = await send(tabId, "DOM.requestNode", { objectId: result.objectId });
      return nid;
    }
  }
  if (loc.strategy === "xpath") {
    const { result } = await send(tabId, "Runtime.evaluate", {
      expression: `document.evaluate(${JSON.stringify(loc.value)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
      returnByValue: false
    });
    if (result.objectId) {
      const { nodeId } = await send(tabId, "DOM.requestNode", { objectId: result.objectId });
      return nodeId;
    }
  }
  const { nodeId } = await send(tabId, "DOM.querySelector", { nodeId: root.nodeId, selector: loc.value });
  return nodeId;
}

async function resolvePoint(tabId: number, loc: Locator): Promise<{x:number,y:number}> {
  const nodeId = await resolveNodeId(tabId, loc);
  const { model } = await send(tabId, "DOM.getBoxModel", { nodeId });
  const [x1, y1, x2, y2] = model.border;
  const x = Math.round((x1 + x2) / 2);
  const y = Math.round((y1 + y2) / 2);
  return { x, y };
}

async function focusElement(tabId: number, loc: Locator) {
  const nodeId = await resolveNodeId(tabId, loc);
  await send(tabId, "DOM.focus", { nodeId });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function cssEscape(s: string) { return s.replace(/["\\]/g, "\\$&"); }
function jsString(s: string) { return s.replace(/["\\]/g, "\\$&"); }
