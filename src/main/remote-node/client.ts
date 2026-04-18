import WebSocket from "ws";
import { EventEmitter } from "events";
import * as os from "os";
import * as crypto from "crypto";
import type {
  RemoteNodeConfig,
  RemoteNodeStatus,
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  TaskRequest,
  TaskResult,
} from "./types";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_MAX_ATTEMPTS = 20;

export class RemoteNodeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private status: RemoteNodeStatus = "disconnected";
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private stopped = false;
  private pendingRequests = new Map<
    string | number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private msgIdCounter = 1;

  constructor(private config: RemoteNodeConfig) {
    super();
    if (!config.nodeId) config.nodeId = crypto.randomUUID();
    if (!config.nodeName) config.nodeName = os.hostname();
  }

  getStatus(): RemoteNodeStatus { return this.status; }
  getNodeId(): string { return this.config.nodeId!; }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) { this.ws.close(1000, "client stop"); this.ws = null; }
    this.setStatus("disconnected");
  }

  sendTaskResult(result: TaskResult): void {
    this.sendNotification("node.taskResult", result);
  }

  private connect(): void {
    if (this.stopped) return;
    this.setStatus("connecting");
    const url = `ws://${this.config.gatewayHost}:${this.config.gatewayPort}`;
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.config.gatewayToken}` },
    });
    this.ws = ws;
    ws.on("open", () => this.onOpen());
    ws.on("message", (data) => this.onMessage(data));
    ws.on("close", (code, reason) => this.onClose(code, reason.toString()));
    ws.on("error", (err) => this.onError(err));
  }

  private async onOpen(): Promise<void> {
    this.reconnectAttempts = 0;
    this.setStatus("registering");
    try {
      await this.rpc("node.register", {
        nodeId: this.config.nodeId,
        nodeName: this.config.nodeName,
        platform: process.platform,
        capabilities: ["file", "shell"],
      });
      this.setStatus("connected");
      this.startHeartbeat();
      this.emit("connected");
    } catch (err) {
      this.emit("error", err);
      this.ws?.close();
    }
  }

  private onMessage(data: WebSocket.RawData): void {
    let msg: JsonRpcMessage;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if ("result" in msg || ("error" in msg && "id" in msg)) {
      const res = msg as JsonRpcResponse;
      const pending = this.pendingRequests.get(res.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(res.id);
        res.error ? pending.reject(new Error(res.error.message)) : pending.resolve(res.result);
      }
      return;
    }

    if ("method" in msg && !("id" in msg)) {
      if (msg.method === "node.task") this.emit("task", msg.params as TaskRequest);
      return;
    }

    if ("method" in msg && "id" in msg) {
      const req = msg as JsonRpcRequest;
      if (req.method === "ping") this.sendResponse(req.id, { pong: true });
    }
  }

  private onClose(code: number, reason: string): void {
    this.clearHeartbeat();
    this.ws = null;
    if (this.stopped) { this.setStatus("disconnected"); return; }
    this.setStatus("disconnected");
    this.emit("disconnected", { code, reason });
    this.scheduleReconnect();
  }

  private onError(err: Error): void { this.emit("error", err); }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.setStatus("error");
      this.emit("maxReconnectReached");
      return;
    }
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts), RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.sendNotification("node.heartbeat", { nodeId: this.config.nodeId });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined; }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    for (const { timer, reject } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new Error("client stopped"));
    }
    this.pendingRequests.clear();
  }

  private rpc(method: string, params?: unknown, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
        return reject(new Error("WebSocket not open"));
      const id = this.msgIdCounter++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  private sendResponse(id: string | number, result: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  private setStatus(s: RemoteNodeStatus): void {
    if (this.status !== s) { this.status = s; this.emit("statusChanged", s); }
  }
}
