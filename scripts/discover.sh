#!/bin/bash
# Discover lockfiles in the repository
# Supports: package-lock.json, requirements.txt, poetry.lock

set -e

WORKING_DIR="${1:-.}"

echo "Searching for lockfiles in: $WORKING_DIR"

# Array to store found lockfiles
LOCKFILES=()

# Find npm lockfiles (package-lock.json)
while IFS= read -r -d '' file; do
    echo "Found npm lockfile: $file"
    LOCKFILES+=("npm:$file")
done < <(find "$WORKING_DIR" -name "package-lock.json" -type f -not -path "*/node_modules/*" -print0 2>/dev/null || true)

# Find requirements.txt files
while IFS= read -r -d '' file; do
    echo "Found Python requirements: $file"
    LOCKFILES+=("requirements:$file")
done < <(find "$WORKING_DIR" -name "requirements.txt" -type f -not -path "*/.venv/*" -not -path "*/venv/*" -print0 2>/dev/null || true)

# Find poetry.lock files
while IFS= read -r -d '' file; do
    echo "Found Poetry lockfile: $file"
    LOCKFILES+=("poetry:$file")
done < <(find "$WORKING_DIR" -name "poetry.lock" -type f -print0 2>/dev/null || true)

# Output results
if [ ${#LOCKFILES[@]} -eq 0 ]; then
    echo "::warning::No lockfiles found in $WORKING_DIR"
    echo "lockfiles=" >> "$GITHUB_OUTPUT"
    echo "count=0" >> "$GITHUB_OUTPUT"
else
    echo "Found ${#LOCKFILES[@]} lockfile(s)"

    # Join array with commas for output
    LOCKFILES_STR=$(IFS=','; echo "${LOCKFILES[*]}")
    echo "lockfiles=$LOCKFILES_STR" >> "$GITHUB_OUTPUT"
    echo "count=${#LOCKFILES[@]}" >> "$GITHUB_OUTPUT"
fi
