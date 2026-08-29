import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Sidebar,
  SecondarySidebar,
  DockableDesktopProvider,
  ModalStackRenderer,
  SidePanelRenderer,
  usePanelActions,
  useFormContainer,
  useSidebarTab,
} from '../src/index';
import type { SidebarHandle, SidebarTab } from '../src/index';

/**
 * Minimal example imitating Google Maps' own UI, including its "Show side bar"
 * toggle:
 * - No app chrome/bar of any kind — the map fills the entire viewport
 *   edge-to-edge, exactly like real Maps. A hamburger + search pill float
 *   directly on top of it (`position: absolute`), entirely outside `<Sidebar>`.
 *   The floating wrapper is `pointer-events: none` so it never blocks clicks
 *   to whatever's underneath (Sidebar's own rail/drawer controls included) —
 *   only the hamburger button itself re-enables `pointer-events: auto`.
 * - Clicking the hamburger opens a real `openLeftPanel()` side panel (the same
 *   SidePanelRenderer feature used elsewhere in this library, not a one-off
 *   dropdown) containing a "Show side bar" switch and the list of options
 *   that only ever open programmatically.
 * - "Show side bar" OFF (default): no persistent rail at all
 *   (`stripVisible={false}`). Each menu item opens a `hidden` SidebarTab —
 *   real drawer content with no rail icon of its own, ever.
 * - "Show side bar" ON: the rail reappears (`stripVisible={true}`), showing
 *   the same hamburger (as a `headerAction`) plus two ordinary, icon-bearing
 *   tabs ("Saved", "Recents") — demonstrating that hidden and regular tabs
 *   coexist in the same rail without conflict.
 * - The Sidebar itself sets `hideDefaultHeader` plus a single `renderHeader`
 *   — the library renders none of its own drawer header for any tab, and
 *   `CustomSidebarHeader` below (a search box plus a close button) renders
 *   instead, uniformly across every tab: "Saved", "Recents", "Your data",
 *   and "Settings" alike.
 * - The Main Menu itself duplicates the tabs already visible in the rail
 *   ("Saved"/"Recents") alongside the rail-less options ("Your data"/
 *   "Settings") — opening a duplicated entry calls the exact same
 *   `openTab()` as clicking its rail icon directly, so that icon's own
 *   active-state highlight shows correctly, with no separate "selected"
 *   concept needed in the Menu.
 * - Dual sidebars: `<SecondarySidebar>` — nested inside the primary's own
 *   `children`, which it must be, since it auto-detects the primary and
 *   takes whichever edge the primary *isn't* using (never specified
 *   directly; throws if there's no primary ancestor, or if nested inside
 *   another `SecondarySidebar`). Same component internals as `Sidebar`
 *   throughout — zero forked code. Its own tabs ("Layers", "Info", plus a
 *   `hidden` one) are reachable from its own rail icons and, via a
 *   "Secondary sidebar" section in the Main Menu, from the primary's side
 *   too — proving the Menu can address either sidebar. Also exercises
 *   `headerAction`, a `hidden` tab, controlled `activeTabId`, and
 *   `useSidebarTab()` from inside its own content — the same feature set
 *   the primary demonstrates, on the secondary too.
 * Run with `npm run dev:sidebar`.
 */

const HamburgerIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const BookmarkIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const HistoryIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// Secondary sidebar's own tab icons — deliberately distinct from the primary's,
// so it's visually obvious which rail a given tab belongs to during testing.
const LayersIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const InfoIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="16" x2="12" y2="11" />
    <line x1="12" y1="8" x2="12" y2="8" />
  </svg>
);

const GearIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const FlaskIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2v6L4 20a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-5-12V2" />
    <path d="M9 2h6" />
    <path d="M7 15h10" />
  </svg>
);

// v6.0.0 test content — shared by the left/right panel and modal actions
// below. A dashed border filling 100% of the body's own box makes the new
// default-0 body padding visible at a glance: the border should touch the
// panel/modal's edges exactly, with no gap, unless bodyPadding overrides it.
const FlushTestContent: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      height: '100%',
      width: '100%',
      boxSizing: 'border-box',
      border: '2px dashed #38bdf8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 12,
      color: 'var(--rdd-text-primary, #f8f9fa)',
      fontSize: 14,
      background:
        'repeating-linear-gradient(45deg, #1a1d24, #1a1d24 10px, #20242c 10px, #20242c 20px)',
    }}
  >
    {label}
    <br />
    v6.0.0: body padding defaults to 0 — this border should touch the edges exactly.
  </div>
);

const testButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--rdd-text-secondary, #5f6368)',
  background: 'transparent',
  color: 'var(--rdd-text-primary, #f8f9fa)',
  fontSize: 14,
  cursor: 'pointer',
  textAlign: 'left',
};

// Proves useSidebarTab() resolves correctly from inside the SECONDARY's own
// content tree (two levels of context nesting deep), not just the top-level
// onClose parameter renderContent already receives.
function SecondaryTabCloseViaContext(): React.ReactElement {
  const { onClose } = useSidebarTab();
  return (
    <button type="button" onClick={onClose} style={testButtonStyle}>
      Close via useSidebarTab()
    </button>
  );
}

interface Section {
  id: string;
  label: string;
  description: string;
}

// Opened only via the hamburger's side panel — never has a rail icon, whether
// the rail is currently shown or not.
const HIDDEN_SECTIONS: Section[] = [
  { id: 'your-data', label: 'Your data', description: 'Location history, timeline, and personal data settings.' },
  { id: 'settings', label: 'Settings', description: 'App preferences — units, notifications, map style.' },
];

// openLeftPanel() only forwards `props` once, at the moment the panel opens — it
// never re-pushes fresh props into an already-open panel instance. A boolean
// passed as a plain prop would render correctly at open time and then go stale
// the moment railVisible changes afterward (e.g. via the switch below), even
// though the underlying toggle action itself keeps working fine (it closes over
// the stable setRailVisible setter, not over a captured value). A live Context
// is what actually keeps content inside an already-open panel in sync with
// state that changes after it opened.
const RailVisibleContext = createContext(false);

// Same staleness problem, same fix, for the secondary sidebar's own rail toggle.
const SecondaryRailVisibleContext = createContext(true);

interface MenuOption {
  id: string;
  label: string;
}

// Shared by both "Show ... sidebar" switches below — avoids duplicating the
// track/thumb markup for what both are, mechanically, the same toggle row.
function ToggleSwitchRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }): React.ReactElement {
  return (
    <label
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{ flex: 1, color: 'var(--rdd-text-primary, #f8f9fa)' }}>{label}</span>
      <span
        style={{
          position: 'relative',
          width: 34,
          height: 18,
          borderRadius: 9,
          background: checked ? '#1a73e8' : 'var(--rdd-text-secondary, #5f6368)',
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}
        />
      </span>
    </label>
  );
}

// A single clickable row shared by both lists below — calls onSelectOption(id)
// (openTab() under the hood) then closes the menu, regardless of whether that
// id belongs to a hidden tab or one that also has its own rail icon.
function MenuOptionButton({ option, onSelect }: { option: MenuOption; onSelect: (id: string) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        color: 'var(--rdd-text-primary, #f8f9fa)',
        fontSize: 14,
        cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {option.label}
    </button>
  );
}

interface MenuPanelProps {
  onToggleRail: () => void;
  // PROOF OF CONCEPT: mirrors onToggleRail above, for the secondary sidebar's
  // own rail visibility — same switch pattern, different target.
  onToggleSecondaryRail: () => void;
  onSelectOption: (id: string) => void;
  // Duplicates the tabs that already have their own rail icon (e.g. "Saved",
  // "Recents") — opening one from here calls the exact same openTab() as
  // clicking its rail icon directly, so when the rail is visible, that icon's
  // own .rdd-active highlight shows correctly. No separate "selected" concept
  // needed here, because it IS that same tab.
  visibleSections: MenuOption[];
  // PROOF OF CONCEPT: opens a tab on the SECONDARY sidebar (nested on the
  // opposite edge, see AppContent below) instead of the primary one — proves
  // the Main Menu can address either sidebar, not just the one it visually
  // belongs to.
  onSelectSecondaryOption: (id: string) => void;
  secondarySections: MenuOption[];
}

// Content of the hamburger's side panel: the "Show side bar"/"Show secondary
// sidebar" switches, the tabs also reachable from the rail (duplicated here
// for when the rail is hidden), the options that only ever exist here with
// no rail icon of their own, and — proof of concept — a third section that
// opens tabs on the SECONDARY sidebar on the opposite edge.
function MenuPanel({
  onToggleRail,
  onToggleSecondaryRail,
  onSelectOption,
  visibleSections,
  onSelectSecondaryOption,
  secondarySections,
}: MenuPanelProps): React.ReactElement {
  const { requestClose } = useFormContainer();
  const railVisible = useContext(RailVisibleContext);
  const secondaryRailVisible = useContext(SecondaryRailVisibleContext);

  const handleSelect = (id: string) => {
    onSelectOption(id);
    requestClose();
  };

  const handleSelectSecondary = (id: string) => {
    onSelectSecondaryOption(id);
    requestClose();
  };

  return (
    <div style={{ padding: '8px 4px' }}>
      <ToggleSwitchRow label="Show side bar" checked={railVisible} onClick={onToggleRail} />
      <ToggleSwitchRow label="Show secondary sidebar" checked={secondaryRailVisible} onClick={onToggleSecondaryRail} />

      <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} />

      {/* Duplicates the tabs already visible in the rail — opening one here
          calls the same openTab(), so its own rail icon shows selected. */}
      {visibleSections.map(option => (
        <MenuOptionButton key={option.id} option={option} onSelect={handleSelect} />
      ))}

      <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} />

      {/* Options with no rail icon of their own, whether the rail is shown or hidden. */}
      {HIDDEN_SECTIONS.map(section => (
        <MenuOptionButton key={section.id} option={section} onSelect={handleSelect} />
      ))}

      <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} />

      {/* PROOF OF CONCEPT: these open tabs on the SECONDARY sidebar (opposite
          edge), not the primary one every other section above controls. */}
      <div style={{ padding: '4px 12px 4px', fontSize: 11, color: 'var(--rdd-text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Secondary sidebar
      </div>
      {secondarySections.map(option => (
        <MenuOptionButton key={option.id} option={option} onSelect={handleSelectSecondary} />
      ))}
    </div>
  );
}

// The Sidebar-level custom header (see `hideDefaultHeader`/`renderHeader` on
// <Sidebar> below): the library renders none of its own drawer header (no
// title span, no showCloseButton close button) for ANY tab once
// hideDefaultHeader is set — this one row, driven by whichever tab is
// currently active, replaces it uniformly across every tab: a search box
// plus a close button. Its close (×) button is wired directly to the same `onClose` every
// renderHeader/renderContent call already receives. When the rail (icon
// strip) is hidden, a hamburger button also appears next to the search box
// — with no rail, its own headerAction hamburger isn't on screen, and the
// floating one is hidden too while any drawer is open, so this is the only
// way to reach the Menu panel in that state. Redundant (and hidden) once the
// rail is visible, since the rail's own hamburger already covers it.
function CustomSidebarHeader({
  tab,
  onClose,
  railVisible,
  onMenuClick,
}: {
  tab: SidebarTab;
  onClose: () => void;
  railVisible: boolean;
  onMenuClick: () => void;
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderBottom: '2px solid #1a73e8',
        background: '#141619',
      }}
    >
      {!railVisible && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Menu"
          title="Menu"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--rdd-text-secondary, #94a3b8)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            flexShrink: 0,
            borderRadius: 4,
          }}
        >
          <HamburgerIcon />
        </button>
      )}
      <input
        type="text"
        placeholder={`Search ${tab.label}`}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '8px 14px',
          borderRadius: 20,
          border: 'none',
          background: '#fff',
          color: '#3c4043',
          fontSize: 14,
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--rdd-text-secondary, #94a3b8)',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          flexShrink: 0,
          borderRadius: 4,
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function AppContent(): React.ReactElement {
  const sidebarRef = useRef<SidebarHandle>(null);
  // The secondary sidebar — see the return JSX below for <SecondarySidebar>,
  // nested inside the primary's own `children` (a hard requirement: it needs
  // to be a real descendant to auto-detect the primary and take the opposite
  // edge). Exercises headerAction, a hidden tab, and controlled activeTabId
  // here too, mirroring the primary's own coverage of each.
  const secondaryRef = useRef<SidebarHandle>(null);
  const [railVisible, setRailVisible] = useState(false);
  const [secondaryRailVisible, setSecondaryRailVisible] = useState(true);
  const [secondaryActiveTabId, setSecondaryActiveTabId] = useState<string | null>(null);
  // Controlled purely so this component knows when the drawer is expanded, to
  // hide the floating hamburger/search overlay below (it otherwise visually
  // overlaps the drawer's own renderHeader row) — Sidebar itself doesn't need
  // this to be controlled for anything else here.
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const { openLeftPanel, openRightPanel, openModal } = usePanelActions();

  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', 'dark');
  }, []);

  const openMenu = () => {
    openLeftPanel(
      MenuPanel,
      {
        onToggleRail: () => setRailVisible(v => !v),
        onToggleSecondaryRail: () => setSecondaryRailVisible(v => !v),
        // Selecting an option just opens the corresponding tab — rail
        // visibility is controlled solely by the "Show side bar" switch and
        // must never be changed as a side effect of picking a menu option.
        onSelectOption: (id: string) => {
          sidebarRef.current?.openTab(id);
        },
        // Duplicates the rail's own tabs into the Menu — visibleTabs is a plain
        // const in this same component body, so it's already initialized by
        // the time this closure actually runs (on click), regardless of
        // declaration order.
        visibleSections: visibleTabs.map(tab => ({ id: tab.id, label: tab.label })),
        // PROOF OF CONCEPT: addresses the SECONDARY sidebar's own openTab(),
        // not the primary's — same pattern as onSelectOption above, just a
        // different ref/target.
        onSelectSecondaryOption: (id: string) => {
          secondaryRef.current?.openTab(id);
        },
        secondarySections: secondaryTabs.map(tab => ({ id: tab.id, label: tab.label })),
      },
      { title: 'Menu' }
    );
  };

  const hiddenTabs: SidebarTab[] = HIDDEN_SECTIONS.map(section => ({
    id: section.id,
    label: section.label,
    hidden: true,
    renderContent: () => (
      <div style={{ padding: 16 }}>
        <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>{section.label}</h4>
        <p style={{ margin: 0, color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
          {section.description}
        </p>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--rdd-text-secondary, #94a3b8)' }}>
          Opened from the hamburger's side panel — this tab has no rail icon, whether
          the rail is currently shown or hidden.
        </p>
      </div>
    ),
  }));

  const visibleTabs: SidebarTab[] = [
    {
      id: 'saved-tab',
      label: 'Saved',
      icon: <BookmarkIcon />,
      renderContent: () => (
        <div style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>Saved</h4>
          <p style={{ margin: 0, color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
            An ordinary tab with a real rail icon — shown here alongside the hidden
            tabs to prove the two coexist without conflict.
          </p>
        </div>
      ),
    },
    {
      id: 'recents-tab',
      label: 'Recents',
      icon: <HistoryIcon />,
      renderContent: () => (
        <div style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>Recents</h4>
          <p style={{ margin: 0, color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
            Another ordinary, icon-bearing tab.
          </p>
        </div>
      ),
    },
    {
      id: 'test-v6-tab',
      label: 'Test v6.0.0',
      icon: <FlaskIcon />,
      renderContent: () => (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>Test v6.0.0</h4>
          <p style={{ margin: '0 0 8px', color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
            Opens a left panel, a right panel, and a modal — each showing the new
            default-0 body padding from v6.0.0.
          </p>
          <button
            type="button"
            onClick={() => openLeftPanel(FlushTestContent, { label: 'Left panel' }, { title: 'Left Panel Test' })}
            style={testButtonStyle}
          >
            Open Left Panel
          </button>
          <button
            type="button"
            onClick={() => openRightPanel(FlushTestContent, { label: 'Right panel' }, { title: 'Right Panel Test' })}
            style={testButtonStyle}
          >
            Open Right Panel
          </button>
          <button
            type="button"
            onClick={() => openModal(FlushTestContent, { label: 'Modal' }, { title: 'Modal Test' })}
            style={testButtonStyle}
          >
            Open Modal
          </button>
        </div>
      ),
    },
  ];

  // The secondary sidebar's own tabs — ordinary, icon-bearing, reachable both
  // from their own rail icon (secondary's rail is independently toggleable,
  // just like the primary's) and from the primary's Main Menu, plus a
  // `hidden` tab with no rail icon at all, mirroring the primary's own
  // "Your data"/"Settings" pattern.
  const secondaryTabs: SidebarTab[] = [
    {
      id: 'layers-tab',
      label: 'Layers',
      icon: <LayersIcon />,
      renderContent: () => (
        <div style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>Layers</h4>
          <p style={{ margin: 0, color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
            Lives on the secondary sidebar, nested on the opposite edge from the primary.
          </p>
        </div>
      ),
    },
    {
      id: 'info-tab',
      label: 'Info',
      icon: <InfoIcon />,
      renderContent: () => (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>Info</h4>
          <p style={{ margin: 0, color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
            Another secondary-sidebar tab, reachable from the primary's Main Menu too.
          </p>
          <SecondaryTabCloseViaContext />
        </div>
      ),
    },
    {
      id: 'secondary-hidden-tab',
      label: 'Secondary Hidden',
      hidden: true,
      renderContent: () => (
        <div style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--rdd-text-primary, #f8f9fa)' }}>Secondary Hidden</h4>
          <p style={{ margin: 0, color: 'var(--rdd-text-secondary, #94a3b8)', fontSize: 14 }}>
            A hidden tab on the secondary sidebar — no rail icon, opened only from
            the Main Menu below, proving hidden-tab parity between primary and secondary.
          </p>
        </div>
      ),
    },
  ];

  return (
    <RailVisibleContext.Provider value={railVisible}>
    <SecondaryRailVisibleContext.Provider value={secondaryRailVisible}>
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      <Sidebar
        ref={sidebarRef}
        position="left"
        defaultWidth={300}
        hideDefaultHeader
        renderHeader={(tab, onClose) => (
          <CustomSidebarHeader tab={tab} onClose={onClose} railVisible={railVisible} onMenuClick={openMenu} />
        )}
        stripVisible={railVisible}
        activeTabId={activeTabId}
        onActiveTabChange={setActiveTabId}
        tabs={[...visibleTabs, ...hiddenTabs]}
        headerAction={{
          icon: <HamburgerIcon />,
          label: 'Menu',
          onClick: openMenu,
        }}
      >
        {/* The secondary sidebar. No `position` prop — SecondarySidebar detects
            the primary above via context and always takes the opposite edge.
            Same underlying Sidebar implementation, zero forked code; exercises
            headerAction/controlled activeTabId here too, mirroring the primary's
            own coverage of both. */}
        <SecondarySidebar
          ref={secondaryRef}
          defaultWidth={260}
          showCloseButton
          stripVisible={secondaryRailVisible}
          activeTabId={secondaryActiveTabId}
          onActiveTabChange={setSecondaryActiveTabId}
          tabs={secondaryTabs}
          headerAction={{
            icon: <GearIcon />,
            label: 'Secondary Menu',
            onClick: () => openRightPanel(
              FlushTestContent,
              { label: 'Secondary headerAction panel' },
              { title: 'Secondary headerAction' }
            ),
          }}
        >
        <div
          style={{
            height: '100%',
            width: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--rdd-text-secondary, #94a3b8)',
            fontSize: 14,
            background:
              'repeating-linear-gradient(45deg, #1a1d24, #1a1d24 10px, #20242c 10px, #20242c 20px)',
          }}
        >
          Map area (placeholder)

          {/* Hamburger + search pill float directly over the map. This div is
              a child of the map area itself (the flex:1 pane Sidebar renders
              its `children` into, already excluding the rail/drawer's own
              width) rather than a sibling positioned against the full
              viewport — so it always lives on the map, never overlapping the
              rail or drawer regardless of how wide either currently is. The
              wrapper itself is pointer-events: none so it never blocks clicks
              to Sidebar's own rail/drawer controls; only the buttons
              re-enable pointer-events. Hidden entirely while a tab's drawer
              is expanded — with the drawer's own renderHeader row occupying
              this same corner then, and no need to reach it once already open. */}
          {activeTabId === null && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              pointerEvents: 'none',
            }}
          >
            {/* The rail's own headerAction already renders this same hamburger
                (see the Menu headerAction on <Sidebar> below) once the rail is
                visible — no need for this floating duplicate then. The search
                pill below is purely decorative. */}
            {!railVisible && (
            <button
              id="external-hamburger"
              type="button"
              aria-label="Menu"
              onClick={openMenu}
              style={{
                pointerEvents: 'auto',
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                border: 'none',
                cursor: 'pointer',
                color: '#5f6368',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
              }}
            >
              <HamburgerIcon />
            </button>
            )}
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 24,
                background: '#fff',
                color: '#5f6368',
                fontSize: 14,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
              }}
            >
              Search demo map
            </div>
          </div>
          )}
        </div>
        </SecondarySidebar>
      </Sidebar>
      <SidePanelRenderer defaultWidth={260} />
      <ModalStackRenderer />
    </div>
    </SecondaryRailVisibleContext.Provider>
    </RailVisibleContext.Provider>
  );
}

export default function App(): React.ReactElement {
  return (
    <DockableDesktopProvider>
      <AppContent />
    </DockableDesktopProvider>
  );
}
