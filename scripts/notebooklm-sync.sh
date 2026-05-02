#!/bin/bash
# NotebookLM ↔ Vault Sync Script
# Bidirectional sync using nlm CLI only (no MCP)

VAULT_DIR="/Users/nicolavekios/workspace/Project Ego"

usage() {
    cat << 'EOF'
Usage: notebooklm-sync.sh <command> [args]

Commands:
  list                          List all notebooks
  query <id> <question>         Query a notebook
  pull <id> <vault_file>        Pull insight into vault file
  push <notebook_id> <file>     Push vault file to notebook
  search <query>                Search notebooks by title

Examples:
  notebooklm-sync.sh list
  notebooklm-sync.sh query c9847dca "What is OpenCode?"
  notebooklm-sync.sh pull c9847dca 02_Modules/MODULE_OpenCode
  notebooklm-sync.sh push 05ec8e21 INDEX.md
EOF
}

cmd_list() {
    nlm notebook list --json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for n in sorted(data, key=lambda x: x.get('source_count',0), reverse=True):
    title = n['title'][:70] if n['title'] else '(untitled)'
    print(f\"{n['id']}  {n['source_count']:>4} sources  {title}\")
"
}

cmd_query() {
    local id="$1"
    shift
    local question="$*"
    nlm notebook query "$id" "$question"
}

cmd_pull() {
    local id="$1"
    local vault_file="$2"
    local vault_path="$VAULT_DIR/${vault_file}.md"
    
    if [ ! -f "$vault_path" ]; then
        echo "Error: $vault_path not found"
        return 1
    fi
    
    # Get the first heading as context for the question
    local topic=$(head -5 "$vault_path" | grep '^#' | head -1 | sed 's/^# *//')
    local question="What are the latest insights, patterns, and best practices related to: $topic?"
    
    echo "Querying notebook $id about: $topic"
    
    local result=$(nlm notebook query "$id" "$question" --json 2>/dev/null)
    local answer=$(echo "$result" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('value', {}).get('answer', ''))
except:
    pass
" 2>/dev/null)
    
    if [ -n "$answer" ]; then
        {
            echo ""
            echo "## NotebookLM Insight ($(date +%Y-%m-%d))"
            echo ""
            echo "$answer"
            echo ""
        } >> "$vault_path"
        echo "✓ Appended insight to $vault_file"
    else
        echo "✗ Query returned no answer"
    fi
}

cmd_push() {
    local notebook_id="$1"
    local file="$2"
    local filepath="$VAULT_DIR/$file"
    
    if [ ! -f "$filepath" ]; then
        echo "Error: $filepath not found"
        return 1
    fi
    
    local title=$(head -1 "$filepath" | sed 's/^# *//')
    local content=$(cat "$filepath")
    
    echo "Pushing $file to notebook $notebook_id"
    nlm source add "$notebook_id" --text "$content" --title "Vault: $title" && \
        echo "✓ Added" || echo "✗ Failed"
}

cmd_search() {
    local query="$1"
    nlm notebook list --json 2>/dev/null | python3 -c "
import sys, json
q = '$query'.lower()
data = json.load(sys.stdin)
for n in data:
    title = n.get('title', '').lower()
    if q in title:
        print(f\"{n['id']}  {n['source_count']:>4} sources  {n['title'][:70]}\")
"
}

case "${1:-}" in
    list)   cmd_list ;;
    query)  shift; cmd_query "$@" ;;
    pull)   shift; cmd_pull "$@" ;;
    push)   shift; cmd_push "$@" ;;
    search) shift; cmd_search "$@" ;;
    *)      usage ;;
esac
