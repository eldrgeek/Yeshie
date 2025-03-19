import pytest
import logging
import tempfile
import subprocess
import time
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, Browser, Page, BrowserContext
from typing import List, Dict, Any, AsyncGenerator
import json
import os
import sys

logger = logging.getLogger(__name__)

def pytest_addoption(parser):
    """Add custom command line options to pytest."""
    parser.addoption(
        "--keep-browser",
        action="store_true",
        default=False,
        help="Keep browser open after test completion for debugging"
    )

@pytest.fixture(autouse=True)
def flush_print_output():
    """Ensure print output is flushed immediately during tests."""
    # Store original print function
    original_print = print
    
    def flush_print(*args, **kwargs):
        # Call original print
        original_print(*args, **kwargs)
        # Force flush stdout
        sys.stdout.flush()
    
    # Replace print with our version
    import builtins
    builtins.print = flush_print
    
    yield
    
    # Restore original print
    builtins.print = original_print

@pytest.fixture
def keep_browser(request):
    """Fixture to check if browser should be kept open."""
    return request.config.getoption("--keep-browser")

# Get the absolute path to the extension
EXTENSION_PATH = str(Path(__file__).parent.parent / "extension" / "build" / "chrome-mv3-dev")

# Configure asyncio for pytest
pytest_plugins = ["pytest_asyncio"]

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
def chrome_process(request):
    """Start Chrome with remote debugging and our extension loaded."""
    user_data_dir = tempfile.mkdtemp()
    port = 9222
    
    # Kill any existing Chrome instances
    subprocess.run(['pkill', '-f', 'Google Chrome'])
    time.sleep(2)  # Wait for Chrome to fully close
    
    # Construct Chrome command
    cmd = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        f"--load-extension={EXTENSION_PATH}",
        "--no-first-run",
        "--no-default-browser-check",
        "--start-maximized"
    ]
    
    # Start Chrome process
    process = subprocess.Popen(cmd)
    
    # Give Chrome time to start
    time.sleep(2)
    
    yield process
    
    # Only cleanup if keep_browser is not set
    if not request.config.getoption("--keep-browser", False):
        process.terminate()
        process.wait()
        subprocess.run(['pkill', '-f', 'Google Chrome'])

@pytest.fixture(scope="session")
async def browser(chrome_process) -> AsyncGenerator[Browser, None]:
    """Connect to the running Chrome instance."""
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        yield browser
        await browser.close()

@pytest.fixture
async def context(browser) -> AsyncGenerator[BrowserContext, None]:
    """Create a new browser context."""
    async for b in browser:
        context = await b.new_context()
        yield context
        await context.close()

@pytest.fixture
async def page(context) -> AsyncGenerator[Page, None]:
    """Create a new page in the context."""
    async for c in context:
        page = await c.new_page()
        yield page
        await page.close()

class YeshieExtension:
    """Real Yeshie extension interface for testing."""
    
    def __init__(self, page: Page):
        self.page = page
        self.messages = []
        
    async def execute_command(self, command: str) -> str:
        """Execute a command through the Yeshie extension."""
        # Wait for Stepper to be available
        await self.page.wait_for_function('window.Stepper !== undefined')
        
        # Inject the command into the page's JavaScript context
        result = await self.page.evaluate(f'''
            async () => {{
                try {{
                    const result = await window.Stepper('{command}');
                    return result;
                }} catch (error) {{
                    return `Error: ${{error.message}}`;
                }}
            }}
        ''')
        return result
        
    async def get_messages(self) -> List[Dict[str, Any]]:
        """Get messages from the Yeshie editor."""
        # Get messages from the page's JavaScript context
        messages = await self.page.evaluate('''
            () => {
                const editorElement = document.querySelector('.yeshie-editor');
                if (!editorElement) return [];
                
                // Access messages through the editor's data attributes
                const messagesAttr = editorElement.getAttribute('data-messages');
                return messagesAttr ? JSON.parse(messagesAttr) : [];
            }
        ''')
        return messages

@pytest.fixture
async def yeshie_extension(page) -> YeshieExtension:
    """Provide a real Yeshie extension instance connected to the page."""
    async for p in page:
        extension = YeshieExtension(p)
        # Navigate to a page where we can use the extension
        await p.goto('https://github.com')
        # Wait for the extension to be ready
        await p.wait_for_selector('#plasmo-google-sidebar')
        return extension 