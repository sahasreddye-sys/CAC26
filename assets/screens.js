'use strict';

// Every screen is a part of index.html, shown or hidden by the address after
// "#/". The site has to stay one page: with no storage allowed, moving to a
// separate HTML file would lose the budget the family typed in.
//
//   #/budget                      budget worksheet (also the default)
//   #/homes                       home lookup and map
//   #/home/forsyth/<parcel id>    one home (the Detail tab)
//   #/detail                      Detail tab with no home picked yet
//
// Links from the older site (#forsyth/<id>) still open the home.

function parseScreenRoute(hash) {
  const h = decodeURIComponent(hash || '');
  let m = h.match(/^#\/homes?(?:\/(forsyth)(?:\/(.+))?)?$/) || h.match(/^#(forsyth)(?:\/(.+))?$/);
  if (m) return { screen: m[2] ? 'detail' : 'homes', market: m[1] || null, id: m[2] || null };
  if (h === '#/detail') return { screen: 'detail', market: null, id: null };
  return { screen: 'budget' };
}

const APP_NAME = 'Forsyth MarketMap';
const SCREEN_TITLES = { budget: 'Budget', homes: 'Homes', detail: 'Home detail' };

function markScreenTabs(route) {
  const tab = route.screen;
  document.querySelectorAll('[data-screen-link]').forEach(a => {
    if (a.dataset.screenLink === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('screenName').textContent = SCREEN_TITLES[tab];
  document.title = SCREEN_TITLES[tab] + ' · ' + APP_NAME;
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
