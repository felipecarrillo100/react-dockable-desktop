import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Sidebar,
  DockableDesktopProvider,
  SidePanelRenderer,
  usePanelActions,
  useFormContainer,
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

interface MenuOption {
  id: string;
  label: string;
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
  onSelectOption: (id: string) => void;
  // Duplicates the tabs that already have their own rail icon (e.g. "Saved",
  // "Recents") — opening one from here calls the exact same openTab() as
  // clicking its rail icon directly, so when the rail is visible, that icon's
  // own .rdd-active highlight shows correctly. No separate "selected" concept
  // needed here, because it IS that same tab.
  visibleSections: MenuOption[];
}

// Content of the hamburger's side panel: the "Show side bar" switch, the
// tabs also reachable from the rail (duplicated here for when the rail is
// hidden), and — below a second divider — the options that only ever exist
// here, with no rail icon of their own at all.
function MenuPanel({ onToggleRail, onSelectOption, visibleSections }: MenuPanelProps): React.ReactElement {
  const { requestClose } = useFormContainer();
  const railVisible = useContext(RailVisibleContext);

  const handleSelect = (id: string) => {
    onSelectOption(id);
    requestClose();
  };

  return (
    <div style={{ padding: '8px 4px' }}>
      <label
        onClick={onToggleRail}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ flex: 1, color: 'var(--rdd-text-primary, #f8f9fa)' }}>Show side bar</span>
        <span
          style={{
            position: 'relative',
            width: 34,
            height: 18,
            borderRadius: 9,
            background: railVisible ? '#1a73e8' : 'var(--rdd-text-secondary, #5f6368)',
            transition: 'background 0.15s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: railVisible ? 18 : 2,
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
  const [railVisible, setRailVisible] = useState(false);
  // Controlled purely so this component knows when the drawer is expanded, to
  // hide the floating hamburger/search overlay below (it otherwise visually
  // overlaps the drawer's own renderHeader row) — Sidebar itself doesn't need
  // this to be controlled for anything else here.
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const { openLeftPanel } = usePanelActions();

  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', 'dark');
  }, []);

  const openMenu = () => {
    openLeftPanel(
      MenuPanel,
      {
        onToggleRail: () => setRailVisible(v => !v),
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
  ];

  return (
    <RailVisibleContext.Provider value={railVisible}>
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
      </Sidebar>
      <SidePanelRenderer defaultWidth={260} />
    </div>
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
