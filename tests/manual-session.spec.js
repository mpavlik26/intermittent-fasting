// US-11: Manual session control — initial setup overlay and mid-session override
const { test, expect } = require('@playwright/test');
const {
    makeEatingState,
    makeFastingState,
    makePotentialState,
    setAppState,
    advanceTime,
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

// --- Bugfix: manually set Eating window must behave like a naturally started one ---
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DURATION_EATING_MS = 8 * HOUR;
const DURATION_FASTING_MS = 16 * HOUR;

// Manually sets an Eating window that started 2h ago and ends 6h from now (page already loaded).
async function manualEating(page) {
    return page.evaluate(() => {
        const now = Date.now();
        const s = now - 2 * 3600000;
        const e = now + 6 * 3600000;
        manualSetWindow('eating', s, e);
        return { s, e };
    });
}

test.describe('manual Eating window', () => {
    test.beforeEach(async ({ page }) => {
        await setAppState(page, makePotentialState());
        await page.goto('/');
    });

    test('has no logged last meal and E equals the window end', async ({ page }) => {
        const { e } = await manualEating(page);
        const s = await page.evaluate(() => ({ ...appState }));
        expect(s.lastMealTime).toBeNull();
        expect(s.lastEatingWindowTargetMs).toBe(e);
    });

    test('no last meal logged → Fasting starts at window end and Eating window is recorded in history', async ({ page }) => {
        const { s, e } = await manualEating(page);
        await advanceTime(page, 6 * HOUR + MIN);

        const st = await page.evaluate(() => ({ ...appState }));
        expect(st.currentState).toBe('fasting');
        expect(st.windowStartTime).toBe(e);
        expect(st.windowEndTime).toBe(e + DURATION_FASTING_MS);
        expect(st.eatingBonusMs).toBe(0);

        expect(st.history).toHaveLength(1);
        expect(st.history[0]).toMatchObject({ type: 'eating', startTime: s, endTime: e, isManual: true });
    });

    test('last meal logged → Fasting starts at last meal, Eating bonus banked, window recorded in history', async ({ page }) => {
        const { s, e } = await manualEating(page);
        const lastMeal = await page.evaluate(() => {
            const t = Date.now() - 30 * 60000;
            logLastMeal(t);
            return t;
        });
        await advanceTime(page, 6 * HOUR + MIN);

        const st = await page.evaluate(() => ({ ...appState }));
        expect(st.currentState).toBe('fasting');
        expect(st.windowStartTime).toBe(lastMeal);
        expect(st.windowEndTime).toBe(lastMeal + DURATION_FASTING_MS);
        expect(st.eatingBonusMs).toBe(e - lastMeal);

        expect(st.history).toHaveLength(1);
        expect(st.history[0]).toMatchObject({ type: 'eating', startTime: s, endTime: e, isManual: true });
    });

    test('retro last meal logged inside the following Fasting window gives a sane Fasting window (no huge penalty)', async ({ page }) => {
        const { e } = await manualEating(page);
        const lastMeal = await page.evaluate(() => {
            const t = Date.now() - 30 * 60000;
            logLastMeal(t);
            return t;
        });
        await advanceTime(page, 6 * HOUR + MIN);

        // Retro "last meal" 20 min after the logged one, i.e. still before E (US-21 way back)
        const retro = lastMeal + 20 * MIN;
        await page.evaluate((t) => prolongEatingAndStartFast(t), retro);

        const st = await page.evaluate(() => ({ ...appState }));
        expect(st.currentState).toBe('fasting');
        expect(st.windowStartTime).toBe(retro);
        expect(st.eatingPenaltyMs).toBe(0);
        expect(st.windowEndTime).toBe(retro + DURATION_FASTING_MS);
        expect(st.eatingBonusMs).toBe(e - retro);
    });

    test('retro last meal logged after the no-last-meal Fasting start gives a sane Fasting window', async ({ page }) => {
        const { e } = await manualEating(page);
        await advanceTime(page, 6 * HOUR + 10 * MIN);

        // Retro last meal inside the Eating window, earlier than the Fasting window start
        const retro = e - 100 * MIN;
        await page.evaluate((t) => logLastMeal(t), retro);

        const st = await page.evaluate(() => ({ ...appState }));
        expect(st.currentState).toBe('fasting');
        expect(st.windowStartTime).toBe(retro);
        expect(st.windowEndTime).toBe(retro + DURATION_FASTING_MS);
        expect(st.eatingBonusMs).toBe(100 * MIN);
    });
});

test('manual Fasting window: E is the fasting start, so retro prolonging adds no huge penalty', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    const start = await page.evaluate(() => {
        const s = Date.now() - 2 * 3600000;
        manualSetWindow('fasting', s, s + 16 * 3600000);
        return s;
    });
    const st0 = await page.evaluate(() => ({ ...appState }));
    expect(st0.lastMealTime).toBe(start);
    expect(st0.lastEatingWindowTargetMs).toBe(start);

    const retro = start + 30 * MIN;
    await page.evaluate((t) => prolongEatingAndStartFast(t), retro);
    const st = await page.evaluate(() => ({ ...appState }));
    expect(st.eatingPenaltyMs).toBe(2 * 30 * MIN);
    expect(st.windowEndTime).toBe(retro + DURATION_FASTING_MS);
});

// Potential window (manual or fresh): "Log last meal" starts a Fasting window that follows no Eating window of its
// own, so E must be the last meal — otherwise the Prolong penalty/badge was 2 × (now − null) ≈ 1 994 736 h.
for (const [label, setup] of [
    ['manual Potential', (page) => page.evaluate(() => manualSetWindow('potential', Date.now() - 2 * 3600000, null))],
    ['fresh Potential', async () => {}],
]) {
    test(`${label}: Log last meal → Fasting with E = last meal, sane Prolong badge and penalty`, async ({ page }) => {
        await setAppState(page, makePotentialState());
        await page.goto('/');
        await setup(page);

        const lastMeal = await page.evaluate(() => {
            const t = Date.now() - 10 * 60000;
            logLastMeal(t);
            tick();
            return t;
        });
        const st = await page.evaluate(() => ({ ...appState }));
        expect(st.currentState).toBe('fasting');
        expect(st.windowStartTime).toBe(lastMeal);
        expect(st.lastEatingWindowTargetMs).toBe(lastMeal);
        expect(st.eatingBonusMs).toBe(0);

        // Prolong badge: 2 × ~10 min = ~20 min (not thousands of hours)
        const badge = await page.evaluate(() => elBreakProlongPenalty.textContent);
        expect(badge).toMatch(/^(19|20|21)m$/);

        await page.evaluate(() => prolongEatingAndStartFast());
        const after = await page.evaluate(() => ({ ...appState }));
        expect(after.currentState).toBe('fasting');
        expect(after.eatingPenaltyMs).toBeGreaterThan(19 * MIN);
        expect(after.eatingPenaltyMs).toBeLessThan(21 * MIN);
        expect(after.windowEndTime - after.windowStartTime).toBe(DURATION_FASTING_MS);
    });
}

test('Fasting state saved without E (null): prolong is null-safe (no overshoot instead of a huge penalty)', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, { ...makeFastingState(), lastEatingWindowTargetMs: null });
    await page.goto('/');
    await page.evaluate(() => { tick(); prolongEatingAndStartFast(); });
    const st = await page.evaluate(() => ({ ...appState }));
    expect(st.eatingPenaltyMs).toBeLessThan(DURATION_EATING_MS);
    expect(st.windowEndTime - st.windowStartTime).toBe(DURATION_FASTING_MS);
});

test('manual Fasting window: retro last meal before the start banks Eating bonus = start − meal; later meal gives none', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    const start = await page.evaluate(() => {
        const s = Date.now() - 2 * 3600000;
        manualSetWindow('fasting', s, s + 16 * 3600000);
        return s;
    });

    // Meal 1 h before the declared start → Fasting moves earlier, bonus = 1 h
    const earlier = start - HOUR;
    await page.evaluate((t) => logLastMeal(t), earlier);
    let st = await page.evaluate(() => ({ ...appState }));
    expect(st.currentState).toBe('fasting');
    expect(st.windowStartTime).toBe(earlier);
    expect(st.windowEndTime).toBe(earlier + DURATION_FASTING_MS);
    expect(st.eatingBonusMs).toBe(HOUR);

    // Correcting it to a meal after the declared start → no bonus
    const later = start + 20 * MIN;
    await page.evaluate((t) => logLastMeal(t), later);
    st = await page.evaluate(() => ({ ...appState }));
    expect(st.windowStartTime).toBe(later);
    expect(st.eatingBonusMs).toBe(0);
});
