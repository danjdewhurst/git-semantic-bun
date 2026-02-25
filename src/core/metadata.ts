import { readFileSync, writeFileSync } from "node:fs";
import type { InitMetadata } from "./types.ts";

export function saveMetadata(metadataPath: string, modelName: string): InitMetadata {
  const metadata: InitMetadata = {
    modelName,
    initializedAt: new Date().toISOString(),
  };

  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

export function loadMetadata(metadataPath: string): InitMetadata {
  const parsed: unknown = JSON.parse(readFileSync(metadataPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid metadata file");
  }

  const value = parsed as Record<string, unknown>;
  if (typeof value.modelName !== "string" || typeof value.initializedAt !== "string") {
    throw new Error("Invalid metadata fields");
  }

  return {
    modelName: value.modelName,
    initializedAt: value.initializedAt,
  };
}
