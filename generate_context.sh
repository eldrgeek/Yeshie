#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

OUTPUT_FILE="project_context.txt"
EXTENSION_DIR="extension"
IGNORE_FILE=".gitignore"
BUGS_DIR_PATTERN="^${EXTENSION_DIR}/bugs/" # Regex pattern to match files in bugs dir

# --- Pre-checks ---
# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "Error: git command not found. This script relies on git ls-files to respect .gitignore."
    exit 1
fi

# Check if inside a git repository needed for ls-files
if ! git rev-parse --is-inside-work-tree &> /dev/null; then
    echo "Error: Not inside a git repository. Cannot use git ls-files."
    exit 1
fi

echo "Generating project context in $OUTPUT_FILE..."

# --- File Generation ---
# Write header (overwrite existing file)
echo "This is a project that I am working on that I would like help with. There are files that provide information about the intent of the project" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE" # Add a blank line

# --- Directory Tree ---
echo "Directory Tree (tracked files in $EXTENSION_DIR, excluding bugs/):" >> "$OUTPUT_FILE"
echo "------------------------------------------------------------------" >> "$OUTPUT_FILE"

# Use git ls-files for accuracy, then filter out bugs/, then generate tree view
# The pipefail option ensures that if any command in the pipeline fails, the whole pipeline fails
set -o pipefail 
git ls-files "$EXTENSION_DIR" | grep -vE "$BUGS_DIR_PATTERN" | sed -e 's;[^/]*/;|____;g;s;____|; |;g' >> "$OUTPUT_FILE" || {
    echo "Error generating directory tree. Did git ls-files or grep fail?"
    # Optionally, provide a fallback or cleaner error message
    echo "(No directory tree generated)" >> "$OUTPUT_FILE"
}
set +o pipefail # Turn off pipefail after the command

echo "" >> "$OUTPUT_FILE" # Add a blank line

# --- File Contents ---
echo "File Contents (tracked files in $EXTENSION_DIR, excluding bugs/):" >> "$OUTPUT_FILE"
echo "----------------------------------------------------------------" >> "$OUTPUT_FILE"

# Iterate over null-terminated list of tracked files from git ls-files
# Filter out files in the bugs directory
git ls-files -z "$EXTENSION_DIR" | while IFS= read -r -d $'\0' file; do
    # Check if the file path starts with the bugs directory pattern
    if [[ "$file" =~ $BUGS_DIR_PATTERN ]]; then
        continue # Skip this file if it's in the bugs directory
    fi

    # Skip binary/image/font/build files using a regex
    # Add other extensions/patterns as needed
    SKIP_PATTERN='\.(woff2|png|jpe?g|gif|svg|ico|bmp|tiff?|tsbuildinfo)$'
    if [[ "$file" =~ $SKIP_PATTERN ]]; then
        echo "--- Skipping binary/build/font/image file: $file ---" >> "$OUTPUT_FILE"
        continue # Skip this file
    fi

    if [ -f "$file" ]; then # Check if it's actually a file (git ls-files should only list files, but good practice)
        echo "" >> "$OUTPUT_FILE"
        echo "=== File: $file ===" >> "$OUTPUT_FILE"
        # Append file content, handle potential errors during cat
        # Use LC_ALL=C to handle potential non-UTF8 chars gracefully, though it might mangle some
        # Using 'cat' directly might be better if binary data isn't expected after filtering
        LC_ALL=C cat "$file" >> "$OUTPUT_FILE" || echo "Error reading file: $file. Content might be partial or missing."
        echo "" >> "$OUTPUT_FILE"
        echo "=== End File: $file ===" >> "$OUTPUT_FILE"
    fi
done

# --- Add to .gitignore ---
# Check if .gitignore exists, create if not
if [ ! -f "$IGNORE_FILE" ]; then
    echo "Creating .gitignore file..."
    touch "$IGNORE_FILE"
fi

# Check if output file is already ignored
if ! grep -qxF "$OUTPUT_FILE" "$IGNORE_FILE"; then
    echo "Adding $OUTPUT_FILE to .gitignore..."
    echo "$OUTPUT_FILE" >> "$IGNORE_FILE"
fi

echo "Project context successfully generated in $OUTPUT_FILE"

# Get absolute path for the link
ABS_PATH=$(pwd)/"$OUTPUT_FILE"
echo "Open context file: file://${ABS_PATH}"

exit 0 