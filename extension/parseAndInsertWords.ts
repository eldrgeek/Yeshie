/**
 * Represents the state being managed during parsing.
 */
interface ParseState {
  revisedSegment: string; // The text segment being built from the current speech input
  capsLock: boolean;
  escapeNextWord: boolean;
  processedTokens: string[]; // All tokens from the current speech input
  currentTokenIndex: number; // Index of the token being processed
  needsInitialCaps: boolean; // Flag to capitalize the next actual word
  firstWordAdded: boolean; // Track if the first word was added to revisedSegment
  unmatchedParenCount: number; // Track open parentheses for smart 'paren' command
  unmatchedQuote: boolean; // Track open quote for smart 'quote' command (optional future use)
}

/**
 * Defines the structure for commands: either a replacement string
 * or a function that modifies the parse state.
 */
type CommandAction = string | ((state: ParseState, commandMap: CommandMap) => void);

/**
 * Defines the map of spoken commands/punctuation to their actions.
 */
type CommandMap = { [key: string]: CommandAction };


/**
 * Helper function to append text or symbol, managing preceding space intelligently.
 * @param textToAppend The text/symbol to add.
 * @param state The current parse state.
 * @param spacingRule 'before', 'after', 'both', 'none', 'smart' (default 'after')
 */
const appendWithSpacing = (
    textToAppend: string,
    state: ParseState,
    spacingRule: 'before' | 'after' | 'both' | 'none' | 'smart' = 'after'
): void => {
    const endsWithSpace = /[\s\n]$/.test(state.revisedSegment);
    const endsWithNoSpaceChar = state.revisedSegment && !endsWithSpace;

    switch (spacingRule) {
        case 'before': // e.g., open quote if not start
            if (endsWithNoSpaceChar) {
                state.revisedSegment += " ";
            }
            state.revisedSegment += textToAppend;
            break;
        case 'none': // e.g., hyphen, close quote/paren
             if (endsWithSpace) {
                state.revisedSegment = state.revisedSegment.slice(0, -1); // Remove space before
            }
            state.revisedSegment += textToAppend;
            break;
        case 'both': // e.g., em dash (if added)
             if (endsWithNoSpaceChar) {
                state.revisedSegment += " ";
            }
            state.revisedSegment += textToAppend + " ";
            break;
        case 'smart': // Contextual (currently used for paren toggle)
             // Logic specific to the command calling this (e.g., handleParen)
             // Defaulting to 'after' logic here if not handled before call
             if (endsWithSpace) {
                 state.revisedSegment = state.revisedSegment.slice(0, -1); // Remove space before close paren ')'
             }
             if (!state.revisedSegment.endsWith('(') && !state.revisedSegment.endsWith('\n') && state.revisedSegment) {
                 state.revisedSegment += " "; // Add space before open paren '(' if needed
             }
             state.revisedSegment += textToAppend;
             if (textToAppend === '(') {
                 state.revisedSegment += " "; // Space after open paren
             }
             break;
        case 'after': // Default for most punctuation and words
        default:
             if (endsWithSpace) {
                state.revisedSegment = state.revisedSegment.slice(0, -1); // Remove space before e.g. period
            }
            state.revisedSegment += textToAppend;
            state.revisedSegment += " "; // Add space after
            break;
    }
};


/**
 * Processes text from a speech recognizer and inserts it into existing text,
 * interpreting commands for punctuation, formatting, control, and escaping.
 * Includes handling for quotes, parentheses, and hyphens with specific spacing.
 *
 * @param speechInput - The text string from the speech recognizer.
 * @param currentCapsLock - The current state of caps lock (true if active).
 * @param originalText - The existing text content where insertion will occur.
 * @param insertionPoint - The index in originalText where insertion should begin.
 * @returns A tuple containing:
 * [0] (string): The full, revised text content after insertion.
 * [1] (boolean): The updated capsLock state.
 */
const parseAndInsertWords = (
  speechInput: string,
  currentCapsLock: boolean,
  originalText: string,
  insertionPoint: number
): [string, boolean] => {

  // --- Preprocessing and State Initialization ---
  const trimmedInput = speechInput.trim();
  if (!trimmedInput) {
    return [originalText, currentCapsLock];
  }

  const words = trimmedInput.split(/\s+/);
  const state: ParseState = {
    revisedSegment: "",
    capsLock: currentCapsLock,
    escapeNextWord: false,
    processedTokens: [],
    currentTokenIndex: -1,
    needsInitialCaps: insertionPoint === 0 || /[\.\?\!]\s*$/.test(originalText.substring(0, insertionPoint)) || originalText.substring(insertionPoint - 1, insertionPoint) === '\n',
    firstWordAdded: false,
    unmatchedParenCount: 0, // Initialize paren counter
    unmatchedQuote: false, // Initialize quote tracker
  };

  // --- Command Map Definition ---
  const commandMap: CommandMap = {
    // Simple Punctuation (uses default 'space after' via string type)
    period: ".",
    comma: ",",
    "question mark": "?",
    "exclamation point": "!",
    "exclamation mark": "!",
    colon: ":",
    semicolon: ";",
    dash: "-", // Dash gets space after by default string handling

    // Commands & Complex Punctuation (Functions handle specific logic/spacing)
    "new line": (st) => {
      // Remove potential space before newline
      if (st.revisedSegment.endsWith(" ")) {
        st.revisedSegment = st.revisedSegment.slice(0, -1);
      }
      st.revisedSegment += "\n";
      st.needsInitialCaps = true;
      st.firstWordAdded = false;
    },
    "all caps": (st) => { st.capsLock = true; },
    "end caps": (st) => { st.capsLock = false; },
    "literally": (st, commands) => {
      const nextTokenIndex = st.currentTokenIndex + 1;
      if (nextTokenIndex < st.processedTokens.length) {
        const nextToken = st.processedTokens[nextTokenIndex].toLowerCase();
        if (commands[nextToken]) {
           st.escapeNextWord = true;
        } else {
           appendWord("literally", st); // Type "literally" if next word isn't command
        }
      } else {
         appendWord("literally", st); // Type "literally" if it's the last word
      }
    },
    // --- Punctuation with specific spacing ---
    hyphen: (st) => { // No space around hyphen
        appendWithSpacing("-", st, 'none');
    },
    quote: (st) => { // Opening quote "
        appendWithSpacing("\"", st, 'before'); // Space before (if needed)
        st.unmatchedQuote = true; // Track open quote
    },
    "end quote": (st) => { // Closing quote "
        appendWithSpacing("\"", st, 'none'); // No space before
        st.unmatchedQuote = false; // Track close quote
    },
    "open paren": (st) => {
        appendWithSpacing("(", st, 'before'); // Space before
        st.revisedSegment += " "; // Ensure space *after* open paren
        st.unmatchedParenCount++;
    },
    "close paren": (st) => {
        if(st.unmatchedParenCount > 0) {
            appendWithSpacing(")", st, 'none'); // No space before
            st.unmatchedParenCount--;
        }
        // Maybe add logic here if user says "close paren" without an open one? Ignore?
    },
    paren: (st) => { // Smart paren - toggle based on count
        if (st.unmatchedParenCount > 0) {
            // Close the most recent paren
             appendWithSpacing(")", st, 'none');
             st.unmatchedParenCount--;
        } else {
            // Open a new paren
            appendWithSpacing("(", st, 'before');
            st.revisedSegment += " "; // Ensure space *after* open paren
            st.unmatchedParenCount++;
        }
    },
    // Add more commands here (e.g., apostrophe, brackets)
  };


  // --- Tokenization (handling multi-word commands) ---
  let i = 0;
  while (i < words.length) {
    const word1 = words[i].toLowerCase();
    const word2 = i + 1 < words.length ? words[i + 1].toLowerCase() : null;
    const twoWordPhrase = word2 ? `${word1} ${word2}` : null;

    // Prioritize two-word commands/punctuation
    if (twoWordPhrase && commandMap[twoWordPhrase]) {
      state.processedTokens.push(twoWordPhrase);
      i += 2;
    } else if (commandMap[word1]) { // Check single-word commands/punctuation
      state.processedTokens.push(word1); // Store command key (lowercase)
      i += 1;
    } else { // Regular word
      state.processedTokens.push(words[i]); // Store original casing
      i += 1;
    }
  }


  // --- Main Processing Loop ---
  for (let k = 0; k < state.processedTokens.length; k++) {
    state.currentTokenIndex = k;
    const token = state.processedTokens[k];
    const tokenLower = token.toLowerCase();

    if (state.escapeNextWord) {
      appendWord(token, state); // appendWord handles capitalization and internal spacing
      state.escapeNextWord = false;
      continue;
    }

    const action = commandMap[tokenLower];

    if (typeof action === 'function') {
      action(state, commandMap); // Execute command function
    } else if (typeof action === 'string') {
      // Handle simple punctuation (default: space after)
      const symbol = action;
      appendWithSpacing(symbol, state, 'after'); // Use helper for consistency
      // Update initial caps state based on punctuation
      if (['.', '?', '!'].includes(symbol)) {
          state.needsInitialCaps = true;
          state.firstWordAdded = false;
      } else {
          state.needsInitialCaps = false;
      }
    } else {
      // Regular word
      appendWord(token, state);
    }
  } // End of processing loop


  // --- Insertion and Spacing Adjustment ---
  let textBefore = originalText.substring(0, insertionPoint);
  let textAfter = originalText.substring(insertionPoint);
  let finalSegment = state.revisedSegment;

  // Adjust space *before* the inserted segment
  const charBefore = textBefore.slice(-1);
  const segmentStartsWithSymbol = /^[\s\n\.,;\:\?\!\)\]\}"]/.test(finalSegment); // Added ), ], }, ", -
  const segmentStartsWithOpenSymbol = /^[\s\n\(\[\{"]/.test(finalSegment); // Added (, [, {, "

  if (textBefore && !/[\s\n]$/.test(charBefore) && // If textBefore exists and doesn't end with space/newline
      finalSegment && !segmentStartsWithSymbol && !segmentStartsWithOpenSymbol) { // And segment doesn't start with space/newline/punctuation
    finalSegment = " " + finalSegment;
  } else if (textBefore && /[\)\]\}"]$/.test(charBefore) && // If textBefore ends with closing symbol
             finalSegment && !segmentStartsWithSymbol && !segmentStartsWithOpenSymbol) { // And segment starts with a word
     finalSegment = " " + finalSegment; // Need space after closing symbols before a word
  }


  // Adjust space *after* the inserted segment
  const charAfter = textAfter.charAt(0);
  const segmentEndsWithSymbol = /[\.\,\?\!\:\;]$/.test(finalSegment.trimEnd()); // Common punctuation needing space after
  const segmentEndsWithOpenSymbol = /[\(\[\{"]]$/.test(finalSegment.trimEnd());
  const segmentEndsWithCloseSymbol = /[\)\]\}"]]$/.test(finalSegment.trimEnd());

  // Trim trailing space added by loop *unless* needed before textAfter
  if (finalSegment.endsWith(" ") && (!textAfter || /^[\s\n\.\,\?\!\:\;\)\]\}"]/.test(charAfter))) {
      // If segment ends with space AND (no text after OR textAfter starts with space/punctuation)
      // then trim the space from the segment.
       finalSegment = finalSegment.trimEnd();
  } else if (!finalSegment.endsWith(" ") && // Segment doesn't end with space
             textAfter && !/^[\s\n\.\,\?\!\:\;\)\]\}"]/.test(charAfter) && // textAfter starts with word/open symbol
             !segmentEndsWithOpenSymbol) { // And segment doesn't end with an opening symbol
        // Add space between segment (ending word/closing symbol) and textAfter (starting word)
       finalSegment += " ";
   }


  const newFullText = textBefore + finalSegment + textAfter;

  // Return the final text and the potentially updated caps lock state
  return [newFullText, state.capsLock];
};


/**
 * Helper function to append a word to the revised segment, handling
 * capitalization (initial caps, all caps) and spacing *within* the segment.
 * @param word - The word to append (original casing).
 * @param state - The current parsing state.
 */
const appendWord = (word: string, state: ParseState): void => {
    let processedWord = word;

    // Apply initial caps if needed and this is the first word of a potential sentence/segment
    if (state.needsInitialCaps && !state.firstWordAdded) {
        processedWord = word.charAt(0).toUpperCase() + word.slice(1);
        state.needsInitialCaps = false; // Consumed initial caps flag
        state.firstWordAdded = true;
    } else if (state.capsLock) { // Apply all caps if active
        processedWord = word.toUpperCase();
        state.firstWordAdded = true; // Mark that a word (uppercase) has been added
    } else {
        // If not initial caps and not all caps, still mark first word added
        state.firstWordAdded = true;
    }


    // Add space before the word *within the segment* if needed
    // Check if segment exists and doesn't end with space, newline, or opening parenthesis/quote
    if (state.revisedSegment && !/[\s\n\(\[\{"]]$/.test(state.revisedSegment.slice(-1))) {
        state.revisedSegment += " ";
    }

    state.revisedSegment += processedWord;
};

import { logInfo } from "./functions/logger";

// --- Example Usage ---

let currentText = "Initial text.";
let capsLockOn = false;
let cursorPosition = currentText.length; // At the end

logInfo("ParseAndInsertWordsExample", `Initial Text: "${currentText}"`);
logInfo("ParseAndInsertWordsExample", `Caps Lock: ${capsLockOn}, Cursor: ${cursorPosition}`);

const inputs = [
  { speech: "add a quote hello world end quote", cursor: -1 },
  { speech: "period a test paren with parens paren", cursor: -1 },
  { speech: "period user hyphen friendly input", cursor: -1 },
  { speech: "period literally quote test", cursor: -1 },
  { speech: "open paren test close paren", cursor: -1},
  { speech: "all caps TEST end caps", cursor: 0}, // Insert at beginning
  { speech: "period", cursor: -1},
  { speech: "quote", cursor: 15}, // Insert quote mid-word (edge case)
  { speech: "end quote", cursor: 25} // Insert end quote
];

inputs.forEach((inputInfo, index) => {
  const { speech } = inputInfo;
  const insertAt = inputInfo.cursor === -1 ? currentText.length : inputInfo.cursor;

  logInfo("ParseAndInsertWordsExample", `--- Input ${index + 1} ---`);
  logInfo("ParseAndInsertWordsExample", `Speech: "${speech}"`);
  logInfo("ParseAndInsertWordsExample", `Inserting at: ${insertAt}`);

  const [newText, newCapsLockState] = parseAndInsertWords(
    speech,
    capsLockOn,
    currentText,
    insertAt
  );

  currentText = newText;
  capsLockOn = newCapsLockState;

  logInfo("ParseAndInsertWordsExample", `New Text: "${currentText}"`);
  logInfo("ParseAndInsertWordsExample", `New Caps Lock: ${capsLockOn}`);
});

logInfo("ParseAndInsertWordsExample", "--- Final Result ---");
logInfo("ParseAndInsertWordsExample", `Text: "${currentText}"`);
logInfo("ParseAndInsertWordsExample", `Caps Lock: ${capsLockOn}`);


/* Expected Rough Output Simulation:

Initial Text:
"Initial text."
Caps Lock: false, Cursor: 13

--- Input 1 ---
Speech: "add a quote hello world end quote"
Inserting at: 13

New Text:
"Initial text. add a \"hello world\""
New Caps Lock: false

--- Input 2 ---
Speech: "period a test paren with parens paren"
Inserting at: 38

New Text:
"Initial text. add a \"hello world\". a test (with parens)"
New Caps Lock: false

--- Input 3 ---
Speech: "period user hyphen friendly input"
Inserting at: 59

New Text:
"Initial text. add a \"hello world\". a test (with parens). user-friendly input"
New Caps Lock: false

--- Input 4 ---
Speech: "period literally quote test"
Inserting at: 81

New Text:
"Initial text. add a \"hello world\". a test (with parens). user-friendly input. quote test"
New Caps Lock: false

--- Input 5 ---
Speech: "open paren test close paren"
Inserting at: 93

New Text:
"Initial text. add a \"hello world\". a test (with parens). user-friendly input. quote test (test)"
New Caps Lock: false

--- Input 6 ---
Speech: "all caps TEST end caps"
Inserting at: 0

New Text:
"TEST Initial text. add a \"hello world\". a test (with parens). user-friendly input. quote test (test)"
New Caps Lock: false

--- Input 7 ---
Speech: "period"
Inserting at: 100 (end of updated string)

New Text:
"TEST Initial text. add a \"hello world\". a test (with parens). user-friendly input. quote test (test)."
New Caps Lock: false

--- Input 8 ---
Speech: "quote"
Inserting at: 15 (within "Initial")

New Text:
"TEST Initial te"xt. add a \"hello world\". a test (with parens). user-friendly input. quote test (test)."
New Caps Lock: false

--- Input 9 ---
Speech: "end quote"
Inserting at: 25 (within "add")

New Text:
"TEST Initial te"xt. add "a \"hello world\". a test (with parens). user-friendly input. quote test (test)."
New Caps Lock: false


--- Final Result ---
Text:
"TEST Initial te"xt. add "a \"hello world\". a test (with parens). user-friendly input. quote test (test)."
Caps Lock: false

*/

export default parseAndInsertWords; 