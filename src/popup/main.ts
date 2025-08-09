import { el } from "./ui";
import { listWorkflows, saveWorkflow, deleteWorkflow, uid } from "../shared/storage";
import type { Workflow, Message } from "../shared/types";

const btnStart = document.getElementById("start") as HTMLButtonElement;
const btnStop  = document.getElementById("stop") as HTMLButtonElement;
const btnSave  = document.getElementById("save") as HTMLButtonElement;
const nameInp  = document.getElementById("name") as HTMLInputElement;
const list     = document.getElementById("list") as HTMLDivElement;

btnStart.onclick = () => sendToActiveTab({ kind: "RECORDER:START", workflowName: nameInp.value || "Untitled" });
btnStop.onclick  = () => sendToActiveTab({ kind: "RECORDER:STOP" });

btnSave.onclick = async () => {
  // ask background for pending steps from current tab
  const resp = await chrome.runtime.sendMessage({ kind: "GET:PENDING_STEPS" } as Message) as any;
  if (!resp?.ok) return alert(resp?.error || "No recorded steps");
  const steps = resp.steps || [];
  if (!steps.length) return alert("No steps recorded yet.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const wf: Workflow = {
    id: uid(),
    name: nameInp.value || resp.name || (tab?.title ?? "Untitled"),
    url: tab?.url,
    steps
  };
  await saveWorkflow(wf);
  render();
};

async function render() {
  const wfs = await listWorkflows();
  list.innerHTML = "";
  for (const wf of wfs) {
    const runBtn = el("button", { onclick: () => run(wf.id) }, "Run");
    const delBtn = el("button", { onclick: async () => { await deleteWorkflow(wf.id); render(); } }, "Delete");
    const row = el("div", { className: "item" }, el("span", {}, wf.name), el("div", {}, runBtn, delBtn));
    list.appendChild(row);
  }
}
render();

async function sendToActiveTab(msg: Message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, msg);
}

async function run(workflowId: string) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  await chrome.runtime.sendMessage({ kind: "PLAYER:RUN", workflowId, tabId } as Message);
}
