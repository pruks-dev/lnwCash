# Evidence Gate Fix: Non-Empty File Check

## Problem
During TASK-047, `vitest-output.log` was deposited as a 0-byte file. The evidence gate did not catch this because no size validation was performed before accepting the deposit.

## Proposed Fix: Evidence Gate Size Validation

### Rule
Any evidence file deposited by a task agent MUST be validated for non-zero size before being accepted into the evidence directory.

### Implementation: Shell-based evidence gate script

```bash
#!/usr/bin/env bash
# evidence-gate.sh — validate evidence before deposit
# Usage: evidence-gate.sh <source-file> <dest-path>

set -euo pipefail

SRC="$1"
DEST="$2"

# Gate 1: Source file must exist
if [[ ! -f "$SRC" ]]; then
    echo "[EVIDENCE-GATE:REJECT] Source file does not exist: $SRC"
    exit 1
fi

# Gate 2: Source file must be non-empty (> 0 bytes)
SIZE=$(stat -c%s "$SRC" 2>/dev/null || stat -f%z "$SRC" 2>/dev/null)
if [[ "$SIZE" -eq 0 ]]; then
    echo "[EVIDENCE-GATE:REJECT] Source file is empty (0 bytes): $SRC"
    exit 1
fi

# Gate 3: For log files, require minimum size (e.g. 100 bytes for test output)
MINSIZE=100
if [[ "$SIZE" -lt "$MINSIZE" ]]; then
    echo "[EVIDENCE-GATE:REJECT] Source file too small: $SIZE bytes (min: $MINSIZE): $SRC"
    exit 1
fi

# Gate 4: For vitest-output.log specifically — must contain 'Test Files' summary line
if [[ "$(basename "$SRC")" == "vitest-output.log" ]]; then
    if ! grep -q 'Test Files' "$SRC"; then
        echo "[EVIDENCE-GATE:REJECT] vitest-output.log missing 'Test Files' summary: $SRC"
        exit 1
    fi
fi

# All gates passed — safe to deposit
echo "[EVIDENCE-GATE:PASS] $SIZE bytes → $DEST"
mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST"
echo "[EVIDENCE-GATE:DEPOSITED] $DEST"
```

### Integration with Saber Agent Workflow

Instead of raw `cp` for evidence file deposition, all Saber agent instructions should use:

```
# SAFE deposit (rejects empty files):
bash scripts/evidence-gate.sh vitest-output.log .arx/evidence/saber/TASK-XXX/vitest-output.log

# Or inline equivalent in agent MUST DO:
SIZE=$(stat -c%s vitest-output.log)
if [ "$SIZE" -eq 0 ]; then
    echo "FATAL: vitest-output.log is empty, aborting deposit" >&2
    exit 1
fi
cp vitest-output.log .arx/evidence/saber/TASK-XXX/vitest-output.log
```

### CI/CD Integration

For GitHub Actions or similar CI pipelines:

```yaml
- name: Evidence Gate Check
  run: |
    for f in .arx/evidence/**/*.log; do
      SIZE=$(stat -c%s "$f")
      if [ "$SIZE" -eq 0 ]; then
        echo "::error::Empty evidence file: $f"
        exit 1
      fi
    done
```

### Future Prevention

1. All `tee` commands in agent workflows should verify output size before deposit
2. Evidence directory watcher should reject 0-byte files on write
3. Task completion check should include evidence file size validation
4. Test output commands should use `&&` chaining to ensure output exists before copy:
   ```bash
   npx vitest run --reporter=verbose 2>&1 | tee vitest-output.log \
     && [ -s vitest-output.log ] \
     && cp vitest-output.log .arx/evidence/saber/TASK-XXX/
   ```
   The `[ -s file ]` test returns true only if the file exists and is non-empty.
