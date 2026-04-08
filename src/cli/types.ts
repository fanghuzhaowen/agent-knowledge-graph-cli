import type { GraphService } from "../core/services/graph-service";
import type { EvidenceService } from "../core/services/evidence-service";
import type { PropositionService } from "../core/services/proposition-service";
import type { GapService } from "../core/services/gap-service";
import type { LlmTaskService } from "../core/services/llm-task-service";
import type { ReportService } from "../core/services/report-service";
import type { ResearchService } from "../core/services/research-service";
import type { TaskChecklistService } from "../core/services/task-checklist-service";

export interface Services {
	graph: GraphService;
	evidence: EvidenceService;
	proposition: PropositionService;
	gap: GapService;
	llmTask: LlmTaskService;
	report: ReportService;
	research: ResearchService;
	taskChecklist: TaskChecklistService;
}
