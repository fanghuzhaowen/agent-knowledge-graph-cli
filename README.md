<div align="center">
  <img src="./docs/banner.png" alt="Knowledge Graph CLI" width="100%">
</div>

# Agent Knowledge Graph CLI (`kg`)

[中文](./README.zh.md)

A graph-driven iterative deep research tool. Designed for LLM/Agent invocation — the CLI handles only graph operations and task orchestration, never calling models directly.

## Why AI Agents Need `kg`

An LLM's reasoning quality depends on context quality. `kg` provides agents with **structured long-term memory** — organizing fragmented research information into a queryable, reasonable knowledge graph that lets agents maintain cognitive consistency across multi-round iterations instead of getting lost in raw text.

**Core Value for Agents:**

- **Graph-as-Memory** — Agents no longer rely on sliding context windows or vector retrieval. Instead, they store and reason over knowledge through a semantic network of entities, claims, evidence, and questions
- **Zero Model Coupling** — The CLI never calls any LLM API. It outputs standardized `LlmTaskEnvelope` objects (containing context, instructions, prompt templates, and output schemas), letting agents freely choose their model and invocation strategy
- **Evidence Chain Tracking** — Every Claim traces back to its original Source → Evidence → Link relationship, supporting multiple evidence roles (`supports`, `contradicts`, `weakly_supported`). Agents achieve genuine evidence-based reasoning
- **Automatic Gap Detection** — `gap detect` proactively discovers knowledge blind spots (unsubstantiated claims, unanswered questions, orphaned nodes), driving the agent's next autonomous search round
- **Iterative Research Loop** — `research continue` orchestrates the full "search → extract → challenge → fill gaps" cycle. Agents complete deep research simply by looping
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

## Installation

```bash
bun install
```

## Quick Start

```bash
# Create a new research topic
bun run kg new-topic "Gemma4 Review"

# All subsequent commands use --dir to specify the research directory
DIR="./temp/Gemma4Review_1712130000000"

# Create a research task
bun run kg task create --title "Gemma4 Review Research" --goal "Evaluate whether official benchmarks have independent evidence support" --dir $DIR

# Add a source
echo '{"title":"Gemma 4 Technical Report","type":"webpage","attrs":{"uri":"https://example.com/gemma4-report","author":"Google"}}' | bun run kg node upsert --json-in - --dir $DIR

# List all nodes
bun run kg node list --dir $DIR
```

## Command Reference

### Basic Graph Operations

```bash
# Nodes
bun run kg node get <id> --dir <dir>
bun run kg node list [--kind Entity] [--status open] --dir <dir>
bun run kg node upsert --json-in data.json --dir <dir>
bun run kg node delete <id> --dir <dir>

# Edges
bun run kg edge create --from ent_1 --type related_to --to ent_2 --dir <dir>
bun run kg edge get <id> --dir <dir>
bun run kg edge list [--from ent_1] [--type related_to] --dir <dir>
bun run kg edge delete <id> --dir <dir>
```

### Evidence Management

```bash
# Add a source
echo '{"title":"Paper Title","type":"webpage"}' | bun run kg node upsert --json-in - --dir <dir>

# Get a source
bun run kg source get <id> --dir <dir>

# Add evidence
echo '{"sourceId":"src_xxx","text":"Original quote","kind":"Evidence"}' | bun run kg node upsert --json-in - --dir <dir>

# Link evidence to a Claim
bun run kg evidence link --evidence ev_1 --target clm_1 --role supports --dir <dir>

# List all evidence for a target
bun run kg evidence list --target clm_1 --dir <dir>
```

### Claim Management

```bash
# Create a Claim
echo '{"text":"Gemma 4 31B scores 85.2% on MMLU Pro","status":"proposed","kind":"Claim"}' | bun run kg node upsert --json-in - --dir <dir>

# Update status
bun run kg claim set-status clm_1 supported --dir <dir>

# Check conflicts
bun run kg claim conflicts clm_1 --dir <dir>
```

### Question / Hypothesis

```bash
# Add a question
echo '{"text":"Are there third-party independent evaluations?","status":"open","kind":"Question"}' | bun run kg node upsert --json-in - --dir <dir>

# List open questions
bun run kg node list --kind Question --status open --dir <dir>

# Add a hypothesis
echo '{"text":"Independent evaluation scores may be lower than official","status":"proposed","kind":"Hypothesis"}' | bun run kg node upsert --json-in - --dir <dir>
```

### Graph Queries

```bash
# Neighbor traversal (BFS)
bun run kg graph neighbors ent_1 --depth 2 --dir <dir>

# Subgraph extraction
bun run kg graph subgraph --focus ent_1 --depth 2 --dir <dir>

# Statistics
bun run kg graph stats --dir <dir>

# Graph lint
bun run kg graph lint --dir <dir>
```

### Gap Detection

```bash
# Auto-detect knowledge gaps
bun run kg gap detect --dir <dir>

# List detected gaps
bun run kg gap list --dir <dir>
```

### LLM Task Orchestration

All `llm` commands do not call models directly. They output JSON-formatted `LlmTaskEnvelope` objects (containing context, instructions, recommended prompts, and output schemas) for the upstream agent to execute.

```bash
# Extract entities from a source
bun run kg llm extract-entities --source src_1 --dir <dir>

# Extract claims from a source
bun run kg llm extract-claims --source src_1 --dir <dir>

# Generate new research questions
bun run kg llm generate-questions --dir <dir>

# Generate next-round search queries
bun run kg llm next-search-queries --dir <dir>

# Assess evidence quality
bun run kg llm assess-evidence --claim clm_1 --dir <dir>

# Entity/Claim deduplication
bun run kg llm normalize-entities --dir <dir>
bun run kg llm normalize-claims --dir <dir>
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
    "existingClaims": [...]
  },
  "instructions": "Extract candidate factual claims...",
  "recommendedPrompt": "You are given a source...",
  "outputSchema": { "type": "object", "properties": { "claims": { "type": "array" } } },
  "executionHint": {
    "suggestedCommand": "kg node upsert --json-in claims.json"
  }
}
```

## Node Types

| Type | Description | Key Fields |
|------|-------------|------------|
| `Entity` | Objective objects (person/org/concept/...) | type, title |
| `Claim` | Verifiable assertion | text, status, confidence |
| `Source` | Original source material | title, attrs.uri |
| `Evidence` | Evidence excerpt | text, attrs.sourceId |
| `Observation` | Candidate fact | text, status |
| `Question` | Question to answer | text, status, attrs.priority |
| `Hypothesis` | Hypothesis to verify | text, status |
| `Gap` | Knowledge gap | text, attrs.gapType |
| `Task` | Research task | title, goal, status |
| `Value` | Numeric node | text |

## Claim Status Flow

```
proposed → supported → deprecated
         → weakly_supported → contested → contradicted
                                    → superseded
```

## Storage Format

Each research directory contains a single `kg.json` file storing all nodes, edges, evidence links, and operation logs.

```
temp/{topic}_{timestamp}/
├── kg.json          # Single source of truth
├── search_results/  # Raw search results (managed by upstream Agent)
└── pages/           # Crawled page content (managed by upstream Agent)
```

## Testing

```bash
bun test              # Unit tests
bun test tests/e2e/   # E2E tests
```

## License

MIT
