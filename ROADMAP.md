# ROADMAP

Current status and next priorities for `git-semantic-bun`.

## Completed (v0.3.0)

- Retrieval quality improvements
  - weighted embedding payloads
  - hybrid ranking (`semantic + BM25-style lexical + recency`)
  - explainable score breakdown
- Performance and storage
  - pre-normalised vectors
  - heap-based top-k ranking
  - benchmark command + history (`--save`, `--history`)
  - compact sidecar index with `f32` and optional `f16`
- Robustness
  - rewritten-history detection and recovery in `update`
  - checksum and stricter index validation
  - `doctor` and `doctor --fix`
- UX and output
  - snippets, `--snippet-lines`, `--min-score`
  - include/exclude patterns + `.gsbignore`
- Quality gates
  - e2e + golden ranking + performance smoke tests
  - CI now runs lint + typecheck + test

## Active roadmap (v0.4)

### 1) Multi-model workflows

- [ ] Support multiple model indexes in parallel
- [ ] Allow model selection at query time (`search --model`)
- [ ] Add model-aware benchmark comparison mode

### 2) Search ergonomics

- [ ] Add `--query-file` for long prompts
- [ ] Add output-mode defaults for `--min-score`
- [ ] Improve no-result guidance with suggested filters/thresholds

### 3) Scale path

- [ ] Evaluate ANN backend for large repos (optional mode)
- [ ] Prototype memory-mapped vector loads
- [ ] Add large-repo benchmark fixture/profile

## Docs

- Historical implementation plan: [`docs/v0.3.0-plan.md`](./docs/v0.3.0-plan.md)
- Compact index reference: [`docs/compact-index.md`](./docs/compact-index.md)
- Documentation map: [`docs/README.md`](./docs/README.md)
