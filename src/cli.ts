#!/usr/bin/env bun
import { Command, InvalidArgumentError } from "commander";
import { runBenchmark } from "./commands/benchmark.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runIndex } from "./commands/index.ts";
import { runInit } from "./commands/init.ts";
import { runSearch } from "./commands/search.ts";
import { runStats } from "./commands/stats.ts";
import { runUpdate } from "./commands/update.ts";
import { DEFAULT_BATCH_SIZE, DEFAULT_LIMIT, DEFAULT_MODEL } from "./core/constants.ts";
import { parseDateOption, parseLimitOption, parseSearchOutputFormat, parseWeightOption } from "./core/parsing.ts";

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
  .version("0.1.0");

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
  .action(async (options: { full: boolean; model?: string; batchSize: string; include: string[]; exclude: string[] }) => {
    const indexOptions: { full: boolean; batchSize: number; model?: string; include: string[]; exclude: string[] } = {
      full: options.full,
      batchSize: limitParser(options.batchSize),
      include: options.include,
      exclude: options.exclude,
    };

    if (options.model !== undefined) {
      indexOptions.model = options.model;
    }

    await runIndex(indexOptions);
  });

program
  .command("search")
  .description("Search indexed commits with semantic similarity")
  .argument("<query>", "Natural language query")
  .option("--author <author>", "Filter by author substring")
  .option("--after <date>", "Filter commits after this date", toDateParser("--after"))
  .option("--before <date>", "Filter commits before this date", toDateParser("--before"))
  .option("--file <path>", "Filter commits touching file path substring")
  .option("-n, --limit <count>", "Max results", limitParser, DEFAULT_LIMIT)
  .option("--format <format>", "Output format: text, markdown, json", parseSearchOutputFormat, "text")
  .option("--explain", "Show score component breakdown", false)
  .option("--semantic-weight <weight>", "Semantic score weight (0..1)", toWeightParser("--semantic-weight"), 0.75)
  .option("--lexical-weight <weight>", "Lexical score weight (0..1)", toWeightParser("--lexical-weight"), 0.2)
  .option("--recency-weight <weight>", "Recency score weight (0..1)", toWeightParser("--recency-weight"), 0.05)
  .option("--no-recency-boost", "Disable recency scoring boost")
  .option("--snippets", "Include compact diff snippets in search output", false)
  .option("--snippet-lines <count>", "Diff snippet body lines to include", limitParser, 12)
  .option("--min-score <score>", "Minimum final score threshold", Number.parseFloat)
  .action(
    async (
      query: string,
      options: {
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
      }
    ) => {
      await runSearch(query, options);
    }
  );

program
  .command("update")
  .description("Incrementally index new commits since the latest indexed commit")
  .option("--full", "Include full patch text in newly indexed commits")
  .option("-b, --batch-size <size>", "Embedding batch size", String(DEFAULT_BATCH_SIZE))
  .option("--include <glob>", "Only include matching file paths (repeatable)", collectPattern, [])
  .option("--exclude <glob>", "Exclude matching file paths (repeatable)", collectPattern, [])
  .action(async (options: { full?: boolean; batchSize: string; include: string[]; exclude: string[] }) => {
    const updateOptions: { batchSize: number; full?: boolean; include: string[]; exclude: string[] } = {
      batchSize: limitParser(options.batchSize),
      include: options.include,
      exclude: options.exclude,
    };

    if (options.full !== undefined) {
      updateOptions.full = options.full;
    }

    await runUpdate(updateOptions);
  });

program
  .command("stats")
  .description("Show semantic index stats")
  .action(async () => {
    await runStats();
  });

program
  .command("doctor")
  .description("Check semantic index health, metadata, and cache readiness")
  .action(async () => {
    await runDoctor();
  });

program
  .command("benchmark")
  .description("Benchmark baseline full sort vs optimised heap top-k ranking")
  .argument("<query>", "Natural language query")
  .option("--author <author>", "Filter by author substring")
  .option("--after <date>", "Filter commits after this date", toDateParser("--after"))
  .option("--before <date>", "Filter commits before this date", toDateParser("--before"))
  .option("--file <path>", "Filter commits touching file path substring")
  .option("-n, --limit <count>", "Max results", limitParser, DEFAULT_LIMIT)
  .option("-i, --iterations <count>", "Benchmark iterations", limitParser, 20)
  .option("--semantic-weight <weight>", "Semantic score weight (0..1)", toWeightParser("--semantic-weight"), 0.75)
  .option("--lexical-weight <weight>", "Lexical score weight (0..1)", toWeightParser("--lexical-weight"), 0.2)
  .option("--recency-weight <weight>", "Recency score weight (0..1)", toWeightParser("--recency-weight"), 0.05)
  .option("--no-recency-boost", "Disable recency scoring boost")
  .action(
    async (
      query: string,
      options: {
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
      },
    ) => {
      await runBenchmark(query, options);
    },
  );

program.showHelpAfterError();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
