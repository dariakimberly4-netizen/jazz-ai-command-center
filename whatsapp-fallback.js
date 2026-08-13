/* Compatibility loader.
   Jazz uses the private Google Apps Script backend for connected services.
   No Supabase runtime or Supabase credentials are loaded by Jazz.
*/
console.info('Jazz connected services use the private Google Apps Script backend.');

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

(function loadJazzAppsScriptAgents(){
  if (document.querySelector('script[data-jazz-apps-script-agents]')) return;
  const script = document.createElement('script');
  script.src = 'jazz-apps-script-agents.js';
  script.dataset.jazzAppsScriptAgents = 'true';
  document.head.appendChild(script);
})();
