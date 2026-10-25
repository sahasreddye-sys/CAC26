'use strict';

// Every screen is a part of index.html, shown or hidden by the address after
// "#/". The site has to stay one page: with no storage allowed, moving to a
// separate HTML file would lose the budget the family typed in.
//
//   (no hash) or #/               home page (the default)
//   #/budget                      budget worksheet
//   #/homes                       home lookup and map
//   #/home/forsyth/<parcel id>    one home (the Detail tab)
//   #/detail                      Detail tab with no home picked yet
//   #/about                       about the project (linked from the footer)
//   #/methods                     how good the estimates are, with error charts
//   #/compare/forsyth/<id>,<id>   Detail with up to three homes side by side
//
// Links from the older site (#forsyth/<id>) still open the home.

function parseScreenRoute(hash) {
  const h = decodeURIComponent(hash || '');
  if (h === '' || h === '#' || h === '#/') return { screen: 'welcome' };
  if (h === '#/budget') return { screen: 'budget' };
  let m = h.match(/^#\/homes?(?:\/(forsyth)(?:\/(.+))?)?$/) || h.match(/^#(forsyth)(?:\/(.+))?$/);
  if (m) return { screen: m[2] ? 'detail' : 'homes', market: m[1] || null, id: m[2] || null };
  if (h === '#/detail') return { screen: 'detail', market: null, id: null };
  if (h === '#/about') return { screen: 'about' };
  if (h === '#/methods') return { screen: 'methods' };
  // shared compare link: parcel IDs only, never budget numbers
  m = h.match(/^#\/compare\/(forsyth)\/(.+)$/);
  if (m) { const ids = m[2].split(',').filter(Boolean); return { screen: 'detail', market: m[1], id: ids[0], compare: ids }; }
  return { screen: 'welcome' }; // unknown or old addresses land on the home page
}

const APP_NAME = 'Abode';
const SCREEN_TITLES = { welcome: 'Home', budget: 'Budget', homes: 'Homes', detail: 'Home detail', about: 'About', methods: 'Methods' };

function markScreenTabs(route) {
  const tab = route.screen;
  document.querySelectorAll('[data-screen-link]').forEach(a => {
    if (a.dataset.screenLink === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = tab === 'welcome' ? APP_NAME + ': a home-buying worksheet for Forsyth County' : SCREEN_TITLES[tab] + ' · ' + APP_NAME;
}

function showScreen(route) {
  document.querySelectorAll('[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== route.screen; });
  markScreenTabs(route);
  const target = route.section && document.getElementById(route.section);
  if (target) target.scrollIntoView();
  else if (!route.id) window.scrollTo(0, 0);
}

let currentScreen = parseScreenRoute(location.hash).screen;
showScreen(parseScreenRoute(location.hash));
window.addEventListener('hashchange', () => {
  const route = parseScreenRoute(location.hash);
  currentScreen = route.screen;
  showScreen(route);
});

// The small (i) buttons and the "what's this?" words: each opens a short explanation in place.
// Every button that names a panel in aria-controls (the icon, or a text link) opens the same panel.
document.addEventListener('click', e => {
  const btn = e.target.closest('[aria-controls^="info-"], [aria-controls^="g-"]');
  if (!btn) return;
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  const open = panel.hidden;
  panel.hidden = !open;
  document.querySelectorAll(`[aria-controls="${panel.id}"]`).forEach(b => b.setAttribute('aria-expanded', String(open)));
  if (open && !btn.classList.contains('info-btn')) panel.scrollIntoView({ block: 'nearest' });
});
