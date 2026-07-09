import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  manifest: {
    name: 'Yeshie',
    version: '0.1.485',
    permissions: ['activeTab', 'scripting', 'debugger', 'tabs', 'storage', 'alarms', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Yeshie' },
    side_panel: {
      default_path: 'sidepanel/index.html'
    },
    commands: {
      'toggle-recording': {
        suggested_key: {
          // NOTE: 'Ctrl+Alt+R' as default is rejected by Chrome 149+ on macOS
          // ("Invalid value for commands[N].default: Ctrl+Alt+R").
          // Chrome rejects the extension at load time, causing --load-extension to silently fail.
          // Mac-only key is sufficient since Yeshie is macOS-only in production.
          mac: 'MacCtrl+Shift+R',
        },
        description: 'Toggle Do-It-Once recording (⌃⇧R)',
      },
    },
  }
});
