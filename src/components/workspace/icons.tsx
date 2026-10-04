/**
 * @file icons.tsx
 * @description Icons drawn by the workspace: the default panel icon and the context-menu item icons.
 */


export const DefaultGridIcon: React.ReactElement = (
  <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

export const ContextMenuIcons: Record<'float' | 'minimize' | 'restore' | 'maximize' | 'close', React.ReactElement> = {
  // Two offset equal rects — Windows "restore-down / new window" language
  float: (
    <span className="rdd-menu-icon">
      <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="8" width="14" height="14" rx="1"/>
        <rect x="8" y="2" width="14" height="14" rx="1"/>
      </svg>
    </span>
  ),
  // Single horizontal dash — Windows minimize language
  minimize: (
    <span className="rdd-menu-icon">
      <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="18" x2="20" y2="18"/>
      </svg>
    </span>
  ),
  // Single inset rect — restore to normal windowed state
  restore: (
    <span className="rdd-menu-icon">
      <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="1"/>
      </svg>
    </span>
  ),
  // Near-full rect — maximize / fill workspace
  maximize: (
    <span className="rdd-menu-icon">
      <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="1"/>
      </svg>
    </span>
  ),
  // × — close
  close: (
    <span className="rdd-menu-icon">
      <svg className="rdd-svg-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </span>
  ),
};
