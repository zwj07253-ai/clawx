// src/main/remote-node/types.ts

export interface RemoteNodeConfig {
  gatewayHost: string;
  gatewayPort: number;
  gatewayToken: string;
  nodeId?: string;
  nodeName?: string;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface TaskRequest {
  taskId: string;
  type: "file" | "shell" | "browser";
  payload: FileTaskPayload | ShellTaskPayload | BrowserTaskPayload;
}

export interface FileTaskPayload {
  op: "read" | "write" | "list" | "delete";
  path: string;
  content?: string;
}

export interface ShellTaskPayload {
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface BrowserTaskPayload {
  url: string;
  action: "navigate" | "screenshot" | "click" | "type";
  selector?: string;
  text?: string;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type RemoteNodeStatus =
  | "disconnected"
  | "connecting"
  | "registering"
  | "connected"
  | "error";
