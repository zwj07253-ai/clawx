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
      return { taskId, success: true, data: { entries: entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })) } };
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
  const { stdout, stderr } = await execAsync(payload.command, {
    cwd: payload.cwd,
    timeout: payload.timeout ?? 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { taskId, success: true, data: { stdout, stderr } };
}
