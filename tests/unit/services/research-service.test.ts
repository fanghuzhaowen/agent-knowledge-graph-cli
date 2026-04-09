import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { PropositionService } from "../../../src/core/services/proposition-service";
import { GapService } from "../../../src/core/services/gap-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
import { LlmTaskService } from "../../../src/core/services/llm-task-service";
import { ResearchService } from "../../../src/core/services/research-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestContext() {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const propositionService = new PropositionService(store, graphService);
	const gapService = new GapService(store, graphService);
	const evidenceService = new EvidenceService(store, graphService);

	// TaskChecklistService needs files on disk, mock it
	const mockTaskChecklistService: any = {
		syncResearchRoundPlan: () => ({
			tasksFile: "/tmp/tasks.md",
			summary: { total: 5, completed: 0, pending: 5 },
			pendingItems: [] as any[],
			completedItems: [] as any[],
			items: [] as any[],
			taskId: "",
			taskDir: "",
			markdown: "",
		}),
		readChecklist: () => null,
	};

	const llmTask = new LlmTaskService(
		store, graphService, propositionService, gapService,
		evidenceService, mockTaskChecklistService,
	);

	const researchService = new ResearchService(
		store, graphService, llmTask,
		propositionService, gapService, mockTaskChecklistService,
	);

	return { store, graphService, propositionService, gapService, evidenceService, researchService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let ctx: ReturnType<typeof createTestContext> | null = null;

afterEach(() => {
	if (ctx) {
		ctx.cleanup();
		ctx = null;
	}
});

function createTask(store: GraphStore, id = "task_1") {
	store.createTask({
		id,
		title: "Test Task",
		goal: "Research testing",
		status: "active",
		attrs: {},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

describe("ResearchService", () => {
	describe("continue", () => {
		it("should return search phase for empty graph", () => {
			ctx = createTestContext();
			createTask(ctx.store);

			const result = ctx.researchService.continue("task_1");

			expect(result.phase).toBe("search");
			expect(result.round).toBe(1);
			expect(result.shouldContinue).toBe(true);
		});

		it("should return done phase when max rounds exceeded", () => {
			ctx = createTestContext();
			createTask(ctx.store);
			ctx.store.updateTask("task_1", { attrs: { round: 10 } });

			const result = ctx.researchService.continue("task_1");

			expect(result.phase).toBe("done");
			expect(result.shouldContinue).toBe(false);
			expect(result.message).toContain("最大轮次限制");
		});

		it("should increment round on each continue call", () => {
			ctx = createTestContext();
			createTask(ctx.store);

			const r1 = ctx.researchService.continue("task_1");
			expect(r1.round).toBe(1);

			const r2 = ctx.researchService.continue("task_1");
			expect(r2.round).toBe(2);
		});

		it("should include workflow checklist in result", () => {
			ctx = createTestContext();
			createTask(ctx.store);

			const result = ctx.researchService.continue("task_1");

			expect(result.workflowChecklist).toBeDefined();
			expect(result.workflowChecklist!.tasksFile).toBe("/tmp/tasks.md");
			expect(result.workflowChecklist!.summary.total).toBe(5);
		});

		it("should include stats in result", () => {
			ctx = createTestContext();
			createTask(ctx.store);

			ctx.graphService.upsertNode({
				type: "Entity",
				title: "Test Entity",
				attrs: {},
				taskId: "task_1",
			});

			const result = ctx.researchService.continue("task_1");

			expect(result.stats).toBeDefined();
			expect(result.stats.totalNodes).toBeGreaterThanOrEqual(1);
			expect(result.stats.nodeCountByType).toBeDefined();
		});
	});

	describe("phase detection", () => {
		it("should detect extract phase when sources exist but little evidence", () => {
			ctx = createTestContext();
			createTask(ctx.store);

			// Create sources but no evidence
			ctx.graphService.upsertNode({
				type: "Source",
				title: "Source 1",
				attrs: { sourceType: "webpage" },
				taskId: "task_1",
			});
			ctx.graphService.upsertNode({
				type: "Source",
				title: "Source 2",
				attrs: { sourceType: "webpage" },
				taskId: "task_1",
			});
			// Add open proposition to trigger non-search phase
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "An open question that needs to be investigated.",
				status: "open",
				attrs: {},
				taskId: "task_1",
			});

			const result = ctx.researchService.continue("task_1");
			expect(result.phase).toBe("extract");
		});

		it("should detect gap_detection phase with sufficient evidence", () => {
			ctx = createTestContext();
			createTask(ctx.store);

			// Create sources with evidence
			const source = ctx.graphService.upsertNode({
				type: "Source",
				title: "Source 1",
				attrs: { sourceType: "webpage" },
				taskId: "task_1",
			});
			const ev = ctx.graphService.upsertNode({
				type: "Evidence",
				text: "Evidence text supporting the proposition under investigation.",
				attrs: { sourceId: source.id },
				taskId: "task_1",
			});
			const ev2 = ctx.graphService.upsertNode({
				type: "Evidence",
				text: "More evidence text supporting the proposition with additional data.",
				attrs: { sourceId: source.id },
				taskId: "task_1",
			});
			// Create asserted proposition
			const prop = ctx.graphService.upsertNode({
				type: "Proposition",
				text: "A well-supported proposition that has sufficient evidence from sources.",
				status: "asserted",
				attrs: {},
				taskId: "task_1",
			});
			// Link evidence
			const now = new Date().toISOString();
			ctx.store.createEdge({
				id: "el_1", type: "evidence_link", fromId: ev.id, toId: prop.id,
				directed: true, attrs: { role: "supports" }, createdAt: now, updatedAt: now,
			});
			ctx.store.createEdge({
				id: "el_2", type: "evidence_link", fromId: ev2.id, toId: prop.id,
				directed: true, attrs: { role: "supports" }, createdAt: now, updatedAt: now,
			});

			const result = ctx.researchService.continue("task_1");
			expect(result.phase).toBe("gap_detection");
		});
	});
});
