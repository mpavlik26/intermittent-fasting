// US-25: "banked" badges in every state + simulators/forecast model counts banked Eating bonus/penalty
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
const { openSimulator, calcFast, calcEat } = require('./simulator-helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const EATING_BONUS = '#eating-bonus-badge';
const EATING_BONUS_TEXT = '#eating-bonus-text';
const EATING_PENALTY = '#eating-penalty-badge';
const EATING_PENALTY_TEXT = '#eating-penalty-text';
const FASTING_BONUS = '#fasting-bonus-badge';
const FASTING_BONUS_TEXT = '#fasting-bonus-text';
const FASTING_PENALTY = '#fasting-penalty-badge';
const FASTING_PENALTY_TEXT = '#fasting-penalty-text';

// --- Fasting window: banked Eating bonus / penalty ---

test('US-25 Fasting: banked Eating penalty badge', async ({ page }) => {
    await setAppState(page, makeFastingState({ eatingPenaltyMs: 2 * HOUR }));
    await page.goto('/');

    await expect(page.locator(EATING_PENALTY)).toBeVisible();
    await expect(page.locator(EATING_PENALTY_TEXT)).toHaveText('-2h penalty banked for next Eating window');
    await expect(page.locator(EATING_BONUS)).toBeHidden();
});

test('US-25 Fasting: banked Eating bonus badge (no trailing "!")', async ({ page }) => {
    await setAppState(page, makeFastingState({ eatingBonusMs: HOUR }));
    await page.goto('/');

    await expect(page.locator(EATING_BONUS)).toBeVisible();
    await expect(page.locator(EATING_BONUS_TEXT)).toHaveText('+1h eating bonus banked');
    await expect(page.locator(EATING_PENALTY)).toBeHidden();
});

test('US-25 Fasting: banked Eating bonus and penalty shown together, alongside applied badges', async ({ page }) => {
    await setAppState(page, makeFastingState({
        eatingBonusMs: 45 * MIN,
        eatingPenaltyMs: 2 * HOUR,
        fastingBonusMs: 30 * MIN,
        appliedFastingBonusMs: 30 * MIN,
        appliedFastingPenaltyMs: 3 * HOUR,
    }));
    await page.goto('/');

    await expect(page.locator(EATING_BONUS_TEXT)).toHaveText('+45m eating bonus banked');
    await expect(page.locator(EATING_PENALTY_TEXT)).toHaveText('-2h penalty banked for next Eating window');
    await expect(page.locator(FASTING_BONUS)).toBeVisible();
    await expect(page.locator(FASTING_BONUS_TEXT)).toContainText('fasting bonus applied');
    await expect(page.locator(FASTING_PENALTY)).toBeVisible();
    await expect(page.locator(FASTING_PENALTY_TEXT)).toContainText('applied');
});

test('US-25 Fasting: nothing banked -> no banked badges', async ({ page }) => {
    await setAppState(page, makeFastingState());
    await page.goto('/');

    await expect(page.locator(EATING_BONUS)).toBeHidden();
    await expect(page.locator(EATING_PENALTY)).toBeHidden();
    await expect(page.locator(FASTING_BONUS)).toBeHidden();
    await expect(page.locator(FASTING_PENALTY)).toBeHidden();
});

// --- Potential Eating window: all four ---

test('US-25 Potential: banked Eating bonus and penalty badges', async ({ page }) => {
    await setAppState(page, makePotentialState({ eatingBonusMs: HOUR, eatingPenaltyMs: 2 * HOUR }));
    await page.goto('/');

    await expect(page.locator(EATING_BONUS_TEXT)).toHaveText('+1h eating bonus banked');
    await expect(page.locator(EATING_PENALTY_TEXT)).toHaveText('-2h penalty banked for next Eating window');
});

test('US-25 Potential: banked Fasting penalty badge', async ({ page }) => {
    await setAppState(page, makePotentialState({ fastingPenaltyMs: 4 * HOUR }));
    await page.goto('/');

    await expect(page.locator(FASTING_PENALTY)).toBeVisible();
    await expect(page.locator(FASTING_PENALTY_TEXT)).toHaveText('+4h penalty banked for next Fasting window');
});

test('US-25 Potential: pending Fasting bonus is a banked badge that grows with time', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowStartTime: now - DURATION_FASTING_MS - 30 * MIN,
        windowEndTime: now - 30 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator(FASTING_BONUS_TEXT)).toHaveText('-30m fasting bonus banked');
    await advanceTime(page, 30 * MIN);
    await expect(page.locator(FASTING_BONUS_TEXT)).toHaveText('-1h fasting bonus banked');
});

test('US-25 Potential: carried Fasting bonus is shown when no delay is pending', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makePotentialState({
        windowEndTime: now + 3 * HOUR,
        fastingBonusMs: 45 * MIN,
    }));
    await page.goto('/');

    await expect(page.locator(FASTING_BONUS_TEXT)).toHaveText('-45m fasting bonus banked');
});

// --- Eating window: banked Fasting bonus / penalty next to applied Eating badges ---

test('US-25 Eating: banked Fasting penalty and bonus alongside applied Eating penalty', async ({ page }) => {
    await setAppState(page, makeEatingState({
        fastingPenaltyMs: 4 * HOUR,
        fastingBonusMs: HOUR,
        appliedEatingPenaltyMs: 2 * HOUR,
    }));
    await page.goto('/');

    await expect(page.locator(FASTING_PENALTY_TEXT)).toHaveText('+4h penalty banked for next Fasting window');
    await expect(page.locator(FASTING_BONUS_TEXT)).toHaveText('-1h fasting bonus banked');
    await expect(page.locator(EATING_PENALTY)).toBeVisible();
    await expect(page.locator(EATING_PENALTY_TEXT)).toContainText('applied');
});

test('US-25 Eating: nothing banked -> no Fasting badges', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');

    await expect(page.locator(FASTING_BONUS)).toBeHidden();
    await expect(page.locator(FASTING_PENALTY)).toBeHidden();
});

// --- Flows ---

test('US-25 flow: Prolong Eating -> Fasting -> Potential -> Eating moves the penalty banked -> applied', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({ lastEatingWindowTargetMs: now - HOUR }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-prolong');

    // Fasting: the Eating penalty (≈ 2h) is banked, visible
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');
    await expect(page.locator(EATING_PENALTY)).toBeVisible();
    await expect(page.locator(EATING_PENALTY_TEXT)).toContainText('penalty banked for next Eating window');

    // Fasting -> Potential: still banked
    await advanceTime(page, DURATION_FASTING_MS + 10 * 1000);
    await expect(page.locator('#current-state')).toHaveText('Potential Eating Window');
    await expect(page.locator(EATING_PENALTY_TEXT)).toContainText('penalty banked for next Eating window');

    // Potential -> Eating: applied, no longer banked
    await page.evaluate(() => transitionToEating());
    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator(EATING_PENALTY_TEXT)).toContainText('applied');
    await expect(page.locator(EATING_PENALTY_TEXT)).not.toContainText('banked');
});

test('US-25 flow: premature start -> Eating window shows the banked Fasting penalty', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({ windowEndTime: now + 2 * HOUR }));
    await page.goto('/');

    await page.click('#btn-toggle-break');
    await page.click('#btn-break-premature');

    await expect(page.locator('#current-state')).toHaveText('Eating Window');
    await expect(page.locator(FASTING_PENALTY)).toBeVisible();
    await expect(page.locator(FASTING_PENALTY_TEXT)).toContainText(/^\+(4h|3h 5\dm) penalty banked for next Fasting window$/);
});

// --- Simulator, Fasting state (US-13): modeled Eating window counts banked Eating bonus/penalty ---

async function fastingSimEat(page, overrides, firstMins = 0) {
    await setAppState(page, makeFastingState(overrides));
    await page.goto('/');
    await openSimulator(page);
    return calcEat(page, firstMins);
}

test('US-25 sim Fasting: no banked -> 8h window (regression)', async ({ page }) => {
    const r = await fastingSimEat(page, {});
    expect(r.eatDurationMs).toBe(DURATION_EATING_MS);
});

test('US-25 sim Fasting: banked Eating penalty 2h shortens modeled window to 6h', async ({ page }) => {
    const r = await fastingSimEat(page, { eatingPenaltyMs: 2 * HOUR });
    expect(r.eatDurationMs).toBe(6 * HOUR);
    await expect(page.locator('#sim-fast-duration')).toHaveText('6h');
});

test('US-25 sim Fasting: banked Eating bonus 1h lengthens modeled window to 9h', async ({ page }) => {
    const r = await fastingSimEat(page, { eatingBonusMs: HOUR });
    expect(r.eatDurationMs).toBe(9 * HOUR);
    await expect(page.locator('#sim-fast-duration')).toHaveText('9h');
});

test('US-25 sim Fasting: banked bonus 2h and penalty 1h -> 9h; both 1h -> 8h', async ({ page }) => {
    const r = await fastingSimEat(page, { eatingBonusMs: 2 * HOUR, eatingPenaltyMs: HOUR });
    expect(r.eatDurationMs).toBe(9 * HOUR);
});

test('US-25 sim Fasting: reservation of stored Eating bonus is included', async ({ page }) => {
    const r = await fastingSimEat(page, { storedEatingBonusMs: HOUR, pendingEatingBonusUseMs: HOUR });
    expect(r.eatDurationMs).toBe(9 * HOUR);
});

test('US-25 sim Fasting: delay >= 16h cascade-skips (+8h) and leaves only the remainder for next Fasting', async ({ page }) => {
    const r = await fastingSimEat(page, {}, 17 * 60);
    expect(r.eatDurationMs).toBe(DURATION_EATING_MS + DURATION_EATING_MS);
    expect(r.nextFastShortenedByMs).toBe(HOUR);
});

test('US-25 sim Fasting: delay < 16h unchanged next-fast shortening', async ({ page }) => {
    const r = await fastingSimEat(page, { eatingPenaltyMs: 2 * HOUR }, 3 * 60);
    expect(r.nextFastShortenedByMs).toBe(3 * HOUR);
});

test('US-25 sim Fasting: "Eating ends" handle follows the planned window (penalty 2h -> 6h)', async ({ page }) => {
    await setAppState(page, makeFastingState({ eatingPenaltyMs: 2 * HOUR }));
    await page.goto('/');
    await openSimulator(page);

    expect(await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value))).toBe(360);

    await page.evaluate(() => {
        const first = document.getElementById('slider-first-meal');
        first.value = 120;
        first.dispatchEvent(new Event('input'));
    });
    expect(await page.evaluate(() => parseInt(document.getElementById('slider-last-meal').value))).toBe(120 + 360);

    // dragging the end back-calculates the start with the same window length
    await page.evaluate(() => {
        const last = document.getElementById('slider-last-meal');
        last.value = 600;
        last.dispatchEvent(new Event('input'));
    });
    expect(await page.evaluate(() => parseInt(document.getElementById('slider-first-meal').value))).toBe(600 - 360);
});

// --- Simulator, Potential state: modeled Eating end counts banked Eating bonus/penalty ---

async function potentialEatingEnd(page, overrides, firstMins = 0) {
    await setAppState(page, makePotentialState(overrides));
    await page.goto('/');
    await openSimulator(page);
    return page.evaluate((f) => {
        const firstMs = simState.sliderStartMs + f * 60000;
        return {
            eatingEndMs: getModeledFirstMealEffects(firstMs).eatingEndMs - firstMs,
            maxLast: getMaxLastMealMins(),
        };
    }, firstMins);
}

test('US-25 sim Potential: no banked -> 8h (regression)', async ({ page }) => {
    const r = await potentialEatingEnd(page, {});
    expect(r.eatingEndMs).toBe(DURATION_EATING_MS);
});

test('US-25 sim Potential: banked Eating penalty 2h -> modeled end after 6h, last-meal clamp follows', async ({ page }) => {
    const r = await potentialEatingEnd(page, { eatingPenaltyMs: 2 * HOUR });
    expect(r.eatingEndMs).toBe(6 * HOUR);
    expect(r.maxLast).toBeLessThanOrEqual(360);
    expect(r.maxLast).toBeGreaterThanOrEqual(355);
});

test('US-25 sim Potential: banked Eating bonus 1h -> modeled end after 9h', async ({ page }) => {
    const r = await potentialEatingEnd(page, { eatingBonusMs: HOUR });
    expect(r.eatingEndMs).toBe(9 * HOUR);
});

test('US-25 sim Potential: modeled fast still includes the Fasting penalty', async ({ page }) => {
    await setAppState(page, makePotentialState({ fastingPenaltyMs: 3 * HOUR, eatingPenaltyMs: HOUR }));
    await page.goto('/');
    await openSimulator(page);
    const r = await calcFast(page, 0, 300);
    expect(r.fastDurationMs).toBe(DURATION_FASTING_MS + 3 * HOUR);
    // last meal at 5h, modeled Eating end at 7h -> 2h Eating bonus would be banked
    expect(r.eatingBonusBankedMs).toBe(2 * HOUR);
});

// --- Consistency: the modeled Eating end equals what the real transition produces ---

for (const [name, overrides, delayMins] of [
    ['plain', {}, 0],
    ['penalty 2h', { eatingPenaltyMs: 2 * HOUR }, 0],
    ['bonus 1h', { eatingBonusMs: HOUR }, 0],
    ['bonus+penalty, 3h delay', { eatingBonusMs: 90 * MIN, eatingPenaltyMs: 30 * MIN }, 180],
    ['reservation, 17h delay (cascade)', { storedEatingBonusMs: HOUR, pendingEatingBonusUseMs: HOUR }, 17 * 60],
]) {
    test(`US-25 consistency: modeled Eating end == real transitionToEating (${name})`, async ({ page }) => {
        await setAppState(page, makePotentialState(overrides));
        await page.goto('/');
        await openSimulator(page);

        const { modeled, real } = await page.evaluate((d) => {
            const firstMs = appState.windowEndTime + d * 60000;
            const modeled = getModeledFirstMealEffects(firstMs).eatingEndMs;
            transitionToEating(firstMs);
            return { modeled, real: appState.windowEndTime };
        }, delayMins);

        expect(modeled).toBe(real);
    });
}
