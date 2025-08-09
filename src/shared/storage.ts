import type { Workflow } from "./types";

const KEY = "workflows";

export async function listWorkflows(): Promise<Workflow[]> {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] as Workflow[]) || [];
}

export async function saveWorkflow(wf: Workflow): Promise<void> {
  const all = await listWorkflows();
  const idx = all.findIndex(w => w.id === wf.id);
  if (idx >= 0) all[idx] = wf; else all.push(wf);
  await chrome.storage.local.set({ [KEY]: all });
}

export async function deleteWorkflow(id: string): Promise<void> {
  const all = await listWorkflows();
  const next = all.filter(w => w.id !== id);
  await chrome.storage.local.set({ [KEY]: next });
}

export function uid(prefix = "wf"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
