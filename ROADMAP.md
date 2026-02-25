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

### 1) Performance programme (primary)

- [ ] Add daemon mode (`gsb serve`) for warm query reuse
- [ ] Cache BM25 lexical stats per index checksum
- [ ] Optimise scoring hot path to reduce allocation/GC pressure
- [ ] Prototype memory-mapped/lazy vector loading
- [ ] Evaluate optional ANN backend for very large repositories
- [ ] Add perf CI baseline + regression guardrails

Details and targets: [`docs/plan/v0.4-performance.md`](./docs/plan/v0.4-performance.md)

### 2) Multi-model workflows

- [ ] Support multiple model indexes in parallel
- [ ] Allow model selection at query time (`search --model`)
- [ ] Add model-aware benchmark comparison mode

### 3) Search ergonomics

- [ ] Add `--query-file` for long prompts
- [ ] Add output-mode defaults for `--min-score`
- [ ] Improve no-result guidance with suggested filters/thresholds

## Docs

- Historical implementation plan: [`docs/plan/v0.3.0.md`](./docs/plan/v0.3.0.md)
- Compact index reference: [`docs/compact-index.md`](./docs/compact-index.md)
- Documentation map: [`docs/README.md`](./docs/README.md)
