(() => {
  'use strict';
  const measurementId = 'G-Y7X64WN060';
  const storageKey = 'ytpfp:privacy:v1';
  const lifetime = 180 * 86400000;
  const disableKey = `ga-disable-${measurementId}`;
  let enabled = false;
  window[disableKey] = true;
  const safeURL = value => {
    if (!value) return '';
    try { const url = new URL(value, location.origin); return url.origin + url.pathname; }
    catch { return ''; }
  };
  function savedChoice() {
    try {
      const choice = JSON.parse(localStorage.getItem(storageKey));
      if (typeof choice?.analytics === 'boolean' && choice.at <= Date.now() && Date.now()-choice.at < lifetime) return choice;
    } catch { /* Storage is optional; default to essential cookies only. */ }
    return null;
  }
  function eraseAnalyticsCookies() {
    for (const item of document.cookie.split(';')) {
      const name = item.trim().split('=')[0];
      if (!/^(_ga(?:_|$)|_gid$|_gat(?:_|$))/.test(name)) continue;
      const parts = location.hostname.split('.');
      const domains = ['', ...parts.map((_, i) => parts.slice(i).join('.')).filter(p=>p.includes('.'))];
      for (const domain of domains) for (const path of ['/',location.pathname]) {
        document.cookie = `${name}=; Max-Age=0; Path=${path};${domain ? ` Domain=${domain};` : ''} SameSite=Lax; Secure`;
        if (domain) document.cookie = `${name}=; Max-Age=0; Path=${path}; Domain=.${domain}; SameSite=Lax; Secure`;
      }
    }
  }
  function setAnalytics(allow) {
    window[disableKey] = !allow;
    if (!allow) {
      if (window.gtag) window.gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      eraseAnalyticsCookies(); return;
    }
    // Authentication/reset pages carry sensitive data and are never measured.
    if (enabled || /^\/(?:account(?:\.html)?|api)(?:\/|$)/.test(location.pathname)) return;
    enabled = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    window.gtag('js',new Date());
    window.gtag('config',measurementId,{
      allow_google_signals:false,allow_ad_personalization_signals:false,
      page_location:safeURL(location.href),page_referrer:safeURL(document.referrer),send_page_view:false,
    });
    window.gtag('event','page_view',{page_location:safeURL(location.href),page_referrer:safeURL(document.referrer)});
    const script = document.createElement('script'); script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.id = 'ytpfp-analytics'; document.head.append(script);
  }
  const previous = savedChoice();
  setAnalytics(previous?.analytics === true);
  const region = document.createElement('section');
  region.className = 'privacy-choice'; region.hidden = Boolean(previous);
  region.setAttribute('role','region'); region.setAttribute('aria-label','Cookie preferences');
  region.innerHTML = '<div><strong>Your cookie choice</strong><p>Essential cookies keep sign-in working. Optional Google Analytics helps us understand site usage. Analytics stays off unless you allow it. <a href="/privacy.html">Privacy Policy</a></p></div><div class="privacy-choice-actions"><button type="button" data-privacy="deny">Essential only</button><button type="button" data-privacy="allow">Allow analytics</button></div>';
  const settings = document.createElement('button'); settings.type='button';
  settings.className='privacy-settings'; settings.textContent='Cookie settings';
  function open() { region.hidden=false; region.querySelector('[data-privacy="deny"]').focus(); }
  settings.addEventListener('click',open);
  region.addEventListener('click',event => {
    const action = event.target.closest('[data-privacy]')?.dataset.privacy;
    if (!['allow','deny'].includes(action)) return;
    const analytics = action==='allow';
    try { localStorage.setItem(storageKey,JSON.stringify({analytics,at:Date.now()})); } catch { /* Respect choice for this page even if persistence is blocked. */ }
    setAnalytics(analytics); region.hidden=true;
    // Reload after withdrawal so an already loaded vendor script cannot keep running.
    if (!analytics && document.getElementById('ytpfp-analytics')) location.reload();
  });
  document.body.append(region,settings);
  if (Date.now()<Date.parse('2026-11-17T00:00:00Z')) {
    const notice=document.createElement('aside');notice.className='policy-update';
    notice.innerHTML='Policies updated November 2, 2026. <a href="/terms.html">Read Terms</a> and <a href="/privacy.html">Privacy Policy</a>. Material contractual changes for existing users take effect November 17, 2026.';
    document.body.append(notice);
  }
  if (location.hash==='#cookie-settings') open();
  window.addEventListener('hashchange',()=>{if(location.hash==='#cookie-settings')open();});
  window.addEventListener('storage',event=>{
    if (event.key!==storageKey) return;
    const choice=savedChoice();
    if (!choice?.analytics) { setAnalytics(false); if(document.getElementById('ytpfp-analytics'))location.reload(); }
    else setAnalytics(true);
  });
})();
