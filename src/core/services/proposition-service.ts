import type { BaseNode, PropositionStatus } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";

const VALID_PROPOSITION_STATUSES: PropositionStatus[] = [
	"unrefined", "open", "hypothesized", "asserted",
	"evaluating", "supported", "weakly_supported",
	"contested", "contradicted", "superseded",
	"resolved", "obsolete",
];

export class PropositionService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	addProposition(data: {
		text: string;
		status?: PropositionStatus;
		confidence?: number;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		return this.graphService.upsertNode({
			type: "Proposition",
			text: data.text,
			status: data.status ?? "unrefined",
			confidence: data.confidence,
			attrs: {
				...data.attrs,
			},
			taskId: data.taskId,
		});
	}

	getProposition(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.type === "Proposition") return node;
		return undefined;
	}

	listPropositions(filters: { status?: string; taskId?: string }): BaseNode[] {
		return this.graphService.listNodes({
			type: "Proposition",
			status: filters.status,
			taskId: filters.taskId,
		});
	}

	setPropositionStatus(id: string, status: PropositionStatus): BaseNode | undefined {
		if (!VALID_PROPOSITION_STATUSES.includes(status)) {
			throw new Error(`Invalid proposition status: ${status}`);
		}
		const proposition = this.store.getNode(id);
		if (!proposition) return undefined;
		if (proposition.type !== "Proposition") {
			throw new Error(`节点 ${id} 不是 Proposition 类型`);
		}
		return this.graphService.upsertNode({
			...proposition,
			status,
		});
	}

	getConflicts(propositionId: string): {
		proposition: BaseNode;
		contradicting: BaseNode[];
		supporting: BaseNode[];
	} {
		const proposition = this.store.getNode(propositionId);
		if (!proposition) {
			throw new Error(`命题不存在: ${propositionId}`);
		}
		if (proposition.type !== "Proposition") {
			throw new Error(`节点 ${propositionId} 不是 Proposition 类型`);
		}

		// Find evidence_link edges pointing to this proposition
		const links = this.store.listEdges(
			(e) => e.type === "evidence_link" && e.toId === propositionId,
		);

		const contradicting: BaseNode[] = [];
		const supporting: BaseNode[] = [];

		for (const link of links) {
			const evidence = this.store.getNode(link.fromId);
			if (!evidence) continue;
			const role = link.attrs?.role as string | undefined;
			if (role === "contradicts") {
				contradicting.push(evidence);
			} else if (role === "supports") {
				supporting.push(evidence);
			}
		}

		return { proposition, contradicting, supporting };
	}

	mergePropositions(id1: string, id2: string): BaseNode {
		const prop1 = this.store.getNode(id1);
		const prop2 = this.store.getNode(id2);
		if (!prop1) throw new Error(`命题不存在: ${id1}`);
		if (!prop2) throw new Error(`命题不存在: ${id2}`);
		if (prop1.type !== "Proposition") throw new Error(`节点 ${id1} 不是 Proposition 类型`);
		if (prop2.type !== "Proposition") throw new Error(`节点 ${id2} 不是 Proposition 类型`);

		// Merge attrs
		const mergedAttrs: Record<string, unknown> = {
			...prop2.attrs,
			...prop1.attrs,
		};

		// Merge aliases for proposition text
		const texts = [prop1.text, prop2.text].filter(Boolean);
		if (texts.length > 1) {
			mergedAttrs.altTexts = texts.slice(1);
		}

		// Take higher confidence
		const mergedConfidence =
			prop1.confidence !== undefined && prop2.confidence !== undefined
				? Math.max(prop1.confidence, prop2.confidence)
				: prop1.confidence ?? prop2.confidence;

		// Update prop1 with merged data
		const merged = this.graphService.upsertNode({
			...prop1,
			confidence: mergedConfidence,
			attrs: mergedAttrs,
		});

		// Transfer all edges from id2 to id1
		const edgesFrom2 = this.store.listEdges(
			(e) => e.fromId === id2 || e.toId === id2,
		);
		for (const edge of edgesFrom2) {
			this.store.deleteEdge(edge.id);
			this.graphService.createEdge({
				fromId: edge.fromId === id2 ? id1 : edge.fromId,
				toId: edge.toId === id2 ? id1 : edge.toId,
				type: edge.type,
				directed: edge.directed,
				confidence: edge.confidence,
				attrs: edge.attrs,
			});
		}

		// Delete prop2
		this.graphService.deleteNode(id2);

		this.store.addOpLog({
			id: generateId("opLog"),
			opType: "merge_propositions",
			actor: "human",
			payload: { keptId: id1, removedId: id2 },
			createdAt: now(),
		});
		this.store.save();

		return merged;
	}
}
