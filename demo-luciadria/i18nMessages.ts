/**
 * i18n message tables for the Dockable Desktop demo.
 *
 * Each key matches a `PredefinedMessageKey` from the library.
 * Typing each table as `Record<PredefinedMessageKey, string>` gives you a
 * compile-time error if a key is missing or misspelled.
 *
 * The values are the react-intl message strings keyed by message ID.
 * They are registered in the <IntlProvider messages={…} /> wrapper and
 * looked up at runtime via the `formatMessage` prop on <WindowManagerProvider>.
 */

/** Message ID → translated string for every locale. */
export type DockableMessages = Record<string, string>;

// ── English ──────────────────────────────────────────────────────────────────
export const enMessages: DockableMessages = {
  'dockable-desktop-floatWindow':     'Float Window',
  'dockable-desktop-minimizePanel':   'Minimize Panel',
  'dockable-desktop-closeTab':        'Close Tab',
  'dockable-desktop-restorePanel':    'Restore Panel',
  'dockable-desktop-maximizePanel':   'Maximize Panel',
  'dockable-desktop-closePanel':      'Close Panel',
  'dockable-desktop-dockWindow':      'Dock Window',
  'dockable-desktop-minimize':        'Minimize',
  'dockable-desktop-maximize':        'Maximize',
  'dockable-desktop-restoreSize':     'Restore Size',
  'dockable-desktop-close':           'Close',
  'dockable-desktop-closeEmptyGroup': 'Close empty split group',
};

// ── Spanish ───────────────────────────────────────────────────────────────────
export const esMessages: DockableMessages = {
  'dockable-desktop-floatWindow':     'Flotar ventana',
  'dockable-desktop-minimizePanel':   'Minimizar panel',
  'dockable-desktop-closeTab':        'Cerrar pestaña',
  'dockable-desktop-restorePanel':    'Restaurar panel',
  'dockable-desktop-maximizePanel':   'Maximizar panel',
  'dockable-desktop-closePanel':      'Cerrar panel',
  'dockable-desktop-dockWindow':      'Acoplar ventana',
  'dockable-desktop-minimize':        'Minimizar',
  'dockable-desktop-maximize':        'Maximizar',
  'dockable-desktop-restoreSize':     'Restaurar tamaño',
  'dockable-desktop-close':           'Cerrar',
  'dockable-desktop-closeEmptyGroup': 'Cerrar grupo vacío',
};

// ── Dutch ─────────────────────────────────────────────────────────────────────
export const nlMessages: DockableMessages = {
  'dockable-desktop-floatWindow':     'Zwevend venster',
  'dockable-desktop-minimizePanel':   'Paneel minimaliseren',
  'dockable-desktop-closeTab':        'Tabblad sluiten',
  'dockable-desktop-restorePanel':    'Paneel herstellen',
  'dockable-desktop-maximizePanel':   'Paneel maximaliseren',
  'dockable-desktop-closePanel':      'Paneel sluiten',
  'dockable-desktop-dockWindow':      'Venster koppelen',
  'dockable-desktop-minimize':        'Minimaliseren',
  'dockable-desktop-maximize':        'Maximaliseren',
  'dockable-desktop-restoreSize':     'Grootte herstellen',
  'dockable-desktop-close':           'Sluiten',
  'dockable-desktop-closeEmptyGroup': 'Lege splitsingsgroep sluiten',
};

// ── French ────────────────────────────────────────────────────────────────────
export const frMessages: DockableMessages = {
  'dockable-desktop-floatWindow':     'Détacher la fenêtre',
  'dockable-desktop-minimizePanel':   'Réduire le panneau',
  'dockable-desktop-closeTab':        "Fermer l'onglet",
  'dockable-desktop-restorePanel':    'Restaurer le panneau',
  'dockable-desktop-maximizePanel':   'Agrandir le panneau',
  'dockable-desktop-closePanel':      'Fermer le panneau',
  'dockable-desktop-dockWindow':      'Ancrer la fenêtre',
  'dockable-desktop-minimize':        'Réduire',
  'dockable-desktop-maximize':        'Agrandir',
  'dockable-desktop-restoreSize':     'Restaurer la taille',
  'dockable-desktop-close':           'Fermer',
  'dockable-desktop-closeEmptyGroup': 'Fermer le groupe vide',
};
