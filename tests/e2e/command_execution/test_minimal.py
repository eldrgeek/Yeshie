import asyncio
import pytest
from playwright.async_api import async_playwright, TimeoutError
import subprocess
import time

async def retry_selector(page, selector, max_attempts=3, timeout=10000):
    """Retry finding a selector multiple times with increasing timeouts."""
    for attempt in range(max_attempts):
        try:
            element = await page.wait_for_selector(selector, timeout=timeout * (attempt + 1))
            if element:
                return element
        except TimeoutError:
            print(f"\nAttempt {attempt + 1} failed to find {selector}, {'retrying...' if attempt < max_attempts - 1 else 'giving up.'}")
            await asyncio.sleep(1)  # Brief pause between retries
    return None

@pytest.mark.asyncio
async def test_yeshie_interaction():
    """Test complete Yeshie workflow including local development and GitHub."""
    
    # Kill all Chrome instances first
    subprocess.run(['pkill', '-f', 'Google Chrome'])
    time.sleep(2)  # Wait for Chrome to fully close
    
    async with async_playwright() as p:
        # Launch Chrome with debugging and extension
        subprocess.Popen([
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '--remote-debugging-port=9222',
            '--load-extension=' + subprocess.check_output(['pwd']).decode().strip() + '/extension/build/chrome-mv3-dev',
            'about:blank'
        ])
        
        # Wait for Chrome to start
        await asyncio.sleep(5)
        
        # Connect to the browser
        browser = await p.chromium.connect_over_cdp('http://localhost:9222')
        print("\nSuccessfully connected to Chrome")
        
        try:
            context = browser.contexts[0]
            page = await context.new_page()
            
            # 1. Check localhost:3000
            print("\nNavigating to localhost:3000...")
            await page.goto('http://localhost:3000', wait_until='networkidle')
            print(f"Current URL: {page.url}")
            
            # Wait for and verify Yeshie icon
            print("\nLooking for Yeshie icon...")
            yeshie_icon = await retry_selector(page, 'img[alt="Yeshie Icon"]')
            if not yeshie_icon:
                raise Exception("Could not find Yeshie icon on localhost:3000")
            print("Found Yeshie icon!")
            
            # Click the icon to open slider
            print("\nClicking Yeshie icon to open slider...")
            await yeshie_icon.click()
            await asyncio.sleep(2)  # Wait for animation
            
            # Verify editor content is visible
            print("\nVerifying editor content...")
            editor_content = await retry_selector(page, '.cm-content')
            if not editor_content:
                raise Exception("Could not find editor content")
            print("Editor content found!")
            
            # Close the slider
            print("\nClosing the slider...")
            await yeshie_icon.click()
            await asyncio.sleep(2)  # Wait for animation
            
            # Navigate to GitHub and verify Yeshie
            print("\nNavigating to GitHub...")
            try:
                await page.goto('https://github.com', wait_until='networkidle', timeout=60000)
                print(f"Current URL: {page.url}")
                
                # Give the extension time to initialize on GitHub
                await asyncio.sleep(5)
                
                # Verify Yeshie on GitHub with retries
                print("\nVerifying Yeshie on GitHub...")
                github_yeshie_icon = await retry_selector(page, 'img[alt="Yeshie Icon"]')
                if not github_yeshie_icon:
                    raise Exception("Could not find Yeshie icon on GitHub")
                print("Found Yeshie icon on GitHub!")
                
            except Exception as e:
                print(f"\nError during GitHub navigation: {e}")
                await page.screenshot(path="github_error.png")
                raise
            
            input("\nTest completed successfully. Press Enter to close the browser...")
            
        except Exception as e:
            print(f"\nError during test: {e}")
            await page.screenshot(path="error_state.png")
            raise
        finally:
            await browser.close()
            # Kill Chrome again to clean up
            subprocess.run(['pkill', '-f', 'Google Chrome']) 