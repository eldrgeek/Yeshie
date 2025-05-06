# Rules for Generating Retrospectives

These guidelines outline the process for conducting a development retrospective.

## Activation and Conclusion
- **Activation**: A retrospective session begins when you (the user) issue the "retrospective" prompt in the chat.
- **Scope of Review**:
    - **Conversation**: The primary review scope is the conversation history from the current "retrospective" prompt back to the previous "retrospective" prompt within the ongoing chat session. If this is the first retrospective in the session, review the entire session.
    - **Project Rules**: Review all rules in `.cursor/rules/`, with special attention to `project-guidelines.md` and any rules pertinent to the activities discussed.
- **Rule Proposal Phase Conclusion**: The discussion and refinement of rule changes conclude when you signal satisfaction (e.g., "thank you," "completed," "looks good").
- **Session Conclusion**: The broader retrospective for the work period is generally considered complete when a commit is made.

## Retrospective Process

1.  **Understand the Session**:
    *   Thoroughly analyze the defined conversation scope to understand the tasks undertaken, decisions made, and outcomes.
    *   Cross-reference with the project rules to identify adherence, deviations, or areas where rules might be lacking or unclear.

2.  **Identify Learnings and Improvements**:
    *   Based on the review, determine:
        *   What went well and should be continued.
        *   What challenges were encountered.
        *   What could be improved in terms of process, rule application, or efficiency.

3.  **Clarify Ambiguities (If Needed)**:
    *   If any part of the reviewed session is unclear or requires more context for a full analysis, ask targeted questions.

4.  **Propose Rule Enhancements**:
    *   If the analysis reveals that existing rules were insufficient, frequently bypassed, or that new patterns emerged, propose specific changes:
        *   Draft new rules.
        *   Suggest modifications to existing rules (clarifications, exceptions, etc.).
        *   Recommend removal of obsolete rules.
    *   For each proposal, provide the rationale and expected benefit.

5.  **Iterate on Rule Proposals with User**:
    *   Present your proposed rule changes.
    *   Engage in a discussion to refine, accept, or discard proposals based on user feedback. This is an iterative step.
    *   Continue until the user indicates the rule proposal phase is complete. 