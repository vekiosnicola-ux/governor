#!/bin/bash
# execute.sh — Main execution layer for Project Ego
# Routes tasks to appropriate tools and captures results

set -e

VAULT_DIR="/Users/nicolavekios/workspace/Project Ego"
SCRIPTS_DIR="$VAULT_DIR/scripts"
TRACES_FILE="$VAULT_DIR/.execution/traces.jsonl"

# Generate task ID
task_id() {
  python3 -c "import uuid; print(uuid.uuid4())"
}

# Log result to traces
log_trace() {
  local json="$1"
  echo "$json" >> "$TRACES_FILE"
}

# Retry with exponential backoff
retry() {
  local max_attempts=3
  local delay=1
  for i in $(seq 1 $max_attempts); do
    if "$@"; then return 0; fi
    echo "Retry $i/$max_attempts failed, waiting ${delay}s..." >&2
    sleep $delay
    delay=$((delay * 2))
  done
  return 1
}

# Execute with timeout and capture
execute_tool() {
  local tool="$1"
  local adapter="$SCRIPTS_DIR/adapters/${tool}-exec.sh"
  shift
  
  if [ ! -f "$adapter" ]; then
    echo "Error: Adapter not found: $adapter" >&2
    return 1
  fi
  
  local id=$(task_id)
  local start_ms=$(python3 -c "import time; print(int(time.time()*1000))")
  local status="success"
  local output=""
  local error=""
  
  # Execute with timeout
  output=$("$adapter" "$@" 2>&1) || {
    status="failure"
    error="$output"
    output=""
  }
  
  local end_ms=$(python3 -c "import time; print(int(time.time()*1000))")
  local duration=$((end_ms - start_ms))
  local ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Truncate output
  output=$(echo "$output" | head -c 1000)
  
  # Build result JSON
  local result=$(python3 -c "
import json
print(json.dumps({
    'task_id': '$id',
    'tool': '$tool',
    'task': '$*',
    'status': '$status',
    'duration_ms': $duration,
    'output': '''$output'''[:1000],
    'error': '''$error'''[:500] if '$error' else None,
    'timestamp': '$ts',
    'retries': 0
}))
" 2>/dev/null || echo "{\"task_id\":\"$id\",\"tool\":\"$tool\",\"status\":\"$status\",\"duration_ms\":$duration}")
  
  log_trace "$result"
  echo "$result"
}

# Route task to appropriate tool
route() {
  local task="$1"
  
  # Simple routing based on keywords
  if echo "$task" | grep -qi "code\|fix\|implement\|build\|write.*file"; then
    echo "opencode"
  elif echo "$task" | grep -qi "research\|query\|ask\|what\|how\|why"; then
    echo "nlm"
  elif echo "$task" | grep -qi "autonomous\|loop\|self-correct"; then
    echo "ralph"
  else
    echo "opencode"  # Default
  fi
}

# Health check
health_check() {
  echo "=== Tool Health Check ==="
  
  for tool in opencode ralph nlm; do
    local adapter="$SCRIPTS_DIR/adapters/${tool}-exec.sh"
    if [ -f "$adapter" ] && [ -x "$adapter" ]; then
      echo "✅ $tool — adapter exists and executable"
    else
      echo "❌ $tool — adapter missing or not executable"
    fi
  done
  
  if [ -f "$TRACES_FILE" ]; then
    local count=$(wc -l < "$TRACES_FILE")
    echo "📊 Traces: $count executions logged"
  else
    echo "📊 Traces: no file yet"
  fi
}

# Usage
usage() {
  cat << 'EOF'
Usage: execute.sh [OPTIONS]

Options:
  --tool TOOL        Tool to use (opencode|ralph|nlm)
  --task "TEXT"      Task description
  --notebook ID      NotebookLM notebook ID (for nlm tool)
  --question "TEXT"  Question for NotebookLM
  --timeout SECS     Timeout in seconds (default: 120)
  --health           Check tool health
  --recent N         Show last N executions

Examples:
  execute.sh --tool opencode --task "Fix broken links"
  execute.sh --tool ralph --task "Implement feature X"
  execute.sh --tool nlm --notebook 27ceeb9a --question "multi-agent patterns"
  execute.sh --health
  execute.sh --recent 5
EOF
}

# Main
TOOL=""
TASK=""
NOTEBOOK=""
QUESTION=""
TIMEOUT=120

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool) TOOL="$2"; shift 2 ;;
    --task) TASK="$2"; shift 2 ;;
    --notebook) NOTEBOOK="$2"; shift 2 ;;
    --question) QUESTION="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --health) health_check; exit 0 ;;
    --recent) tail -${2:-10} "$TRACES_FILE" 2>/dev/null | python3 -m json.tool; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Auto-route if no tool specified
if [ -z "$TOOL" ] && [ -n "$TASK" ]; then
  TOOL=$(route "$TASK")
  echo "Auto-routed to: $TOOL" >&2
fi

# Execute
if [ -n "$TOOL" ] && [ -n "$TASK" ]; then
  execute_tool "$TOOL" --task "$TASK" --timeout "$TIMEOUT"
elif [ "$TOOL" = "nlm" ] && [ -n "$NOTEBOOK" ] && [ -n "$QUESTION" ]; then
  execute_tool "nlm" --notebook "$NOTEBOOK" --question "$QUESTION"
else
  usage
  exit 1
fi
