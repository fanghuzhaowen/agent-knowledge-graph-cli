# Contributing to Agent Knowledge Graph CLI

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/misakaikato/agent-knowledge-graph-cli.git
cd agent-knowledge-graph-cli

# Install dependencies
bun install

# Run tests
bun test
bun test tests/e2e/
```

## Project Structure

```
src/
├── cli/               # CLI commands and entry point
│   ├── commands/      # Individual command modules
│   ├── context.ts     # Service initialization context
│   └── index.ts       # CLI entry point (commander)
├── core/
│   ├── models/        # Type definitions
│   ├── schemas/       # Zod validation schemas
│   └── services/      # Business logic services
├── prompts/           # LLM prompt templates
├── storage/           # Graph store (JSON persistence)
└── utils/             # Utility functions
tests/
├── unit/              # Unit tests
└── e2e/               # End-to-end CLI tests
```

## Code Style

- **Language**: TypeScript (strict mode)
- **Indentation**: Tabs
- **Formatting**: Prettier
- **Linting**: ESLint
- **Imports**: Use absolute paths over relative paths

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New features
- `fix:` — Bug fixes
- `docs:` — Documentation changes
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests
- `chore:` — Build process or tooling changes

## Pull Request Process

1. Ensure all tests pass (`bun test`)
2. Update tests for any new functionality
3. Keep PRs focused — one feature or fix per PR
4. Write a clear PR description explaining the "why" not just the "what"

## Adding New Commands

1. Create a new file in `src/cli/commands/`
2. Export a `register*Command(program: Command)` function
3. Register it in `src/cli/index.ts`
4. Add corresponding service logic in `src/core/services/`
5. Write tests in `tests/`

## Adding New LLM Task Types

1. Create a prompt template in `src/prompts/`
2. Add a `build*Task()` method in `LlmTaskService`
3. Register the subcommand in `src/cli/commands/llm.ts`
4. Add Zod output schema in `src/core/schemas/`

## Questions?

Feel free to open an [issue](https://github.com/misakaikato/agent-knowledge-graph-cli/issues) for any questions or discussions.
