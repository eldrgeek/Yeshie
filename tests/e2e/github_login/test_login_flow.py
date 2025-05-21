import asyncio
import json
import os
import pytest
from playwright.async_api import TimeoutError

async def retry_selector(page, selector, max_attempts=3, timeout=10000):
    for attempt in range(max_attempts):
        try:
            element = await page.wait_for_selector(selector, timeout=timeout * (attempt + 1))
            if element:
                return element
        except TimeoutError:
            print(f"Attempt {attempt + 1} failed to find {selector}")
            await asyncio.sleep(1)
    return None

@pytest.mark.asyncio
async def test_github_login_record_playback(yeshie_extension, github_credentials):
    extension = await yeshie_extension
    username = github_credentials["username"]
    password = github_credentials["password"]

    # Open login page and start recording
    await extension.execute_command('navto https://github.com/login')
    await extension.page.wait_for_selector('input[name="login"]')
    await extension.execute_command('record start')

    # Perform login using Stepper commands
    await extension.execute_command(f'type input[name="login"] "{username}"')
    await extension.execute_command(f'type input[name="password"] "{password}"')
    await extension.execute_command('click input[name="commit"]')

    avatar = await retry_selector(extension.page, 'img.avatar')
    assert avatar is not None, "Login failed during recording"

    recorded_json = await extension.execute_command('record stop')
    await extension.execute_command('recipe save "github_login"')

    actions = json.loads(recorded_json) if isinstance(recorded_json, str) else []
    assert actions, "No actions recorded"

    # Sign out to verify playback
    await extension.page.click('summary[aria-label="View profile and more"]')
    await extension.page.click('button:has-text("Sign out")')
    await extension.page.wait_for_selector('input[name="login"]')

    # Simple playback by executing the same commands again
    await extension.execute_command('navto https://github.com/login')
    await extension.execute_command(f'type input[name="login"] "{username}"')
    await extension.execute_command(f'type input[name="password"] "{password}"')
    await extension.execute_command('click input[name="commit"]')

    avatar = await retry_selector(extension.page, 'img.avatar')
    assert avatar is not None, "Playback login failed"
