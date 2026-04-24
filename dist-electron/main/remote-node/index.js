"use strict";
const WebSocket = require("ws");
const { EventEmitter } = require("events");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const HEARTBEAT_INTERVAL_MS = 30000;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 60000;
const RECONNECT_MAX_ATTEMPTS = 20;

class RemoteNodeClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ws = null;
    this.status = "disconnected";
    this.heartbeatTimer = undefined;
    this.reconnectTimer = undefined;
    this.reconnectAttempts = 0;
    this.stopped = false;
    this.pendingRequests = new Map();
    this.msgIdCounter = 1;
    if (!config.nodeId) config.nodeId = crypto.randomUUID();
    if (!config.nodeName) config.nodeName = os.hostname();
  }

  getStatus() { return this.status; }
  getNodeId() { return this.config.nodeId; }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) { this.ws.close(1000, "client stop"); this.ws = null; }
    this.setStatus("disconnected");
  }

  sendTaskResult(result) {
    this.sendNotification("node.taskResult", result);
  }

  connect() {
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

  async onOpen() {
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
      this.ws && this.ws.close();
    }
  }

  onMessage(data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if ("result" in msg || ("error" in msg && "id" in msg)) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);
        msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
      }
      return;
    }

    if ("method" in msg && !("id" in msg)) {
      if (msg.method === "node.task") this.emit("task", msg.params);
      return;
    }

    if ("method" in msg && "id" in msg) {
      if (msg.method === "ping") this.sendResponse(msg.id, { pong: true });
    }
  }

  onClose(code, reason) {
    this.clearHeartbeat();
    this.ws = null;
    if (this.stopped) { this.setStatus("disconnected"); return; }
    this.setStatus("disconnected");
    this.emit("disconnected", { code, reason });
    this.scheduleReconnect();
  }

  onError(err) { this.emit("error", err); }

  scheduleReconnect() {
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

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN)
        this.sendNotification("node.heartbeat", { nodeId: this.config.nodeId });
    }, HEARTBEAT_INTERVAL_MS);
  }

  clearHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined; }
  }

  clearTimers() {
    this.clearHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    for (const { timer, reject } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new Error("client stopped"));
    }
    this.pendingRequests.clear();
  }

  rpc(method, params, timeoutMs = 10000) {
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

  sendNotification(method, params) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  sendResponse(id, result) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  setStatus(s) {
    if (this.status !== s) { this.status = s; this.emit("statusChanged", s); }
  }
}

async function executeTask(task) {
  try {
    switch (task.type) {
      case "file": return await executeFileTask(task.taskId, task.payload);
      case "shell": return await executeShellTask(task.taskId, task.payload);
      case "browser": return { taskId: task.taskId, success: false, error: "browser tasks not yet supported" };
      default: return { taskId: task.taskId, success: false, error: `unknown task type: ${task.type}` };
    }
  } catch (err) {
    return { taskId: task.taskId, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function executeFileTask(taskId, payload) {
  const resolved = path.resolve(payload.path);
  switch (payload.op) {
    case "read": {
      const content = await fs.readFile(resolved, "utf-8");
      return { taskId, success: true, data: { content } };
    }
    case "write": {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, payload.content || "", "utf-8");
      return { taskId, success: true, data: { written: true } };
    }
    case "list": {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return { taskId, success: true, data: { entries: entries.map(e => ({ name: e.name, isDir: e.isDirectory() })) } };
    }
    case "delete": {
      await fs.rm(resolved, { recursive: true, force: true });
      return { taskId, success: true, data: { deleted: true } };
    }
    default: return { taskId, success: false, error: `unknown file op: ${payload.op}` };
  }
}

async function executeShellTask(taskId, payload) {
  const { stdout, stderr } = await execAsync(payload.command, {
    cwd: payload.cwd,
    timeout: payload.timeout || 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { taskId, success: true, data: { stdout, stderr } };
}

class RemoteNodeManager extends EventEmitter {
  constructor(config) {
    super();
    this.client = new RemoteNodeClient(config);
    this.client.on("statusChanged", s => this.emit("statusChanged", s));
    this.client.on("connected", () => this.emit("connected"));
    this.client.on("disconnected", info => this.emit("disconnected", info));
    this.client.on("error", err => this.emit("error", err));
    this.client.on("task", async task => {
      const result = await executeTask(task);
      this.client.sendTaskResult(result);
    });
  }

  start() { this.client.start(); }
  stop() { this.client.stop(); }
  getStatus() { return this.client.getStatus(); }
  getNodeId() { return this.client.getNodeId(); }
}

module.exports = { RemoteNodeManager };
