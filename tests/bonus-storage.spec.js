// US-18/US-20/US-22: Stored bonus — two independent pools (Fasting / Eating).
// Store (US-22): keyed by the current window, entered by tapping the end time. Use: spend a stored bonus
// (immediately when the matching window is active, otherwise reserved for the next matching window).
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

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

async function adjust(page, mins) {
    await page.evaluate((m) => adjustAmountPicker(m), mins);
}

async function clickPlus(page, times) {
    for (let i = 0; i < times; i++) {
        await page.locator('#amount-picker-plus').click();
    }
}

const readState = (page) => page.evaluate(() => ({
    currentState: appState.currentState,
    windowStartTime: appState.windowStartTime,
    windowEndTime: appState.windowEndTime,
    lastEatingWindowTargetMs: appState.lastEatingWindowTargetMs,
    fastingBonusMs: appState.fastingBonusMs,
    eatingBonusMs: appState.eatingBonusMs,
    storedFastingBonusMs: appState.storedFastingBonusMs,
    storedEatingBonusMs: appState.storedEatingBonusMs,
    pendingFastingBonusUseMs: appState.pendingFastingBonusUseMs,
    pendingEatingBonusUseMs: appState.pendingEatingBonusUseMs,
}));

// --- Entry point: tap the window's end time (US-22) ---

test('US-22: storage icon next to the end time shows ← in EATING, → in FASTING, and is hidden in POTENTIAL', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await expect(page.locator('#end-store-icon')).toBeVisible();
    await expect(page.locator('#end-store-arrow')).toHaveText('←');

    await setAppState(page, makeFastingState());
    await page.goto('/');
    await expect(page.locator('#end-store-icon')).toBeVisible();
    await expect(page.locator('#end-store-arrow')).toHaveText('→');

    await setAppState(page, makePotentialState());
    await page.goto('/');
    await expect(page.locator('#end-store-icon')).toBeHidden();
});

test('US-22: tapping the end time opens the matching store dialog in EATING and FASTING', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#amount-picker-title')).toHaveText('Move Eating Bonus to Storage');
    await page.locator('#amount-picker-close').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);

    await setAppState(page, makeFastingState());
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-title')).toHaveText('Move Fasting Bonus to Storage');
});

test('US-22: tapping the end time in POTENTIAL opens nothing (no store in Potential)', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await expect(page.locator('#end-time-block')).toBeHidden(); // no end time to tap in Potential
    await page.evaluate(() => openStoreForCurrentWindow());
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);
});

test('US-22: bonus badges are informational only — no storable class, tapping opens nothing', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        fastingBonusMs: 30 * MIN,
        appliedFastingBonusMs: 30 * MIN,
        eatingBonusMs: 20 * MIN,
        windowEndTime: now + DURATION_FASTING_MS - 30 * MIN,
    }));
    await page.goto('/');
    for (const sel of ['#fasting-bonus-badge', '#eating-bonus-badge']) {
        await expect(page.locator(sel)).not.toHaveClass(/storable/);
        await page.locator(sel).click();
        await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);
    }

    await setAppState(page, makeEatingState({
        appliedEatingBonusMs: 30 * MIN,
        windowEndTime: now + DURATION_EATING_MS + 30 * MIN,
        lastEatingWindowTargetMs: now + DURATION_EATING_MS + 30 * MIN,
    }));
    await page.goto('/');
    await expect(page.locator('#eating-bonus-badge')).not.toHaveClass(/storable/);
    await page.locator('#eating-bonus-badge').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);
});

// --- Store flow ---

test('US-22: storing Eating time in EATING moves the end left, E with it, grows the store and leaves live bonuses alone', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        eatingBonusMs: 11 * MIN,
        storedEatingBonusMs: 5 * MIN,
    }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await adjust(page, 120);
    await expect(page.locator('#amount-picker-value')).toHaveText('2h');
    await page.locator('#amount-picker-confirm').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);

    const state = await readState(page);
    expect(state.windowEndTime).toBe(windowEndTime - 2 * HOUR);
    expect(state.lastEatingWindowTargetMs).toBe(windowEndTime - 2 * HOUR);
    expect(state.storedEatingBonusMs).toBe(2 * HOUR + 5 * MIN);
    expect(state.eatingBonusMs).toBe(11 * MIN);

    // Read localStorage directly (a reload would re-fire setAppState's init script)
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('fastingTrackerState')));
    expect(persisted.windowEndTime).toBe(windowEndTime - 2 * HOUR);
    expect(persisted.storedEatingBonusMs).toBe(2 * HOUR + 5 * MIN);
});

test('US-22: finishing early after storing Eating time earns the bonus relative to the moved end (E - T)', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
    }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await adjust(page, 180);
    await page.locator('#amount-picker-confirm').click();

    const bonus = await page.evaluate(() => getEatingBonusForTime(Date.now()));
    const expected = windowEndTime - 3 * HOUR - Date.now();
    expect(Math.abs(bonus - expected)).toBeLessThan(2000);
});

test('US-22: storing Fasting time in FASTING moves the end right and grows the store; repeatable, live bonus untouched', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_FASTING_MS - 40 * MIN;
    await setAppState(page, makeFastingState({
        fastingBonusMs: 40 * MIN,
        appliedFastingBonusMs: 40 * MIN,
        windowEndTime,
        storedFastingBonusMs: 5 * MIN,
    }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await adjust(page, 15);
    await page.locator('#amount-picker-confirm').click();

    let state = await readState(page);
    expect(state.fastingBonusMs).toBe(40 * MIN);
    expect(state.windowEndTime).toBe(windowEndTime + 15 * MIN);
    expect(state.storedFastingBonusMs).toBe(20 * MIN);

    // store again
    await page.locator('#end-time-block').click();
    await adjust(page, 30);
    await page.locator('#amount-picker-confirm').click();
    state = await readState(page);
    expect(state.windowEndTime).toBe(windowEndTime + 45 * MIN);
    expect(state.storedFastingBonusMs).toBe(50 * MIN);

    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('fastingTrackerState')));
    expect(persisted.storedFastingBonusMs).toBe(50 * MIN);
});

test('US-22: Fasting store dialog allows up to 16 h per action and shows the "repeat" hint (Eating dialog has none)', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-slider')).toHaveAttribute('max', '960');
    await expect(page.locator('#amount-picker-hint')).not.toHaveClass(/hidden/);
    await expect(page.locator('#amount-picker-hint')).toContainText('repeat');
    await page.locator('#amount-picker-close').click();

    await setAppState(page, makeEatingState());
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-hint')).toHaveClass(/hidden/);
});

test('US-22: Eating store slider max is the time remaining until the end (whole minutes)', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 30 * MIN + 45 * 1000;
    await setAppState(page, makeEatingState({ windowEndTime, lastEatingWindowTargetMs: windowEndTime }));
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-slider')).toHaveAttribute('max', '30');
});

test('US-22: Eating store amount is re-clamped at confirm time if time passes while the dialog is open', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 25 * MIN + 45 * 1000;
    await setAppState(page, makeEatingState({ windowEndTime, lastEatingWindowTargetMs: windowEndTime }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await adjust(page, 25);
    await advanceTime(page, 20 * MIN);
    await page.locator('#amount-picker-confirm').click();

    const state = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        stored: appState.storedEatingBonusMs,
        currentTime: Date.now() + appState.timeOffsetMs,
    }));
    expect(state.windowEndTime).toBeGreaterThanOrEqual(state.currentTime - 1000);
    expect(state.stored).toBe(5 * MIN); // clamped to the whole minutes left (5m45s)
});

test('US-22: end-time storage icon is disabled and inert when under 1 min of the Eating window remains', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 45 * 1000;
    await setAppState(page, makeEatingState({ windowEndTime, lastEatingWindowTargetMs: windowEndTime }));
    await page.goto('/');

    await expect(page.locator('#end-store-icon')).toHaveClass(/disabled/);
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);
});

// --- Header indicators ---

test('US-20: the two stored-bonus indicators are independent and hidden at zero', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await expect(page.locator('#stored-fasting-bonus-indicator')).toHaveClass(/hidden/);
    await expect(page.locator('#stored-eating-bonus-indicator')).toHaveClass(/hidden/);

    await setAppState(page, makeEatingState({ storedFastingBonusMs: 25 * MIN }));
    await page.goto('/');
    await expect(page.locator('#stored-fasting-bonus-indicator')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stored-fasting-bonus-indicator')).toHaveText('Stored Fasting: +25m');
    await expect(page.locator('#stored-eating-bonus-indicator')).toHaveClass(/hidden/);

    await setAppState(page, makeEatingState({ storedEatingBonusMs: 10 * MIN }));
    await page.goto('/');
    await expect(page.locator('#stored-eating-bonus-indicator')).toHaveText('Stored Eating: +10m');
    await expect(page.locator('#stored-fasting-bonus-indicator')).toHaveClass(/hidden/);
});

// --- Use flow ---

test('US-20: use pickers open from their header indicators in EATING, FASTING and POTENTIAL_EATING', async ({ page }) => {
    for (const makeState of [makeEatingState, makeFastingState, makePotentialState]) {
        await setAppState(page, makeState({
            storedFastingBonusMs: 15 * MIN,
            storedEatingBonusMs: 15 * MIN,
        }));
        await page.goto('/');

        await page.locator('#stored-fasting-bonus-indicator').click();
        await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
        await expect(page.locator('#amount-picker-title')).toHaveText('Use Stored Fasting Bonus');
        await page.locator('#amount-picker-close').click();

        await page.locator('#stored-eating-bonus-indicator').click();
        await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
        await expect(page.locator('#amount-picker-title')).toHaveText('Use Stored Eating Bonus');
        await page.locator('#amount-picker-close').click();
    }
});

test('US-20: using stored Eating bonus in EATING immediately prolongs the window and stays in sync', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        storedEatingBonusMs: 30 * MIN,
        storedFastingBonusMs: 9 * MIN,
    }));
    await page.goto('/');

    await page.locator('#stored-eating-bonus-indicator').click();
    await clickPlus(page, 10);
    await page.locator('#amount-picker-confirm').click();

    const state = await readState(page);
    expect(state.windowEndTime).toBe(windowEndTime + 10 * MIN);
    expect(state.lastEatingWindowTargetMs).toBe(windowEndTime + 10 * MIN);
    expect(state.storedEatingBonusMs).toBe(20 * MIN);
    expect(state.storedFastingBonusMs).toBe(9 * MIN); // untouched

    // 1:1 Eating bonus for finishing now must reflect the updated lastEatingWindowTargetMs
    const bonusAtNow = await page.evaluate(() => getEatingBonusForTime(Date.now()));
    const expectedBonus = state.lastEatingWindowTargetMs - Date.now();
    expect(Math.abs(bonusAtNow - expectedBonus)).toBeLessThan(2000);
});

test('US-20: using stored Fasting bonus in FASTING immediately shortens the window', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_FASTING_MS;
    await setAppState(page, makeFastingState({
        windowEndTime,
        storedFastingBonusMs: 20 * MIN,
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();
    await clickPlus(page, 10);
    await page.locator('#amount-picker-confirm').click();

    const state = await readState(page);
    expect(state.windowEndTime).toBe(windowEndTime - 10 * MIN);
    expect(state.storedFastingBonusMs).toBe(10 * MIN);
});

test('US-20: using stored Eating bonus in FASTING reserves it for the next Eating window', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_FASTING_MS;
    await setAppState(page, makeFastingState({
        windowEndTime,
        storedEatingBonusMs: 20 * MIN,
    }));
    await page.goto('/');

    await page.locator('#stored-eating-bonus-indicator').click();
    await clickPlus(page, 20);
    await page.locator('#amount-picker-confirm').click();

    let state = await readState(page);
    expect(state.windowEndTime).toBe(windowEndTime); // Fasting window unchanged
    expect(state.pendingEatingBonusUseMs).toBe(20 * MIN);
    expect(state.storedEatingBonusMs).toBe(0);

    await page.evaluate(() => transitionToEating());
    state = await readState(page);
    expect(state.currentState).toBe('eating');
    expect(state.pendingEatingBonusUseMs).toBe(0);
    expect(state.windowEndTime - state.windowStartTime).toBe(DURATION_EATING_MS + 20 * MIN);
});

test('US-20: using stored Eating bonus in POTENTIAL_EATING defers via pendingEatingBonusUseMs, applied on next meal logged', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS,
        windowEndTime: now,
        storedEatingBonusMs: 15 * MIN,
    }));
    await page.goto('/');

    await page.locator('#stored-eating-bonus-indicator').click();
    await clickPlus(page, 15);
    await page.locator('#amount-picker-confirm').click();

    let state = await readState(page);
    expect(state.pendingEatingBonusUseMs).toBe(15 * MIN);
    expect(state.storedEatingBonusMs).toBe(0);
    expect(state.currentState).toBe('potential');

    await page.evaluate(() => transitionToEating());

    state = await readState(page);
    expect(state.currentState).toBe('eating');
    expect(state.pendingEatingBonusUseMs).toBe(0);
    expect(state.windowEndTime).toBe(state.windowStartTime + DURATION_EATING_MS + 15 * MIN);
});

test('US-20: using stored Fasting bonus in EATING reserves it; applied at the next Fasting window', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 30000;
    await setAppState(page, makeEatingState({
        windowStartTime: now - DURATION_EATING_MS + 30000,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        storedFastingBonusMs: 30 * MIN,
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();
    await clickPlus(page, 30);
    await page.locator('#amount-picker-confirm').click();

    let state = await readState(page);
    expect(state.windowEndTime).toBe(windowEndTime); // Eating window unchanged
    expect(state.pendingFastingBonusUseMs).toBe(30 * MIN);
    expect(state.storedFastingBonusMs).toBe(0);

    await advanceTime(page, 40000);
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    state = await readState(page);
    expect(state.pendingFastingBonusUseMs).toBe(0);
    expect(state.windowEndTime - state.windowStartTime).toBe(DURATION_FASTING_MS - 30 * MIN);
});

test('US-20: using stored Fasting bonus in POTENTIAL_EATING is reserved for the next Fasting window', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS,
        windowEndTime: now,
        storedFastingBonusMs: 45 * MIN,
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();
    await clickPlus(page, 45);
    await page.locator('#amount-picker-confirm').click();

    const state = await readState(page);
    expect(state.pendingFastingBonusUseMs).toBe(45 * MIN);
    expect(state.storedFastingBonusMs).toBe(0);
    expect(state.currentState).toBe('potential');
});

// --- Clamping ---

test('US-20: use pickers cannot exceed the stored amount of their own pool', async ({ page }) => {
    await setAppState(page, makeEatingState({
        storedFastingBonusMs: 20 * MIN,
        storedEatingBonusMs: 90 * MIN, // a bigger, unrelated pool must not raise the Fasting max
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();
    await clickPlus(page, 30);
    await expect(page.locator('#amount-picker-value')).toHaveText('20m');
    await expect(page.locator('#amount-picker-slider')).toHaveValue('20');
    await page.locator('#amount-picker-close').click();

    await setAppState(page, makeEatingState({ storedEatingBonusMs: 10 * MIN }));
    await page.goto('/');
    await page.locator('#stored-eating-bonus-indicator').click();
    await clickPlus(page, 25);
    await expect(page.locator('#amount-picker-value')).toHaveText('10m');
    await expect(page.locator('#amount-picker-slider')).toHaveValue('10');
});

// --- US-18.1: time-aware safe limits (only "use Fasting while Fasting" is risky) + live preview ---

test('US-18.1: use-Fasting-while-Fasting slider max is capped by time remaining, not just the stored bonus', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        storedFastingBonusMs: 200 * MIN,
        windowEndTime: now + 60 * MIN + 45 * 1000,
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();
    await expect(page.locator('#amount-picker-slider')).toHaveAttribute('max', '60');
});

test('US-18.1: use-Fasting-while-Fasting amount is re-clamped at confirm time if time passes while the dialog is open', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 25 * MIN + 45 * 1000;
    await setAppState(page, makeFastingState({
        storedFastingBonusMs: 30 * MIN,
        windowEndTime,
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();
    await clickPlus(page, 25);
    await expect(page.locator('#amount-picker-value')).toHaveText('25m');

    await advanceTime(page, 20 * MIN);
    await page.locator('#amount-picker-confirm').click();

    const state = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        storedFastingBonusMs: appState.storedFastingBonusMs,
        currentTime: Date.now() + appState.timeOffsetMs,
    }));
    expect(state.windowEndTime).toBeGreaterThanOrEqual(state.currentTime - 1000);
    expect(state.storedFastingBonusMs).toBeGreaterThan(5 * MIN);
    expect(state.storedFastingBonusMs).toBeLessThan(30 * MIN);
});

test('US-18.1: stored Fasting indicator becomes disabled and inert when no safe amount remains (use while Fasting)', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        storedFastingBonusMs: 20 * MIN,
        windowEndTime: now + 45 * 1000,
    }));
    await page.goto('/');

    await expect(page.locator('#stored-fasting-bonus-indicator')).toHaveClass(/disabled/);
    await page.locator('#stored-fasting-bonus-indicator').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);
});

test('US-20: stored Eating indicator is never time-limited, even when the Fasting window is almost over', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        storedEatingBonusMs: 20 * MIN,
        windowEndTime: now + 45 * 1000,
    }));
    await page.goto('/');

    await expect(page.locator('#stored-eating-bonus-indicator')).not.toHaveClass(/disabled/);
    await page.locator('#stored-eating-bonus-indicator').click();
    await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#amount-picker-slider')).toHaveAttribute('max', '20');
});

const previewHtml = (page, timeMs, storedText, kind, windowKind = kind) =>    page.evaluate(([t, s, k, w]) => `<div>New end of the ${w} window: ${renderTime(t)}</div><div>Stored ${k} after: ${s}</div>`, [timeMs, storedText, kind, windowKind]);

test('US-22: live preview for use-Fasting-while-Fasting shows the new end time and the remaining storage', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + 5 * HOUR;
    await setAppState(page, makeFastingState({
        storedFastingBonusMs: 40 * MIN,
        windowEndTime,
    }));
    await page.goto('/');
    await page.locator('#stored-fasting-bonus-indicator').click();
    await clickPlus(page, 15);
    await expect(page.locator('#amount-picker-preview')).not.toHaveClass(/hidden/);
    expect(await page.locator('#amount-picker-preview').innerHTML()).toBe(await previewHtml(page, windowEndTime - 15 * MIN, '25m', 'Fasting'));
});

test('US-22: live preview for store (Fasting: end moves right, Eating: end moves left) and use-Eating-while-Eating', async ({ page }) => {
    const now = Date.now();

    const fastEnd = now + 5 * HOUR;
    await setAppState(page, makeFastingState({ storedFastingBonusMs: 10 * MIN, windowEndTime: fastEnd }));
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await clickPlus(page, 15);
    expect(await page.locator('#amount-picker-preview').innerHTML()).toBe(await previewHtml(page, fastEnd + 15 * MIN, '25m', 'Fasting'));
    await page.locator('#amount-picker-close').click();

    const eatEnd = now + 5 * HOUR;
    await setAppState(page, makeEatingState({ storedEatingBonusMs: 40 * MIN, windowEndTime: eatEnd, lastEatingWindowTargetMs: eatEnd }));
    await page.goto('/');
    await page.locator('#end-time-block').click();
    await clickPlus(page, 15);
    expect(await page.locator('#amount-picker-preview').innerHTML()).toBe(await previewHtml(page, eatEnd - 15 * MIN, '55m', 'Eating'));
    await page.locator('#amount-picker-close').click();

    await page.locator('#stored-eating-bonus-indicator').click();
    await clickPlus(page, 15);
    expect(await page.locator('#amount-picker-preview').innerHTML()).toBe(await previewHtml(page, eatEnd + 15 * MIN, '25m', 'Eating'));
});

test('US-22: the preview is always shown, including at amount 0 (end time unchanged, storage unchanged)', async ({ page }) => {
    const now = Date.now();
    const eatEnd = now + 5 * HOUR;
    await setAppState(page, makeEatingState({ storedEatingBonusMs: 15 * MIN, windowEndTime: eatEnd, lastEatingWindowTargetMs: eatEnd }));
    await page.goto('/');
    await page.locator('#stored-eating-bonus-indicator').click();
    await expect(page.locator('#amount-picker-preview')).not.toHaveClass(/hidden/);
    expect(await page.locator('#amount-picker-preview').innerHTML()).toBe(await previewHtml(page, eatEnd, '15m', 'Eating'));
});

// --- US-19: hours+minutes formatting once a stored/picker amount reaches 60 minutes ---

test('US-19: header stored-bonus indicators show hours+minutes at a non-exact-hour amount', async ({ page }) => {
    await setAppState(page, makeEatingState({ storedFastingBonusMs: 90 * MIN, storedEatingBonusMs: 90 * MIN }));
    await page.goto('/');
    await expect(page.locator('#stored-fasting-bonus-indicator')).toHaveText('Stored Fasting: +1h 30m');
    await expect(page.locator('#stored-eating-bonus-indicator')).toHaveText('Stored Eating: +1h 30m');
});

test('US-19: header stored-bonus indicator shows plain hours at an exact-hour multiple', async ({ page }) => {
    await setAppState(page, makeEatingState({ storedFastingBonusMs: 120 * MIN }));
    await page.goto('/');
    await expect(page.locator('#stored-fasting-bonus-indicator')).toHaveText('Stored Fasting: +2h');
});

test('US-19: amount picker slider value switches from raw minutes to hours+minutes across the 60m boundary', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        storedFastingBonusMs: 200 * MIN,
        windowEndTime: now + DURATION_FASTING_MS,
    }));
    await page.goto('/');

    await page.locator('#stored-fasting-bonus-indicator').click();

    await page.evaluate(() => adjustAmountPicker(59));
    await expect(page.locator('#amount-picker-value')).toHaveText('59m');

    await page.evaluate(() => adjustAmountPicker(1));
    await expect(page.locator('#amount-picker-value')).toHaveText('1h');

    await page.evaluate(() => adjustAmountPicker(15));
    await expect(page.locator('#amount-picker-value')).toHaveText('1h 15m');
});
