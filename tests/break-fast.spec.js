// US-7: Breaking fast prematurely — two penalty options
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    makeFastingState,
    setAppState,
} = require('./helpers');

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

test('Option 1: prolong eating transitions to fasting with penalty badge', async ({ page }) => {
    const now = Date.now();
    // lastEatingWindowTargetMs was 1 hour ago → penalty = 2 * 1h = 120m
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - 60 * 60 * 1000,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    await expect(page.locator('#penalty-badge')).toBeVisible();
    await expect(page.locator('#penalty-text')).toContainText('+120m penalty applied!');
});

test('Option 1: prolong eating fasting window is longer than standard 16h', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        lastEatingWindowTargetMs: now - 60 * 60 * 1000,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    const { windowEndTime, windowStartTime } = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
    }));

    // With 2h penalty, fasting duration = 16h + 2h = 18h
    const fastDuration = windowEndTime - windowStartTime;
    expect(fastDuration).toBeGreaterThan(DURATION_FASTING_MS + 115 * 60 * 1000);
    expect(fastDuration).toBeLessThan(DURATION_FASTING_MS + 125 * 60 * 1000);
});

test('Option 2: premature start transitions to eating window', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        windowEndTime: now + 2 * 60 * 60 * 1000, // 2 hours remaining
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-premature');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#break-fast-section')).toBeHidden();
});

test('Option 2: premature start carries penalty into next fasting window', async ({ page }) => {
    const now = Date.now();
    const remaining = 2 * 60 * 60 * 1000; // 2 hours remaining
    await setAppState(page, makeFastingState({
        windowEndTime: now + remaining,
    }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-premature');

    const { prematureStartPenaltyMs } = await page.evaluate(() => ({
        prematureStartPenaltyMs: appState.prematureStartPenaltyMs,
    }));

    // Penalty = 2 * remaining time = 2 * 2h = 4h (in ms, ±5min tolerance)
    expect(prematureStartPenaltyMs).toBeGreaterThan(2 * remaining - 5 * 60 * 1000);
    expect(prematureStartPenaltyMs).toBeLessThan(2 * remaining + 5 * 60 * 1000);
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
    const retroTime = new Date(now - 30 * 60 * 1000); // 30 min ago
    const lastEatingWindowTargetMs = now - 90 * 60 * 1000; // eating target was 90 min ago

    await setAppState(page, makeFastingState({
        windowStartTime: now - 60 * 60 * 1000, // fast started 1h ago
        windowEndTime: now + 15 * 60 * 60 * 1000,
        lastEatingWindowTargetMs,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'last', toHHMM(retroTime));

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    const { windowStartTime, prolongingPenaltyMs } = await page.evaluate(() => ({
        windowStartTime: appState.windowStartTime,
        prolongingPenaltyMs: appState.prolongingPenaltyMs,
    }));

    // windowStartTime reflects the retro time, not real now
    expect(Math.abs(windowStartTime - retroTime.getTime())).toBeLessThan(60 * 1000);

    // Penalty = 2 * (retroTime - lastEatingWindowTargetMs) ≈ 2 * 60min = 120min
    const expectedPenalty = 2 * (retroTime.getTime() - lastEatingWindowTargetMs);
    expect(prolongingPenaltyMs).toBeGreaterThan(expectedPenalty - 5 * 60 * 1000);
    expect(prolongingPenaltyMs).toBeLessThan(expectedPenalty + 5 * 60 * 1000);
});

test('US-15: retrospective first meal inside active fast applies Option 2 penalty at the retro time', async ({ page }) => {
    const now = Date.now();
    const retroTime = new Date(now - 30 * 60 * 1000); // 30 min ago
    const windowEndTime = now + 2 * 60 * 60 * 1000; // 2h remaining from real now

    await setAppState(page, makeFastingState({
        windowStartTime: now - 60 * 60 * 1000, // fast started 1h ago
        windowEndTime,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'first', toHHMM(retroTime));

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#break-fast-section')).toBeHidden();

    const { prematureStartPenaltyMs, history } = await page.evaluate(() => ({
        prematureStartPenaltyMs: appState.prematureStartPenaltyMs,
        history: appState.history,
    }));

    // Penalty = 2 * (windowEndTime - retroTime) ≈ 2 * 2.5h
    const expectedPenalty = 2 * (windowEndTime - retroTime.getTime());
    expect(prematureStartPenaltyMs).toBeGreaterThan(expectedPenalty - 5 * 60 * 1000);
    expect(prematureStartPenaltyMs).toBeLessThan(expectedPenalty + 5 * 60 * 1000);

    // The interrupted fast was recorded to history
    expect(history.length).toBe(1);
    expect(history[0].type).toBe('fasting');
});

test('US-15: retrospective entry outside active fast window keeps existing US-B5 behavior', async ({ page }) => {
    const now = Date.now();
    // Entry is before the fast even started — outside the active window.
    const retroTime = new Date(now - 3 * 60 * 60 * 1000); // 3h ago

    await setAppState(page, makeFastingState({
        windowStartTime: now - 60 * 60 * 1000, // fast started 1h ago
        windowEndTime: now + 15 * 60 * 60 * 1000,
        lastEatingWindowTargetMs: now - 90 * 60 * 1000,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'last', toHHMM(retroTime));

    // logLastMeal (unchanged US-B5 path) does not touch US-7 penalty fields.
    const { prolongingPenaltyMs, prematureStartPenaltyMs } = await page.evaluate(() => ({
        prolongingPenaltyMs: appState.prolongingPenaltyMs,
        prematureStartPenaltyMs: appState.prematureStartPenaltyMs,
    }));

    expect(prolongingPenaltyMs).toBe(0);
    expect(prematureStartPenaltyMs).toBe(0);
});

test('US-15: retrospective entry exactly on the fast window boundaries counts as inside', async ({ page }) => {
    // parseRetrospectiveTime only has minute granularity (HH:MM input), so the
    // boundary must be minute-aligned for the retro time to equal it exactly.
    const nowAligned = Math.floor(Date.now() / 60000) * 60000;
    const windowStartTime = nowAligned - 60 * 60 * 1000; // fast started 1h ago
    const lastEatingWindowTargetMs = nowAligned - 90 * 60 * 1000;
    const retroTime = new Date(windowStartTime); // exactly at windowStartTime

    await setAppState(page, makeFastingState({
        windowStartTime,
        windowEndTime: nowAligned + 15 * 60 * 60 * 1000,
        lastEatingWindowTargetMs,
    }));
    await page.goto('/');

    await submitRetroLog(page, 'last', toHHMM(retroTime));

    // Landing exactly on windowStartTime still counts as "inside" → Option 1 applies.
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    const { prolongingPenaltyMs } = await page.evaluate(() => ({
        prolongingPenaltyMs: appState.prolongingPenaltyMs,
    }));
    expect(prolongingPenaltyMs).toBeGreaterThan(0);
});
