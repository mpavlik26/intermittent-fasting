// US-3: Fasting bonus — waiting longer in potential eating window shortens the next fast (1:1)
// US-4: Eating bonus — finishing eating early extends the next eating window (1:1)
// US-20: the two bonuses are independent pools; no divisor; cascade-skip for huge Fasting bonuses
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

// --- US-3: Fasting Bonus ---

test('US-3: pending-reward badge shown when still in potential after fasting window ended', async ({ page }) => {
    const now = Date.now();
    // Fasting ended 30 minutes ago → pending Fasting bonus = full 30 minutes (no divisor)
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 30 * MIN,
        windowEndTime: now - 30 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator('#fasting-bonus-badge')).toBeVisible();
    await expect(page.locator('#fasting-bonus-text')).toContainText('+30m pending reward');
    await expect(page.locator('#eating-bonus-badge')).toBeHidden();
});

test('US-3/US-20: starting eating late banks the full over-fasted time as a Fasting bonus', async ({ page }) => {
    const now = Date.now();
    // Fasting ended 2 hours ago → Fasting bonus = 2h
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * HOUR,
        windowEndTime: now - 2 * HOUR,
    }));
    await page.goto('/');

    await page.evaluate(() => transitionToEating());

    const { fastingBonusMs, windowEndTime, windowStartTime } = await page.evaluate(() => ({
        fastingBonusMs: appState.fastingBonusMs,
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
    }));

    // Bonus is the full 2h (±5 min tolerance for test execution time)
    expect(fastingBonusMs).toBeGreaterThan(2 * HOUR - 5 * MIN);
    expect(fastingBonusMs).toBeLessThan(2 * HOUR + 5 * MIN);

    // The Fasting bonus does NOT lengthen the Eating window (it shortens the next fast instead)
    expect(windowEndTime - windowStartTime).toBe(DURATION_EATING_MS);
});

test('US-3/US-20: the banked Fasting bonus shortens the next Fasting window 1:1', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * HOUR,
        windowEndTime: now - 2 * HOUR,
    }));
    await page.goto('/');

    await page.evaluate(() => transitionToEating());
    // Run the Eating window to its end → Fasting
    await advanceTime(page, DURATION_EATING_MS + 10000);
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    const { start, end } = await page.evaluate(() => ({
        start: appState.windowStartTime,
        end: appState.windowEndTime,
    }));
    const fastDuration = end - start;
    expect(fastDuration).toBeLessThan(DURATION_FASTING_MS - 2 * HOUR + 5 * MIN);
    expect(fastDuration).toBeGreaterThan(DURATION_FASTING_MS - 2 * HOUR - 5 * MIN);

    await expect(page.locator('#fasting-bonus-text')).toContainText('fasting bonus applied!');
});

test('US-20: a Fasting bonus larger than 16h cascade-skips, extending the Eating window by 8h per skip', async ({ page }) => {
    const now = Date.now();
    // Fasting ended 20h ago → 20h Fasting bonus = one full 16h skip (+8h eating) + 4h left over
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 20 * HOUR,
        windowEndTime: now - 20 * HOUR,
    }));
    await page.goto('/');

    await page.evaluate(() => transitionToEating());

    const { fastingBonusMs, windowEndTime, windowStartTime } = await page.evaluate(() => ({
        fastingBonusMs: appState.fastingBonusMs,
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
    }));

    expect(windowEndTime - windowStartTime).toBe(2 * DURATION_EATING_MS);
    expect(fastingBonusMs).toBeGreaterThan(4 * HOUR - 5 * MIN);
    expect(fastingBonusMs).toBeLessThan(4 * HOUR + 5 * MIN);
});

test('US-20: no Fasting bonus is shown in the Eating window (it is pending for the next fast)', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        fastingBonusMs: 30 * MIN,
        windowEndTime: now + DURATION_EATING_MS,
    }));
    await page.goto('/');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator('#fasting-bonus-badge')).toBeHidden();
});

// --- US-4: Eating Bonus ---

test('US-4/US-20: logging last meal early banks a full 1:1 Eating bonus for the next eating window', async ({ page }) => {
    const now = Date.now();
    // Eating window with 2 hours remaining — finishing now earns 2h extra next eating window
    const windowEndTime = now + 2 * HOUR;
    await setAppState(page, makeEatingState({
        windowStartTime: now - 6 * HOUR,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
    }));
    await page.goto('/');

    await page.evaluate(() => logLastMeal());

    // Advance past eating window to trigger eating → fasting transition
    await advanceTime(page, 2 * HOUR + 10000);
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    const { eatingBonusMs, windowEndTime: fastEnd, windowStartTime: fastStart } = await page.evaluate(() => ({
        eatingBonusMs: appState.eatingBonusMs,
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
    }));

    // Bonus is the full 2h (±5 min tolerance)
    expect(eatingBonusMs).toBeGreaterThan(2 * HOUR - 5 * MIN);
    expect(eatingBonusMs).toBeLessThan(2 * HOUR + 5 * MIN);

    // US-20: the Eating bonus no longer shortens the fast
    expect(fastEnd - fastStart).toBe(DURATION_FASTING_MS);
});

test('US-4/US-20: banked Eating bonus extends the next Eating window 1:1', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS,
        windowEndTime: now,
        eatingBonusMs: 90 * MIN,
    }));
    await page.goto('/');

    await page.evaluate(() => transitionToEating());

    const { windowEndTime, windowStartTime, eatingBonusMs, appliedEatingBonusMs } = await page.evaluate(() => ({
        windowEndTime: appState.windowEndTime,
        windowStartTime: appState.windowStartTime,
        eatingBonusMs: appState.eatingBonusMs,
        appliedEatingBonusMs: appState.appliedEatingBonusMs,
    }));

    expect(windowEndTime - windowStartTime).toBe(DURATION_EATING_MS + 90 * MIN);
    expect(eatingBonusMs).toBe(0);
    expect(appliedEatingBonusMs).toBe(90 * MIN);
});

test('US-4/US-20: Eating-window badge shows the applied Eating bonus', async ({ page }) => {
    const bonusMs = 30 * MIN;
    const now = Date.now();
    await setAppState(page, makeEatingState({
        appliedEatingBonusMs: bonusMs,
        windowEndTime: now + DURATION_EATING_MS + bonusMs,
    }));
    await page.goto('/');

    await expect(page.locator('#eating-bonus-badge')).toBeVisible();
    await expect(page.locator('#eating-bonus-text')).toContainText('+30m eating bonus applied!');
    // Applied bonus is informational only — not storable
    await expect(page.locator('#eating-bonus-badge')).not.toHaveClass(/storable/);
});

test('US-20: Fasting-window shows both the applied Fasting bonus and the banked Eating bonus', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        fastingBonusMs: 45 * MIN,
        appliedFastingBonusMs: 45 * MIN,
        eatingBonusMs: 2 * HOUR,
        windowEndTime: now + DURATION_FASTING_MS - 45 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator('#fasting-bonus-badge')).toBeVisible();
    await expect(page.locator('#fasting-bonus-text')).toContainText('-45m fasting bonus applied!');
    await expect(page.locator('#eating-bonus-badge')).toBeVisible();
    await expect(page.locator('#eating-bonus-text')).toContainText('+2h eating bonus banked!');
});

test('US-20: no badges in Fasting window when both bonus pools are empty', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');

    await expect(page.locator('#fasting-bonus-badge')).toBeHidden();
    await expect(page.locator('#eating-bonus-badge')).toBeHidden();
});

// --- US-19: hours+minutes formatting once a badge amount reaches 60 minutes ---

test('US-19: eating bonus badge shows hours+minutes at 60 or more', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        appliedEatingBonusMs: 90 * MIN,
        windowEndTime: now + DURATION_EATING_MS + 90 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator('#eating-bonus-text')).toContainText('+1h 30m eating bonus applied!');
});

test('US-19: fasting bonus badge shows plain hours at an exact-hour multiple', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        fastingBonusMs: 120 * MIN,
        appliedFastingBonusMs: 120 * MIN,
        windowEndTime: now + DURATION_FASTING_MS - 120 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator('#fasting-bonus-text')).toContainText('-2h fasting bonus applied!');
});
