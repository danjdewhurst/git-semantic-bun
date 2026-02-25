# Serve Daemon

`gsb serve` runs a warm, in-process search daemon that keeps the embedding model and index loaded in memory. This eliminates the cold-start cost of loading the model (~1–3 seconds) on every query.

## Usage

```bash
gsb serve [options]
```

Once started, it reads one query per stdin line and writes results to stdout.

```
$ gsb serve
gsb serve ready (model=Xenova/all-MiniLM-L6-v2, commits=4521, ann available)
Type a query per line. Commands: :reload, :quit/:exit
```

Type a query and press Enter:

```
fix authentication timeout
{
  "query": "fix authentication timeout",
  "results": [ ... ]
}
```

## Interactive commands

| Command | Description |
|---|---|
| `:reload` | Reload the index and model from disc (useful after `gsb update`) |
| `:quit` | Exit the daemon |
| `:exit` | Alias for `:quit` |

## JSONL mode

For integration with scripts and pipelines, use `--jsonl` to emit one compact JSON object per line (no pretty-printing):

```bash
echo "fix timeout" | gsb serve --jsonl
```

Output:

```json
{"query":"fix timeout","results":[{"hash":"abc123","score":0.82,...}]}
```

This is useful for piping queries in bulk:

```bash
cat queries.txt | gsb serve --jsonl > results.jsonl
```

## Default filters

You can set default filters that apply to every query in the session:

```bash
gsb serve --author "Dan" --after 2025-01-01 --limit 5
```

## Integration patterns

### Shell script wrapper

```bash
#!/bin/bash
# Start serve in the background and query it
coproc GSB { gsb serve --jsonl 2>/dev/null; }

echo "fix authentication" >&${GSB[1]}
read -r result <&${GSB[0]}
echo "$result" | jq '.results[0].hash'

echo ":quit" >&${GSB[1]}
wait $GSB_PID
```

### Piped queries

```bash
# Run multiple queries in sequence
printf "fix timeout\nrefactor database\nadd logging" | gsb serve --jsonl 2>/dev/null
```

## Error handling

If a query causes an error (e.g. the index is corrupt), the daemon logs the error in the output rather than crashing:

```json
{"query": "bad query", "error": "index checksum mismatch"}
```

The daemon continues accepting queries after an error.
