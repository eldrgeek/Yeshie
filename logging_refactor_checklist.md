# Logging Refactoring Checklist

This list tracks files that need `console.*` calls updated to the new logging system.

## Phase 1: Core Extension Logic (High Impact)
- [x] `extension/functions/storage.ts` (`console.error`)
- [x] `extension/functions/Stepper.ts` (`console.log`, `console.warn`)
- [x] `extension/functions/tabFocus.ts` (`console.log`, `console.warn`, `console.error`)
- [x] `extension/background/tabHistory.ts` (`console.warn`, `console.error`)
- [x] `extension/background/messages/getLastTab.ts` (`console.warn`)
- [x] `extension/background/messages/focusLastTab.ts` (`console.warn`)
- [x] `extension/background/messages/getTabId.ts` (`console.error`)
- [x] `extension/background/messages/focusTab.ts` (`console.error`)

## Phase 2: Other Extension Functions
- [x] `extension/functions/observer.ts` (`console.log`)
- [x] `extension/functions/extcomms.ts` (`console.log`)
- [x] `extension/functions/pageSummary.ts` (`console.warn`)
- [x] `extension/parseAndInsertWords.ts` (`console.log`)
- [x] `extension/functions/DiagnosticLogger.ts` (`console.log`, `console.error`) - *Reviewed: Intentional raw diagnostics?*
- [x] `extension/functions/logger.ts` (`console.log`, `console.warn`, `console.error`) - *Review: Internal logger logging.*

## Phase 3: Extension UI Components (`contents`, `components`, `tabs`)
- [x] `extension/contents/Yeshie.tsx` (`console.warn`, `console.error`)
- [x] `extension/tabs/TabList.tsx` (`console.warn`, `console.error`)
- [x] `extension/content/DialogPanel.tsx` (`console.error`)
- [x] `extension/components/ReportsPanel.tsx` (`console.error`)
- [x] `extension/components/ReportDialog.tsx` (`console.error`)
- [x] `extension/contents/LearnMode.tsx` (`console.error`)
- [x] `extension/content/getHtml.ts` (`console.error`)

## Phase 4: `client/` Directory (React App)
- [ ] `client/src/App.tsx` (`console.log`, `console.error`)
- [ ] `client/src/Components/CollaborationPage.tsx` (`console.log`, `console.error`)
- [ ] `client/src/Components/MilkdownCollab.tsx` (`console.log`, `console.error`)
- [ ] `client/src/Components/Rewind.tsx` (`console.log`, `console.error`)
- [ ] `client/src/editor/config.ts` (`console.log`)
- [ ] `client/src/Components/TipTapCollaboration.tsx` (`console.log`)
- [ ] `client/src/Components/MilkdownCollabOld.tsx` (`console.log`)
- [ ] `client/src/Components/ScriptEditor.tsx` (`console.log`)
- [ ] `client/src/services/schema.ts` (`console.error`)
- [ ] `client/src/services/deployment.ts` (`console.error`)
- [ ] `client/src/services/firebase.ts` (`console.error`)
- [ ] `client/src/services/commandHandler.ts` (`console.error`)

## Phase 5: `src/` Directory (Server-side/Build tooling)
- [ ] `src/dev.ts` (`console.log`, `console.warn`, `console.error`)
- [ ] `src/plugins/serverSetup.ts` (`console.log`)
- [ ] `src/plugins/monitorCommunication.ts` (`console.log`)
- [ ] `src/plugins/messageForwarder.ts` (`console.log`)
- [ ] `src/plugins/errorLogger.ts` (`console.error`) - *Review: Dedicated raw error logger?*

## Phase 6: `shared/` Directory
- [ ] `shared/core/testManager.ts` (`console.log`)
- [ ] `shared/core/testing.ts` (`console.log`) 