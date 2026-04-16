const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    makeFastingState,
    makePotentialState,
    setAppState,
    advanceTime,
} = require('./helpers');

test('shows setup overlay when no saved state', async ({ page }) => {
    // Fresh context = empty localStorage; app calls showSetupOverlay()
    await page.goto('/');
    await expect(page.locator('#setup-overlay')).toBeVisible();
});

test('potential eating state shows correct UI', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await expect(page.locator('#current-state')).toHaveText('Potential Eating Window');
    await expect(page.locator('#btn-first-meal')).toBeVisible();
    await expect(page.locator('#btn-last-meal')).toBeHidden();
    await expect(page.locator('#timer-display')).toBeHidden();
    await expect(page.locator('#break-fast-section')).toBeHidden();
});

test('clicking Log First Meal transitions to eating window', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await page.click('#btn-first-meal');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#timer-display')).toBeVisible();
    await expect(page.locator('#btn-last-meal')).toBeVisible();
    await expect(page.locator('#btn-first-meal')).toBeHidden();
});

test('eating state shows timer and hides first meal button', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#timer-display')).toBeVisible();
    await expect(page.locator('#btn-first-meal')).toBeHidden();
    await expect(page.locator('#btn-last-meal')).toBeVisible();
    await expect(page.locator('#break-fast-section')).toBeHidden();
});

test('fasting state shows timer and break-fast section', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    await expect(page.locator('#timer-display')).toBeVisible();
    await expect(page.locator('#break-fast-section')).toBeVisible();
    await expect(page.locator('#btn-first-meal')).toBeHidden();
    await expect(page.locator('#btn-last-meal')).toBeHidden();
});

test('eating window auto-transitions to fasting when time expires', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        windowStartTime: now - DURATION_EATING_MS + 5000,
        windowEndTime: now + 5000,
        lastEatingWindowTargetMs: now + 5000,
    }));
    await page.goto('/');

    await advanceTime(page, 10000);

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
});

test('fasting window auto-transitions to potential when time expires', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        windowStartTime: now - DURATION_FASTING_MS + 5000,
        windowEndTime: now + 5000,
    }));
    await page.goto('/');

    await advanceTime(page, 10000);

    await expect(page.locator('#current-state')).toHaveText('Potential Eating Window');
});

test('full cycle potential → eating → fasting → potential leaves 2 history entries', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    // Start eating
    await page.click('#btn-first-meal');
    await expect(page.locator('#current-state')).toHaveText('Eating Window');

    // Advance past eating window (8 hours)
    await advanceTime(page, DURATION_EATING_MS + 10000);
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    // Advance past fasting window (16 hours)
    await advanceTime(page, DURATION_FASTING_MS + 10000);
    await expect(page.locator('#current-state')).toHaveText('Potential Eating Window');

    // Open history and verify 2 records
    await page.click('#btn-toggle-history');
    await expect(page.locator('.history-record-item')).toHaveCount(2);
});
