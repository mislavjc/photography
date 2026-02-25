'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// --- localStorage theme store ---
const THEME_CHANGE = 'theme-storage-change';

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_CHANGE, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(THEME_CHANGE, callback);
    window.removeEventListener('storage', callback);
  };
}

function getThemeSnapshot(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'light';
}

function getThemeServerSnapshot(): Theme {
  return 'light';
}

// --- System preference store ---
function subscribeToSystemPreference(callback: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSystemPreferenceSnapshot(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getSystemPreferenceServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  const systemPreference = useSyncExternalStore(
    subscribeToSystemPreference,
    getSystemPreferenceSnapshot,
    getSystemPreferenceServerSnapshot,
  );

  // Derived — no state needed
  const resolvedTheme = theme === 'system' ? systemPreference : theme;

  // Apply theme to DOM (side effect only, no setState)
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem('theme', newTheme);
    window.dispatchEvent(new Event(THEME_CHANGE));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
