import asyncio
import pytest
from playwright.async_api import async_playwright, TimeoutError
import subprocess
import time
import json

async def inspect_dom(page):
    """Inspect the DOM to find extension elements."""
    print("\nInspecting DOM structure...")
    
    # List all custom elements
    custom_elements = await page.evaluate('''
        () => {
            const elements = Array.from(document.getElementsByTagName('*'));
            return elements
                .filter(el => el.tagName.includes('-'))
                .map(el => ({
                    tagName: el.tagName.toLowerCase(),
                    id: el.id,
                    className: el.className,
                    attributes: Array.from(el.attributes).map(attr => ({
                        name: attr.name,
                        value: attr.value
                    }))
                }));
        }
    ''')
    print("\nFound custom elements:")
    print(json.dumps(custom_elements, indent=2))
    
    # Check for shadow roots
    shadow_roots = await page.evaluate('''
        () => {
            const elements = Array.from(document.getElementsByTagName('*'));
            return elements
                .filter(el => el.shadowRoot)
                .map(el => ({
                    tagName: el.tagName.toLowerCase(),
                    id: el.id,
                    className: el.className
                }));
        }
    ''')
    print("\nFound elements with shadow roots:")
    print(json.dumps(shadow_roots, indent=2))

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

async def safe_click(page, element, description="element"):
    """Safely click an element with retries and error handling."""
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            # Ensure element is visible and clickable
            await element.wait_for_element_state("visible")
            await element.wait_for_element_state("stable")
            
            # Try to click
            await element.click()
            print(f"Successfully clicked {description}")
            return True
        except Exception as e:
            print(f"\nAttempt {attempt + 1} failed to click {description}: {str(e)}")
            if attempt < max_attempts - 1:
                print("Retrying...")
                await asyncio.sleep(1)
            else:
                print(f"Failed to click {description} after {max_attempts} attempts")
                return False

async def find_and_click_shadow_element(page, host_selector, shadow_selector, description="element"):
    """Find and click an element within a shadow DOM."""
    try:
        # First inspect the DOM to understand the structure
        await inspect_dom(page)
        
        # First find the host element
        print(f"\nLooking for host element: {host_selector}")
        
        # Try multiple possible host selectors
        host_selectors = [
            'plasmo-csui#plasmo-google-sidebar',
            '#plasmo-google-sidebar',
            'plasmo-csui',
            '[data-testid="plasmo-google-sidebar"]',
            'plasmo-shadow-host',  # Common Plasmo shadow host
            'plasmo-sidebar',      # Another possible Plasmo element
            '*[class*="plasmo"]',  # Any element with plasmo in class
            '*[id*="plasmo"]'      # Any element with plasmo in id
        ]
        
        host_element = None
        for selector in host_selectors:
            try:
                print(f"Trying host selector: {selector}")
                host_element = await page.wait_for_selector(selector, timeout=5000)
                if host_element:
                    print(f"Found host element with selector: {selector}")
                    
                    # Log element details
                    element_info = await page.evaluate('''
                        (selector) => {
                            const el = document.querySelector(selector);
                            return {
                                tagName: el.tagName,
                                id: el.id,
                                className: el.className,
                                hasShadowRoot: !!el.shadowRoot
                            };
                        }
                    ''', selector)
                    print(f"Element details: {json.dumps(element_info, indent=2)}")
                    break
            except Exception as e:
                print(f"Error with selector {selector}: {str(e)}")
                continue
        
        if not host_element:
            print("Could not find host element with any selector")
            # Take a screenshot for debugging
            await page.screenshot(path="no_host_element.png")
            print("Screenshot saved as 'no_host_element.png'")
            return False
            
        # Try to access shadow DOM in different ways
        try:
            # First try using >>> syntax
            print(f"Trying >>> syntax for shadow element: {shadow_selector}")
            shadow_element = await page.locator(f"{host_selector} >>> {shadow_selector}").first
            
            if not shadow_element:
                # Try evaluating directly in page context
                print("Trying direct shadow DOM access...")
                shadow_element = await page.evaluate(f'''
                    (hostSelector, shadowSelector) => {{
                        const host = document.querySelector(hostSelector);
                        return host?.shadowRoot?.querySelector(shadowSelector);
                    }}
                ''', host_selector, shadow_selector)
        except Exception as e:
            print(f"Error accessing shadow DOM: {str(e)}")
            shadow_element = None
            
        if not shadow_element:
            print(f"Shadow element not found: {shadow_selector}")
            # Take a screenshot for debugging
            await page.screenshot(path="no_shadow_element.png")
            print("Screenshot saved as 'no_shadow_element.png'")
            return False
            
        # Click the element
        print(f"Attempting to click {description}...")
        await shadow_element.click()
        print(f"Successfully clicked {description}")
        return True
        
    except Exception as e:
        print(f"Error while finding/clicking shadow element: {str(e)}")
        # Take a screenshot for debugging
        await page.screenshot(path="error_state.png")
        print("Screenshot saved as 'error_state.png'")
        return False

async def wait_for_extension_ready(page, timeout=30000):
    """Wait for the Yeshie extension to be fully initialized."""
    try:
        print("\nWaiting for extension to be ready...")
        await page.wait_for_function('''
            () => {
                const element = document.querySelector('plasmo-csui#plasmo-google-sidebar');
                if (!element || !element.shadowRoot) return false;
                
                // Check if the sidebar toggle exists in shadow root
                const toggle = element.shadowRoot.querySelector('.sidebar-toggle');
                return !!toggle;
            }
        ''', timeout=timeout)
        print("Extension is ready!")
        return True
    except Exception as e:
        print(f"Error waiting for extension: {str(e)}")
        return False

async def wait_for_editor_ready(page, timeout=30000):
    """Wait for the Yeshie editor to be ready."""
    try:
        print("\nWaiting for editor to be ready...")
        await page.wait_for_function('''
            () => {
                const element = document.querySelector('plasmo-csui#plasmo-google-sidebar');
                if (!element || !element.shadowRoot) return false;
                
                // Try different possible editor selectors
                const selectors = [
                    '[data-testid="yeshie-editor"]',
                    '.yeshie-editor',
                    '#yeshie-editor',
                    '[class*="editor"]',
                    '[class*="yeshie"]'
                ];
                
                for (const selector of selectors) {
                    const editor = element.shadowRoot.querySelector(selector);
                    if (editor) {
                        console.log('Found editor with selector:', selector);
                        return true;
                    }
                }
                
                return false;
            }
        ''', timeout=timeout)
        print("Editor is ready!")
        return True
    except Exception as e:
        print(f"Error waiting for editor: {str(e)}")
        return False

@pytest.mark.asyncio
async def test_yeshie_interaction(chrome_process, keep_browser):
    """Test complete Yeshie workflow including local development and GitHub."""
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:9222")
        try:
            # Use the first context and create a new page in it
            context = browser.contexts[0]
            page = await context.new_page()
            
            # Enable detailed logging for debugging
            page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
            
            # 1. Check localhost:3000
            print("\nNavigating to localhost:3000...")
            await page.goto("http://localhost:3000", wait_until="networkidle")
            print(f"Current URL: {page.url}")
            
            # Wait for extension to be fully initialized
            is_ready = await wait_for_extension_ready(page)
            assert is_ready, "Extension failed to initialize"
            
            # Take initial screenshot for debugging
            await page.screenshot(path="initial_state.png")
            print("Initial page state saved as 'initial_state.png'")
            
            # Inspect initial DOM state
            await inspect_dom(page)

            # Try to click the toggle directly using JavaScript
            print("\nAttempting to click toggle using JavaScript...")
            clicked = await page.evaluate('''
                () => {
                    try {
                        const element = document.querySelector('plasmo-csui#plasmo-google-sidebar');
                        if (!element || !element.shadowRoot) return false;
                        
                        const toggle = element.shadowRoot.querySelector('.sidebar-toggle');
                        if (!toggle) return false;
                        
                        toggle.click();
                        return true;
                    } catch (e) {
                        console.error('Error clicking toggle:', e);
                        return false;
                    }
                }
            ''')
            
            assert clicked, "Failed to click toggle using JavaScript"
            print("Successfully clicked toggle!")
            
            # Wait for animation and editor to be ready
            await asyncio.sleep(2)
            editor_ready = await wait_for_editor_ready(page)
            assert editor_ready, "Editor failed to initialize"
            
            # Take a screenshot after clicking
            await page.screenshot(path="after_click.png")
            print("Screenshot saved as 'after_click.png'")

            # Inspect shadow DOM content
            print("\nInspecting shadow DOM content...")
            shadow_content = await page.evaluate('''
                () => {
                    const element = document.querySelector('plasmo-csui#plasmo-google-sidebar');
                    if (!element || !element.shadowRoot) return 'No shadow root found';
                    
                    // Get all elements in shadow DOM
                    const elements = Array.from(element.shadowRoot.querySelectorAll('*'));
                    return elements.map(el => ({
                        tagName: el.tagName.toLowerCase(),
                        id: el.id,
                        className: el.className,
                        attributes: Array.from(el.attributes).map(attr => ({
                            name: attr.name,
                            value: attr.value
                        }))
                    }));
                }
            ''')
            print("Shadow DOM content:")
            print(json.dumps(shadow_content, indent=2))

            # Verify editor content is visible
            print("\nVerifying editor content...")
            editor_info = await page.evaluate('''
                () => {
                    const element = document.querySelector('plasmo-csui#plasmo-google-sidebar');
                    if (!element || !element.shadowRoot) return { found: false, error: 'No shadow root' };
                    
                    // Try different possible editor selectors
                    const selectors = [
                        '[data-testid="yeshie-editor"]',
                        '.yeshie-editor',
                        '#yeshie-editor',
                        '[class*="editor"]',
                        '[class*="yeshie"]'
                    ];
                    
                    for (const selector of selectors) {
                        const editor = element.shadowRoot.querySelector(selector);
                        if (editor) {
                            return {
                                found: true,
                                selector: selector,
                                tagName: editor.tagName,
                                id: editor.id,
                                className: editor.className
                            };
                        }
                    }
                    
                    return { found: false, error: 'No editor found with any selector' };
                }
            ''')
            print(f"Editor info: {json.dumps(editor_info, indent=2)}")
            assert editor_info.get('found', False), f"Could not find editor content: {editor_info.get('error', 'unknown error')}"
            print("Editor content found!")

            # Close the slider using JavaScript
            print("\nClosing the slider...")
            clicked = await page.evaluate('''
                () => {
                    try {
                        const element = document.querySelector('plasmo-csui#plasmo-google-sidebar');
                        if (!element || !element.shadowRoot) return false;
                        
                        const toggle = element.shadowRoot.querySelector('.sidebar-toggle');
                        if (!toggle) return false;
                        
                        toggle.click();
                        return true;
                    } catch (e) {
                        console.error('Error clicking toggle:', e);
                        return false;
                    }
                }
            ''')
            assert clicked, "Failed to close sidebar"
            await asyncio.sleep(2)  # Wait for animation

            # Create a new tab for GitHub
            print("\nOpening new tab for GitHub...")
            github_page = await context.new_page()
            
            # Navigate to GitHub and verify Yeshie
            print("\nNavigating to GitHub...")
            try:
                await github_page.goto("https://github.com", wait_until="networkidle", timeout=60000)
                print(f"Current URL: {github_page.url}")
                
                # Give the extension time to initialize on GitHub
                await asyncio.sleep(5)
                
                # Verify Yeshie on GitHub with shadow DOM
                print("\nVerifying Yeshie on GitHub...")
                github_sidebar = await github_page.locator('plasmo-csui#plasmo-google-sidebar >>> .sidebar-toggle').first
                assert github_sidebar is not None, "Could not find Yeshie sidebar on GitHub"
                print("Found Yeshie sidebar on GitHub!")
                
            except Exception as e:
                print(f"\nError during GitHub navigation: {e}")
                await github_page.screenshot(path="github_error.png")
                raise

            print("\nTest completed successfully!")
            if keep_browser:
                print("Browser kept open for debugging. Press Ctrl+C to close.")
                while True:
                    await asyncio.sleep(1)
        finally:
            if not keep_browser:
                await browser.close()
                subprocess.run(['pkill', '-f', 'Google Chrome']) 