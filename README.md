# Negosyante PH: Business Simulator

A Philippine business simulator: start a distribution company, carinderia, bakery, minimart, laundry shop, trucking company, IT services firm, or LED lighting & solar distributor; hire and manage people under Philippine labor law; keep double-entry books; pay SSS, PhilHealth, Pag-IBIG and BIR on time; answer to a board (or bet your own savings).

**Play:** open `index.html` on GitHub Pages and use "Add to Home screen" to install it as an app. It works offline.

## Files
| File | What it does |
|---|---|
| `index.html`, `style.css` | App shell and styles |
| `data.js` | Laws and rates (wage orders, SSS/PhilHealth/Pag-IBIG, TRAIN, CREATE, EOPT), industries, products, roles |
| `engine.js` | Simulation: calendar, accounting, payroll, HR, operations, taxes, board |
| `features.js` | Stages, market news and trends, new products, supply contracts, job openings, growth advisor |
| `approvals.js` | Staff recommendations you approve (raises, bonus, hiring, payment vouchers, prices, contracts) and resignations |
| `industries.js` | Industry mechanics: dollar rate for imports, solar projects with stage billing |
| `audio.js` | Sound effects (WebAudio, no files) |
| `ui.js` | Screens, scenes, mini-games, main menu and save slots, PWA registration |
| `version.js` | Single version number (used by the service worker cache) |
| `sw.js`, `app.webmanifest`, `icons/` | PWA: offline and installable |

## Releasing an update
Change `APP_VERSION` in `version.js`. Installed copies show "May bagong version! I-update".

Labor and tax rules are simplified for the game and follow Philippine law as of late 2026. Not legal or tax advice.
