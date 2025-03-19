import pytest
import logging
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright, Browser, Page, BrowserContext

logger = logging.getLogger(__name__)

# Get the absolute path to the extension
EXTENSION_PATH = str(Path(__file__).parent.parent.parent / "extension" / "build" / "chrome-mv3-dev")

@pytest.fixture(scope="function")
async def temp_dir():
    """Create a temporary directory for the test."""
    temp_dir = Path(tempfile.mkdtemp())
    logger.info(f"Created temporary directory: {temp_dir}")
    yield temp_dir
    if temp_dir.exists():
        import shutil
        shutil.rmtree(temp_dir)
        logger.info("Removed temporary directory")

@pytest.fixture(scope="module")
async def playwright():
    """Fixture that provides a Playwright instance."""
    async with async_playwright() as playwright:
        yield playwright

@pytest.fixture(scope="module")
async def browser(playwright):
    """Fixture that connects to an existing Chrome instance."""
    # Connect to the Chrome instance with remote debugging enabled
    browser = await playwright.chromium.connect_over_cdp("http://localhost:9222")
    yield browser
    await browser.close()

@pytest.fixture
async def context(browser):
    """Fixture that provides a browser context."""
    context = await browser.new_context()
    yield context
    await context.close()

@pytest.fixture
async def page(context):
    """Fixture that provides a page."""
    page = await context.new_page()
    yield page
    await page.close() 