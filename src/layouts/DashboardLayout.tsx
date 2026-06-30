import React, { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useUser, useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  MessageSquare, 
  Settings, 
  CreditCard, 
  Menu, 
  X, 
  Sparkles, 
  LogOut, 
  Plus, 
  Bell, 
  User as UserIcon,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function DashboardLayout() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // DashboardLayout renders only when RequireAuth has already confirmed isSignedIn.
  // No additional redirect needed here.

  const menuItems = [
    { name: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Leads', path: '/dashboard/leads', icon: Users },
    { name: 'Appointments', path: '/dashboard/appointments', icon: Calendar },
    { name: 'Conversations', path: '/dashboard/conversations', icon: MessageSquare, badge: 'Live' },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
    { name: 'Billing', path: '/dashboard/billing', icon: CreditCard, disabled: true, badge: 'Soon' },
  ];

  const currentActiveName = menuItems.find(item => item.path === location.pathname)?.name || 'Dashboard';

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 py-6 px-4 fixed h-full z-20">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3 px-2 mb-8">
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-md shadow-indigo-100">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <span className="font-sans font-bold text-xl tracking-tight text-slate-800">LeadFlow</span>
          <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md text-[10px] font-bold">HVAC</span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            if (item.disabled) {
              return (
                <div 
                  key={item.name}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-gray-400 cursor-not-allowed select-none text-sm font-medium"
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="h-4.5 w-4.5" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase">
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive 
                    ? 'bg-indigo-50 text-indigo-700 font-medium shadow-none' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className="h-4.5 w-4.5" />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                    isActive ? 'bg-indigo-200 text-indigo-800' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Tech Support Prompt */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2 mb-4">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
            <Bot className="h-3.5 w-3.5 text-indigo-500" />
            <span>AI Assist Active</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-normal">
            Your landing page widget is live and feeding bookings straight into this CRM workspace.
          </p>
        </div>

        {/* User Card at Bottom */}
        <div className="border-t border-slate-200 pt-4 flex items-center justify-between px-1">
          <div className="flex items-center space-x-3">
            <img 
              src={user?.imageUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face'} 
              alt={user?.firstName} 
              className="h-9 w-9 rounded-full border border-slate-200"
            />
            <div className="leading-tight text-left">
              <p className="text-xs font-medium text-slate-900 truncate max-w-[110px]">{user?.firstName} {user?.lastName}</p>
              <p className="text-[10px] text-slate-500 truncate max-w-[110px]">{user?.email}</p>
            </div>
          </div>
          <button 
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-50 transition"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Page Content Wrapper */}
      <div className="flex-1 flex flex-col lg:pl-64 min-h-screen">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Mobile Hamburger Toggle */}
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display font-bold text-lg text-slate-900">{currentActiveName}</h1>
          </div>

          <div className="flex items-center space-x-4">
            {/* Notifications panel toggle */}
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition relative"
              >
                <Bell className="h-4.5 w-4.5" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-indigo-500"></span>
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)}></div>
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-50 space-y-3"
                    >
                      <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">Recent Activity Alerts</h4>
                      <div className="border-t border-slate-100 my-1"></div>
                      <div className="space-y-3">
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-gray-800">New lead captured via Chatbot</p>
                          <p className="text-gray-500 text-[10px]">Just now • Sarah Jenkins requested AC Repair</p>
                        </div>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-gray-800">Appointment Auto-Scheduled</p>
                          <p className="text-gray-500 text-[10px]">Just now • Scheduled for Mike Reynolds today</p>
                        </div>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-gray-800">Proposal Sent</p>
                          <p className="text-gray-500 text-[10px]">2 hours ago • $8,500 replacement estimate for Robert</p>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* User menu dropdown */}
            <div className="relative">
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-2 p-1 rounded-full border border-gray-200 hover:bg-gray-50 transition"
              >
                <img 
                  src={user?.imageUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face'} 
                  alt={user?.firstName} 
                  className="h-8 w-8 rounded-full"
                />
              </button>

              <AnimatePresence>
                {isUserMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 8 }}
                      className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-2xl shadow-2xl p-2.5 z-50 space-y-1"
                    >
                      <div className="px-3 py-2 border-b border-gray-100 text-left">
                        <p className="text-xs font-bold text-gray-900">{user?.firstName} {user?.lastName}</p>
                        <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
                      </div>
                      <Link 
                        to="/dashboard/settings" 
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-slate-50 transition font-medium"
                      >
                        <UserIcon className="h-4 w-4" />
                        <span>Manage Profile</span>
                      </Link>
                      <button 
                        onClick={() => { setIsUserMenuOpen(false); handleSignOut(); }}
                        className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-red-600 hover:bg-red-50 hover:text-red-700 transition text-left font-medium"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Dashboard Pages Stage */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>

      {/* Mobile Drawer Menu Sidebar */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />

            {/* Menu Slide drawer */}
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 p-6 z-50 flex flex-col justify-between"
            >
              <div className="space-y-8">
                {/* Brand & Close Button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-indigo-600 p-2 rounded-lg text-white">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <span className="font-sans font-bold text-xl tracking-tight text-slate-800">LeadFlow</span>
                  </div>
                  <button 
                    onClick={() => setIsMobileOpen(false)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Mobile Menu Links */}
                <nav className="space-y-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;

                    if (item.disabled) {
                      return (
                        <div 
                          key={item.name}
                          className="flex items-center justify-between px-3 py-2.5 text-slate-400 cursor-not-allowed text-sm font-medium"
                        >
                          <div className="flex items-center space-x-3">
                            <Icon className="h-4.5 w-4.5" />
                            <span>{item.name}</span>
                          </div>
                          {item.badge && (
                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md text-[9px] font-bold">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                          isActive 
                            ? 'bg-indigo-50 text-indigo-700 shadow-none' 
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="h-4.5 w-4.5" />
                          <span>{item.name}</span>
                        </div>
                        {item.badge && (
                          <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md text-[9px] font-bold">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Mobile Sign Out Info */}
              <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img 
                    src={user?.imageUrl} 
                    alt={user?.firstName} 
                    className="h-9 w-9 rounded-full border border-slate-200"
                  />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-slate-900">{user?.firstName} {user?.lastName}</p>
                    <p className="text-[10px] text-slate-500 truncate max-w-[120px]">{user?.email}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setIsMobileOpen(false); handleSignOut(); }}
                  className="p-2 rounded-xl text-red-600 hover:bg-red-50 transition"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
