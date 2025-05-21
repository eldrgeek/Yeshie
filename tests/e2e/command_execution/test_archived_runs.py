import pytest

@pytest.mark.asyncio
async def test_archived_runs_visible(browser):
    context = browser.contexts[0]
    page = await context.new_page()

    extension_id = await page.evaluate("chrome.runtime.id")
    tab_url = f"chrome-extension://{extension_id}/tabs/index.html"
    await page.goto(tab_url)

    await page.wait_for_selector('button[aria-label="Archive the current instructions.json to local storage"]')
    await page.click('button[aria-label="Archive the current instructions.json to local storage"]')
    await page.click('button[aria-label="View and manage archived tests"]')

    await page.wait_for_selector('select option')
    options = await page.locator('select option').all_text_contents()
    assert any(opt.strip() for opt in options)
