import asyncio
from pathlib import Path
import pytest
from playwright.async_api import async_playwright

STEPPER_JS = """
window.Stepper = async function(command) {
  command = command.trim();
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  if (!cmd) throw new Error('Invalid command');
  switch(cmd) {
    case 'navto': {
      const url = command.slice(6).trim();
      window.location.href = url;
      return 'Navigation initiated';
    }
    case 'click': {
      const match = command.match(/^click\s+([^\s]+)(?:\s+\"([^\"]+)\")?$/);
      if (!match) throw new Error('Invalid command format');
      const el = document.querySelector(match[1]);
      if (!el) return 'Element not found';
      el.click();
      return 'Clicked element';
    }
    case 'type': {
      const match = command.match(/^type\s+([^\s]+)\s+\"([^\"]*)\"$/);
      if (!match) throw new Error('Invalid command format');
      const el = document.querySelector(match[1]);
      if (!el) return 'Input element not found';
      el.value = match[2];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'Entered text';
    }
    case 'waitforelement': {
      const match = command.match(/^waitforelement\s+([^\s]+)(?:\s+(\d+))?$/);
      if (!match) throw new Error('Invalid command format');
      const selector = match[1];
      const timeout = parseInt(match[2] || '5000');
      return await new Promise(resolve => {
        if (document.querySelector(selector)) {
          resolve('Element appeared');
          return;
        }
        const obs = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            obs.disconnect();
            resolve('Element appeared');
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          obs.disconnect();
          resolve('Timeout: Element did not appear');
        }, timeout);
      });
    }
    default:
      throw new Error('Invalid command');
  }
};
"""

@pytest.fixture
async def stepper_page():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.add_init_script(STEPPER_JS)
        page1 = Path(__file__).parent.parent / "stepper_pages" / "page1.html"
        await page.goto(page1.as_uri())
        yield page
        await browser.close()

@pytest.mark.asyncio
async def test_navto_command(stepper_page):
    page = stepper_page
    page2 = Path(__file__).parent.parent / "stepper_pages" / "page2.html"
    result = await page.evaluate("cmd => Stepper(cmd)", f"navto {page2.as_uri()}")
    assert result == "Navigation initiated"
    await page.wait_for_load_state('load')
    assert page.url == page2.as_uri()

@pytest.mark.asyncio
async def test_click_command(stepper_page):
    page = stepper_page
    await page.evaluate("cmd => Stepper(cmd)", "click #btn")
    text = await page.text_content('#status')
    assert text == 'clicked'

@pytest.mark.asyncio
async def test_type_command(stepper_page):
    page = stepper_page
    await page.evaluate("cmd => Stepper(cmd)", "type #text-input \"hello\"")
    value = await page.get_attribute('#text-input', 'value')
    assert value == 'hello'

@pytest.mark.asyncio
async def test_waitforelement_command(stepper_page):
    page = stepper_page
    result = await page.evaluate("cmd => Stepper(cmd)", "waitforelement #dynamic 1500")
    assert result == 'Element appeared'

@pytest.mark.asyncio
async def test_click_invalid_selector(stepper_page):
    page = stepper_page
    result = await page.evaluate("cmd => Stepper(cmd)", "click #missing")
    assert result == 'Element not found'

@pytest.mark.asyncio
async def test_invalid_command(stepper_page):
    page = stepper_page
    result = await page.evaluate("cmd => { try { return Stepper(cmd); } catch(e) { return 'Error: ' + e.message; } }", "bogus")
    assert result.startswith('Error:')

@pytest.mark.asyncio
async def test_waitforelement_timeout(stepper_page):
    page = stepper_page
    result = await page.evaluate("cmd => Stepper(cmd)", "waitforelement #none 300")
    assert result.startswith('Timeout')
