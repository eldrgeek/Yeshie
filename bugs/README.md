# Yeshie Bug Tracking

This directory contains detailed information about bugs and issues discovered in the Yeshie project.

## Bug Summary

| ID | Status | Priority | Title | Added | Fixed | 
|---|:---:|:---:|---|:---:|:---:|
| [BUG-001](./BUG-001.md) | ✅ Fixed | 🟨 Medium | Build number not updating on Plasmo rebuilds | 2025-05-01 | 2025-05-01 |
| [BUG-002](./BUG-002.md) | ✅ Fixed | 🟩 Low | SpeechInput component causing undefined error in tab page | 2025-05-01 | 2025-05-01 |
| [BUG-003](./BUG-003.md) | ⚠️ Open | 🟨 Medium | Extension tabs not updating last visited tab | 2025-05-01 | - |
| [BUG-004](./BUG-004.md) | ⚠️ Open | 🟨 Medium | Tab Page showing repeated getLastTab messages in console | 2025-05-01 | - |
| [BUG-005](./BUG-005.md) | ⚠️ Open | 🟨 Medium | Yeshie Tab fails to load without `<React.StrictMode>""</React.StrictMode>` | 2024-07-29 | - |

## Status Legend
- ⚠️ Open
- 🔍 In Investigation
- 🛠️ In Progress
- ✅ Fixed
- 🚫 Won't Fix

## Priority Legend
- 🟥 Critical
- 🟧 High
- 🟨 Medium
- 🟩 Low

## How to Add a New Bug

1. Determine the next bug number (e.g., BUG-003)
2. Create a new file in this directory with the name `BUG-XXX.md`
3. Use the template below or copy from TEMPLATE.md
4. Add the bug to this summary table

## Bug Template

```markdown
# BUG-XXX: Brief descriptive title

- **Status**: Open
- **Priority**: Low/Medium/High/Critical
- **Component**: Affected component or system
- **Added**: YYYY-MM-DD
- **Fixed**: Not yet
- **Assigned To**: Name or Unassigned

## Description
Detailed description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Technical Details
- Technical detail 1
- Technical detail 2

## Potential Solutions
- Possible solution 1
- Possible solution 2