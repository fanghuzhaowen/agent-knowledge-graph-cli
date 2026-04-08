import type { Command } from "commander";
import { getContext } from "../context";
import { writeJson } from "../../utils/json";

function writeError(message: string): never {
	console.error(JSON.stringify({ error: message }, null, 2));
	process.exit(1);
}

const TASK_TYPES = [
	"extract-entities",
	"extract-observations",
	"extract-claims",
	"extract-relations",
	"normalize-entities",
	"normalize-claims",
	"normalize-predicates",
	"generate-questions",
	"generate-hypotheses",
	"next-search-queries",
	"assess-evidence",
	"generate-report",
] as const;

type TaskType = (typeof TASK_TYPES)[number];

function buildTask(
	type: TaskType,
	opts: { source?: string; task?: string; proposition?: string; topic?: string },
) {
	const { services } = getContext();
	switch (type) {
		case "extract-entities":
			if (!opts.source) writeError("--source is required for extract-entities");
			return services.llmTask.buildExtractEntitiesTask(opts.source, opts.task);
		case "extract-observations":
			if (!opts.source) writeError("--source is required for extract-observations");
			return services.llmTask.buildExtractObservationsTask(opts.source, opts.task);
		case "extract-claims":
			if (!opts.source) writeError("--source is required for extract-claims");
			return services.llmTask.buildExtractClaimsTask(opts.source, opts.task);
		case "extract-relations":
			if (!opts.source) writeError("--source is required for extract-relations");
			return services.llmTask.buildExtractRelationsTask(opts.source, opts.task);
		case "normalize-entities":
			return services.llmTask.buildNormalizeEntitiesTask(opts.task);
		case "normalize-claims":
			return services.llmTask.buildNormalizeClaimsTask(opts.task);
		case "normalize-predicates":
			return services.llmTask.buildNormalizePredicatesTask(opts.task);
		case "generate-questions":
			return services.llmTask.buildGenerateQuestionsTask(opts.task);
		case "generate-hypotheses":
			return services.llmTask.buildGenerateHypothesesTask(opts.task);
		case "next-search-queries":
			return services.llmTask.buildNextSearchQueriesTask(opts.task);
		case "assess-evidence":
			if (!opts.proposition) writeError("--proposition is required for assess-evidence");
			return services.llmTask.buildAssessEvidenceTask(opts.proposition);
		case "generate-report":
			return services.llmTask.buildGenerateReportTask(opts.task, opts.topic);
	}
}

export function registerLlmCommand(program: Command): void {
	program
		.command("llm <type>")
		.description("Build LLM task envelopes for automated extraction and analysis")
		.option("--source <id>", "Source node ID (for extract-* types)")
		.option("--task <taskId>", "Task ID context")
		.option("--proposition <id>", "Proposition node ID (for assess-evidence)")
		.option("--topic <topic>", "Research topic (for generate-report)")
		.action(
			(
				type: string,
				opts: { source?: string; task?: string; proposition?: string; topic?: string },
			) => {
				try {
					if (!TASK_TYPES.includes(type as TaskType)) {
						writeError(
							`Unknown task type: ${type}. Valid types: ${TASK_TYPES.join(", ")}`,
						);
					}
					const envelope = buildTask(type as TaskType, opts);
					writeJson(envelope);
				} catch (e) {
					writeError((e as Error).message);
				}
			},
		);
}
