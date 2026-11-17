// US-12: Fasting Window Simulator — Potential Eating Window state
const { test, expect } = require('@playwright/test');
const {
    DURATION_FASTING_MS,
    makePotentialState,
    setAppState,
} = require('./helpers');
const { openSimulator, calcFast } = require('./simulator-helpers');

// --- Initial handle positions: Potential Eating Window ---
// makePotentialState: windowStartTime = now - 16h, windowEndTime = now
// sliderStart = windowEndTime = now (potential eating window start)
// sliderEnd = now + 24h (frozen at open time)
// toggle1 initial = (now - sliderStart) / 60000 = 0 min
// toggle2 initial = 0 + 480 = 480 min

test('potential: toggle 1 initially at current time', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-first-meal').value));
    // current time ≈ sliderStart (windowEndTime = now), so offset ≈ 0
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(5);
});

test('potential: toggle 2 initially at current time + 8h', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const val = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(val).toBeGreaterThan(475);
    expect(val).toBeLessThan(485);
});

test('potential: toggle 1 is enabled', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const disabled = await page.evaluate(() => document.getElementById('slider-first-meal').disabled);
    expect(disabled).toBe(false);
});

test('potential: slider max is frozen at open time and not extended later', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const maxBefore = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').max));

    // Advance time by 1 hour
    await page.evaluate(() => { appState.timeOffsetMs += 60 * 60 * 1000; tick(); });

    const maxAfter = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').max));
    expect(maxAfter).toBe(maxBefore);
});

// --- Calculation: Potential Eating Window ---
// For all these tests: windowStartTime = now - 16h, windowEndTime = now
// sliderStartMs = windowStartTime = now - 16h

test('potential: standard 16h fast when no bonuses apply', async ({ page }) => {
    // sliderStart = windowEndTime = now
    // first meal = now → offset 0 min → fastingBonus = 0
    // last meal = now + 8h → offset 480 min → eatingBonus = 0
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 0, 480);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS);
});

test('potential: US-20 a late first meal shortens the modeled fast 1:1 (eating window stays 8h)', async ({ page }) => {
    // windowEndTime = now - 2h → sliderStart = now - 2h
    // first meal = now → offset 120 min → Fasting bonus = 2h
    // eating end = now + 8h → last meal there → offset 600 min → no Eating bonus
    // fast = 16h - 2h = 14h
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * 60 * 60 * 1000,
        windowEndTime: now - 2 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 120, 600);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS - 2 * 60 * 60 * 1000);
    expect(result.eatingBonusBankedMs).toBe(0);
});

test('potential: US-20 early last meal banks an Eating bonus, does NOT shorten the fast', async ({ page }) => {
    // sliderStart = windowEndTime = now
    // first meal = now → offset 0 → no Fasting bonus → eating end = now + 8h
    // last meal 2h before eating end → offset 360 min → 2h Eating bonus banked; fast stays 16h
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 0, 360);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS);
    expect(result.eatingBonusBankedMs).toBe(2 * 60 * 60 * 1000);
});

test('potential: US-20 Fasting bonus and Eating bonus are independent', async ({ page }) => {
    // windowEndTime = now - 2h → sliderStart = now - 2h
    // first meal = now → offset 120 → Fasting bonus 2h → eating end = now + 8h
    // last meal at now + 6h → offset 480 → Eating bonus 2h banked
    // fast = 16h - 2h (Fasting bonus only) = 14h
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * 60 * 60 * 1000,
        windowEndTime: now - 2 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 120, 480);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS - 2 * 60 * 60 * 1000);
    expect(result.eatingBonusBankedMs).toBe(2 * 60 * 60 * 1000);
});

test('potential: US-20 Fasting bonus > 16h cascade-skips: eating end +8h, remainder shortens the fast', async ({ page }) => {
    // windowEndTime = now - 20h → first meal = now → 20h Fasting bonus = 1 skip + 4h remainder
    // eating end = now + 16h; fast = 16h - 4h = 12h
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 20 * 60 * 60 * 1000,
        windowEndTime: now - 20 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    // first meal = now (offset 1200), last meal = first + 16h — call the calculation directly
    const result = await page.evaluate(() => {
        const first = simState.sliderStartMs + 1200 * 60000;
        const last = first + 16 * 60 * 60000;
        return calcSimulatedFast(first, last);
    });
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS - 4 * 60 * 60 * 1000);
    expect(result.eatingBonusBankedMs).toBe(0);
});

// --- Slider Constraint ---
// --- Toggle 2 upper bound: cannot exceed first meal + eating window length ---

test('potential: toggle 2 clamped at first + 8h when no US-3 bonus', async ({ page }) => {
    // toggle1 at 0 (= windowEndTime) → fastingBonus = 0 → maxLast = 0 + 480 = 480
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 0;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
        document.getElementById('slider-last-meal').value = 700; // past the allowed max
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(480);
});

test('potential: toggle 2 clamped down when toggle 1 moves left reducing the max', async ({ page }) => {
    // windowEndTime = now - 4h → sliderStart = now - 4h
    // US-20: no divisor / no extension → maxLast = toggle1 + 480
    // toggle1=240 → maxLast = 720. Set toggle2 to 720, then move toggle1 to 0 → maxLast=480 → toggle2 clamps
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 4 * 60 * 60 * 1000,
        windowEndTime: now - 4 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 240;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
        document.getElementById('slider-last-meal').value = 720;
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
        // Move toggle1 back to 0: maxLast shrinks to 480
        document.getElementById('slider-first-meal').value = 0;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(480);
});

test('potential: US-20 a sub-16h Fasting bonus does NOT extend the toggle 2 upper bound', async ({ page }) => {
    // windowEndTime = now - 2h → sliderStart = now - 2h
    // toggle1 at 120 min = now → 2h Fasting bonus (shortens the fast, not the eating window)
    // maxLast = 120 + 480 = 600 min; trying 680 should clamp to 600
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * 60 * 60 * 1000,
        windowEndTime: now - 2 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 120;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
        document.getElementById('slider-last-meal').value = 680; // past the 600 max
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(600);
});

test('toggle 2 is clamped to toggle 1 when moved before it', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 600;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
        document.getElementById('slider-last-meal').value = 300;
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(600);
});

test('toggle 1 pushes toggle 2 forward when moved past it', async ({ page }) => {
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        // Move toggle1 down to 200 first (toggle2 stays at its initial high value)
        document.getElementById('slider-first-meal').value = 200;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
        // Set toggle2 to 400
        document.getElementById('slider-last-meal').value = 400;
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
        // Now push toggle1 past toggle2 → toggle2 should follow
        document.getElementById('slider-first-meal').value = 600;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(600);
});
