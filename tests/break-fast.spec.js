// US-7: Breaking fast prematurely — two penalty options
// US-20: Option 1 (prolong) now creates a deferred Eating penalty; Option 2 (premature) a deferred Fasting penalty
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    makeFastingState,
    setAppState,
} = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test('break-fast section is hidden during eating', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await expect(page.locator('#break-fast-section')).toBeHidden();
});

test('break-fast section is visible during fasting', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await expect(page.locator('#break-fast-section')).toBeVisible();
});

test('forecast section appears before break-fast section in fasting state', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');

    const forecastPos = await page.locator('#forecast-section').evaluate(el =>
        el.compareDocumentPosition(document.getElementById('break-fast-section'))
    );
    // Node.DOCUMENT_POSITION_FOLLOWING = 4 means break-fast comes AFTER forecast
    expect(forecastPos & 4).toBe(4);
});

test('break-fast panel expands on toggle click', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');

    await expect(page.locator('#break-fast-content')).toHaveClass(/collapsed/);
    await page.click('#btn-toggle-break');
    await expect(page.locator('#break-fast-content')).not.toHaveClass(/collapsed/);
});

test('Option 1: prolong eating restarts the fasting window', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - HOUR,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    const { windowStartTime } = await page.evaluate(() => ({ windowStartTime: appState.windowStartTime }));
    expect(Math.abs(windowStartTime - Date.now())).toBeLessThan(10 * 1000);
});

test('US-20 Option 1: prolonging creates a deferred Eating penalty, NOT a longer fasting window', async ({ page }) => {
    const now = Date.now();
    // lastEatingWindowTargetMs was 1 hour ago → Eating penalty = 2 * 1h = 120m
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - HOUR,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    const { windowEndTime, windowStartTime, eatingPenaltyMs, fastingPenaltyMs } = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
        eatingPenaltyMs: appState.eatingPenaltyMs,
        fastingPenaltyMs: appState.fastingPenaltyMs,
    }));

    // Fasting window stays a standard 16h (the penalty no longer extends it)
    expect(windowEndTime - windowStartTime).toBe(DURATION_FASTING_MS);
    expect(fastingPenaltyMs).toBe(0);

    // Eating penalty ≈ 2h, deferred to the next Eating window
    expect(eatingPenaltyMs).toBeGreaterThan(2 * HOUR - 5 * MIN);
    expect(eatingPenaltyMs).toBeLessThan(2 * HOUR + 5 * MIN);

    // No penalty badge in the Fasting window; the deferred penalty is not a Fasting one
    await expect(page.locator('#fasting-penalty-badge')).toBeHidden();
    await expect(page.locator('#eating-penalty-badge')).toBeHidden();
});

test('US-20 Option 1: prolonging discards a banked Eating bonus', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - HOUR,
        eatingBonusMs: 5 * HOUR,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    const eatingBonusMs = await page.evaluate(() => appState.eatingBonusMs);
    expect(eatingBonusMs).toBe(0);
});

test('US-20 Option 1: pending Fasting bonus still shortens the restarted fasting window', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - HOUR,
        fastingBonusMs: 3 * HOUR,
        appliedFastingBonusMs: 3 * HOUR,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    const { windowEndTime, windowStartTime, fastingBonusMs } = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
        fastingBonusMs: appState.fastingBonusMs,
    }));
    expect(windowEndTime - windowStartTime).toBe(DURATION_FASTING_MS - 3 * HOUR);
    expect(fastingBonusMs).toBe(3 * HOUR);
    await expect(page.locator('#fasting-bonus-text')).toContainText('-3h fasting bonus applied!');
});

test('US-20 Option 1: a large Eating penalty cascade-skips Eating windows and eagerly extends the restarted fast', async ({ page }) => {
    const now = Date.now();
    // Overshoot 5h → Eating penalty 10h → one full 8h Eating window skipped (+16h Fasting), 2h remainder
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - 5 * HOUR,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    const { windowEndTime, windowStartTime, eatingPenaltyMs } = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
        eatingPenaltyMs: appState.eatingPenaltyMs,
    }));

    expect(windowEndTime - windowStartTime).toBe(2 * DURATION_FASTING_MS);
    expect(eatingPenaltyMs).toBeGreaterThan(2 * HOUR - 5 * MIN);
    expect(eatingPenaltyMs).toBeLessThan(2 * HOUR + 5 * MIN);
});

test('Option 2: premature start transitions to eating window', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        windowEndTime: now + 2 * HOUR, // 2 hours remaining
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-premature');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#break-fast-section')).toBeHidden();
});

test('US-20 Option 2: premature start carries Fasting penalty into next fasting window', async ({ page }) => {
    const now = Date.now();
    const remaining = 2 * HOUR; // 2 hours remaining
    await setAppState(page, makeFastingState({
        windowEndTime: now + remaining,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-premature');

    const { fastingPenaltyMs, eatingPenaltyMs, windowStartTime, windowEndTime } = await page.evaluate(() => ({
        fastingPenaltyMs: appState.fastingPenaltyMs,
        eatingPenaltyMs: appState.eatingPenaltyMs,
        windowStartTime: appState.windowStartTime,
        windowEndTime: appState.windowEndTime,
    }));

    // Penalty = 2 * remaining time = 2 * 2h = 4h (in ms, ±5min tolerance)
    expect(fastingPenaltyMs).toBeGreaterThan(2 * remaining - 5 * MIN);
    expect(fastingPenaltyMs).toBeLessThan(2 * remaining + 5 * MIN);
    // The new Eating window itself is a standard 8h (penalty is deferred), no Eating penalty
    expect(windowEndTime - windowStartTime).toBe(DURATION_EATING_MS);
    expect(eatingPenaltyMs).toBe(0);
});

test('US-20 Option 2: premature start clears a pending Eating penalty and Fasting bonus', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        windowEndTime: now + 2 * HOUR,
        eatingPenaltyMs: HOUR,
        fastingBonusMs: HOUR,
        appliedFastingBonusMs: HOUR,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-premature');

    const { eatingPenaltyMs, fastingBonusMs } = await page.evaluate(() => ({
        eatingPenaltyMs: appState.eatingPenaltyMs,
        fastingBonusMs: appState.fastingBonusMs,
    }));
    expect(eatingPenaltyMs).toBe(0);
    expect(fastingBonusMs).toBe(0);
});

// US-15: retrospective logs that land inside an active Fasting window
// retroactively apply US-7 consequences using the entered time instead of "now".

function toHHMM(date) {
    return date.toTimeString().slice(0, 5);
}

async function submitRetroLog(page, mealType, timeValue) {
    await page.click('#btn-toggle-retro');
    await page.selectOption('#meal-type-select', mealType);
    await page.fill('#meal-time-input', timeValue);
    await page.click('#btn-submit-log');
}

test('US-15: retrospective last meal inside active fast applies Option 1 penalty at the retro time', async ({ page }) => {
    const now = Date.now();
    const retroTime = new Date(now - 30 * MIN); // 30 min ago
    const lastEatingWindowTargetMs = now - 90 * MIN; // eating target was 90 min ago

    await setAppState(page, makeFastingState({
        windowStartTime: now - HOUR, // fast started 1h ago
        windowEndTime: now + 15 * HOUR,
        lastEatingWindowTargetMs,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'last', toHHMM(retroTime));

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    const { windowStartTime, eatingPenaltyMs } = await page.evaluate(() => ({
        windowStartTime: appState.windowStartTime,
        eatingPenaltyMs: appState.eatingPenaltyMs,
    }));

    // windowStartTime reflects the retro time, not real now
    expect(Math.abs(windowStartTime - retroTime.getTime())).toBeLessThan(60 * 1000);

    // US-20: Eating penalty = 2 * (retroTime - lastEatingWindowTargetMs) ≈ 2 * 60min = 120min
    const expectedPenalty = 2 * (retroTime.getTime() - lastEatingWindowTargetMs);
    expect(eatingPenaltyMs).toBeGreaterThan(expectedPenalty - 5 * MIN);
    expect(eatingPenaltyMs).toBeLessThan(expectedPenalty + 5 * MIN);
});

test('US-15: retrospective first meal inside active fast applies Option 2 penalty at the retro time', async ({ page }) => {
    const now = Date.now();
    const retroTime = new Date(now - 30 * MIN); // 30 min ago
    const windowEndTime = now + 2 * HOUR; // 2h remaining from real now

    await setAppState(page, makeFastingState({
        windowStartTime: now - HOUR, // fast started 1h ago
        windowEndTime,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'first', toHHMM(retroTime));

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#break-fast-section')).toBeHidden();

    const { fastingPenaltyMs, history } = await page.evaluate(() => ({
        fastingPenaltyMs: appState.fastingPenaltyMs,
        history: appState.history,
    }));

    // Penalty = 2 * (windowEndTime - retroTime) ≈ 2 * 2.5h
    const expectedPenalty = 2 * (windowEndTime - retroTime.getTime());
    expect(fastingPenaltyMs).toBeGreaterThan(expectedPenalty - 5 * MIN);
    expect(fastingPenaltyMs).toBeLessThan(expectedPenalty + 5 * MIN);

    // The interrupted fast was recorded to history
    expect(history.length).toBe(1);
    expect(history[0].type).toBe('fasting');
});

test('US-15: retrospective entry outside active fast window keeps existing US-B5 behavior', async ({ page }) => {
    const now = Date.now();
    // Entry is before the fast even started — outside the active window.
    const retroTime = new Date(now - 3 * HOUR); // 3h ago

    await setAppState(page, makeFastingState({
        windowStartTime: now - HOUR, // fast started 1h ago
        windowEndTime: now + 15 * HOUR,
        lastEatingWindowTargetMs: now - 90 * MIN,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'last', toHHMM(retroTime));

    // logLastMeal (unchanged US-B5 path) does not touch US-7 penalty fields.
    const { eatingPenaltyMs, fastingPenaltyMs } = await page.evaluate(() => ({
        eatingPenaltyMs: appState.eatingPenaltyMs,
        fastingPenaltyMs: appState.fastingPenaltyMs,
    }));

    expect(eatingPenaltyMs).toBe(0);
    expect(fastingPenaltyMs).toBe(0);
});

test('US-15: retrospective entry exactly on the fast window boundaries counts as inside', async ({ page }) => {
    // parseRetrospectiveTime only has minute granularity (HH:MM input), so the
    // boundary must be minute-aligned for the retro time to equal it exactly.
    const nowAligned = Math.floor(Date.now() / 60000) * 60000;
    const windowStartTime = nowAligned - HOUR; // fast started 1h ago
    const lastEatingWindowTargetMs = nowAligned - 90 * MIN;
    const retroTime = new Date(windowStartTime); // exactly at windowStartTime

    await setAppState(page, makeFastingState({
        windowStartTime,
        windowEndTime: nowAligned + 15 * HOUR,
        lastEatingWindowTargetMs,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'last', toHHMM(retroTime));

    // Landing exactly on windowStartTime still counts as "inside" → Option 1 applies.
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    const { eatingPenaltyMs } = await page.evaluate(() => ({
        eatingPenaltyMs: appState.eatingPenaltyMs,
    }));
    expect(eatingPenaltyMs).toBeGreaterThan(0);
});

// --- US-19: hours+minutes formatting once a penalty amount reaches 60 minutes ---

test('US-19: Fasting penalty badge shows hours+minutes for a non-exact-hour amount', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        windowEndTime: now + DURATION_FASTING_MS + 90 * MIN,
        fastingPenaltyMs: 90 * MIN,
        appliedFastingPenaltyMs: 90 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator('#fasting-penalty-badge')).toBeVisible();
    await expect(page.locator('#fasting-penalty-text')).toContainText('+1h 30m penalty applied!');
});

test('US-19: Eating penalty badge shows hours+minutes for a non-exact-hour amount', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        windowEndTime: now + DURATION_EATING_MS - 90 * MIN,
        appliedEatingPenaltyMs: 90 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator('#eating-penalty-badge')).toBeVisible();
    await expect(page.locator('#eating-penalty-text')).toContainText('-1h 30m penalty applied!');
});

test('US-19: break-fast prolong/premature penalty predictions switch to hours+minutes at 60 or more', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        // prolong prediction = 2 * 45m = 90m = 1h 30m
        lastEatingWindowTargetMs: now - 45 * MIN,
        // premature prediction = 2 * 31m ≈ 62m, comfortably above the 60m boundary
        // despite the real time that elapses between "now" and the assertion below
        windowEndTime: now + 31 * MIN,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');

    await expect(page.locator('#break-prolong-penalty')).toHaveText('1h 30m');
    await expect(page.locator('#break-premature-penalty')).toHaveText(/^1h [0-2]m$/);
});
