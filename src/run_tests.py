#!/usr/bin/env python3
"""
Test runner script for Python tests
"""
import unittest
import sys
from pathlib import Path

def run_tests():
    """Run all tests in the tests directory"""
    # Get the directory containing this script
    src_dir = Path(__file__).parent
    
    # Find the tests directory
    tests_dir = src_dir / 'tests'
    
    # Discover and run tests
    loader = unittest.TestLoader()
    suite = loader.discover(str(tests_dir))
    
    # Run tests with verbosity
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Return exit code based on test success
    return 0 if result.wasSuccessful() else 1

if __name__ == '__main__':
    sys.exit(run_tests()) 