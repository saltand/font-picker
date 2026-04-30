import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  hooks: {
    'build:manifestGenerated': (_, manifest) => {
      if (Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 0) {
        delete manifest.content_scripts;
      }
    },
  },
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    version: '0.1.0',
    default_locale: 'en',
    permissions: ['activeTab', 'scripting', 'debugger'],
    action: {
      default_title: '__MSG_extensionActionTitle__',
      default_icon: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        96: 'icons/96.png',
        128: 'icons/128.png',
      },
    },
  },
});
