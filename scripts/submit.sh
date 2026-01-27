#!/bin/bash
# Submit inventory to Canary Worker
# Fails on HTTP errors unless FAIL_ON_ERROR=false

set -e

WORKER_URL="${WORKER_URL:?WORKER_URL is required}"
AUTH_TOKEN="${AUTH_TOKEN:?AUTH_TOKEN is required}"
FAIL_ON_ERROR="${FAIL_ON_ERROR:-true}"
INVENTORY_PATH="${INVENTORY_PATH:-.canary-inventory.json}"

# Check if inventory exists
if [ ! -f "$INVENTORY_PATH" ]; then
    echo "::error::Inventory file not found: $INVENTORY_PATH"
    exit 1
fi

# Get package count from inventory
PACKAGES_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$INVENTORY_PATH')).dependencies.length)")
echo "Submitting inventory with $PACKAGES_COUNT packages to $WORKER_URL/ingest"

# Submit to Worker
HTTP_CODE=$(curl -s -o response.txt -w "%{http_code}" \
    -X POST "${WORKER_URL}/ingest" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d @"$INVENTORY_PATH")

RESPONSE=$(cat response.txt 2>/dev/null || echo "No response body")

echo "Response code: $HTTP_CODE"
echo "Response: $RESPONSE"

# Set outputs
echo "packages_count=$PACKAGES_COUNT" >> "$GITHUB_OUTPUT"

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "status=success" >> "$GITHUB_OUTPUT"
    echo "Successfully submitted inventory to Canary Worker"
else
    echo "status=failed" >> "$GITHUB_OUTPUT"
    echo "::error::Failed to submit inventory: HTTP $HTTP_CODE - $RESPONSE"

    if [ "$FAIL_ON_ERROR" = "true" ]; then
        exit 1
    else
        echo "::warning::Submission failed but fail_on_error is false, continuing"
    fi
fi

# Cleanup
rm -f response.txt
