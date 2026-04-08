import { describe, it, expect } from "vitest";
import {
	EntitySchema,
	SourceSchema,
	EvidenceSchema,
	PropositionSchema,
	NodeTypeSchema,
	BaseNodeSchema,
	PropositionStatusSchema,
	EdgeSchema,
	EdgeTypeSchema,
	EvidenceLinkRoleSchema,
	OpLogSchema,
	TaskSchema,
	SchemaByType,
	validateNode,
	validateEdge,
} from "../../src/core/schemas/index";

const now = new Date().toISOString();

// ── NodeType ──

describe("NodeTypeSchema", () => {
	it("should accept valid node types", () => {
		for (const type of ["Entity", "Source", "Evidence", "Proposition"]) {
			expect(NodeTypeSchema.parse(type)).toBe(type);
		}
	});

	it("should reject invalid node type", () => {
		expect(() => NodeTypeSchema.parse("Invalid")).toThrow();
	});

	it("should reject old NodeKind values", () => {
		for (const old of ["Claim", "Question", "Observation", "Hypothesis", "Gap", "Value"]) {
			expect(() => NodeTypeSchema.parse(old)).toThrow();
		}
	});
});

// ── EntitySchema ──

describe("EntitySchema", () => {
	it("should accept a valid entity", () => {
		const entity = {
			id: "ent_1",
			type: "Entity" as const,
			title: "OpenAI",
			attrs: { entityType: "Organization", aliases: ["OpenAI Inc."] },
			createdAt: now,
			updatedAt: now,
		};
		const result = EntitySchema.parse(entity);
		expect(result.type).toBe("Entity");
		expect(result.title).toBe("OpenAI");
		expect(result.attrs.entityType).toBe("Organization");
	});

	it("should accept entity with default attrs", () => {
		const entity = {
			id: "ent_1",
			type: "Entity" as const,
			title: "Test",
			createdAt: now,
			updatedAt: now,
		};
		const result = EntitySchema.parse(entity);
		expect(result.attrs).toEqual({});
	});

	it("should reject entity without required title", () => {
		const entity = {
			id: "ent_1",
			type: "Entity",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});

	it("should reject entity with wrong type", () => {
		const entity = {
			id: "ent_1",
			type: "Source",
			title: "Test",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});

	it("should reject entity with confidence out of range", () => {
		const entity = {
			id: "ent_1",
			type: "Entity",
			title: "Test",
			confidence: 1.5,
			createdAt: now,
			updatedAt: now,
		};
		expect(() => EntitySchema.parse(entity)).toThrow();
	});
});

// ── PropositionSchema ──

describe("PropositionSchema", () => {
	it("should accept a valid proposition", () => {
		const prop = {
			id: "prop_1",
			type: "Proposition" as const,
			text: "Gemma 4 achieves 85% on MMLU Pro",
			status: "supported",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = PropositionSchema.parse(prop);
		expect(result.type).toBe("Proposition");
		expect(result.text).toBe("Gemma 4 achieves 85% on MMLU Pro");
		expect(result.status).toBe("supported");
	});

	it("should accept all 12 valid proposition statuses", () => {
		for (const status of [
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
		]) {
			const prop = {
				id: "prop_1",
				type: "Proposition" as const,
				text: "Test proposition",
				status,
				createdAt: now,
				updatedAt: now,
			};
			expect(PropositionSchema.parse(prop).status).toBe(status);
		}
	});

	it("should reject proposition without required text", () => {
		const prop = {
			id: "prop_1",
			type: "Proposition",
			status: "asserted",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => PropositionSchema.parse(prop)).toThrow();
	});

	it("should reject proposition with invalid status", () => {
		const prop = {
			id: "prop_1",
			type: "Proposition",
			text: "Some proposition",
			status: "invalid_status",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => PropositionSchema.parse(prop)).toThrow();
	});

	it("should reject proposition with wrong type", () => {
		const prop = {
			id: "prop_1",
			type: "Entity",
			text: "Some proposition",
			status: "asserted",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => PropositionSchema.parse(prop)).toThrow();
	});
});

// ── SourceSchema ──

describe("SourceSchema", () => {
	it("should accept a valid source", () => {
		const source = {
			id: "src_1",
			type: "Source" as const,
			title: "Gemma 4 Technical Report",
			attrs: { uri: "https://example.com/report", sourceType: "webpage" },
			createdAt: now,
			updatedAt: now,
		};
		const result = SourceSchema.parse(source);
		expect(result.type).toBe("Source");
		expect(result.attrs.sourceType).toBe("webpage");
	});

	it("should accept all valid source types in attrs", () => {
		for (const sourceType of ["webpage", "pdf", "forum", "repo", "dataset", "note", "other"]) {
			const source = {
				id: "src_1",
				type: "Source" as const,
				title: "Test Source",
				attrs: { sourceType },
				createdAt: now,
				updatedAt: now,
			};
			expect(SourceSchema.parse(source).attrs.sourceType).toBe(sourceType);
		}
	});

	it("should reject source without required title", () => {
		const source = {
			id: "src_1",
			type: "Source",
			attrs: { sourceType: "webpage" },
			createdAt: now,
			updatedAt: now,
		};
		expect(() => SourceSchema.parse(source)).toThrow();
	});

	it("should reject source with wrong type", () => {
		const source = {
			id: "src_1",
			type: "Entity",
			title: "Test Source",
			createdAt: now,
			updatedAt: now,
		};
		expect(() => SourceSchema.parse(source)).toThrow();
	});
});

// ── EvidenceSchema ──

describe("EvidenceSchema", () => {
	it("should accept valid evidence", () => {
		const evidence = {
			id: "ev_1",
			type: "Evidence" as const,
			text: "Gemma 4 31B achieves 85.2% on MMLU Pro.",
			attrs: {
				sourceId: "src_1",
				snippet: "Some snippet",
			},
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.type).toBe("Evidence");
		expect(result.attrs.sourceId).toBe("src_1");
	});

	it("should accept evidence with locator", () => {
		const evidence = {
			id: "ev_1",
			type: "Evidence" as const,
			text: "Evidence text",
			attrs: {
				sourceId: "src_1",
				locator: { type: "text_span", page: 13, section: "Results" },
			},
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.attrs.locator).toEqual({ type: "text_span", page: 13, section: "Results" });
	});

	it("should accept evidence without text (text is optional)", () => {
		const evidence = {
			id: "ev_1",
			type: "Evidence",
			attrs: { sourceId: "src_1" },
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.type).toBe("Evidence");
	});

	it("should accept evidence without sourceId in attrs", () => {
		const evidence = {
			id: "ev_1",
			type: "Evidence",
			text: "Some text",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = EvidenceSchema.parse(evidence);
		expect(result.type).toBe("Evidence");
	});
});

// ── EdgeSchema ──

describe("EdgeSchema", () => {
	it("should accept a valid edge", () => {
		const edge = {
			id: "e_1",
			type: "related_to",
			fromId: "ent_1",
			toId: "ent_2",
			directed: true,
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = EdgeSchema.parse(edge);
		expect(result.type).toBe("related_to");
	});

	it("should default directed to true", () => {
		const edge = {
			id: "e_1",
			type: "related_to",
			fromId: "ent_1",
			toId: "ent_2",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = EdgeSchema.parse(edge);
		expect(result.directed).toBe(true);
	});

	it("should accept evidence_link edge", () => {
		const edge = {
			id: "evl_1",
			type: "evidence_link",
			fromId: "ev_1",
			toId: "prop_1",
			directed: true,
			attrs: { role: "supports", targetType: "node" },
			createdAt: now,
			updatedAt: now,
		};
		const result = EdgeSchema.parse(edge);
		expect(result.type).toBe("evidence_link");
		expect(result.attrs.role).toBe("supports");
	});

	it("should reject edge with missing required fields", () => {
		expect(() => EdgeSchema.parse({ id: "e_1" })).toThrow();
	});
});

// ── EdgeTypeSchema ──

describe("EdgeTypeSchema", () => {
	it("should accept all 10 valid edge types", () => {
		for (const type of [
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
		]) {
			expect(EdgeTypeSchema.parse(type)).toBe(type);
		}
	});

	it("should reject invalid edge type", () => {
		expect(() => EdgeTypeSchema.parse("invalid_edge_type")).toThrow();
	});
});

// ── PropositionStatusSchema ──

describe("PropositionStatusSchema", () => {
	it("should accept all valid proposition statuses", () => {
		for (const status of [
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
		]) {
			expect(PropositionStatusSchema.parse(status)).toBe(status);
		}
	});

	it("should reject invalid proposition status", () => {
		expect(() => PropositionStatusSchema.parse("unknown")).toThrow();
	});

	it("should reject old claim statuses that no longer exist", () => {
		expect(() => PropositionStatusSchema.parse("proposed")).toThrow();
	});
});

// ── EvidenceLinkRoleSchema ──

describe("EvidenceLinkRoleSchema", () => {
	it("should accept all valid evidence link roles", () => {
		for (const role of ["supports", "contradicts", "mentions", "qualifies"]) {
			expect(EvidenceLinkRoleSchema.parse(role)).toBe(role);
		}
	});

	it("should reject invalid role", () => {
		expect(() => EvidenceLinkRoleSchema.parse("invalid")).toThrow();
	});
});

// ── TaskSchema ──

describe("TaskSchema", () => {
	it("should accept a valid task", () => {
		const task = {
			id: "task_1",
			title: "Research Task",
			goal: "Find evidence",
			status: "active",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = TaskSchema.parse(task);
		expect(result.title).toBe("Research Task");
	});

	it("should default status to active", () => {
		const task = {
			id: "task_1",
			title: "Task",
			goal: "Goal",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = TaskSchema.parse(task);
		expect(result.status).toBe("active");
	});
});

// ── OpLogSchema ──

describe("OpLogSchema", () => {
	it("should accept a valid op log", () => {
		const log = {
			id: "op_1",
			opType: "upsertNode",
			actor: "human",
			taskId: "task_1",
			payload: { nodeId: "ent_1" },
			createdAt: now,
		};
		const result = OpLogSchema.parse(log);
		expect(result.actor).toBe("human");
	});

	it("should accept op log without optional taskId", () => {
		const log = {
			id: "op_1",
			opType: "upsertNode",
			actor: "llm",
			payload: {},
			createdAt: now,
		};
		const result = OpLogSchema.parse(log);
		expect(result.taskId).toBeUndefined();
	});
});

// ── BaseNodeSchema ──

describe("BaseNodeSchema", () => {
	it("should accept a minimal valid base node", () => {
		const node = {
			id: "ent_1",
			type: "Entity",
			createdAt: now,
			updatedAt: now,
		};
		const result = BaseNodeSchema.parse(node);
		expect(result.attrs).toEqual({});
	});

	it("should accept a full valid base node", () => {
		const node = {
			id: "ent_1",
			type: "Entity",
			title: "Test",
			text: "text",
			summary: "summary",
			status: "active",
			confidence: 0.8,
			attrs: { key: "value" },
			createdAt: now,
			updatedAt: now,
		};
		const result = BaseNodeSchema.parse(node);
		expect(result.confidence).toBe(0.8);
	});

	it("should reject node without required id", () => {
		expect(() =>
			BaseNodeSchema.parse({
				type: "Entity",
				createdAt: now,
				updatedAt: now,
			}),
		).toThrow();
	});

	it("should reject node with invalid confidence", () => {
		expect(() =>
			BaseNodeSchema.parse({
				id: "ent_1",
				type: "Entity",
				confidence: -0.1,
				createdAt: now,
				updatedAt: now,
			}),
		).toThrow();
	});

	it("should reject node with invalid type", () => {
		expect(() =>
			BaseNodeSchema.parse({
				id: "ent_1",
				type: "Invalid",
				createdAt: now,
				updatedAt: now,
			}),
		).toThrow();
	});
});

// ── SchemaByType ──

describe("SchemaByType", () => {
	it("should have schemas for all 4 node types", () => {
		expect(SchemaByType["Entity"]).toBeDefined();
		expect(SchemaByType["Source"]).toBeDefined();
		expect(SchemaByType["Evidence"]).toBeDefined();
		expect(SchemaByType["Proposition"]).toBeDefined();
	});

	it("should not have schemas for removed node kinds", () => {
		expect(SchemaByType["Claim"]).toBeUndefined();
		expect(SchemaByType["Question"]).toBeUndefined();
		expect(SchemaByType["Observation"]).toBeUndefined();
		expect(SchemaByType["Hypothesis"]).toBeUndefined();
		expect(SchemaByType["Gap"]).toBeUndefined();
	});
});

// ── validateNode ──

describe("validateNode", () => {
	it("should validate a valid Entity node", () => {
		const node = {
			id: "ent_1",
			type: "Entity" as const,
			title: "Test",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = validateNode(node);
		expect(result.type).toBe("Entity");
	});

	it("should validate a valid Proposition node", () => {
		const node = {
			id: "prop_1",
			type: "Proposition" as const,
			text: "Test proposition",
			status: "asserted",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = validateNode(node);
		expect(result.type).toBe("Proposition");
	});

	it("should throw for unsupported node type", () => {
		const node = {
			id: "xxx_1",
			type: "Unsupported",
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		expect(() => validateNode(node as any)).toThrow(/Unsupported node type/);
	});
});

// ── validateEdge ──

describe("validateEdge", () => {
	it("should validate a valid edge", () => {
		const edge = {
			id: "e_1",
			type: "related_to",
			fromId: "ent_1",
			toId: "ent_2",
			directed: true,
			attrs: {},
			createdAt: now,
			updatedAt: now,
		};
		const result = validateEdge(edge);
		expect(result.type).toBe("related_to");
	});

	it("should validate evidence_link edge with role attr", () => {
		const edge = {
			id: "evl_1",
			type: "evidence_link",
			fromId: "ev_1",
			toId: "prop_1",
			directed: true,
			attrs: { role: "supports" },
			createdAt: now,
			updatedAt: now,
		};
		const result = validateEdge(edge);
		expect(result.type).toBe("evidence_link");
	});

	it("should reject evidence_link edge without valid role", () => {
		const edge = {
			id: "evl_1",
			type: "evidence_link",
			fromId: "ev_1",
			toId: "prop_1",
			directed: true,
			attrs: { role: "invalid" },
			createdAt: now,
			updatedAt: now,
		};
		expect(() => validateEdge(edge)).toThrow(/Invalid evidence link role/);
	});
});
