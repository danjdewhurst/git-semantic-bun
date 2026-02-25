# Compact Index Format Design

## Goals

- Reduce on-disk footprint versus `index.json`.
- Improve load time for large repositories.
- Keep metadata human-readable where useful.
- Support safe migration from legacy JSON-only index files.

## Proposed layout

Store index under `.git/semantic-index/` as:

- `index.meta.json` — metadata + commit descriptors (no dense vectors)
- `index.vec.f32` — contiguous float32 vector matrix

### `index.meta.json` shape

```json
{
  "version": 2,
  "modelName": "Xenova/all-MiniLM-L6-v2",
  "createdAt": "2026-02-25T00:00:00.000Z",
  "lastUpdatedAt": "2026-02-25T00:10:00.000Z",
  "repositoryRoot": "/path/to/repo",
  "includePatch": false,
  "vector": {
    "file": "index.vec.f32",
    "dtype": "float32",
    "dimension": 384,
    "count": 12034,
    "normalised": true
  },
  "commits": [
    {
      "hash": "abc123",
      "author": "Dan",
      "date": "2026-02-24T11:22:33.000Z",
      "message": "fix: ...",
      "files": ["src/x.ts"],
      "vectorOffset": 0
    }
  ]
}
```

### `index.vec.f32`

- Binary little-endian float32 values.
- Row-major layout, one embedding row per commit.
- `vectorOffset` is row index (not byte offset).

## Migration approach (high-level)

1. Read legacy `index.json`.
2. Write `index.meta.json` + `index.vec.f32`.
3. Keep `index.json.bak` during migration.
4. Validate vector count/dimension before switching active index.
5. Allow fallback read path for legacy `index.json`.

## Future extensions

- Optional `float16` or quantised storage.
- Optional memory-mapped vector loading.
- Alternate ANN sidecar for large repos.
