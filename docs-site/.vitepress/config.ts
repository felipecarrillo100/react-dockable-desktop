import { defineConfig } from 'vitepress'

export default defineConfig({

  title: 'react-dockable-desktop',
  description: 'Premium dockable layout engine for React — zero-unmount DOM preservation, floating windows, i18n/RTL, pub/sub event bus.',
  base: '/react-dockable-desktop/',

  head: [
    ['link', { rel: 'icon', href: '/react-dockable-desktop/favicon.ico' }],
  ],

  themeConfig: {
    logo: { light: '/logo-light.svg', dark: '/logo-dark.svg', alt: 'react-dockable-desktop' },

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'API Reference', link: '/api/', activeMatch: '/api/' },
      {
        text: 'v5.1.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/felipecarrillo100/react-dockable-desktop/blob/main/CHANGELOG.md' },
          { text: 'Migration Guide', link: '/guide/migration' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'WorkspaceClient', link: '/guide/workspace-client' },
            { text: 'Panel Registry', link: '/guide/panel-registry' },
            { text: 'Layout System', link: '/guide/layout' },
          ],
        },
        {
          text: 'Building Real Panels',
          items: [
            { text: 'Panel Lifecycle & Forms', link: '/guide/forms-and-panels' },
            { text: 'Modals & Side Panels', link: '/guide/modals-and-drawers' },
            { text: 'Context Menus', link: '/guide/context-menus' },
            { text: 'Panel Overlay', link: '/guide/panel-overlay' },
            { text: 'Panel Contributions', link: '/guide/panel-contributions' },
            { text: 'Toast Notifications', link: '/guide/toast' },
            { text: 'Event Bus & Communication', link: '/guide/event-bus' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Advanced Topics', link: '/guide/advanced' },
            { text: 'RTL Support', link: '/guide/rtl' },
            { text: 'Custom Theming', link: '/guide/theming' },
            { text: 'Best Practices', link: '/guide/best-practices' },
            { text: 'Migration Guide', link: '/guide/migration' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/felipecarrillo100/react-dockable-desktop' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/react-dockable-desktop' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Felipe Carrillo',
    },

    editLink: {
      pattern: 'https://github.com/felipecarrillo100/react-dockable-desktop/edit/main/docs-site/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },
  },
})
