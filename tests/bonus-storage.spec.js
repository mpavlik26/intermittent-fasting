// US-18: Stored bonus — move an applied bonus into storage, then spend it later
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

async function clickPlus(page, times) {
    for (let i = 0; i < times; i++) {
        await page.locator('#amount-picker-plus').click();
    }
}

// --- Opening the picker ---

test('US-18: bonus badge opens store picker in EATING and FASTING', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        fastingBonusMs: 30 * 60 * 1000,
        windowEndTime: now + DURATION_EATING_MS + 30 * 60 * 1000,
        lastEatingWindowTargetMs: now + DURATION_EATING_MS + 30 * 60 * 1000,
    }));
    await page.goto('/');

    await page.locator('#bonus-badge').first().click();
    await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#amount-picker-title')).toHaveText('Move Bonus to Storage');
    await page.locator('#amount-picker-close').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);

    await setAppState(page, makeFastingState({ eatingBonusMs: 20 * 60 * 1000 }));
    await page.goto('/');
    await page.locator('#bonus-badge').first().click();
    await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#amount-picker-title')).toHaveText('Move Bonus to Storage');
});

// --- Store flow ---

test('US-18: storing an amount moves it from the active bonus into storedBonusMs and persists', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_EATING_MS + 40 * 60 * 1000;
    await setAppState(page, makeEatingState({
        fastingBonusMs: 40 * 60 * 1000,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        storedBonusMs: 5 * 60 * 1000,
    }));
    await page.goto('/');

    await page.locator('#bonus-badge').first().click();
    await clickPlus(page, 15);
    await expect(page.locator('#amount-picker-value')).toHaveText('15m');
    await page.locator('#amount-picker-confirm').click();
    await expect(page.locator('#amount-picker-overlay')).toHaveClass(/hidden/);

    let state = await page.evaluate(() => ({
        fastingBonusMs: appState.fastingBonusMs,
        windowEndTime: appState.windowEndTime,
        lastEatingWindowTargetMs: appState.lastEatingWindowTargetMs,
        storedBonusMs: appState.storedBonusMs,
    }));
    expect(state.fastingBonusMs).toBe(25 * 60 * 1000);
    expect(state.windowEndTime).toBe(windowEndTime - 15 * 60 * 1000);
    expect(state.lastEatingWindowTargetMs).toBe(windowEndTime - 15 * 60 * 1000);
    expect(state.storedBonusMs).toBe(20 * 60 * 1000);

    // Confirm the same values were persisted to localStorage (not just in-memory).
    // A page.reload() would re-fire setAppState's addInitScript and clobber this
    // with the original pre-mutation state, so read localStorage directly instead.
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('fastingTrackerState')));
    expect(persisted.fastingBonusMs).toBe(25 * 60 * 1000);
    expect(persisted.windowEndTime).toBe(windowEndTime - 15 * 60 * 1000);
    expect(persisted.storedBonusMs).toBe(20 * 60 * 1000);
});

test('US-18: storing from FASTING reduces eatingBonusMs and increases windowEndTime, not lastEatingWindowTargetMs', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_FASTING_MS;
    await setAppState(page, makeFastingState({
        eatingBonusMs: 20 * 60 * 1000,
        windowEndTime,
        lastEatingWindowTargetMs: now - 5000,
    }));
    await page.goto('/');

    await page.locator('#bonus-badge').first().click();
    await clickPlus(page, 8);
    await page.locator('#amount-picker-confirm').click();

    const state = await page.evaluate(() => ({
        eatingBonusMs: appState.eatingBonusMs,
        windowEndTime: appState.windowEndTime,
        lastEatingWindowTargetMs: appState.lastEatingWindowTargetMs,
        storedBonusMs: appState.storedBonusMs,
    }));
    expect(state.eatingBonusMs).toBe(12 * 60 * 1000);
    expect(state.windowEndTime).toBe(windowEndTime + 8 * 60 * 1000);
    expect(state.lastEatingWindowTargetMs).toBe(now - 5000);
    expect(state.storedBonusMs).toBe(8 * 60 * 1000);
});

// --- Header indicator ---

test('US-18: header stored-bonus indicator is hidden at zero and shows amount once stored', async ({ page }) => {
    await setAppState(page, makeEatingState({ storedBonusMs: 0 }));
    await page.goto('/');
    await expect(page.locator('#stored-bonus-indicator')).toHaveClass(/hidden/);

    await setAppState(page, makeEatingState({ storedBonusMs: 25 * 60 * 1000 }));
    await page.goto('/');
    await expect(page.locator('#stored-bonus-indicator')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stored-bonus-indicator')).toHaveText('+25m stored');
});

// --- Use flow ---

test('US-18: use picker opens from header indicator in EATING, FASTING and POTENTIAL_EATING', async ({ page }) => {
    for (const makeState of [makeEatingState, makeFastingState, makePotentialState]) {
        await setAppState(page, makeState({ storedBonusMs: 15 * 60 * 1000 }));
        await page.goto('/');
        await page.locator('#stored-bonus-indicator').click();
        await expect(page.locator('#amount-picker-overlay')).not.toHaveClass(/hidden/);
        await expect(page.locator('#amount-picker-title')).toHaveText('Use Stored Bonus');
        await page.locator('#amount-picker-close').click();
    }
});

test('US-18: using stored minutes in EATING immediately prolongs the window and stays in sync', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        storedBonusMs: 30 * 60 * 1000,
    }));
    await page.goto('/');

    await page.locator('#stored-bonus-indicator').click();
    await clickPlus(page, 10);
    await page.locator('#amount-picker-confirm').click();

    const state = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        lastEatingWindowTargetMs: appState.lastEatingWindowTargetMs,
        storedBonusMs: appState.storedBonusMs,
    }));
    expect(state.windowEndTime).toBe(windowEndTime + 10 * 60 * 1000);
    expect(state.lastEatingWindowTargetMs).toBe(windowEndTime + 10 * 60 * 1000);
    expect(state.storedBonusMs).toBe(20 * 60 * 1000);

    // getEatingBonusForTime must reflect the updated lastEatingWindowTargetMs
    const bonusAtNow = await page.evaluate(() => getEatingBonusForTime(Date.now()));
    const expectedBonus = Math.floor((state.lastEatingWindowTargetMs - Date.now()) / 2 / 60000) * 60000;
    expect(Math.abs(bonusAtNow - expectedBonus)).toBeLessThan(60000);
});

test('US-18: using stored minutes in FASTING immediately shortens the window', async ({ page }) => {
    const now = Date.now();
    const windowEndTime = now + DURATION_FASTING_MS;
    await setAppState(page, makeFastingState({
        windowEndTime,
        storedBonusMs: 20 * 60 * 1000,
    }));
    await page.goto('/');

    await page.locator('#stored-bonus-indicator').click();
    await clickPlus(page, 10);
    await page.locator('#amount-picker-confirm').click();

    const state = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        storedBonusMs: appState.storedBonusMs,
    }));
    expect(state.windowEndTime).toBe(windowEndTime - 10 * 60 * 1000);
    expect(state.storedBonusMs).toBe(10 * 60 * 1000);
});

test('US-18: using stored minutes in POTENTIAL_EATING defers via pendingUseMs, applied on next meal logged', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS,
        windowEndTime: now,
        storedBonusMs: 15 * 60 * 1000,
    }));
    await page.goto('/');

    await page.locator('#stored-bonus-indicator').click();
    await clickPlus(page, 15);
    await page.locator('#amount-picker-confirm').click();

    let state = await page.evaluate(() => ({
        pendingUseMs: appState.pendingUseMs,
        storedBonusMs: appState.storedBonusMs,
        currentState: appState.currentState,
    }));
    expect(state.pendingUseMs).toBe(15 * 60 * 1000);
    expect(state.storedBonusMs).toBe(0);
    expect(state.currentState).toBe('potential');

    await page.evaluate(() => transitionToEating());

    state = await page.evaluate(() => ({
        currentState: appState.currentState,
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
        pendingUseMs: appState.pendingUseMs,
        fastingBonusMs: appState.fastingBonusMs,
    }));
    expect(state.currentState).toBe('eating');
    expect(state.pendingUseMs).toBe(0);
    expect(state.windowEndTime).toBe(state.windowStartTime + DURATION_EATING_MS + state.fastingBonusMs + 15 * 60 * 1000);
});

// --- Clamping ---

test('US-18: amount picker cannot exceed the available maximum', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        fastingBonusMs: 20 * 60 * 1000,
        windowEndTime: now + DURATION_EATING_MS + 20 * 60 * 1000,
        lastEatingWindowTargetMs: now + DURATION_EATING_MS + 20 * 60 * 1000,
    }));
    await page.goto('/');

    await page.locator('#bonus-badge').first().click();
    await clickPlus(page, 30);
    await expect(page.locator('#amount-picker-value')).toHaveText('20m');
    await expect(page.locator('#amount-picker-slider')).toHaveValue('20');
    await page.locator('#amount-picker-close').click();

    await setAppState(page, makeFastingState({ storedBonusMs: 10 * 60 * 1000 }));
    await page.goto('/');
    await page.locator('#stored-bonus-indicator').click();
    await clickPlus(page, 25);
    await expect(page.locator('#amount-picker-value')).toHaveText('10m');
    await expect(page.locator('#amount-picker-slider')).toHaveValue('10');
});
