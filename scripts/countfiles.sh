#!/bin/bash

# Function to check if a file is ignored
is_ignored() {
    local file="$1"
    local ignore_file="$2"
    
    if [ ! -f "$ignore_file" ]; then
        return 1
    fi
    
    while IFS= read -r pattern; do
        # Ignore comments and empty lines
        [[ "$pattern" =~ ^# ]] && continue
        [ -z "$pattern" ] && continue
        
        # Remove leading slash if present
        pattern="${pattern#/}"
        
        # Check if the file matches the pattern
        if [[ "$file" == $pattern ]] || [[ "$file" == *"/$pattern" ]] || [[ "$file" == $pattern/* ]]; then
            return 0
        fi
    done < "$ignore_file"
    
    return 1
}

echo "Analyzing project files..."

# Count all files
total_files=$(find . -type f | wc -l)
echo "Total files in project: $total_files"

# Count files not ignored by .gcloudignore
gcloud_files=0
docker_files=0
included_files=0

while IFS= read -r -d '' file; do
    rel_file="${file#./}"
    if ! is_ignored "$rel_file" ".gcloudignore"; then
        ((gcloud_files++))
    fi
    if ! is_ignored "$rel_file" ".dockerignore"; then
        ((docker_files++))
    fi
    if ! is_ignored "$rel_file" ".gcloudignore" && ! is_ignored "$rel_file" ".dockerignore"; then
        ((included_files++))
        echo "$rel_file" >> included_files.txt
    fi
done < <(find . -type f -print0)

echo "Files not ignored by .gcloudignore: $gcloud_files"
echo "Files not ignored by .dockerignore: $docker_files"
echo "Files included in both (potential deployment files): $included_files"

echo -e "\nTop directories by included file count:"
cat included_files.txt | awk -F'/' '{print $2}' | sort | uniq -c | sort -rn | head -n 10

echo -e "\nFile types breakdown of included files:"
cat included_files.txt | awk -F'.' '{print $NF}' | sort | uniq -c | sort -rn | head -n 10

echo -e "\nContent of .gcloudignore:"
cat .gcloudignore 2>/dev/null || echo ".gcloudignore not found"

echo -e "\nContent of .dockerignore:"
cat .dockerignore 2>/dev/null || echo ".dockerignore not found"

# Cleanup
rm included_files.txt