import type { BaseNode, EvidenceLinkRole } from "../models/types";
import type { Edge } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import { generateId } from "../../utils/ids";
import { now } from "../../utils/time";

export class EvidenceService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	private getNodeTaskIds(node: BaseNode): string[] {
		const taskIds = new Set<string>(this.store.getNodeTaskIds(node.id));
		const attrTaskId = node.attrs?.taskId;
		if (typeof attrTaskId === "string" && attrTaskId.trim().length > 0) {
			taskIds.add(attrTaskId);
		}

		const attrTaskIds = node.attrs?.taskIds;
		if (Array.isArray(attrTaskIds)) {
			for (const id of attrTaskIds) {
				if (typeof id === "string" && id.trim().length > 0) {
					taskIds.add(id);
				}
			}
		}

		return [...taskIds];
	}

	addSource(data: {
		title: string;
		uri?: string;
		sourceType: string;
		text?: string;
		summary?: string;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		return this.graphService.upsertNode({
			type: "Source",
			title: data.title,
			text: data.text,
			summary: data.summary,
			attrs: {
				uri: data.uri,
				sourceType: data.sourceType,
				...data.attrs,
			},
			taskId: data.taskId,
		});
	}

	getSource(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.type === "Source") return node;
		return undefined;
	}

	updateSource(id: string, patch: {
		title?: string;
		uri?: string;
		sourceType?: string;
		text?: string;
		summary?: string;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		const source = this.getSource(id);
		if (!source) {
			throw new Error(`来源节点不存在: ${id}`);
		}

		const attrs: Record<string, unknown> = {
			...source.attrs,
			...patch.attrs,
		};
		if (patch.uri !== undefined) {
			attrs.uri = patch.uri;
		}
		if (patch.sourceType !== undefined) {
			attrs.sourceType = patch.sourceType;
		}

		return this.graphService.upsertNode({
			...source,
			title: patch.title ?? source.title,
			text: patch.text ?? source.text,
			summary: patch.summary ?? source.summary,
			attrs,
			taskId: patch.taskId ?? this.getNodeTaskIds(source),
		});
	}

	addEvidence(data: {
		sourceId: string;
		snippet: string;
		quote?: string;
		locator?: Record<string, unknown>;
		confidence?: number;
		attrs?: Record<string, unknown>;
		taskId?: string | string[];
	}): BaseNode {
		const source = this.store.getNode(data.sourceId);
		if (!source) {
			throw new Error(`来源节点不存在: ${data.sourceId}`);
		}
		if (source.type !== "Source") {
			throw new Error(`节点 ${data.sourceId} 不是 Source 类型，而是 ${source.type}`);
		}

		const inheritedTaskIds = this.getNodeTaskIds(source);

		return this.graphService.upsertNode({
			type: "Evidence",
			text: data.snippet,
			confidence: data.confidence,
			attrs: {
				sourceId: data.sourceId,
				snippet: data.snippet,
				quote: data.quote,
				locator: data.locator,
				...data.attrs,
			},
			taskId: data.taskId ?? inheritedTaskIds,
		});
	}

	getEvidence(id: string): BaseNode | undefined {
		const node = this.store.getNode(id);
		if (node && node.type === "Evidence") return node;
		return undefined;
	}

	linkEvidence(
		evidenceId: string,
		targetType: "node" | "edge",
		targetId: string,
		role: EvidenceLinkRole,
		confidence?: number,
	): Edge {
		const evidence = this.store.getNode(evidenceId);
		if (!evidence) {
			throw new Error(`证据节点不存在: ${evidenceId}`);
		}
		if (evidence.type !== "Evidence") {
			throw new Error(`节点 ${evidenceId} 不是 Evidence 类型`);
		}

		if (targetType === "node") {
			const target = this.store.getNode(targetId);
			if (!target) {
				throw new Error(`目标节点不存在: ${targetId}`);
			}
		} else {
			const target = this.store.getEdge(targetId);
			if (!target) {
				throw new Error(`目标边不存在: ${targetId}`);
			}
		}

		const timestamp = now();
		const edge: Edge = {
			id: generateId("evidenceLink"),
			type: "evidence_link",
			fromId: evidenceId,
			toId: targetId,
			directed: true,
			confidence,
			attrs: {
				role,
				targetType,
			},
			createdAt: timestamp,
			updatedAt: timestamp,
		};

		const validatedEdge = this.graphService.createEdge({
			fromId: edge.fromId,
			toId: edge.toId,
			type: edge.type,
			directed: edge.directed,
			confidence: edge.confidence,
			attrs: edge.attrs,
		});

		this.store.addOpLog({
			id: generateId("opLog"),
			opType: "link_evidence",
			actor: "human",
			payload: { edgeId: validatedEdge.id, evidenceId, targetType, targetId, role },
			createdAt: timestamp,
		});
		this.store.save();
		return validatedEdge;
	}

	listEvidenceByTarget(targetId: string, role?: EvidenceLinkRole): { evidence: BaseNode[]; links: Edge[] } {
		const links = this.store.listEdges(
			(e) => e.type === "evidence_link" && e.toId === targetId && (!role || e.attrs?.role === role),
		);
		const evidence: BaseNode[] = [];
		for (const link of links) {
			const node = this.store.getNode(link.fromId);
			if (node) {
				evidence.push(node);
			}
		}
		return { evidence, links };
	}

	getSourceForEvidence(evidenceId: string): BaseNode | undefined {
		const evidence = this.store.getNode(evidenceId);
		if (!evidence || evidence.type !== "Evidence") return undefined;
		const sourceId = evidence.attrs?.sourceId as string | undefined;
		if (!sourceId) return undefined;
		return this.store.getNode(sourceId);
	}
}
