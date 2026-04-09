import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { PropositionService } from "../../../src/core/services/proposition-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestContext() {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const propositionService = new PropositionService(store, graphService);
	return { store, graphService, propositionService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let ctx: ReturnType<typeof createTestContext> | null = null;

afterEach(() => {
	if (ctx) {
		ctx.cleanup();
		ctx = null;
	}
});

describe("PropositionService", () => {
	describe("addProposition", () => {
		it("should create a proposition with default status", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({
				text: "OpenAI released GPT-5 in 2025.",
			});
			expect(prop.id).toMatch(/^id_/);
			expect(prop.type).toBe("Proposition");
			expect(prop.text).toBe("OpenAI released GPT-5 in 2025.");
			expect(prop.status).toBe("unrefined");
		});

		it("should create a proposition with explicit status", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({
				text: "Is quantum computing viable?",
				status: "open",
			});
			expect(prop.status).toBe("open");
		});

		it("should create a proposition with confidence and attrs", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({
				text: "The earth orbits the sun.",
				status: "supported",
				confidence: 0.99,
				attrs: { priority: 1, propositionType: "fact" },
			});
			expect(prop.confidence).toBe(0.99);
			expect(prop.attrs.priority).toBe(1);
			expect(prop.attrs.propositionType).toBe("fact");
		});
	});

	describe("getProposition", () => {
		it("should return an existing proposition", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({
				text: "Test proposition.",
			});
			const got = ctx.propositionService.getProposition(prop.id);
			expect(got).toBeDefined();
			expect(got!.id).toBe(prop.id);
		});

		it("should return undefined for non-existent id", () => {
			ctx = createTestContext();
			const got = ctx.propositionService.getProposition("nonexistent");
			expect(got).toBeUndefined();
		});

		it("should return undefined for non-Proposition node", () => {
			ctx = createTestContext();
			const entity = ctx.graphService.upsertNode({
				type: "Entity",
				title: "Test Entity",
				attrs: {},
			});
			const got = ctx.propositionService.getProposition(entity.id);
			expect(got).toBeUndefined();
		});
	});

	describe("listPropositions", () => {
		it("should list all propositions", () => {
			ctx = createTestContext();
			ctx.propositionService.addProposition({ text: "Prop 1." });
			ctx.propositionService.addProposition({ text: "Prop 2." });
			const list = ctx.propositionService.listPropositions({});
			expect(list).toHaveLength(2);
		});

		it("should filter by status", () => {
			ctx = createTestContext();
			ctx.propositionService.addProposition({ text: "Open one.", status: "open" });
			ctx.propositionService.addProposition({ text: "Asserted one.", status: "asserted" });
			const open = ctx.propositionService.listPropositions({ status: "open" });
			expect(open).toHaveLength(1);
			expect(open[0].status).toBe("open");
		});

		it("should filter by taskId", () => {
			ctx = createTestContext();
			const task = {
				id: "task_1",
				title: "T",
				goal: "G",
				status: "active" as const,
				attrs: {},
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
			ctx.store.createTask(task);

			ctx.propositionService.addProposition({ text: "Task prop.", taskId: "task_1" });
			ctx.propositionService.addProposition({ text: "No task prop." });

			const filtered = ctx.propositionService.listPropositions({ taskId: "task_1" });
			expect(filtered).toHaveLength(1);
		});
	});

	describe("setPropositionStatus", () => {
		it("should update status to a valid value", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({ text: "Test." });
			const updated = ctx.propositionService.setPropositionStatus(prop.id, "supported");
			expect(updated).toBeDefined();
			expect(updated!.status).toBe("supported");
		});

		it("should throw on invalid status", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({ text: "Test." });
			expect(() =>
				ctx!.propositionService.setPropositionStatus(prop.id, "invalid_status" as any),
			).toThrow("Invalid proposition status");
		});

		it("should return undefined for non-existent id", () => {
			ctx = createTestContext();
			const result = ctx.propositionService.setPropositionStatus("nonexistent", "supported");
			expect(result).toBeUndefined();
		});

		it("should throw when setting status on non-Proposition node", () => {
			ctx = createTestContext();
			const entity = ctx.graphService.upsertNode({
				type: "Entity",
				title: "E",
				attrs: {},
			});
			expect(() =>
				ctx!.propositionService.setPropositionStatus(entity.id, "supported"),
			).toThrow("不是 Proposition 类型");
		});
	});

	describe("getConflicts", () => {
		it("should return supporting evidence", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({ text: "Test prop." });
			const evidence = ctx.graphService.upsertNode({
				type: "Evidence",
				text: "Evidence text supporting the claim.",
				attrs: {},
			});
			ctx.store.createEdge({
				id: "el_1",
				type: "evidence_link",
				fromId: evidence.id,
				toId: prop.id,
				directed: true,
				attrs: { role: "supports" },
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const conflicts = ctx.propositionService.getConflicts(prop.id);
			expect(conflicts.proposition.id).toBe(prop.id);
			expect(conflicts.supporting).toHaveLength(1);
			expect(conflicts.contradicting).toHaveLength(0);
		});

		it("should return contradicting evidence", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({ text: "Test prop." });
			const evidence = ctx.graphService.upsertNode({
				type: "Evidence",
				text: "Evidence text contradicting the claim.",
				attrs: {},
			});
			ctx.store.createEdge({
				id: "el_1",
				type: "evidence_link",
				fromId: evidence.id,
				toId: prop.id,
				directed: true,
				attrs: { role: "contradicts" },
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const conflicts = ctx.propositionService.getConflicts(prop.id);
			expect(conflicts.contradicting).toHaveLength(1);
			expect(conflicts.supporting).toHaveLength(0);
		});

		it("should return both supporting and contradicting", () => {
			ctx = createTestContext();
			const prop = ctx.propositionService.addProposition({ text: "Test prop." });
			const ev1 = ctx.graphService.upsertNode({ type: "Evidence", text: "Ev1", attrs: {} });
			const ev2 = ctx.graphService.upsertNode({ type: "Evidence", text: "Ev2", attrs: {} });
			const now = new Date().toISOString();
			ctx.store.createEdge({
				id: "el_1", type: "evidence_link", fromId: ev1.id, toId: prop.id,
				directed: true, attrs: { role: "supports" }, createdAt: now, updatedAt: now,
			});
			ctx.store.createEdge({
				id: "el_2", type: "evidence_link", fromId: ev2.id, toId: prop.id,
				directed: true, attrs: { role: "contradicts" }, createdAt: now, updatedAt: now,
			});

			const conflicts = ctx.propositionService.getConflicts(prop.id);
			expect(conflicts.supporting).toHaveLength(1);
			expect(conflicts.contradicting).toHaveLength(1);
		});

		it("should throw for non-existent proposition", () => {
			ctx = createTestContext();
			expect(() => ctx.propositionService.getConflicts("nonexistent")).toThrow("命题不存在");
		});

		it("should throw for non-Proposition node", () => {
			ctx = createTestContext();
			const entity = ctx.graphService.upsertNode({ type: "Entity", title: "E", attrs: {} });
			expect(() => ctx.propositionService.getConflicts(entity.id)).toThrow("不是 Proposition 类型");
		});
	});

	describe("mergePropositions", () => {
		it("should merge two propositions and keep id1", () => {
			ctx = createTestContext();
			const prop1 = ctx.propositionService.addProposition({
				text: "First proposition.",
				confidence: 0.7,
				attrs: { source: "A" },
			});
			const prop2 = ctx.propositionService.addProposition({
				text: "Second proposition.",
				confidence: 0.9,
				attrs: { source: "B" },
			});

			const merged = ctx.propositionService.mergePropositions(prop1.id, prop2.id);
			expect(merged.id).toBe(prop1.id);
			expect(merged.confidence).toBe(0.9); // higher
			expect(merged.attrs.altTexts).toContain("Second proposition.");
			expect(ctx.store.getNode(prop2.id)).toBeUndefined();
		});

		it("should transfer edges from prop2 to prop1", () => {
			ctx = createTestContext();
			const prop1 = ctx.propositionService.addProposition({ text: "Keep." });
			const prop2 = ctx.propositionService.addProposition({ text: "Remove." });
			const evidence = ctx.graphService.upsertNode({ type: "Evidence", text: "Ev.", attrs: {} });
			const now = new Date().toISOString();
			ctx.store.createEdge({
				id: "el_1", type: "evidence_link", fromId: evidence.id, toId: prop2.id,
				directed: true, attrs: { role: "supports" }, createdAt: now, updatedAt: now,
			});

			ctx.propositionService.mergePropositions(prop1.id, prop2.id);
			const edgesTo1 = ctx.store.listEdges((e) => e.toId === prop1.id);
			expect(edgesTo1).toHaveLength(1);
			expect(edgesTo1[0].fromId).toBe(evidence.id);
		});

		it("should create an op log for the merge", () => {
			ctx = createTestContext();
			const prop1 = ctx.propositionService.addProposition({ text: "A." });
			const prop2 = ctx.propositionService.addProposition({ text: "B." });

			ctx.propositionService.mergePropositions(prop1.id, prop2.id);
			const logs = ctx.store.listOpLogs((l) => l.opType === "merge_propositions");
			expect(logs).toHaveLength(1);
			expect(logs[0].payload).toEqual({ keptId: prop1.id, removedId: prop2.id });
		});

		it("should throw for non-existent proposition", () => {
			ctx = createTestContext();
			expect(() => ctx.propositionService.mergePropositions("nonexistent", "also_nonexistent")).toThrow("命题不存在");
		});

		it("should throw for non-Proposition node", () => {
			ctx = createTestContext();
			const entity = ctx.graphService.upsertNode({ type: "Entity", title: "E", attrs: {} });
			const prop = ctx.propositionService.addProposition({ text: "P." });
			expect(() => ctx.propositionService.mergePropositions(entity.id, prop.id)).toThrow("不是 Proposition 类型");
		});
	});
});
