/* Jazz WhatsApp fallback loader.
   Keeps the older inline/client setup from creating a second UI, then loads the
   maintained WhatsApp fallback module from whatsapp-fallback/jazz-fallback.js.
*/
(() => {
  'use strict';

  // Disable the older browser-only presence client if it was loaded by index.html.
  try { window.JazzWhatsAppFallback?.disable?.(); } catch (_) {}

  // Remove the older duplicate WhatsApp row/setup so Kimmy sees one clear control.
  const legacyStatus = document.querySelector('#waFallbackStatus');
  legacyStatus?.closest('.row')?.remove();
  document.querySelector('#waFallbackSetup')?.remove();

  // Load the maintained 9 AM report + 9:15 WhatsApp fallback UI.
  if (document.querySelector('script[data-jazz-whatsapp-maintained]')) return;
  const script = document.createElement('script');
  script.src = './whatsapp-fallback/jazz-fallback.js';
  script.defer = true;
  script.dataset.jazzWhatsappMaintained = 'true';
  document.body.appendChild(script);
})();
