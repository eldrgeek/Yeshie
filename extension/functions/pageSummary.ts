export interface ElementInfo {
    text?: {
        value: string;
        location: string;
    };
    button?: {
        label: string;
        selector: string;
        location: string;
    };
    a?: {
        label: string;
        selector: string;
        href: string;
        location: string;
    };
}

export interface SummaryOptions {
    excludeTags?: string[]; // Tags to exclude from the result (e.g. h1, h2, h3, p, span)
}

function getBoundingClientRectString(element: HTMLElement): string {
    const rect = element.getBoundingClientRect();
    return `(${rect.top}, ${rect.left}, ${rect.width}, ${rect.height})`;
}

function getUniqueSelector(element: HTMLElement): string {
    if (element.id) {
        return `#${element.id}`;
    }

    if (element.className) {
        return `${element.tagName.toLowerCase()}.${element.className.split(' ').join('.')}`;
    }

    return element.tagName.toLowerCase();
}

function extractInfo(element: HTMLElement): ElementInfo | null {
    const rect = element.getBoundingClientRect();

    if (!element.offsetParent || rect.width === 0 || rect.height === 0) {
        // Skip hidden elements or elements with zero dimensions
        return null;
    }

    if (element.tagName === "BUTTON" || (element.tagName === "INPUT" && (element as HTMLInputElement).type === "submit")) {
        return {
            button: {
                label: (element as HTMLInputElement).value || element.innerText || element.getAttribute("aria-label") || "Button",
                selector: getUniqueSelector(element),
                location: getBoundingClientRectString(element),
            }
        };
    }

    if (element.tagName === "A") {
        return {
            a: {
                label: element.innerText || element.getAttribute("aria-label") || "Link",
                selector: getUniqueSelector(element),
                href: (element as HTMLAnchorElement).href,
                location: getBoundingClientRectString(element),
            }
        };
    }

    if (element.innerText && element.innerText.trim()) {
        return {
            text: {
                value: element.innerText.trim(),
                location: getBoundingClientRectString(element),
            }
        };
    }

    return null;
}

function traverseDom(element: HTMLElement, options: SummaryOptions = {}): ElementInfo[] {
    let result: ElementInfo[] = [];

    Array.from(element.children).forEach((child) => {
        const tagName = child.tagName.toLowerCase();
        
        // Check if the current tag is in the exclude list
        if (options.excludeTags && options.excludeTags.includes(tagName)) {
            return; // Skip this element if it's in the excludeTags array
        }

        const info = extractInfo(child as HTMLElement);
        if (info) {
            result.push(info);
        }

        const childResult = traverseDom(child as HTMLElement, options);
        if (childResult.length > 0) {
            result = result.concat(childResult);
        }
    });

    return result;
}

export function summarizeWebPage(options: SummaryOptions = {}): ElementInfo[] {
    const body = document.querySelector('body');
    if (!body) {
        console.warn('No <body> element found on the page.');
        return [];
    }

    return traverseDom(body as HTMLElement, options);
}
