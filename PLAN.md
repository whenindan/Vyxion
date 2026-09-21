# Vyxion — Multiphase Implementation Plan

## Context

Vyxion is an AI-native EFB for GA pilots (README.md, SPEC.md). The repo today is a bare Expo SDK 57 / expo-router tabs template (`app/`, `components/`, `constants/`) with zero domain code. SPEC §11 gives a build order; this plan turns it into phases with requirements, tasks, and exit criteria, adds the foundation phase the spec assumes but doesn't list, and re-sequences the two places where §11's order has a dependency inversion (NASR airport/navaid data is needed by the nav log in step 3, not step 8; terrain is needed by altitude optimization in step 4).

Decisions made (with user, 2026-09-20):
- **Backend:** Supabase (Postgres + PostGIS, Auth, Storage) + a separate containerized **TypeScript worker/API service** for heavy compute (GRIB2 decode via `wgrib2`, NASR/chart ingest, optimizer, ADS-B).
- **Repo:** npm-workspaces monorepo. Current Expo app moves to `apps/mobile`.
- **Perf data:** full user-entry UI/schema + one shipped, verified C172S dataset as seed (flag for licensing review). OCR/LLM extraction deferred to Phase 9.

Verified against Expo v57 docs (AGENTS.md requirement):
- `expo-sqlite`: `openDatabaseAsync`, `SQLiteProvider` w/ `onInit` migrations, libSQL sync, SQLCipher, `expo-sqlite/kv-store`. Web is alpha — **mobile-only for storage**.
- `expo-file-system`: new `File`/`Directory`/`Paths` API, resumable `DownloadTask`; legacy API is at `expo-file-system/legacy` and throws from main export.
- `expo-maps`: alpha, no custom raster tiles, no offline → **use `@maplibre/maplibre-react-native`** (offline packs, raster sources) for charts. Requires dev builds (no Expo Go) — that's fine, SQLCipher and MapLibre both need it anyway.

---

## Target architecture

```
vyxion/
  apps/mobile/            Expo 57 app (moved from root). expo-router, expo-sqlite, MapLibre.
  packages/core/          Pure TS, zero RN/Node deps. All aviation math + domain types.
                          Runs identically on device (offline nav log) and server (optimizer).
  packages/db/            Drizzle schema for Postgres (server) + SQLite (client), migrations.
  packages/data-contracts/ Zod schemas for API + sync payloads; dataset manifest format.
  services/api/           Node/TS (Hono). Optimizer endpoint, wind-cube subset server,
                          dataset manifests, chatbot orchestration. Docker.
  services/ingest/        Node/TS workers, Docker w/ wgrib2 + GDAL. Weather (HRRR/RAP/GFS),
                          NASR 28-day cycle, charts → MBTiles, NOTAM/TFR poll, ADS-B ops
                          detection, eCFR/AIM corpus. Each ingest writes a versioned
                          dataset manifest (effective_from/to, source, checksum).
  supabase/               migrations, RLS policies, edge functions (thin), seed.
```

Two storage tiers on the client — this is the §1.4 design implication:
1. **User-owned mutable data** (pilot profile, aircraft profiles, plans, logbook, briefing records) → SQLite via PowerSync-style sync (offline write queue, LWW + per-entity conflict rules). Recommended: **PowerSync** (Supabase-native RN SDK). Fallback if rejected: hand-rolled outbox table + `updated_at` LWW.
2. **Reference datasets** (NASR, charts, terrain tiles, corpus, cached weather) → versioned read-only bundles downloaded by region/cycle into SQLite tables + files under `Paths.document`. Never "synced"; swapped atomically on cycle change. Every bundle carries `effective_from`, `effective_to`, `issued_at`; a `datasets` table on the client is the single source for currency enforcement (§1.5).

Cross-cutting rules enforced from Phase 0 (each gets a lint rule, a type, or a test):
- All timestamps `Date`/ISO UTC; local display only through `core/time` (§7).
- Every computed flight-critical number carries `Provenance { source, tableId, cycle, cellRefs }` — the type makes it non-optional (README non-negotiable).
- `Result<T, Degraded>` pattern: missing data returns a typed degradation reason, never a fabricated number (§4.1, README).
- Every AI/optimizer output is wrapped in `Advisory<T>` with rationale + sources (§2). Disclaimer text is a single constant marked `// COUNSEL_REVIEW_PENDING`.

---

## Phase 0 — Foundation
**Goal:** Monorepo, core package, Supabase project, local DB + sync, auth, time utilities, NASR core ingest, CI. Nothing pilot-facing yet beyond login + an empty shell.

**Requirements:** §1.4 (local DB + sync), §1.5 (dataset currency), §7 (UTC/tz/solar), §12 (stack).

**Tasks**
1. Monorepo: `npm workspaces`; move `app/ components/ constants/ assets/ app.json tsconfig.json` → `apps/mobile`; root `tsconfig.base.json`; Metro `watchFolders` + `nodeModulesPaths` for workspaces. Keep `AGENTS.md` at root.
2. `packages/core` skeleton with `vitest`; modules: `units` (nm/kt/ft/°C/inHg/mb, gal/lb), `geo` (great-circle dist/bearing/interpolation, WMM2025 magvar — pure implementation, coefficients checked in), `time` (UTC types, IANA tz from lat/lon via injectable `TzLookup` interface — `tz-lookup` on client, `geo-tz` on server; DST test: KPRC `America/Phoenix` vs KFLG; NOAA solar-position algorithm exposing `sunrise/sunset`, `civilTwilight`, and `night(rule: '91.209'|'61.57b'|'61.51')`).
3. `packages/db`: Drizzle schema for Phase 0 entities (`users`, `pilot_profiles` stub, `datasets`, `airports`, `runways`, `navaids`, `fixes`, `airport_frequencies`); Postgres + SQLite dialects from one schema definition where possible; PostGIS geometry on server, plain lat/lon + R-tree on client.
4. Supabase project: migrations, RLS (user rows own-only; reference tables read-all), Auth (email + Apple/Google), Storage buckets `datasets/`, `charts/`, `weather/`.
5. `apps/mobile`: `SQLiteProvider` with `onInit` migrations (`PRAGMA user_version`), PowerSync client wired to Supabase auth, auth screens, `datasets` screen showing installed bundles + cycle dates.
6. `services/ingest/nasr`: download NASR 28-day subscription zip, parse APT/RWY/NAV/FIX/FRQ/AWY (CSV format), write Postgres + emit a client bundle (`nasr-core-YYYYMMDD.sqlite`) with manifest. Cron-ready; idempotent per cycle.
7. `services/api`: Hono app, health, `/datasets/manifest`, signed download URLs.
8. CI: typecheck + vitest + eslint per workspace; `expo-doctor`; Docker build for services.
9. Fill in README `Tech stack`, `Commands`, `Repo conventions` sections.

**Exit criteria:** login on a dev build; NASR bundle downloads and airport lookup works in airplane mode; `core/time` tests pass incl. Phoenix DST case and the three night definitions; CI green.

---

## Phase 1 — Aircraft Profile, performance model, W&B (§4)
**Goal:** Everything downstream depends on this. Pure math in `core/perf` + `core/wb`, entry UI in mobile.

**Requirements:** §4.1–4.3, §6 (W&B + perf envelope constraints), README provenance non-negotiable.

**Tasks**
1. Types: `AircraftProfile` (make/model/tail, fuel system: tanks/usable/unusable, empty weight/arm, stations, envelope polygon(s), best-glide ratio + speed, service ceiling, equipment list), `CruiseTable[power][pa][oat] → {tas, gph}`, `ClimbTable[pa][oat][weight] → {fpm, time, fuel, dist}`, `TakeoffTable`/`LandingTable[pa][oat][weight] → {groundRoll, over50ft}` with surface/wind/slope correction factors as the POH gives them.
2. `core/perf`: bilinear interpolation over `(pa, oat)` **clamped with an `OutOfEnvelope` result**, never extrapolated; ISA deviation; pressure altitude from field elevation + altimeter; density altitude; weight interpolation for climb (linear between published weights, clamped); climb-segment integration with weight decrement.
3. `core/wb`: total weight + CG from loading; point-in-polygon against envelope at takeoff **and** zero-fuel/landing; return per-condition violations.
4. Provenance attached to every output (`tableId`, bounding cells used).
5. Mobile: Aircraft Profile CRUD; table-entry grid UI (paste-from-spreadsheet friendly, row/column add, unit toggles); W&B loading screen with envelope graph; profile syncs via tier-1 store.
6. Seed: C172S dataset as a fixture in `packages/core/fixtures/c172s.json` (marked `LICENSE_REVIEW`), used by tests and by a "load sample aircraft" dev action.
7. Tests: golden values from the C172S fixture at published grid points and mid-cells; clamping tests; envelope corner cases; DA against a published DA chart.

**Exit criteria:** From a profile + loading + field elevation/altimeter/OAT, app shows takeoff weight/CG, envelope status at TO and landing, DA, and TO/landing distances — each with a "where did this number come from" popover.

---

## Phase 2 — Weather ingest + 4-D interpolation + text products (§3, §1.1 weather rows)
**Goal:** `wind(lat, lon, altFt, timeUtc) → {u, v, tempC} | Degraded` on the server; bbox "wind cube" subset downloadable to the client; METAR/TAF/hazard products fetched and cached with age.

**Requirements:** §3.1–3.3, §1.4 (cached weather must show age), §5.1 (hazard polygons needed later).

**Tasks**
1. `services/ingest/weather`: poll NODD S3 (`noaa-hrrr-bdp-pds`, RAP, GFS buckets). Use the `.idx` sidecar to byte-range-fetch only `UGRD/VGRD/TMP/HGT` at 925/850/700/500 mb (+ 600/400 for oxygen-altitude legs; list is config) plus surface `TMP/PRES`. Decode with `wgrib2 -bin` inside the container → Float32 arrays.
2. Store per (model, cycle, fhr, field, level) as a compact binary blob (Float32 or scaled Int16 + grid descriptor) in Supabase Storage; metadata row in `weather_grids`. Retention: last 2 cycles per model.
3. `core/weather/interp`: pure TS 4-D interpolation over an in-memory `WindCube` — bilinear horizontal on model grid (Lambert conformal for HRRR/RAP: implement projection→grid index; lat/lon for GFS), vertical on **pressure/geopotential height** after converting aircraft PA → model pressure coordinate, linear temporal between forecast hours. Model selection: HRRR if inside horizon+domain, else RAP, else GFS; response names the model + cycle used (provenance).
4. `services/api`: loads latest cube into memory on cycle change; `POST /wind/sample` (batch), `GET /wind/cube?bbox&levels&t0&t1` returns a subset the client caches for offline nav-log recompute.
5. Text products: `services/ingest/awc` fetches METAR/SPECI/TAF, AIRMET/G-AIRMET/SIGMET/convective SIGMET/CWA/PIREP from aviationweather.gov data API; parse into typed rows with `observed_at`/`issued_at`/`valid_to`; geometry for hazards (PostGIS).
6. Client: weather cache table with age; every weather display component takes `issuedAt` as a required prop and renders age; stale beyond threshold → visually flagged (never hidden, never unlabeled).
7. Tests: interpolation against a synthetic analytic field (known u/v function), vertical interp against a standard-atmosphere table, Lambert projection round-trip on known HRRR grid points; a checked-in small GRIB2 fixture for the decode path.

**Exit criteria:** For any CONUS point/time in HRRR horizon, API returns wind/temp with model+cycle; client shows METAR/TAF for an airport with age; airplane-mode shows last-fetched data clearly aged.

---

## Phase 3 — Pilot Profile, single-leg fixed-altitude nav log, hard constraints (§11.3, §6, §7)
**Goal:** The correctness baseline. A → B at a pilot-chosen altitude and departure time, with wind, fuel, and every §6 hard constraint evaluated. All later phases are optimizations *over* this function.

**Requirements:** §5.3 output fields, §6 all bullets, §7 display rules, §10 (ETA + fuel-on-arrival as first-class values).

**Tasks**
1. `PilotProfile` type + CRUD: certificates/ratings, currency fields (day/night/IFR/flight review/medical — stored, not yet computed), personal minimums (reserve, ceiling/vis, max leg, xwind), optimization weights + presets (faster / economical / conservative → `{w_time, w_fuel, w_risk, w_pref}`).
2. `core/navlog`: wind triangle (TC → WCA → TH → MH via magvar, GS), leg builder with climb/cruise/descent segments (climb from Phase 1 tables at actual weight; descent at profile's descent rate/speed), per-leg fuel integrated at that leg's altitude/temp from the wind cube, cumulative time/fuel, ETA UTC, fuel remaining at destination.
3. `core/constraints`: `evaluate(plan) → Violation[]` — fuel reserve 91.151 (30/45 min at *planned cruise burn*; "night" here is the 14 CFR 1.1 definition = civil twilight, i.e. the same rule as `61.51` in `core/time` — pass the rule explicitly and cite it), W&B at TO and landing, perf envelope, runway adequacy at dep/dest/stops at that field's DA, oxygen 91.211, VFR cloud clearance/vis 91.155 from TAF/METAR vs airspace class (coarse until Phase 6 airspace lands — flag as `Degraded` until then), and `legality_check(pilot, plan) → Violation[]` **stub returning `[]` with `source: 'stub'`**.
4. `Advisory<NavLog>` with rationale strings and disclaimer constant.
5. Mobile: Plan screen (dep/dest/alt/time), nav-log table with Z ⇄ local toggle (both shown), constraint banner (violations first, W&B before anything else per §4.3), provenance popovers. Plan persists via tier-1 store; nav log recomputes offline from cached wind cube.
6. `arrival_event` interface (§10): `computeArrivalEvent(plan) → ArrivalEvent` in core, no consumer yet.
7. Tests: hand-worked E6B examples (golden), zero-wind sanity, reciprocal-heading symmetry, reserve boundary cases at sunset, Phoenix-vs-Flagstaff ETA local-time case.

**Exit criteria:** KPRC→KFLG nav log matches hand calculation within rounding; violations render; plan viewable/editable in airplane mode.

---

## Phase 4 — Altitude optimization + terrain/obstacles (§5.2 altitudes)
**Goal:** Choose the best legal VFR cruise altitude for a fixed route/time.

**Requirements:** §5.2 altitude discretization, 91.159/91.211/91.155 bounds, §5.1 terrain/obstacle clearance term, §1.1 terrain row.

**Tasks**
1. `services/ingest/terrain`: USGS 3DEP (1/3 arc-sec or 1 arc-sec) → downsampled elevation tiles (e.g. 30 arc-sec max-elevation tiles for planning, finer for display later) → Storage; FAA DOF obstacles → Postgres + client bundle by region.
2. `core/terrain`: `maxElevationAlongPath(polyline, corridorNm)` from tiles; obstacle query in corridor.
3. `core/optimizer/altitude`: enumerate 91.159 altitudes (odd/even +500 by magnetic course per leg; below 3,000 AGL any altitude), bound by terrain+margin (profile setting, default 1,000 ft / 2,000 mountainous), service ceiling, oxygen, cloud-clearance feasibility from TAF/ceiling; evaluate `J` per candidate using Phase 3 nav log; return ranked candidates + rationale ("7,500 chosen: +11 kt tailwind vs 5,500, clears terrain by 2,300 ft").
4. Mobile: altitude picker showing candidates with time/fuel deltas.
5. Tests: course 179°/180° boundary, altitude bounds, terrain gate.

**Exit criteria:** Optimizer picks altitude; deltas vs alternatives displayed with reasons.

---

## Phase 5 — Departure-time optimization (§5.2 departure time)
**Tasks**
1. `core/optimizer/departure`: evaluate route+altitude at 30-min steps across the window (each step a full re-evaluation against the time-varying wind cube); return `t*` + cost-vs-time curve; night/reserve/DA implications per step surface as rationale.
2. API endpoint runs it server-side (cube in memory); client can re-run for narrow windows from cached cube.
3. Mobile: window picker + curve chart (load `dataviz` skill when building).
4. Tests: monotone wind field → monotone curve; curve length/step correctness.

**Exit criteria:** Cost-vs-time curve rendered; picking a time updates nav log.

---

## Phase 6 — Waypoint graph + A* routing + airspace (§5.2 waypoints, §5.1 airspace/weather terms)
**Tasks**
1. `services/ingest/nasr` add: airspace (Class B/C/D/E, SUA, MOA, R/P) polygons → PostGIS + client bundle. `services/ingest/awc` hazard polygons already in Phase 2.
2. `core/graph`: candidate node set = navaids + VFR reporting points + airports (diversion nodes) + coarse lattice (e.g. 15 nm) within a corridor around the great circle; edges between nodes within max hop; edge cost = §5.1 `J` computed via Phase 3 leg builder + Phase 4 altitude per edge + airspace/weather penalties (hard-block vs penalize per profile). Admissible heuristic: GC distance / best-case GS.
3. `core/optimizer/route`: A*; then departure-time loop from Phase 5 over the top-N routes. Return best plan + alternates + rationale per choice.
4. Risk thresholds live in a single `riskConfig.ts` marked `NEEDS_CFI_INPUT` (§12) — defaults conservative, all overridable.
5. Mobile: route on map (MapLibre, plain basemap for now), alternates list, "why this route".
6. Tests: A* optimality on a toy graph; hard-block respected; airspace penalty changes route in a constructed case.

**Exit criteria:** Two airports → full optimized plan (route, altitude, time, fuel) with rationale, under 10 s server-side for a 300 nm flight.

---

## Phase 7 — Glide-reach / diversion coverage + start ADS-B ingestion (§5.1, §8.1–8.2)
**Tasks**
1. `core/risk/glide`: sample route every N nm; glide radius = AGL × best-glide × safety factor (profile); "suitable" = runway length ≥ Phase 1 landing distance at that field's DA, surface OK, not NOTAM'd closed (NOTAM from Phase 8 — until then `Degraded` note); coverage % as a first-class plan metric; feeds `risk_penalty`.
2. Mobile: coverage % on plan summary; glide rings along route on the map.
3. **Business decision gate:** confirm ADS-B source licensing (OpenSky / ADS-B Exchange / AeroAPI / adsb.fi) before code. Then `services/ingest/adsb`: consume feed, detect ops (arrival/departure events within radius + altitude band), **discard raw positions**, aggregate `airport_busyness[icao][dow][hour_local] → {mean, p50, p90, n, window_weeks}` with 8-week rolling window. Runs from here on; nothing user-facing until Phase 11.
4. Tests: coverage on synthetic route with one airport; ops detection on a scripted track.

---

## Phase 8 — Charts, Chart Supplement, NOTAM, TFR, imagery, offline download manager (§1.1, §1.4, §1.5)
**Goal:** The "single source" data layers and the offline story end to end. Largest UI phase.

**Tasks**
1. `services/ingest/charts`: FAA AeroNav sectionals/TACs/IFR enroute GeoTIFF → GDAL → MBTiles per chart, per 56-day cycle; terminal procedures + airport diagrams (d-TPP PDFs) indexed by airport; Chart Supplement PDFs split by airport. All with manifests.
2. Client download manager (`expo-file-system` `DownloadTask`, resumable, background-tolerant): region picker, size estimates (§12 footprint), install/swap on cycle, expiry warnings, expired charts **blocked or hard-marked** (§1.5). One `datasets` table drives all of it.
3. MapLibre moving map: raster chart layers from local MBTiles, route overlay, own-ship from `expo-location`, terrain shading later.
4. NOTAM (FAA NOTAM API) + TFR feed pollers; client fetch by route corridor; cached with age; closed-runway NOTAMs feed Phase 7 suitability.
5. Weather imagery: radar mosaic/satellite/prog charts/icing-turb grids fetched as image tiles with issue time; cached with age.
6. Airport page: everything from NASR + Chart Supplement + frequencies + NOTAMs + METAR/TAF + plates + diagram, all offline once downloaded.
7. Tests: manifest expiry logic; atomic swap under interrupted download.

**Exit criteria:** Airplane mode: full airport page, sectional under route, plates open, nav log editable, all weather shows age.

---

## Phase 9 — Regulatory corpus + grounded chatbot; POH extraction (§9, §4.1 option 3)
**Tasks**
1. `services/ingest/regs`: eCFR API (14 CFR parts 1, 61, 91, 43, 67, 71, 93, 95, 97 minimum) + FAA AIM → sectioned corpus with stable IDs + version dates; client bundle with SQLite FTS5 index (offline search works without network).
2. Retrieval: FTS5 + optional embeddings (server-side) → top-k sections → Claude (load `claude-api` skill before writing; `claude-opus-5` default, `claude-sonnet-5` for cost) with tool-use for `getPilotProfile`, `getAircraftProfile`, `getLogbookSummary` (Phase 10). System prompt requires per-claim citations; post-validate every cited section ID exists in corpus, else reject the answer. Ambiguity → say so + cite governing section.
3. Mobile: chat UI with citation chips opening the section; offline → FTS search only, clearly stated.
4. POH PDF upload → server OCR/LLM extraction into Phase 1 table schema → **mandatory pilot verification grid** before the table becomes active; unverified tables cannot be used by the optimizer.
5. Tests: citation validator; retrieval recall on a fixed question set; rejection of un-cited answers.

---

## Phase 10 — Flight tracking, logbook, currency engine → real `legality_check` (§6, §1.1 logbook, §10)
**Tasks**
1. Tracking: `expo-location` + `expo-task-manager` background track; detect takeoff/landing; write track locally first, queue for sync (never lost to no signal).
2. Logbook entries auto-created (times, night per 61.51 civil twilight, landings per 61.57(b) night, approaches manual/IFR later); manual edit; export (CSV, standard logbook formats).
3. Currency engine: 61.57(a)/(b) day/night, 61.56 flight review, 61.23 medical class expiry, 61.57(c) IFR (stub if VFR-only MVP), plus personal minimums; returns `Violation[]` with citations. **Replace the Phase 3 stub**; optimizer refuses/flags plans before generation.
4. Emit `arrival_event` on plan activation + in-flight ETA updates through the §10 interface (no consumer, logged only).
5. Tests: currency date arithmetic across DST/month ends; night landing counting at twilight boundaries.

---

## Phase 11 — Traffic density integration (§8.3–8.4)
**Tasks**
1. Confidence threshold gate per airport (`sample_count`, `window_weeks`); API only returns estimates above threshold.
2. Busyness term in departure-time optimizer as soft preference weighted by profile (student vs commercial).
3. Mobile: airport "busyness" widget; hidden when below confidence (never "quiet" without data).

---

## Phase 12 — Briefing + filing partner integration; fuel/FBO data (§1.2, §1.3)
**Business-dev dependency — start conversations in Phase 0; engineering here.**
**Tasks**
1. Flight service (Leidos) integration: obtain logged briefing → `BriefingRecord` retained with plan; file/activate/close VFR (IFR later). Filing state machine on `FlightPlan`.
2. Fuel/FBO: commercial partner adapter behind `FuelDataProvider` interface; crowdsourced fallback design only if partner path fails.
3. Counsel-reviewed disclaimer text replaces `COUNSEL_REVIEW_PENDING` constant.

---

## Parallel non-engineering tracks (tracked from Phase 0)
- Flight service partner (gates §1.2) — Phase 12
- ADS-B licensing (gates §8) — needed by Phase 7
- POH data licensing for shipped C172S fixture — needed before public release
- CFI input on risk thresholds (`riskConfig.ts`) — needed by Phase 6
- Fuel/FBO data source — Phase 12
- Counsel review of disclaimer — before any external testing

## Verification (whole plan)
- `packages/core`: vitest golden/property tests per phase; 100% of flight-critical functions have a hand-computed golden case.
- Per phase, an "airplane-mode walkthrough" checklist in `docs/offline-checklist.md` grows; run on a dev build before closing the phase.
- Services: Docker build + a fixture-driven ingest smoke test (small GRIB2, one NASR cycle subset, one sectional tile).
- Mobile: `expo-doctor`, typecheck, RNTL component tests for constraint banner + age indicators; manual dev-build run via `/run` skill.
- Every phase's exit criteria above are the acceptance test.

## First concrete step (Phase 0, task 1)
Move the Expo app into `apps/mobile`, add root workspaces, create `packages/core` with `vitest` and the `units`/`geo`/`time` modules, and get CI green — before any domain feature.
