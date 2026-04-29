import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'DOM Hover Highlighter',
    description: 'Highlight DOM elements by hovering after clicking the extension icon.',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting'],
    action: {
      default_title: 'Highlight DOM elements',
    },
  },
});
