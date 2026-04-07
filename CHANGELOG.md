# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-03

### Added

- Initial release of Knowledge Graph CLI (`kg`)
- Core graph operations: node CRUD, edge CRUD, BFS traversal, subgraph extraction
- Evidence management: source tracking, evidence linking, evidence chain queries
- Claim lifecycle: status flow (proposed → supported → contradicted → ...), conflict detection
- Question and hypothesis management
- Automatic knowledge gap detection
- LLM task orchestration with `LlmTaskEnvelope` standard output
  - Entity extraction, claim extraction, observation extraction
  - Relation extraction, predicate normalization
  - Question generation, hypothesis generation
  - Next search query generation, evidence assessment
  - Report generation
- Iterative research loop (`research continue`)
- Task checklist service for externalized process memory
- HTML report export service
- Single-file JSON storage (`kg.json`)
- E2E test suite
