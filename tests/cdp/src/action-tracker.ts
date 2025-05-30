#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

interface ActionEvent {
  timestamp: string;
  type: string;
  details: any;
  target?: string;
}

class ActionTracker {
  private client: any;
  private actions: ActionEvent[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  private logAction(type: string, details: any, target?: string) {
    const action: ActionEvent = {
      timestamp: new Date().toISOString(),
      type,
      details,
      target
    };
    this.actions.push(action);
    console.log(`🎯 ${action.timestamp}: ${type}`, details);
  }

  async startTracking() {
    try {
      console.log('🔍 Starting browser action tracking...');
      console.log('📍 Connecting to Chrome DevTools Protocol...\n');

      this.client = await CDP({ port: 9222 });
      const { Page, Runtime, DOM, Network, Input } = this.client;

      // Enable all domains we want to track
      await Page.enable();
      await Runtime.enable();
      await DOM.enable();
      await Network.enable();
      await Input.enable();

      // Track page navigation
      Page.frameNavigated((params: any) => {
        this.logAction('PAGE_NAVIGATION', {
          url: params.frame.url,
          loaderId: params.frame.loaderId
        });
      });

      // Track page load events
      Page.loadEventFired(() => {
        this.logAction('PAGE_LOADED', { event: 'DOMContentLoaded' });
      });

      Page.domContentEventFired(() => {
        this.logAction('DOM_READY', { event: 'DOM Content Loaded' });
      });

      // Track console messages (user might trigger console logs)
      Runtime.consoleAPICalled((params: any) => {
        this.logAction('CONSOLE_MESSAGE', {
          type: params.type,
          args: params.args.map((arg: any) => arg.value || arg.description || arg.type).join(' ')
        });
      });

      // Track network requests
      Network.requestWillBeSent((params: any) => {
        this.logAction('NETWORK_REQUEST', {
          url: params.request.url,
          method: params.request.method,
          resourceType: params.type
        });
      });

      // Track mouse clicks (we'll inject a click listener)
      await Runtime.evaluate({
        expression: `
          document.addEventListener('click', function(event) {
            console.log('CLICK_EVENT', {
              element: event.target.tagName,
              className: event.target.className,
              id: event.target.id,
              text: event.target.textContent?.substring(0, 50),
              x: event.clientX,
              y: event.clientY
            });
          }, true);
          
          document.addEventListener('input', function(event) {
            console.log('INPUT_EVENT', {
              element: event.target.tagName,
              type: event.target.type,
              id: event.target.id,
              value: event.target.value?.substring(0, 100)
            });
          }, true);
          
          document.addEventListener('keydown', function(event) {
            if (event.key.length === 1 || ['Enter', 'Backspace', 'Delete', 'Tab'].includes(event.key)) {
              console.log('KEY_EVENT', {
                key: event.key,
                element: event.target.tagName,
                id: event.target.id
              });
            }
          }, true);
          
          window.addEventListener('focus', function(event) {
            console.log('FOCUS_EVENT', {
              element: event.target.tagName,
              id: event.target.id,
              type: event.target.type
            });
          }, true);
        `
      });

      console.log('✅ Action tracking started!');
      console.log('👀 Monitoring your browser actions...');
      console.log('🛑 Press Ctrl+C to stop and see summary\n');

      // Keep tracking until interrupted
      process.on('SIGINT', () => {
        this.stopTracking();
      });

      // Keep alive
      setInterval(() => {
        // Just keep process alive
      }, 1000);

    } catch (error: any) {
      console.error('❌ Failed to start tracking:', error.message);
      console.log('\n💡 Make sure Chrome is running with debugging enabled:');
      console.log('   ./restart-chrome-with-debugging-fix.sh');
      process.exit(1);
    }
  }

  async stopTracking() {
    console.log('\n🏁 Stopping action tracking...');
    console.log('📊 ACTION SUMMARY:');
    console.log('==================\n');

    const actionsByType = this.actions.reduce((acc: any, action) => {
      acc[action.type] = (acc[action.type] || 0) + 1;
      return acc;
    }, {});

    console.log('📈 Action counts:');
    Object.entries(actionsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    console.log('\n📝 Detailed action log:');
    this.actions.forEach((action, i) => {
      console.log(`${i + 1}. [${action.timestamp}] ${action.type}`);
      if (action.details) {
        console.log(`   Details:`, JSON.stringify(action.details, null, 2));
      }
    });

    const duration = Date.now() - this.startTime;
    console.log(`\n⏱️ Total tracking time: ${Math.round(duration / 1000)} seconds`);
    console.log(`📊 Total actions captured: ${this.actions.length}`);

    if (this.client) {
      await this.client.close();
    }
    process.exit(0);
  }
}

const tracker = new ActionTracker();
tracker.startTracking().catch(console.error); 