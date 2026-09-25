// Stand-in for a UI kit (MUI, shadcn/ui, Radix) that has components with the same names as
// react-dockable-desktop 6.x components. The migration must leave these alone.
import React from 'react';
export const Toolbar: React.FC<{ children?: React.ReactNode }> = ({ children }) => <div className="kit-toolbar">{children}</div>;
export const Sidebar: React.FC<{ children?: React.ReactNode }> = ({ children }) => <aside className="kit-sidebar">{children}</aside>;
