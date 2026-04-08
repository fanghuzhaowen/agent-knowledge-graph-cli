// ── Node types (4 kinds) ──

export type NodeType = "Entity" | "Source" | "Evidence" | "Proposition";

// ── Entity sub-types ──

export type EntitySubType = string; // "Person" | "Organization" | "Concept" | ...

// ── Source types ──

export type SourceType = "webpage" | "pdf" | "forum" | "repo" | "dataset" | "note" | "other";

// ── Proposition status (unified lifecycle) ──

export type PropositionStatus =
	| "unrefined"          // 原始观察（原 Observation）
	| "open"               // 开放问题（原 Question）
	| "hypothesized"       // 形成假说（原 Hypothesis）
	| "asserted"           // 来源断言（原 Claim，从文本提取）
	| "evaluating"         // 评估中
	| "supported"          // 证据支持
	| "weakly_supported"   // 证据薄弱
	| "contested"          // 有争议
	| "contradicted"       // 被反驳
	| "superseded"         // 被取代
	| "resolved"           // 已解决
	| "obsolete";          // 已过时

// ── Edge types (10 kinds) ──

export type EdgeType =
	| "related_to"
	| "evidence_link"
	| "derived_from"
	| "contradicts"
	| "supports"
	| "supersedes"
	| "answers"
	| "raised_by"
	| "predicts"
	| "sourced_from";

// ── Evidence link role (for evidence_link edge type) ──

export type EvidenceLinkRole = "supports" | "contradicts" | "mentions" | "qualifies";

// ── Task status ──

export type TaskStatus = "active" | "paused" | "completed" | "archived";

// ── Gap result (computed, not stored) ──

export interface GapResult {
	targetId: string;
	gapType: "missing_evidence" | "unanswered" | "orphan" | "weak_support";
	severity: number;  // [0, 1]
	description: string;
}

// ── Claim result (computed from proposition + evidence evaluation) ──

export interface ClaimResult {
	propositionId: string;
	text: string;
	verdict: "supported" | "weakly_supported" | "contested" | "contradicted";
	confidence: number;
	evidenceChain: {
		supporting: { evidenceId: string; linkConfidence: number }[];
		contradicting: { evidenceId: string; linkConfidence: number }[];
	};
}

// ── Base Node ──

export interface BaseNode {
	id: string;
	type: NodeType;
	title?: string;
	text?: string;
	summary?: string;
	status?: string;
	confidence?: number;
	attrs: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ── Edge ──

export interface Edge {
	id: string;
	type: string;
	fromId: string;
	toId: string;
	directed: boolean;
	confidence?: number;
	attrs: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

// ── Task ──

export interface Task {
	id: string;
	title: string;
	goal: string;
	status: TaskStatus;
	attrs: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface TaskChecklistItem {
	id: string;
	text: string;
	completed: boolean;
	section: string;
}

export interface TaskChecklist {
	taskId: string;
	taskDir: string;
	tasksFile: string;
	items: TaskChecklistItem[];
	pendingItems: TaskChecklistItem[];
	completedItems: TaskChecklistItem[];
	summary: {
		total: number;
		completed: number;
		pending: number;
	};
	markdown: string;
}

// ── Node-Task Link ──

export interface NodeTaskLink {
	id: string;
	nodeId: string;
	taskId: string;
	createdAt: string;
}

// ── Op Log ──

export interface OpLog {
	id: string;
	opType: string;
	actor: "human" | "llm" | "agent";
	taskId?: string;
	payload: Record<string, unknown>;
	createdAt: string;
}

// ── LLM Task Envelope ──

export interface LlmTaskEnvelope {
	taskType: string;
	taskId?: string;
	graphContext: {
		focusNodeIds?: string[];
		relatedNodes: BaseNode[];
		relatedEdges: Edge[];
		relatedEvidence: BaseNode[];
	};
	inputContext: Record<string, unknown>;
	instructions: string;
	recommendedPrompt: string;
	outputSchema: Record<string, unknown>;
	executionHint?: {
		suggestedCommand: string;
		dryRunCommand?: string;
	};
}

// ── Prompt Template Context ──

export interface PromptTemplateContext {
	task: Task | null;
	taskChecklist?: TaskChecklist | null;
	source?: BaseNode;
	focusNodes?: BaseNode[];
	relatedPropositions?: BaseNode[];
	relatedEvidence?: BaseNode[];
	relatedEdges?: Edge[];
	openPropositions?: BaseNode[];
	knownSchema?: {
		entityTypes: string[];
		propositionTypes: string[];
		predicates: string[];
	};
}
