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

    // Penalty = 4 * remaining time = 4 * 2h = 8h (in ms, ±5min tolerance)
    expect(prematureStartPenaltyMs).toBeGreaterThan(4 * remaining - 5 * 60 * 1000);
    expect(prematureStartPenaltyMs).toBeLessThan(4 * remaining + 5 * 60 * 1000);
});
