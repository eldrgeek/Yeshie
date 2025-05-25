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
    async for page in stepper_page:
        page2 = Path(__file__).parent.parent / "stepper_pages" / "page2.html"
        result = await page.evaluate("cmd => Stepper(cmd)", f"navto {page2.as_uri()}")
        assert result == "Navigation initiated"
        await page.wait_for_url(page2.as_uri())
        assert page.url == page2.as_uri()
        break

@pytest.mark.asyncio
async def test_click_command(stepper_page):
    async for page in stepper_page:
        await page.evaluate("cmd => Stepper(cmd)", "click #btn")
        text = await page.text_content('#status')
        assert text == 'clicked'
        break

@pytest.mark.asyncio
async def test_type_command(stepper_page):
    async for page in stepper_page:
        await page.evaluate("cmd => Stepper(cmd)", "type #text-input \"hello\"")
        value = await page.eval_on_selector('#text-input', 'el => el.value')
        assert value == 'hello'
        break

@pytest.mark.asyncio
async def test_waitforelement_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "waitforelement #dynamic 1500")
        assert result == 'Element appeared'
        break

@pytest.mark.asyncio
async def test_click_invalid_selector(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "click #missing")
        assert result == 'Element not found'
        break

@pytest.mark.asyncio
async def test_invalid_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate(
            """
            cmd => Promise.resolve(Stepper(cmd))
                .catch(e => 'Error: ' + (e && e.message ? e.message : e))
            """,
            "bogus"
        )
        assert result.startswith('Error:')
        break

@pytest.mark.asyncio
async def test_waitforelement_timeout(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "waitforelement #none 300")
        assert result.startswith('Timeout')
        break

# --- Additional Stepper command tests ---

@pytest.mark.asyncio
async def test_scrollto_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "scrollto #btn")
        assert result == "Scrolled to element"
        break

@pytest.mark.asyncio
async def test_hover_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "hover #btn")
        assert result == "Hovered over element"
        break

@pytest.mark.asyncio
async def test_getattribute_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "getattribute #link href")
        assert "Attribute value:" in result or result == "Attribute not found"
        break

@pytest.mark.asyncio
async def test_getcomputedstyle_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "getcomputedstyle #btn color")
        assert "Computed style value:" in result
        break

@pytest.mark.asyncio
async def test_waitfor_command_quiet(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "waitfor quiet 100")
        assert result == "Page is quiet"
        break

@pytest.mark.asyncio
async def test_wait_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "wait 10")
        assert result == "Wait completed"
        break

@pytest.mark.asyncio
async def test_executejs_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "executejs 2+2")
        assert "Script executed. Result:" in result
        break

@pytest.mark.asyncio
async def test_changes_on_off(stepper_page):
    async for page in stepper_page:
        result_on = await page.evaluate("cmd => Stepper(cmd)", "changes on")
        assert result_on == "Page observer started"
        result_off = await page.evaluate("cmd => Stepper(cmd)", "changes off")
        assert result_off == "Page observer stopped"
        break

@pytest.mark.asyncio
async def test_message_command(stepper_page):
    async for page in stepper_page:
        result = await page.evaluate("cmd => Stepper(cmd)", "message \"Hello\"")
        assert result.startswith("Displayed message:")
        break

@pytest.mark.asyncio
async def test_asserttextcontains_command(stepper_page):
    async for page in stepper_page:
        await page.evaluate("cmd => Stepper(cmd)", "click #btn")
        result = await page.evaluate("cmd => Stepper(cmd)", "asserttextcontains #status \"clicked\"")
        assert result.startswith("Assertion passed") or "did not contain" in result or "not found" in result
        break
