import type { BaseNode, GapResult } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";

export class GapService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	/**
	 * Detect gaps as pure computation — returns results without creating nodes.
	 */
	detectGaps(taskId?: string): GapResult[] {
		const propositions = this.graphService.listNodes({ type: "Proposition", taskId });
		const gaps: GapResult[] = [];

		// Check asserted propositions without evidence
		for (const prop of propositions) {
			if (prop.status === "unrefined" || prop.status === "open") continue;

			const evidenceLinks = this.store.listEdges(
				(e) => e.type === "evidence_link" && e.toId === prop.id,
			);

			if (evidenceLinks.length === 0) {
				gaps.push({
					targetId: prop.id,
					gapType: "missing_evidence",
					severity: 0.8,
					description: `命题 "${prop.text ?? prop.title ?? prop.id}" 无任何证据支持`,
				});
			} else {
				// Check for insufficient evidence: only supports, single source
				const supports = evidenceLinks.filter((l) => l.attrs?.role === "supports");
				const contradicts = evidenceLinks.filter((l) => l.attrs?.role === "contradicts");
				const sourceIds = new Set<string>();

				for (const link of evidenceLinks) {
					const evidence = this.store.getNode(link.fromId);
					if (evidence?.attrs?.sourceId) {
						sourceIds.add(evidence.attrs.sourceId as string);
					}
				}

				if (supports.length > 0 && contradicts.length === 0 && sourceIds.size <= 1) {
					gaps.push({
						targetId: prop.id,
						gapType: "weak_support",
						severity: 0.5,
						description: `命题 "${prop.text ?? prop.title ?? prop.id}" 证据不充分：仅有 ${sourceIds.size} 个来源`,
					});
				}
			}
		}

		// Check for open (unanswered) questions
		for (const prop of propositions) {
			if (prop.status !== "open") continue;
			gaps.push({
				targetId: prop.id,
				gapType: "unanswered",
				severity: 0.6,
				description: `问题 "${prop.text ?? prop.title ?? prop.id}" 尚未回答`,
			});
		}

		// Check for orphan nodes (no edges at all)
		const nodes = taskId ? this.graphService.listNodes({ taskId }) : this.store.listNodes();
		const standaloneTypes = new Set(["Source"]);
		for (const node of nodes) {
			if (standaloneTypes.has(node.type)) continue;
			const hasEdges = this.store.listEdges(
				(e) => e.fromId === node.id || e.toId === node.id,
			);
			if (hasEdges.length === 0) {
				gaps.push({
					targetId: node.id,
					gapType: "orphan",
					severity: 0.3,
					description: `节点 "${node.title ?? node.text ?? node.id}" (${node.type}) 无任何边连接`,
				});
			}
		}

		return gaps;
	}
}
