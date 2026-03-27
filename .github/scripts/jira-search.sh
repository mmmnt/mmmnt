#!/usr/bin/env bash
# jira-search.sh — Cursor-paginated Jira JQL search
#
# Usage:
#   JIRA_USER_EMAIL=... JIRA_API_TOKEN=... \
#     .github/scripts/jira-search.sh \
#       --jql "project=MMNT AND status != Done" \
#       --fields "key,issuelinks" \
#       --max-results 100 \
#       --output /tmp/results.json
#
# Outputs a JSON array of all matched issues to the specified file.
# Exits 0 on success, 1 on error.

set -euo pipefail

JIRA_BASE_URL="${JIRA_BASE_URL:-https://winnovation.atlassian.net}"
JQL=""
FIELDS="key"
MAX_RESULTS=100
OUTPUT_FILE="/tmp/jira-search-results.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --jql) JQL="$2"; shift 2 ;;
    --fields) FIELDS="$2"; shift 2 ;;
    --max-results) MAX_RESULTS="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$JQL" ]; then
  echo "Error: --jql is required" >&2
  exit 1
fi

if [ -z "${JIRA_USER_EMAIL:-}" ] || [ -z "${JIRA_API_TOKEN:-}" ]; then
  echo "Error: JIRA_USER_EMAIL and JIRA_API_TOKEN must be set" >&2
  exit 1
fi

ALL_ISSUES="[]"
NEXT_TOKEN=""
PAGE=0

while true; do
  PAGE=$((PAGE + 1))

  CURL_ARGS=(-s --connect-timeout 10 --max-time 60 -G \
    "$JIRA_BASE_URL/rest/api/3/search/jql" \
    --data-urlencode "jql=$JQL" \
    --data-urlencode "maxResults=$MAX_RESULTS" \
    --data-urlencode "fields=$FIELDS")

  if [ -n "$NEXT_TOKEN" ]; then
    CURL_ARGS+=(--data-urlencode "nextPageToken=$NEXT_TOKEN")
  fi

  RESPONSE=$(curl "${CURL_ARGS[@]}" -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN")

  COUNT=$(echo "$RESPONSE" | jq '.issues | length')
  IS_LAST=$(echo "$RESPONSE" | jq '.isLast')
  NEXT_TOKEN=$(echo "$RESPONSE" | jq -r '.nextPageToken // empty')

  echo "  Page $PAGE: $COUNT issues (isLast=$IS_LAST)" >&2

  if [ "$COUNT" -eq 0 ]; then
    break
  fi

  ALL_ISSUES=$(echo "$ALL_ISSUES" | jq --argjson page "$(echo "$RESPONSE" | jq '.issues')" '. + $page')

  if [ "$IS_LAST" = "true" ]; then
    break
  fi

  if [ -z "$NEXT_TOKEN" ]; then
    echo "  No nextPageToken — stopping." >&2
    break
  fi
done

TOTAL=$(echo "$ALL_ISSUES" | jq 'length')
echo "Total: $TOTAL issues" >&2

echo "$ALL_ISSUES" > "$OUTPUT_FILE"
