if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('SW registered with scope:', reg.scope);
      
      // Check for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        console.log('SW update found');
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            document.dispatchEvent(new CustomEvent('pwa:update-available'));
          }
        });
      });
    } catch (err) {
      console.error('SW register failed', err);
    }
  });
}
