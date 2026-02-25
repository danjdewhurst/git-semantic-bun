# Repository Contents

├── docs/
│   ├── plans/
│   │   ├── [plugin-system.md](docs/plans/plugin-system.md)
│   │   │   > The project is a ~2,500-line CLI with clean separation between commands () and core logic (). It already has natural...
│   │   ├── [v0.3.0.md](docs/plans/v0.3.0.md)
│   │   │   > Status: Delivered in .
│   │   └── [v0.4-performance.md](docs/plans/v0.4-performance.md)
│   │       > Goal: improve end-to-end speed (cold start, warm query latency, large-repo scalability) without sacrificing result...
│   ├── [architecture.md](docs/architecture.md)
│   │   > src/ ├── cli.ts # Entry point — Commander program definition ├── index.ts # Public re-exports ├──...
│   ├── [ci-and-releases.md](docs/ci-and-releases.md)
│   │   > CI runs on every push to and on pull requests via .
│   ├── [cli-reference.md](docs/cli-reference.md)
│   │   > All commands are invoked as .
│   ├── [compact-index.md](docs/compact-index.md)
│   │   > { "version": 2, "modelName": "Xenova/all-MiniLM-L6-v2", "createdAt": "2026-02-25T00:00:00.000Z", "lastUpdatedAt":...
│   ├── [getting-started.md](docs/getting-started.md)
│   │   > git clone https://github.com/danjdewhurst/git-semantic-bun.git cd git-semantic-bun bun install bun link
│   ├── [plugins.md](docs/plugins.md)
│   │   > gsb supports an extensible plugin system. Plugins can add custom embedders, search strategies, scoring signals, output...
│   ├── [README.md](docs/README.md)
│   ├── [search-ranking.md](docs/search-ranking.md)
│   │   > The query and each commit's embedding text are encoded into vectors using the same Transformers.js model. Similarity is...
│   ├── [serve-daemon.md](docs/serve-daemon.md)
│   │   > gsb serve [options]
│   └── [testing.md](docs/testing.md)
│       > bun test
├── [README.md](README.md)
│   > <div align="center">
├── [ROADMAP.md](ROADMAP.md)
│   > Current priorities for .
└── [TOC.md](TOC.md)
    > ├── docs/ │ ├── plans/ │ │ ├── v0.3.0.md │ │ │ > Status: Delivered in . │ │ └──...
