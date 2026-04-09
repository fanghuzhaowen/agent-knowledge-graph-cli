import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../../../src/storage/graph-store";
import { GraphService } from "../../../src/core/services/graph-service";
import { EvidenceService } from "../../../src/core/services/evidence-service";
import { ReportService } from "../../../src/core/services/report-service";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestContext() {
	const dir = mkdtempSync(join(tmpdir(), "kg-test-"));
	const store = new GraphStore(dir);
	const graphService = new GraphService(store);
	const evidenceService = new EvidenceService(store, graphService);
	const reportService = new ReportService(store, graphService, evidenceService);
	return { store, graphService, evidenceService, reportService, cleanup: () => rmSync(dir, { recursive: true }) };
}

let ctx: ReturnType<typeof createTestContext> | null = null;

afterEach(() => {
	if (ctx) {
		ctx.cleanup();
		ctx = null;
	}
});

describe("ReportService", () => {
	describe("buildCitationMap", () => {
		it("should build citation map with supporting evidence", () => {
			ctx = createTestContext();

			// Create source → evidence → proposition chain
			const source = ctx.evidenceService.addSource({
				title: "Research Paper",
				uri: "https://example.com/paper",
				sourceType: "pdf",
			});
			const evidence = ctx.evidenceService.addEvidence({
				sourceId: source.id,
				snippet: "This paper shows that X is true according to experiments.",
			});
			const prop = ctx.graphService.upsertNode({
				type: "Proposition",
				text: "X is true based on experimental evidence.",
				status: "asserted",
				attrs: {},
			});
			ctx.evidenceService.linkEvidence(evidence.id, "node", prop.id, "supports");

			const { citations, propositionCitations, uncitedPropositions } = ctx.reportService.buildCitationMap();

			expect(citations).toHaveLength(1);
			expect(citations[0].sourceId).toBe(source.id);
			expect(citations[0].title).toBe("Research Paper");
			expect(propositionCitations).toHaveLength(1);
			expect(propositionCitations[0].propositionId).toBe(prop.id);
			expect(propositionCitations[0].citationNumbers).toEqual([1]);
			expect(uncitedPropositions).toHaveLength(0);
		});

		it("should list uncited propositions without evidence", () => {
			ctx = createTestContext();

			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "An unsupported claim that has no evidence backing it whatsoever.",
				status: "asserted",
				attrs: {},
			});

			const { citations, propositionCitations, uncitedPropositions } = ctx.reportService.buildCitationMap();

			expect(citations).toHaveLength(0);
			expect(propositionCitations).toHaveLength(0);
			expect(uncitedPropositions).toHaveLength(1);
		});

		it("should skip unrefined and open propositions", () => {
			ctx = createTestContext();

			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "An unrefined observation that should be skipped in the citation map.",
				status: "unrefined",
				attrs: {},
			});
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "An open question that should also be skipped in the citation map.",
				status: "open",
				attrs: {},
			});

			const { propositionCitations, uncitedPropositions } = ctx.reportService.buildCitationMap();
			expect(propositionCitations).toHaveLength(0);
			expect(uncitedPropositions).toHaveLength(0);
		});

		it("should assign sequential citation numbers from multiple sources", () => {
			ctx = createTestContext();

			const source1 = ctx.evidenceService.addSource({ title: "Source A", sourceType: "webpage" });
			const source2 = ctx.evidenceService.addSource({ title: "Source B", sourceType: "webpage" });
			const ev1 = ctx.evidenceService.addEvidence({ sourceId: source1.id, snippet: "Evidence from source A." });
			const ev2 = ctx.evidenceService.addEvidence({ sourceId: source2.id, snippet: "Evidence from source B." });

			const prop = ctx.graphService.upsertNode({
				type: "Proposition",
				text: "A proposition supported by multiple sources with different evidence chains.",
				status: "supported",
				attrs: {},
			});

			ctx.evidenceService.linkEvidence(ev1.id, "node", prop.id, "supports");
			ctx.evidenceService.linkEvidence(ev2.id, "node", prop.id, "supports");

			const { citations, propositionCitations } = ctx.reportService.buildCitationMap();

			expect(citations).toHaveLength(2);
			expect(propositionCitations[0].citationNumbers).toEqual([1, 2]);
		});
	});

	describe("generateMarkdown", () => {
		it("should generate markdown with cited and uncited propositions", () => {
			ctx = createTestContext();

			const source = ctx.evidenceService.addSource({ title: "Ref", sourceType: "webpage", uri: "https://example.com" });
			const ev = ctx.evidenceService.addEvidence({ sourceId: source.id, snippet: "Evidence text for markdown generation." });
			const prop = ctx.graphService.upsertNode({
				type: "Proposition",
				text: "A cited proposition for markdown report generation testing.",
				status: "supported",
				attrs: {},
			});
			ctx.graphService.upsertNode({
				type: "Proposition",
				text: "An uncited proposition that lacks any evidence support in the graph.",
				status: "asserted",
				attrs: {},
			});
			ctx.evidenceService.linkEvidence(ev.id, "node", prop.id, "supports");

			const md = ctx.reportService.generateMarkdown(undefined, "Test Report");

			expect(md).toContain("# Test Report");
			expect(md).toContain("## 核心发现");
			expect(md).toContain("## 待引证命题");
			expect(md).toContain("## 参考文献");
			expect(md).toContain("Ref");
		});

		it("should handle empty graph gracefully", () => {
			ctx = createTestContext();
			const md = ctx.reportService.generateMarkdown();
			expect(md).toContain("# 研究报告");
			expect(md).toContain("暂无参考文献");
		});
	});

	describe("generateReport", () => {
		it("should return structured ReportOutput", () => {
			ctx = createTestContext();

			const source = ctx.evidenceService.addSource({ title: "S1", sourceType: "webpage" });
			const ev = ctx.evidenceService.addEvidence({ sourceId: source.id, snippet: "Ev text for report output structure validation." });
			const prop = ctx.graphService.upsertNode({
				type: "Proposition",
				text: "A proposition that should appear in the structured report output.",
				status: "supported",
				attrs: {},
			});
			ctx.evidenceService.linkEvidence(ev.id, "node", prop.id, "supports");

			const report = ctx.reportService.generateReport(undefined, "Structured Report");

			expect(report.title).toBe("Structured Report");
			expect(report.sections).toHaveLength(2);
			expect(report.sections[0].heading).toBe("核心发现");
			expect(report.sections[0].propositions).toHaveLength(1);
			expect(report.citations).toHaveLength(1);
		});
	});
});
