import { defineConfig, type DefaultTheme } from 'vitepress'

const repo = 'https://github.com/ivanerricis/easytask-tauri'

type Labels = Record<keyof typeof en, string>

function sidebar(prefix: string, t: Labels): DefaultTheme.Sidebar {
  return [
    {
      text: t.start,
      items: [
        { text: t.introduction, link: `${prefix}/guide/introduction` },
        { text: t.install, link: `${prefix}/guide/install` },
        { text: t.gettingStarted, link: `${prefix}/guide/getting-started` },
      ],
    },
    {
      text: t.using,
      items: [
        { text: t.workspaces, link: `${prefix}/guide/workspaces` },
        { text: t.foldersNotes, link: `${prefix}/guide/folders-and-notes` },
        { text: t.tasks, link: `${prefix}/guide/groups-sections-tasks` },
        { text: t.colors, link: `${prefix}/guide/colors` },
        { text: t.themes, link: `${prefix}/guide/themes` },
        { text: t.automations, link: `${prefix}/guide/automations` },
        { text: t.templates, link: `${prefix}/guide/templates` },
        { text: t.trashArchive, link: `${prefix}/guide/trash-and-archive` },
        { text: t.undo, link: `${prefix}/guide/undo-and-history` },
        { text: t.audio, link: `${prefix}/guide/audio` },
        { text: t.shortcuts, link: `${prefix}/guide/shortcuts` },
      ],
    },
    {
      text: t.settingsData,
      items: [
        { text: t.settings, link: `${prefix}/guide/settings` },
        { text: t.data, link: `${prefix}/guide/data-and-backups` },
        { text: t.updates, link: `${prefix}/guide/updates` },
        { text: t.troubleshooting, link: `${prefix}/guide/troubleshooting` },
      ],
    },
    {
      text: t.development,
      items: [
        { text: t.local, link: `${prefix}/development/local` },
        { text: t.architecture, link: `${prefix}/development/architecture` },
        { text: t.tests, link: `${prefix}/development/tests` },
        { text: t.contributing, link: `${prefix}/development/contributing` },
      ],
    },
  ]
}

const en = {
  guide: 'Guide',
  start: 'Getting started',
  introduction: 'Introduction',
  install: 'Installation',
  gettingStarted: 'First steps',
  using: 'Using EasyTask',
  workspaces: 'Workspaces',
  foldersNotes: 'Folders and notes',
  tasks: 'Groups, sections and tasks',
  colors: 'Colors',
  themes: 'Themes',
  automations: 'Automations',
  templates: 'Templates',
  trashArchive: 'Trash and archive',
  undo: 'Undo and history',
  audio: 'Audio files',
  shortcuts: 'Keyboard shortcuts',
  settingsData: 'Settings and data',
  settings: 'Settings',
  data: 'Data and backups',
  updates: 'Updates',
  troubleshooting: 'Troubleshooting',
  development: 'Development',
  local: 'Local development',
  architecture: 'Architecture',
  tests: 'Tests',
  contributing: 'Contributing',
}

const it: Labels = {
  guide: 'Guida',
  start: 'Per iniziare',
  introduction: 'Introduzione',
  install: 'Installazione',
  gettingStarted: 'Primi passi',
  using: 'Usare EasyTask',
  workspaces: 'Workspace',
  foldersNotes: 'Cartelle e note',
  tasks: 'Gruppi, sezioni e task',
  colors: 'Colori',
  themes: 'Temi',
  automations: 'Automazioni',
  templates: 'Template',
  trashArchive: 'Cestino e archivio',
  undo: 'Annulla e cronologia',
  audio: 'File audio',
  shortcuts: 'Scorciatoie da tastiera',
  settingsData: 'Impostazioni e dati',
  settings: 'Impostazioni',
  data: 'Dati e backup',
  updates: 'Aggiornamenti',
  troubleshooting: 'Risoluzione dei problemi',
  development: 'Sviluppo',
  local: 'Sviluppo in locale',
  architecture: 'Architettura',
  tests: 'Test',
  contributing: 'Contribuire',
}

export default defineConfig({
  title: 'EasyTask',
  base: '/easytask-tauri/',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['logo/**', 'screenshots/**', '**/node_modules/**'],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/easytask-tauri/favicon.svg' }]],
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: 'EasyTask' },
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
    footer: { message: 'MIT License', copyright: 'Copyright © EasyTask contributors' },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description: 'A desktop todo list built on workspaces: folders, notes, groups, sections and tasks, stored on your computer.',
      themeConfig: {
        nav: [
          { text: en.guide, link: '/guide/introduction', activeMatch: '/guide/' },
          { text: en.development, link: '/development/local', activeMatch: '/development/' },
          { text: 'Download', link: `${repo}/releases/latest` },
        ],
        sidebar: sidebar('', en),
        editLink: { pattern: `${repo}/edit/master/docs/:path`, text: 'Edit this page on GitHub' },
      },
    },
    it: {
      label: 'Italiano',
      lang: 'it',
      link: '/it/',
      description: 'Una todo list per desktop basata sui workspace: cartelle, note, gruppi, sezioni e task, salvati sul tuo computer.',
      themeConfig: {
        nav: [
          { text: it.guide, link: '/it/guide/introduction', activeMatch: '/it/guide/' },
          { text: it.development, link: '/it/development/local', activeMatch: '/it/development/' },
          { text: 'Download', link: `${repo}/releases/latest` },
        ],
        sidebar: sidebar('/it', it),
        editLink: { pattern: `${repo}/edit/master/docs/:path`, text: 'Modifica questa pagina su GitHub' },
        outline: { label: 'In questa pagina' },
        docFooter: { prev: 'Pagina precedente', next: 'Pagina successiva' },
        lastUpdated: { text: 'Ultimo aggiornamento' },
        darkModeSwitchLabel: 'Aspetto',
        lightModeSwitchTitle: 'Passa al tema chiaro',
        darkModeSwitchTitle: 'Passa al tema scuro',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Torna in alto',
        langMenuLabel: 'Cambia lingua',
        skipToContentLabel: 'Vai al contenuto',
        notFound: {
          title: 'PAGINA NON TROVATA',
          quote: 'Questa pagina non esiste o è stata spostata.',
          linkLabel: 'vai alla home',
          linkText: 'Torna alla home',
        },
        search: {
          provider: 'local',
          options: {
            translations: {
              button: { buttonText: 'Cerca', buttonAriaLabel: 'Cerca' },
              modal: {
                displayDetails: 'Mostra i dettagli',
                resetButtonTitle: 'Cancella la ricerca',
                backButtonTitle: 'Chiudi la ricerca',
                noResultsText: 'Nessun risultato per',
                footer: {
                  selectText: 'seleziona',
                  selectKeyAriaLabel: 'invio',
                  navigateText: 'naviga',
                  navigateUpKeyAriaLabel: 'freccia su',
                  navigateDownKeyAriaLabel: 'freccia giù',
                  closeText: 'chiudi',
                  closeKeyAriaLabel: 'esc',
                },
              },
            },
          },
        },
      },
    },
  },
})
