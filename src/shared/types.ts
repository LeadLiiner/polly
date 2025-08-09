export type Locator = {
  strategy: "css" | "xpath" | "id" | "name" | "text";
  value: string;
};

export type Step =
  | { t: number; type: "click"; loc: Locator }
  | { t: number; type: "input"; loc: Locator; name?: string; value: string | { var: string } }
  | { t: number; type: "keydown"; key: string }
  | { t: number; type: "waitFor"; ms: number };

export type Workflow = {
  id: string;
  name: string;
  url?: string;
  steps: Step[];
  variables?: string[];
};

export type Message =
  | { kind: "RECORDER:STEP"; step: Step }
  | { kind: "RECORDER:STOP" }
  | { kind: "RECORDER:START"; workflowName: string }
  | { kind: "PLAYER:RUN"; workflowId: string; tabId?: number; variables?: Record<string, string> }
  | { kind: "GET:WORKFLOWS" }
  | { kind: "SET:WORKFLOW"; workflow: Workflow }
  | { kind: "DELETE:WORKFLOW"; id: string }
  | { kind: "GET:PENDING_STEPS"; tabId?: number };
