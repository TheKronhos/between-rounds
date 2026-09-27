import { useRegisterSW } from 'virtual:pwa-register/react';

// Registers the service worker (offline support). When a new version is deployed,
// this shows a banner instead of reloading on its own, so nothing is interrupted.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for a new version whenever the app comes back to the foreground.
      if (!reg) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void reg.update();
      });
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-banner no-print" role="status">
      <span>A new version of the app is ready.</span>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => void updateServiceWorker(true)}>
          Update
        </button>
        <button className="btn btn-quiet" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </div>
  );
}
