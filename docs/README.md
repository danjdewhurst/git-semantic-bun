# Docs

├──&nbsp;plans/  
│&nbsp;&nbsp;&nbsp;├──&nbsp;[plugin-system.md](plans/plugin-system.md)  
│&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;> The project is a ~2,500-line CLI with clean separation between commands () and core logic (). It already has natural...  
│&nbsp;&nbsp;&nbsp;├──&nbsp;[v0.3.0.md](plans/v0.3.0.md)  
│&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;> Status: Delivered in .  
│&nbsp;&nbsp;&nbsp;└──&nbsp;[v0.4-performance.md](plans/v0.4-performance.md)  
│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;> Goal: improve end-to-end speed (cold start, warm query latency, large-repo scalability) without sacrificing result...  
├──&nbsp;[architecture.md](architecture.md)  
│&nbsp;&nbsp;&nbsp;> src/ ├── cli.ts # Entry point — Commander program definition ├── index.ts # Public re-exports ├──...  
├──&nbsp;[ci-and-releases.md](ci-and-releases.md)  
│&nbsp;&nbsp;&nbsp;> CI runs on every push to and on pull requests via .  
├──&nbsp;[cli-reference.md](cli-reference.md)  
│&nbsp;&nbsp;&nbsp;> All commands are invoked as .  
├──&nbsp;[compact-index.md](compact-index.md)  
│&nbsp;&nbsp;&nbsp;> { "version": 2, "modelName": "Xenova/all-MiniLM-L6-v2", "createdAt": "2026-02-25T00:00:00.000Z", "lastUpdatedAt":...  
├──&nbsp;[getting-started.md](getting-started.md)  
│&nbsp;&nbsp;&nbsp;> git clone https://github.com/danjdewhurst/git-semantic-bun.git cd git-semantic-bun bun install bun link  
├──&nbsp;[plugins.md](plugins.md)  
│&nbsp;&nbsp;&nbsp;> gsb supports an extensible plugin system. Plugins can add custom embedders, search strategies, scoring signals, output...  
├──&nbsp;[README.md](README.md)  
│&nbsp;&nbsp;&nbsp;> ├──&nbsp;plans/ │&nbsp;&nbsp;&nbsp;├──&nbsp;plugin-system.md │&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;>...  
├──&nbsp;[search-ranking.md](search-ranking.md)  
│&nbsp;&nbsp;&nbsp;> The query and each commit's embedding text are encoded into vectors using the same Transformers.js model. Similarity is...  
├──&nbsp;[serve-daemon.md](serve-daemon.md)  
│&nbsp;&nbsp;&nbsp;> gsb serve [options]  
└──&nbsp;[testing.md](testing.md)  
&nbsp;&nbsp;&nbsp;&nbsp;> bun test  
