#!/bin/bash

# Validate wiki-links in vault
# Checks all .md files for broken [[link]] references

set -e

VAULT_DIR="${1:-.}"
ERROR_COUNT=0
TOTAL_LINKS=0

echo "🔍 Validating links in: $VAULT_DIR"
echo "=================================="

# Find all markdown files
find "$VAULT_DIR" -name "*.md" -type f | while read -r file; do
    # Extract wiki-links (both [[link]] and [[link|text]])
    grep -oE '\[\[[^]]+\]\]' "$file" 2>/dev/null | while read -r link; do
        TOTAL_LINKS=$((TOTAL_LINKS + 1))
        
        # Remove brackets and optional alias
        target=$(echo "$link" | sed 's/\[\[//; s/\]\]//; s/|.*//')
        
        # Skip external links (contain http/https)
        if [[ "$target" == http* ]]; then
            continue
        fi
        
        # Check if target file exists
        # Try various extensions and locations
        found=0
        
        # Direct file match
        if [[ -f "$VAULT_DIR/$target" ]]; then
            found=1
        elif [[ -f "$VAULT_DIR/$target.md" ]]; then
            found=1
        elif [[ -f "$VAULT_DIR/$(dirname "$target")/$(basename "$target").md" ]]; then
            found=1
        fi
        
        # Check in subdirectories
        if [[ $found -eq 0 ]]; then
            # Try to find the file anywhere in vault
            if find "$VAULT_DIR" -name "$(basename "$target").md" -type f | grep -q .; then
                found=1
            fi
        fi
        
        if [[ $found -eq 0 ]]; then
            echo "❌ BROKEN: $link"
            echo "   File: $file"
            echo "   Target: $target"
            ERROR_COUNT=$((ERROR_COUNT + 1))
        fi
    done
done

echo ""
echo "=================================="
echo "📊 Summary:"
echo "   Total links checked: $TOTAL_LINKS"
echo "   Broken links found: $ERROR_COUNT"

if [[ $ERROR_COUNT -gt 0 ]]; then
    echo "❌ Validation failed with $ERROR_COUNT broken links"
    exit 1
else
    echo "✅ All links valid"
    exit 0
fi