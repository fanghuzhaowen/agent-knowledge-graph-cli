<div align="center">
  <img src="./docs/banner.png" alt="Agent Knowledge Graph CLI" width="100%">
</div>

<div align="center">

# Agent Knowledge Graph CLI (`kg`)

**AI Agent 的结构化长期记忆**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Runtime-Bun-000?logo=bun&logoColor=fff)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/Lang-TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](./CONTRIBUTING.md)

[English](./README.md) · [报告 Bug](https://github.com/fanghuzhaowen/agent-knowledge-graph-cli/issues) · [功能建议](https://github.com/fanghuzhaowen/agent-knowledge-graph-cli/issues)

</div>

图谱驱动的迭代式深度调研工具。面向 LLM/Agent 调用设计，CLI 只做图谱操作与任务编排，不直接调用模型。

## 一览

```
 kg new-topic "AI 安全调研"
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │                     kg.json (知识图谱)                    │
 │                                                          │
 │  [来源] ──提取──▶ [命题] ◀──支持── [证据]                  │
 │     │               │      │                              │
 │   来源关联        反驳    回答                              │
 │     │               │      │                              │
 │     ▼               ▼      ▼                              │
 │  [实体]          [命题] ◀──引发── [命题]                   │
 └──────────────────────────────────────────────────────────┘
        │
        ▼  (Agent 循环直至填补所有知识缺口)
 ┌──────────────────────────────────────────────────────────┐
 │  有据可依的研究报告                                        │
 │  带溯源链的已验证命题                                      │
 │  计算得出的知识缺口，驱动下一轮调研                          │
 └──────────────────────────────────────────────────────────┘
```

## 为什么 AI Agent 需要 `kg`？

大模型的推理能力取决于上下文质量。`kg` 为 Agent 提供了**结构化的长期记忆**——将碎片化的调研信息组织为可查询、可推理的知识图谱，让 Agent 在多轮迭代中保持认知一致性，而非在海量原始文本中迷失。

**核心价值：**

- **图谱即记忆** — Agent 不再依赖滑动窗口或向量检索，而是通过实体、命题、证据、来源的语义关系网络来存取和推理知识
- **零模型耦合** — CLI 不调用任何 LLM API，只输出标准化的 `LlmTaskEnvelope`（含上下文、指令、prompt 模板、输出 schema），Agent 自由选择模型和调用方式
- **证据链追踪** — 每条 Proposition 都可通过 `evidence_link` 边溯源到原始 Source -> Evidence 关系，支持 `supports / contradicts / weakly_supported` 等多种证据角色，Agent 能做到真正的循证推理
- **统一命题模型** — 问题、假设、断言、观察统一为 Proposition 节点，12 种状态覆盖完整生命周期，简化图谱同时保持充分表达力
- **计算式缺口检测** — `graph gaps --detect` 返回计算得出的 `GapResult[]`，主动发现知识盲区（无证据支撑的命题、未回答的问题、孤立节点），无需在图谱中存储 Gap 节点
- **迭代式研究循环** — `task continue` 编排完整的"搜索->提取->质疑->补缺"循环，Agent 只需循环调用即可完成深度调研
- **外置流程记忆** — 任务清单（Checklist）持久化到磁盘，Agent 跨会话恢复时能无缝续接未完成工作
- **轻量无依赖** — 单文件 JSON 存储（`kg.json`），无需数据库，零运维成本，适合嵌入任何 Agent 工具链

**典型 Agent 集成架构：**

```
┌─────────────┐    CLI 调用     ┌─────────────┐    LLM 调用    ┌─────────────┐
│  Agent 主控  │ ──────────────→ │   kg CLI    │               │  LLM API    │
│  (Python/TS) │ ←── JSON 输出 ──│  (本工具)    │               │ (GPT/Claude) │
│             │                 │             │               │             │
│  搜索/抓取   │                 │  图谱操作    │               │             │
│  结果回写    │                 │  任务编排    │               │             │
└─────────────┘                 └─────────────┘               └─────────────┘
       │                               │
       │         回写结果               │  读取 kg.json
       └───────→ temp/{topic}/ ←───────┘
                  ├── kg.json
                  ├── search_results/
                  └── pages/
```

## 为什么选择 `kg`

- **轻量无依赖** — 无数据库、无服务端、无运行时依赖。一个 `kg.json` 文件即可完成所有操作，零运维成本
- **单文件存储** — 所有节点、边和操作日志存储在一个 `kg.json` 中。无需迁移、无需同步、可移植可检视
- **代码简洁** — 精简的 TypeScript 实现，代码清晰易读，方便扩展和嵌入任何 Agent 工具链
- **LLM 信封机制（`LlmTaskEnvelope`）** — 无需额外接入任何 LLM API。CLI 只输出结构化的任务信封（上下文 + 指令 + prompt + 输出 schema），由你现有的 Agent 直接用自己的 LLM 执行即可——`kg` 从不触碰模型密钥或接口

## 安装

```bash
# 克隆并安装
git clone https://github.com/fanghuzhaowen/agent-knowledge-graph-cli.git
cd agent-knowledge-graph-cli
bun install

# 构建
bun run build

# 全局链接，之后可直接使用 `kg` 命令
bun link
```

链接后，所有命令可以直接用 `kg` 开头，无需再输入 `bun run`：

```bash
kg --help
kg new-topic "我的调研"
kg node list --dir ./path/to/research
```

## 快速开始

```bash
# 创建新调研主题
kg new-topic "Gemma4评测"

# 所有后续命令通过 --dir 指定研究目录
DIR="./temp/Gemma4评测_1712130000000"

# 创建调研任务
kg task create --title "Gemma4 评测调研" --goal "评估官方 benchmark 是否有独立证据支持" --dir $DIR

# 添加来源
echo '{"title":"Gemma 4 Technical Report","type":"Source","attrs":{"uri":"https://example.com/gemma4-report","sourceType":"webpage","author":"Google"}}' | kg node upsert --json-in - --dir $DIR

# 查看所有节点
kg node list --dir $DIR
```

## 命令总览

### 基础图谱操作

```bash
# 节点
kg node get <id> --dir <dir>
kg node list [--type Entity] [--status open] --dir <dir>
kg node upsert --json-in data.json --dir <dir>
kg node delete <id> --dir <dir>

# 边
kg edge create --from ent_1 --type related_to --to ent_2 --dir <dir>
kg edge get <id> --dir <dir>
kg edge list [--from ent_1] [--type related_to] --dir <dir>
kg edge delete <id> --dir <dir>
```

> 注意：所有节点命令仍支持 `--kind` 作为 `--type` 的别名。

### 证据管理

```bash
# 添加来源
echo '{"title":"论文标题","type":"Source","attrs":{"uri":"https://example.com","sourceType":"webpage"}}' | kg node upsert --json-in - --dir <dir>

# 添加证据
echo '{"type":"Evidence","text":"原文引用片段","attrs":{"sourceId":"src_xxx"}}' | kg node upsert --json-in - --dir <dir>

# 链接证据到命题（创建 evidence_link 边）
kg evidence link --evidence ev_1 --target prop_1 --role supports --dir <dir>

# 查看某个目标的所有证据
kg evidence list --target prop_1 --dir <dir>
```

### 命题管理

```bash
# 创建命题（断言类型）
echo '{"type":"Proposition","text":"Gemma 4 31B 在 MMLU Pro 上达到 85.2%","status":"unrefined","attrs":{"propositionType":"claim"}}' | kg node upsert --json-in - --dir <dir>

# 创建命题（问题类型）
echo '{"type":"Proposition","text":"是否有第三方独立评测？","status":"open","attrs":{"propositionType":"question"}}' | kg node upsert --json-in - --dir <dir>

# 创建命题（假设类型）
echo '{"type":"Proposition","text":"独立评测分数可能低于官方","status":"hypothesized","attrs":{"propositionType":"hypothesis"}}' | kg node upsert --json-in - --dir <dir>

# 更新命题状态
kg node set-status prop_1 supported --dir <dir>

# 查看冲突
kg node conflicts prop_1 --dir <dir>

# 合并两个命题
kg node merge prop_1 prop_2 --dir <dir>

# 列出未解决问题
kg node list --type Proposition --status open --dir <dir>
```

### 图谱查询

```bash
# 邻居遍历（BFS）
kg graph neighbors ent_1 --depth 2 --dir <dir>

# 子图提取
kg graph subgraph --focus ent_1 --depth 2 --dir <dir>

# 统计
kg graph stats --dir <dir>

# 图谱检查
kg graph lint --dir <dir>

# 检测知识缺口（返回计算得出的 GapResult[]，不创建节点）
kg graph gaps --detect --dir <dir>
```

### 图谱可视化

将知识图谱导出为单个交互式 HTML 文件，内置 D3.js 力导向布局。

```bash
# 导出完整图谱
kg graph export-html -o graph.html --dir <dir>

# 导出指定节点的子图
kg graph export-html -o graph.html --focus ent_1 --depth 3 --dir <dir>

# 导出指定任务的图谱
kg graph export-html -o graph.html --task task_1 --dir <dir>
```

**功能特性：**

- 力导向布局，支持拖拽和缩放
- 节点按类型着色（Entity、Source、Evidence、Proposition）
- 节点边框按命题状态着色（已支持、争议中、待解决等）
- 点击节点查看详细信息侧边栏
- 按标题或内容搜索节点
- 导出为 SVG
- 内置统计面板和图例

<div align="center">
  <img src="./docs/demo-graph-screenshot.png" alt="图谱可视化示例" width="90%">
</div>

### 报告生成

```bash
# 生成 Markdown 报告
kg graph report --task task_1 --dir <dir>

# 生成 JSON 格式报告
kg graph report --task task_1 --format json -o report.json --dir <dir>

# 列出所有引用
kg graph citations --dir <dir>
```

### LLM 任务编排

所有 `llm` 命令不直接调用模型，只输出 JSON 格式的 `LlmTaskEnvelope`（含上下文、指令、推荐 prompt、输出 schema），由上层 Agent 执行。任务类型通过位置参数指定。

```bash
# 从来源提取实体
kg llm extract-entities --source src_1 --dir <dir>

# 从来源提取命题
kg llm extract-claims --source src_1 --dir <dir>

# 生成新研究问题
kg llm generate-questions --dir <dir>

# 生成下一轮搜索词
kg llm next-search-queries --dir <dir>

# 评估证据质量
kg llm assess-evidence --proposition prop_1 --dir <dir>

# 实体/命题去重
kg llm normalize-entities --dir <dir>
kg llm normalize-claims --dir <dir>

# 生成报告信封
kg llm generate-report --task task_1 --topic "我的主题" --dir <dir>
```

## LLM 任务输出示例

```json
{
  "taskType": "extract_claims",
  "graphContext": {
    "focusNodeIds": ["src_1"],
    "relatedNodes": [...],
    "relatedEdges": [],
    "relatedEvidence": []
  },
  "inputContext": {
    "source": { "id": "src_1", "title": "..." },
    "existingPropositions": [...]
  },
  "instructions": "Extract candidate propositions from the source...",
  "recommendedPrompt": "You are given a source...",
  "outputSchema": {
    "type": "object",
    "properties": {
      "propositions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": { "type": "string" },
            "type": { "type": "string", "enum": ["Proposition"] },
            "status": { "type": "string" },
            "attrs": {
              "type": "object",
              "properties": {
                "propositionType": { "type": "string" }
              }
            }
          }
        }
      }
    }
  },
  "executionHint": {
    "suggestedCommand": "kg node upsert --json-in propositions.json"
  }
}
```

## 节点类型

| 类型 | 说明 | 关键字段 |
|------|------|----------|
| `Entity` | 客观对象（人/组织/概念/...） | attrs.entityType, title |
| `Source` | 原始来源 | title, attrs.uri, attrs.sourceType |
| `Evidence` | 证据片段（含数值） | text, attrs.sourceId, attrs.valueType |
| `Proposition` | 统一命题（问题/假设/断言/观察） | text, status（12 种状态）, attrs.propositionType |

**命题子类型**（`attrs.propositionType`）：`question`、`hypothesis`、`claim`、`observation`

## 边类型

```
related_to, evidence_link, derived_from, contradicts, supports,
supersedes, answers, raised_by, predicts, sourced_from
```

| 边类型 | 说明 |
|--------|------|
| `related_to` | 任意两个节点之间的通用关系 |
| `evidence_link` | 证据到命题的链接（由 `evidence link` 命令创建） |
| `derived_from` | 命题派生自另一节点 |
| `contradicts` | 一个命题反驳另一个命题 |
| `supports` | 一个节点支持另一个节点 |
| `supersedes` | 一个命题取代较旧的命题 |
| `answers` | 一个命题回答另一个命题（如回答问题） |
| `raised_by` | 命题由另一节点引发 |
| `predicts` | 命题预测关于另一节点的内容 |
| `sourced_from` | 节点来源于某个 Source |

## 命题状态流转

```
unrefined -> open -> hypothesized -> asserted -> evaluating -> supported
                                                           -> weakly_supported
                                                           -> contested -> contradicted
                                                           -> superseded
                                                           -> resolved
                                                           -> obsolete
```

**状态说明：**

| 状态 | 说明 |
|------|------|
| `unrefined` | 原始提取，尚未审查 |
| `open` | 正在积极调查 |
| `hypothesized` | 已表述为待验证假设 |
| `asserted` | 作为有依据的断言陈述 |
| `evaluating` | 正在进行证据评估 |
| `supported` | 有强有力的证据支持 |
| `weakly_supported` | 证据有限或质量较低 |
| `contested` | 存在冲突证据 |
| `contradicted` | 证据主要反驳该命题 |
| `superseded` | 被更新的命题取代 |
| `resolved` | 已明确解决 |
| `obsolete` | 不再相关 |

## 缺口检测

`graph gaps --detect` 返回计算得出的 `GapResult[]` 数组——它**不会**在图谱中创建 Gap 节点。缺口通过实时分析当前图谱状态来检测（如无证据支撑的命题、未回答的问题、孤立节点）。

```json
[
  {
    "gapType": "unsubstantiated_proposition",
    "nodeId": "prop_5",
    "description": "Proposition has no supporting or contradicting evidence"
  },
  {
    "gapType": "unanswered_question",
    "nodeId": "prop_3",
    "description": "Question has no answer proposition linked via 'answers' edge"
  }
]
```

## 存储格式

每个研究目录包含一个 `kg.json` 文件，存储所有节点、边和操作日志。

```
temp/{topic}_{timestamp}/
├── kg.json          # 唯一数据来源
├── search_results/  # 搜索原始结果（由上层 Agent 管理）
└── pages/           # 抓取页面全文（由上层 Agent 管理）
```

## 与其他方案对比

| | `kg`（本工具） | RAG / 向量数据库 | 纯 LLM 上下文 | 知识图谱数据库 |
|---|---|---|---|---|
| **结构化关系** | 4 种节点类型，10 种边类型 | 扁平分块 | 非结构化 | 完整图谱 |
| **证据可溯源** | Source -> Evidence -> Proposition（通过 `evidence_link` 边） | 仅相似度 | 无 | 需手动配置 |
| **统一命题模型** | 问题/假设/断言/观察合为一种类型 | 不适用 | 不适用 | 不适用 |
| **缺口检测** | 实时计算（不存储节点） | 无 | 无 | 无 |
| **Agent 就绪** | LlmTaskEnvelope | 无 | 无 | 无 |
| **零基础设施** | 单个 JSON 文件 | 需向量数据库 | 是 | 需图数据库 |
| **模型无关** | 任意 LLM | 是 | 是 | 是 |

## 路线图

> 还没想好...

## 贡献指南

欢迎贡献！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详情。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交改动 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

## 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解版本历史。

## 测试

```bash
bun run test              # 单元测试
bun run test:e2e          # E2E 测试
```

## License

[MIT](./LICENSE) misakaikato

<div align="center">

**[回到顶部](#agent-knowledge-graph-cli-kg)**

</div>
