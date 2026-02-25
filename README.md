# git-semantic-bun

[![CI](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.3%2B-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Semantic search for git history, built with Bun.

Stop guessing commit message keywords. Describe what changed in plain English and get the most relevant commits back.

## Table of contents

- [Why this exists](#why-this-exists)
- [What you get](#what-you-get)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Examples](#examples)
- [Embedding model options](#embedding-model-options)
- [Practical notes](#practical-notes)
- [Why this is useful for AI agents](#why-this-is-useful-for-ai-agents)
- [Agent config snippet (for `AGENTS.md`, `CLAUDE.md`, etc.)](#agent-config-snippet-for-agentsmd-claudemd-etc)
- [Before vs after](#before-vs-after)
- [Development](#development)
- [Roadmap](#roadmap)
- [Credits](#credits)
- [Contributing](#contributing)
- [Licence](#licence)

## Why this exists

Traditional git search is lexical:

- `git log --grep "race"` misses commits described as “concurrency”
- `git log -S "mutex"` only works when exact code tokens were used

`git-semantic-bun` indexes commits as embeddings, so queries match **meaning**, not just exact words.

## What you get

- Local-first CLI (`gsb`) with no paid API dependency
- Semantic commit indexing + cosine similarity search
- Incremental updates (`gsb update`) to avoid full reindex every time
- Practical filters (`--author`, `--after`, `--before`, `--file`, `--limit`)
- Transparent index storage at `.git/semantic-index/index.json`

## Install

### Option A: Download prebuilt binaries (recommended)

Grab the binary for your platform from the GitHub Releases page:

- <https://github.com/danjdewhurst/git-semantic-bun/releases>

Current assets:

- `gsb-linux-x64`
- `gsb-linux-arm64`
- `gsb-macos-x64`
- `gsb-macos-arm64`
- `gsb-windows-x64.exe`

#### Linux/macOS quick install

```bash
# Example: Linux x64
curl -L -o gsb https://github.com/danjdewhurst/git-semantic-bun/releases/latest/download/gsb-linux-x64
chmod +x gsb
sudo mv gsb /usr/local/bin/gsb

# verify
gsb --help
```

#### Windows

- Download `gsb-windows-x64.exe` from Releases
- Rename to `gsb.exe` (optional)
- Add its folder to your PATH
- Run:

```powershell
gsb.exe --help
```

### Option B: Local development with Bun

#### Prerequisites

- Bun 1.3+
- Git repository to index

Install deps:

```bash
bun install
```

Run directly:

```bash
bun run src/cli.ts --help
```

Optional global command:

```bash
bun link
# then:
gsb --help
```

## Quick start

```bash
# 1) Initialise metadata/cache
gsb init

# 2) Build semantic index from history
gsb index

# 3) Search by meaning
gsb search "fix race condition in auth token refresh"
```

## Commands

### `gsb init`

Initialises semantic index/cache directories and saves model metadata.

### `gsb index [--full] [--batch-size <n>] [--model <name>] [--include <glob>] [--exclude <glob>]`

Indexes commit history into embeddings.

- Default mode indexes commit metadata (hash/author/date/message/files)
- `--full` also includes commit patch text for richer context (slower/larger)
- `--include <glob>` narrows indexed files (repeatable)
- `--exclude <glob>` removes indexed files (repeatable)
- `.gsbignore` patterns are applied automatically when present

### `gsb search <query> [filters]`

Runs semantic search over indexed commits.

Filters and output controls:

- `--author <name>`
- `--after <date>`
- `--before <date>`
- `--file <path-substring>`
- `-n, --limit <count>`
- `--format <text|markdown|json>`
- `--snippets` (include diff snippets)
- `--snippet-lines <count>` (default 12)
- `--min-score <score>`

Output formats:

- `text` (default): human-friendly terminal output
- `markdown`: clean markdown blocks, useful for notes and sharing
- `json`: structured output for piping into scripts and LLM workflows

### `gsb update [--full] [--batch-size <n>] [--include <glob>] [--exclude <glob>]`

Indexes only commits newer than the latest indexed commit.

Supports the same `--include`, `--exclude`, and `.gsbignore` filtering behaviour as `gsb index`.

### `gsb stats`

Shows index count, model, size, and timestamps.

### `gsb doctor`

Validates index files, compact sidecars, model metadata, and cache directory readiness.

- `--fix` performs safe non-destructive repairs (create missing dirs, rebuild sidecars, recreate metadata when possible).

### `gsb benchmark [query] [filters]`

Benchmarks ranking performance (baseline full-sort vs optimised heap top-k) using the current index.

- `--save` appends results to `.git/semantic-index/benchmarks.jsonl`
- `--history` shows recent saved benchmark runs (query optional in this mode)

## Examples

```bash
gsb search "refactor payment retry logic"
gsb search "fix flaky parser" --after 2025-01-01 --author dan
gsb search "optimise caching" --file src/core -n 5
gsb search "token refresh race" --format markdown
gsb search "error handling in webhook retries" --format json
```

## Why this is useful for AI agents

`git-semantic-bun` is a strong retrieval layer for coding agents (Codex/Claude/etc.) working in real repos.

Practical agent workflows:

- **Fix discovery:** query prior bugfix patterns before proposing a new patch
  - e.g. `gsb search "race condition in token refresh" --format json`
- **Architecture recall:** retrieve historical commits that explain why a subsystem was changed
- **Safer refactors:** find commits touching similar files/behaviours to avoid repeating old mistakes
- **Context packing for LLM prompts:** emit `--format markdown` or `--format json` and feed top hits into the prompt context
- **Automated triage:** pipe JSON output into scripts to rank likely relevant commits for each issue/PR

Agent-friendly output modes:

- `--format text` for humans in terminal
- `--format markdown` for reports/PR notes
- `--format json` for machine-readable pipelines and prompt assembly

Example (LLM context prep):

```bash
gsb search "retry backoff bug in webhook delivery" --format json -n 8 > semantic-context.json
```

## Agent config snippet (for `AGENTS.md`, `CLAUDE.md`, etc.)

Copy/paste this into your user- or project-level agent instruction file so your coding agent consistently uses semantic git retrieval:

```markdown
## Semantic Git Recall (gsb)

When working in this repository, use `gsb` to retrieve relevant historical commits before implementing changes.

### When to use

- Bug fixes
- Refactors
- Changes in auth, retries, caching, concurrency, migrations, or any risky subsystem
- Any task where prior implementation context could reduce regressions

### Required workflow

1. Run a semantic search first:
   - `gsb search "<task summary>" --format markdown -n 5`
2. If preparing context for another LLM/tool, use JSON:
   - `gsb search "<task summary>" --format json -n 8`
3. Use top matches to guide:
   - file selection
   - implementation approach
   - regression checks
4. Reference relevant commit hashes in your final summary/PR notes.

If `gsb` is unavailable or index is missing, report that clearly and continue with best-effort fallback (`git log`/`git blame`).
```

Tip: run `gsb update` regularly so agent retrieval includes recent commits.

## Before vs after

Before:

- Manual `git log` digging
- Lots of false positives
- Easy to miss relevant commits with different wording

After:

- Natural-language query
- Relevance-scored results
- Faster recovery of prior fixes and design decisions

## Development

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

## Embedding model options

Default model:

- `Xenova/all-MiniLM-L6-v2` (fast, good general semantic quality)

You can change model with:

- `gsb init --model <model-id>` (sets default in metadata)
- `gsb index --model <model-id>` (one-off override)

Other good options:

- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (better for multilingual commit/query text)
- `Xenova/all-mpnet-base-v2` (stronger semantic quality, heavier/slower)

Rule of thumb:

- MiniLM for speed
- MPNet for quality
- multilingual MiniLM for mixed-language repositories

## Practical notes

- Everything runs locally.
- First run downloads the embedding model once, then reuses local cache under `.git/semantic-index/cache/`.
- JSON index is transparent and easy to inspect; large repos will produce larger index files.

## Roadmap

Roadmap planning now lives in a dedicated file: [ROADMAP.md](./ROADMAP.md).

It includes milestones, success criteria, and progress tracking.

## Credits

Inspired by the original Rust project [`yanxue06/git-semantic-search`](https://github.com/yanxue06/git-semantic-search).

## Contributing

PRs are welcome. Please use conventional commits (`feat:`, `fix:`, `docs:`, etc.) and include tests for behavioural changes.

## Licence

MIT — see [LICENSE](./LICENSE).
