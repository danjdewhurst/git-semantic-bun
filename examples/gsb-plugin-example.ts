/**
 * Example gsb plugin demonstrating multiple extension points.
 *
 * To use: copy this file to `.gsb/plugins/gsb-plugin-example.ts` in your repo,
 * or symlink it there. Then run `gsb doctor` to verify it loads.
 *
 * Extension points demonstrated:
 *   - Output formatter (CSV)
 *   - Scoring signal (focus score — prefers commits touching fewer files)
 *   - Commit filter (skip merge commits)
 *   - Lifecycle hook (preSearch query expansion)
 */
import type {
	CommitFilter,
	GsbPlugin,
	HookData,
	OutputFormatter,
	PluginHook,
	ScoringSignal,
} from "git-semantic-bun/plugin";

// ---------------------------------------------------------------------------
// Output formatter: CSV
// ---------------------------------------------------------------------------
// Selectable via `gsb search "query" --format csv`

const csvFormatter: OutputFormatter = {
	name: "csv",
	render(payload) {
		const header = "rank,score,hash,author,date,message";
		const rows = payload.results.map(
			(r) =>
				[
					r.rank,
					r.score.toFixed(3),
					r.hash,
					csvEscape(r.author),
					r.date,
					csvEscape(r.message),
				].join(","),
		);
		return [header, ...rows].join("\n");
	},
};

function csvEscape(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Scoring signal: focus score
// ---------------------------------------------------------------------------
// Commits touching fewer files score higher — rewards focused changes.
// Weight is low (0.05) so it nudges rankings without dominating.

const focusScore: ScoringSignal = {
	name: "focus",
	defaultWeight: 0.05,
	score(commit, _queryText) {
		// 1 file → 0.5, 2 files → 0.33, 10 files → 0.09
		return 1 / (1 + commit.files.length);
	},
};

// ---------------------------------------------------------------------------
// Commit filter: skip merge commits
// ---------------------------------------------------------------------------
// Removes merge commits from the candidate set before scoring.

const skipMerges: CommitFilter = {
	name: "skip-merges",
	apply(commits) {
		return commits.filter((c) => !c.message.startsWith("Merge "));
	},
};

// ---------------------------------------------------------------------------
// Hook: preSearch query expansion
// ---------------------------------------------------------------------------
// Appends "(code change)" to every query to bias towards code-related results.
// Uses softFail so a bug here won't break the search command.

const queryExpander: PluginHook = {
	point: "preSearch",
	softFail: true,
	execute(data: HookData) {
		if (data.point !== "preSearch") return data;
		return { ...data, query: `${data.query} (code change)` };
	},
};

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin: GsbPlugin = {
	meta: {
		name: "gsb-plugin-example",
		version: "1.0.0",
		description: "Example plugin demonstrating formatters, scoring, filters, and hooks",
		gsbVersion: ">=0.5.0",
	},

	activate(context) {
		context.logger.info("Example plugin activated");
	},

	outputFormatters: [csvFormatter],
	scoringSignals: [focusScore],
	commitFilters: [skipMerges],
	hooks: [queryExpander],
};

export default plugin;
