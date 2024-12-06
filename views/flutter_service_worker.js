// views/flutter_service_worker.js
// Dummy service worker to prevent 404 errors

self.addEventListener('install', event => {
    console.log('Dummy service worker installed.');
  });
  
  self.addEventListener('fetch', event => {
    // Optionally handle fetch events
  });
  