import React from 'react';
import { ShieldCheck, LogOut, LayoutDashboard, Search, Inbox, Users, Briefcase } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { NavLink, Outlet } from 'react-router-dom';
import { Input } from './Input';
import { Button } from './Button';

/**
 * GlobalLayout — Fullscreen top navigation header for all administrative/counsellor roles.
 */
export default function GlobalLayout() {
  const { user, logout } = useAuth();
  
  // Define navigation based on role.
  const navItems = [];
  
  if (user?.role?.includes('admin')) {
    navItems.push(
      { label: 'Dashboard', icon: LayoutDashboard, path: `/admin/${user.role.replace('admin_', '')}` },
      { label: 'Cases Directory', icon: Briefcase, path: '/admin/cases' },
      { label: 'Staff Roster', icon: Users, path: '/admin/roster' }
    );
  } else if (user?.role === 'counsellor') {
    navItems.push(
      { label: 'My Queue', icon: Inbox, path: '/counsellor/queue' },
      { label: 'Active Cases', icon: Briefcase, path: '/counsellor/cases' }
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      {/* Top Header Navigation */}
      <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-6 sticky top-0 z-20 shadow-sm w-full">
        {/* Brand & Role & Nav Tabs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center">
            <ShieldCheck className="text-primary-base mr-2" size={22} />
            <span className="font-bold text-lg tracking-tight text-text-main">AAVAZ</span>
            <span className="ml-2.5 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary-muted text-primary-base capitalize">
              {user?.role?.replace('admin_', '') || 'Staff'}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary-muted text-primary-hover font-semibold" 
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-main"
                )}
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Center Search Bar */}
        <div className="flex-1 max-w-md hidden lg:flex items-center relative mx-4">
          <Search className="absolute left-3 text-text-muted" size={16} />
          <Input 
            placeholder="Search cases by ID or Phone..." 
            className="pl-9 bg-background border-border h-9 text-xs w-full focus-visible:ring-1"
          />
        </div>

        {/* Right User & Logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-text-main leading-tight">{user?.name || 'User'}</p>
            <p className="text-[10px] text-text-muted capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
          <Button variant="ghost" size="sm" className="text-text-secondary hover:text-danger-base gap-1.5 text-xs h-8 px-2.5" onClick={logout}>
            <LogOut size={15} />
            <span>Logout</span>
          </Button>
        </div>
      </header>

      {/* Fullscreen Main Content */}
      <main className="flex-1 overflow-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
