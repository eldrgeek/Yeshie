#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
DEFAULT_CONTEXT_TYPE="extension"
CONTEXT_TYPE="${1:-$DEFAULT_CONTEXT_TYPE}" # Default to 'extension' if no arg

OUTPUT_FILE="project_context_${CONTEXT_TYPE}.txt" # Dynamic output file name
EXTENSION_DIR="extension"
CLIENT_DIR="client" # Assuming client directory name
SERVER_DIR="server" # Assuming server directory name
IGNORE_FILE=".gitignore"
BUGS_DIR_PATTERN="^${EXTENSION_DIR}/bugs/" # Regex pattern to match files in bugs dir

# Common skip pattern for binary/build/font/image/db files
# Used in both process_directory_files and process_root_files
UNIVERSAL_SKIP_PATTERN='\.(woff2|png|jpe?g|gif|svg|ico|bmp|tiff?|tsbuildinfo|lock|sum|localstorage|sessionstorage|sqlite|db|bin|exe|dll|o|so|jar|class|pyc|pyo|wasm|DS_Store|zip|tar|gz|rar|7z|pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$'

# Files in the root directory to include for 'extension' and 'full' contexts
# Add other relevant files like package.json, tsconfig.json if they exist and are relevant
ROOT_FILES_FOR_EXTENSION=(
    "README.md"
    ".yeshie-context.md"
    ".cursorrules"
    "package.json"
    "tsconfig.json"
    # Add other specific root files here
)

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

echo "Generating project context (type: $CONTEXT_TYPE) in $OUTPUT_FILE..."

# --- Header ---
echo "Project Context: ${CONTEXT_TYPE}" > "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "This is a project that I am working on that I would like help with. There are files that provide information about the intent of the project" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# --- Helper Functions ---

# Function to generate directory tree for a given directory
generate_tree() {
    local target_dir="$1"
    local dir_label="$2"
    local exclude_pattern="$3" # Optional: regex pattern to exclude

    if [ ! -d "$target_dir" ]; then
        echo "Directory $target_dir not found. Skipping tree generation." >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        return
    fi

    echo "Directory Tree ($dir_label):" >> "$OUTPUT_FILE"
    echo "------------------------------------------------------------------" >> "$OUTPUT_FILE"
    set -o pipefail
    if [ -n "$exclude_pattern" ]; then
        git ls-files "$target_dir" | grep -vE "$exclude_pattern" | sed -e 's;[^/]*/;|____;g;s;____|; |;g' >> "$OUTPUT_FILE" || {
            echo "Error generating directory tree for $target_dir. (Excluding $exclude_pattern)"
            echo "(No directory tree generated for $target_dir)" >> "$OUTPUT_FILE"
        }
    else
        git ls-files "$target_dir" | sed -e 's;[^/]*/;|____;g;s;____|; |;g' >> "$OUTPUT_FILE" || {
            echo "Error generating directory tree for $target_dir."
            echo "(No directory tree generated for $target_dir)" >> "$OUTPUT_FILE"
        }
    fi
    set +o pipefail
    echo "" >> "$OUTPUT_FILE"
}

# Function to process and append file contents from a given directory
process_directory_files() {
    local target_dir="$1"
    local dir_label="$2"
    local exclude_pattern="$3" # Optional: regex pattern to exclude for this directory

    if [ ! -d "$target_dir" ]; then
        echo "Directory $target_dir not found. Skipping file contents." >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        return
    fi

    echo "File Contents ($dir_label):" >> "$OUTPUT_FILE"
    echo "----------------------------------------------------------------" >> "$OUTPUT_FILE"

    git ls-files -z "$target_dir" | while IFS= read -r -d $'\0' file; do
        if [ -n "$exclude_pattern" ] && [[ "$file" =~ $exclude_pattern ]]; then
            continue # Skip this file if it matches the exclude pattern
        fi

        # Use UNIVERSAL_SKIP_PATTERN
        if [[ "$file" =~ $UNIVERSAL_SKIP_PATTERN ]]; then
            echo "--- Skipping (binary/build/font/image/db etc.): $file ---" >> "$OUTPUT_FILE"
            continue
        fi

        if [ -f "$file" ]; then
            echo "" >> "$OUTPUT_FILE"
            echo "=== File: $file ===" >> "$OUTPUT_FILE"
            LC_ALL=C cat "$file" >> "$OUTPUT_FILE" || echo "Error reading file: $file. Content might be partial or missing."
            echo "" >> "$OUTPUT_FILE"
            echo "=== End File: $file ===" >> "$OUTPUT_FILE"
        fi
    done
    echo "" >> "$OUTPUT_FILE"
}

# Function to process and append specified root files
process_root_files() {
    echo "File Contents (Relevant Root Directory Files):" >> "$OUTPUT_FILE"
    echo "-----------------------------------------------" >> "$OUTPUT_FILE"

    for f_pattern in "${ROOT_FILES_FOR_EXTENSION[@]}"; do
        # Using find to handle cases where a file might not exist without erroring out
        find . -maxdepth 1 -type f -name "$f_pattern" -print0 | while IFS= read -r -d $'\0' file; do
            if [ -f "$file" ]; then # Ensure it's a file
                display_file="${file#./}"

                # Apply UNIVERSAL_SKIP_PATTERN to root files as well
                if [[ "$display_file" =~ $UNIVERSAL_SKIP_PATTERN ]]; then
                    echo "--- Skipping (binary/build/font/image/db etc.) root file: $display_file ---" >> "$OUTPUT_FILE"
                    continue
                fi

                echo "" >> "$OUTPUT_FILE"
                echo "=== File: $display_file ===" >> "$OUTPUT_FILE"
                LC_ALL=C cat "$file" >> "$OUTPUT_FILE" || echo "Error reading file: $display_file. Content might be partial or missing."
                echo "" >> "$OUTPUT_FILE"
                echo "=== End File: $display_file ===" >> "$OUTPUT_FILE"
            fi
        done
    done
    echo "" >> "$OUTPUT_FILE"
}

# --- Main Logic based on CONTEXT_TYPE ---
case "$CONTEXT_TYPE" in
    extension)
        generate_tree "$EXTENSION_DIR" "$EXTENSION_DIR, excluding bugs/" "$BUGS_DIR_PATTERN"
        process_directory_files "$EXTENSION_DIR" "$EXTENSION_DIR, excluding bugs/" "$BUGS_DIR_PATTERN"
        process_root_files # Include relevant root files for extension
        ;;
    client)
        if [ -d "$CLIENT_DIR" ]; then
            generate_tree "$CLIENT_DIR" "$CLIENT_DIR"
            process_directory_files "$CLIENT_DIR" "$CLIENT_DIR"
        else
            echo "Client directory '$CLIENT_DIR' not found. Skipping." >> "$OUTPUT_FILE"
        fi
        # Optionally add specific root files for client if needed
        ;;
    server)
        if [ -d "$SERVER_DIR" ]; then
            generate_tree "$SERVER_DIR" "$SERVER_DIR"
            process_directory_files "$SERVER_DIR" "$SERVER_DIR"
        else
            echo "Server directory '$SERVER_DIR' not found. Skipping." >> "$OUTPUT_FILE"
        fi
        # Optionally add specific root files for server if needed
        ;;
    full)
        generate_tree "$EXTENSION_DIR" "$EXTENSION_DIR, excluding bugs/" "$BUGS_DIR_PATTERN"
        process_directory_files "$EXTENSION_DIR" "$EXTENSION_DIR, excluding bugs/" "$BUGS_DIR_PATTERN"
        
        if [ -d "$CLIENT_DIR" ]; then
            generate_tree "$CLIENT_DIR" "$CLIENT_DIR"
            process_directory_files "$CLIENT_DIR" "$CLIENT_DIR"
        else
            echo "Client directory '$CLIENT_DIR' not found. Skipping for 'full' context." >> "$OUTPUT_FILE"
        fi

        if [ -d "$SERVER_DIR" ]; then
            generate_tree "$SERVER_DIR" "$SERVER_DIR"
            process_directory_files "$SERVER_DIR" "$SERVER_DIR"
        else
            echo "Server directory '$SERVER_DIR' not found. Skipping for 'full' context." >> "$OUTPUT_FILE"
        fi
        
        process_root_files # Include relevant root files for full
        ;;
    *)
        echo "Error: Invalid context type '$CONTEXT_TYPE'. Supported types: extension, client, server, full."
        exit 1
        ;;
esac

# --- Add to .gitignore ---
# Check if .gitignore exists, create if not
if [ ! -f "$IGNORE_FILE" ]; then
    echo "Creating .gitignore file..."
    touch "$IGNORE_FILE"
fi

# Use a pattern to ignore all potential output files
OUTPUT_FILE_PATTERN="project_context_*.txt"
if ! grep -qxF "$OUTPUT_FILE_PATTERN" "$IGNORE_FILE"; then
    echo "Adding $OUTPUT_FILE_PATTERN to .gitignore..."
    # Add pattern if not exactly present. If a more specific one was there, this is okay.
    echo "$OUTPUT_FILE_PATTERN" >> "$IGNORE_FILE"
fi

echo "Project context (type: $CONTEXT_TYPE) successfully generated in $OUTPUT_FILE"

# Get absolute path for the link
ABS_PATH=$(pwd)/"$OUTPUT_FILE"
echo "Open context file: file://${ABS_PATH}"

exit 0 