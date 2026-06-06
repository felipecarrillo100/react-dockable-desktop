import React from 'react';

interface SidebarTabsProps {
  activeTab: string | null;
  onTabClick: (tab: string) => void;
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onTabClick }) => {
  const tabs = [
    {
      id: 'search',
      label: 'Search Results',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      ),
    },
    {
      id: 'edit_measure',
      label: 'Edit and Measure',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.3 8.11a2.24 2.24 0 0 0 0-3.17l-1.24-1.24a2.24 2.24 0 0 0-3.17 0L3 17.6V21h3.4l14.9-12.89Z" />
          <line x1="8.5" y1="9.5" x2="14.5" y2="15.5" />
          <line x1="11.5" y1="6.5" x2="17.5" y2="12.5" />
        </svg>
      ),
    },
    {
      id: 'windows',
      label: 'Windows List',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
  ];

  return (
    <div 
      className="d-flex flex-column align-items-center bg-body-tertiary border-start border-secondary-subtle py-3"
      style={{ width: '56px', height: '100%', gap: '12px', flexShrink: 0 }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id)}
            className={`btn btn-link p-0 d-flex align-items-center justify-content-center rounded-3 position-relative ${
              isActive ? 'text-primary' : 'text-secondary'
            }`}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: isActive ? 'var(--bs-primary-border-subtle, rgba(170, 59, 255, 0.15))' : 'transparent',
              transition: 'all 0.2s ease',
              border: isActive ? '1px solid rgba(170, 59, 255, 0.3)' : '1px solid transparent',
            }}
            title={tab.label}
          >
            {tab.icon}
            {isActive && (
              <span 
                className="position-absolute end-0 bg-primary" 
                style={{ width: '3px', height: '16px', top: '12px', borderRadius: '4px 0 0 4px' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
