import { describe, expect, it } from "bun:test";
import { createEmbedder } from "../src/core/embeddings.ts";

describe("createEmbedder", () => {
  describe("fake embeddings mode", () => {
    it("returns a fake embedder when GSB_FAKE_EMBEDDINGS is set", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = "1";

      try {
        const embedder = await createEmbedder("test-model", "/tmp/gsb-cache");
        expect(embedder.modelName).toBe("test-model-fake");
      } finally {
        if (original === undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = undefined;
        } else {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("produces deterministic embeddings for the same input", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = "1";

      try {
        const embedder = await createEmbedder("test-model", "/tmp/gsb-cache");
        const [first] = await embedder.embedBatch(["fix auth token race condition"]);
        const [second] = await embedder.embedBatch(["fix auth token race condition"]);

        expect(first).toEqual(second);
      } finally {
        if (original === undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = undefined;
        } else {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("produces different embeddings for different inputs", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = "1";

      try {
        const embedder = await createEmbedder("test-model", "/tmp/gsb-cache");
        const [a] = await embedder.embedBatch(["fix auth bug"]);
        const [b] = await embedder.embedBatch(["update readme docs"]);

        expect(a).not.toEqual(b);
      } finally {
        if (original === undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = undefined;
        } else {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("returns unit vectors (L2 norm ≈ 1)", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = "1";

      try {
        const embedder = await createEmbedder("test-model", "/tmp/gsb-cache");
        const [vector] = await embedder.embedBatch(["some commit message"]);

        const norm = Math.sqrt(vector?.reduce((sum, v) => sum + v * v, 0) ?? 0);
        expect(norm).toBeCloseTo(1, 5);
      } finally {
        if (original === undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = undefined;
        } else {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("handles empty batch input", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = "1";

      try {
        const embedder = await createEmbedder("test-model", "/tmp/gsb-cache");
        const results = await embedder.embedBatch([]);

        expect(results).toEqual([]);
      } finally {
        if (original === undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = undefined;
        } else {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("embeds multiple texts in a single batch", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = "1";

      try {
        const embedder = await createEmbedder("test-model", "/tmp/gsb-cache");
        const results = await embedder.embedBatch(["text one", "text two", "text three"]);

        expect(results).toHaveLength(3);
        for (const vector of results) {
          expect(vector.length).toBe(32);
        }
      } finally {
        if (original === undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = undefined;
        } else {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });
  });

  describe("model loading errors", () => {
    it("wraps pipeline errors with a helpful message", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = undefined;

      try {
        await expect(
          createEmbedder("nonexistent/model-that-does-not-exist", "/tmp/gsb-test-cache"),
        ).rejects.toThrow(/Failed to load embedding model/);
      } finally {
        if (original !== undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("includes the model name in the error message", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = undefined;

      try {
        await expect(
          createEmbedder("nonexistent/model-that-does-not-exist", "/tmp/gsb-test-cache"),
        ).rejects.toThrow("nonexistent/model-that-does-not-exist");
      } finally {
        if (original !== undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });

    it("includes the cache directory in the error message", async () => {
      const original = process.env.GSB_FAKE_EMBEDDINGS;
      process.env.GSB_FAKE_EMBEDDINGS = undefined;

      try {
        await expect(
          createEmbedder("nonexistent/model-that-does-not-exist", "/tmp/gsb-test-cache"),
        ).rejects.toThrow("gsb-test-cache");
      } finally {
        if (original !== undefined) {
          process.env.GSB_FAKE_EMBEDDINGS = original;
        }
      }
    });
  });
});
