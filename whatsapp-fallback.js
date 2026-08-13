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

(function loadJazzWorkingAgents(){
  if (document.querySelector('script[data-jazz-agent-engine]')) return;
  const script = document.createElement('script');
  script.src = 'jazz-agent-engine.js';
  script.dataset.jazzAgentEngine = 'true';
  document.head.appendChild(script);
})();

(function loadJazzSupabaseCloud(){
  if (document.querySelector('script[data-jazz-supabase-lib]')) return;
  const lib = document.createElement('script');
  lib.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  lib.dataset.jazzSupabaseLib = 'true';
  lib.onload = function(){
    if (document.querySelector('script[data-jazz-supabase-cloud]')) return;
    const cloud = document.createElement('script');
    cloud.src = 'jazz-supabase.js';
    cloud.dataset.jazzSupabaseCloud = 'true';
    document.head.appendChild(cloud);
  };
  document.head.appendChild(lib);
})();
