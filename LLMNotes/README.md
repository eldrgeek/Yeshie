# LLMNotes - AI Assistant Knowledge Base

## Purpose
This directory serves as a knowledge base for the AI assistant (Claude) to maintain context and documentation about the Yeshie project. It helps ensure consistency across conversations and enables better long-term maintenance and support.

## Document Structure
Each document follows this format:
```markdown
---
title: Document Title
last_updated: YYYY-MM-DD
author: Claude Version
category: testing|development|deployment|etc
priority: 1-5 (1 being highest)
status: current|outdated|needs-review
dependencies:
  - file: path/to/file
    sha: git-sha-or-current
    last_verified: YYYY-MM-DD
related_notes:
  - relative/path/to/note.md
---

# Document Title

## Overview
Brief description of the document's purpose

... content ...

## Document History
- YYYY-MM-DD: Initial creation
- YYYY-MM-DD: Updated due to [reason]
```

## Directory Structure
```
LLMNotes/
├── README.md (this file)
├── testing/          # Testing-related documentation
├── development/      # Development and architecture docs
├── deployment/       # Deployment and configuration
└── maintenance/      # Maintenance procedures
```

## Categories
- **testing**: Test frameworks, procedures, and known issues
- **development**: Architecture, coding standards, and design decisions
- **deployment**: Deployment procedures and configurations
- **maintenance**: Regular maintenance tasks and troubleshooting

## Priority Levels
1. Critical project components and core functionality
2. Important features and integrations
3. Standard documentation and procedures
4. Nice-to-have information
5. Historical or archived content

## Status Definitions
- **current**: Document is up-to-date and verified
- **needs-review**: Dependencies have changed; needs verification
- **outdated**: Known to be outdated but still contains useful information

## Best Practices
1. Always include document metadata
2. Link to specific code versions when possible
3. Cross-reference related documents
4. Update "last_updated" when making changes
5. Note when external documentation is referenced

## For Humans
This directory is maintained by the AI assistant but is designed to be human-readable. Feel free to:
- Read and reference these documents
- Point out inaccuracies
- Request updates or new documentation
- Use it to help the AI maintain context

## For Claude
Remember to:
1. Update documents when relevant code changes
2. Cross-reference between related documents
3. Mark documents for review when dependencies change
4. Maintain consistent formatting
5. Keep metadata current 