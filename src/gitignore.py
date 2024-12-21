# gitignore_handler.py

from pathlib import Path
import os
import fnmatch
import logging
import shutil
from typing import List, Dict, Optional, Union, Tuple

class GitignoreParser:
    """Handles parsing and matching of .gitignore patterns."""
    
    def __init__(self, gitignore_path: Union[str, Path]):
        self.gitignore_path = Path(gitignore_path)
        self.patterns: List[str] = []
        self.negation_patterns: List[str] = []
        self._load_patterns(self.gitignore_path)

    def _load_patterns(self, gitignore_path: Path) -> None:
        """Load patterns from .gitignore file."""
        if not gitignore_path.exists():
            logging.error(f".gitignore not found at {gitignore_path}")
            return

        try:
            with gitignore_path.open('r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if line.startswith('!'):
                            pattern = line[1:]
                            self.negation_patterns.append(pattern)
                            logging.debug(f"Added negation pattern: {pattern}")
                        else:
                            self.patterns.append(line)
                            logging.debug(f"Added ignore pattern: {line}")
            logging.info(f"Loaded {len(self.patterns)} ignore patterns and {len(self.negation_patterns)} negation patterns")
        except Exception as e:
            logging.error(f"Error reading .gitignore: {e}")
            raise

    def _normalize_path(self, path: str) -> str:
        """Normalize a path for matching."""
        # Convert Windows path separators to Unix style
        return path.replace(os.sep, '/')

    def _match_pattern(self, path: str, pattern: str) -> bool:
        """Match a single pattern against a path."""
        if pattern.endswith('/'):
            pattern = pattern[:-1]
            if not path.endswith('/'):
                path = path + '/'

        # Handle patterns that start with /
        if pattern.startswith('/'):
            pattern = pattern[1:]
            return fnmatch.fnmatch(path, pattern)

        # Handle patterns with ** (match any directory)
        if '**' in pattern:
            # Convert ** to a regex-style match
            pattern = pattern.replace('**', '*')
            return fnmatch.fnmatch(path, pattern)

        # For standard patterns, try matching at any level
        path_parts = path.split('/')
        pattern_parts = pattern.split('/')
        
        # Try to match the pattern at each level of the path
        for i in range(len(path_parts) - len(pattern_parts) + 1):
            test_path = '/'.join(path_parts[i:i + len(pattern_parts)])
            if fnmatch.fnmatch(test_path, pattern):
                return True
                
        return False

    def should_ignore(self, path: Union[str, Path], relative_to: Optional[Union[str, Path]] = None) -> bool:
        """Determine if a path should be ignored based on .gitignore patterns."""
        try:
            path = Path(path)
            if relative_to:
                relative_to = Path(relative_to)
            else:
                relative_to = self.gitignore_path.parent
                
            relative_path = str(path.relative_to(relative_to))
            relative_path = self._normalize_path(relative_path)
            is_dir = path.is_dir() if path.exists() else False
            
            if is_dir and not relative_path.endswith('/'):
                relative_path += '/'

            # Check negation patterns first
            for pattern in self.negation_patterns:
                if self._match_pattern(relative_path, pattern):
                    logging.debug(f"Path {relative_path} matched negation pattern {pattern}, including")
                    return False

            # Then check ignore patterns
            for pattern in self.patterns:
                if self._match_pattern(relative_path, pattern):
                    logging.debug(f"Path {relative_path} matched ignore pattern {pattern}, ignoring")
                    return True

            return False

        except Exception as e:
            logging.error(f"Error checking ignore status for {path}: {e}")
            return False

def setup_test_environment() -> Tuple[Path, Path]:
    """Set up a test environment with a .gitignore file."""
    test_dir = Path("test_gitignore")
    
    # Clean up existing test directory if it exists
    if test_dir.exists():
        try:
            shutil.rmtree(test_dir)
        except Exception as e:
            logging.warning(f"Could not clean up existing test directory: {e}")
    
    # Create fresh test directory
    test_dir.mkdir(exist_ok=True)
    
    gitignore_content = """
# Node modules
node_modules/
**/node_modules/

# Environment files
.env
**/.env

# Build outputs
dist/
build/

# Python cache
__pycache__/
*.pyc

# Exceptions
!important.env
!dist/keep.txt
"""
    
    gitignore_path = test_dir / ".gitignore"
    gitignore_path.write_text(gitignore_content)
    
    return test_dir, gitignore_path

def run_gitignore_tests(gitignore: GitignoreParser, test_dir: Path) -> None:
    """Run comprehensive tests on the GitignoreParser."""
    test_cases = [
        # Should be ignored
        ("node_modules", True),
        ("node_modules/package.json", True),
        ("frontend/node_modules/index.js", True),
        (".env", True),
        ("config/.env", True),
        ("dist/output.js", True),
        ("build/index.html", True),
        ("__pycache__/cache.pyc", True),
        ("src/__pycache__/utils.pyc", True),
        ("app.pyc", True),
        ("node_modules", True),
        ("dist", True),
        
        # Should not be ignored
        ("src/main.py", False),
        ("important.env", False),
        ("dist/keep.txt", False),
        ("README.md", False),
        ("docs/guide.md", False)
    ]
    
    failed_tests = []
    
    # Run tests
    for test_case in test_cases:
        test_path, should_ignore = test_case
        path = test_dir / test_path
        
        try:
            # Create parent directories if needed
            if not path.parent.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
            
            # Create an empty file or directory
            if test_path.endswith('/') or any(test_path.startswith(d) for d in ['node_modules', 'dist', 'build', '__pycache__']):
                if not path.exists():
                    path.mkdir(parents=True, exist_ok=True)
            else:
                if not path.exists():
                    path.touch()

            actual_ignore = gitignore.should_ignore(path, test_dir)
            
            if actual_ignore != should_ignore:
                failed_tests.append({
                    'path': test_path,
                    'expected': should_ignore,
                    'actual': actual_ignore
                })
                logging.error(f"Test failed for {test_path}: expected {should_ignore}, got {actual_ignore}")
                
        except Exception as e:
            logging.error(f"Error testing path {test_path}: {e}")
            failed_tests.append({
                'path': test_path,
                'error': str(e)
            })
    
    if failed_tests:
        error_msg = "\n".join([
            f"- {test['path']}: expected {test.get('expected', 'success')} but got {test.get('actual', 'error: ' + test.get('error', 'unknown'))}"
            for test in failed_tests
        ])
        raise AssertionError(f"GitignoreParser tests failed:\n{error_msg}")
    
    logging.info("All gitignore tests passed successfully!")

def cleanup_test_environment(test_dir: Path) -> None:
    """Clean up the test environment."""
    try:
        shutil.rmtree(test_dir)
    except Exception as e:
        logging.error(f"Error cleaning up test directory: {e}")

def main():
    """Main function for running standalone tests."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logging.info("Starting GitignoreParser tests...")
    
    test_dir = None
    try:
        test_dir, gitignore_path = setup_test_environment()
        gitignore = GitignoreParser(gitignore_path)
        run_gitignore_tests(gitignore, test_dir)
    finally:
        if test_dir and test_dir.exists():
            cleanup_test_environment(test_dir)

if __name__ == "__main__":
    main()
