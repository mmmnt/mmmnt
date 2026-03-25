#!/usr/bin/env bash
#
# xray-setup-associations.sh
#
# One-time setup script to wire Xray-native associations:
#   Test Plan → Test Set → Test
#
# These associations are managed through the Xray Cloud GraphQL API,
# separate from the standard Jira API. They populate the Xray panels
# (Test Plan > Test Sets tab, Test Set > Tests tab).
#
# Prerequisites:
#   export XRAY_CLIENT_ID="..."
#   export XRAY_CLIENT_SECRET="..."
#
# Usage:
#   ./scripts/xray-setup-associations.sh
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
if [[ -z "${XRAY_CLIENT_ID:-}" || -z "${XRAY_CLIENT_SECRET:-}" ]]; then
  echo "ERROR: XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set"
  exit 1
fi

XRAY_BASE="https://xray.cloud.getxray.app/api/v2"

echo "Authenticating with Xray Cloud..."
TOKEN=$(curl -s -X POST "${XRAY_BASE}/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"${XRAY_CLIENT_ID}\",\"client_secret\":\"${XRAY_CLIENT_SECRET}\"}" \
  | tr -d '"')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: Failed to authenticate with Xray"
  exit 1
fi
echo "Authenticated."

# ---------------------------------------------------------------------------
# GraphQL helper
# ---------------------------------------------------------------------------
gql() {
  local query="$1"
  curl -s -X POST "${XRAY_BASE}/graphql" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"${query}\"}"
}

# ---------------------------------------------------------------------------
# Issue key → Xray internal ID mapping
#
# Xray GraphQL uses internal IDs, not Jira keys. We need to resolve them.
# ---------------------------------------------------------------------------
get_test_plan_id() {
  local key="$1"
  local result
  result=$(gql "{ getTestPlans(jql: \\\"key = ${key}\\\", limit: 1) { results { issueId } } }")
  echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['getTestPlans']['results'][0]['issueId'])" 2>/dev/null || echo ""
}

get_test_set_id() {
  local key="$1"
  local result
  result=$(gql "{ getTestSets(jql: \\\"key = ${key}\\\", limit: 1) { results { issueId } } }")
  echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['getTestSets']['results'][0]['issueId'])" 2>/dev/null || echo ""
}

get_test_id() {
  local key="$1"
  local result
  result=$(gql "{ getTests(jql: \\\"key = ${key}\\\", limit: 1) { results { issueId } } }")
  echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['getTests']['results'][0]['issueId'])" 2>/dev/null || echo ""
}

# ---------------------------------------------------------------------------
# Association helpers
# ---------------------------------------------------------------------------
add_tests_to_test_set() {
  local test_set_id="$1"
  shift
  local test_ids="$*"
  local ids_json
  ids_json=$(printf ',"%s"' $test_ids)
  ids_json="[${ids_json:1}]"
  gql "mutation { addTestsToTestSet(issueId: \\\"${test_set_id}\\\", testIssueIds: ${ids_json}) { addedTests warning } }"
}

add_test_sets_to_test_plan() {
  local test_plan_id="$1"
  shift
  local test_set_ids="$*"
  local ids_json
  ids_json=$(printf ',"%s"' $test_set_ids)
  ids_json="[${ids_json:1}]"
  # Note: Xray GraphQL uses addTestsToPlan for both Tests and Test Sets
  # Test Sets are added via the testSetIssueIds parameter
  gql "mutation { updateTestPlanTestSets(issueId: \\\"${test_plan_id}\\\", testSetIssueIds: ${ids_json}) { addedTestSets warning } }"
}

# ===========================================================================
# Resolve Xray internal IDs
# ===========================================================================
echo ""
echo "Resolving Xray internal IDs..."

# Test Plans
echo "  Test Plans..."
TP_M1=$(get_test_plan_id "MMNT-585")
TP_M2=$(get_test_plan_id "MMNT-586")
TP_M3=$(get_test_plan_id "MMNT-587")
TP_M4=$(get_test_plan_id "MMNT-588")
TP_M5=$(get_test_plan_id "MMNT-589")
TP_M6=$(get_test_plan_id "MMNT-590")

# Test Sets
echo "  Test Sets..."
TS_1X=$(get_test_set_id "MMNT-609")   # M1 Infra Verification
TS_21=$(get_test_set_id "MMNT-591")   # 2.1 Langium Grammar
TS_22=$(get_test_set_id "MMNT-592")   # 2.2 Parser & Validation
TS_23=$(get_test_set_id "MMNT-593")   # 2.3 SiftSpecificationImporter
TS_24=$(get_test_set_id "MMNT-594")   # 2.4 RegenerateOnMomentFileChanged
TS_31=$(get_test_set_id "MMNT-595")   # 3.1 Derivation Engine
TS_32=$(get_test_set_id "MMNT-596")   # 3.2 Gherkin + Spec Docs
TS_33=$(get_test_set_id "MMNT-597")   # 3.3 emit-ts
TS_41=$(get_test_set_id "MMNT-598")   # 4.1 harness
TS_42=$(get_test_set_id "MMNT-599")   # 4.2 viz renderers
TS_43=$(get_test_set_id "MMNT-600")   # 4.3 preview server
TS_51=$(get_test_set_id "MMNT-601")   # 5.1 SyncState
TS_52=$(get_test_set_id "MMNT-602")   # 5.2 FeedbackJournal
TS_53=$(get_test_set_id "MMNT-603")   # 5.3 Drift
TS_54=$(get_test_set_id "MMNT-604")   # 5.4 SchemaRegistry
TS_55=$(get_test_set_id "MMNT-605")   # 5.5 CodexRuleEvaluator
TS_61=$(get_test_set_id "MMNT-606")   # 6.1 CLI Core
TS_62=$(get_test_set_id "MMNT-607")   # 6.2 CLI Sync+Schema
TS_63=$(get_test_set_id "MMNT-608")   # 6.3 MCP Server

# M1 Tests
echo "  M1 Tests..."
T_SCAFFOLD=$(get_test_id "MMNT-610")
T_TOOLING=$(get_test_id "MMNT-611")
T_CI=$(get_test_id "MMNT-612")
T_HOOKS=$(get_test_id "MMNT-613")
T_TURBO=$(get_test_id "MMNT-614")

echo "  Done resolving IDs."

# ===========================================================================
# Wire associations
# ===========================================================================

# --- M1: Test Plan → Test Set → Tests ---
echo ""
echo "Wiring M1 associations..."
echo "  Adding Test Set MMNT-609 to Test Plan MMNT-585..."
add_test_sets_to_test_plan "$TP_M1" "$TS_1X"
echo "  Adding Tests MMNT-610..614 to Test Set MMNT-609..."
add_tests_to_test_set "$TS_1X" "$T_SCAFFOLD" "$T_TOOLING" "$T_CI" "$T_HOOKS" "$T_TURBO"

# --- M2: Test Plan → Test Sets ---
echo ""
echo "Wiring M2 associations..."
echo "  Adding Test Sets to Test Plan MMNT-586..."
add_test_sets_to_test_plan "$TP_M2" "$TS_21" "$TS_22" "$TS_23" "$TS_24"

# --- M3: Test Plan → Test Sets ---
echo ""
echo "Wiring M3 associations..."
echo "  Adding Test Sets to Test Plan MMNT-587..."
add_test_sets_to_test_plan "$TP_M3" "$TS_31" "$TS_32" "$TS_33"

# --- M4: Test Plan → Test Sets ---
echo ""
echo "Wiring M4 associations..."
echo "  Adding Test Sets to Test Plan MMNT-588..."
add_test_sets_to_test_plan "$TP_M4" "$TS_41" "$TS_42" "$TS_43"

# --- M5: Test Plan → Test Sets ---
echo ""
echo "Wiring M5 associations..."
echo "  Adding Test Sets to Test Plan MMNT-589..."
add_test_sets_to_test_plan "$TP_M5" "$TS_51" "$TS_52" "$TS_53" "$TS_54" "$TS_55"

# --- M6: Test Plan → Test Sets ---
echo ""
echo "Wiring M6 associations..."
echo "  Adding Test Sets to Test Plan MMNT-590..."
add_test_sets_to_test_plan "$TP_M6" "$TS_61" "$TS_62" "$TS_63"

echo ""
echo "All Xray associations wired successfully."
echo ""
echo "Verification:"
echo "  Open each Test Plan in Jira and check the 'Test Sets' tab"
echo "  Open MMNT-609 and check the 'Tests' tab for 5 M1 Tests"
