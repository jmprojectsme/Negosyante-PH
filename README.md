# Negosyante PH: Business Simulator

A Philippine business simulator: start a distribution company, carinderia, bakery, minimart or laundry shop; hire and manage people under Philippine labor law; keep double-entry books; pay SSS, PhilHealth, Pag-IBIG and BIR on time; answer to a board (or bet your own savings).

**Play:** open `index.html` on GitHub Pages and use "Add to Home screen" to install it as an app. It works offline.

## Files
| File | What it does |
|---|---|
| `index.html`, `style.css` | App shell and styles |
| `data.js` | Laws and rates (wage orders, SSS/PhilHealth/Pag-IBIG, TRAIN, CREATE, EOPT), industries, products, roles |
| `engine.js` | Simulation: calendar, accounting, payroll, HR, operations, taxes, board |
| `features.js` | Stages, market news and trends, new products, supply contracts, job openings, growth advisor |
| `ui.js` | Screens, scenes, mini-games, PWA registration |
| `version.js` | Single version number (used by the service worker cache) |
| `sw.js`, `app.webmanifest`, `icons/` | PWA: offline and installable |

## Releasing an update
Change `APP_VERSION` in `version.js`. Installed copies show "May bagong version! I-update".

Labor and tax rules are simplified for the game and follow Philippine law as of late 2026. Not legal or tax advice.
