import type { ReactNode } from 'react';
import { AddButton } from './components/AddButton';
import { EntrySheetProvider } from './components/EntrySheetContext';
import { IconLog, IconSettings, IconToday, IconWeek } from './components/Icons';
import { ToastProvider } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import { href, useRoute } from './lib/router';
import { LogScreen } from './screens/Log';
import { RecipeScreen } from './screens/Recipe';
import { SettingsScreen } from './screens/Settings';
import { TodayScreen } from './screens/Today';
import { WeekScreen } from './screens/Week';

// Tabs appear here as each build phase lands.
const TABS: { path: string; label: string; icon: ReactNode }[] = [
  { path: '/today', label: 'Today', icon: <IconToday /> },
  { path: '/week', label: 'Week', icon: <IconWeek /> },
  { path: '/log', label: 'Log', icon: <IconLog /> },
  { path: '/settings', label: 'Settings', icon: <IconSettings /> },
];

function screenFor(fullPath: string): { tab: string; node: ReactNode } {
  const [path, query = ''] = fullPath.split('?');
  const params = new URLSearchParams(query);
  const recipe = path.match(/^\/recipes\/(.+)$/);
  if (recipe) {
    const id = decodeURIComponent(recipe[1]);
    return { tab: '/week', node: <RecipeScreen key={id} id={id} variantId={params.get('v') ?? undefined} /> };
  }
  if (path.startsWith('/settings')) return { tab: '/settings', node: <SettingsScreen /> };
  if (path.startsWith('/week')) return { tab: '/week', node: <WeekScreen /> };
  if (path.startsWith('/log')) return { tab: '/log', node: <LogScreen /> };
  return { tab: '/today', node: <TodayScreen /> };
}

export function App() {
  const path = useRoute();
  const { tab, node } = screenFor(path);
  return (
    <ToastProvider>
      <EntrySheetProvider>
        <div className="app">
          <nav className="nav" aria-label="Main">
            {TABS.map((t) => (
              <a key={t.path} href={href(t.path)} aria-current={tab === t.path ? 'page' : undefined}>
                {t.icon}
                {t.label}
              </a>
            ))}
          </nav>
          <main className="main">
            <UpdateBanner />
            {node}
          </main>
          <AddButton />
        </div>
      </EntrySheetProvider>
    </ToastProvider>
  );
}
