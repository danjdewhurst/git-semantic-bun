# Compact Index Format

`git-semantic-bun` stores index data under `.git/semantic-index/`.

## Current layout

- `index.json` — canonical metadata + compatibility fallback
- `index.meta.json` — compact metadata sidecar
- `index.vec.f32` or `index.vec.f16` — dense vector matrix (row-major)

## Compact metadata shape

```json
{
  "version": 2,
  "modelName": "Xenova/all-MiniLM-L6-v2",
  "createdAt": "2026-02-25T00:00:00.000Z",
  "lastUpdatedAt": "2026-02-25T00:10:00.000Z",
  "repositoryRoot": "/path/to/repo",
  "includePatch": false,
  "checksum": "...",
  "vector": {
    "file": "index.vec.f16",
    "dtype": "float16",
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

## Dtype support

- `float32` (`f32`) — default, highest precision
- `float16` (`f16`) — lower storage footprint, slight precision loss

Set at index/update time:

- `gsb index --vector-dtype f16`
- `gsb update --vector-dtype f16`

## Migration and fallback behaviour

- If compact sidecars are present and valid, they are used for reads.
- If compact sidecars are missing, `index.json` is used.
- `gsb doctor --fix` can regenerate missing compact sidecars from readable index data.

## Notes

- Vectors are expected to be pre-normalised for efficient cosine dot-product scoring.
- `checksum` guards against stale/corrupt index metadata.
