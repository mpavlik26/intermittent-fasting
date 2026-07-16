// US-12: Fasting Window Simulator — visibility & overlay open/close
const { test, expect } = require('@playwright/test');
const {
    makeEatingState,
    makeFastingState,
    makePotentialState,
    setAppState,
} = require('./helpers');
const { openSimulator } = require('./simulator-helpers');

// --- Visibility ---

test('simulator link visible in potential eating window', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await expect(page.locator('#btn-open-simulator')).toBeVisible();
});

test('simulator link visible in eating window', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await expect(page.locator('#btn-open-simulator')).toBeVisible();
});

test('simulator link visible in fasting window', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await expect(page.locator('#forecast-section')).toBeVisible();
    await expect(page.locator('#btn-open-simulator')).toBeVisible();
});

test('simulator overlay hidden by default', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await expect(page.locator('#simulator-overlay')).toBeHidden();
});

test('clicking link opens simulator overlay', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);
});

test('close button hides simulator overlay', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);
    await page.click('#btn-close-simulator');
    await expect(page.locator('#simulator-overlay')).toBeHidden();
});
