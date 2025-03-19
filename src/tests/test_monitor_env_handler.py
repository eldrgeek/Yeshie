import unittest
import os
import sys
import tempfile
from pathlib import Path

# Add the src directory to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

import monitor_env_handler

class TestMonitorEnvHandler(unittest.TestCase):
    
    def setUp(self):
        # Create a temporary directory for test files
        self.test_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.test_dir.name)
    
    def tearDown(self):
        # Clean up the temporary directory
        self.test_dir.cleanup()
    
    def test_update_env_file_create_new(self):
        """Test creating a new .env file when it doesn't exist"""
        env_path = self.temp_path / ".env"
        
        # Ensure file doesn't exist yet
        self.assertFalse(env_path.exists())
        
        # Test content
        content = "TEST_KEY=test_value\nAPI_KEY=abc123"
        
        # Update the env file
        result = monitor_env_handler.update_env_file(content, str(env_path))
        
        # Check result
        self.assertTrue(result["success"])
        
        # Verify file was created
        self.assertTrue(env_path.exists())
        
        # Verify content
        with open(env_path, 'r') as f:
            file_content = f.read()
        
        self.assertEqual(file_content, content)
    
    def test_update_env_file_update_existing(self):
        """Test updating an existing .env file"""
        env_path = self.temp_path / ".env"
        
        # Create an existing file
        existing_content = "EXISTING_KEY=existing_value\nTEST_KEY=old_value"
        env_path.write_text(existing_content)
        
        # New content to merge
        new_content = "TEST_KEY=new_value\nNEW_KEY=new_value"
        
        # Update the env file
        result = monitor_env_handler.update_env_file(new_content, str(env_path))
        
        # Check result
        self.assertTrue(result["success"])
        
        # Verify file still exists
        self.assertTrue(env_path.exists())
        
        # Verify content is merged correctly
        with open(env_path, 'r') as f:
            file_content = f.read()
        
        # Check that existing key remains, TEST_KEY is updated, and NEW_KEY is added
        self.assertIn("EXISTING_KEY=existing_value", file_content)
        self.assertIn("TEST_KEY=new_value", file_content)
        self.assertIn("NEW_KEY=new_value", file_content)
        self.assertNotIn("TEST_KEY=old_value", file_content)  # Old value should be gone
    
    def test_handle_escaped_newlines(self):
        """Test handling escaped newlines in content"""
        env_path = self.temp_path / ".env"
        
        # Content with escaped newlines
        content = "KEY1=value1\\nKEY2=value2\\nKEY3=value3"
        
        # Update the env file
        result = monitor_env_handler.update_env_file(content, str(env_path))
        
        # Check result
        self.assertTrue(result["success"])
        
        # Verify content has proper newlines
        with open(env_path, 'r') as f:
            file_content = f.read()
        
        expected_content = "KEY1=value1\nKEY2=value2\nKEY3=value3"
        self.assertEqual(file_content, expected_content)
    
    def test_handle_update_env_command(self):
        """Test the handle_update_env_command function"""
        env_path = self.temp_path / ".env"
        
        # Test data
        data = {
            "content": "COMMAND_KEY=command_value",
            "path": str(env_path)
        }
        
        # Handle the command
        result = monitor_env_handler.handle_update_env_command(data)
        
        # Check result
        self.assertTrue(result["success"])
        
        # Verify file was created with correct content
        with open(env_path, 'r') as f:
            file_content = f.read()
        
        self.assertEqual(file_content, "COMMAND_KEY=command_value")
    
    def test_handle_update_env_command_no_content(self):
        """Test handling empty content in command"""
        # Test data with no content
        data = {
            "content": "",
            "path": str(self.temp_path / ".env")
        }
        
        # Handle the command
        result = monitor_env_handler.handle_update_env_command(data)
        
        # Check result
        self.assertFalse(result["success"])
        self.assertIn("No content provided", result["message"])

if __name__ == '__main__':
    unittest.main() 