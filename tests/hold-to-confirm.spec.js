// US-14: Hold-to-confirm on Log First Meal / Log Last Meal buttons.
// Action fires only after a full 3-second hold; releasing early does nothing.
const { test, expect } = require('@playwright/test');
const {
    makeEatingState,
    makePotentialState,
    setAppState,
    holdButton,
} = require('./helpers');

test('btn-first-meal shows countdown starting at 3 when pressed', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await page.locator('#btn-first-meal').dispatchEvent('mousedown');
    await expect(page.locator('#btn-first-meal')).toHaveText('3');

    await page.locator('#btn-first-meal').dispatchEvent('mouseup');
});

test('btn-first-meal resets text on early release', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await page.locator('#btn-first-meal').dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
    await page.locator('#btn-first-meal').dispatchEvent('mouseup');

    await expect(page.locator('#btn-first-meal')).toHaveText('Log First Meal');
});

test('btn-first-meal: early release does not transition to eating', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await page.locator('#btn-first-meal').dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
    await page.locator('#btn-first-meal').dispatchEvent('mouseup');

    const state = await page.evaluate(() => appState.currentState);
    expect(state).toBe('potential');
});

test('btn-first-meal: holding 3s transitions to eating', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await holdButton(page, '#btn-first-meal');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
});

test('btn-last-meal: early release does not record last meal', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');

    await page.locator('#btn-last-meal').dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
    await page.locator('#btn-last-meal').dispatchEvent('mouseup');

    const lastMealTime = await page.evaluate(() => appState.lastMealTime);
    expect(lastMealTime).toBeNull();
});

test('btn-last-meal: holding 3s records last meal time', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');

    const beforeTime = Date.now();
    await holdButton(page, '#btn-last-meal');

    const lastMealTime = await page.evaluate(() => appState.lastMealTime);
    expect(lastMealTime).toBeGreaterThanOrEqual(beforeTime);
});
