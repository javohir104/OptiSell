import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  BarChart3, Boxes, ChevronDown, Crown, FileSpreadsheet, FileUp, Gift, HandCoins, LayoutDashboard, LayoutGrid, Lock, LogOut, MapPin, Moon, Package, Receipt, ShieldCheck, ShoppingCart, Sparkles, Sun, Trophy, Truck, UserRound, Users, X,
} from 'lucide-react';
import { haptic, setBackButton } from '../../telegram';
import Logo from './Logo';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useI18n } from '../../i18n';
import { Button } from '../common/ui';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { cn } from '../../utils/cn';
import Avatar from '../common/Avatar';
import PlanCard from '../common/PlanBadge';
import SupportCard from '../common/SupportCard';
import OfflineBar from './OfflineBar';
import ShopLocationGate from './ShopLocationGate';
import { PLAN_LABEL, hasFeature, isStaff, planFor } from '../../utils/plans';

// `feature` = plan feature the page needs (shown with a lock otherwise); `staff` = sellers see it.
const NAV = [
  { section: 'nav.overview', items: [
    { to: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/analytics', label: 'nav.analytics', icon: BarChart3, feature: 'analytics' },
    { to: '/forecast', label: 'nav.forecast', icon: Sparkles },
    { to: '/shops', label: 'nav.shops', icon: MapPin, staff: true },
  ] },
  { section: 'nav.operations', items: [
    { to: '/sales', label: 'nav.sales', icon: ShoppingCart, staff: true },
    { to: '/customers', label: 'nav.customers', icon: HandCoins, feature: 'debts', staff: true },
    { to: '/products', label: 'nav.products', icon: Package },
    { to: '/inventory', label: 'nav.inventory', icon: Boxes },
    { to: '/suppliers', label: 'nav.suppliers', icon: Truck, feature: 'suppliers' },
    { to: '/expenses', label: 'nav.expenses', icon: Receipt, feature: 'expenses' },
  ] },
  { section: 'nav.data', items: [
    { to: '/import', label: 'nav.import', icon: FileUp },
    { to: '/reports', label: 'nav.reports', icon: FileSpreadsheet, feature: 'analytics' },
  ] },
  { section: 'nav.account', items: [
    { to: '/staff', label: 'nav.staff', icon: Users },
    { to: '/profile', label: 'nav.profile', icon: UserRound, staff: true },
    { to: '/billing', label: 'nav.billing', icon: Crown },
    { to: '/bonus', label: 'nav.bonus', icon: Gift },
    { to: '/contest', label: 'nav.contest', icon: Trophy },
  ] },
];

/** Menu for this user: sellers get only their pages; features the plan lacks stay visible with a lock. */
function navFor(user) {
  const staff = isStaff(user);
  return NAV
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => !staff || (it.staff && (!it.feature || hasFeature(user, it.feature))))
        .map((it) => ({ ...it, locked: !!it.feature && !hasFeature(user, it.feature) })),
    }))
    .filter((g) => g.items.length);
}

// Shown only to role 'admin' (the backend still refuses admin API calls from anyone else).
const ADMIN_NAV = { section: 'nav.adminSection', items: [
  { to: '/admin', label: 'nav.admin', icon: ShieldCheck },
] };

// Phone bottom tab bar: the four most-used screens + "More" (opens the full menu).
const TABS = [
  { to: '/dashboard', label: 'tab.home', icon: LayoutDashboard },
  { to: '/sales', label: 'tab.sales', icon: ShoppingCart },
  { to: '/products', label: 'tab.products', icon: Package },
  { to: '/inventory', label: 'tab.inventory', icon: Boxes },
];
const STAFF_TABS = [
  { to: '/sales', label: 'tab.sales', icon: ShoppingCart },
  { to: '/customers', label: 'nav.customers', icon: HandCoins },
  { to: '/profile', label: 'nav.profile', icon: UserRound },
];
const tabsFor = (user) => (isStaff(user) ? STAFF_TABS.filter((tab) => tab.to !== '/customers' || hasFeature(user, 'debts')) : TABS);

function BottomTabs({ onMore, moreActive }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const TABS = tabsFor(user);
  const itemCls = (active) => cn(
    'press relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors',
    active ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-500 dark:text-zinc-400'
  );
  const Indicator = () => <motion.span layoutId="tab-indicator" className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-600 dark:bg-brand-400" />;
  return (
    <nav aria-label="Tabs" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/90 backdrop-blur-xl lg:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => haptic('select')} className={({ isActive }) => itemCls(isActive && !moreActive)}>
            {({ isActive }) => (<>
              {isActive && !moreActive && <Indicator />}
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive && !moreActive ? 2.4 : 1.9} />
              <span className="max-w-full truncate px-1">{t(label)}</span>
            </>)}
          </NavLink>
        ))}
        <button type="button" onClick={() => { haptic('select'); onMore(); }} className={itemCls(moreActive)} aria-label={t('a11y.openMenu')}>
          {moreActive && <Indicator />}
          <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={moreActive ? 2.4 : 1.9} />
          <span>{t('tab.more')}</span>
        </button>
      </div>
    </nav>
  );
}

function SidebarContent({ onNavigate }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const nav = navFor(user);
  const groups = user?.role === 'admin' ? [...nav, ADMIN_NAV] : nav;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Logo /></div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.section}>
            <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t(group.section)}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, locked, feature }) => (
                <li key={to}>
                  <NavLink
                    to={to} onClick={onNavigate}
                    className={({ isActive }) => cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                    )}
                  >
                    {({ isActive }) => (<>
                      <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300')} />
                      <span className="flex-1">{t(label)}</span>
                      {locked && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title={t('nav.locked', { plan: PLAN_LABEL[planFor(feature)] })}>
                          <Lock className="h-2.5 w-2.5" /> {PLAN_LABEL[planFor(feature)]}
                        </span>
                      )}
                    </>)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <SupportCard compact />
      <PlanCard onNavigate={onNavigate} />
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <Avatar user={user} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-zinc-900 dark:text-zinc-100">{user?.name}</span>
          <span className="block text-xs leading-tight text-zinc-500 dark:text-zinc-400">{user?.businessName || user?.email}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-pop dark:border-zinc-800 dark:bg-zinc-900">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{user?.name}</p>
              <p className="truncate text-xs text-zinc-500">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            {[['/profile', UserRound, 'nav.profile'], ...(isStaff(user) ? [] : [['/billing', Crown, 'nav.billing']]), ...(user?.role === 'admin' ? [['/admin', ShieldCheck, 'nav.admin']] : [])].map(([to, Icon, label]) => (
              <button key={to} type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={() => { setOpen(false); navigate(to); }}>
                <Icon className="h-4 w-4" /> {t(label)}
              </button>
            ))}
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              onClick={() => { logout(); toast.success(t('toast.signedOut')); navigate('/login'); }}>
              <LogOut className="h-4 w-4" /> {t('menu.signOut')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppLayout({ fallback = null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isDark, toggle } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const home = isStaff(user) ? '/sales' : '/dashboard';
  const TABS = tabsFor(user);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Telegram's native back button: closes the menu, otherwise goes back (or home).
  const atHome = location.pathname === home;
  useEffect(() => setBackButton(mobileOpen || !atHome, () => {
    haptic('light');
    if (mobileOpen) setMobileOpen(false);
    else if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(home, { replace: true });
  }), [mobileOpen, atHome, navigate, home]);

  // Pages reachable only through "More" light up that tab.
  const moreActive = mobileOpen || !TABS.some((tab) => location.pathname.startsWith(tab.to));

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-200 bg-white lg:block dark:border-zinc-800 dark:bg-zinc-900">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside className="pt-safe pb-safe absolute inset-y-0 left-0 w-[82%] max-w-xs border-r border-zinc-200 bg-white shadow-pop dark:border-zinc-800 dark:bg-zinc-900"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => { if (info.offset.x < -80 || info.velocity.x < -400) setMobileOpen(false); }}>
              <Button variant="ghost" size="icon" className="absolute right-3 top-3.5" onClick={() => setMobileOpen(false)} aria-label={t('a11y.closeMenu')}><X className="h-5 w-5" /></Button>
              <SidebarContent onNavigate={() => { haptic('select'); setMobileOpen(false); }} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="pt-safe sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/85">
          <div className="flex h-14 items-center gap-1 px-3 sm:h-16 sm:gap-3 sm:px-6">
            <div className="lg:hidden"><Logo /></div>
            <div className="flex-1" />
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => { haptic('light'); toggle(); }} aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}>
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
            <UserMenu />
          </div>
        </header>
        <OfflineBar />
        <ShopLocationGate />
        <main className="pb-tabbar mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:py-8">
          {/* .page-enter = staggered entrance for every page (see index.css); the dashboard animates itself. */}
          <motion.div key={location.pathname} className={location.pathname === '/dashboard' ? undefined : 'page-enter'}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            <Suspense fallback={fallback}><Outlet /></Suspense>
          </motion.div>
        </main>
      </div>

      <BottomTabs onMore={() => setMobileOpen(true)} moreActive={moreActive} />
    </div>
  );
}
