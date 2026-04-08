import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { getContext } from "../context";
import { markTaskWorkflow } from "../checklist";
import { WORKFLOW_ITEMS } from "../../core/services/task-checklist-service";
import { writeJson } from "../../utils/json";
import { ExportHtmlService } from "../../core/services/export-html-service";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

export function registerGraphCommand(program: Command): void {
	const cmd = program.command("graph").description("Graph exploration, analysis, and export");

	cmd
		.command("neighbors <id>")
		.description("Get neighbors of a node")
		.option("--depth <number>", "Traversal depth", parseInt, 1)
		.action((id: string, opts: { depth: number }) => {
			try {
				const { services } = getContext();
				const result = services.graph.getNeighbors(id, opts.depth);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("path <from> <to>")
		.description("Find shortest path between two nodes")
		.option("--max-depth <number>", "Maximum search depth", parseInt, 4)
		.action((from: string, to: string, opts: { maxDepth: number }) => {
			try {
				const { services } = getContext();
				const result = services.graph.findPath(from, to, opts.maxDepth);
				if (!result) {
					writeJson({ found: false, message: `未找到 ${from} 到 ${to} 的路径（最大深度 ${opts.maxDepth}）` });
				} else {
					writeJson({ found: true, ...result });
				}
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("subgraph")
		.description("Get a subgraph with optional filters")
		.option("--task <taskId>", "Filter by task ID")
		.option("--focus <id>", "Focus node ID")
		.option("--depth <number>", "Expansion depth from focus", parseInt, 2)
		.action((opts: { task?: string; focus?: string; depth: number }) => {
			try {
				const { services } = getContext();
				const filters: { taskId?: string; focusId?: string; depth?: number } = {};
				if (opts.task) filters.taskId = opts.task;
				if (opts.focus) filters.focusId = opts.focus;
				if (opts.depth) filters.depth = opts.depth;
				const result = services.graph.getSubgraph(filters);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("stats")
		.description("Get graph statistics")
		.option("--task <taskId>", "Limit stats to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const stats = services.graph.getStats(opts.task);
				markTaskWorkflow(services, opts.task, [WORKFLOW_ITEMS.qualityGate]);
				writeJson(stats);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("lint")
		.description("Lint the graph for issues")
		.option("--task <taskId>", "Limit linting to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const result = services.graph.lint(opts.task);
				markTaskWorkflow(services, opts.task, [WORKFLOW_ITEMS.qualityGate]);
				writeJson(result);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	cmd
		.command("export-html")
		.description("Export graph as a single interactive HTML file with force-directed layout")
		.option("-o, --output <file>", "Output file path (defaults to stdout)")
		.option("--task <taskId>", "Filter by task ID")
		.option("--focus <id>", "Focus node ID")
		.option("--depth <number>", "Expansion depth from focus", parseInt, 3)
		.action((opts: { output?: string; task?: string; focus?: string; depth: number }) => {
			try {
				const { store } = getContext();
				const service = new ExportHtmlService(store);
				const html = service.exportHtml({
					taskId: opts.task,
					focusId: opts.focus,
					depth: opts.depth,
				});
				if (opts.output) {
					writeFileSync(opts.output, html, "utf-8");
					writeJson({ exported: true, file: opts.output, size: html.length });
				} else {
					process.stdout.write(html);
				}
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	// ── Absorbed from gap command ──

	cmd
		.command("gaps")
		.description("Detect and list knowledge gaps (computed from graph state)")
		.option("--detect", "Run gap detection")
		.option("--task <taskId>", "Filter by task ID")
		.action((opts: { detect?: boolean; task?: string }) => {
			try {
				const { services } = getContext();
				const gaps = services.gap.detectGaps(opts.task);
				markTaskWorkflow(services, opts.task, [WORKFLOW_ITEMS.synthesizeNextRound]);
				writeJson(gaps);
			} catch (e) {
				writeError((e as Error).message);
			}
		});

	// ── Absorbed from report command ──

	cmd
		.command("report")
		.description("Generate a report with citations from graph data")
		.option("--task <taskId>", "Limit to a specific task")
		.option("--title <title>", "Report title")
		.option("--format <format>", "Output format: markdown (default) or json", "markdown")
		.option("--output <file>", "Output file path (default: stdout)")
		.action(
			(opts: {
				task?: string;
				title?: string;
				format: string;
				output?: string;
			}) => {
				try {
					const { services } = getContext();
					const reportService = services.report;

					if (opts.format === "json") {
						const report = reportService.generateReport(opts.task, opts.title);
						if (opts.output) {
							writeFileSync(opts.output, JSON.stringify(report, null, 2));
						} else {
							writeJson(report);
						}
					} else {
						const markdown = reportService.generateMarkdown(opts.task, opts.title);
						if (opts.output) {
							writeFileSync(opts.output, markdown, "utf-8");
						} else {
							console.log(markdown);
						}
					}
				} catch (e) {
					writeError((e as Error).message);
				}
			},
		);

	cmd
		.command("citations")
		.description("List all citations in the graph")
		.option("--task <taskId>", "Limit to a specific task")
		.action((opts: { task?: string }) => {
			try {
				const { services } = getContext();
				const { citations } = services.report.buildCitationMap(opts.task);
				writeJson({ citations });
			} catch (e) {
				writeError((e as Error).message);
			}
		});
}
