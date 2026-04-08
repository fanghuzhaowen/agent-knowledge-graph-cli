import { describe, it, expect, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI_PATH = join(__dirname, "../../src/cli/index.ts");
const RUNNER = process.env.CLI_RUNNER || "bun";

function exec(args: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
	try {
		const stdout = execSync(`${RUNNER} run ${CLI_PATH} ${args}`, {
			cwd,
			encoding: "utf-8",
			timeout: 15000,
		});
		return { stdout, stderr: "", exitCode: 0 };
	} catch (e: any) {
		return {
			stdout: e.stdout || "",
			stderr: e.stderr || "",
			exitCode: e.status ?? 1,
		};
	}
}

let tempDir: string | null = null;

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true });
		tempDir = null;
	}
});

// Skip all e2e tests if CLI entry point does not exist yet
const cliExists = existsSync(CLI_PATH);
const describeE2E = cliExists ? describe : describe.skip;

describeE2E("CLI E2E", () => {
	it("should create a new topic", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const result = exec('new-topic "测试主题"', tempDir);
		expect(result.exitCode).toBe(0);

		const output = JSON.parse(result.stdout);
		expect(output.dir).toBeDefined();
		expect(existsSync(join(output.dir, "kg.json"))).toBe(true);
		expect(existsSync(output.tasksFile)).toBe(true);
		expect(existsSync(join(output.dir, "search_results"))).toBe(true);
		expect(existsSync(join(output.dir, "pages"))).toBe(true);

		const data = JSON.parse(readFileSync(join(output.dir, "kg.json"), "utf-8"));
		expect(data.nodes).toBeDefined();
	});

	it("should create a task", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const result = exec(
			`task create --title "Research Task" --goal "Investigate claims" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.id).toMatch(/^task_/);
		expect(existsSync(output.tasksFile)).toBe(true);
	});

	it("should create an Entity node", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonFilePath = join(tempDir, "node-data.json");
		writeFileSync(jsonFilePath, JSON.stringify({
			type: "Entity",
			title: "OpenAI",
			attrs: { entityType: "Organization" },
		}));

		const result = exec(
			`node upsert --json-in "${jsonFilePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create an Edge", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const e1JsonPath = join(tempDir, "e1.json");
		writeFileSync(e1JsonPath, JSON.stringify({ type: "Entity", title: "A", attrs: { entityType: "Person" } }));
		const e1 = exec(
			`node upsert --json-in "${e1JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const e2JsonPath = join(tempDir, "e2.json");
		writeFileSync(e2JsonPath, JSON.stringify({ type: "Entity", title: "B", attrs: { entityType: "Person" } }));
		const e2 = exec(
			`node upsert --json-in "${e2JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const id1 = JSON.parse(e1.stdout).id;
		const id2 = JSON.parse(e2.stdout).id;

		const result = exec(
			`edge create --from ${id1} --to ${id2} --type related_to --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should query nodes", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "entity.json");
		writeFileSync(jsonPath, JSON.stringify({ type: "Entity", title: "OpenAI", attrs: { entityType: "Organization" } }));
		exec(`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`, tempDir);

		const result = exec(`node list --kind Entity --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.length).toBeGreaterThanOrEqual(1);
	});

	it("should query edges", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const e1JsonPath = join(tempDir, "e1.json");
		writeFileSync(e1JsonPath, JSON.stringify({ type: "Entity", title: "A", attrs: { entityType: "Person" } }));
		const e1 = exec(
			`node upsert --json-in "${e1JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const e2JsonPath = join(tempDir, "e2.json");
		writeFileSync(e2JsonPath, JSON.stringify({ type: "Entity", title: "B", attrs: { entityType: "Person" } }));
		const e2 = exec(
			`node upsert --json-in "${e2JsonPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const id1 = JSON.parse(e1.stdout).id;
		const id2 = JSON.parse(e2.stdout).id;
		exec(`edge create --from ${id1} --to ${id2} --type related_to --dir "${topicDir}"`, tempDir);

		const result = exec(`edge list --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.length).toBeGreaterThanOrEqual(1);
	});

	it("should create a Source via node upsert", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "source.json");
		writeFileSync(jsonPath, JSON.stringify({
			type: "Source",
			title: "Test Source",
			attrs: { sourceType: "webpage" },
		}));

		const result = exec(
			`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create Evidence", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const srcJsonPath = join(tempDir, "source.json");
		writeFileSync(srcJsonPath, JSON.stringify({ type: "Source", title: "Test Source", attrs: { sourceType: "webpage" } }));
		const src = exec(
			`node upsert --json-in "${srcJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		const evJsonPath = join(tempDir, "evidence.json");
		writeFileSync(evJsonPath, JSON.stringify({
			sourceId: srcId,
			snippet: "Evidence text",
		}));

		const result = exec(
			`evidence add --json-in "${evJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should link Evidence to Entity", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const srcJsonPath = join(tempDir, "source.json");
		writeFileSync(srcJsonPath, JSON.stringify({ type: "Source", title: "Test Source", attrs: { sourceType: "webpage" } }));
		const src = exec(
			`node upsert --json-in "${srcJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		const evJsonPath = join(tempDir, "evidence.json");
		writeFileSync(evJsonPath, JSON.stringify({ sourceId: srcId, snippet: "Evidence text" }));
		const ev = exec(
			`evidence add --json-in "${evJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const evId = JSON.parse(ev.stdout).id;

		const entJsonPath = join(tempDir, "entity.json");
		writeFileSync(entJsonPath, JSON.stringify({ type: "Entity", title: "A", attrs: { entityType: "Person" } }));
		const ent = exec(
			`node upsert --json-in "${entJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const entId = JSON.parse(ent.stdout).id;

		const result = exec(
			`evidence link --evidence ${evId} --target ${entId} --role supports --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create a Proposition via node upsert", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "proposition.json");
		writeFileSync(jsonPath, JSON.stringify({ type: "Proposition", text: "Test proposition", status: "asserted" }));

		const result = exec(
			`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should set Proposition status via node set-status", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "proposition.json");
		writeFileSync(jsonPath, JSON.stringify({ type: "Proposition", text: "Test proposition", status: "asserted" }));
		const prop = exec(
			`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const propId = JSON.parse(prop.stdout).id;

		const result = exec(
			`node set-status ${propId} supported --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should create a Question as Proposition with status open", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "question.json");
		writeFileSync(jsonPath, JSON.stringify({ type: "Proposition", text: "What is the evidence?", status: "open" }));

		const result = exec(
			`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
	});

	it("should run graph stats", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const jsonPath = join(tempDir, "entity.json");
		writeFileSync(jsonPath, JSON.stringify({ type: "Entity", title: "A", attrs: { entityType: "Person" } }));
		exec(`node upsert --json-in "${jsonPath}" --dir "${topicDir}"`, tempDir);

		const result = exec(`graph stats --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.totalNodes).toBeGreaterThanOrEqual(1);
	});

	it("should run graph lint", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const result = exec(`graph lint --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
	});

	it("should run llm extract-entities", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const srcJsonPath = join(tempDir, "source.json");
		writeFileSync(srcJsonPath, JSON.stringify({ type: "Source", title: "Test Source", attrs: { sourceType: "webpage" } }));
		const src = exec(
			`node upsert --json-in "${srcJsonPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const srcId = JSON.parse(src.stdout).id;

		const result = exec(
			`llm extract-entities --source ${srcId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.taskType).toBe("extract_entities");
		expect(output.instructions).toBeDefined();
		expect(output.recommendedPrompt).toBeDefined();
		expect(output.outputSchema).toBeDefined();
	});

	it("should run llm generate-questions", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Test Topic"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const result = exec(`llm generate-questions --dir "${topicDir}"`, tempDir);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.taskType).toBe("generate_questions");
	});

	it("should link a created proposition to a task and allow task-scoped listing via node list", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Task Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const propPath = join(tempDir, "task-proposition.json");
		writeFileSync(
			propPath,
			JSON.stringify({
				type: "Proposition",
				text: "This proposition is intentionally long enough to be easy to identify and should remain visible when filtering by the linked task identifier.",
				status: "asserted",
			}),
		);

		const createResult = exec(
			`node upsert --task ${taskId} --json-in "${propPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(createResult.exitCode).toBe(0);

		const listResult = exec(
			`node list --kind Proposition --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(listResult.exitCode).toBe(0);
		const output = JSON.parse(listResult.stdout);
		expect(output).toHaveLength(1);
		expect(output[0].text).toContain("linked task identifier");
	});

	it("should update source content and expose it to llm extraction tasks", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Source Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const sourcePath = join(tempDir, "source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				type: "Source",
				title: "Deep Source",
				attrs: { sourceType: "webpage" },
			}),
		);
		const sourceResult = exec(
			`node upsert --task ${taskId} --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(sourceResult.exitCode).toBe(0);
		const sourceId = JSON.parse(sourceResult.stdout).id;

		const updatePath = join(tempDir, "source-update.json");
		writeFileSync(
			updatePath,
			JSON.stringify({
				id: sourceId,
				type: "Source",
				title: "Deep Source",
				text: "This is the captured body text that should appear in the extraction task input context.",
				summary: "Captured summary",
				attrs: { sourceType: "webpage" },
			}),
		);
		const updateResult = exec(
			`node upsert --json-in "${updatePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(updateResult.exitCode).toBe(0);

		const extractResult = exec(
			`llm extract-claims --source ${sourceId} --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(extractResult.exitCode).toBe(0);
		const output = JSON.parse(extractResult.stdout);
		expect(output.inputContext.sourceContent).toContain("captured body text");
	});

	it("should reject invalid evidence link roles at runtime", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Evidence Validation"', tempDir);
		const topicDir = JSON.parse(topicResult.stdout).dir;

		const sourcePath = join(tempDir, "source.json");
		writeFileSync(sourcePath, JSON.stringify({ type: "Source", title: "Test Source", attrs: { sourceType: "webpage" } }));
		const sourceResult = exec(
			`node upsert --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		const sourceId = JSON.parse(sourceResult.stdout).id;

		const evidencePath = join(tempDir, "evidence.json");
		writeFileSync(
			evidencePath,
			JSON.stringify({
				sourceId,
				snippet: "This evidence text is long enough to be accepted before link-role validation is applied.",
			}),
		);
		const evidenceResult = exec(
			`evidence add --json-in "${evidencePath}" --dir "${topicDir}"`,
			tempDir,
		);
		const evidenceId = JSON.parse(evidenceResult.stdout).id;

		const propPath = join(tempDir, "proposition.json");
		writeFileSync(
			propPath,
			JSON.stringify({
				type: "Proposition",
				text: "This proposition text is long enough to support the invalid link role runtime validation scenario in the CLI.",
				status: "asserted",
			}),
		);
		const propResult = exec(
			`node upsert --json-in "${propPath}" --dir "${topicDir}"`,
			tempDir,
		);
		const propId = JSON.parse(propResult.stdout).id;

		const result = exec(
			`evidence link --evidence ${evidenceId} --target ${propId} --role nonsense --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("Invalid evidence link");
	});

	it("should keep llm generate-report scoped to the requested task", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Report Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskA = topic.taskId;

		const propAPath = join(tempDir, "prop-a.json");
		writeFileSync(
			propAPath,
			JSON.stringify({
				type: "Proposition",
				text: "Proposition from task A that should remain in the task-scoped report envelope after filtering is applied.",
				status: "asserted",
			}),
		);
		exec(
			`node upsert --task ${taskA} --json-in "${propAPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const taskBResult = exec(
			`task create --title "Task B" --goal "Secondary investigation" --dir "${topicDir}"`,
			tempDir,
		);
		const taskB = JSON.parse(taskBResult.stdout).id;

		const propBPath = join(tempDir, "prop-b.json");
		writeFileSync(
			propBPath,
			JSON.stringify({
				type: "Proposition",
				text: "Proposition from task B that should be excluded when generating a report for task A.",
				status: "asserted",
			}),
		);
		exec(
			`node upsert --task ${taskB} --json-in "${propBPath}" --dir "${topicDir}"`,
			tempDir,
		);

		const result = exec(
			`llm generate-report --task ${taskA} --topic "Scoped Report" --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.inputContext.claimsCount).toBe(1);
		expect(output.graphContext.focusNodeIds).toHaveLength(1);
	});

	it("should manage task checklist items in tasks.md", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Checklist Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;
		expect(existsSync(topic.tasksFile)).toBe(true);

		const checklistResult = exec(
			`task checklist ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checklistResult.exitCode).toBe(0);
		const checklist = JSON.parse(checklistResult.stdout);
		expect(checklist.summary.total).toBeGreaterThan(0);

		const addResult = exec(
			`task add-item ${taskId} --text "补充独立第三方来源验证" --dir "${topicDir}"`,
			tempDir,
		);
		expect(addResult.exitCode).toBe(0);
		const item = JSON.parse(addResult.stdout);
		expect(item.id).toMatch(/^tki_/);

		const checkResult = exec(
			`task check ${taskId} --item ${item.id} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checkResult.exitCode).toBe(0);
		const checked = JSON.parse(checkResult.stdout);
		expect(checked.completed).toBe(true);

		const uncheckResult = exec(
			`task uncheck ${taskId} --item ${item.id} --dir "${topicDir}"`,
			tempDir,
		);
		expect(uncheckResult.exitCode).toBe(0);
		const unchecked = JSON.parse(uncheckResult.stdout);
		expect(unchecked.completed).toBe(false);
	});

	it("should sync search_results and pages artifacts into tasks.md", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Artifact Sync Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;
		const tasksFile = topic.tasksFile;

		const continueResult = exec(
			`task continue ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(continueResult.exitCode).toBe(0);

		writeFileSync(
			join(topicDir, "search_results", "r1_q1_opencli.json"),
			JSON.stringify({ query: "artifact sync", results: [] }),
		);
		writeFileSync(
			join(topicDir, "pages", "page_001.json"),
			JSON.stringify({ url: "https://example.com", content: "captured page content" }),
		);

		const syncResult = exec(
			`task sync-artifacts ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(syncResult.exitCode).toBe(0);
		const syncOutput = JSON.parse(syncResult.stdout);
		expect(syncOutput.searchResults.count).toBe(1);
		expect(syncOutput.pages.count).toBe(1);
		expect(syncOutput.markedWorkflow).toContain("执行搜索并保存原始搜索结果");

		const checklistResult = exec(
			`task checklist ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checklistResult.exitCode).toBe(0);
		const checklist = JSON.parse(checklistResult.stdout);
		const completedTexts = checklist.completedItems.map((item: { text: string }) => item.text);

		expect(completedTexts).toContain("执行搜索并保存原始搜索结果");
		expect(completedTexts).toContain("[Round 1] 执行搜索并保存原始搜索结果");
		expect(completedTexts).toContain("搜索结果产物：search_results/r1_q1_opencli.json");
		expect(completedTexts).toContain("页面抓取产物：pages/page_001.json");

		const markdown = readFileSync(tasksFile, "utf-8");
		expect(markdown).toContain("## Search Results");
		expect(markdown).toContain("## Pages");
	});

	it("should append round plans to tasks.md when continuing research via task continue", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Research Continue Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;
		const tasksFile = topic.tasksFile;

		const firstResult = exec(
			`task continue ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(firstResult.exitCode).toBe(0);
		const firstOutput = JSON.parse(firstResult.stdout);
		expect(firstOutput.round).toBe(1);
		expect(firstOutput.workflowChecklist.pendingItems.length).toBeGreaterThan(0);

		const firstMarkdown = readFileSync(tasksFile, "utf-8");
		expect(firstMarkdown).toContain("## Round 1");
		expect(firstMarkdown).toContain(
			"[x] [Round 1] 从图谱推导下一步搜索方向，并确认本轮研究目标",
		);

		const secondResult = exec(
			`task continue ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(secondResult.exitCode).toBe(0);
		const secondOutput = JSON.parse(secondResult.stdout);
		expect(secondOutput.round).toBe(2);

		const secondMarkdown = readFileSync(tasksFile, "utf-8");
		expect(secondMarkdown).toContain("## Round 2");
		expect(secondMarkdown.match(/^## Round /gm)?.length).toBe(2);
	});

	it("should auto-mark workflow progress for task-scoped graph actions", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Auto Workflow Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const continueResult = exec(
			`task continue ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(continueResult.exitCode).toBe(0);

		const sourcePath = join(tempDir, "auto-source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				type: "Source",
				title: "Auto Workflow Source",
				text: "Captured page content that should complete the source collection step for the active task.",
				attrs: { sourceType: "webpage" },
			}),
		);
		const sourceResult = exec(
			`node upsert --task ${taskId} --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(sourceResult.exitCode).toBe(0);

		const propPath = join(tempDir, "auto-proposition.json");
		writeFileSync(
			propPath,
			JSON.stringify({
				type: "Proposition",
				text: "This task-scoped proposition is long enough to count as extracted knowledge and should advance both extraction and graph writing workflow items.",
				status: "asserted",
			}),
		);
		const propResult = exec(
			`node upsert --task ${taskId} --json-in "${propPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(propResult.exitCode).toBe(0);

		const questionPath = join(tempDir, "auto-question.json");
		writeFileSync(
			questionPath,
			JSON.stringify({
				type: "Proposition",
				text: "What contradictory evidence still needs to be collected for this task?",
				status: "open",
			}),
		);
		const questionResult = exec(
			`node upsert --task ${taskId} --json-in "${questionPath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(questionResult.exitCode).toBe(0);

		const lintResult = exec(
			`graph lint --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(lintResult.exitCode).toBe(0);

		const gapResult = exec(
			`graph gaps --detect --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(gapResult.exitCode).toBe(0);

		const checklistResult = exec(
			`task checklist ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(checklistResult.exitCode).toBe(0);
		const checklist = JSON.parse(checklistResult.stdout);
		const completedTexts = checklist.completedItems.map((item: { text: string }) => item.text);

		expect(completedTexts).toContain("筛选来源、写入 Source 节点，并补齐页面正文");
		expect(completedTexts).toContain("[Round 1] 筛选来源、写入 Source 节点，并补齐页面正文");
		expect(completedTexts).toContain("执行实体、断言、关系与观察提取");
		expect(completedTexts).toContain("[Round 1] 执行实体、断言、关系与观察提取");
		expect(completedTexts).toContain("写入 Evidence / Claim / Edge，并建立证据链");
		expect(completedTexts).toContain("[Round 1] 写入 Evidence / Claim / Edge，并建立证据链");
		expect(completedTexts).toContain("执行质量门控与 graph lint，补齐薄弱信息");
		expect(completedTexts).toContain("[Round 1] 执行质量门控与 graph lint，补齐薄弱信息");
		expect(completedTexts).toContain("执行规范化、生成问题/假设/缺口，并判断是否进入下一轮");
		expect(completedTexts).toContain("[Round 1] 执行规范化、生成问题/假设/缺口，并判断是否进入下一轮");
	});

	it("should include workflow checklist context in task-scoped llm envelopes", () => {
		tempDir = mkdtempSync(join(tmpdir(), "kg-e2e-"));

		const topicResult = exec('new-topic "Workflow Topic"', tempDir);
		const topic = JSON.parse(topicResult.stdout);
		const topicDir = topic.dir;
		const taskId = topic.taskId;

		const sourcePath = join(tempDir, "workflow-source.json");
		writeFileSync(
			sourcePath,
			JSON.stringify({
				type: "Source",
				title: "Workflow Source",
				text: "This source is used to verify that workflow checklist context is injected into llm task envelopes.",
				attrs: { sourceType: "webpage" },
			}),
		);

		const sourceResult = exec(
			`node upsert --task ${taskId} --json-in "${sourcePath}" --dir "${topicDir}"`,
			tempDir,
		);
		expect(sourceResult.exitCode).toBe(0);
		const sourceId = JSON.parse(sourceResult.stdout).id;

		const result = exec(
			`llm extract-claims --source ${sourceId} --task ${taskId} --dir "${topicDir}"`,
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.inputContext.workflowChecklist).toBeDefined();
		expect(output.recommendedPrompt).toContain("外置流程记忆");
	});
});
