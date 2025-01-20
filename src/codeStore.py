from pathlib import Path
import os
import sys
import time
import fnmatch
import logging
import customprint  # Import the custom print module
from typing import List, Set, Dict, Optional, Generator
from llama_index.core import Document
import chardet
from gitignore import GitignoreParser  # Import the GitignoreParser from gitignore.py
from embedding_model import init_embedding_model

class CodeDocumentProcessor:
    """Handles reading and processing of code files."""
    
    SUPPORTED_EXTENSIONS = {
        '.py', '.js', '.jsx', '.ts', '.tsx',
        '.html', '.css', '.json', '.yaml', '.yml',
        '.md', '.txt', '.sh', '.bash', '.sql'
    }

    def __init__(self):
        self.errors: List[Dict] = []

    def is_supported_file(self, path: Path) -> bool:
        """Check if a file is supported based on its extension."""
        return path.suffix.lower() in self.SUPPORTED_EXTENSIONS

    def read_file(self, path: Path) -> Optional[str]:
        """
        Read a file with proper encoding detection and error handling.
        
        Args:
            path: Path to the file to read
            
        Returns:
            Optional[str]: File contents if successful, None if failed
        """
        try:
            # First try UTF-8
            try:
                with path.open('r', encoding='utf-8') as f:
                    return f.read()
            except UnicodeDecodeError:
                # If UTF-8 fails, detect encoding
                with path.open('rb') as f:
                    raw_data = f.read()
                    result = chardet.detect(raw_data)
                    encoding = result['encoding']
                    
                if encoding:
                    with path.open('r', encoding=encoding) as f:
                        return f.read()
                else:
                    raise ValueError(f"Could not detect encoding for {path}")

        except Exception as e:
            self.errors.append({
                'path': str(path),
                'error': str(e),
                'type': 'read_error'
            })
            logging.error(f"Error reading file {path}: {e}")
            return None

    def create_document(self, path: Path, content: str, metadata: Dict) -> Document:
        """Create a Document object from file content with metadata."""
        return Document(
            text=content,
            metadata={
                'file_path': str(path),
                'file_type': path.suffix.lower(),
                'file_name': path.name,
                **metadata
            }
        )

class CodeStore:
    """Main class for managing code document storage and processing."""
    
    def __init__(self, project_path: str, store_name: Optional[str] = None):
        self.project_path = Path(project_path).resolve()
        self.store_name = store_name or self.project_path.name
        self.processor = CodeDocumentProcessor()
        self.gitignore = GitignoreParser(self.project_path / '.gitignore')  # Remove log_level argument
        self.docs_processed = 0
        self.errors: List[Dict] = []
        
        # Initialize embedding model
        init_embedding_model()

    def process_project(self, batch_size: int = 100) -> List[Document]:
        """
        Process all files in the project directory.
        
        Args:
            batch_size: Number of documents to process in each batch
            
        Returns:
            List[Document]: List of processed documents
        """
        documents = []
        current_batch = []
        total_files = 0
        processed_files = 0
        
        try:
            print(f"Starting project processing at {self.project_path}")
            
            # First count total files for progress reporting
            for _ in self._iterate_files():
                total_files += 1
            
            print(f"Found {total_files} files to process")
            
            # Now process files
            for file_path in self._iterate_files():
                if self.processor.is_supported_file(file_path):
                    processed_files += 1
                    if processed_files % 100 == 0:  # Progress update every 100 files
                        print(f"Processing file {processed_files}/{total_files}: {file_path.name}")
                    
                    content = self.processor.read_file(file_path)
                    if content is not None:
                        metadata = self._get_file_metadata(file_path)
                        doc = self.processor.create_document(file_path, content, metadata)
                        current_batch.append(doc)
                        
                        if len(current_batch) >= batch_size:
                            documents.extend(current_batch)
                            print(f"Completed batch of {batch_size} documents. Total processed: {len(documents)}")
                            current_batch = []
                            
            if current_batch:
                documents.extend(current_batch)
                
            self.docs_processed = len(documents)
            print(f"Project processing complete. Total documents: {self.docs_processed}")
            return documents
            
        except Exception as e:
            self.errors.append({
                'error': str(e),
                'type': 'process_error'
            })
            print(f"Error processing project: {e}")
            raise

    def process_changed_files(self, last_update_time: float, batch_size: int = 100) -> List[Document]:
        """
        Process only files that have been modified since the last update.
        
        Args:
            last_update_time: Unix timestamp of last update
            batch_size: Number of documents to process in each batch
            
        Returns:
            List[Document]: List of processed documents
        """
        documents = []
        current_batch = []
        total_files = 0
        modified_files = []
        processed_files = 0
        
        try:
            print(f"Looking for files modified since {time.ctime(last_update_time)}")
            
            # First count total files and collect modified files for reporting
            for file_path in self._iterate_files():
                if self._is_file_modified(file_path, last_update_time):
                    total_files += 1
                    modified_files.append(file_path)
            
            if total_files == 0:
                print("No modified files found")
                return []
                
            print(f"Found {total_files} modified files to process")
            print("First 10 modified files:")
            for i, file_path in enumerate(modified_files[:10]):
                print(f"{i+1}. {file_path}")
            
            # Now process modified files
            for file_path in self._iterate_files():
                if self.processor.is_supported_file(file_path) and self._is_file_modified(file_path, last_update_time):
                    processed_files += 1
                    if processed_files % 10 == 0:  # Progress update every 10 files for changed files
                        print(f"Processing modified file {processed_files}/{total_files}: {file_path.name}")
                    
                    content = self.processor.read_file(file_path)
                    if content is not None:
                        metadata = self._get_file_metadata(file_path)
                        doc = self.processor.create_document(file_path, content, metadata)
                        current_batch.append(doc)
                        
                        if len(current_batch) >= batch_size:
                            documents.extend(current_batch)
                            print(f"Completed batch of {batch_size} documents. Total processed: {len(documents)}")
                            current_batch = []
                            
            if current_batch:
                documents.extend(current_batch)
                
            self.docs_processed += len(documents)
            print(f"Modified files processing complete. Total documents: {len(documents)}")
            return documents
            
        except Exception as e:
            self.errors.append({
                'error': str(e),
                'type': 'process_changed_error'
            })
            print(f"Error processing changed files: {e}")
            raise

    def _iterate_files(self) -> Generator[Path, None, None]:
        """Iterate through project files, respecting .gitignore rules."""
        def _scan_directory(directory: Path):
            """Recursively scan directory, checking gitignore at each level."""
            try:
                for path in directory.iterdir():
                    # Check if this path should be ignored
                    if self.gitignore.should_ignore(path, self.project_path):
                        continue
                        
                    if path.is_file():
                        yield path
                    elif path.is_dir():
                        # Recursively traverse non-ignored directories
                        yield from _scan_directory(path)
                        
            except PermissionError:
                # Silently skip permission errors
                pass
            except Exception as e:
                logging.warning(f"Error accessing directory {directory}: {e}")

        try:
            yield from _scan_directory(self.project_path)
        except Exception as e:
            logging.error(f"Error iterating files: {e}")
            raise

    def _get_file_metadata(self, file_path: Path) -> Dict:
        """Get metadata for a file."""
        try:
            stats = file_path.stat()
            return {
                'creation_time': stats.st_ctime,
                'modification_time': stats.st_mtime,
                'size': stats.st_size
            }
        except Exception:
            # Silently return empty dict on errors
            return {}

    def _is_file_modified(self, file_path: Path, last_update_time: float) -> bool:
        """Check if a file has been modified since the last update."""
        try:
            return file_path.stat().st_mtime > last_update_time
        except Exception:
            # Silently return False on errors
            return False

    def get_error_report(self) -> Dict:
        """Get a report of all errors encountered during processing."""
        return {
            'processor_errors': self.processor.errors,
            'store_errors': self.errors,
            'total_documents_processed': self.docs_processed
        }

def setup_logging(log_dir: str = "logs") -> None:
    """Set up logging configuration with both file and console handlers."""
    # Create logs directory if it doesn't exist
    log_dir = Path(log_dir)
    log_dir.mkdir(exist_ok=True)
    
    # Create log file path with timestamp
    log_file = log_dir / f"codestore_{time.strftime('%Y%m%d_%H%M%S')}.log"
    
    # Initialize customprint with the log file
    customprint.makeCustomPrint(str(log_file))
    
    # Now logging will use the custom print function
    logging.basicConfig(
        level=logging.WARNING,  # Change to WARNING to reduce noise
        format='%(message)s',  # Simplify format to just show the message
    )

def test_gitignore():
    """Test function to verify gitignore functionality."""
    print("Testing gitignore functionality...")
    
    project_path = Path(".")
    gitignore = GitignoreParser(project_path / '.gitignore')
    
    # Test some common patterns
    test_paths = [
        "node_modules/package.json",
        "client/node_modules/some-file",
        ".env",
        "dist/output.js",
        "src/main.py",
        "README.md",
        ".git/config",
        "client/.env",
    ]
    
    print("\nTesting path matching:")
    for test_path in test_paths:
        path = project_path / test_path
        ignored = gitignore.should_ignore(path, project_path)
        print(f"Path: {test_path:<30} Ignored: {ignored}")
        
    return gitignore

def main():
    """Main function for testing the CodeStore independently."""
    setup_logging()
    
    # First test gitignore functionality
    print("\nTesting gitignore patterns...")
    gitignore = test_gitignore()
    
    # Then proceed with full processing
    print("\nProcessing project...")
    store = CodeStore(".")
    
    try:
        documents = store.process_project()
        logging.info(f"Processed {len(documents)} documents")
        
        # Print error report
        error_report = store.get_error_report()
        if error_report['processor_errors'] or error_report['store_errors']:
            logging.warning("Errors encountered during processing:")
            logging.warning(error_report)
            
    except Exception as e:
        logging.error(f"Failed to process project: {e}")

if __name__ == "__main__":
    main()