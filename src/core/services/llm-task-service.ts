import type {
	BaseNode,
	Edge,
	LlmTaskEnvelope,
	PromptTemplateContext,
	Task,
	TaskChecklist,
} from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { PropositionService } from "./proposition-service";
import type { GapService } from "./gap-service";
import type { EvidenceService } from "./evidence-service";
import type { TaskChecklistService } from "./task-checklist-service";
import { generateId } from "../../utils/ids";

import { buildPrompt as buildExtractEntitiesPrompt, outputSchema as extractEntitiesSchema } from "../../prompts/extract-entities";
import { buildPrompt as buildExtractObservationsPrompt, outputSchema as extractObservationsSchema } from "../../prompts/extract-observations";
import { buildPrompt as buildExtractClaimsPrompt, outputSchema as extractClaimsSchema } from "../../prompts/extract-claims";
import { buildPrompt as buildNormalizeEntitiesPrompt, outputSchema as normalizeEntitiesSchema } from "../../prompts/normalize-entities";
import { buildPrompt as buildNormalizeClaimsPrompt, outputSchema as normalizeClaimsSchema } from "../../prompts/normalize-claims";
import { buildPrompt as buildGenerateQuestionsPrompt, outputSchema as generateQuestionsSchema } from "../../prompts/generate-questions";
import { buildPrompt as buildGenerateHypothesesPrompt, outputSchema as generateHypothesesSchema } from "../../prompts/generate-hypotheses";
import { buildPrompt as buildNextSearchQueriesPrompt, outputSchema as nextSearchQueriesSchema } from "../../prompts/next-search-queries";
import { buildPrompt as buildAssessEvidencePrompt, outputSchema as assessEvidenceSchema } from "../../prompts/assess-evidence";
import { buildPrompt as buildNormalizePredicatesPrompt, outputSchema as normalizePredicatesSchema } from "../../prompts/normalize-predicates";
import { buildPrompt as buildExtractRelationsPrompt, outputSchema as extractRelationsSchema } from "../../prompts/extract-relations";
import { buildPrompt as buildGenerateReportPrompt, outputSchema as generateReportSchema } from "../../prompts/generate-report";

export class LlmTaskService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private propositionService: PropositionService,
		private gapService: GapService,
		private evidenceService: EvidenceService,
		private taskChecklistService: TaskChecklistService,
	) {}

	private buildBaseContext(taskId?: string): {
		task: Task | null;
		taskChecklist: TaskChecklist | null;
		focusNodes: BaseNode[];
		relatedPropositions: BaseNode[];
		relatedEvidence: BaseNode[];
		openPropositions: BaseNode[];
	} {
		const task = taskId ? this.store.getTask(taskId) ?? null : null;
		const taskChecklist = taskId
			? this.taskChecklistService.readChecklist(taskId)
			: null;
		const focusNodes = taskId
			? this.graphService.listNodes({ taskId })
			: this.store.listNodes();
		const relatedPropositions = focusNodes.filter((n) => n.type === "Proposition");
		const relatedEvidence = focusNodes.filter((n) => n.type === "Evidence");
		const openPropositions = this.propositionService.listPropositions({ status: "open", taskId });

		return { task, taskChecklist, focusNodes, relatedPropositions, relatedEvidence, openPropositions };
	}

	private buildWorkflowChecklistContext(taskChecklist: TaskChecklist | null): Record<string, unknown> | undefined {
		if (!taskChecklist) return undefined;

		return {
			tasksFile: taskChecklist.tasksFile,
			summary: taskChecklist.summary,
			pendingItems: taskChecklist.pendingItems.map((item) => ({
				id: item.id,
				text: item.text,
				section: item.section,
			})),
			completedItems: taskChecklist.completedItems.map((item) => ({
				id: item.id,
				text: item.text,
				section: item.section,
			})),
		};
	}

	private withWorkflowChecklist(
		recommendedPrompt: string,
		taskChecklist: TaskChecklist | null,
	): string {
		if (!taskChecklist) return recommendedPrompt;

		const pending = taskChecklist.pendingItems.length > 0
			? taskChecklist.pendingItems
				.map((item) => `- [${item.id}] ${item.text} (${item.section})`)
				.join("\n")
			: "（暂无未完成任务项）";

		return `## 外置流程记忆\n当前调研任务的外置流程记忆保存在 \`${taskChecklist.tasksFile}\`。\n在执行本次任务时，请优先参考其中未完成的事项，并在完成对应工作后更新 checklist。\n\n### 当前未完成事项\n${pending}\n\n${recommendedPrompt}`;
	}

	private buildEnvelope(
		taskType: string,
		taskId: string | undefined,
		taskChecklist: TaskChecklist | null,
		graphContext: LlmTaskEnvelope["graphContext"],
		inputContext: Record<string, unknown>,
		instructions: string,
		recommendedPrompt: string,
		outputSchema: Record<string, unknown>,
		executionHint?: LlmTaskEnvelope["executionHint"],
	): LlmTaskEnvelope {
		const workflowChecklist = this.buildWorkflowChecklistContext(taskChecklist);
		return {
			taskType,
			taskId,
			graphContext,
			inputContext: workflowChecklist
				? { ...inputContext, workflowChecklist }
				: inputContext,
			instructions: taskChecklist
				? `${instructions}；并遵循 ${taskChecklist.tasksFile} 中的流程清单`
				: instructions,
			recommendedPrompt: this.withWorkflowChecklist(recommendedPrompt, taskChecklist),
			outputSchema,
			executionHint,
		};
	}

	buildExtractEntitiesTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.type !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingEntities = ctx.focusNodes.filter((n) => n.type === "Entity");

		const entityTypes = [...new Set(existingEntities.map((n) => (n.attrs?.entityType as string) ?? "").filter(Boolean))];
		const predicates = [...new Set(this.store.listEdges().map((e) => e.type))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: existingEntities,
			knownSchema: {
				entityTypes,
				propositionTypes: [],
				predicates,
			},
		};

		return this.buildEnvelope(
			"extract_entities",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: existingEntities,
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取实体`,
			buildExtractEntitiesPrompt(promptCtx),
			extractEntitiesSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildExtractObservationsTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.type !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingEntities = ctx.focusNodes.filter((n) => n.type === "Entity");
		const existingObservations = ctx.focusNodes.filter((n) => n.type === "Proposition" && n.status === "unrefined");

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: [...existingEntities, ...existingObservations],
		};

		return this.buildEnvelope(
			"extract_observations",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: [...existingEntities, ...existingObservations],
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取观察`,
			buildExtractObservationsPrompt(promptCtx),
			extractObservationsSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildExtractClaimsTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.type !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingClaims = ctx.relatedPropositions.filter((n) => n.status !== "unrefined" && n.status !== "open");

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: existingClaims,
		};

		return this.buildEnvelope(
			"extract_claims",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: existingClaims,
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取断言`,
			buildExtractClaimsPrompt(promptCtx),
			extractClaimsSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildNormalizeEntitiesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const entities = ctx.focusNodes.filter((n) => n.type === "Entity");

		const promptCtx: PromptTemplateContext = {
			...ctx,
			focusNodes: entities,
		};

		return this.buildEnvelope(
			"normalize_entities",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: entities,
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				entityCount: entities.length,
			},
			"对知识图谱中的实体进行去重和规范化",
			buildNormalizeEntitiesPrompt(promptCtx),
			normalizeEntitiesSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>  (merge: kg node delete <duplicateId> --dir <dir>)",
			},
		);
	}

	buildNormalizeClaimsTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const claims = ctx.relatedPropositions.filter((n) => n.status !== "unrefined" && n.status !== "open");

		const promptCtx: PromptTemplateContext = {
			...ctx,
			focusNodes: claims,
		};

		return this.buildEnvelope(
			"normalize_claims",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: claims,
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				claimCount: claims.length,
			},
			"对知识图谱中的断言进行去重和规范化",
			buildNormalizeClaimsPrompt(promptCtx),
			normalizeClaimsSchema(),
			{
				suggestedCommand: "kg node merge <keptId> <removedId> --dir <dir>",
			},
		);
	}

	buildGenerateQuestionsTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);

		const promptCtx: PromptTemplateContext = {
			...ctx,
		};

		return this.buildEnvelope(
			"generate_questions",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: [...ctx.relatedPropositions, ...ctx.openPropositions],
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				existingClaimCount: ctx.relatedPropositions.length,
				existingQuestionCount: ctx.openPropositions.length,
			},
			"基于当前知识图谱生成新的研究问题",
			buildGenerateQuestionsPrompt(promptCtx),
			generateQuestionsSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildGenerateHypothesesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);

		const promptCtx: PromptTemplateContext = {
			...ctx,
		};

		return this.buildEnvelope(
			"generate_hypotheses",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: [...ctx.relatedPropositions, ...ctx.openPropositions],
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				claimCount: ctx.relatedPropositions.length,
				evidenceCount: ctx.relatedEvidence.length,
				questionCount: ctx.openPropositions.length,
			},
			"基于当前知识图谱生成假设",
			buildGenerateHypothesesPrompt(promptCtx),
			generateHypothesesSchema(),
			{
				suggestedCommand: "kg node upsert --json-in - --dir <dir>",
			},
		);
	}

	buildNextSearchQueriesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const gaps = this.gapService.detectGaps(taskId);

		const promptCtx: PromptTemplateContext = {
			...ctx,
		};

		return this.buildEnvelope(
			"next_search_queries",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: [...ctx.relatedPropositions, ...ctx.openPropositions],
				relatedEdges: [],
				relatedEvidence: ctx.relatedEvidence,
			},
			{
				openQuestionCount: ctx.openPropositions.length,
				gapCount: gaps.length,
				unsupportedClaimCount: ctx.relatedPropositions.filter((c) => {
					const links = this.store.listEdges(
						(e) => e.type === "evidence_link" && e.toId === c.id,
					);
					return links.length === 0;
				}).length,
			},
			"生成下一步搜索查询词以推进研究",
			buildNextSearchQueriesPrompt(promptCtx),
			nextSearchQueriesSchema(),
			{
				suggestedCommand: "opencli web search \"<query>\" --limit 8 -f json -o <dir>/search_results/r<n>_q<m>_opencli.json",
			},
		);
	}

	buildAssessEvidenceTask(propositionId: string): LlmTaskEnvelope {
		const proposition = this.propositionService.getProposition(propositionId);
		if (!proposition) throw new Error(`命题不存在: ${propositionId}`);

		const { evidence, links } = this.evidenceService.listEvidenceByTarget(propositionId);
		const relatedPropositions = this.store
			.listEdges((e) => (e.fromId === propositionId || e.toId === propositionId) && e.type !== "evidence_link")
			.map((edge) => {
				const otherId = edge.fromId === propositionId ? edge.toId : edge.fromId;
				return this.store.getNode(otherId);
			})
			.filter((n): n is BaseNode => n !== undefined && n.type === "Proposition");

		const taskIds = this.store.getNodeTaskIds(propositionId);
		const task = taskIds.length > 0 ? this.store.getTask(taskIds[0]) ?? null : null;

		const taskChecklist = task?.id
			? this.taskChecklistService.readChecklist(task.id)
			: null;

		const promptCtx: PromptTemplateContext = {
			task,
			taskChecklist,
			focusNodes: [proposition, ...relatedPropositions],
			relatedPropositions,
			relatedEvidence: evidence,
		};

		return this.buildEnvelope(
			"assess_evidence",
			task?.id,
			taskChecklist,
			{
				focusNodeIds: [propositionId],
				relatedNodes: relatedPropositions,
				relatedEdges: [],
				relatedEvidence: evidence,
			},
			{
				propositionId,
				propositionText: proposition.text,
				evidenceCount: evidence.length,
				linkCount: links.length,
				supportCount: links.filter((l) => l.attrs?.role === "supports").length,
				contradictCount: links.filter((l) => l.attrs?.role === "contradicts").length,
			},
			`评估命题 "${proposition.text ?? proposition.title ?? propositionId}" 的证据状况`,
			buildAssessEvidencePrompt(promptCtx),
			assessEvidenceSchema(),
			{
				suggestedCommand: "kg node set-status <propositionId> <status> --dir <dir>",
			},
		);
	}

	buildNormalizePredicatesTask(taskId?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const edges = this.store.listEdges();
		const predicates = [...new Set(edges.map((e) => e.type))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			relatedEdges: edges,
			knownSchema: {
				entityTypes: [],
				propositionTypes: [],
				predicates,
			},
		};

		return this.buildEnvelope(
			"normalize_predicates",
			taskId,
			ctx.taskChecklist,
			{
				relatedNodes: ctx.focusNodes,
				relatedEdges: edges,
				relatedEvidence: [],
			},
			{
				predicateCount: predicates.length,
				edgeCount: edges.length,
			},
			"对知识图谱中的谓词进行规范化映射",
			buildNormalizePredicatesPrompt(promptCtx),
			normalizePredicatesSchema(),
			{
				suggestedCommand: "kg edge delete <oldEdgeId> --dir <dir> && kg edge create --from <fromId> --type <normalizedPredicate> --to <toId> --dir <dir>",
			},
		);
	}

	buildExtractRelationsTask(sourceId: string, taskId?: string): LlmTaskEnvelope {
		const source = this.store.getNode(sourceId);
		if (!source) throw new Error(`来源节点不存在: ${sourceId}`);
		if (source.type !== "Source") throw new Error(`节点 ${sourceId} 不是 Source 类型`);

		const ctx = this.buildBaseContext(taskId);
		const existingEntities = ctx.focusNodes.filter((n) => n.type === "Entity");
		const predicates = [...new Set(this.store.listEdges().map((e) => e.type))];

		const promptCtx: PromptTemplateContext = {
			...ctx,
			source,
			focusNodes: existingEntities,
			knownSchema: {
				entityTypes: [...new Set(existingEntities.map((n) => (n.attrs?.entityType as string) ?? "").filter(Boolean))],
				propositionTypes: [],
				predicates,
			},
		};

		return this.buildEnvelope(
			"extract_relations",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: [sourceId],
				relatedNodes: existingEntities,
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				sourceId,
				sourceTitle: source.title,
				sourceContent: source.text ?? source.summary,
			},
			`从来源 "${source.title ?? sourceId}" 中提取关系`,
			buildExtractRelationsPrompt(promptCtx),
			extractRelationsSchema(),
			{
				suggestedCommand: "kg edge create --from <entityId1> --type <relation> --to <entityId2> --dir <dir>",
			},
		);
	}

	buildGenerateReportTask(taskId?: string, topic?: string): LlmTaskEnvelope {
		const ctx = this.buildBaseContext(taskId);
		const scopedNodes = taskId ? ctx.focusNodes : this.store.listNodes();

		// Get all propositions (not unrefined/open)
		const propositions = scopedNodes.filter((n) => n.type === "Proposition");
		const propositionsWithEvidence = propositions.map((prop) => {
			const evidenceLinks = this.store.listEdges(
				(e) => e.type === "evidence_link" && e.toId === prop.id && e.attrs?.role === "supports",
			);
			const evidence = evidenceLinks.map((link) => {
				const ev = this.store.getNode(link.fromId);
				const sourceId = ev?.attrs?.sourceId as string | undefined;
				const source = sourceId ? this.store.getNode(sourceId) : null;
				return {
					text: ev?.text ?? "",
					sourceId: sourceId ?? "",
					sourceTitle: source?.title ?? sourceId ?? "未知来源",
					sourceUri: source?.attrs?.uri as string | undefined,
					sourceType: (source?.attrs?.sourceType as string) ?? "unknown",
				};
			});

			return {
				id: prop.id,
				text: prop.text ?? "",
				status: prop.status ?? "unknown",
				confidence: prop.confidence,
				evidence,
			};
		});

		// Get open questions
		const openQuestions = propositions.filter((n) => n.status === "open");
		const questionList = openQuestions.map((q) => ({
			id: q.id,
			text: q.text ?? "",
			priority: (q.attrs?.priority as number) ?? 0.5,
			status: q.status ?? "unknown",
		}));

		// Detect gaps
		const gaps = this.gapService.detectGaps(taskId);
		const gapList = gaps.map((g) => ({
			targetId: g.targetId,
			text: g.description,
			gapType: g.gapType,
			severity: g.severity,
		}));

		// Get all sources
		const sources = scopedNodes.filter((n) => n.type === "Source");
		const sourceList = sources.map((s) => ({
			id: s.id,
			title: s.title ?? s.id,
			uri: s.attrs?.uri as string | undefined,
			type: (s.attrs?.sourceType as string) ?? "unknown",
		}));

		const reportData = {
			claims: propositionsWithEvidence,
			questions: questionList,
			gaps: gapList,
			sources: sourceList,
		};

		const prompt = buildGenerateReportPrompt({ topic: topic ?? "研究主题", data: reportData });

		return this.buildEnvelope(
			"generate_report",
			taskId,
			ctx.taskChecklist,
			{
				focusNodeIds: propositions.map((c) => c.id),
				relatedNodes: [...openQuestions],
				relatedEdges: [],
				relatedEvidence: [],
			},
			{
				claimsCount: propositions.length,
				questionsCount: openQuestions.length,
				gapsCount: gaps.length,
				sourcesCount: sources.length,
			},
			`生成研究报告：${topic ?? "研究主题"}`,
			prompt,
			generateReportSchema(),
			{
				suggestedCommand: "将 LLM 输出的报告保存为 final_report.md",
			},
		);
	}
}
