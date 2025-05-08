// extcomm.ts

import { io, Socket } from "socket.io-client";
import { logInfo } from "./logger";
logInfo("ExtComms", "extcomms loaded");
// Store socket reference and list of injected tabs in BG
let socket: Socket | null = null;
const injectedTabs: { [tabId: number]: { title: string, url: string, sessionId?: string, serverUrl?: string, isServerPage: boolean } } = {};

// ---- Setup for Background Page ----
export function setupBG() {
    logInfo("ExtComms", "setupBG called");
    
    const listener = createListener();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const { type, data } = message;
        listener.emit(type, data, sender, sendResponse);
        return true;  // Keeps the message channel open for async responses
    });

    return listener;
}

function createListener() {
    const handlers: { [key: string]: Function } = {};

    const listener = {
        on: (type: string, handler: Function) => {
            handlers[type] = handler;
        },
        emit: (type: string, ...args: any[]) => {
            if (handlers[type]) {
                handlers[type](...args);
            }
        }
    };

    // Define handlers for different message types
    listener.on("pageInfo", (data, sender) => {
        const tabId = sender.tab?.id;
        if (tabId) {
            injectedTabs[tabId] = {
                title: data.title,
                url: data.url,
                sessionId: data.sessionId,
                serverUrl: data.serverUrl,
                isServerPage: data.isServerPage
            };

            if (data.isServerPage && !socket) {
                logInfo("ExtComms", "Establishing socket connection");
                const socketUrl = data.serverUrl?.replace('5173', '3000');
                socket = io(socketUrl || '');
                logInfo("ExtComms", `Socket connected for session: ${data.sessionId}`, { url: socketUrl });

                socket.on("extension", (msg) => {
                    handleSocketMessage(msg, tabId);
                });
            }
        }
    });

    listener.on("navto", (data) => {
        chrome.tabs.update({ url: data.url });
    });

    listener.on("focusTab", (data) => {
        chrome.tabs.update(data.tabId, { active: true });
    });

    listener.on("socketMessage", (data) => {
        if (socket) {
            socket.emit(data.event, data.payload);
        }
    });


    return listener;
}

// Handle incoming socket messages
function handleSocketMessage(msg: { to: string, op: string, selector?: string, value?: string }, tabId: number) {
    if (msg.to === "CS") {
        // Forward the message to the content script
        chrome.tabs.sendMessage(tabId, { type: msg.op, data: { selector: msg.selector, value: msg.value } });
    } else if (msg.to === "BG") {
        // Interpret the message within the background script
        switch (msg.op) {
            case "navto":
                if (msg.selector) {
                    chrome.tabs.update(tabId, { url: msg.selector });
                }
                break;
            // Handle more operations like "focus", etc.
        }
    }
}

// ---- Setup for Content Script ----
export function setupCS() {
    logInfo("ExtComms", "setupCS called");
    const listener = createListener();

    // Extract session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get('session');

    // Check if the <div id="aiaugie"> exists with server and session data
    const serverDiv = document.querySelector<HTMLDivElement>('#aiaugie');
    let isServerPage = !!serverDiv;
    let serverUrl = '';
    let sessionIdFromDiv = '';

    if (isServerPage) {
        logInfo("ExtComms", "Content script identified as server page");
        sessionIdFromDiv = serverDiv.getAttribute('data-session') || serverDiv.getAttribute('session') || '';
    } else {
        logInfo("ExtComms", "Content script identified as not a server page");
    }

    const pageInfo = {
        title: document.title,
        url: window.location.href,
        isServerPage: isServerPage,
        sessionId: sessionIdFromDiv || sessionIdFromUrl,
        serverUrl: serverUrl
    };

    // Send page info to the background script
    chrome.runtime.sendMessage({ type: 'pageInfo', data: pageInfo });

    // Handle incoming messages from the background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const { type, data } = message;
        listener.emit(type, data, sender, sendResponse);
        return true;
    });

    // Define handlers for different message types
    listener.on('click', (data) => {
        document.querySelector(data.selector)?.click();
    });

    listener.on('select', (data) => {
        const element = document.querySelector(data.selector) as HTMLSelectElement;
        if (element) element.value = data.value;
    });

    listener.on('enable', (data) => {
        document.querySelector(data.selector)?.removeAttribute('disabled');
    });

    listener.on('setvalue', (data) => {
        const inputElement = document.querySelector(data.selector) as HTMLInputElement;
        if (inputElement) inputElement.value = data.value;
    });

    listener.on('screenshot', (data) => {
        // Implement screenshot logic if needed
    });

    return listener;
}
