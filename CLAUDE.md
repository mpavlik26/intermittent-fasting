# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Progressive Web App (PWA) for tracking intermittent fasting (16:8 protocol). No build system, no framework, no dependencies — pure vanilla JS/HTML/CSS served as static files.

## Running Locally

Serve with any static HTTP server:

```bash
python -m http.server 8000
# or
npx serve .
```

Open `index.html` directly in a browser also works, though PWA features (Service Worker) require HTTP/HTTPS.

## Testing

### Automated (Playwright E2E)

Install once:
```bash
npm install
npx playwright install chromium
```

Run all tests:
```bash
npm test
```

Run a single test file:
```bash
npx playwright test tests/state-machine.spec.js
```

Run with visible browser:
```bash
npm run test:headed
```

Interactive UI mode (recommended for debugging):
```bash
npm run test:ui
```

Test files in `tests/`:

| File | Covers |
|------|--------|
| `state-machine.spec.js` | Core cycle, initial setup overlay |
| `bonus.spec.js` | US-3 fasting bonus, US-4 eating bonus |
| `break-fast.spec.js` | US-7 prolong/premature-start penalties |
| `history.spec.js` | US-10 records, Manual/Bonus/Penalty tags |
| `manual-session.spec.js` | US-11 setup overlay, mid-session override |
| `simulator.spec.js` | US-12 simulator visibility, slider state, calculation correctness, constraints |

Time-based transitions are tested by calling `page.evaluate(() => { appState.timeOffsetMs += ms; tick(); })` — same mechanism as the in-app debug buttons but without needing to unlock the debug panel.

### Manual (browser)

The app has built-in debug controls (hidden by default):

- **Unlock debug panel:** Tap/click the "FASTING TRACKER" title 5 times
- **Debug buttons:** +1 Min, +1 Hour, +8 Hours, Reset App — shift `timeOffsetMs` in `appState`

All user stories and their test scenarios are documented in `user-stories.md`.

## Architecture

Single-page app — three files contain all logic:

| File | Role |
|------|------|
| `app.js` | All application logic (~950 lines) |
| `index.html` | UI structure and HTML templates |
| `styles.css` | All styling including CSS variables and state-based colors |
| `sw.js` | Service Worker (cache-first PWA offline support) |

### State Machine

The app cycles through three states:

```
potential → (first meal logged) → eating → (last meal logged) → fasting → (16h elapsed) → potential
```

All state lives in `appState` (a plain JS object) and is persisted to `localStorage` under key `fastingTrackerState`. Key state fields:

- `currentState`: `'potential' | 'eating' | 'fasting'`
- `windowStartTime` / `windowEndTime`: epoch ms boundaries for the current window
- `fastingBonusMs` / `eatingBonusMs`: rewards earned from US-3/US-4 logic
- `prolongingPenaltyMs` / `prematureStartPenaltyMs`: penalties from US-7
- `timeOffsetMs`: debug time shift applied via `getCurrentTime()`
- `isManualSession`: flag set when window was created via manual setup (US-11)
- `history`: array of completed window records

### Core Loop

`tick()` runs every 1 second via `setInterval`. It calls `getCurrentTime()` (real time + `timeOffsetMs`), checks for window expiry/transitions, then calls `updateUI()` to re-render the display.

### Key Functions

- `loadState()` / `saveState()` — read/write localStorage
- `transitionToEating()` / `transitionToFasting()` / `transitionToPotential()` — state machine transitions, each recalculates window boundaries applying bonuses/penalties
- `updateUI()` — full UI re-render based on current state (called every tick)
- `showSetupOverlay()` / `manualSetWindow()` — US-11 manual session setup
- `addToHistory()` / `renderHistory()` — US-10 history persistence and display

### Bonus/Penalty System

- **US-3 (Fasting bonus):** Fasting beyond 16 hours earns bonus time added to next eating window
- **US-4 (Eating bonus):** Finishing eating early earns bonus time added to next eating window
- **US-7 (Breaking fast penalty):** User chooses to either prolong current eating window or start new eating window early — both options apply a penalty reducing the next eating window

### UI Conventions

- Collapsible sections auto-collapse when another section is expanded
- Day-of-week labels (2-char, e.g. "Mo") are shown on times from a different day than current (US-9). **Every time value rendered in the UI must use `renderTime(ms)` (returns HTML with an optional `<sup>` day label) and be set via `.innerHTML`, not `formatTimeOnly(ms)` + `.textContent`.** `formatTimeOnly` is only for contexts where HTML cannot be used (e.g. plain-text attributes).
- State colors and labels are controlled via CSS custom properties on the root element
- Cache-busting via `?v=6` on script/CSS `<link>` tags in `index.html`

## Development Workflow

Feature development follows the user stories in `user-stories.md`. Each user story (US-B1 through US-11) maps to a dedicated branch and PR. The `master` branch is the main branch.

## E2E Test Requirement

Every implementation change or new feature **must** be accompanied by E2E test coverage. When proposing or executing an implementation plan, always include the E2E test plan as an explicit part of it — covering visibility, initial state, calculation correctness, and edge cases relevant to the feature. Whether to add tests to an existing spec file or create a new one is a matter of judgment and convenience.
