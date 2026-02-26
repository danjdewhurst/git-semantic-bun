# Docs 📚

- 📁 **plans/**
  - 📄 [plugin-system.md](plans/plugin-system.md)
    > 💬 The project is a ~2,500-line CLI with clean separation between commands (src/commands/) and core logic (src/core/). It...
  - 📄 [v0.3.0.md](plans/v0.3.0.md)
    > 💬 Status: Delivered in v0.3.0.
  - 📄 [v0.4-performance.md](plans/v0.4-performance.md)
    > 💬 Goal: improve end-to-end speed (cold start, warm query latency, large-repo scalability) without sacrificing result...
- 📁 **reviews/**
  - 📄 [minimax-m2-5.md](reviews/minimax-m2-5.md)
    > 💬 The LRU limit is good, but if you run gsb serve for days, it caches only by checksum — which may be the same index....
- 📄 [architecture.md](architecture.md)
  > 💬 git-semantic-bun is structured as a CLI application with a clean separation between command handlers (src/commands/)...
- 📄 [ci-and-releases.md](ci-and-releases.md)
  > 💬 CI runs on every push to main and on pull requests via .github/workflows/ci.yml.
- 📄 [cli-reference.md](cli-reference.md)
  > 💬 All commands are invoked as gsb <command> [options].
- 📄 [compact-index.md](compact-index.md)
  > 💬 git-semantic-bun stores index data under .git/semantic-index/.
- 📄 [getting-started.md](getting-started.md)
  > 💬 Download the binary for your platform from the GitHub Releases page. Available targets:
- 📄 [plugins.md](plugins.md)
  > 💬 gsb supports an extensible plugin system. Plugins can add custom embedders, search strategies, scoring signals, output...
- 📄 [search-ranking.md](search-ranking.md)
  > 💬 gsb search uses a hybrid ranking system that combines three scoring signals into a single weighted score per commit.
- 📄 [serve-daemon.md](serve-daemon.md)
  > 💬 gsb serve runs a warm, in-process search daemon that keeps the embedding model and index loaded in memory. This...
- 📄 [testing.md](testing.md)
  > 💬 All tests use Bun's built-in test runner. No additional test framework is needed.
