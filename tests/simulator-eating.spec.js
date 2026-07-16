// US-12: Fasting Window Simulator — Eating Window state
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    setAppState,
} = require('./helpers');
const { openSimulator, calcFast } = require('./simulator-helpers');

// --- Initial handle positions: Eating Window ---
// makeEatingState: windowStartTime = now, windowEndTime = now + 8h
// sliderStart = windowStartTime, sliderEnd = windowEndTime
// toggle1 = 0 (disabled), toggle2 = (lastMealTime || now) - windowStartTime / 60000

test('eating: toggle 1 at position 0 and disabled', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await openSimulator(page);

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-first-meal').value));
    const disabled = await page.evaluate(() => document.getElementById('slider-first-meal').disabled);
    expect(val).toBe(0);
    expect(disabled).toBe(true);
});

test('eating: toggle 2 at current time when no last meal logged', async ({ page }) => {
    // windowStartTime = now, so toggle2 ≈ 0 min from start
    await setAppState(page, makeEatingState());
    await page.goto('/');
    await openSimulator(page);

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(5); // within 5 min of start
});

test('eating: toggle 2 at last meal time when last meal was logged', async ({ page }) => {
    const now = Date.now();
    const windowStartTime = now - 4 * 60 * 60 * 1000; // eating started 4h ago
    const windowEndTime = windowStartTime + DURATION_EATING_MS;
    const lastMealTime = now - 30 * 60 * 1000; // 30 min ago

    await setAppState(page, makeEatingState({ windowStartTime, windowEndTime, lastEatingWindowTargetMs: windowEndTime, lastMealTime }));
    await page.goto('/');
    await openSimulator(page);

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    // (lastMealTime - windowStartTime) / 60000 = (4h - 30min) = 210 min
    expect(val).toBeGreaterThan(205);
    expect(val).toBeLessThan(215);
});

// --- Calculation: Eating Window ---

test('eating: standard 16h fast when last meal is at eating window end', async ({ page }) => {
    // windowStartTime = now - 4h, windowEndTime = now - 4h + 8h = now + 4h
    // last meal at max (480 min) = windowEndTime → eatingBonus = 0 → fast = 16h
    const now = Date.now();
    const windowStartTime = now - 4 * 60 * 60 * 1000;
    const windowEndTime = windowStartTime + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({ windowStartTime, windowEndTime, lastEatingWindowTargetMs: windowEndTime }));
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 0, 480);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS);
});

test('eating: US-4 bonus shortens fast when last meal is early', async ({ page }) => {
    // last meal 2h before eating window end → eatingBonus = 1h → fast = 15h
    const now = Date.now();
    const windowStartTime = now - 4 * 60 * 60 * 1000;
    const windowEndTime = windowStartTime + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({ windowStartTime, windowEndTime, lastEatingWindowTargetMs: windowEndTime }));
    await page.goto('/');
    await openSimulator(page);

    // 480 - 120 = 360 min (2h before window end)
    const result = await calcFast(page, 0, 360);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS - 60 * 60 * 1000);
});

test('eating: premature start penalty is included in modeled fast duration', async ({ page }) => {
    const now = Date.now();
    const penaltyMs = 4 * 60 * 60 * 1000; // 4h penalty
    const windowStartTime = now - 4 * 60 * 60 * 1000;
    const windowEndTime = windowStartTime + DURATION_EATING_MS;
    await setAppState(page, makeEatingState({
        windowStartTime,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        prematureStartPenaltyMs: penaltyMs,
    }));
    await page.goto('/');
    await openSimulator(page);

    // last meal at eating end → eatingBonus = 0; penalty adds 4h
    const result = await calcFast(page, 0, 480);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS + penaltyMs);
});

// --- Slider Constraint ---
// --- Eating window: toggle 2 lower bound when last meal is logged ---

test('eating: toggle 2 cannot move before last meal time when last meal logged', async ({ page }) => {
    const now = Date.now();
    const windowStartTime = now - 4 * 60 * 60 * 1000; // eating started 4h ago
    const windowEndTime = windowStartTime + DURATION_EATING_MS;
    const lastMealTime = now - 30 * 60 * 1000; // 30 min ago → offset 210 min from start

    await setAppState(page, makeEatingState({
        windowStartTime,
        windowEndTime,
        lastEatingWindowTargetMs: windowEndTime,
        lastMealTime,
    }));
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-last-meal').value = 60; // before last meal position
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(val).toBe(210); // clamped to last meal position
});

test('eating: toggle 2 can move freely in both directions when no last meal logged', async ({ page }) => {
    const now = Date.now();
    const windowStartTime = now - 4 * 60 * 60 * 1000; // eating started 4h ago
    const windowEndTime = windowStartTime + DURATION_EATING_MS;
    // no lastMealTime → toggle2 initial ≈ 240 min (current time offset)

    await setAppState(page, makeEatingState({ windowStartTime, windowEndTime, lastEatingWindowTargetMs: windowEndTime }));
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-last-meal').value = 60; // before initial position
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(val).toBe(60); // not clamped — free movement
});
