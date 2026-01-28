#!/bin/bash
# Discover lockfiles in the repository
# Supports: package-lock.json, requirements.txt, poetry.lock,
# go.sum, go.mod, Gemfile.lock, Cargo.lock, composer.lock,
# packages.lock.json, pom.xml

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

# Find go.sum files
while IFS= read -r -d '' file; do
    echo "Found Go sum: $file"
    LOCKFILES+=("go:$file")
done < <(find "$WORKING_DIR" -name "go.sum" -type f -not -path "*/vendor/*" -print0 2>/dev/null || true)

# Find go.mod files
while IFS= read -r -d '' file; do
    echo "Found Go module: $file"
    LOCKFILES+=("go:$file")
done < <(find "$WORKING_DIR" -name "go.mod" -type f -not -path "*/vendor/*" -print0 2>/dev/null || true)

# Find Gemfile.lock files
while IFS= read -r -d '' file; do
    echo "Found RubyGems lockfile: $file"
    LOCKFILES+=("rubygems:$file")
done < <(find "$WORKING_DIR" -name "Gemfile.lock" -type f -print0 2>/dev/null || true)

# Find Cargo.lock files
while IFS= read -r -d '' file; do
    echo "Found Cargo lockfile: $file"
    LOCKFILES+=("cargo:$file")
done < <(find "$WORKING_DIR" -name "Cargo.lock" -type f -not -path "*/target/*" -print0 2>/dev/null || true)

# Find composer.lock files
while IFS= read -r -d '' file; do
    echo "Found Composer lockfile: $file"
    LOCKFILES+=("composer:$file")
done < <(find "$WORKING_DIR" -name "composer.lock" -type f -not -path "*/vendor/*" -print0 2>/dev/null || true)

# Find NuGet packages.lock.json files
while IFS= read -r -d '' file; do
    echo "Found NuGet lockfile: $file"
    LOCKFILES+=("nuget:$file")
done < <(find "$WORKING_DIR" -name "packages.lock.json" -type f -not -path "*/obj/*" -print0 2>/dev/null || true)

# Find Maven pom.xml files
while IFS= read -r -d '' file; do
    echo "Found Maven pom: $file"
    LOCKFILES+=("maven:$file")
done < <(find "$WORKING_DIR" -name "pom.xml" -type f -not -path "*/target/*" -print0 2>/dev/null || true)

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
