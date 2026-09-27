import { useEffect, useState } from 'react';

// Hash routing (#/week, #/recipes/abc) works on any static host with no server rewrites.

function current(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useRoute(): string {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const onChange = () => {
      setPath(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function navigate(path: string) {
  window.location.hash = path;
}

export const href = (path: string) => `#${path}`;
