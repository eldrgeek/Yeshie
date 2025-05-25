<!-- Codex task derived from tasks/task_L_tab_tracking_extension_pages.md -->
# Task L: Extension Page Tab Tracking

## Summary
Update tab tracking logic to include the control page and extension management pages, ensuring they appear in the Tab panel. Currently `tabHistory.ts` and `TabList.tsx` treat these as restricted URLs.

## Acceptance Criteria
- [ ] The control page and extension management page appear in the Tab panel list.
- [ ] Switching to or from these pages updates the last active tab information.
- [ ] Only internal `about:` pages continue to be ignored.

## Implementation Notes
- Modify `isExtensionUrl` in `tabHistory.ts` to only skip `about:` URLs.
- Update `isRestrictedUrl` in `TabList.tsx` to allow `chrome-extension://` URLs for the Yeshie extension.
- Add regression tests or manual steps verifying the Tab panel lists these pages.
