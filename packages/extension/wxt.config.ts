import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Yeshie',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting', 'debugger', 'tabs', 'storage'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Yeshie' }
  }
});
