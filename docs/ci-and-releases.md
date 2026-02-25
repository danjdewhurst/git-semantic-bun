# CI & Releases

## Continuous integration

CI runs on every push to `main` and on pull requests via `.github/workflows/ci.yml`.

### Test job

Four sequential steps:

1. **Install** — `bun install`
2. **Lint** — `bun run lint` (Biome)
3. **Typecheck** — `bun run typecheck` (`tsc --noEmit`)
4. **Test** — `bun test` (all test files)

### Performance job

A separate job runs performance regression checks:

1. **Setup** — installs Bun and dependencies
2. **Run perf suites** — `bun run perf:ci` executes `scripts/perf-ci.ts`
3. **Upload artifacts** — the perf snapshot and baseline are uploaded as GitHub Actions artifacts

The perf suite runs against 5,000 synthetic commits with fake embeddings and measures three scenarios:

| Suite | Iterations | What it measures |
|---|---|---|
| cold | 9 | Full search with no warm cache (includes BM25 cache build) |
| warm | 30 | Repeated search with warm caches |
| indexLoad | 20 | Index deserialisation from disc |

## Performance guardrails

The perf CI compares measured timings against the baseline in `.github/perf-baseline.json`. Each metric has a regression threshold — the maximum allowed increase above baseline, expressed as a percentage. For example, a 250% threshold means the measured value can be at most `baseline × 3.5` (baseline + 250% of baseline).

| Metric | Max regression |
|---|---|
| cold p50 | 250% above baseline |
| cold p95 | 250% above baseline |
| warm p50 | 300% above baseline |
| warm p95 | 300% above baseline |
| indexLoad p50 | 250% above baseline |

If any metric exceeds its threshold, the CI job fails.

### Updating the baseline

To regenerate the baseline locally (e.g. after an intentional performance change):

```bash
bun run perf:baseline
```

This writes to `.github/perf-baseline.json`. Commit the updated baseline.

## Releases

Releases are triggered by pushing a git tag matching `v*.*.*`:

```bash
git tag v0.4.0
git push origin v0.4.0
```

The `.github/workflows/release.yml` workflow runs three jobs:

### 1. Checks

Validates the tagged commit passes typecheck and tests.

### 2. Build

Builds self-contained binaries for five targets using `bun build --compile`:

| Target | Artifact name |
|---|---|
| `bun-linux-x64` | `gsb-linux-x64` |
| `bun-linux-arm64` | `gsb-linux-arm64` |
| `bun-darwin-x64` | `gsb-macos-x64` |
| `bun-darwin-arm64` | `gsb-macos-arm64` |
| `bun-windows-x64` | `gsb-windows-x64.exe` |

Each binary is a single file with no runtime dependencies — Bun bundles the runtime, TypeScript source, and `node_modules` into one executable.

### 3. Publish

Creates a GitHub Release with auto-generated release notes and attaches all five binaries.

## Local development

### Common commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type-check
bun run typecheck

# Lint
bun run lint

# Build (output to dist/)
bun run build

# Run perf CI locally
bun run perf:ci

# Update perf baseline
bun run perf:baseline
```

### Scripts

| Script | File | Description |
|---|---|---|
| `perf:ci` | `scripts/perf-ci.ts` | Performance regression runner |
| `perf:baseline` | `scripts/perf-ci.ts` | Regenerate perf baseline |
| `toc` | `scripts/toc.sh` | Generate table of contents |
