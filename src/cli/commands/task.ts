import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";
import type { Task } from "../../core/models/types";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerTaskCommand(program: Command): void {
	const cmd = program.command("task").description("Manage research tasks");

	cmd
		.command("create")
		.description("Create a new research task")
		.requiredOption("--title <title>", "Task title")
		.requiredOption("--goal <goal>", "Task goal")
		.action((opts: { title: string; goal: string }) => {
			try {
				const { store, services } = getContext();
				const task: Task = {
					id: generateId("Task"),
					title: opts.title,
					goal: opts.goal,
					status: "active",
					attrs: {},
					createdAt: now(),
					updatedAt: now(),
				};
				store.createTask(task);
				store.save();
				const checklist = services.taskChecklist.initializeTask(task.id);
				writeJson({
					...task,
					taskDir: checklist.taskDir,
					tasksFile: checklist.tasksFile,
					checklistSummary: checklist.summary,
				});
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("get <id>")
		.description("Get a task by ID")
		.action((id: string) => {
			try {
				const { store } = getContext();
				const task = store.getTask(id);
				if (!task) writeError("Not found");
				writeJson(task);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("list")
		.description("List tasks with optional filters")
		.option("--status <status>", "Filter by status")
		.action((opts: { status?: string }) => {
			try {
				const { store } = getContext();
				const predicate = opts.status
					? (t: Task) => t.status === opts.status
					: undefined;
				const tasks = store.listTasks(predicate);
				writeJson(tasks);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("checklist <id>")
		.description("Read the external workflow checklist for a task")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const checklist = services.taskChecklist.readChecklist(id);
				writeJson(checklist);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("add-item <id>")
		.description("Append a new item to tasks.md for a task")
		.requiredOption("--text <text>", "Checklist item text")
		.option("--section <section>", "Checklist section name", "Dynamic Tasks")
		.action((id: string, opts: { text: string; section: string }) => {
			try {
				const { services } = getContext();
				const item = services.taskChecklist.appendItem(id, opts.text, opts.section);
				writeJson(item);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("check <id>")
		.description("Mark an item in tasks.md as completed")
		.requiredOption("--item <itemRef>", "Checklist item ID or exact text")
		.action((id: string, opts: { item: string }) => {
			try {
				const { services } = getContext();
				const item = services.taskChecklist.setItemCompletion(id, opts.item, true);
				writeJson(item);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("uncheck <id>")
		.description("Mark an item in tasks.md as pending again")
		.requiredOption("--item <itemRef>", "Checklist item ID or exact text")
		.action((id: string, opts: { item: string }) => {
			try {
				const { services } = getContext();
				const item = services.taskChecklist.setItemCompletion(id, opts.item, false);
				writeJson(item);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("sync-artifacts <id>")
		.description("Sync search_results/ and pages/ files into tasks.md for a task")
		.action((id: string) => {
			try {
				const { services } = getContext();
				const result = services.taskChecklist.syncArtifacts(id);
				writeJson({
					taskId: id,
					searchResults: {
						count: result.searchResultFiles.length,
						files: result.searchResultFiles,
					},
					pages: {
						count: result.pageFiles.length,
						files: result.pageFiles,
					},
					markedWorkflow: result.markedWorkflow,
					recordedItems: result.recordedItems.map((item) => ({
						id: item.id,
						text: item.text,
						section: item.section,
						completed: item.completed,
					})),
					tasksFile: result.checklist.tasksFile,
					checklistSummary: result.checklist.summary,
				});
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	// ── Absorbed from research command ──

	cmd
		.command("continue <id>")
		.description("Continue the research iteration loop for a task")
		.option("--max-rounds <number>", "Maximum number of research rounds", "10")
		.action((id: string, opts: { maxRounds: string }) => {
			try {
				const { services } = getContext();
				const maxRounds = parseInt(opts.maxRounds, 10);
				if (isNaN(maxRounds) || maxRounds < 1) {
					writeError("max-rounds must be a positive integer");
				}
				const result = services.research.continue(id, maxRounds);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
