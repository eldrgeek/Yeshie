import os
import json
from pathlib import Path
from llama_index.core import Document
import vectorstore
import customprint
import fnmatch

class CodeStore:
    def __init__(self, project_path, store_name=None, vector_store_manager=None):
        print("start")
        self.project_path = Path(project_path)
        self.store_name = store_name or self.project_path.name
        self.vector_store_manager = vector_store_manager or vectorstore.getManager()
        self.file_tracker_path = None
        self.docs_processed = 0
        self.ignored = None
        self.project_path = Path("./extension")
        self._get_new_or_modified_documents()
        exit(0)
        self.update_store()

    def update_store(self):
        index = self.vector_store_manager.add_vector_store(self.store_name, "basic")
        store_path = self.vector_store_manager.get_store_path(self.store_name)
        self.file_tracker_path = store_path / "file_tracker.json"
        documents = self._get_new_or_modified_documents()
        if documents:
            self.vector_store_manager.update_vector_store(self.store_name, documents)
            self.docs_processed = len(documents)
        else:
            self.docs_processed = 0
        print(f"Updated {self.docs_processed} documents in the store.")

    def reset_docs_processed(self):
        self.docs_processed = 0

    def _get_new_or_modified_documents(self):
        new_or_modified_docs = []
        file_tracker = self._load_file_tracker()
        
        for file_path in self.project_path.rglob('*'):
            if file_path.is_file() and not self._is_ignored(file_path):
                last_modified = os.path.getmtime(file_path)
                relative_path = file_path.relative_to(self.project_path)
                if relative_path.as_posix().startswith(".git/"):
                    continue
                if relative_path.suffix not in {'.py', '.ts', '.tsx', '.txt', '.json', '.sh'}:
                    continue
                if str(relative_path) not in file_tracker or file_tracker[str(relative_path)] < last_modified:
                    print(relative_path)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        doc = Document(
                            text=content,
                            metadata=self._get_file_metadata(file_path, last_modified)
                        )
                        new_or_modified_docs.append(doc)
                        file_tracker[str(relative_path)] = last_modified
                        print(f"Added/Updated: {relative_path}")
                    except Exception as e:
                        print(f"Error processing file {file_path}: {e}")
        self._save_file_tracker(file_tracker)
        return new_or_modified_docs

    def _get_file_metadata(self, file_path, last_modified):
        return {
            "file_path": str(file_path.relative_to(self.project_path)),
            "creation_time": os.path.getctime(file_path),
            "last_modified_time": last_modified
        }

    def _is_ignored(self, path):
        if self.ignored is None:
            gitignore_path = self.project_path / '.gitignore'
            if gitignore_path.exists():
                with open(gitignore_path, 'r') as f:
                    self.ignored = [line.strip() for line in f if line.strip() and not line.startswith('#')]
                    print(self.ignored)
        path_obj = Path(path)
        for pattern in self.ignored:
            if pattern.endswith('/'):
                if path_obj.is_dir() and (path_obj.match(pattern) or any(parent.match(pattern) for parent in path_obj.parents)):
                    print("ignore dir", path)
                    return True
            elif path_obj.match(pattern) or any(parent.match(pattern) for parent in path_obj.parents):
                print("ignore file", path)
                return True
        return False

    def _load_file_tracker(self):
        if self.file_tracker_path and self.file_tracker_path.exists():
            with open(self.file_tracker_path, 'r') as f:
                return json.load(f)
        return {}

    def _save_file_tracker(self, tracker):
        if self.file_tracker_path:
            with open(self.file_tracker_path, 'w') as f:
                json.dump(tracker, f)


def parse_gitignore(gitignore_path):
    """
    Parse the .gitignore file and return a list of ignore patterns.
    """
    ignore_patterns = []
    try:
        with open(gitignore_path, 'r') as file:
            for line in file:
                line = line.strip()
                if line and not line.startswith('#'):
                    ignore_patterns.append(line)
    except FileNotFoundError:
        print(f"Warning: .gitignore file not found at {gitignore_path}")
    return ignore_patterns

def should_ignore(file_path, ignore_patterns):
    """
    Check if a file should be ignored based on the ignore patterns.
    """
    for pattern in ignore_patterns:
        if pattern.endswith('/'):
            # Directory pattern
            if os.path.isdir(file_path) and fnmatch.fnmatch(file_path, f"*{pattern}*"):
                return True
        elif fnmatch.fnmatch(os.path.basename(file_path), pattern):
            return True
    return False

def get_ignored_files(directory, ignore_patterns):
    """
    Get a list of files that should be ignored based on the .gitignore file.
    """
    ignored_files = []
    returned_files = []

    for root, dirs, files in os.walk(directory):
        for file in files + dirs:
            file_path = os.path.join(root, file)
            if should_ignore(file_path, ignore_patterns):
                ignored_files.append(file_path)
        returned_files.append(file_path)

    return [ignored_files,returned_files]

# Example usage
if __name__ == "__main__":
    gitignore_path = '.gitignore'
    ignore_patterns = parse_gitignore(gitignore_path)

    [ignored_files, returned_files] = get_ignored_files(".", ignore_patterns)

    print("Files ignored by .gitignore:")
    for file in ignored_files:
        print(file)
# Example usage and testing
if __name__ == "__main__":
    gitignore_path = '.gitignore'
    patterns = parse_gitignore(gitignore_path)
    print("Gitignore patterns:")
    for pattern, is_exclude in patterns:
        print(f"{'Exclude' if is_exclude else 'Include'}: {pattern}")

    print("\nTesting actual files in the directory:")
    actual_files = list(Path('.').rglob('*'))[:20]  # Limit to first 20 files
    for file in actual_files:
        # status = 'Ignored' if is_ignored(file, gitignore_path) else 'Kept'
        # print(f"{file}: {status}")
        pass


# if __name__ == "__main__":
#     customprint.makeCustomPrint("out")
#     vectorstore.getManager().remove_vector_store("YeshieCode")
#     code_store = CodeStore(".", store_name="YeshieCode", vector_store_manager=vectorstore.getManager())
    
#     print("Store update complete.")