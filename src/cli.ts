#!/usr/bin/env bun
import { Command, InvalidArgumentError } from "commander";
import { runBenchmark } from "./commands/benchmark.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runIndex } from "./commands/index.ts";
import { runInit } from "./commands/init.ts";
import { runSearch } from "./commands/search.ts";
import { runServe } from "./commands/serve.ts";
import { runStats } from "./commands/stats.ts";
import { runUpdate } from "./commands/update.ts";
import { DEFAULT_BATCH_SIZE, DEFAULT_LIMIT, DEFAULT_MODEL } from "./core/constants.ts";
import {
  parseDateOption,
  parseLimitOption,
  parseSearchOutputFormat,
  parseStrategyOption,
  parseVectorDtypeOption,
  parseWeightOption,
} from "./core/parsing.ts";

function toDateParser(flagName: string): (value: string) => Date {
  return (value) => {
    try {
      return parseDateOption(value, flagName);
    } catch (error) {
      throw new InvalidArgumentError((error as Error).message);
    }
  };
}

function limitParser(value: string): number {
  try {
    return parseLimitOption(value);
  } catch (error) {
    throw new InvalidArgumentError((error as Error).message);
  }
}

function toWeightParser(flagName: string): (value: string) => number {
  return (value) => {
    try {
      return parseWeightOption(value, flagName);
    } catch (error) {
      throw new InvalidArgumentError((error as Error).message);
    }
  };
}

function collectPattern(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("gsb")
  .description("Local semantic git commit search CLI with Bun + transformers.js")
  .version("0.3.0");

program
  .command("init")
  .description("Initialize semantic index/cache directories in this git repo")
  .option("-m, --model <name>", "Embedding model name", DEFAULT_MODEL)
  .action(async (options: { model: string }) => {
    await runInit(options);
  });

program
  .command("index")
  .description("Build semantic index from git commit history")
  .option("--full", "Include full commit patch in embedding text", false)
  .option("-m, --model <name>", "Embedding model name override")
  .option("-b, --batch-size <size>", "Embedding batch size", String(DEFAULT_BATCH_SIZE))
  .option("--include <glob>", "Only include matching file paths (repeatable)", collectPattern, [])
  .option("--exclude <glob>", "Exclude matching file paths (repeatable)", collectPattern, [])
  .option(
    "--vector-dtype <dtype>",
    "Compact vector dtype: f32 or f16",
    parseVectorDtypeOption,
    "f32",
  )
  .action(
    async (options: {
      full: boolean;
      model?: string;
      batchSize: string;
      include: string[];
      exclude: string[];
      vectorDtype: "f32" | "f16";
    }) => {
      const indexOptions: {
        full: boolean;
        batchSize: number;
        model?: string;
        include: string[];
        exclude: string[];
        vectorDtype: "f32" | "f16";
      } = {
        full: options.full,
        batchSize: limitParser(options.batchSize),
        include: options.include,
        exclude: options.exclude,
        vectorDtype: options.vectorDtype,
      };

      if (options.model !== undefined) {
        indexOptions.model = options.model;
      }

      await runIndex(indexOptions);
    },
  );

program
  .command("search")
  .description("Search indexed commits with semantic similarity")
  .argument("<query>", "Natural language query")
  .option("--model <name>", "Model index to query (defaults to metadata model)")
  .option("--author <author>", "Filter by author substring")
  .option("--after <date>", "Filter commits after this date", toDateParser("--after"))
  .option("--before <date>", "Filter commits before this date", toDateParser("--before"))
  .option("--file <path>", "Filter commits touching file path substring")
  .option("-n, --limit <count>", "Max results", limitParser, DEFAULT_LIMIT)
  .option(
    "--format <format>",
    "Output format: text, markdown, json",
    parseSearchOutputFormat,
    "text",
  )
  .option("--explain", "Show score component breakdown", false)
  .option(
    "--semantic-weight <weight>",
    "Semantic score weight (0..1)",
    toWeightParser("--semantic-weight"),
    0.75,
  )
  .option(
    "--lexical-weight <weight>",
    "Lexical score weight (0..1)",
    toWeightParser("--lexical-weight"),
    0.2,
  )
  .option(
    "--recency-weight <weight>",
    "Recency score weight (0..1)",
    toWeightParser("--recency-weight"),
    0.05,
  )
  .option("--no-recency-boost", "Disable recency scoring boost")
  .option("--snippets", "Include compact diff snippets in search output", false)
  .option("--snippet-lines <count>", "Diff snippet body lines to include", limitParser, 12)
  .option("--min-score <score>", "Minimum final score threshold", Number.parseFloat)
  .option("--strategy <strategy>", "Search strategy: auto, exact, ann", parseStrategyOption, "auto")
  .action(
    async (
      query: string,
      options: {
        model?: string;
        author?: string;
        after?: Date;
        before?: Date;
        file?: string;
        limit: number;
        format: "text" | "markdown" | "json";
        explain: boolean;
        semanticWeight: number;
        lexicalWeight: number;
        recencyWeight: number;
        recencyBoost: boolean;
        snippets: boolean;
        snippetLines: number;
        minScore?: number;
        strategy: "auto" | "exact" | "ann";
      },
    ) => {
      await runSearch(query, options);
    },
  );

program
  .command("serve")
  .description("Run warm in-process search daemon (query per stdin line)")
  .option("--model <name>", "Model index to serve (defaults to metadata model)")
  .option("--author <author>", "Default author filter")
  .option("--after <date>", "Default after date filter", toDateParser("--after"))
  .option("--before <date>", "Default before date filter", toDateParser("--before"))
  .option("--file <path>", "Default file filter")
  .option("-n, --limit <count>", "Max results", limitParser, DEFAULT_LIMIT)
  .option(
    "--semantic-weight <weight>",
    "Semantic score weight (0..1)",
    toWeightParser("--semantic-weight"),
    0.75,
  )
  .option(
    "--lexical-weight <weight>",
    "Lexical score weight (0..1)",
    toWeightParser("--lexical-weight"),
    0.2,
  )
  .option(
    "--recency-weight <weight>",
    "Recency score weight (0..1)",
    toWeightParser("--recency-weight"),
    0.05,
  )
  .option("--no-recency-boost", "Disable recency scoring boost")
  .option("--min-score <score>", "Minimum final score threshold", Number.parseFloat)
  .option("--jsonl", "Emit one compact JSON object per query line", false)
  .option("--strategy <strategy>", "Search strategy: auto, exact, ann", parseStrategyOption, "auto")
  .action(
    async (options: {
      model?: string;
      author?: string;
      after?: Date;
      before?: Date;
      file?: string;
      limit: number;
      semanticWeight: number;
      lexicalWeight: number;
      recencyWeight: number;
      recencyBoost: boolean;
      minScore?: number;
      jsonl: boolean;
      strategy: "auto" | "exact" | "ann";
    }) => {
      await runServe(options);
    },
  );

program
  .command("update")
  .description("Incrementally index new commits since the latest indexed commit")
  .option("--model <name>", "Model index to update (defaults to metadata model)")
  .option("--full", "Include full patch text in newly indexed commits")
  .option("-b, --batch-size <size>", "Embedding batch size", String(DEFAULT_BATCH_SIZE))
  .option("--include <glob>", "Only include matching file paths (repeatable)", collectPattern, [])
  .option("--exclude <glob>", "Exclude matching file paths (repeatable)", collectPattern, [])
  .option(
    "--vector-dtype <dtype>",
    "Compact vector dtype override: f32 or f16",
    parseVectorDtypeOption,
  )
  .action(
    async (options: {
      model?: string;
      full?: boolean;
      batchSize: string;
      include: string[];
      exclude: string[];
      vectorDtype?: "f32" | "f16";
    }) => {
      const updateOptions: {
        model?: string;
        batchSize: number;
        full?: boolean;
        include: string[];
        exclude: string[];
        vectorDtype?: "f32" | "f16";
      } = {
        batchSize: limitParser(options.batchSize),
        include: options.include,
        exclude: options.exclude,
      };

      if (options.full !== undefined) {
        updateOptions.full = options.full;
      }
      if (options.model !== undefined) {
        updateOptions.model = options.model;
      }
      if (options.vectorDtype !== undefined) {
        updateOptions.vectorDtype = options.vectorDtype;
      }

      await runUpdate(updateOptions);
    },
  );

program
  .command("stats")
  .description("Show semantic index stats")
  .option("--model <name>", "Model index to inspect (defaults to metadata model)")
  .action(async (options: { model?: string }) => {
    await runStats(options);
  });

program
  .command("doctor")
  .description("Check semantic index health, metadata, and cache readiness")
  .option("--model <name>", "Model index to check/fix (defaults to metadata model)")
  .option("--fix", "Attempt safe non-destructive repairs", false)
  .action(async (options: { model?: string; fix: boolean }) => {
    await runDoctor(options);
  });

program
  .command("benchmark")
  .description("Benchmark baseline full sort vs optimised heap top-k ranking")
  .argument("[query]", "Natural language query")
  .option("--model <name>", "Model index to benchmark (defaults to metadata model)")
  .option("--author <author>", "Filter by author substring")
  .option("--after <date>", "Filter commits after this date", toDateParser("--after"))
  .option("--before <date>", "Filter commits before this date", toDateParser("--before"))
  .option("--file <path>", "Filter commits touching file path substring")
  .option("-n, --limit <count>", "Max results", limitParser, DEFAULT_LIMIT)
  .option("-i, --iterations <count>", "Benchmark iterations", limitParser, 20)
  .option(
    "--semantic-weight <weight>",
    "Semantic score weight (0..1)",
    toWeightParser("--semantic-weight"),
    0.75,
  )
  .option(
    "--lexical-weight <weight>",
    "Lexical score weight (0..1)",
    toWeightParser("--lexical-weight"),
    0.2,
  )
  .option(
    "--recency-weight <weight>",
    "Recency score weight (0..1)",
    toWeightParser("--recency-weight"),
    0.05,
  )
  .option("--no-recency-boost", "Disable recency scoring boost")
  .option("--save", "Save benchmark result to history log", false)
  .option("--history", "Show saved benchmark history", false)
  .option("--ann", "Compare exact vs ANN search strategies", false)
  .action(
    async (
      query: string | undefined,
      options: {
        model?: string;
        author?: string;
        after?: Date;
        before?: Date;
        file?: string;
        limit: number;
        iterations: number;
        semanticWeight: number;
        lexicalWeight: number;
        recencyWeight: number;
        recencyBoost: boolean;
        save: boolean;
        history: boolean;
        ann: boolean;
      },
    ) => {
      if (!options.history && (!query || query.trim().length === 0)) {
        throw new InvalidArgumentError("Query is required unless --history is used.");
      }

      await runBenchmark(query ?? "", options);
    },
  );

program.showHelpAfterError();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
