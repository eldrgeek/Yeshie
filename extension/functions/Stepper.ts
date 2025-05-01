import { summarizeWebPage } from './pageSummary';
import { pageObserver, type ObserverEvent, type ObserverCallback, type ObserverEventType } from './observer';
import { v4 as uuidv4 } from 'uuid';

interface Command {
  command: string;
  [key: string]: any;
}

const commandTemplates = {
  navto: {
    regex: /^navto\s+(.+)$/,
    template: { command: 'navto', url: '$1' }
  },
  click: {
    regex: /^click\s+(.+?)(?:\s+"(.+)")?$/,
    template: { command: 'click', selector: '$1', text: '$2' }
  },
  type: {
    regex: /^type\s+(.+?)\s+"(.+)"$/,
    template: { command: 'type', selector: '$1', value: '$2' }
  },
  scrollto: {
    regex: /^scrollto\s+(.+)$/,
    template: { command: 'scrollto', selector: '$1' }
  },
  hover: {
    regex: /^hover\s+(.+)$/,
    template: { command: 'hover', selector: '$1' }
  },
  getattribute: {
    regex: /^getattribute\s+(.+?)\s+(.+)$/,
    template: { command: 'getattribute', selector: '$1', attributeName: '$2' }
  },
  getcomputedstyle: {
    regex: /^getcomputedstyle\s+(.+?)\s+(.+)$/,
    template: { command: 'getcomputedstyle', selector: '$1', propertyName: '$2' }
  },
  waitfor: {
    regex: /^waitfor\s+(.+?)(?:\s+(\d+))?$/,
    template: { command: 'waitfor', condition: '$1', timeout: '$2' }
  },
  waitforelement: {
    regex: /^waitforelement\s+(.+?)(?:\s+(\d+))?$/,
    template: { command: 'waitforelement', selector: '$1', timeout: '$2' }
  },
  waitfornetwork: {
    regex: /^waitfornetwork(?:\s+(\d+))?$/,
    template: { command: 'waitfornetwork', timeout: '$1' }
  },
  executejs: {
    regex: /^executejs\s+(.+)$/,
    template: { command: 'executejs', script: '$1' }
  },
  takescreenshot: {
    regex: /^takescreenshot$/,
    template: { command: 'takescreenshot' }
  },
  handledialog: {
    regex: /^handledialog\s+(accept|dismiss)$/,
    template: { command: 'handledialog', action: '$1' }
  },
  setviewport: {
    regex: /^setviewport\s+(\d+)\s+(\d+)$/,
    template: { command: 'setviewport', width: '$1', height: '$2' }
  },
  changes: {
    regex: /^changes\s+(on|off|clear|request)$/,
    template: { command: 'changes', action: '$1' }
  },
  message: {
    regex: /^message\s+"(.+)"$/,
    template: { command: 'message', text: '$1' }
  },
  record: {
    regex: /^record\s+(start|stop)$/,
    template: { command: 'record', action: '$1' }
  },
  recipe: {
    regex: /^recipe\s+(save|load)\s+"(.+)"$/,
    template: { command: 'recipe', action: '$1', name: '$2' }
  }
};

// Function to parse commands from input
const parseCommand = (input: string | Command): Command => {
  if (typeof input === 'object') {
    return input;
  }

  const firstWord = input.split(/\s+/)[0].toLowerCase();
  const templateEntry = commandTemplates[firstWord];
  console.log(templateEntry)

  if (!templateEntry) {
    throw new Error(`Invalid command: ${input}`);
  }

  const { regex, template } = templateEntry;
  const match = input.match(regex);

  if (!match) {
    throw new Error(`Invalid command format: ${input}`);
  }

  const command = { ...template };
  Object.keys(command).forEach((key, index) => {
    if (typeof command[key] === 'string' && command[key].startsWith('$')) {
      const value = match[parseInt(command[key].slice(1))];
      command[key] = value !== undefined ? value : null;
    }
  });

  return command as Command;
};

const Stepper = async (input: string | Command | (string | Command)[]) => {
  const commands = Array.isArray(input) ? input : [input];
  const parsedCommands = commands.map(parseCommand);

  const results = [];

  let lastEventTime = Date.now();
  const observerCallback: ObserverCallback = (event) => {
    console.log("Observer callback received event:", event);
    lastEventTime = Date.now();
  };

  pageObserver.registerCallback(observerCallback);

  const waitForQuiet = (timeout: number): Promise<void> => {
    return new Promise((resolve) => {
      const checkQuiet = () => {
        if (Date.now() - lastEventTime >= timeout) {
          resolve();
        } else {
          setTimeout(checkQuiet, 10);
        }
      };
      checkQuiet();
    });
  };

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
        pageObserver.start()
        const clickable = getElement(command.selector, command.text) as HTMLElement;
        if (clickable) {
          clickable.click();
          waitForQuiet(100)
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
        if (command.condition === 'quiet') {
          await waitForQuiet(command.timeout || 100);
          return "Page is quiet";
        }
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

      case 'message':
        // Send message to UI for display
        window.postMessage({
          type: 'yeshie-message',
          text: command.text
        }, '*');
        return `Displayed message: ${command.text}`;

      case 'record':
        if (command.action === 'start') {
          console.log('Starting record command');
          pageObserver.clear(); // Clear any existing events
          pageObserver.start(); // Start collecting events
          const startTime = Date.now();
          
          // Set up a callback to collect events
          const collectedEvents: ObserverEvent[] = [];
          const recordCallback: ObserverCallback = (event) => {
            console.log("Recording event:", event);
            collectedEvents.push(event);
            lastEventTime = Date.now();
          };
          
          pageObserver.registerCallback(recordCallback);
          
          window.postMessage({
            type: 'yeshie-record-start'
          }, '*');
          return "Started recording user actions";
        } else {
          console.log('Stopping record command');
          const actions = pageObserver.request();
          console.log('Recorded actions:', actions);
          pageObserver.stop();
          pageObserver.unregisterCallback();
          window.postMessage({
            type: 'yeshie-record-stop',
            actions
          }, '*');
          return JSON.stringify(actions);
        }

      case 'recipe':
        if (command.action === 'save') {
          const actions = pageObserver.request();
          // Store recipe in chrome.storage
          chrome.storage.local.set({
            [`recipe:${command.name}`]: actions
          });
          return `Saved recipe: ${command.name}`;
        } else {
          // Load recipe from chrome.storage
          return new Promise((resolve) => {
            chrome.storage.local.get([`recipe:${command.name}`], (result) => {
              const recipe = result[`recipe:${command.name}`];
              if (recipe) {
                resolve(`Loaded recipe: ${command.name}`);
              } else {
                resolve(`Recipe not found: ${command.name}`);
              }
            });
          });
        }

      default:
        return `Action ${command.command} is not recognized.`;
    }
  };

  for (const command of parsedCommands) {
    try {
      const result = await performCommand(command);
      results.push(result);

      if (command.command.toLowerCase() !== 'waitfor' && command.command.toLowerCase() !== 'changes') {
        await waitForQuiet(100);
      }

      if (command.command.toLowerCase() === 'changes' && command.action === 'request') {
        break;
      }
    } catch (error) {
      results.push(`Error executing command: ${error}`);
      break;
    }
  }

  // pageObserver.unregisterCallback();

  return results.length === 1 ? results[0] : results;
};

export { Stepper };

// Add this function to get or create a unique instance ID
export async function getOrCreateInstanceId(tabId: number, sessionID?: string): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(`instanceId_${tabId}`, (result) => {
      let instanceId = result[`instanceId_${tabId}`];
      if (!instanceId) {
        instanceId = sessionID || uuidv4();
        chrome.storage.local.set({ [`instanceId_${tabId}`]: instanceId });
      }
      resolve(instanceId);
    });
  });
}