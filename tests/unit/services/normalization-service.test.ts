import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { NormalizationService } from "../../../src/core/services/normalization-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestContext() {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const normalizationService = new NormalizationService(store, graphService);
	return { store, graphService, normalizationService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let ctx: ReturnType<typeof createTestContext> | null = null;

afterEach(() => {
	if (ctx) {
		ctx.cleanup();
		ctx = null;
	}
});

describe("NormalizationService", () => {
	describe("findDuplicateEntities", () => {
		it("should find entities with similar names and same type", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({ type: "Entity", title: "OpenAI", attrs: { entityType: "Organization" } });
			ctx.graphService.upsertNode({ type: "Entity", title: "OpenAI", attrs: { entityType: "Organization" } });

			const dupes = ctx.normalizationService.findDuplicateEntities();
			expect(dupes).toHaveLength(1);
			expect(dupes[0].entities).toHaveLength(2);
			expect(dupes[0].reason).toContain("名称高度相似");
		});

		it("should not flag entities with different entityTypes", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({ type: "Entity", title: "Apple", attrs: { entityType: "Organization" } });
			ctx.graphService.upsertNode({ type: "Entity", title: "Apple", attrs: { entityType: "Person" } });

			const dupes = ctx.normalizationService.findDuplicateEntities();
			expect(dupes).toHaveLength(0);
		});

		it("should not flag entities with very different names", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({ type: "Entity", title: "Google", attrs: { entityType: "Organization" } });
			ctx.graphService.upsertNode({ type: "Entity", title: "Microsoft", attrs: { entityType: "Organization" } });

			const dupes = ctx.normalizationService.findDuplicateEntities();
			expect(dupes).toHaveLength(0);
		});

		it("should detect alias overlap", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({ type: "Entity", title: "International Business Machines", attrs: { entityType: "Organization" } });
			ctx.graphService.upsertNode({ type: "Entity", title: "Big Blue Corp", attrs: { entityType: "Organization", aliases: ["International Business Machines"] } });

			const dupes = ctx.normalizationService.findDuplicateEntities();
			expect(dupes).toHaveLength(1);
		});

		it("should return empty for no entities", () => {
			ctx = createTestContext();
			const dupes = ctx.normalizationService.findDuplicateEntities();
			expect(dupes).toHaveLength(0);
		});
	});

	describe("findDuplicatePropositions", () => {
		it("should find propositions with similar text", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "OpenAI released GPT-5 in 2025 with significant improvements in reasoning.",
				status: "asserted",
				attrs: {},
			});
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "OpenAI released GPT-5 in 2025 with significant improvements in reasoning capabilities.",
				status: "asserted",
				attrs: {},
			});

			const dupes = ctx.normalizationService.findDuplicatePropositions();
			expect(dupes).toHaveLength(1);
			expect(dupes[0].propositions).toHaveLength(2);
			expect(dupes[0].reason).toContain("命题文本高度相似");
		});

		it("should not flag very different propositions", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "The sky is blue because of Rayleigh scattering.",
				status: "asserted",
				attrs: {},
			});
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "Quantum computing uses qubits instead of classical bits.",
				status: "asserted",
				attrs: {},
			});

			const dupes = ctx.normalizationService.findDuplicatePropositions();
			expect(dupes).toHaveLength(0);
		});

		it("should return empty for no propositions", () => {
			ctx = createTestContext();
			const dupes = ctx.normalizationService.findDuplicatePropositions();
			expect(dupes).toHaveLength(0);
		});

		it("should not confuse propositions with other node types", () => {
			ctx = createTestContext();
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "This is a test proposition about some topic.",
				status: "asserted",
				attrs: {},
			});
			ctx.graphService.upsertNode({
				type: "Entity",
				title: "This is a test proposition about some topic.",
				attrs: {},
			});

			const dupes = ctx.normalizationService.findDuplicatePropositions();
			expect(dupes).toHaveLength(0);
		});
	});
});
