# Vysion — Project Context

## What this is
Vysion is an AI-native Electronic Flight Bag (EFB) for general aviation pilots.
ForeFlight and Garmin Pilot are manual route builders with AI features bolted
on; competitors like PilotGPT generate routes by stitching together
intermediate airports, which is not optimization. Vysion:

- Generates a fully optimized VFR flight plan (route, cruise altitude,
  departure timing, fuel) from a Pilot Profile + Aircraft Profile + two
  airports. Optimized against real wind fields, POH performance at actual
  temp/weight, and safety constraints — not waypoint-stitching.
- Answers FAR/AIM questions in plain English, grounded in the pilot's own
  certificates and the aircraft's own POH, with citations.
- Auto-syncs a digital logbook from tracked flights and flags currency gaps
  *before* a plan is generated.

## The product principle: single source
A pilot should never have to leave Vysion to find information. Not to a
weather site, not to a chart app, not to a PDF of the POH, not to a separate
logbook, not to a fuel-price lookup, not to a regulations search. Every piece
of information required to plan, brief, file, fly, and log a flight lives in
the app. Any feature that makes a pilot open a browser is a bug.

Two consequences that constrain every design decision:

1. **Offline-first is mandatory, not a nice-to-have.** GA aircraft lose
   connectivity in flight routinely. Anything a pilot might need airborne must
   work with no network. This drives storage, sync, and caching architecture
   from day one — it cannot be retrofitted.
2. **Data completeness is a product requirement.** A missing data source is not
   a gap to fill later; it is a reason a pilot goes elsewhere, and once they
   do, the single-source promise is broken.

### Where the principle stops
Vysion is the sole *information* source. It is not, and must never present
itself as, the decision-maker. Under 14 CFR 91.3 the pilot in command holds
final authority for the operation of the aircraft, and under 91.103 the PIC —
not a tool — is responsible for becoming familiar with all available
information before a flight. Vysion's job is to make "all available
information" actually available in one place, and to make the pilot's decision
better-informed. It does not make the decision.

This is not a hedge or a limitation to engineer around. It is a regulatory
fact, it is what keeps the product defensible, and a tool that positions
itself as replacing pilot judgment is one bad outcome away from being
indefensible. Build toward total informational completeness; never toward
implied decision authority.

## Tech stack
[Fill in once decided — mobile framework, backend, database, LLM provider,
hosting, auth. Note the offline-first requirement above constrains this choice
significantly: the client needs a real local database and a sync layer, not
just an API client.]

## Core domain objects
- **Pilot Profile** — certificates, ratings, currency (day/night, IFR, flight
  review, medical), personal minimums, optimization preferences
- **Aircraft Profile** — make/model/tail, POH performance tables, W&B envelope,
  fuel system, installed equipment, checklists
- **Flight Plan** — route, altitude, departure window, fuel plan, weather
  briefing, filing state; AI-generated then pilot-editable
- **Nav Log** — the interactive rendering of a Flight Plan
- **Logbook Entry** — auto-created from a tracked flight; feeds Pilot Profile
  currency
- **Briefing Record** — the legal weather/NOTAM briefing obtained for a flight,
  retained with the plan

## Non-negotiables
- Every AI-generated plan, recommendation, or currency check is presented as
  advisory and traceable — never as an official FAA determination or a
  substitute for pilot judgment.
  [Exact disclaimer language must be reviewed by counsel before it ships. This
  is a placeholder, not legal text.]
- Every FAR/AIM answer cites the specific section it draws from. No un-sourced
  regulatory claims, ever.
- Every flight-critical number (fuel, W&B, performance, distances) must be
  traceable to the source POH table or dataset it came from, and that
  provenance must be visible to the pilot on request.
- **Never synthesize a value that should come from data.** Missing POH table,
  stale chart cycle, unavailable weather product → degrade the feature and say
  so explicitly. A plausible-looking invented number is the single worst
  failure mode this product has.
- **Data currency is enforced, not assumed.** Charts and airport data run on
  28/56-day cycles. The app must know the effective dates of every dataset it
  holds, warn on expired data, and never silently serve stale charts.

## Commands
[Fill in once the stack is chosen — dev, test, lint, build, typecheck]

## Repo conventions
[Fill in — branch naming, commit style, monorepo layout]
# Vyxion
