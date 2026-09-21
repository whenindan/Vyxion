# Vyxion — Technical Spec

Two things in scope here: the **complete data coverage** required to be a
pilot's single source (§1–2, §10), and the **VFR flight plan optimizer**
specified to implementation depth (§3–7).

Work through §11's build order with Plan Mode on. The optimizer depends on the
performance model, which depends on the weather pipeline. Do not let Claude
scaffold all of it in one pass.

---

## 1. The single-source requirement

A pilot must never leave Vyxion for information. That converts a vague product
goal into a concrete, checkable data-coverage requirement: every dataset below
is in scope, and every one of them is a reason a pilot would otherwise open
another app.

### 1.1 Required data coverage

| Domain | What's needed | Source |
|---|---|---|
| Charts | VFR sectionals, TACs, IFR low/high enroute, terminal procedures (approach plates, SIDs/STARs), airport diagrams | FAA AeroNav digital products |
| Airport data | Runways, frequencies, lighting, services, ownership, remarks | FAA NASR (28-day cycle) |
| Chart Supplement | Full A/FD content including remarks and local procedures | FAA digital Chart Supplement |
| Navaids / fixes | VOR/NDB/waypoints, magnetic variation, status | FAA NASR |
| Airspace | Class B/C/D/E boundaries, SUA, MOAs, restricted/prohibited | FAA NASR + AeroNav |
| Weather — observation | METAR, SPECI | aviationweather.gov data API |
| Weather — forecast | TAF, MOS, gridded model output (§3) | NWS / NOAA |
| Weather — hazard | AIRMET, G-AIRMET, SIGMET, convective SIGMET, CWA, PIREP | aviationweather.gov |
| Weather — imagery | Radar mosaic, satellite, prog charts, icing/turbulence grids | NWS / NOAA |
| Winds/temps aloft | Gridded model wind fields (§3) | HRRR / RAP / GFS via NODD |
| NOTAMs | All classes, including FDC and airport-specific | FAA NOTAM API |
| TFRs | Active and scheduled | FAA TFR feed |
| Terrain / obstacles | Elevation raster, obstacle database | USGS 3DEP, FAA DOF |
| Traffic | ADS-B In display; historical density (§8) | ADS-B receiver / data provider |
| Regulations | Full FAR/AIM corpus, searchable + chatbot-grounded | eCFR API, FAA AIM |
| Aircraft docs | POH/AFM, checklists, W&B data, equipment list | User upload + curated library (§4.1) |
| Fuel & FBO | Fuel prices, services, hours, contact | Commercial data partner — see §1.3 |
| Logbook | Full digital logbook, auto-populated, exportable | Internal (Phase 3) |
| Briefing | Legal preflight weather/NOTAM briefing with retained record | See §1.2 |
| Filing | VFR/IFR flight plan filing, activation, closing | See §1.2 |

### 1.2 Two capabilities that require a partner, not just an API

These are the two places where "never leave the app" cannot be satisfied by
pulling public data, and they need a commercial decision early because they
gate the single-source claim:

- **Legal weather briefing.** 14 CFR 91.103 requires the PIC to become familiar
  with all available information. In practice, pilots want a briefing record
  from an FAA-contracted flight service provider (Leidos), because that record
  is what exists if anything is ever questioned. Displaying the same underlying
  weather data is *not* the same as obtaining a logged briefing. To be the sole
  source, Vyxion needs integration with flight service for briefing retrieval
  and logging — which is how existing EFBs do it.
- **Flight plan filing.** Filing, activating, and closing VFR and IFR plans
  requires connection into the NAS via flight service. Same partner path.

Until both exist, the single-source promise has a hole in it, and it's the
most visible hole — filing is the last thing a pilot does before walking to the
airplane. Treat this as a business-development dependency tracked alongside
engineering, not something to discover in Phase 4.

### 1.3 Fuel and FBO data
No authoritative free source. Options are a commercial data partner, scraping
(fragile and likely against terms), or crowdsourcing from users (cold-start
problem, accuracy problem). Decide deliberately — pilots comparison-shop fuel
constantly, and it's a common reason to open a second app.

### 1.4 Offline architecture
GA aircraft lose connectivity routinely. Everything a pilot could need airborne
must function with zero network:

- Charts, plates, airport data, terrain, obstacles, POH/checklists: downloaded
  and stored locally, by region, on the user's selection.
- The active flight plan, nav log, and W&B: computed values cached; the plan
  must remain fully viewable and editable offline.
- Weather: last-fetched products cached with a prominent **age** indicator.
  Never display cached weather without its observation/issue time. Stale
  weather presented as current is a safety failure.
- Logbook: writes queue locally and sync on reconnect. A tracked flight must
  never be lost to a dead connection.
- Regulations corpus: stored locally — it's text, it's small, and a pilot
  asking a reg question on the ramp has no excuse to need signal.

Design implication: the client needs a real local database and a sync layer
with conflict resolution, not an API client with a cache. This constrains the
stack choice and cannot be retrofitted later.

### 1.5 Data currency enforcement
Every dataset carries effective dates (charts 28/56-day, NASR 28-day). The app
must track the effective cycle of everything it holds, warn before expiry,
block or clearly mark expired charts, and never silently serve stale data. A
pilot trusting an out-of-cycle chart because the app didn't say anything is a
failure mode with real consequences.

---

## 2. Where the single-source principle stops

Vyxion is the sole information source. It is not the decision-maker. Under
91.3 the PIC holds final authority; under 91.103 the PIC is responsible for
familiarity with all available information. Vyxion's role is to make all of
that information genuinely available in one place and to make the resulting
decision better-informed.

Every AI output — plan, recommendation, currency check, regulatory answer —
ships as advisory, sourced, and traceable. This is not a limitation to
engineer around: it's what keeps the product defensible, and a tool implying
it replaces pilot judgment is one bad outcome from being indefensible.

---

## 3. Weather data pipeline

### 3.1 Sources
Wind/temp aloft comes from NOAA gridded model output, **not** the legacy FB/FD
winds-aloft text products — those are sparse station point forecasts at coarse
altitude steps, which is exactly the legacy-data problem Vyxion exists to solve.

- **HRRR** — 3 km CONUS, hourly, ~18 h horizon. Best for near-term GA flights.
- **RAP** — 13 km, ~21 h horizon. Fallback / wider coverage.
- **GFS** — 0.25°, to 384 h. Planning days out.
- Delivery: GRIB2 via NOMADS or the NODD cloud mirrors (AWS/GCP). Prefer the
  mirrors — fewer rate limits.

### 3.2 Fields
Per GRIB2 cycle, on isobaric levels: `UGRD`, `VGRD`, `TMP`, `HGT`.

| Level | ≈ Pressure altitude |
|---|---|
| 925 mb | ~2,500 ft |
| 850 mb | ~5,000 ft |
| 700 mb | ~10,000 ft |
| 500 mb | ~18,000 ft |

Plus surface fields for density-altitude work at the field ends.

### 3.3 Interpolation
The optimizer needs `wind(lat, lon, altitude, time) -> (u, v, temp)` at
arbitrary points. Implement 4-D interpolation:
- horizontal: bilinear on the model grid
- vertical: interpolate on pressure/geopotential height, **not** linearly on
  altitude — convert the aircraft's pressure altitude into the model's pressure
  coordinate first
- temporal: linear between forecast hours

Decode GRIB2 once per cycle into a dense in-memory array keyed by
(level, lat, lon) and serve interpolation from that. A single plan samples this
function thousands of times; a GRIB decode per sample is unusable.

---

## 4. Aircraft performance model

### 4.1 The data problem — read before designing the schema
There is no public machine-readable POH performance database. This constrains
the MVP more than anything else in this spec. Options, in order of pragmatism:

1. **User-entered tables** at Aircraft Profile creation — tedious, but correct
   for their specific airplane and unblocking.
2. **Pre-digitized tables for a small trainer set** (C172S, PA-28-181, C182T,
   SR20) shipped with the app — covers most of the training market, which is
   the beachhead anyway.
3. **OCR/LLM extraction from an uploaded POH PDF**, with a mandatory
   pilot-verification step on the parsed table. Never trust extracted
   performance numbers silently.

Do **not** synthesize or estimate performance numbers when a table is missing.
A wrong fuel burn is a safety issue. Missing data → degrade the feature and say
so.

### 4.2 Structure
```
cruise_performance[power_setting][pressure_altitude][oat] -> {tas, fuel_flow_gph}
climb_performance[pressure_altitude][oat][weight] -> {fpm, time_min, fuel_gal, distance_nm}
```
Bilinear interpolation over (pressure_altitude, OAT), **clamped** — never
extrapolate past published table bounds. Outside the envelope is a constraint
violation, not a number to invent.

### 4.3 Required computations
- **Density altitude** from pressure altitude + OAT — also needed for
  takeoff/landing distance checks at every field in the plan.
- **ISA deviation** — many POH tables index on ISA ±20 °C rather than raw OAT.
- **Weight effects** — cruise TAS is weakly weight-dependent; climb rate
  strongly so. Climb segments use actual takeoff weight, decremented for fuel
  burned on longer climbs.
- **Weight & balance** — total weight and CG from the loading (occupants,
  baggage stations, fuel); validate against the envelope polygon at both
  takeoff and *landing* (zero-fuel) conditions. Out-of-envelope invalidates the
  entire plan — surface it before anything else.
- **Fuel burn integration** per leg at that leg's actual altitude/temp, with
  separate climb and descent accounting.

---

## 5. The optimizer

### 5.1 Cost function
```
J = w_time · block_time
  + w_fuel · fuel_burned
  + w_risk · risk_penalty
  + w_pref · preference_penalty
```
Weights come from the Pilot Profile. Expose a simple
faster / more-economical / more-conservative control mapping to weight presets,
with the underlying weights configurable.

`risk_penalty` is what makes this a *safe* optimizer rather than a
great-circle-with-wind solver:

- **Glide-reach coverage.** At each point along the route, engine-out glide
  radius = `(AGL altitude) × (POH best-glide ratio) × safety_factor`. Check
  whether a suitable landing site falls inside it; penalize segments with none.
  Report coverage as an explicit plan metric: *"94% of this route is within
  engine-out glide of a suitable airport."* Novel, sellable, and a good demo.
  - "Suitable" = runway length ≥ required landing distance for this aircraft at
    that field's density altitude, acceptable surface, not NOTAM'd closed.
- **Terrain and obstacle clearance** against each altitude candidate.
- **Weather proximity** — penalize routing near convective SIGMETs, icing
  AIRMETs (relevant at GA cruise altitudes even VFR), low ceilings.
- **Airspace** — Class B/C/D transitions, SUA, restricted/prohibited, TFRs.
  Penalize or hard-block per pilot preference.

`preference_penalty` — max leg length before a fuel stop, avoid-mountainous,
avoid-Class-B, preferred fuel stops, personal minimums tighter than regulatory.

### 5.2 Search space
- **Altitudes:** discretize to legal VFR cruising altitudes (91.159 — magnetic
  course 0–179° → odd thousands +500, 180–359° → even thousands +500, above
  3,000 AGL), bounded below by terrain + margin and above by service ceiling,
  oxygen requirements (91.211), and cloud-clearance feasibility (91.155).
- **Waypoints:** don't search continuous space. Build a candidate graph from
  navaids, published VFR reporting points, airports (which double as diversion
  nodes), and a coarse geographic lattice for free-flight legs. Run A\* over it
  with §5.1 cost on edges, admissible heuristic on great-circle distance over
  best-case groundspeed.
- **Departure time:** evaluate route cost at discrete steps across the window
  (start with 30 min). Wind fields evolve, so each departure time is a genuinely
  different optimization, not a post-hoc adjustment. Return the best `t*` plus a
  cost-vs-time curve so the pilot can see what leaving an hour later costs.

### 5.3 Output
Per leg: true course, magnetic variation applied, wind correction angle,
magnetic heading, TAS, GS, distance, ETE, cumulative time, fuel burn, fuel
remaining, altitude. Plus a rationale string for every route, altitude, and
timing choice — a plan the pilot can't interrogate won't be trusted, and
under §2 the pilot has to be able to evaluate it.

---

## 6. Hard constraints (plan invalid if violated)

- **Fuel reserve** — 91.151: VFR day, destination + 30 min at normal cruise;
  night, 45 min. Compute against actual planned cruise burn, not a rule of
  thumb. Personal minimums may be stricter.
- **W&B envelope** at takeoff and landing.
- **Performance envelope** — no extrapolation past POH bounds.
- **Runway adequacy** at departure, destination, and every fuel stop, at that
  field's computed density altitude.
- **VFR cloud clearance and visibility** (91.155) for airspace flown.
- **Pilot currency/legality** — gated by Phase 3's engine; until then stub
  `legality_check(P, planned_flight) -> [violations]` so the optimizer already
  expects it.
- **Oxygen** (91.211) above 12,500 / 14,000 ft.

---

## 7. Time handling

Aviation runs on Zulu; pilots live in local; the app is fluent in both without
the user thinking about it.

- **Store everything UTC** — every timestamp, forecast hour, logbook entry.
- Display with a global Z ⇄ local toggle; show both on the nav log.
- Airport local time derives from lat/lon → IANA timezone (tzdata), **never** a
  stored UTC offset. Offsets change; zones don't.
- **DST will bite.** Arizona doesn't observe DST — KPRC is `America/Phoenix`,
  permanently UTC−7, while an airport a short hop north shifts twice a year.
  Naive offset math produces one-hour ETA errors across state lines for half
  the year.
- **Three different definitions of "night"** — do not conflate:
  - 91.209 (position lights): sunset to sunrise
  - 61.57(b) (night landing currency): 1 h after sunset to 1 h before sunrise
  - 61.51 (logging night time): end of evening civil twilight to beginning of
    morning civil twilight

  Implement solar-position calculation and expose all three. Which applies is a
  function of what's being asked, so the API takes the rule as a parameter.

---

## 8. Traffic density

The Google-Maps-busyness analogue for airports. A data-accrual feature: more
valuable the longer it runs (a real moat), worth little on day one (plan
accordingly).

### 8.1 Ingestion
Candidates: OpenSky Network, ADS-B Exchange, FlightAware AeroAPI, adsb.fi.
**Verify commercial licensing before building on any of them** — terms differ
sharply and some prohibit commercial use outright. This is a decision to make
deliberately, not discover later.

FAA ASPM/OPSNET gives official counts for towered fields but skews large and
misses most GA airports — precisely the ones pilots want this for.

### 8.2 Aggregation
Don't retain raw position reports. Detect operations (arrival/departure events
within a radius + altitude band of the field), then aggregate:
```
airport_busyness[icao][day_of_week][hour_local] -> {
  mean_ops, p50, p90, sample_count, rolling_window_weeks
}
```
Rolling window (start 8 weeks) to capture seasonal drift. Track `sample_count`
and **do not display an estimate below a confidence threshold** — a wrong
"quiet right now" is worse than no answer.

### 8.3 Cold start
Expect 8–12 weeks of continuous ingestion before day-of-week/hour patterns are
meaningful per field. Start ingestion early, before the feature is needed, and
ship it airport-by-airport as confidence thresholds are met rather than
launching half-empty everywhere.

### 8.4 Use in the optimizer
Feed busyness into departure-time recommendation (§5.2) as a soft preference
term. A student pilot's profile weights "avoid the busy pattern" far higher
than a commercial pilot's.

---

## 9. Regulatory chatbot grounding

For the single-source principle, this is what replaces a pilot searching the
FAR/AIM or calling a CFI.

- Ground answers in a retrieved corpus of the actual regulations (eCFR API for
  14 CFR, FAA AIM), **not** model memory. Regulations change; model weights
  don't.
- Every answer cites its specific section. No un-sourced regulatory claims.
- Answers are profile-aware: "am I current for this flight?" resolves against
  the pilot's actual logbook and certificates, not a generic explanation of the
  rule.
- Corpus stored locally (§1.4) — it's text, it's small, and reg questions
  happen on ramps without signal.
- Where a question is genuinely ambiguous or fact-dependent, say so and cite
  the governing section rather than producing false confidence. This is the
  §2 boundary in practice.

---

## 10. Deferred, but design for it: FBO / fuel provider integration

Not building the provider-facing app now. But the data model shouldn't need a
rewrite when it happens.

When a plan is activated and while a flight is tracked, emit:
```
arrival_event {
  destination_icao,
  tail_number,
  eta_utc,                    -- updated in flight
  fuel_type,                  -- 100LL / Jet-A
  estimated_fuel_uplift_gal,  -- tank capacity minus computed remaining
  aircraft_type,
  services_requested[]        -- placeholder
}
```
Keep this behind a clean internal interface with no FBO-specific logic in the
planner. No provider auth, UI, or notification pipeline yet. The only
requirement today is that the planner computes and exposes ETA and
fuel-on-arrival as first-class values — which §5.3 requires anyway.

---

## 11. Build order

1. Aircraft Profile + performance model + W&B (§4) — everything depends on it
2. Weather ingest + 4-D interpolation (§3)
3. Single-leg fixed-altitude nav log (wind triangle, fuel) — the correctness
   baseline to test everything else against
4. Altitude optimization (§5.2)
5. Departure-time optimization (§5.2)
6. Waypoint graph + A\* routing (§5.2)
7. Glide-reach / diversion coverage (§5.1) — start ADS-B ingestion (§8.1) in
   parallel; it needs runway time
8. Chart, airport, NOTAM, TFR data layers + offline storage (§1.1, §1.4)
9. Regulatory corpus + chatbot grounding (§9)
10. Logbook + currency engine; wire into §6's `legality_check`
11. Traffic density integration (§8.4) once confidence thresholds are met
12. Briefing + filing integration (§1.2) — business-development dependency,
    start the conversation early

---

## 12. Open decisions

- Tech stack — note §1.4 constrains this heavily (local DB + sync layer)
- **Flight service partner for briefing and filing (§1.2)** — gates the
  single-source claim; start early
- **ADS-B source and commercial licensing (§8.1)** — gates §8 entirely
- **Aircraft performance data strategy (§4.1)** — gates the whole MVP
- Fuel/FBO data source (§1.3)
- Terrain dataset (USGS 3DEP?) and obstacle data (FAA DOF)
- Airport/runway/navaid source — FAA NASR is authoritative and free; confirm
  28-day cycle update handling
- Magnetic variation model (WMM/IGRF) and update cadence
- Chart storage strategy and per-region download sizing — this is the main
  driver of app footprint
- Risk-penalty thresholds throughout §5.1 — deliberately unset; they need
  pilot/CFI input, not a developer's guess
