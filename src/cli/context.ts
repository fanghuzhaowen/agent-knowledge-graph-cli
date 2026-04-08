import { GraphStore } from "../storage/graph-store";
import type { Services } from "./types";
import { GraphService } from "../core/services/graph-service";
import { EvidenceService } from "../core/services/evidence-service";
import { PropositionService } from "../core/services/proposition-service";
import { GapService } from "../core/services/gap-service";
import { LlmTaskService } from "../core/services/llm-task-service";
import { ReportService } from "../core/services/report-service";
import { ResearchService } from "../core/services/research-service";
import { TaskChecklistService } from "../core/services/task-checklist-service";

export interface AppContext {
	store: GraphStore;
	services: Services;
}

let _ctx: AppContext | null = null;

export function getContext(): AppContext {
	if (!_ctx) throw new Error("AppContext not initialized");
	return _ctx;
}

function createServices(store: GraphStore): Services {
	const graph = new GraphService(store);
	const evidence = new EvidenceService(store, graph);
	const proposition = new PropositionService(store, graph);
	const gap = new GapService(store, graph);
	const taskChecklist = new TaskChecklistService(store);
	const llmTask = new LlmTaskService(store, graph, proposition, gap, evidence, taskChecklist);
	const report = new ReportService(store, graph, evidence);
	const research = new ResearchService(store, graph, llmTask, proposition, gap, taskChecklist);
	return { graph, evidence, proposition, gap, llmTask, report, research, taskChecklist };
}

export function initContext(dir: string): AppContext {
	const store = new GraphStore(dir);
	const services = createServices(store);
	_ctx = { store, services };
	return _ctx;
}

export function clearContext(): void {
	_ctx = null;
}
