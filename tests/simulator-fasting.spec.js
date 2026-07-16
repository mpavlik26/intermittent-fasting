// ============================================================
// US-13: Eating Window Simulator (Fasting State)
// makeFastingState: windowStartTime = now, windowEndTime = now + 16h
// sliderStartMs = windowEndTime = now + 16h
// sliderEndMs   = sliderStartMs + 24h = now + 40h
// totalMins = 1440 (24h)
// toggle1 initial = 0 (eating starts at fasting window end)
// toggle2 initial = 480 (8h eating window, no bonus)
// ============================================================
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    makeFastingState,
    setAppState,
} = require('./helpers');
const { openSimulator, calcEat } = require('./simulator-helpers');

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

test('fasting: output section displays correct eating window after slider move', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');
    await openSimulator(page);

    // Move toggle 1 to 120 min (2h delay → 1h US-3 bonus → 9h eating window)
    await page.evaluate(() => {
        document.getElementById('slider-first-meal').value = 120;
        document.getElementById('slider-first-meal').dispatchEvent(new Event('input'));
    });

    // Duration must reflect the 9h eating window in the DOM
    const duration = await page.evaluate(() =>
        document.getElementById('sim-fast-duration').textContent
    );
    expect(duration).toBe('9h');

    // Start and end times must be consistent with the computed eating window
    const { startText, endText } = await page.evaluate(() => {
        const sliderStart = simState.sliderStartMs;
        const eatStart = sliderStart + 120 * 60000;                 // T1 = 120min from fasting end
        const eatEnd   = sliderStart + (120 + 480 + 60) * 60000;    // + 8h + 1h bonus
        return {
            startText: document.getElementById('sim-fast-start').textContent.trim(),
            endText:   document.getElementById('sim-fast-end').textContent.trim(),
            expectedStart: new Date(eatStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            expectedEnd:   new Date(eatEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
    }).then(({ startText, endText, expectedStart, expectedEnd }) => {
        expect(startText).toContain(expectedStart);
        expect(endText).toContain(expectedEnd);
        return { startText, endText };
    });
});
