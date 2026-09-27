import type { ReactNode } from 'react';
import { IconSettings, IconWeek } from './components/Icons';
import { href, useRoute } from './lib/router';
import { RecipeScreen } from './screens/Recipe';
import { SettingsScreen } from './screens/Settings';
import { WeekScreen } from './screens/Week';
import { UpdateBanner } from './components/UpdateBanner';

// Tabs appear here as each build phase lands.
const TABS: { path: string; label: string; icon: ReactNode }[] = [
  { path: '/week', label: 'Week', icon: <IconWeek /> },
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
  return { tab: '/week', node: <WeekScreen /> };
}

export function App() {
  const path = useRoute();
  const { tab, node } = screenFor(path);
  return (
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
    </div>
  );
}
