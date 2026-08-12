/* Compatibility loader.
   The active Jazz WhatsApp fallback is handled by whatsapp-fallback-client.js
   plus the private Google Apps Script backend in google-apps-script/Code.gs.
   This file also loads the safe Facebook Page connection UI without placing
   Meta secrets or Page access tokens in GitHub Pages.
*/
console.info('Jazz WhatsApp fallback is handled by whatsapp-fallback-client.js.');

(function loadJazzFacebookConnector(){
  if (document.querySelector('script[data-jazz-facebook]')) return;
  const script = document.createElement('script');
  script.src = 'facebook-connect-client.js';
  script.dataset.jazzFacebook = 'true';
  document.head.appendChild(script);
})();
