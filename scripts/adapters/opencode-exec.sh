#!/bin/bash
# opencode-exec.sh — OpenCode tool adapter

TASK=""
TIMEOUT=120

while [[ $# -gt 0 ]]; do
  case $1 in
    --task) TASK="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$TASK" ]; then
  echo "Error: --task required"
  exit 1
fi

# Execute via opencode CLI
timeout "$TIMEOUT" opencode run "$TASK" 2>&1
