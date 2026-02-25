# ROADMAP

Current priorities for `git-semantic-bun`.

## Status

- ✅ v0.3.0 delivered
- 🚧 v0.4 in progress

## v0.3.0 delivered (summary)

- Retrieval quality
  - weighted embedding payloads
  - hybrid ranking (`semantic + BM25-style lexical + recency`)
  - explainable scoring
- Performance/storage baseline
  - pre-normalised vectors
  - heap top-k ranking
  - benchmark command + history (`--save`, `--history`)
  - compact sidecar index with `f32` and optional `f16`
- Robustness
  - rewritten-history detection + recovery in `update`
  - checksum-backed validation
  - `doctor` and `doctor --fix`
- UX/output
  - snippets, `--snippet-lines`, `--min-score`
  - include/exclude patterns + `.gsbignore`
- Quality gates
  - e2e, golden ranking, and performance smoke tests
  - CI runs lint + typecheck + test

## v0.4 roadmap

### Now — performance (primary)

- [x] Add daemon mode (`gsb serve`) for warm query reuse
- [ ] Cache BM25 lexical stats per index checksum
- [ ] Optimise scoring hot path to reduce allocation/GC pressure
- [ ] Prototype memory-mapped/lazy vector loading
- [ ] Evaluate optional ANN backend for very large repositories
- [ ] Add perf CI baseline + regression guardrails

Details and targets: [`docs/plans/v0.4-performance.md`](./docs/plans/v0.4-performance.md)

### Next — multi-model workflows

- [ ] Support multiple model indexes in parallel
- [ ] Allow model selection at query time (`search --model`)
- [ ] Add model-aware benchmark comparison mode

### Later — search ergonomics

- [ ] Add `--query-file` for long prompts
- [ ] Add output-mode defaults for `--min-score`
- [ ] Improve no-result guidance with suggested filters/thresholds

## References

- Historical plan (v0.3.0): [`docs/plans/v0.3.0.md`](./docs/plans/v0.3.0.md)
- Compact index reference: [`docs/compact-index.md`](./docs/compact-index.md)
- Docs index: [`docs/README.md`](./docs/README.md)
