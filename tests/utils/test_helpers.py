import time
import asyncio
from typing import Any

async def wait_for_element(extension: Any, selector: str, timeout: int = 10) -> bool:
    """
    Wait for an element to appear on the page.
    
    Args:
        extension: The Yeshie extension instance
        selector: CSS selector for the element
        timeout: Maximum time to wait in seconds
        
    Returns:
        bool: True if element was found, False if timeout occurred
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        result = await extension.execute_command(f'waitforelement {selector} 1000')
        if isinstance(result, str) and 'Element appeared' in result:
            return True
        await asyncio.sleep(0.5)
    return False

async def wait_for_network_idle(extension: Any, timeout: int = 10) -> bool:
    """
    Wait for network activity to become idle.
    
    Args:
        extension: The Yeshie extension instance
        timeout: Maximum time to wait in seconds
        
    Returns:
        bool: True if network became idle, False if timeout occurred
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        result = await extension.execute_command('waitfornetwork 1000')
        if isinstance(result, str) and 'Network idle' in result:
            return True
        await asyncio.sleep(0.5)
    return False

async def wait_for_text(extension: Any, selector: str, text: str, timeout: int = 10) -> bool:
    """
    Wait for an element with specific text to appear.
    
    Args:
        extension: The Yeshie extension instance
        selector: CSS selector for the element
        text: Text to wait for
        timeout: Maximum time to wait in seconds
        
    Returns:
        bool: True if element with text was found, False if timeout occurred
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        elements = await extension.execute_command(f'waitforelement {selector} 1000')
        if isinstance(elements, str) and 'Element appeared' in elements:
            content = await extension.execute_command(f'getattribute {selector} textContent')
            if isinstance(content, str) and text in content:
                return True
        await asyncio.sleep(0.5)
    return False 