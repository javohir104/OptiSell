import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { syncTelegramTheme, telegramColorScheme } from '../telegram';

const ThemeContext = createContext(null);
const KEY = 'optisell_theme';

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* ignore */ }
  const tgScheme = telegramColorScheme();
  if (tgScheme) return tgScheme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    syncTelegramTheme(theme === 'dark');
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark' }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
