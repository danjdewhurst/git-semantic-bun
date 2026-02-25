#!/usr/bin/env bun
import { Command, InvalidArgumentError } from "commander";
import { runIndex } from "./commands/index.ts";
import { runInit } from "./commands/init.ts";
import { runSearch } from "./commands/search.ts";
import { runStats } from "./commands/stats.ts";
import { runUpdate } from "./commands/update.ts";
import { DEFAULT_BATCH_SIZE, DEFAULT_LIMIT, DEFAULT_MODEL } from "./core/constants.ts";
import { parseDateOption, parseLimitOption } from "./core/parsing.ts";

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
  .action(async (options: { full: boolean; model?: string; batchSize: string }) => {
    await runIndex({
      full: options.full,
      model: options.model,
      batchSize: limitParser(options.batchSize)
    });
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
  .action(
    async (
      query: string,
      options: { author?: string; after?: Date; before?: Date; file?: string; limit: number }
    ) => {
      await runSearch(query, options);
    }
  );

program
  .command("update")
  .description("Incrementally index new commits since the latest indexed commit")
  .option("--full", "Include full patch text in newly indexed commits")
  .option("-b, --batch-size <size>", "Embedding batch size", String(DEFAULT_BATCH_SIZE))
  .action(async (options: { full?: boolean; batchSize: string }) => {
    await runUpdate({ full: options.full, batchSize: limitParser(options.batchSize) });
  });

program
  .command("stats")
  .description("Show semantic index stats")
  .action(async () => {
    await runStats();
  });

program.showHelpAfterError();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
