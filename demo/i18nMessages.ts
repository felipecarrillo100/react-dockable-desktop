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
  'dockable-desktop-anchorToRightEdge': 'Anchor to Right Edge',
  'dockable-desktop-anchorToBottomEdge': 'Anchor to Bottom Edge',
  'dockable-desktop-windowAnchoringOptions': 'Window Anchoring Options',
  'dockable-desktop-unsavedChangesTitle': 'Unsaved Changes',
  'dockable-desktop-unsavedChangesMessage': '"{title}" has unsaved changes. Do you want to discard your changes and close?',
  'dockable-desktop-discardChanges': 'Discard Changes',
  'dockable-desktop-cancel': 'Cancel',
  'dockable-desktop-yes': 'Yes',
  'dockable-desktop-no': 'No',
  'dockable-desktop-ok': 'OK',
  'dockable-desktop-closePanelTooltip': 'Close panel',
  'dockable-desktop-closeTooltip': 'Close',
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
  'dockable-desktop-anchorToRightEdge': 'Anclar al borde derecho',
  'dockable-desktop-anchorToBottomEdge': 'Anclar al borde inferior',
  'dockable-desktop-windowAnchoringOptions': 'Opciones de anclaje de ventana',
  'dockable-desktop-unsavedChangesTitle': 'Cambios sin guardar',
  'dockable-desktop-unsavedChangesMessage': '"{title}" tiene cambios sin guardar. ¿Quieres descartar tus cambios y cerrar?',
  'dockable-desktop-discardChanges': 'Descartar cambios',
  'dockable-desktop-cancel': 'Cancelar',
  'dockable-desktop-yes': 'Sí',
  'dockable-desktop-no': 'No',
  'dockable-desktop-ok': 'Aceptar',
  'dockable-desktop-closePanelTooltip': 'Cerrar panel',
  'dockable-desktop-closeTooltip': 'Cerrar',
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
  'dockable-desktop-anchorToRightEdge': 'Verankeren aan rechterrand',
  'dockable-desktop-anchorToBottomEdge': 'Verankeren aan onderrand',
  'dockable-desktop-windowAnchoringOptions': 'Venster verankeringsopties',
  'dockable-desktop-unsavedChangesTitle': 'Niet-opgeslagen wijzigingen',
  'dockable-desktop-unsavedChangesMessage': '"{title}" heeft niet-opgeslagen wijzigingen. Wilt u uw wijzigingen weggooien en sluiten?',
  'dockable-desktop-discardChanges': 'Wijzigingen weggooien',
  'dockable-desktop-cancel': 'Annuleren',
  'dockable-desktop-yes': 'Ja',
  'dockable-desktop-no': 'Nee',
  'dockable-desktop-ok': 'OK',
  'dockable-desktop-closePanelTooltip': 'Paneel sluiten',
  'dockable-desktop-closeTooltip': 'Sluiten',
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
  'dockable-desktop-anchorToRightEdge': 'Ancrer au bord droit',
  'dockable-desktop-anchorToBottomEdge': 'Ancrer au bord inférieur',
  'dockable-desktop-windowAnchoringOptions': 'Options d\'ancrage de fenêtre',
  'dockable-desktop-unsavedChangesTitle': 'Modifications non enregistrées',
  'dockable-desktop-unsavedChangesMessage': '"{title}" a des modifications non enregistrées. Voulez-vous annuler vos modifications et fermer ?',
  'dockable-desktop-discardChanges': 'Annuler les modifications',
  'dockable-desktop-cancel': 'Annuler',
  'dockable-desktop-yes': 'Oui',
  'dockable-desktop-no': 'Non',
  'dockable-desktop-ok': 'OK',
  'dockable-desktop-closePanelTooltip': 'Fermer le panneau',
  'dockable-desktop-closeTooltip': 'Fermer',
};

// ── Chinese ───────────────────────────────────────────────────────────────────
export const zhMessages: DockableMessages = {
  'dockable-desktop-floatWindow':     '浮动窗口',
  'dockable-desktop-minimizePanel':   '最小化面板',
  'dockable-desktop-closeTab':        '关闭标签页',
  'dockable-desktop-restorePanel':    '还原面板',
  'dockable-desktop-maximizePanel':   '最大化面板',
  'dockable-desktop-closePanel':      '关闭面板',
  'dockable-desktop-dockWindow':      '停靠窗口',
  'dockable-desktop-minimize':        '最小化',
  'dockable-desktop-maximize':        '最大化',
  'dockable-desktop-restoreSize':     '还原大小',
  'dockable-desktop-close':           '关闭',
  'dockable-desktop-closeEmptyGroup': '关闭空白分屏组',
  'dockable-desktop-anchorToRightEdge': '停靠至右侧边缘',
  'dockable-desktop-anchorToBottomEdge': '停靠至底部边缘',
  'dockable-desktop-windowAnchoringOptions': '窗口停靠选项',
  'dockable-desktop-unsavedChangesTitle': '未保存的更改',
  'dockable-desktop-unsavedChangesMessage': '“{title}”有未保存的更改。您想放弃更改并关闭吗？',
  'dockable-desktop-discardChanges': '放弃更改',
  'dockable-desktop-cancel': '取消',
  'dockable-desktop-yes': '是',
  'dockable-desktop-no': '否',
  'dockable-desktop-ok': '确定',
  'dockable-desktop-closePanelTooltip': '关闭面板',
  'dockable-desktop-closeTooltip': '关闭',
};

// ── Arabic ────────────────────────────────────────────────────────────────────
export const arMessages: DockableMessages = {
  'dockable-desktop-floatWindow':     'نافذة عائمة',
  'dockable-desktop-minimizePanel':   'تصغير اللوحة',
  'dockable-desktop-closeTab':        'إغلاق علامة التبويب',
  'dockable-desktop-restorePanel':    'استعادة اللوحة',
  'dockable-desktop-maximizePanel':   'تكبير اللوحة',
  'dockable-desktop-closePanel':      'إغلاق اللوحة',
  'dockable-desktop-dockWindow':      'إرساء النافذة',
  'dockable-desktop-minimize':        'تصغير',
  'dockable-desktop-maximize':        'تكبير',
  'dockable-desktop-restoreSize':     'استعادة الحجم',
  'dockable-desktop-close':           'إغلاق',
  'dockable-desktop-closeEmptyGroup': 'إغلاق مجموعة التقسيم الفارغة',
  'dockable-desktop-anchorToRightEdge': 'إرساء على الحافة اليمنى',
  'dockable-desktop-anchorToBottomEdge': 'إرساء على الحافة السفلية',
  'dockable-desktop-windowAnchoringOptions': 'خيارات إرساء النافذة',
  'dockable-desktop-unsavedChangesTitle': 'تغييرات غير محفوظة',
  'dockable-desktop-unsavedChangesMessage': 'تحتوي "{title}" على تغييرات غير محفوظة. هل تريد تجاهل التغييرات وإغلاقها؟',
  'dockable-desktop-discardChanges': 'تجاهل التغييرات',
  'dockable-desktop-cancel': 'إلغاء',
  'dockable-desktop-yes': 'نعم',
  'dockable-desktop-no': 'لا',
  'dockable-desktop-ok': 'موافق',
  'dockable-desktop-closePanelTooltip': 'إغلاق اللوحة',
  'dockable-desktop-closeTooltip': 'إغلاق',
};
