"""
Environment file handler for monitor.py

This module provides functionality to update .env files based on commands from the client.
"""
import os
import json
from pathlib import Path

def update_env_file(content, env_path=None):
    """
    Update the .env file with the provided content.
    
    Args:
        content (str): The env variable content to write to the file
        env_path (str, optional): Path to the .env file. If None, defaults to client/.env
        
    Returns:
        dict: Result of the operation
    """
    try:
        # Default to client/.env if no path is provided
        if env_path is None:
            # Get the project root directory (where monitor.py is run from)
            root_dir = Path(os.getcwd())
            env_path = root_dir / "client" / ".env"
        else:
            env_path = Path(env_path)
            
        # Make sure the directory exists
        env_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Handle escaped newlines
        processed_content = content.replace('\\n', '\n')
        
        # Check if file exists and read its content
        if env_path.exists():
            with open(env_path, 'r') as f:
                existing_content = f.read()
                
            # Parse existing variables to avoid duplicating them
            existing_vars = {}
            for line in existing_content.split('\n'):
                if '=' in line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    existing_vars[key.strip()] = value.strip()
                    
            # Parse new variables
            new_vars = {}
            for line in processed_content.split('\n'):
                if '=' in line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    new_vars[key.strip()] = value.strip()
                    
            # Merge variables, with new ones taking precedence
            merged_vars = {**existing_vars, **new_vars}
            
            # Create updated content
            updated_content = '\n'.join(f"{key}={value}" for key, value in merged_vars.items())
        else:
            updated_content = processed_content
            
        # Write the updated content to the file
        with open(env_path, 'w') as f:
            f.write(updated_content)
            
        return {
            "success": True,
            "message": f"Successfully updated {env_path}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to update .env file: {str(e)}"
        }

def handle_update_env_command(data):
    """
    Handler for the update_env command received from client
    
    Args:
        data (dict): Command data containing 'content' field
        
    Returns:
        dict: Result of the operation
    """
    content = data.get('content', '')
    env_path = data.get('path', None)
    
    if not content:
        return {
            "success": False,
            "message": "No content provided to update .env file"
        }
        
    return update_env_file(content, env_path) 