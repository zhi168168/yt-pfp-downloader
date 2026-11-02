// One route inventory for the static build and the Node server.
export const indexablePaths = ['/', '/about.html', '/contact.html', '/pricing.html', '/privacy.html', '/terms.html', '/refunds.html'];
export function robotsText(origin = '') {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`;
}
export function sitemapXml(origin) {
  const escaped = origin.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexablePaths.map(path => `<url><loc>${escaped}${path}</loc></url>`).join('')}</urlset>`;
}
