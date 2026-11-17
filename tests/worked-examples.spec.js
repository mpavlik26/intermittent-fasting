// US-20: the two worked examples from user-stories.md, replayed end-to-end.
// Clock "hh:mm" labels in comments are relative to the scenario's 8:00 start (T0).
const { test, expect } = require('@playwright/test');
const {
    makeEatingState,
    makePotentialState,
    setAppState,
    advanceTime,
} = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const TOLERANCE = 10 * 1000; // real wall-clock drift while the test runs

function near(actual, expected) {
    expect(Math.abs(actual - expected)).toBeLessThan(TOLERANCE);
}

test('US-20 worked example 1: 20h Fasting bonus cascade-skips, leaving 4h that shortens the fast to 12h', async ({ page }) => {
    const now = Date.now();
    // Potential Eating window ended 20h ago; the user starts eating now (8:00) → 20h Fasting bonus.
    // A 1h Eating bonus is already banked from the previous cycle.
    await setAppState(page, makePotentialState({
        windowStartTime: now - 16 * HOUR - 20 * HOUR,
        windowEndTime: now - 20 * HOUR,
        eatingBonusMs: HOUR,
    }));
    await page.goto('/');

    await page.evaluate(() => transitionToEating());

    // Eating window: 8h + 1h Eating bonus + 8h eager extension = 17h (8:00 → 1:00 next day)
    let s = await page.evaluate(() => ({
        start: appState.windowStartTime,
        end: appState.windowEndTime,
        fastingBonusMs: appState.fastingBonusMs,
        state: appState.currentState,
    }));
    expect(s.state).toBe('eating');
    near(s.end - s.start, 17 * HOUR);
    near(s.fastingBonusMs, 4 * HOUR); // 20h - 16h

    // The user finishes eating at 1:00 → Fasting window shortened by the remaining 4h → 12h
    const eatingStart = s.start;
    await advanceTime(page, 17 * HOUR);

    s = await page.evaluate(() => ({
        start: appState.windowStartTime,
        end: appState.windowEndTime,
        state: appState.currentState,
    }));
    expect(s.state).toBe('fasting');
    near(s.start, eatingStart + 17 * HOUR);
    near(s.end - s.start, 12 * HOUR);
});

test('US-20 worked example 2: prolonging discards banked Eating bonus, defers a 2h Eating penalty to the next Eating window', async ({ page }) => {
    const now = Date.now();
    // 8:00 – 17:00 Eating window (8h + 1h Eating bonus), 3h Fasting bonus available
    await setAppState(page, makeEatingState({
        windowStartTime: now,
        windowEndTime: now + 9 * HOUR,
        lastEatingWindowTargetMs: now + 9 * HOUR,
        appliedEatingBonusMs: HOUR,
        fastingBonusMs: 3 * HOUR,
    }));
    await page.goto('/');
    const t0 = now;

    // 12:00 — last meal logged; window continues until 17:00
    await advanceTime(page, 4 * HOUR);
    await page.evaluate(() => logLastMeal());
    expect(await page.evaluate(() => appState.currentState)).toBe('eating');

    // 17:00 — transitions to Fasting, banking a 5h Eating bonus
    await advanceTime(page, 5 * HOUR);
    let s = await page.evaluate(() => ({
        state: appState.currentState,
        eatingBonusMs: appState.eatingBonusMs,
    }));
    expect(s.state).toBe('fasting');
    near(s.eatingBonusMs, 5 * HOUR);

    // 18:00 — user admits they kept eating until now: prolong
    await advanceTime(page, HOUR);
    await page.evaluate(() => prolongEatingAndStartFast());
    s = await page.evaluate(() => ({
        state: appState.currentState,
        start: appState.windowStartTime,
        end: appState.windowEndTime,
        eatingBonusMs: appState.eatingBonusMs,
        eatingPenaltyMs: appState.eatingPenaltyMs,
        fastingBonusMs: appState.fastingBonusMs,
    }));
    expect(s.state).toBe('fasting');
    expect(s.eatingBonusMs).toBe(0); // banked bonus discarded
    near(s.eatingPenaltyMs, 2 * HOUR); // 2 × 1h overshoot, deferred
    expect(s.fastingBonusMs).toBe(3 * HOUR); // untouched
    near(s.start, t0 + 10 * HOUR); // 18:00
    near(s.end - s.start, 13 * HOUR); // 16h - 3h; penalty does NOT lengthen it → ends 7:00 next day

    // 7:00 next day — Potential Eating window begins
    await advanceTime(page, 13 * HOUR);
    expect(await page.evaluate(() => appState.currentState)).toBe('potential');

    // 8:00 — user starts eating: fresh 1h Fasting bonus, window = 8h - 2h penalty = 6h
    await advanceTime(page, HOUR);
    await page.evaluate(() => transitionToEating());
    s = await page.evaluate(() => ({
        state: appState.currentState,
        start: appState.windowStartTime,
        end: appState.windowEndTime,
        fastingBonusMs: appState.fastingBonusMs,
        eatingPenaltyMs: appState.eatingPenaltyMs,
        appliedEatingPenaltyMs: appState.appliedEatingPenaltyMs,
    }));
    expect(s.state).toBe('eating');
    near(s.fastingBonusMs, HOUR);
    near(s.end - s.start, 6 * HOUR); // 8:00 → 14:00
    expect(s.eatingPenaltyMs).toBe(0);
    near(s.appliedEatingPenaltyMs, 2 * HOUR);
    const eatStart = s.start;

    // 12:00 — finishes eating early
    await advanceTime(page, 4 * HOUR);
    await page.evaluate(() => logLastMeal());

    // 14:00 — Fasting begins, banking a 2h Eating bonus; fast from 12:00 is 16h - 1h = 15h → ends 3:00 next day
    await advanceTime(page, 2 * HOUR);
    s = await page.evaluate(() => ({
        state: appState.currentState,
        start: appState.windowStartTime,
        end: appState.windowEndTime,
        eatingBonusMs: appState.eatingBonusMs,
    }));
    expect(s.state).toBe('fasting');
    near(s.eatingBonusMs, 2 * HOUR);
    near(s.start, eatStart + 4 * HOUR); // 12:00
    near(s.end - s.start, 15 * HOUR);
    near(s.end, eatStart + 19 * HOUR); // 3:00 next day
});
