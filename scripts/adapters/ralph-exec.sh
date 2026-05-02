#!/bin/bash
# ralph-exec.sh — Ralph Wiggum tool adapter

TASK=""
MAX_ITERATIONS=20

while [[ $# -gt 0 ]]; do
  case $1 in
    --task) TASK="$2"; shift 2 ;;
    --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
    --timeout) shift 2 ;;  # Ignored, Ralph has its own
    *) shift ;;
  esac
done

if [ -z "$TASK" ]; then
  echo "Error: --task required"
  exit 1
fi

# Execute via Ralph CLI
ralph "$TASK" --max-iterations "$MAX_ITERATIONS" 2>&1
