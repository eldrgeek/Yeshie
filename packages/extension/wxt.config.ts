import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  manifest: {
    name: 'Yeshie',
    version: '0.1.412',
    permissions: ['activeTab', 'scripting', 'debugger', 'tabs', 'storage', 'alarms', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Yeshie' },
    side_panel: {
      default_path: 'sidepanel/index.html'
    },
    commands: {
      'toggle-recording': {
        suggested_key: {
          default: 'Ctrl+Alt+R',
          mac: 'MacCtrl+Alt+R',
        },
        description: 'Toggle Do-It-Once recording (⌃⌥R)',
      },
    },
  }
});
