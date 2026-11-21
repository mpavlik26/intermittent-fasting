// US-23: manual setting of stored bonuses in the manual session form
const { test, expect } = require('@playwright/test');
const { makeEatingState, makePotentialState, setAppState } = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const FORM = '#manual-form-target';

async function openForm(page) {
    await page.click('#btn-toggle-manual');
    await expect(page.locator(`${FORM} .manual-stored-section`)).toBeVisible();
}

const input = (page, type, scope = FORM) => page.locator(`${scope} .manual-stored-input[data-bonus="${type}"]`);
const current = (page, type, scope = FORM) => page.locator(`${scope} .manual-stored-current[data-bonus="${type}"]`);
const step = (page, type, delta, scope = FORM) =>
    page.locator(`${scope} .manual-stored-step[data-bonus="${type}"][data-delta-min="${delta}"]`);
const confirm = (page, scope = FORM) => page.locator(`${scope} .manual-stored-confirm`);

async function stored(page) {
    return page.evaluate(() => ({
        eating: appState.storedEatingBonusMs,
        fasting: appState.storedFastingBonusMs,
        pendingEating: appState.pendingEatingBonusUseMs,
        pendingFasting: appState.pendingFastingBonusUseMs,
    }));
}

test.describe('stored bonus section in the manual form', () => {
    test.beforeEach(async ({ page }) => {
        await setAppState(page, makePotentialState({ storedEatingBonusMs: 90 * MIN }));
        await page.goto('/');
    });

    test('section with Eating and Fasting rows is visible in the collapsible form', async ({ page }) => {
        await openForm(page);
        await expect(input(page, 'eating')).toBeVisible();
        await expect(input(page, 'fasting')).toBeVisible();
        await expect(confirm(page)).toBeVisible();
        await expect(confirm(page)).toBeEnabled();
    });

    test('initial state shows current values and pre-filled fields', async ({ page }) => {
        await openForm(page);
        await expect(current(page, 'eating')).toHaveText('1h 30m');
        await expect(current(page, 'fasting')).toHaveText('0m');
        await expect(input(page, 'eating')).toHaveValue('1:30');
        await expect(input(page, 'fasting')).toHaveValue('0:00');
    });

    test('hour/minute buttons edit the draft and clamp at 0', async ({ page }) => {
        await openForm(page);
        await step(page, 'eating', 60).click();
        await step(page, 'eating', 60).click();
        await expect(input(page, 'eating')).toHaveValue('3:30');
        for (let i = 0; i < 15; i++) await step(page, 'eating', -1).click();
        await expect(input(page, 'eating')).toHaveValue('3:15');

        // Fasting at 0 can't go negative
        await step(page, 'fasting', -1).click();
        await step(page, 'fasting', -60).click();
        await expect(input(page, 'fasting')).toHaveValue('0:00');
        await step(page, 'fasting', 1).click();
        await expect(input(page, 'fasting')).toHaveValue('0:01');
    });

    test('typed value is applied only on Confirm, no upper limit, is persisted', async ({ page }) => {
        await openForm(page);
        await input(page, 'eating').fill('100:00');

        // Not applied yet
        expect((await stored(page)).eating).toBe(90 * MIN);

        await confirm(page).click();
        expect((await stored(page)).eating).toBe(100 * HOUR);
        await expect(current(page, 'eating')).toHaveText('100h');
        // Form stays open
        await expect(input(page, 'eating')).toBeVisible();

        // Persisted (setAppState's init script would re-seed on reload, so check localStorage directly)
        const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('fastingTrackerState')).storedEatingBonusMs);
        expect(persisted).toBe(100 * HOUR);
    });

    test('unconfirmed draft is discarded when the form is reopened', async ({ page }) => {
        await openForm(page);
        await step(page, 'eating', 60).click();
        await page.click('#btn-toggle-manual'); // collapse
        await openForm(page);
        await expect(input(page, 'eating')).toHaveValue('1:30');
        expect((await stored(page)).eating).toBe(90 * MIN);
    });

    for (const bad of ['-1:00', 'abc', '1:75', '', '1:5', '90']) {
        test(`invalid value "${bad}" is marked and disables Confirm`, async ({ page }) => {
            await openForm(page);
            await input(page, 'eating').fill(bad);
            await expect(input(page, 'eating')).toHaveClass(/invalid/);
            await expect(confirm(page)).toBeDisabled();

            // The other row can't be applied while one row is invalid
            await step(page, 'fasting', 60).click();
            await expect(confirm(page)).toBeDisabled();

            await input(page, 'eating').fill('2:00');
            await expect(input(page, 'eating')).not.toHaveClass(/invalid/);
            await expect(confirm(page)).toBeEnabled();
        });
    }

    test('one Confirm sets both rows', async ({ page }) => {
        await openForm(page);
        await input(page, 'eating').fill('0:45');
        await input(page, 'fasting').fill('2:10');
        await confirm(page).click();
        const s = await stored(page);
        expect(s.eating).toBe(45 * MIN);
        expect(s.fasting).toBe(130 * MIN);
    });

    test('unchanged row keeps its exact value', async ({ page }) => {
        await setAppState(page, makePotentialState({ storedFastingBonusMs: 90 * MIN + 30000 }));
        await page.goto('/');
        await openForm(page);
        await step(page, 'eating', 60).click();
        await confirm(page).click();
        const s = await stored(page);
        expect(s.eating).toBe(60 * MIN);
        expect(s.fasting).toBe(90 * MIN + 30000);
    });

    test('Confirm does not change the current window, live bonuses or penalties', async ({ page }) => {
        const before = await page.evaluate(() => ({ ...appState }));
        await openForm(page);
        await input(page, 'eating').fill('5:00');
        await input(page, 'fasting').fill('3:00');
        await confirm(page).click();
        const after = await page.evaluate(() => ({ ...appState }));
        for (const k of ['currentState', 'windowStartTime', 'windowEndTime', 'eatingBonusMs', 'fastingBonusMs',
            'eatingPenaltyMs', 'fastingPenaltyMs', 'appliedEatingBonusMs', 'appliedFastingBonusMs',
            'appliedEatingPenaltyMs', 'appliedFastingPenaltyMs', 'isManualSession']) {
            expect(after[k]).toBe(before[k]);
        }
        expect(after.storedEatingBonusMs).toBe(5 * HOUR);
        expect(after.storedFastingBonusMs).toBe(3 * HOUR);
    });

    test('stored bonus indicators update immediately', async ({ page }) => {
        await openForm(page);
        await input(page, 'eating').fill('2:00');
        await input(page, 'fasting').fill('0:20');
        await confirm(page).click();
        await expect(page.locator('#stored-eating-bonus-indicator')).toContainText('Stored Eating: +2h');
        await expect(page.locator('#stored-fasting-bonus-indicator')).toContainText('Stored Fasting: +20m');
    });

    test('Confirm and Apply Settings are independent', async ({ page }) => {
        await openForm(page);
        await input(page, 'fasting').fill('1:00');
        await confirm(page).click();

        await page.locator(`${FORM} #manual-type`).selectOption('eating');
        await page.locator(`${FORM} #btn-apply-manual`).click();
        await expect(page.locator('#current-state')).toHaveText('Eating Window');
        const s = await stored(page);
        expect(s.fasting).toBe(HOUR);
        expect(s.eating).toBe(90 * MIN);
    });

    test('an unconfirmed draft is not applied by Apply Settings', async ({ page }) => {
        await openForm(page);
        await input(page, 'eating').fill('9:00');
        await page.locator(`${FORM} #manual-type`).selectOption('eating');
        await page.locator(`${FORM} #btn-apply-manual`).click();
        expect((await stored(page)).eating).toBe(90 * MIN);
    });

    test('untouched row follows live changes of the stored value; edited draft is kept', async ({ page }) => {
        await openForm(page);
        await step(page, 'fasting', 60).click(); // edited draft: 1:00
        await page.evaluate(() => { appState.storedEatingBonusMs = 10 * 60000; appState.storedFastingBonusMs = 5 * 60000; updateUI(); });
        await expect(current(page, 'eating')).toHaveText('10m');
        await expect(input(page, 'eating')).toHaveValue('0:10');
        await expect(current(page, 'fasting')).toHaveText('5m');
        await expect(input(page, 'fasting')).toHaveValue('1:00');
    });
});

test('pending reservations are left unchanged', async ({ page }) => {
    await setAppState(page, makeEatingState({
        storedFastingBonusMs: 2 * HOUR,
        pendingFastingBonusUseMs: HOUR,
    }));
    await page.goto('/');
    await openForm(page);
    await input(page, 'fasting').fill('5:00');
    await confirm(page).click();
    const s = await stored(page);
    expect(s.fasting).toBe(5 * HOUR);
    expect(s.pendingFasting).toBe(HOUR);
});

test('Eating window: setting stored bonuses does not touch the running window', async ({ page }) => {
    const st = makeEatingState();
    await setAppState(page, st);
    await page.goto('/');
    await openForm(page);
    await input(page, 'eating').fill('1:00');
    await confirm(page).click();
    const after = await page.evaluate(() => ({ ...appState }));
    expect(after.currentState).toBe('eating');
    expect(after.windowEndTime).toBe(st.windowEndTime);
    expect(after.storedEatingBonusMs).toBe(HOUR);
});

test('setup overlay: stored bonuses can be set, then Apply keeps them', async ({ page }) => {
    await page.goto('/');
    const scope = '#setup-form-container';
    await expect(page.locator('#setup-overlay')).toBeVisible();
    await expect(input(page, 'eating', scope)).toBeVisible();
    await expect(current(page, 'eating', scope)).toHaveText('0m');

    await input(page, 'eating', scope).fill('1:30');
    await step(page, 'fasting', 60, scope).click();
    await confirm(page, scope).click();
    await expect(page.locator('#setup-overlay')).toBeVisible(); // Confirm doesn't close the overlay

    await page.locator(`${scope} #btn-apply-manual`).click();
    await expect(page.locator('#setup-overlay')).toBeHidden();
    const s = await stored(page);
    expect(s.eating).toBe(90 * MIN);
    expect(s.fasting).toBe(HOUR);
});
