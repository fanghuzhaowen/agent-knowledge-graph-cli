import { z } from "zod";
import type { BaseNode, Edge as EdgeType } from "../models/types";

// ── Node Type (4 kinds) ──

export const NodeTypeSchema = z.enum(["Entity", "Source", "Evidence", "Proposition"]);

// ── Edge Type (10 kinds) ──

export const EdgeTypeSchema = z.enum([
	"related_to",
	"evidence_link",
	"derived_from",
	"contradicts",
	"supports",
	"supersedes",
	"answers",
	"raised_by",
	"predicts",
	"sourced_from",
]);

// ── Source Type ──

export const SourceTypeSchema = z.enum(["webpage", "pdf", "forum", "repo", "dataset", "note", "other"]);

// ── Proposition Status (12 values) ──

export const PropositionStatusSchema = z.enum([
	"unrefined",
	"open",
	"hypothesized",
	"asserted",
	"evaluating",
	"supported",
	"weakly_supported",
	"contested",
	"contradicted",
	"superseded",
	"resolved",
	"obsolete",
]);

// ── Evidence Link Role (for evidence_link edge type) ──

export const EvidenceLinkRoleSchema = z.enum(["supports", "contradicts", "mentions", "qualifies"]);

// ── Task Status ──

export const TaskStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

// ── Base Node ──

export const BaseNodeSchema = z.object({
	id: z.string(),
	type: NodeTypeSchema,
	title: z.string().optional(),
	text: z.string().optional(),
	summary: z.string().optional(),
	status: z.string().optional(),
	confidence: z.number().min(0).max(1).optional(),
	attrs: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Entity ──

export const EntitySchema = BaseNodeSchema.extend({
	type: z.literal("Entity"),
	title: z.string(),
});

// ── Source ──

export const SourceSchema = BaseNodeSchema.extend({
	type: z.literal("Source"),
	title: z.string(),
});

// ── Evidence ──

export const EvidenceSchema = BaseNodeSchema.extend({
	type: z.literal("Evidence"),
	text: z.string().optional(),
});

// ── Proposition ──

export const PropositionSchema = BaseNodeSchema.extend({
	type: z.literal("Proposition"),
	text: z.string(),
	status: PropositionStatusSchema,
});

// ── Task ──

export const TaskSchema = z.object({
	id: z.string(),
	title: z.string(),
	goal: z.string(),
	status: TaskStatusSchema.default("active"),
	attrs: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Edge ──

export const EdgeSchema = z.object({
	id: z.string(),
	type: EdgeTypeSchema,
	fromId: z.string(),
	toId: z.string(),
	directed: z.boolean().default(true),
	confidence: z.number().min(0).max(1).optional(),
	attrs: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
});

// ── Op Log ──

export const OpLogSchema = z.object({
	id: z.string(),
	opType: z.string(),
	actor: z.enum(["human", "llm", "agent"]),
	taskId: z.string().optional(),
	payload: z.record(z.string(), z.unknown()).default({}),
	createdAt: z.string(),
});

// ── Schema map by type ──

export const SchemaByType: Record<string, z.ZodTypeAny> = {
	Entity: EntitySchema,
	Source: SourceSchema,
	Evidence: EvidenceSchema,
	Proposition: PropositionSchema,
};

function formatSchemaErrors(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "root";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

export function validateNode(node: BaseNode): BaseNode {
	const schema = SchemaByType[node.type];
	if (!schema) {
		throw new Error(`Unsupported node type: ${node.type}`);
	}

	const result = schema.safeParse(node);
	if (!result.success) {
		throw new Error(`Invalid ${node.type} node: ${formatSchemaErrors(result.error)}`);
	}

	return result.data as BaseNode;
}

export function validateEdge(edge: EdgeType): EdgeType {
	const result = EdgeSchema.safeParse(edge);
	if (!result.success) {
		throw new Error(`Invalid edge: ${formatSchemaErrors(result.error)}`);
	}

	// Validate evidence_link edge has role attr
	if (edge.type === "evidence_link") {
		const roleResult = EvidenceLinkRoleSchema.safeParse(edge.attrs?.role);
		if (!roleResult.success) {
			throw new Error(`Invalid evidence link role: ${formatSchemaErrors(roleResult.error)}`);
		}
	}

	return result.data;
}
