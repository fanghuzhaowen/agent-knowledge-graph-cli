import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { BaseNode, Edge, Task, NodeTaskLink, OpLog } from "../core/models/types";

/**
 * Legacy EvidenceLink shape for migration purposes.
 * @deprecated Use Edge with type "evidence_link" instead.
 */
interface LegacyEvidenceLink {
	id: string;
	evidenceId: string;
	targetType: "node" | "edge";
	targetId: string;
	role: "supports" | "contradicts" | "mentions" | "qualifies";
	confidence?: number;
	createdAt: string;
}

// ── Graph data structure (single JSON file) ──

export interface GraphData {
	nodes: Record<string, BaseNode>;
	edges: Record<string, Edge>;
	tasks: Record<string, Task>;
	nodeTaskLinks: NodeTaskLink[];
	opLogs: OpLog[];
	/** @deprecated Legacy evidenceLinks — migrated to edges with type "evidence_link" */
	evidenceLinks?: Record<string, LegacyEvidenceLink>;
}

export function emptyGraphData(): GraphData {
	return {
		nodes: {},
		edges: {},
		tasks: {},
		nodeTaskLinks: [],
		opLogs: [],
	};
}

// ── Legacy node kind → new type migration map ──

const KIND_TO_TYPE: Record<string, { type: BaseNode["type"]; defaultStatus?: string }> = {
	Entity: { type: "Entity" },
	Source: { type: "Source" },
	Evidence: { type: "Evidence" },
	Claim: { type: "Proposition", defaultStatus: "asserted" },
	Question: { type: "Proposition", defaultStatus: "open" },
	Hypothesis: { type: "Proposition", defaultStatus: "hypothesized" },
	Observation: { type: "Proposition", defaultStatus: "unrefined" },
	Value: { type: "Evidence" },
	Gap: { type: "Proposition", defaultStatus: "open" },
};

// ── Graph Store ──

export class GraphStore {
	private data: GraphData;
	private filePath: string;
	private dirty = false;

	constructor(dir: string) {
		this.filePath = join(dir, "kg.json");
		if (existsSync(this.filePath)) {
			const raw = readFileSync(this.filePath, "utf-8");
			this.data = JSON.parse(raw) as GraphData;
			this.migrateNodes();
			this.migrateEvidenceLinks();
		} else {
			mkdirSync(dir, { recursive: true });
			this.data = emptyGraphData();
			this.dirty = true;
		}
	}

	/**
	 * Migrate legacy nodes with `kind` field to new `type` field.
	 * Old kinds like Claim, Question, etc. are mapped to Proposition with appropriate status.
	 */
	private migrateNodes(): void {
		let migrated = false;

		for (const [id, node] of Object.entries(this.data.nodes)) {
			const legacy = node as unknown as Record<string, unknown>;
			if (!legacy.kind || legacy.type) continue;

			const mapping = KIND_TO_TYPE[legacy.kind as string];
			if (!mapping) {
				console.warn(`[kg migration] Unknown node kind "${String(legacy.kind)}" for node ${id}, skipping`);
				continue;
			}

			// Convert kind → type
			(legacy as any).type = mapping.type;
			if (mapping.defaultStatus && !legacy.status) {
				(legacy as any).status = mapping.defaultStatus;
			}

			// Move old sub-type field to attrs where applicable
			if (legacy.kind === "Entity" && legacy.type && typeof legacy.type === "string" && legacy.type !== "Entity") {
				// Old Entity had entityType in `type` field (e.g. type: "Person")
				legacy.attrs = { ...(legacy.attrs as Record<string, unknown>), entityType: legacy.type };
			}
			if (legacy.kind === "Source" && legacy.type && typeof legacy.type === "string" && legacy.type !== "Source") {
				// Old Source had sourceType in `type` field (e.g. type: "webpage")
				legacy.attrs = { ...(legacy.attrs as Record<string, unknown>), sourceType: legacy.type };
			}

			delete (legacy as any).kind;
			migrated = true;
		}

		if (migrated) {
			this.dirty = true;
			this.save();
		}
	}

	/**
	 * Migrate legacy evidenceLinks to edges with type "evidence_link".
	 * Skips links referencing non-existent nodes.
	 */
	private migrateEvidenceLinks(): void {
		if (!this.data.evidenceLinks || Object.keys(this.data.evidenceLinks).length === 0) {
			return;
		}

		for (const [linkId, link] of Object.entries(this.data.evidenceLinks)) {
			// Skip links referencing non-existent evidence nodes
			if (!this.data.nodes[link.evidenceId]) {
				console.warn(`[kg migration] Skipping evidence link ${linkId}: evidence node ${link.evidenceId} not found`);
				continue;
			}

			const edge: Edge = {
				id: link.id,
				type: "evidence_link",
				fromId: link.evidenceId,
				toId: link.targetId,
				directed: true,
				confidence: link.confidence,
				attrs: {
					role: link.role,
					targetType: link.targetType,
				},
				createdAt: link.createdAt,
				updatedAt: link.createdAt,
			};

			if (!this.data.edges[edge.id]) {
				this.data.edges[edge.id] = edge;
			}
		}

		delete this.data.evidenceLinks;
		this.dirty = true;
		this.save();
	}

	// ── Persistence ──

	save(): void {
		if (this.dirty) {
			writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + "\n", "utf-8");
			this.dirty = false;
		}
	}

	get path(): string {
		return this.filePath;
	}

	// ── Nodes ──

	getNode(id: string): BaseNode | undefined {
		return this.data.nodes[id];
	}

	upsertNode(node: BaseNode): BaseNode {
		this.data.nodes[node.id] = node;
		this.dirty = true;
		return node;
	}

	listNodes(predicate?: (n: BaseNode) => boolean): BaseNode[] {
		const all = Object.values(this.data.nodes);
		return predicate ? all.filter(predicate) : all;
	}

	deleteNode(id: string): boolean {
		if (!(id in this.data.nodes)) return false;
		delete this.data.nodes[id];
		// cascade: remove related edges and node-task links
		for (const [eid, edge] of Object.entries(this.data.edges)) {
			if (edge.fromId === id || edge.toId === id) {
				delete this.data.edges[eid];
			}
		}
		this.data.nodeTaskLinks = this.data.nodeTaskLinks.filter((l) => l.nodeId !== id);
		this.dirty = true;
		return true;
	}

	countNodes(predicate?: (n: BaseNode) => boolean): number {
		return this.listNodes(predicate).length;
	}

	// ── Edges ──

	getEdge(id: string): Edge | undefined {
		return this.data.edges[id];
	}

	createEdge(edge: Edge): Edge {
		this.data.edges[edge.id] = edge;
		this.dirty = true;
		return edge;
	}

	listEdges(predicate?: (e: Edge) => boolean): Edge[] {
		const all = Object.values(this.data.edges);
		return predicate ? all.filter(predicate) : all;
	}

	deleteEdge(id: string): boolean {
		if (!(id in this.data.edges)) return false;
		delete this.data.edges[id];
		this.dirty = true;
		return true;
	}

	// ── Tasks ──

	getTask(id: string): Task | undefined {
		return this.data.tasks[id];
	}

	createTask(task: Task): Task {
		this.data.tasks[task.id] = task;
		this.dirty = true;
		return task;
	}

	updateTask(id: string, patch: Partial<Task>): Task | undefined {
		const task = this.data.tasks[id];
		if (!task) return undefined;
		Object.assign(task, patch, { updatedAt: new Date().toISOString() });
		this.dirty = true;
		return task;
	}

	listTasks(predicate?: (t: Task) => boolean): Task[] {
		const all = Object.values(this.data.tasks);
		return predicate ? all.filter(predicate) : all;
	}

	// ── Node-Task Links ──

	linkNodeToTask(nodeId: string, taskId: string, id: string): void {
		const exists = this.data.nodeTaskLinks.some(
			(link) => link.nodeId === nodeId && link.taskId === taskId,
		);
		if (exists) return;

		this.data.nodeTaskLinks.push({
			id,
			nodeId,
			taskId,
			createdAt: new Date().toISOString(),
		});
		this.dirty = true;
	}

	unlinkNodeFromTask(nodeId: string, taskId: string): void {
		this.data.nodeTaskLinks = this.data.nodeTaskLinks.filter(
			(l) => !(l.nodeId === nodeId && l.taskId === taskId),
		);
		this.dirty = true;
	}

	getNodeTaskIds(nodeId: string): string[] {
		return this.data.nodeTaskLinks.filter((l) => l.nodeId === nodeId).map((l) => l.taskId);
	}

	getTaskNodeIds(taskId: string): string[] {
		return this.data.nodeTaskLinks.filter((l) => l.taskId === taskId).map((l) => l.nodeId);
	}

	// ── Op Logs ──

	addOpLog(log: OpLog): void {
		this.data.opLogs.push(log);
		this.dirty = true;
	}

	listOpLogs(predicate?: (l: OpLog) => boolean): OpLog[] {
		const all = [...this.data.opLogs].reverse(); // newest first
		return predicate ? all.filter(predicate) : all;
	}

	// ── Raw access ──

	get raw(): GraphData {
		return this.data;
	}
}
