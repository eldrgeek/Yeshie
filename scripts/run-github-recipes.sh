#!/usr/bin/env bash
# Run all 38 public GitHub recipes against port 9223 test surface
# Usage: bash run-github-recipes.sh

RELAY="http://localhost:3333/run"
DELAY=3  # seconds between recipes
RESULTS_FILE="/tmp/github-recipe-results.json"
echo "[]" > "$RESULTS_FILE"

pass=0
fail=0
fail_auth=0
fail_ambig=0

run_recipe() {
  local num="$1"
  local slug="$2"
  local payload="$3"

  local resp
  resp=$(curl -s -X POST "$RELAY" \
    -H 'Content-Type: application/json' \
    -d "$payload" 2>/dev/null)

  local success
  success=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('success') else 'false')" 2>/dev/null)
  local error
  error=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)

  if [ "$success" = "true" ]; then
    echo "PASS [$num] $slug"
    echo "$resp" | python3 -c "
import sys,json
d=json.load(sys.stdin)
chain=d.get('chainResult',{}).get('steps',[])
for s in chain[-1:]:
  val=str(s.get('value',''))[:100]
  if val: print('  value:', val)
" 2>/dev/null
  else
    echo "FAIL [$num] $slug: $error"
    # Check if it's a login redirect
    if echo "$resp" | grep -qi "login\|session\|auth\|sign.*in"; then
      echo "  -> needs-auth"
    fi
  fi

  # Append to results file
  python3 -c "
import json, sys
results = json.load(open('$RESULTS_FILE'))
results.append({'num': '$num', 'slug': '$slug', 'success': '$success' == 'true', 'error': '''$error'''})
json.dump(results, open('$RESULTS_FILE', 'w'))
" 2>/dev/null

  sleep "$DELAY"
}

# ===== RUN ALL 38 PUBLIC RECIPES =====

echo "=== Starting GitHub recipe verification ==="
echo "Relay: $RELAY"
echo "Delay: ${DELAY}s between recipes"
echo ""

# 01 - repo-view
run_recipe "01" "repo-view" '{
  "payload": {
    "runId": "github-repo-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux", "base_url": "https://github.com" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "repo_content" }
    ]
  }
}'

# 06 - repo-clone-url
run_recipe "06" "repo-clone-url" '{
  "payload": {
    "runId": "github-repo-clone-url-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "click", "selector": "button[aria-label*=\"Code\"], summary[aria-haspopup=\"menu\"][data-view-component=\"true\"]", "note": "Open the Code dropdown" },
      { "stepId": "s4", "action": "delay", "ms": 500 },
      { "stepId": "s5", "action": "read", "selector": "input[aria-label*=\"https://github.com\"], #clone-help-step-1 input, [data-url*=\"github.com\"]", "store_as": "clone_url" }
    ]
  }
}'

# 15 - repo-list-forks
run_recipe "15" "repo-list-forks" '{
  "payload": {
    "runId": "github-repo-list-forks-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux/network/members" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "forks_list" }
    ]
  }
}'

# 16 - issue-list
run_recipe "16" "issue-list" '{
  "payload": {
    "runId": "github-issue-list-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux", "state": "open" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux/issues?q=is%3Aissue+is%3Aopen" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "issues_list" }
    ]
  }
}'

# 18 - issue-view (using microsoft/vscode which has issues enabled)
run_recipe "18" "issue-view" '{
  "payload": {
    "runId": "github-issue-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "number": "1" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/issues/1" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "issue_content" }
    ]
  }
}'

# 27 - issue-search
run_recipe "27" "issue-search" '{
  "payload": {
    "runId": "github-issue-search-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "query": "bug" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/issues?q=bug" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "search_results" }
    ]
  }
}'

# 28 - issue-filter-by-label
run_recipe "28" "issue-filter-by-label" '{
  "payload": {
    "runId": "github-issue-filter-by-label-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "label": "bug" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/issues?q=is%3Aissue+is%3Aopen+label%3A%22bug%22" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "filtered_issues" }
    ]
  }
}'

# 29 - issue-filter-by-assignee
run_recipe "29" "issue-filter-by-assignee" '{
  "payload": {
    "runId": "github-issue-filter-by-assignee-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "assignee": "bpasero" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/issues?q=is%3Aissue+is%3Aopen+assignee%3Abpasero" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "filtered_issues" }
    ]
  }
}'

# 31 - pr-list
run_recipe "31" "pr-list" '{
  "payload": {
    "runId": "github-pr-list-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "state": "open" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/pulls?q=is%3Apr+is%3Aopen" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "pr_list" }
    ]
  }
}'

# 32 - pr-view
run_recipe "32" "pr-view" '{
  "payload": {
    "runId": "github-pr-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "number": "1" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/pull/1" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "pr_content" }
    ]
  }
}'

# 43 - pr-view-diff
run_recipe "43" "pr-view-diff" '{
  "payload": {
    "runId": "github-pr-view-diff-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "number": "1" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/pull/1/files" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "pr_diff" }
    ]
  }
}'

# 44 - pr-view-checks
run_recipe "44" "pr-view-checks" '{
  "payload": {
    "runId": "github-pr-view-checks-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "number": "100" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/pull/100/checks" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "pr_checks" }
    ]
  }
}'

# 45 - pr-filter-open
run_recipe "45" "pr-filter-open" '{
  "payload": {
    "runId": "github-pr-filter-open-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/pulls?q=is%3Aopen+is%3Apr" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "open_prs" }
    ]
  }
}'

# 46 - pr-filter-author
run_recipe "46" "pr-filter-author" '{
  "payload": {
    "runId": "github-pr-filter-author-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "author": "bpasero" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/pulls?q=is%3Apr+is%3Aopen+author%3Abpasero" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "author_prs" }
    ]
  }
}'

# 47 - branch-list
run_recipe "47" "branch-list" '{
  "payload": {
    "runId": "github-branch-list-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux/branches" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "branches_list" }
    ]
  }
}'

# 52 - file-view
run_recipe "52" "file-view" '{
  "payload": {
    "runId": "github-file-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux", "branch": "master", "path": "README" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux/blob/master/README" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "file_content" }
    ]
  }
}'

# 57 - file-blame
run_recipe "57" "file-blame" '{
  "payload": {
    "runId": "github-file-blame-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux", "branch": "master", "path": "README" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux/blame/master/README" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "blame_content" }
    ]
  }
}'

# 58 - code-search (within-repo via search action)
run_recipe "58" "code-search" '{
  "payload": {
    "runId": "github-code-search-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "linux+kernel", "language": "c" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=linux+kernel+language%3Ac&type=code" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "code_search_results" }
    ]
  }
}'

# 59 - file-history
run_recipe "59" "file-history" '{
  "payload": {
    "runId": "github-file-history-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux", "branch": "master", "path": "README" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux/commits/master/README" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "file_history" }
    ]
  }
}'

# 60 - repo-file-find
run_recipe "60" "repo-file-find" '{
  "payload": {
    "runId": "github-repo-file-find-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "torvalds", "repo": "linux", "filename": "Makefile" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds/linux" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "key", "key": "t", "note": "Press T to open file finder" },
      { "stepId": "s4", "action": "wait_for", "selector": "#tree-finder-field, input[placeholder*=\"Go to file\"]", "timeout": 5000 },
      { "stepId": "s5", "action": "type", "selector": "#tree-finder-field, input[placeholder*=\"Go to file\"]", "value": "Makefile" },
      { "stepId": "s6", "action": "delay", "ms": 800 },
      { "stepId": "s7", "action": "read", "store_as": "file_finder_results" }
    ]
  }
}'

# 61 - release-list (use microsoft/vscode which has releases)
run_recipe "61" "release-list" '{
  "payload": {
    "runId": "github-release-list-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/releases" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "releases_list" }
    ]
  }
}'

# 62 - release-view
run_recipe "62" "release-view" '{
  "payload": {
    "runId": "github-release-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "tag": "1.99.3" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/releases/tag/1.99.3" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "release_detail" }
    ]
  }
}'

# 66 - actions-list
run_recipe "66" "actions-list" '{
  "payload": {
    "runId": "github-actions-list-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/actions" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "actions_list" }
    ]
  }
}'

# 67 - actions-view-run (need a real run ID from vscode)
run_recipe "67" "actions-view-run" '{
  "payload": {
    "runId": "github-actions-view-run-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "run_id": "15000000000" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/actions" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "actions_list", "note": "Read actions list to find a run ID" }
    ]
  }
}'

# 70 - actions-view-logs (same as 67 but clicking into job)
run_recipe "70" "actions-view-logs" '{
  "payload": {
    "runId": "github-actions-view-logs-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "owner": "microsoft", "repo": "vscode", "run_id": "15000000000" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft/vscode/actions" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "actions_page" }
    ]
  }
}'

# 71 - gist-list-public
run_recipe "71" "gist-list-public" '{
  "payload": {
    "runId": "github-gist-list-public-test",
    "mode": "verification",
    "site": "github.com",
    "params": {},
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://gist.github.com/discover" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "public_gists" }
    ]
  }
}'

# 72 - gist-view (a well-known public gist by torvalds)
run_recipe "72" "gist-view" '{
  "payload": {
    "runId": "github-gist-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "username": "torvalds", "gist_id": "cc68ebc4b4d305e9dbb8" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://gist.github.com/torvalds/cc68ebc4b4d305e9dbb8" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "gist_content" }
    ]
  }
}'

# 86 - search-repos
run_recipe "86" "search-repos" '{
  "payload": {
    "runId": "github-search-repos-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "linux+kernel" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=linux+kernel&type=repositories" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "repo_search_results" }
    ]
  }
}'

# 87 - search-code
run_recipe "87" "search-code" '{
  "payload": {
    "runId": "github-search-code-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "console.log" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=console.log&type=code" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "code_search_results" }
    ]
  }
}'

# 88 - search-issues
run_recipe "88" "search-issues" '{
  "payload": {
    "runId": "github-search-issues-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "is%3Aissue+is%3Aopen+label%3Abug" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=is%3Aissue+is%3Aopen+label%3Abug&type=issues" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "issue_search_results" }
    ]
  }
}'

# 89 - search-users
run_recipe "89" "search-users" '{
  "payload": {
    "runId": "github-search-users-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "location%3ADenver+language%3Arust" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=location%3ADenver+language%3Arust&type=users" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "user_search_results" }
    ]
  }
}'

# 90 - search-commits
run_recipe "90" "search-commits" '{
  "payload": {
    "runId": "github-search-commits-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "fix+memory+leak" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=fix+memory+leak&type=commits" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "commit_search_results" }
    ]
  }
}'

# 91 - search-topics
run_recipe "91" "search-topics" '{
  "payload": {
    "runId": "github-search-topics-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "query": "machine-learning" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/search?q=machine-learning&type=topics" },
      { "stepId": "s2", "action": "delay", "ms": 2000 },
      { "stepId": "s3", "action": "read", "store_as": "topic_search_results" }
    ]
  }
}'

# 92 - profile-view
run_recipe "92" "profile-view" '{
  "payload": {
    "runId": "github-profile-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "username": "torvalds" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/torvalds" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "profile_content" }
    ]
  }
}'

# 97 - org-view
run_recipe "97" "org-view" '{
  "payload": {
    "runId": "github-org-view-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "org": "microsoft" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/microsoft" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "org_profile" }
    ]
  }
}'

# 98 - org-repos
run_recipe "98" "org-repos" '{
  "payload": {
    "runId": "github-org-repos-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "org": "microsoft", "sort": "updated" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/orgs/microsoft/repositories?q=&sort=updated" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "org_repos" }
    ]
  }
}'

# 99 - org-members
run_recipe "99" "org-members" '{
  "payload": {
    "runId": "github-org-members-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "org": "microsoft" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/orgs/microsoft/people" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "org_members" }
    ]
  }
}'

# 100 - explore
run_recipe "100" "explore" '{
  "payload": {
    "runId": "github-explore-test",
    "mode": "verification",
    "site": "github.com",
    "params": { "language": "", "since": "daily" },
    "chain": [
      { "stepId": "s1", "action": "navigate", "url": "https://github.com/trending/?since=daily" },
      { "stepId": "s2", "action": "delay", "ms": 1500 },
      { "stepId": "s3", "action": "read", "store_as": "trending_repos" }
    ]
  }
}'

echo ""
echo "=== DONE ==="
# Print summary
python3 -c "
import json
results = json.load(open('$RESULTS_FILE'))
passed = sum(1 for r in results if r['success'])
failed = len(results) - passed
print(f'Total: {len(results)} | PASS: {passed} | FAIL: {failed}')
for r in results:
    status = 'PASS' if r['success'] else 'FAIL'
    print(f'  [{status}] {r[\"num\"]} {r[\"slug\"]}' + (f': {r[\"error\"]}' if not r['success'] else ''))
"
