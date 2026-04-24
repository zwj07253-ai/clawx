"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const events = require("events");
const WebSocket = require("ws");
const fs = require("fs");
const promises = require("fs/promises");
const crypto$1 = require("crypto");
const os = require("os");
const https = require("https");
const require$$0 = require("child_process");
const node_fs = require("node:fs");
const node_os = require("node:os");
const node_path = require("node:path");
const crypto$2 = require("node:crypto");
const node_child_process = require("node:child_process");
const module$1 = require("module");
const zlib = require("zlib");
const node_http = require("node:http");
const promises$1 = require("node:fs/promises");
const electronUpdater = require("electron-updater");
const node_readline = require("node:readline");
const node_async_hooks = require("node:async_hooks");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const PORTS = {
  /** ClawX GUI development server port */
  CLAWX_DEV: 5173,
  /** ClawX GUI production port (for reference) */
  CLAWX_GUI: 23333,
  /** Local host API server port */
  CLAWX_HOST_API: 3210,
  /** OpenClaw Gateway port */
  OPENCLAW_GATEWAY: 18790
};
var GatewayEventType = /* @__PURE__ */ ((GatewayEventType2) => {
  GatewayEventType2["STATUS_CHANGED"] = "gateway.status_changed";
  GatewayEventType2["CHANNEL_STATUS_CHANGED"] = "channel.status_changed";
  GatewayEventType2["MESSAGE_RECEIVED"] = "chat.message_received";
  GatewayEventType2["MESSAGE_SENT"] = "chat.message_sent";
  GatewayEventType2["TOOL_CALL_STARTED"] = "tool.call_started";
  GatewayEventType2["TOOL_CALL_COMPLETED"] = "tool.call_completed";
  GatewayEventType2["ERROR"] = "error";
  return GatewayEventType2;
})(GatewayEventType || {});
function isResponse(message) {
  return typeof message === "object" && message !== null && "jsonrpc" in message && message.jsonrpc === "2.0" && "id" in message && ("result" in message || "error" in message);
}
function isNotification(message) {
  return typeof message === "object" && message !== null && "jsonrpc" in message && message.jsonrpc === "2.0" && "method" in message && !("id" in message);
}
let currentLevel = 0;
let logFilePath = null;
let logDir = null;
const RING_BUFFER_SIZE = 500;
const recentLogs = [];
let writeBuffer = [];
let flushTimer = null;
let flushing = false;
const FLUSH_INTERVAL_MS = 500;
const FLUSH_SIZE_THRESHOLD = 20;
async function flushBuffer() {
  if (flushing || writeBuffer.length === 0 || !logFilePath) return;
  flushing = true;
  const batch = writeBuffer.join("");
  writeBuffer = [];
  try {
    await promises.appendFile(logFilePath, batch);
  } catch {
  } finally {
    flushing = false;
  }
}
function flushBufferSync() {
  if (writeBuffer.length === 0 || !logFilePath) return;
  try {
    fs.appendFileSync(logFilePath, writeBuffer.join(""));
  } catch {
  }
  writeBuffer = [];
}
process.on("exit", flushBufferSync);
function initLogger() {
  try {
    if (electron.app.isPackaged && currentLevel < 1) {
      currentLevel = 1;
    }
    logDir = path.join(electron.app.getPath("userData"), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    logFilePath = path.join(logDir, `clawx-${timestamp}.log`);
    const sessionHeader = `
${"=".repeat(80)}
[${(/* @__PURE__ */ new Date()).toISOString()}] === ClawX Session Start (v${electron.app.getVersion()}) ===
${"=".repeat(80)}
`;
    fs.appendFileSync(logFilePath, sessionHeader);
  } catch (error2) {
    console.error("Failed to initialize logger:", error2);
  }
}
function setLogLevel(level) {
  currentLevel = level;
}
function getLogDir() {
  return logDir;
}
function getLogFilePath() {
  return logFilePath;
}
function formatMessage(level, message, ...args) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const formattedArgs = args.length > 0 ? " " + args.map((arg) => {
    if (arg instanceof Error) {
      return `${arg.message}
${arg.stack || ""}`;
    }
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(" ") : "";
  return `[${timestamp}] [${level.padEnd(5)}] ${message}${formattedArgs}`;
}
function writeLog(formatted) {
  recentLogs.push(formatted);
  if (recentLogs.length > RING_BUFFER_SIZE) {
    recentLogs.shift();
  }
  if (logFilePath) {
    writeBuffer.push(formatted + "\n");
    if (writeBuffer.length >= FLUSH_SIZE_THRESHOLD) {
      void flushBuffer();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushBuffer();
      }, FLUSH_INTERVAL_MS);
    }
  }
}
function debug(message, ...args) {
  if (currentLevel <= 0) {
    const formatted = formatMessage("DEBUG", message, ...args);
    console.debug(formatted);
    writeLog(formatted);
  }
}
function info(message, ...args) {
  if (currentLevel <= 1) {
    const formatted = formatMessage("INFO", message, ...args);
    console.info(formatted);
    writeLog(formatted);
  }
}
function warn(message, ...args) {
  if (currentLevel <= 2) {
    const formatted = formatMessage("WARN", message, ...args);
    console.warn(formatted);
    writeLog(formatted);
  }
}
function error(message, ...args) {
  if (currentLevel <= 3) {
    const formatted = formatMessage("ERROR", message, ...args);
    console.error(formatted);
    writeLog(formatted);
  }
}
function getRecentLogs(count, minLevel) {
  const filtered = minLevel != null ? recentLogs.filter((line) => {
    if (minLevel <= 0) return true;
    if (minLevel === 1) return !line.includes("] [DEBUG");
    if (minLevel === 2) return line.includes("] [WARN") || line.includes("] [ERROR");
    return line.includes("] [ERROR");
  }) : recentLogs;
  return count ? filtered.slice(-count) : [...filtered];
}
async function readLogFile(tailLines = 200) {
  if (!logFilePath) return "(No log file found)";
  try {
    const content = await promises.readFile(logFilePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length <= tailLines) return content;
    return lines.slice(-tailLines).join("\n");
  } catch (err) {
    return `(Failed to read log file: ${err})`;
  }
}
async function listLogFiles() {
  if (!logDir) return [];
  try {
    const files = await promises.readdir(logDir);
    const results = [];
    for (const f of files) {
      if (!f.endsWith(".log")) continue;
      const fullPath = path.join(logDir, f);
      const s = await promises.stat(fullPath);
      results.push({
        name: f,
        path: fullPath,
        size: s.size,
        modified: s.mtime.toISOString()
      });
    }
    return results.sort((a, b) => b.modified.localeCompare(a.modified));
  } catch {
    return [];
  }
}
const logger = {
  debug,
  info,
  warn,
  error,
  setLevel: setLogLevel,
  init: initLogger,
  getLogDir,
  getLogFilePath,
  getRecentLogs,
  readLogFile,
  listLogFiles
};
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
function base64UrlEncode(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function derivePublicKeyRaw(publicKeyPem) {
  const spki = crypto$1.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}
function fingerprintPublicKey(publicKeyPem) {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto$1.createHash("sha256").update(raw).digest("hex");
}
async function fileExists$5(p) {
  try {
    await promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function generateIdentity() {
  const { publicKey, privateKey } = await new Promise(
    (resolve, reject) => {
      crypto$1.generateKeyPair("ed25519", (err, publicKey2, privateKey2) => {
        if (err) reject(err);
        else resolve({ publicKey: publicKey2, privateKey: privateKey2 });
      });
    }
  );
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem
  };
}
async function loadOrCreateDeviceIdentity(filePath) {
  try {
    if (await fileExists$5(filePath)) {
      const raw = await promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && typeof parsed.deviceId === "string" && typeof parsed.publicKeyPem === "string" && typeof parsed.privateKeyPem === "string") {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        if (derivedId && derivedId !== parsed.deviceId) {
          const updated = { ...parsed, deviceId: derivedId };
          await promises.writeFile(filePath, `${JSON.stringify(updated, null, 2)}
`, { mode: 384 });
          return { deviceId: derivedId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem };
        }
        return { deviceId: parsed.deviceId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem };
      }
    }
  } catch {
  }
  const identity = await generateIdentity();
  const dir = path.dirname(filePath);
  if (!await fileExists$5(dir)) await promises.mkdir(dir, { recursive: true });
  const stored = { version: 1, ...identity, createdAtMs: Date.now() };
  await promises.writeFile(filePath, `${JSON.stringify(stored, null, 2)}
`, { mode: 384 });
  try {
    await promises.chmod(filePath, 384);
  } catch {
  }
  return identity;
}
function signDevicePayload(privateKeyPem, payload) {
  const key = crypto$1.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto$1.sign(null, Buffer.from(payload, "utf8"), key));
}
function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}
function buildDeviceAuthPayload(params) {
  const version2 = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version2,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token
  ];
  if (version2 === "v2") base.push(params.nonce ?? "");
  return base.join("|");
}
const DEFAULT_RECONNECT_CONFIG = {
  maxAttempts: 10,
  baseDelay: 1e3,
  maxDelay: 3e4
};
function nextLifecycleEpoch(currentEpoch) {
  return currentEpoch + 1;
}
function isLifecycleSuperseded(expectedEpoch, currentEpoch) {
  return expectedEpoch !== currentEpoch;
}
function getReconnectSkipReason(context) {
  if (!context.shouldReconnect) {
    return "auto-reconnect disabled";
  }
  if (isLifecycleSuperseded(context.scheduledEpoch, context.currentEpoch)) {
    return `stale reconnect callback (scheduledEpoch=${context.scheduledEpoch}, currentEpoch=${context.currentEpoch})`;
  }
  return null;
}
function getReconnectScheduleDecision(context) {
  if (!context.shouldReconnect) {
    return { action: "skip", reason: "auto-reconnect disabled" };
  }
  if (context.hasReconnectTimer) {
    return { action: "already-scheduled" };
  }
  if (context.reconnectAttempts >= context.maxAttempts) {
    return {
      action: "fail",
      attempts: context.reconnectAttempts,
      maxAttempts: context.maxAttempts
    };
  }
  const delay = Math.min(
    context.baseDelay * Math.pow(2, context.reconnectAttempts),
    context.maxDelay
  );
  return {
    action: "schedule",
    nextAttempt: context.reconnectAttempts + 1,
    maxAttempts: context.maxAttempts,
    delay
  };
}
function shouldDeferRestart(context) {
  return context.startLock || context.state === "starting" || context.state === "reconnecting";
}
function getDeferredRestartAction(context) {
  if (!context.hasPendingRestart) return "none";
  if (shouldDeferRestart(context)) return "wait";
  if (!context.shouldReconnect) return "drop";
  return "execute";
}
function clearPendingGatewayRequests(pendingRequests, error2) {
  for (const [, request] of pendingRequests) {
    clearTimeout(request.timeout);
    request.reject(error2);
  }
  pendingRequests.clear();
}
function resolvePendingGatewayRequest(pendingRequests, id, value) {
  const request = pendingRequests.get(id);
  if (!request) return false;
  clearTimeout(request.timeout);
  pendingRequests.delete(id);
  request.resolve(value);
  return true;
}
function rejectPendingGatewayRequest(pendingRequests, id, error2) {
  const request = pendingRequests.get(id);
  if (!request) return false;
  clearTimeout(request.timeout);
  pendingRequests.delete(id);
  request.reject(error2);
  return true;
}
function dispatchProtocolEvent(emitter, event, payload) {
  switch (event) {
    case "tick":
      break;
    case "chat":
      emitter.emit("chat:message", { message: payload });
      break;
    case "agent": {
      const p = payload;
      const data = p.data && typeof p.data === "object" ? p.data : {};
      const chatEvent = {
        ...data,
        runId: p.runId ?? data.runId,
        sessionKey: p.sessionKey ?? data.sessionKey,
        state: p.state ?? data.state,
        message: p.message ?? data.message
      };
      if (chatEvent.state || chatEvent.message) {
        emitter.emit("chat:message", { message: chatEvent });
      }
      emitter.emit("notification", { method: event, params: payload });
      break;
    }
    case "channel.status":
      emitter.emit("channel:status", payload);
      break;
    default:
      emitter.emit("notification", { method: event, params: payload });
  }
}
function dispatchJsonRpcNotification(emitter, notification) {
  emitter.emit("notification", notification);
  switch (notification.method) {
    case GatewayEventType.CHANNEL_STATUS_CHANGED:
      emitter.emit("channel:status", notification.params);
      break;
    case GatewayEventType.MESSAGE_RECEIVED:
      emitter.emit("chat:message", notification.params);
      break;
    case GatewayEventType.ERROR: {
      const errorData = notification.params;
      emitter.emit("error", new Error(errorData.message || "Gateway error"));
      break;
    }
    default:
      logger.debug(`Unknown Gateway notification: ${notification.method}`);
  }
}
class GatewayStateController {
  constructor(hooks) {
    this.hooks = hooks;
  }
  status = { state: "stopped", port: PORTS.OPENCLAW_GATEWAY };
  getStatus() {
    return { ...this.status };
  }
  isConnected(isSocketOpen) {
    return this.status.state === "running" && isSocketOpen;
  }
  setStatus(update) {
    const previousState = this.status.state;
    this.status = { ...this.status, ...update };
    if (this.status.state === "running" && this.status.connectedAt) {
      this.status.uptime = Date.now() - this.status.connectedAt;
    }
    this.hooks.emitStatus(this.status);
    if (previousState !== this.status.state) {
      logger.debug(`Gateway state changed: ${previousState} -> ${this.status.state}`);
      this.hooks.onTransition?.(previousState, this.status.state);
    }
  }
}
let settingsStoreInstance = null;
function generateToken() {
  return `clawx-${crypto$1.randomBytes(16).toString("hex")}`;
}
const defaults = {
  // General
  theme: "system",
  language: "en",
  startMinimized: false,
  launchAtStartup: false,
  telemetryEnabled: true,
  machineId: "",
  hasReportedInstall: false,
  enterpriseEnabled: true,
  enterpriseBackendUrl: process.env.CLAWX_ENTERPRISE_BACKEND_URL || "http://8.135.70.130:8026",
  enterpriseAuthToken: "",
  enterprisePhone: "",
  enterpriseEmployeeName: "",
  enterpriseDeviceId: "",
  enterpriseLastUsageSyncAt: "",
  enterpriseLastSyncVersion: 0,
  // Gateway
  gatewayMode: "local",
  gatewayAutoStart: true,
  gatewayPort: 18790,
  gatewayHost: "127.0.0.1",
  gatewayToken: "246645632f2415636ec9d359098c866b1aa172bef5a499d5",
  proxyEnabled: false,
  proxyServer: "",
  proxyHttpServer: "",
  proxyHttpsServer: "",
  proxyAllServer: "",
  proxyBypassRules: "<local>;localhost;127.0.0.1;::1",
  // Update
  updateChannel: "stable",
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  skippedVersions: [],
  // UI State
  sidebarCollapsed: false,
  devModeUnlocked: false,
  // Presets
  selectedBundles: ["productivity", "developer"],
  enabledSkills: [],
  disabledSkills: []
};
async function getSettingsStore() {
  if (!settingsStoreInstance) {
    const Store = (await import("electron-store")).default;
    settingsStoreInstance = new Store({
      name: "settings",
      defaults
    });
    settingsStoreInstance.set("gatewayHost", "127.0.0.1");
    settingsStoreInstance.set("gatewayPort", 18790);
    settingsStoreInstance.set("gatewayToken", "246645632f2415636ec9d359098c866b1aa172bef5a499d5");
    settingsStoreInstance.set("gatewayAutoStart", true);
  }
  return settingsStoreInstance;
}
async function getSetting(key) {
  const store2 = await getSettingsStore();
  return store2.get(key);
}
async function setSetting(key, value) {
  const store2 = await getSettingsStore();
  store2.set(key, value);
}
async function getAllSettings() {
  const store2 = await getSettingsStore();
  return store2.store;
}
async function resetSettings() {
  const store2 = await getSettingsStore();
  store2.clear();
}
async function exportSettings() {
  const store2 = await getSettingsStore();
  return JSON.stringify(store2.store, null, 2);
}
async function importSettings(json) {
  try {
    const settings = JSON.parse(json);
    const store2 = await getSettingsStore();
    store2.set(settings);
  } catch {
    throw new Error("Invalid settings JSON");
  }
}
const store = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  exportSettings,
  getAllSettings,
  getSetting,
  importSettings,
  resetSettings,
  setSetting
}, Symbol.toStringTag, { value: "Module" }));
const PROVIDER_DEFINITIONS = [
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "🤖",
    placeholder: "sk-ant-api03-...",
    model: "Claude",
    requiresApiKey: true,
    category: "official",
    envVar: "ANTHROPIC_API_KEY",
    defaultModelId: "claude-opus-4-6",
    supportedAuthModes: ["api_key"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "💚",
    placeholder: "sk-proj-...",
    model: "GPT",
    requiresApiKey: true,
    category: "official",
    envVar: "OPENAI_API_KEY",
    defaultModelId: "gpt-5.2",
    isOAuth: true,
    supportsApiKey: true,
    supportedAuthModes: ["api_key", "oauth_browser"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://api.openai.com/v1",
      api: "openai-responses",
      apiKeyEnv: "OPENAI_API_KEY"
    }
  },
  {
    id: "google",
    name: "Google",
    icon: "🔷",
    placeholder: "AIza...",
    model: "Gemini",
    requiresApiKey: true,
    category: "official",
    envVar: "GEMINI_API_KEY",
    defaultModelId: "gemini-3.1-pro-preview",
    isOAuth: true,
    supportsApiKey: true,
    supportedAuthModes: ["api_key", "oauth_browser"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "🌐",
    placeholder: "sk-or-v1-...",
    model: "Multi-Model",
    requiresApiKey: true,
    showModelId: true,
    modelIdPlaceholder: "anthropic/claude-opus-4.6",
    defaultModelId: "anthropic/claude-opus-4.6",
    category: "compatible",
    envVar: "OPENROUTER_API_KEY",
    supportedAuthModes: ["api_key"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://openrouter.ai/api/v1",
      api: "openai-completions",
      apiKeyEnv: "OPENROUTER_API_KEY",
      headers: {
        "HTTP-Referer": "https://claw-x.com",
        "X-Title": "YUEWEI集团"
      }
    }
  },
  {
    id: "ark",
    name: "ByteDance Ark",
    icon: "A",
    placeholder: "your-ark-api-key",
    model: "Doubao",
    requiresApiKey: true,
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    showBaseUrl: true,
    showModelId: true,
    modelIdPlaceholder: "ep-20260228000000-xxxxx",
    category: "official",
    envVar: "ARK_API_KEY",
    supportedAuthModes: ["api_key"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      api: "openai-completions",
      apiKeyEnv: "ARK_API_KEY"
    }
  },
  {
    id: "moonshot",
    name: "Moonshot (CN)",
    icon: "🌙",
    placeholder: "sk-...",
    model: "Kimi",
    requiresApiKey: true,
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModelId: "kimi-k2.5",
    category: "official",
    envVar: "MOONSHOT_API_KEY",
    supportedAuthModes: ["api_key"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://api.moonshot.cn/v1",
      api: "openai-completions",
      apiKeyEnv: "MOONSHOT_API_KEY",
      models: [
        {
          id: "kimi-k2.5",
          name: "Kimi K2.5",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 256e3,
          maxTokens: 8192
        }
      ]
    }
  },
  {
    id: "siliconflow",
    name: "SiliconFlow (CN)",
    icon: "🌊",
    placeholder: "sk-...",
    model: "Multi-Model",
    requiresApiKey: true,
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    showModelId: true,
    showModelIdInDevModeOnly: true,
    modelIdPlaceholder: "deepseek-ai/DeepSeek-V3",
    defaultModelId: "deepseek-ai/DeepSeek-V3",
    category: "compatible",
    envVar: "SILICONFLOW_API_KEY",
    supportedAuthModes: ["api_key"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://api.siliconflow.cn/v1",
      api: "openai-completions",
      apiKeyEnv: "SILICONFLOW_API_KEY"
    }
  },
  {
    id: "minimax-portal",
    name: "MiniMax (Global)",
    icon: "☁️",
    placeholder: "sk-...",
    model: "MiniMax",
    requiresApiKey: false,
    isOAuth: true,
    supportsApiKey: true,
    defaultModelId: "MiniMax-M2.5",
    apiKeyUrl: "https://intl.minimaxi.com/",
    category: "official",
    envVar: "MINIMAX_API_KEY",
    supportedAuthModes: ["oauth_device", "api_key"],
    defaultAuthMode: "oauth_device",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://api.minimax.io/anthropic",
      api: "anthropic-messages",
      apiKeyEnv: "MINIMAX_API_KEY"
    }
  },
  {
    id: "minimax-portal-cn",
    name: "MiniMax (CN)",
    icon: "☁️",
    placeholder: "sk-...",
    model: "MiniMax",
    requiresApiKey: false,
    isOAuth: true,
    supportsApiKey: true,
    defaultModelId: "MiniMax-M2.5",
    apiKeyUrl: "https://platform.minimaxi.com/",
    category: "official",
    envVar: "MINIMAX_CN_API_KEY",
    supportedAuthModes: ["oauth_device", "api_key"],
    defaultAuthMode: "oauth_device",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://api.minimaxi.com/anthropic",
      api: "anthropic-messages",
      apiKeyEnv: "MINIMAX_CN_API_KEY"
    }
  },
  {
    id: "qwen-portal",
    name: "Qwen",
    icon: "☁️",
    placeholder: "sk-...",
    model: "Qwen",
    requiresApiKey: false,
    isOAuth: true,
    defaultModelId: "coder-model",
    category: "official",
    envVar: "QWEN_API_KEY",
    supportedAuthModes: ["oauth_device"],
    defaultAuthMode: "oauth_device",
    supportsMultipleAccounts: true,
    providerConfig: {
      baseUrl: "https://portal.qwen.ai/v1",
      api: "openai-completions",
      apiKeyEnv: "QWEN_API_KEY"
    }
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: "🦙",
    placeholder: "Not required",
    requiresApiKey: false,
    defaultBaseUrl: "http://localhost:11434/v1",
    showBaseUrl: true,
    showModelId: true,
    modelIdPlaceholder: "qwen3:latest",
    category: "local",
    supportedAuthModes: ["local"],
    defaultAuthMode: "local",
    supportsMultipleAccounts: true
  },
  {
    id: "custom",
    name: "Custom",
    icon: "⚙️",
    placeholder: "API key...",
    requiresApiKey: true,
    showBaseUrl: true,
    showModelId: true,
    modelIdPlaceholder: "your-provider/model-id",
    category: "custom",
    envVar: "CUSTOM_API_KEY",
    supportedAuthModes: ["api_key"],
    defaultAuthMode: "api_key",
    supportsMultipleAccounts: true
  }
];
const PROVIDER_DEFINITION_MAP = new Map(
  PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition])
);
function getProviderDefinition(type) {
  return PROVIDER_DEFINITION_MAP.get(type);
}
function getProviderEnvVar$1(type) {
  return getProviderDefinition(type)?.envVar;
}
function getProviderDefaultModel$1(type) {
  return getProviderDefinition(type)?.defaultModelId;
}
function getProviderBackendConfig(type) {
  return getProviderDefinition(type)?.providerConfig;
}
function getKeyableProviderTypes$1() {
  return PROVIDER_DEFINITIONS.filter((definition) => definition.envVar).map(
    (definition) => definition.id
  );
}
const EXTRA_ENV_ONLY_PROVIDERS = {
  groq: { envVar: "GROQ_API_KEY" },
  deepgram: { envVar: "DEEPGRAM_API_KEY" },
  cerebras: { envVar: "CEREBRAS_API_KEY" },
  xai: { envVar: "XAI_API_KEY" },
  mistral: { envVar: "MISTRAL_API_KEY" }
};
function getProviderEnvVar(type) {
  return getProviderEnvVar$1(type) ?? EXTRA_ENV_ONLY_PROVIDERS[type]?.envVar;
}
function getProviderDefaultModel(type) {
  return getProviderDefaultModel$1(type);
}
function getProviderConfig(type) {
  return getProviderBackendConfig(type);
}
function getKeyableProviderTypes() {
  return [...getKeyableProviderTypes$1(), ...Object.keys(EXTRA_ENV_ONLY_PROVIDERS)];
}
function quoteForCmd(value) {
  if (process.platform !== "win32") return value;
  if (!value.includes(" ")) return value;
  if (value.startsWith('"') && value.endsWith('"')) return value;
  return `"${value}"`;
}
function needsWinShell(bin) {
  if (process.platform !== "win32") return false;
  return !path.win32.isAbsolute(bin);
}
function normalizeNodeRequirePathForNodeOptions(modulePath) {
  if (process.platform !== "win32") return modulePath;
  return modulePath.replace(/\\/g, "/");
}
function appendNodeRequireToNodeOptions(nodeOptions, modulePath) {
  const normalized = normalizeNodeRequirePathForNodeOptions(modulePath);
  return `${nodeOptions ?? ""} --require "${normalized}"`.trim();
}
function expandPath(path2) {
  if (path2.startsWith("~")) {
    return path2.replace("~", os.homedir());
  }
  return path2;
}
function getOpenClawConfigDir() {
  return path.join(os.homedir(), ".openclaw");
}
function getOpenClawSkillsDir() {
  return path.join(getOpenClawConfigDir(), "skills");
}
function getClawXConfigDir() {
  return path.join(os.homedir(), ".clawx");
}
function ensureDir$3(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function getResourcesDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  return path.join(__dirname, "../../resources");
}
function getOpenClawDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "openclaw");
  }
  return path.join(__dirname, "../../node_modules/openclaw");
}
function getOpenClawResolvedDir() {
  const dir = getOpenClawDir();
  if (!fs.existsSync(dir)) {
    return dir;
  }
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}
function getOpenClawEntryPath() {
  return path.join(getOpenClawDir(), "openclaw.mjs");
}
function getClawHubCliEntryPath() {
  return path.join(electron.app.getAppPath(), "node_modules", "clawhub", "bin", "clawdhub.js");
}
function getClawHubCliBinPath() {
  const binName = process.platform === "win32" ? "clawhub.cmd" : "clawhub";
  return path.join(electron.app.getAppPath(), "node_modules", ".bin", binName);
}
function isOpenClawPresent() {
  const dir = getOpenClawDir();
  const pkgJsonPath = path.join(dir, "package.json");
  return fs.existsSync(dir) && fs.existsSync(pkgJsonPath);
}
function isOpenClawBuilt() {
  const dir = getOpenClawDir();
  const distDir = path.join(dir, "dist");
  const hasDist = fs.existsSync(distDir);
  return hasDist;
}
function getOpenClawStatus() {
  const dir = getOpenClawDir();
  let version2;
  try {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      version2 = pkg.version;
    }
  } catch {
  }
  const status = {
    packageExists: isOpenClawPresent(),
    isBuilt: isOpenClawBuilt(),
    entryPath: getOpenClawEntryPath(),
    dir,
    version: version2
  };
  logger.info("OpenClaw status:", status);
  return status;
}
async function proxyAwareFetch(input, init) {
  if (process.versions.electron) {
    try {
      const { net } = await import("electron");
      return await net.fetch(input, init);
    } catch {
    }
  }
  return await fetch(input, init);
}
const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");
const CONFIG_FILE = path.join(OPENCLAW_DIR, "openclaw.json");
const CONFIG_FILE_BACKUP = `${CONFIG_FILE}.bak`;
const WECOM_PLUGIN_ID = "wecom-openclaw-plugin";
const FEISHU_PLUGIN_ID = "feishu-openclaw-plugin";
const DEFAULT_ACCOUNT_ID$1 = "default";
const CHANNEL_TOP_LEVEL_KEYS_TO_KEEP = /* @__PURE__ */ new Set(["accounts", "defaultAccount", "enabled"]);
const PLUGIN_CHANNELS = ["whatsapp"];
async function fileExists$4(p) {
  try {
    await promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function ensureConfigDir() {
  if (!await fileExists$4(OPENCLAW_DIR)) {
    await promises.mkdir(OPENCLAW_DIR, { recursive: true });
  }
}
async function readJsonConfigFile(p) {
  if (!await fileExists$4(p)) {
    return null;
  }
  const content = await promises.readFile(p, "utf-8");
  if (!content.trim()) {
    throw new Error(`Config file is empty: ${p}`);
  }
  return JSON.parse(content);
}
async function readOpenClawConfig() {
  await ensureConfigDir();
  if (!await fileExists$4(CONFIG_FILE)) {
    return {};
  }
  try {
    return await readJsonConfigFile(CONFIG_FILE) || {};
  } catch (error$1) {
    warn("Failed to read primary OpenClaw config, trying backup", error$1);
    console.warn("Failed to read primary OpenClaw config, trying backup:", error$1);
    try {
      const backup = await readJsonConfigFile(CONFIG_FILE_BACKUP);
      if (backup) {
        info("Recovered OpenClaw config from backup file");
        return backup;
      }
    } catch (backupError) {
      error("Failed to read OpenClaw config backup", backupError);
      console.error("Failed to read OpenClaw config backup:", backupError);
    }
    error("Failed to read OpenClaw config", error$1);
    console.error("Failed to read OpenClaw config:", error$1);
    return {};
  }
}
async function writeOpenClawConfig(config) {
  await ensureConfigDir();
  try {
    const commands = config.commands && typeof config.commands === "object" ? { ...config.commands } : {};
    commands.restart = true;
    config.commands = commands;
    const serialized = JSON.stringify(config, null, 2);
    const tempFile = `${CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`;
    await promises.writeFile(tempFile, serialized, "utf-8");
    if (await fileExists$4(CONFIG_FILE)) {
      await promises.copyFile(CONFIG_FILE, CONFIG_FILE_BACKUP);
    }
    await promises.rename(tempFile, CONFIG_FILE);
  } catch (error$1) {
    error("Failed to write OpenClaw config", error$1);
    console.error("Failed to write OpenClaw config:", error$1);
    throw error$1;
  }
}
function ensurePluginAllowlist(currentConfig, channelType) {
  if (channelType === "feishu") {
    if (!currentConfig.plugins) {
      currentConfig.plugins = {
        allow: [FEISHU_PLUGIN_ID],
        enabled: true,
        entries: {
          [FEISHU_PLUGIN_ID]: { enabled: true }
        }
      };
    } else {
      currentConfig.plugins.enabled = true;
      const allow = Array.isArray(currentConfig.plugins.allow) ? currentConfig.plugins.allow : [];
      const normalizedAllow = allow.filter((pluginId) => pluginId !== "feishu");
      if (!normalizedAllow.includes(FEISHU_PLUGIN_ID)) {
        currentConfig.plugins.allow = [...normalizedAllow, FEISHU_PLUGIN_ID];
      } else if (normalizedAllow.length !== allow.length) {
        currentConfig.plugins.allow = normalizedAllow;
      }
      if (!currentConfig.plugins.entries) {
        currentConfig.plugins.entries = {};
      }
      delete currentConfig.plugins.entries["feishu"];
      if (!currentConfig.plugins.entries[FEISHU_PLUGIN_ID]) {
        currentConfig.plugins.entries[FEISHU_PLUGIN_ID] = {};
      }
      currentConfig.plugins.entries[FEISHU_PLUGIN_ID].enabled = true;
    }
  }
  if (channelType === "dingtalk") {
    if (!currentConfig.plugins) {
      currentConfig.plugins = { allow: ["dingtalk"], enabled: true };
    } else {
      currentConfig.plugins.enabled = true;
      const allow = Array.isArray(currentConfig.plugins.allow) ? currentConfig.plugins.allow : [];
      if (!allow.includes("dingtalk")) {
        currentConfig.plugins.allow = [...allow, "dingtalk"];
      }
    }
  }
  if (channelType === "wecom") {
    if (!currentConfig.plugins) {
      currentConfig.plugins = { allow: [WECOM_PLUGIN_ID], enabled: true };
    } else {
      currentConfig.plugins.enabled = true;
      const allow = Array.isArray(currentConfig.plugins.allow) ? currentConfig.plugins.allow : [];
      const normalizedAllow = allow.filter((pluginId) => pluginId !== "wecom");
      if (!normalizedAllow.includes(WECOM_PLUGIN_ID)) {
        currentConfig.plugins.allow = [...normalizedAllow, WECOM_PLUGIN_ID];
      } else if (normalizedAllow.length !== allow.length) {
        currentConfig.plugins.allow = normalizedAllow;
      }
    }
  }
  if (channelType === "qqbot") {
    if (!currentConfig.plugins) {
      currentConfig.plugins = {};
    }
    currentConfig.plugins.enabled = true;
    const allow = Array.isArray(currentConfig.plugins.allow) ? currentConfig.plugins.allow : [];
    if (!allow.includes("qqbot")) {
      currentConfig.plugins.allow = [...allow, "qqbot"];
    }
  }
}
function transformChannelConfig(channelType, config, existingAccountConfig) {
  let transformedConfig = { ...config };
  if (channelType === "discord") {
    const { guildId, channelId, ...restConfig } = config;
    transformedConfig = { ...restConfig };
    transformedConfig.groupPolicy = "allowlist";
    transformedConfig.dm = { enabled: false };
    transformedConfig.retry = {
      attempts: 3,
      minDelayMs: 500,
      maxDelayMs: 3e4,
      jitter: 0.1
    };
    if (guildId && typeof guildId === "string" && guildId.trim()) {
      const guildConfig = {
        users: ["*"],
        requireMention: true
      };
      if (channelId && typeof channelId === "string" && channelId.trim()) {
        guildConfig.channels = {
          [channelId.trim()]: { allow: true, requireMention: true }
        };
      } else {
        guildConfig.channels = {
          "*": { allow: true, requireMention: true }
        };
      }
      transformedConfig.guilds = {
        [guildId.trim()]: guildConfig
      };
    }
  }
  if (channelType === "telegram") {
    const { allowedUsers, ...restConfig } = config;
    transformedConfig = { ...restConfig };
    if (allowedUsers && typeof allowedUsers === "string") {
      const users = allowedUsers.split(",").map((u) => u.trim()).filter((u) => u.length > 0);
      if (users.length > 0) {
        transformedConfig.allowFrom = users;
      }
    }
  }
  if (channelType === "feishu" || channelType === "wecom") {
    const existingDmPolicy = existingAccountConfig.dmPolicy === "pairing" ? "open" : existingAccountConfig.dmPolicy;
    transformedConfig.dmPolicy = transformedConfig.dmPolicy ?? existingDmPolicy ?? "open";
    let allowFrom = transformedConfig.allowFrom ?? existingAccountConfig.allowFrom ?? ["*"];
    if (!Array.isArray(allowFrom)) {
      allowFrom = [allowFrom];
    }
    if (transformedConfig.dmPolicy === "open" && !allowFrom.includes("*")) {
      allowFrom = [...allowFrom, "*"];
    }
    transformedConfig.allowFrom = allowFrom;
  }
  return transformedConfig;
}
function resolveAccountConfig(channelSection, accountId) {
  if (!channelSection) return {};
  const accounts = channelSection.accounts;
  return accounts?.[accountId] ?? {};
}
function getLegacyChannelPayload(channelSection) {
  const payload = {};
  for (const [key, value] of Object.entries(channelSection)) {
    if (CHANNEL_TOP_LEVEL_KEYS_TO_KEEP.has(key)) continue;
    payload[key] = value;
  }
  return payload;
}
function migrateLegacyChannelConfigToAccounts(channelSection, defaultAccountId = DEFAULT_ACCOUNT_ID$1) {
  const legacyPayload = getLegacyChannelPayload(channelSection);
  const legacyKeys = Object.keys(legacyPayload);
  const hasAccounts = Boolean(channelSection.accounts) && typeof channelSection.accounts === "object" && Object.keys(channelSection.accounts).length > 0;
  if (legacyKeys.length === 0) {
    if (hasAccounts && typeof channelSection.defaultAccount !== "string") {
      channelSection.defaultAccount = defaultAccountId;
    }
    return;
  }
  if (!channelSection.accounts || typeof channelSection.accounts !== "object") {
    channelSection.accounts = {};
  }
  const accounts = channelSection.accounts;
  const existingDefaultAccount = accounts[defaultAccountId] ?? {};
  accounts[defaultAccountId] = {
    ...channelSection.enabled !== void 0 ? { enabled: channelSection.enabled } : {},
    ...legacyPayload,
    ...existingDefaultAccount
  };
  channelSection.defaultAccount = typeof channelSection.defaultAccount === "string" && channelSection.defaultAccount.trim() ? channelSection.defaultAccount : defaultAccountId;
  for (const key of legacyKeys) {
    delete channelSection[key];
  }
}
async function saveChannelConfig(channelType, config, accountId) {
  const currentConfig = await readOpenClawConfig();
  const resolvedAccountId = accountId || DEFAULT_ACCOUNT_ID$1;
  ensurePluginAllowlist(currentConfig, channelType);
  if (PLUGIN_CHANNELS.includes(channelType)) {
    if (!currentConfig.plugins) {
      currentConfig.plugins = {};
    }
    if (!currentConfig.plugins.entries) {
      currentConfig.plugins.entries = {};
    }
    currentConfig.plugins.entries[channelType] = {
      ...currentConfig.plugins.entries[channelType],
      enabled: config.enabled ?? true
    };
    await writeOpenClawConfig(currentConfig);
    info("Plugin channel config saved", {
      channelType,
      configFile: CONFIG_FILE,
      path: `plugins.entries.${channelType}`
    });
    console.log(`Saved plugin channel config for ${channelType}`);
    return;
  }
  if (!currentConfig.channels) {
    currentConfig.channels = {};
  }
  if (!currentConfig.channels[channelType]) {
    currentConfig.channels[channelType] = {};
  }
  const channelSection = currentConfig.channels[channelType];
  migrateLegacyChannelConfigToAccounts(channelSection, DEFAULT_ACCOUNT_ID$1);
  const existingAccountConfig = resolveAccountConfig(channelSection, resolvedAccountId);
  const transformedConfig = transformChannelConfig(channelType, config, existingAccountConfig);
  if (!channelSection.accounts || typeof channelSection.accounts !== "object") {
    channelSection.accounts = {};
  }
  const accounts = channelSection.accounts;
  channelSection.defaultAccount = typeof channelSection.defaultAccount === "string" && channelSection.defaultAccount.trim() ? channelSection.defaultAccount : DEFAULT_ACCOUNT_ID$1;
  accounts[resolvedAccountId] = {
    ...accounts[resolvedAccountId],
    ...transformedConfig,
    enabled: transformedConfig.enabled ?? true
  };
  await writeOpenClawConfig(currentConfig);
  info("Channel config saved", {
    channelType,
    accountId: resolvedAccountId,
    configFile: CONFIG_FILE,
    rawKeys: Object.keys(config),
    transformedKeys: Object.keys(transformedConfig)
  });
  console.log(`Saved channel config for ${channelType} account ${resolvedAccountId}`);
}
async function getChannelConfig(channelType, accountId) {
  const config = await readOpenClawConfig();
  const channelSection = config.channels?.[channelType];
  if (!channelSection) return void 0;
  const resolvedAccountId = accountId || DEFAULT_ACCOUNT_ID$1;
  const accounts = channelSection.accounts;
  if (accounts?.[resolvedAccountId]) {
    return accounts[resolvedAccountId];
  }
  if (!accounts || Object.keys(accounts).length === 0) {
    return channelSection;
  }
  return void 0;
}
function extractFormValues(channelType, saved) {
  const values = {};
  if (channelType === "discord") {
    if (saved.token && typeof saved.token === "string") {
      values.token = saved.token;
    }
    const guilds = saved.guilds;
    if (guilds) {
      const guildIds = Object.keys(guilds);
      if (guildIds.length > 0) {
        values.guildId = guildIds[0];
        const guildConfig = guilds[guildIds[0]];
        const channels = guildConfig?.channels;
        if (channels) {
          const channelIds = Object.keys(channels).filter((id) => id !== "*");
          if (channelIds.length > 0) {
            values.channelId = channelIds[0];
          }
        }
      }
    }
  } else if (channelType === "telegram") {
    if (Array.isArray(saved.allowFrom)) {
      values.allowedUsers = saved.allowFrom.join(", ");
    }
    for (const [key, value] of Object.entries(saved)) {
      if (typeof value === "string" && key !== "enabled") {
        values[key] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(saved)) {
      if (typeof value === "string" && key !== "enabled") {
        values[key] = value;
      }
    }
  }
  return values;
}
async function getChannelFormValues(channelType, accountId) {
  const saved = await getChannelConfig(channelType, accountId);
  if (!saved) return void 0;
  const values = extractFormValues(channelType, saved);
  return Object.keys(values).length > 0 ? values : void 0;
}
async function deleteChannelAccountConfig(channelType, accountId) {
  const currentConfig = await readOpenClawConfig();
  const channelSection = currentConfig.channels?.[channelType];
  if (!channelSection) return;
  migrateLegacyChannelConfigToAccounts(channelSection, DEFAULT_ACCOUNT_ID$1);
  const accounts = channelSection.accounts;
  if (!accounts?.[accountId]) return;
  delete accounts[accountId];
  if (Object.keys(accounts).length === 0) {
    delete currentConfig.channels[channelType];
  }
  await writeOpenClawConfig(currentConfig);
  info("Deleted channel account config", { channelType, accountId });
  console.log(`Deleted channel account config for ${channelType}/${accountId}`);
}
async function deleteChannelConfig(channelType) {
  const currentConfig = await readOpenClawConfig();
  if (currentConfig.channels?.[channelType]) {
    delete currentConfig.channels[channelType];
    await writeOpenClawConfig(currentConfig);
    console.log(`Deleted channel config for ${channelType}`);
  } else if (PLUGIN_CHANNELS.includes(channelType)) {
    if (currentConfig.plugins?.entries?.[channelType]) {
      delete currentConfig.plugins.entries[channelType];
      if (Object.keys(currentConfig.plugins.entries).length === 0) {
        delete currentConfig.plugins.entries;
      }
      if (currentConfig.plugins && Object.keys(currentConfig.plugins).length === 0) {
        delete currentConfig.plugins;
      }
      await writeOpenClawConfig(currentConfig);
      console.log(`Deleted plugin channel config for ${channelType}`);
    }
  }
  if (channelType === "whatsapp") {
    try {
      const whatsappDir = path.join(os.homedir(), ".openclaw", "credentials", "whatsapp");
      if (await fileExists$4(whatsappDir)) {
        await promises.rm(whatsappDir, { recursive: true, force: true });
        console.log("Deleted WhatsApp credentials directory");
      }
    } catch (error2) {
      console.error("Failed to delete WhatsApp credentials:", error2);
    }
  }
}
function channelHasAnyAccount(channelSection) {
  const accounts = channelSection.accounts;
  if (accounts && typeof accounts === "object") {
    return Object.values(accounts).some((acc) => acc.enabled !== false);
  }
  return false;
}
async function listConfiguredChannels() {
  const config = await readOpenClawConfig();
  const channels = [];
  if (config.channels) {
    for (const channelType of Object.keys(config.channels)) {
      const section = config.channels[channelType];
      if (section.enabled === false) continue;
      if (channelHasAnyAccount(section) || Object.keys(section).length > 0) {
        channels.push(channelType);
      }
    }
  }
  try {
    const whatsappDir = path.join(os.homedir(), ".openclaw", "credentials", "whatsapp");
    if (await fileExists$4(whatsappDir)) {
      const entries = await promises.readdir(whatsappDir);
      const hasSession = await (async () => {
        for (const entry of entries) {
          try {
            const s = await promises.stat(path.join(whatsappDir, entry));
            if (s.isDirectory()) return true;
          } catch {
          }
        }
        return false;
      })();
      if (hasSession && !channels.includes("whatsapp")) {
        channels.push("whatsapp");
      }
    }
  } catch {
  }
  return channels;
}
async function deleteAgentChannelAccounts(agentId) {
  const currentConfig = await readOpenClawConfig();
  if (!currentConfig.channels) return;
  const accountId = agentId === "main" ? DEFAULT_ACCOUNT_ID$1 : agentId;
  let modified = false;
  for (const channelType of Object.keys(currentConfig.channels)) {
    const section = currentConfig.channels[channelType];
    migrateLegacyChannelConfigToAccounts(section, DEFAULT_ACCOUNT_ID$1);
    const accounts = section.accounts;
    if (!accounts?.[accountId]) continue;
    delete accounts[accountId];
    if (Object.keys(accounts).length === 0) {
      delete currentConfig.channels[channelType];
    }
    modified = true;
  }
  if (modified) {
    await writeOpenClawConfig(currentConfig);
    info("Deleted all channel accounts for agent", { agentId, accountId });
  }
}
async function setChannelEnabled(channelType, enabled) {
  const currentConfig = await readOpenClawConfig();
  if (PLUGIN_CHANNELS.includes(channelType)) {
    if (!currentConfig.plugins) currentConfig.plugins = {};
    if (!currentConfig.plugins.entries) currentConfig.plugins.entries = {};
    if (!currentConfig.plugins.entries[channelType]) currentConfig.plugins.entries[channelType] = {};
    currentConfig.plugins.entries[channelType].enabled = enabled;
    await writeOpenClawConfig(currentConfig);
    console.log(`Set plugin channel ${channelType} enabled: ${enabled}`);
    return;
  }
  if (!currentConfig.channels) currentConfig.channels = {};
  if (!currentConfig.channels[channelType]) currentConfig.channels[channelType] = {};
  currentConfig.channels[channelType].enabled = enabled;
  await writeOpenClawConfig(currentConfig);
  console.log(`Set channel ${channelType} enabled: ${enabled}`);
}
async function validateChannelCredentials(channelType, config) {
  switch (channelType) {
    case "discord":
      return validateDiscordCredentials(config);
    case "telegram":
      return validateTelegramCredentials(config);
    default:
      return { valid: true, errors: [], warnings: ["No online validation available for this channel type."] };
  }
}
async function validateDiscordCredentials(config) {
  const result = { valid: true, errors: [], warnings: [], details: {} };
  const token = config.token?.trim();
  if (!token) {
    return { valid: false, errors: ["Bot token is required"], warnings: [] };
  }
  try {
    const meResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!meResponse.ok) {
      if (meResponse.status === 401) {
        return { valid: false, errors: ["Invalid bot token. Please check and try again."], warnings: [] };
      }
      const errorData = await meResponse.json().catch(() => ({}));
      const msg = errorData.message || `Discord API error: ${meResponse.status}`;
      return { valid: false, errors: [msg], warnings: [] };
    }
    const meData = await meResponse.json();
    if (!meData.bot) {
      return { valid: false, errors: ["The provided token belongs to a user account, not a bot. Please use a bot token."], warnings: [] };
    }
    result.details.botUsername = meData.username || "Unknown";
    result.details.botId = meData.id || "";
  } catch (error2) {
    return { valid: false, errors: [`Connection error when validating bot token: ${error2 instanceof Error ? error2.message : String(error2)}`], warnings: [] };
  }
  const guildId = config.guildId?.trim();
  if (guildId) {
    try {
      const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
        headers: { Authorization: `Bot ${token}` }
      });
      if (!guildResponse.ok) {
        if (guildResponse.status === 403 || guildResponse.status === 404) {
          result.errors.push(`Cannot access guild (server) with ID "${guildId}". Make sure the bot has been invited to this server.`);
          result.valid = false;
        } else {
          result.errors.push(`Failed to verify guild ID: Discord API returned ${guildResponse.status}`);
          result.valid = false;
        }
      } else {
        const guildData = await guildResponse.json();
        result.details.guildName = guildData.name || "Unknown";
      }
    } catch (error2) {
      result.warnings.push(`Could not verify guild ID: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  const channelId = config.channelId?.trim();
  if (channelId) {
    try {
      const channelResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
        headers: { Authorization: `Bot ${token}` }
      });
      if (!channelResponse.ok) {
        if (channelResponse.status === 403 || channelResponse.status === 404) {
          result.errors.push(`Cannot access channel with ID "${channelId}". Make sure the bot has permission to view this channel.`);
          result.valid = false;
        } else {
          result.errors.push(`Failed to verify channel ID: Discord API returned ${channelResponse.status}`);
          result.valid = false;
        }
      } else {
        const channelData = await channelResponse.json();
        result.details.channelName = channelData.name || "Unknown";
        if (guildId && channelData.guild_id && channelData.guild_id !== guildId) {
          result.errors.push(`Channel "${channelData.name}" does not belong to the specified guild. It belongs to a different server.`);
          result.valid = false;
        }
      }
    } catch (error2) {
      result.warnings.push(`Could not verify channel ID: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  return result;
}
async function validateTelegramCredentials(config) {
  const botToken = config.botToken?.trim();
  const allowedUsers = config.allowedUsers?.trim();
  if (!botToken) return { valid: false, errors: ["Bot token is required"], warnings: [] };
  if (!allowedUsers) return { valid: false, errors: ["At least one allowed user ID is required"], warnings: [] };
  try {
    const response = await proxyAwareFetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    if (data.ok) {
      return { valid: true, errors: [], warnings: [], details: { botUsername: data.result?.username || "Unknown" } };
    }
    return { valid: false, errors: [data.description || "Invalid bot token"], warnings: [] };
  } catch (error2) {
    return { valid: false, errors: [`Connection error: ${error2 instanceof Error ? error2.message : String(error2)}`], warnings: [] };
  }
}
async function validateChannelConfig(channelType) {
  const { exec } = await import("child_process");
  const result = { valid: true, errors: [], warnings: [] };
  try {
    const openclawPath = getOpenClawResolvedDir();
    const output = await new Promise((resolve, reject) => {
      exec(
        `node openclaw.mjs doctor --json 2>&1`,
        {
          cwd: openclawPath,
          encoding: "utf-8",
          timeout: 3e4,
          windowsHide: true
        },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        }
      );
    });
    const lines = output.split("\n");
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes(channelType) && lowerLine.includes("error")) {
        result.errors.push(line.trim());
        result.valid = false;
      } else if (lowerLine.includes(channelType) && lowerLine.includes("warning")) {
        result.warnings.push(line.trim());
      } else if (lowerLine.includes("unrecognized key") && lowerLine.includes(channelType)) {
        result.errors.push(line.trim());
        result.valid = false;
      }
    }
    const config = await readOpenClawConfig();
    const savedChannelConfig = await getChannelConfig(channelType, DEFAULT_ACCOUNT_ID$1);
    if (!config.channels?.[channelType] || !savedChannelConfig) {
      result.errors.push(`Channel ${channelType} is not configured`);
      result.valid = false;
    } else if (config.channels[channelType].enabled === false) {
      result.warnings.push(`Channel ${channelType} is disabled`);
    }
    if (channelType === "discord") {
      const discordConfig = savedChannelConfig;
      if (!discordConfig?.token) {
        result.errors.push("Discord: Bot token is required");
        result.valid = false;
      }
    } else if (channelType === "telegram") {
      const telegramConfig = savedChannelConfig;
      if (!telegramConfig?.botToken) {
        result.errors.push("Telegram: Bot token is required");
        result.valid = false;
      }
      const allowedUsers = telegramConfig?.allowFrom;
      if (!allowedUsers || allowedUsers.length === 0) {
        result.errors.push("Telegram: Allowed User IDs are required");
        result.valid = false;
      }
    }
    if (result.errors.length === 0 && result.warnings.length === 0) {
      result.valid = true;
    }
  } catch (error2) {
    const errorMessage = error2 instanceof Error ? error2.message : String(error2);
    if (errorMessage.includes("Unrecognized key") || errorMessage.includes("invalid config")) {
      result.errors.push(errorMessage);
      result.valid = false;
    } else if (errorMessage.includes("ENOENT")) {
      result.errors.push("OpenClaw not found. Please ensure OpenClaw is installed.");
      result.valid = false;
    } else {
      console.warn("Doctor command failed:", errorMessage);
      const config = await readOpenClawConfig();
      if (config.channels?.[channelType]) {
        result.valid = true;
      } else {
        result.errors.push(`Channel ${channelType} is not configured`);
        result.valid = false;
      }
    }
  }
  return result;
}
const MAIN_AGENT_ID = "main";
const MAIN_AGENT_NAME = "Main";
const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_WORKSPACE_PATH = "~/.openclaw/workspace";
const AGENT_BOOTSTRAP_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "USER.md",
  "IDENTITY.md",
  "HEARTBEAT.md",
  "BOOT.md"
];
const AGENT_RUNTIME_FILES = [
  "auth-profiles.json",
  "models.json"
];
function formatModelLabel(model) {
  if (typeof model === "string" && model.trim()) {
    const trimmed = model.trim();
    const parts = trimmed.split("/");
    return parts[parts.length - 1] || trimmed;
  }
  if (model && typeof model === "object") {
    const primary = model.primary;
    if (typeof primary === "string" && primary.trim()) {
      const parts = primary.trim().split("/");
      return parts[parts.length - 1] || primary.trim();
    }
  }
  return null;
}
function normalizeAgentName(name) {
  return name.trim() || "Agent";
}
function slugifyAgentId(name) {
  const normalized = name.normalize("NFKD").replace(/[^\w\s-]/g, "").toLowerCase().replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) return "agent";
  if (normalized === MAIN_AGENT_ID) return "agent";
  return normalized;
}
async function fileExists$3(path2) {
  try {
    await promises.access(path2, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function ensureDir$2(path2) {
  if (!await fileExists$3(path2)) {
    await promises.mkdir(path2, { recursive: true });
  }
}
function getDefaultWorkspacePath(config) {
  const defaults2 = config.agents && typeof config.agents === "object" ? config.agents.defaults : void 0;
  return typeof defaults2?.workspace === "string" && defaults2.workspace.trim() ? defaults2.workspace : DEFAULT_WORKSPACE_PATH;
}
function getDefaultAgentDirPath(agentId) {
  return `~/.openclaw/agents/${agentId}/agent`;
}
function createImplicitMainEntry(config) {
  return {
    id: MAIN_AGENT_ID,
    name: MAIN_AGENT_NAME,
    default: true,
    workspace: getDefaultWorkspacePath(config),
    agentDir: getDefaultAgentDirPath(MAIN_AGENT_ID)
  };
}
function normalizeAgentsConfig(config) {
  const agentsConfig = config.agents && typeof config.agents === "object" ? { ...config.agents } : {};
  const rawEntries = Array.isArray(agentsConfig.list) ? agentsConfig.list.filter((entry) => Boolean(entry) && typeof entry === "object" && typeof entry.id === "string" && entry.id.trim().length > 0) : [];
  if (rawEntries.length === 0) {
    const main = createImplicitMainEntry(config);
    return {
      agentsConfig,
      entries: [main],
      defaultAgentId: MAIN_AGENT_ID,
      syntheticMain: true
    };
  }
  const defaultEntry = rawEntries.find((entry) => entry.default) ?? rawEntries[0];
  return {
    agentsConfig,
    entries: rawEntries.map((entry) => ({ ...entry })),
    defaultAgentId: defaultEntry.id,
    syntheticMain: false
  };
}
function isChannelBinding(binding) {
  if (!binding || typeof binding !== "object") return false;
  const candidate = binding;
  if (typeof candidate.agentId !== "string" || !candidate.agentId) return false;
  if (!candidate.match || typeof candidate.match !== "object" || Array.isArray(candidate.match)) return false;
  if (typeof candidate.match.channel !== "string" || !candidate.match.channel) return false;
  const keys = Object.keys(candidate.match);
  if (keys.length === 1 && keys[0] === "channel") return true;
  if (keys.length === 2 && keys.includes("channel") && keys.includes("accountId")) return true;
  return false;
}
function normalizeAgentIdForBinding(id) {
  return (id ?? "").trim().toLowerCase() || "";
}
function normalizeMainKey(value) {
  if (typeof value !== "string") return "main";
  const trimmed = value.trim().toLowerCase();
  return trimmed || "main";
}
function buildAgentMainSessionKey(config, agentId) {
  return `agent:${normalizeAgentIdForBinding(agentId) || MAIN_AGENT_ID}:${normalizeMainKey(config.session?.mainKey)}`;
}
function getChannelBindingMap(bindings) {
  const channelToAgent = /* @__PURE__ */ new Map();
  const accountToAgent = /* @__PURE__ */ new Map();
  if (!Array.isArray(bindings)) return { channelToAgent, accountToAgent };
  for (const binding of bindings) {
    if (!isChannelBinding(binding)) continue;
    const agentId = normalizeAgentIdForBinding(binding.agentId);
    const channel = binding.match?.channel;
    if (!agentId || !channel) continue;
    const accountId = binding.match?.accountId;
    if (accountId) {
      accountToAgent.set(`${channel}:${accountId}`, agentId);
    } else {
      channelToAgent.set(channel, agentId);
    }
  }
  return { channelToAgent, accountToAgent };
}
function upsertBindingsForChannel(bindings, channelType, agentId, accountId) {
  const nextBindings = Array.isArray(bindings) ? [...bindings].filter((binding) => {
    if (!isChannelBinding(binding)) return true;
    if (binding.match?.channel !== channelType) return true;
    if (accountId) {
      return binding.match?.accountId !== accountId;
    }
    return Boolean(binding.match?.accountId);
  }) : [];
  if (agentId) {
    const match = { channel: channelType };
    if (accountId) {
      match.accountId = accountId;
    }
    nextBindings.push({ agentId, match });
  }
  return nextBindings.length > 0 ? nextBindings : void 0;
}
async function listExistingAgentIdsOnDisk() {
  const ids = /* @__PURE__ */ new Set();
  const agentsDir = path.join(getOpenClawConfigDir(), "agents");
  try {
    if (!await fileExists$3(agentsDir)) return ids;
    const entries = await promises.readdir(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  } catch {
  }
  return ids;
}
async function removeAgentRuntimeDirectory(agentId) {
  const runtimeDir = path.join(getOpenClawConfigDir(), "agents", agentId);
  try {
    await promises.rm(runtimeDir, { recursive: true, force: true });
  } catch (error2) {
    warn("Failed to remove agent runtime directory", {
      agentId,
      runtimeDir,
      error: String(error2)
    });
  }
}
function trimTrailingSeparators(path2) {
  return path2.replace(/[\\/]+$/, "");
}
function getManagedWorkspaceDirectory(agent) {
  if (agent.id === MAIN_AGENT_ID) return null;
  const configuredWorkspace = expandPath(agent.workspace || `~/.openclaw/workspace-${agent.id}`);
  const managedWorkspace = path.join(getOpenClawConfigDir(), `workspace-${agent.id}`);
  const normalizedConfigured = trimTrailingSeparators(path.normalize(configuredWorkspace));
  const normalizedManaged = trimTrailingSeparators(path.normalize(managedWorkspace));
  return normalizedConfigured === normalizedManaged ? configuredWorkspace : null;
}
async function removeAgentWorkspaceDirectory(agent) {
  const workspaceDir = getManagedWorkspaceDirectory(agent);
  if (!workspaceDir) {
    warn("Skipping agent workspace deletion for unmanaged path", {
      agentId: agent.id,
      workspace: agent.workspace
    });
    return;
  }
  try {
    await promises.rm(workspaceDir, { recursive: true, force: true });
  } catch (error2) {
    warn("Failed to remove agent workspace directory", {
      agentId: agent.id,
      workspaceDir,
      error: String(error2)
    });
  }
}
async function copyBootstrapFiles(sourceWorkspace, targetWorkspace) {
  await ensureDir$2(targetWorkspace);
  for (const fileName of AGENT_BOOTSTRAP_FILES) {
    const source = path.join(sourceWorkspace, fileName);
    const target = path.join(targetWorkspace, fileName);
    if (!await fileExists$3(source) || await fileExists$3(target)) continue;
    await promises.copyFile(source, target);
  }
}
async function copyRuntimeFiles(sourceAgentDir, targetAgentDir) {
  await ensureDir$2(targetAgentDir);
  for (const fileName of AGENT_RUNTIME_FILES) {
    const source = path.join(sourceAgentDir, fileName);
    const target = path.join(targetAgentDir, fileName);
    if (!await fileExists$3(source) || await fileExists$3(target)) continue;
    await promises.copyFile(source, target);
  }
}
async function provisionAgentFilesystem(config, agent) {
  const { entries } = normalizeAgentsConfig(config);
  const mainEntry = entries.find((entry) => entry.id === MAIN_AGENT_ID) ?? createImplicitMainEntry(config);
  const sourceWorkspace = expandPath(mainEntry.workspace || getDefaultWorkspacePath(config));
  const targetWorkspace = expandPath(agent.workspace || `~/.openclaw/workspace-${agent.id}`);
  const sourceAgentDir = expandPath(mainEntry.agentDir || getDefaultAgentDirPath(MAIN_AGENT_ID));
  const targetAgentDir = expandPath(agent.agentDir || getDefaultAgentDirPath(agent.id));
  const targetSessionsDir = path.join(getOpenClawConfigDir(), "agents", agent.id, "sessions");
  await ensureDir$2(targetWorkspace);
  await ensureDir$2(targetAgentDir);
  await ensureDir$2(targetSessionsDir);
  if (targetWorkspace !== sourceWorkspace) {
    await copyBootstrapFiles(sourceWorkspace, targetWorkspace);
  }
  if (targetAgentDir !== sourceAgentDir) {
    await copyRuntimeFiles(sourceAgentDir, targetAgentDir);
  }
}
function resolveAccountIdForAgent(agentId) {
  return agentId === MAIN_AGENT_ID ? DEFAULT_ACCOUNT_ID : agentId;
}
function listConfiguredAccountIdsForChannel(config, channelType) {
  const channelSection = config.channels?.[channelType];
  if (!channelSection || channelSection.enabled === false) {
    return [];
  }
  const accounts = channelSection.accounts;
  if (!accounts || typeof accounts !== "object" || Object.keys(accounts).length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return Object.keys(accounts).filter(Boolean).sort((a, b) => {
    if (a === DEFAULT_ACCOUNT_ID) return -1;
    if (b === DEFAULT_ACCOUNT_ID) return 1;
    return a.localeCompare(b);
  });
}
async function buildSnapshotFromConfig(config) {
  const { entries, defaultAgentId } = normalizeAgentsConfig(config);
  const configuredChannels = await listConfiguredChannels();
  const { channelToAgent, accountToAgent } = getChannelBindingMap(config.bindings);
  const defaultAgentIdNorm = normalizeAgentIdForBinding(defaultAgentId);
  const channelOwners = {};
  const agentChannelSets = /* @__PURE__ */ new Map();
  for (const channelType of configuredChannels) {
    const accountIds = listConfiguredAccountIdsForChannel(config, channelType);
    let primaryOwner;
    for (const accountId of accountIds) {
      const owner = accountToAgent.get(`${channelType}:${accountId}`) || (accountId === DEFAULT_ACCOUNT_ID ? channelToAgent.get(channelType) || defaultAgentIdNorm : void 0);
      if (!owner) {
        continue;
      }
      primaryOwner ??= owner;
      const existing = agentChannelSets.get(owner) ?? /* @__PURE__ */ new Set();
      existing.add(channelType);
      agentChannelSets.set(owner, existing);
    }
    if (!primaryOwner) {
      primaryOwner = channelToAgent.get(channelType) || defaultAgentIdNorm;
      const existing = agentChannelSets.get(primaryOwner) ?? /* @__PURE__ */ new Set();
      existing.add(channelType);
      agentChannelSets.set(primaryOwner, existing);
    }
    channelOwners[channelType] = primaryOwner;
  }
  const defaultModelLabel = formatModelLabel(config.agents?.defaults?.model);
  const agents = entries.map((entry) => {
    const modelLabel = formatModelLabel(entry.model) || defaultModelLabel || "Not configured";
    const inheritedModel = !formatModelLabel(entry.model) && Boolean(defaultModelLabel);
    const entryIdNorm = normalizeAgentIdForBinding(entry.id);
    const ownedChannels = agentChannelSets.get(entryIdNorm) ?? /* @__PURE__ */ new Set();
    return {
      id: entry.id,
      name: entry.name || (entry.id === MAIN_AGENT_ID ? MAIN_AGENT_NAME : entry.id),
      isDefault: entry.id === defaultAgentId,
      modelDisplay: modelLabel,
      inheritedModel,
      workspace: entry.workspace || (entry.id === MAIN_AGENT_ID ? getDefaultWorkspacePath(config) : `~/.openclaw/workspace-${entry.id}`),
      agentDir: entry.agentDir || getDefaultAgentDirPath(entry.id),
      mainSessionKey: buildAgentMainSessionKey(config, entry.id),
      channelTypes: configuredChannels.filter((ct) => ownedChannels.has(ct))
    };
  });
  return {
    agents,
    defaultAgentId,
    configuredChannelTypes: configuredChannels,
    channelOwners
  };
}
async function listAgentsSnapshot() {
  const config = await readOpenClawConfig();
  return buildSnapshotFromConfig(config);
}
async function listConfiguredAgentIds() {
  const config = await readOpenClawConfig();
  const { entries } = normalizeAgentsConfig(config);
  const ids = [...new Set(entries.map((entry) => entry.id.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : [MAIN_AGENT_ID];
}
async function createAgent(name) {
  const config = await readOpenClawConfig();
  const { agentsConfig, entries, syntheticMain } = normalizeAgentsConfig(config);
  const normalizedName = normalizeAgentName(name);
  const existingIds = new Set(entries.map((entry) => entry.id));
  const diskIds = await listExistingAgentIdsOnDisk();
  let nextId = slugifyAgentId(normalizedName);
  let suffix = 2;
  while (existingIds.has(nextId) || diskIds.has(nextId)) {
    nextId = `${slugifyAgentId(normalizedName)}-${suffix}`;
    suffix += 1;
  }
  const nextEntries = syntheticMain ? [createImplicitMainEntry(config), ...entries.filter((_, index) => index > 0)] : [...entries];
  const newAgent = {
    id: nextId,
    name: normalizedName,
    workspace: `~/.openclaw/workspace-${nextId}`,
    agentDir: getDefaultAgentDirPath(nextId)
  };
  if (!nextEntries.some((entry) => entry.id === MAIN_AGENT_ID) && syntheticMain) {
    nextEntries.unshift(createImplicitMainEntry(config));
  }
  nextEntries.push(newAgent);
  config.agents = {
    ...agentsConfig,
    list: nextEntries
  };
  await provisionAgentFilesystem(config, newAgent);
  await writeOpenClawConfig(config);
  info("Created agent config entry", { agentId: nextId });
  return buildSnapshotFromConfig(config);
}
async function updateAgentName(agentId, name) {
  const config = await readOpenClawConfig();
  const { agentsConfig, entries } = normalizeAgentsConfig(config);
  const normalizedName = normalizeAgentName(name);
  const index = entries.findIndex((entry) => entry.id === agentId);
  if (index === -1) {
    throw new Error(`Agent "${agentId}" not found`);
  }
  entries[index] = {
    ...entries[index],
    name: normalizedName
  };
  config.agents = {
    ...agentsConfig,
    list: entries
  };
  await writeOpenClawConfig(config);
  info("Updated agent name", { agentId, name: normalizedName });
  return buildSnapshotFromConfig(config);
}
async function deleteAgentConfig(agentId) {
  if (agentId === MAIN_AGENT_ID) {
    throw new Error("The main agent cannot be deleted");
  }
  const config = await readOpenClawConfig();
  const { agentsConfig, entries, defaultAgentId } = normalizeAgentsConfig(config);
  const removedEntry = entries.find((entry) => entry.id === agentId);
  const nextEntries = entries.filter((entry) => entry.id !== agentId);
  if (!removedEntry || nextEntries.length === entries.length) {
    throw new Error(`Agent "${agentId}" not found`);
  }
  config.agents = {
    ...agentsConfig,
    list: nextEntries
  };
  config.bindings = Array.isArray(config.bindings) ? config.bindings.filter((binding) => !(isChannelBinding(binding) && binding.agentId === agentId)) : void 0;
  if (defaultAgentId === agentId && nextEntries.length > 0) {
    nextEntries[0] = {
      ...nextEntries[0],
      default: true
    };
  }
  await writeOpenClawConfig(config);
  await deleteAgentChannelAccounts(agentId);
  await removeAgentRuntimeDirectory(agentId);
  await removeAgentWorkspaceDirectory(removedEntry);
  info("Deleted agent config entry", { agentId });
  return buildSnapshotFromConfig(config);
}
async function assignChannelToAgent(agentId, channelType) {
  const config = await readOpenClawConfig();
  const { entries } = normalizeAgentsConfig(config);
  if (!entries.some((entry) => entry.id === agentId)) {
    throw new Error(`Agent "${agentId}" not found`);
  }
  const accountId = resolveAccountIdForAgent(agentId);
  config.bindings = upsertBindingsForChannel(config.bindings, channelType, agentId, accountId);
  await writeOpenClawConfig(config);
  info("Assigned channel to agent", { agentId, channelType, accountId });
  return buildSnapshotFromConfig(config);
}
async function clearChannelBinding(channelType, accountId) {
  const config = await readOpenClawConfig();
  config.bindings = upsertBindingsForChannel(config.bindings, channelType, null, accountId);
  await writeOpenClawConfig(config);
  info("Cleared channel binding", { channelType, accountId });
  return buildSnapshotFromConfig(config);
}
async function clearAllBindingsForChannel(channelType) {
  const config = await readOpenClawConfig();
  if (!Array.isArray(config.bindings)) return;
  const nextBindings = config.bindings.filter((binding) => {
    if (!isChannelBinding(binding)) return true;
    return binding.match?.channel !== channelType;
  });
  config.bindings = nextBindings.length > 0 ? nextBindings : void 0;
  await writeOpenClawConfig(config);
  info("Cleared all bindings for channel", { channelType });
}
const OPENCLAW_PROVIDER_KEY_MINIMAX = "minimax-portal";
const OPENCLAW_PROVIDER_KEY_QWEN = "qwen-portal";
const OPENCLAW_PROVIDER_KEY_MOONSHOT = "moonshot";
const OAUTH_PROVIDER_TYPES = ["qwen-portal", "minimax-portal", "minimax-portal-cn"];
const OPENCLAW_OAUTH_PLUGIN_PROVIDER_KEYS = [
  OPENCLAW_PROVIDER_KEY_MINIMAX,
  OPENCLAW_PROVIDER_KEY_QWEN
];
const OAUTH_PROVIDER_TYPE_SET = new Set(OAUTH_PROVIDER_TYPES);
const OPENCLAW_OAUTH_PLUGIN_PROVIDER_KEY_SET = new Set(OPENCLAW_OAUTH_PLUGIN_PROVIDER_KEYS);
function isOAuthProviderType(type) {
  return OAUTH_PROVIDER_TYPE_SET.has(type);
}
function isOpenClawOAuthPluginProviderKey(provider) {
  return OPENCLAW_OAUTH_PLUGIN_PROVIDER_KEY_SET.has(provider);
}
const AUTH_STORE_VERSION = 1;
const AUTH_PROFILE_FILENAME = "auth-profiles.json";
function getOAuthPluginId(provider) {
  return `${provider}-auth`;
}
async function fileExists$2(p) {
  try {
    await promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function ensureDir$1(dir) {
  if (!await fileExists$2(dir)) {
    await promises.mkdir(dir, { recursive: true });
  }
}
async function readJsonFile(filePath) {
  try {
    if (!await fileExists$2(filePath)) return null;
    const raw = await promises.readFile(filePath, "utf-8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writeJsonFile(filePath, data) {
  await ensureDir$1(path.join(filePath, ".."));
  const serialized = JSON.stringify(data, null, 2);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${filePath}.bak`;
  await promises.writeFile(tempPath, serialized, "utf-8");
  if (await fileExists$2(filePath)) {
    await promises.copyFile(filePath, backupPath);
  }
  await promises.rename(tempPath, filePath);
}
function getAuthProfilesPath(agentId = "main") {
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "agent", AUTH_PROFILE_FILENAME);
}
async function readAuthProfiles(agentId = "main") {
  const filePath = getAuthProfilesPath(agentId);
  try {
    const data = await readJsonFile(filePath);
    if (data?.version && data.profiles && typeof data.profiles === "object") {
      return data;
    }
  } catch (error2) {
    console.warn("Failed to read auth-profiles.json, creating fresh store:", error2);
  }
  return { version: AUTH_STORE_VERSION, profiles: {} };
}
async function writeAuthProfiles(store2, agentId = "main") {
  await writeJsonFile(getAuthProfilesPath(agentId), store2);
}
async function discoverAgentIds() {
  const agentsDir = path.join(os.homedir(), ".openclaw", "agents");
  try {
    if (!await fileExists$2(agentsDir)) return ["main"];
    return await listConfiguredAgentIds();
  } catch {
    return ["main"];
  }
}
const OPENCLAW_CONFIG_PATH$1 = path.join(os.homedir(), ".openclaw", "openclaw.json");
const VALID_COMPACTION_MODES = /* @__PURE__ */ new Set(["default", "safeguard"]);
async function readOpenClawJson() {
  return await readJsonFile(OPENCLAW_CONFIG_PATH$1) ?? {};
}
function normalizeAgentsDefaultsCompactionMode(config) {
  const agents = config.agents && typeof config.agents === "object" ? config.agents : null;
  if (!agents) return;
  const defaults2 = agents.defaults && typeof agents.defaults === "object" ? agents.defaults : null;
  if (!defaults2) return;
  const compaction = defaults2.compaction && typeof defaults2.compaction === "object" ? defaults2.compaction : null;
  if (!compaction) return;
  const mode = compaction.mode;
  if (typeof mode === "string" && mode.length > 0 && !VALID_COMPACTION_MODES.has(mode)) {
    compaction.mode = "default";
  }
}
async function writeOpenClawJson(config) {
  normalizeAgentsDefaultsCompactionMode(config);
  const commands = config.commands && typeof config.commands === "object" ? { ...config.commands } : {};
  commands.restart = true;
  config.commands = commands;
  await writeJsonFile(OPENCLAW_CONFIG_PATH$1, config);
}
async function saveOAuthTokenToOpenClaw(provider, token, agentId) {
  const agentIds = await discoverAgentIds();
  if (agentIds.length === 0) agentIds.push("main");
  for (const id of agentIds) {
    const store2 = await readAuthProfiles(id);
    const profileId = `${provider}:default`;
    store2.profiles[profileId] = {
      type: "oauth",
      provider,
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      email: token.email,
      projectId: token.projectId
    };
    if (!store2.order) store2.order = {};
    if (!store2.order[provider]) store2.order[provider] = [];
    if (!store2.order[provider].includes(profileId)) {
      store2.order[provider].push(profileId);
    }
    if (!store2.lastGood) store2.lastGood = {};
    store2.lastGood[provider] = profileId;
    await writeAuthProfiles(store2, id);
  }
  console.log(`Saved OAuth token for provider "${provider}" to OpenClaw auth-profiles (agents: ${agentIds.join(", ")})`);
}
async function saveProviderKeyToOpenClaw(provider, apiKey, agentId) {
  if (isOAuthProviderType(provider) && !apiKey) {
    console.log(`Skipping auth-profiles write for OAuth provider "${provider}" (no API key provided, using OAuth)`);
    return;
  }
  const agentIds = await discoverAgentIds();
  if (agentIds.length === 0) agentIds.push("main");
  for (const id of agentIds) {
    const store2 = await readAuthProfiles(id);
    const profileId = `${provider}:default`;
    store2.profiles[profileId] = { type: "api_key", provider, key: apiKey };
    if (!store2.order) store2.order = {};
    if (!store2.order[provider]) store2.order[provider] = [];
    if (!store2.order[provider].includes(profileId)) {
      store2.order[provider].push(profileId);
    }
    if (!store2.lastGood) store2.lastGood = {};
    store2.lastGood[provider] = profileId;
    await writeAuthProfiles(store2, id);
  }
  console.log(`Saved API key for provider "${provider}" to OpenClaw auth-profiles (agents: ${agentIds.join(", ")})`);
}
async function removeProviderFromOpenClaw(provider) {
  const agentIds = await discoverAgentIds();
  if (agentIds.length === 0) agentIds.push("main");
  for (const id of agentIds) {
    const store2 = await readAuthProfiles(id);
    const profileId = `${provider}:default`;
    if (store2.profiles[profileId]) {
      delete store2.profiles[profileId];
      if (store2.order?.[provider]) {
        store2.order[provider] = store2.order[provider].filter((aid) => aid !== profileId);
        if (store2.order[provider].length === 0) delete store2.order[provider];
      }
      if (store2.lastGood?.[provider] === profileId) delete store2.lastGood[provider];
      await writeAuthProfiles(store2, id);
    }
  }
  for (const id of agentIds) {
    const modelsPath = path.join(os.homedir(), ".openclaw", "agents", id, "agent", "models.json");
    try {
      if (await fileExists$2(modelsPath)) {
        const raw = await promises.readFile(modelsPath, "utf-8");
        const data = JSON.parse(raw);
        const providers = data.providers;
        if (providers && providers[provider]) {
          delete providers[provider];
          await promises.writeFile(modelsPath, JSON.stringify(data, null, 2), "utf-8");
          console.log(`Removed models.json entry for provider "${provider}" (agent "${id}")`);
        }
      }
    } catch (err) {
      console.warn(`Failed to remove provider ${provider} from models.json (agent "${id}"):`, err);
    }
  }
  try {
    const config = await readOpenClawJson();
    let modified = false;
    const plugins = config.plugins;
    const entries = plugins?.entries ?? {};
    const pluginName = `${provider}-auth`;
    if (entries[pluginName]) {
      entries[pluginName].enabled = false;
      modified = true;
      console.log(`Disabled OpenClaw plugin: ${pluginName}`);
    }
    const models = config.models;
    const providers = models?.providers ?? {};
    if (providers[provider]) {
      delete providers[provider];
      modified = true;
      console.log(`Removed OpenClaw provider config: ${provider}`);
    }
    if (modified) {
      await writeOpenClawJson(config);
    }
  } catch (err) {
    console.warn(`Failed to remove provider ${provider} from openclaw.json:`, err);
  }
}
async function setOpenClawDefaultModel(provider, modelOverride, fallbackModels = []) {
  const config = await readOpenClawJson();
  ensureMoonshotKimiWebSearchCnBaseUrl(config, provider);
  const model = normalizeModelRef(provider, modelOverride);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }
  const modelId = extractModelId(provider, model);
  const fallbackModelIds = extractFallbackModelIds(provider, fallbackModels);
  const agents = config.agents || {};
  const defaults2 = agents.defaults || {};
  defaults2.model = {
    primary: model,
    fallbacks: fallbackModels
  };
  agents.defaults = defaults2;
  config.agents = agents;
  const providerCfg = getProviderConfig(provider);
  if (providerCfg) {
    upsertOpenClawProviderEntry(config, provider, {
      baseUrl: providerCfg.baseUrl,
      api: providerCfg.api,
      apiKeyEnv: providerCfg.apiKeyEnv,
      headers: providerCfg.headers,
      modelIds: [modelId, ...fallbackModelIds],
      includeRegistryModels: true,
      mergeExistingModels: true
    });
    console.log(`Configured models.providers.${provider} with baseUrl=${providerCfg.baseUrl}, model=${modelId}`);
  } else {
    const models = config.models || {};
    const providers = models.providers || {};
    if (providers[provider]) {
      delete providers[provider];
      console.log(`Removed stale models.providers.${provider} (built-in provider)`);
      models.providers = providers;
      config.models = models;
    }
  }
  const gateway = config.gateway || {};
  if (!gateway.mode) gateway.mode = "local";
  config.gateway = gateway;
  await writeOpenClawJson(config);
  console.log(`Set OpenClaw default model to "${model}" for provider "${provider}"`);
}
function normalizeModelRef(provider, modelOverride) {
  const rawModel = modelOverride || getProviderDefaultModel(provider);
  if (!rawModel) return void 0;
  return rawModel.startsWith(`${provider}/`) ? rawModel : `${provider}/${rawModel}`;
}
function extractModelId(provider, modelRef) {
  return modelRef.startsWith(`${provider}/`) ? modelRef.slice(provider.length + 1) : modelRef;
}
function extractFallbackModelIds(provider, fallbackModels) {
  return fallbackModels.filter((fallback) => fallback.startsWith(`${provider}/`)).map((fallback) => fallback.slice(provider.length + 1));
}
function mergeProviderModels(...groups) {
  const merged = [];
  const seen = /* @__PURE__ */ new Set();
  for (const group of groups) {
    for (const item of group) {
      const id = typeof item?.id === "string" ? item.id : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(item);
    }
  }
  return merged;
}
function upsertOpenClawProviderEntry(config, provider, options) {
  const models = config.models || {};
  const providers = models.providers || {};
  const existingProvider = providers[provider] && typeof providers[provider] === "object" ? providers[provider] : {};
  const existingModels = options.mergeExistingModels && Array.isArray(existingProvider.models) ? existingProvider.models : [];
  const registryModels = options.includeRegistryModels ? (getProviderConfig(provider)?.models ?? []).map((m) => ({ ...m })) : [];
  const runtimeModels = (options.modelIds ?? []).map((id) => ({ id, name: id }));
  const nextProvider = {
    ...existingProvider,
    baseUrl: options.baseUrl,
    api: options.api,
    models: mergeProviderModels(registryModels, existingModels, runtimeModels)
  };
  if (options.apiKeyEnv) nextProvider.apiKey = options.apiKeyEnv;
  if (options.headers && Object.keys(options.headers).length > 0) {
    nextProvider.headers = options.headers;
  } else {
    delete nextProvider.headers;
  }
  if (options.authHeader !== void 0) {
    nextProvider.authHeader = options.authHeader;
  } else {
    delete nextProvider.authHeader;
  }
  providers[provider] = nextProvider;
  models.providers = providers;
  config.models = models;
}
function ensureMoonshotKimiWebSearchCnBaseUrl(config, provider) {
  if (provider !== OPENCLAW_PROVIDER_KEY_MOONSHOT) return;
  const tools = config.tools || {};
  const web = tools.web || {};
  const search = web.search || {};
  const kimi = search.kimi && typeof search.kimi === "object" && !Array.isArray(search.kimi) ? search.kimi : {};
  delete kimi.apiKey;
  kimi.baseUrl = "https://api.moonshot.cn/v1";
  search.kimi = kimi;
  web.search = search;
  tools.web = web;
  config.tools = tools;
}
async function syncProviderConfigToOpenClaw(provider, modelId, override) {
  const config = await readOpenClawJson();
  ensureMoonshotKimiWebSearchCnBaseUrl(config, provider);
  if (override.baseUrl && override.api) {
    upsertOpenClawProviderEntry(config, provider, {
      baseUrl: override.baseUrl,
      api: override.api,
      apiKeyEnv: override.apiKeyEnv,
      headers: override.headers,
      modelIds: modelId ? [modelId] : []
    });
  }
  if (isOpenClawOAuthPluginProviderKey(provider)) {
    const plugins = config.plugins || {};
    const allow = Array.isArray(plugins.allow) ? [...plugins.allow] : [];
    const pEntries = plugins.entries || {};
    const pluginId = getOAuthPluginId(provider);
    if (!allow.includes(pluginId)) {
      allow.push(pluginId);
    }
    pEntries[pluginId] = { enabled: true };
    plugins.allow = allow;
    plugins.entries = pEntries;
    config.plugins = plugins;
  }
  await writeOpenClawJson(config);
}
async function setOpenClawDefaultModelWithOverride(provider, modelOverride, override, fallbackModels = []) {
  const config = await readOpenClawJson();
  ensureMoonshotKimiWebSearchCnBaseUrl(config, provider);
  const model = normalizeModelRef(provider, modelOverride);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }
  const modelId = extractModelId(provider, model);
  const fallbackModelIds = extractFallbackModelIds(provider, fallbackModels);
  const agents = config.agents || {};
  const defaults2 = agents.defaults || {};
  defaults2.model = {
    primary: model,
    fallbacks: fallbackModels
  };
  agents.defaults = defaults2;
  config.agents = agents;
  if (override.baseUrl && override.api) {
    upsertOpenClawProviderEntry(config, provider, {
      baseUrl: override.baseUrl,
      api: override.api,
      apiKeyEnv: override.apiKeyEnv,
      headers: override.headers,
      authHeader: override.authHeader,
      modelIds: [modelId, ...fallbackModelIds]
    });
  }
  const gateway = config.gateway || {};
  if (!gateway.mode) gateway.mode = "local";
  config.gateway = gateway;
  if (isOpenClawOAuthPluginProviderKey(provider)) {
    const plugins = config.plugins || {};
    const allow = Array.isArray(plugins.allow) ? [...plugins.allow] : [];
    const pEntries = plugins.entries || {};
    const pluginId = getOAuthPluginId(provider);
    if (!allow.includes(pluginId)) {
      allow.push(pluginId);
    }
    pEntries[pluginId] = { enabled: true };
    plugins.allow = allow;
    plugins.entries = pEntries;
    config.plugins = plugins;
  }
  await writeOpenClawJson(config);
  console.log(
    `Set OpenClaw default model to "${model}" for provider "${provider}" (runtime override)`
  );
}
async function syncGatewayTokenToConfig(token) {
  const config = await readOpenClawJson();
  const gateway = config.gateway && typeof config.gateway === "object" ? { ...config.gateway } : {};
  const auth = gateway.auth && typeof gateway.auth === "object" ? { ...gateway.auth } : {};
  auth.mode = "token";
  auth.token = token;
  gateway.auth = auth;
  const controlUi = gateway.controlUi && typeof gateway.controlUi === "object" ? { ...gateway.controlUi } : {};
  const allowedOrigins = Array.isArray(controlUi.allowedOrigins) ? controlUi.allowedOrigins.filter((value) => typeof value === "string") : [];
  if (!allowedOrigins.includes("file://")) {
    controlUi.allowedOrigins = [...allowedOrigins, "file://"];
  }
  gateway.controlUi = controlUi;
  if (!gateway.mode) gateway.mode = "local";
  config.gateway = gateway;
  await writeOpenClawJson(config);
  console.log("Synced gateway token to openclaw.json");
}
async function syncBrowserConfigToOpenClaw() {
  const config = await readOpenClawJson();
  const browser = config.browser && typeof config.browser === "object" ? { ...config.browser } : {};
  let changed = false;
  if (browser.enabled === void 0) {
    browser.enabled = true;
    changed = true;
  }
  if (browser.defaultProfile === void 0) {
    browser.defaultProfile = "openclaw";
    changed = true;
  }
  if (!changed) return;
  config.browser = browser;
  await writeOpenClawJson(config);
  console.log("Synced browser config to openclaw.json");
}
async function updateAgentModelProvider(providerType, entry) {
  const agentIds = await discoverAgentIds();
  for (const agentId of agentIds) {
    const modelsPath = path.join(os.homedir(), ".openclaw", "agents", agentId, "agent", "models.json");
    let data = {};
    try {
      data = await readJsonFile(modelsPath) ?? {};
    } catch {
    }
    const providers = data.providers && typeof data.providers === "object" ? data.providers : {};
    const existing = providers[providerType] && typeof providers[providerType] === "object" ? { ...providers[providerType] } : {};
    const existingModels = Array.isArray(existing.models) ? existing.models : [];
    const mergedModels = (entry.models ?? []).map((m) => {
      const prev = existingModels.find((e) => e.id === m.id);
      return prev ? { ...prev, id: m.id, name: m.name } : { ...m };
    });
    if (entry.baseUrl !== void 0) existing.baseUrl = entry.baseUrl;
    if (entry.api !== void 0) existing.api = entry.api;
    if (mergedModels.length > 0) existing.models = mergedModels;
    if (entry.apiKey !== void 0) existing.apiKey = entry.apiKey;
    if (entry.authHeader !== void 0) existing.authHeader = entry.authHeader;
    providers[providerType] = existing;
    data.providers = providers;
    try {
      await writeJsonFile(modelsPath, data);
      console.log(`Updated models.json for agent "${agentId}" provider "${providerType}"`);
    } catch (err) {
      console.warn(`Failed to update models.json for agent "${agentId}":`, err);
    }
  }
}
async function sanitizeOpenClawConfig() {
  const config = await readOpenClawJson();
  let modified = false;
  const skills = config.skills;
  if (skills && typeof skills === "object" && !Array.isArray(skills)) {
    const skillsObj = skills;
    const KNOWN_INVALID_SKILLS_ROOT_KEYS = ["enabled", "disabled"];
    for (const key of KNOWN_INVALID_SKILLS_ROOT_KEYS) {
      if (key in skillsObj) {
        console.log(`[sanitize] Removing misplaced key "skills.${key}" from openclaw.json`);
        delete skillsObj[key];
        modified = true;
      }
    }
  }
  const plugins = config.plugins;
  if (plugins) {
    if (Array.isArray(plugins)) {
      const validPlugins = [];
      for (const p of plugins) {
        if (typeof p === "string" && p.startsWith("/")) {
          if (p.includes("node_modules/openclaw/extensions") || !await fileExists$2(p)) {
            console.log(`[sanitize] Removing stale/bundled plugin path "${p}" from openclaw.json`);
            modified = true;
          } else {
            validPlugins.push(p);
          }
        } else {
          validPlugins.push(p);
        }
      }
      if (modified) config.plugins = validPlugins;
    } else if (typeof plugins === "object") {
      const pluginsObj = plugins;
      if (Array.isArray(pluginsObj.load)) {
        const validLoad = [];
        for (const p of pluginsObj.load) {
          if (typeof p === "string" && p.startsWith("/")) {
            if (p.includes("node_modules/openclaw/extensions") || !await fileExists$2(p)) {
              console.log(`[sanitize] Removing stale/bundled plugin path "${p}" from openclaw.json`);
              modified = true;
            } else {
              validLoad.push(p);
            }
          } else {
            validLoad.push(p);
          }
        }
        if (modified) pluginsObj.load = validLoad;
      }
      if (Array.isArray(pluginsObj.allow)) {
        const allow = pluginsObj.allow;
        const allNonExisting = allow.length > 0 && allow.every(function(p) {
          return typeof p === "string" && !p.startsWith("/");
        });
        if (allNonExisting) {
          console.log("[sanitize] Clearing plugins.allow — all entries are external plugin names not bundled in openclaw");
          pluginsObj.allow = [];
          modified = true;
        }
      }
    }
  }
  const commands = config.commands && typeof config.commands === "object" ? { ...config.commands } : {};
  if (commands.restart !== true) {
    commands.restart = true;
    config.commands = commands;
    modified = true;
    console.log("[sanitize] Enabling commands.restart for graceful reload support");
  }
  const providers = config.models?.providers || {};
  if (providers[OPENCLAW_PROVIDER_KEY_MOONSHOT]) {
    const tools = config.tools || {};
    const web = tools.web || {};
    const search = web.search || {};
    const kimi = search.kimi || {};
    if ("apiKey" in kimi) {
      console.log('[sanitize] Removing stale key "tools.web.search.kimi.apiKey" from openclaw.json');
      delete kimi.apiKey;
      search.kimi = kimi;
      web.search = search;
      tools.web = web;
      config.tools = tools;
      modified = true;
    }
  }
  const toolsConfig = config.tools || {};
  let toolsModified = false;
  if (toolsConfig.profile !== "full") {
    toolsConfig.profile = "full";
    toolsModified = true;
  }
  const sessions = toolsConfig.sessions || {};
  if (sessions.visibility !== "all") {
    sessions.visibility = "all";
    toolsConfig.sessions = sessions;
    toolsModified = true;
  }
  if (toolsModified) {
    config.tools = toolsConfig;
    modified = true;
    console.log('[sanitize] Enforced tools.profile="full" and tools.sessions.visibility="all" for OpenClaw 3.8+');
  }
  if (typeof plugins === "object" && !Array.isArray(plugins)) {
    const pluginsObj = plugins;
    const pEntries = pluginsObj.entries;
    if (pEntries?.feishu) {
      console.log("[sanitize] Removing stale plugins.entries.feishu that blocks the official feishu plugin channel");
      delete pEntries.feishu;
      modified = true;
    }
  }
  const feishuSection = config.channels?.feishu;
  if (feishuSection) {
    const feishuAccounts = feishuSection.accounts;
    const defaultAccount = feishuAccounts?.default;
    if (defaultAccount?.appId && defaultAccount?.appSecret && !feishuSection.appId) {
      for (const [key, value] of Object.entries(defaultAccount)) {
        if (key !== "enabled" && !(key in feishuSection)) {
          feishuSection[key] = value;
        }
      }
      modified = true;
      console.log("[sanitize] Mirrored feishu default account credentials to top-level channels.feishu");
    }
  }
  if (modified) {
    await writeOpenClawJson(config);
    console.log("[sanitize] openclaw.json sanitized successfully");
  }
}
let providerStore = null;
async function getClawXProviderStore() {
  if (!providerStore) {
    const Store = (await import("electron-store")).default;
    providerStore = new Store({
      name: "clawx-providers",
      defaults: {
        schemaVersion: 0,
        providers: {},
        providerAccounts: {},
        apiKeys: {},
        providerSecrets: {},
        defaultProvider: null,
        defaultProviderAccountId: null
      }
    });
  }
  return providerStore;
}
const PROVIDER_STORE_SCHEMA_VERSION$1 = 1;
function inferAuthMode(type) {
  if (type === "ollama") {
    return "local";
  }
  const definition = getProviderDefinition(type);
  if (definition?.defaultAuthMode) {
    return definition.defaultAuthMode;
  }
  return "api_key";
}
function providerConfigToAccount(config, options) {
  return {
    id: config.id,
    vendorId: config.type,
    label: config.name,
    authMode: inferAuthMode(config.type),
    baseUrl: config.baseUrl,
    apiProtocol: config.apiProtocol || (config.type === "custom" || config.type === "ollama" ? "openai-completions" : getProviderDefinition(config.type)?.providerConfig?.api),
    model: config.model,
    fallbackModels: config.fallbackModels,
    fallbackAccountIds: config.fallbackProviderIds,
    enabled: config.enabled,
    isDefault: options?.isDefault ?? false,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt
  };
}
function providerAccountToConfig(account) {
  return {
    id: account.id,
    name: account.label,
    type: account.vendorId,
    baseUrl: account.baseUrl,
    apiProtocol: account.apiProtocol,
    model: account.model,
    fallbackModels: account.fallbackModels,
    fallbackProviderIds: account.fallbackAccountIds,
    enabled: account.enabled,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}
async function listProviderAccounts() {
  const store2 = await getClawXProviderStore();
  const accounts = store2.get("providerAccounts");
  return Object.values(accounts ?? {});
}
async function getProviderAccount(accountId) {
  const store2 = await getClawXProviderStore();
  const accounts = store2.get("providerAccounts");
  return accounts?.[accountId] ?? null;
}
async function saveProviderAccount(account) {
  const store2 = await getClawXProviderStore();
  const accounts = store2.get("providerAccounts") ?? {};
  accounts[account.id] = account;
  store2.set("providerAccounts", accounts);
  store2.set("schemaVersion", PROVIDER_STORE_SCHEMA_VERSION$1);
}
async function deleteProviderAccount(accountId) {
  const store2 = await getClawXProviderStore();
  const accounts = store2.get("providerAccounts") ?? {};
  delete accounts[accountId];
  store2.set("providerAccounts", accounts);
  if (store2.get("defaultProviderAccountId") === accountId) {
    store2.delete("defaultProviderAccountId");
  }
}
async function setDefaultProviderAccount(accountId) {
  const store2 = await getClawXProviderStore();
  store2.set("defaultProviderAccountId", accountId);
  const accounts = store2.get("providerAccounts") ?? {};
  for (const account of Object.values(accounts)) {
    account.isDefault = account.id === accountId;
  }
  store2.set("providerAccounts", accounts);
}
async function getDefaultProviderAccountId() {
  const store2 = await getClawXProviderStore();
  return store2.get("defaultProviderAccountId");
}
const PROVIDER_STORE_SCHEMA_VERSION = 1;
async function ensureProviderStoreMigrated() {
  const store2 = await getClawXProviderStore();
  const schemaVersion = Number(store2.get("schemaVersion") ?? 0);
  if (schemaVersion >= PROVIDER_STORE_SCHEMA_VERSION) {
    return;
  }
  const legacyProviders = store2.get("providers") ?? {};
  const defaultProviderId = store2.get("defaultProvider") ?? null;
  const existingDefaultAccountId = await getDefaultProviderAccountId();
  for (const provider of Object.values(legacyProviders)) {
    const account = providerConfigToAccount(provider, {
      isDefault: provider.id === defaultProviderId
    });
    await saveProviderAccount(account);
  }
  if (!existingDefaultAccountId && defaultProviderId) {
    store2.set("defaultProviderAccountId", defaultProviderId);
  }
  store2.set("schemaVersion", PROVIDER_STORE_SCHEMA_VERSION);
}
class ElectronStoreSecretStore {
  async get(accountId) {
    const store2 = await getClawXProviderStore();
    const secrets = store2.get("providerSecrets") ?? {};
    const secret = secrets[accountId];
    if (secret) {
      return secret;
    }
    const apiKeys = store2.get("apiKeys") ?? {};
    const apiKey = apiKeys[accountId];
    if (!apiKey) {
      return null;
    }
    return {
      type: "api_key",
      accountId,
      apiKey
    };
  }
  async set(secret) {
    const store2 = await getClawXProviderStore();
    const secrets = store2.get("providerSecrets") ?? {};
    secrets[secret.accountId] = secret;
    store2.set("providerSecrets", secrets);
    const apiKeys = store2.get("apiKeys") ?? {};
    if (secret.type === "api_key") {
      apiKeys[secret.accountId] = secret.apiKey;
    } else if (secret.type === "local") {
      if (secret.apiKey) {
        apiKeys[secret.accountId] = secret.apiKey;
      } else {
        delete apiKeys[secret.accountId];
      }
    } else {
      delete apiKeys[secret.accountId];
    }
    store2.set("apiKeys", apiKeys);
  }
  async delete(accountId) {
    const store2 = await getClawXProviderStore();
    const secrets = store2.get("providerSecrets") ?? {};
    delete secrets[accountId];
    store2.set("providerSecrets", secrets);
    const apiKeys = store2.get("apiKeys") ?? {};
    delete apiKeys[accountId];
    store2.set("apiKeys", apiKeys);
  }
}
const secretStore = new ElectronStoreSecretStore();
function getSecretStore() {
  return secretStore;
}
async function getProviderSecret(accountId) {
  return getSecretStore().get(accountId);
}
async function setProviderSecret(secret) {
  await getSecretStore().set(secret);
}
async function deleteProviderSecret(accountId) {
  await getSecretStore().delete(accountId);
}
async function storeApiKey(providerId, apiKey) {
  try {
    await ensureProviderStoreMigrated();
    const s = await getClawXProviderStore();
    const keys = s.get("apiKeys") || {};
    keys[providerId] = apiKey;
    s.set("apiKeys", keys);
    await setProviderSecret({
      type: "api_key",
      accountId: providerId,
      apiKey
    });
    return true;
  } catch (error2) {
    console.error("Failed to store API key:", error2);
    return false;
  }
}
async function getApiKey(providerId) {
  try {
    await ensureProviderStoreMigrated();
    const secret = await getProviderSecret(providerId);
    if (secret?.type === "api_key") {
      return secret.apiKey;
    }
    if (secret?.type === "local") {
      return secret.apiKey ?? null;
    }
    const s = await getClawXProviderStore();
    const keys = s.get("apiKeys") || {};
    return keys[providerId] || null;
  } catch (error2) {
    console.error("Failed to retrieve API key:", error2);
    return null;
  }
}
async function deleteApiKey(providerId) {
  try {
    await ensureProviderStoreMigrated();
    const s = await getClawXProviderStore();
    const keys = s.get("apiKeys") || {};
    delete keys[providerId];
    s.set("apiKeys", keys);
    await deleteProviderSecret(providerId);
    return true;
  } catch (error2) {
    console.error("Failed to delete API key:", error2);
    return false;
  }
}
async function hasApiKey(providerId) {
  await ensureProviderStoreMigrated();
  const secret = await getProviderSecret(providerId);
  if (secret?.type === "api_key") {
    return true;
  }
  const s = await getClawXProviderStore();
  const keys = s.get("apiKeys") || {};
  return providerId in keys;
}
async function saveProvider(config) {
  await ensureProviderStoreMigrated();
  const s = await getClawXProviderStore();
  const providers = s.get("providers");
  providers[config.id] = config;
  s.set("providers", providers);
  const defaultProviderId = s.get("defaultProvider") ?? null;
  await saveProviderAccount(
    providerConfigToAccount(config, { isDefault: defaultProviderId === config.id })
  );
}
async function getProvider(providerId) {
  await ensureProviderStoreMigrated();
  const s = await getClawXProviderStore();
  const providers = s.get("providers");
  if (providers[providerId]) {
    return providers[providerId];
  }
  const account = await getProviderAccount(providerId);
  return account ? providerAccountToConfig(account) : null;
}
async function getAllProviders() {
  await ensureProviderStoreMigrated();
  const s = await getClawXProviderStore();
  const providers = s.get("providers");
  const legacyProviders = Object.values(providers);
  if (legacyProviders.length > 0) {
    return legacyProviders;
  }
  const accounts = await listProviderAccounts();
  return accounts.map(providerAccountToConfig);
}
async function deleteProvider(providerId) {
  try {
    await ensureProviderStoreMigrated();
    await deleteApiKey(providerId);
    const s = await getClawXProviderStore();
    const providers = s.get("providers");
    delete providers[providerId];
    s.set("providers", providers);
    await deleteProviderAccount(providerId);
    if (s.get("defaultProvider") === providerId) {
      s.delete("defaultProvider");
      s.delete("defaultProviderAccountId");
    }
    return true;
  } catch (error2) {
    console.error("Failed to delete provider:", error2);
    return false;
  }
}
async function setDefaultProvider(providerId) {
  await ensureProviderStoreMigrated();
  const s = await getClawXProviderStore();
  s.set("defaultProvider", providerId);
  await setDefaultProviderAccount(providerId);
}
async function getDefaultProvider() {
  await ensureProviderStoreMigrated();
  const s = await getClawXProviderStore();
  return s.get("defaultProvider") ?? s.get("defaultProviderAccountId");
}
const UV_MIRROR_ENV = {
  UV_PYTHON_INSTALL_MIRROR: "https://registry.npmmirror.com/-/binary/python-build-standalone/",
  UV_INDEX_URL: "https://pypi.tuna.tsinghua.edu.cn/simple/"
};
const GOOGLE_204_HOST = "www.google.com";
const GOOGLE_204_PATH = "/generate_204";
const GOOGLE_204_TIMEOUT_MS = 2e3;
let cachedOptimized = null;
let cachedPromise = null;
let loggedOnce = false;
function getLocaleAndTimezone() {
  const locale = electron.app.getLocale?.() || "";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  return { locale, timezone };
}
function isRegionOptimized(locale, timezone) {
  if (timezone) return timezone === "Asia/Shanghai";
  return locale === "zh-CN";
}
function probeGoogle204(timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const req = https.request(
      {
        method: "GET",
        hostname: GOOGLE_204_HOST,
        path: GOOGLE_204_PATH
      },
      (res) => {
        const status = res.statusCode || 0;
        res.resume();
        finish(status >= 200 && status < 300);
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("google_204_timeout"));
    });
    req.on("error", () => finish(false));
    req.end();
  });
}
async function computeOptimization() {
  const { locale, timezone } = getLocaleAndTimezone();
  if (isRegionOptimized(locale, timezone)) {
    if (!loggedOnce) {
      logger.info(`Region optimization enabled via locale/timezone (locale=${locale || "unknown"}, tz=${timezone || "unknown"})`);
      loggedOnce = true;
    }
    return true;
  }
  const reachable = await probeGoogle204(GOOGLE_204_TIMEOUT_MS);
  const isOptimized = !reachable;
  if (!loggedOnce) {
    const reason = reachable ? "google_204_reachable" : "google_204_unreachable";
    logger.info(`Network optimization probe: ${reason} (locale=${locale || "unknown"}, tz=${timezone || "unknown"})`);
    loggedOnce = true;
  }
  return isOptimized;
}
async function shouldOptimizeNetwork() {
  if (cachedOptimized !== null) return cachedOptimized;
  if (cachedPromise) return cachedPromise;
  if (!electron.app.isReady()) {
    await electron.app.whenReady();
  }
  cachedPromise = computeOptimization().then((result) => {
    cachedOptimized = result;
    return result;
  }).catch((err) => {
    logger.warn("Network optimization check failed, defaulting to enabled:", err);
    cachedOptimized = true;
    return true;
  }).finally(() => {
    cachedPromise = null;
  });
  return cachedPromise;
}
async function getUvMirrorEnv() {
  const isOptimized = await shouldOptimizeNetwork();
  return isOptimized ? { ...UV_MIRROR_ENV } : {};
}
async function warmupNetworkOptimization() {
  try {
    await shouldOptimizeNetwork();
  } catch {
  }
}
function trimValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
function normalizeProxyServer(proxyServer) {
  const value = trimValue(proxyServer);
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `http://${value}`;
}
function resolveProxySettings(settings) {
  const legacyProxy = normalizeProxyServer(settings.proxyServer);
  const allProxy = normalizeProxyServer(settings.proxyAllServer);
  const httpProxy = normalizeProxyServer(settings.proxyHttpServer) || legacyProxy || allProxy;
  const httpsProxy = normalizeProxyServer(settings.proxyHttpsServer) || legacyProxy || allProxy;
  return {
    httpProxy,
    httpsProxy,
    allProxy: allProxy || legacyProxy,
    bypassRules: trimValue(settings.proxyBypassRules)
  };
}
function buildElectronProxyConfig(settings) {
  if (!settings.proxyEnabled) {
    return { mode: "direct" };
  }
  const resolved = resolveProxySettings(settings);
  const rules = [];
  if (resolved.httpProxy) {
    rules.push(`http=${resolved.httpProxy}`);
  }
  if (resolved.httpsProxy) {
    rules.push(`https=${resolved.httpsProxy}`);
  }
  const fallbackProxy = resolved.allProxy || resolved.httpsProxy || resolved.httpProxy;
  if (fallbackProxy) {
    rules.push(fallbackProxy);
  }
  if (rules.length === 0) {
    return { mode: "direct" };
  }
  return {
    mode: "fixed_servers",
    proxyRules: rules.join(";"),
    ...resolved.bypassRules ? { proxyBypassRules: resolved.bypassRules } : {}
  };
}
function buildProxyEnv(settings) {
  const blank = {
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NO_PROXY: "",
    no_proxy: ""
  };
  if (!settings.proxyEnabled) {
    return blank;
  }
  const resolved = resolveProxySettings(settings);
  const noProxy = resolved.bypassRules.split(/[,\n;]/).map((rule) => rule.trim()).filter(Boolean).join(",");
  return {
    HTTP_PROXY: resolved.httpProxy,
    HTTPS_PROXY: resolved.httpsProxy,
    ALL_PROXY: resolved.allProxy,
    http_proxy: resolved.httpProxy,
    https_proxy: resolved.httpsProxy,
    all_proxy: resolved.allProxy,
    NO_PROXY: noProxy,
    no_proxy: noProxy
  };
}
async function syncProxyConfigToOpenClaw(settings) {
  const config = await readOpenClawConfig();
  const telegramConfig = config.channels?.telegram;
  if (!telegramConfig) {
    return;
  }
  const resolved = resolveProxySettings(settings);
  const nextProxy = settings.proxyEnabled ? resolved.allProxy || resolved.httpsProxy || resolved.httpProxy : "";
  const currentProxy = typeof telegramConfig.proxy === "string" ? telegramConfig.proxy : "";
  if (!nextProxy && !currentProxy) {
    return;
  }
  if (!config.channels) {
    config.channels = {};
  }
  config.channels.telegram = {
    ...telegramConfig
  };
  if (nextProxy) {
    config.channels.telegram.proxy = nextProxy;
  } else {
    delete config.channels.telegram.proxy;
  }
  await writeOpenClawConfig(config);
  logger.info(`Synced Telegram proxy to OpenClaw config (${nextProxy || "disabled"})`);
}
async function syncGatewayConfigBeforeLaunch(appSettings) {
  await syncProxyConfigToOpenClaw(appSettings);
  try {
    await sanitizeOpenClawConfig();
  } catch (err) {
    logger.warn("Failed to sanitize openclaw.json:", err);
  }
  try {
    await syncGatewayTokenToConfig(appSettings.gatewayToken);
  } catch (err) {
    logger.warn("Failed to sync gateway token to openclaw.json:", err);
  }
  try {
    await syncBrowserConfigToOpenClaw();
  } catch (err) {
    logger.warn("Failed to sync browser config to openclaw.json:", err);
  }
}
async function loadProviderEnv() {
  const providerEnv = {};
  const providerTypes = getKeyableProviderTypes();
  let loadedProviderKeyCount = 0;
  try {
    const defaultProviderId = await getDefaultProvider();
    if (defaultProviderId) {
      const defaultProvider = await getProvider(defaultProviderId);
      const defaultProviderType = defaultProvider?.type;
      const defaultProviderKey = await getApiKey(defaultProviderId);
      if (defaultProviderType && defaultProviderKey) {
        const envVar = getProviderEnvVar(defaultProviderType);
        if (envVar) {
          providerEnv[envVar] = defaultProviderKey;
          loadedProviderKeyCount++;
        }
      }
    }
  } catch (err) {
    logger.warn("Failed to load default provider key for environment injection:", err);
  }
  for (const providerType of providerTypes) {
    try {
      const key = await getApiKey(providerType);
      if (key) {
        const envVar = getProviderEnvVar(providerType);
        if (envVar) {
          providerEnv[envVar] = key;
          loadedProviderKeyCount++;
        }
      }
    } catch (err) {
      logger.warn(`Failed to load API key for ${providerType}:`, err);
    }
  }
  return { providerEnv, loadedProviderKeyCount };
}
async function resolveChannelStartupPolicy() {
  try {
    const configuredChannels = await listConfiguredChannels();
    if (configuredChannels.length === 0) {
      return {
        skipChannels: true,
        channelStartupSummary: "skipped(no configured channels)"
      };
    }
    return {
      skipChannels: false,
      channelStartupSummary: `enabled(${configuredChannels.join(",")})`
    };
  } catch (error2) {
    logger.warn("Failed to determine configured channels for gateway launch:", error2);
    return {
      skipChannels: false,
      channelStartupSummary: "enabled(unknown)"
    };
  }
}
async function prepareGatewayLaunchContext(port) {
  const openclawDir = getOpenClawDir();
  const entryScript = getOpenClawEntryPath();
  if (!isOpenClawPresent()) {
    throw new Error(`OpenClaw package not found at: ${openclawDir}`);
  }
  const appSettings = await getAllSettings();
  await syncGatewayConfigBeforeLaunch(appSettings);
  if (!fs.existsSync(entryScript)) {
    throw new Error(`OpenClaw entry script not found at: ${entryScript}`);
  }
  if (appSettings.gatewayMode === "remote") {
      const { RemoteNodeManager } = require("./remote-node/index");
      const remoteNode = new RemoteNodeManager({
        gatewayHost: appSettings.gatewayHost,
        gatewayPort: appSettings.gatewayPort,
        gatewayToken: appSettings.gatewayToken,
      });
      remoteNode.on("statusChanged", (s) => {
        electron.ipcMain.emit("remoteNode:statusChanged", s);
      });
      remoteNode.start();
      electron.ipcMain.handle("remoteNode:status", () => remoteNode.getStatus());
      electron.ipcMain.handle("remoteNode:nodeId", () => remoteNode.getNodeId());
      return;
    }
  const gatewayArgs = ["gateway", "--port", String(port), "--token", appSettings.gatewayToken, "--allow-unconfigured"];
  const mode = electron.app.isPackaged ? "packaged" : "dev";
  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binPath = electron.app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(process.cwd(), "resources", "bin", target);
  const binPathExists = fs.existsSync(binPath);
  const finalPath = binPathExists ? `${binPath}${path.delimiter}${process.env.PATH || ""}` : process.env.PATH || "";
  const { providerEnv, loadedProviderKeyCount } = await loadProviderEnv();
  const { skipChannels, channelStartupSummary } = await resolveChannelStartupPolicy();
  const uvEnv = await getUvMirrorEnv();
  const proxyEnv = buildProxyEnv(appSettings);
  const resolvedProxy = resolveProxySettings(appSettings);
  const proxySummary = appSettings.proxyEnabled ? `http=${resolvedProxy.httpProxy || "-"}, https=${resolvedProxy.httpsProxy || "-"}, all=${resolvedProxy.allProxy || "-"}` : "disabled";
  const { NODE_OPTIONS: _nodeOptions, ...baseEnv } = process.env;
  const forkEnv = {
    ...baseEnv,
    PATH: finalPath,
    ...providerEnv,
    ...uvEnv,
    ...proxyEnv,
    OPENCLAW_GATEWAY_TOKEN: appSettings.gatewayToken,
    OPENCLAW_SKIP_CHANNELS: skipChannels ? "1" : "",
    CLAWDBOT_SKIP_CHANNELS: skipChannels ? "1" : "",
    OPENCLAW_NO_RESPAWN: "1"
  };
  return {
    appSettings,
    openclawDir,
    entryScript,
    gatewayArgs,
    forkEnv,
    mode,
    binPathExists,
    loadedProviderKeyCount,
    proxySummary,
    channelStartupSummary
  };
}
async function probeGatewayReady(port, host = "127.0.0.1", timeoutMs = 1500) {
  return await new Promise((resolve) => {
    const testWs = new WebSocket(`ws://${host}:${port}/ws`);
    let settled = false;
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        testWs.close();
      } catch {
      }
      resolve(value);
    };
    const timeout = setTimeout(() => {
      resolveOnce(false);
    }, timeoutMs);
    testWs.on("open", () => {
    });
    testWs.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "event" && message.event === "connect.challenge") {
          resolveOnce(true);
        }
      } catch {
      }
    });
    testWs.on("error", () => {
      resolveOnce(false);
    });
    testWs.on("close", () => {
      resolveOnce(false);
    });
  });
}
async function waitForGatewayReady(options) {
  const retries = options.retries ?? 2400;
  const intervalMs = options.intervalMs ?? 200;
  const host = options.host || "127.0.0.1";
  for (let i = 0; i < retries; i++) {
    const exitCode = options.getProcessExitCode();
    if (exitCode !== null) {
      logger.error(`Gateway process exited before ready (code=${exitCode})`);
      throw new Error(`Gateway process exited before becoming ready (code=${exitCode})`);
    }
    try {
      const ready = await probeGatewayReady(options.port, host, 1500);
      if (ready) {
        logger.debug(`Gateway ready after ${i + 1} attempt(s)`);
        return;
      }
    } catch {
    }
    if (i > 0 && i % 10 === 0) {
      logger.debug(`Still waiting for Gateway... (attempt ${i + 1}/${retries})`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  logger.error(`Gateway failed to become ready after ${retries} attempts on port ${options.port}`);
  throw new Error(`Gateway failed to start after ${retries} retries (port ${options.port})`);
}
function buildGatewayConnectFrame(options) {
  const connectId = `connect-${Date.now()}`;
  const role = "operator";
  const scopes = ["operator.admin"];
  const signedAtMs = Date.now();
  const clientId = "gateway-client";
  const clientMode = "ui";
  const device = (() => {
    if (!options.deviceIdentity) return void 0;
    const payload = buildDeviceAuthPayload({
      deviceId: options.deviceIdentity.deviceId,
      clientId,
      clientMode,
      role,
      scopes,
      signedAtMs,
      token: options.token ?? null,
      nonce: options.challengeNonce
    });
    const signature = signDevicePayload(options.deviceIdentity.privateKeyPem, payload);
    return {
      id: options.deviceIdentity.deviceId,
      publicKey: publicKeyRawBase64UrlFromPem(options.deviceIdentity.publicKeyPem),
      signature,
      signedAt: signedAtMs,
      nonce: options.challengeNonce
    };
  })();
  return {
    connectId,
    frame: {
      type: "req",
      id: connectId,
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: clientId,
          displayName: "ClawX",
          version: "0.1.0",
          platform: options.platform,
          mode: clientMode
        },
        auth: {
          token: options.token
        },
        caps: [],
        role,
        scopes,
        device
      }
    }
  };
}
async function connectGatewaySocket(options) {
  const host = options.host || "127.0.0.1";
  logger.debug(`Connecting Gateway WebSocket (ws://${host}:${options.port}/ws)`);
  return await new Promise((resolve, reject) => {
    const wsUrl = `ws://${host}:${options.port}/ws`;
    const ws = new WebSocket(wsUrl);
    let handshakeComplete = false;
    let connectId = null;
    let handshakeTimeout = null;
    let challengeTimer = null;
    let challengeReceived = false;
    let settled = false;
    const cleanupHandshakeRequest = () => {
      if (challengeTimer) {
        clearTimeout(challengeTimer);
        challengeTimer = null;
      }
      if (handshakeTimeout) {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
      }
      if (connectId && options.pendingRequests.has(connectId)) {
        const request = options.pendingRequests.get(connectId);
        if (request) {
          clearTimeout(request.timeout);
        }
        options.pendingRequests.delete(connectId);
      }
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanupHandshakeRequest();
      resolve(ws);
    };
    const rejectOnce = (error2) => {
      if (settled) return;
      settled = true;
      cleanupHandshakeRequest();
      reject(error2 instanceof Error ? error2 : new Error(String(error2)));
    };
    const sendConnectHandshake = async (challengeNonce) => {
      logger.debug("Sending connect handshake with challenge nonce");
      const currentToken = await options.getToken();
      const connectPayload = buildGatewayConnectFrame({
        challengeNonce,
        token: currentToken,
        deviceIdentity: options.deviceIdentity,
        platform: options.platform
      });
      connectId = connectPayload.connectId;
      ws.send(JSON.stringify(connectPayload.frame));
      const requestTimeout = setTimeout(() => {
        if (!handshakeComplete) {
          logger.error("Gateway connect handshake timed out");
          ws.close();
          rejectOnce(new Error("Connect handshake timeout"));
        }
      }, 1e4);
      handshakeTimeout = requestTimeout;
      options.pendingRequests.set(connectId, {
        resolve: () => {
          handshakeComplete = true;
          logger.debug("Gateway connect handshake completed");
          options.onHandshakeComplete(ws);
          resolveOnce();
        },
        reject: (error2) => {
          logger.error("Gateway connect handshake failed:", error2);
          rejectOnce(error2);
        },
        timeout: requestTimeout
      });
    };
    challengeTimer = setTimeout(() => {
      if (!challengeReceived && !settled) {
        logger.error("Gateway connect.challenge not received within timeout");
        ws.close();
        rejectOnce(new Error("Timed out waiting for connect.challenge from Gateway"));
      }
    }, 1e4);
    ws.on("open", () => {
      logger.debug("Gateway WebSocket opened, waiting for connect.challenge...");
    });
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (!challengeReceived && typeof message === "object" && message !== null && message.type === "event" && message.event === "connect.challenge") {
          challengeReceived = true;
          if (challengeTimer) {
            clearTimeout(challengeTimer);
            challengeTimer = null;
          }
          const nonce = message.payload?.nonce;
          if (!nonce) {
            rejectOnce(new Error("Gateway connect.challenge missing nonce"));
            return;
          }
          logger.debug("Received connect.challenge, sending handshake");
          void sendConnectHandshake(nonce);
          return;
        }
        options.onMessage(message);
      } catch (error2) {
        logger.debug("Failed to parse Gateway WebSocket message:", error2);
      }
    });
    ws.on("close", (code, reason) => {
      const reasonStr = reason?.toString() || "unknown";
      logger.warn(`Gateway WebSocket closed (code=${code}, reason=${reasonStr}, handshake=${handshakeComplete ? "ok" : "pending"})`);
      if (!handshakeComplete) {
        rejectOnce(new Error(`WebSocket closed before handshake: ${reasonStr}`));
        return;
      }
      cleanupHandshakeRequest();
      options.onCloseAfterHandshake();
    });
    ws.on("error", (error2) => {
      if (error2.message?.includes("closed before handshake") || error2.code === "ECONNREFUSED") {
        logger.debug(`Gateway WebSocket connection error (transient): ${error2.message}`);
      } else {
        logger.error("Gateway WebSocket error:", error2);
      }
      if (!handshakeComplete) {
        rejectOnce(error2);
      }
    });
  });
}
function getBundledUvPath() {
  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binName = platform === "win32" ? "uv.exe" : "uv";
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "bin", binName);
  } else {
    return path.join(process.cwd(), "resources", "bin", target, binName);
  }
}
function resolveUvBin() {
  const bundled = getBundledUvPath();
  if (electron.app.isPackaged) {
    if (fs.existsSync(bundled)) {
      return { bin: bundled, source: "bundled" };
    }
    logger.warn(`Bundled uv binary not found at ${bundled}, falling back to system PATH`);
  }
  const found = findUvInPathSync();
  if (found) return { bin: "uv", source: "path" };
  if (fs.existsSync(bundled)) {
    return { bin: bundled, source: "bundled-fallback" };
  }
  return { bin: "uv", source: "path" };
}
function findUvInPathSync() {
  try {
    const cmd = process.platform === "win32" ? "where.exe uv" : "which uv";
    require$$0.execSync(cmd, { stdio: "ignore", timeout: 5e3, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}
async function checkUvInstalled() {
  const { bin, source } = resolveUvBin();
  if (source === "bundled" || source === "bundled-fallback") {
    return fs.existsSync(bin);
  }
  return findUvInPathSync();
}
async function installUv() {
  const isAvailable = await checkUvInstalled();
  if (!isAvailable) {
    const bin = getBundledUvPath();
    throw new Error(`uv not found in system PATH and bundled binary missing at ${bin}`);
  }
  logger.info("uv is available and ready to use");
}
async function isPythonReady() {
  const { bin: uvBin } = resolveUvBin();
  const useShell = needsWinShell(uvBin);
  return new Promise((resolve) => {
    try {
      const child = require$$0.spawn(useShell ? quoteForCmd(uvBin) : uvBin, ["python", "find", "3.12"], {
        shell: useShell,
        windowsHide: true
      });
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
async function runPythonInstall(uvBin, env, label) {
  const useShell = needsWinShell(uvBin);
  return new Promise((resolve, reject) => {
    const stderrChunks = [];
    const stdoutChunks = [];
    const child = require$$0.spawn(useShell ? quoteForCmd(uvBin) : uvBin, ["python", "install", "3.12"], {
      shell: useShell,
      env,
      windowsHide: true
    });
    child.stdout?.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        stdoutChunks.push(line);
        logger.debug(`[python-setup:${label}] stdout: ${line}`);
      }
    });
    child.stderr?.on("data", (data) => {
      const line = data.toString().trim();
      if (line) {
        stderrChunks.push(line);
        logger.info(`[python-setup:${label}] stderr: ${line}`);
      }
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const stderr = stderrChunks.join("\n");
        const stdout = stdoutChunks.join("\n");
        const detail = stderr || stdout || "(no output captured)";
        reject(new Error(
          `Python installation failed with code ${code} [${label}]
  uv binary: ${uvBin}
  platform: ${process.platform}/${process.arch}
  output: ${detail}`
        ));
      }
    });
    child.on("error", (err) => {
      reject(new Error(
        `Python installation spawn error [${label}]: ${err.message}
  uv binary: ${uvBin}
  platform: ${process.platform}/${process.arch}`
      ));
    });
  });
}
async function setupManagedPython() {
  const { bin: uvBin, source } = resolveUvBin();
  const uvEnv = await getUvMirrorEnv();
  const hasMirror = Object.keys(uvEnv).length > 0;
  logger.info(
    `Setting up managed Python 3.12 (uv=${uvBin}, source=${source}, arch=${process.arch}, mirror=${hasMirror})`
  );
  const baseEnv = { ...process.env };
  try {
    await runPythonInstall(uvBin, { ...baseEnv, ...uvEnv }, hasMirror ? "mirror" : "default");
  } catch (firstError) {
    logger.warn("Python install attempt 1 failed:", firstError);
    if (hasMirror) {
      logger.info("Retrying Python install without mirror...");
      try {
        await runPythonInstall(uvBin, baseEnv, "no-mirror");
      } catch (secondError) {
        logger.error("Python install attempt 2 (no mirror) also failed:", secondError);
        throw secondError;
      }
    } else {
      throw firstError;
    }
  }
  const verifyShell = needsWinShell(uvBin);
  try {
    const findPath = await new Promise((resolve) => {
      const child = require$$0.spawn(verifyShell ? quoteForCmd(uvBin) : uvBin, ["python", "find", "3.12"], {
        shell: verifyShell,
        env: { ...process.env, ...uvEnv },
        windowsHide: true
      });
      let output = "";
      child.stdout?.on("data", (data) => {
        output += data;
      });
      child.on("close", () => resolve(output.trim()));
    });
    if (findPath) {
      logger.info(`Managed Python 3.12 installed at: ${findPath}`);
    }
  } catch (err) {
    logger.warn("Could not determine Python path after install:", err);
  }
}
function warmupManagedPythonReadiness() {
  void Promise.all([isPythonReady(), checkUvInstalled()]).then(([pythonReady, uvInstalled]) => {
    if (pythonReady) {
      return;
    }
    if (!uvInstalled) {
      logger.info("Skipping background Python repair because uv is not available.");
      return;
    }
    logger.info("Python environment missing or incomplete, attempting background repair...");
    void setupManagedPython().catch((err) => {
      logger.error("Background Python repair failed:", err);
    });
  }).catch((err) => {
    logger.error("Failed to check Python environment:", err);
  });
}
async function terminateOwnedGatewayProcess(child) {
  let exited = false;
  await new Promise((resolve) => {
    child.once("exit", () => {
      exited = true;
      resolve();
    });
    const pid = child.pid;
    logger.info(`Sending kill to Gateway process (pid=${pid ?? "unknown"})`);
    try {
      child.kill();
    } catch {
    }
    const timeout = setTimeout(() => {
      if (!exited) {
        logger.warn(`Gateway did not exit in time, force-killing (pid=${pid ?? "unknown"})`);
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
          }
        }
      }
      resolve();
    }, 5e3);
    child.once("exit", () => {
      clearTimeout(timeout);
    });
  });
}
async function unloadLaunchctlGatewayService() {
  if (process.platform !== "darwin") return;
  try {
    const uid = process.getuid?.();
    if (uid === void 0) return;
    const launchdLabel = "ai.openclaw.gateway";
    const serviceTarget = `gui/${uid}/${launchdLabel}`;
    const cp = await import("child_process");
    const fsPromises = await import("fs/promises");
    const os2 = await import("os");
    const loaded = await new Promise((resolve) => {
      cp.exec(`launchctl print ${serviceTarget}`, { timeout: 5e3 }, (err) => {
        resolve(!err);
      });
    });
    if (!loaded) return;
    logger.info(`Unloading launchctl service ${serviceTarget} to prevent auto-respawn`);
    await new Promise((resolve) => {
      cp.exec(`launchctl bootout ${serviceTarget}`, { timeout: 1e4 }, (err) => {
        if (err) {
          logger.warn(`Failed to bootout launchctl service: ${err.message}`);
        } else {
          logger.info("Successfully unloaded launchctl gateway service");
        }
        resolve();
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    try {
      const plistPath = path.join(os2.homedir(), "Library", "LaunchAgents", `${launchdLabel}.plist`);
      await fsPromises.access(plistPath);
      await fsPromises.unlink(plistPath);
      logger.info(`Removed legacy launchd plist to prevent reload on next login: ${plistPath}`);
    } catch {
    }
  } catch (err) {
    logger.warn("Error while unloading launchctl gateway service:", err);
  }
}
async function waitForPortFree(port, timeoutMs = 3e4) {
  const net = await import("net");
  const start = Date.now();
  const pollInterval = 500;
  let logged = false;
  while (Date.now() - start < timeoutMs) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port, "127.0.0.1");
    });
    if (available) {
      const elapsed = Date.now() - start;
      if (elapsed > pollInterval) {
        logger.info(`Port ${port} became available after ${elapsed}ms`);
      }
      return;
    }
    if (!logged) {
      logger.info(`Waiting for port ${port} to become available (Windows TCP TIME_WAIT)...`);
      logged = true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  logger.warn(`Port ${port} still occupied after ${timeoutMs}ms, proceeding anyway`);
}
async function getListeningProcessIds(port) {
  const cmd = process.platform === "win32" ? `netstat -ano | findstr :${port}` : `lsof -i :${port} -sTCP:LISTEN -t`;
  const cp = await import("child_process");
  const { stdout } = await new Promise((resolve) => {
    cp.exec(cmd, { timeout: 5e3, windowsHide: true }, (err, stdout2) => {
      if (err) {
        resolve({ stdout: "" });
      } else {
        resolve({ stdout: stdout2 });
      }
    });
  });
  if (!stdout.trim()) {
    return [];
  }
  if (process.platform === "win32") {
    const pids = [];
    for (const line of stdout.trim().split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[3] === "LISTENING") {
        pids.push(parts[4]);
      }
    }
    return [...new Set(pids)];
  }
  return [...new Set(stdout.trim().split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
}
async function terminateOrphanedProcessIds(port, pids) {
  logger.info(`Found orphaned process listening on port ${port} (PIDs: ${pids.join(", ")}), attempting to kill...`);
  if (process.platform === "darwin") {
    await unloadLaunchctlGatewayService();
  }
  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        const cp = await import("child_process");
        await new Promise((resolve) => {
          cp.exec(
            `taskkill /F /PID ${pid} /T`,
            { timeout: 5e3, windowsHide: true },
            () => resolve()
          );
        });
      } else {
        process.kill(parseInt(pid, 10), "SIGTERM");
      }
    } catch {
    }
  }
  await new Promise((resolve) => setTimeout(resolve, process.platform === "win32" ? 2e3 : 3e3));
  if (process.platform !== "win32") {
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 0);
        process.kill(parseInt(pid, 10), "SIGKILL");
      } catch {
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
}
function isLocalHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "0.0.0.0";
}
async function findExistingGatewayProcess(options) {
  const { port, host = "127.0.0.1", ownedPid } = options;
  try {
    if (isLocalHost(host)) {
      try {
        const pids = await getListeningProcessIds(port);
        if (pids.length > 0 && (!ownedPid || !pids.includes(String(ownedPid)))) {
          await terminateOrphanedProcessIds(port, pids);
          return null;
        }
      } catch (err) {
        logger.warn("Error checking for existing process on port:", err);
      }
    }
    return await new Promise((resolve) => {
      const testWs = new WebSocket(`ws://${host}:${port}/ws`);
      const timeout = setTimeout(() => {
        testWs.close();
        resolve(null);
      }, 2e3);
      testWs.on("open", () => {
        clearTimeout(timeout);
        testWs.close();
        resolve({ port });
      });
      testWs.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}
async function runOpenClawDoctorRepair() {
  const openclawDir = getOpenClawDir();
  const entryScript = getOpenClawEntryPath();
  if (!fs.existsSync(entryScript)) {
    logger.error(`Cannot run OpenClaw doctor repair: entry script not found at ${entryScript}`);
    return false;
  }
  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binPath = electron.app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(process.cwd(), "resources", "bin", target);
  const binPathExists = fs.existsSync(binPath);
  const finalPath = binPathExists ? `${binPath}${path.delimiter}${process.env.PATH || ""}` : process.env.PATH || "";
  const uvEnv = await getUvMirrorEnv();
  const doctorArgs = ["doctor", "--fix", "--yes", "--non-interactive"];
  logger.info(
    `Running OpenClaw doctor repair (entry="${entryScript}", args="${doctorArgs.join(" ")}", cwd="${openclawDir}", bundledBin=${binPathExists ? "yes" : "no"})`
  );
  return await new Promise((resolve) => {
    const forkEnv = {
      ...process.env,
      PATH: finalPath,
      ...uvEnv,
      OPENCLAW_NO_RESPAWN: "1"
    };
    const child = electron.utilityProcess.fork(entryScript, doctorArgs, {
      cwd: openclawDir,
      stdio: "pipe",
      env: forkEnv
    });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timeout = setTimeout(() => {
      logger.error("OpenClaw doctor repair timed out after 120000ms");
      try {
        child.kill();
      } catch {
      }
      finish(false);
    }, 12e4);
    child.on("error", (err) => {
      clearTimeout(timeout);
      logger.error("Failed to spawn OpenClaw doctor repair process:", err);
      finish(false);
    });
    child.stdout?.on("data", (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        logger.debug(`[Gateway doctor stdout] ${normalized}`);
      }
    });
    child.stderr?.on("data", (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        logger.warn(`[Gateway doctor stderr] ${normalized}`);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        logger.info("OpenClaw doctor repair completed successfully");
        finish(true);
        return;
      }
      logger.warn(`OpenClaw doctor repair exited (code=${code})`);
      finish(false);
    });
  });
}
class GatewayConnectionMonitor {
  pingInterval = null;
  healthCheckInterval = null;
  startPing(sendPing, intervalMs = 3e4) {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = setInterval(() => {
      sendPing();
    }, intervalMs);
  }
  startHealthCheck(options) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.healthCheckInterval = setInterval(async () => {
      if (!options.shouldCheck()) {
        return;
      }
      try {
        const health = await options.checkHealth();
        if (!health.ok) {
          const errorMessage = health.error ?? "Health check failed";
          logger.warn(`Gateway health check failed: ${errorMessage}`);
          options.onUnhealthy(errorMessage);
        }
      } catch (error2) {
        logger.error("Gateway health check error:", error2);
        options.onError(child, error2);
      }
    }, options.intervalMs ?? 3e4);
  }
  clear() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}
class LifecycleSupersededError extends Error {
  constructor(message) {
    super(message);
    this.name = "LifecycleSupersededError";
  }
}
class GatewayLifecycleController {
  epoch = 0;
  getCurrentEpoch() {
    return this.epoch;
  }
  bump(reason) {
    this.epoch = nextLifecycleEpoch(this.epoch);
    logger.debug(`Gateway lifecycle epoch advanced to ${this.epoch} (${reason})`);
    return this.epoch;
  }
  assert(expectedEpoch, phase) {
    if (isLifecycleSuperseded(expectedEpoch, this.epoch)) {
      throw new LifecycleSupersededError(
        `Gateway ${phase} superseded (expectedEpoch=${expectedEpoch}, currentEpoch=${this.epoch})`
      );
    }
  }
}
const GATEWAY_FETCH_PRELOAD_SOURCE = `'use strict';
(function () {
  var _f = globalThis.fetch;
  if (typeof _f !== 'function') return;
  if (globalThis.__clawxFetchPatched) return;
  globalThis.__clawxFetchPatched = true;

  globalThis.fetch = function clawxFetch(input, init) {
    var url =
      typeof input === 'string' ? input
        : input && typeof input === 'object' && typeof input.url === 'string'
          ? input.url : '';

    if (url.indexOf('openrouter.ai') !== -1) {
      init = init ? Object.assign({}, init) : {};
      var prev = init.headers;
      var flat = {};
      if (prev && typeof prev.forEach === 'function') {
        prev.forEach(function (v, k) { flat[k] = v; });
      } else if (prev && typeof prev === 'object') {
        Object.assign(flat, prev);
      }
      delete flat['http-referer'];
      delete flat['HTTP-Referer'];
      delete flat['x-title'];
      delete flat['X-Title'];
      flat['HTTP-Referer'] = 'https://claw-x.com';
      flat['X-Title'] = 'ClawX';
      init.headers = flat;
    }
    return _f.call(globalThis, input, init);
  };

  if (process.platform === 'win32') {
    try {
      var cp = require('child_process');
      if (!cp.__clawxPatched) {
        cp.__clawxPatched = true;
        ['spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync'].forEach(function(method) {
          var original = cp[method];
          if (typeof original !== 'function') return;
          cp[method] = function() {
            var args = Array.prototype.slice.call(arguments);
            var optIdx = -1;
            for (var i = 1; i < args.length; i++) {
              var a = args[i];
              if (a && typeof a === 'object' && !Array.isArray(a)) {
                optIdx = i;
                break;
              }
            }
            if (optIdx >= 0) {
              args[optIdx].windowsHide = true;
            } else {
              var opts = { windowsHide: true };
              if (typeof args[args.length - 1] === 'function') {
                args.splice(args.length - 1, 0, opts);
              } else {
                args.push(opts);
              }
            }
            return original.apply(this, args);
          };
        });
      }
    } catch (e) {
      // ignore
    }
  }
})();
`;
function ensureGatewayFetchPreload() {
  const dest = path.join(electron.app.getPath("userData"), "gateway-fetch-preload.cjs");
  try {
    fs.writeFileSync(dest, GATEWAY_FETCH_PRELOAD_SOURCE, "utf-8");
  } catch {
  }
  return dest;
}
async function launchGatewayProcess(options) {
  const {
    openclawDir,
    entryScript,
    gatewayArgs,
    forkEnv,
    mode,
    binPathExists,
    loadedProviderKeyCount,
    proxySummary,
    channelStartupSummary
  } = options.launchContext;
  logger.info(
    `Starting Gateway process (mode=${mode}, port=${options.port}, entry="${entryScript}", args="${options.sanitizeSpawnArgs(gatewayArgs).join(" ")}", cwd="${openclawDir}", bundledBin=${binPathExists ? "yes" : "no"}, providerKeys=${loadedProviderKeyCount}, channels=${channelStartupSummary}, proxy=${proxySummary})`
  );
  const lastSpawnSummary = `mode=${mode}, entry="${entryScript}", args="${options.sanitizeSpawnArgs(gatewayArgs).join(" ")}", cwd="${openclawDir}"`;
  const runtimeEnv = { ...forkEnv };
  if (!electron.app.isPackaged) {
    try {
      const preloadPath = ensureGatewayFetchPreload();
      if (fs.existsSync(preloadPath)) {
        runtimeEnv.NODE_OPTIONS = appendNodeRequireToNodeOptions(
          runtimeEnv.NODE_OPTIONS,
          preloadPath
        );
      }
    } catch (err) {
      logger.warn("Failed to set up OpenRouter headers preload:", err);
    }
  }
  return await new Promise((resolve, reject) => {
    // Use bundled Node.js 22 binary instead of utilityProcess (which uses Electron's Node v20)
    // openclaw requires Node.js v22.12+
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const bundledNodeBase = electron.app.isPackaged ? path.join(process.resourcesPath, "bin", `node-${arch}`) : path.join(process.cwd(), "build", "bin", `node-${arch}`);
    const bundledNodeCandidates = process.platform === "win32" ? [`${bundledNodeBase}.exe`, bundledNodeBase] : [bundledNodeBase];
    const bundledNodeBin = bundledNodeCandidates.find((candidate) => fs.existsSync(candidate));
    const nodeBin = bundledNodeBin ?? process.execPath;
    const isElectronFallback = nodeBin === process.execPath;
    if (isElectronFallback) {
      runtimeEnv.ELECTRON_RUN_AS_NODE = runtimeEnv.ELECTRON_RUN_AS_NODE || "1";
    }
    logger.info(`Gateway runtime binary resolved: "${nodeBin}" (fallback=${isElectronFallback ? "yes" : "no"})`);
    const child = require$$0.spawn(nodeBin, [entryScript, ...gatewayArgs], {
      cwd: openclawDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: runtimeEnv,
      windowsHide: true
    });
    let settled = false;
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolve({ child, lastSpawnSummary });
    };
    const rejectOnce = (error2) => {
      if (settled) return;
      settled = true;
      reject(error2);
    };
    child.on("error", (error2) => {
      logger.error("Gateway process spawn error:", error2);
      options.onError(error2);
      rejectOnce(error2);
    });
    child.on("exit", (code) => {
      const expectedExit = !options.getShouldReconnect() || options.getCurrentState() === "stopped";
      const level = expectedExit ? logger.info : logger.warn;
      level(`Gateway process exited (code=${code}, expected=${expectedExit ? "yes" : "no"})`);
      options.onExit(child, code);
    });
    child.stderr?.on("data", (data) => {
      const raw = data.toString();
      for (const line of raw.split(/\r?\n/)) {
        options.onStderrLine(line);
      }
    });
    child.on("spawn", () => {
      logger.info(`Gateway process started (pid=${child.pid})`);
      options.onSpawn(child.pid);
      resolveOnce();
    });
  });
}
class GatewayRestartController {
  deferredRestartPending = false;
  restartDebounceTimer = null;
  isRestartDeferred(context) {
    return shouldDeferRestart(context);
  }
  markDeferredRestart(reason, context) {
    if (!this.deferredRestartPending) {
      logger.info(
        `Deferring Gateway restart (${reason}) until startup/reconnect settles (state=${context.state}, startLock=${context.startLock})`
      );
    } else {
      logger.debug(
        `Gateway restart already deferred; keeping pending request (${reason}, state=${context.state}, startLock=${context.startLock})`
      );
    }
    this.deferredRestartPending = true;
  }
  flushDeferredRestart(trigger, context, executeRestart) {
    const action = getDeferredRestartAction({
      hasPendingRestart: this.deferredRestartPending,
      state: context.state,
      startLock: context.startLock,
      shouldReconnect: context.shouldReconnect
    });
    if (action === "none") return;
    if (action === "wait") {
      logger.debug(
        `Deferred Gateway restart still waiting (${trigger}, state=${context.state}, startLock=${context.startLock})`
      );
      return;
    }
    this.deferredRestartPending = false;
    if (action === "drop") {
      logger.info(
        `Dropping deferred Gateway restart (${trigger}) because lifecycle already recovered (state=${context.state}, shouldReconnect=${context.shouldReconnect})`
      );
      return;
    }
    logger.info(`Executing deferred Gateway restart now (${trigger})`);
    executeRestart();
  }
  debouncedRestart(delayMs, executeRestart) {
    if (this.restartDebounceTimer) {
      clearTimeout(this.restartDebounceTimer);
    }
    logger.debug(`Gateway restart debounced (will fire in ${delayMs}ms)`);
    this.restartDebounceTimer = setTimeout(() => {
      this.restartDebounceTimer = null;
      executeRestart();
    }, delayMs);
  }
  clearDebounceTimer() {
    if (this.restartDebounceTimer) {
      clearTimeout(this.restartDebounceTimer);
      this.restartDebounceTimer = null;
    }
  }
  resetDeferredRestart() {
    this.deferredRestartPending = false;
  }
}
const MAX_STDERR_LINES = 120;
function classifyGatewayStderrMessage(message) {
  const msg = message.trim();
  if (!msg) {
    return { level: "drop", normalized: msg };
  }
  if (msg.includes("openclaw-control-ui") && msg.includes("token_mismatch")) {
    return { level: "drop", normalized: msg };
  }
  if (msg.includes("closed before connect") && msg.includes("token mismatch")) {
    return { level: "drop", normalized: msg };
  }
  if (msg.includes("ExperimentalWarning")) return { level: "debug", normalized: msg };
  if (msg.includes("DeprecationWarning")) return { level: "debug", normalized: msg };
  if (msg.includes("Debugger attached")) return { level: "debug", normalized: msg };
  if (msg.includes("node: --require is not allowed in NODE_OPTIONS")) {
    return { level: "debug", normalized: msg };
  }
  return { level: "warn", normalized: msg };
}
function recordGatewayStartupStderrLine(lines, line) {
  const normalized = line.trim();
  if (!normalized) return;
  lines.push(normalized);
  if (lines.length > MAX_STDERR_LINES) {
    lines.splice(0, lines.length - MAX_STDERR_LINES);
  }
}
const INVALID_CONFIG_PATTERNS = [
  /\binvalid config\b/i,
  /\bconfig invalid\b/i,
  /\bunrecognized key\b/i,
  /\brun:\s*openclaw doctor --fix\b/i
];
const TRANSIENT_START_ERROR_PATTERNS = [
  /WebSocket closed before handshake/i,
  /ECONNREFUSED/i,
  /Gateway process exited before becoming ready/i,
  /Timed out waiting for connect\.challenge/i,
  /Connect handshake timeout/i
];
function normalizeLogLine(value) {
  return value.trim();
}
function isInvalidConfigSignal(text) {
  const normalized = normalizeLogLine(text);
  if (!normalized) return false;
  return INVALID_CONFIG_PATTERNS.some((pattern) => pattern.test(normalized));
}
function hasInvalidConfigFailureSignal(startupError, startupStderrLines) {
  for (const line of startupStderrLines) {
    if (isInvalidConfigSignal(line)) {
      return true;
    }
  }
  const errorText = startupError instanceof Error ? `${startupError.name}: ${startupError.message}` : String(startupError ?? "");
  return isInvalidConfigSignal(errorText);
}
function shouldAttemptConfigAutoRepair(startupError, startupStderrLines, alreadyAttempted) {
  if (alreadyAttempted) return false;
  return hasInvalidConfigFailureSignal(startupError, startupStderrLines);
}
function isTransientGatewayStartError(error2) {
  const errorText = error2 instanceof Error ? `${error2.name}: ${error2.message}` : String(error2 ?? "");
  return TRANSIENT_START_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}
function getGatewayStartupRecoveryAction(options) {
  if (shouldAttemptConfigAutoRepair(
    options.startupError,
    options.startupStderrLines,
    options.configRepairAttempted
  )) {
    return "repair";
  }
  if (options.attempt < options.maxAttempts && isTransientGatewayStartError(options.startupError)) {
    return "retry";
  }
  return "fail";
}
async function runGatewayStartupSequence(hooks) {
  let configRepairAttempted = false;
  let startAttempts = 0;
  const maxStartAttempts = hooks.maxStartAttempts ?? 3;
  while (true) {
    startAttempts++;
    hooks.assertLifecycle("start");
    hooks.resetStartupStderrLines();
    try {
      logger.debug("Checking for existing Gateway...");
      const existing = await hooks.findExistingGateway(hooks.port, hooks.ownedPid);
      hooks.assertLifecycle("start/find-existing");
      if (existing) {
        logger.debug(`Found existing Gateway on port ${existing.port}`);
        await hooks.connect(existing.port, existing.externalToken);
        hooks.assertLifecycle("start/connect-existing");
        hooks.onConnectedToExistingGateway();
        return;
      }
      logger.debug("No existing Gateway found, starting new process...");
      if (hooks.shouldWaitForPortFree) {
        await hooks.waitForPortFree(hooks.port);
        hooks.assertLifecycle("start/wait-port");
      }
      await hooks.startProcess();
      hooks.assertLifecycle("start/start-process");
      await hooks.waitForReady(hooks.port);
      hooks.assertLifecycle("start/wait-ready");
      await hooks.connect(hooks.port);
      hooks.assertLifecycle("start/connect");
      hooks.onConnectedToManagedGateway();
      return;
    } catch (error2) {
      if (error2 instanceof LifecycleSupersededError) {
        throw error2;
      }
      const recoveryAction = getGatewayStartupRecoveryAction({
        startupError: error2,
        startupStderrLines: hooks.getStartupStderrLines(),
        configRepairAttempted,
        attempt: startAttempts,
        maxAttempts: maxStartAttempts
      });
      if (recoveryAction === "repair") {
        configRepairAttempted = true;
        logger.warn(
          "Detected invalid OpenClaw config during Gateway startup; running doctor repair before retry"
        );
        const repaired = await hooks.runDoctorRepair();
        if (repaired) {
          logger.info("OpenClaw doctor repair completed; retrying Gateway startup");
          hooks.onDoctorRepairSuccess();
          continue;
        }
        logger.error("OpenClaw doctor repair failed; not retrying Gateway startup");
      }
      if (recoveryAction === "retry") {
        logger.warn(`Transient start error: ${String(error2)}. Retrying... (${startAttempts}/${maxStartAttempts})`);
        await hooks.delay(1e3);
        continue;
      }
      throw error2;
    }
  }
}
class GatewayManager extends events.EventEmitter {
  process = null;
  processExitCode = null;
  // set by exit event, replaces exitCode/signalCode
  ownsProcess = false;
  ws = null;
  status = { state: "stopped", port: PORTS.OPENCLAW_GATEWAY };
  stateController;
  reconnectTimer = null;
  reconnectAttempts = 0;
  reconnectConfig;
  shouldReconnect = true;
  startLock = false;
  lastSpawnSummary = null;
  recentStartupStderrLines = [];
  pendingRequests = /* @__PURE__ */ new Map();
  deviceIdentity = null;
  restartInFlight = null;
  connectionMonitor = new GatewayConnectionMonitor();
  lifecycleController = new GatewayLifecycleController();
  restartController = new GatewayRestartController();
  reloadDebounceTimer = null;
  externalShutdownSupported = null;
  constructor(config) {
    super();
    this.stateController = new GatewayStateController({
      emitStatus: (status) => {
        this.status = status;
        this.emit("status", status);
      },
      onTransition: (previousState, nextState) => {
        this.restartController.flushDeferredRestart(
          `status:${previousState}->${nextState}`,
          {
            state: this.status.state,
            startLock: this.startLock,
            shouldReconnect: this.shouldReconnect
          },
          () => {
            void this.restart().catch((error2) => {
              logger.warn("Deferred Gateway restart failed:", error2);
            });
          }
        );
      }
    });
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...config };
  }
  async initDeviceIdentity() {
    if (this.deviceIdentity) return;
    try {
      const identityPath = path.join(electron.app.getPath("userData"), "clawx-device-identity.json");
      this.deviceIdentity = await loadOrCreateDeviceIdentity(identityPath);
      logger.debug(`Device identity loaded (deviceId=${this.deviceIdentity.deviceId})`);
    } catch (err) {
      logger.warn("Failed to load device identity, scopes will be limited:", err);
    }
  }
  sanitizeSpawnArgs(args) {
    const sanitized = [...args];
    const tokenIdx = sanitized.indexOf("--token");
    if (tokenIdx !== -1 && tokenIdx + 1 < sanitized.length) {
      sanitized[tokenIdx + 1] = "[redacted]";
    }
    return sanitized;
  }
  isUnsupportedShutdownError(error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    return /unknown method:\s*shutdown/i.test(message);
  }
  /**
   * Get current Gateway status
   */
  getStatus() {
    return this.stateController.getStatus();
  }
  /**
   * Check if Gateway is connected and ready
   */
  isConnected() {
    return this.stateController.isConnected(this.ws?.readyState === WebSocket.OPEN);
  }
  /**
   * Start Gateway process
   */
  async start() {
    if (this.startLock) {
      logger.debug("Gateway start ignored because a start flow is already in progress");
      return;
    }
    if (this.status.state === "running") {
      logger.debug("Gateway already running, skipping start");
      return;
    }
    this.startLock = true;
    const startEpoch = this.lifecycleController.bump("start");
    logger.info(`Gateway start requested (port=${this.status.port})`);
    this.lastSpawnSummary = null;
    this.shouldReconnect = true;
    await this.initDeviceIdentity();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      logger.debug("Cleared pending reconnect timer because start was requested manually");
    }
    this.reconnectAttempts = 0;
    this.setStatus({ state: "starting", reconnectAttempts: 0 });
    warmupManagedPythonReadiness();
    try {
      await runGatewayStartupSequence({
        port: this.status.port,
        ownedPid: this.process?.pid,
        shouldWaitForPortFree: process.platform === "win32",
        resetStartupStderrLines: () => {
          this.recentStartupStderrLines = [];
        },
        getStartupStderrLines: () => this.recentStartupStderrLines,
        assertLifecycle: (phase) => {
          this.lifecycleController.assert(startEpoch, phase);
        },
        findExistingGateway: async (port, ownedPid) => {
          const gatewayHost = await Promise.resolve().then(() => store).then(({ getSetting: getSetting2 }) => getSetting2("gatewayHost"));
          return await findExistingGatewayProcess({ port, host: gatewayHost, ownedPid });
        },
        connect: async (port, externalToken) => {
          await this.connect(port, externalToken);
        },
        onConnectedToExistingGateway: () => {
          this.ownsProcess = false;
          this.setStatus({ pid: void 0 });
          this.startHealthCheck();
        },
        waitForPortFree: async (port) => {
          await waitForPortFree(port);
        },
        startProcess: async () => {
          await this.startProcess();
        },
        waitForReady: async (port) => {
          const gatewayHost = await Promise.resolve().then(() => store).then(({ getSetting: getSetting2 }) => getSetting2("gatewayHost"));
          await waitForGatewayReady({
            port,
            host: gatewayHost,
            getProcessExitCode: () => this.processExitCode
          });
        },
        onConnectedToManagedGateway: () => {
          this.startHealthCheck();
          logger.debug("Gateway started successfully");
        },
        runDoctorRepair: async () => await runOpenClawDoctorRepair(),
        onDoctorRepairSuccess: () => {
          this.setStatus({ state: "starting", error: void 0, reconnectAttempts: 0 });
        },
        delay: async (ms) => {
          await new Promise((resolve) => setTimeout(resolve, ms));
        }
      });
    } catch (error2) {
      if (error2 instanceof LifecycleSupersededError) {
        logger.debug(error2.message);
        return;
      }
      logger.error(
        `Gateway start failed (port=${this.status.port}, reconnectAttempts=${this.reconnectAttempts}, spawn=${this.lastSpawnSummary ?? "n/a"})`,
        error2
      );
      this.setStatus({ state: "error", error: String(error2) });
      throw error2;
    } finally {
      this.startLock = false;
      this.restartController.flushDeferredRestart(
        "start:finally",
        {
          state: this.status.state,
          startLock: this.startLock,
          shouldReconnect: this.shouldReconnect
        },
        () => {
          void this.restart().catch((error2) => {
            logger.warn("Deferred Gateway restart failed:", error2);
          });
        }
      );
    }
  }
  /**
   * Stop Gateway process
   */
  async stop() {
    logger.info("Gateway stop requested");
    this.lifecycleController.bump("stop");
    this.shouldReconnect = false;
    this.clearAllTimers();
    if (!this.ownsProcess && this.ws?.readyState === WebSocket.OPEN && this.externalShutdownSupported !== false) {
      try {
        await this.rpc("shutdown", void 0, 5e3);
        this.externalShutdownSupported = true;
      } catch (error2) {
        if (this.isUnsupportedShutdownError(error2)) {
          this.externalShutdownSupported = false;
          logger.info('External Gateway does not support "shutdown"; skipping shutdown RPC for future stops');
        } else {
          logger.warn("Failed to request shutdown for externally managed Gateway:", error2);
        }
      }
    }
    if (this.ws) {
      this.ws.close(1e3, "Gateway stopped by user");
      this.ws = null;
    }
    if (this.process && this.ownsProcess) {
      const child = this.process;
      await terminateOwnedGatewayProcess(child);
      if (this.process === child) {
        this.process = null;
      }
    }
    this.ownsProcess = false;
    clearPendingGatewayRequests(this.pendingRequests, new Error("Gateway stopped"));
    this.restartController.resetDeferredRestart();
    this.setStatus({ state: "stopped", error: void 0, pid: void 0, connectedAt: void 0, uptime: void 0 });
  }
  /**
   * Force kill Gateway process synchronously (for app exit).
   * This is a safety net to ensure no orphaned Gateway processes.
   */
  forceKill() {
    if (this.process && this.ownsProcess) {
      const pid = this.process.pid;
      if (pid) {
        try {
          process.kill(pid, "SIGKILL");
          logger.info(`Force killed Gateway process (pid=${pid})`);
        } catch {
        }
      }
      this.process = null;
      this.ownsProcess = false;
    }
  }
  /**
   * Restart Gateway process
   */
  async restart() {
    if (this.restartController.isRestartDeferred({
      state: this.status.state,
      startLock: this.startLock
    })) {
      this.restartController.markDeferredRestart("restart", {
        state: this.status.state,
        startLock: this.startLock
      });
      return;
    }
    if (this.restartInFlight) {
      logger.debug("Gateway restart already in progress, joining existing request");
      await this.restartInFlight;
      return;
    }
    logger.debug("Gateway restart requested");
    this.restartInFlight = (async () => {
      await this.stop();
      await this.start();
    })();
    try {
      await this.restartInFlight;
    } finally {
      this.restartInFlight = null;
      this.restartController.flushDeferredRestart(
        "restart:finally",
        {
          state: this.status.state,
          startLock: this.startLock,
          shouldReconnect: this.shouldReconnect
        },
        () => {
          void this.restart().catch((error2) => {
            logger.warn("Deferred Gateway restart failed:", error2);
          });
        }
      );
    }
  }
  /**
   * Debounced restart — coalesces multiple rapid restart requests into a
   * single restart after `delayMs` of inactivity.  This prevents the
   * cascading stop/start cycles that occur when provider:save,
   * provider:setDefault and channel:saveConfig all fire within seconds
   * of each other during setup.
   */
  debouncedRestart(delayMs = 2e3) {
    this.restartController.debouncedRestart(delayMs, () => {
      void this.restart().catch((err) => {
        logger.warn("Debounced Gateway restart failed:", err);
      });
    });
  }
  /**
   * Ask the Gateway process to reload config in-place when possible.
   * Falls back to restart on unsupported platforms or signaling failures.
   */
  async reload() {
    if (this.restartController.isRestartDeferred({
      state: this.status.state,
      startLock: this.startLock
    })) {
      this.restartController.markDeferredRestart("reload", {
        state: this.status.state,
        startLock: this.startLock
      });
      return;
    }
    if (!this.process?.pid || this.status.state !== "running") {
      logger.warn("Gateway reload requested while not running; falling back to restart");
      await this.restart();
      return;
    }
    if (process.platform === "win32") {
      logger.debug("Windows detected, falling back to Gateway restart for reload");
      await this.restart();
      return;
    }
    const connectedForMs = this.status.connectedAt ? Date.now() - this.status.connectedAt : Number.POSITIVE_INFINITY;
    if (connectedForMs < 8e3) {
      logger.info(`Gateway connected ${connectedForMs}ms ago, skipping reload signal`);
      return;
    }
    try {
      process.kill(this.process.pid, "SIGUSR1");
      logger.info(`Sent SIGUSR1 to Gateway for config reload (pid=${this.process.pid})`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (this.status.state !== "running" || !this.process?.pid) {
        logger.warn("Gateway did not stay running after reload signal, falling back to restart");
        await this.restart();
      }
    } catch (error2) {
      logger.warn("Gateway reload signal failed, falling back to restart:", error2);
      await this.restart();
    }
  }
  /**
   * Debounced reload — coalesces multiple rapid config-change events into one
   * in-process reload when possible.
   */
  debouncedReload(delayMs = 1200) {
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
    }
    logger.debug(`Gateway reload debounced (will fire in ${delayMs}ms)`);
    this.reloadDebounceTimer = setTimeout(() => {
      this.reloadDebounceTimer = null;
      void this.reload().catch((err) => {
        logger.warn("Debounced Gateway reload failed:", err);
      });
    }, delayMs);
  }
  /**
   * Clear all active timers
   */
  clearAllTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectionMonitor.clear();
    this.restartController.clearDebounceTimer();
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer);
      this.reloadDebounceTimer = null;
    }
  }
  /**
   * Make an RPC call to the Gateway
   * Uses OpenClaw protocol format: { type: "req", id: "...", method: "...", params: {...} }
   */
  async rpc(method, params, timeoutMs = 3e4) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Gateway not connected"));
        return;
      }
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        rejectPendingGatewayRequest(this.pendingRequests, id, new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout
      });
      const request = {
        type: "req",
        id,
        method,
        params
      };
      try {
        this.ws.send(JSON.stringify(request));
      } catch (error2) {
        rejectPendingGatewayRequest(this.pendingRequests, id, new Error(`Failed to send RPC request: ${error2}`));
      }
    });
  }
  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    this.connectionMonitor.startHealthCheck({
      shouldCheck: () => this.status.state === "running",
      checkHealth: () => this.checkHealth(),
      onUnhealthy: (errorMessage) => {
        this.emit("error", new Error(errorMessage));
      },
      onError: () => {
      }
    });
  }
  /**
   * Check Gateway health via WebSocket ping
   * OpenClaw Gateway doesn't have an HTTP /health endpoint
   */
  async checkHealth() {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const uptime = this.status.connectedAt ? Math.floor((Date.now() - this.status.connectedAt) / 1e3) : void 0;
        return { ok: true, uptime };
      }
      return { ok: false, error: "WebSocket not connected" };
    } catch (error2) {
      return { ok: false, error: String(error2) };
    }
  }
  /**
   * Start Gateway process
   * Uses OpenClaw npm package from node_modules (dev) or resources (production)
   */
  async startProcess() {
    const launchContext = await prepareGatewayLaunchContext(this.status.port);
    await unloadLaunchctlGatewayService();
    this.processExitCode = null;
    const { child, lastSpawnSummary } = await launchGatewayProcess({
      port: this.status.port,
      launchContext,
      sanitizeSpawnArgs: (args) => this.sanitizeSpawnArgs(args),
      getCurrentState: () => this.status.state,
      getShouldReconnect: () => this.shouldReconnect,
      onStderrLine: (line) => {
        recordGatewayStartupStderrLine(this.recentStartupStderrLines, line);
        const classified = classifyGatewayStderrMessage(line);
        if (classified.level === "drop") return;
        if (classified.level === "debug") {
          logger.debug(`[Gateway stderr] ${classified.normalized}`);
          return;
        }
        logger.warn(`[Gateway stderr] ${classified.normalized}`);
      },
      onSpawn: (pid) => {
        this.setStatus({ pid });
      },
      onExit: (exitedChild, code) => {
        this.processExitCode = code;
        this.ownsProcess = false;
        if (this.process === exitedChild) {
          this.process = null;
        }
        this.emit("exit", code);
        if (this.status.state === "running") {
          this.setStatus({ state: "stopped" });
          this.scheduleReconnect();
        }
      },
      onError: (erroredChild) => {
        this.ownsProcess = false;
        if (this.process === erroredChild) {
          this.process = null;
        }
      }
    });
    this.process = child;
    this.ownsProcess = true;
    this.lastSpawnSummary = lastSpawnSummary;
  }
  /**
   * Connect WebSocket to Gateway
   */
  async connect(port, _externalToken) {
    const gatewayHost = await Promise.resolve().then(() => store).then(({ getSetting: getSetting2 }) => getSetting2("gatewayHost"));
    this.ws = await connectGatewaySocket({
      port,
      host: gatewayHost,
      deviceIdentity: this.deviceIdentity,
      platform: process.platform,
      pendingRequests: this.pendingRequests,
      getToken: async () => await Promise.resolve().then(() => store).then(({ getSetting: getSetting2 }) => getSetting2("gatewayToken")),
      onHandshakeComplete: (ws) => {
        this.ws = ws;
        this.setStatus({
          state: "running",
          port,
          connectedAt: Date.now()
        });
        this.startPing();
      },
      onMessage: (message) => {
        this.handleMessage(message);
      },
      onCloseAfterHandshake: () => {
        if (this.status.state === "running") {
          this.setStatus({ state: "stopped" });
          this.scheduleReconnect();
        }
      }
    });
  }
  /**
   * Handle incoming WebSocket message
   */
  handleMessage(message) {
    if (typeof message !== "object" || message === null) {
      logger.debug("Received non-object Gateway message");
      return;
    }
    const msg = message;
    if (msg.type === "res" && typeof msg.id === "string") {
      if (msg.ok === false || msg.error) {
        const errorObj = msg.error;
        const errorMsg = errorObj?.message || JSON.stringify(msg.error) || "Unknown error";
        if (rejectPendingGatewayRequest(this.pendingRequests, msg.id, new Error(errorMsg))) {
          return;
        }
      } else if (resolvePendingGatewayRequest(this.pendingRequests, msg.id, msg.payload ?? msg)) {
        return;
      }
    }
    if (msg.type === "event" && typeof msg.event === "string") {
      dispatchProtocolEvent(this, msg.event, msg.payload);
      return;
    }
    if (isResponse(message) && message.id && this.pendingRequests.has(String(message.id))) {
      if (message.error) {
        const errorMsg = typeof message.error === "object" ? message.error.message || JSON.stringify(message.error) : String(message.error);
        rejectPendingGatewayRequest(this.pendingRequests, String(message.id), new Error(errorMsg));
      } else {
        resolvePendingGatewayRequest(this.pendingRequests, String(message.id), message.result);
      }
      return;
    }
    if (isNotification(message)) {
      dispatchJsonRpcNotification(this, message);
      return;
    }
    this.emit("message", message);
  }
  /**
   * Start ping interval to keep connection alive
   */
  startPing() {
    this.connectionMonitor.startPing(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    });
  }
  /**
   * Schedule reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    const decision = getReconnectScheduleDecision({
      shouldReconnect: this.shouldReconnect,
      hasReconnectTimer: this.reconnectTimer !== null,
      reconnectAttempts: this.reconnectAttempts,
      maxAttempts: this.reconnectConfig.maxAttempts,
      baseDelay: this.reconnectConfig.baseDelay,
      maxDelay: this.reconnectConfig.maxDelay
    });
    if (decision.action === "skip") {
      logger.debug(`Gateway reconnect skipped (${decision.reason})`);
      return;
    }
    if (decision.action === "already-scheduled") {
      return;
    }
    if (decision.action === "fail") {
      logger.error(`Gateway reconnect failed: max attempts reached (${decision.maxAttempts})`);
      this.setStatus({
        state: "error",
        error: "Failed to reconnect after maximum attempts",
        reconnectAttempts: this.reconnectAttempts
      });
      return;
    }
    const { delay, nextAttempt, maxAttempts } = decision;
    this.reconnectAttempts = nextAttempt;
    logger.warn(`Scheduling Gateway reconnect attempt ${nextAttempt}/${maxAttempts} in ${delay}ms`);
    this.setStatus({
      state: "reconnecting",
      reconnectAttempts: this.reconnectAttempts
    });
    const scheduledEpoch = this.lifecycleController.getCurrentEpoch();
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const skipReason = getReconnectSkipReason({
        scheduledEpoch,
        currentEpoch: this.lifecycleController.getCurrentEpoch(),
        shouldReconnect: this.shouldReconnect
      });
      if (skipReason) {
        logger.debug(`Skipping reconnect attempt: ${skipReason}`);
        return;
      }
      try {
        await this.start();
        this.reconnectAttempts = 0;
      } catch (error2) {
        logger.error("Gateway reconnection attempt failed:", error2);
        this.scheduleReconnect();
      }
    }, delay);
  }
  /**
   * Update status and emit event
   */
  setStatus(update) {
    this.stateController.setStatus(update);
  }
}
function escapeForDoubleQuotes(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function quoteForPosix(value) {
  return `"${escapeForDoubleQuotes(value)}"`;
}
function quoteForPowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function getOpenClawCliCommand() {
  const entryPath = getOpenClawEntryPath();
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux") {
    const localBinPath = node_path.join(node_os.homedir(), ".local", "bin", "openclaw");
    if (node_fs.existsSync(localBinPath)) {
      return quoteForPosix(localBinPath);
    }
  }
  if (platform === "linux") {
    if (node_fs.existsSync("/usr/local/bin/openclaw")) {
      return "/usr/local/bin/openclaw";
    }
  }
  if (!electron.app.isPackaged) {
    const openclawDir = getOpenClawDir();
    const nodeModulesDir = node_path.dirname(openclawDir);
    const binName = platform === "win32" ? "openclaw.cmd" : "openclaw";
    const binPath = node_path.join(nodeModulesDir, ".bin", binName);
    if (node_fs.existsSync(binPath)) {
      if (platform === "win32") {
        return `& ${quoteForPowerShell(binPath)}`;
      }
      return quoteForPosix(binPath);
    }
  }
  if (electron.app.isPackaged) {
    if (platform === "win32") {
      const cliDir = node_path.join(process.resourcesPath, "cli");
      const cmdPath = node_path.join(cliDir, "openclaw.cmd");
      if (node_fs.existsSync(cmdPath)) {
        return quoteForPowerShell(cmdPath);
      }
    }
    const execPath = process.execPath;
    if (platform === "win32") {
      return `$env:ELECTRON_RUN_AS_NODE=1; & ${quoteForPowerShell(execPath)} ${quoteForPowerShell(entryPath)}`;
    }
    return `ELECTRON_RUN_AS_NODE=1 ${quoteForPosix(execPath)} ${quoteForPosix(entryPath)}`;
  }
  if (platform === "win32") {
    return `node ${quoteForPowerShell(entryPath)}`;
  }
  return `node ${quoteForPosix(entryPath)}`;
}
function getPackagedCliWrapperPath() {
  if (!electron.app.isPackaged) return null;
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux") {
    const wrapper = node_path.join(process.resourcesPath, "cli", "openclaw");
    return node_fs.existsSync(wrapper) ? wrapper : null;
  }
  if (platform === "win32") {
    const wrapper = node_path.join(process.resourcesPath, "cli", "openclaw.cmd");
    return node_fs.existsSync(wrapper) ? wrapper : null;
  }
  return null;
}
function getWindowsPowerShellPath() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  return node_path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}
function getCliTargetPath() {
  return node_path.join(node_os.homedir(), ".local", "bin", "openclaw");
}
async function installOpenClawCli() {
  const platform = process.platform;
  if (platform === "win32") {
    return { success: false, error: "Windows CLI is configured by the installer." };
  }
  if (!electron.app.isPackaged) {
    return { success: false, error: "CLI install is only available in packaged builds." };
  }
  const wrapperSrc = getPackagedCliWrapperPath();
  if (!wrapperSrc) {
    return { success: false, error: "CLI wrapper not found in app resources." };
  }
  const targetDir = node_path.join(node_os.homedir(), ".local", "bin");
  const target = getCliTargetPath();
  try {
    node_fs.mkdirSync(targetDir, { recursive: true });
    if (node_fs.existsSync(target)) {
      node_fs.unlinkSync(target);
    }
    node_fs.symlinkSync(wrapperSrc, target);
    node_fs.chmodSync(wrapperSrc, 493);
    logger.info(`OpenClaw CLI symlink created: ${target} -> ${wrapperSrc}`);
    return { success: true, path: target };
  } catch (error2) {
    logger.error("Failed to install OpenClaw CLI:", error2);
    return { success: false, error: String(error2) };
  }
}
function isCliInstalled() {
  const platform = process.platform;
  if (platform === "win32") return true;
  const target = getCliTargetPath();
  if (!node_fs.existsSync(target)) return false;
  if (platform === "linux" && node_fs.existsSync("/usr/local/bin/openclaw")) return true;
  return true;
}
function ensureWindowsCliOnPath() {
  return new Promise((resolve, reject) => {
    const cliWrapper = getPackagedCliWrapperPath();
    if (!cliWrapper) {
      reject(new Error("CLI wrapper not found in app resources."));
      return;
    }
    const cliDir = node_path.dirname(cliWrapper);
    const helperPath = node_path.join(cliDir, "update-user-path.ps1");
    if (!node_fs.existsSync(helperPath)) {
      reject(new Error(`PATH helper not found at ${helperPath}`));
      return;
    }
    const child = node_child_process.spawn(
      getWindowsPowerShellPath(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperPath,
        "-Action",
        "add",
        "-CliDir",
        cliDir
      ],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      const status = stdout.trim();
      if (status === "updated" || status === "already-present") {
        resolve(status);
        return;
      }
      reject(new Error(`Unexpected PowerShell output: ${status || "(empty)"}`));
    });
  });
}
function ensureLocalBinInPath() {
  if (process.platform === "win32") return;
  const localBin = node_path.join(node_os.homedir(), ".local", "bin");
  const pathEnv = process.env.PATH || "";
  if (pathEnv.split(":").includes(localBin)) return;
  const shell = process.env.SHELL || "/bin/zsh";
  const profileFile = shell.includes("zsh") ? node_path.join(node_os.homedir(), ".zshrc") : shell.includes("fish") ? node_path.join(node_os.homedir(), ".config", "fish", "config.fish") : node_path.join(node_os.homedir(), ".bashrc");
  try {
    const marker = ".local/bin";
    let content = "";
    try {
      content = node_fs.readFileSync(profileFile, "utf-8");
    } catch {
    }
    if (content.includes(marker)) return;
    const line = shell.includes("fish") ? '\n# Added by ClawX\nfish_add_path "$HOME/.local/bin"\n' : '\n# Added by ClawX\nexport PATH="$HOME/.local/bin:$PATH"\n';
    node_fs.appendFileSync(profileFile, line);
    logger.info(`Added ~/.local/bin to PATH in ${profileFile}`);
  } catch (error2) {
    logger.warn("Failed to add ~/.local/bin to PATH:", error2);
  }
}
async function autoInstallCliIfNeeded(notify) {
  if (!electron.app.isPackaged) return;
  if (process.platform === "win32") {
    try {
      const result2 = await ensureWindowsCliOnPath();
      if (result2 === "updated") {
        logger.info("Added Windows CLI directory to user PATH.");
      }
    } catch (error2) {
      logger.warn("Failed to ensure Windows CLI is on PATH:", error2);
    }
    return;
  }
  const target = getCliTargetPath();
  const wrapperSrc = getPackagedCliWrapperPath();
  if (isCliInstalled()) {
    if (target && wrapperSrc && node_fs.existsSync(target)) {
      try {
        node_fs.unlinkSync(target);
        node_fs.symlinkSync(wrapperSrc, target);
        logger.debug(`Refreshed CLI symlink: ${target} -> ${wrapperSrc}`);
      } catch {
      }
    }
    return;
  }
  logger.info("Auto-installing openclaw CLI...");
  const result = await installOpenClawCli();
  if (result.success) {
    logger.info(`CLI auto-installed at ${result.path}`);
    ensureLocalBinInPath();
    if (result.path) notify?.(result.path);
  } else {
    logger.warn(`CLI auto-install failed: ${result.error}`);
  }
}
function getNodeExecForCli() {
  if (process.platform === "darwin" && electron.app.isPackaged) {
    const appName = electron.app.getName();
    const helperName = `${appName} Helper`;
    const helperPath = node_path.join(
      node_path.dirname(process.execPath),
      "../Frameworks",
      `${helperName}.app`,
      "Contents/MacOS",
      helperName
    );
    if (node_fs.existsSync(helperPath)) return helperPath;
  }
  return process.execPath;
}
function generateCompletionCache() {
  if (!electron.app.isPackaged) return;
  const entryPath = getOpenClawEntryPath();
  if (!node_fs.existsSync(entryPath)) return;
  const execPath = getNodeExecForCli();
  const child = node_child_process.spawn(execPath, [entryPath, "completion", "--write-state"], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      OPENCLAW_NO_RESPAWN: "1",
      OPENCLAW_EMBEDDED_IN: "ClawX"
    },
    stdio: "ignore",
    detached: false,
    windowsHide: true
  });
  child.on("close", (code) => {
    if (code === 0) {
      logger.info("OpenClaw completion cache generated");
    } else {
      logger.warn(`OpenClaw completion cache generation exited with code ${code}`);
    }
  });
  child.on("error", (err) => {
    logger.warn("Failed to generate completion cache:", err);
  });
}
function installCompletionToProfile() {
  if (!electron.app.isPackaged) return;
  if (process.platform === "win32") return;
  const entryPath = getOpenClawEntryPath();
  if (!node_fs.existsSync(entryPath)) return;
  const execPath = getNodeExecForCli();
  const child = node_child_process.spawn(
    execPath,
    [entryPath, "completion", "--install", "-y"],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        OPENCLAW_NO_RESPAWN: "1",
        OPENCLAW_EMBEDDED_IN: "ClawX"
      },
      stdio: "ignore",
      detached: false,
      windowsHide: true
    }
  );
  child.on("close", (code) => {
    if (code === 0) {
      logger.info("OpenClaw completion installed to shell profile");
    } else {
      logger.warn(`OpenClaw completion install exited with code ${code}`);
    }
  });
  child.on("error", (err) => {
    logger.warn("Failed to install completion to shell profile:", err);
  });
}
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");
async function fileExists$1(p) {
  try {
    await promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function readConfig() {
  if (!await fileExists$1(OPENCLAW_CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = await promises.readFile(OPENCLAW_CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read openclaw config:", err);
    return {};
  }
}
async function writeConfig(config) {
  const json = JSON.stringify(config, null, 2);
  await promises.writeFile(OPENCLAW_CONFIG_PATH, json, "utf-8");
}
async function setSkillsEnabled(skillKeys, enabled) {
  if (skillKeys.length === 0) {
    return;
  }
  const config = await readConfig();
  if (!config.skills) {
    config.skills = {};
  }
  if (!config.skills.entries) {
    config.skills.entries = {};
  }
  for (const skillKey of skillKeys) {
    const entry = config.skills.entries[skillKey] || {};
    entry.enabled = enabled;
    config.skills.entries[skillKey] = entry;
  }
  await writeConfig(config);
}
async function getSkillConfig(skillKey) {
  const config = await readConfig();
  return config.skills?.entries?.[skillKey];
}
async function updateSkillConfig(skillKey, updates) {
  try {
    const config = await readConfig();
    if (!config.skills) {
      config.skills = {};
    }
    if (!config.skills.entries) {
      config.skills.entries = {};
    }
    const entry = config.skills.entries[skillKey] || {};
    if (updates.apiKey !== void 0) {
      const trimmed = updates.apiKey.trim();
      if (trimmed) {
        entry.apiKey = trimmed;
      } else {
        delete entry.apiKey;
      }
    }
    if (updates.env !== void 0) {
      const newEnv = {};
      for (const [key, value] of Object.entries(updates.env)) {
        const trimmedKey = key.trim();
        if (!trimmedKey) continue;
        const trimmedVal = value.trim();
        if (trimmedVal) {
          newEnv[trimmedKey] = trimmedVal;
        }
      }
      if (Object.keys(newEnv).length > 0) {
        entry.env = newEnv;
      } else {
        delete entry.env;
      }
    }
    config.skills.entries[skillKey] = entry;
    await writeConfig(config);
    return { success: true };
  } catch (err) {
    console.error("Failed to update skill config:", err);
    return { success: false, error: String(err) };
  }
}
async function getAllSkillConfigs() {
  const config = await readConfig();
  return config.skills?.entries || {};
}
const BUILTIN_SKILLS = [];
async function ensureBuiltinSkillsInstalled() {
  const skillsRoot = path.join(os.homedir(), ".openclaw", "skills");
  for (const { slug, sourceExtension } of BUILTIN_SKILLS) {
    const targetDir = path.join(skillsRoot, slug);
    const targetManifest = path.join(targetDir, "SKILL.md");
    if (fs.existsSync(targetManifest)) {
      continue;
    }
    const openclawDir = getOpenClawDir();
    const sourceDir = path.join(openclawDir, "extensions", sourceExtension, "skills", slug);
    if (!fs.existsSync(path.join(sourceDir, "SKILL.md"))) {
      logger.warn(`Built-in skill source not found, skipping: ${sourceDir}`);
      continue;
    }
    try {
      await promises.mkdir(targetDir, { recursive: true });
      await promises.cp(sourceDir, targetDir, { recursive: true });
      logger.info(`Installed built-in skill: ${slug} -> ${targetDir}`);
    } catch (error2) {
      logger.warn(`Failed to install built-in skill ${slug}:`, error2);
    }
  }
}
const PREINSTALLED_MANIFEST_NAME = "preinstalled-manifest.json";
const PREINSTALLED_MARKER_NAME = ".clawx-preinstalled.json";
async function readPreinstalledManifest() {
  const candidates = [
    path.join(getResourcesDir(), "skills", PREINSTALLED_MANIFEST_NAME),
    path.join(process.cwd(), "resources", "skills", PREINSTALLED_MANIFEST_NAME)
  ];
  const manifestPath = candidates.find((p) => fs.existsSync(p));
  if (!manifestPath) {
    return [];
  }
  try {
    const raw = await promises.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.skills)) {
      return [];
    }
    return parsed.skills.filter((s) => Boolean(s?.slug));
  } catch (error2) {
    logger.warn("Failed to read preinstalled-skills manifest:", error2);
    return [];
  }
}
function resolvePreinstalledSkillsSourceRoot() {
  const candidates = [
    path.join(getResourcesDir(), "preinstalled-skills"),
    path.join(process.cwd(), "build", "preinstalled-skills"),
    path.join(__dirname, "../../build/preinstalled-skills")
  ];
  const root = candidates.find((dir) => fs.existsSync(dir));
  return root || null;
}
async function readPreinstalledLockVersions(sourceRoot) {
  const lockPath = path.join(sourceRoot, ".preinstalled-lock.json");
  if (!fs.existsSync(lockPath)) {
    return /* @__PURE__ */ new Map();
  }
  try {
    const raw = await promises.readFile(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    const versions = /* @__PURE__ */ new Map();
    for (const entry of parsed.skills || []) {
      const slug = entry.slug?.trim();
      const version2 = entry.version?.trim();
      if (slug && version2) {
        versions.set(slug, version2);
      }
    }
    return versions;
  } catch (error2) {
    logger.warn("Failed to read preinstalled-skills lock file:", error2);
    return /* @__PURE__ */ new Map();
  }
}
async function tryReadMarker(markerPath) {
  if (!fs.existsSync(markerPath)) {
    return null;
  }
  try {
    const raw = await promises.readFile(markerPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed?.slug || !parsed?.version) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
async function ensurePreinstalledSkillsInstalled() {
  const skills = await readPreinstalledManifest();
  if (skills.length === 0) {
    return;
  }
  const sourceRoot = resolvePreinstalledSkillsSourceRoot();
  if (!sourceRoot) {
    logger.warn("Preinstalled skills source root not found; skipping preinstall.");
    return;
  }
  const lockVersions = await readPreinstalledLockVersions(sourceRoot);
  const targetRoot = path.join(os.homedir(), ".openclaw", "skills");
  await promises.mkdir(targetRoot, { recursive: true });
  const toEnable = [];
  for (const spec of skills) {
    const sourceDir = path.join(sourceRoot, spec.slug);
    const sourceManifest = path.join(sourceDir, "SKILL.md");
    if (!fs.existsSync(sourceManifest)) {
      logger.warn(`Preinstalled skill source missing SKILL.md, skipping: ${sourceDir}`);
      continue;
    }
    const targetDir = path.join(targetRoot, spec.slug);
    const targetManifest = path.join(targetDir, "SKILL.md");
    const markerPath = path.join(targetDir, PREINSTALLED_MARKER_NAME);
    const desiredVersion = lockVersions.get(spec.slug) || (spec.version || "unknown").trim() || "unknown";
    const marker = await tryReadMarker(markerPath);
    if (fs.existsSync(targetManifest)) {
      if (!marker) {
        logger.info(`Skipping user-managed skill: ${spec.slug}`);
        continue;
      }
      if (marker.version === desiredVersion) {
        continue;
      }
      logger.info(`Skipping preinstalled skill update for ${spec.slug} (local marker version=${marker.version}, desired=${desiredVersion})`);
      continue;
    }
    try {
      await promises.mkdir(targetDir, { recursive: true });
      await promises.cp(sourceDir, targetDir, { recursive: true, force: true });
      const markerPayload = {
        source: "clawx-preinstalled",
        slug: spec.slug,
        version: desiredVersion,
        installedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await promises.writeFile(markerPath, `${JSON.stringify(markerPayload, null, 2)}
`, "utf-8");
      if (spec.autoEnable) {
        toEnable.push(spec.slug);
      }
      logger.info(`Installed preinstalled skill: ${spec.slug} -> ${targetDir}`);
    } catch (error2) {
      logger.warn(`Failed to install preinstalled skill ${spec.slug}:`, error2);
    }
  }
  if (toEnable.length > 0) {
    try {
      await setSkillsEnabled(toEnable, true);
    } catch (error2) {
      logger.warn("Failed to auto-enable preinstalled skills:", error2);
    }
  }
}
const require$1 = module$1.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.js", document.baseURI).href);
let _openclawPath = null;
let _openclawResolvedPath = null;
let _openclawRequire = null;
function getOpenClawPaths() {
  if (!_openclawPath) {
    if (electron.app.isPackaged) {
      _openclawPath = path.join(process.resourcesPath, "openclaw");
      _openclawResolvedPath = _openclawPath;
    } else {
      _openclawPath = path.join(__dirname, "../../node_modules/openclaw");
      try {
        const { realpathSync } = require$1("fs");
        _openclawResolvedPath = realpathSync(_openclawPath);
      } catch {
        _openclawResolvedPath = _openclawPath;
      }
    }
    _openclawRequire = module$1.createRequire(path.join(_openclawResolvedPath, "package.json"));
  }
  return { path: _openclawPath, resolvedPath: _openclawResolvedPath, req: _openclawRequire };
}
function resolveOpenClawPackageJson(packageName) {
  const { path: openclawPath, resolvedPath: openclawResolvedPath, req: openclawRequire } = getOpenClawPaths();
  const specifier = `${packageName}/package.json`;
  try {
    return openclawRequire.resolve(specifier);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to resolve "${packageName}" from OpenClaw context. openclawPath=${openclawPath}, resolvedPath=${openclawResolvedPath}. ${reason}`,
      { cause: err }
    );
  }
}
let _baileysPath = null;
let _qrcodeTerminalPath = null;
function getBaileysPath() {
  if (!_baileysPath) _baileysPath = path.dirname(resolveOpenClawPackageJson("@whiskeysockets/baileys"));
  return _baileysPath;
}
function getQrcodeTerminalPath() {
  if (!_qrcodeTerminalPath) _qrcodeTerminalPath = path.dirname(resolveOpenClawPackageJson("qrcode-terminal"));
  return _qrcodeTerminalPath;
}
let _makeWASocket = null;
let _initAuth = null;
let _DisconnectReason = null;
let _fetchLatestBaileysVersion = null;
async function loadBaileys() {
  if (_makeWASocket) return;
  const baileysPath2 = getBaileysPath();
  const mod = await import(`file://${baileysPath2}/index.js`).catch(() =>
    import(`file://${baileysPath2}/lib/index.js`)
  );
  _makeWASocket = mod.default ?? mod.makeWASocket;
  _initAuth = mod.useMultiFileAuthState;
  _DisconnectReason = mod.DisconnectReason;
  _fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion;
}
let _QRCodeModule = null;
let _QRErrorCorrectLevelModule = null;
function loadQRCode() {
  if (_QRCodeModule) return;
  const qrcodeTerminalPath2 = getQrcodeTerminalPath();
  _QRCodeModule = require$1(path.join(qrcodeTerminalPath2, "vendor", "QRCode", "index.js"));
  _QRErrorCorrectLevelModule = require$1(path.join(qrcodeTerminalPath2, "vendor", "QRCode", "QRErrorCorrectLevel.js"));
}
function createQrMatrix(input) {
  loadQRCode();
  const QRCode = _QRCodeModule;
  const QRErrorCorrectLevel = _QRErrorCorrectLevelModule;
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(input);
  qr.make();
  return qr;
}
function fillPixel(buf, x, y, width, r, g, b, a = 255) {
  const idx = (y * width + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}
function crcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crcTable();
function crc32(buf) {
  let crc = 4294967295;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePngRgba(buffer, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rawOffset = row * (stride + 1);
    raw[rawOffset] = 0;
    buffer.copy(raw, rawOffset + 1, row * stride, row * stride + stride);
  }
  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}
async function renderQrPngBase64(input, opts = {}) {
  const { scale = 6, marginModules = 4 } = opts;
  const qr = createQrMatrix(input);
  const modules = qr.getModuleCount();
  const size = (modules + marginModules * 2) * scale;
  const buf = Buffer.alloc(size * size * 4, 255);
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }
      const startX = (col + marginModules) * scale;
      const startY = (row + marginModules) * scale;
      for (let y = 0; y < scale; y += 1) {
        const pixelY = startY + y;
        for (let x = 0; x < scale; x += 1) {
          const pixelX = startX + x;
          fillPixel(buf, pixelX, pixelY, size, 0, 0, 0, 255);
        }
      }
    }
  }
  const png = encodePngRgba(buf, size, size);
  return png.toString("base64");
}
class WhatsAppLoginManager extends events.EventEmitter {
  socket = null;
  qr = null;
  accountId = null;
  active = false;
  retryCount = 0;
  maxRetries = 5;
  constructor() {
    super();
  }
  /**
   * Finish login: close socket and emit success after credentials are saved
   */
  async finishLogin(accountId) {
    if (!this.active) return;
    console.log("[WhatsAppLogin] Finishing login, closing socket to hand over to Gateway...");
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 5e3));
    this.emit("success", { accountId });
  }
  /**
   * Start WhatsApp pairing process
   */
  async start(accountId = "default") {
    if (this.active && this.accountId === accountId) {
      if (this.qr) {
        const base64 = await renderQrPngBase64(this.qr);
        this.emit("qr", { qr: base64, raw: this.qr });
      }
      return;
    }
    if (this.active) {
      await this.stop();
    }
    this.accountId = accountId;
    this.active = true;
    this.qr = null;
    this.retryCount = 0;
    await this.connectToWhatsApp(accountId);
  }
  async connectToWhatsApp(accountId) {
    if (!this.active) return;
    try {
      const authDir = path.join(os.homedir(), ".openclaw", "credentials", "whatsapp", accountId);
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }
      console.log(`[WhatsAppLogin] Connecting for ${accountId} at ${authDir} (Attempt ${this.retryCount + 1})`);
      await loadBaileys();
      const makeWASocket = _makeWASocket;
      const initAuth = _initAuth;
      const DisconnectReason = _DisconnectReason;
      const fetchLatestBaileysVersion = _fetchLatestBaileysVersion;
      let pino;
      try {
        const baileysRequire = module$1.createRequire(path.join(getBaileysPath(), "package.json"));
        pino = baileysRequire("pino");
      } catch (e) {
        console.warn("[WhatsAppLogin] Could not load pino from baileys, trying root", e);
        try {
          pino = require$1("pino");
        } catch {
          console.warn("[WhatsAppLogin] Pino not found, using console fallback");
          pino = () => ({
            trace: () => {
            },
            debug: () => {
            },
            info: () => {
            },
            warn: () => {
            },
            error: () => {
            },
            fatal: () => {
            },
            child: () => pino()
          });
        }
      }
      console.log("[WhatsAppLogin] Loading auth state...");
      const { state, saveCreds } = await initAuth(authDir);
      console.log("[WhatsAppLogin] Fetching latest version...");
      const { version: version2 } = await fetchLatestBaileysVersion();
      console.log(`[WhatsAppLogin] Starting login for ${accountId}, version: ${version2}`);
      this.socket = makeWASocket({
        version: version2,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        // Silent logger
        connectTimeoutMs: 6e4
        // mobile: false,
        // browser: ['ClawX', 'Chrome', '1.0.0'],
      });
      let connectionOpened = false;
      let credsReceived = false;
      let credsTimeout = null;
      this.socket.ev.on("creds.update", async () => {
        await saveCreds();
        if (connectionOpened && !credsReceived) {
          credsReceived = true;
          if (credsTimeout) clearTimeout(credsTimeout);
          console.log("[WhatsAppLogin] Credentials saved after connection open, finishing login...");
          await new Promise((resolve) => setTimeout(resolve, 3e3));
          await this.finishLogin(accountId);
        }
      });
      this.socket.ev.on("connection.update", async (update) => {
        try {
          const { connection, lastDisconnect, qr } = update;
          if (qr) {
            this.qr = qr;
            console.log("[WhatsAppLogin] QR received");
            const base64 = await renderQrPngBase64(qr);
            if (this.active) this.emit("qr", { qr: base64, raw: qr });
          }
          if (connection === "close") {
            const error2 = lastDisconnect?.error;
            const statusCode = error2?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOut || this.retryCount < 2;
            console.log(
              "[WhatsAppLogin] Connection closed.",
              "Reconnect:",
              shouldReconnect,
              "Active:",
              this.active,
              "Error:",
              error2?.message
            );
            if (shouldReconnect && this.active) {
              if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`[WhatsAppLogin] Reconnecting in 1s... (Attempt ${this.retryCount}/${this.maxRetries})`);
                setTimeout(() => this.connectToWhatsApp(accountId), 1e3);
              } else {
                console.log("[WhatsAppLogin] Max retries reached, stopping.");
                this.active = false;
                this.emit("error", "Connection failed after multiple retries");
              }
            } else {
              this.active = false;
              if (error2?.output?.statusCode === DisconnectReason.loggedOut) {
                try {
                  fs.rmSync(authDir, { recursive: true, force: true });
                } catch (err) {
                  console.error("[WhatsAppLogin] Failed to clear auth dir:", err);
                }
              }
              if (this.socket) {
                this.socket.end(void 0);
                this.socket = null;
              }
              this.emit("error", "Logged out");
            }
          } else if (connection === "open") {
            console.log("[WhatsAppLogin] Connection opened! Waiting for credentials to be saved...");
            this.retryCount = 0;
            connectionOpened = true;
            credsTimeout = setTimeout(async () => {
              if (!credsReceived && this.active) {
                console.warn("[WhatsAppLogin] Timed out waiting for creds.update after connection open, proceeding...");
                await this.finishLogin(accountId);
              }
            }, 15e3);
          }
        } catch (innerErr) {
          console.error("[WhatsAppLogin] Error in connection update:", innerErr);
        }
      });
    } catch (error2) {
      console.error("[WhatsAppLogin] Fatal Connect Error:", error2);
      if (this.active && this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(() => this.connectToWhatsApp(accountId), 2e3);
      } else {
        this.active = false;
        const msg = error2 instanceof Error ? error2.message : String(error2);
        this.emit("error", msg);
      }
    }
  }
  /**
   * Stop current login process
   */
  async stop() {
    this.active = false;
    this.qr = null;
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners("connection.update");
        try {
          this.socket.ws?.close();
        } catch {
        }
        this.socket.end(void 0);
      } catch {
      }
      this.socket = null;
    }
  }
}
const whatsAppLoginManager = new WhatsAppLoginManager();
function toFormUrlEncoded(data) {
  return Object.entries(data).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}
function generatePkceVerifierChallenge() {
  const verifier = crypto$2.randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: crypto$2.createHash("sha256").update(verifier).digest("base64url")
  };
}
const MINIMAX_OAUTH_CONFIG = {
  cn: {
    baseUrl: "https://api.minimaxi.com",
    clientId: "78257093-7e40-4613-99e0-527b14b39113"
  },
  global: {
    baseUrl: "https://api.minimax.io",
    clientId: "78257093-7e40-4613-99e0-527b14b39113"
  }
};
const MINIMAX_OAUTH_SCOPE = "group_id profile model.completion";
const MINIMAX_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";
function getOAuthEndpoints(region) {
  const config = MINIMAX_OAUTH_CONFIG[region];
  return {
    codeEndpoint: `${config.baseUrl}/oauth/code`,
    tokenEndpoint: `${config.baseUrl}/oauth/token`,
    clientId: config.clientId,
    baseUrl: config.baseUrl
  };
}
function generatePkce$1() {
  const { verifier, challenge } = generatePkceVerifierChallenge();
  const state = crypto$2.randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}
async function requestOAuthCode(params) {
  const endpoints = getOAuthEndpoints(params.region);
  const response = await fetch(endpoints.codeEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-request-id": crypto$2.randomUUID()
    },
    body: toFormUrlEncoded({
      response_type: "code",
      client_id: endpoints.clientId,
      scope: MINIMAX_OAUTH_SCOPE,
      code_challenge: params.challenge,
      code_challenge_method: "S256",
      state: params.state
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MiniMax OAuth authorization failed: ${text || response.statusText}`);
  }
  const payload = await response.json();
  if (!payload.user_code || !payload.verification_uri) {
    throw new Error(
      payload.error ?? "MiniMax OAuth authorization returned an incomplete payload (missing user_code or verification_uri)."
    );
  }
  if (payload.state !== params.state) {
    throw new Error("MiniMax OAuth state mismatch: possible CSRF attack or session corruption.");
  }
  return payload;
}
async function pollOAuthToken(params) {
  const endpoints = getOAuthEndpoints(params.region);
  const response = await fetch(endpoints.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: toFormUrlEncoded({
      grant_type: MINIMAX_OAUTH_GRANT_TYPE,
      client_id: endpoints.clientId,
      user_code: params.userCode,
      code_verifier: params.verifier
    })
  });
  const text = await response.text();
  let payload;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = void 0;
    }
  }
  if (!response.ok) {
    return {
      status: "error",
      message: (payload?.base_resp?.status_msg ?? text) || "MiniMax OAuth failed to parse response."
    };
  }
  if (!payload) {
    return { status: "error", message: "MiniMax OAuth failed to parse response." };
  }
  const tokenPayload = payload;
  if (tokenPayload.status === "error") {
    return { status: "error", message: "An error occurred. Please try again later" };
  }
  if (tokenPayload.status != "success") {
    return { status: "pending", message: "current user code is not authorized" };
  }
  if (!tokenPayload.access_token || !tokenPayload.refresh_token || !tokenPayload.expired_in) {
    return { status: "error", message: "MiniMax OAuth returned incomplete token payload." };
  }
  return {
    status: "success",
    token: {
      access: tokenPayload.access_token,
      refresh: tokenPayload.refresh_token,
      expires: tokenPayload.expired_in,
      resourceUrl: tokenPayload.resource_url,
      notification_message: tokenPayload.notification_message
    }
  };
}
async function loginMiniMaxPortalOAuth(params) {
  const region = params.region ?? "global";
  const { verifier, challenge, state } = generatePkce$1();
  const oauth = await requestOAuthCode({ challenge, state, region });
  const verificationUrl = oauth.verification_uri;
  const noteLines = [
    `Open ${verificationUrl} to approve access.`,
    `If prompted, enter the code ${oauth.user_code}.`,
    `Interval: ${oauth.interval ?? "default (2000ms)"}, Expires at: ${oauth.expired_in} unix timestamp`
  ];
  await params.note(noteLines.join("\n"), "MiniMax OAuth");
  try {
    await params.openUrl(verificationUrl);
  } catch {
  }
  let pollIntervalMs = oauth.interval ? oauth.interval : 2e3;
  const expireTimeMs = oauth.expired_in;
  while (Date.now() < expireTimeMs) {
    params.progress.update("Waiting for MiniMax OAuth approval…");
    const result = await pollOAuthToken({
      userCode: oauth.user_code,
      verifier,
      region
    });
    if (result.status === "success") {
      return result.token;
    }
    if (result.status === "error") {
      throw new Error(`MiniMax OAuth failed: ${result.message}`);
    }
    if (result.status === "pending") {
      pollIntervalMs = Math.min(pollIntervalMs * 1.5, 1e4);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("MiniMax OAuth timed out waiting for authorization.");
}
const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const QWEN_OAUTH_SCOPE = "openid profile email model.completion";
const QWEN_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
async function requestDeviceCode(params) {
  const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-request-id": crypto$2.randomUUID()
    },
    body: toFormUrlEncoded({
      client_id: QWEN_OAUTH_CLIENT_ID,
      scope: QWEN_OAUTH_SCOPE,
      code_challenge: params.challenge,
      code_challenge_method: "S256"
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qwen device authorization failed: ${text || response.statusText}`);
  }
  const payload = await response.json();
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error(
      payload.error ?? "Qwen device authorization returned an incomplete payload (missing user_code or verification_uri)."
    );
  }
  return payload;
}
async function pollDeviceToken(params) {
  const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: toFormUrlEncoded({
      grant_type: QWEN_OAUTH_GRANT_TYPE,
      client_id: QWEN_OAUTH_CLIENT_ID,
      device_code: params.deviceCode,
      code_verifier: params.verifier
    })
  });
  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      const text = await response.text();
      return { status: "error", message: text || response.statusText };
    }
    if (payload?.error === "authorization_pending") {
      return { status: "pending" };
    }
    if (payload?.error === "slow_down") {
      return { status: "pending", slowDown: true };
    }
    return {
      status: "error",
      message: payload?.error_description || payload?.error || response.statusText
    };
  }
  const tokenPayload = await response.json();
  if (!tokenPayload.access_token || !tokenPayload.refresh_token || !tokenPayload.expires_in) {
    return { status: "error", message: "Qwen OAuth returned incomplete token payload." };
  }
  return {
    status: "success",
    token: {
      access: tokenPayload.access_token,
      refresh: tokenPayload.refresh_token,
      expires: Date.now() + tokenPayload.expires_in * 1e3,
      resourceUrl: tokenPayload.resource_url
    }
  };
}
async function loginQwenPortalOAuth(params) {
  const { verifier, challenge } = generatePkceVerifierChallenge();
  const device = await requestDeviceCode({ challenge });
  const verificationUrl = device.verification_uri_complete || device.verification_uri;
  await params.note(
    [
      `Open ${verificationUrl} to approve access.`,
      `If prompted, enter the code ${device.user_code}.`
    ].join("\n"),
    "Qwen OAuth"
  );
  try {
    await params.openUrl(verificationUrl);
  } catch {
  }
  const start = Date.now();
  let pollIntervalMs = device.interval ? device.interval * 1e3 : 2e3;
  const timeoutMs = device.expires_in * 1e3;
  while (Date.now() - start < timeoutMs) {
    params.progress.update("Waiting for Qwen OAuth approval…");
    const result = await pollDeviceToken({
      deviceCode: device.device_code,
      verifier
    });
    if (result.status === "success") {
      return result.token;
    }
    if (result.status === "error") {
      throw new Error(`Qwen OAuth failed: ${result.message}`);
    }
    if (result.status === "pending" && result.slowDown) {
      pollIntervalMs = Math.min(pollIntervalMs * 1.5, 1e4);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Qwen OAuth timed out waiting for authorization.");
}
class DeviceOAuthManager extends events.EventEmitter {
  activeProvider = null;
  activeAccountId = null;
  activeLabel = null;
  active = false;
  mainWindow = null;
  setWindow(window2) {
    this.mainWindow = window2;
  }
  async startFlow(provider, region = "global", options) {
    if (this.active) {
      await this.stopFlow();
    }
    this.active = true;
    this.emit("oauth:start", { provider, accountId: options?.accountId || provider });
    this.activeProvider = provider;
    this.activeAccountId = options?.accountId || provider;
    this.activeLabel = options?.label || null;
    try {
      if (provider === "minimax-portal" || provider === "minimax-portal-cn") {
        const actualRegion = provider === "minimax-portal-cn" ? "cn" : region || "global";
        await this.runMiniMaxFlow(actualRegion, provider);
      } else if (provider === "qwen-portal") {
        await this.runQwenFlow();
      } else {
        throw new Error(`Unsupported OAuth provider type: ${provider}`);
      }
      return true;
    } catch (error2) {
      if (!this.active) {
        return false;
      }
      logger.error(`[DeviceOAuth] Flow error for ${provider}:`, error2);
      this.emitError(error2 instanceof Error ? error2.message : String(error2));
      this.active = false;
      this.activeProvider = null;
      this.activeAccountId = null;
      this.activeLabel = null;
      return false;
    }
  }
  async stopFlow() {
    this.active = false;
    this.activeProvider = null;
    this.activeAccountId = null;
    this.activeLabel = null;
    logger.info("[DeviceOAuth] Flow explicitly stopped");
  }
  // ─────────────────────────────────────────────────────────
  // MiniMax flow
  // ─────────────────────────────────────────────────────────
  async runMiniMaxFlow(region, providerType = "minimax-portal") {
    if (!isOpenClawPresent()) {
      throw new Error("OpenClaw package not found");
    }
    const provider = this.activeProvider;
    const token = await loginMiniMaxPortalOAuth({
      region,
      openUrl: async (url) => {
        logger.info(`[DeviceOAuth] MiniMax opening browser: ${url}`);
        electron.shell.openExternal(url).catch(
          (err) => logger.warn(`[DeviceOAuth] Failed to open browser:`, err)
        );
      },
      note: async (message, _title) => {
        if (!this.active) return;
        const { verificationUri, userCode } = this.parseNote(message);
        if (verificationUri && userCode) {
          this.emitCode({ provider, verificationUri, userCode, expiresIn: 300 });
        } else {
          logger.info(`[DeviceOAuth] MiniMax note: ${message}`);
        }
      },
      progress: {
        update: (msg) => logger.info(`[DeviceOAuth] MiniMax progress: ${msg}`),
        stop: (msg) => logger.info(`[DeviceOAuth] MiniMax progress done: ${msg ?? ""}`)
      }
    });
    if (!this.active) return;
    await this.onSuccess(providerType, {
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      // MiniMax returns a per-account resourceUrl as the API base URL
      resourceUrl: token.resourceUrl,
      // Revert back to anthropic-messages
      api: "anthropic-messages",
      region
    });
  }
  // ─────────────────────────────────────────────────────────
  // Qwen flow
  // ─────────────────────────────────────────────────────────
  async runQwenFlow() {
    if (!isOpenClawPresent()) {
      throw new Error("OpenClaw package not found");
    }
    const provider = this.activeProvider;
    const token = await loginQwenPortalOAuth({
      openUrl: async (url) => {
        logger.info(`[DeviceOAuth] Qwen opening browser: ${url}`);
        electron.shell.openExternal(url).catch(
          (err) => logger.warn(`[DeviceOAuth] Failed to open browser:`, err)
        );
      },
      note: async (message, _title) => {
        if (!this.active) return;
        const { verificationUri, userCode } = this.parseNote(message);
        if (verificationUri && userCode) {
          this.emitCode({ provider, verificationUri, userCode, expiresIn: 300 });
        } else {
          logger.info(`[DeviceOAuth] Qwen note: ${message}`);
        }
      },
      progress: {
        update: (msg) => logger.info(`[DeviceOAuth] Qwen progress: ${msg}`),
        stop: (msg) => logger.info(`[DeviceOAuth] Qwen progress done: ${msg ?? ""}`)
      }
    });
    if (!this.active) return;
    await this.onSuccess("qwen-portal", {
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      // Qwen returns a per-account resourceUrl as the API base URL
      resourceUrl: token.resourceUrl,
      // Qwen uses OpenAI Completions API format
      api: "openai-completions"
    });
  }
  // ─────────────────────────────────────────────────────────
  // Success handler
  // ─────────────────────────────────────────────────────────
  async onSuccess(providerType, token) {
    const accountId = this.activeAccountId || providerType;
    const accountLabel = this.activeLabel;
    this.active = false;
    this.activeProvider = null;
    this.activeAccountId = null;
    this.activeLabel = null;
    logger.info(`[DeviceOAuth] Successfully completed OAuth for ${providerType}`);
    try {
      const tokenProviderId = providerType.startsWith("minimax-portal") ? "minimax-portal" : providerType;
      await saveOAuthTokenToOpenClaw(tokenProviderId, {
        access: token.access,
        refresh: token.refresh,
        expires: token.expires
      });
    } catch (err) {
      logger.warn(`[DeviceOAuth] Failed to save OAuth token to OpenClaw:`, err);
    }
    const defaultBaseUrl = providerType === "minimax-portal" ? "https://api.minimax.io/anthropic" : providerType === "minimax-portal-cn" ? "https://api.minimaxi.com/anthropic" : "https://portal.qwen.ai/v1";
    let baseUrl = token.resourceUrl || defaultBaseUrl;
    if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = "https://" + baseUrl;
    }
    if (providerType.startsWith("minimax-portal") && baseUrl) {
      baseUrl = baseUrl.replace(/\/v1$/, "").replace(/\/anthropic$/, "").replace(/\/$/, "") + "/anthropic";
    } else if (providerType === "qwen-portal" && baseUrl) {
      if (!baseUrl.endsWith("/v1")) {
        baseUrl = baseUrl.replace(/\/$/, "") + "/v1";
      }
    }
    try {
      const tokenProviderId = providerType.startsWith("minimax-portal") ? "minimax-portal" : providerType;
      await setOpenClawDefaultModelWithOverride(tokenProviderId, void 0, {
        baseUrl,
        api: token.api,
        // Tells OpenClaw's anthropic adapter to use `Authorization: Bearer` instead of `x-api-key`
        authHeader: providerType.startsWith("minimax-portal") ? true : void 0,
        // OAuth placeholder — tells Gateway to resolve credentials
        // from auth-profiles.json (type: 'oauth') instead of a static API key.
        apiKeyEnv: tokenProviderId === "minimax-portal" ? "minimax-oauth" : "qwen-oauth"
      });
    } catch (err) {
      logger.warn(`[DeviceOAuth] Failed to configure openclaw models:`, err);
    }
    const existing = await getProvider(accountId);
    const nameMap = {
      "minimax-portal": "MiniMax (Global)",
      "minimax-portal-cn": "MiniMax (CN)",
      "qwen-portal": "Qwen"
    };
    const providerConfig = {
      id: accountId,
      name: accountLabel || nameMap[providerType] || providerType,
      type: providerType,
      enabled: existing?.enabled ?? true,
      baseUrl,
      // Save the dynamically resolved URL (Global vs CN)
      model: existing?.model || getProviderDefaultModel(providerType),
      createdAt: existing?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveProvider(providerConfig);
    this.emit("oauth:success", { provider: providerType, accountId });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:success", { provider: providerType, accountId, success: true });
    }
  }
  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────
  /**
   * Parse user_code and verification_uri from the note message sent by
   * the OpenClaw extension's loginXxxPortalOAuth function.
   *
   * Note format (minimax-portal-auth/oauth.ts):
   *   "Open https://platform.minimax.io/oauth-authorize?user_code=dyMj_wOhpK&client=... to approve access.\n"
   *   "If prompted, enter the code dyMj_wOhpK.\n"
   *   ...
   *
   * user_code format: mixed-case alphanumeric with underscore, e.g. "dyMj_wOhpK"
   */
  parseNote(message) {
    const urlMatch = message.match(/Open\s+(https?:\/\/\S+?)\s+to/i);
    const verificationUri = urlMatch?.[1];
    let userCode;
    if (verificationUri) {
      try {
        const parsed = new URL(verificationUri);
        const qp = parsed.searchParams.get("user_code");
        if (qp) userCode = qp;
      } catch {
      }
    }
    if (!userCode) {
      const codeMatch = message.match(/enter.*?code\s+([A-Za-z0-9][A-Za-z0-9_-]{3,})/i);
      if (codeMatch?.[1]) userCode = codeMatch[1].replace(/\.$/, "");
    }
    return { verificationUri, userCode };
  }
  emitCode(data) {
    this.emit("oauth:code", data);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:code", data);
    }
  }
  emitError(message) {
    this.emit("oauth:error", { message });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:error", { message });
    }
  }
}
const deviceOAuthManager = new DeviceOAuthManager();
const CLIENT_ID_KEYS = ["OPENCLAW_GEMINI_OAUTH_CLIENT_ID", "GEMINI_CLI_OAUTH_CLIENT_ID"];
const CLIENT_SECRET_KEYS = [
  "OPENCLAW_GEMINI_OAUTH_CLIENT_SECRET",
  "GEMINI_CLI_OAUTH_CLIENT_SECRET"
];
const REDIRECT_URI$1 = "http://127.0.0.1:8085/oauth2callback";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL$1 = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
];
const TIER_FREE = "free-tier";
const TIER_LEGACY = "legacy-tier";
const TIER_STANDARD = "standard-tier";
const LOCAL_GEMINI_DIR = node_path.join(getClawXConfigDir(), "gemini-cli");
class DetailedError extends Error {
  detail;
  constructor(message, detail) {
    super(message);
    this.name = "DetailedError";
    this.detail = detail;
  }
}
let cachedGeminiCliCredentials = null;
function resolveEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return void 0;
}
function findInPath(name) {
  const exts = process.platform === "win32" ? [".cmd", ".bat", ".exe", ""] : [""];
  for (const dir of (process.env.PATH ?? "").split(node_path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = node_path.join(dir, name + ext);
      if (node_fs.existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}
function findFile(dir, name, depth) {
  if (depth <= 0) {
    return null;
  }
  try {
    for (const entry of node_fs.readdirSync(dir, { withFileTypes: true })) {
      const next = node_path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return next;
      }
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const found = findFile(next, name, depth - 1);
        if (found) {
          return found;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}
function extractGeminiCliCredentials() {
  if (cachedGeminiCliCredentials) {
    return cachedGeminiCliCredentials;
  }
  try {
    const geminiPath = findInPath("gemini");
    if (!geminiPath) {
      return null;
    }
    const resolvedPath = node_fs.realpathSync(geminiPath);
    const geminiCliDir = node_path.dirname(node_path.dirname(resolvedPath));
    const searchPaths = [
      node_path.join(
        geminiCliDir,
        "node_modules",
        "@google",
        "gemini-cli-core",
        "dist",
        "src",
        "code_assist",
        "oauth2.js"
      ),
      node_path.join(
        geminiCliDir,
        "node_modules",
        "@google",
        "gemini-cli-core",
        "dist",
        "code_assist",
        "oauth2.js"
      )
    ];
    let content = null;
    for (const p of searchPaths) {
      if (node_fs.existsSync(p)) {
        content = node_fs.readFileSync(p, "utf8");
        break;
      }
    }
    if (!content) {
      const found = findFile(geminiCliDir, "oauth2.js", 10);
      if (found) {
        content = node_fs.readFileSync(found, "utf8");
      }
    }
    if (!content) {
      return null;
    }
    const idMatch = content.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
    const secretMatch = content.match(/(GOCSPX-[A-Za-z0-9_-]+)/);
    if (idMatch && secretMatch) {
      cachedGeminiCliCredentials = { clientId: idMatch[1], clientSecret: secretMatch[1] };
      return cachedGeminiCliCredentials;
    }
  } catch {
    return null;
  }
  return null;
}
function extractFromLocalInstall() {
  const coreDir = node_path.join(LOCAL_GEMINI_DIR, "node_modules", "@google", "gemini-cli-core");
  if (!node_fs.existsSync(coreDir)) {
    return null;
  }
  const searchPaths = [
    node_path.join(coreDir, "dist", "src", "code_assist", "oauth2.js"),
    node_path.join(coreDir, "dist", "code_assist", "oauth2.js")
  ];
  let content = null;
  for (const p of searchPaths) {
    if (node_fs.existsSync(p)) {
      content = node_fs.readFileSync(p, "utf8");
      break;
    }
  }
  if (!content) {
    const found = findFile(coreDir, "oauth2.js", 10);
    if (found) {
      content = node_fs.readFileSync(found, "utf8");
    }
  }
  if (!content) {
    return null;
  }
  const idMatch = content.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
  const secretMatch = content.match(/(GOCSPX-[A-Za-z0-9_-]+)/);
  if (idMatch && secretMatch) {
    return { clientId: idMatch[1], clientSecret: secretMatch[1] };
  }
  return null;
}
async function installViaNpm(onProgress) {
  const npmBin = findInPath("npm");
  if (!npmBin) {
    return false;
  }
  onProgress?.("Installing Gemini OAuth helper...");
  return await new Promise((resolve) => {
    const useShell = process.platform === "win32";
    const child = node_child_process.execFile(
      npmBin,
      ["install", "--prefix", LOCAL_GEMINI_DIR, "@google/gemini-cli"],
      { timeout: 12e4, shell: useShell, env: { ...process.env, NODE_ENV: "" } },
      (err) => {
        if (err) {
          onProgress?.(`Gemini helper install failed, falling back to direct download...`);
          resolve(false);
        } else {
          cachedGeminiCliCredentials = null;
          onProgress?.("Gemini OAuth helper installed");
          resolve(true);
        }
      }
    );
    child.stderr?.on("data", () => {
    });
  });
}
async function installViaDirectDownload(onProgress) {
  try {
    onProgress?.("Downloading Gemini OAuth helper...");
    const metaRes = await fetch("https://registry.npmjs.org/@google/gemini-cli-core/latest");
    if (!metaRes.ok) {
      onProgress?.(`Failed to fetch Gemini package metadata: ${metaRes.status}`);
      return false;
    }
    const meta = await metaRes.json();
    const tarballUrl = meta.dist?.tarball;
    if (!tarballUrl) {
      onProgress?.("Gemini package tarball URL missing");
      return false;
    }
    const tarRes = await fetch(tarballUrl);
    if (!tarRes.ok) {
      onProgress?.(`Failed to download Gemini package: ${tarRes.status}`);
      return false;
    }
    const buffer = Buffer.from(await tarRes.arrayBuffer());
    const targetDir = node_path.join(LOCAL_GEMINI_DIR, "node_modules", "@google", "gemini-cli-core");
    node_fs.mkdirSync(targetDir, { recursive: true });
    const tmpFile = node_path.join(LOCAL_GEMINI_DIR, "_tmp_gemini-cli-core.tgz");
    node_fs.writeFileSync(tmpFile, buffer);
    try {
      node_child_process.execFileSync("tar", ["xzf", tmpFile, "-C", targetDir, "--strip-components=1"], {
        timeout: 3e4
      });
    } finally {
      try {
        node_fs.unlinkSync(tmpFile);
      } catch {
      }
    }
    cachedGeminiCliCredentials = null;
    onProgress?.("Gemini OAuth helper ready");
    return true;
  } catch (err) {
    onProgress?.(`Direct Gemini helper download failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
async function ensureOAuthClientConfig(onProgress) {
  const envClientId = resolveEnv(CLIENT_ID_KEYS);
  const envClientSecret = resolveEnv(CLIENT_SECRET_KEYS);
  if (envClientId) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }
  const extracted = extractGeminiCliCredentials();
  if (extracted) {
    return extracted;
  }
  const localExtracted = extractFromLocalInstall();
  if (localExtracted) {
    return localExtracted;
  }
  node_fs.mkdirSync(LOCAL_GEMINI_DIR, { recursive: true });
  const installed = await installViaNpm(onProgress) || await installViaDirectDownload(onProgress);
  if (installed) {
    const installedExtracted = extractFromLocalInstall();
    if (installedExtracted) {
      return installedExtracted;
    }
  }
  throw new Error(
    "Unable to prepare Gemini OAuth credentials automatically. Set GEMINI_CLI_OAUTH_CLIENT_ID or try again later."
  );
}
function generatePkce() {
  const verifier = crypto$2.randomBytes(32).toString("hex");
  const challenge = crypto$2.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
function buildAuthUrl(clientId, challenge, verifier) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI$1,
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
    access_type: "offline",
    prompt: "consent"
  });
  return `${AUTH_URL}?${params.toString()}`;
}
async function waitForLocalCallback(params) {
  const port = 8085;
  const hostname = "127.0.0.1";
  const expectedPath = "/oauth2callback";
  return new Promise((resolve, reject) => {
    let timeout = null;
    const server = node_http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://${hostname}:${port}`);
        if (requestUrl.pathname !== expectedPath) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not found");
          return;
        }
        const error2 = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code")?.trim();
        const state = requestUrl.searchParams.get("state")?.trim();
        if (error2) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end(`Authentication failed: ${error2}`);
          finish(new Error(`OAuth error: ${error2}`));
          return;
        }
        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain");
          res.end("Missing code or state");
          finish(new Error("Missing OAuth code or state"));
          return;
        }
        if (state !== params.expectedState) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<!doctype html><html><head><meta charset='utf-8'/></head><body><h2>Session expired</h2><p>This authorization link is from a previous attempt. Please go back to ClawX and try again.</p></body></html>"
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'/></head><body><h2>Gemini CLI OAuth complete</h2><p>You can close this window and return to ClawX.</p></body></html>"
        );
        finish(void 0, { code, state });
      } catch (err) {
        finish(err instanceof Error ? err : new Error("OAuth callback failed"));
      }
    });
    const finish = (err, result) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      try {
        server.close();
      } catch {
      }
      if (err) {
        reject(err);
      } else if (result) {
        resolve(result);
      }
    };
    server.once("error", (err) => {
      finish(err instanceof Error ? err : new Error("OAuth callback server error"));
    });
    server.listen(port, hostname, () => {
      params.onProgress?.(`Waiting for OAuth callback on ${REDIRECT_URI$1}...`);
    });
    timeout = setTimeout(() => {
      finish(new DetailedError(
        "OAuth login timed out. The browser did not redirect back. Check if localhost:8085 is blocked.",
        `Waited ${params.timeoutMs / 1e3}s for callback on ${hostname}:${port}`
      ));
    }, params.timeoutMs);
  });
}
async function getUserEmail(accessToken) {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      return data.email;
    }
  } catch {
  }
  return void 0;
}
function getDefaultTier(allowedTiers) {
  if (!allowedTiers?.length) {
    return { id: TIER_LEGACY };
  }
  return allowedTiers.find((tier) => tier.isDefault) ?? { id: TIER_LEGACY };
}
function isVpcScAffected(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const error2 = payload.error;
  if (!error2 || typeof error2 !== "object") {
    return false;
  }
  const details = error2.details;
  if (!Array.isArray(details)) {
    return false;
  }
  return details.some(
    (item) => typeof item === "object" && item && item.reason === "SECURITY_POLICY_VIOLATED"
  );
}
async function pollOperation(operationName, headers) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5e3));
    const response = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal/${operationName}`, { headers });
    if (!response.ok) {
      continue;
    }
    const data = await response.json();
    if (data.done) {
      return data;
    }
  }
  throw new Error("Operation polling timeout");
}
async function discoverProject(accessToken) {
  const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/clawx"
  };
  const loadBody = {
    cloudaicompanionProject: envProject,
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
      duetProject: envProject
    }
  };
  let data = {};
  const response = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`, {
    method: "POST",
    headers,
    body: JSON.stringify(loadBody)
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    if (isVpcScAffected(errorPayload)) {
      data = { currentTier: { id: TIER_STANDARD } };
    } else {
      throw new Error(`loadCodeAssist failed: ${response.status} ${response.statusText}`);
    }
  } else {
    data = await response.json();
  }
  if (data.currentTier) {
    const project = data.cloudaicompanionProject;
    if (typeof project === "string" && project) {
      return project;
    }
    if (typeof project === "object" && project?.id) {
      return project.id;
    }
    if (envProject) {
      return envProject;
    }
  }
  const hasExistingTierButNoProject = !!data.currentTier;
  const tier = hasExistingTierButNoProject ? { id: TIER_FREE } : getDefaultTier(data.allowedTiers);
  const tierId = tier?.id || TIER_FREE;
  if (tierId !== TIER_FREE && !envProject) {
    throw new DetailedError(
      "Your Google account requires a Cloud project. Please create one and set GOOGLE_CLOUD_PROJECT.",
      `tierId=${tierId}, currentTier=${JSON.stringify(data.currentTier ?? null)}, allowedTiers=${JSON.stringify(data.allowedTiers)}`
    );
  }
  const onboardBody = {
    tierId,
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI"
    }
  };
  if (tierId !== TIER_FREE && envProject) {
    onboardBody.cloudaicompanionProject = envProject;
    onboardBody.metadata.duetProject = envProject;
  }
  const onboardResponse = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`, {
    method: "POST",
    headers,
    body: JSON.stringify(onboardBody)
  });
  if (!onboardResponse.ok) {
    const respText = await onboardResponse.text().catch(() => "");
    throw new DetailedError(
      "Google project provisioning failed. Please try again later.",
      `onboardUser ${onboardResponse.status} ${onboardResponse.statusText}: ${respText}`
    );
  }
  let lro = await onboardResponse.json();
  if (!lro.done && lro.name) {
    lro = await pollOperation(lro.name, headers);
  }
  const projectId = lro.response?.cloudaicompanionProject?.id;
  if (projectId) {
    return projectId;
  }
  if (envProject) {
    return envProject;
  }
  throw new DetailedError(
    "Could not discover or provision a Google Cloud project. Set GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID.",
    `tierId=${tierId}, onboardResponse=${JSON.stringify(lro)}, currentTier=${JSON.stringify(data.currentTier ?? null)}`
  );
}
async function exchangeCodeForTokens(code, verifier, clientConfig) {
  const { clientId, clientSecret } = clientConfig;
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI$1,
    code_verifier: verifier
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  const response = await fetch(TOKEN_URL$1, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }
  const data = await response.json();
  if (!data.refresh_token) {
    throw new Error("No refresh token received. Please try again.");
  }
  const email = await getUserEmail(data.access_token);
  const projectId = await discoverProject(data.access_token);
  const expiresAt = Date.now() + data.expires_in * 1e3 - 5 * 60 * 1e3;
  return {
    refresh: data.refresh_token,
    access: data.access_token,
    expires: expiresAt,
    projectId,
    email
  };
}
async function loginGeminiCliOAuth(ctx) {
  if (ctx.isRemote) {
    throw new Error("Remote/manual Gemini OAuth is not implemented in ClawX yet.");
  }
  await ctx.note(
    [
      "Browser will open for Google authentication.",
      "Sign in with your Google account for Gemini CLI access.",
      "The callback will be captured automatically on 127.0.0.1:8085."
    ].join("\n"),
    "Gemini CLI OAuth"
  );
  ctx.progress.update("Preparing Google OAuth...");
  const clientConfig = await ensureOAuthClientConfig((msg) => ctx.progress.update(msg));
  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthUrl(clientConfig.clientId, challenge, verifier);
  ctx.progress.update("Complete sign-in in browser...");
  try {
    await ctx.openUrl(authUrl);
  } catch {
    ctx.log(`
Open this URL in your browser:

${authUrl}
`);
  }
  try {
    const { code } = await waitForLocalCallback({
      expectedState: verifier,
      timeoutMs: 5 * 60 * 1e3,
      onProgress: (msg) => ctx.progress.update(msg)
    });
    ctx.progress.update("Exchanging authorization code for tokens...");
    return await exchangeCodeForTokens(code, verifier, clientConfig);
  } catch (err) {
    if (err instanceof Error && (err.message.includes("EADDRINUSE") || err.message.includes("port") || err.message.includes("listen"))) {
      throw new Error(
        "Port 8085 is in use by another process. Close the other application using port 8085 and try again.",
        { cause: err }
      );
    }
    throw err;
  }
}
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const ORIGINATOR = "codex_cli_rs";
const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication successful</title>
</head>
<body>
  <p>Authentication successful. Return to ClawX to continue.</p>
</body>
</html>`;
function toBase64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function createPkce() {
  const verifier = toBase64Url(crypto$2.randomBytes(32));
  const challenge = toBase64Url(crypto$2.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
function createState() {
  return toBase64Url(crypto$2.randomBytes(32));
}
function parseAuthorizationInput(input) {
  const value = input.trim();
  if (!value) {
    return {};
  }
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") ?? void 0,
      state: url.searchParams.get("state") ?? void 0
    };
  } catch {
  }
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code, state };
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    return {
      code: params.get("code") ?? void 0,
      state: params.get("state") ?? void 0
    };
  }
  return { code: value };
}
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
function getAccountIdFromAccessToken(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const authClaims = payload?.[JWT_CLAIM_PATH];
  if (!authClaims || typeof authClaims !== "object") {
    return null;
  }
  const accountId = authClaims.chatgpt_account_id;
  if (typeof accountId !== "string" || !accountId.trim()) {
    return null;
  }
  return accountId;
}
async function createAuthorizationFlow() {
  const { verifier, challenge } = createPkce();
  const state = createState();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", ORIGINATOR);
  return { verifier, state, url: url.toString() };
}
function startLocalOAuthServer(state) {
  let lastCode = null;
  const server = node_http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      if (url.pathname !== "/auth/callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      if (url.searchParams.get("state") !== state) {
        res.statusCode = 400;
        res.end("State mismatch");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.statusCode = 400;
        res.end("Missing authorization code");
        return;
      }
      lastCode = code;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(SUCCESS_HTML);
    } catch {
      res.statusCode = 500;
      res.end("Internal error");
    }
  });
  return new Promise((resolve) => {
    server.listen(1455, "localhost", () => {
      resolve({
        close: () => server.close(),
        waitForCode: async () => {
          const sleep = () => new Promise((r) => setTimeout(r, 100));
          for (let i = 0; i < 600; i += 1) {
            if (lastCode) {
              return { code: lastCode };
            }
            await sleep();
          }
          return null;
        }
      });
    }).on("error", () => {
      resolve(null);
    });
  });
}
async function exchangeAuthorizationCode(code, verifier) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI token exchange failed (${response.status}): ${text}`);
  }
  const json = await response.json();
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new Error("OpenAI token response missing fields");
  }
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1e3
  };
}
async function loginOpenAICodexOAuth(options) {
  const { verifier, state, url } = await createAuthorizationFlow();
  options.onProgress?.("Opening OpenAI sign-in page…");
  const server = await startLocalOAuthServer(state);
  try {
    await options.openUrl(url);
    options.onProgress?.(
      server ? "Waiting for OpenAI OAuth callback…" : "Callback port unavailable, waiting for manual authorization code…"
    );
    let code;
    if (server) {
      const result = await server.waitForCode();
      code = result?.code ?? void 0;
      if (!code && options.onManualCodeInput) {
        options.onManualCodeRequired?.({ authorizationUrl: url, reason: "callback_timeout" });
        code = await options.onManualCodeInput();
      }
    } else {
      if (!options.onManualCodeInput) {
        throw new Error("Cannot start OpenAI OAuth callback server on localhost:1455");
      }
      options.onManualCodeRequired?.({ authorizationUrl: url, reason: "port_in_use" });
      code = await options.onManualCodeInput();
    }
    if (!code) {
      throw new Error("Missing OpenAI authorization code");
    }
    const parsed = parseAuthorizationInput(code);
    if (parsed.state && parsed.state !== state) {
      throw new Error("OpenAI OAuth state mismatch");
    }
    code = parsed.code;
    if (!code) {
      throw new Error("Missing OpenAI authorization code");
    }
    const token = await exchangeAuthorizationCode(code, verifier);
    const accountId = getAccountIdFromAccessToken(token.access);
    if (!accountId) {
      throw new Error("Failed to extract OpenAI accountId from token");
    }
    return {
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      accountId
    };
  } finally {
    server?.close();
  }
}
function maskApiKey(apiKey) {
  if (!apiKey) return null;
  if (apiKey.length > 12) {
    return `${apiKey.substring(0, 4)}${"*".repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 4)}`;
  }
  return "*".repeat(apiKey.length);
}
const legacyProviderApiWarned = /* @__PURE__ */ new Set();
function logLegacyProviderApiUsage(method, replacement) {
  if (legacyProviderApiWarned.has(method)) {
    return;
  }
  legacyProviderApiWarned.add(method);
  logger.warn(
    `[provider-migration] Legacy provider API "${method}" is deprecated. Migrate to "${replacement}".`
  );
}
class ProviderService {
  async listVendors() {
    return PROVIDER_DEFINITIONS;
  }
  async listAccounts() {
    await ensureProviderStoreMigrated();
    return listProviderAccounts();
  }
  async getAccount(accountId) {
    await ensureProviderStoreMigrated();
    return getProviderAccount(accountId);
  }
  async getDefaultAccountId() {
    await ensureProviderStoreMigrated();
    return getDefaultProviderAccountId();
  }
  async createAccount(account, apiKey) {
    await ensureProviderStoreMigrated();
    await saveProvider(providerAccountToConfig(account));
    await saveProviderAccount(account);
    if (apiKey !== void 0 && apiKey.trim()) {
      await storeApiKey(account.id, apiKey.trim());
    }
    return await getProviderAccount(account.id) ?? account;
  }
  async updateAccount(accountId, patch, apiKey) {
    await ensureProviderStoreMigrated();
    const existing = await getProviderAccount(accountId);
    if (!existing) {
      throw new Error("Provider account not found");
    }
    const nextAccount = {
      ...existing,
      ...patch,
      id: accountId,
      updatedAt: patch.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveProvider(providerAccountToConfig(nextAccount));
    await saveProviderAccount(nextAccount);
    if (apiKey !== void 0) {
      const trimmedKey = apiKey.trim();
      if (trimmedKey) {
        await storeApiKey(accountId, trimmedKey);
      } else {
        await deleteApiKey(accountId);
      }
    }
    return await getProviderAccount(accountId) ?? nextAccount;
  }
  async deleteAccount(accountId) {
    await ensureProviderStoreMigrated();
    return deleteProvider(accountId);
  }
  /**
   * @deprecated Use listAccounts() and map account data in callers.
   */
  async listLegacyProviders() {
    logLegacyProviderApiUsage("listLegacyProviders", "listAccounts");
    await ensureProviderStoreMigrated();
    const accounts = await listProviderAccounts();
    return accounts.map(providerAccountToConfig);
  }
  /**
   * @deprecated Use listAccounts() + secret-store based key summary.
   */
  async listLegacyProvidersWithKeyInfo() {
    logLegacyProviderApiUsage("listLegacyProvidersWithKeyInfo", "listAccounts");
    const providers = await this.listLegacyProviders();
    const results = [];
    for (const provider of providers) {
      const apiKey = await getApiKey(provider.id);
      results.push({
        ...provider,
        hasKey: !!apiKey,
        keyMasked: maskApiKey(apiKey)
      });
    }
    return results;
  }
  /**
   * @deprecated Use getAccount(accountId).
   */
  async getLegacyProvider(providerId) {
    logLegacyProviderApiUsage("getLegacyProvider", "getAccount");
    await ensureProviderStoreMigrated();
    const account = await getProviderAccount(providerId);
    return account ? providerAccountToConfig(account) : null;
  }
  /**
   * @deprecated Use createAccount()/updateAccount().
   */
  async saveLegacyProvider(config) {
    logLegacyProviderApiUsage("saveLegacyProvider", "createAccount/updateAccount");
    await ensureProviderStoreMigrated();
    const account = providerConfigToAccount(config);
    const existing = await getProviderAccount(config.id);
    if (existing) {
      await this.updateAccount(config.id, account);
      return;
    }
    await this.createAccount(account);
  }
  /**
   * @deprecated Use deleteAccount(accountId).
   */
  async deleteLegacyProvider(providerId) {
    logLegacyProviderApiUsage("deleteLegacyProvider", "deleteAccount");
    await ensureProviderStoreMigrated();
    await this.deleteAccount(providerId);
    return true;
  }
  /**
   * @deprecated Use setDefaultAccount(accountId).
   */
  async setDefaultLegacyProvider(providerId) {
    logLegacyProviderApiUsage("setDefaultLegacyProvider", "setDefaultAccount");
    await this.setDefaultAccount(providerId);
  }
  /**
   * @deprecated Use getDefaultAccountId().
   */
  async getDefaultLegacyProvider() {
    logLegacyProviderApiUsage("getDefaultLegacyProvider", "getDefaultAccountId");
    return this.getDefaultAccountId();
  }
  /**
   * @deprecated Use secret-store APIs by accountId.
   */
  async setLegacyProviderApiKey(providerId, apiKey) {
    logLegacyProviderApiUsage("setLegacyProviderApiKey", "setProviderSecret(accountId, api_key)");
    return storeApiKey(providerId, apiKey);
  }
  /**
   * @deprecated Use secret-store APIs by accountId.
   */
  async getLegacyProviderApiKey(providerId) {
    logLegacyProviderApiUsage("getLegacyProviderApiKey", "getProviderSecret(accountId)");
    return getApiKey(providerId);
  }
  /**
   * @deprecated Use secret-store APIs by accountId.
   */
  async deleteLegacyProviderApiKey(providerId) {
    logLegacyProviderApiUsage("deleteLegacyProviderApiKey", "deleteProviderSecret(accountId)");
    return deleteApiKey(providerId);
  }
  /**
   * @deprecated Use secret-store APIs by accountId.
   */
  async hasLegacyProviderApiKey(providerId) {
    logLegacyProviderApiUsage("hasLegacyProviderApiKey", "getProviderSecret(accountId)");
    return hasApiKey(providerId);
  }
  async setDefaultAccount(accountId) {
    await ensureProviderStoreMigrated();
    await setDefaultProviderAccount(accountId);
    await setDefaultProvider(accountId);
  }
  getVendorDefinition(vendorId) {
    return getProviderDefinition(vendorId);
  }
}
const providerService = new ProviderService();
function getProviderService() {
  return providerService;
}
const GOOGLE_RUNTIME_PROVIDER_ID = "google-gemini-cli";
const GOOGLE_OAUTH_DEFAULT_MODEL = "gemini-3-pro-preview";
const OPENAI_RUNTIME_PROVIDER_ID = "openai-codex";
const OPENAI_OAUTH_DEFAULT_MODEL = "gpt-5.3-codex";
class BrowserOAuthManager extends events.EventEmitter {
  activeProvider = null;
  activeAccountId = null;
  activeLabel = null;
  active = false;
  mainWindow = null;
  pendingManualCodeResolve = null;
  pendingManualCodeReject = null;
  setWindow(window2) {
    this.mainWindow = window2;
  }
  async startFlow(provider, options) {
    if (this.active) {
      await this.stopFlow();
    }
    this.active = true;
    this.activeProvider = provider;
    this.activeAccountId = options?.accountId || provider;
    this.activeLabel = options?.label || null;
    this.emit("oauth:start", { provider, accountId: this.activeAccountId });
    if (provider === "openai") {
      void this.executeFlow(provider);
      return true;
    }
    await this.executeFlow(provider);
    return true;
  }
  async executeFlow(provider) {
    try {
      const token = provider === "google" ? await loginGeminiCliOAuth({
        isRemote: false,
        openUrl: async (url) => {
          await electron.shell.openExternal(url);
        },
        log: (message) => logger.info(`[BrowserOAuth] ${message}`),
        note: async (message, title) => {
          logger.info(`[BrowserOAuth] ${title || "OAuth note"}: ${message}`);
        },
        prompt: async () => {
          throw new Error("Manual browser OAuth fallback is not implemented in ClawX yet.");
        },
        progress: {
          update: (message) => logger.info(`[BrowserOAuth] ${message}`),
          stop: (message) => {
            if (message) {
              logger.info(`[BrowserOAuth] ${message}`);
            }
          }
        }
      }) : await loginOpenAICodexOAuth({
        openUrl: async (url) => {
          await electron.shell.openExternal(url);
        },
        onProgress: (message) => logger.info(`[BrowserOAuth] ${message}`),
        onManualCodeRequired: ({ authorizationUrl, reason }) => {
          const message = reason === "port_in_use" ? "OpenAI OAuth callback port 1455 is in use. Complete sign-in, then paste the final callback URL or code." : "OpenAI OAuth callback timed out. Paste the final callback URL or code to continue.";
          const payload = {
            provider,
            mode: "manual",
            authorizationUrl,
            message
          };
          this.emit("oauth:code", payload);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send("oauth:code", payload);
          }
        },
        onManualCodeInput: async () => {
          return await new Promise((resolve, reject) => {
            this.pendingManualCodeResolve = resolve;
            this.pendingManualCodeReject = reject;
          });
        }
      });
      await this.onSuccess(provider, token);
    } catch (error2) {
      if (!this.active) {
        return;
      }
      logger.error(`[BrowserOAuth] Flow error for ${provider}:`, error2);
      this.emitError(error2 instanceof Error ? error2.message : String(error2));
      this.active = false;
      this.activeProvider = null;
      this.activeAccountId = null;
      this.activeLabel = null;
      this.pendingManualCodeResolve = null;
      this.pendingManualCodeReject = null;
    }
  }
  async stopFlow() {
    this.active = false;
    this.activeProvider = null;
    this.activeAccountId = null;
    this.activeLabel = null;
    if (this.pendingManualCodeReject) {
      this.pendingManualCodeReject(new Error("OAuth flow cancelled"));
    }
    this.pendingManualCodeResolve = null;
    this.pendingManualCodeReject = null;
    logger.info("[BrowserOAuth] Flow explicitly stopped");
  }
  submitManualCode(code) {
    const value = code.trim();
    if (!value || !this.pendingManualCodeResolve) {
      return false;
    }
    this.pendingManualCodeResolve(value);
    this.pendingManualCodeResolve = null;
    this.pendingManualCodeReject = null;
    return true;
  }
  async onSuccess(providerType, token) {
    const accountId = this.activeAccountId || providerType;
    const accountLabel = this.activeLabel;
    this.active = false;
    this.activeProvider = null;
    this.activeAccountId = null;
    this.activeLabel = null;
    this.pendingManualCodeResolve = null;
    this.pendingManualCodeReject = null;
    logger.info(`[BrowserOAuth] Successfully completed OAuth for ${providerType}`);
    const providerService2 = getProviderService();
    const existing = await providerService2.getAccount(accountId);
    const isGoogle = providerType === "google";
    const runtimeProviderId = isGoogle ? GOOGLE_RUNTIME_PROVIDER_ID : OPENAI_RUNTIME_PROVIDER_ID;
    const defaultModel = isGoogle ? GOOGLE_OAUTH_DEFAULT_MODEL : OPENAI_OAUTH_DEFAULT_MODEL;
    const accountLabelDefault = isGoogle ? "Google Gemini" : "OpenAI Codex";
    const oauthTokenEmail = "email" in token && typeof token.email === "string" ? token.email : void 0;
    const oauthTokenSubject = "projectId" in token && typeof token.projectId === "string" ? token.projectId : "accountId" in token && typeof token.accountId === "string" ? token.accountId : void 0;
    const normalizedExistingModel = (() => {
      const value = existing?.model?.trim();
      if (!value) return void 0;
      if (isGoogle) {
        return value.includes("/") ? value.split("/").pop() : value;
      }
      if (value.startsWith("openai/")) return void 0;
      if (value.startsWith("openai-codex/")) return value.split("/").pop();
      return value.includes("/") ? value.split("/").pop() : value;
    })();
    const nextAccount = await providerService2.createAccount({
      id: accountId,
      vendorId: providerType,
      label: accountLabel || existing?.label || accountLabelDefault,
      authMode: "oauth_browser",
      baseUrl: existing?.baseUrl,
      apiProtocol: existing?.apiProtocol,
      model: normalizedExistingModel || defaultModel,
      fallbackModels: existing?.fallbackModels,
      fallbackAccountIds: existing?.fallbackAccountIds,
      enabled: existing?.enabled ?? true,
      isDefault: existing?.isDefault ?? false,
      metadata: {
        ...existing?.metadata,
        email: oauthTokenEmail,
        resourceUrl: runtimeProviderId
      },
      createdAt: existing?.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await getSecretStore().set({
      type: "oauth",
      accountId,
      accessToken: token.access,
      refreshToken: token.refresh,
      expiresAt: token.expires,
      email: oauthTokenEmail,
      subject: oauthTokenSubject
    });
    await saveOAuthTokenToOpenClaw(runtimeProviderId, {
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      email: oauthTokenEmail,
      projectId: oauthTokenSubject
    });
    this.emit("oauth:success", { provider: providerType, accountId: nextAccount.id });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:success", {
        provider: providerType,
        accountId: nextAccount.id,
        success: true
      });
    }
  }
  emitError(message) {
    this.emit("oauth:error", { message });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:error", { message });
    }
  }
}
const browserOAuthManager = new BrowserOAuthManager();
async function applyProxySettings(partialSettings) {
  const settings = partialSettings ?? await getAllSettings();
  const config = buildElectronProxyConfig(settings);
  await electron.session.defaultSession.setProxy(config);
  try {
    await electron.session.defaultSession.closeAllConnections();
  } catch (error2) {
    logger.debug("Failed to close existing connections after proxy update:", error2);
  }
  logger.info(
    `Applied Electron proxy (${config.mode}${config.proxyRules ? `, server=${config.proxyRules}` : ""}${config.proxyBypassRules ? `, bypass=${config.proxyBypassRules}` : ""})`
  );
}
const LINUX_AUTOSTART_FILE = node_path.join(".config", "autostart", "clawx.desktop");
function quoteDesktopArg(value) {
  if (!value) return '""';
  const escaped = value.replace(/(["\\`$])/g, "\\$1");
  if (/[\s"'\\`$]/.test(value)) {
    return `"${escaped}"`;
  }
  return value;
}
function getLinuxExecCommand() {
  if (electron.app.isPackaged) {
    return quoteDesktopArg(process.execPath);
  }
  const launchArgs = process.argv.slice(1).filter(Boolean);
  const cmdParts = [process.execPath, ...launchArgs].map(quoteDesktopArg);
  return cmdParts.join(" ");
}
function getLinuxDesktopEntry() {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=YUEWEI集团",
    "Comment=YUEWEI集团 - AI Assistant",
    `Exec=${getLinuxExecCommand()}`,
    "Terminal=false",
    "Categories=Utility;",
    "X-GNOME-Autostart-enabled=true",
    ""
  ].join("\n");
}
async function applyLinuxLaunchAtStartup(enabled) {
  const targetPath = node_path.join(electron.app.getPath("home"), LINUX_AUTOSTART_FILE);
  if (enabled) {
    await promises$1.mkdir(node_path.dirname(targetPath), { recursive: true });
    await promises$1.writeFile(targetPath, getLinuxDesktopEntry(), "utf8");
    logger.info(`Launch-at-startup enabled via desktop entry: ${targetPath}`);
    return;
  }
  await promises$1.rm(targetPath, { force: true });
  logger.info(`Launch-at-startup disabled and desktop entry removed: ${targetPath}`);
}
function applyWindowsOrMacLaunchAtStartup(enabled) {
  electron.app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false
  });
  logger.info(`Launch-at-startup ${enabled ? "enabled" : "disabled"} via login items`);
}
async function applyLaunchAtStartupSetting(enabled) {
  try {
    if (process.platform === "linux") {
      await applyLinuxLaunchAtStartup(enabled);
      return;
    }
    if (process.platform === "win32" || process.platform === "darwin") {
      applyWindowsOrMacLaunchAtStartup(enabled);
      return;
    }
    logger.warn(`Launch-at-startup unsupported on platform: ${process.platform}`);
  } catch (error2) {
    logger.error(`Failed to apply launch-at-startup=${enabled}:`, error2);
  }
}
async function syncLaunchAtStartupSettingFromStore() {
  const launchAtStartup = await getSetting("launchAtStartup");
  await applyLaunchAtStartupSetting(Boolean(launchAtStartup));
}
function extractSessionIdFromTranscriptFileName(fileName) {
  if (!fileName.endsWith(".jsonl") && !fileName.includes(".jsonl.reset.")) return void 0;
  return fileName.replace(/\.jsonl\.reset\..+$/, "").replace(/\.deleted\.jsonl$/, "").replace(/\.jsonl$/, "");
}
function normalizeUsageContent(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  if (Array.isArray(value)) {
    const chunks = value.map((item) => normalizeUsageContent(item)).filter((item) => Boolean(item));
    if (chunks.length === 0) return void 0;
    return chunks.join("\n\n");
  }
  if (value && typeof value === "object") {
    const record = value;
    if (typeof record.text === "string") {
      const trimmed = record.text.trim();
      if (trimmed.length > 0) return trimmed;
    }
    if (typeof record.content === "string") {
      const trimmed = record.content.trim();
      if (trimmed.length > 0) return trimmed;
    }
    if (Array.isArray(record.content)) {
      return normalizeUsageContent(record.content);
    }
    if (typeof record.thinking === "string") {
      const trimmed = record.thinking.trim();
      if (trimmed.length > 0) return trimmed;
    }
    try {
      return JSON.stringify(record, null, 2);
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function parseUsageEntriesFromJsonl(content, context, limit) {
  const entries = [];
  const lines = content.split(/\r?\n/).filter(Boolean);
  const maxEntries = typeof limit === "number" && Number.isFinite(limit) ? Math.max(Math.floor(limit), 0) : Number.POSITIVE_INFINITY;
  for (let i = lines.length - 1; i >= 0 && entries.length < maxEntries; i -= 1) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const message = parsed.message;
    if (!message || !parsed.timestamp) {
      continue;
    }
    if (message.role === "assistant" && message.usage) {
      const usage2 = message.usage;
      const inputTokens2 = usage2.input ?? usage2.promptTokens ?? 0;
      const outputTokens2 = usage2.output ?? usage2.completionTokens ?? 0;
      const cacheReadTokens2 = usage2.cacheRead ?? 0;
      const cacheWriteTokens2 = usage2.cacheWrite ?? 0;
      const totalTokens2 = usage2.total ?? usage2.totalTokens ?? inputTokens2 + outputTokens2 + cacheReadTokens2 + cacheWriteTokens2;
      if (totalTokens2 <= 0) {
        continue;
      }
      const contentText2 = normalizeUsageContent(message.content);
      entries.push({
        timestamp: parsed.timestamp,
        sessionId: context.sessionId,
        agentId: context.agentId,
        model: message.model ?? message.modelRef,
        provider: message.provider,
        ...contentText2 ? { content: contentText2 } : {},
        inputTokens: inputTokens2,
        outputTokens: outputTokens2,
        cacheReadTokens: cacheReadTokens2,
        cacheWriteTokens: cacheWriteTokens2,
        totalTokens: totalTokens2,
        costUsd: usage2.cost?.total
      });
      continue;
    }
    if (message.role !== "toolResult") {
      continue;
    }
    const details = message.details;
    if (!details) {
      continue;
    }
    const usage = details.usage;
    const inputTokens = usage?.input ?? usage?.promptTokens ?? 0;
    const outputTokens = usage?.output ?? usage?.completionTokens ?? 0;
    const cacheReadTokens = usage?.cacheRead ?? 0;
    const cacheWriteTokens = usage?.cacheWrite ?? 0;
    const totalTokens = usage?.total ?? usage?.totalTokens ?? inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
    const provider = details.provider ?? details.externalContent?.provider ?? message.provider;
    const model = details.model ?? message.model ?? message.modelRef;
    const contentText = normalizeUsageContent(details.content) ?? normalizeUsageContent(message.content);
    if (!provider && !model) {
      continue;
    }
    if (totalTokens <= 0) {
      continue;
    }
    entries.push({
      timestamp: parsed.timestamp,
      sessionId: context.sessionId,
      agentId: context.agentId,
      model,
      provider,
      ...contentText ? { content: contentText } : {},
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      costUsd: usage?.cost?.total
    });
  }
  return entries;
}
async function listRecentSessionFiles() {
  const openclawDir = getOpenClawConfigDir();
  const agentsDir = path.join(openclawDir, "agents");
  try {
    const agentEntries = await listConfiguredAgentIds();
    const files = [];
    for (const agentId of agentEntries) {
      const sessionsDir = path.join(agentsDir, agentId, "sessions");
      try {
        const sessionEntries = await promises.readdir(sessionsDir);
        for (const fileName of sessionEntries) {
          const sessionId = extractSessionIdFromTranscriptFileName(fileName);
          if (!sessionId) continue;
          const filePath = path.join(sessionsDir, fileName);
          try {
            const fileStat = await promises.stat(filePath);
            files.push({
              filePath,
              sessionId,
              agentId,
              mtimeMs: fileStat.mtimeMs
            });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files;
  } catch {
    return [];
  }
}
async function getRecentTokenUsageHistory(limit) {
  const files = await listRecentSessionFiles();
  const results = [];
  const maxEntries = typeof limit === "number" && Number.isFinite(limit) ? Math.max(Math.floor(limit), 0) : Number.POSITIVE_INFINITY;
  for (const file of files) {
    if (results.length >= maxEntries) break;
    try {
      const content = await promises.readFile(file.filePath, "utf8");
      const entries = parseUsageEntriesFromJsonl(content, {
        sessionId: file.sessionId,
        agentId: file.agentId
      }, Number.isFinite(maxEntries) ? maxEntries - results.length : void 0);
      results.push(...entries);
    } catch (error2) {
      logger.debug(`Failed to read token usage transcript ${file.filePath}:`, error2);
    }
  }
  results.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return Number.isFinite(maxEntries) ? results.slice(0, maxEntries) : results;
}
const GOOGLE_OAUTH_RUNTIME_PROVIDER = "google-gemini-cli";
const GOOGLE_OAUTH_DEFAULT_MODEL_REF = `${GOOGLE_OAUTH_RUNTIME_PROVIDER}/gemini-3-pro-preview`;
const OPENAI_OAUTH_RUNTIME_PROVIDER = "openai-codex";
const OPENAI_OAUTH_DEFAULT_MODEL_REF = `${OPENAI_OAUTH_RUNTIME_PROVIDER}/gpt-5.3-codex`;
function normalizeProviderBaseUrl(config, baseUrl) {
  if (!baseUrl) {
    return void 0;
  }
  if (config.type === "minimax-portal" || config.type === "minimax-portal-cn") {
    return baseUrl.replace(/\/v1$/, "").replace(/\/anthropic$/, "").replace(/\/$/, "") + "/anthropic";
  }
  return baseUrl;
}
function shouldUseExplicitDefaultOverride(config, runtimeProviderKey) {
  return Boolean(config.baseUrl || config.apiProtocol || runtimeProviderKey !== config.type);
}
function getOpenClawProviderKey(type, providerId) {
  if (type === "custom" || type === "ollama") {
    const suffix = providerId.replace(/-/g, "").slice(0, 8);
    return `${type}-${suffix}`;
  }
  if (type === "minimax-portal-cn") {
    return "minimax-portal";
  }
  return type;
}
async function resolveRuntimeProviderKey(config) {
  const account = await getProviderAccount(config.id);
  if (account?.authMode === "oauth_browser") {
    if (config.type === "google") {
      return GOOGLE_OAUTH_RUNTIME_PROVIDER;
    }
    if (config.type === "openai") {
      return OPENAI_OAUTH_RUNTIME_PROVIDER;
    }
  }
  return getOpenClawProviderKey(config.type, config.id);
}
async function getBrowserOAuthRuntimeProvider(config) {
  const account = await getProviderAccount(config.id);
  if (account?.authMode !== "oauth_browser") {
    return null;
  }
  const secret = await getProviderSecret(config.id);
  if (secret?.type !== "oauth") {
    return null;
  }
  if (config.type === "google") {
    return GOOGLE_OAUTH_RUNTIME_PROVIDER;
  }
  if (config.type === "openai") {
    return OPENAI_OAUTH_RUNTIME_PROVIDER;
  }
  return null;
}
function getProviderModelRef(config) {
  const providerKey = getOpenClawProviderKey(config.type, config.id);
  if (config.model) {
    return config.model.startsWith(`${providerKey}/`) ? config.model : `${providerKey}/${config.model}`;
  }
  const defaultModel = getProviderDefaultModel(config.type);
  if (!defaultModel) {
    return void 0;
  }
  return defaultModel.startsWith(`${providerKey}/`) ? defaultModel : `${providerKey}/${defaultModel}`;
}
async function getProviderFallbackModelRefs(config) {
  const allProviders = await getAllProviders();
  const providerMap = new Map(allProviders.map((provider) => [provider.id, provider]));
  const seen = /* @__PURE__ */ new Set();
  const results = [];
  const providerKey = getOpenClawProviderKey(config.type, config.id);
  for (const fallbackModel of config.fallbackModels ?? []) {
    const normalizedModel = fallbackModel.trim();
    if (!normalizedModel) continue;
    const modelRef = normalizedModel.startsWith(`${providerKey}/`) ? normalizedModel : `${providerKey}/${normalizedModel}`;
    if (seen.has(modelRef)) continue;
    seen.add(modelRef);
    results.push(modelRef);
  }
  for (const fallbackId of config.fallbackProviderIds ?? []) {
    if (!fallbackId || fallbackId === config.id) continue;
    const fallbackProvider = providerMap.get(fallbackId);
    if (!fallbackProvider) continue;
    const modelRef = getProviderModelRef(fallbackProvider);
    if (!modelRef || seen.has(modelRef)) continue;
    seen.add(modelRef);
    results.push(modelRef);
  }
  return results;
}
function scheduleGatewayRestart(gatewayManager2, message, options) {
  if (!gatewayManager2) {
    return;
  }
  if (options?.onlyIfRunning && gatewayManager2.getStatus().state === "stopped") {
    return;
  }
  logger.info(message);
  gatewayManager2.debouncedRestart(options?.delayMs);
}
async function syncProviderApiKeyToRuntime(providerType, providerId, apiKey) {
  const ock = getOpenClawProviderKey(providerType, providerId);
  await saveProviderKeyToOpenClaw(ock, apiKey);
}
async function syncAllProviderAuthToRuntime() {
  const accounts = await listProviderAccounts();
  for (const account of accounts) {
    const runtimeProviderKey = await resolveRuntimeProviderKey({
      id: account.id,
      name: account.label,
      type: account.vendorId,
      baseUrl: account.baseUrl,
      model: account.model,
      fallbackModels: account.fallbackModels,
      fallbackProviderIds: account.fallbackAccountIds,
      enabled: account.enabled,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    });
    const secret = await getProviderSecret(account.id);
    if (!secret) {
      continue;
    }
    if (secret.type === "api_key") {
      await saveProviderKeyToOpenClaw(runtimeProviderKey, secret.apiKey);
      continue;
    }
    if (secret.type === "local" && secret.apiKey) {
      await saveProviderKeyToOpenClaw(runtimeProviderKey, secret.apiKey);
      continue;
    }
    if (secret.type === "oauth") {
      await saveOAuthTokenToOpenClaw(runtimeProviderKey, {
        access: secret.accessToken,
        refresh: secret.refreshToken,
        expires: secret.expiresAt,
        email: secret.email,
        projectId: secret.subject
      });
    }
  }
}
async function syncProviderSecretToRuntime(config, runtimeProviderKey, apiKey) {
  const secret = await getProviderSecret(config.id);
  if (apiKey !== void 0) {
    const trimmedKey = apiKey.trim();
    if (trimmedKey) {
      await saveProviderKeyToOpenClaw(runtimeProviderKey, trimmedKey);
    }
    return;
  }
  if (secret?.type === "api_key") {
    await saveProviderKeyToOpenClaw(runtimeProviderKey, secret.apiKey);
    return;
  }
  if (secret?.type === "oauth") {
    await saveOAuthTokenToOpenClaw(runtimeProviderKey, {
      access: secret.accessToken,
      refresh: secret.refreshToken,
      expires: secret.expiresAt,
      email: secret.email,
      projectId: secret.subject
    });
    return;
  }
  if (secret?.type === "local" && secret.apiKey) {
    await saveProviderKeyToOpenClaw(runtimeProviderKey, secret.apiKey);
  }
}
async function resolveRuntimeSyncContext(config) {
  const runtimeProviderKey = await resolveRuntimeProviderKey(config);
  const meta = getProviderConfig(config.type);
  const api = config.apiProtocol || (config.type === "custom" ? "openai-completions" : meta?.api);
  if (!api) {
    return null;
  }
  return {
    runtimeProviderKey,
    meta,
    api
  };
}
async function syncRuntimeProviderConfig(config, context) {
  await syncProviderConfigToOpenClaw(context.runtimeProviderKey, config.model, {
    baseUrl: normalizeProviderBaseUrl(config, config.baseUrl || context.meta?.baseUrl),
    api: context.api,
    apiKeyEnv: context.meta?.apiKeyEnv,
    headers: context.meta?.headers
  });
}
async function syncCustomProviderAgentModel(config, runtimeProviderKey, apiKey) {
  if (config.type !== "custom") {
    return;
  }
  const resolvedKey = apiKey !== void 0 ? apiKey.trim() || null : await getApiKey(config.id);
  if (!resolvedKey || !config.baseUrl) {
    return;
  }
  const modelId = config.model;
  await updateAgentModelProvider(runtimeProviderKey, {
    baseUrl: config.baseUrl,
    api: config.apiProtocol || "openai-completions",
    models: modelId ? [{ id: modelId, name: modelId }] : [],
    apiKey: resolvedKey
  });
}
async function syncProviderToRuntime(config, apiKey) {
  const context = await resolveRuntimeSyncContext(config);
  if (!context) {
    return null;
  }
  await syncProviderSecretToRuntime(config, context.runtimeProviderKey, apiKey);
  await syncRuntimeProviderConfig(config, context);
  await syncCustomProviderAgentModel(config, context.runtimeProviderKey, apiKey);
  return context;
}
async function syncSavedProviderToRuntime(config, apiKey, gatewayManager2) {
  const context = await syncProviderToRuntime(config, apiKey);
  if (!context) {
    return;
  }
  scheduleGatewayRestart(
    gatewayManager2,
    `Scheduling Gateway restart after saving provider "${context.runtimeProviderKey}" config`
  );
}
async function syncUpdatedProviderToRuntime(config, apiKey, gatewayManager2) {
  const context = await syncProviderToRuntime(config, apiKey);
  if (!context) {
    return;
  }
  const ock = context.runtimeProviderKey;
  const fallbackModels = await getProviderFallbackModelRefs(config);
  const defaultProviderId = await getDefaultProvider();
  if (defaultProviderId === config.id) {
    const modelOverride = config.model ? `${ock}/${config.model}` : void 0;
    if (config.type !== "custom") {
      if (shouldUseExplicitDefaultOverride(config, ock)) {
        await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
          baseUrl: normalizeProviderBaseUrl(config, config.baseUrl || context.meta?.baseUrl),
          api: context.api,
          apiKeyEnv: context.meta?.apiKeyEnv,
          headers: context.meta?.headers
        }, fallbackModels);
      } else {
        await setOpenClawDefaultModel(ock, modelOverride, fallbackModels);
      }
    } else {
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: config.baseUrl,
        api: config.apiProtocol || "openai-completions"
      }, fallbackModels);
    }
  }
  scheduleGatewayRestart(
    gatewayManager2,
    `Scheduling Gateway restart after updating provider "${ock}" config`
  );
}
async function syncDeletedProviderToRuntime(provider, providerId, gatewayManager2, runtimeProviderKey) {
  if (!provider?.type) {
    return;
  }
  const ock = runtimeProviderKey ?? await resolveRuntimeProviderKey({ ...provider, id: providerId });
  await removeProviderFromOpenClaw(ock);
  scheduleGatewayRestart(
    gatewayManager2,
    `Scheduling Gateway restart after deleting provider "${ock}"`
  );
}
async function syncDeletedProviderApiKeyToRuntime(provider, providerId, runtimeProviderKey) {
  if (!provider?.type) {
    return;
  }
  const ock = runtimeProviderKey ?? await resolveRuntimeProviderKey({ ...provider, id: providerId });
  await removeProviderFromOpenClaw(ock);
}
async function syncDefaultProviderToRuntime(providerId, gatewayManager2) {
  const provider = await getProvider(providerId);
  if (!provider) {
    return;
  }
  const ock = await resolveRuntimeProviderKey(provider);
  const providerKey = await getApiKey(providerId);
  const fallbackModels = await getProviderFallbackModelRefs(provider);
  const oauthTypes = ["qwen-portal", "minimax-portal", "minimax-portal-cn"];
  const browserOAuthRuntimeProvider = await getBrowserOAuthRuntimeProvider(provider);
  const isOAuthProvider = oauthTypes.includes(provider.type) && !providerKey || Boolean(browserOAuthRuntimeProvider);
  if (!isOAuthProvider) {
    const modelOverride = provider.model ? provider.model.startsWith(`${ock}/`) ? provider.model : `${ock}/${provider.model}` : void 0;
    if (provider.type === "custom") {
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: provider.baseUrl,
        api: provider.apiProtocol || "openai-completions"
      }, fallbackModels);
    } else if (shouldUseExplicitDefaultOverride(provider, ock)) {
      await setOpenClawDefaultModelWithOverride(ock, modelOverride, {
        baseUrl: normalizeProviderBaseUrl(provider, provider.baseUrl || getProviderConfig(provider.type)?.baseUrl),
        api: provider.apiProtocol || getProviderConfig(provider.type)?.api,
        apiKeyEnv: getProviderConfig(provider.type)?.apiKeyEnv,
        headers: getProviderConfig(provider.type)?.headers
      }, fallbackModels);
    } else {
      await setOpenClawDefaultModel(ock, modelOverride, fallbackModels);
    }
    if (providerKey) {
      await saveProviderKeyToOpenClaw(ock, providerKey);
    }
  } else {
    if (browserOAuthRuntimeProvider) {
      const secret = await getProviderSecret(provider.id);
      if (secret?.type === "oauth") {
        await saveOAuthTokenToOpenClaw(browserOAuthRuntimeProvider, {
          access: secret.accessToken,
          refresh: secret.refreshToken,
          expires: secret.expiresAt,
          email: secret.email,
          projectId: secret.subject
        });
      }
      const defaultModelRef = browserOAuthRuntimeProvider === GOOGLE_OAUTH_RUNTIME_PROVIDER ? GOOGLE_OAUTH_DEFAULT_MODEL_REF : OPENAI_OAUTH_DEFAULT_MODEL_REF;
      const modelOverride = provider.model ? provider.model.startsWith(`${browserOAuthRuntimeProvider}/`) ? provider.model : `${browserOAuthRuntimeProvider}/${provider.model}` : defaultModelRef;
      await setOpenClawDefaultModel(browserOAuthRuntimeProvider, modelOverride, fallbackModels);
      logger.info(`Configured openclaw.json for browser OAuth provider "${provider.id}"`);
      scheduleGatewayRestart(
        gatewayManager2,
        `Scheduling Gateway restart after provider switch to "${browserOAuthRuntimeProvider}"`
      );
      return;
    }
    const defaultBaseUrl = provider.type === "minimax-portal" ? "https://api.minimax.io/anthropic" : provider.type === "minimax-portal-cn" ? "https://api.minimaxi.com/anthropic" : "https://portal.qwen.ai/v1";
    const api = provider.type === "minimax-portal" || provider.type === "minimax-portal-cn" ? "anthropic-messages" : "openai-completions";
    let baseUrl = provider.baseUrl || defaultBaseUrl;
    if ((provider.type === "minimax-portal" || provider.type === "minimax-portal-cn") && baseUrl) {
      baseUrl = baseUrl.replace(/\/v1$/, "").replace(/\/anthropic$/, "").replace(/\/$/, "") + "/anthropic";
    }
    const targetProviderKey = provider.type === "minimax-portal" || provider.type === "minimax-portal-cn" ? "minimax-portal" : provider.type;
    await setOpenClawDefaultModelWithOverride(targetProviderKey, getProviderModelRef(provider), {
      baseUrl,
      api,
      authHeader: targetProviderKey === "minimax-portal" ? true : void 0,
      apiKeyEnv: targetProviderKey === "minimax-portal" ? "minimax-oauth" : "qwen-oauth"
    }, fallbackModels);
    logger.info(`Configured openclaw.json for OAuth provider "${provider.type}"`);
    try {
      const defaultModelId = provider.model?.split("/").pop();
      await updateAgentModelProvider(targetProviderKey, {
        baseUrl,
        api,
        authHeader: targetProviderKey === "minimax-portal" ? true : void 0,
        apiKey: targetProviderKey === "minimax-portal" ? "minimax-oauth" : "qwen-oauth",
        models: defaultModelId ? [{ id: defaultModelId, name: defaultModelId }] : []
      });
    } catch (err) {
      logger.warn(`Failed to update models.json for OAuth provider "${targetProviderKey}":`, err);
    }
  }
  if (provider.type === "custom" && providerKey && provider.baseUrl) {
    const modelId = provider.model;
    await updateAgentModelProvider(ock, {
      baseUrl: provider.baseUrl,
      api: provider.apiProtocol || "openai-completions",
      models: modelId ? [{ id: modelId, name: modelId }] : [],
      apiKey: providerKey
    });
  }
  scheduleGatewayRestart(
    gatewayManager2,
    `Scheduling Gateway restart after provider switch to "${ock}"`,
    { onlyIfRunning: true }
  );
}
function logValidationStatus(provider, status) {
  console.log(`[clawx-validate] ${provider} HTTP ${status}`);
}
function maskSecret(secret) {
  if (!secret) return "";
  if (secret.length <= 8) return `${secret.slice(0, 2)}***`;
  return `${secret.slice(0, 4)}***${secret.slice(-4)}`;
}
function sanitizeValidationUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const key = url.searchParams.get("key");
    if (key) url.searchParams.set("key", maskSecret(key));
    return url.toString();
  } catch {
    return rawUrl;
  }
}
function sanitizeHeaders(headers) {
  const next = { ...headers };
  if (next.Authorization?.startsWith("Bearer ")) {
    const token = next.Authorization.slice("Bearer ".length);
    next.Authorization = `Bearer ${maskSecret(token)}`;
  }
  if (next["x-api-key"]) {
    next["x-api-key"] = maskSecret(next["x-api-key"]);
  }
  return next;
}
function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, "");
}
function buildOpenAiModelsUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/models?limit=1`;
}
function logValidationRequest(provider, method, url, headers) {
  console.log(
    `[clawx-validate] ${provider} request ${method} ${sanitizeValidationUrl(url)} headers=${JSON.stringify(sanitizeHeaders(headers))}`
  );
}
function getValidationProfile(providerType, options) {
  const providerApi = options?.apiProtocol || getProviderConfig(providerType)?.api;
  if (providerApi === "anthropic-messages") {
    return "anthropic-header";
  }
  if (providerApi === "openai-completions" || providerApi === "openai-responses") {
    return "openai-compatible";
  }
  switch (providerType) {
    case "anthropic":
      return "anthropic-header";
    case "google":
      return "google-query-key";
    case "openrouter":
      return "openrouter";
    case "ollama":
      return "none";
    default:
      return "openai-compatible";
  }
}
async function performProviderValidationRequest(providerLabel, url, headers) {
  try {
    logValidationRequest(providerLabel, "GET", url, headers);
    const response = await proxyAwareFetch(url, { headers });
    logValidationStatus(providerLabel, response.status);
    const data = await response.json().catch(() => ({}));
    return classifyAuthResponse(response.status, data);
  } catch (error2) {
    return {
      valid: false,
      error: `Connection error: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
function classifyAuthResponse(status, data) {
  if (status >= 200 && status < 300) return { valid: true };
  if (status === 429) return { valid: true };
  if (status === 401 || status === 403) return { valid: false, error: "Invalid API key" };
  const obj = data;
  const msg = obj?.error?.message || obj?.message || `API error: ${status}`;
  return { valid: false, error: msg };
}
async function validateOpenAiCompatibleKey(providerType, apiKey, baseUrl) {
  const trimmedBaseUrl = baseUrl?.trim();
  if (!trimmedBaseUrl) {
    return { valid: false, error: `Base URL is required for provider "${providerType}" validation` };
  }
  const headers = { Authorization: `Bearer ${apiKey}` };
  const modelsUrl = buildOpenAiModelsUrl(trimmedBaseUrl);
  const modelsResult = await performProviderValidationRequest(providerType, modelsUrl, headers);
  if (modelsResult.error?.includes("API error: 404")) {
    console.log(
      `[clawx-validate] ${providerType} /models returned 404, falling back to /chat/completions probe`
    );
    const base = normalizeBaseUrl(trimmedBaseUrl);
    const chatUrl = `${base}/chat/completions`;
    return await performChatCompletionsProbe(providerType, chatUrl, headers);
  }
  return modelsResult;
}
async function performChatCompletionsProbe(providerLabel, url, headers) {
  try {
    logValidationRequest(providerLabel, "POST", url, headers);
    const response = await proxyAwareFetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "validation-probe",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
    });
    logValidationStatus(providerLabel, response.status);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: "Invalid API key" };
    }
    if (response.status >= 200 && response.status < 300 || response.status === 400 || response.status === 429) {
      return { valid: true };
    }
    return classifyAuthResponse(response.status, data);
  } catch (error2) {
    return {
      valid: false,
      error: `Connection error: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
async function performAnthropicMessagesProbe(providerLabel, url, headers) {
  try {
    logValidationRequest(providerLabel, "POST", url, headers);
    const response = await proxyAwareFetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "validation-probe",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
    });
    logValidationStatus(providerLabel, response.status);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: "Invalid API key" };
    }
    if (response.status >= 200 && response.status < 300 || response.status === 400 || response.status === 429) {
      return { valid: true };
    }
    return classifyAuthResponse(response.status, data);
  } catch (error2) {
    return {
      valid: false,
      error: `Connection error: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
async function validateGoogleQueryKey(providerType, apiKey, baseUrl) {
  const base = normalizeBaseUrl(baseUrl || "https://generativelanguage.googleapis.com/v1beta");
  const url = `${base}/models?pageSize=1&key=${encodeURIComponent(apiKey)}`;
  return await performProviderValidationRequest(providerType, url, {});
}
async function validateAnthropicHeaderKey(providerType, apiKey, baseUrl) {
  const rawBase = normalizeBaseUrl(baseUrl || "https://api.anthropic.com/v1");
  const base = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
  const url = `${base}/models?limit=1`;
  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  };
  const modelsResult = await performProviderValidationRequest(providerType, url, headers);
  if (modelsResult.error?.includes("API error: 404") || modelsResult.error?.includes("API error: 400")) {
    console.log(
      `[clawx-validate] ${providerType} /models returned error, falling back to /messages probe`
    );
    const messagesUrl = `${base}/messages`;
    return await performAnthropicMessagesProbe(providerType, messagesUrl, headers);
  }
  return modelsResult;
}
async function validateOpenRouterKey(providerType, apiKey) {
  const url = "https://openrouter.ai/api/v1/auth/key";
  const headers = { Authorization: `Bearer ${apiKey}` };
  return await performProviderValidationRequest(providerType, url, headers);
}
async function validateApiKeyWithProvider(providerType, apiKey, options) {
  const profile = getValidationProfile(providerType, options);
  const resolvedBaseUrl = options?.baseUrl || getProviderConfig(providerType)?.baseUrl;
  if (profile === "none") {
    return { valid: true };
  }
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { valid: false, error: "API key is required" };
  }
  try {
    switch (profile) {
      case "openai-compatible":
        return await validateOpenAiCompatibleKey(providerType, trimmedKey, resolvedBaseUrl);
      case "google-query-key":
        return await validateGoogleQueryKey(providerType, trimmedKey, resolvedBaseUrl);
      case "anthropic-header":
        return await validateAnthropicHeaderKey(providerType, trimmedKey, resolvedBaseUrl);
      case "openrouter":
        return await validateOpenRouterKey(providerType, trimmedKey);
      default:
        return { valid: false, error: `Unsupported validation profile for provider: ${providerType}` };
    }
  } catch (error2) {
    const errorMessage = error2 instanceof Error ? error2.message : String(error2);
    return { valid: false, error: errorMessage };
  }
}
let _isQuitting = false;
function isQuitting() {
  return _isQuitting;
}
function setQuitting(value = true) {
  _isQuitting = value;
}
const OSS_BASE_URL = "https://oss.intelli-spectrum.com";
function detectChannel(version2) {
  const match = version2.match(/-([a-zA-Z]+)/);
  return match ? match[1] : "latest";
}
class AppUpdater extends events.EventEmitter {
  mainWindow = null;
  status = { status: "idle" };
  autoInstallTimer = null;
  autoInstallCountdown = 0;
  /** Delay (in seconds) before auto-installing a downloaded update. */
  static AUTO_INSTALL_DELAY_SECONDS = 5;
  constructor() {
    super();
    electronUpdater.autoUpdater.autoDownload = false;
    electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
    electronUpdater.autoUpdater.logger = {
      info: (msg) => logger.info("[Updater]", msg),
      warn: (msg) => logger.warn("[Updater]", msg),
      error: (msg) => logger.error("[Updater]", msg),
      debug: (msg) => logger.debug("[Updater]", msg)
    };
    const version2 = electron.app.getVersion();
    const channel = detectChannel(version2);
    const feedUrl = `${OSS_BASE_URL}/${channel}`;
    logger.info(`[Updater] Version: ${version2}, channel: ${channel}, feedUrl: ${feedUrl}`);
    electronUpdater.autoUpdater.channel = channel;
    electronUpdater.autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl,
      useMultipleRangeRequest: false
    });
    this.setupListeners();
  }
  /**
   * Set the main window for sending update events
   */
  setMainWindow(window2) {
    this.mainWindow = window2;
  }
  /**
   * Get current update status
   */
  getStatus() {
    return this.status;
  }
  /**
   * Setup auto-updater event listeners
   */
  setupListeners() {
    electronUpdater.autoUpdater.on("checking-for-update", () => {
      this.updateStatus({ status: "checking" });
      this.emit("checking-for-update");
    });
    electronUpdater.autoUpdater.on("update-available", (info2) => {
      this.updateStatus({ status: "available", info: info2 });
      this.emit("update-available", info2);
    });
    electronUpdater.autoUpdater.on("update-not-available", (info2) => {
      this.updateStatus({ status: "not-available", info: info2 });
      this.emit("update-not-available", info2);
    });
    electronUpdater.autoUpdater.on("download-progress", (progress) => {
      this.updateStatus({ status: "downloading", progress });
      this.emit("download-progress", progress);
    });
    electronUpdater.autoUpdater.on("update-downloaded", (event) => {
      this.updateStatus({ status: "downloaded", info: event });
      this.emit("update-downloaded", event);
      if (electronUpdater.autoUpdater.autoDownload) {
        this.startAutoInstallCountdown();
      }
    });
    electronUpdater.autoUpdater.on("error", (error2) => {
      this.updateStatus({ status: "error", error: error2.message });
      this.emit("error", error2);
    });
  }
  /**
   * Update status and notify renderer
   */
  updateStatus(newStatus) {
    this.status = {
      status: newStatus.status ?? this.status.status,
      info: newStatus.info,
      progress: newStatus.progress,
      error: newStatus.error
    };
    this.sendToRenderer("update:status-changed", this.status);
  }
  /**
   * Send event to renderer process
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  /**
   * Check for updates.
   * electron-updater automatically tries providers defined in electron-builder.yml in order.
   *
   * In dev mode (not packed), autoUpdater.checkForUpdates() silently returns
   * null without emitting any events, so we must detect this and force a
   * final status so the UI never gets stuck in 'checking'.
   */
  async checkForUpdates() {
    try {
      const result = await electronUpdater.autoUpdater.checkForUpdates();
      if (result == null) {
        this.updateStatus({
          status: "error",
          error: "Update check skipped (dev mode – app is not packaged)"
        });
        return null;
      }
      if (this.status.status === "checking" || this.status.status === "idle") {
        this.updateStatus({ status: "not-available" });
      }
      return result.updateInfo || null;
    } catch (error2) {
      logger.error("[Updater] Check for updates failed:", error2);
      this.updateStatus({ status: "error", error: error2.message || String(error2) });
      throw error2;
    }
  }
  /**
   * Download available update
   */
  async downloadUpdate() {
    try {
      await electronUpdater.autoUpdater.downloadUpdate();
    } catch (error2) {
      logger.error("[Updater] Download update failed:", error2);
      throw error2;
    }
  }
  /**
   * Install update and restart.
   *
   * On macOS, electron-updater delegates to Squirrel.Mac (ShipIt). The
   * native quitAndInstall() spawns ShipIt then internally calls app.quit().
   * However, the tray close handler in index.ts intercepts window close
   * and hides to tray unless isQuitting is true. Squirrel's internal quit
   * sometimes fails to trigger before-quit in time, so we set isQuitting
   * BEFORE calling quitAndInstall(). This lets the native quit flow close
   * the window cleanly while ShipIt runs independently to replace the app.
   */
  quitAndInstall() {
    logger.info("[Updater] quitAndInstall called");
    setQuitting();
    electronUpdater.autoUpdater.quitAndInstall();
  }
  /**
   * Start a countdown that auto-installs the downloaded update.
   * Sends `update:auto-install-countdown` events to the renderer each second.
   */
  startAutoInstallCountdown() {
    this.clearAutoInstallTimer();
    this.autoInstallCountdown = AppUpdater.AUTO_INSTALL_DELAY_SECONDS;
    this.sendToRenderer("update:auto-install-countdown", { seconds: this.autoInstallCountdown });
    this.autoInstallTimer = setInterval(() => {
      this.autoInstallCountdown--;
      this.sendToRenderer("update:auto-install-countdown", { seconds: this.autoInstallCountdown });
      if (this.autoInstallCountdown <= 0) {
        this.clearAutoInstallTimer();
        this.quitAndInstall();
      }
    }, 1e3);
  }
  cancelAutoInstall() {
    this.clearAutoInstallTimer();
    this.sendToRenderer("update:auto-install-countdown", { seconds: -1, cancelled: true });
  }
  clearAutoInstallTimer() {
    if (this.autoInstallTimer) {
      clearInterval(this.autoInstallTimer);
      this.autoInstallTimer = null;
    }
  }
  /**
   * Set update channel (stable, beta, dev)
   */
  setChannel(channel) {
    electronUpdater.autoUpdater.channel = channel;
  }
  /**
   * Set auto-download preference
   */
  setAutoDownload(enable) {
    electronUpdater.autoUpdater.autoDownload = enable;
  }
  /**
   * Get current version
   */
  getCurrentVersion() {
    return electron.app.getVersion();
  }
}
function registerUpdateHandlers(updater, mainWindow) {
  updater.setMainWindow(mainWindow);
  electron.ipcMain.handle("update:status", () => {
    return updater.getStatus();
  });
  electron.ipcMain.handle("update:version", () => {
    return updater.getCurrentVersion();
  });
  electron.ipcMain.handle("update:check", async () => {
    try {
      await updater.checkForUpdates();
      return { success: true, status: updater.getStatus() };
    } catch (error2) {
      return { success: false, error: String(error2), status: updater.getStatus() };
    }
  });
  electron.ipcMain.handle("update:download", async () => {
    try {
      await updater.downloadUpdate();
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("update:install", () => {
    updater.quitAndInstall();
    return { success: true };
  });
  electron.ipcMain.handle("update:setChannel", (_, channel) => {
    updater.setChannel(channel);
    return { success: true };
  });
  electron.ipcMain.handle("update:setAutoDownload", (_, enable) => {
    updater.setAutoDownload(enable);
    return { success: true };
  });
  electron.ipcMain.handle("update:cancelAutoInstall", () => {
    updater.cancelAutoInstall();
    return { success: true };
  });
}
let _appUpdater = null;
function getAppUpdater() {
  if (!_appUpdater) {
    _appUpdater = new AppUpdater();
  }
  return _appUpdater;
}
const appUpdater = new Proxy({}, {
  get(_target, prop) {
    return getAppUpdater()[prop];
  },
  set(_target, prop, value) {
    getAppUpdater()[prop] = value;
    return true;
  }
});
function registerIpcHandlers(gatewayManager2, clawHubService2, mainWindow) {
  registerUnifiedRequestHandlers(gatewayManager2);
  registerHostApiProxyHandlers();
  registerGatewayHandlers(gatewayManager2, mainWindow);
  registerClawHubHandlers(clawHubService2);
  registerOpenClawHandlers(gatewayManager2);
  registerProviderHandlers(gatewayManager2);
  registerShellHandlers();
  registerDialogHandlers();
  registerSessionHandlers();
  registerAppHandlers();
  registerSettingsHandlers(gatewayManager2);
  registerUvHandlers();
  registerLogHandlers();
  registerUsageHandlers();
  registerSkillConfigHandlers();
  registerCronHandlers(gatewayManager2);
  registerWindowHandlers(mainWindow);
  registerWhatsAppHandlers(mainWindow);
  registerDeviceOAuthHandlers(mainWindow);
  registerFileHandlers();
}
function registerHostApiProxyHandlers() {
  electron.ipcMain.handle("hostapi:fetch", async (_, request) => {
    try {
      const path2 = typeof request?.path === "string" ? request.path : "";
      if (!path2 || !path2.startsWith("/")) {
        throw new Error(`Invalid host API path: ${String(request?.path)}`);
      }
      const method = (request.method || "GET").toUpperCase();
      const headers = { ...request.headers || {} };
      let body;
      if (request.body !== void 0 && request.body !== null) {
        if (typeof request.body === "string") {
          body = request.body;
        } else {
          body = JSON.stringify(request.body);
          if (!headers["Content-Type"] && !headers["content-type"]) {
            headers["Content-Type"] = "application/json";
          }
        }
      }
      const response = await proxyAwareFetch(`http://127.0.0.1:${PORTS.CLAWX_HOST_API}${path2}`, {
        method,
        headers,
        body
      });
      const data = {
        status: response.status,
        ok: response.ok
      };
      if (response.status !== 204) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data.json = await response.json().catch(() => void 0);
        } else {
          data.text = await response.text().catch(() => "");
        }
      }
      return { ok: true, data };
    } catch (error2) {
      return {
        ok: false,
        error: {
          message: error2 instanceof Error ? error2.message : String(error2)
        }
      };
    }
  });
}
function mapAppErrorCode(error2) {
  const msg = error2 instanceof Error ? error2.message.toLowerCase() : String(error2).toLowerCase();
  if (msg.includes("timeout")) return "TIMEOUT";
  if (msg.includes("permission") || msg.includes("denied") || msg.includes("forbidden")) return "PERMISSION";
  if (msg.includes("gateway")) return "GATEWAY";
  if (msg.includes("invalid") || msg.includes("required")) return "VALIDATION";
  return "INTERNAL";
}
function isProxyKey(key) {
  return key === "proxyEnabled" || key === "proxyServer" || key === "proxyHttpServer" || key === "proxyHttpsServer" || key === "proxyAllServer" || key === "proxyBypassRules";
}
function isLaunchAtStartupKey(key) {
  return key === "launchAtStartup";
}
function registerUnifiedRequestHandlers(gatewayManager2) {
  const providerService2 = getProviderService();
  const handleProxySettingsChange2 = async () => {
    const settings = await getAllSettings();
    await applyProxySettings(settings);
    if (gatewayManager2.getStatus().state === "running") {
      await gatewayManager2.restart();
    }
  };
  electron.ipcMain.handle("app:request", async (_, request) => {
    if (!request || typeof request.module !== "string" || typeof request.action !== "string") {
      return {
        id: request?.id,
        ok: false,
        error: { code: "VALIDATION", message: "Invalid app request format" }
      };
    }
    try {
      let data;
      switch (request.module) {
        case "app": {
          if (request.action === "version") data = electron.app.getVersion();
          else if (request.action === "name") data = electron.app.getName();
          else if (request.action === "platform") data = process.platform;
          else {
            return {
              id: request.id,
              ok: false,
              error: {
                code: "UNSUPPORTED",
                message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
              }
            };
          }
          break;
        }
        case "provider": {
          if (request.action === "list") {
            data = await providerService2.listLegacyProvidersWithKeyInfo();
            break;
          }
          if (request.action === "get") {
            const payload = request.payload;
            const providerId = typeof payload === "string" ? payload : payload?.providerId;
            if (!providerId) throw new Error("Invalid provider.get payload");
            data = await providerService2.getLegacyProvider(providerId);
            break;
          }
          if (request.action === "getDefault") {
            data = await providerService2.getDefaultLegacyProvider();
            break;
          }
          if (request.action === "hasApiKey") {
            const payload = request.payload;
            const providerId = typeof payload === "string" ? payload : payload?.providerId;
            if (!providerId) throw new Error("Invalid provider.hasApiKey payload");
            data = await providerService2.hasLegacyProviderApiKey(providerId);
            break;
          }
          if (request.action === "getApiKey") {
            const payload = request.payload;
            const providerId = typeof payload === "string" ? payload : payload?.providerId;
            if (!providerId) throw new Error("Invalid provider.getApiKey payload");
            data = await providerService2.getLegacyProviderApiKey(providerId);
            break;
          }
          if (request.action === "validateKey") {
            const payload = request.payload;
            const providerId = Array.isArray(payload) ? payload[0] : payload?.providerId;
            const apiKey = Array.isArray(payload) ? payload[1] : payload?.apiKey;
            const options = Array.isArray(payload) ? payload[2] : payload?.options;
            if (!providerId || typeof apiKey !== "string") {
              throw new Error("Invalid provider.validateKey payload");
            }
            const provider = await providerService2.getLegacyProvider(providerId);
            const providerType = provider?.type || providerId;
            const registryBaseUrl = getProviderConfig(providerType)?.baseUrl;
            const resolvedBaseUrl = options?.baseUrl || provider?.baseUrl || registryBaseUrl;
            data = await validateApiKeyWithProvider(providerType, apiKey, { baseUrl: resolvedBaseUrl });
            break;
          }
          if (request.action === "save") {
            const payload = request.payload;
            const config = Array.isArray(payload) ? payload[0] : payload?.config;
            const apiKey = Array.isArray(payload) ? payload[1] : payload?.apiKey;
            if (!config) throw new Error("Invalid provider.save payload");
            try {
              await providerService2.saveLegacyProvider(config);
              if (apiKey !== void 0) {
                const trimmedKey = apiKey.trim();
                if (trimmedKey) {
                  await providerService2.setLegacyProviderApiKey(config.id, trimmedKey);
                }
              }
              try {
                await syncSavedProviderToRuntime(config, apiKey, gatewayManager2);
              } catch (err) {
                console.warn("Failed to sync openclaw provider config:", err);
              }
              data = { success: true };
            } catch (error2) {
              data = { success: false, error: String(error2) };
            }
            break;
          }
          if (request.action === "delete") {
            const payload = request.payload;
            const providerId = typeof payload === "string" ? payload : payload?.providerId;
            if (!providerId) throw new Error("Invalid provider.delete payload");
            try {
              const existing = await providerService2.getLegacyProvider(providerId);
              await providerService2.deleteLegacyProvider(providerId);
              if (existing?.type) {
                try {
                  await syncDeletedProviderToRuntime(existing, providerId, gatewayManager2);
                } catch (err) {
                  console.warn("Failed to completely remove provider from OpenClaw:", err);
                }
              }
              data = { success: true };
            } catch (error2) {
              data = { success: false, error: String(error2) };
            }
            break;
          }
          if (request.action === "setApiKey") {
            const payload = request.payload;
            const providerId = Array.isArray(payload) ? payload[0] : payload?.providerId;
            const apiKey = Array.isArray(payload) ? payload[1] : payload?.apiKey;
            if (!providerId || typeof apiKey !== "string") throw new Error("Invalid provider.setApiKey payload");
            try {
              await providerService2.setLegacyProviderApiKey(providerId, apiKey);
              const provider = await providerService2.getLegacyProvider(providerId);
              const providerType = provider?.type || providerId;
              const ock = getOpenClawProviderKey(providerType, providerId);
              try {
                await saveProviderKeyToOpenClaw(ock, apiKey);
              } catch (err) {
                console.warn("Failed to save key to OpenClaw auth-profiles:", err);
              }
              data = { success: true };
            } catch (error2) {
              data = { success: false, error: String(error2) };
            }
            break;
          }
          if (request.action === "updateWithKey") {
            const payload = request.payload;
            const providerId = Array.isArray(payload) ? payload[0] : payload?.providerId;
            const updates = Array.isArray(payload) ? payload[1] : payload?.updates;
            const apiKey = Array.isArray(payload) ? payload[2] : payload?.apiKey;
            if (!providerId || !updates) throw new Error("Invalid provider.updateWithKey payload");
            const existing = await providerService2.getLegacyProvider(providerId);
            if (!existing) {
              data = { success: false, error: "Provider not found" };
              break;
            }
            const previousKey = await providerService2.getLegacyProviderApiKey(providerId);
            const previousOck = getOpenClawProviderKey(existing.type, providerId);
            try {
              const nextConfig = {
                ...existing,
                ...updates,
                updatedAt: (/* @__PURE__ */ new Date()).toISOString()
              };
              const ock = getOpenClawProviderKey(nextConfig.type, providerId);
              await providerService2.saveLegacyProvider(nextConfig);
              if (apiKey !== void 0) {
                const trimmedKey = apiKey.trim();
                if (trimmedKey) {
                  await providerService2.setLegacyProviderApiKey(providerId, trimmedKey);
                  await saveProviderKeyToOpenClaw(ock, trimmedKey);
                } else {
                  await providerService2.deleteLegacyProviderApiKey(providerId);
                  await removeProviderFromOpenClaw(ock);
                }
              }
              try {
                await syncUpdatedProviderToRuntime(nextConfig, apiKey, gatewayManager2);
              } catch (err) {
                console.warn("Failed to sync openclaw config after provider update:", err);
              }
              data = { success: true };
            } catch (error2) {
              try {
                await providerService2.saveLegacyProvider(existing);
                if (previousKey) {
                  await providerService2.setLegacyProviderApiKey(providerId, previousKey);
                  await saveProviderKeyToOpenClaw(previousOck, previousKey);
                } else {
                  await providerService2.deleteLegacyProviderApiKey(providerId);
                  await removeProviderFromOpenClaw(previousOck);
                }
              } catch (rollbackError) {
                console.warn("Failed to rollback provider updateWithKey:", rollbackError);
              }
              data = { success: false, error: String(error2) };
            }
            break;
          }
          if (request.action === "deleteApiKey") {
            const payload = request.payload;
            const providerId = typeof payload === "string" ? payload : payload?.providerId;
            if (!providerId) throw new Error("Invalid provider.deleteApiKey payload");
            try {
              await providerService2.deleteLegacyProviderApiKey(providerId);
              const provider = await providerService2.getLegacyProvider(providerId);
              const providerType = provider?.type || providerId;
              const ock = getOpenClawProviderKey(providerType, providerId);
              try {
                if (ock) {
                  await removeProviderFromOpenClaw(ock);
                }
              } catch (err) {
                console.warn("Failed to completely remove provider from OpenClaw:", err);
              }
              data = { success: true };
            } catch (error2) {
              data = { success: false, error: String(error2) };
            }
            break;
          }
          if (request.action === "setDefault") {
            const payload = request.payload;
            const providerId = typeof payload === "string" ? payload : payload?.providerId;
            if (!providerId) throw new Error("Invalid provider.setDefault payload");
            try {
              await providerService2.setDefaultLegacyProvider(providerId);
              const provider = await providerService2.getLegacyProvider(providerId);
              if (provider) {
                try {
                  await syncDefaultProviderToRuntime(providerId, gatewayManager2);
                } catch (err) {
                  console.warn("Failed to set OpenClaw default model:", err);
                }
              }
              data = { success: true };
            } catch (error2) {
              data = { success: false, error: String(error2) };
            }
            break;
          }
          return {
            id: request.id,
            ok: false,
            error: {
              code: "UNSUPPORTED",
              message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
            }
          };
        }
        case "update": {
          if (request.action === "status") {
            data = appUpdater.getStatus();
            break;
          }
          if (request.action === "version") {
            data = appUpdater.getCurrentVersion();
            break;
          }
          if (request.action === "check") {
            try {
              await appUpdater.checkForUpdates();
              data = { success: true, status: appUpdater.getStatus() };
            } catch (error2) {
              data = { success: false, error: String(error2), status: appUpdater.getStatus() };
            }
            break;
          }
          if (request.action === "download") {
            try {
              await appUpdater.downloadUpdate();
              data = { success: true };
            } catch (error2) {
              data = { success: false, error: String(error2) };
            }
            break;
          }
          if (request.action === "install") {
            appUpdater.quitAndInstall();
            data = { success: true };
            break;
          }
          if (request.action === "setChannel") {
            const payload = request.payload;
            const channel = typeof payload === "string" ? payload : payload?.channel;
            if (!channel) throw new Error("Invalid update.setChannel payload");
            appUpdater.setChannel(channel);
            data = { success: true };
            break;
          }
          if (request.action === "setAutoDownload") {
            const payload = request.payload;
            const enable = typeof payload === "boolean" ? payload : payload?.enable;
            if (typeof enable !== "boolean") throw new Error("Invalid update.setAutoDownload payload");
            appUpdater.setAutoDownload(enable);
            data = { success: true };
            break;
          }
          if (request.action === "cancelAutoInstall") {
            appUpdater.cancelAutoInstall();
            data = { success: true };
            break;
          }
          return {
            id: request.id,
            ok: false,
            error: {
              code: "UNSUPPORTED",
              message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
            }
          };
        }
        case "cron": {
          if (request.action === "list") {
            const result = await gatewayManager2.rpc("cron.list", { includeDisabled: true });
            const jobs = result?.jobs ?? [];
            data = jobs.map(transformCronJob$1);
            break;
          }
          if (request.action === "create") {
            const payload = request.payload;
            let input;
            if (Array.isArray(payload)) {
              input = payload[0];
            } else if (payload && typeof payload === "object" && "input" in payload) {
              input = payload.input;
            } else {
              input = payload;
            }
            if (!input) throw new Error("Invalid cron.create payload");
            const gatewayInput = {
              name: input.name,
              schedule: { kind: "cron", expr: input.schedule },
              payload: { kind: "agentTurn", message: input.message },
              enabled: input.enabled ?? true,
              wakeMode: "next-heartbeat",
              sessionTarget: "isolated",
              delivery: { mode: "none" }
            };
            const created = await gatewayManager2.rpc("cron.add", gatewayInput);
            data = created && typeof created === "object" ? transformCronJob$1(created) : created;
            break;
          }
          if (request.action === "update") {
            const payload = request.payload;
            const id = Array.isArray(payload) ? payload[0] : payload?.id;
            const input = Array.isArray(payload) ? payload[1] : payload?.input;
            if (!id || !input) throw new Error("Invalid cron.update payload");
            const patch = { ...input };
            if (typeof patch.schedule === "string") patch.schedule = { kind: "cron", expr: patch.schedule };
            if (typeof patch.message === "string") {
              patch.payload = { kind: "agentTurn", message: patch.message };
              delete patch.message;
            }
            data = await gatewayManager2.rpc("cron.update", { id, patch });
            break;
          }
          if (request.action === "delete") {
            const payload = request.payload;
            const id = typeof payload === "string" ? payload : payload?.id;
            if (!id) throw new Error("Invalid cron.delete payload");
            data = await gatewayManager2.rpc("cron.remove", { id });
            break;
          }
          if (request.action === "toggle") {
            const payload = request.payload;
            const id = Array.isArray(payload) ? payload[0] : payload?.id;
            const enabled = Array.isArray(payload) ? payload[1] : payload?.enabled;
            if (!id || typeof enabled !== "boolean") throw new Error("Invalid cron.toggle payload");
            data = await gatewayManager2.rpc("cron.update", { id, patch: { enabled } });
            break;
          }
          if (request.action === "trigger") {
            const payload = request.payload;
            const id = typeof payload === "string" ? payload : payload?.id;
            if (!id) throw new Error("Invalid cron.trigger payload");
            data = await gatewayManager2.rpc("cron.run", { id, mode: "force" });
            break;
          }
          return {
            id: request.id,
            ok: false,
            error: {
              code: "UNSUPPORTED",
              message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
            }
          };
        }
        case "usage": {
          if (request.action === "recentTokenHistory") {
            const payload = request.payload;
            const limit = typeof payload === "number" ? payload : payload?.limit;
            const safeLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.max(Math.floor(limit), 1) : void 0;
            data = await getRecentTokenUsageHistory(safeLimit);
            break;
          }
          return {
            id: request.id,
            ok: false,
            error: {
              code: "UNSUPPORTED",
              message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
            }
          };
        }
        case "settings": {
          if (request.action === "getAll") {
            data = await getAllSettings();
            break;
          }
          if (request.action === "get") {
            const payload = request.payload;
            const key = Array.isArray(payload) ? payload[0] : payload?.key;
            if (!key) throw new Error("Invalid settings.get payload");
            data = await getSetting(key);
            break;
          }
          if (request.action === "set") {
            const payload = request.payload;
            const key = Array.isArray(payload) ? payload[0] : payload?.key;
            const value = Array.isArray(payload) ? payload[1] : payload?.value;
            if (!key) throw new Error("Invalid settings.set payload");
            await setSetting(key, value);
            if (isProxyKey(key)) {
              await handleProxySettingsChange2();
            }
            if (isLaunchAtStartupKey(key)) {
              await syncLaunchAtStartupSettingFromStore();
            }
            data = { success: true };
            break;
          }
          if (request.action === "setMany") {
            const patch = request.payload ?? {};
            const entries = Object.entries(patch);
            for (const [key, value] of entries) {
              await setSetting(key, value);
            }
            if (entries.some(([key]) => isProxyKey(key))) {
              await handleProxySettingsChange2();
            }
            if (entries.some(([key]) => isLaunchAtStartupKey(key))) {
              await syncLaunchAtStartupSettingFromStore();
            }
            data = { success: true };
            break;
          }
          if (request.action === "reset") {
            await resetSettings();
            const settings = await getAllSettings();
            await handleProxySettingsChange2();
            await syncLaunchAtStartupSettingFromStore();
            data = { success: true, settings };
            break;
          }
          return {
            id: request.id,
            ok: false,
            error: {
              code: "UNSUPPORTED",
              message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
            }
          };
        }
        default:
          return {
            id: request.id,
            ok: false,
            error: {
              code: "UNSUPPORTED",
              message: `APP_REQUEST_UNSUPPORTED:${request.module}.${request.action}`
            }
          };
      }
      return { id: request.id, ok: true, data };
    } catch (error2) {
      return {
        id: request.id,
        ok: false,
        error: {
          code: mapAppErrorCode(error2),
          message: error2 instanceof Error ? error2.message : String(error2)
        }
      };
    }
  });
}
function registerSkillConfigHandlers() {
  electron.ipcMain.handle("skill:updateConfig", async (_, params) => {
    return await updateSkillConfig(params.skillKey, {
      apiKey: params.apiKey,
      env: params.env
    });
  });
  electron.ipcMain.handle("skill:getConfig", async (_, skillKey) => {
    return await getSkillConfig(skillKey);
  });
  electron.ipcMain.handle("skill:getAllConfigs", async () => {
    return await getAllSkillConfigs();
  });
}
function transformCronJob$1(job) {
  const message = job.payload?.message || job.payload?.text || "";
  const channelType = job.delivery?.channel;
  const target = channelType ? { channelType, channelId: channelType, channelName: channelType } : void 0;
  const lastRun = job.state?.lastRunAtMs ? {
    time: new Date(job.state.lastRunAtMs).toISOString(),
    success: job.state.lastStatus === "ok",
    error: job.state.lastError,
    duration: job.state.lastDurationMs
  } : void 0;
  const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : void 0;
  return {
    id: job.id,
    name: job.name,
    message,
    schedule: job.schedule,
    // Pass the object through; frontend parseCronSchedule handles it
    target,
    enabled: job.enabled,
    createdAt: new Date(job.createdAtMs).toISOString(),
    updatedAt: new Date(job.updatedAtMs).toISOString(),
    lastRun,
    nextRun
  };
}
function registerCronHandlers(gatewayManager2) {
  electron.ipcMain.handle("cron:list", async () => {
    try {
      const result = await gatewayManager2.rpc("cron.list", { includeDisabled: true });
      const data = result;
      const jobs = data?.jobs ?? [];
      for (const job of jobs) {
        const isIsolatedAgent = (job.sessionTarget === "isolated" || !job.sessionTarget) && job.payload?.kind === "agentTurn";
        const needsRepair = isIsolatedAgent && job.delivery?.mode === "announce" && !job.delivery?.channel;
        if (needsRepair) {
          try {
            await gatewayManager2.rpc("cron.update", {
              id: job.id,
              patch: { delivery: { mode: "none" } }
            });
            job.delivery = { mode: "none" };
            if (job.state?.lastError?.includes("Channel is required")) {
              job.state.lastError = void 0;
              job.state.lastStatus = "ok";
            }
          } catch (e) {
            console.warn(`Failed to auto-repair cron job ${job.id}:`, e);
          }
        }
      }
      return jobs.map(transformCronJob$1);
    } catch (error2) {
      console.error("Failed to list cron jobs:", error2);
      throw error2;
    }
  });
  electron.ipcMain.handle("cron:create", async (_, input) => {
    try {
      const gatewayInput = {
        name: input.name,
        schedule: { kind: "cron", expr: input.schedule },
        payload: { kind: "agentTurn", message: input.message },
        enabled: input.enabled ?? true,
        wakeMode: "next-heartbeat",
        sessionTarget: "isolated",
        // UI-created jobs deliver results via ClawX WebSocket chat events,
        // not external messaging channels.  Setting mode='none' prevents
        // the Gateway from attempting channel delivery (which would fail
        // with "Channel is required" when no channels are configured).
        delivery: { mode: "none" }
      };
      const result = await gatewayManager2.rpc("cron.add", gatewayInput);
      if (result && typeof result === "object") {
        return transformCronJob$1(result);
      }
      return result;
    } catch (error2) {
      console.error("Failed to create cron job:", error2);
      throw error2;
    }
  });
  electron.ipcMain.handle("cron:update", async (_, id, input) => {
    try {
      const patch = { ...input };
      if (typeof patch.schedule === "string") {
        patch.schedule = { kind: "cron", expr: patch.schedule };
      }
      if (typeof patch.message === "string") {
        patch.payload = { kind: "agentTurn", message: patch.message };
        delete patch.message;
      }
      const result = await gatewayManager2.rpc("cron.update", { id, patch });
      return result;
    } catch (error2) {
      console.error("Failed to update cron job:", error2);
      throw error2;
    }
  });
  electron.ipcMain.handle("cron:delete", async (_, id) => {
    try {
      const result = await gatewayManager2.rpc("cron.remove", { id });
      return result;
    } catch (error2) {
      console.error("Failed to delete cron job:", error2);
      throw error2;
    }
  });
  electron.ipcMain.handle("cron:toggle", async (_, id, enabled) => {
    try {
      const result = await gatewayManager2.rpc("cron.update", { id, patch: { enabled } });
      return result;
    } catch (error2) {
      console.error("Failed to toggle cron job:", error2);
      throw error2;
    }
  });
  electron.ipcMain.handle("cron:trigger", async (_, id) => {
    try {
      const result = await gatewayManager2.rpc("cron.run", { id, mode: "force" });
      return result;
    } catch (error2) {
      console.error("Failed to trigger cron job:", error2);
      throw error2;
    }
  });
}
function registerUvHandlers() {
  electron.ipcMain.handle("uv:check", async () => {
    return await checkUvInstalled();
  });
  electron.ipcMain.handle("uv:install-all", async () => {
    try {
      const isInstalled = await checkUvInstalled();
      if (!isInstalled) {
        await installUv();
      }
      await setupManagedPython();
      return { success: true };
    } catch (error2) {
      console.error("Failed to setup uv/python:", error2);
      return { success: false, error: String(error2) };
    }
  });
}
function registerLogHandlers() {
  electron.ipcMain.handle("log:getRecent", async (_, count) => {
    return logger.getRecentLogs(count);
  });
  electron.ipcMain.handle("log:readFile", async (_, tailLines) => {
    return await logger.readLogFile(tailLines);
  });
  electron.ipcMain.handle("log:getFilePath", async () => {
    return logger.getLogFilePath();
  });
  electron.ipcMain.handle("log:getDir", async () => {
    return logger.getLogDir();
  });
  electron.ipcMain.handle("log:listFiles", async () => {
    return await logger.listLogFiles();
  });
}
function registerGatewayHandlers(gatewayManager2, mainWindow) {
  electron.ipcMain.handle("gateway:status", () => {
    return gatewayManager2.getStatus();
  });
  electron.ipcMain.handle("gateway:isConnected", () => {
    return gatewayManager2.isConnected();
  });
  electron.ipcMain.handle("gateway:start", async () => {
    try {
      await gatewayManager2.start();
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("gateway:stop", async () => {
    try {
      await gatewayManager2.stop();
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("gateway:restart", async () => {
    try {
      await gatewayManager2.restart();
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("gateway:rpc", async (_, method, params, timeoutMs) => {
    try {
      if (method === "chat.send") {
        logger.info(`gateway:rpc chat.send intercepted (sessionKey=${params?.sessionKey || "unknown"})`);
        const enterpriseCfg = await ensureEnterpriseLoginInteractive();
        if (!enterpriseCfg?.token || !enterpriseCfg?.employee_id) {
          logger.info("gateway:rpc chat.send blocked: enterprise_login_required");
          return {
            success: false,
            error: "enterprise_login_required"
          };
        }
      }
      const result = await gatewayManager2.rpc(method, params, timeoutMs);
      return { success: true, result };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("gateway:httpProxy", async (_, request) => {
    try {
      const status = gatewayManager2.getStatus();
      const port = status.port || 18790;
      const path2 = request?.path && request.path.startsWith("/") ? request.path : "/";
      const method = (request?.method || "GET").toUpperCase();
      const timeoutMs = typeof request?.timeoutMs === "number" && request.timeoutMs > 0 ? request.timeoutMs : 15e3;
      const token = await getSetting("gatewayToken");
      const headers = {
        ...request?.headers ?? {}
      };
      if (!headers.Authorization && !headers.authorization && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      let body;
      if (request?.body !== void 0 && request?.body !== null) {
        body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
        if (!headers["Content-Type"] && !headers["content-type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await proxyAwareFetch(`http://127.0.0.1:${port}${path2}`, {
        method,
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const json = await response.json();
        return {
          success: true,
          status: response.status,
          ok: response.ok,
          json
        };
      }
      const text = await response.text();
      return {
        success: true,
        status: response.status,
        ok: response.ok,
        text
      };
    } catch (error2) {
      return {
        success: false,
        error: String(error2)
      };
    }
  });
  const VISION_MIME_TYPES = /* @__PURE__ */ new Set([
    "image/png",
    "image/jpeg",
    "image/bmp",
    "image/webp"
  ]);
  electron.ipcMain.handle("chat:sendWithMedia", async (_, params) => {
    try {
      logger.info(`chat:sendWithMedia intercepted (sessionKey=${params?.sessionKey || "unknown"})`);
      const enterpriseCfg = await ensureEnterpriseLoginInteractive();
      if (!enterpriseCfg?.token || !enterpriseCfg?.employee_id) {
        logger.info("chat:sendWithMedia blocked: enterprise_login_required");
        return { success: false, error: "enterprise_login_required" };
      }
      let message = params.message;
      const imageAttachments = [];
      const fileReferences = [];
      if (params.media && params.media.length > 0) {
        const fsP = await import("fs/promises");
        for (const m of params.media) {
          const exists = await fsP.access(m.filePath).then(() => true, () => false);
          logger.info(`[chat:sendWithMedia] Processing file: ${m.fileName} (${m.mimeType}), path: ${m.filePath}, exists: ${exists}, isVision: ${VISION_MIME_TYPES.has(m.mimeType)}`);
          fileReferences.push(
            `[media attached: ${m.filePath} (${m.mimeType}) | ${m.filePath}]`
          );
          if (VISION_MIME_TYPES.has(m.mimeType)) {
            const fileBuffer = await fsP.readFile(m.filePath);
            const base64Data = fileBuffer.toString("base64");
            logger.info(`[chat:sendWithMedia] Read ${fileBuffer.length} bytes, base64 length: ${base64Data.length}`);
            imageAttachments.push({
              content: base64Data,
              mimeType: m.mimeType,
              fileName: m.fileName
            });
          }
        }
      }
      if (fileReferences.length > 0) {
        const refs = fileReferences.join("\n");
        message = message ? `${message}

${refs}` : refs;
      }
      const rpcParams = {
        sessionKey: params.sessionKey,
        message,
        deliver: params.deliver ?? false,
        idempotencyKey: params.idempotencyKey
      };
      if (imageAttachments.length > 0) {
        rpcParams.attachments = imageAttachments;
      }
      logger.info(`[chat:sendWithMedia] Sending: message="${message.substring(0, 100)}", attachments=${imageAttachments.length}, fileRefs=${fileReferences.length}`);
      const timeoutMs = 12e4;
      const result = await gatewayManager2.rpc("chat.send", rpcParams, timeoutMs);
      logger.info(`[chat:sendWithMedia] RPC result: ${JSON.stringify(result)}`);
      return { success: true, result };
    } catch (error2) {
      logger.error(`[chat:sendWithMedia] Error: ${String(error2)}`);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("gateway:getControlUiUrl", async () => {
    try {
      const status = gatewayManager2.getStatus();
      const token = await getSetting("gatewayToken");
      const port = status.port || 18790;
      const url = `http://120.24.116.82:${port}/?token=${encodeURIComponent(token)}`;
      return { success: true, url, port, token };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("gateway:health", async () => {
    try {
      const health = await gatewayManager2.checkHealth();
      return { success: true, ...health };
    } catch (error2) {
      return { success: false, ok: false, error: String(error2) };
    }
  });
  gatewayManager2.on("status", (status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:status-changed", status);
    }
  });
  gatewayManager2.on("message", (message) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:message", message);
    }
  });
  gatewayManager2.on("notification", (notification) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:notification", notification);
    }
  });
  gatewayManager2.on("channel:status", (data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:channel-status", data);
    }
  });
  gatewayManager2.on("chat:message", (data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:chat-message", data);
    }
  });
  gatewayManager2.on("exit", (code) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:exit", code);
    }
  });
  gatewayManager2.on("error", (error2) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("gateway:error", error2.message);
    }
  });
}
function registerOpenClawHandlers(gatewayManager2) {
  const scheduleGatewayChannelRestart2 = (reason) => {
    if (gatewayManager2.getStatus().state !== "stopped") {
      logger.info(`Scheduling Gateway restart after ${reason}`);
      gatewayManager2.debouncedRestart();
    } else {
      logger.info(`Gateway is stopped; skip immediate restart after ${reason}`);
    }
  };
  async function ensureDingTalkPluginInstalled2() {
    const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "dingtalk");
    const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
    if (node_fs.existsSync(targetManifest)) {
      logger.info("DingTalk plugin already installed from local mirror");
      return { installed: true };
    }
    const candidateSources = electron.app.isPackaged ? [
      node_path.join(process.resourcesPath, "openclaw-plugins", "dingtalk"),
      node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "dingtalk"),
      node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "dingtalk")
    ] : [
      node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "dingtalk"),
      node_path.join(process.cwd(), "build", "openclaw-plugins", "dingtalk"),
      node_path.join(__dirname, "../../build/openclaw-plugins/dingtalk")
    ];
    const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
    if (!sourceDir) {
      logger.warn("Bundled DingTalk plugin mirror not found in candidate paths", { candidateSources });
      return {
        installed: false,
        warning: `Bundled DingTalk plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
      };
    }
    try {
      node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
      node_fs.rmSync(targetDir, { recursive: true, force: true });
      node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
      if (!node_fs.existsSync(targetManifest)) {
        return { installed: false, warning: "Failed to install DingTalk plugin mirror (manifest missing)." };
      }
      logger.info(`Installed DingTalk plugin from bundled mirror: ${sourceDir}`);
      return { installed: true };
    } catch (error2) {
      logger.warn("Failed to install DingTalk plugin from bundled mirror:", error2);
      return {
        installed: false,
        warning: "Failed to install bundled DingTalk plugin mirror"
      };
    }
  }
  async function ensureWeComPluginInstalled2() {
    const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "wecom");
    const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
    if (node_fs.existsSync(targetManifest)) {
      logger.info("WeCom plugin already installed from local mirror");
      return { installed: true };
    }
    const candidateSources = electron.app.isPackaged ? [
      node_path.join(process.resourcesPath, "openclaw-plugins", "wecom"),
      node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "wecom"),
      node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "wecom")
    ] : [
      node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "wecom"),
      node_path.join(process.cwd(), "build", "openclaw-plugins", "wecom"),
      node_path.join(__dirname, "../../build/openclaw-plugins/wecom")
    ];
    const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
    if (!sourceDir) {
      logger.warn("Bundled WeCom plugin mirror not found in candidate paths", { candidateSources });
      return {
        installed: false,
        warning: `Bundled WeCom plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
      };
    }
    try {
      node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
      node_fs.rmSync(targetDir, { recursive: true, force: true });
      node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
      if (!node_fs.existsSync(targetManifest)) {
        return { installed: false, warning: "Failed to install WeCom plugin mirror (manifest missing)." };
      }
      logger.info(`Installed WeCom plugin from bundled mirror: ${sourceDir}`);
      return { installed: true };
    } catch (error2) {
      logger.warn("Failed to install WeCom plugin from bundled mirror:", error2);
      return {
        installed: false,
        warning: "Failed to install bundled WeCom plugin mirror"
      };
    }
  }
  async function ensureQQBotPluginInstalled2() {
    const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "qqbot");
    const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
    if (node_fs.existsSync(targetManifest)) {
      logger.info("QQ Bot plugin already installed from local mirror");
      return { installed: true };
    }
    const candidateSources = electron.app.isPackaged ? [
      node_path.join(process.resourcesPath, "openclaw-plugins", "qqbot"),
      node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "qqbot"),
      node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "qqbot")
    ] : [
      node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "qqbot"),
      node_path.join(process.cwd(), "build", "openclaw-plugins", "qqbot"),
      node_path.join(__dirname, "../../build/openclaw-plugins/qqbot")
    ];
    const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
    if (!sourceDir) {
      logger.warn("Bundled QQ Bot plugin mirror not found in candidate paths", { candidateSources });
      return {
        installed: false,
        warning: `Bundled QQ Bot plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
      };
    }
    try {
      node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
      node_fs.rmSync(targetDir, { recursive: true, force: true });
      node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
      if (!node_fs.existsSync(targetManifest)) {
        return { installed: false, warning: "Failed to install QQ Bot plugin mirror (manifest missing)." };
      }
      logger.info(`Installed QQ Bot plugin from bundled mirror: ${sourceDir}`);
      return { installed: true };
    } catch (error2) {
      logger.warn("Failed to install QQ Bot plugin from bundled mirror:", error2);
      return {
        installed: false,
        warning: "Failed to install bundled QQ Bot plugin mirror"
      };
    }
  }
  electron.ipcMain.handle("openclaw:status", () => {
    const status = getOpenClawStatus();
    logger.info("openclaw:status IPC called", status);
    return status;
  });
  electron.ipcMain.handle("openclaw:isReady", () => {
    const status = getOpenClawStatus();
    return status.packageExists;
  });
  electron.ipcMain.handle("openclaw:getDir", () => {
    return getOpenClawDir();
  });
  electron.ipcMain.handle("openclaw:getConfigDir", () => {
    return getOpenClawConfigDir();
  });
  electron.ipcMain.handle("openclaw:getSkillsDir", () => {
    const dir = getOpenClawSkillsDir();
    ensureDir$3(dir);
    return dir;
  });
  electron.ipcMain.handle("openclaw:getCliCommand", () => {
    try {
      const status = getOpenClawStatus();
      if (!status.packageExists) {
        return { success: false, error: `OpenClaw package not found at: ${status.dir}` };
      }
      if (!node_fs.existsSync(status.entryPath)) {
        return { success: false, error: `OpenClaw entry script not found at: ${status.entryPath}` };
      }
      return { success: true, command: getOpenClawCliCommand() };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:saveConfig", async (_, channelType, config) => {
    try {
      logger.info("channel:saveConfig", { channelType, keys: Object.keys(config || {}) });
      if (channelType === "dingtalk") {
        const installResult = await ensureDingTalkPluginInstalled2();
        if (!installResult.installed) {
          return {
            success: false,
            error: installResult.warning || "DingTalk plugin install failed"
          };
        }
        await saveChannelConfig(channelType, config);
        scheduleGatewayChannelRestart2(`channel:saveConfig (${channelType})`);
        return {
          success: true,
          pluginInstalled: installResult.installed,
          warning: installResult.warning
        };
      }
      if (channelType === "wecom") {
        const installResult = await ensureWeComPluginInstalled2();
        if (!installResult.installed) {
          return {
            success: false,
            error: installResult.warning || "WeCom plugin install failed"
          };
        }
        await saveChannelConfig(channelType, config);
        scheduleGatewayChannelRestart2(`channel:saveConfig (${channelType})`);
        return {
          success: true,
          pluginInstalled: installResult.installed,
          warning: installResult.warning
        };
      }
      if (channelType === "qqbot") {
        const installResult = await ensureQQBotPluginInstalled2();
        if (!installResult.installed) {
          return {
            success: false,
            error: installResult.warning || "QQ Bot plugin install failed"
          };
        }
        await saveChannelConfig(channelType, config);
        if (gatewayManager2.getStatus().state !== "stopped") {
          logger.info(`Scheduling Gateway reload after channel:saveConfig (${channelType})`);
          gatewayManager2.debouncedReload();
        } else {
          logger.info(`Gateway is stopped; skip immediate reload after channel:saveConfig (${channelType})`);
        }
        return {
          success: true,
          pluginInstalled: installResult.installed,
          warning: installResult.warning
        };
      }
      await saveChannelConfig(channelType, config);
      scheduleGatewayChannelRestart2(`channel:saveConfig (${channelType})`);
      return { success: true };
    } catch (error2) {
      console.error("Failed to save channel config:", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:getConfig", async (_, channelType) => {
    try {
      const config = await getChannelConfig(channelType);
      return { success: true, config };
    } catch (error2) {
      console.error("Failed to get channel config:", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:getFormValues", async (_, channelType) => {
    try {
      const values = await getChannelFormValues(channelType);
      return { success: true, values };
    } catch (error2) {
      console.error("Failed to get channel form values:", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:deleteConfig", async (_, channelType) => {
    try {
      await deleteChannelConfig(channelType);
      scheduleGatewayChannelRestart2(`channel:deleteConfig (${channelType})`);
      return { success: true };
    } catch (error2) {
      console.error("Failed to delete channel config:", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:listConfigured", async () => {
    try {
      const channels = await listConfiguredChannels();
      return { success: true, channels };
    } catch (error2) {
      console.error("Failed to list channels:", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:setEnabled", async (_, channelType, enabled) => {
    try {
      await setChannelEnabled(channelType, enabled);
      scheduleGatewayChannelRestart2(`channel:setEnabled (${channelType}, enabled=${enabled})`);
      return { success: true };
    } catch (error2) {
      console.error("Failed to set channel enabled:", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:validate", async (_, channelType) => {
    try {
      const result = await validateChannelConfig(channelType);
      return { success: true, ...result };
    } catch (error2) {
      console.error("Failed to validate channel:", error2);
      return { success: false, valid: false, errors: [String(error2)], warnings: [] };
    }
  });
  electron.ipcMain.handle("channel:validateCredentials", async (_, channelType, config) => {
    try {
      const result = await validateChannelCredentials(channelType, config);
      return { success: true, ...result };
    } catch (error2) {
      console.error("Failed to validate channel credentials:", error2);
      return { success: false, valid: false, errors: [String(error2)], warnings: [] };
    }
  });
}
function registerWhatsAppHandlers(mainWindow) {
  electron.ipcMain.handle("channel:requestWhatsAppQr", async (_, accountId) => {
    try {
      logger.info("channel:requestWhatsAppQr", { accountId });
      await whatsAppLoginManager.start(accountId);
      return { success: true };
    } catch (error2) {
      logger.error("channel:requestWhatsAppQr failed", error2);
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("channel:cancelWhatsAppQr", async () => {
    try {
      await whatsAppLoginManager.stop();
      return { success: true };
    } catch (error2) {
      logger.error("channel:cancelWhatsAppQr failed", error2);
      return { success: false, error: String(error2) };
    }
  });
  whatsAppLoginManager.on("qr", (data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("channel:whatsapp-qr", data);
    }
  });
  whatsAppLoginManager.on("success", (data) => {
    if (!mainWindow.isDestroyed()) {
      logger.info("whatsapp:login-success", data);
      mainWindow.webContents.send("channel:whatsapp-success", data);
    }
  });
  whatsAppLoginManager.on("error", (error2) => {
    if (!mainWindow.isDestroyed()) {
      logger.error("whatsapp:login-error", error2);
      mainWindow.webContents.send("channel:whatsapp-error", error2);
    }
  });
}
function registerDeviceOAuthHandlers(mainWindow) {
  deviceOAuthManager.setWindow(mainWindow);
  browserOAuthManager.setWindow(mainWindow);
  electron.ipcMain.handle(
    "provider:requestOAuth",
    async (_, provider, region, options) => {
      try {
        logger.info(`provider:requestOAuth for ${provider}`);
        if (provider === "google" || provider === "openai") {
          await browserOAuthManager.startFlow(provider, options);
        } else {
          await deviceOAuthManager.startFlow(provider, region, options);
        }
        return { success: true };
      } catch (error2) {
        logger.error("provider:requestOAuth failed", error2);
        return { success: false, error: String(error2) };
      }
    }
  );
  electron.ipcMain.handle("provider:cancelOAuth", async () => {
    try {
      await deviceOAuthManager.stopFlow();
      await browserOAuthManager.stopFlow();
      return { success: true };
    } catch (error2) {
      logger.error("provider:cancelOAuth failed", error2);
      return { success: false, error: String(error2) };
    }
  });
}
function registerProviderHandlers(gatewayManager2) {
  const providerService2 = getProviderService();
  const legacyProviderChannelsWarned = /* @__PURE__ */ new Set();
  const logLegacyProviderChannel = (channel) => {
    if (legacyProviderChannelsWarned.has(channel)) return;
    legacyProviderChannelsWarned.add(channel);
    logger.warn(
      `[provider-migration] Legacy IPC channel "${channel}" is deprecated. Prefer app:request provider actions and account APIs.`
    );
  };
  deviceOAuthManager.on("oauth:success", ({ provider, accountId }) => {
    logger.info(`[IPC] Scheduling Gateway restart after ${provider} OAuth success for ${accountId}...`);
    gatewayManager2.debouncedRestart(8e3);
  });
  browserOAuthManager.on("oauth:success", ({ provider, accountId }) => {
    logger.info(`[IPC] Scheduling Gateway restart after ${provider} OAuth success for ${accountId}...`);
    gatewayManager2.debouncedRestart(8e3);
  });
  electron.ipcMain.handle("provider:list", async () => {
    logLegacyProviderChannel("provider:list");
    return await providerService2.listLegacyProvidersWithKeyInfo();
  });
  electron.ipcMain.handle("provider:listVendors", async () => {
    return await providerService2.listVendors();
  });
  electron.ipcMain.handle("provider:listAccounts", async () => {
    return await providerService2.listAccounts();
  });
  electron.ipcMain.handle("provider:getAccount", async (_, accountId) => {
    return await providerService2.getAccount(accountId);
  });
  electron.ipcMain.handle("provider:get", async (_, providerId) => {
    logLegacyProviderChannel("provider:get");
    return await providerService2.getLegacyProvider(providerId);
  });
  electron.ipcMain.handle("provider:save", async (_, config, apiKey) => {
    logLegacyProviderChannel("provider:save");
    try {
      await providerService2.saveLegacyProvider(config);
      if (apiKey !== void 0) {
        const trimmedKey = apiKey.trim();
        if (trimmedKey) {
          await providerService2.setLegacyProviderApiKey(config.id, trimmedKey);
          try {
            await syncProviderApiKeyToRuntime(config.type, config.id, trimmedKey);
          } catch (err) {
            console.warn("Failed to save key to OpenClaw auth-profiles:", err);
          }
        }
      }
      try {
        await syncSavedProviderToRuntime(config, apiKey, gatewayManager2);
      } catch (err) {
        console.warn("Failed to sync openclaw provider config:", err);
      }
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("provider:delete", async (_, providerId) => {
    logLegacyProviderChannel("provider:delete");
    try {
      const existing = await providerService2.getLegacyProvider(providerId);
      await providerService2.deleteLegacyProvider(providerId);
      if (existing?.type) {
        try {
          await syncDeletedProviderToRuntime(existing, providerId, gatewayManager2);
        } catch (err) {
          console.warn("Failed to completely remove provider from OpenClaw:", err);
        }
      }
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("provider:setApiKey", async (_, providerId, apiKey) => {
    logLegacyProviderChannel("provider:setApiKey");
    try {
      await providerService2.setLegacyProviderApiKey(providerId, apiKey);
      const provider = await providerService2.getLegacyProvider(providerId);
      const providerType = provider?.type || providerId;
      try {
        await syncProviderApiKeyToRuntime(providerType, providerId, apiKey);
      } catch (err) {
        console.warn("Failed to save key to OpenClaw auth-profiles:", err);
      }
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle(
    "provider:updateWithKey",
    async (_, providerId, updates, apiKey) => {
      logLegacyProviderChannel("provider:updateWithKey");
      const existing = await providerService2.getLegacyProvider(providerId);
      if (!existing) {
        return { success: false, error: "Provider not found" };
      }
      const previousKey = await providerService2.getLegacyProviderApiKey(providerId);
      const previousOck = getOpenClawProviderKey(existing.type, providerId);
      try {
        const nextConfig = {
          ...existing,
          ...updates,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const ock = getOpenClawProviderKey(nextConfig.type, providerId);
        await providerService2.saveLegacyProvider(nextConfig);
        if (apiKey !== void 0) {
          const trimmedKey = apiKey.trim();
          if (trimmedKey) {
            await providerService2.setLegacyProviderApiKey(providerId, trimmedKey);
            await syncProviderApiKeyToRuntime(nextConfig.type, providerId, trimmedKey);
          } else {
            await providerService2.deleteLegacyProviderApiKey(providerId);
            await removeProviderFromOpenClaw(ock);
          }
        }
        try {
          await syncUpdatedProviderToRuntime(nextConfig, apiKey, gatewayManager2);
        } catch (err) {
          console.warn("Failed to sync openclaw config after provider update:", err);
        }
        return { success: true };
      } catch (error2) {
        try {
          await providerService2.saveLegacyProvider(existing);
          if (previousKey) {
            await providerService2.setLegacyProviderApiKey(providerId, previousKey);
            await saveProviderKeyToOpenClaw(previousOck, previousKey);
          } else {
            await providerService2.deleteLegacyProviderApiKey(providerId);
            await removeProviderFromOpenClaw(previousOck);
          }
        } catch (rollbackError) {
          console.warn("Failed to rollback provider updateWithKey:", rollbackError);
        }
        return { success: false, error: String(error2) };
      }
    }
  );
  electron.ipcMain.handle("provider:deleteApiKey", async (_, providerId) => {
    logLegacyProviderChannel("provider:deleteApiKey");
    try {
      await providerService2.deleteLegacyProviderApiKey(providerId);
      const provider = await providerService2.getLegacyProvider(providerId);
      try {
        await syncDeletedProviderApiKeyToRuntime(provider, providerId);
      } catch (err) {
        console.warn("Failed to completely remove provider from OpenClaw:", err);
      }
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("provider:hasApiKey", async (_, providerId) => {
    logLegacyProviderChannel("provider:hasApiKey");
    return await providerService2.hasLegacyProviderApiKey(providerId);
  });
  electron.ipcMain.handle("provider:getApiKey", async (_, providerId) => {
    logLegacyProviderChannel("provider:getApiKey");
    return await providerService2.getLegacyProviderApiKey(providerId);
  });
  electron.ipcMain.handle("provider:setDefault", async (_, providerId) => {
    logLegacyProviderChannel("provider:setDefault");
    try {
      await providerService2.setDefaultLegacyProvider(providerId);
      try {
        await syncDefaultProviderToRuntime(providerId, gatewayManager2);
      } catch (err) {
        console.warn("Failed to set OpenClaw default model:", err);
      }
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("provider:getDefault", async () => {
    logLegacyProviderChannel("provider:getDefault");
    return await providerService2.getDefaultLegacyProvider();
  });
  electron.ipcMain.handle(
    "provider:validateKey",
    async (_, providerId, apiKey, options) => {
      logLegacyProviderChannel("provider:validateKey");
      try {
        const provider = await providerService2.getLegacyProvider(providerId);
        const providerType = provider?.type || providerId;
        const registryBaseUrl = getProviderConfig(providerType)?.baseUrl;
        const resolvedBaseUrl = options?.baseUrl || provider?.baseUrl || registryBaseUrl;
        console.log(`[clawx-validate] validating provider type: ${providerType}`);
        return await validateApiKeyWithProvider(providerType, apiKey, { baseUrl: resolvedBaseUrl });
      } catch (error2) {
        console.error("Validation error:", error2);
        return { valid: false, error: String(error2) };
      }
    }
  );
}
function registerShellHandlers() {
  electron.ipcMain.handle("shell:openExternal", async (_, url) => {
    await electron.shell.openExternal(url);
  });
  electron.ipcMain.handle("shell:showItemInFolder", async (_, path2) => {
    electron.shell.showItemInFolder(path2);
  });
  electron.ipcMain.handle("shell:openPath", async (_, path2) => {
    return await electron.shell.openPath(path2);
  });
}
function registerClawHubHandlers(clawHubService2) {
  electron.ipcMain.handle("clawhub:search", async (_, params) => {
    try {
      const results = await clawHubService2.search(params);
      return { success: true, results };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("clawhub:install", async (_, params) => {
    try {
      await clawHubService2.install(params);
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("clawhub:uninstall", async (_, params) => {
    try {
      await clawHubService2.uninstall(params);
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("clawhub:list", async () => {
    try {
      const results = await clawHubService2.listInstalled();
      return { success: true, results };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
  electron.ipcMain.handle("clawhub:openSkillReadme", async (_, slug) => {
    try {
      await clawHubService2.openSkillReadme(slug);
      return { success: true };
    } catch (error2) {
      return { success: false, error: String(error2) };
    }
  });
}
function registerDialogHandlers() {
  electron.ipcMain.handle("dialog:open", async (_, options) => {
    const result = await electron.dialog.showOpenDialog(options);
    return result;
  });
  electron.ipcMain.handle("dialog:save", async (_, options) => {
    const result = await electron.dialog.showSaveDialog(options);
    return result;
  });
  electron.ipcMain.handle("dialog:message", async (_, options) => {
    const result = await electron.dialog.showMessageBox(options);
    return result;
  });
}
function registerAppHandlers() {
  electron.ipcMain.handle("app:version", () => {
    return electron.app.getVersion();
  });
  electron.ipcMain.handle("app:name", () => {
    return electron.app.getName();
  });
  electron.ipcMain.handle("app:getPath", (_, name) => {
    return electron.app.getPath(name);
  });
  electron.ipcMain.handle("app:platform", () => {
    return process.platform;
  });
  electron.ipcMain.handle("app:quit", () => {
    electron.app.quit();
  });
  electron.ipcMain.handle("app:relaunch", () => {
    electron.app.relaunch();
    electron.app.quit();
  });
}
function registerSettingsHandlers(gatewayManager2) {
  const handleProxySettingsChange2 = async () => {
    const settings = await getAllSettings();
    await applyProxySettings(settings);
    if (gatewayManager2.getStatus().state === "running") {
      await gatewayManager2.restart();
    }
  };
  electron.ipcMain.handle("settings:get", async (_, key) => {
    return await getSetting(key);
  });
  electron.ipcMain.handle("settings:getAll", async () => {
    return await getAllSettings();
  });
  electron.ipcMain.handle("settings:set", async (_, key, value) => {
    await setSetting(key, value);
    if (key === "proxyEnabled" || key === "proxyServer" || key === "proxyHttpServer" || key === "proxyHttpsServer" || key === "proxyAllServer" || key === "proxyBypassRules") {
      await handleProxySettingsChange2();
    }
    if (key === "launchAtStartup") {
      await syncLaunchAtStartupSettingFromStore();
    }
    return { success: true };
  });
  electron.ipcMain.handle("settings:setMany", async (_, patch) => {
    const entries = Object.entries(patch);
    for (const [key, value] of entries) {
      await setSetting(key, value);
    }
    if (entries.some(
      ([key]) => key === "proxyEnabled" || key === "proxyServer" || key === "proxyHttpServer" || key === "proxyHttpsServer" || key === "proxyAllServer" || key === "proxyBypassRules"
    )) {
      await handleProxySettingsChange2();
    }
    if (entries.some(([key]) => key === "launchAtStartup")) {
      await syncLaunchAtStartupSettingFromStore();
    }
    return { success: true };
  });
  electron.ipcMain.handle("settings:reset", async () => {
    await resetSettings();
    const settings = await getAllSettings();
    await handleProxySettingsChange2();
    await syncLaunchAtStartupSettingFromStore();
    return { success: true, settings };
  });
}
function registerUsageHandlers() {
  electron.ipcMain.handle("usage:recentTokenHistory", async (_, limit) => {
    const safeLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.max(Math.floor(limit), 1) : void 0;
    return await getRecentTokenUsageHistory(safeLimit);
  });
}
function registerWindowHandlers(mainWindow) {
  electron.ipcMain.handle("window:minimize", () => {
    mainWindow.minimize();
  });
  electron.ipcMain.handle("window:maximize", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  electron.ipcMain.handle("window:close", () => {
    mainWindow.close();
  });
  electron.ipcMain.handle("window:isMaximized", () => {
    return mainWindow.isMaximized();
  });
}
const EXT_MIME_MAP$1 = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".json": "application/json",
  ".xml": "application/xml",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".py": "text/x-python",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};
function getMimeType$1(ext) {
  return EXT_MIME_MAP$1[ext.toLowerCase()] || "application/octet-stream";
}
function mimeToExt$1(mimeType) {
  for (const [ext, mime] of Object.entries(EXT_MIME_MAP$1)) {
    if (mime === mimeType) return ext;
  }
  return "";
}
const OUTBOUND_DIR$1 = node_path.join(node_os.homedir(), ".openclaw", "media", "outbound");
async function generateImagePreview$1(filePath, mimeType) {
  try {
    const img = electron.nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return null;
    const size = img.getSize();
    const maxDim = 512;
    if (size.width > maxDim || size.height > maxDim) {
      const resized = size.width >= size.height ? img.resize({ width: maxDim }) : img.resize({ height: maxDim });
      return `data:image/png;base64,${resized.toPNG().toString("base64")}`;
    }
    const { readFile: readFileAsync } = await import("fs/promises");
    const buf = await readFileAsync(filePath);
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
function registerFileHandlers() {
  electron.ipcMain.handle("file:stage", async (_, filePaths) => {
    const fsP = await import("fs/promises");
    await fsP.mkdir(OUTBOUND_DIR$1, { recursive: true });
    const results = [];
    for (const filePath of filePaths) {
      const id = crypto$2.randomUUID();
      const ext = node_path.extname(filePath);
      const stagedPath = node_path.join(OUTBOUND_DIR$1, `${id}${ext}`);
      await fsP.copyFile(filePath, stagedPath);
      const s = await fsP.stat(stagedPath);
      const mimeType = getMimeType$1(ext);
      const fileName = node_path.basename(filePath);
      let preview = null;
      if (mimeType.startsWith("image/")) {
        preview = await generateImagePreview$1(stagedPath, mimeType);
      }
      results.push({ id, fileName, mimeType, fileSize: s.size, stagedPath, preview });
    }
    return results;
  });
  electron.ipcMain.handle("file:stageBuffer", async (_, payload) => {
    const fsP = await import("fs/promises");
    await fsP.mkdir(OUTBOUND_DIR$1, { recursive: true });
    const id = crypto$2.randomUUID();
    const ext = node_path.extname(payload.fileName) || mimeToExt$1(payload.mimeType);
    const stagedPath = node_path.join(OUTBOUND_DIR$1, `${id}${ext}`);
    const buffer = Buffer.from(payload.base64, "base64");
    await fsP.writeFile(stagedPath, buffer);
    const mimeType = payload.mimeType || getMimeType$1(ext);
    const fileSize = buffer.length;
    let preview = null;
    if (mimeType.startsWith("image/")) {
      preview = await generateImagePreview$1(stagedPath, mimeType);
    }
    return { id, fileName: payload.fileName, mimeType, fileSize, stagedPath, preview };
  });
  electron.ipcMain.handle("media:saveImage", async (_, params) => {
    try {
      const ext = params.defaultFileName.includes(".") ? params.defaultFileName.split(".").pop() : params.mimeType?.split("/")[1] || "png";
      const result = await electron.dialog.showSaveDialog({
        defaultPath: node_path.join(node_os.homedir(), "Downloads", params.defaultFileName),
        filters: [
          { name: "Images", extensions: [ext, "png", "jpg", "jpeg", "webp", "gif"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });
      if (result.canceled || !result.filePath) return { success: false };
      const fsP = await import("fs/promises");
      if (params.filePath) {
        try {
          await fsP.access(params.filePath);
          await fsP.copyFile(params.filePath, result.filePath);
        } catch {
          return { success: false, error: "Source file not found" };
        }
      } else if (params.base64) {
        const buffer = Buffer.from(params.base64, "base64");
        await fsP.writeFile(result.filePath, buffer);
      } else {
        return { success: false, error: "No image data provided" };
      }
      return { success: true, savedPath: result.filePath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
  electron.ipcMain.handle("media:getThumbnails", async (_, paths) => {
    const fsP = await import("fs/promises");
    const results = {};
    for (const { filePath, mimeType } of paths) {
      try {
        const s = await fsP.stat(filePath);
        let preview = null;
        if (mimeType.startsWith("image/")) {
          preview = await generateImagePreview$1(filePath, mimeType);
        }
        results[filePath] = { preview, fileSize: s.size };
      } catch {
        results[filePath] = { preview: null, fileSize: 0 };
      }
    }
    return results;
  });
}
function registerSessionHandlers() {
  electron.ipcMain.handle("session:delete", async (_, sessionKey) => {
    try {
      if (!sessionKey || !sessionKey.startsWith("agent:")) {
        return { success: false, error: `Invalid sessionKey: ${sessionKey}` };
      }
      const parts = sessionKey.split(":");
      if (parts.length < 3) {
        return { success: false, error: `sessionKey has too few parts: ${sessionKey}` };
      }
      const agentId = parts[1];
      const openclawConfigDir = getOpenClawConfigDir();
      const sessionsDir = node_path.join(openclawConfigDir, "agents", agentId, "sessions");
      const sessionsJsonPath = node_path.join(sessionsDir, "sessions.json");
      logger.info(`[session:delete] key=${sessionKey} agentId=${agentId}`);
      logger.info(`[session:delete] sessionsJson=${sessionsJsonPath}`);
      const fsP = await import("fs/promises");
      let sessionsJson = {};
      try {
        const raw = await fsP.readFile(sessionsJsonPath, "utf8");
        sessionsJson = JSON.parse(raw);
      } catch (e) {
        logger.warn(`[session:delete] Could not read sessions.json: ${String(e)}`);
        return { success: false, error: `Could not read sessions.json: ${String(e)}` };
      }
      let uuidFileName;
      if (Array.isArray(sessionsJson.sessions)) {
        const entry = sessionsJson.sessions.find((s) => s.key === sessionKey || s.sessionKey === sessionKey);
        if (entry) {
          uuidFileName = entry.file ?? entry.fileName ?? entry.path;
          if (!uuidFileName && typeof entry.id === "string") {
            uuidFileName = `${entry.id}.jsonl`;
          }
        }
      }
      let resolvedSrcPath;
      if (!uuidFileName && sessionsJson[sessionKey] != null) {
        const val = sessionsJson[sessionKey];
        if (typeof val === "string") {
          uuidFileName = val;
        } else if (typeof val === "object" && val !== null) {
          const entry = val;
          const absFile = entry.sessionFile ?? entry.file ?? entry.fileName ?? entry.path;
          if (absFile) {
            if (absFile.startsWith("/") || absFile.match(/^[A-Za-z]:\\/)) {
              resolvedSrcPath = absFile;
            } else {
              uuidFileName = absFile;
            }
          } else {
            const uuidVal = entry.id ?? entry.sessionId;
            if (uuidVal) uuidFileName = uuidVal.endsWith(".jsonl") ? uuidVal : `${uuidVal}.jsonl`;
          }
        }
      }
      if (!uuidFileName && !resolvedSrcPath) {
        const rawVal = sessionsJson[sessionKey];
        logger.warn(`[session:delete] Cannot resolve file for "${sessionKey}". Raw value: ${JSON.stringify(rawVal)}`);
        return { success: false, error: `Cannot resolve file for session: ${sessionKey}` };
      }
      if (!resolvedSrcPath) {
        if (!uuidFileName.endsWith(".jsonl")) uuidFileName = `${uuidFileName}.jsonl`;
        resolvedSrcPath = node_path.join(sessionsDir, uuidFileName);
      }
      const dstPath = resolvedSrcPath.replace(/\.jsonl$/, ".deleted.jsonl");
      logger.info(`[session:delete] file: ${resolvedSrcPath}`);
      try {
        await fsP.access(resolvedSrcPath);
        await fsP.rename(resolvedSrcPath, dstPath);
        logger.info(`[session:delete] Renamed ${resolvedSrcPath} → ${dstPath}`);
      } catch (e) {
        logger.warn(`[session:delete] Could not rename file: ${String(e)}`);
      }
      try {
        const raw2 = await fsP.readFile(sessionsJsonPath, "utf8");
        const json2 = JSON.parse(raw2);
        if (Array.isArray(json2.sessions)) {
          json2.sessions = json2.sessions.filter((s) => s.key !== sessionKey && s.sessionKey !== sessionKey);
        } else if (json2[sessionKey]) {
          delete json2[sessionKey];
        }
        await fsP.writeFile(sessionsJsonPath, JSON.stringify(json2, null, 2), "utf8");
        logger.info(`[session:delete] Removed "${sessionKey}" from sessions.json`);
      } catch (e) {
        logger.warn(`[session:delete] Could not update sessions.json: ${String(e)}`);
      }
      return { success: true };
    } catch (err) {
      logger.error(`[session:delete] Unexpected error for ${sessionKey}:`, err);
      return { success: false, error: String(err) };
    }
  });
}
let tray = null;
function getIconsDir$1() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "resources", "icons");
  }
  return path.join(__dirname, "../../resources/icons");
}
function createTray(mainWindow) {
  const iconsDir = getIconsDir$1();
  let iconPath;
  if (process.platform === "win32") {
    iconPath = path.join(iconsDir, "icon.ico");
  } else if (process.platform === "darwin") {
    iconPath = path.join(iconsDir, "tray-icon-Template.png");
  } else {
    iconPath = path.join(iconsDir, "32x32.png");
  }
  let icon = electron.nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = electron.nativeImage.createFromPath(path.join(iconsDir, "icon.png"));
    if (process.platform === "darwin") {
      icon.setTemplateImage(true);
    }
  }
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }
  tray = new electron.Tray(icon);
  tray.setToolTip("YUEWEI集团 - AI Assistant");
  const showWindow = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  };
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "Show YUEWEI集团",
      click: showWindow
    },
    {
      type: "separator"
    },
    {
      label: "Gateway Status",
      enabled: false
    },
    {
      label: "  Running",
      type: "checkbox",
      checked: true,
      enabled: false
    },
    {
      type: "separator"
    },
    {
      label: "Quick Actions",
      submenu: [
        {
          label: "Open Dashboard",
          click: () => {
            if (mainWindow.isDestroyed()) return;
            mainWindow.show();
            mainWindow.webContents.send("navigate", "/");
          }
        },
        {
          label: "Open Chat",
          click: () => {
            if (mainWindow.isDestroyed()) return;
            mainWindow.show();
            mainWindow.webContents.send("navigate", "/chat");
          }
        },
        {
          label: "Open Settings",
          click: () => {
            if (mainWindow.isDestroyed()) return;
            mainWindow.show();
            mainWindow.webContents.send("navigate", "/settings");
          }
        }
      ]
    },
    {
      type: "separator"
    },
    {
      label: "Check for Updates...",
      click: () => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send("update:check");
      }
    },
    {
      type: "separator"
    },
    {
      label: "Quit YUEWEI集团",
      click: () => {
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  tray.on("double-click", () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
  return tray;
}
function createMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    // App menu (macOS only)
    ...isMac ? [
      {
        label: electron.app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Preferences...",
            accelerator: "Cmd+,",
            click: () => {
              const win = electron.BrowserWindow.getFocusedWindow();
              win?.webContents.send("navigate", "/settings");
            }
          },
          {
            label: "个人信息...",
            click: () => { enterpriseShowProfile(); }
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    // File menu
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/chat");
          }
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...isMac ? [
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" }
        ] : [
          { role: "delete" },
          { type: "separator" },
          { role: "selectAll" }
        ]
      ]
    },
    // View menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    // Navigate menu
    {
      label: "Navigate",
      submenu: [
        {
          label: "Dashboard",
          accelerator: "CmdOrCtrl+1",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/");
          }
        },
        {
          label: "Chat",
          accelerator: "CmdOrCtrl+2",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/chat");
          }
        },
        {
          label: "Channels",
          accelerator: "CmdOrCtrl+3",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/channels");
          }
        },
        {
          label: "Skills",
          accelerator: "CmdOrCtrl+4",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/skills");
          }
        },
        {
          label: "Cron Tasks",
          accelerator: "CmdOrCtrl+5",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/cron");
          }
        },
        {
          label: "Settings",
          accelerator: isMac ? "Cmd+," : "Ctrl+,",
          click: () => {
            const win = electron.BrowserWindow.getFocusedWindow();
            win?.webContents.send("navigate", "/settings");
          }
        }
      ]
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" }
        ] : [{ role: "close" }]
      ]
    },
    // Help menu
    {
      role: "help",
      submenu: [
        {
          label: "Documentation",
          click: async () => {
            await electron.shell.openExternal("https://claw-x.com");
          }
        },
        {
          label: "Report Issue",
          click: async () => {
            await electron.shell.openExternal("https://github.com/ValueCell-ai/YUEWEI-ClawX/issues");
          }
        },
        { type: "separator" },
        {
          label: "OpenClaw Documentation",
          click: async () => {
            await electron.shell.openExternal("https://docs.openclaw.ai");
          }
        }
      ]
    }
  ];
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
function createModulerModifier() {
  const getModuleFromFileName = createGetModuleFromFilename();
  return async (frames) => {
    for (const frame of frames) frame.module = getModuleFromFileName(frame.filename);
    return frames;
  };
}
function createGetModuleFromFilename(basePath = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd(), isWindows = "\\" === path.sep) {
  const normalizedBase = isWindows ? normalizeWindowsPath(basePath) : basePath;
  return (filename) => {
    if (!filename) return;
    const normalizedFilename = isWindows ? normalizeWindowsPath(filename) : filename;
    let { dir, base: file, ext } = path.posix.parse(normalizedFilename);
    if (".js" === ext || ".mjs" === ext || ".cjs" === ext) file = file.slice(0, -1 * ext.length);
    const decodedFile = decodeURIComponent(file);
    if (!dir) dir = ".";
    const n = dir.lastIndexOf("/node_modules");
    if (n > -1) return `${dir.slice(n + 14).replace(/\//g, ".")}:${decodedFile}`;
    if (dir.startsWith(normalizedBase)) {
      const moduleName = dir.slice(normalizedBase.length + 1).replace(/\//g, ".");
      return moduleName ? `${moduleName}:${decodedFile}` : decodedFile;
    }
    return decodedFile;
  };
}
function normalizeWindowsPath(path2) {
  return path2.replace(/^[A-Z]:/, "").replace(/\\/g, "/");
}
const normalizeFlagsResponse = (flagsResponse) => {
  if ("flags" in flagsResponse) {
    const featureFlags = getFlagValuesFromFlags(flagsResponse.flags);
    const featureFlagPayloads = getPayloadsFromFlags(flagsResponse.flags);
    return {
      ...flagsResponse,
      featureFlags,
      featureFlagPayloads
    };
  }
  {
    const featureFlags = flagsResponse.featureFlags ?? {};
    const featureFlagPayloads = Object.fromEntries(Object.entries(flagsResponse.featureFlagPayloads || {}).map(([k, v]) => [
      k,
      parsePayload(v)
    ]));
    const flags = Object.fromEntries(Object.entries(featureFlags).map(([key, value]) => [
      key,
      getFlagDetailFromFlagAndPayload(key, value, featureFlagPayloads[key])
    ]));
    return {
      ...flagsResponse,
      featureFlags,
      featureFlagPayloads,
      flags
    };
  }
};
function getFlagDetailFromFlagAndPayload(key, value, payload) {
  return {
    key,
    enabled: "string" == typeof value ? true : value,
    variant: "string" == typeof value ? value : void 0,
    reason: void 0,
    metadata: {
      id: void 0,
      version: void 0,
      payload: payload ? JSON.stringify(payload) : void 0,
      description: void 0
    }
  };
}
const getFlagValuesFromFlags = (flags) => Object.fromEntries(Object.entries(flags ?? {}).map(([key, detail]) => [
  key,
  getFeatureFlagValue(detail)
]).filter(([, value]) => void 0 !== value));
const getPayloadsFromFlags = (flags) => {
  const safeFlags = flags ?? {};
  return Object.fromEntries(Object.keys(safeFlags).filter((flag) => {
    const details = safeFlags[flag];
    return details.enabled && details.metadata && void 0 !== details.metadata.payload;
  }).map((flag) => {
    const payload = safeFlags[flag].metadata?.payload;
    return [
      flag,
      payload ? parsePayload(payload) : void 0
    ];
  }));
};
const getFeatureFlagValue = (detail) => void 0 === detail ? void 0 : detail.variant ?? detail.enabled;
const parsePayload = (response) => {
  if ("string" != typeof response) return response;
  try {
    return JSON.parse(response);
  } catch {
    return response;
  }
};
const DIGITS = "0123456789abcdef";
class UUID {
  constructor(bytes) {
    this.bytes = bytes;
  }
  static ofInner(bytes) {
    if (16 === bytes.length) return new UUID(bytes);
    throw new TypeError("not 128-bit length");
  }
  static fromFieldsV7(unixTsMs, randA, randBHi, randBLo) {
    if (!Number.isInteger(unixTsMs) || !Number.isInteger(randA) || !Number.isInteger(randBHi) || !Number.isInteger(randBLo) || unixTsMs < 0 || randA < 0 || randBHi < 0 || randBLo < 0 || unixTsMs > 281474976710655 || randA > 4095 || randBHi > 1073741823 || randBLo > 4294967295) throw new RangeError("invalid field value");
    const bytes = new Uint8Array(16);
    bytes[0] = unixTsMs / 2 ** 40;
    bytes[1] = unixTsMs / 2 ** 32;
    bytes[2] = unixTsMs / 2 ** 24;
    bytes[3] = unixTsMs / 2 ** 16;
    bytes[4] = unixTsMs / 256;
    bytes[5] = unixTsMs;
    bytes[6] = 112 | randA >>> 8;
    bytes[7] = randA;
    bytes[8] = 128 | randBHi >>> 24;
    bytes[9] = randBHi >>> 16;
    bytes[10] = randBHi >>> 8;
    bytes[11] = randBHi;
    bytes[12] = randBLo >>> 24;
    bytes[13] = randBLo >>> 16;
    bytes[14] = randBLo >>> 8;
    bytes[15] = randBLo;
    return new UUID(bytes);
  }
  static parse(uuid) {
    let hex;
    switch (uuid.length) {
      case 32:
        hex = /^[0-9a-f]{32}$/i.exec(uuid)?.[0];
        break;
      case 36:
        hex = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(uuid)?.slice(1, 6).join("");
        break;
      case 38:
        hex = /^\{([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}$/i.exec(uuid)?.slice(1, 6).join("");
        break;
      case 45:
        hex = /^urn:uuid:([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(uuid)?.slice(1, 6).join("");
        break;
    }
    if (hex) {
      const inner = new Uint8Array(16);
      for (let i = 0; i < 16; i += 4) {
        const n = parseInt(hex.substring(2 * i, 2 * i + 8), 16);
        inner[i + 0] = n >>> 24;
        inner[i + 1] = n >>> 16;
        inner[i + 2] = n >>> 8;
        inner[i + 3] = n;
      }
      return new UUID(inner);
    }
    throw new SyntaxError("could not parse UUID string");
  }
  toString() {
    let text = "";
    for (let i = 0; i < this.bytes.length; i++) {
      text += DIGITS.charAt(this.bytes[i] >>> 4);
      text += DIGITS.charAt(15 & this.bytes[i]);
      if (3 === i || 5 === i || 7 === i || 9 === i) text += "-";
    }
    return text;
  }
  toHex() {
    let text = "";
    for (let i = 0; i < this.bytes.length; i++) {
      text += DIGITS.charAt(this.bytes[i] >>> 4);
      text += DIGITS.charAt(15 & this.bytes[i]);
    }
    return text;
  }
  toJSON() {
    return this.toString();
  }
  getVariant() {
    const n = this.bytes[8] >>> 4;
    if (n < 0) throw new Error("unreachable");
    if (n <= 7) return this.bytes.every((e) => 0 === e) ? "NIL" : "VAR_0";
    if (n <= 11) return "VAR_10";
    if (n <= 13) return "VAR_110";
    if (n <= 15) return this.bytes.every((e) => 255 === e) ? "MAX" : "VAR_RESERVED";
    else throw new Error("unreachable");
  }
  getVersion() {
    return "VAR_10" === this.getVariant() ? this.bytes[6] >>> 4 : void 0;
  }
  clone() {
    return new UUID(this.bytes.slice(0));
  }
  equals(other) {
    return 0 === this.compareTo(other);
  }
  compareTo(other) {
    for (let i = 0; i < 16; i++) {
      const diff = this.bytes[i] - other.bytes[i];
      if (0 !== diff) return Math.sign(diff);
    }
    return 0;
  }
}
class V7Generator {
  constructor(randomNumberGenerator) {
    this.timestamp = 0;
    this.counter = 0;
    this.random = randomNumberGenerator ?? getDefaultRandom();
  }
  generate() {
    return this.generateOrResetCore(Date.now(), 1e4);
  }
  generateOrAbort() {
    return this.generateOrAbortCore(Date.now(), 1e4);
  }
  generateOrResetCore(unixTsMs, rollbackAllowance) {
    let value = this.generateOrAbortCore(unixTsMs, rollbackAllowance);
    if (void 0 === value) {
      this.timestamp = 0;
      value = this.generateOrAbortCore(unixTsMs, rollbackAllowance);
    }
    return value;
  }
  generateOrAbortCore(unixTsMs, rollbackAllowance) {
    const MAX_COUNTER = 4398046511103;
    if (!Number.isInteger(unixTsMs) || unixTsMs < 1 || unixTsMs > 281474976710655) throw new RangeError("`unixTsMs` must be a 48-bit positive integer");
    if (rollbackAllowance < 0 || rollbackAllowance > 281474976710655) throw new RangeError("`rollbackAllowance` out of reasonable range");
    if (unixTsMs > this.timestamp) {
      this.timestamp = unixTsMs;
      this.resetCounter();
    } else {
      if (!(unixTsMs + rollbackAllowance >= this.timestamp)) return;
      this.counter++;
      if (this.counter > MAX_COUNTER) {
        this.timestamp++;
        this.resetCounter();
      }
    }
    return UUID.fromFieldsV7(this.timestamp, Math.trunc(this.counter / 2 ** 30), this.counter & 2 ** 30 - 1, this.random.nextUint32());
  }
  resetCounter() {
    this.counter = 1024 * this.random.nextUint32() + (1023 & this.random.nextUint32());
  }
  generateV4() {
    const bytes = new Uint8Array(Uint32Array.of(this.random.nextUint32(), this.random.nextUint32(), this.random.nextUint32(), this.random.nextUint32()).buffer);
    bytes[6] = 64 | bytes[6] >>> 4;
    bytes[8] = 128 | bytes[8] >>> 2;
    return UUID.ofInner(bytes);
  }
}
const getDefaultRandom = () => ({
  nextUint32: () => 65536 * Math.trunc(65536 * Math.random()) + Math.trunc(65536 * Math.random())
});
let defaultGenerator;
const uuidv7 = () => uuidv7obj().toString();
const uuidv7obj = () => (defaultGenerator || (defaultGenerator = new V7Generator())).generate();
var types_PostHogPersistedProperty = /* @__PURE__ */ (function(PostHogPersistedProperty) {
  PostHogPersistedProperty["AnonymousId"] = "anonymous_id";
  PostHogPersistedProperty["DistinctId"] = "distinct_id";
  PostHogPersistedProperty["Props"] = "props";
  PostHogPersistedProperty["EnablePersonProcessing"] = "enable_person_processing";
  PostHogPersistedProperty["PersonMode"] = "person_mode";
  PostHogPersistedProperty["FeatureFlagDetails"] = "feature_flag_details";
  PostHogPersistedProperty["FeatureFlags"] = "feature_flags";
  PostHogPersistedProperty["FeatureFlagPayloads"] = "feature_flag_payloads";
  PostHogPersistedProperty["BootstrapFeatureFlagDetails"] = "bootstrap_feature_flag_details";
  PostHogPersistedProperty["BootstrapFeatureFlags"] = "bootstrap_feature_flags";
  PostHogPersistedProperty["BootstrapFeatureFlagPayloads"] = "bootstrap_feature_flag_payloads";
  PostHogPersistedProperty["OverrideFeatureFlags"] = "override_feature_flags";
  PostHogPersistedProperty["Queue"] = "queue";
  PostHogPersistedProperty["OptedOut"] = "opted_out";
  PostHogPersistedProperty["SessionId"] = "session_id";
  PostHogPersistedProperty["SessionStartTimestamp"] = "session_start_timestamp";
  PostHogPersistedProperty["SessionLastTimestamp"] = "session_timestamp";
  PostHogPersistedProperty["PersonProperties"] = "person_properties";
  PostHogPersistedProperty["GroupProperties"] = "group_properties";
  PostHogPersistedProperty["InstalledAppBuild"] = "installed_app_build";
  PostHogPersistedProperty["InstalledAppVersion"] = "installed_app_version";
  PostHogPersistedProperty["SessionReplay"] = "session_replay";
  PostHogPersistedProperty["SurveyLastSeenDate"] = "survey_last_seen_date";
  PostHogPersistedProperty["SurveysSeen"] = "surveys_seen";
  PostHogPersistedProperty["Surveys"] = "surveys";
  PostHogPersistedProperty["RemoteConfig"] = "remote_config";
  PostHogPersistedProperty["FlagsEndpointWasHit"] = "flags_endpoint_was_hit";
  return PostHogPersistedProperty;
})({});
const DEFAULT_BLOCKED_UA_STRS = [
  "amazonbot",
  "amazonproductbot",
  "app.hypefactors.com",
  "applebot",
  "archive.org_bot",
  "awariobot",
  "backlinksextendedbot",
  "baiduspider",
  "bingbot",
  "bingpreview",
  "chrome-lighthouse",
  "dataforseobot",
  "deepscan",
  "duckduckbot",
  "facebookexternal",
  "facebookcatalog",
  "http://yandex.com/bots",
  "hubspot",
  "ia_archiver",
  "leikibot",
  "linkedinbot",
  "meta-externalagent",
  "mj12bot",
  "msnbot",
  "nessus",
  "petalbot",
  "pinterest",
  "prerender",
  "rogerbot",
  "screaming frog",
  "sebot-wa",
  "sitebulb",
  "slackbot",
  "slurp",
  "trendictionbot",
  "turnitin",
  "twitterbot",
  "vercel-screenshot",
  "vercelbot",
  "yahoo! slurp",
  "yandexbot",
  "zoombot",
  "bot.htm",
  "bot.php",
  "(bot;",
  "bot/",
  "crawler",
  "ahrefsbot",
  "ahrefssiteaudit",
  "semrushbot",
  "siteauditbot",
  "splitsignalbot",
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "perplexitybot",
  "better uptime bot",
  "sentryuptimebot",
  "uptimerobot",
  "headlesschrome",
  "cypress",
  "google-hoteladsverifier",
  "adsbot-google",
  "apis-google",
  "duplexweb-google",
  "feedfetcher-google",
  "google favicon",
  "google web preview",
  "google-read-aloud",
  "googlebot",
  "googleother",
  "google-cloudvertexbot",
  "googleweblight",
  "mediapartners-google",
  "storebot-google",
  "google-inspectiontool",
  "bytespider"
];
const isBlockedUA = function(ua, customBlockedUserAgents = []) {
  if (!ua) return false;
  const uaLower = ua.toLowerCase();
  return DEFAULT_BLOCKED_UA_STRS.concat(customBlockedUserAgents).some((blockedUA) => {
    const blockedUaLower = blockedUA.toLowerCase();
    return -1 !== uaLower.indexOf(blockedUaLower);
  });
};
const nativeIsArray = Array.isArray;
const ObjProto = Object.prototype;
const type_utils_toString = ObjProto.toString;
const isArray = nativeIsArray || function(obj) {
  return "[object Array]" === type_utils_toString.call(obj);
};
const isObject = (x) => x === Object(x) && !isArray(x);
const isUndefined = (x) => void 0 === x;
const isString = (x) => "[object String]" == type_utils_toString.call(x);
const isEmptyString = (x) => isString(x) && 0 === x.trim().length;
const isNumber = (x) => "[object Number]" == type_utils_toString.call(x) && x === x;
const isPlainError = (x) => x instanceof Error;
function isPrimitive(value) {
  return null === value || "object" != typeof value;
}
function isBuiltin(candidate, className) {
  return Object.prototype.toString.call(candidate) === `[object ${className}]`;
}
function isEvent(candidate) {
  return !isUndefined(Event) && isInstanceOf(candidate, Event);
}
function isPlainObject(candidate) {
  return isBuiltin(candidate, "Object");
}
function isInstanceOf(candidate, base) {
  try {
    return candidate instanceof base;
  } catch {
    return false;
  }
}
function clampToRange(value, min, max, logger2, fallbackValue) {
  if (min > max) {
    logger2.warn("min cannot be greater than max.");
    min = max;
  }
  if (isNumber(value)) if (value > max) {
    logger2.warn(" cannot be  greater than max: " + max + ". Using max value instead.");
    return max;
  } else {
    if (!(value < min)) return value;
    logger2.warn(" cannot be less than min: " + min + ". Using min value instead.");
    return min;
  }
  logger2.warn(" must be a number. using max or fallback. max: " + max + ", fallback: " + fallbackValue);
  return clampToRange(max, min, max, logger2);
}
const ONE_DAY_IN_MS = 864e5;
class BucketedRateLimiter {
  constructor(options) {
    this._buckets = {};
    this._onBucketRateLimited = options._onBucketRateLimited;
    this._bucketSize = clampToRange(options.bucketSize, 0, 100, options._logger);
    this._refillRate = clampToRange(options.refillRate, 0, this._bucketSize, options._logger);
    this._refillInterval = clampToRange(options.refillInterval, 0, ONE_DAY_IN_MS, options._logger);
  }
  _applyRefill(bucket, now) {
    const elapsedMs = now - bucket.lastAccess;
    const refillIntervals = Math.floor(elapsedMs / this._refillInterval);
    if (refillIntervals > 0) {
      const tokensToAdd = refillIntervals * this._refillRate;
      bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this._bucketSize);
      bucket.lastAccess = bucket.lastAccess + refillIntervals * this._refillInterval;
    }
  }
  consumeRateLimit(key) {
    const now = Date.now();
    const keyStr = String(key);
    let bucket = this._buckets[keyStr];
    if (bucket) this._applyRefill(bucket, now);
    else {
      bucket = {
        tokens: this._bucketSize,
        lastAccess: now
      };
      this._buckets[keyStr] = bucket;
    }
    if (0 === bucket.tokens) return true;
    bucket.tokens--;
    if (0 === bucket.tokens) this._onBucketRateLimited?.(key);
    return 0 === bucket.tokens;
  }
  stop() {
    this._buckets = {};
  }
}
class PromiseQueue {
  add(promise) {
    const promiseUUID = uuidv7();
    this.promiseByIds[promiseUUID] = promise;
    promise.catch(() => {
    }).finally(() => {
      delete this.promiseByIds[promiseUUID];
    });
    return promise;
  }
  async join() {
    let promises2 = Object.values(this.promiseByIds);
    let length = promises2.length;
    while (length > 0) {
      await Promise.all(promises2);
      promises2 = Object.values(this.promiseByIds);
      length = promises2.length;
    }
  }
  get length() {
    return Object.keys(this.promiseByIds).length;
  }
  constructor() {
    this.promiseByIds = {};
  }
}
function createConsole(consoleLike = console) {
  const lockedMethods = {
    log: consoleLike.log.bind(consoleLike),
    warn: consoleLike.warn.bind(consoleLike),
    error: consoleLike.error.bind(consoleLike),
    debug: consoleLike.debug.bind(consoleLike)
  };
  return lockedMethods;
}
const _createLogger = (prefix, maybeCall, consoleLike) => {
  function _log(level, ...args) {
    maybeCall(() => {
      const consoleMethod = consoleLike[level];
      consoleMethod(prefix, ...args);
    });
  }
  const logger2 = {
    info: (...args) => {
      _log("log", ...args);
    },
    warn: (...args) => {
      _log("warn", ...args);
    },
    error: (...args) => {
      _log("error", ...args);
    },
    critical: (...args) => {
      consoleLike["error"](prefix, ...args);
    },
    createLogger: (additionalPrefix) => _createLogger(`${prefix} ${additionalPrefix}`, maybeCall, consoleLike)
  };
  return logger2;
};
const passThrough = (fn) => fn();
function createLogger(prefix, maybeCall = passThrough) {
  return _createLogger(prefix, maybeCall, createConsole());
}
const STRING_FORMAT = "utf8";
function assert(truthyValue, message) {
  if (!truthyValue || "string" != typeof truthyValue || isEmpty(truthyValue)) throw new Error(message);
}
function isEmpty(truthyValue) {
  if (0 === truthyValue.trim().length) return true;
  return false;
}
function removeTrailingSlash(url) {
  return url?.replace(/\/+$/, "");
}
async function retriable(fn, props) {
  let lastError = null;
  for (let i = 0; i < props.retryCount + 1; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, props.retryDelay));
    try {
      const res = await fn();
      return res;
    } catch (e) {
      lastError = e;
      if (!props.retryCheck(e)) throw e;
    }
  }
  throw lastError;
}
function currentISOTime() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function safeSetTimeout(fn, timeout) {
  const t = setTimeout(fn, timeout);
  t?.unref && t?.unref();
  return t;
}
const isError = (x) => x instanceof Error;
function allSettled(promises2) {
  return Promise.all(promises2.map((p) => (p ?? Promise.resolve()).then((value) => ({
    status: "fulfilled",
    value
  }), (reason) => ({
    status: "rejected",
    reason
  }))));
}
class SimpleEventEmitter {
  constructor() {
    this.events = {};
    this.events = {};
  }
  on(event, listener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
    return () => {
      this.events[event] = this.events[event].filter((x) => x !== listener);
    };
  }
  emit(event, payload) {
    for (const listener of this.events[event] || []) listener(payload);
    for (const listener of this.events["*"] || []) listener(event, payload);
  }
}
function isGzipSupported() {
  return "CompressionStream" in globalThis;
}
async function gzipCompress(input, isDebug = true) {
  try {
    const dataStream = new Blob([
      input
    ], {
      type: "text/plain"
    }).stream();
    const compressedStream = dataStream.pipeThrough(new CompressionStream("gzip"));
    return await new Response(compressedStream).blob();
  } catch (error2) {
    if (isDebug) console.error("Failed to gzip compress data", error2);
    return null;
  }
}
class PostHogFetchHttpError extends Error {
  constructor(response, reqByteLength) {
    super("HTTP error while fetching PostHog: status=" + response.status + ", reqByteLength=" + reqByteLength), this.response = response, this.reqByteLength = reqByteLength, this.name = "PostHogFetchHttpError";
  }
  get status() {
    return this.response.status;
  }
  get text() {
    return this.response.text();
  }
  get json() {
    return this.response.json();
  }
}
class PostHogFetchNetworkError extends Error {
  constructor(error2) {
    super("Network error while fetching PostHog", error2 instanceof Error ? {
      cause: error2
    } : {}), this.error = error2, this.name = "PostHogFetchNetworkError";
  }
}
async function logFlushError(err) {
  if (err instanceof PostHogFetchHttpError) {
    let text = "";
    try {
      text = await err.text;
    } catch {
    }
    console.error(`Error while flushing PostHog: message=${err.message}, response body=${text}`, err);
  } else console.error("Error while flushing PostHog", err);
  return Promise.resolve();
}
function isPostHogFetchError(err) {
  return "object" == typeof err && (err instanceof PostHogFetchHttpError || err instanceof PostHogFetchNetworkError);
}
function isPostHogFetchContentTooLargeError(err) {
  return "object" == typeof err && err instanceof PostHogFetchHttpError && 413 === err.status;
}
class PostHogCoreStateless {
  constructor(apiKey, options = {}) {
    this.flushPromise = null;
    this.shutdownPromise = null;
    this.promiseQueue = new PromiseQueue();
    this._events = new SimpleEventEmitter();
    this._isInitialized = false;
    assert(apiKey, "You must pass your PostHog project's api key.");
    this.apiKey = apiKey;
    this.host = removeTrailingSlash(options.host || "https://us.i.posthog.com");
    this.flushAt = options.flushAt ? Math.max(options.flushAt, 1) : 20;
    this.maxBatchSize = Math.max(this.flushAt, options.maxBatchSize ?? 100);
    this.maxQueueSize = Math.max(this.flushAt, options.maxQueueSize ?? 1e3);
    this.flushInterval = options.flushInterval ?? 1e4;
    this.preloadFeatureFlags = options.preloadFeatureFlags ?? true;
    this.defaultOptIn = options.defaultOptIn ?? true;
    this.disableSurveys = options.disableSurveys ?? false;
    this._retryOptions = {
      retryCount: options.fetchRetryCount ?? 3,
      retryDelay: options.fetchRetryDelay ?? 3e3,
      retryCheck: isPostHogFetchError
    };
    this.requestTimeout = options.requestTimeout ?? 1e4;
    this.featureFlagsRequestTimeoutMs = options.featureFlagsRequestTimeoutMs ?? 3e3;
    this.remoteConfigRequestTimeoutMs = options.remoteConfigRequestTimeoutMs ?? 3e3;
    this.disableGeoip = options.disableGeoip ?? true;
    this.disabled = options.disabled ?? false;
    this.historicalMigration = options?.historicalMigration ?? false;
    this._initPromise = Promise.resolve();
    this._isInitialized = true;
    this._logger = createLogger("[PostHog]", this.logMsgIfDebug.bind(this));
    this.evaluationContexts = options?.evaluationContexts ?? options?.evaluationEnvironments;
    if (options?.evaluationEnvironments && !options?.evaluationContexts) this._logger.warn("evaluationEnvironments is deprecated. Use evaluationContexts instead. This property will be removed in a future version.");
    this.disableCompression = !isGzipSupported() || (options?.disableCompression ?? false);
  }
  logMsgIfDebug(fn) {
    if (this.isDebug) fn();
  }
  wrap(fn) {
    if (this.disabled) return void this._logger.warn("The client is disabled");
    if (this._isInitialized) return fn();
    this._initPromise.then(() => fn());
  }
  getCommonEventProperties() {
    return {
      $lib: this.getLibraryId(),
      $lib_version: this.getLibraryVersion()
    };
  }
  get optedOut() {
    return this.getPersistedProperty(types_PostHogPersistedProperty.OptedOut) ?? !this.defaultOptIn;
  }
  async optIn() {
    this.wrap(() => {
      this.setPersistedProperty(types_PostHogPersistedProperty.OptedOut, false);
    });
  }
  async optOut() {
    this.wrap(() => {
      this.setPersistedProperty(types_PostHogPersistedProperty.OptedOut, true);
    });
  }
  on(event, cb) {
    return this._events.on(event, cb);
  }
  debug(enabled = true) {
    this.removeDebugCallback?.();
    if (enabled) {
      const removeDebugCallback = this.on("*", (event, payload) => this._logger.info(event, payload));
      this.removeDebugCallback = () => {
        removeDebugCallback();
        this.removeDebugCallback = void 0;
      };
    }
  }
  get isDebug() {
    return !!this.removeDebugCallback;
  }
  get isDisabled() {
    return this.disabled;
  }
  buildPayload(payload) {
    return {
      distinct_id: payload.distinct_id,
      event: payload.event,
      properties: {
        ...payload.properties || {},
        ...this.getCommonEventProperties()
      }
    };
  }
  addPendingPromise(promise) {
    return this.promiseQueue.add(promise);
  }
  identifyStateless(distinctId2, properties, options) {
    this.wrap(() => {
      const payload = {
        ...this.buildPayload({
          distinct_id: distinctId2,
          event: "$identify",
          properties
        })
      };
      this.enqueue("identify", payload, options);
    });
  }
  async identifyStatelessImmediate(distinctId2, properties, options) {
    const payload = {
      ...this.buildPayload({
        distinct_id: distinctId2,
        event: "$identify",
        properties
      })
    };
    await this.sendImmediate("identify", payload, options);
  }
  captureStateless(distinctId2, event, properties, options) {
    this.wrap(() => {
      const payload = this.buildPayload({
        distinct_id: distinctId2,
        event,
        properties
      });
      this.enqueue("capture", payload, options);
    });
  }
  async captureStatelessImmediate(distinctId2, event, properties, options) {
    const payload = this.buildPayload({
      distinct_id: distinctId2,
      event,
      properties
    });
    await this.sendImmediate("capture", payload, options);
  }
  aliasStateless(alias, distinctId2, properties, options) {
    this.wrap(() => {
      const payload = this.buildPayload({
        event: "$create_alias",
        distinct_id: distinctId2,
        properties: {
          ...properties || {},
          distinct_id: distinctId2,
          alias
        }
      });
      this.enqueue("alias", payload, options);
    });
  }
  async aliasStatelessImmediate(alias, distinctId2, properties, options) {
    const payload = this.buildPayload({
      event: "$create_alias",
      distinct_id: distinctId2,
      properties: {
        ...properties || {},
        distinct_id: distinctId2,
        alias
      }
    });
    await this.sendImmediate("alias", payload, options);
  }
  groupIdentifyStateless(groupType, groupKey, groupProperties, options, distinctId2, eventProperties) {
    this.wrap(() => {
      const payload = this.buildPayload({
        distinct_id: distinctId2 || `$${groupType}_${groupKey}`,
        event: "$groupidentify",
        properties: {
          $group_type: groupType,
          $group_key: groupKey,
          $group_set: groupProperties || {},
          ...eventProperties || {}
        }
      });
      this.enqueue("capture", payload, options);
    });
  }
  async getRemoteConfig() {
    await this._initPromise;
    let host = this.host;
    if ("https://us.i.posthog.com" === host) host = "https://us-assets.i.posthog.com";
    else if ("https://eu.i.posthog.com" === host) host = "https://eu-assets.i.posthog.com";
    const url = `${host}/array/${this.apiKey}/config`;
    const fetchOptions = {
      method: "GET",
      headers: {
        ...this.getCustomHeaders(),
        "Content-Type": "application/json"
      }
    };
    return this.fetchWithRetry(url, fetchOptions, {
      retryCount: 0
    }, this.remoteConfigRequestTimeoutMs).then((response) => response.json()).catch((error2) => {
      this._logger.error("Remote config could not be loaded", error2);
      this._events.emit("error", error2);
    });
  }
  async getFlags(distinctId2, groups = {}, personProperties = {}, groupProperties = {}, extraPayload = {}, fetchConfig = true) {
    await this._initPromise;
    const configParam = fetchConfig ? "&config=true" : "";
    const url = `${this.host}/flags/?v=2${configParam}`;
    const requestData = {
      token: this.apiKey,
      distinct_id: distinctId2,
      groups,
      person_properties: personProperties,
      group_properties: groupProperties,
      ...extraPayload
    };
    if (this.evaluationContexts && this.evaluationContexts.length > 0) requestData.evaluation_contexts = this.evaluationContexts;
    const fetchOptions = {
      method: "POST",
      headers: {
        ...this.getCustomHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestData)
    };
    this._logger.info("Flags URL", url);
    return this.fetchWithRetry(url, fetchOptions, {
      retryCount: 0
    }, this.featureFlagsRequestTimeoutMs).then((response) => response.json()).then((response) => ({
      success: true,
      response: normalizeFlagsResponse(response)
    })).catch((error2) => {
      this._events.emit("error", error2);
      return {
        success: false,
        error: this.categorizeRequestError(error2)
      };
    });
  }
  categorizeRequestError(error2) {
    if (error2 instanceof PostHogFetchHttpError) return {
      type: "api_error",
      statusCode: error2.status
    };
    if (error2 instanceof PostHogFetchNetworkError) {
      const cause = error2.error;
      if (cause instanceof Error && ("AbortError" === cause.name || "TimeoutError" === cause.name)) return {
        type: "timeout"
      };
      return {
        type: "connection_error"
      };
    }
    return {
      type: "unknown_error"
    };
  }
  async getFeatureFlagStateless(key, distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip) {
    await this._initPromise;
    const flagDetailResponse = await this.getFeatureFlagDetailStateless(key, distinctId2, groups, personProperties, groupProperties, disableGeoip);
    if (void 0 === flagDetailResponse) return {
      response: void 0,
      requestId: void 0
    };
    let response = getFeatureFlagValue(flagDetailResponse.response);
    if (void 0 === response) response = false;
    return {
      response,
      requestId: flagDetailResponse.requestId
    };
  }
  async getFeatureFlagDetailStateless(key, distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip) {
    await this._initPromise;
    const flagsResponse = await this.getFeatureFlagDetailsStateless(distinctId2, groups, personProperties, groupProperties, disableGeoip, [
      key
    ]);
    if (void 0 === flagsResponse) return;
    const featureFlags = flagsResponse.flags;
    const flagDetail = featureFlags[key];
    return {
      response: flagDetail,
      requestId: flagsResponse.requestId,
      evaluatedAt: flagsResponse.evaluatedAt
    };
  }
  async getFeatureFlagPayloadStateless(key, distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip) {
    await this._initPromise;
    const payloads = await this.getFeatureFlagPayloadsStateless(distinctId2, groups, personProperties, groupProperties, disableGeoip, [
      key
    ]);
    if (!payloads) return;
    const response = payloads[key];
    if (void 0 === response) return null;
    return response;
  }
  async getFeatureFlagPayloadsStateless(distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip, flagKeysToEvaluate) {
    await this._initPromise;
    const payloads = (await this.getFeatureFlagsAndPayloadsStateless(distinctId2, groups, personProperties, groupProperties, disableGeoip, flagKeysToEvaluate)).payloads;
    return payloads;
  }
  async getFeatureFlagsStateless(distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip, flagKeysToEvaluate) {
    await this._initPromise;
    return await this.getFeatureFlagsAndPayloadsStateless(distinctId2, groups, personProperties, groupProperties, disableGeoip, flagKeysToEvaluate);
  }
  async getFeatureFlagsAndPayloadsStateless(distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip, flagKeysToEvaluate) {
    await this._initPromise;
    const featureFlagDetails = await this.getFeatureFlagDetailsStateless(distinctId2, groups, personProperties, groupProperties, disableGeoip, flagKeysToEvaluate);
    if (!featureFlagDetails) return {
      flags: void 0,
      payloads: void 0,
      requestId: void 0
    };
    return {
      flags: featureFlagDetails.featureFlags,
      payloads: featureFlagDetails.featureFlagPayloads,
      requestId: featureFlagDetails.requestId
    };
  }
  async getFeatureFlagDetailsStateless(distinctId2, groups = {}, personProperties = {}, groupProperties = {}, disableGeoip, flagKeysToEvaluate) {
    await this._initPromise;
    const extraPayload = {};
    if (disableGeoip ?? this.disableGeoip) extraPayload["geoip_disable"] = true;
    if (flagKeysToEvaluate) extraPayload["flag_keys_to_evaluate"] = flagKeysToEvaluate;
    const result = await this.getFlags(distinctId2, groups, personProperties, groupProperties, extraPayload);
    if (!result.success) return;
    const flagsResponse = result.response;
    if (flagsResponse.errorsWhileComputingFlags) console.error("[FEATURE FLAGS] Error while computing feature flags, some flags may be missing or incorrect. Learn more at https://posthog.com/docs/feature-flags/best-practices");
    if (flagsResponse.quotaLimited?.includes("feature_flags")) {
      console.warn("[FEATURE FLAGS] Feature flags quota limit exceeded - feature flags unavailable. Learn more about billing limits at https://posthog.com/docs/billing/limits-alerts");
      return {
        flags: {},
        featureFlags: {},
        featureFlagPayloads: {},
        requestId: flagsResponse?.requestId,
        quotaLimited: flagsResponse.quotaLimited
      };
    }
    return flagsResponse;
  }
  async getSurveysStateless() {
    await this._initPromise;
    if (true === this.disableSurveys) {
      this._logger.info("Loading surveys is disabled.");
      return [];
    }
    const url = `${this.host}/api/surveys/?token=${this.apiKey}`;
    const fetchOptions = {
      method: "GET",
      headers: {
        ...this.getCustomHeaders(),
        "Content-Type": "application/json"
      }
    };
    const response = await this.fetchWithRetry(url, fetchOptions).then((response2) => {
      if (200 !== response2.status || !response2.json) {
        const msg = `Surveys API could not be loaded: ${response2.status}`;
        const error2 = new Error(msg);
        this._logger.error(error2);
        this._events.emit("error", new Error(msg));
        return;
      }
      return response2.json();
    }).catch((error2) => {
      this._logger.error("Surveys API could not be loaded", error2);
      this._events.emit("error", error2);
    });
    const newSurveys = response?.surveys;
    if (newSurveys) this._logger.info("Surveys fetched from API: ", JSON.stringify(newSurveys));
    return newSurveys ?? [];
  }
  get props() {
    if (!this._props) this._props = this.getPersistedProperty(types_PostHogPersistedProperty.Props);
    return this._props || {};
  }
  set props(val) {
    this._props = val;
  }
  async register(properties) {
    this.wrap(() => {
      this.props = {
        ...this.props,
        ...properties
      };
      this.setPersistedProperty(types_PostHogPersistedProperty.Props, this.props);
    });
  }
  async unregister(property) {
    this.wrap(() => {
      delete this.props[property];
      this.setPersistedProperty(types_PostHogPersistedProperty.Props, this.props);
    });
  }
  processBeforeEnqueue(message) {
    return message;
  }
  async flushStorage() {
  }
  enqueue(type, _message, options) {
    this.wrap(() => {
      if (this.optedOut) return void this._events.emit(type, "Library is disabled. Not sending event. To re-enable, call posthog.optIn()");
      let message = this.prepareMessage(type, _message, options);
      message = this.processBeforeEnqueue(message);
      if (null === message) return;
      const queue = this.getPersistedProperty(types_PostHogPersistedProperty.Queue) || [];
      if (queue.length >= this.maxQueueSize) {
        queue.shift();
        this._logger.info("Queue is full, the oldest event is dropped.");
      }
      queue.push({
        message
      });
      this.setPersistedProperty(types_PostHogPersistedProperty.Queue, queue);
      this._events.emit(type, message);
      if (queue.length >= this.flushAt) this.flushBackground();
      if (this.flushInterval && !this._flushTimer) this._flushTimer = safeSetTimeout(() => this.flushBackground(), this.flushInterval);
    });
  }
  async sendImmediate(type, _message, options) {
    if (this.disabled) return void this._logger.warn("The client is disabled");
    if (!this._isInitialized) await this._initPromise;
    if (this.optedOut) return void this._events.emit(type, "Library is disabled. Not sending event. To re-enable, call posthog.optIn()");
    let message = this.prepareMessage(type, _message, options);
    message = this.processBeforeEnqueue(message);
    if (null === message) return;
    const data = {
      api_key: this.apiKey,
      batch: [
        message
      ],
      sent_at: currentISOTime()
    };
    if (this.historicalMigration) data.historical_migration = true;
    const payload = JSON.stringify(data);
    const url = `${this.host}/batch/`;
    const gzippedPayload = this.disableCompression ? null : await gzipCompress(payload, this.isDebug);
    const fetchOptions = {
      method: "POST",
      headers: {
        ...this.getCustomHeaders(),
        "Content-Type": "application/json",
        ...null !== gzippedPayload && {
          "Content-Encoding": "gzip"
        }
      },
      body: gzippedPayload || payload
    };
    try {
      await this.fetchWithRetry(url, fetchOptions);
    } catch (err) {
      this._events.emit("error", err);
    }
  }
  prepareMessage(type, _message, options) {
    const message = {
      ..._message,
      type,
      library: this.getLibraryId(),
      library_version: this.getLibraryVersion(),
      timestamp: options?.timestamp ? options?.timestamp : currentISOTime(),
      uuid: options?.uuid ? options.uuid : uuidv7()
    };
    const addGeoipDisableProperty = options?.disableGeoip ?? this.disableGeoip;
    if (addGeoipDisableProperty) {
      if (!message.properties) message.properties = {};
      message["properties"]["$geoip_disable"] = true;
    }
    if (message.distinctId) {
      message.distinct_id = message.distinctId;
      delete message.distinctId;
    }
    return message;
  }
  clearFlushTimer() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = void 0;
    }
  }
  flushBackground() {
    this.flush().catch(async (err) => {
      await logFlushError(err);
    });
  }
  async flush() {
    const nextFlushPromise = allSettled([
      this.flushPromise
    ]).then(() => this._flush());
    this.flushPromise = nextFlushPromise;
    this.addPendingPromise(nextFlushPromise);
    allSettled([
      nextFlushPromise
    ]).then(() => {
      if (this.flushPromise === nextFlushPromise) this.flushPromise = null;
    });
    return nextFlushPromise;
  }
  getCustomHeaders() {
    const customUserAgent = this.getCustomUserAgent();
    const headers = {};
    if (customUserAgent && "" !== customUserAgent) headers["User-Agent"] = customUserAgent;
    return headers;
  }
  async _flush() {
    this.clearFlushTimer();
    await this._initPromise;
    let queue = this.getPersistedProperty(types_PostHogPersistedProperty.Queue) || [];
    if (!queue.length) return;
    const sentMessages = [];
    const originalQueueLength = queue.length;
    while (queue.length > 0 && sentMessages.length < originalQueueLength) {
      const batchItems = queue.slice(0, this.maxBatchSize);
      const batchMessages = batchItems.map((item) => item.message);
      const persistQueueChange = async () => {
        const refreshedQueue = this.getPersistedProperty(types_PostHogPersistedProperty.Queue) || [];
        const newQueue = refreshedQueue.slice(batchItems.length);
        this.setPersistedProperty(types_PostHogPersistedProperty.Queue, newQueue);
        queue = newQueue;
        await this.flushStorage();
      };
      const data = {
        api_key: this.apiKey,
        batch: batchMessages,
        sent_at: currentISOTime()
      };
      if (this.historicalMigration) data.historical_migration = true;
      const payload = JSON.stringify(data);
      const url = `${this.host}/batch/`;
      const gzippedPayload = this.disableCompression ? null : await gzipCompress(payload, this.isDebug);
      const fetchOptions = {
        method: "POST",
        headers: {
          ...this.getCustomHeaders(),
          "Content-Type": "application/json",
          ...null !== gzippedPayload && {
            "Content-Encoding": "gzip"
          }
        },
        body: gzippedPayload || payload
      };
      const retryOptions = {
        retryCheck: (err) => {
          if (isPostHogFetchContentTooLargeError(err)) return false;
          return isPostHogFetchError(err);
        }
      };
      try {
        await this.fetchWithRetry(url, fetchOptions, retryOptions);
      } catch (err) {
        if (isPostHogFetchContentTooLargeError(err) && batchMessages.length > 1) {
          this.maxBatchSize = Math.max(1, Math.floor(batchMessages.length / 2));
          this._logger.warn(`Received 413 when sending batch of size ${batchMessages.length}, reducing batch size to ${this.maxBatchSize}`);
          continue;
        }
        if (!(err instanceof PostHogFetchNetworkError)) await persistQueueChange();
        this._events.emit("error", err);
        throw err;
      }
      await persistQueueChange();
      sentMessages.push(...batchMessages);
    }
    this._events.emit("flush", sentMessages);
  }
  async fetchWithRetry(url, options, retryOptions, requestTimeout) {
    AbortSignal.timeout ??= function(ms) {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), ms);
      return ctrl.signal;
    };
    const body = options.body ? options.body : "";
    let reqByteLength = -1;
    try {
      reqByteLength = body instanceof Blob ? body.size : Buffer.byteLength(body, STRING_FORMAT);
    } catch {
      if (body instanceof Blob) reqByteLength = body.size;
      else {
        const encoded = new TextEncoder().encode(body);
        reqByteLength = encoded.length;
      }
    }
    return await retriable(async () => {
      let res = null;
      try {
        res = await this.fetch(url, {
          signal: AbortSignal.timeout(requestTimeout ?? this.requestTimeout),
          ...options
        });
      } catch (e) {
        throw new PostHogFetchNetworkError(e);
      }
      const isNoCors = "no-cors" === options.mode;
      if (!isNoCors && (res.status < 200 || res.status >= 400)) throw new PostHogFetchHttpError(res, reqByteLength);
      return res;
    }, {
      ...this._retryOptions,
      ...retryOptions
    });
  }
  async _shutdown(shutdownTimeoutMs = 3e4) {
    await this._initPromise;
    let hasTimedOut = false;
    this.clearFlushTimer();
    const doShutdown = async () => {
      try {
        await this.promiseQueue.join();
        while (true) {
          const queue = this.getPersistedProperty(types_PostHogPersistedProperty.Queue) || [];
          if (0 === queue.length) break;
          await this.flush();
          if (hasTimedOut) break;
        }
      } catch (e) {
        if (!isPostHogFetchError(e)) throw e;
        await logFlushError(e);
      }
    };
    return Promise.race([
      new Promise((_, reject) => {
        safeSetTimeout(() => {
          this._logger.error("Timed out while shutting down PostHog");
          hasTimedOut = true;
          reject("Timeout while shutting down PostHog. Some events may not have been sent.");
        }, shutdownTimeoutMs);
      }),
      doShutdown()
    ]);
  }
  async shutdown(shutdownTimeoutMs = 3e4) {
    if (this.shutdownPromise) this._logger.warn("shutdown() called while already shutting down. shutdown() is meant to be called once before process exit - use flush() for per-request cleanup");
    else this.shutdownPromise = this._shutdown(shutdownTimeoutMs).finally(() => {
      this.shutdownPromise = null;
    });
    return this.shutdownPromise;
  }
}
let parsedStackResults;
let lastKeysCount;
let cachedFilenameChunkIds;
function getFilenameToChunkIdMap(stackParser) {
  const chunkIdMap = globalThis._posthogChunkIds;
  if (!chunkIdMap) return;
  const chunkIdKeys = Object.keys(chunkIdMap);
  if (cachedFilenameChunkIds && chunkIdKeys.length === lastKeysCount) return cachedFilenameChunkIds;
  lastKeysCount = chunkIdKeys.length;
  cachedFilenameChunkIds = chunkIdKeys.reduce((acc, stackKey) => {
    if (!parsedStackResults) parsedStackResults = {};
    const result = parsedStackResults[stackKey];
    if (result) acc[result[0]] = result[1];
    else {
      const parsedStack = stackParser(stackKey);
      for (let i = parsedStack.length - 1; i >= 0; i--) {
        const stackFrame = parsedStack[i];
        const filename = stackFrame?.filename;
        const chunkId = chunkIdMap[stackKey];
        if (filename && chunkId) {
          acc[filename] = chunkId;
          parsedStackResults[stackKey] = [
            filename,
            chunkId
          ];
          break;
        }
      }
    }
    return acc;
  }, {});
  return cachedFilenameChunkIds;
}
const MAX_CAUSE_RECURSION = 4;
class ErrorPropertiesBuilder {
  constructor(coercers, stackParser, modifiers = []) {
    this.coercers = coercers;
    this.stackParser = stackParser;
    this.modifiers = modifiers;
  }
  buildFromUnknown(input, hint = {}) {
    const providedMechanism = hint && hint.mechanism;
    const mechanism = providedMechanism || {
      handled: true,
      type: "generic"
    };
    const coercingContext = this.buildCoercingContext(mechanism, hint, 0);
    const exceptionWithCause = coercingContext.apply(input);
    const parsingContext = this.buildParsingContext(hint);
    const exceptionWithStack = this.parseStacktrace(exceptionWithCause, parsingContext);
    const exceptionList = this.convertToExceptionList(exceptionWithStack, mechanism);
    return {
      $exception_list: exceptionList,
      $exception_level: "error"
    };
  }
  async modifyFrames(exceptionList) {
    for (const exc of exceptionList) if (exc.stacktrace && exc.stacktrace.frames && isArray(exc.stacktrace.frames)) exc.stacktrace.frames = await this.applyModifiers(exc.stacktrace.frames);
    return exceptionList;
  }
  coerceFallback(ctx) {
    return {
      type: "Error",
      value: "Unknown error",
      stack: ctx.syntheticException?.stack,
      synthetic: true
    };
  }
  parseStacktrace(err, ctx) {
    let cause;
    if (null != err.cause) cause = this.parseStacktrace(err.cause, ctx);
    let stack;
    if ("" != err.stack && null != err.stack) stack = this.applyChunkIds(this.stackParser(err.stack, err.synthetic ? ctx.skipFirstLines : 0), ctx.chunkIdMap);
    return {
      ...err,
      cause,
      stack
    };
  }
  applyChunkIds(frames, chunkIdMap) {
    return frames.map((frame) => {
      if (frame.filename && chunkIdMap) frame.chunk_id = chunkIdMap[frame.filename];
      return frame;
    });
  }
  applyCoercers(input, ctx) {
    for (const adapter of this.coercers) if (adapter.match(input)) return adapter.coerce(input, ctx);
    return this.coerceFallback(ctx);
  }
  async applyModifiers(frames) {
    let newFrames = frames;
    for (const modifier of this.modifiers) newFrames = await modifier(newFrames);
    return newFrames;
  }
  convertToExceptionList(exceptionWithStack, mechanism) {
    const currentException = {
      type: exceptionWithStack.type,
      value: exceptionWithStack.value,
      mechanism: {
        type: mechanism.type ?? "generic",
        handled: mechanism.handled ?? true,
        synthetic: exceptionWithStack.synthetic ?? false
      }
    };
    if (exceptionWithStack.stack) currentException.stacktrace = {
      type: "raw",
      frames: exceptionWithStack.stack
    };
    const exceptionList = [
      currentException
    ];
    if (null != exceptionWithStack.cause) exceptionList.push(...this.convertToExceptionList(exceptionWithStack.cause, {
      ...mechanism,
      handled: true
    }));
    return exceptionList;
  }
  buildParsingContext(hint) {
    const context = {
      chunkIdMap: getFilenameToChunkIdMap(this.stackParser),
      skipFirstLines: hint.skipFirstLines ?? 1
    };
    return context;
  }
  buildCoercingContext(mechanism, hint, depth = 0) {
    const coerce = (input, depth2) => {
      if (!(depth2 <= MAX_CAUSE_RECURSION)) return;
      {
        const ctx = this.buildCoercingContext(mechanism, hint, depth2);
        return this.applyCoercers(input, ctx);
      }
    };
    const context = {
      ...hint,
      syntheticException: 0 == depth ? hint.syntheticException : void 0,
      mechanism,
      apply: (input) => coerce(input, depth),
      next: (input) => coerce(input, depth + 1)
    };
    return context;
  }
}
const UNKNOWN_FUNCTION = "?";
const FILENAME_MATCH = /^\s*[-]{4,}$/;
const FULL_MATCH = /at (?:async )?(?:(.+?)\s+\()?(?:(.+):(\d+):(\d+)?|([^)]+))\)?/;
const nodeStackLineParser = (line, platform) => {
  const lineMatch = line.match(FULL_MATCH);
  if (lineMatch) {
    let object;
    let method;
    let functionName;
    let typeName;
    let methodName;
    if (lineMatch[1]) {
      functionName = lineMatch[1];
      let methodStart = functionName.lastIndexOf(".");
      if ("." === functionName[methodStart - 1]) methodStart--;
      if (methodStart > 0) {
        object = functionName.slice(0, methodStart);
        method = functionName.slice(methodStart + 1);
        const objectEnd = object.indexOf(".Module");
        if (objectEnd > 0) {
          functionName = functionName.slice(objectEnd + 1);
          object = object.slice(0, objectEnd);
        }
      }
      typeName = void 0;
    }
    if (method) {
      typeName = object;
      methodName = method;
    }
    if ("<anonymous>" === method) {
      methodName = void 0;
      functionName = void 0;
    }
    if (void 0 === functionName) {
      methodName = methodName || UNKNOWN_FUNCTION;
      functionName = typeName ? `${typeName}.${methodName}` : methodName;
    }
    let filename = lineMatch[2]?.startsWith("file://") ? lineMatch[2].slice(7) : lineMatch[2];
    const isNative = "native" === lineMatch[5];
    if (filename?.match(/\/[A-Z]:/)) filename = filename.slice(1);
    if (!filename && lineMatch[5] && !isNative) filename = lineMatch[5];
    return {
      filename: filename ? decodeURI(filename) : void 0,
      module: void 0,
      function: functionName,
      lineno: _parseIntOrUndefined(lineMatch[3]),
      colno: _parseIntOrUndefined(lineMatch[4]),
      in_app: filenameIsInApp(filename || "", isNative),
      platform
    };
  }
  if (line.match(FILENAME_MATCH)) return {
    filename: line,
    platform
  };
};
function filenameIsInApp(filename, isNative = false) {
  const isInternal = isNative || filename && !filename.startsWith("/") && !filename.match(/^[A-Z]:/) && !filename.startsWith(".") && !filename.match(/^[a-zA-Z]([a-zA-Z0-9.\-+])*:\/\//);
  return !isInternal && void 0 !== filename && !filename.includes("node_modules/");
}
function _parseIntOrUndefined(input) {
  return parseInt(input || "", 10) || void 0;
}
const WEBPACK_ERROR_REGEXP = /\(error: (.*)\)/;
const STACKTRACE_FRAME_LIMIT = 50;
function reverseAndStripFrames(stack) {
  if (!stack.length) return [];
  const localStack = Array.from(stack);
  localStack.reverse();
  return localStack.slice(0, STACKTRACE_FRAME_LIMIT).map((frame) => ({
    ...frame,
    filename: frame.filename || getLastStackFrame(localStack).filename,
    function: frame.function || UNKNOWN_FUNCTION
  }));
}
function getLastStackFrame(arr) {
  return arr[arr.length - 1] || {};
}
function createStackParser(platform, ...parsers) {
  return (stack, skipFirstLines = 0) => {
    const frames = [];
    const lines = stack.split("\n");
    for (let i = skipFirstLines; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 1024) continue;
      const cleanedLine = WEBPACK_ERROR_REGEXP.test(line) ? line.replace(WEBPACK_ERROR_REGEXP, "$1") : line;
      if (!cleanedLine.match(/\S*Error: /)) {
        for (const parser of parsers) {
          const frame = parser(cleanedLine, platform);
          if (frame) {
            frames.push(frame);
            break;
          }
        }
        if (frames.length >= STACKTRACE_FRAME_LIMIT) break;
      }
    }
    return reverseAndStripFrames(frames);
  };
}
class ErrorCoercer {
  match(err) {
    return isPlainError(err);
  }
  coerce(err, ctx) {
    return {
      type: this.getType(err),
      value: this.getMessage(err, ctx),
      stack: this.getStack(err),
      cause: err.cause ? ctx.next(err.cause) : void 0,
      synthetic: false
    };
  }
  getType(err) {
    return err.name || err.constructor.name;
  }
  getMessage(err, _ctx) {
    const message = err.message;
    if (message.error && "string" == typeof message.error.message) return String(message.error.message);
    return String(message);
  }
  getStack(err) {
    return err.stacktrace || err.stack || void 0;
  }
}
const ERROR_TYPES_PATTERN = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;
class StringCoercer {
  match(input) {
    return "string" == typeof input;
  }
  coerce(input, ctx) {
    const [type, value] = this.getInfos(input);
    return {
      type: type ?? "Error",
      value: value ?? input,
      stack: ctx.syntheticException?.stack,
      synthetic: true
    };
  }
  getInfos(candidate) {
    let type = "Error";
    let value = candidate;
    const groups = candidate.match(ERROR_TYPES_PATTERN);
    if (groups) {
      type = groups[1];
      value = groups[2];
    }
    return [
      type,
      value
    ];
  }
}
const severityLevels = [
  "fatal",
  "error",
  "warning",
  "log",
  "info",
  "debug"
];
function extractExceptionKeysForMessage(err, maxLength = 40) {
  const keys = Object.keys(err);
  keys.sort();
  if (!keys.length) return "[object has no keys]";
  for (let i = keys.length; i > 0; i--) {
    const serialized = keys.slice(0, i).join(", ");
    if (!(serialized.length > maxLength)) {
      if (i === keys.length) return serialized;
      return serialized.length <= maxLength ? serialized : `${serialized.slice(0, maxLength)}...`;
    }
  }
  return "";
}
class ObjectCoercer {
  match(candidate) {
    return "object" == typeof candidate && null !== candidate;
  }
  coerce(candidate, ctx) {
    const errorProperty = this.getErrorPropertyFromObject(candidate);
    if (errorProperty) return ctx.apply(errorProperty);
    return {
      type: this.getType(candidate),
      value: this.getValue(candidate),
      stack: ctx.syntheticException?.stack,
      level: this.isSeverityLevel(candidate.level) ? candidate.level : "error",
      synthetic: true
    };
  }
  getType(err) {
    return isEvent(err) ? err.constructor.name : "Error";
  }
  getValue(err) {
    if ("name" in err && "string" == typeof err.name) {
      let message = `'${err.name}' captured as exception`;
      if ("message" in err && "string" == typeof err.message) message += ` with message: '${err.message}'`;
      return message;
    }
    if ("message" in err && "string" == typeof err.message) return err.message;
    const className = this.getObjectClassName(err);
    const keys = extractExceptionKeysForMessage(err);
    return `${className && "Object" !== className ? `'${className}'` : "Object"} captured as exception with keys: ${keys}`;
  }
  isSeverityLevel(x) {
    return isString(x) && !isEmptyString(x) && severityLevels.indexOf(x) >= 0;
  }
  getErrorPropertyFromObject(obj) {
    for (const prop in obj) if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      const value = obj[prop];
      if (isError(value)) return value;
    }
  }
  getObjectClassName(obj) {
    try {
      const prototype = Object.getPrototypeOf(obj);
      return prototype ? prototype.constructor.name : void 0;
    } catch (e) {
      return;
    }
  }
}
class EventCoercer {
  match(err) {
    return isEvent(err);
  }
  coerce(evt, ctx) {
    const constructorName = evt.constructor.name;
    return {
      type: constructorName,
      value: `${constructorName} captured as exception with keys: ${extractExceptionKeysForMessage(evt)}`,
      stack: ctx.syntheticException?.stack,
      synthetic: true
    };
  }
}
class PrimitiveCoercer {
  match(candidate) {
    return isPrimitive(candidate);
  }
  coerce(value, ctx) {
    return {
      type: "Error",
      value: `Primitive value captured as exception: ${String(value)}`,
      stack: ctx.syntheticException?.stack,
      synthetic: true
    };
  }
}
class ReduceableCache {
  constructor(_maxSize) {
    this._maxSize = _maxSize;
    this._cache = /* @__PURE__ */ new Map();
  }
  get(key) {
    const value = this._cache.get(key);
    if (void 0 === value) return;
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }
  set(key, value) {
    this._cache.set(key, value);
  }
  reduce() {
    while (this._cache.size >= this._maxSize) {
      const value = this._cache.keys().next().value;
      if (value) this._cache.delete(value);
    }
  }
}
const LRU_FILE_CONTENTS_CACHE = new ReduceableCache(25);
const LRU_FILE_CONTENTS_FS_READ_FAILED = new ReduceableCache(20);
const DEFAULT_LINES_OF_CONTEXT = 7;
const MAX_CONTEXTLINES_COLNO = 1e3;
const MAX_CONTEXTLINES_LINENO = 1e4;
async function addSourceContext(frames) {
  const filesToLines = {};
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    const filename = frame?.filename;
    if (!frame || "string" != typeof filename || "number" != typeof frame.lineno || shouldSkipContextLinesForFile(filename) || shouldSkipContextLinesForFrame(frame)) continue;
    const filesToLinesOutput = filesToLines[filename];
    if (!filesToLinesOutput) filesToLines[filename] = [];
    filesToLines[filename].push(frame.lineno);
  }
  const files = Object.keys(filesToLines);
  if (0 == files.length) return frames;
  const readlinePromises = [];
  for (const file of files) {
    if (LRU_FILE_CONTENTS_FS_READ_FAILED.get(file)) continue;
    const filesToLineRanges = filesToLines[file];
    if (!filesToLineRanges) continue;
    filesToLineRanges.sort((a, b) => a - b);
    const ranges = makeLineReaderRanges(filesToLineRanges);
    if (ranges.every((r) => rangeExistsInContentCache(file, r))) continue;
    const cache = emplace(LRU_FILE_CONTENTS_CACHE, file, {});
    readlinePromises.push(getContextLinesFromFile(file, ranges, cache));
  }
  await Promise.all(readlinePromises).catch(() => {
  });
  if (frames && frames.length > 0) addSourceContextToFrames(frames, LRU_FILE_CONTENTS_CACHE);
  LRU_FILE_CONTENTS_CACHE.reduce();
  return frames;
}
function getContextLinesFromFile(path2, ranges, output) {
  return new Promise((resolve) => {
    const stream = node_fs.createReadStream(path2);
    const lineReaded = node_readline.createInterface({
      input: stream
    });
    function destroyStreamAndResolve() {
      stream.destroy();
      resolve();
    }
    let lineNumber = 0;
    let currentRangeIndex = 0;
    const range = ranges[currentRangeIndex];
    if (void 0 === range) return void destroyStreamAndResolve();
    let rangeStart = range[0];
    let rangeEnd = range[1];
    function onStreamError() {
      LRU_FILE_CONTENTS_FS_READ_FAILED.set(path2, 1);
      lineReaded.close();
      lineReaded.removeAllListeners();
      destroyStreamAndResolve();
    }
    stream.on("error", onStreamError);
    lineReaded.on("error", onStreamError);
    lineReaded.on("close", destroyStreamAndResolve);
    lineReaded.on("line", (line) => {
      lineNumber++;
      if (lineNumber < rangeStart) return;
      output[lineNumber] = snipLine(line, 0);
      if (lineNumber >= rangeEnd) {
        if (currentRangeIndex === ranges.length - 1) {
          lineReaded.close();
          lineReaded.removeAllListeners();
          return;
        }
        currentRangeIndex++;
        const range2 = ranges[currentRangeIndex];
        if (void 0 === range2) {
          lineReaded.close();
          lineReaded.removeAllListeners();
          return;
        }
        rangeStart = range2[0];
        rangeEnd = range2[1];
      }
    });
  });
}
function addSourceContextToFrames(frames, cache) {
  for (const frame of frames) if (frame.filename && void 0 === frame.context_line && "number" == typeof frame.lineno) {
    const contents = cache.get(frame.filename);
    if (void 0 === contents) continue;
    addContextToFrame(frame.lineno, frame, contents);
  }
}
function addContextToFrame(lineno, frame, contents) {
  if (void 0 === frame.lineno || void 0 === contents) return;
  frame.pre_context = [];
  for (let i = makeRangeStart(lineno); i < lineno; i++) {
    const line = contents[i];
    if (void 0 === line) return void clearLineContext(frame);
    frame.pre_context.push(line);
  }
  if (void 0 === contents[lineno]) return void clearLineContext(frame);
  frame.context_line = contents[lineno];
  const end = makeRangeEnd(lineno);
  frame.post_context = [];
  for (let i = lineno + 1; i <= end; i++) {
    const line = contents[i];
    if (void 0 === line) break;
    frame.post_context.push(line);
  }
}
function clearLineContext(frame) {
  delete frame.pre_context;
  delete frame.context_line;
  delete frame.post_context;
}
function shouldSkipContextLinesForFile(path2) {
  return path2.startsWith("node:") || path2.endsWith(".min.js") || path2.endsWith(".min.cjs") || path2.endsWith(".min.mjs") || path2.startsWith("data:");
}
function shouldSkipContextLinesForFrame(frame) {
  if (void 0 !== frame.lineno && frame.lineno > MAX_CONTEXTLINES_LINENO) return true;
  if (void 0 !== frame.colno && frame.colno > MAX_CONTEXTLINES_COLNO) return true;
  return false;
}
function rangeExistsInContentCache(file, range) {
  const contents = LRU_FILE_CONTENTS_CACHE.get(file);
  if (void 0 === contents) return false;
  for (let i = range[0]; i <= range[1]; i++) if (void 0 === contents[i]) return false;
  return true;
}
function makeLineReaderRanges(lines) {
  if (!lines.length) return [];
  let i = 0;
  const line = lines[0];
  if ("number" != typeof line) return [];
  let current = makeContextRange(line);
  const out = [];
  while (true) {
    if (i === lines.length - 1) {
      out.push(current);
      break;
    }
    const next = lines[i + 1];
    if ("number" != typeof next) break;
    if (next <= current[1]) current[1] = next + DEFAULT_LINES_OF_CONTEXT;
    else {
      out.push(current);
      current = makeContextRange(next);
    }
    i++;
  }
  return out;
}
function makeContextRange(line) {
  return [
    makeRangeStart(line),
    makeRangeEnd(line)
  ];
}
function makeRangeStart(line) {
  return Math.max(1, line - DEFAULT_LINES_OF_CONTEXT);
}
function makeRangeEnd(line) {
  return line + DEFAULT_LINES_OF_CONTEXT;
}
function emplace(map, key, contents) {
  const value = map.get(key);
  if (void 0 === value) {
    map.set(key, contents);
    return contents;
  }
  return value;
}
function snipLine(line, colno) {
  let newLine = line;
  const lineLength = newLine.length;
  if (lineLength <= 150) return newLine;
  if (colno > lineLength) colno = lineLength;
  let start = Math.max(colno - 60, 0);
  if (start < 5) start = 0;
  let end = Math.min(start + 140, lineLength);
  if (end > lineLength - 5) end = lineLength;
  if (end === lineLength) start = Math.max(end - 140, 0);
  newLine = newLine.slice(start, end);
  if (start > 0) newLine = `...${newLine}`;
  if (end < lineLength) newLine += "...";
  return newLine;
}
function makeUncaughtExceptionHandler(captureFn, onFatalFn) {
  let calledFatalError = false;
  return Object.assign((error2) => {
    const userProvidedListenersCount = global.process.listeners("uncaughtException").filter((listener) => "domainUncaughtExceptionClear" !== listener.name && true !== listener._posthogErrorHandler).length;
    const processWouldExit = 0 === userProvidedListenersCount;
    captureFn(error2, {
      mechanism: {
        type: "onuncaughtexception",
        handled: false
      }
    });
    if (!calledFatalError && processWouldExit) {
      calledFatalError = true;
      onFatalFn(error2);
    }
  }, {
    _posthogErrorHandler: true
  });
}
function addUncaughtExceptionListener(captureFn, onFatalFn) {
  globalThis.process?.on("uncaughtException", makeUncaughtExceptionHandler(captureFn, onFatalFn));
}
function addUnhandledRejectionListener(captureFn) {
  globalThis.process?.on("unhandledRejection", (reason) => captureFn(reason, {
    mechanism: {
      type: "onunhandledrejection",
      handled: false
    }
  }));
}
const SHUTDOWN_TIMEOUT = 2e3;
class ErrorTracking {
  constructor(client, options, _logger) {
    this.client = client;
    this._exceptionAutocaptureEnabled = options.enableExceptionAutocapture || false;
    this._logger = _logger;
    this._rateLimiter = new BucketedRateLimiter({
      refillRate: 1,
      bucketSize: 10,
      refillInterval: 1e4,
      _logger: this._logger
    });
    this.startAutocaptureIfEnabled();
  }
  static isPreviouslyCapturedError(x) {
    return isObject(x) && "__posthog_previously_captured_error" in x && true === x.__posthog_previously_captured_error;
  }
  static async buildEventMessage(error2, hint, distinctId2, additionalProperties) {
    const properties = {
      ...additionalProperties
    };
    if (!distinctId2) properties.$process_person_profile = false;
    const exceptionProperties = this.errorPropertiesBuilder.buildFromUnknown(error2, hint);
    exceptionProperties.$exception_list = await this.errorPropertiesBuilder.modifyFrames(exceptionProperties.$exception_list);
    return {
      event: "$exception",
      distinctId: distinctId2 || uuidv7(),
      properties: {
        ...exceptionProperties,
        ...properties
      },
      _originatedFromCaptureException: true
    };
  }
  startAutocaptureIfEnabled() {
    if (this.isEnabled()) {
      addUncaughtExceptionListener(this.onException.bind(this), this.onFatalError.bind(this));
      addUnhandledRejectionListener(this.onException.bind(this));
    }
  }
  onException(exception, hint) {
    this.client.addPendingPromise((async () => {
      if (!ErrorTracking.isPreviouslyCapturedError(exception)) {
        const eventMessage = await ErrorTracking.buildEventMessage(exception, hint);
        const exceptionProperties = eventMessage.properties;
        const exceptionType = exceptionProperties?.$exception_list[0]?.type ?? "Exception";
        const isRateLimited = this._rateLimiter.consumeRateLimit(exceptionType);
        if (isRateLimited) return void this._logger.info("Skipping exception capture because of client rate limiting.", {
          exception: exceptionType
        });
        return this.client.capture(eventMessage);
      }
    })());
  }
  async onFatalError(exception) {
    console.error(exception);
    await this.client.shutdown(SHUTDOWN_TIMEOUT);
    process.exit(1);
  }
  isEnabled() {
    return !this.client.isDisabled && this._exceptionAutocaptureEnabled;
  }
  shutdown() {
    this._rateLimiter.stop();
  }
}
const version = "5.28.1";
const FeatureFlagError = {
  ERRORS_WHILE_COMPUTING: "errors_while_computing_flags",
  FLAG_MISSING: "flag_missing",
  QUOTA_LIMITED: "quota_limited",
  UNKNOWN_ERROR: "unknown_error"
};
async function hashSHA1(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SubtleCrypto API not available");
  const hashBuffer = await subtle.digest("SHA-1", new TextEncoder().encode(text));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const SIXTY_SECONDS = 6e4;
const LONG_SCALE = 1152921504606847e3;
const NULL_VALUES_ALLOWED_OPERATORS = [
  "is_not"
];
class ClientError extends Error {
  constructor(message) {
    super();
    Error.captureStackTrace(this, this.constructor);
    this.name = "ClientError";
    this.message = message;
    Object.setPrototypeOf(this, ClientError.prototype);
  }
}
class InconclusiveMatchError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, InconclusiveMatchError.prototype);
  }
}
class RequiresServerEvaluation extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, RequiresServerEvaluation.prototype);
  }
}
class FeatureFlagsPoller {
  constructor({ pollingInterval, personalApiKey, projectApiKey, timeout, host, customHeaders, ...options }) {
    this.debugMode = false;
    this.shouldBeginExponentialBackoff = false;
    this.backOffCount = 0;
    this.pollingInterval = pollingInterval;
    this.personalApiKey = personalApiKey;
    this.featureFlags = [];
    this.featureFlagsByKey = {};
    this.groupTypeMapping = {};
    this.cohorts = {};
    this.loadedSuccessfullyOnce = false;
    this.timeout = timeout;
    this.projectApiKey = projectApiKey;
    this.host = host;
    this.poller = void 0;
    this.fetch = options.fetch || fetch;
    this.onError = options.onError;
    this.customHeaders = customHeaders;
    this.onLoad = options.onLoad;
    this.cacheProvider = options.cacheProvider;
    this.strictLocalEvaluation = options.strictLocalEvaluation ?? false;
    this.loadFeatureFlags();
  }
  debug(enabled = true) {
    this.debugMode = enabled;
  }
  logMsgIfDebug(fn) {
    if (this.debugMode) fn();
  }
  createEvaluationContext(distinctId2, groups = {}, personProperties = {}, groupProperties = {}, evaluationCache = {}) {
    return {
      distinctId: distinctId2,
      groups,
      personProperties,
      groupProperties,
      evaluationCache
    };
  }
  async getFeatureFlag(key, distinctId2, groups = {}, personProperties = {}, groupProperties = {}) {
    await this.loadFeatureFlags();
    let response;
    let featureFlag;
    if (!this.loadedSuccessfullyOnce) return response;
    featureFlag = this.featureFlagsByKey[key];
    if (void 0 !== featureFlag) {
      const evaluationContext = this.createEvaluationContext(distinctId2, groups, personProperties, groupProperties);
      try {
        const result = await this.computeFlagAndPayloadLocally(featureFlag, evaluationContext);
        response = result.value;
        this.logMsgIfDebug(() => console.debug(`Successfully computed flag locally: ${key} -> ${response}`));
      } catch (e) {
        if (e instanceof RequiresServerEvaluation || e instanceof InconclusiveMatchError) this.logMsgIfDebug(() => console.debug(`${e.name} when computing flag locally: ${key}: ${e.message}`));
        else if (e instanceof Error) this.onError?.(new Error(`Error computing flag locally: ${key}: ${e}`));
      }
    }
    return response;
  }
  async getAllFlagsAndPayloads(evaluationContext, flagKeysToExplicitlyEvaluate) {
    await this.loadFeatureFlags();
    const response = {};
    const payloads = {};
    let fallbackToFlags = 0 == this.featureFlags.length;
    const flagsToEvaluate = flagKeysToExplicitlyEvaluate ? flagKeysToExplicitlyEvaluate.map((key) => this.featureFlagsByKey[key]).filter(Boolean) : this.featureFlags;
    const sharedEvaluationContext = {
      ...evaluationContext,
      evaluationCache: evaluationContext.evaluationCache ?? {}
    };
    await Promise.all(flagsToEvaluate.map(async (flag) => {
      try {
        const { value: matchValue, payload: matchPayload } = await this.computeFlagAndPayloadLocally(flag, sharedEvaluationContext);
        response[flag.key] = matchValue;
        if (matchPayload) payloads[flag.key] = matchPayload;
      } catch (e) {
        if (e instanceof RequiresServerEvaluation || e instanceof InconclusiveMatchError) this.logMsgIfDebug(() => console.debug(`${e.name} when computing flag locally: ${flag.key}: ${e.message}`));
        else if (e instanceof Error) this.onError?.(new Error(`Error computing flag locally: ${flag.key}: ${e}`));
        fallbackToFlags = true;
      }
    }));
    return {
      response,
      payloads,
      fallbackToFlags
    };
  }
  async computeFlagAndPayloadLocally(flag, evaluationContext, options = {}) {
    const { matchValue, skipLoadCheck = false } = options;
    if (!skipLoadCheck) await this.loadFeatureFlags();
    if (!this.loadedSuccessfullyOnce) return {
      value: false,
      payload: null
    };
    let flagValue;
    flagValue = void 0 !== matchValue ? matchValue : await this.computeFlagValueLocally(flag, evaluationContext);
    const payload = this.getFeatureFlagPayload(flag.key, flagValue);
    return {
      value: flagValue,
      payload
    };
  }
  async computeFlagValueLocally(flag, evaluationContext) {
    const { distinctId: distinctId2, groups, personProperties, groupProperties } = evaluationContext;
    if (flag.ensure_experience_continuity) throw new InconclusiveMatchError("Flag has experience continuity enabled");
    if (!flag.active) return false;
    const flagFilters = flag.filters || {};
    const aggregation_group_type_index = flagFilters.aggregation_group_type_index;
    if (void 0 != aggregation_group_type_index) {
      const groupName = this.groupTypeMapping[String(aggregation_group_type_index)];
      if (!groupName) {
        this.logMsgIfDebug(() => console.warn(`[FEATURE FLAGS] Unknown group type index ${aggregation_group_type_index} for feature flag ${flag.key}`));
        throw new InconclusiveMatchError("Flag has unknown group type index");
      }
      if (!(groupName in groups)) {
        this.logMsgIfDebug(() => console.warn(`[FEATURE FLAGS] Can't compute group feature flag: ${flag.key} without group names passed in`));
        return false;
      }
      if ("device_id" === flag.bucketing_identifier && (personProperties?.$device_id === void 0 || personProperties?.$device_id === null || personProperties?.$device_id === "")) this.logMsgIfDebug(() => console.warn(`[FEATURE FLAGS] Ignoring bucketing_identifier for group flag: ${flag.key}`));
      const focusedGroupProperties = groupProperties[groupName];
      return await this.matchFeatureFlagProperties(flag, groups[groupName], focusedGroupProperties, evaluationContext);
    }
    {
      const bucketingValue = this.getBucketingValueForFlag(flag, distinctId2, personProperties);
      if (void 0 === bucketingValue) {
        this.logMsgIfDebug(() => console.warn(`[FEATURE FLAGS] Can't compute feature flag: ${flag.key} without $device_id, falling back to server evaluation`));
        throw new InconclusiveMatchError(`Can't compute feature flag: ${flag.key} without $device_id`);
      }
      return await this.matchFeatureFlagProperties(flag, bucketingValue, personProperties, evaluationContext);
    }
  }
  getBucketingValueForFlag(flag, distinctId2, properties) {
    if (flag.filters?.aggregation_group_type_index != void 0) return distinctId2;
    if ("device_id" === flag.bucketing_identifier) {
      const deviceId = properties?.$device_id;
      if (null == deviceId || "" === deviceId) return;
      return deviceId;
    }
    return distinctId2;
  }
  getFeatureFlagPayload(key, flagValue) {
    let payload = null;
    if (false !== flagValue && null != flagValue) {
      if ("boolean" == typeof flagValue) payload = this.featureFlagsByKey?.[key]?.filters?.payloads?.[flagValue.toString()] || null;
      else if ("string" == typeof flagValue) payload = this.featureFlagsByKey?.[key]?.filters?.payloads?.[flagValue] || null;
      if (null != payload) {
        if ("object" == typeof payload) return payload;
        if ("string" == typeof payload) try {
          return JSON.parse(payload);
        } catch {
        }
        return payload;
      }
    }
    return null;
  }
  async evaluateFlagDependency(property, properties, evaluationContext) {
    const { evaluationCache } = evaluationContext;
    const targetFlagKey = property.key;
    if (!this.featureFlagsByKey) throw new InconclusiveMatchError("Feature flags not available for dependency evaluation");
    if (!("dependency_chain" in property)) throw new InconclusiveMatchError(`Flag dependency property for '${targetFlagKey}' is missing required 'dependency_chain' field`);
    const dependencyChain = property.dependency_chain;
    if (!Array.isArray(dependencyChain)) throw new InconclusiveMatchError(`Flag dependency property for '${targetFlagKey}' has an invalid 'dependency_chain' (expected array, got ${typeof dependencyChain})`);
    if (0 === dependencyChain.length) throw new InconclusiveMatchError(`Circular dependency detected for flag '${targetFlagKey}' (empty dependency chain)`);
    for (const depFlagKey of dependencyChain) {
      if (!(depFlagKey in evaluationCache)) {
        const depFlag = this.featureFlagsByKey[depFlagKey];
        if (depFlag) if (depFlag.active) try {
          const depResult = await this.computeFlagValueLocally(depFlag, evaluationContext);
          evaluationCache[depFlagKey] = depResult;
        } catch (error2) {
          throw new InconclusiveMatchError(`Error evaluating flag dependency '${depFlagKey}' for flag '${targetFlagKey}': ${error2}`);
        }
        else evaluationCache[depFlagKey] = false;
        else throw new InconclusiveMatchError(`Missing flag dependency '${depFlagKey}' for flag '${targetFlagKey}'`);
      }
      const cachedResult = evaluationCache[depFlagKey];
      if (null == cachedResult) throw new InconclusiveMatchError(`Dependency '${depFlagKey}' could not be evaluated`);
    }
    const targetFlagValue = evaluationCache[targetFlagKey];
    return this.flagEvaluatesToExpectedValue(property.value, targetFlagValue);
  }
  flagEvaluatesToExpectedValue(expectedValue, flagValue) {
    if ("boolean" == typeof expectedValue) return expectedValue === flagValue || "string" == typeof flagValue && "" !== flagValue && true === expectedValue;
    if ("string" == typeof expectedValue) return flagValue === expectedValue;
    return false;
  }
  async matchFeatureFlagProperties(flag, bucketingValue, properties, evaluationContext) {
    const flagFilters = flag.filters || {};
    const flagConditions = flagFilters.groups || [];
    let isInconclusive = false;
    let result;
    for (const condition of flagConditions) try {
      if (await this.isConditionMatch(flag, bucketingValue, condition, properties, evaluationContext)) {
        const variantOverride = condition.variant;
        const flagVariants = flagFilters.multivariate?.variants || [];
        result = variantOverride && flagVariants.some((variant) => variant.key === variantOverride) ? variantOverride : await this.getMatchingVariant(flag, bucketingValue) || true;
        break;
      }
    } catch (e) {
      if (e instanceof RequiresServerEvaluation) throw e;
      if (e instanceof InconclusiveMatchError) isInconclusive = true;
      else throw e;
    }
    if (void 0 !== result) return result;
    if (isInconclusive) throw new InconclusiveMatchError("Can't determine if feature flag is enabled or not with given properties");
    return false;
  }
  async isConditionMatch(flag, bucketingValue, condition, properties, evaluationContext) {
    const rolloutPercentage = condition.rollout_percentage;
    const warnFunction = (msg) => {
      this.logMsgIfDebug(() => console.warn(msg));
    };
    if ((condition.properties || []).length > 0) {
      for (const prop of condition.properties) {
        const propertyType = prop.type;
        let matches = false;
        matches = "cohort" === propertyType ? matchCohort(prop, properties, this.cohorts, this.debugMode) : "flag" === propertyType ? await this.evaluateFlagDependency(prop, properties, evaluationContext) : matchProperty(prop, properties, warnFunction);
        if (!matches) return false;
      }
      if (void 0 == rolloutPercentage) return true;
    }
    if (void 0 != rolloutPercentage && await _hash(flag.key, bucketingValue) > rolloutPercentage / 100) return false;
    return true;
  }
  async getMatchingVariant(flag, bucketingValue) {
    const hashValue = await _hash(flag.key, bucketingValue, "variant");
    const matchingVariant = this.variantLookupTable(flag).find((variant) => hashValue >= variant.valueMin && hashValue < variant.valueMax);
    if (matchingVariant) return matchingVariant.key;
  }
  variantLookupTable(flag) {
    const lookupTable = [];
    let valueMin = 0;
    let valueMax = 0;
    const flagFilters = flag.filters || {};
    const multivariates = flagFilters.multivariate?.variants || [];
    multivariates.forEach((variant) => {
      valueMax = valueMin + variant.rollout_percentage / 100;
      lookupTable.push({
        valueMin,
        valueMax,
        key: variant.key
      });
      valueMin = valueMax;
    });
    return lookupTable;
  }
  updateFlagState(flagData) {
    this.featureFlags = flagData.flags;
    this.featureFlagsByKey = flagData.flags.reduce((acc, curr) => (acc[curr.key] = curr, acc), {});
    this.groupTypeMapping = flagData.groupTypeMapping;
    this.cohorts = flagData.cohorts;
    this.loadedSuccessfullyOnce = true;
  }
  warnAboutExperienceContinuityFlags(flags) {
    if (this.strictLocalEvaluation) return;
    const experienceContinuityFlags = flags.filter((f) => f.ensure_experience_continuity);
    if (experienceContinuityFlags.length > 0) console.warn(`[PostHog] You are using local evaluation but ${experienceContinuityFlags.length} flag(s) have experience continuity enabled: ${experienceContinuityFlags.map((f) => f.key).join(", ")}. Experience continuity is incompatible with local evaluation and will cause a server request on every flag evaluation, negating local evaluation cost savings. To avoid server requests and unexpected costs, either disable experience continuity on these flags in PostHog, use strictLocalEvaluation: true in client init, or pass onlyEvaluateLocally: true per flag call (flags that cannot be evaluated locally will return undefined).`);
  }
  async loadFromCache(debugMessage) {
    if (!this.cacheProvider) return false;
    try {
      const cached = await this.cacheProvider.getFlagDefinitions();
      if (cached) {
        this.updateFlagState(cached);
        this.logMsgIfDebug(() => console.debug(`[FEATURE FLAGS] ${debugMessage} (${cached.flags.length} flags)`));
        this.onLoad?.(this.featureFlags.length);
        this.warnAboutExperienceContinuityFlags(cached.flags);
        return true;
      }
      return false;
    } catch (err) {
      this.onError?.(new Error(`Failed to load from cache: ${err}`));
      return false;
    }
  }
  async loadFeatureFlags(forceReload = false) {
    if (this.loadedSuccessfullyOnce && !forceReload) return;
    if (!forceReload && this.nextFetchAllowedAt && Date.now() < this.nextFetchAllowedAt) return void this.logMsgIfDebug(() => console.debug("[FEATURE FLAGS] Skipping fetch, in backoff period"));
    if (!this.loadingPromise) this.loadingPromise = this._loadFeatureFlags().catch((err) => this.logMsgIfDebug(() => console.debug(`[FEATURE FLAGS] Failed to load feature flags: ${err}`))).finally(() => {
      this.loadingPromise = void 0;
    });
    return this.loadingPromise;
  }
  isLocalEvaluationReady() {
    return (this.loadedSuccessfullyOnce ?? false) && (this.featureFlags?.length ?? 0) > 0;
  }
  getFlagDefinitionsLoadedAt() {
    return this.flagDefinitionsLoadedAt;
  }
  getPollingInterval() {
    if (!this.shouldBeginExponentialBackoff) return this.pollingInterval;
    return Math.min(SIXTY_SECONDS, this.pollingInterval * 2 ** this.backOffCount);
  }
  beginBackoff() {
    this.shouldBeginExponentialBackoff = true;
    this.backOffCount += 1;
    this.nextFetchAllowedAt = Date.now() + this.getPollingInterval();
  }
  clearBackoff() {
    this.shouldBeginExponentialBackoff = false;
    this.backOffCount = 0;
    this.nextFetchAllowedAt = void 0;
  }
  async _loadFeatureFlags() {
    if (this.poller) {
      clearTimeout(this.poller);
      this.poller = void 0;
    }
    this.poller = setTimeout(() => this.loadFeatureFlags(true), this.getPollingInterval());
    try {
      let shouldFetch = true;
      if (this.cacheProvider) try {
        shouldFetch = await this.cacheProvider.shouldFetchFlagDefinitions();
      } catch (err) {
        this.onError?.(new Error(`Error in shouldFetchFlagDefinitions: ${err}`));
      }
      if (!shouldFetch) {
        const loaded = await this.loadFromCache("Loaded flags from cache (skipped fetch)");
        if (loaded) return;
        if (this.loadedSuccessfullyOnce) return;
      }
      const res = await this._requestFeatureFlagDefinitions();
      if (!res) return;
      switch (res.status) {
        case 304:
          this.logMsgIfDebug(() => console.debug("[FEATURE FLAGS] Flags not modified (304), using cached data"));
          this.flagsEtag = res.headers?.get("ETag") ?? this.flagsEtag;
          this.loadedSuccessfullyOnce = true;
          this.clearBackoff();
          return;
        case 401:
          this.beginBackoff();
          throw new ClientError(`Your project key or personal API key is invalid. Setting next polling interval to ${this.getPollingInterval()}ms. More information: https://posthog.com/docs/api#rate-limiting`);
        case 402:
          console.warn("[FEATURE FLAGS] Feature flags quota limit exceeded - unsetting all local flags. Learn more about billing limits at https://posthog.com/docs/billing/limits-alerts");
          this.featureFlags = [];
          this.featureFlagsByKey = {};
          this.groupTypeMapping = {};
          this.cohorts = {};
          return;
        case 403:
          this.beginBackoff();
          throw new ClientError(`Your personal API key does not have permission to fetch feature flag definitions for local evaluation. Setting next polling interval to ${this.getPollingInterval()}ms. Are you sure you're using the correct personal and Project API key pair? More information: https://posthog.com/docs/api/overview`);
        case 429:
          this.beginBackoff();
          throw new ClientError(`You are being rate limited. Setting next polling interval to ${this.getPollingInterval()}ms. More information: https://posthog.com/docs/api#rate-limiting`);
        case 200: {
          const responseJson = await res.json() ?? {};
          if (!("flags" in responseJson)) return void this.onError?.(new Error(`Invalid response when getting feature flags: ${JSON.stringify(responseJson)}`));
          this.flagsEtag = res.headers?.get("ETag") ?? void 0;
          const flagData = {
            flags: responseJson.flags ?? [],
            groupTypeMapping: responseJson.group_type_mapping || {},
            cohorts: responseJson.cohorts || {}
          };
          this.updateFlagState(flagData);
          this.flagDefinitionsLoadedAt = Date.now();
          this.clearBackoff();
          if (this.cacheProvider && shouldFetch) try {
            await this.cacheProvider.onFlagDefinitionsReceived(flagData);
          } catch (err) {
            this.onError?.(new Error(`Failed to store in cache: ${err}`));
          }
          this.onLoad?.(this.featureFlags.length);
          this.warnAboutExperienceContinuityFlags(flagData.flags);
          break;
        }
        default:
          return;
      }
    } catch (err) {
      if (err instanceof ClientError) this.onError?.(err);
    }
  }
  getPersonalApiKeyRequestOptions(method = "GET", etag) {
    const headers = {
      ...this.customHeaders,
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.personalApiKey}`
    };
    if (etag) headers["If-None-Match"] = etag;
    return {
      method,
      headers
    };
  }
  _requestFeatureFlagDefinitions() {
    const url = `${this.host}/api/feature_flag/local_evaluation?token=${this.projectApiKey}&send_cohorts`;
    const options = this.getPersonalApiKeyRequestOptions("GET", this.flagsEtag);
    let abortTimeout = null;
    if (this.timeout && "number" == typeof this.timeout) {
      const controller = new AbortController();
      abortTimeout = safeSetTimeout(() => {
        controller.abort();
      }, this.timeout);
      options.signal = controller.signal;
    }
    try {
      const fetch1 = this.fetch;
      return fetch1(url, options);
    } finally {
      clearTimeout(abortTimeout);
    }
  }
  async stopPoller(timeoutMs = 3e4) {
    clearTimeout(this.poller);
    if (this.cacheProvider) try {
      const shutdownResult = this.cacheProvider.shutdown();
      if (shutdownResult instanceof Promise) await Promise.race([
        shutdownResult,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Cache shutdown timeout after ${timeoutMs}ms`)), timeoutMs))
      ]);
    } catch (err) {
      this.onError?.(new Error(`Error during cache shutdown: ${err}`));
    }
  }
}
async function _hash(key, bucketingValue, salt = "") {
  const hashString = await hashSHA1(`${key}.${bucketingValue}${salt}`);
  return parseInt(hashString.slice(0, 15), 16) / LONG_SCALE;
}
function matchProperty(property, propertyValues, warnFunction) {
  const key = property.key;
  const value = property.value;
  const operator = property.operator || "exact";
  if (key in propertyValues) {
    if ("is_not_set" === operator) throw new InconclusiveMatchError("Operator is_not_set is not supported");
  } else throw new InconclusiveMatchError(`Property ${key} not found in propertyValues`);
  const overrideValue = propertyValues[key];
  if (null == overrideValue && !NULL_VALUES_ALLOWED_OPERATORS.includes(operator)) {
    if (warnFunction) warnFunction(`Property ${key} cannot have a value of null/undefined with the ${operator} operator`);
    return false;
  }
  function computeExactMatch(value2, overrideValue2) {
    if (Array.isArray(value2)) return value2.map((val) => String(val).toLowerCase()).includes(String(overrideValue2).toLowerCase());
    return String(value2).toLowerCase() === String(overrideValue2).toLowerCase();
  }
  function compare(lhs, rhs, operator2) {
    if ("gt" === operator2) return lhs > rhs;
    if ("gte" === operator2) return lhs >= rhs;
    if ("lt" === operator2) return lhs < rhs;
    if ("lte" === operator2) return lhs <= rhs;
    throw new Error(`Invalid operator: ${operator2}`);
  }
  switch (operator) {
    case "exact":
      return computeExactMatch(value, overrideValue);
    case "is_not":
      return !computeExactMatch(value, overrideValue);
    case "is_set":
      return key in propertyValues;
    case "icontains":
      return String(overrideValue).toLowerCase().includes(String(value).toLowerCase());
    case "not_icontains":
      return !String(overrideValue).toLowerCase().includes(String(value).toLowerCase());
    case "regex":
      return isValidRegex(String(value)) && null !== String(overrideValue).match(String(value));
    case "not_regex":
      return isValidRegex(String(value)) && null === String(overrideValue).match(String(value));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      let parsedValue = "number" == typeof value ? value : null;
      if ("string" == typeof value) try {
        parsedValue = parseFloat(value);
      } catch (err) {
      }
      if (null == parsedValue || null == overrideValue) return compare(String(overrideValue), String(value), operator);
      if ("string" == typeof overrideValue) return compare(overrideValue, String(value), operator);
      return compare(overrideValue, parsedValue, operator);
    }
    case "is_date_after":
    case "is_date_before": {
      if ("boolean" == typeof value) throw new InconclusiveMatchError("Date operations cannot be performed on boolean values");
      let parsedDate = relativeDateParseForFeatureFlagMatching(String(value));
      if (null == parsedDate) parsedDate = convertToDateTime(value);
      if (null == parsedDate) throw new InconclusiveMatchError(`Invalid date: ${value}`);
      const overrideDate = convertToDateTime(overrideValue);
      if ([
        "is_date_before"
      ].includes(operator)) return overrideDate < parsedDate;
      return overrideDate > parsedDate;
    }
    case "semver_eq": {
      const cmp = compareSemverTuples(parseSemver(String(overrideValue)), parseSemver(String(value)));
      return 0 === cmp;
    }
    case "semver_neq": {
      const cmp = compareSemverTuples(parseSemver(String(overrideValue)), parseSemver(String(value)));
      return 0 !== cmp;
    }
    case "semver_gt": {
      const cmp = compareSemverTuples(parseSemver(String(overrideValue)), parseSemver(String(value)));
      return cmp > 0;
    }
    case "semver_gte": {
      const cmp = compareSemverTuples(parseSemver(String(overrideValue)), parseSemver(String(value)));
      return cmp >= 0;
    }
    case "semver_lt": {
      const cmp = compareSemverTuples(parseSemver(String(overrideValue)), parseSemver(String(value)));
      return cmp < 0;
    }
    case "semver_lte": {
      const cmp = compareSemverTuples(parseSemver(String(overrideValue)), parseSemver(String(value)));
      return cmp <= 0;
    }
    case "semver_tilde": {
      const overrideParsed = parseSemver(String(overrideValue));
      const { lower, upper } = computeTildeBounds(String(value));
      return compareSemverTuples(overrideParsed, lower) >= 0 && compareSemverTuples(overrideParsed, upper) < 0;
    }
    case "semver_caret": {
      const overrideParsed = parseSemver(String(overrideValue));
      const { lower, upper } = computeCaretBounds(String(value));
      return compareSemverTuples(overrideParsed, lower) >= 0 && compareSemverTuples(overrideParsed, upper) < 0;
    }
    case "semver_wildcard": {
      const overrideParsed = parseSemver(String(overrideValue));
      const { lower, upper } = computeWildcardBounds(String(value));
      return compareSemverTuples(overrideParsed, lower) >= 0 && compareSemverTuples(overrideParsed, upper) < 0;
    }
    default:
      throw new InconclusiveMatchError(`Unknown operator: ${operator}`);
  }
}
function checkCohortExists(cohortId, cohortProperties) {
  if (!(cohortId in cohortProperties)) throw new RequiresServerEvaluation(`cohort ${cohortId} not found in local cohorts - likely a static cohort that requires server evaluation`);
}
function matchCohort(property, propertyValues, cohortProperties, debugMode = false) {
  const cohortId = String(property.value);
  checkCohortExists(cohortId, cohortProperties);
  const propertyGroup = cohortProperties[cohortId];
  return matchPropertyGroup(propertyGroup, propertyValues, cohortProperties, debugMode);
}
function matchPropertyGroup(propertyGroup, propertyValues, cohortProperties, debugMode = false) {
  if (!propertyGroup) return true;
  const propertyGroupType = propertyGroup.type;
  const properties = propertyGroup.values;
  if (!properties || 0 === properties.length) return true;
  let errorMatchingLocally = false;
  if ("values" in properties[0]) {
    for (const prop of properties) try {
      const matches = matchPropertyGroup(prop, propertyValues, cohortProperties, debugMode);
      if ("AND" === propertyGroupType) {
        if (!matches) return false;
      } else if (matches) return true;
    } catch (err) {
      if (err instanceof RequiresServerEvaluation) throw err;
      if (err instanceof InconclusiveMatchError) {
        if (debugMode) console.debug(`Failed to compute property ${prop} locally: ${err}`);
        errorMatchingLocally = true;
      } else throw err;
    }
    if (errorMatchingLocally) throw new InconclusiveMatchError("Can't match cohort without a given cohort property value");
    return "AND" === propertyGroupType;
  }
  for (const prop of properties) try {
    let matches;
    if ("cohort" === prop.type) matches = matchCohort(prop, propertyValues, cohortProperties, debugMode);
    else if ("flag" === prop.type) {
      if (debugMode) console.warn(`[FEATURE FLAGS] Flag dependency filters are not supported in local evaluation. Skipping condition with dependency on flag '${prop.key || "unknown"}'`);
      continue;
    } else matches = matchProperty(prop, propertyValues);
    const negation = prop.negation || false;
    if ("AND" === propertyGroupType) {
      if (!matches && !negation) return false;
      if (matches && negation) return false;
    } else {
      if (matches && !negation) return true;
      if (!matches && negation) return true;
    }
  } catch (err) {
    if (err instanceof RequiresServerEvaluation) throw err;
    if (err instanceof InconclusiveMatchError) {
      if (debugMode) console.debug(`Failed to compute property ${prop} locally: ${err}`);
      errorMatchingLocally = true;
    } else throw err;
  }
  if (errorMatchingLocally) throw new InconclusiveMatchError("can't match cohort without a given cohort property value");
  return "AND" === propertyGroupType;
}
function isValidRegex(regex) {
  try {
    new RegExp(regex);
    return true;
  } catch (err) {
    return false;
  }
}
function parseSemver(value) {
  const text = String(value).trim().replace(/^[vV]/, "");
  const baseVersion = text.split("-")[0].split("+")[0];
  if (!baseVersion || baseVersion.startsWith(".")) throw new InconclusiveMatchError(`Invalid semver: ${value}`);
  const parts = baseVersion.split(".");
  const parsePart = (part) => {
    if (void 0 === part || "" === part) return 0;
    if (!/^\d+$/.test(part)) throw new InconclusiveMatchError(`Invalid semver: ${value}`);
    return parseInt(part, 10);
  };
  const major = parsePart(parts[0]);
  const minor = parsePart(parts[1]);
  const patch = parsePart(parts[2]);
  return [
    major,
    minor,
    patch
  ];
}
function compareSemverTuples(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}
function computeTildeBounds(value) {
  const parsed = parseSemver(value);
  const lower = [
    parsed[0],
    parsed[1],
    parsed[2]
  ];
  const upper = [
    parsed[0],
    parsed[1] + 1,
    0
  ];
  return {
    lower,
    upper
  };
}
function computeCaretBounds(value) {
  const parsed = parseSemver(value);
  const [major, minor, patch] = parsed;
  const lower = [
    major,
    minor,
    patch
  ];
  let upper;
  upper = major > 0 ? [
    major + 1,
    0,
    0
  ] : minor > 0 ? [
    0,
    minor + 1,
    0
  ] : [
    0,
    0,
    patch + 1
  ];
  return {
    lower,
    upper
  };
}
function computeWildcardBounds(value) {
  const text = String(value).trim().replace(/^[vV]/, "");
  const cleanedText = text.replace(/\.\*$/, "").replace(/\*$/, "");
  if (!cleanedText) throw new InconclusiveMatchError(`Invalid wildcard semver: ${value}`);
  const parts = cleanedText.split(".");
  const major = parseInt(parts[0], 10);
  if (isNaN(major)) throw new InconclusiveMatchError(`Invalid wildcard semver: ${value}`);
  let lower;
  let upper;
  if (1 === parts.length) {
    lower = [
      major,
      0,
      0
    ];
    upper = [
      major + 1,
      0,
      0
    ];
  } else {
    const minor = parseInt(parts[1], 10);
    if (isNaN(minor)) throw new InconclusiveMatchError(`Invalid wildcard semver: ${value}`);
    lower = [
      major,
      minor,
      0
    ];
    upper = [
      major,
      minor + 1,
      0
    ];
  }
  return {
    lower,
    upper
  };
}
function convertToDateTime(value) {
  if (value instanceof Date) return value;
  if ("string" == typeof value || "number" == typeof value) {
    const date = new Date(value);
    if (!isNaN(date.valueOf())) return date;
    throw new InconclusiveMatchError(`${value} is in an invalid date format`);
  }
  throw new InconclusiveMatchError(`The date provided ${value} must be a string, number, or date object`);
}
function relativeDateParseForFeatureFlagMatching(value) {
  const regex = /^-?(?<number>[0-9]+)(?<interval>[a-z])$/;
  const match = value.match(regex);
  const parsedDt = new Date((/* @__PURE__ */ new Date()).toISOString());
  if (!match) return null;
  {
    if (!match.groups) return null;
    const number = parseInt(match.groups["number"]);
    if (number >= 1e4) return null;
    const interval = match.groups["interval"];
    if ("h" == interval) parsedDt.setUTCHours(parsedDt.getUTCHours() - number);
    else if ("d" == interval) parsedDt.setUTCDate(parsedDt.getUTCDate() - number);
    else if ("w" == interval) parsedDt.setUTCDate(parsedDt.getUTCDate() - 7 * number);
    else if ("m" == interval) parsedDt.setUTCMonth(parsedDt.getUTCMonth() - number);
    else {
      if ("y" != interval) return null;
      parsedDt.setUTCFullYear(parsedDt.getUTCFullYear() - number);
    }
    return parsedDt;
  }
}
class PostHogMemoryStorage {
  getProperty(key) {
    return this._memoryStorage[key];
  }
  setProperty(key, value) {
    this._memoryStorage[key] = null !== value ? value : void 0;
  }
  constructor() {
    this._memoryStorage = {};
  }
}
const MINIMUM_POLLING_INTERVAL = 100;
const THIRTY_SECONDS = 3e4;
const MAX_CACHE_SIZE = 5e4;
const WAITUNTIL_DEBOUNCE_MS = 50;
const WAITUNTIL_MAX_WAIT_MS = 500;
class PostHogBackendClient extends PostHogCoreStateless {
  constructor(apiKey, options = {}) {
    super(apiKey, options), this._memoryStorage = new PostHogMemoryStorage();
    this.options = options;
    this.context = this.initializeContext();
    this.options.featureFlagsPollingInterval = "number" == typeof options.featureFlagsPollingInterval ? Math.max(options.featureFlagsPollingInterval, MINIMUM_POLLING_INTERVAL) : THIRTY_SECONDS;
    if ("number" == typeof options.waitUntilDebounceMs) this.options.waitUntilDebounceMs = Math.max(options.waitUntilDebounceMs, 0);
    if ("number" == typeof options.waitUntilMaxWaitMs) this.options.waitUntilMaxWaitMs = Math.max(options.waitUntilMaxWaitMs, 0);
    if (options.personalApiKey) {
      if (options.personalApiKey.includes("phc_")) throw new Error('Your Personal API key is invalid. These keys are prefixed with "phx_" and can be created in PostHog project settings.');
      const shouldEnableLocalEvaluation = false !== options.enableLocalEvaluation;
      if (shouldEnableLocalEvaluation) this.featureFlagsPoller = new FeatureFlagsPoller({
        pollingInterval: this.options.featureFlagsPollingInterval,
        personalApiKey: options.personalApiKey,
        projectApiKey: apiKey,
        timeout: options.requestTimeout ?? 1e4,
        host: this.host,
        fetch: options.fetch,
        onError: (err) => {
          this._events.emit("error", err);
        },
        onLoad: (count) => {
          this._events.emit("localEvaluationFlagsLoaded", count);
        },
        customHeaders: this.getCustomHeaders(),
        cacheProvider: options.flagDefinitionCacheProvider,
        strictLocalEvaluation: options.strictLocalEvaluation
      });
    }
    this.errorTracking = new ErrorTracking(this, options, this._logger);
    this.distinctIdHasSentFlagCalls = {};
    this.maxCacheSize = options.maxCacheSize || MAX_CACHE_SIZE;
  }
  enqueue(type, message, options) {
    super.enqueue(type, message, options);
    this.scheduleDebouncedFlush();
  }
  async flush() {
    const flushPromise = super.flush();
    const waitUntil = this.options.waitUntil;
    if (waitUntil && !this._waitUntilCycle) try {
      waitUntil(flushPromise.catch(() => {
      }));
    } catch {
    }
    return flushPromise;
  }
  scheduleDebouncedFlush() {
    const waitUntil = this.options.waitUntil;
    if (!waitUntil) return;
    if (this.disabled || this.optedOut) return;
    if (!this._waitUntilCycle) {
      let resolve;
      const promise = new Promise((r) => {
        resolve = r;
      });
      try {
        waitUntil(promise);
      } catch {
        return;
      }
      this._waitUntilCycle = {
        resolve,
        startedAt: Date.now(),
        timer: void 0
      };
    }
    const elapsed = Date.now() - this._waitUntilCycle.startedAt;
    const maxWaitMs = this.options.waitUntilMaxWaitMs ?? WAITUNTIL_MAX_WAIT_MS;
    const flushNow = elapsed >= maxWaitMs;
    if (void 0 !== this._waitUntilCycle.timer) clearTimeout(this._waitUntilCycle.timer);
    if (flushNow) return void this.resolveWaitUntilFlush();
    const debounceMs = this.options.waitUntilDebounceMs ?? WAITUNTIL_DEBOUNCE_MS;
    this._waitUntilCycle.timer = safeSetTimeout(() => {
      this.resolveWaitUntilFlush();
    }, debounceMs);
  }
  _consumeWaitUntilCycle() {
    const cycle = this._waitUntilCycle;
    if (cycle) {
      clearTimeout(cycle.timer);
      this._waitUntilCycle = void 0;
    }
    return cycle?.resolve;
  }
  async resolveWaitUntilFlush() {
    const resolve = this._consumeWaitUntilCycle();
    try {
      await super.flush();
    } catch {
    } finally {
      resolve?.();
    }
  }
  getPersistedProperty(key) {
    return this._memoryStorage.getProperty(key);
  }
  setPersistedProperty(key, value) {
    return this._memoryStorage.setProperty(key, value);
  }
  fetch(url, options) {
    return this.options.fetch ? this.options.fetch(url, options) : fetch(url, options);
  }
  getLibraryVersion() {
    return version;
  }
  getCustomUserAgent() {
    return `${this.getLibraryId()}/${this.getLibraryVersion()}`;
  }
  enable() {
    return super.optIn();
  }
  disable() {
    return super.optOut();
  }
  debug(enabled = true) {
    super.debug(enabled);
    this.featureFlagsPoller?.debug(enabled);
  }
  capture(props) {
    if ("string" == typeof props) this._logger.warn("Called capture() with a string as the first argument when an object was expected.");
    if ("$exception" === props.event && !props._originatedFromCaptureException) this._logger.warn("Using `posthog.capture('$exception')` is unreliable because it does not attach required metadata. Use `posthog.captureException(error)` instead, which attaches required metadata automatically.");
    this.addPendingPromise(this.prepareEventMessage(props).then(({ distinctId: distinctId2, event, properties, options }) => super.captureStateless(distinctId2, event, properties, {
      timestamp: options.timestamp,
      disableGeoip: options.disableGeoip,
      uuid: options.uuid
    })).catch((err) => {
      if (err) console.error(err);
    }));
  }
  async captureImmediate(props) {
    if ("string" == typeof props) this._logger.warn("Called captureImmediate() with a string as the first argument when an object was expected.");
    if ("$exception" === props.event && !props._originatedFromCaptureException) this._logger.warn("Capturing a `$exception` event via `posthog.captureImmediate('$exception')` is unreliable because it does not attach required metadata. Use `posthog.captureExceptionImmediate(error)` instead, which attaches this metadata by default.");
    return this.addPendingPromise(this.prepareEventMessage(props).then(({ distinctId: distinctId2, event, properties, options }) => super.captureStatelessImmediate(distinctId2, event, properties, {
      timestamp: options.timestamp,
      disableGeoip: options.disableGeoip,
      uuid: options.uuid
    })).catch((err) => {
      if (err) console.error(err);
    }));
  }
  identify({ distinctId: distinctId2, properties = {}, disableGeoip }) {
    const { $set, $set_once, $anon_distinct_id, ...rest } = properties;
    const setProps = $set || rest;
    const setOnceProps = $set_once || {};
    const eventProperties = {
      $set: setProps,
      $set_once: setOnceProps,
      $anon_distinct_id: $anon_distinct_id ?? void 0
    };
    super.identifyStateless(distinctId2, eventProperties, {
      disableGeoip
    });
  }
  async identifyImmediate({ distinctId: distinctId2, properties = {}, disableGeoip }) {
    const { $set, $set_once, $anon_distinct_id, ...rest } = properties;
    const setProps = $set || rest;
    const setOnceProps = $set_once || {};
    const eventProperties = {
      $set: setProps,
      $set_once: setOnceProps,
      $anon_distinct_id: $anon_distinct_id ?? void 0
    };
    super.identifyStatelessImmediate(distinctId2, eventProperties, {
      disableGeoip
    });
  }
  alias(data) {
    super.aliasStateless(data.alias, data.distinctId, void 0, {
      disableGeoip: data.disableGeoip
    });
  }
  async aliasImmediate(data) {
    await super.aliasStatelessImmediate(data.alias, data.distinctId, void 0, {
      disableGeoip: data.disableGeoip
    });
  }
  isLocalEvaluationReady() {
    return this.featureFlagsPoller?.isLocalEvaluationReady() ?? false;
  }
  async waitForLocalEvaluationReady(timeoutMs = THIRTY_SECONDS) {
    if (this.isLocalEvaluationReady()) return true;
    if (void 0 === this.featureFlagsPoller) return false;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      const cleanup = this._events.on("localEvaluationFlagsLoaded", (count) => {
        clearTimeout(timeout);
        cleanup();
        resolve(count > 0);
      });
    });
  }
  _resolveDistinctId(distinctIdOrOptions, options) {
    if ("string" == typeof distinctIdOrOptions) return {
      distinctId: distinctIdOrOptions,
      options
    };
    return {
      distinctId: this.context?.get()?.distinctId,
      options: distinctIdOrOptions
    };
  }
  async _getFeatureFlagResult(key, distinctId2, options = {}, matchValue) {
    const sendFeatureFlagEvents = options.sendFeatureFlagEvents ?? true;
    if (void 0 !== this._flagOverrides && key in this._flagOverrides) {
      const overrideValue = this._flagOverrides[key];
      if (void 0 === overrideValue) return;
      const overridePayload = this._payloadOverrides?.[key];
      return {
        key,
        enabled: false !== overrideValue,
        variant: "string" == typeof overrideValue ? overrideValue : void 0,
        payload: overridePayload
      };
    }
    const { groups, disableGeoip } = options;
    let { onlyEvaluateLocally, personProperties, groupProperties } = options;
    const adjustedProperties = this.addLocalPersonAndGroupProperties(distinctId2, groups, personProperties, groupProperties);
    personProperties = adjustedProperties.allPersonProperties;
    groupProperties = adjustedProperties.allGroupProperties;
    const evaluationContext = this.createFeatureFlagEvaluationContext(distinctId2, groups, personProperties, groupProperties);
    if (void 0 == onlyEvaluateLocally) onlyEvaluateLocally = this.options.strictLocalEvaluation ?? false;
    let result;
    let flagWasLocallyEvaluated = false;
    let requestId;
    let evaluatedAt;
    let featureFlagError;
    let flagId;
    let flagVersion;
    let flagReason;
    const localEvaluationEnabled = void 0 !== this.featureFlagsPoller;
    if (localEvaluationEnabled) {
      await this.featureFlagsPoller?.loadFeatureFlags();
      const flag = this.featureFlagsPoller?.featureFlagsByKey[key];
      if (flag) try {
        const localResult = await this.featureFlagsPoller?.computeFlagAndPayloadLocally(flag, evaluationContext, {
          matchValue
        });
        if (localResult) {
          flagWasLocallyEvaluated = true;
          const value = localResult.value;
          flagId = flag.id;
          flagReason = "Evaluated locally";
          result = {
            key,
            enabled: false !== value,
            variant: "string" == typeof value ? value : void 0,
            payload: localResult.payload ?? void 0
          };
        }
      } catch (e) {
        if (e instanceof RequiresServerEvaluation || e instanceof InconclusiveMatchError) this._logger?.info(`${e.name} when computing flag locally: ${key}: ${e.message}`);
        else throw e;
      }
    }
    if (!flagWasLocallyEvaluated && !onlyEvaluateLocally) {
      const flagsResponse = await super.getFeatureFlagDetailsStateless(evaluationContext.distinctId, evaluationContext.groups, evaluationContext.personProperties, evaluationContext.groupProperties, disableGeoip, [
        key
      ]);
      if (void 0 === flagsResponse) featureFlagError = FeatureFlagError.UNKNOWN_ERROR;
      else {
        requestId = flagsResponse.requestId;
        evaluatedAt = flagsResponse.evaluatedAt;
        const errors = [];
        if (flagsResponse.errorsWhileComputingFlags) errors.push(FeatureFlagError.ERRORS_WHILE_COMPUTING);
        if (flagsResponse.quotaLimited?.includes("feature_flags")) errors.push(FeatureFlagError.QUOTA_LIMITED);
        const flagDetail = flagsResponse.flags[key];
        if (void 0 === flagDetail) errors.push(FeatureFlagError.FLAG_MISSING);
        else {
          flagId = flagDetail.metadata?.id;
          flagVersion = flagDetail.metadata?.version;
          flagReason = flagDetail.reason?.description ?? flagDetail.reason?.code;
          let parsedPayload;
          if (flagDetail.metadata?.payload !== void 0) try {
            parsedPayload = JSON.parse(flagDetail.metadata.payload);
          } catch {
            parsedPayload = flagDetail.metadata.payload;
          }
          result = {
            key,
            enabled: flagDetail.enabled,
            variant: flagDetail.variant,
            payload: parsedPayload
          };
        }
        if (errors.length > 0) featureFlagError = errors.join(",");
      }
    }
    if (sendFeatureFlagEvents) {
      const response = void 0 === result ? void 0 : false === result.enabled ? false : result.variant ?? true;
      const featureFlagReportedKey = `${key}_${response}`;
      if (!(distinctId2 in this.distinctIdHasSentFlagCalls) || !this.distinctIdHasSentFlagCalls[distinctId2].includes(featureFlagReportedKey)) {
        if (Object.keys(this.distinctIdHasSentFlagCalls).length >= this.maxCacheSize) this.distinctIdHasSentFlagCalls = {};
        if (Array.isArray(this.distinctIdHasSentFlagCalls[distinctId2])) this.distinctIdHasSentFlagCalls[distinctId2].push(featureFlagReportedKey);
        else this.distinctIdHasSentFlagCalls[distinctId2] = [
          featureFlagReportedKey
        ];
        const properties = {
          $feature_flag: key,
          $feature_flag_response: response,
          $feature_flag_id: flagId,
          $feature_flag_version: flagVersion,
          $feature_flag_reason: flagReason,
          locally_evaluated: flagWasLocallyEvaluated,
          [`$feature/${key}`]: response,
          $feature_flag_request_id: requestId,
          $feature_flag_evaluated_at: flagWasLocallyEvaluated ? Date.now() : evaluatedAt
        };
        if (flagWasLocallyEvaluated && this.featureFlagsPoller) {
          const flagDefinitionsLoadedAt = this.featureFlagsPoller.getFlagDefinitionsLoadedAt();
          if (void 0 !== flagDefinitionsLoadedAt) properties.$feature_flag_definitions_loaded_at = flagDefinitionsLoadedAt;
        }
        if (featureFlagError) properties.$feature_flag_error = featureFlagError;
        this.capture({
          distinctId: distinctId2,
          event: "$feature_flag_called",
          properties,
          groups,
          disableGeoip
        });
      }
    }
    if (void 0 !== result && void 0 !== this._payloadOverrides && key in this._payloadOverrides) result = {
      ...result,
      payload: this._payloadOverrides[key]
    };
    return result;
  }
  async getFeatureFlag(key, distinctId2, options) {
    const result = await this._getFeatureFlagResult(key, distinctId2, {
      ...options,
      sendFeatureFlagEvents: options?.sendFeatureFlagEvents ?? this.options.sendFeatureFlagEvent ?? true
    });
    if (void 0 === result) return;
    if (false === result.enabled) return false;
    return result.variant ?? true;
  }
  async getFeatureFlagPayload(key, distinctId2, matchValue, options) {
    if (void 0 !== this._payloadOverrides && key in this._payloadOverrides) return this._payloadOverrides[key];
    const result = await this._getFeatureFlagResult(key, distinctId2, {
      ...options,
      sendFeatureFlagEvents: false
    }, matchValue);
    if (void 0 === result) return;
    return result.payload ?? null;
  }
  async getFeatureFlagResult(key, distinctIdOrOptions, options) {
    const { distinctId: resolvedDistinctId, options: resolvedOptions } = this._resolveDistinctId(distinctIdOrOptions, options);
    if (!resolvedDistinctId) return void this._logger.warn("[PostHog] distinctId is required — pass it explicitly or use withContext()");
    return this._getFeatureFlagResult(key, resolvedDistinctId, {
      ...resolvedOptions,
      sendFeatureFlagEvents: resolvedOptions?.sendFeatureFlagEvents ?? this.options.sendFeatureFlagEvent ?? true
    });
  }
  async getRemoteConfigPayload(flagKey) {
    if (!this.options.personalApiKey) throw new Error("Personal API key is required for remote config payload decryption");
    const response = await this._requestRemoteConfigPayload(flagKey);
    if (!response) return;
    const parsed = await response.json();
    if ("string" == typeof parsed) try {
      return JSON.parse(parsed);
    } catch (e) {
    }
    return parsed;
  }
  async isFeatureEnabled(key, distinctId2, options) {
    const feat = await this.getFeatureFlag(key, distinctId2, options);
    if (void 0 === feat) return;
    return !!feat || false;
  }
  async getAllFlags(distinctIdOrOptions, options) {
    const { distinctId: resolvedDistinctId, options: resolvedOptions } = this._resolveDistinctId(distinctIdOrOptions, options);
    if (!resolvedDistinctId) {
      this._logger.warn("[PostHog] distinctId is required to get feature flags — pass it explicitly or use withContext()");
      return {};
    }
    const response = await this.getAllFlagsAndPayloads(resolvedDistinctId, resolvedOptions);
    return response.featureFlags || {};
  }
  async getAllFlagsAndPayloads(distinctIdOrOptions, options) {
    const { distinctId: resolvedDistinctId, options: resolvedOptions } = this._resolveDistinctId(distinctIdOrOptions, options);
    if (!resolvedDistinctId) {
      this._logger.warn("[PostHog] distinctId is required to get feature flags and payloads — pass it explicitly or use withContext()");
      return {
        featureFlags: {},
        featureFlagPayloads: {}
      };
    }
    const { groups, disableGeoip, flagKeys } = resolvedOptions || {};
    let { onlyEvaluateLocally, personProperties, groupProperties } = resolvedOptions || {};
    const adjustedProperties = this.addLocalPersonAndGroupProperties(resolvedDistinctId, groups, personProperties, groupProperties);
    personProperties = adjustedProperties.allPersonProperties;
    groupProperties = adjustedProperties.allGroupProperties;
    const evaluationContext = this.createFeatureFlagEvaluationContext(resolvedDistinctId, groups, personProperties, groupProperties);
    if (void 0 == onlyEvaluateLocally) onlyEvaluateLocally = this.options.strictLocalEvaluation ?? false;
    const localEvaluationResult = await this.featureFlagsPoller?.getAllFlagsAndPayloads(evaluationContext, flagKeys);
    let featureFlags = {};
    let featureFlagPayloads = {};
    let fallbackToFlags = true;
    if (localEvaluationResult) {
      featureFlags = localEvaluationResult.response;
      featureFlagPayloads = localEvaluationResult.payloads;
      fallbackToFlags = localEvaluationResult.fallbackToFlags;
    }
    if (fallbackToFlags && !onlyEvaluateLocally) {
      const remoteEvaluationResult = await super.getFeatureFlagsAndPayloadsStateless(evaluationContext.distinctId, evaluationContext.groups, evaluationContext.personProperties, evaluationContext.groupProperties, disableGeoip, flagKeys);
      featureFlags = {
        ...featureFlags,
        ...remoteEvaluationResult.flags || {}
      };
      featureFlagPayloads = {
        ...featureFlagPayloads,
        ...remoteEvaluationResult.payloads || {}
      };
    }
    if (void 0 !== this._flagOverrides) featureFlags = {
      ...featureFlags,
      ...this._flagOverrides
    };
    if (void 0 !== this._payloadOverrides) featureFlagPayloads = {
      ...featureFlagPayloads,
      ...this._payloadOverrides
    };
    return {
      featureFlags,
      featureFlagPayloads
    };
  }
  groupIdentify({ groupType, groupKey, properties, distinctId: distinctId2, disableGeoip }) {
    super.groupIdentifyStateless(groupType, groupKey, properties, {
      disableGeoip
    }, distinctId2);
  }
  async reloadFeatureFlags() {
    await this.featureFlagsPoller?.loadFeatureFlags(true);
  }
  overrideFeatureFlags(overrides) {
    const flagArrayToRecord = (flags) => Object.fromEntries(flags.map((f) => [
      f,
      true
    ]));
    if (false === overrides) {
      this._flagOverrides = void 0;
      this._payloadOverrides = void 0;
      return;
    }
    if (Array.isArray(overrides)) {
      this._flagOverrides = flagArrayToRecord(overrides);
      return;
    }
    if (this._isFeatureFlagOverrideOptions(overrides)) {
      if ("flags" in overrides) {
        if (false === overrides.flags) this._flagOverrides = void 0;
        else if (Array.isArray(overrides.flags)) this._flagOverrides = flagArrayToRecord(overrides.flags);
        else if (void 0 !== overrides.flags) this._flagOverrides = {
          ...overrides.flags
        };
      }
      if ("payloads" in overrides) {
        if (false === overrides.payloads) this._payloadOverrides = void 0;
        else if (void 0 !== overrides.payloads) this._payloadOverrides = {
          ...overrides.payloads
        };
      }
      return;
    }
    this._flagOverrides = {
      ...overrides
    };
  }
  _isFeatureFlagOverrideOptions(overrides) {
    if ("object" != typeof overrides || null === overrides || Array.isArray(overrides)) return false;
    const obj = overrides;
    if ("flags" in obj) {
      const flagsValue = obj["flags"];
      if (false === flagsValue || Array.isArray(flagsValue) || "object" == typeof flagsValue && null !== flagsValue) return true;
    }
    if ("payloads" in obj) {
      const payloadsValue = obj["payloads"];
      if (false === payloadsValue || "object" == typeof payloadsValue && null !== payloadsValue) return true;
    }
    return false;
  }
  withContext(data, fn, options) {
    if (!this.context) return fn();
    return this.context.run(data, fn, options);
  }
  getContext() {
    return this.context?.get();
  }
  enterContext(data, options) {
    this.context?.enter(data, options);
  }
  async _shutdown(shutdownTimeoutMs) {
    const resolve = this._consumeWaitUntilCycle();
    this.featureFlagsPoller?.stopPoller(shutdownTimeoutMs);
    this.errorTracking.shutdown();
    try {
      return await super._shutdown(shutdownTimeoutMs);
    } finally {
      resolve?.();
    }
  }
  async _requestRemoteConfigPayload(flagKey) {
    if (!this.options.personalApiKey) return;
    const url = `${this.host}/api/projects/@current/feature_flags/${flagKey}/remote_config?token=${encodeURIComponent(this.apiKey)}`;
    const options = {
      method: "GET",
      headers: {
        ...this.getCustomHeaders(),
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.personalApiKey}`
      }
    };
    let abortTimeout = null;
    if (this.options.requestTimeout && "number" == typeof this.options.requestTimeout) {
      const controller = new AbortController();
      abortTimeout = safeSetTimeout(() => {
        controller.abort();
      }, this.options.requestTimeout);
      options.signal = controller.signal;
    }
    try {
      return await this.fetch(url, options);
    } catch (error2) {
      this._events.emit("error", error2);
      return;
    } finally {
      if (abortTimeout) clearTimeout(abortTimeout);
    }
  }
  extractPropertiesFromEvent(eventProperties, groups) {
    if (!eventProperties) return {
      personProperties: {},
      groupProperties: {}
    };
    const personProperties = {};
    const groupProperties = {};
    for (const [key, value] of Object.entries(eventProperties)) if (isPlainObject(value) && groups && key in groups) {
      const groupProps = {};
      for (const [groupKey, groupValue] of Object.entries(value)) groupProps[String(groupKey)] = String(groupValue);
      groupProperties[String(key)] = groupProps;
    } else personProperties[String(key)] = String(value);
    return {
      personProperties,
      groupProperties
    };
  }
  async getFeatureFlagsForEvent(distinctId2, groups, disableGeoip, sendFeatureFlagsOptions) {
    const finalPersonProperties = sendFeatureFlagsOptions?.personProperties || {};
    const finalGroupProperties = sendFeatureFlagsOptions?.groupProperties || {};
    const flagKeys = sendFeatureFlagsOptions?.flagKeys;
    const onlyEvaluateLocally = sendFeatureFlagsOptions?.onlyEvaluateLocally ?? this.options.strictLocalEvaluation ?? false;
    if (onlyEvaluateLocally) if (!((this.featureFlagsPoller?.featureFlags?.length || 0) > 0)) return {};
    else {
      const groupsWithStringValues = {};
      for (const [key, value] of Object.entries(groups || {})) groupsWithStringValues[key] = String(value);
      return await this.getAllFlags(distinctId2, {
        groups: groupsWithStringValues,
        personProperties: finalPersonProperties,
        groupProperties: finalGroupProperties,
        disableGeoip,
        onlyEvaluateLocally: true,
        flagKeys
      });
    }
    if ((this.featureFlagsPoller?.featureFlags?.length || 0) > 0) {
      const groupsWithStringValues = {};
      for (const [key, value] of Object.entries(groups || {})) groupsWithStringValues[key] = String(value);
      return await this.getAllFlags(distinctId2, {
        groups: groupsWithStringValues,
        personProperties: finalPersonProperties,
        groupProperties: finalGroupProperties,
        disableGeoip,
        onlyEvaluateLocally: true,
        flagKeys
      });
    }
    return (await super.getFeatureFlagsStateless(distinctId2, groups, finalPersonProperties, finalGroupProperties, disableGeoip)).flags;
  }
  addLocalPersonAndGroupProperties(distinctId2, groups, personProperties, groupProperties) {
    const allPersonProperties = {
      distinct_id: distinctId2,
      ...personProperties || {}
    };
    const allGroupProperties = {};
    if (groups) for (const groupName of Object.keys(groups)) allGroupProperties[groupName] = {
      $group_key: groups[groupName],
      ...groupProperties?.[groupName] || {}
    };
    return {
      allPersonProperties,
      allGroupProperties
    };
  }
  createFeatureFlagEvaluationContext(distinctId2, groups, personProperties, groupProperties) {
    return {
      distinctId: distinctId2,
      groups: groups || {},
      personProperties: personProperties || {},
      groupProperties: groupProperties || {},
      evaluationCache: {}
    };
  }
  captureException(error2, distinctId2, additionalProperties, uuid) {
    if (!ErrorTracking.isPreviouslyCapturedError(error2)) {
      const syntheticException = new Error("PostHog syntheticException");
      this.addPendingPromise(ErrorTracking.buildEventMessage(error2, {
        syntheticException
      }, distinctId2, additionalProperties).then((msg) => this.capture({
        ...msg,
        uuid
      })));
    }
  }
  async captureExceptionImmediate(error2, distinctId2, additionalProperties) {
    if (!ErrorTracking.isPreviouslyCapturedError(error2)) {
      const syntheticException = new Error("PostHog syntheticException");
      this.addPendingPromise(ErrorTracking.buildEventMessage(error2, {
        syntheticException
      }, distinctId2, additionalProperties).then((msg) => this.captureImmediate(msg)));
    }
  }
  async prepareEventMessage(props) {
    const { distinctId: distinctId2, event, properties, groups, sendFeatureFlags, timestamp, disableGeoip, uuid } = props;
    const contextData = this.context?.get();
    let mergedDistinctId = distinctId2 || contextData?.distinctId;
    const mergedProperties = {
      ...this.props,
      ...contextData?.properties || {},
      ...properties || {}
    };
    if (!mergedDistinctId) {
      mergedDistinctId = uuidv7();
      mergedProperties.$process_person_profile = false;
    }
    if (contextData?.sessionId && !mergedProperties.$session_id) mergedProperties.$session_id = contextData.sessionId;
    const eventMessage = this._runBeforeSend({
      distinctId: mergedDistinctId,
      event,
      properties: mergedProperties,
      groups,
      sendFeatureFlags,
      timestamp,
      disableGeoip,
      uuid
    });
    if (!eventMessage) return Promise.reject(null);
    const eventProperties = await Promise.resolve().then(async () => {
      if (sendFeatureFlags) {
        const sendFeatureFlagsOptions = "object" == typeof sendFeatureFlags ? sendFeatureFlags : void 0;
        return await this.getFeatureFlagsForEvent(eventMessage.distinctId, groups, disableGeoip, sendFeatureFlagsOptions);
      }
      eventMessage.event;
      return {};
    }).then((flags) => {
      const additionalProperties = {};
      if (flags) for (const [feature, variant] of Object.entries(flags)) additionalProperties[`$feature/${feature}`] = variant;
      const activeFlags = Object.keys(flags || {}).filter((flag) => flags?.[flag] !== false).sort();
      if (activeFlags.length > 0) additionalProperties["$active_feature_flags"] = activeFlags;
      return additionalProperties;
    }).catch(() => ({})).then((additionalProperties) => {
      const props2 = {
        ...additionalProperties,
        ...eventMessage.properties || {},
        $groups: eventMessage.groups || groups
      };
      return props2;
    });
    if ("$pageview" === eventMessage.event && this.options.__preview_capture_bot_pageviews && "string" == typeof eventProperties.$raw_user_agent) {
      if (isBlockedUA(eventProperties.$raw_user_agent, this.options.custom_blocked_useragents || [])) {
        eventMessage.event = "$bot_pageview";
        eventProperties.$browser_type = "bot";
      }
    }
    return {
      distinctId: eventMessage.distinctId,
      event: eventMessage.event,
      properties: eventProperties,
      options: {
        timestamp: eventMessage.timestamp,
        disableGeoip: eventMessage.disableGeoip,
        uuid: eventMessage.uuid
      }
    };
  }
  _runBeforeSend(eventMessage) {
    const beforeSend = this.options.before_send;
    if (!beforeSend) return eventMessage;
    const fns = Array.isArray(beforeSend) ? beforeSend : [
      beforeSend
    ];
    let result = eventMessage;
    for (const fn of fns) {
      result = fn(result);
      if (!result) {
        this._logger.info(`Event '${eventMessage.event}' was rejected in beforeSend function`);
        return null;
      }
      if (!result.properties || 0 === Object.keys(result.properties).length) {
        const message = `Event '${result.event}' has no properties after beforeSend function, this is likely an error.`;
        this._logger.warn(message);
      }
    }
    return result;
  }
}
class PostHogContext {
  constructor() {
    this.storage = new node_async_hooks.AsyncLocalStorage();
  }
  get() {
    return this.storage.getStore();
  }
  run(context, fn, options) {
    return this.storage.run(this.resolve(context, options), fn);
  }
  enter(context, options) {
    this.storage.enterWith(this.resolve(context, options));
  }
  resolve(context, options) {
    if (options?.fresh === true) return context;
    const current = this.get() || {};
    return {
      distinctId: context.distinctId ?? current.distinctId,
      sessionId: context.sessionId ?? current.sessionId,
      properties: {
        ...current.properties || {},
        ...context.properties || {}
      }
    };
  }
}
ErrorTracking.errorPropertiesBuilder = new ErrorPropertiesBuilder([
  new EventCoercer(),
  new ErrorCoercer(),
  new ObjectCoercer(),
  new StringCoercer(),
  new PrimitiveCoercer()
], createStackParser("node:javascript", nodeStackLineParser), [
  createModulerModifier(),
  addSourceContext
]);
class PostHog extends PostHogBackendClient {
  getLibraryId() {
    return "posthog-node";
  }
  initializeContext() {
    return new PostHogContext();
  }
}
var dist$1 = { exports: {} };
var dist = dist$1.exports;
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist$1.exports;
  hasRequiredDist = 1;
  (function(module2, exports$1) {
    !(function(t, n) {
      module2.exports = n(require$$0, crypto$1);
    })(dist, function(t, n) {
      return (function(t2) {
        function n2(e) {
          if (r[e]) return r[e].exports;
          var o = r[e] = { exports: {}, id: e, loaded: false };
          return t2[e].call(o.exports, o, o.exports, n2), o.loaded = true, o.exports;
        }
        var r = {};
        return n2.m = t2, n2.c = r, n2.p = "", n2(0);
      })([function(t2, n2, r) {
        t2.exports = r(34);
      }, function(t2, n2, r) {
        var e = r(29)("wks"), o = r(33), i = r(2).Symbol, c = "function" == typeof i, u = t2.exports = function(t3) {
          return e[t3] || (e[t3] = c && i[t3] || (c ? i : o)("Symbol." + t3));
        };
        u.store = e;
      }, function(t2, n2) {
        var r = t2.exports = "undefined" != typeof window && window.Math == Math ? window : "undefined" != typeof self && self.Math == Math ? self : Function("return this")();
        "number" == typeof __g && (__g = r);
      }, function(t2, n2, r) {
        var e = r(9);
        t2.exports = function(t3) {
          if (!e(t3)) throw TypeError(t3 + " is not an object!");
          return t3;
        };
      }, function(t2, n2, r) {
        t2.exports = !r(24)(function() {
          return 7 != Object.defineProperty({}, "a", { get: function() {
            return 7;
          } }).a;
        });
      }, function(t2, n2, r) {
        var e = r(12), o = r(17);
        t2.exports = r(4) ? function(t3, n3, r2) {
          return e.f(t3, n3, o(1, r2));
        } : function(t3, n3, r2) {
          return t3[n3] = r2, t3;
        };
      }, function(t2, n2) {
        var r = t2.exports = { version: "2.4.0" };
        "number" == typeof __e && (__e = r);
      }, function(t2, n2, r) {
        var e = r(14);
        t2.exports = function(t3, n3, r2) {
          if (e(t3), void 0 === n3) return t3;
          switch (r2) {
            case 1:
              return function(r3) {
                return t3.call(n3, r3);
              };
            case 2:
              return function(r3, e2) {
                return t3.call(n3, r3, e2);
              };
            case 3:
              return function(r3, e2, o) {
                return t3.call(n3, r3, e2, o);
              };
          }
          return function() {
            return t3.apply(n3, arguments);
          };
        };
      }, function(t2, n2) {
        var r = {}.hasOwnProperty;
        t2.exports = function(t3, n3) {
          return r.call(t3, n3);
        };
      }, function(t2, n2) {
        t2.exports = function(t3) {
          return "object" == typeof t3 ? null !== t3 : "function" == typeof t3;
        };
      }, function(t2, n2) {
        t2.exports = {};
      }, function(t2, n2) {
        var r = {}.toString;
        t2.exports = function(t3) {
          return r.call(t3).slice(8, -1);
        };
      }, function(t2, n2, r) {
        var e = r(3), o = r(26), i = r(32), c = Object.defineProperty;
        n2.f = r(4) ? Object.defineProperty : function(t3, n3, r2) {
          if (e(t3), n3 = i(n3, true), e(r2), o) try {
            return c(t3, n3, r2);
          } catch (t4) {
          }
          if ("get" in r2 || "set" in r2) throw TypeError("Accessors not supported!");
          return "value" in r2 && (t3[n3] = r2.value), t3;
        };
      }, function(t2, n2, r) {
        var e = r(42), o = r(15);
        t2.exports = function(t3) {
          return e(o(t3));
        };
      }, function(t2, n2) {
        t2.exports = function(t3) {
          if ("function" != typeof t3) throw TypeError(t3 + " is not a function!");
          return t3;
        };
      }, function(t2, n2) {
        t2.exports = function(t3) {
          if (void 0 == t3) throw TypeError("Can't call method on  " + t3);
          return t3;
        };
      }, function(t2, n2, r) {
        var e = r(9), o = r(2).document, i = e(o) && e(o.createElement);
        t2.exports = function(t3) {
          return i ? o.createElement(t3) : {};
        };
      }, function(t2, n2) {
        t2.exports = function(t3, n3) {
          return { enumerable: !(1 & t3), configurable: !(2 & t3), writable: !(4 & t3), value: n3 };
        };
      }, function(t2, n2, r) {
        var e = r(12).f, o = r(8), i = r(1)("toStringTag");
        t2.exports = function(t3, n3, r2) {
          t3 && !o(t3 = r2 ? t3 : t3.prototype, i) && e(t3, i, { configurable: true, value: n3 });
        };
      }, function(t2, n2, r) {
        var e = r(29)("keys"), o = r(33);
        t2.exports = function(t3) {
          return e[t3] || (e[t3] = o(t3));
        };
      }, function(t2, n2) {
        var r = Math.ceil, e = Math.floor;
        t2.exports = function(t3) {
          return isNaN(t3 = +t3) ? 0 : (t3 > 0 ? e : r)(t3);
        };
      }, function(t2, n2, r) {
        var e = r(11), o = r(1)("toStringTag"), i = "Arguments" == e(/* @__PURE__ */ (function() {
          return arguments;
        })()), c = function(t3, n3) {
          try {
            return t3[n3];
          } catch (t4) {
          }
        };
        t2.exports = function(t3) {
          var n3, r2, u;
          return void 0 === t3 ? "Undefined" : null === t3 ? "Null" : "string" == typeof (r2 = c(n3 = Object(t3), o)) ? r2 : i ? e(n3) : "Object" == (u = e(n3)) && "function" == typeof n3.callee ? "Arguments" : u;
        };
      }, function(t2, n2) {
        t2.exports = "constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString,toString,valueOf".split(",");
      }, function(t2, n2, r) {
        var e = r(2), o = r(6), i = r(7), c = r(5), u = "prototype", s = function(t3, n3, r2) {
          var f, a, p, l = t3 & s.F, v = t3 & s.G, h = t3 & s.S, d = t3 & s.P, y = t3 & s.B, _ = t3 & s.W, x = v ? o : o[n3] || (o[n3] = {}), m = x[u], w = v ? e : h ? e[n3] : (e[n3] || {})[u];
          v && (r2 = n3);
          for (f in r2) a = !l && w && void 0 !== w[f], a && f in x || (p = a ? w[f] : r2[f], x[f] = v && "function" != typeof w[f] ? r2[f] : y && a ? i(p, e) : _ && w[f] == p ? (function(t4) {
            var n4 = function(n5, r3, e2) {
              if (this instanceof t4) {
                switch (arguments.length) {
                  case 0:
                    return new t4();
                  case 1:
                    return new t4(n5);
                  case 2:
                    return new t4(n5, r3);
                }
                return new t4(n5, r3, e2);
              }
              return t4.apply(this, arguments);
            };
            return n4[u] = t4[u], n4;
          })(p) : d && "function" == typeof p ? i(Function.call, p) : p, d && ((x.virtual || (x.virtual = {}))[f] = p, t3 & s.R && m && !m[f] && c(m, f, p)));
        };
        s.F = 1, s.G = 2, s.S = 4, s.P = 8, s.B = 16, s.W = 32, s.U = 64, s.R = 128, t2.exports = s;
      }, function(t2, n2) {
        t2.exports = function(t3) {
          try {
            return !!t3();
          } catch (t4) {
            return true;
          }
        };
      }, function(t2, n2, r) {
        t2.exports = r(2).document && document.documentElement;
      }, function(t2, n2, r) {
        t2.exports = !r(4) && !r(24)(function() {
          return 7 != Object.defineProperty(r(16)("div"), "a", { get: function() {
            return 7;
          } }).a;
        });
      }, function(t2, n2, r) {
        var e = r(28), o = r(23), i = r(57), c = r(5), u = r(8), s = r(10), f = r(45), a = r(18), p = r(52), l = r(1)("iterator"), v = !([].keys && "next" in [].keys()), h = "@@iterator", d = "keys", y = "values", _ = function() {
          return this;
        };
        t2.exports = function(t3, n3, r2, x, m, w, g) {
          f(r2, n3, x);
          var b, O, j, S = function(t4) {
            if (!v && t4 in T) return T[t4];
            switch (t4) {
              case d:
                return function() {
                  return new r2(this, t4);
                };
              case y:
                return function() {
                  return new r2(this, t4);
                };
            }
            return function() {
              return new r2(this, t4);
            };
          }, E = n3 + " Iterator", P = m == y, M = false, T = t3.prototype, A = T[l] || T[h] || m && T[m], k = A || S(m), C = m ? P ? S("entries") : k : void 0, I = "Array" == n3 ? T.entries || A : A;
          if (I && (j = p(I.call(new t3())), j !== Object.prototype && (a(j, E, true), e || u(j, l) || c(j, l, _))), P && A && A.name !== y && (M = true, k = function() {
            return A.call(this);
          }), e && !g || !v && !M && T[l] || c(T, l, k), s[n3] = k, s[E] = _, m) if (b = { values: P ? k : S(y), keys: w ? k : S(d), entries: C }, g) for (O in b) O in T || i(T, O, b[O]);
          else o(o.P + o.F * (v || M), n3, b);
          return b;
        };
      }, function(t2, n2) {
        t2.exports = true;
      }, function(t2, n2, r) {
        var e = r(2), o = "__core-js_shared__", i = e[o] || (e[o] = {});
        t2.exports = function(t3) {
          return i[t3] || (i[t3] = {});
        };
      }, function(t2, n2, r) {
        var e, o, i, c = r(7), u = r(41), s = r(25), f = r(16), a = r(2), p = a.process, l = a.setImmediate, v = a.clearImmediate, h = a.MessageChannel, d = 0, y = {}, _ = "onreadystatechange", x = function() {
          var t3 = +this;
          if (y.hasOwnProperty(t3)) {
            var n3 = y[t3];
            delete y[t3], n3();
          }
        }, m = function(t3) {
          x.call(t3.data);
        };
        l && v || (l = function(t3) {
          for (var n3 = [], r2 = 1; arguments.length > r2; ) n3.push(arguments[r2++]);
          return y[++d] = function() {
            u("function" == typeof t3 ? t3 : Function(t3), n3);
          }, e(d), d;
        }, v = function(t3) {
          delete y[t3];
        }, "process" == r(11)(p) ? e = function(t3) {
          p.nextTick(c(x, t3, 1));
        } : h ? (o = new h(), i = o.port2, o.port1.onmessage = m, e = c(i.postMessage, i, 1)) : a.addEventListener && "function" == typeof postMessage && !a.importScripts ? (e = function(t3) {
          a.postMessage(t3 + "", "*");
        }, a.addEventListener("message", m, false)) : e = _ in f("script") ? function(t3) {
          s.appendChild(f("script"))[_] = function() {
            s.removeChild(this), x.call(t3);
          };
        } : function(t3) {
          setTimeout(c(x, t3, 1), 0);
        }), t2.exports = { set: l, clear: v };
      }, function(t2, n2, r) {
        var e = r(20), o = Math.min;
        t2.exports = function(t3) {
          return t3 > 0 ? o(e(t3), 9007199254740991) : 0;
        };
      }, function(t2, n2, r) {
        var e = r(9);
        t2.exports = function(t3, n3) {
          if (!e(t3)) return t3;
          var r2, o;
          if (n3 && "function" == typeof (r2 = t3.toString) && !e(o = r2.call(t3))) return o;
          if ("function" == typeof (r2 = t3.valueOf) && !e(o = r2.call(t3))) return o;
          if (!n3 && "function" == typeof (r2 = t3.toString) && !e(o = r2.call(t3))) return o;
          throw TypeError("Can't convert object to primitive value");
        };
      }, function(t2, n2) {
        var r = 0, e = Math.random();
        t2.exports = function(t3) {
          return "Symbol(".concat(void 0 === t3 ? "" : t3, ")_", (++r + e).toString(36));
        };
      }, function(t2, n2, r) {
        function e(t3) {
          return t3 && t3.__esModule ? t3 : { default: t3 };
        }
        function o() {
          return "win32" !== process.platform ? "" : "ia32" === process.arch && process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432") ? "mixed" : "native";
        }
        function i(t3) {
          return (0, l.createHash)("sha256").update(t3).digest("hex");
        }
        function c(t3) {
          switch (h) {
            case "darwin":
              return t3.split("IOPlatformUUID")[1].split("\n")[0].replace(/\=|\s+|\"/gi, "").toLowerCase();
            case "win32":
              return t3.toString().split("REG_SZ")[1].replace(/\r+|\n+|\s+/gi, "").toLowerCase();
            case "linux":
              return t3.toString().replace(/\r+|\n+|\s+/gi, "").toLowerCase();
            case "freebsd":
              return t3.toString().replace(/\r+|\n+|\s+/gi, "").toLowerCase();
            default:
              throw new Error("Unsupported platform: " + process.platform);
          }
        }
        function u(t3) {
          var n3 = c((0, p.execSync)(y[h]).toString());
          return t3 ? n3 : i(n3);
        }
        function s(t3) {
          return new a.default(function(n3, r2) {
            return (0, p.exec)(y[h], {}, function(e2, o2, u2) {
              if (e2) return r2(new Error("Error while obtaining machine id: " + e2.stack));
              var s2 = c(o2.toString());
              return n3(t3 ? s2 : i(s2));
            });
          });
        }
        Object.defineProperty(n2, "__esModule", { value: true });
        var f = r(35), a = e(f);
        n2.machineIdSync = u, n2.machineId = s;
        var p = r(70), l = r(71), v = process, h = v.platform, d = { native: "%windir%\\System32", mixed: "%windir%\\sysnative\\cmd.exe /c %windir%\\System32" }, y = { darwin: "ioreg -rd1 -c IOPlatformExpertDevice", win32: d[o()] + "\\REG.exe QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid", linux: "( cat /var/lib/dbus/machine-id /etc/machine-id 2> /dev/null || hostname ) | head -n 1 || :", freebsd: "kenv -q smbios.system.uuid || sysctl -n kern.hostuuid" };
      }, function(t2, n2, r) {
        t2.exports = { default: r(36), __esModule: true };
      }, function(t2, n2, r) {
        r(66), r(68), r(69), r(67), t2.exports = r(6).Promise;
      }, function(t2, n2) {
        t2.exports = function() {
        };
      }, function(t2, n2) {
        t2.exports = function(t3, n3, r, e) {
          if (!(t3 instanceof n3) || void 0 !== e && e in t3) throw TypeError(r + ": incorrect invocation!");
          return t3;
        };
      }, function(t2, n2, r) {
        var e = r(13), o = r(31), i = r(62);
        t2.exports = function(t3) {
          return function(n3, r2, c) {
            var u, s = e(n3), f = o(s.length), a = i(c, f);
            if (t3 && r2 != r2) {
              for (; f > a; ) if (u = s[a++], u != u) return true;
            } else for (; f > a; a++) if ((t3 || a in s) && s[a] === r2) return t3 || a || 0;
            return !t3 && -1;
          };
        };
      }, function(t2, n2, r) {
        var e = r(7), o = r(44), i = r(43), c = r(3), u = r(31), s = r(64), f = {}, a = {}, n2 = t2.exports = function(t3, n3, r2, p, l) {
          var v, h, d, y, _ = l ? function() {
            return t3;
          } : s(t3), x = e(r2, p, n3 ? 2 : 1), m = 0;
          if ("function" != typeof _) throw TypeError(t3 + " is not iterable!");
          if (i(_)) {
            for (v = u(t3.length); v > m; m++) if (y = n3 ? x(c(h = t3[m])[0], h[1]) : x(t3[m]), y === f || y === a) return y;
          } else for (d = _.call(t3); !(h = d.next()).done; ) if (y = o(d, x, h.value, n3), y === f || y === a) return y;
        };
        n2.BREAK = f, n2.RETURN = a;
      }, function(t2, n2) {
        t2.exports = function(t3, n3, r) {
          var e = void 0 === r;
          switch (n3.length) {
            case 0:
              return e ? t3() : t3.call(r);
            case 1:
              return e ? t3(n3[0]) : t3.call(r, n3[0]);
            case 2:
              return e ? t3(n3[0], n3[1]) : t3.call(r, n3[0], n3[1]);
            case 3:
              return e ? t3(n3[0], n3[1], n3[2]) : t3.call(r, n3[0], n3[1], n3[2]);
            case 4:
              return e ? t3(n3[0], n3[1], n3[2], n3[3]) : t3.call(r, n3[0], n3[1], n3[2], n3[3]);
          }
          return t3.apply(r, n3);
        };
      }, function(t2, n2, r) {
        var e = r(11);
        t2.exports = Object("z").propertyIsEnumerable(0) ? Object : function(t3) {
          return "String" == e(t3) ? t3.split("") : Object(t3);
        };
      }, function(t2, n2, r) {
        var e = r(10), o = r(1)("iterator"), i = Array.prototype;
        t2.exports = function(t3) {
          return void 0 !== t3 && (e.Array === t3 || i[o] === t3);
        };
      }, function(t2, n2, r) {
        var e = r(3);
        t2.exports = function(t3, n3, r2, o) {
          try {
            return o ? n3(e(r2)[0], r2[1]) : n3(r2);
          } catch (n4) {
            var i = t3.return;
            throw void 0 !== i && e(i.call(t3)), n4;
          }
        };
      }, function(t2, n2, r) {
        var e = r(49), o = r(17), i = r(18), c = {};
        r(5)(c, r(1)("iterator"), function() {
          return this;
        }), t2.exports = function(t3, n3, r2) {
          t3.prototype = e(c, { next: o(1, r2) }), i(t3, n3 + " Iterator");
        };
      }, function(t2, n2, r) {
        var e = r(1)("iterator"), o = false;
        try {
          var i = [7][e]();
          i.return = function() {
            o = true;
          }, Array.from(i, function() {
            throw 2;
          });
        } catch (t3) {
        }
        t2.exports = function(t3, n3) {
          if (!n3 && !o) return false;
          var r2 = false;
          try {
            var i2 = [7], c = i2[e]();
            c.next = function() {
              return { done: r2 = true };
            }, i2[e] = function() {
              return c;
            }, t3(i2);
          } catch (t4) {
          }
          return r2;
        };
      }, function(t2, n2) {
        t2.exports = function(t3, n3) {
          return { value: n3, done: !!t3 };
        };
      }, function(t2, n2, r) {
        var e = r(2), o = r(30).set, i = e.MutationObserver || e.WebKitMutationObserver, c = e.process, u = e.Promise, s = "process" == r(11)(c);
        t2.exports = function() {
          var t3, n3, r2, f = function() {
            var e2, o2;
            for (s && (e2 = c.domain) && e2.exit(); t3; ) {
              o2 = t3.fn, t3 = t3.next;
              try {
                o2();
              } catch (e3) {
                throw t3 ? r2() : n3 = void 0, e3;
              }
            }
            n3 = void 0, e2 && e2.enter();
          };
          if (s) r2 = function() {
            c.nextTick(f);
          };
          else if (i) {
            var a = true, p = document.createTextNode("");
            new i(f).observe(p, { characterData: true }), r2 = function() {
              p.data = a = !a;
            };
          } else if (u && u.resolve) {
            var l = u.resolve();
            r2 = function() {
              l.then(f);
            };
          } else r2 = function() {
            o.call(e, f);
          };
          return function(e2) {
            var o2 = { fn: e2, next: void 0 };
            n3 && (n3.next = o2), t3 || (t3 = o2, r2()), n3 = o2;
          };
        };
      }, function(t2, n2, r) {
        var e = r(3), o = r(50), i = r(22), c = r(19)("IE_PROTO"), u = function() {
        }, s = "prototype", f = function() {
          var t3, n3 = r(16)("iframe"), e2 = i.length, o2 = ">";
          for (n3.style.display = "none", r(25).appendChild(n3), n3.src = "javascript:", t3 = n3.contentWindow.document, t3.open(), t3.write("<script>document.F=Object<\/script" + o2), t3.close(), f = t3.F; e2--; ) delete f[s][i[e2]];
          return f();
        };
        t2.exports = Object.create || function(t3, n3) {
          var r2;
          return null !== t3 ? (u[s] = e(t3), r2 = new u(), u[s] = null, r2[c] = t3) : r2 = f(), void 0 === n3 ? r2 : o(r2, n3);
        };
      }, function(t2, n2, r) {
        var e = r(12), o = r(3), i = r(54);
        t2.exports = r(4) ? Object.defineProperties : function(t3, n3) {
          o(t3);
          for (var r2, c = i(n3), u = c.length, s = 0; u > s; ) e.f(t3, r2 = c[s++], n3[r2]);
          return t3;
        };
      }, function(t2, n2, r) {
        var e = r(55), o = r(17), i = r(13), c = r(32), u = r(8), s = r(26), f = Object.getOwnPropertyDescriptor;
        n2.f = r(4) ? f : function(t3, n3) {
          if (t3 = i(t3), n3 = c(n3, true), s) try {
            return f(t3, n3);
          } catch (t4) {
          }
          if (u(t3, n3)) return o(!e.f.call(t3, n3), t3[n3]);
        };
      }, function(t2, n2, r) {
        var e = r(8), o = r(63), i = r(19)("IE_PROTO"), c = Object.prototype;
        t2.exports = Object.getPrototypeOf || function(t3) {
          return t3 = o(t3), e(t3, i) ? t3[i] : "function" == typeof t3.constructor && t3 instanceof t3.constructor ? t3.constructor.prototype : t3 instanceof Object ? c : null;
        };
      }, function(t2, n2, r) {
        var e = r(8), o = r(13), i = r(39)(false), c = r(19)("IE_PROTO");
        t2.exports = function(t3, n3) {
          var r2, u = o(t3), s = 0, f = [];
          for (r2 in u) r2 != c && e(u, r2) && f.push(r2);
          for (; n3.length > s; ) e(u, r2 = n3[s++]) && (~i(f, r2) || f.push(r2));
          return f;
        };
      }, function(t2, n2, r) {
        var e = r(53), o = r(22);
        t2.exports = Object.keys || function(t3) {
          return e(t3, o);
        };
      }, function(t2, n2) {
        n2.f = {}.propertyIsEnumerable;
      }, function(t2, n2, r) {
        var e = r(5);
        t2.exports = function(t3, n3, r2) {
          for (var o in n3) r2 && t3[o] ? t3[o] = n3[o] : e(t3, o, n3[o]);
          return t3;
        };
      }, function(t2, n2, r) {
        t2.exports = r(5);
      }, function(t2, n2, r) {
        var e = r(9), o = r(3), i = function(t3, n3) {
          if (o(t3), !e(n3) && null !== n3) throw TypeError(n3 + ": can't set as prototype!");
        };
        t2.exports = { set: Object.setPrototypeOf || ("__proto__" in {} ? (function(t3, n3, e2) {
          try {
            e2 = r(7)(Function.call, r(51).f(Object.prototype, "__proto__").set, 2), e2(t3, []), n3 = !(t3 instanceof Array);
          } catch (t4) {
            n3 = true;
          }
          return function(t4, r2) {
            return i(t4, r2), n3 ? t4.__proto__ = r2 : e2(t4, r2), t4;
          };
        })({}, false) : void 0), check: i };
      }, function(t2, n2, r) {
        var e = r(2), o = r(6), i = r(12), c = r(4), u = r(1)("species");
        t2.exports = function(t3) {
          var n3 = "function" == typeof o[t3] ? o[t3] : e[t3];
          c && n3 && !n3[u] && i.f(n3, u, { configurable: true, get: function() {
            return this;
          } });
        };
      }, function(t2, n2, r) {
        var e = r(3), o = r(14), i = r(1)("species");
        t2.exports = function(t3, n3) {
          var r2, c = e(t3).constructor;
          return void 0 === c || void 0 == (r2 = e(c)[i]) ? n3 : o(r2);
        };
      }, function(t2, n2, r) {
        var e = r(20), o = r(15);
        t2.exports = function(t3) {
          return function(n3, r2) {
            var i, c, u = String(o(n3)), s = e(r2), f = u.length;
            return s < 0 || s >= f ? t3 ? "" : void 0 : (i = u.charCodeAt(s), i < 55296 || i > 56319 || s + 1 === f || (c = u.charCodeAt(s + 1)) < 56320 || c > 57343 ? t3 ? u.charAt(s) : i : t3 ? u.slice(s, s + 2) : (i - 55296 << 10) + (c - 56320) + 65536);
          };
        };
      }, function(t2, n2, r) {
        var e = r(20), o = Math.max, i = Math.min;
        t2.exports = function(t3, n3) {
          return t3 = e(t3), t3 < 0 ? o(t3 + n3, 0) : i(t3, n3);
        };
      }, function(t2, n2, r) {
        var e = r(15);
        t2.exports = function(t3) {
          return Object(e(t3));
        };
      }, function(t2, n2, r) {
        var e = r(21), o = r(1)("iterator"), i = r(10);
        t2.exports = r(6).getIteratorMethod = function(t3) {
          if (void 0 != t3) return t3[o] || t3["@@iterator"] || i[e(t3)];
        };
      }, function(t2, n2, r) {
        var e = r(37), o = r(47), i = r(10), c = r(13);
        t2.exports = r(27)(Array, "Array", function(t3, n3) {
          this._t = c(t3), this._i = 0, this._k = n3;
        }, function() {
          var t3 = this._t, n3 = this._k, r2 = this._i++;
          return !t3 || r2 >= t3.length ? (this._t = void 0, o(1)) : "keys" == n3 ? o(0, r2) : "values" == n3 ? o(0, t3[r2]) : o(0, [r2, t3[r2]]);
        }, "values"), i.Arguments = i.Array, e("keys"), e("values"), e("entries");
      }, function(t2, n2) {
      }, function(t2, n2, r) {
        var e, o, i, c = r(28), u = r(2), s = r(7), f = r(21), a = r(23), p = r(9), l = (r(3), r(14)), v = r(38), h = r(40), d = (r(58).set, r(60)), y = r(30).set, _ = r(48)(), x = "Promise", m = u.TypeError, w = u.process, g = u[x], w = u.process, b = "process" == f(w), O = function() {
        }, j = !!(function() {
          try {
            var t3 = g.resolve(1), n3 = (t3.constructor = {})[r(1)("species")] = function(t4) {
              t4(O, O);
            };
            return (b || "function" == typeof PromiseRejectionEvent) && t3.then(O) instanceof n3;
          } catch (t4) {
          }
        })(), S = function(t3, n3) {
          return t3 === n3 || t3 === g && n3 === i;
        }, E = function(t3) {
          var n3;
          return !(!p(t3) || "function" != typeof (n3 = t3.then)) && n3;
        }, P = function(t3) {
          return S(g, t3) ? new M(t3) : new o(t3);
        }, M = o = function(t3) {
          var n3, r2;
          this.promise = new t3(function(t4, e2) {
            if (void 0 !== n3 || void 0 !== r2) throw m("Bad Promise constructor");
            n3 = t4, r2 = e2;
          }), this.resolve = l(n3), this.reject = l(r2);
        }, T = function(t3) {
          try {
            t3();
          } catch (t4) {
            return { error: t4 };
          }
        }, A = function(t3, n3) {
          if (!t3._n) {
            t3._n = true;
            var r2 = t3._c;
            _(function() {
              for (var e2 = t3._v, o2 = 1 == t3._s, i2 = 0, c2 = function(n4) {
                var r3, i3, c3 = o2 ? n4.ok : n4.fail, u2 = n4.resolve, s2 = n4.reject, f2 = n4.domain;
                try {
                  c3 ? (o2 || (2 == t3._h && I(t3), t3._h = 1), c3 === true ? r3 = e2 : (f2 && f2.enter(), r3 = c3(e2), f2 && f2.exit()), r3 === n4.promise ? s2(m("Promise-chain cycle")) : (i3 = E(r3)) ? i3.call(r3, u2, s2) : u2(r3)) : s2(e2);
                } catch (t4) {
                  s2(t4);
                }
              }; r2.length > i2; ) c2(r2[i2++]);
              t3._c = [], t3._n = false, n3 && !t3._h && k(t3);
            });
          }
        }, k = function(t3) {
          y.call(u, function() {
            var n3, r2, e2, o2 = t3._v;
            if (C(t3) && (n3 = T(function() {
              b ? w.emit("unhandledRejection", o2, t3) : (r2 = u.onunhandledrejection) ? r2({ promise: t3, reason: o2 }) : (e2 = u.console) && e2.error && e2.error("Unhandled promise rejection", o2);
            }), t3._h = b || C(t3) ? 2 : 1), t3._a = void 0, n3) throw n3.error;
          });
        }, C = function(t3) {
          if (1 == t3._h) return false;
          for (var n3, r2 = t3._a || t3._c, e2 = 0; r2.length > e2; ) if (n3 = r2[e2++], n3.fail || !C(n3.promise)) return false;
          return true;
        }, I = function(t3) {
          y.call(u, function() {
            var n3;
            b ? w.emit("rejectionHandled", t3) : (n3 = u.onrejectionhandled) && n3({ promise: t3, reason: t3._v });
          });
        }, R = function(t3) {
          var n3 = this;
          n3._d || (n3._d = true, n3 = n3._w || n3, n3._v = t3, n3._s = 2, n3._a || (n3._a = n3._c.slice()), A(n3, true));
        }, F = function(t3) {
          var n3, r2 = this;
          if (!r2._d) {
            r2._d = true, r2 = r2._w || r2;
            try {
              if (r2 === t3) throw m("Promise can't be resolved itself");
              (n3 = E(t3)) ? _(function() {
                var e2 = { _w: r2, _d: false };
                try {
                  n3.call(t3, s(F, e2, 1), s(R, e2, 1));
                } catch (t4) {
                  R.call(e2, t4);
                }
              }) : (r2._v = t3, r2._s = 1, A(r2, false));
            } catch (t4) {
              R.call({ _w: r2, _d: false }, t4);
            }
          }
        };
        j || (g = function(t3) {
          v(this, g, x, "_h"), l(t3), e.call(this);
          try {
            t3(s(F, this, 1), s(R, this, 1));
          } catch (t4) {
            R.call(this, t4);
          }
        }, e = function(t3) {
          this._c = [], this._a = void 0, this._s = 0, this._d = false, this._v = void 0, this._h = 0, this._n = false;
        }, e.prototype = r(56)(g.prototype, { then: function(t3, n3) {
          var r2 = P(d(this, g));
          return r2.ok = "function" != typeof t3 || t3, r2.fail = "function" == typeof n3 && n3, r2.domain = b ? w.domain : void 0, this._c.push(r2), this._a && this._a.push(r2), this._s && A(this, false), r2.promise;
        }, catch: function(t3) {
          return this.then(void 0, t3);
        } }), M = function() {
          var t3 = new e();
          this.promise = t3, this.resolve = s(F, t3, 1), this.reject = s(R, t3, 1);
        }), a(a.G + a.W + a.F * !j, { Promise: g }), r(18)(g, x), r(59)(x), i = r(6)[x], a(a.S + a.F * !j, x, { reject: function(t3) {
          var n3 = P(this), r2 = n3.reject;
          return r2(t3), n3.promise;
        } }), a(a.S + a.F * (c || !j), x, { resolve: function(t3) {
          if (t3 instanceof g && S(t3.constructor, this)) return t3;
          var n3 = P(this), r2 = n3.resolve;
          return r2(t3), n3.promise;
        } }), a(a.S + a.F * !(j && r(46)(function(t3) {
          g.all(t3).catch(O);
        })), x, { all: function(t3) {
          var n3 = this, r2 = P(n3), e2 = r2.resolve, o2 = r2.reject, i2 = T(function() {
            var r3 = [], i3 = 0, c2 = 1;
            h(t3, false, function(t4) {
              var u2 = i3++, s2 = false;
              r3.push(void 0), c2++, n3.resolve(t4).then(function(t5) {
                s2 || (s2 = true, r3[u2] = t5, --c2 || e2(r3));
              }, o2);
            }), --c2 || e2(r3);
          });
          return i2 && o2(i2.error), r2.promise;
        }, race: function(t3) {
          var n3 = this, r2 = P(n3), e2 = r2.reject, o2 = T(function() {
            h(t3, false, function(t4) {
              n3.resolve(t4).then(r2.resolve, e2);
            });
          });
          return o2 && e2(o2.error), r2.promise;
        } });
      }, function(t2, n2, r) {
        var e = r(61)(true);
        r(27)(String, "String", function(t3) {
          this._t = String(t3), this._i = 0;
        }, function() {
          var t3, n3 = this._t, r2 = this._i;
          return r2 >= n3.length ? { value: void 0, done: true } : (t3 = e(n3, r2), this._i += t3.length, { value: t3, done: false });
        });
      }, function(t2, n2, r) {
        r(65);
        for (var e = r(2), o = r(5), i = r(10), c = r(1)("toStringTag"), u = ["NodeList", "DOMTokenList", "MediaList", "StyleSheetList", "CSSRuleList"], s = 0; s < 5; s++) {
          var f = u[s], a = e[f], p = a && a.prototype;
          p && !p[c] && o(p, c, f), i[f] = i.Array;
        }
      }, function(t2, n2) {
        t2.exports = require$$0;
      }, function(t2, n2) {
        t2.exports = crypto$1;
      }]);
    });
  })(dist$1);
  return dist$1.exports;
}
var distExports = requireDist();
const POSTHOG_API_KEY = "phc_aGNegeJQP5FzNiF2rEoKqQbkuCpiiETMttplibXpB0n";
const POSTHOG_HOST = "https://us.i.posthog.com";
let posthogClient = null;
let distinctId = "";
async function initTelemetry() {
  try {
    const telemetryEnabled = await getSetting("telemetryEnabled");
    if (!telemetryEnabled) {
      logger.info("Telemetry is disabled in settings");
      return;
    }
    posthogClient = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
    distinctId = await getSetting("machineId");
    if (!distinctId) {
      distinctId = distExports.machineIdSync();
      await setSetting("machineId", distinctId);
      logger.debug(`Generated new machine ID for telemetry: ${distinctId}`);
    }
    const properties = {
      $app_version: electron.app.getVersion(),
      $os: process.platform,
      arch: process.arch
    };
    const hasReportedInstall = await getSetting("hasReportedInstall");
    if (!hasReportedInstall) {
      posthogClient.capture({
        distinctId,
        event: "app_installed",
        properties
      });
      await setSetting("hasReportedInstall", true);
      logger.info("Reported app_installed event");
    }
    posthogClient.capture({
      distinctId,
      event: "app_opened",
      properties
    });
    logger.debug("Reported app_opened event");
  } catch (error2) {
    logger.error("Failed to initialize telemetry:", error2);
  }
}
async function shutdownTelemetry() {
  if (posthogClient) {
    try {
      await posthogClient.shutdown();
      logger.debug("Flushed telemetry events on shutdown");
    } catch (error2) {
      logger.error("Error shutting down telemetry:", error2);
    }
  }
}
class ClawHubService {
  workDir;
  cliPath;
  cliEntryPath;
  useNodeRunner;
  ansiRegex;
  constructor() {
    this.workDir = getOpenClawConfigDir();
    ensureDir$3(this.workDir);
    const binPath = getClawHubCliBinPath();
    const entryPath = getClawHubCliEntryPath();
    this.cliEntryPath = entryPath;
    if (!electron.app.isPackaged && fs.existsSync(binPath)) {
      this.cliPath = binPath;
      this.useNodeRunner = false;
    } else {
      this.cliPath = process.execPath;
      this.useNodeRunner = true;
    }
    const esc = String.fromCharCode(27);
    const csi = String.fromCharCode(155);
    const pattern = `(?:${esc}|${csi})[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`;
    this.ansiRegex = new RegExp(pattern, "g");
  }
  stripAnsi(line) {
    return line.replace(this.ansiRegex, "").trim();
  }
  extractFrontmatterName(skillManifestPath) {
    try {
      const raw = fs.readFileSync(skillManifestPath, "utf8");
      const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return null;
      const body = frontmatterMatch[1];
      const nameMatch = body.match(/^\s*name\s*:\s*["']?([^"'\n]+)["']?\s*$/m);
      if (!nameMatch) return null;
      const name = nameMatch[1].trim();
      return name || null;
    } catch {
      return null;
    }
  }
  resolveSkillDirByManifestName(candidates) {
    const skillsRoot = path.join(this.workDir, "skills");
    if (!fs.existsSync(skillsRoot)) return null;
    const wanted = new Set(
      candidates.map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0)
    );
    if (wanted.size === 0) return null;
    let entries;
    try {
      entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(skillsRoot, entry.name);
      const skillManifestPath = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillManifestPath)) continue;
      const frontmatterName = this.extractFrontmatterName(skillManifestPath);
      if (!frontmatterName) continue;
      if (wanted.has(frontmatterName.toLowerCase())) {
        return skillDir;
      }
    }
    return null;
  }
  /**
   * Run a ClawHub CLI command
   */
  async runCommand(args) {
    return new Promise((resolve, reject) => {
      if (this.useNodeRunner && !fs.existsSync(this.cliEntryPath)) {
        reject(new Error(`ClawHub CLI entry not found at: ${this.cliEntryPath}`));
        return;
      }
      if (!this.useNodeRunner && !fs.existsSync(this.cliPath)) {
        reject(new Error(`ClawHub CLI not found at: ${this.cliPath}`));
        return;
      }
      const commandArgs = this.useNodeRunner ? [this.cliEntryPath, ...args] : args;
      const displayCommand = [this.cliPath, ...commandArgs].join(" ");
      console.log(`Running ClawHub command: ${displayCommand}`);
      const isWin = process.platform === "win32";
      const useShell = isWin && !this.useNodeRunner;
      const { NODE_OPTIONS: _nodeOptions, ...baseEnv } = process.env;
      const env = {
        ...baseEnv,
        CI: "true",
        FORCE_COLOR: "0"
      };
      if (this.useNodeRunner) {
        env.ELECTRON_RUN_AS_NODE = "1";
      }
      const spawnCmd = useShell ? quoteForCmd(this.cliPath) : this.cliPath;
      const spawnArgs = useShell ? commandArgs.map((a) => quoteForCmd(a)) : commandArgs;
      const child = require$$0.spawn(spawnCmd, spawnArgs, {
        cwd: this.workDir,
        shell: useShell,
        env: {
          ...env,
          CLAWHUB_WORKDIR: this.workDir
        },
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (error2) => {
        console.error("ClawHub process error:", error2);
        reject(error2);
      });
      child.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`ClawHub command failed with code ${code}`);
          console.error("Stderr:", stderr);
          reject(new Error(`Command failed: ${stderr || stdout}`));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }
  /**
   * Search for skills
   */
  async search(params) {
    try {
      if (!params.query || params.query.trim() === "") {
        return this.explore({ limit: params.limit });
      }
      const args = ["search", params.query];
      if (params.limit) {
        args.push("--limit", String(params.limit));
      }
      const output = await this.runCommand(args);
      if (!output || output.includes("No skills found")) {
        return [];
      }
      const lines = output.split("\n").filter((l) => l.trim());
      return lines.map((line) => {
        const cleanLine = this.stripAnsi(line);
        let match = cleanLine.match(/^(\S+)\s+v?(\d+\.\S+)\s+(.+)$/);
        if (match) {
          const slug = match[1];
          const version2 = match[2];
          let description = match[3];
          description = description.replace(/\(\d+\.\d+\)$/, "").trim();
          return {
            slug,
            name: slug,
            version: version2,
            description
          };
        }
        match = cleanLine.match(/^(\S+)\s+(.+)$/);
        if (match) {
          const slug = match[1];
          let description = match[2];
          description = description.replace(/\(\d+\.\d+\)$/, "").trim();
          return {
            slug,
            name: slug,
            version: "latest",
            // Fallback version since it's not provided
            description
          };
        }
        return null;
      }).filter((s) => s !== null);
    } catch (error2) {
      console.error("ClawHub search error:", error2);
      throw error2;
    }
  }
  /**
   * Explore trending skills
   */
  async explore(params = {}) {
    try {
      const args = ["explore"];
      if (params.limit) {
        args.push("--limit", String(params.limit));
      }
      const output = await this.runCommand(args);
      if (!output) return [];
      const lines = output.split("\n").filter((l) => l.trim());
      return lines.map((line) => {
        const cleanLine = this.stripAnsi(line);
        const match = cleanLine.match(/^(\S+)\s+v?(\d+\.\S+)\s+(.+? ago|just now|yesterday)\s+(.+)$/i);
        if (match) {
          return {
            slug: match[1],
            name: match[1],
            version: match[2],
            description: match[4]
          };
        }
        return null;
      }).filter((s) => s !== null);
    } catch (error2) {
      console.error("ClawHub explore error:", error2);
      throw error2;
    }
  }
  /**
   * Install a skill
   */
  async install(params) {
    const args = ["install", params.slug];
    if (params.version) {
      args.push("--version", params.version);
    }
    if (params.force) {
      args.push("--force");
    }
    await this.runCommand(args);
  }
  /**
   * Uninstall a skill
   */
  async uninstall(params) {
    const fsPromises = fs.promises;
    const skillDir = path.join(this.workDir, "skills", params.slug);
    if (fs.existsSync(skillDir)) {
      console.log(`Deleting skill directory: ${skillDir}`);
      await fsPromises.rm(skillDir, { recursive: true, force: true });
    }
    const lockFile = path.join(this.workDir, ".clawhub", "lock.json");
    if (fs.existsSync(lockFile)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        if (lockData.skills && lockData.skills[params.slug]) {
          console.log(`Removing ${params.slug} from lock.json`);
          delete lockData.skills[params.slug];
          await fsPromises.writeFile(lockFile, JSON.stringify(lockData, null, 2));
        }
      } catch (err) {
        console.error("Failed to update ClawHub lock file:", err);
      }
    }
  }
  /**
   * List installed skills
   */
  async listInstalled() {
    try {
      const output = await this.runCommand(["list"]);
      if (!output || output.includes("No installed skills")) {
        return [];
      }
      const lines = output.split("\n").filter((l) => l.trim());
      return lines.map((line) => {
        const cleanLine = this.stripAnsi(line);
        const match = cleanLine.match(/^(\S+)\s+v?(\d+\.\S+)/);
        if (match) {
          return {
            slug: match[1],
            version: match[2]
          };
        }
        return null;
      }).filter((s) => s !== null);
    } catch (error2) {
      console.error("ClawHub list error:", error2);
      return [];
    }
  }
  /**
   * Open skill README/manual in default editor
   */
  async openSkillReadme(skillKeyOrSlug, fallbackSlug) {
    const candidates = [skillKeyOrSlug, fallbackSlug].filter((v) => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
    const uniqueCandidates = [...new Set(candidates)];
    const directSkillDir = uniqueCandidates.map((id) => path.join(this.workDir, "skills", id)).find((dir) => fs.existsSync(dir));
    const skillDir = directSkillDir || this.resolveSkillDirByManifestName(uniqueCandidates);
    const possibleFiles = ["SKILL.md", "README.md", "skill.md", "readme.md"];
    let targetFile = "";
    if (skillDir) {
      for (const file of possibleFiles) {
        const filePath = path.join(skillDir, file);
        if (fs.existsSync(filePath)) {
          targetFile = filePath;
          break;
        }
      }
    }
    if (!targetFile) {
      if (skillDir) {
        targetFile = skillDir;
      } else {
        throw new Error("Skill directory not found");
      }
    }
    try {
      await electron.shell.openPath(targetFile);
      return true;
    } catch (error2) {
      console.error("Failed to open skill readme:", error2);
      throw error2;
    }
  }
}
const CLAWX_BEGIN = "<!-- clawx:begin -->";
const CLAWX_END = "<!-- clawx:end -->";
async function fileExists(p) {
  try {
    await promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function ensureDir(dir) {
  if (!await fileExists(dir)) {
    await promises.mkdir(dir, { recursive: true });
  }
}
function mergeClawXSection(existing, section) {
  const wrapped = `${CLAWX_BEGIN}
${section.trim()}
${CLAWX_END}`;
  const beginIdx = existing.indexOf(CLAWX_BEGIN);
  const endIdx = existing.indexOf(CLAWX_END);
  if (beginIdx !== -1 && endIdx !== -1) {
    return existing.slice(0, beginIdx) + wrapped + existing.slice(endIdx + CLAWX_END.length);
  }
  return existing.trimEnd() + "\n\n" + wrapped + "\n";
}
async function resolveAllWorkspaceDirs() {
  const openclawDir = path.join(os.homedir(), ".openclaw");
  const dirs = /* @__PURE__ */ new Set();
  const configPath = path.join(openclawDir, "openclaw.json");
  try {
    if (await fileExists(configPath)) {
      const config = JSON.parse(await promises.readFile(configPath, "utf-8"));
      const defaultWs = config?.agents?.defaults?.workspace;
      if (typeof defaultWs === "string" && defaultWs.trim()) {
        dirs.add(defaultWs.replace(/^~/, os.homedir()));
      }
      const agents = config?.agents?.list;
      if (Array.isArray(agents)) {
        for (const agent of agents) {
          const ws = agent?.workspace;
          if (typeof ws === "string" && ws.trim()) {
            dirs.add(ws.replace(/^~/, os.homedir()));
          }
        }
      }
    }
  } catch {
  }
  try {
    const entries = await promises.readdir(openclawDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("workspace")) {
        dirs.add(path.join(openclawDir, entry.name));
      }
    }
  } catch {
  }
  if (dirs.size === 0) {
    dirs.add(path.join(openclawDir, "workspace"));
  }
  return [...dirs];
}
async function repairClawXOnlyBootstrapFiles() {
  const workspaceDirs = await resolveAllWorkspaceDirs();
  for (const workspaceDir of workspaceDirs) {
    if (!await fileExists(workspaceDir)) continue;
    let entries;
    try {
      entries = (await promises.readdir(workspaceDir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of entries) {
      const filePath = path.join(workspaceDir, file);
      let content;
      try {
        content = await promises.readFile(filePath, "utf-8");
      } catch {
        continue;
      }
      const beginIdx = content.indexOf(CLAWX_BEGIN);
      const endIdx = content.indexOf(CLAWX_END);
      if (beginIdx === -1 || endIdx === -1) continue;
      const before = content.slice(0, beginIdx).trim();
      const after = content.slice(endIdx + CLAWX_END.length).trim();
      if (before === "" && after === "") {
        try {
          await promises.unlink(filePath);
          logger.info(`Removed ClawX-only bootstrap file for re-seeding: ${file} (${workspaceDir})`);
        } catch {
          logger.warn(`Failed to remove ClawX-only bootstrap file: ${filePath}`);
        }
      }
    }
  }
}
async function mergeClawXContextOnce() {
  const contextDir = path.join(getResourcesDir(), "context");
  if (!await fileExists(contextDir)) {
    logger.debug("ClawX context directory not found, skipping context merge");
    return 0;
  }
  let files;
  try {
    files = (await promises.readdir(contextDir)).filter((f) => f.endsWith(".clawx.md"));
  } catch {
    return 0;
  }
  const workspaceDirs = await resolveAllWorkspaceDirs();
  let skipped = 0;
  for (const workspaceDir of workspaceDirs) {
    await ensureDir(workspaceDir);
    for (const file of files) {
      const targetName = file.replace(".clawx.md", ".md");
      const targetPath = path.join(workspaceDir, targetName);
      if (!await fileExists(targetPath)) {
        logger.debug(`Skipping ${targetName} in ${workspaceDir} (file does not exist yet, will be seeded by gateway)`);
        skipped++;
        continue;
      }
      const section = await promises.readFile(path.join(contextDir, file), "utf-8");
      const existing = await promises.readFile(targetPath, "utf-8");
      const merged = mergeClawXSection(existing, section);
      if (merged !== existing) {
        await promises.writeFile(targetPath, merged, "utf-8");
        logger.info(`Merged ClawX context into ${targetName} (${workspaceDir})`);
      }
    }
  }
  return skipped;
}
const RETRY_INTERVAL_MS = 2e3;
const MAX_RETRIES = 15;
async function ensureClawXContext() {
  let skipped = await mergeClawXContextOnce();
  if (skipped === 0) return;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    skipped = await mergeClawXContextOnce();
    if (skipped === 0) {
      logger.info(`ClawX context merge completed after ${attempt} retry(ies)`);
      return;
    }
    logger.debug(`ClawX context merge: ${skipped} file(s) still missing (retry ${attempt}/${MAX_RETRIES})`);
  }
  logger.warn(`ClawX context merge: ${skipped} file(s) still missing after ${MAX_RETRIES} retries`);
}
async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
function sendNoContent(res) {
  setCorsHeaders(res);
  res.statusCode = 204;
  res.end();
}
async function handleAppRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/events" && req.method === "GET") {
    setCorsHeaders(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    res.write(": connected\n\n");
    ctx.eventBus.addSseClient(res);
    res.write(`event: gateway:status
data: ${JSON.stringify(ctx.gatewayManager.getStatus())}

`);
    return true;
  }
  if (req.method === "OPTIONS") {
    sendNoContent(res);
    return true;
  }
  return false;
}
async function handleGatewayRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/app/gateway-info" && req.method === "GET") {
    const status = ctx.gatewayManager.getStatus();
    const token = await getSetting("gatewayToken");
    const port = status.port || PORTS.OPENCLAW_GATEWAY;
    sendJson(res, 200, {
      wsUrl: `ws://127.0.0.1:${port}/ws`,
      token,
      port
    });
    return true;
  }
  if (url.pathname === "/api/gateway/status" && req.method === "GET") {
    sendJson(res, 200, ctx.gatewayManager.getStatus());
    return true;
  }
  if (url.pathname === "/api/gateway/health" && req.method === "GET") {
    const health = await ctx.gatewayManager.checkHealth();
    sendJson(res, 200, health);
    return true;
  }
  if (url.pathname === "/api/gateway/start" && req.method === "POST") {
    try {
      await ctx.gatewayManager.start();
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/gateway/stop" && req.method === "POST") {
    try {
      await ctx.gatewayManager.stop();
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/gateway/restart" && req.method === "POST") {
    try {
      await ctx.gatewayManager.restart();
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/gateway/control-ui" && req.method === "GET") {
    try {
      const status = ctx.gatewayManager.getStatus();
      const token = await getSetting("gatewayToken");
      const port = status.port || PORTS.OPENCLAW_GATEWAY;
      const urlValue = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;
      sendJson(res, 200, { success: true, url: urlValue, token, port });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/chat/send-with-media" && req.method === "POST") {
    try {
      logger.info("HTTP /api/chat/send-with-media intercepted");
      const enterpriseCfg = await ensureEnterpriseLoginInteractive();
      if (!enterpriseCfg?.token || !enterpriseCfg?.employee_id) {
        logger.info("HTTP /api/chat/send-with-media blocked: enterprise_login_required");
        sendJson(res, 401, { success: false, error: "enterprise_login_required" });
        return true;
      }
      const body = await parseJsonBody(req);
      const VISION_MIME_TYPES = /* @__PURE__ */ new Set([
        "image/png",
        "image/jpeg",
        "image/bmp",
        "image/webp"
      ]);
      const imageAttachments = [];
      const fileReferences = [];
      if (body.media && body.media.length > 0) {
        const fsP = await import("node:fs/promises");
        for (const m of body.media) {
          fileReferences.push(`[media attached: ${m.filePath} (${m.mimeType}) | ${m.filePath}]`);
          if (VISION_MIME_TYPES.has(m.mimeType)) {
            const fileBuffer = await fsP.readFile(m.filePath);
            imageAttachments.push({
              content: fileBuffer.toString("base64"),
              mimeType: m.mimeType,
              fileName: m.fileName
            });
          }
        }
      }
      const message = fileReferences.length > 0 ? [body.message, ...fileReferences].filter(Boolean).join("\n") : body.message;
      const rpcParams = {
        sessionKey: body.sessionKey,
        message,
        deliver: body.deliver ?? false,
        idempotencyKey: body.idempotencyKey
      };
      if (imageAttachments.length > 0) {
        rpcParams.attachments = imageAttachments;
      }
      const result = await ctx.gatewayManager.rpc("chat.send", rpcParams, 12e4);
      sendJson(res, 200, { success: true, result });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
async function handleProxySettingsChange(ctx) {
  const settings = await getAllSettings();
  await applyProxySettings(settings);
  if (ctx.gatewayManager.getStatus().state === "running") {
    await ctx.gatewayManager.restart();
  }
}
function patchTouchesProxy(patch) {
  return Object.keys(patch).some((key) => key === "proxyEnabled" || key === "proxyServer" || key === "proxyHttpServer" || key === "proxyHttpsServer" || key === "proxyAllServer" || key === "proxyBypassRules");
}
function patchTouchesLaunchAtStartup(patch) {
  return Object.prototype.hasOwnProperty.call(patch, "launchAtStartup");
}
function patchTouchesGateway(patch) {
  return Object.keys(patch).some((key) => key === "gatewayHost" || key === "gatewayPort" || key === "gatewayToken");
}
async function handleSettingsRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/settings" && req.method === "GET") {
    sendJson(res, 200, await getAllSettings());
    return true;
  }
  if (url.pathname === "/api/settings" && req.method === "PUT") {
    try {
      const patch = await parseJsonBody(req);
      const entries = Object.entries(patch);
      for (const [key, value] of entries) {
        await setSetting(key, value);
      }
      if (patchTouchesProxy(patch)) {
        await handleProxySettingsChange(ctx);
      }
      if (patchTouchesGateway(patch)) {
        if (ctx.gatewayManager.getStatus().state === "running") {
          await ctx.gatewayManager.restart();
        }
      }
      if (patchTouchesLaunchAtStartup(patch)) {
        await syncLaunchAtStartupSettingFromStore();
      }
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/settings/") && req.method === "GET") {
    const key = url.pathname.slice("/api/settings/".length);
    try {
      sendJson(res, 200, { value: await getSetting(key) });
    } catch (error2) {
      sendJson(res, 404, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/settings/") && req.method === "PUT") {
    const key = url.pathname.slice("/api/settings/".length);
    try {
      const body = await parseJsonBody(req);
      await setSetting(key, body.value);
      if (key === "proxyEnabled" || key === "proxyServer" || key === "proxyHttpServer" || key === "proxyHttpsServer" || key === "proxyAllServer" || key === "proxyBypassRules") {
        await handleProxySettingsChange(ctx);
      }
      if (key === "launchAtStartup") {
        await syncLaunchAtStartupSettingFromStore();
      }
      sendJson(res, 200, { success: true, value: body.value });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/settings/reset" && req.method === "POST") {
    try {
      await resetSettings();
      await handleProxySettingsChange(ctx);
      await syncLaunchAtStartupSettingFromStore();
      sendJson(res, 200, { success: true, settings: await getAllSettings() });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
const legacyProviderRoutesWarned = /* @__PURE__ */ new Set();
async function handleProviderRoutes(req, res, url, ctx) {
  const providerService2 = getProviderService();
  const logLegacyProviderRoute = (route) => {
    if (legacyProviderRoutesWarned.has(route)) return;
    legacyProviderRoutesWarned.add(route);
    logger.warn(
      `[provider-migration] Legacy HTTP route "${route}" is deprecated. Prefer /api/provider-accounts endpoints.`
    );
  };
  if (url.pathname === "/api/provider-vendors" && req.method === "GET") {
    sendJson(res, 200, await providerService2.listVendors());
    return true;
  }
  if (url.pathname === "/api/provider-accounts" && req.method === "GET") {
    sendJson(res, 200, await providerService2.listAccounts());
    return true;
  }
  if (url.pathname === "/api/provider-accounts" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const account = await providerService2.createAccount(body.account, body.apiKey);
      await syncSavedProviderToRuntime(providerAccountToConfig(account), body.apiKey, ctx.gatewayManager);
      sendJson(res, 200, { success: true, account });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/provider-accounts/default" && req.method === "GET") {
    sendJson(res, 200, { accountId: await providerService2.getDefaultAccountId() ?? null });
    return true;
  }
  if (url.pathname === "/api/provider-accounts/default" && req.method === "PUT") {
    try {
      const body = await parseJsonBody(req);
      await providerService2.setDefaultAccount(body.accountId);
      await syncDefaultProviderToRuntime(body.accountId, ctx.gatewayManager);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/provider-accounts/") && req.method === "GET") {
    const accountId = decodeURIComponent(url.pathname.slice("/api/provider-accounts/".length));
    sendJson(res, 200, await providerService2.getAccount(accountId));
    return true;
  }
  if (url.pathname.startsWith("/api/provider-accounts/") && req.method === "PUT") {
    const accountId = decodeURIComponent(url.pathname.slice("/api/provider-accounts/".length));
    try {
      const body = await parseJsonBody(req);
      const existing = await providerService2.getAccount(accountId);
      if (!existing) {
        sendJson(res, 404, { success: false, error: "Provider account not found" });
        return true;
      }
      const nextAccount = await providerService2.updateAccount(accountId, body.updates, body.apiKey);
      await syncUpdatedProviderToRuntime(providerAccountToConfig(nextAccount), body.apiKey, ctx.gatewayManager);
      sendJson(res, 200, { success: true, account: nextAccount });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/provider-accounts/") && req.method === "DELETE") {
    const accountId = decodeURIComponent(url.pathname.slice("/api/provider-accounts/".length));
    try {
      const existing = await providerService2.getAccount(accountId);
      const runtimeProviderKey = existing?.authMode === "oauth_browser" ? existing.vendorId === "google" ? "google-gemini-cli" : existing.vendorId === "openai" ? "openai-codex" : void 0 : void 0;
      if (url.searchParams.get("apiKeyOnly") === "1") {
        await providerService2.deleteLegacyProviderApiKey(accountId);
        await syncDeletedProviderApiKeyToRuntime(
          existing ? providerAccountToConfig(existing) : null,
          accountId,
          runtimeProviderKey
        );
        sendJson(res, 200, { success: true });
        return true;
      }
      await providerService2.deleteAccount(accountId);
      await syncDeletedProviderToRuntime(
        existing ? providerAccountToConfig(existing) : null,
        accountId,
        ctx.gatewayManager,
        runtimeProviderKey
      );
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/providers" && req.method === "GET") {
    logLegacyProviderRoute("GET /api/providers");
    sendJson(res, 200, await providerService2.listLegacyProvidersWithKeyInfo());
    return true;
  }
  if (url.pathname === "/api/providers/default" && req.method === "GET") {
    logLegacyProviderRoute("GET /api/providers/default");
    sendJson(res, 200, { providerId: await providerService2.getDefaultLegacyProvider() ?? null });
    return true;
  }
  if (url.pathname === "/api/providers/default" && req.method === "PUT") {
    logLegacyProviderRoute("PUT /api/providers/default");
    try {
      const body = await parseJsonBody(req);
      await providerService2.setDefaultLegacyProvider(body.providerId);
      await syncDefaultProviderToRuntime(body.providerId, ctx.gatewayManager);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/providers/validate" && req.method === "POST") {
    logLegacyProviderRoute("POST /api/providers/validate");
    try {
      const body = await parseJsonBody(req);
      const provider = await providerService2.getLegacyProvider(body.providerId);
      const providerType = provider?.type || body.providerId;
      const registryBaseUrl = getProviderConfig(providerType)?.baseUrl;
      const resolvedBaseUrl = body.options?.baseUrl || provider?.baseUrl || registryBaseUrl;
      const resolvedProtocol = body.options?.apiProtocol || provider?.apiProtocol;
      sendJson(res, 200, await validateApiKeyWithProvider(providerType, body.apiKey, { baseUrl: resolvedBaseUrl, apiProtocol: resolvedProtocol }));
    } catch (error2) {
      sendJson(res, 500, { valid: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/providers/oauth/start" && req.method === "POST") {
    logLegacyProviderRoute("POST /api/providers/oauth/start");
    try {
      const body = await parseJsonBody(req);
      if (body.provider === "google" || body.provider === "openai") {
        await browserOAuthManager.startFlow(body.provider, {
          accountId: body.accountId,
          label: body.label
        });
      } else {
        await deviceOAuthManager.startFlow(body.provider, body.region, {
          accountId: body.accountId,
          label: body.label
        });
      }
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/providers/oauth/cancel" && req.method === "POST") {
    logLegacyProviderRoute("POST /api/providers/oauth/cancel");
    try {
      await deviceOAuthManager.stopFlow();
      await browserOAuthManager.stopFlow();
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/providers/oauth/submit" && req.method === "POST") {
    logLegacyProviderRoute("POST /api/providers/oauth/submit");
    try {
      const body = await parseJsonBody(req);
      const accepted = browserOAuthManager.submitManualCode(body.code || "");
      if (!accepted) {
        sendJson(res, 400, { success: false, error: "No active manual OAuth input pending" });
        return true;
      }
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/providers" && req.method === "POST") {
    logLegacyProviderRoute("POST /api/providers");
    try {
      const body = await parseJsonBody(req);
      const config = body.config;
      await providerService2.saveLegacyProvider(config);
      if (body.apiKey !== void 0) {
        const trimmedKey = body.apiKey.trim();
        if (trimmedKey) {
          await providerService2.setLegacyProviderApiKey(config.id, trimmedKey);
          await syncProviderApiKeyToRuntime(config.type, config.id, trimmedKey);
        }
      }
      await syncSavedProviderToRuntime(config, body.apiKey, ctx.gatewayManager);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/providers/") && req.method === "GET") {
    logLegacyProviderRoute("GET /api/providers/:id");
    const providerId = decodeURIComponent(url.pathname.slice("/api/providers/".length));
    if (providerId.endsWith("/api-key")) {
      const actualId = providerId.slice(0, -"/api-key".length);
      sendJson(res, 200, { apiKey: await providerService2.getLegacyProviderApiKey(actualId) });
      return true;
    }
    if (providerId.endsWith("/has-api-key")) {
      const actualId = providerId.slice(0, -"/has-api-key".length);
      sendJson(res, 200, { hasKey: await providerService2.hasLegacyProviderApiKey(actualId) });
      return true;
    }
    sendJson(res, 200, await providerService2.getLegacyProvider(providerId));
    return true;
  }
  if (url.pathname.startsWith("/api/providers/") && req.method === "PUT") {
    logLegacyProviderRoute("PUT /api/providers/:id");
    const providerId = decodeURIComponent(url.pathname.slice("/api/providers/".length));
    try {
      const body = await parseJsonBody(req);
      const existing = await providerService2.getLegacyProvider(providerId);
      if (!existing) {
        sendJson(res, 404, { success: false, error: "Provider not found" });
        return true;
      }
      const nextConfig = { ...existing, ...body.updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await providerService2.saveLegacyProvider(nextConfig);
      if (body.apiKey !== void 0) {
        const trimmedKey = body.apiKey.trim();
        if (trimmedKey) {
          await providerService2.setLegacyProviderApiKey(providerId, trimmedKey);
          await syncProviderApiKeyToRuntime(nextConfig.type, providerId, trimmedKey);
        } else {
          await providerService2.deleteLegacyProviderApiKey(providerId);
          await syncDeletedProviderApiKeyToRuntime(existing, providerId);
        }
      }
      await syncUpdatedProviderToRuntime(nextConfig, body.apiKey, ctx.gatewayManager);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/providers/") && req.method === "DELETE") {
    logLegacyProviderRoute("DELETE /api/providers/:id");
    const providerId = decodeURIComponent(url.pathname.slice("/api/providers/".length));
    try {
      const existing = await providerService2.getLegacyProvider(providerId);
      if (url.searchParams.get("apiKeyOnly") === "1") {
        await providerService2.deleteLegacyProviderApiKey(providerId);
        await syncDeletedProviderApiKeyToRuntime(existing, providerId);
        sendJson(res, 200, { success: true });
        return true;
      }
      await providerService2.deleteLegacyProvider(providerId);
      await syncDeletedProviderToRuntime(existing, providerId, ctx.gatewayManager);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
function scheduleGatewayReload(ctx, reason) {
  if (ctx.gatewayManager.getStatus().state !== "stopped") {
    ctx.gatewayManager.debouncedReload();
    return;
  }
}
async function handleAgentRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/agents" && req.method === "GET") {
    sendJson(res, 200, { success: true, ...await listAgentsSnapshot() });
    return true;
  }
  if (url.pathname === "/api/agents" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const snapshot = await createAgent(body.name);
      scheduleGatewayReload(ctx, "create-agent");
      sendJson(res, 200, { success: true, ...snapshot });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/agents/") && req.method === "PUT") {
    const suffix = url.pathname.slice("/api/agents/".length);
    const parts = suffix.split("/").filter(Boolean);
    if (parts.length === 1) {
      try {
        const body = await parseJsonBody(req);
        const agentId = decodeURIComponent(parts[0]);
        const snapshot = await updateAgentName(agentId, body.name);
        scheduleGatewayReload(ctx, "update-agent");
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error2) {
        sendJson(res, 500, { success: false, error: String(error2) });
      }
      return true;
    }
    if (parts.length === 3 && parts[1] === "channels") {
      try {
        const agentId = decodeURIComponent(parts[0]);
        const channelType = decodeURIComponent(parts[2]);
        const snapshot = await assignChannelToAgent(agentId, channelType);
        scheduleGatewayReload(ctx, "assign-channel");
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error2) {
        sendJson(res, 500, { success: false, error: String(error2) });
      }
      return true;
    }
  }
  if (url.pathname.startsWith("/api/agents/") && req.method === "DELETE") {
    const suffix = url.pathname.slice("/api/agents/".length);
    const parts = suffix.split("/").filter(Boolean);
    if (parts.length === 1) {
      try {
        const agentId = decodeURIComponent(parts[0]);
        const snapshot = await deleteAgentConfig(agentId);
        scheduleGatewayReload(ctx, "delete-agent");
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error2) {
        sendJson(res, 500, { success: false, error: String(error2) });
      }
      return true;
    }
    if (parts.length === 3 && parts[1] === "channels") {
      try {
        const agentId = decodeURIComponent(parts[0]);
        const channelType = decodeURIComponent(parts[2]);
        const accountId = resolveAccountIdForAgent(agentId);
        await deleteChannelAccountConfig(channelType, accountId);
        const snapshot = await clearChannelBinding(channelType, accountId);
        scheduleGatewayReload(ctx, "remove-agent-channel");
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error2) {
        sendJson(res, 500, { success: false, error: String(error2) });
      }
      return true;
    }
  }
  return false;
}
function scheduleGatewayChannelRestart(ctx, reason) {
  if (ctx.gatewayManager.getStatus().state === "stopped") {
    return;
  }
  ctx.gatewayManager.debouncedRestart();
}
async function ensureDingTalkPluginInstalled() {
  const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "dingtalk");
  const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
  if (node_fs.existsSync(targetManifest)) {
    return { installed: true };
  }
  const candidateSources = electron.app.isPackaged ? [
    node_path.join(process.resourcesPath, "openclaw-plugins", "dingtalk"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "dingtalk"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "dingtalk")
  ] : [
    node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "dingtalk"),
    node_path.join(process.cwd(), "build", "openclaw-plugins", "dingtalk"),
    node_path.join(__dirname, "../../../build/openclaw-plugins/dingtalk")
  ];
  const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled DingTalk plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
    };
  }
  try {
    node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
    node_fs.rmSync(targetDir, { recursive: true, force: true });
    node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!node_fs.existsSync(targetManifest)) {
      return { installed: false, warning: "Failed to install DingTalk plugin mirror (manifest missing)." };
    }
    return { installed: true };
  } catch {
    return { installed: false, warning: "Failed to install bundled DingTalk plugin mirror" };
  }
}
async function ensureWeComPluginInstalled() {
  const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "wecom");
  const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
  if (node_fs.existsSync(targetManifest)) {
    return { installed: true };
  }
  const candidateSources = electron.app.isPackaged ? [
    node_path.join(process.resourcesPath, "openclaw-plugins", "wecom"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "wecom"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "wecom")
  ] : [
    node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "wecom"),
    node_path.join(process.cwd(), "build", "openclaw-plugins", "wecom"),
    node_path.join(__dirname, "../../../build/openclaw-plugins/wecom")
  ];
  const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled WeCom plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
    };
  }
  try {
    node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
    node_fs.rmSync(targetDir, { recursive: true, force: true });
    node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!node_fs.existsSync(targetManifest)) {
      return { installed: false, warning: "Failed to install WeCom plugin mirror (manifest missing)." };
    }
    return { installed: true };
  } catch {
    return { installed: false, warning: "Failed to install bundled WeCom plugin mirror" };
  }
}
async function ensureFeishuPluginInstalled() {
  const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "feishu-openclaw-plugin");
  const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
  if (node_fs.existsSync(targetManifest)) {
    return { installed: true };
  }
  const candidateSources = electron.app.isPackaged ? [
    node_path.join(process.resourcesPath, "openclaw-plugins", "feishu-openclaw-plugin"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "feishu-openclaw-plugin"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "feishu-openclaw-plugin")
  ] : [
    node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "feishu-openclaw-plugin"),
    node_path.join(process.cwd(), "build", "openclaw-plugins", "feishu-openclaw-plugin"),
    node_path.join(__dirname, "../../../build/openclaw-plugins/feishu-openclaw-plugin")
  ];
  const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled Feishu plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
    };
  }
  try {
    node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
    node_fs.rmSync(targetDir, { recursive: true, force: true });
    node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!node_fs.existsSync(targetManifest)) {
      return { installed: false, warning: "Failed to install Feishu plugin mirror (manifest missing)." };
    }
    return { installed: true };
  } catch {
    return { installed: false, warning: "Failed to install bundled Feishu plugin mirror" };
  }
}
async function ensureQQBotPluginInstalled() {
  const targetDir = node_path.join(node_os.homedir(), ".openclaw", "extensions", "qqbot");
  const targetManifest = node_path.join(targetDir, "openclaw.plugin.json");
  if (node_fs.existsSync(targetManifest)) {
    return { installed: true };
  }
  const candidateSources = electron.app.isPackaged ? [
    node_path.join(process.resourcesPath, "openclaw-plugins", "qqbot"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "build", "openclaw-plugins", "qqbot"),
    node_path.join(process.resourcesPath, "app.asar.unpacked", "openclaw-plugins", "qqbot")
  ] : [
    node_path.join(electron.app.getAppPath(), "build", "openclaw-plugins", "qqbot"),
    node_path.join(process.cwd(), "build", "openclaw-plugins", "qqbot"),
    node_path.join(__dirname, "../../../build/openclaw-plugins/qqbot")
  ];
  const sourceDir = candidateSources.find((dir) => node_fs.existsSync(node_path.join(dir, "openclaw.plugin.json")));
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled QQ Bot plugin mirror not found. Checked: ${candidateSources.join(" | ")}`
    };
  }
  try {
    node_fs.mkdirSync(node_path.join(node_os.homedir(), ".openclaw", "extensions"), { recursive: true });
    node_fs.rmSync(targetDir, { recursive: true, force: true });
    node_fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!node_fs.existsSync(targetManifest)) {
      return { installed: false, warning: "Failed to install QQ Bot plugin mirror (manifest missing)." };
    }
    return { installed: true };
  } catch {
    return { installed: false, warning: "Failed to install bundled QQ Bot plugin mirror" };
  }
}
async function handleChannelRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/channels/configured" && req.method === "GET") {
    sendJson(res, 200, { success: true, channels: await listConfiguredChannels() });
    return true;
  }
  if (url.pathname === "/api/channels/config/validate" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      sendJson(res, 200, { success: true, ...await validateChannelConfig(body.channelType) });
    } catch (error2) {
      sendJson(res, 500, { success: false, valid: false, errors: [String(error2)], warnings: [] });
    }
    return true;
  }
  if (url.pathname === "/api/channels/credentials/validate" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      sendJson(res, 200, { success: true, ...await validateChannelCredentials(body.channelType, body.config) });
    } catch (error2) {
      sendJson(res, 500, { success: false, valid: false, errors: [String(error2)], warnings: [] });
    }
    return true;
  }
  if (url.pathname === "/api/channels/whatsapp/start" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      await whatsAppLoginManager.start(body.accountId);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/channels/whatsapp/cancel" && req.method === "POST") {
    try {
      await whatsAppLoginManager.stop();
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/channels/config" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      if (body.channelType === "dingtalk") {
        const installResult = await ensureDingTalkPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || "DingTalk plugin install failed" });
          return true;
        }
      }
      if (body.channelType === "wecom") {
        const installResult = await ensureWeComPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || "WeCom plugin install failed" });
          return true;
        }
      }
      if (body.channelType === "qqbot") {
        const installResult = await ensureQQBotPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || "QQ Bot plugin install failed" });
          return true;
        }
      }
      if (body.channelType === "feishu") {
        const installResult = await ensureFeishuPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, { success: false, error: installResult.warning || "Feishu plugin install failed" });
          return true;
        }
      }
      await saveChannelConfig(body.channelType, body.config, body.accountId);
      scheduleGatewayChannelRestart(ctx, `channel:saveConfig:${body.channelType}`);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/channels/config/enabled" && req.method === "PUT") {
    try {
      const body = await parseJsonBody(req);
      await setChannelEnabled(body.channelType, body.enabled);
      scheduleGatewayChannelRestart(ctx, `channel:setEnabled:${body.channelType}`);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/channels/config/") && req.method === "GET") {
    try {
      const channelType = decodeURIComponent(url.pathname.slice("/api/channels/config/".length));
      const accountId = url.searchParams.get("accountId") || void 0;
      sendJson(res, 200, {
        success: true,
        values: await getChannelFormValues(channelType, accountId)
      });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/channels/config/") && req.method === "DELETE") {
    try {
      const channelType = decodeURIComponent(url.pathname.slice("/api/channels/config/".length));
      await deleteChannelConfig(channelType);
      await clearAllBindingsForChannel(channelType);
      scheduleGatewayChannelRestart(ctx, `channel:deleteConfig:${channelType}`);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
async function handleLogRoutes(req, res, url, _ctx) {
  if (url.pathname === "/api/logs" && req.method === "GET") {
    const tailLines = Number(url.searchParams.get("tailLines") || "100");
    sendJson(res, 200, { content: await logger.readLogFile(Number.isFinite(tailLines) ? tailLines : 100) });
    return true;
  }
  if (url.pathname === "/api/logs/dir" && req.method === "GET") {
    sendJson(res, 200, { dir: logger.getLogDir() });
    return true;
  }
  if (url.pathname === "/api/logs/files" && req.method === "GET") {
    sendJson(res, 200, { files: await logger.listLogFiles() });
    return true;
  }
  return false;
}
async function handleUsageRoutes(req, res, url, _ctx) {
  if (url.pathname === "/api/usage/recent-token-history" && req.method === "GET") {
    const rawLimit = url.searchParams.get("limit");
    let limit;
    if (rawLimit != null && rawLimit.trim() !== "") {
      const parsedLimit = Number(rawLimit);
      if (Number.isFinite(parsedLimit)) {
        limit = Math.max(Math.floor(parsedLimit), 1);
      }
    }
    sendJson(res, 200, await getRecentTokenUsageHistory(limit));
    return true;
  }
  return false;
}
async function handleSkillRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/skills/configs" && req.method === "GET") {
    sendJson(res, 200, await getAllSkillConfigs());
    return true;
  }
  if (url.pathname === "/api/skills/config" && req.method === "PUT") {
    try {
      const body = await parseJsonBody(req);
      sendJson(res, 200, await updateSkillConfig(body.skillKey, {
        apiKey: body.apiKey,
        env: body.env
      }));
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/clawhub/search" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      sendJson(res, 200, {
        success: true,
        results: await ctx.clawHubService.search(body)
      });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/clawhub/install" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      await ctx.clawHubService.install(body);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/clawhub/uninstall" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      await ctx.clawHubService.uninstall(body);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/clawhub/list" && req.method === "GET") {
    try {
      sendJson(res, 200, { success: true, results: await ctx.clawHubService.listInstalled() });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/clawhub/open-readme" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      await ctx.clawHubService.openSkillReadme(body.skillKey || body.slug || "", body.slug);
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
const EXT_MIME_MAP = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".json": "application/json",
  ".xml": "application/xml",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".py": "text/x-python"
};
function getMimeType(ext) {
  return EXT_MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}
function mimeToExt(mimeType) {
  for (const [ext, mime] of Object.entries(EXT_MIME_MAP)) {
    if (mime === mimeType) return ext;
  }
  return "";
}
const OUTBOUND_DIR = node_path.join(node_os.homedir(), ".openclaw", "media", "outbound");
async function generateImagePreview(filePath, mimeType) {
  try {
    const img = electron.nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return null;
    const size = img.getSize();
    const maxDim = 512;
    if (size.width > maxDim || size.height > maxDim) {
      const resized = size.width >= size.height ? img.resize({ width: maxDim }) : img.resize({ height: maxDim });
      return `data:image/png;base64,${resized.toPNG().toString("base64")}`;
    }
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(filePath);
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
async function handleFileRoutes(req, res, url, _ctx) {
  if (url.pathname === "/api/files/stage-paths" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const fsP = await import("node:fs/promises");
      await fsP.mkdir(OUTBOUND_DIR, { recursive: true });
      const results = [];
      for (const filePath of body.filePaths) {
        const id = crypto$2.randomUUID();
        const ext = node_path.extname(filePath);
        const stagedPath = node_path.join(OUTBOUND_DIR, `${id}${ext}`);
        await fsP.copyFile(filePath, stagedPath);
        const s = await fsP.stat(stagedPath);
        const mimeType = getMimeType(ext);
        const fileName = filePath.split(/[\\/]/).pop() || "file";
        const preview = mimeType.startsWith("image/") ? await generateImagePreview(stagedPath, mimeType) : null;
        results.push({ id, fileName, mimeType, fileSize: s.size, stagedPath, preview });
      }
      sendJson(res, 200, results);
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/files/stage-buffer" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const fsP = await import("node:fs/promises");
      await fsP.mkdir(OUTBOUND_DIR, { recursive: true });
      const id = crypto$2.randomUUID();
      const ext = node_path.extname(body.fileName) || mimeToExt(body.mimeType);
      const stagedPath = node_path.join(OUTBOUND_DIR, `${id}${ext}`);
      const buffer = Buffer.from(body.base64, "base64");
      await fsP.writeFile(stagedPath, buffer);
      const mimeType = body.mimeType || getMimeType(ext);
      const preview = mimeType.startsWith("image/") ? await generateImagePreview(stagedPath, mimeType) : null;
      sendJson(res, 200, {
        id,
        fileName: body.fileName,
        mimeType,
        fileSize: buffer.length,
        stagedPath,
        preview
      });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/files/thumbnails" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const fsP = await import("node:fs/promises");
      const results = {};
      for (const { filePath, mimeType } of body.paths) {
        try {
          const s = await fsP.stat(filePath);
          const preview = mimeType.startsWith("image/") ? await generateImagePreview(filePath, mimeType) : null;
          results[filePath] = { preview, fileSize: s.size };
        } catch {
          results[filePath] = { preview: null, fileSize: 0 };
        }
      }
      sendJson(res, 200, results);
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/files/save-image" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const ext = body.defaultFileName.includes(".") ? body.defaultFileName.split(".").pop() : body.mimeType?.split("/")[1] || "png";
      const result = await electron.dialog.showSaveDialog({
        defaultPath: node_path.join(node_os.homedir(), "Downloads", body.defaultFileName),
        filters: [
          { name: "Images", extensions: [ext, "png", "jpg", "jpeg", "webp", "gif"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });
      if (result.canceled || !result.filePath) {
        sendJson(res, 200, { success: false });
        return true;
      }
      const fsP = await import("node:fs/promises");
      if (body.filePath) {
        await fsP.copyFile(body.filePath, result.filePath);
      } else if (body.base64) {
        await fsP.writeFile(result.filePath, Buffer.from(body.base64, "base64"));
      } else {
        sendJson(res, 400, { success: false, error: "No image data provided" });
        return true;
      }
      sendJson(res, 200, { success: true, savedPath: result.filePath });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
async function handleSessionRoutes(req, res, url, _ctx) {
  if (url.pathname === "/api/sessions/delete" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const sessionKey = body.sessionKey;
      if (!sessionKey || !sessionKey.startsWith("agent:")) {
        sendJson(res, 400, { success: false, error: `Invalid sessionKey: ${sessionKey}` });
        return true;
      }
      const parts = sessionKey.split(":");
      if (parts.length < 3) {
        sendJson(res, 400, { success: false, error: `sessionKey has too few parts: ${sessionKey}` });
        return true;
      }
      const agentId = parts[1];
      const sessionsDir = node_path.join(getOpenClawConfigDir(), "agents", agentId, "sessions");
      const sessionsJsonPath = node_path.join(sessionsDir, "sessions.json");
      const fsP = await import("node:fs/promises");
      const raw = await fsP.readFile(sessionsJsonPath, "utf8");
      const sessionsJson = JSON.parse(raw);
      let uuidFileName;
      let resolvedSrcPath;
      if (Array.isArray(sessionsJson.sessions)) {
        const entry = sessionsJson.sessions.find((s) => s.key === sessionKey || s.sessionKey === sessionKey);
        if (entry) {
          uuidFileName = entry.file ?? entry.fileName ?? entry.path;
          if (!uuidFileName && typeof entry.id === "string") {
            uuidFileName = `${entry.id}.jsonl`;
          }
        }
      }
      if (!uuidFileName && sessionsJson[sessionKey] != null) {
        const val = sessionsJson[sessionKey];
        if (typeof val === "string") {
          uuidFileName = val;
        } else if (typeof val === "object" && val !== null) {
          const entry = val;
          const absFile = entry.sessionFile ?? entry.file ?? entry.fileName ?? entry.path;
          if (absFile) {
            if (absFile.startsWith("/") || absFile.match(/^[A-Za-z]:\\/)) {
              resolvedSrcPath = absFile;
            } else {
              uuidFileName = absFile;
            }
          } else {
            const uuidVal = entry.id ?? entry.sessionId;
            if (uuidVal) uuidFileName = uuidVal.endsWith(".jsonl") ? uuidVal : `${uuidVal}.jsonl`;
          }
        }
      }
      if (!uuidFileName && !resolvedSrcPath) {
        sendJson(res, 404, { success: false, error: `Cannot resolve file for session: ${sessionKey}` });
        return true;
      }
      if (!resolvedSrcPath) {
        if (!uuidFileName.endsWith(".jsonl")) uuidFileName = `${uuidFileName}.jsonl`;
        resolvedSrcPath = node_path.join(sessionsDir, uuidFileName);
      }
      const dstPath = resolvedSrcPath.replace(/\.jsonl$/, ".deleted.jsonl");
      try {
        await fsP.access(resolvedSrcPath);
        await fsP.rename(resolvedSrcPath, dstPath);
      } catch {
      }
      const raw2 = await fsP.readFile(sessionsJsonPath, "utf8");
      const json2 = JSON.parse(raw2);
      if (Array.isArray(json2.sessions)) {
        json2.sessions = json2.sessions.filter((s) => s.key !== sessionKey && s.sessionKey !== sessionKey);
      } else if (json2[sessionKey]) {
        delete json2[sessionKey];
      }
      await fsP.writeFile(sessionsJsonPath, JSON.stringify(json2, null, 2), "utf8");
      sendJson(res, 200, { success: true });
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
function transformCronJob(job) {
  const message = job.payload?.message || job.payload?.text || "";
  const channelType = job.delivery?.channel;
  const target = channelType ? { channelType, channelId: channelType, channelName: channelType } : void 0;
  const lastRun = job.state?.lastRunAtMs ? {
    time: new Date(job.state.lastRunAtMs).toISOString(),
    success: job.state.lastStatus === "ok",
    error: job.state.lastError,
    duration: job.state.lastDurationMs
  } : void 0;
  const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : void 0;
  return {
    id: job.id,
    name: job.name,
    message,
    schedule: job.schedule,
    target,
    enabled: job.enabled,
    createdAt: new Date(job.createdAtMs).toISOString(),
    updatedAt: new Date(job.updatedAtMs).toISOString(),
    lastRun,
    nextRun
  };
}
async function handleCronRoutes(req, res, url, ctx) {
  if (url.pathname === "/api/cron/jobs" && req.method === "GET") {
    try {
      const result = await ctx.gatewayManager.rpc("cron.list", { includeDisabled: true });
      const data = result;
      const jobs = data?.jobs ?? [];
      for (const job of jobs) {
        const isIsolatedAgent = (job.sessionTarget === "isolated" || !job.sessionTarget) && job.payload?.kind === "agentTurn";
        const needsRepair = isIsolatedAgent && job.delivery?.mode === "announce" && !job.delivery?.channel;
        if (needsRepair) {
          try {
            await ctx.gatewayManager.rpc("cron.update", {
              id: job.id,
              patch: { delivery: { mode: "none" } }
            });
            job.delivery = { mode: "none" };
            if (job.state?.lastError?.includes("Channel is required")) {
              job.state.lastError = void 0;
              job.state.lastStatus = "ok";
            }
          } catch {
          }
        }
      }
      sendJson(res, 200, jobs.map(transformCronJob));
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/cron/jobs" && req.method === "POST") {
    try {
      const input = await parseJsonBody(req);
      const result = await ctx.gatewayManager.rpc("cron.add", {
        name: input.name,
        schedule: { kind: "cron", expr: input.schedule },
        payload: { kind: "agentTurn", message: input.message },
        enabled: input.enabled ?? true,
        wakeMode: "next-heartbeat",
        sessionTarget: "isolated",
        delivery: { mode: "none" }
      });
      sendJson(res, 200, result && typeof result === "object" ? transformCronJob(result) : result);
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/cron/jobs/") && req.method === "PUT") {
    try {
      const id = decodeURIComponent(url.pathname.slice("/api/cron/jobs/".length));
      const input = await parseJsonBody(req);
      const patch = { ...input };
      if (typeof patch.schedule === "string") {
        patch.schedule = { kind: "cron", expr: patch.schedule };
      }
      if (typeof patch.message === "string") {
        patch.payload = { kind: "agentTurn", message: patch.message };
        delete patch.message;
      }
      sendJson(res, 200, await ctx.gatewayManager.rpc("cron.update", { id, patch }));
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname.startsWith("/api/cron/jobs/") && req.method === "DELETE") {
    try {
      const id = decodeURIComponent(url.pathname.slice("/api/cron/jobs/".length));
      sendJson(res, 200, await ctx.gatewayManager.rpc("cron.remove", { id }));
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/cron/toggle" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      sendJson(res, 200, await ctx.gatewayManager.rpc("cron.update", { id: body.id, patch: { enabled: body.enabled } }));
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  if (url.pathname === "/api/cron/trigger" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      sendJson(res, 200, await ctx.gatewayManager.rpc("cron.run", { id: body.id, mode: "force" }));
    } catch (error2) {
      sendJson(res, 500, { success: false, error: String(error2) });
    }
    return true;
  }
  return false;
}
const routeHandlers = [
  handleAppRoutes,
  handleGatewayRoutes,
  handleSettingsRoutes,
  handleProviderRoutes,
  handleAgentRoutes,
  handleChannelRoutes,
  handleSkillRoutes,
  handleFileRoutes,
  handleSessionRoutes,
  handleCronRoutes,
  handleLogRoutes,
  handleUsageRoutes
];
function startHostApiServer(ctx, port = PORTS.CLAWX_HOST_API) {
  const server = node_http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      for (const handler of routeHandlers) {
        if (await handler(req, res, requestUrl, ctx)) {
          return;
        }
      }
      sendJson(res, 404, { success: false, error: `No route for ${req.method} ${requestUrl.pathname}` });
    } catch (error2) {
      logger.error("Host API request failed:", error2);
      sendJson(res, 500, { success: false, error: String(error2) });
    }
  });
  server.listen(port, "127.0.0.1", () => {
    logger.info(`Host API server listening on http://127.0.0.1:${port}`);
  });
  return server;
}
class HostEventBus {
  clients = /* @__PURE__ */ new Set();
  addSseClient(res) {
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }
  emit(eventName, payload) {
    const message = `event: ${eventName}
data: ${JSON.stringify(payload)}

`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }
  closeAll() {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
      }
    }
    this.clients.clear();
  }
}
electron.app.disableHardwareAcceleration();
if (process.platform === "linux") {
  electron.app.setDesktopName("yuewei-group.desktop");
}
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
}
exports.mainWindow = null;
const gatewayManager = new GatewayManager();
const clawHubService = new ClawHubService();
const hostEventBus = new HostEventBus();
let hostApiServer = null;
function getIconsDir() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "resources", "icons");
  }
  return path.join(__dirname, "../../resources/icons");
}
function getAppIcon() {
  if (process.platform === "darwin") return void 0;
  const iconsDir = getIconsDir();
  const iconPath = process.platform === "win32" ? path.join(iconsDir, "icon.ico") : path.join(iconsDir, "icon.png");
  const icon = electron.nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? void 0 : icon;
}
function createWindow() {
  const isMac = process.platform === "darwin";
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: getAppIcon(),
    title: "YUEWEI 集团",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
      // Enable <webview> for embedding OpenClaw Control UI
    },
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: isMac ? { x: 16, y: 16 } : void 0,
    frame: isMac,
    show: false
  });
  win.once("ready-to-show", () => {
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
  injectEnterpriseRendererUI(win);
  return win;
}
async function initialize() {
  logger.init();
  logger.info("=== YUEWEI 集团 Application Starting ===");
  logger.debug(
    `Runtime: platform=${process.platform}/${process.arch}, electron=${process.versions.electron}, node=${process.versions.node}, packaged=${electron.app.isPackaged}`
  );
  void warmupNetworkOptimization();
  await initTelemetry();
  await applyProxySettings();
  await syncLaunchAtStartupSettingFromStore();
  createMenu();
  exports.mainWindow = createWindow();
  createTray(exports.mainWindow);
  electron.session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://127.0.0.1:18790/*", "http://localhost:18790/*", "http://120.24.116.82:18790/*"] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers["X-Frame-Options"];
      delete headers["x-frame-options"];
      if (headers["Content-Security-Policy"]) {
        headers["Content-Security-Policy"] = headers["Content-Security-Policy"].map(
          (csp) => csp.replace(/frame-ancestors\s+'none'/g, "frame-ancestors 'self' *")
        );
      }
      if (headers["content-security-policy"]) {
        headers["content-security-policy"] = headers["content-security-policy"].map(
          (csp) => csp.replace(/frame-ancestors\s+'none'/g, "frame-ancestors 'self' *")
        );
      }
      callback({ responseHeaders: headers });
    }
  );
  registerIpcHandlers(gatewayManager, clawHubService, exports.mainWindow);
  hostApiServer = startHostApiServer({
    gatewayManager,
    clawHubService,
    eventBus: hostEventBus,
    mainWindow: exports.mainWindow
  });
  registerUpdateHandlers(appUpdater, exports.mainWindow);
  exports.mainWindow.on("close", (event) => {
    if (!isQuitting()) {
      event.preventDefault();
      exports.mainWindow?.hide();
    }
  });
  exports.mainWindow.on("closed", () => {
    exports.mainWindow = null;
  });
  void repairClawXOnlyBootstrapFiles().catch((error2) => {
    logger.warn("Failed to repair bootstrap files:", error2);
  });
  void ensureBuiltinSkillsInstalled().catch((error2) => {
    logger.warn("Failed to install built-in skills:", error2);
  });
  void ensurePreinstalledSkillsInstalled().catch((error2) => {
    logger.warn("Failed to install preinstalled skills:", error2);
  });
  gatewayManager.on("status", (status) => {
    hostEventBus.emit("gateway:status", status);
    if (status.state === "running") {
      void ensureClawXContext().catch((error2) => {
        logger.warn("Failed to re-merge ClawX context after gateway reconnect:", error2);
      });
    }
  });
  gatewayManager.on("error", (error2) => {
    hostEventBus.emit("gateway:error", { message: error2.message });
  });
  gatewayManager.on("notification", (notification) => {
    hostEventBus.emit("gateway:notification", notification);
  });
  gatewayManager.on("chat:message", (data) => {
    hostEventBus.emit("gateway:chat-message", data);
  });
  gatewayManager.on("channel:status", (data) => {
    hostEventBus.emit("gateway:channel-status", data);
  });
  gatewayManager.on("exit", (code) => {
    hostEventBus.emit("gateway:exit", { code });
  });
  deviceOAuthManager.on("oauth:code", (payload) => {
    hostEventBus.emit("oauth:code", payload);
  });
  deviceOAuthManager.on("oauth:start", (payload) => {
    hostEventBus.emit("oauth:start", payload);
  });
  deviceOAuthManager.on("oauth:success", (payload) => {
    hostEventBus.emit("oauth:success", { ...payload, success: true });
  });
  deviceOAuthManager.on("oauth:error", (error2) => {
    hostEventBus.emit("oauth:error", error2);
  });
  browserOAuthManager.on("oauth:start", (payload) => {
    hostEventBus.emit("oauth:start", payload);
  });
  browserOAuthManager.on("oauth:code", (payload) => {
    hostEventBus.emit("oauth:code", payload);
  });
  browserOAuthManager.on("oauth:success", (payload) => {
    hostEventBus.emit("oauth:success", { ...payload, success: true });
  });
  browserOAuthManager.on("oauth:error", (error2) => {
    hostEventBus.emit("oauth:error", error2);
  });
  whatsAppLoginManager.on("qr", (data) => {
    hostEventBus.emit("channel:whatsapp-qr", data);
  });
  whatsAppLoginManager.on("success", (data) => {
    hostEventBus.emit("channel:whatsapp-success", data);
  });
  whatsAppLoginManager.on("error", (error2) => {
    hostEventBus.emit("channel:whatsapp-error", error2);
  });
  const gatewayAutoStart = await getSetting("gatewayAutoStart");
  if (gatewayAutoStart) {
    try {
      await syncAllProviderAuthToRuntime();
      logger.debug("Auto-starting Gateway...");
      await gatewayManager.start();
      logger.info("Gateway auto-start succeeded");
    } catch (error2) {
      logger.error("Gateway auto-start failed:", error2);
      exports.mainWindow?.webContents.send("gateway:error", String(error2));
    }
  } else {
    logger.info("Gateway auto-start disabled in settings");
  }
  void ensureClawXContext().catch((error2) => {
    logger.warn("Failed to merge ClawX context into workspace:", error2);
  });
  void autoInstallCliIfNeeded((installedPath) => {
    exports.mainWindow?.webContents.send("openclaw:cli-installed", installedPath);
  }).then(() => {
    generateCompletionCache();
    installCompletionToProfile();
  }).catch((error2) => {
    logger.warn("CLI auto-install failed:", error2);
  });
  // Enterprise: run activation check after app is ready
  void enterpriseInit().catch((err) => {
    logger.warn("Enterprise init failed:", err);
  });
}

// ============================================================
// Enterprise Management Module
// ============================================================

// IPC: renderer can request current user info
electron.ipcMain.handle("enterprise:get-user", async () => {
  const cfg = await readEnterpriseConfig();
  if (!cfg) return null;
  return { employee_id: cfg.employee_id, name: cfg.name, device_id: cfg.device_id };
});

// IPC: renderer can trigger profile window
electron.ipcMain.handle("enterprise:open-profile", async () => {
  await showEnterpriseProfileWindow();
});
electron.ipcMain.handle("enterprise:sync-now", async () => {
  return await syncEnterpriseModelNow();
});
electron.ipcMain.handle("enterprise:logout", async () => {
  try {
    await promises.unlink(ENTERPRISE_CONFIG_FILE);
  } catch {}
  await clearEnterpriseModelConfig();
  if (exports.mainWindow && !exports.mainWindow.isDestroyed()) {
    exports.mainWindow.webContents.executeJavaScript(`
      if (window.__ent_render_logged_out__) {
        window.__ent_render_logged_out__();
      }
    `).catch(() => {});
  }
  logger.info("Enterprise user logged out");
  return { success: true };
});
electron.ipcMain.handle("enterprise:ensure-login", async () => {
  logger.info("enterprise:ensure-login invoked");
  const cfg = await ensureEnterpriseLoginInteractive();
  if (!cfg?.token || !cfg?.employee_id) {
    logger.info("enterprise:ensure-login result: not logged in");
    return { success: false };
  }
  logger.info(`enterprise:ensure-login result: ${cfg.name} (${cfg.employee_id})`);
  return {
    success: true,
    user: {
      employee_id: cfg.employee_id,
      name: cfg.name,
      device_id: cfg.device_id
    }
  };
});

// Inject avatar/login UI into renderer after page loads
function injectEnterpriseRendererUI(win) {
  win.webContents.on("did-finish-load", async () => {
    const cfg = await readEnterpriseConfig();
    const userJson = cfg
      ? JSON.stringify({ employee_id: cfg.employee_id, name: cfg.name })
      : "null";

    const script = `
(function() {
  try {
  if (window.__ent_bootstrap__) return;
  window.__ent_bootstrap__ = true;

  var user = ${userJson};
  window.__ent_user__ = user;
  window.__ent_requires_login__ = !user;

  // ── Styles ──────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = \`
    #__ent_avatar__ {
      position: fixed;
      top: 24px;
      right: 20px;
      z-index: 9999;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(180deg, #18458a, #14386f);
      border: 1px solid rgba(255,255,255,.08);
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(0,0,0,.35);
      user-select: none;
      font-family: system-ui, sans-serif;
      transition: transform .15s, box-shadow .15s;
      -webkit-app-region: no-drag;
    }
    #__ent_avatar__:hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 28px rgba(0,0,0,.4);
    }
    #__ent_menu__ {
      position: fixed;
      top: 72px;
      right: 20px;
      z-index: 10000;
      background: rgba(25, 27, 31, .98);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px;
      box-shadow: 0 18px 40px rgba(0,0,0,.45);
      overflow: hidden;
      font-family: system-ui, sans-serif;
      min-width: 188px;
      padding: 8px;
      -webkit-app-region: no-drag;
    }
    #__ent_menu__ button {
      display: block;
      width: 100%;
      padding: 12px 14px;
      background: none;
      border: none;
      border-radius: 12px;
      color: #f3f4f6;
      font-size: 14px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: background .12s, color .12s;
    }
    #__ent_menu__ button:hover { background: rgba(255,255,255,.06); }
    #__ent_menu__ button + button { margin-top: 4px; }
    #__ent_login_entry__ {
      position: fixed;
      top: 22px;
      right: 20px;
      z-index: 9999;
      height: 40px;
      padding: 0 16px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(24, 27, 34, .96);
      color: #eef2f7;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(0,0,0,.28);
      user-select: none;
      font-family: system-ui, sans-serif;
      transition: transform .15s, box-shadow .15s, background .15s;
      -webkit-app-region: no-drag;
    }
    #__ent_login_entry__:hover {
      transform: translateY(-1px);
      background: rgba(34, 39, 48, .98);
      box-shadow: 0 14px 28px rgba(0,0,0,.34);
    }
    #__ent_overlay__ {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(10,10,20,.75);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
    }
    #__ent_modal__ {
      background: #1a1a2e;
      border: 1px solid #2a2a4e;
      border-radius: 12px;
      padding: 32px 28px;
      width: 360px;
      color: #eee;
      box-shadow: 0 20px 60px rgba(0,0,0,.6);
    }
    #__ent_modal__ h2 {
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 700;
    }
    #__ent_modal__ p {
      margin: 0 0 20px;
      font-size: 13px;
      color: #888;
    }
    #__ent_modal__ label {
      display: block;
      font-size: 12px;
      color: #aaa;
      margin-bottom: 4px;
    }
    #__ent_modal__ input {
      width: 100%;
      box-sizing: border-box;
      padding: 9px 12px;
      border: 1px solid #3a3a5e;
      border-radius: 6px;
      background: #0f0f1e;
      color: #eee;
      font-size: 14px;
      margin-bottom: 14px;
      outline: none;
    }
    #__ent_modal__ input:focus { border-color: #0f3460; }
    #__ent_modal__ button {
      width: 100%;
      padding: 10px;
      background: #0f3460;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    #__ent_modal__ button:hover { background: #1a4a80; }
    #__ent_modal__ .err {
      font-size: 12px;
      color: #f87171;
      margin-top: -8px;
      margin-bottom: 10px;
      min-height: 16px;
    }
  \`;
  document.head.appendChild(style);

  function removeNode(id) {
    var node = document.getElementById(id);
    if (node) node.remove();
  }

  function closeMenu() {
    removeNode('__ent_menu__');
  }

  function ensureOverlay() {
    var overlay = document.getElementById('__ent_overlay__');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = '__ent_overlay__';
    var modal = document.createElement('div');
    modal.id = '__ent_modal__';
    modal.innerHTML = \`
      <h2>企业版登录</h2>
      <p id="__ent_desc__">请输入手机号码和姓名后继续对话。</p>
      <label>手机号码</label>
      <input id="__ent_eid__" placeholder="例如：13928816227" autocomplete="off" />
      <label>姓名</label>
      <input id="__ent_name__" placeholder="例如：张三" autocomplete="off" />
      <div class="err" id="__ent_err__"></div>
      <div style="display:flex;gap:10px;">
        <button id="__ent_btn__" style="flex:1;">登录并激活</button>
        <button id="__ent_cancel__" style="flex:0 0 92px;background:#262b33;">关闭</button>
      </div>
    \`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('__ent_btn__').addEventListener('click', doActivate);
    document.getElementById('__ent_cancel__').addEventListener('click', hideOverlay);
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) hideOverlay();
    });
    return overlay;
  }

  function showOverlay(message) {
    var overlay = ensureOverlay();
    var desc = document.getElementById('__ent_desc__');
    if (desc && message) desc.textContent = message;
    overlay.style.display = 'flex';
    setTimeout(function() {
      var eidInput = document.getElementById('__ent_eid__');
      if (eidInput) eidInput.focus();
    }, 0);
  }

  function hideOverlay() {
    var overlay = document.getElementById('__ent_overlay__');
    if (overlay) overlay.style.display = 'none';
    var errEl = document.getElementById('__ent_err__');
    if (errEl) errEl.textContent = '';
    var btn = document.getElementById('__ent_btn__');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '登录并激活';
    }
  }

  function doActivate() {
    var eid = document.getElementById('__ent_eid__').value.trim();
    var name = document.getElementById('__ent_name__').value.trim();
    var errEl = document.getElementById('__ent_err__');
    if (!eid || !name) {
      errEl.textContent = '手机号码和姓名不能为空';
      return;
    }
    errEl.textContent = '';
    var btn = document.getElementById('__ent_btn__');
    btn.disabled = true;
    btn.textContent = '登录中…';
    window.__ent_activate__ = { employee_id: eid, name: name };
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('__ent_overlay__') && document.getElementById('__ent_overlay__').style.display === 'flex') {
      hideOverlay();
      return;
    }
    if (e.key === 'Enter' && document.getElementById('__ent_overlay__') && document.getElementById('__ent_overlay__').style.display === 'flex') {
      doActivate();
    }
  });

  window.__ent_open_menu__ = function() {
    var existing = document.getElementById('__ent_menu__');
    if (existing) { existing.remove(); return; }
    var menu = document.createElement('div');
    menu.id = '__ent_menu__';
    var btnSync = document.createElement('button');
    btnSync.textContent = '立即同步模型';
    btnSync.addEventListener('click', function() {
      menu.remove();
      window.__ent_sync_model__ = true;
    });
    var btnProfile = document.createElement('button');
    btnProfile.textContent = '个人信息';
    btnProfile.addEventListener('click', function() {
      menu.remove();
      window.electron.ipcRenderer.invoke('enterprise:open-profile');
    });
    menu.appendChild(btnSync);
    menu.appendChild(btnProfile);
    document.body.appendChild(menu);
    document.addEventListener('click', function handleCloseMenu() {
      closeMenu();
      document.removeEventListener('click', handleCloseMenu);
    }, { once: true });
  };

  window.__ent_render_logged_in__ = function(nextUser) {
    window.__ent_user__ = nextUser;
    window.__ent_requires_login__ = false;
    hideOverlay();
    removeNode('__ent_login_entry__');
    removeNode('__ent_avatar__');
    var initials = (nextUser.name || '?').charAt(0).toUpperCase();
    var avatar = document.createElement('div');
    avatar.id = '__ent_avatar__';
    avatar.title = nextUser.name + ' (' + nextUser.employee_id + ')';
    avatar.textContent = initials;
    avatar.addEventListener('click', function(e) {
      e.stopPropagation();
      window.__ent_open_menu__();
    });
    document.body.appendChild(avatar);
  };

  window.__ent_render_logged_out__ = function() {
    window.__ent_user__ = null;
    window.__ent_requires_login__ = true;
    hideOverlay();
    closeMenu();
    removeNode('__ent_avatar__');
    removeNode('__ent_login_entry__');
    var entry = document.createElement('button');
    entry.id = '__ent_login_entry__';
    entry.textContent = '员工登录';
    entry.addEventListener('click', function() {
      showOverlay('请输入手机号码和姓名后继续对话。');
    });
    document.body.appendChild(entry);
  };

  window.__ent_show_login__ = showOverlay;
  window.__ent_hide_login__ = hideOverlay;

  if (!window.__ent_ui_watchdog__) {
    window.__ent_ui_watchdog__ = setInterval(function() {
      if (window.__ent_requires_login__) {
        if (!document.getElementById('__ent_login_entry__')) {
          window.__ent_render_logged_out__();
        }
      } else if (window.__ent_user__) {
        if (!document.getElementById('__ent_avatar__')) {
          window.__ent_render_logged_in__(window.__ent_user__);
        }
      }
    }, 1500);
  }

  if (!window.__ent_chat_guard_installed__) {
    window.__ent_chat_guard_installed__ = true;
    var originalFetch = window.fetch ? window.fetch.bind(window) : null;
    if (originalFetch) {
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (window.__ent_requires_login__ && /\/api\/chat\/send-with-media(\?|$)/.test(url)) {
          showOverlay('请先完成员工登录，再发起对话。');
          return Promise.resolve(new Response(JSON.stringify({ error: 'enterprise_login_required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        return originalFetch(input, init);
      };
    }
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__ent_url__ = url;
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
      if (window.__ent_requires_login__ && /\/api\/chat\/send-with-media(\?|$)/.test(this.__ent_url__ || '')) {
        showOverlay('请先完成员工登录，再发起对话。');
        try { this.abort(); } catch (_) {}
        return;
      }
      return xhrSend.apply(this, arguments);
    };
  }

  if (user) {
    window.__ent_render_logged_in__(user);
  } else {
    window.__ent_render_logged_out__();
  }
  } catch (err) {
    window.__ent_inject_error__ = String((err && err.stack) || err);
    throw err;
  }
})();
`;
    try {
      await win.webContents.executeJavaScript(script);
    } catch (e) {
      logger.warn("Enterprise renderer inject failed:", e);
      try {
        const injectError = await win.webContents.executeJavaScript("window.__ent_inject_error__ || null");
        if (injectError) {
          logger.warn("Enterprise renderer inject detail:", injectError);
        }
      } catch {}
    }

    // If logged in, poll for model sync (every 60s + manual trigger)
    if (cfg) {
      let knownSyncVersion = (cfg.model_config && cfg.model_config.sync_version) || 0;
      const syncPoll = setInterval(async () => {
        if (!win || win.isDestroyed()) { clearInterval(syncPoll); return; }
        try {
          // Check manual trigger from renderer menu
          const manualTrigger = await win.webContents.executeJavaScript("window.__ent_sync_model__ || false");
          if (manualTrigger) {
            await win.webContents.executeJavaScript("window.__ent_sync_model__ = false");
          }
          // Fetch latest config from server
          const latestCfg = await readEnterpriseConfig();
          if (!latestCfg) { clearInterval(syncPoll); return; }
          let resp;
          try {
            resp = await enterpriseHttpRequest(
              { url: `${getEnterpriseServer(latestCfg)}/api/user/info`, method: "GET", headers: { "Authorization": `Bearer ${latestCfg.token}` } },
              null
            );
          } catch (err) {
            logger.warn("Enterprise sync check failed:", err);
            return;
          }
          if (resp.status !== 200) return;
          const serverVersion = (resp.body.config && resp.body.config.sync_version) || 0;
          if (serverVersion !== knownSyncVersion || manualTrigger) {
            // Show confirmation banner in renderer
            await win.webContents.executeJavaScript(`
              (function() {
                var existing = document.getElementById('__ent_sync_banner__');
                if (existing) return;
                var banner = document.createElement('div');
                banner.id = '__ent_sync_banner__';
                banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a1a2e;border:1px solid #0f3460;border-radius:10px;padding:14px 20px;color:#eee;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.5);display:flex;align-items:center;gap:12px;-webkit-app-region:no-drag;';
                var msg = document.createElement('span');
                msg.textContent = '模型已切换，点击确认后更新模型';
                var btn = document.createElement('button');
                btn.textContent = '确认';
                btn.style.cssText = 'background:#0f3460;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;';
                btn.addEventListener('click', function() {
                  banner.remove();
                  window.__ent_sync_confirm__ = true;
                });
                banner.appendChild(msg);
                banner.appendChild(btn);
                document.body.appendChild(banner);
              })();
            `);
            // Wait for user confirmation
            const confirmPoll = setInterval(async () => {
              if (!win || win.isDestroyed()) { clearInterval(confirmPoll); return; }
              try {
                const confirmed = await win.webContents.executeJavaScript("window.__ent_sync_confirm__ || false");
                if (confirmed) {
                  clearInterval(confirmPoll);
                  await win.webContents.executeJavaScript("window.__ent_sync_confirm__ = false");
                  // Apply new config
                  const updatedCfg = {
                    ...latestCfg,
                    model_config: resp.body.config,
                    config_cached_at: Date.now()
                  };
                  await writeEnterpriseConfig(updatedCfg);
                  await applyEnterpriseModelConfig(updatedCfg.model_config, updatedCfg.token);
                  knownSyncVersion = serverVersion;
                  logger.info(`Enterprise model synced to version ${serverVersion}`);
                }
              } catch {}
            }, 500);
          }
        } catch (err) {
          logger.warn("Enterprise sync poll error:", err);
        }
      }, 60000);
    }

    // If not logged in, poll for activation request from renderer
    if (!cfg) {
      const poll = setInterval(async () => {
        if (!win || win.isDestroyed()) { clearInterval(poll); return; }
        try {
          const req = await win.webContents.executeJavaScript("window.__ent_activate__ || null");
          if (req && req.employee_id && req.name) {
            clearInterval(poll);
            // Clear the signal
            await win.webContents.executeJavaScript("window.__ent_activate__ = null");
            // Perform activation
            const deviceId = crypto$1.randomUUID ? crypto$1.randomUUID() : crypto$1.randomBytes(16).toString("hex");
            let resp;
            try {
              resp = await enterpriseHttpRequest(
                { url: `${req.server || ENTERPRISE_SERVER_DEFAULT}/api/user/activate`, method: "POST" },
                { phone: req.employee_id, name: req.name, device_id: deviceId, device_name: os.hostname(), os_username: os.userInfo().username }
              );
            } catch (err) {
              await win.webContents.executeJavaScript(`
                document.getElementById('__ent_err__').textContent = '无法连接到企业服务器，请检查网络';
                var b = document.getElementById('__ent_btn__');
                if(b){b.disabled=false;b.textContent='登录并激活';}
              `);
              return;
            }
            if (resp.status !== 200) {
              await win.webContents.executeJavaScript(`
                document.getElementById('__ent_err__').textContent = '服务器返回错误：${resp.status}';
                var b = document.getElementById('__ent_btn__');
                if(b){b.disabled=false;b.textContent='登录并激活';}
              `);
              return;
            }
            const newCfg = {
              employee_id: req.employee_id,
              name: req.name,
              device_id: deviceId,
              token: resp.body.token,
              model_config: resp.body.config,
              config_cached_at: Date.now(),
              server: req.server || ENTERPRISE_SERVER_DEFAULT
            };
            await writeEnterpriseConfig(newCfg);
            await applyEnterpriseModelConfig(newCfg.model_config, newCfg.token);
            logger.info(`Enterprise activated via renderer: ${req.name} (${req.employee_id})`);
            const activatedUserJson = JSON.stringify({ employee_id: req.employee_id, name: req.name });
            await win.webContents.executeJavaScript(`
              if (window.__ent_render_logged_in__) {
                window.__ent_render_logged_in__(${activatedUserJson});
              }
            `);
          }
        } catch {}
      }, 400);
    }
  });
}
const ENTERPRISE_CONFIG_FILE = path.join(os.homedir(), ".openclaw", "clawx-enterprise.json");
const ENTERPRISE_SERVER_DEFAULT = "http://8.135.70.130:8026";
function getEnterpriseServer(cfg) {
  return (cfg && cfg.server) ? cfg.server : ENTERPRISE_SERVER_DEFAULT;
}
const ENTERPRISE_PROVIDER_KEY = "enterprise-proxy";
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

function enterpriseHttpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + (url.search || ""),
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      timeout: options.timeout || 10000
    };
    console.log("[enterpriseHttpRequest] URL:", options.url, "body:", JSON.stringify(body));
    const req = require("http").request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        console.log("[enterpriseHttpRequest] response status:", res.statusCode, "data:", data.substring(0, 200));
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", (e) => { console.log("[enterpriseHttpRequest] request error:", e.message); reject(e); });
    req.on("timeout", () => { console.log("[enterpriseHttpRequest] request timeout"); req.destroy(); reject(new Error("Request timeout")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function readEnterpriseConfig() {
  try {
    const raw = await promises.readFile(ENTERPRISE_CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeEnterpriseConfig(cfg) {
  await promises.mkdir(path.dirname(ENTERPRISE_CONFIG_FILE), { recursive: true });
  await promises.writeFile(ENTERPRISE_CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

async function applyEnterpriseModelConfig(modelConfig, token) {
  const config = await readOpenClawJson();
  const models = config.models || {};
  const providers = models.providers || {};
  providers[ENTERPRISE_PROVIDER_KEY] = {
    baseUrl: modelConfig.base_url,
    api: modelConfig.api || "openai-completions",
    models: [{ id: modelConfig.model_id, name: modelConfig.model_id }]
  };
  models.providers = providers;
  config.models = models;
  const agents = config.agents || {};
  const defaults2 = agents.defaults || {};
  defaults2.model = { primary: `${ENTERPRISE_PROVIDER_KEY}/${modelConfig.model_id}`, fallbacks: [] };
  agents.defaults = defaults2;
  config.agents = agents;
  await writeOpenClawJson(config);
  if (token) {
    await saveProviderKeyToOpenClaw(ENTERPRISE_PROVIDER_KEY, token);
  }
}

async function clearEnterpriseModelConfig() {
  const config = await readOpenClawJson();
  const models = config.models || {};
  const providers = models.providers || {};
  delete providers[ENTERPRISE_PROVIDER_KEY];
  models.providers = providers;
  config.models = models;
  const modelDefaults = config.agents?.defaults?.model;
  if (modelDefaults?.primary && modelDefaults.primary.startsWith(`${ENTERPRISE_PROVIDER_KEY}/`)) {
    const fallbackProviderId = Object.keys(providers)[0];
    const fallbackModelId = fallbackProviderId && providers[fallbackProviderId]?.models?.[0]?.id;
    if (fallbackProviderId && fallbackModelId) {
      config.agents.defaults.model.primary = `${fallbackProviderId}/${fallbackModelId}`;
    } else if (config.agents?.defaults?.model) {
      config.agents.defaults.model.primary = "";
    }
  }
  await writeOpenClawJson(config);
}

async function syncEnterpriseModelNow() {
  const cfg = await readEnterpriseConfig();
  if (!cfg?.token || !cfg?.employee_id) {
    return { success: false, error: "enterprise_not_logged_in" };
  }
  const resp = await enterpriseHttpRequest({
    url: `${getEnterpriseServer(cfg)}/api/user/info`,
    method: "GET",
    headers: { Authorization: `Bearer ${cfg.token}` }
  });
  if (resp.status !== 200 || !resp.body?.config) {
    return { success: false, error: `enterprise_sync_failed_${resp.status}` };
  }
  const nextCfg = {
    ...cfg,
    user: resp.body.user || cfg.user,
    config_cached_at: Date.now(),
    model_config: resp.body.config
  };
  if (resp.body?.user?.employee_id) nextCfg.employee_id = resp.body.user.employee_id;
  if (resp.body?.user?.name) nextCfg.name = resp.body.user.name;
  await writeEnterpriseConfig(nextCfg);
  await applyEnterpriseModelConfig(nextCfg.model_config, nextCfg.token);
  return {
    success: true,
    user: {
      employee_id: nextCfg.employee_id,
      name: nextCfg.name,
      device_id: nextCfg.device_id
    },
    config: nextCfg.model_config
  };
}

async function showActivationDialog() {
  return new Promise((resolve) => {
    const win = exports.mainWindow;
    if (!win) { resolve(null); return; }
    // Use a simple dialog via Electron's built-in dialog (no renderer changes needed)
    const { dialog } = electron;
    // We use a sequence of input dialogs
    dialog.showMessageBox(win, {
      type: "info",
      title: "企业版激活",
      message: "欢迎使用 OpenClaw 企业版\n请完成激活以继续使用。",
      buttons: ["开始激活", "退出"],
      defaultId: 0,
      cancelId: 1
    }).then(async ({ response }) => {
      if (response === 1) { electron.app.quit(); resolve(null); return; }
      // Prompt for employee_id
      const empResult = await dialog.showInputBox ? dialog.showInputBox(win, { title: "激活", label: "请输入手机号码：" }) : null;
      // Electron doesn't have showInputBox natively; use a custom BrowserWindow prompt
      resolve(await showEnterpriseInputWindow());
    });
  });
}

async function showEnterpriseProfileWindow() {
  const cfg = await readEnterpriseConfig();
  const tmpFile = path.join(os.tmpdir(), "enterprise-profile.html");
  fs.writeFileSync(tmpFile, `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
:root{color-scheme:dark}
html,body{height:100%}
body{
  margin:0;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif;
  background:#111317;
  color:#f5f7fb;
}
.shell{
  min-height:100%;
  box-sizing:border-box;
  padding:20px;
  background:radial-gradient(circle at top right, rgba(24,69,138,.22), transparent 34%), #111317;
}
.card{
  min-height:calc(100vh - 40px);
  box-sizing:border-box;
  display:grid;
  grid-template-rows:auto 1fr auto;
  background:#171a20;
  border:1px solid rgba(255,255,255,.08);
  border-radius:18px;
  box-shadow:0 18px 46px rgba(0,0,0,.42);
  overflow:hidden;
}
.header{
  padding:22px 24px 10px;
  border-bottom:1px solid rgba(255,255,255,.06);
}
h2{
  margin:0;
  font-size:22px;
  line-height:1.2;
  font-weight:700;
}
.subtitle{
  margin-top:8px;
  font-size:13px;
  line-height:1.5;
  color:#9ba3af;
}
.content{
  padding:20px 24px 16px;
  overflow:auto;
}
.field + .field{margin-top:18px}
label{
  display:block;
  margin-bottom:8px;
  font-size:13px;
  font-weight:600;
  color:#cdd5df;
}
input{
  width:100%;
  box-sizing:border-box;
  padding:12px 14px;
  border:1px solid rgba(255,255,255,.10);
  border-radius:12px;
  background:#101722;
  color:#eef2f7;
  font-size:15px;
  transition:border-color .15s, box-shadow .15s, background .15s;
  outline:none;
}
input:focus{
  border-color:rgba(61,123,226,.9);
  box-shadow:0 0 0 3px rgba(61,123,226,.18);
}
input:read-only{
  color:#8f98a6;
  background:#141820;
}
.footer{
  padding:18px 24px 24px;
  border-top:1px solid rgba(255,255,255,.06);
  background:linear-gradient(180deg, rgba(23,26,32,.96), rgba(23,26,32,1));
}
.actions{
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:10px;
}
button{
  border:none;
  border-radius:12px;
  padding:12px 14px;
  font-size:14px;
  font-weight:700;
  cursor:pointer;
  transition:transform .12s, opacity .12s, background .12s;
}
button:hover{transform:translateY(-1px)}
button.primary{background:#18458a;color:#fff}
button.secondary{background:#262b33;color:#eef2f7}
button.danger{background:#8f2424;color:#fff}
.tip{
  margin:12px 2px 0;
  font-size:12px;
  line-height:1.5;
  color:#8f98a6;
}
@media (max-width: 560px){
  .shell{padding:14px}
  .card{min-height:calc(100vh - 28px)}
  .header,.content,.footer{padding-left:18px;padding-right:18px}
  .actions{grid-template-columns:1fr}
}
</style></head>
<body><div class="shell"><div class="card">
  <div class="header">
    <h2>个人信息</h2>
    <div class="subtitle">修改手机号码或姓名后，客户端会使用当前设备重新向企业服务器激活。</div>
  </div>
  <div class="content">
    <div class="field">
      <label>手机号码</label>
      <input id="eid" value="${(cfg?.employee_id || '').replace(/"/g, '&quot;')}" />
    </div>
    <div class="field">
      <label>姓名</label>
      <input id="name" value="${(cfg?.name || '').replace(/"/g, '&quot;')}" />
    </div>
    <div class="field">
      <label>设备 ID</label>
      <input value="${(cfg?.device_id || '').replace(/"/g, '&quot;')}" readonly />
    </div>
  </div>
  <div class="footer">
    <div class="actions">
      <button class="primary" id="save-btn" onclick="save()">保存并重新激活</button>
      <button class="secondary" onclick="closePanel()">关闭</button>
      <button class="danger" onclick="logout()">退出登录</button>
    </div>
    <p class="tip">退出登录后，客户端会回到未登录状态；再次发起对话时会提示员工登录。</p>
  </div>
</div></div>
<script>
const {ipcRenderer} = require('electron');
function save(){
  const eid=document.getElementById('eid').value.trim();
  const name=document.getElementById('name').value.trim();
  if(!eid||!name){alert('手机号码和姓名不能为空');return;}
  const btn=document.getElementById('save-btn');
  if(btn){btn.disabled=true;btn.textContent='保存中...';}
  ipcRenderer.send('enterprise:profile-save',{employee_id:eid,name});
}
function logout(){ ipcRenderer.send('enterprise:profile-logout'); }
function closePanel(){ window.close(); }
document.addEventListener('keydown', function(event){
  if(event.key === 'Escape'){ closePanel(); }
});
</script></body></html>`);
  const profileWin = new electron.BrowserWindow({
    width: 560,
    height: 560,
    resizable: false,
    modal: true,
    parent: exports.mainWindow || undefined,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    title: "个人信息",
    show: false
  });
  profileWin.loadFile(tmpFile);
  profileWin.once("ready-to-show", () => profileWin.show());
  electron.ipcMain.once("enterprise:profile-save", async (_, data) => {
    profileWin.close();
    // 复用已有 device_id，避免重复注册
    const deviceId = cfg?.device_id || (crypto$1.randomUUID ? crypto$1.randomUUID() : crypto$1.randomBytes(16).toString("hex"));
    try {
      const resp = await enterpriseHttpRequest(
        { url: `${getEnterpriseServer(cfg)}/api/user/activate`, method: "POST" },
        { phone: data.employee_id, name: data.name, device_id: deviceId, device_name: os.hostname(), os_username: os.userInfo().username }
      );
      if (resp.status !== 200) {
        electron.dialog.showErrorBox("激活失败", `服务器返回错误：${resp.status}`);
        return;
      }
      const newCfg = {
        employee_id: data.employee_id,
        name: data.name,
        device_id: deviceId,
        token: resp.body.token,
        model_config: resp.body.config,
        config_cached_at: Date.now()
      };
      await writeEnterpriseConfig(newCfg);
      await applyEnterpriseModelConfig(newCfg.model_config, newCfg.token);
      electron.dialog.showMessageBox(exports.mainWindow, {
        type: "info", title: "激活成功",
        message: `已更新为：${data.name}（${data.employee_id}）`,
        buttons: ["确定"]
      });
      logger.info(`Enterprise profile updated: ${data.name} (${data.employee_id})`);
    } catch (err) {
      electron.dialog.showErrorBox("激活失败", "无法连接到企业服务器，请检查网络后重试。");
    }
  });
  electron.ipcMain.once("enterprise:profile-logout", async () => {
    profileWin.close();
    try { await promises.unlink(ENTERPRISE_CONFIG_FILE); } catch {}
    await clearEnterpriseModelConfig();
    // 通知 renderer 切回未登录状态
    if (exports.mainWindow && !exports.mainWindow.isDestroyed()) {
      exports.mainWindow.webContents.executeJavaScript(`
        if (window.__ent_render_logged_out__) {
          window.__ent_render_logged_out__();
        }
      `).catch(() => {});
      // 重新开始轮询激活请求
      const win = exports.mainWindow;
      const poll = setInterval(async () => {
        if (!win || win.isDestroyed()) { clearInterval(poll); return; }
        try {
          const req = await win.webContents.executeJavaScript("window.__ent_activate__ || null");
          if (req && req.employee_id && req.name) {
            clearInterval(poll);
            await win.webContents.executeJavaScript("window.__ent_activate__ = null");
            const deviceId = crypto$1.randomUUID ? crypto$1.randomUUID() : crypto$1.randomBytes(16).toString("hex");
            let resp;
            try {
              resp = await enterpriseHttpRequest(
                { url: `${req.server || ENTERPRISE_SERVER_DEFAULT}/api/user/activate`, method: "POST" },
                { phone: req.employee_id, name: req.name, device_id: deviceId, device_name: os.hostname(), os_username: os.userInfo().username }
              );
            } catch (err) {
              await win.webContents.executeJavaScript(`document.getElementById('__ent_err__').textContent='无法连接到企业服务器，请检查网络';var b=document.getElementById('__ent_btn__');if(b){b.disabled=false;b.textContent='登录并激活';}`).catch(()=>{});
              return;
            }
            if (resp.status !== 200) {
              await win.webContents.executeJavaScript(`document.getElementById('__ent_err__').textContent='服务器返回错误：${resp.status}';var b=document.getElementById('__ent_btn__');if(b){b.disabled=false;b.textContent='登录并激活';}`).catch(()=>{});
              return;
            }
            const newCfg = { employee_id: req.employee_id, name: req.name, device_id: deviceId, token: resp.body.token, model_config: resp.body.config, config_cached_at: Date.now() };
            await writeEnterpriseConfig(newCfg);
            await applyEnterpriseModelConfig(newCfg.model_config, newCfg.token);
            const reactivatedUserJson = JSON.stringify({ employee_id: req.employee_id, name: req.name });
            await win.webContents.executeJavaScript(`
              if (window.__ent_render_logged_in__) {
                window.__ent_render_logged_in__(${reactivatedUserJson});
              }
            `).catch(()=>{});
          }
        } catch {}
      }, 400);
    }
  });
  profileWin.on("closed", () => {
    electron.ipcMain.removeAllListeners("enterprise:profile-save");
    electron.ipcMain.removeAllListeners("enterprise:profile-logout");
  });
}

function showEnterpriseInputWindow() {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), "enterprise-activate.html");
    fs.writeFileSync(tmpFile, `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
:root{color-scheme:dark}
html,body{height:100%}
body{
  margin:0;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif;
  background:#111317;
  color:#f5f7fb;
}
.shell{
  min-height:100%;
  box-sizing:border-box;
  padding:20px;
  background:radial-gradient(circle at top right, rgba(24,69,138,.22), transparent 34%), #111317;
}
.card{
  min-height:calc(100vh - 40px);
  box-sizing:border-box;
  display:grid;
  grid-template-rows:auto 1fr auto;
  background:#171a20;
  border:1px solid rgba(255,255,255,.08);
  border-radius:18px;
  box-shadow:0 18px 46px rgba(0,0,0,.42);
  overflow:hidden;
}
.header{
  padding:22px 24px 10px;
  border-bottom:1px solid rgba(255,255,255,.06);
}
h2{
  margin:0;
  font-size:22px;
  line-height:1.2;
  font-weight:700;
}
.subtitle{
  margin-top:8px;
  font-size:13px;
  line-height:1.5;
  color:#9ba3af;
}
.content{
  padding:20px 24px 16px;
  overflow:auto;
}
.field + .field{margin-top:18px}
label{
  display:block;
  margin-bottom:8px;
  font-size:13px;
  font-weight:600;
  color:#cdd5df;
}
input{
  width:100%;
  box-sizing:border-box;
  padding:12px 14px;
  border:1px solid rgba(255,255,255,.10);
  border-radius:12px;
  background:#101722;
  color:#eef2f7;
  font-size:15px;
  transition:border-color .15s, box-shadow .15s, background .15s;
  outline:none;
}
input:focus{
  border-color:rgba(61,123,226,.9);
  box-shadow:0 0 0 3px rgba(61,123,226,.18);
}
.footer{
  padding:18px 24px 24px;
  border-top:1px solid rgba(255,255,255,.06);
  background:linear-gradient(180deg, rgba(23,26,32,.96), rgba(23,26,32,1));
}
.actions{
  display:grid;
  grid-template-columns:1fr 104px;
  gap:10px;
}
button{
  border:none;
  border-radius:12px;
  padding:12px 14px;
  font-size:14px;
  font-weight:700;
  cursor:pointer;
  transition:transform .12s, opacity .12s, background .12s;
}
button:hover{transform:translateY(-1px)}
button.primary{background:#18458a;color:#fff}
button.secondary{background:#262b33;color:#eef2f7}
.tip{
  margin:12px 2px 0;
  font-size:12px;
  line-height:1.5;
  color:#8f98a6;
}
@media (max-width: 560px){
  .shell{padding:14px}
  .card{min-height:calc(100vh - 28px)}
  .header,.content,.footer{padding-left:18px;padding-right:18px}
  .actions{grid-template-columns:1fr}
}
</style></head>
<body><div class="shell"><div class="card">
<div class="header">
  <h2>员工登录</h2>
  <div class="subtitle">首次发起对话前，请先填写手机号码和姓名完成企业登录。</div>
</div>
<div class="content">
  <div class="field">
    <label>手机号码</label><input id="eid" placeholder="例如：13928816227" />
  </div>
  <div class="field">
    <label>姓名</label><input id="name" placeholder="例如：张三" />
  </div>
</div>
<div class="footer">
  <div class="actions">
    <button id="btn" class="primary" onclick="submit()">登录并继续</button>
    <button class="secondary" onclick="window.close()">关闭</button>
  </div>
  <div class="tip">登录成功后，当前这条消息会继续发送，不需要重新输入。</div>
</div>
</div></div>
<script>
window._submitted = null;
function submit(){
  var eid=document.getElementById('eid').value.trim();
  var name=document.getElementById('name').value.trim();
  if(!eid||!name){alert('请填写手机号码和姓名');return;}
  window._submitted = {employee_id:eid, name:name};
}
document.addEventListener('keydown',function(e){if(e.key==='Enter')submit();});
</script></body></html>`);
    const promptWin = new electron.BrowserWindow({
      width: 560, height: 520, resizable: false,
      modal: true, parent: exports.mainWindow || undefined,
      webPreferences: { nodeIntegration: false, contextIsolation: false },
      title: "员工登录", show: false
    });
    promptWin.loadFile(tmpFile);
    promptWin.once("ready-to-show", () => promptWin.show());
    const poll = setInterval(async () => {
      try {
        const result = await promptWin.webContents.executeJavaScript("window._submitted");
        if (result && result.employee_id && result.name) {
          clearInterval(poll);
          promptWin.close();
          resolve(result);
        }
      } catch {}
    }, 300);
    promptWin.on("closed", () => { clearInterval(poll); resolve(null); });
  });
}

let enterpriseLoginInFlight = null;
async function ensureEnterpriseLoginInteractive() {
  const existing = await readEnterpriseConfig();
  if (existing?.token && existing?.employee_id) {
    return existing;
  }
  if (enterpriseLoginInFlight) {
    return enterpriseLoginInFlight;
  }
  enterpriseLoginInFlight = (async () => {
    const input = await showEnterpriseInputWindow();
    if (!input) {
      return null;
    }
    const deviceId = crypto$1.randomUUID ? crypto$1.randomUUID() : crypto$1.randomBytes(16).toString("hex");
    let resp;
    try {
      resp = await enterpriseHttpRequest(
        { url: `${ENTERPRISE_SERVER_DEFAULT}/api/user/activate`, method: "POST" },
        { phone: input.employee_id, name: input.name, device_id: deviceId, device_name: os.hostname(), os_username: os.userInfo().username }
      );
    } catch (err) {
      electron.dialog.showErrorBox("登录失败", "无法连接到企业服务器，请检查网络后重试。");
      return null;
    }
    if (resp.status !== 200) {
      electron.dialog.showErrorBox("登录失败", `服务器返回错误：${resp.status}`);
      return null;
    }
    const cfg = {
      employee_id: input.employee_id,
      name: input.name,
      device_id: deviceId,
      token: resp.body.token,
      model_config: resp.body.config,
      config_cached_at: Date.now(),
      server: ENTERPRISE_SERVER_DEFAULT
    };
    await writeEnterpriseConfig(cfg);
    await applyEnterpriseModelConfig(cfg.model_config, cfg.token);
    if (exports.mainWindow && !exports.mainWindow.isDestroyed()) {
      const activatedUserJson = JSON.stringify({ employee_id: cfg.employee_id, name: cfg.name });
      exports.mainWindow.webContents.executeJavaScript(`
        if (window.__ent_render_logged_in__) {
          window.__ent_render_logged_in__(${activatedUserJson});
        }
      `).catch(() => {});
    }
    return cfg;
  })().finally(() => {
    enterpriseLoginInFlight = null;
  });
  return enterpriseLoginInFlight;
}

async function enterpriseInit() {
  let cfg = await readEnterpriseConfig();

  if (!cfg) {
    logger.info("Enterprise init: no local employee login, waiting for user sign-in before enabling chat");
    return;
  } else {
    // Refresh config if cache expired
    if (Date.now() - (cfg.config_cached_at || 0) >= CONFIG_CACHE_TTL_MS) {
      try {
        const resp = await enterpriseHttpRequest({
          url: `${getEnterpriseServer(cfg)}/api/user/info`,
          method: "GET",
          headers: { Authorization: `Bearer ${cfg.token}` }
        });
        if (resp.status === 200 && resp.body.config) {
          const oldModelId = cfg.model_config?.model_id;
          cfg.model_config = resp.body.config;
          cfg.config_cached_at = Date.now();
          await writeEnterpriseConfig(cfg);
          if (oldModelId !== cfg.model_config.model_id) {
            await applyEnterpriseModelConfig(cfg.model_config, cfg.token);
          }
        }
      } catch (err) {
        logger.warn("Enterprise config refresh failed (using cache):", err);
      }
    }
  }

  // Hook into gateway chat:message for usage reporting
  gatewayManager.on("chat:message", (data) => {
    try {
      const msg = data?.message;
      if (!msg) return;
      const usage2 = msg.usage;
      if (!usage2) return;
      const inputTokens2 = usage2.input ?? usage2.promptTokens ?? 0;
      const outputTokens2 = usage2.output ?? usage2.completionTokens ?? 0;
      if (inputTokens2 === 0 && outputTokens2 === 0) return;
      const model = msg.model ?? msg.modelRef ?? cfg.model_config?.model_id ?? "unknown";
      const skillName = msg.skillName ?? msg.skill_name ?? null;
      const payload = {
        employee_id: cfg.employee_id,
        name: cfg.name,
        device_id: cfg.device_id,
        model,
        skill_name: skillName,
        input_tokens: inputTokens2,
        output_tokens: outputTokens2,
        status: "success",
        timestamp: new Date().toISOString()
      };
      enterpriseHttpRequest(
        { url: `${getEnterpriseServer(cfg)}/api/usage/report`, method: "POST", headers: { Authorization: `Bearer ${cfg.token}` }, timeout: 3000 },
        payload
      ).catch(() => {}); // silent fail
    } catch {
      // never block main flow
    }
  });
}

electron.app.on("second-instance", () => {
  if (exports.mainWindow) {
    if (exports.mainWindow.isMinimized()) exports.mainWindow.restore();
    exports.mainWindow.show();
    exports.mainWindow.focus();
  }
});
electron.app.whenReady().then(() => {
  initialize();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      exports.mainWindow = createWindow();
    } else if (exports.mainWindow && !exports.mainWindow.isDestroyed()) {
      exports.mainWindow.show();
      exports.mainWindow.focus();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  setQuitting();
  hostEventBus.closeAll();
  hostApiServer?.close();
  void shutdownTelemetry().catch((err) => {
    logger.warn("Failed to shutdown telemetry:", err);
  });
  void gatewayManager.stop().catch((err) => {
    logger.warn("gatewayManager.stop() error during quit:", err);
  });
});
electron.app.on("will-quit", () => {
  gatewayManager.forceKill();
});
exports.gatewayManager = gatewayManager;
