import { ConversationEntry } from "../types";

export class TestManager {
  private currentTestStep: number = 0;
  private isTestMode: boolean = false;

  constructor(private testConversation: ConversationEntry[]) {}

  public startTest(clearEditor: () => void, displayNextEntry: () => void): void {
    console.log("Starting test mode");
    this.isTestMode = true;
    this.currentTestStep = 0;
    clearEditor();
    displayNextEntry();
  }

  public startTestAll(updateContent: (newContent: string, mode: "append" | "replace") => void, isIframe: boolean, sendPostMessage: (content: string) => void): void {
    console.log("Starting testall mode");
    this.isTestMode = false;
    const allContent = this.testConversation.map((entry, index) => 
      this.formatEntry(entry, index === 0)
    ).join("");
    updateContent(allContent, "replace");
    
    if (isIframe) {
      this.testConversation.forEach(entry => {
        if (entry.actions?.length) {
          sendPostMessage(entry.actions.join("\n"));
        }
      });
    }
  }

  public handleTestMode(lastLine: string, addBlankLine: () => void, updateContent: (newContent: string, mode: "append" | "replace") => void, isIframe: boolean, sendPostMessage: (content: string) => void): boolean {
    if (!this.isTestMode) return false;

    console.log("Test mode state:", { currentTestStep: this.currentTestStep, lastLine });
    
    if (this.currentTestStep >= this.testConversation.length - 1) {
      console.log("Reached end of conversation");
      this.isTestMode = false;
      return true;
    }
    
    const currentEntry = this.testConversation[this.currentTestStep];
    const nextStep = this.currentTestStep + 1;
    const nextEntry = this.testConversation[nextStep];
    
    if (currentEntry.from === "U") {
      const hasResponse = lastLine.trim() !== "";
      if (!hasResponse) {
        addBlankLine();
      } else {
        updateContent(this.formatEntry(currentEntry, true), "append");
      }
      setTimeout(() => {
        updateContent(this.formatEntry(nextEntry, true), "replace");
        this.currentTestStep = nextStep + 1;
      }, 300);
    } else {
      updateContent(this.formatEntry(nextEntry, true), "replace");
      this.currentTestStep = nextStep;
    }
    
    if (isIframe && nextEntry.actions?.length) {
      sendPostMessage(nextEntry.actions.join("\n"));
    }
    
    return true;
  }

  private formatEntry(entry: ConversationEntry, isFirst: boolean = false): string {
    const formattedText = entry.from === "U" 
      ? `> ${entry.text.split('\n').join('\n> ')}`
      : entry.text;
    return (isFirst ? "" : "\n") + formattedText + "\n\n";
  }
} 