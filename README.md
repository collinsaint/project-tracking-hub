# FL Job Tracker (project-tracking-hub)

A single-page web app for tracking disaster-recovery jobs through the stages Presale → Open → Warranty → Closed. It has views for the Dashboard, Presale, Permitting, Job Queue, Change Orders, Program View, Whiteboard, Metrics, CM Reports, and Tasks.

## How it's built
- Everything is in `index.html` (HTML, CSS, and one inline script). There's no build step.
- Libraries load from a CDN: SheetJS (`xlsx` 0.20.3) and `@supabase/supabase-js` (pinned to 2.45.4).

## How data flows
1. **Seed data:** a job list from a Buildertrend/Excel export is embedded in `index.html` (`const ID=[...]`). `projects_compact.json` is a standalone copy of that export and isn't loaded by the app.
2. **Imports:** the Import buttons read Excel files in the browser with SheetJS (job list, CM column, weekly updates).
3. **Persistence:** data is cached in the browser's `localStorage` and shared through Supabase (tables: `projects`, `project_notes`, `tasks`, `job_start_queue`, `change_order_queue`, `weekly_updates`, `job_weekly_updates`, `permitting_updates`). Jobs are keyed by street address.
4. **Stable job IDs:** each job has a persistent `jobId` stored in its `data` JSON (generated once from the normalized address and kept even if the address later changes). Earlier spellings are kept in `addrAliases`, so notes, queues, tasks, and weekly or permit updates saved under an old address still attach to the job. Supabase rows are still keyed by address, and nothing is deleted when an address changes.
5. **Address matching:** imports compare normalized addresses (case, punctuation, Street/St, directions, units), then aliases, job name, and App ID (`projectNumber`, only when unique).
6. **Unmatched rows:** weekly-update or permit-notes import rows that don't match a job go to the **⚠ Unmatched** list in the header, stored in this browser only. Linking a row saves the update to that job and remembers the spelling as an alias.
7. **Shared queues:** adding or removing a job only writes that one row. Every 60 seconds the app pulls the latest queue from Supabase so everyone's changes show up.
8. **Errors:** failed saves or syncs show a ⚠ toast and log `[sync] ...` to the browser console.

## Deploy
- Vercel builds automatically from GitHub. Pushes to `master` go to production at https://project-tracking-hub.vercel.app. Other branches and PRs get preview URLs.
- GitHub Pages also serves `master`: https://collinsaint.github.io/project-tracking-hub/

## Run locally
Open `index.html` in a browser, or run `python3 -m http.server` and go to http://localhost:8000.
