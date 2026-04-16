const DURATION_EATING_MS = 8 * 60 * 60 * 1000;
const DURATION_FASTING_MS = 16 * 60 * 60 * 1000;

function makeState(overrides = {}) {
    const now = Date.now();
    return {
        currentState: 'potential',
        windowStartTime: now,
        windowEndTime: now,
        lastMealTime: null,
        fastingBonusMs: 0,
        eatingBonusMs: 0,
        prolongingPenaltyMs: 0,
        prematureStartPenaltyMs: 0,
        appliedPenaltyMs: 0,
        lastEatingWindowTargetMs: null,
        timeOffsetMs: 0,
        isDebugUnlocked: false,
        isManualSession: false,
        history: [],
        ...overrides,
    };
}

function makeEatingState(overrides = {}) {
    const now = Date.now();
    const windowEndTime = now + DURATION_EATING_MS;
    return makeState({
        currentState: 'eating',
        windowStartTime: now,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        ...overrides,
    });
}

function makeFastingState(overrides = {}) {
    const now = Date.now();
    return makeState({
        currentState: 'fasting',
        windowStartTime: now,
        windowEndTime: now + DURATION_FASTING_MS,
        lastEatingWindowTargetMs: now, // eating just ended
        ...overrides,
    });
}

function makePotentialState(overrides = {}) {
    const now = Date.now();
    return makeState({
        currentState: 'potential',
        windowStartTime: now - DURATION_FASTING_MS,
        windowEndTime: now,
        ...overrides,
    });
}

// Injects state into localStorage before app scripts run.
// Since Playwright creates a fresh page per test, addInitScript only applies
// to that test's navigations — no cross-test leakage.
async function setAppState(page, state) {
    await page.addInitScript((s) => {
        localStorage.setItem('fastingTrackerState', JSON.stringify(s));
    }, state);
}

// Advances timeOffsetMs by ms and triggers a tick synchronously.
// Because all app state and DOM updates in tick() are synchronous,
// Playwright assertions immediately after this call see the final state.
async function advanceTime(page, ms) {
    await page.evaluate((ms) => {
        appState.timeOffsetMs += ms;
        tick();
    }, ms);
}

module.exports = {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeState,
    makeEatingState,
    makeFastingState,
    makePotentialState,
    setAppState,
    advanceTime,
};
