import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { GapService } from "../../../src/core/services/gap-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestStore(): {
	store: GraphStore;
	graphService: GraphService;
	gapService: GapService;
	evidenceService: EvidenceService;
	cleanup: () => void;
} {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const evidenceService = new EvidenceService(store, graphService);
	const gapService = new GapService(store, graphService);
	return { store, graphService, gapService, evidenceService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let context: ReturnType<typeof createTestStore> | null = null;

afterEach(() => {
	if (context) {
		context.cleanup();
		context = null;
	}
});

describe("GapService", () => {
	it("should detect propositions without evidence as missing_evidence", () => {
		context = createTestStore();
		// Create an asserted proposition with no evidence links
		context.graphService.upsertNode({
			type: "Proposition",
			text: "Unevidenced claim",
			status: "asserted",
			attrs: {},
		});

		const gaps = context.gapService.detectGaps();
		const noEvidenceGaps = gaps.filter((g) => g.gapType === "missing_evidence");
		expect(noEvidenceGaps.length).toBeGreaterThanOrEqual(1);
		expect(noEvidenceGaps[0].targetId).toBeDefined();
		expect(noEvidenceGaps[0].severity).toBeGreaterThanOrEqual(0);
		expect(noEvidenceGaps[0].description).toContain("无任何证据支持");
	});

	it("should detect propositions with only single source as weak_support", () => {
		context = createTestStore();
		const source = context.evidenceService.addSource({
			title: "Test Source",
			sourceType: "webpage",
		});
		const evidence = context.evidenceService.addEvidence({
			sourceId: source.id,
			snippet: "Evidence text",
		});
		const prop = context.graphService.upsertNode({
			type: "Proposition",
			text: "Single-source claim",
			status: "asserted",
			attrs: {},
		});
		context.evidenceService.linkEvidence(evidence.id, "node", prop.id, "supports");

		const gaps = context.gapService.detectGaps();
		const weakGaps = gaps.filter((g) => g.gapType === "weak_support");
		expect(weakGaps.length).toBeGreaterThanOrEqual(1);
	});

	it("should detect open propositions as unanswered", () => {
		context = createTestStore();
		const oldDate = new Date();
		oldDate.setDate(oldDate.getDate() - 30);
		context.graphService.upsertNode({
			id: "prop_old",
			type: "Proposition",
			text: "An open question",
			status: "open",
			attrs: {},
		});

		const gaps = context.gapService.detectGaps();
		const unresolvedGaps = gaps.filter((g) => g.gapType === "unanswered");
		expect(unresolvedGaps.length).toBeGreaterThanOrEqual(1);
		expect(unresolvedGaps[0].description).toContain("尚未回答");
	});

	it("should detect orphan nodes with no edges", () => {
		context = createTestStore();
		// Entity with no edges — should be detected as orphan
		context.graphService.upsertNode({
			type: "Entity",
			title: "Lonely Entity",
			attrs: {},
		});

		const gaps = context.gapService.detectGaps();
		const orphanGaps = gaps.filter((g) => g.gapType === "orphan");
		expect(orphanGaps.length).toBeGreaterThanOrEqual(1);
	});

	it("should not detect Source nodes as orphans", () => {
		context = createTestStore();
		context.graphService.upsertNode({
			type: "Source",
			title: "Standalone Source",
			attrs: { sourceType: "webpage" },
		});

		const gaps = context.gapService.detectGaps();
		const orphanGaps = gaps.filter((g) => g.gapType === "orphan");
		expect(orphanGaps).toHaveLength(0);
	});

	it("should return GapResult[] with correct shape", () => {
		context = createTestStore();
		context.graphService.upsertNode({
			type: "Proposition",
			text: "Test proposition",
			status: "asserted",
			attrs: {},
		});

		const gaps = context.gapService.detectGaps();
		expect(gaps.length).toBeGreaterThanOrEqual(1);
		const gap = gaps[0];
		expect(gap).toHaveProperty("targetId");
		expect(gap).toHaveProperty("gapType");
		expect(gap).toHaveProperty("severity");
		expect(gap).toHaveProperty("description");
		expect(typeof gap.targetId).toBe("string");
		expect(typeof gap.gapType).toBe("string");
		expect(typeof gap.severity).toBe("number");
		expect(typeof gap.description).toBe("string");
	});

	it("should not detect unrefined or open propositions as missing_evidence", () => {
		context = createTestStore();
		// unrefined and open propositions are skipped in the missing_evidence check
		context.graphService.upsertNode({
			type: "Proposition",
			text: "Unrefined obs",
			status: "unrefined",
			attrs: {},
		});
		context.graphService.upsertNode({
			type: "Proposition",
			text: "Open question",
			status: "open",
			attrs: {},
		});

		const gaps = context.gapService.detectGaps();
		const missingEvidence = gaps.filter((g) => g.gapType === "missing_evidence");
		expect(missingEvidence).toHaveLength(0);
	});
});
