import type { BaseNode, GapResult, LlmTaskEnvelope } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";
import type { LlmTaskService } from "./llm-task-service";
import type { PropositionService } from "./proposition-service";
import type { GapService } from "./gap-service";
import type { TaskChecklistService } from "./task-checklist-service";

export type ResearchPhase = "search" | "extract" | "normalize" | "gap_detection" | "done";

export interface ResearchContinueResult {
	phase: ResearchPhase;
	nextQueries: LlmTaskEnvelope | null;
	stats: {
		nodeCountByType: Record<string, number>;
		edgeCountByType: Record<string, number>;
		totalNodes: number;
		totalEdges: number;
	};
	openPropositions: BaseNode[];
	gaps: GapResult[];
	workflowChecklist?: {
		tasksFile: string;
		summary: {
			total: number;
			completed: number;
			pending: number;
		};
		pendingItems: Array<{
			id: string;
			text: string;
			section: string;
		}>;
	};
	shouldContinue: boolean;
	round: number;
	message: string;
}

export class ResearchService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
		private llmTask: LlmTaskService,
		private propositionService: PropositionService,
		private gapService: GapService,
		private taskChecklistService: TaskChecklistService,
	) {}

	private getCurrentRound(taskId: string): number {
		const task = this.store.getTask(taskId);
		if (!task) return 1;
		return ((task.attrs?.round as number) ?? 0) + 1;
	}

	private recordRound(taskId: string, round: number): number {
		const task = this.store.getTask(taskId);
		if (!task) return 1;
		this.store.updateTask(taskId, {
			attrs: { ...task.attrs, round },
		});
		this.store.save();
		return round;
	}

	private determinePhase(openPropositions: BaseNode[], gaps: GapResult[], stats: ReturnType<GraphService["getStats"]>): ResearchPhase {
		if (stats.totalNodes === 0) {
			return "search";
		}

		if (openPropositions.length > 0 || gaps.length > 0) {
			const sourceCount = stats.nodeCountByType["Source"] ?? 0;
			const evidenceCount = stats.nodeCountByType["Evidence"] ?? 0;

			if (sourceCount === 0) {
				return "search";
			}
			if (evidenceCount < sourceCount * 0.5) {
				return "extract";
			}
			return "gap_detection";
		}

		return "done";
	}

	continue(taskId: string, maxRounds: number = 10): ResearchContinueResult {
		const currentRound = this.getCurrentRound(taskId);

		if (currentRound > maxRounds) {
			return {
				phase: "done",
				nextQueries: null,
				stats: this.graphService.getStats(taskId),
				openPropositions: [],
				gaps: [],
				shouldContinue: false,
				round: currentRound,
				message: `已达到最大轮次限制 (${maxRounds})，研究收敛`,
			};
		}

		const nextQueriesEnvelope = this.llmTask.buildNextSearchQueriesTask(taskId);

		const stats = this.graphService.getStats(taskId);

		const openPropositions = this.propositionService.listPropositions({ status: "open", taskId });

		const gaps = this.gapService.detectGaps(taskId);

		const phase = this.determinePhase(openPropositions, gaps, stats);

		// Convert GapResult[] to BaseNode-like format for syncResearchRoundPlan
		const gapNodes = gaps.map((g) => ({
			id: g.targetId,
			type: "Proposition" as const,
			text: g.description,
			attrs: { gapType: g.gapType, severity: g.severity },
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}));

		const checklist = this.taskChecklistService.syncResearchRoundPlan({
			taskId,
			round: currentRound,
			phase,
			openQuestions: openPropositions,
			gaps: gapNodes,
			hasNextQueries: nextQueriesEnvelope !== null,
		});

		const shouldContinue = phase !== "done" && currentRound <= maxRounds;

		this.recordRound(taskId, currentRound);

		const message = this.buildPhaseMessage(phase, openPropositions, gaps, stats, currentRound);

		return {
			phase,
			nextQueries: nextQueriesEnvelope,
			stats,
			openPropositions,
			gaps,
			workflowChecklist: {
				tasksFile: checklist.tasksFile,
				summary: checklist.summary,
				pendingItems: checklist.pendingItems.map((item) => ({
					id: item.id,
					text: item.text,
					section: item.section,
				})),
			},
			shouldContinue,
			round: currentRound,
			message,
		};
	}

	private buildPhaseMessage(
		phase: ResearchPhase,
		openPropositions: BaseNode[],
		gaps: GapResult[],
		stats: ReturnType<GraphService["getStats"]>,
		round: number,
	): string {
		switch (phase) {
			case "search":
				return `[第 ${round} 轮] 需要进行搜索以推进研究。当前有 ${openPropositions.length} 个待解决命题和 ${gaps.length} 个缺口。`;
			case "extract":
				return `[第 ${round} 轮] 已有 ${stats.nodeCountByType["Source"] ?? 0} 个来源，需要提取实体/命题/关系。`;
			case "normalize":
				return `[第 ${round} 轮] 需要对知识图谱进行规范化（去重、合并相似节点）。`;
			case "gap_detection":
				return `[第 ${round} 轮] 检测到 ${gaps.length} 个知识缺口，需要生成搜索查询来填补这些缺口。`;
			case "done":
				return `[第 ${round} 轮] 研究已收敛。图谱包含 ${stats.totalNodes} 个节点和 ${stats.totalEdges} 条边。`;
		}
	}
}
