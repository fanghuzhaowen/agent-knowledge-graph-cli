<div align="center">
  <img src="./docs/banner.png" alt="Agent Knowledge Graph CLI" width="100%">
</div>

<div align="center">

# Agent Knowledge Graph CLI (`kg`)

**Structured Long-Term Memory for AI Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Runtime-Bun-000?logo=bun&logoColor=fff)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/Lang-TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg)](./CONTRIBUTING.md)

[中文](./README.zh.md) · [Report Bug](https://github.com/fanghuzhaowen/agent-knowledge-graph-cli/issues) · [Request Feature](https://github.com/fanghuzhaowen/agent-knowledge-graph-cli/issues)

</div>

A graph-driven iterative deep research tool. Designed for LLM/Agent invocation — the CLI handles only graph operations and task orchestration, never calling models directly.

## Features at a Glance

```
 kg new-topic "AI Safety Research"
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │                     kg.json (Graph)                      │
 │                                                          │
 │  [Source] ──extract──▶ [Proposition] ◀──supports── [Evidence]  │
 │     │                     │        │                              │
 │   sourced_from        contradicts  answers                      │
 │     │                     │        │                              │
 │     ▼                     ▼        ▼                              │
 │  [Entity]            [Proposition] ◀──raised_by── [Proposition] │
 └──────────────────────────────────────────────────────────┘
        │
        ▼  (Agent loops until gaps are filled)
 ┌──────────────────────────────────────────────────────────┐
 │  Evidence-backed research report                          │
 │  Verified propositions with source traces                 │
 │  Computed knowledge gaps driving next research round      │
 └──────────────────────────────────────────────────────────┘
```

## Why AI Agents Need `kg`

An LLM's reasoning quality depends on context quality. `kg` provides agents with **structured long-term memory** — organizing fragmented research information into a queryable, reasonable knowledge graph that lets agents maintain cognitive consistency across multi-round iterations instead of getting lost in raw text.

**Core Value for Agents:**

- **Graph-as-Memory** — Agents no longer rely on sliding context windows or vector retrieval. Instead, they store and reason over knowledge through a semantic network of entities, propositions, evidence, and sources
- **Zero Model Coupling** — The CLI never calls any LLM API. It outputs standardized `LlmTaskEnvelope` objects (containing context, instructions, prompt templates, and output schemas), letting agents freely choose their model and invocation strategy
- **Evidence Chain Tracking** — Every Proposition traces back to its original Source -> Evidence -> evidence_link edge relationship, supporting multiple evidence roles (`supports`, `contradicts`, `mentions`, `qualifies`). Agents achieve genuine evidence-based reasoning
- **Unified Proposition Model** — Questions, hypotheses, claims, and observations are all represented as Proposition nodes with a 12-state lifecycle, simplifying the graph while preserving full expressiveness
- **Computed Gap Detection** — `graph gaps --detect` returns computed `GapResult[]` — proactively discovering knowledge blind spots (unsubstantiated propositions, unanswered questions, orphaned nodes) without storing Gap nodes in the graph
- **Iterative Research Loop** — `task continue` orchestrates the full "search -> extract -> challenge -> fill gaps" cycle. Agents complete deep research simply by looping
- **Externalized Process Memory** — Task checklists persist to disk, allowing agents to seamlessly resume unfinished work across sessions
- **Lightweight & Dependency-Free** — Single-file JSON storage (`kg.json`), no database required, zero ops cost. Embeds into any agent toolchain

**Typical Agent Integration Architecture:**

```
┌─────────────┐   CLI calls    ┌─────────────┐               ┌─────────────┐
│ Agent Core  │ ──────────────→ │   kg CLI    │   LLM calls   │  LLM API    │
│ (Python/TS) │ ←── JSON out ──│  (this tool) │               │ (GPT/Claude) │
│             │                │             │               │             │
│ Search/     │                │ Graph Ops   │               │             │
│ Crawl/Write │                │ Task Orchest│               │             │
└─────────────┘                └─────────────┘               └─────────────┘
       │                              │
       │       Write results          │  Read kg.json
       └───────→ temp/{topic}/ ←──────┘
                  ├── kg.json
                  ├── search_results/
                  └── pages/
```

## Why Choose `kg`

- **Lightweight & Zero Dependencies** — No database, no server, no runtime services. A single `kg.json` file is all you need. Ship it, version it, share it — zero ops cost
- **Single-File Storage** — All nodes, edges, and operation logs live in one `kg.json`. No migrations, no schema sync, no distributed state. Portable and inspectable
- **Clean & Concise Codebase** — Minimal TypeScript implementation, easy to read, extend, and embed into any agent toolchain
- **LLM Envelope Mechanism (`LlmTaskEnvelope`)** — No need to integrate any LLM API. The CLI outputs structured task envelopes (context + instructions + prompt + output schema). Your existing Agent reads the envelope and calls its own LLM directly — `kg` never touches model keys or endpoints

## Installation

```bash
# Clone and install
git clone https://github.com/fanghuzhaowen/agent-knowledge-graph-cli.git
cd agent-knowledge-graph-cli
bun install

# Build
bun run build

# Link globally so you can use `kg` directly
bun link
```

After linking, all commands can be run with just `kg` instead of `bun run kg`:

```bash
kg --help
kg new-topic "My Research"
kg node list --dir ./path/to/research
```

## Quick Start

```bash
# Create a new research topic
kg new-topic "Gemma4 Review"

# All subsequent commands use --dir to specify the research directory
DIR="./temp/Gemma4Review_1712130000000"

# Create a research task
kg task create --title "Gemma4 Review Research" --goal "Evaluate whether official benchmarks have independent evidence support" --dir $DIR

# Add a source
echo '{"title":"Gemma 4 Technical Report","type":"Source","attrs":{"uri":"https://example.com/gemma4-report","sourceType":"webpage","author":"Google"}}' | kg node upsert --json-in - --dir $DIR

# List all nodes
kg node list --dir $DIR
```

## Command Reference

### Basic Graph Operations

```bash
# Nodes
kg node get <id> --dir <dir>
kg node list [--kind Entity] [--status open] --dir <dir>
kg node upsert --json-in data.json --dir <dir>
kg node delete <id> --dir <dir>

# Edges
kg edge create --from ent_1 --type related_to --to ent_2 --dir <dir>
kg edge get <id> --dir <dir>
kg edge list [--from ent_1] [--type related_to] --dir <dir>
kg edge delete <id> --dir <dir>
```

> Note: Use `--kind` to filter node types (e.g., `--kind Entity`, `--kind Proposition`).

### Evidence Management

```bash
# Add a source
echo '{"title":"Paper Title","type":"Source","attrs":{"uri":"https://example.com","sourceType":"webpage"}}' | kg node upsert --json-in - --dir <dir>

# Add evidence
echo '{"type":"Evidence","text":"Original quote","attrs":{"sourceId":"src_xxx"}}' | kg node upsert --json-in - --dir <dir>

# Link evidence to a Proposition (creates an evidence_link edge)
kg evidence link --evidence ev_1 --target prop_1 --role supports --dir <dir>

# List all evidence for a target
kg evidence list --target prop_1 --dir <dir>
```

### Proposition Management

```bash
# Create a Proposition (claim type)
echo '{"type":"Proposition","text":"Gemma 4 31B scores 85.2% on MMLU Pro","status":"unrefined","attrs":{"propositionType":"claim"}}' | kg node upsert --json-in - --dir <dir>

# Create a Proposition (question type)
echo '{"type":"Proposition","text":"Are there third-party independent evaluations?","status":"open","attrs":{"propositionType":"question"}}' | kg node upsert --json-in - --dir <dir>

# Create a Proposition (hypothesis type)
echo '{"type":"Proposition","text":"Independent evaluation scores may be lower than official","status":"hypothesized","attrs":{"propositionType":"hypothesis"}}' | kg node upsert --json-in - --dir <dir>

# Update proposition status
kg node set-status prop_1 supported --dir <dir>

# Check conflicts
kg node conflicts prop_1 --dir <dir>

# Merge two propositions
kg node merge prop_1 prop_2 --dir <dir>

# List open questions
kg node list --kind Proposition --status open --dir <dir>
```

### Graph Queries

```bash
# Neighbor traversal (BFS)
kg graph neighbors ent_1 --depth 2 --dir <dir>

# Subgraph extraction
kg graph subgraph --focus ent_1 --depth 2 --dir <dir>

# Statistics
kg graph stats --dir <dir>

# Graph lint
kg graph lint --dir <dir>

# Detect knowledge gaps (returns computed GapResult[], no nodes created)
kg graph gaps --detect --dir <dir>
```

### Graph Visualization

Export the knowledge graph as a single interactive HTML file with D3.js force-directed layout.

```bash
# Export full graph
kg graph export-html -o graph.html --dir <dir>

# Export subgraph from a focus node
kg graph export-html -o graph.html --focus ent_1 --depth 3 --dir <dir>

# Export graph for a specific task
kg graph export-html -o graph.html --task task_1 --dir <dir>
```

**Features:**

- Force-directed layout with drag & zoom
- Color-coded nodes by type (Entity, Source, Evidence, Proposition)
- Color-coded borders by proposition status (supported, contested, open, etc.)
- Click any node to inspect details in sidebar
- Search nodes by title or text
- Export as SVG
- Built-in stats panel and legend

<div align="center">
  <img src="./docs/demo-graph-screenshot.png" alt="Graph Visualization Demo" width="90%">
</div>

### Report Generation

```bash
# Generate markdown report
kg graph report --task task_1 --dir <dir>

# Generate JSON report
kg graph report --task task_1 --format json -o report.json --dir <dir>

# List all citations
kg graph citations --dir <dir>
```

### LLM Task Orchestration

All `llm` commands do not call models directly. They output JSON-formatted `LlmTaskEnvelope` objects (containing context, instructions, recommended prompts, and output schemas) for the upstream agent to execute. The task type is specified as a positional argument.

```bash
# Extract entities from a source
kg llm extract-entities --source src_1 --dir <dir>

# Extract propositions from a source
kg llm extract-claims --source src_1 --dir <dir>

# Generate new research questions
kg llm generate-questions --dir <dir>

# Generate next-round search queries
kg llm next-search-queries --dir <dir>

# Assess evidence quality
kg llm assess-evidence --proposition prop_1 --dir <dir>

# Entity/Proposition deduplication
kg llm normalize-entities --dir <dir>
kg llm normalize-claims --dir <dir>

# Generate report envelope
kg llm generate-report --task task_1 --topic "My Topic" --dir <dir>
```

## LLM Task Output Example

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

## Node Types

| Type | Description | Key Fields |
|------|-------------|------------|
| `Entity` | Objective objects (person/org/concept/...) | attrs.entityType, title |
| `Source` | Original source material | title, attrs.uri, attrs.sourceType |
| `Evidence` | Evidence excerpt (includes numeric values) | text, attrs.sourceId, attrs.valueType |
| `Proposition` | Unified proposition (questions/hypotheses/claims/observations) | text, status (12 states), attrs.propositionType |

**Proposition sub-types** (`attrs.propositionType`): `question`, `hypothesis`, `claim`, `observation`

## Edge Types

```
related_to, evidence_link, derived_from, contradicts, supports,
supersedes, answers, raised_by, predicts, sourced_from
```

| Edge Type | Description |
|-----------|-------------|
| `related_to` | Generic relationship between any two nodes |
| `evidence_link` | Links Evidence to a Proposition (created by `evidence link` command) |
| `derived_from` | Proposition derived from another node |
| `contradicts` | One proposition contradicts another |
| `supports` | One node supports another |
| `supersedes` | One proposition supersedes an older one |
| `answers` | One proposition answers another (e.g. answer to a question) |
| `raised_by` | A proposition raised by another node |
| `predicts` | A proposition predicts something about another node |
| `sourced_from` | Node sourced from a Source |

## Proposition Status Flow

```
unrefined -> open -> hypothesized -> asserted -> evaluating -> supported
                                                           -> weakly_supported
                                                           -> contested -> contradicted
                                                           -> superseded
                                                           -> resolved
                                                           -> obsolete
```

**Status descriptions:**

| Status | Description |
|--------|-------------|
| `unrefined` | Raw extraction, not yet reviewed |
| `open` | Actively being investigated |
| `hypothesized` | Formulated as a hypothesis to test |
| `asserted` | Stated as a claim with some backing |
| `evaluating` | Under active evidence assessment |
| `supported` | Strong evidence in favor |
| `weakly_supported` | Limited or low-quality evidence |
| `contested` | Conflicting evidence exists |
| `contradicted` | Evidence predominantly refutes |
| `superseded` | Replaced by a newer proposition |
| `resolved` | Definitively settled |
| `obsolete` | No longer relevant |

## Gap Detection

`graph gaps --detect` returns a computed `GapResult[]` array — it does **not** create Gap nodes in the graph. Gaps are detected on-the-fly by analyzing the current graph state (e.g., unsubstantiated propositions, unanswered questions, orphaned nodes).

```json
[
  {
    "gapType": "missing_evidence",
    "targetId": "prop_5",
    "severity": 0.8,
    "description": "Proposition has no supporting or contradicting evidence"
  },
  {
    "gapType": "unanswered",
    "targetId": "prop_3",
    "severity": 0.6,
    "description": "Question has no answer proposition linked via 'answers' edge"
  }
]
```

## Storage Format

Each research directory contains a single `kg.json` file storing all nodes, edges, and operation logs.

```
temp/{topic}_{timestamp}/
├── kg.json          # Single source of truth
├── search_results/  # Raw search results (managed by upstream Agent)
└── pages/           # Crawled page content (managed by upstream Agent)
```

## Comparison with Other Approaches

| | `kg` (This Tool) | RAG / Vector DB | Raw LLM Context | Knowledge Graph DB |
|---|---|---|---|---|
| **Structured relations** | 4 node types, 10 edge types | Flat chunks | Unstructured | Full graph |
| **Evidence traceability** | Source -> Evidence -> Proposition via `evidence_link` edges | Similarity only | None | Manual setup |
| **Unified proposition model** | Questions/hypotheses/claims/observations as one type | N/A | N/A | N/A |
| **Gap detection** | Computed on-the-fly (no stored nodes) | No | No | No |
| **Agent-ready output** | LlmTaskEnvelope | No | No | No |
| **Zero infrastructure** | Single JSON file | Need vector DB | Yes | Need graph DB |
| **Model agnostic** | Any LLM | Yes | Yes | Yes |

## Roadmap

> Thinking...

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## Testing

```bash
bun run test              # Unit tests
bun run test:e2e          # E2E tests
```

## License

[MIT](./LICENSE) misakaikato

<div align="center">

**[Back to Top](#agent-knowledge-graph-cli-kg)**

</div>
