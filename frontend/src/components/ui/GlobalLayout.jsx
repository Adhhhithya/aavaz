import React from 'react';
import { ShieldCheck, LogOut, LayoutDashboard, Search, Inbox, Settings, Users, Briefcase } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { NavLink, Outlet } from 'react-router-dom';
import { Input } from './Input';
import { Button } from './Button';

/**
 * GlobalLayout — Unified sidebar and header for all administrative/counsellor roles.
 */
export default function GlobalLayout() {
  const { user, logout } = useAuth();
  
  // Define navigation based on role. 
  // A real implementation might filter this more dynamically.
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
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-surface flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <ShieldCheck className="text-primary-base mr-2" size={24} />
          <span className="font-bold text-lg tracking-tight text-text-main">AAVAZ</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary-muted text-primary-hover" 
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-main"
              )}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-semibold text-text-main">{user?.name || 'User'}</p>
            <p className="text-xs text-text-muted capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-text-secondary" onClick={logout}>
            <LogOut size={18} className="mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex-1 max-w-xl hidden sm:flex items-center relative">
            <Search className="absolute left-3 text-text-muted" size={18} />
            <Input 
              placeholder="Search cases by ID or Phone..." 
              className="pl-10 bg-background border-none w-full max-w-md focus-visible:ring-1"
            />
          </div>
          
          <div className="flex items-center gap-4 ml-auto">
            {/* Mobile menu trigger could go here */}
            <span className="md:hidden font-bold">AAVAZ</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
