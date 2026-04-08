import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestStore(): { store: GraphStore; graphService: GraphService; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	return { store, graphService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let context: ReturnType<typeof createTestStore> | null = null;

afterEach(() => {
	if (context) {
		context.cleanup();
		context = null;
	}
});

describe("EvidenceService", () => {
	it("should create a source via addSource", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({
			sourceType: "webpage",
			title: "Gemma 4 Technical Report",
			uri: "https://example.com/report",
		});
		expect(source.id).toMatch(/^src_/);
		expect(source.type).toBe("Source");
		expect(source.title).toBe("Gemma 4 Technical Report");
	});

	it("should create evidence via addEvidence", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({
			sourceType: "webpage",
			title: "Test Source",
		});
		const evidence = service.addEvidence({
			sourceId: source.id,
			snippet: "Gemma 4 31B achieves 85.2% on MMLU Pro.",
		});
		expect(evidence.id).toMatch(/^ev_/);
		expect(evidence.type).toBe("Evidence");
		expect(evidence.attrs.sourceId).toBe(source.id);
	});

	it("should link evidence to a target node via linkEvidence", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({ sourceType: "webpage", title: "S1" });
		const evidence = service.addEvidence({
			sourceId: source.id,
			snippet: "Evidence text",
		});

		// Create a target proposition node
		context.graphService.upsertNode({
			type: "Proposition",
			text: "A proposition to link evidence to",
			status: "asserted",
			attrs: {},
		});
		const propositions = context.graphService.listNodes({ type: "Proposition" });
		const prop = propositions[0];

		const link = service.linkEvidence(evidence.id, "node", prop.id, "supports");
		// linkEvidence returns an Edge now (not EvidenceLink)
		expect(link.type).toBe("evidence_link");
		expect(link.fromId).toBe(evidence.id);
		expect(link.toId).toBe(prop.id);
		expect(link.attrs.role).toBe("supports");
	});

	it("should list evidence by target via listEvidenceByTarget", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({ sourceType: "webpage", title: "S1" });
		const ev1 = service.addEvidence({ sourceId: source.id, snippet: "Ev1" });
		const ev2 = service.addEvidence({ sourceId: source.id, snippet: "Ev2" });

		context.graphService.upsertNode({
			type: "Proposition",
			text: "A proposition to test listing",
			status: "asserted",
			attrs: {},
		});
		const propositions = context.graphService.listNodes({ type: "Proposition" });
		const prop = propositions[0];

		service.linkEvidence(ev1.id, "node", prop.id, "supports");
		service.linkEvidence(ev2.id, "node", prop.id, "contradicts");

		const result = service.listEvidenceByTarget(prop.id);
		expect(result.evidence).toHaveLength(2);
	});

	it("should list evidence by target and filter by role via links", () => {
		context = createTestStore();
		const service = new EvidenceService(context.store, context.graphService);
		const source = service.addSource({ sourceType: "webpage", title: "S1" });
		const ev1 = service.addEvidence({ sourceId: source.id, snippet: "Ev1" });
		const ev2 = service.addEvidence({ sourceId: source.id, snippet: "Ev2" });

		context.graphService.upsertNode({
			type: "Proposition",
			text: "A proposition to test role filtering",
			status: "asserted",
			attrs: {},
		});
		const propositions = context.graphService.listNodes({ type: "Proposition" });
		const prop = propositions[0];

		service.linkEvidence(ev1.id, "node", prop.id, "supports");
		service.linkEvidence(ev2.id, "node", prop.id, "contradicts");

		const result = service.listEvidenceByTarget(prop.id);
		const supportingLinks = result.links.filter((l) => l.attrs?.role === "supports");
		expect(supportingLinks).toHaveLength(1);
	});
});
