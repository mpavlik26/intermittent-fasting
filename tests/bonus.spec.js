// US-3: Fasting bonus — waiting longer in potential eating window earns extra eating time
// US-4: Eating bonus — finishing eating early shortens the next fast
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    makePotentialState,
    setAppState,
    advanceTime,
} = require('./helpers');

// --- US-3: Fasting Bonus ---

test('US-3: bonus badge shown when still in potential after fasting window ended', async ({ page }) => {
    const now = Date.now();
    // Fasting ended 30 minutes ago → pending bonus = 15 minutes
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 30 * 60 * 1000,
        windowEndTime: now - 30 * 60 * 1000,
    }));
    await page.goto('/');

    await expect(page.locator('#bonus-badge').first()).toBeVisible();
    await expect(page.locator('#bonus-text').first()).toContainText('+15m');
});

test('US-3: starting eating late extends eating window by half of over-fasted time', async ({ page }) => {
    const now = Date.now();
    // Fasting ended 2 hours ago → bonus = 1 hour
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * 60 * 60 * 1000,
        windowEndTime: now - 2 * 60 * 60 * 1000,
    }));
    await page.goto('/');

    await page.click('#btn-first-meal');

    const { fastingBonusMs, windowEndTime, windowStartTime } = await page.evaluate(() => ({
        fastingBonusMs: appState.fastingBonusMs,
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
    }));

    // Bonus should be half of 2h = 1h (±5 min tolerance for test execution time)
    expect(fastingBonusMs).toBeGreaterThan(55 * 60 * 1000);
    expect(fastingBonusMs).toBeLessThan(65 * 60 * 1000);

    // Eating window duration should be 8h + bonus
    const windowDuration = windowEndTime - windowStartTime;
    expect(windowDuration).toBeGreaterThan(DURATION_EATING_MS + 55 * 60 * 1000);
    expect(windowDuration).toBeLessThan(DURATION_EATING_MS + 65 * 60 * 1000);
});

test('US-3: bonus badge in eating state shows fasting bonus amount', async ({ page }) => {
    const bonusMs = 30 * 60 * 1000; // 30 min bonus
    const now = Date.now();
    await setAppState(page, makeEatingState({
        fastingBonusMs: bonusMs,
        windowEndTime: now + DURATION_EATING_MS + bonusMs,
    }));
    await page.goto('/');

    await expect(page.locator('#bonus-badge').first()).toBeVisible();
    await expect(page.locator('#bonus-text').first()).toContainText('+30m fasting bonus applied!');
});

// --- US-4: Eating Bonus ---

test('US-4: logging last meal early shortens fasting window', async ({ page }) => {
    const now = Date.now();
    // Eating window with 2 hours remaining — finishing now earns 1h off the fast
    const windowEndTime = now + 2 * 60 * 60 * 1000;
    await setAppState(page, makeEatingState({
        windowStartTime: now - 6 * 60 * 60 * 1000,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
    }));
    await page.goto('/');

    await page.click('#btn-last-meal');

    // Advance past eating window to trigger eating → fasting transition
    await advanceTime(page, 2 * 60 * 60 * 1000 + 10000);
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    const { eatingBonusMs, windowEndTime: fastEnd, windowStartTime: fastStart } = await page.evaluate(() => ({
        eatingBonusMs: appState.eatingBonusMs,
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
    }));

    // Bonus should be half of 2h = 1h (±5 min tolerance)
    expect(eatingBonusMs).toBeGreaterThan(55 * 60 * 1000);
    expect(eatingBonusMs).toBeLessThan(65 * 60 * 1000);

    // Fasting window should be shorter than 16h
    const fastDuration = fastEnd - fastStart;
    expect(fastDuration).toBeLessThan(DURATION_FASTING_MS);
    expect(fastDuration).toBeGreaterThan(DURATION_FASTING_MS - 65 * 60 * 1000);
});

test('US-4: fasting bonus badge visible with correct text after eating bonus applied', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 2 * 60 * 60 * 1000;
    await setAppState(page, makeEatingState({
        windowStartTime: now - 6 * 60 * 60 * 1000,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
    }));
    await page.goto('/');

    await page.click('#btn-last-meal');
    await advanceTime(page, 2 * 60 * 60 * 1000 + 10000);

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    await expect(page.locator('#bonus-badge').first()).toBeVisible();
    await expect(page.locator('#bonus-text').first()).toContainText(/^-5[5-9]m fast reward applied!$|^-60m fast reward applied!$/);
});
