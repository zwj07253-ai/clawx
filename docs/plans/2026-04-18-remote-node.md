# Remote Node 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 ClawX Electron 客户端以 Remote Node 模式连接到云端 OpenClaw Gateway，接收并在本地执行任务（文件/浏览器/系统操作）。

**Architecture:** 新增 `gateway.mode = "remote"` 配置项。当为 remote 模式时，ClawX 不启动本地 Gateway 进程，而是通过 WebSocket 连接到云端 Gateway，完成节点注册、心跳保活、任务接收与结果回传。通信协议复用现有 JSON-RPC 2.0 over WebSocket 模式。

**Tech Stack:** TypeScript, Electron (Node.js main process), ws@8.19.0, electron-store, JSON-RPC 2.0

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/main/remote-node/client.ts` | WebSocket 连接管理、注册、心跳、重连 |
| `src/main/remote-node/executor.ts` | 任务执行器（文件/系统/浏览器） |
| `src/main/remote-node/types.ts` | 消息类型定义 |
| `src/main/remote-node/index.ts` | RemoteNodeManager 入口，对外暴露 start/stop |
| `src/main/index.ts` | 修改：根据 gateway.mode 决定启动本地 Gateway 还是 Remote Node |
| `src/renderer/settings/GatewaySettings.tsx` | 修改：新增 Remote Node 配置 UI（host/port/token） |

---

### Task 1: 类型定义

**Files:**
- Create: `src/main/remote-node/types.ts`

- [ ] **Step 1: 写类型文件**

```typescript
// src/main/remote-node/types.ts

export interface RemoteNodeConfig {
  gatewayHost: string;   // e.g. "120.24.116.82"
  gatewayPort: number;   // e.g. 18790
  gatewayToken: string;  // Bearer token
  nodeId?: string;       // 自动生成，持久化
  nodeName?: string;     // 显示名，默认 hostname
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

// Gateway → Node 任务请求
export interface TaskRequest {
  taskId: string;
  type: "file" | "shell" | "browser";
  payload: FileTaskPayload | ShellTaskPayload | BrowserTaskPayload;
}

export interface FileTaskPayload {
  op: "read" | "write" | "list" | "delete";
  path: string;
  content?: string;  // write 时使用
}

export interface ShellTaskPayload {
  command: string;
  cwd?: string;
  timeout?: number;  // ms，默认 30000
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
```

- [ ] **Step 2: 确认文件存在**

```bash
ls src/main/remote-node/types.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/main/remote-node/types.ts
git commit -m "feat: add remote node type definitions"
```

---

### Task 2: WebSocket 客户端（连接 + 注册 + 心跳 + 重连）

**Files:**
- Create: `src/main/remote-node/client.ts`

- [ ] **Step 1: 写 client.ts**

```typescript
// src/main/remote-node/client.ts
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
    if (!config.nodeId) {
      config.nodeId = crypto.randomUUID();
    }
    if (!config.nodeName) {
      config.nodeName = os.hostname();
    }
  }

  getStatus(): RemoteNodeStatus {
    return this.status;
  }

  getNodeId(): string {
    return this.config.nodeId!;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, "client stop");
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  // 发送任务结果回 Gateway
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
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Response to our request
    if ("result" in msg || ("error" in msg && "id" in msg)) {
      const res = msg as JsonRpcResponse;
      const pending = this.pendingRequests.get(res.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(res.id);
        if (res.error) {
          pending.reject(new Error(res.error.message));
        } else {
          pending.resolve(res.result);
        }
      }
      return;
    }

    // Notification from Gateway
    if ("method" in msg && !("id" in msg)) {
      if (msg.method === "node.task") {
        this.emit("task", msg.params as TaskRequest);
      }
      return;
    }

    // Request from Gateway (e.g. ping)
    if ("method" in msg && "id" in msg) {
      const req = msg as JsonRpcRequest;
      if (req.method === "ping") {
        this.sendResponse(req.id, { pong: true });
      }
    }
  }

  private onClose(code: number, reason: string): void {
    this.clearHeartbeat();
    this.ws = null;
    if (this.stopped) {
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("disconnected");
    this.emit("disconnected", { code, reason });
    this.scheduleReconnect();
  }

  private onError(err: Error): void {
    this.emit("error", err);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.setStatus("error");
      this.emit("maxReconnectReached");
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendNotification("node.heartbeat", { nodeId: this.config.nodeId });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    for (const { timer, reject } of this.pendingRequests.values()) {
      clearTimeout(timer);
      reject(new Error("client stopped"));
    }
    this.pendingRequests.clear();
  }

  private rpc(method: string, params?: unknown, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WebSocket not open"));
      }
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
    }
  }

  private sendResponse(id: string | number, result: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
    }
  }

  private setStatus(s: RemoteNodeStatus): void {
    if (this.status !== s) {
      this.status = s;
      this.emit("statusChanged", s);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/remote-node/client.ts
git commit -m "feat: add remote node WebSocket client with reconnect and heartbeat"
```

---

### Task 3: 任务执行器

**Files:**
- Create: `src/main/remote-node/executor.ts`

- [ ] **Step 1: 写 executor.ts**

```typescript
// src/main/remote-node/executor.ts
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { TaskRequest, TaskResult, FileTaskPayload, ShellTaskPayload } from "./types";

const execAsync = promisify(exec);

export async function executeTask(task: TaskRequest): Promise<TaskResult> {
  try {
    switch (task.type) {
      case "file":
        return await executeFileTask(task.taskId, task.payload as FileTaskPayload);
      case "shell":
        return await executeShellTask(task.taskId, task.payload as ShellTaskPayload);
      case "browser":
        return { taskId: task.taskId, success: false, error: "browser tasks not yet supported" };
      default:
        return { taskId: task.taskId, success: false, error: `unknown task type: ${(task as any).type}` };
    }
  } catch (err) {
    return {
      taskId: task.taskId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeFileTask(taskId: string, payload: FileTaskPayload): Promise<TaskResult> {
  const resolved = path.resolve(payload.path);

  switch (payload.op) {
    case "read": {
      const content = await fs.readFile(resolved, "utf-8");
      return { taskId, success: true, data: { content } };
    }
    case "write": {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, payload.content ?? "", "utf-8");
      return { taskId, success: true, data: { written: true } };
    }
    case "list": {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return {
        taskId,
        success: true,
        data: {
          entries: entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })),
        },
      };
    }
    case "delete": {
      await fs.rm(resolved, { recursive: true, force: true });
      return { taskId, success: true, data: { deleted: true } };
    }
    default:
      return { taskId, success: false, error: `unknown file op: ${(payload as any).op}` };
  }
}

async function executeShellTask(taskId: string, payload: ShellTaskPayload): Promise<TaskResult> {
  const timeout = payload.timeout ?? 30_000;
  const { stdout, stderr } = await execAsync(payload.command, {
    cwd: payload.cwd,
    timeout,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });
  return { taskId, success: true, data: { stdout, stderr } };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/remote-node/executor.ts
git commit -m "feat: add task executor for file and shell operations"
```

---

### Task 4: RemoteNodeManager 入口

**Files:**
- Create: `src/main/remote-node/index.ts`

- [ ] **Step 1: 写 index.ts**

```typescript
// src/main/remote-node/index.ts
import { EventEmitter } from "events";
import { RemoteNodeClient } from "./client";
import { executeTask } from "./executor";
import type { RemoteNodeConfig, RemoteNodeStatus, TaskRequest } from "./types";

export class RemoteNodeManager extends EventEmitter {
  private client: RemoteNodeClient;

  constructor(config: RemoteNodeConfig) {
    super();
    this.client = new RemoteNodeClient(config);

    this.client.on("statusChanged", (s: RemoteNodeStatus) => {
      this.emit("statusChanged", s);
    });

    this.client.on("connected", () => {
      this.emit("connected");
    });

    this.client.on("disconnected", (info: unknown) => {
      this.emit("disconnected", info);
    });

    this.client.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.client.on("task", async (task: TaskRequest) => {
      const result = await executeTask(task);
      this.client.sendTaskResult(result);
    });
  }

  start(): void {
    this.client.start();
  }

  stop(): void {
    this.client.stop();
  }

  getStatus(): RemoteNodeStatus {
    return this.client.getStatus();
  }

  getNodeId(): string {
    return this.client.getNodeId();
  }
}

export type { RemoteNodeConfig, RemoteNodeStatus } from "./types";
```

- [ ] **Step 2: Commit**

```bash
git add src/main/remote-node/index.ts
git commit -m "feat: add RemoteNodeManager orchestrating client and executor"
```

---

### Task 5: 集成到 Electron 主进程

**Files:**
- Modify: `src/main/index.ts`（或对应的 Electron main 入口）

> 注意：当前项目只有编译后的 `dist-electron/main/index.js`，没有 `src/` 源码目录。需要先确认项目是否有源码，或者直接修改 `dist-electron/main/index.js`。

- [ ] **Step 1: 找到 gateway.mode 判断点**

在 `dist-electron/main/index.js` 中搜索 `gateway.mode` 的使用位置（约第 2290、2416、2449 行），找到启动 Gateway 进程的逻辑。

- [ ] **Step 2: 在 gateway 启动逻辑前插入 remote 模式分支**

找到类似如下的代码段（约第 3228 行）：
```javascript
const gatewayArgs = ["gateway", "--port", String(port), "--token", appSettings.gatewayToken, "--allow-unconfigured"];
```

在其上方插入：
```javascript
// Remote Node 模式：不启动本地 Gateway，改为连接远端
if (appSettings.gatewayMode === "remote") {
  const { RemoteNodeManager } = require("./remote-node/index");
  const remoteNode = new RemoteNodeManager({
    gatewayHost: appSettings.gatewayHost,
    gatewayPort: appSettings.gatewayPort,
    gatewayToken: appSettings.gatewayToken,
  });
  remoteNode.start();
  // 注册 IPC 处理器
  electron.ipcMain.handle("remoteNode:status", () => remoteNode.getStatus());
  electron.ipcMain.handle("remoteNode:nodeId", () => remoteNode.getNodeId());
  return; // 不继续启动本地 Gateway
}
```

- [ ] **Step 3: 在 Settings Store 默认值中新增 gatewayMode 字段**

找到约第 508-512 行的默认配置：
```javascript
gatewayAutoStart: true,
gatewayPort: 18790,
gatewayHost: "127.0.0.1",
gatewayToken: "246645632f...",
```

新增：
```javascript
gatewayMode: "local",  // "local" | "remote"
```

- [ ] **Step 4: Commit**

```bash
git add dist-electron/main/index.js
git commit -m "feat: integrate remote node mode into electron main process"
```

---

### Task 6: 设置 UI — Remote Node 配置

**Files:**
- Modify: 找到 Settings 相关的 renderer 文件（在 `dist/assets/index-*.js` 中搜索 `gatewayHost` 或 `gatewayToken`）

- [ ] **Step 1: 找到 Gateway 设置 UI 组件**

```bash
grep -r "gatewayHost\|gatewayToken\|Gateway.*settings\|settings.*gateway" dist/assets/ | head -20
```

- [ ] **Step 2: 新增 Remote Node 模式切换 UI**

在 Gateway 设置区域新增：
```jsx
// 模式切换
<select value={gatewayMode} onChange={e => setSetting("gatewayMode", e.target.value)}>
  <option value="local">本地模式（启动本地 Gateway）</option>
  <option value="remote">远程节点模式（连接云端 Gateway）</option>
</select>

// 仅在 remote 模式下显示
{gatewayMode === "remote" && (
  <>
    <input label="Gateway 地址" value={gatewayHost} onChange={...} placeholder="120.24.116.82" />
    <input label="Gateway 端口" value={gatewayPort} onChange={...} placeholder="18790" />
    <input label="Gateway Token" value={gatewayToken} onChange={...} type="password" />
  </>
)}
```

- [ ] **Step 3: Commit**

```bash
git add dist/assets/
git commit -m "feat: add remote node mode toggle in gateway settings UI"
```

---

### Task 7: 验证连接

- [ ] **Step 1: 修改 settings，切换到 remote 模式**

通过 UI 或直接修改 `~/.openclaw/openclaw.json`：
```json
{
  "gateway": {
    "mode": "remote",
    "host": "120.24.116.82",
    "port": 18790,
    "token": "<your-token>"
  }
}
```

- [ ] **Step 2: 启动 ClawX，观察日志**

```bash
# 查看日志
tail -f ~/Library/Application\ Support/ClawX/logs/clawx-$(date +%Y-%m-%d).log
```

预期看到：
```
[INFO] RemoteNode connecting to ws://120.24.116.82:18790
[INFO] RemoteNode registered, nodeId=<uuid>
[INFO] RemoteNode status: connected
```

- [ ] **Step 3: 在 Gateway 管理界面确认节点已注册**

访问 Gateway 控制台，确认新节点出现在节点列表中。

- [ ] **Step 4: 发送测试任务，验证执行结果**

通过 Gateway 发送一个 shell 任务：
```json
{
  "type": "shell",
  "payload": { "command": "echo hello-from-remote-node" }
}
```

预期返回：
```json
{ "success": true, "data": { "stdout": "hello-from-remote-node\n", "stderr": "" } }
```

---

## 注意事项

1. **源码缺失问题**：当前项目只有编译后的 `dist-electron/main/index.js`（17302 行），没有 TypeScript 源码。Task 1-4 的 TypeScript 文件需要放在 `src/main/remote-node/` 并配置构建，或者直接将编译后的 JS 放在 `dist-electron/main/remote-node/`。
2. **安全**：Gateway Token 不要硬编码，通过 electron-store 持久化，UI 输入时用 `type="password"` 遮蔽。
3. **Shell 任务安全**：生产环境建议在 Gateway 侧限制允许执行的命令白名单。
