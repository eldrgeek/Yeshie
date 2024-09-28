import { summarizeWebPage } from './pageSummary';
import { pageObserver, type ObserverEvent, type ObserverCallback, type ObserverEventType } from './observer';

interface Command {
  command: string;
  [key: string]: any;
}

const Stepper = async (step: Command) => {
  const summary = summarizeWebPage({
    excludeTags: ['h1', 'h2', 'h3', 'p', 'span']
  });
  
  console.log(JSON.stringify(summary, null, 2));

  const performCommand = async (command: Command): Promise<string> => {
    console.log("Executing command:", command);

    const getElement = (selector: string, text?: string): Element | null => {
      if (!text) {
        return document.querySelector(selector);
      }
      const elements = document.querySelectorAll(selector);
      return Array.from(elements).find(el => el.textContent?.trim() === text) || null;
    };

    switch (command.command.toLowerCase()) {
      case 'navto':
        window.location.href = command.url;
        return "Navigation initiated";

      case 'click':
        const clickable = getElement(command.selector, command.text) as HTMLElement;
        if (clickable) {
          clickable.click();
          return "Clicked element";
        }
        return "Element not found";

      case 'type':
        const inputElement = getElement(command.selector) as HTMLInputElement;
        if (inputElement) {
          inputElement.value = command.value;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          return "Entered text";
        }
        return "Input element not found";

      case 'scrollto':
        if (command.selector) {
          const element = getElement(command.selector);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
            return "Scrolled to element";
          }
          return "Scroll target not found";
        } else if (command.x !== undefined && command.y !== undefined) {
          window.scrollTo({
            top: command.y,
            left: command.x,
            behavior: 'smooth'
          });
          return "Scrolled to coordinates";
        }
        return "Invalid scroll parameters";

      case 'hover':
        const hoverElement = getElement(command.selector) as HTMLElement;
        if (hoverElement) {
          hoverElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          return "Hovered over element";
        }
        return "Hover target not found";

      case 'getattribute':
        const attributeElement = getElement(command.selector);
        if (attributeElement) {
          const value = attributeElement.getAttribute(command.attributeName);
          return value ? `Attribute value: ${value}` : "Attribute not found";
        }
        return "Element for attribute not found";

      case 'getcomputedstyle':
        const styleElement = getElement(command.selector);
        if (styleElement) {
          const style = window.getComputedStyle(styleElement);
          const value = style.getPropertyValue(command.propertyName);
          return `Computed style value: ${value}`;
        }
        return "Element for style not found";

      case 'waitfor':
        return new Promise((resolve) => {
          if (command.selector) {
            const checkElement = () => {
              if (getElement(command.selector)) {
                resolve("Element found");
              } else {
                setTimeout(checkElement, 100);
              }
            };
            checkElement();
          } else if (command.timeout) {
            setTimeout(() => resolve("Timeout completed"), command.timeout);
          }
        });

      case 'waitforelement':
        return new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            if (getElement(command.selector)) {
              observer.disconnect();
              resolve("Element appeared");
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => {
            observer.disconnect();
            resolve("Timeout: Element did not appear");
          }, command.timeout || 5000);
        });

      case 'waitfornetwork':
        // This is a placeholder. Actual implementation would depend on how you're tracking network requests.
        return new Promise((resolve) => {
          setTimeout(() => resolve("Network idle"), command.timeout || 5000);
        });

      case 'executejs':
        try {
          const result = eval(command.script);
          return `Script executed. Result: ${result}`;
        } catch (error) {
          return `Script execution error: ${error}`;
        }

      case 'takescreenshot':
        chrome.runtime.sendMessage({ action: "screenshot" }, (response) => {
          console.log(response);
        });
        return "Screenshot captured";
      case 'handledialog':
        window.alert = () => {};
        window.confirm = () => command.action === 'accept';
        window.prompt = () => '';
        return "Dialog handler set";

      case 'setviewport':
        window.resizeTo(command.width, command.height);
        return `Viewport set to ${command.width}x${command.height}`;

      case 'changes':
        switch (command.action) {
          case 'on':
            pageObserver.start();
            return "Page observer started";
          case 'off':
            pageObserver.stop();
            return "Page observer stopped";
          case 'clear':
            pageObserver.clear();
            return "Page observer cleared";
          case 'request':
            return JSON.stringify(pageObserver.request());
          default:
            return "Invalid changes command";
        }

      default:
        return `Action ${command.command} is not recognized.`;
    }
  };

  return performCommand(step);
};

export { Stepper };