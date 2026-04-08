import type { BaseNode } from "../models/types";
import type { Edge } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { EvidenceService } from "./evidence-service";

export interface Citation {
	sourceId: string;
	number: number;
	title: string;
	uri?: string;
	sourceType: string;
	publishedAt?: string;
}

export interface PropositionCitation {
	propositionId: string;
	propositionText: string;
	status: string;
	citationNumbers: number[];
	evidenceCount: number;
}

export interface ReportOutput {
	title: string;
	sections: Array<{
		heading: string;
		propositions: PropositionCitation[];
	}>;
	citations: Citation[];
	uncitedPropositions: PropositionCitation[];
}

export class ReportService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private evidenceService: EvidenceService,
	) {}

	buildCitationMap(taskId?: string): {
		citations: Citation[];
		propositionCitations: PropositionCitation[];
		uncitedPropositions: PropositionCitation[];
	} {
		const propositions = this.graphService.listNodes({
			type: "Proposition",
			taskId,
		});

		const sourceOrder = new Map<string, number>();
		const propositionCitations: PropositionCitation[] = [];
		const uncitedPropositions: PropositionCitation[] = [];

		for (const prop of propositions) {
			// Skip unrefined/open propositions (questions/observations)
			if (prop.status === "unrefined" || prop.status === "open") continue;

			const supportingLinks = this.store.listEdges(
				(e) => e.type === "evidence_link" && e.toId === prop.id && e.attrs?.role === "supports",
			);

			const citationNumbers: number[] = [];
			for (const link of supportingLinks) {
				const evidence = this.store.getNode(link.fromId);
				if (!evidence || evidence.type !== "Evidence") continue;

				const sourceId = evidence.attrs?.sourceId as string | undefined;
				if (!sourceId) continue;

				const source = this.store.getNode(sourceId);
				if (!source || source.type !== "Source") continue;

				if (!sourceOrder.has(sourceId)) {
					const order = sourceOrder.size + 1;
					sourceOrder.set(sourceId, order);
				}
				citationNumbers.push(sourceOrder.get(sourceId)!);
			}

			citationNumbers.sort((a, b) => a - b);

			const propCitation: PropositionCitation = {
				propositionId: prop.id,
				propositionText: prop.text ?? prop.title ?? prop.id,
				status: prop.status ?? "unknown",
				citationNumbers,
				evidenceCount: supportingLinks.length,
			};

			if (citationNumbers.length === 0) {
				uncitedPropositions.push(propCitation);
			} else {
				propositionCitations.push(propCitation);
			}
		}

		const citations: Citation[] = [];
		for (const [sourceId, order] of sourceOrder) {
			const source = this.store.getNode(sourceId);
			if (!source) continue;
			citations.push({
				sourceId,
				number: order,
				title: source.title ?? sourceId,
				uri: source.attrs?.uri as string | undefined,
				sourceType: (source.attrs?.sourceType as string) ?? "unknown",
				publishedAt: source.attrs?.publishedAt as string | undefined,
			});
		}

		return { citations, propositionCitations, uncitedPropositions };
	}

	generateMarkdown(taskId?: string, title?: string): string {
		const { citations, propositionCitations, uncitedPropositions } = this.buildCitationMap(taskId);
		const reportTitle = title ?? "研究报告";

		const lines: string[] = [];

		lines.push(`# ${reportTitle}`);
		lines.push("");

		lines.push(`> 共 ${propositionCitations.length} 条有引用的命题，${uncitedPropositions.length} 条待引证`);
		lines.push("");

		if (propositionCitations.length > 0) {
			lines.push("## 核心发现");
			lines.push("");
			for (const prop of propositionCitations) {
				const citeStr = prop.citationNumbers
					.map((n) => `[${n}]`)
					.join("");
				lines.push(`- **${prop.propositionText}** ${citeStr}`);
				lines.push(`  - 状态: ${prop.status} | 证据数: ${prop.evidenceCount}`);
				lines.push("");
			}
		}

		if (uncitedPropositions.length > 0) {
			lines.push("## 待引证命题");
			lines.push("");
			lines.push("> 以下命题尚无证据支持，建议补充调研");
			lines.push("");
			for (const prop of uncitedPropositions) {
				lines.push(`- ${prop.propositionText} *[${prop.status}]*`);
			}
			lines.push("");
		}

		lines.push("## 参考文献");
		lines.push("");
		if (citations.length === 0) {
			lines.push("_（暂无参考文献）_");
		} else {
			for (const cite of citations) {
				let refLine = `[${cite.number}] ${cite.title}`;
				if (cite.uri) {
					refLine += `. ${cite.uri}`;
				}
				if (cite.publishedAt) {
					refLine += `. ${cite.publishedAt}`;
				}
				lines.push(refLine);
			}
		}
		lines.push("");

		lines.push("---");
		lines.push(`*报告生成时间: ${new Date().toISOString()}*`);

		return lines.join("\n");
	}

	generateReport(taskId?: string, title?: string): ReportOutput {
		const { citations, propositionCitations, uncitedPropositions } = this.buildCitationMap(taskId);
		return {
			title: title ?? "研究报告",
			sections: [
				{
					heading: "核心发现",
					propositions: propositionCitations,
				},
				{
					heading: "待引证命题",
					propositions: uncitedPropositions,
				},
			],
			citations,
			uncitedPropositions,
		};
	}
}
