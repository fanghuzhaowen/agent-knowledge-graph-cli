#!/usr/bin/env bun
import { Command } from "commander";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GraphStore } from "../storage/graph-store";
import { writeJson } from "../utils/json";
import { initContext, getContext } from "./context";
import { generateId } from "../utils/ids";
import type { Task } from "../core/models/types";
import { TaskChecklistService } from "../core/services/task-checklist-service";

import { registerNodeCommand } from "./commands/node";
import { registerEdgeCommand } from "./commands/edge";
import { registerEvidenceCommand } from "./commands/evidence";
import { registerGraphCommand } from "./commands/graph";
import { registerTaskCommand } from "./commands/task";
import { registerLlmCommand } from "./commands/llm";

// ── Helpers ──

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

// ── Main program ──

const program = new Command();
program
	.name("kg")
	.description("Knowledge graph CLI for iterative deep research")
	.version("1.0.0")
	.option("--dir <path>", "Research directory path", "./");

// ── new-topic command (does not need --dir) ──

program
	.command("new-topic <topic>")
	.description("Create a new research directory with an empty kg.json")
	.action((topic: string) => {
		try {
			const now = new Date();
			const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
			const dirName = `${topic}_${ts}`;
			const dirPath = join(process.cwd(), "temp", dirName);

			if (existsSync(dirPath)) {
				writeError(`Directory already exists: ${dirPath}`);
			}

			mkdirSync(dirPath, { recursive: true });
			mkdirSync(join(dirPath, "search_results"), { recursive: true });
			mkdirSync(join(dirPath, "pages"), { recursive: true });

			const store = new GraphStore(dirPath);

			// Create initial Task node
			const taskId = generateId("Task");
			const task: Task = {
				id: taskId,
				title: topic,
				goal: "",
				status: "active",
				attrs: {},
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
			store.createTask(task);
			store.save();
			const taskChecklist = new TaskChecklistService(store).initializeTask(taskId);

			writeJson({
				topic,
				dir: dirPath,
				file: join(dirPath, "kg.json"),
				taskId,
				taskDir: taskChecklist.taskDir,
				tasksFile: taskChecklist.tasksFile,
			});
		} catch (e) {
			writeError((e as Error).message);
		}
	});

// ── Register command groups ──

registerNodeCommand(program);
registerEdgeCommand(program);
registerEvidenceCommand(program);
registerGraphCommand(program);
registerTaskCommand(program);
registerLlmCommand(program);

// ── Initialize context before each action (except new-topic) ──

program.hook("preAction", (thisCmd) => {
	// Skip context init for new-topic — it creates its own directory/store
	if (thisCmd.name() === "new-topic") return;
	const opts = program.opts();
	const dir = opts.dir || "./";
	initContext(dir);
});

program.parse();
