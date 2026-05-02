#!/bin/bash
# nlm-exec.sh — NotebookLM tool adapter

NOTEBOOK=""
QUESTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --notebook) NOTEBOOK="$2"; shift 2 ;;
    --question) QUESTION="$2"; shift 2 ;;
    --task) shift ;;  # Ignored
    --timeout) shift 2 ;;  # Ignored
    *) shift ;;
  esac
done

if [ -z "$NOTEBOOK" ] || [ -z "$QUESTION" ]; then
  echo "Error: --notebook and --question required"
  exit 1
fi

# Execute via nlm CLI
nlm notebook query "$NOTEBOOK" "$QUESTION" 2>&1
