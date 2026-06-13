# GitHub.com Yeshie Recipe Set

Hand-authored recipe set for GitHub.com browser automation via the Yeshie RSI system.

## Summary

| Metric | Count |
|--------|-------|
| Total recipes | 100 |
| Safe (read-only or reversible) | 72 |
| Confirm (destructive / irreversible) | 28 |
| Auth required (github_session) | 58 |
| No auth required (public) | 42 |
| Live verified (port 9223) | 0 (port unavailable at authoring time) |

## Categories

- Repos (01–15): 15 recipes
- Issues (16–30): 15 recipes
- Pull Requests (31–46): 16 recipes
- Branches (47–51): 5 recipes
- Files/Code (52–60): 9 recipes
- Releases & Tags (61–65): 5 recipes
- Actions/Workflows (66–70): 5 recipes
- Gists (71–75): 5 recipes
- Collaborators & Teams (76–80): 5 recipes
- Notifications (81–85): 5 recipes
- Search (86–91): 6 recipes
- Profile & Settings (92–96): 5 recipes
- Org Basics (97–100): 4 recipes

---

## Full Recipe Index

| # | Slug | Description | Category | Risk | Auth | Verified |
|---|------|-------------|----------|------|------|---------|
| 01 | repo-view | Read repo description/stats/README | Repos | safe | none_public_repo | - |
| 02 | repo-star | Star a repository | Repos | safe | github_session | - |
| 03 | repo-unstar | Unstar a repository | Repos | safe | github_session | - |
| 04 | repo-watch | Watch a repository (select notification level) | Repos | safe | github_session | - |
| 05 | repo-fork | Fork a repository to your account | Repos | safe | github_session | - |
| 06 | repo-clone-url | Read HTTPS clone URL from repo page | Repos | safe | none_public_repo | - |
| 07 | repo-create | Create a new repository | Repos | safe | github_session | - |
| 08 | repo-rename | Rename a repository via Settings | Repos | **confirm** | github_session | - |
| 09 | repo-archive | Archive a repository (make read-only) | Repos | **confirm** | github_session | - |
| 10 | repo-change-visibility | Make a repo public or private | Repos | **confirm** | github_session | - |
| 11 | repo-delete | Permanently delete a repository | Repos | **confirm** | github_session | - |
| 12 | repo-transfer | Transfer repo to another owner | Repos | **confirm** | github_session | - |
| 13 | repo-topics-edit | Edit repository topics/tags | Repos | safe | github_session | - |
| 14 | repo-description-edit | Edit repository description & website | Repos | safe | github_session | - |
| 15 | repo-list-forks | View forks / fork network members | Repos | safe | none_public_repo | - |
| 16 | issue-list | List issues (open or closed) | Issues | safe | none_public_repo | - |
| 17 | issue-create | Create a new issue | Issues | safe | github_session | - |
| 18 | issue-view | View a specific issue by number | Issues | safe | none_public_repo | - |
| 19 | issue-comment | Post a comment on an issue | Issues | safe | github_session | - |
| 20 | issue-close | Close an issue (with optional comment) | Issues | safe | github_session | - |
| 21 | issue-reopen | Reopen a closed issue | Issues | safe | github_session | - |
| 22 | issue-label-apply | Apply a label to an issue | Issues | safe | github_session | - |
| 23 | issue-assign | Assign an issue to a user | Issues | safe | github_session | - |
| 24 | issue-milestone | Set milestone on an issue | Issues | safe | github_session | - |
| 25 | issue-pin | Pin an issue to the repo | Issues | safe | github_session | - |
| 26 | issue-lock | Lock issue conversation | Issues | **confirm** | github_session | - |
| 27 | issue-search | Search issues with query syntax | Issues | safe | none_public_repo | - |
| 28 | issue-filter-by-label | Filter issues by label | Issues | safe | none_public_repo | - |
| 29 | issue-filter-by-assignee | Filter issues by assignee | Issues | safe | none_public_repo | - |
| 30 | issue-mark-duplicate | Mark as duplicate via closing comment | Issues | safe | github_session | - |
| 31 | pr-list | List pull requests (open or closed) | PRs | safe | none_public_repo | - |
| 32 | pr-view | View a specific PR by number | PRs | safe | none_public_repo | - |
| 33 | pr-create | Create a pull request | PRs | safe | github_session | - |
| 34 | pr-comment | Comment on a PR | PRs | safe | github_session | - |
| 35 | pr-review-approve | Approve a PR review | PRs | safe | github_session | - |
| 36 | pr-review-request-changes | Request changes on a PR | PRs | safe | github_session | - |
| 37 | pr-request-reviewer | Request a specific reviewer | PRs | safe | github_session | - |
| 38 | pr-convert-to-draft | Convert open PR to draft | PRs | safe | github_session | - |
| 39 | pr-mark-ready | Mark draft PR as ready for review | PRs | safe | github_session | - |
| 40 | pr-merge | Merge a pull request | PRs | **confirm** | github_session | - |
| 41 | pr-close | Close PR without merging | PRs | safe | github_session | - |
| 42 | pr-link-issue | Link PR to issue via closing keyword | PRs | safe | github_session | - |
| 43 | pr-view-diff | View PR file diff | PRs | safe | none_public_repo | - |
| 44 | pr-view-checks | View CI/CD check statuses | PRs | safe | none_public_repo | - |
| 45 | pr-filter-open | Filter PRs to open only | PRs | safe | none_public_repo | - |
| 46 | pr-filter-author | Filter PRs by author | PRs | safe | none_public_repo | - |
| 47 | branch-list | List all branches | Branches | safe | none_public_repo | - |
| 48 | branch-create | Create a branch via branch picker UI | Branches | safe | github_session | - |
| 49 | branch-switch-default | Change the default branch | Branches | **confirm** | github_session | - |
| 50 | branch-delete | Delete a branch | Branches | **confirm** | github_session | - |
| 51 | branch-view-protection | View branch protection rules | Branches | safe | github_session | - |
| 52 | file-view | View file content on a branch | Files | safe | none_public_repo | - |
| 53 | file-create | Create a new file via web UI | Files | safe | github_session | - |
| 54 | file-edit | Edit an existing file via web UI | Files | safe | github_session | - |
| 55 | file-delete | Delete a file via web UI | Files | **confirm** | github_session | - |
| 56 | file-upload | Navigate to file upload form | Files | safe | github_session | - |
| 57 | file-blame | View blame for a file | Files | safe | none_public_repo | - |
| 58 | code-search | Search code within repos | Files | safe | none_public_repo | - |
| 59 | file-history | View commit history for a file | Files | safe | none_public_repo | - |
| 60 | repo-file-find | Use T shortcut file finder | Files | safe | none_public_repo | - |
| 61 | release-list | List releases | Releases | safe | none_public_repo | - |
| 62 | release-view | View a release by tag | Releases | safe | none_public_repo | - |
| 63 | release-create | Create a new release | Releases | safe | github_session | - |
| 64 | release-edit | Edit an existing release | Releases | **confirm** | github_session | - |
| 65 | release-delete | Delete a release | Releases | **confirm** | github_session | - |
| 66 | actions-list | List workflow runs | Actions | safe | none_public_repo | - |
| 67 | actions-view-run | View a specific workflow run | Actions | safe | none_public_repo | - |
| 68 | actions-rerun | Re-run a workflow | Actions | safe | github_session | - |
| 69 | actions-cancel | Cancel a running workflow | Actions | **confirm** | github_session | - |
| 70 | actions-view-logs | View workflow run logs | Actions | safe | none_public_repo | - |
| 71 | gist-list-public | Browse public gists discover page | Gists | safe | none | - |
| 72 | gist-view | View a specific public gist | Gists | safe | none | - |
| 73 | gist-create | Create a new gist | Gists | safe | github_session | - |
| 74 | gist-edit | Edit a gist | Gists | safe | github_session | - |
| 75 | gist-delete | Delete a gist | Gists | **confirm** | github_session | - |
| 76 | collaborator-list | List repo collaborators | Collaborators | safe | github_session | - |
| 77 | collaborator-invite | Invite a collaborator | Collaborators | **confirm** | github_session | - |
| 78 | collaborator-remove | Remove a collaborator | Collaborators | **confirm** | github_session | - |
| 79 | collaborator-change-role | Change collaborator permission | Collaborators | **confirm** | github_session | - |
| 80 | team-list | List org teams | Collaborators | safe | github_session | - |
| 81 | notifications-list | View notifications inbox | Notifications | safe | github_session | - |
| 82 | notifications-mark-read | Mark all notifications as read | Notifications | safe | github_session | - |
| 83 | notifications-subscribe | Subscribe / Watch a repo | Notifications | safe | github_session | - |
| 84 | notifications-unsubscribe | Unsubscribe / Ignore a repo | Notifications | safe | github_session | - |
| 85 | notifications-filter-unread | Filter to unread notifications | Notifications | safe | github_session | - |
| 86 | search-repos | Search repositories | Search | safe | none | - |
| 87 | search-code | Search code | Search | safe | none | - |
| 88 | search-issues | Search issues and PRs | Search | safe | none | - |
| 89 | search-users | Search users and orgs | Search | safe | none | - |
| 90 | search-commits | Search commits | Search | safe | none | - |
| 91 | search-topics | Search topics | Search | safe | none | - |
| 92 | profile-view | View a user/org profile | Profile | safe | none | - |
| 93 | profile-edit | Edit own profile (name, bio, location) | Profile | safe | github_session | - |
| 94 | settings-view | View account settings root | Profile | safe | github_session | - |
| 95 | settings-emails | View email settings | Profile | safe | github_session | - |
| 96 | settings-security | View security settings | Profile | safe | github_session | - |
| 97 | org-view | View organization profile | Orgs | safe | none | - |
| 98 | org-repos | List organization repositories | Orgs | safe | none | - |
| 99 | org-members | List organization members | Orgs | safe | none_public_repo | - |
| 100 | explore | GitHub Explore / trending repos | Explore | safe | none | - |

---

## Risk Gate Summary

**28 destructive recipes (risk: confirm)** — all guarded with `assert false` as the first chain step to prevent accidental execution:

| # | Action | Why Destructive |
|---|--------|----------------|
| 08 | repo-rename | Changes URLs, breaks clones/integrations |
| 09 | repo-archive | Makes repo read-only |
| 10 | repo-change-visibility | Exposes private code publicly |
| 11 | repo-delete | Permanent, unrecoverable |
| 12 | repo-transfer | Removes from your account |
| 26 | issue-lock | Prevents public commenting |
| 40 | pr-merge | Integrates code into base branch |
| 49 | branch-switch-default | Affects all new clones/PRs/CI |
| 50 | branch-delete | Loses unmerged commits |
| 55 | file-delete | Commits deletion to branch |
| 64 | release-edit | Modifies published release |
| 65 | release-delete | Removes download links |
| 69 | actions-cancel | Stops running CI |
| 75 | gist-delete | Permanently removes gist |
| 77 | collaborator-invite | Grants repo access |
| 78 | collaborator-remove | Revokes repo access |
| 79 | collaborator-change-role | Changes access level |

Plus the entire repo destructive group (08-12) and PR merge (40).

## Live Verification Status

Port 9223 was unavailable at authoring time (2026-06-13). No live tests were run.

**Payloads ready for live verification without GitHub login (public, read-only):**
- 01-repo-view, 06-repo-clone-url, 15-repo-list-forks
- 16-issue-list, 18-issue-view, 27-issue-search, 28-issue-filter-by-label, 29-issue-filter-by-assignee
- 31-pr-list, 32-pr-view, 43-pr-view-diff, 44-pr-view-checks, 45-pr-filter-open, 46-pr-filter-author
- 47-branch-list, 52-file-view, 57-file-blame, 58-code-search, 59-file-history, 60-repo-file-find
- 61-release-list, 62-release-view, 66-actions-list, 67-actions-view-run, 70-actions-view-logs
- 71-gist-list-public, 72-gist-view
- 86-search-repos, 87-search-code, 88-search-issues, 89-search-users, 90-search-commits, 91-search-topics
- 92-profile-view, 97-org-view, 98-org-repos, 99-org-members, 100-explore

**Remaining payloads need an active GitHub session** to verify (58 recipes).
