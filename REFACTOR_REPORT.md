# G-Brain Refactor Report

## Scope completed
- Converted public card/deck presentation to text-only UI; removed third-party artwork rendering paths from Card Database, Deck Builder, Deck Gallery, deck detail and news cards.
- Added About, Disclaimer, Copyright Policy and Contact pages, plus footer links.
- Kept original G-Brain mascot, favicon and banner assets.
- Added `copyright_cleanup.sql` to clear existing third-party image references and selected copied card text fields while preserving card IDs, deck lists and user-related records.
- Disabled automatic third-party news/card/deck synchronization by default using explicit opt-in environment variables.
- Forced source-image and deck-image settings off in GitHub Actions workflows.
- Updated README with migration and opt-in instructions.

## Important manual step
No Supabase database or production deployment was accessed or modified. Back up the Supabase database, review `copyright_cleanup.sql`, and run it manually in Supabase SQL Editor after the existing schema migrations.

## Default scraper flags
- `NEWS_SYNC_ENABLED=false`
- `CARD_SYNC_ENABLED=false`
- `DECK_SYNC_ENABLED=false`
- `ALLOW_SOURCE_IMAGES=false`
- `ALLOW_DECK_IMAGES=false`
- `STORE_CONTENT=false`

Only enable third-party synchronization after reviewing and confirming the relevant source terms and permissions.

## Checks
- JavaScript syntax checks: PASS for `decks.js`, scraper configuration, scraper entry points, parser, build script and inline JavaScript in `index.html`.
- Scraper unit tests: NOT RUN successfully. The test command could not load the `cheerio` dependency in this environment (`Cannot find module 'cheerio'`); install dependencies with `npm ci --prefix scraper` in a network-enabled environment and rerun `npm test --prefix scraper`.
- Supabase SQL migration: NOT EXECUTED. Requires user review and database backup.
- Production deployment: NOT PERFORMED.

## Remaining items
- Add a real contact email or controlled reporting channel before launch.
- Review remaining news summaries, user-submitted content, deck source data and repository history for rights/terms issues.
- Have Thai IP counsel review the public website and source-data plan if you intend to operate it publicly.
