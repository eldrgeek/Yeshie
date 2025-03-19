import asyncio
import pytest
from playwright.async_api import TimeoutError
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
async def test_github_login_flow(yeshie_extension):
    """Test the GitHub login flow using Yeshie's recording capabilities."""
    
    try:
        # Initialize extension
        extension = await yeshie_extension
        
        # Wait for Yeshie icon and open sidebar
        print("\nLooking for Yeshie icon...")
        yeshie_icon = await retry_selector(extension.page, 'img[alt="Yeshie Icon"]')
        if not yeshie_icon:
            raise Exception("Could not find Yeshie icon on GitHub")
        print("Found Yeshie icon!")
        
        # Click the icon to open slider
        print("\nOpening Yeshie sidebar...")
        await yeshie_icon.click()
        await asyncio.sleep(2)  # Wait for animation
        
        # 2. Display instructions to user
        print("\nDisplaying instructions...")
        await extension.execute_command('message "Please follow these steps to log in to GitHub:"')
        await extension.execute_command('message "1. Click Sign in"')
        await extension.execute_command('message "2. Enter your credentials"')
        await extension.execute_command('message "3. Complete any 2FA if required"')
        await extension.execute_command('message "4. Type DONE when finished"')
        
        # 3. Start recording user actions
        print("\nStarting action recording...")
        await extension.execute_command('record start')
        
        # 4. Wait for user to complete login
        print("\nWaiting for user to complete login...")
        while True:
            messages = await extension.get_messages()
            if any(msg.get('text', '').strip().upper() == 'DONE' for msg in messages):
                break
            await asyncio.sleep(1)
        
        # 5. Stop recording and save recipe
        print("\nStopping recording...")
        await extension.execute_command('record stop')
        await extension.execute_command('recipe save "github_login"')
        
        # 6. Verify successful login by checking for avatar
        print("\nVerifying successful login...")
        avatar = await retry_selector(extension.page, 'img.avatar')
        if not avatar:
            raise Exception("Could not find user avatar - login may have failed")
        print("Found user avatar - login successful!")
        
        # 7. Log out to clean up
        print("\nLogging out...")
        await extension.page.click('summary[aria-label="View profile and more"]')
        await extension.page.click('button:has-text("Sign out")')
        
        print("\nTest completed successfully!")
        
    except Exception as e:
        print(f"\nError during test: {e}")
        await extension.page.screenshot(path="error_state.png")
        raise 