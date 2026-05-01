/**
 * Register service worker for offline support
 * Call this on app initialization
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') {
    // console.log('[SW Register] ❌ Server-side, skipping');
    return; // Server-side
  }

  // console.log('[SW Register] ✓ Running in browser');

  if (!('serviceWorker' in navigator)) {
    console.error('[SW Register] ❌ Service workers NOT supported by browser');
    return;
  }

  // console.log('[SW Register] ✓ Service workers supported');
  // console.log('[SW Register] Attempting to register /sw.js...');

  // Register immediately, don't wait for load event
  navigator.serviceWorker
    .register('/sw.js', {
      scope: '/',
    })
    .then((registration) => {
      // console.log('[SW Register] ✓✓✓ SUCCESS! Service worker registered');
      // console.log('[SW Register] Scope:', registration.scope);
      // console.log('[SW Register] Controller:', navigator.serviceWorker.controller);

      // Handle service worker updates
      registration.addEventListener('updatefound', () => {
        // console.log('[SW Register] Update found');
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          console.log('[SW Register] Worker state:', newWorker.state);
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW Register] New service worker ready (refresh to apply)');
          }
        });
      });

      // Periodically check for updates
      setInterval(() => {
        // console.log('[SW Register] Checking for updates...');
        registration.update().catch((err) => {
          console.error('[SW Register] Update check failed:', err);
        });
      }, 60000); // Check every minute
    })
    .catch((error) => {
      console.error('[SW Register] ❌❌❌ Registration FAILED!');
      console.error('[SW Register] Error type:', error.constructor.name);
      console.error('[SW Register] Error message:', error.message);
      console.error('[SW Register] Full error:', error);

      // Diagnose
      if (error.message.includes('404')) {
        console.error('[SW Register] → /sw.js file not found! Verify public/sw.js exists');
      }
      if (error.message.includes('NetworkError')) {
        console.error('[SW Register] → Network error, is dev server running?');
      }
      if (error.message.includes('cross-origin')) {
        console.error('[SW Register] → Cross-origin error, check scope and URL');
      }
    });
}
