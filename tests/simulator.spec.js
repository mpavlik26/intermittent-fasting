// US-12: Fasting Window Simulator
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    makeFastingState,
    makePotentialState,
    setAppState,
} = require('./helpers');

// --- Helpers ---

async function openSimulator(page) {
    await page.click('#btn-open-simulator');
    await expect(page.locator('#simulator-overlay')).toBeVisible();
}

// Directly call calcSimulatedFast with minute offsets from sliderStartMs
async function calcFast(page, firstMins, lastMins) {
    return page.evaluate(({ f, l }) => {
        const firstMs = simState.sliderStartMs + f * 60000;
        const lastMs = simState.sliderStartMs + l * 60000;
        return calcSimulatedFast(firstMs, lastMs);
    }, { f: firstMins, l: lastMins });
}

// US-13: Directly call calcSimulatedEating with minute offset from sliderStartMs
async function calcEat(page, firstMins) {
    return page.evaluate(({ f }) => {
        const firstMs = simState.sliderStartMs + f * 60000;
        return calcSimulatedEating(firstMs);
    }, { f: firstMins });
}

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

test('potential: US-3 fasting bonus extends eating window when first meal is late', async ({ page }) => {
    // windowEndTime = now - 2h → sliderStart = now - 2h
    // first meal = now → offset 120 min → fastingBonus = 1h
    // effectiveEatingEnd = now + 9h → last meal there → offset 660 min → eatingBonus = 0
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * 60 * 60 * 1000,
        windowEndTime: now - 2 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 120, 660);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS);
});

test('potential: US-4 eating bonus shortens fast when last meal is early', async ({ page }) => {
    // sliderStart = windowEndTime = now
    // first meal = now → offset 0 → fastingBonus = 0 → effectiveEatingEnd = now + 8h
    // last meal 2h before eating end → offset 360 min → eatingBonus = 1h → fast = 15h
    await setAppState(page, makePotentialState());
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 0, 360);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS - 60 * 60 * 1000);
});

test('potential: combined US-3 + US-4 bonuses', async ({ page }) => {
    // windowEndTime = now - 2h → sliderStart = now - 2h
    // first meal = now → offset 120 → fastingBonus = 1h → effectiveEatingEnd = now + 9h
    // last meal 2h before effectiveEatingEnd (now + 7h) → offset 540 → eatingBonus = 1h
    // fast = 16h - 1h = 15h
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 2 * 60 * 60 * 1000,
        windowEndTime: now - 2 * 60 * 60 * 1000,
    }));
    await page.goto('/');
    await openSimulator(page);

    const result = await calcFast(page, 120, 540);
    expect(result.fastDurationMs).toBe(DURATION_FASTING_MS - 60 * 60 * 1000);
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
    // toggle1=240 → firstMeal=now → fastingBonus=2h → maxLast = 240+480+120 = 840
    // Set toggle2 to 840, then move toggle1 to 0 → fastingBonus=0 → maxLast=480 → toggle2 clamps
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
        document.getElementById('slider-last-meal').value = 840;
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
        // Move toggle1 back to 0: fastingBonus drops to 0, maxLast shrinks to 480
        document.getElementById('slider-first-meal').value = 0;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(480);
});

test('potential: US-3 bonus extends the toggle 2 upper bound', async ({ page }) => {
    // windowEndTime = now - 2h → sliderStart = now - 2h
    // toggle1 at 120 min = now → firstMeal 2h after windowEndTime → fastingBonus = 1h
    // maxLast = 120 + 540 = 660 min; trying 680 should clamp to 660
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
        document.getElementById('slider-last-meal').value = 680; // past the 660 max
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(660);
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

// ============================================================
// US-13: Eating Window Simulator (Fasting State)
// makeFastingState: windowStartTime = now, windowEndTime = now + 16h
// sliderStartMs = windowEndTime = now + 16h
// sliderEndMs   = sliderStartMs + 24h = now + 40h
// totalMins = 1440 (24h)
// toggle1 initial = 0 (eating starts at fasting window end)
// toggle2 initial = 480 (8h eating window, no bonus)
// ============================================================

test('fasting: simulator link text is "Model next eating window →"', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    const text = await page.evaluate(() => document.getElementById('btn-open-simulator').textContent);
    expect(text).toBe('Model next eating window →');
});

test('fasting: simulator title changes to "Eating Window Simulator"', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);
    const title = await page.evaluate(() => document.getElementById('simulator-title').textContent);
    expect(title).toBe('Eating Window Simulator');
});

test('fasting: output label is "Modeled Eating Window"', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);
    const label = await page.evaluate(() => document.getElementById('sim-output-label').textContent);
    expect(label).toBe('Modeled Eating Window');
});

test('fasting: toggle 1 initially at offset 0 (eating starts at fasting window end)', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);
    const val = await page.evaluate(() => parseInt(document.getElementById('slider-first-meal').value));
    expect(val).toBe(0);
});

test('fasting: toggle 2 initially at offset 480 min (default 8h window)', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);
    const val = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(val).toBe(480);
});

test('fasting: toggle 1 is enabled', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);
    const disabled = await page.evaluate(() => document.getElementById('slider-first-meal').disabled);
    expect(disabled).toBe(false);
});

test('fasting: slider totalMins = 1440 (sliderStart + 24h)', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);
    const max = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').max));
    expect(max).toBe(1440);
});

test('fasting: moving toggle 1 → toggle 2 follows to eating window end (no bonus)', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 0;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(480); // 0 + 480 + floor(0/2) = 480
});

test('fasting: moving toggle 1 → toggle 2 extends with US-3 bonus (120min delay → 60min bonus)', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 120;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
    });

    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(660); // 120 + 480 + floor(120/2) = 120 + 480 + 60 = 660
});

test('fasting: moving toggle 2 → toggle 1 back-calculates eating start', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    // Set t2=660 → t1 = round((660-480)*2/3) = round(120) = 120
    await page.evaluate(() => {
        document.getElementById('slider-last-meal').value = 660;
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const firstVal = await page.evaluate(() => parseInt(document.getElementById('slider-first-meal').value));
    expect(firstVal).toBe(120);
    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(lastVal).toBe(660); // recomputed: 120 + 480 + 60 = 660
});

test('fasting: moving toggle 2 below 480 → toggle 2 snaps to 480, toggle 1 at 0', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    await page.evaluate(() => {
        document.getElementById('slider-last-meal').value = 300; // below 480 minimum
        document.getElementById('slider-last-meal').dispatchEvent(new Event('input'));
    });

    const firstVal = await page.evaluate(() => parseInt(document.getElementById('slider-first-meal').value));
    const lastVal = await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value));
    expect(firstVal).toBe(0);
    expect(lastVal).toBe(480);
});

// --- US-13: Calculation ---

test('fasting: standard 8h eating window when first meal at fasting end', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    const result = await calcEat(page, 0);
    expect(result.eatDurationMs).toBe(DURATION_EATING_MS); // 8h
});

test('fasting: US-3 fasting bonus extends eating window when first meal is late', async ({ page }) => {
    // 120min (2h) delay → fastingBonus = floor(120min*60000 / 2) in ms = 1h
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    const result = await calcEat(page, 120);
    expect(result.eatDurationMs).toBe(DURATION_EATING_MS + 60 * 60 * 1000); // 9h
});
