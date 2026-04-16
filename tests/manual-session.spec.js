// US-11: Manual session control — initial setup overlay and mid-session override
const { test, expect } = require('@playwright/test');
const {
    makeEatingState,
    makeFastingState,
    makePotentialState,
    setAppState,
} = require('./helpers');

test('setup overlay shown when no saved state', async ({ page }) => {
    // Fresh context → no localStorage → showSetupOverlay() is called
    await page.goto('/');
    await expect(page.locator('#setup-overlay')).toBeVisible();
});

test('setup overlay hidden after state exists', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await expect(page.locator('#setup-overlay')).toBeHidden();
});

test('setup overlay: selecting eating window hides overlay and shows eating state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#setup-overlay')).toBeVisible();

    // Default start time = now (pre-filled). Switch type to eating.
    await page.locator('#setup-form-container #manual-type').selectOption('eating');

    // Click Apply Settings — current time should fall within the new window span
    await page.locator('#setup-form-container #btn-apply-manual').click();

    await expect(page.locator('#setup-overlay')).toBeHidden();
    await expect(page.locator('#current-state')).toHaveText('Eating Window');
});

test('setup overlay: selecting fasting window hides overlay and shows fasting state', async ({ page }) => {
    await page.goto('/');

    await page.locator('#setup-form-container #manual-type').selectOption('fasting');
    await page.locator('#setup-form-container #btn-apply-manual').click();

    await expect(page.locator('#setup-overlay')).toBeHidden();
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
});

test('setup overlay: selecting potential eating window hides overlay and shows potential state', async ({ page }) => {
    await page.goto('/');

    // "Potential Eating" is the default type — just click Apply
    await page.locator('#setup-form-container #btn-apply-manual').click();

    await expect(page.locator('#setup-overlay')).toBeHidden();
    await expect(page.locator('#current-state')).toHaveText('Potential Eating Window');
});

test('manual session control: can switch to eating window mid-session', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await page.click('#btn-toggle-manual');

    await page.locator('#manual-form-target #manual-type').selectOption('eating');
    await page.locator('#manual-form-target #btn-apply-manual').click();

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
});

test('manual session control: can switch to fasting window mid-session', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');

    await page.click('#btn-toggle-manual');

    await page.locator('#manual-form-target #manual-type').selectOption('fasting');
    await page.locator('#manual-form-target #btn-apply-manual').click();

    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
});

test('session applied via manual control sets isManualSession flag', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');

    await page.click('#btn-toggle-manual');
    await page.locator('#manual-form-target #manual-type').selectOption('eating');
    await page.locator('#manual-form-target #btn-apply-manual').click();

    const isManual = await page.evaluate(() => appState.isManualSession);
    expect(isManual).toBe(true);
});
