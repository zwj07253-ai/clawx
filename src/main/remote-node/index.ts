import { EventEmitter } from "events";
import { RemoteNodeClient } from "./client";
import { executeTask } from "./executor";
import type { RemoteNodeConfig, RemoteNodeStatus, TaskRequest } from "./types";

export class RemoteNodeManager extends EventEmitter {
  private client: RemoteNodeClient;

  constructor(config: RemoteNodeConfig) {
    super();
    this.client = new RemoteNodeClient(config);

    this.client.on("statusChanged", (s: RemoteNodeStatus) => this.emit("statusChanged", s));
    this.client.on("connected", () => this.emit("connected"));
    this.client.on("disconnected", (info: unknown) => this.emit("disconnected", info));
    this.client.on("error", (err: Error) => this.emit("error", err));

    this.client.on("task", async (task: TaskRequest) => {
      const result = await executeTask(task);
      this.client.sendTaskResult(result);
    });
  }

  start(): void { this.client.start(); }
  stop(): void { this.client.stop(); }
  getStatus(): RemoteNodeStatus { return this.client.getStatus(); }
  getNodeId(): string { return this.client.getNodeId(); }
}

export type { RemoteNodeConfig, RemoteNodeStatus } from "./types";
