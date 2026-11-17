// US-21: explicit end of the Eating window (dialog) + way back to eating before the original end E.
const { test, expect } = require('@playwright/test');
const { makePotentialState, makeEatingState, makeFastingState, setAppState, advanceTime } = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Eating window that started `startAgoMs` ago and originally ends in `endInMs`.
function eatingWindow(startAgoMs, endInMs, extra = {}) {
    const now = Date.now();
    return makeEatingState({
        windowStartTime: now - startAgoMs,
        windowEndTime: now + endInMs,
        lastEatingWindowTargetMs: now + endInMs,
        ...extra,
    });
}

async function openDialog(page) {
    await page.locator('#btn-end-eating').click();
    await expect(page.locator('#end-eating-overlay')).toBeVisible();
}

// Types a time into the "Different time" field (HH:MM of `ms`) and confirms.
async function endAtCustomTime(page, ms) {
    await openDialog(page);
    await page.locator('#end-eating-custom-toggle').click();
    const value = await page.evaluate((t) => formatClockInput(t), ms);
    await page.locator('#end-eating-time-input').fill(value);
    await page.locator('#end-eating-custom-confirm').click();
}

test.describe('US-21: visibility', () => {
    test('End button is only visible during Eating and is less prominent than Log Last Meal', async ({ page }) => {
        await setAppState(page, eatingWindow(HOUR, 7 * HOUR));
        await page.goto('/');
        await expect(page.locator('#btn-end-eating')).toBeVisible();
        await expect(page.locator('#btn-last-meal')).toBeVisible();

        const sizes = await page.evaluate(() => ({
            end: parseFloat(getComputedStyle(document.getElementById('btn-end-eating')).fontSize),
            last: parseFloat(getComputedStyle(document.getElementById('btn-last-meal')).fontSize),
            endH: document.getElementById('btn-end-eating').getBoundingClientRect().height,
            lastH: document.getElementById('btn-last-meal').getBoundingClientRect().height,
        }));
        expect(sizes.end).toBeLessThan(sizes.last);
        expect(sizes.endH).toBeLessThan(sizes.lastH);
    });

    test('End button is hidden in Potential and Fasting states', async ({ page }) => {
        await setAppState(page, makePotentialState());
        await page.goto('/');
        await expect(page.locator('#btn-end-eating')).toBeHidden();

        const p2 = await page.context().newPage();
        await setAppState(p2, makeFastingState());
        await p2.goto('/');
        await expect(p2.locator('#btn-end-eating')).toBeHidden();
    });

    test('Dialog is closed initially and shows the original end of the window', async ({ page }) => {
        await setAppState(page, eatingWindow(HOUR, 7 * HOUR));
        await page.goto('/');
        await expect(page.locator('#end-eating-overlay')).toBeHidden();
        await openDialog(page);
        const expected = await page.evaluate(() => renderTime(appState.windowEndTime).replace(/<[^>]+>/g, ''));
        await expect(page.locator('#end-eating-original')).toContainText('originally ends at');
        await expect(page.locator('#end-eating-original')).toContainText(expected);
        await expect(page.locator('#end-eating-now')).toBeVisible();
        await expect(page.locator('#end-eating-custom-toggle')).toBeVisible();
        await expect(page.locator('#end-eating-cancel')).toBeVisible();
        // custom field stays collapsed until "Different time" is picked
        await expect(page.locator('#end-eating-custom')).toBeHidden();
    });

    test('"Last logged meal" option is offered only when a last meal is logged, with its time', async ({ page }) => {
        await setAppState(page, eatingWindow(4 * HOUR, 4 * HOUR));
        await page.goto('/');
        await openDialog(page);
        await expect(page.locator('#end-eating-logged')).toBeHidden();

        const p2 = await page.context().newPage();
        const lastMeal = Date.now() - 40 * MIN;
        await setAppState(p2, eatingWindow(4 * HOUR, 4 * HOUR, { lastMealTime: lastMeal }));
        await p2.goto('/');
        await p2.locator('#btn-end-eating').click();
        await expect(p2.locator('#end-eating-logged')).toBeVisible();
        const expected = await p2.evaluate((t) => renderTime(t).replace(/<[^>]+>/g, ''), lastMeal);
        await expect(p2.locator('#end-eating-logged')).toContainText('Last logged meal at');
        await expect(p2.locator('#end-eating-logged')).toContainText(expected);
    });

    test('"Different time" reveals the time field and Confirm button', async ({ page }) => {
        await setAppState(page, eatingWindow(4 * HOUR, 4 * HOUR));
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-custom-toggle').click();
        await expect(page.locator('#end-eating-time-input')).toBeVisible();
        await expect(page.locator('#end-eating-custom-confirm')).toBeVisible();
        await expect(page.locator('#end-eating-range')).toContainText('Allowed');
    });
});

test.describe('US-21: choices', () => {
    test('Cancel closes the dialog and changes nothing', async ({ page }) => {
        const state = eatingWindow(4 * HOUR, 4 * HOUR);
        await setAppState(page, state);
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-cancel').click();
        await expect(page.locator('#end-eating-overlay')).toBeHidden();
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('eating');
        expect(s.windowEndTime).toBe(state.windowEndTime);
        expect(s.lastMealTime).toBeNull();
        expect(s.history.length).toBe(0);
        await expect(page.locator('#btn-end-eating')).toBeVisible();
    });

    test('"Last meal is now" starts Fasting immediately; bonus = E - now (worked example 5h)', async ({ page }) => {
        // 8:00-17:00, it is 12:00
        await setAppState(page, eatingWindow(4 * HOUR, 5 * HOUR));
        await page.goto('/');
        const before = await page.evaluate(() => getCurrentTime());
        await openDialog(page);
        await page.locator('#end-eating-now').click();
        await expect(page.locator('#end-eating-overlay')).toBeHidden();

        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.lastMealTime).toBeGreaterThanOrEqual(before);
        expect(s.lastMealTime).toBeLessThan(before + 10000);
        expect(s.windowStartTime).toBe(s.lastMealTime);
        expect(s.eatingBonusMs).toBe(s.lastEatingWindowTargetMs - s.lastMealTime);
        expect(Math.abs(s.eatingBonusMs - 5 * HOUR)).toBeLessThan(15000);
        expect(s.fastingPenaltyMs).toBe(0);
    });

    test('"Last logged meal" uses the logged time (worked example: 11:20 -> 5h40m)', async ({ page }) => {
        const lastMeal = Date.now() - 40 * MIN;
        const state = eatingWindow(4 * HOUR, 5 * HOUR, { lastMealTime: lastMeal });
        await setAppState(page, state);
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-logged').click();

        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.lastMealTime).toBe(lastMeal);
        expect(s.windowStartTime).toBe(lastMeal);
        expect(s.eatingBonusMs).toBe(state.windowEndTime - lastMeal);
        expect(Math.abs(s.eatingBonusMs - (5 * HOUR + 40 * MIN))).toBeLessThan(15000);
    });

    test('"Different time" behaves like logging the last meal then ending (worked example: 10:00 -> 7h)', async ({ page }) => {
        const state = eatingWindow(4 * HOUR, 5 * HOUR);
        await setAppState(page, state);
        await page.goto('/');
        const target = await page.evaluate(() => floorToMinute(getCurrentTime() - 2 * 60 * 60 * 1000));
        await endAtCustomTime(page, target);
        await expect(page.locator('#end-eating-overlay')).toBeHidden();

        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.lastMealTime).toBe(target);
        expect(s.windowStartTime).toBe(target);
        expect(s.eatingBonusMs).toBe(state.windowEndTime - target);
        expect(Math.abs(s.eatingBonusMs - 7 * HOUR)).toBeLessThan(2 * MIN);
    });

    test('Fasting window length is the usual 16h from the chosen time', async ({ page }) => {
        await setAppState(page, eatingWindow(4 * HOUR, 5 * HOUR));
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-now').click();
        const s = await page.evaluate(() => appState);
        expect(s.windowEndTime - s.windowStartTime).toBe(16 * HOUR);
    });

    test('History records the Eating window with its ORIGINAL planned end', async ({ page }) => {
        const state = eatingWindow(4 * HOUR, 5 * HOUR);
        await setAppState(page, state);
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-now').click();
        const rec = await page.evaluate(() => appState.history.find(h => h.type === 'eating'));
        expect(rec).toBeTruthy();
        expect(rec.startTime).toBe(state.windowStartTime);
        expect(rec.endTime).toBe(state.windowEndTime);
    });

    test('Stored Eating bonus is shown as banked in the Fasting state', async ({ page }) => {
        await setAppState(page, eatingWindow(4 * HOUR, 5 * HOUR));
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-now').click();
        await expect(page.locator('#eating-bonus-badge')).toBeVisible();
        await expect(page.locator('#eating-bonus-text')).toContainText('eating bonus banked');
    });
});

test.describe('US-21: time range and overwriting', () => {
    test('Different time before the Eating window start is rejected', async ({ page }) => {
        await setAppState(page, eatingWindow(2 * HOUR, 6 * HOUR));
        await page.goto('/');
        const tooEarly = await page.evaluate(() => getCurrentTime() - 3 * 60 * 60 * 1000);
        await endAtCustomTime(page, tooEarly);
        await expect(page.locator('#end-eating-error')).toBeVisible();
        await expect(page.locator('#end-eating-overlay')).toBeVisible();
        expect(await page.evaluate(() => appState.currentState)).toBe('eating');
    });

    test('Different time earlier than an already logged last meal is rejected', async ({ page }) => {
        const lastMeal = Date.now() - 40 * MIN;
        await setAppState(page, eatingWindow(4 * HOUR, 4 * HOUR, { lastMealTime: lastMeal }));
        await page.goto('/');
        await endAtCustomTime(page, Date.now() - 90 * MIN);
        await expect(page.locator('#end-eating-error')).toBeVisible();
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('eating');
        expect(s.lastMealTime).toBe(lastMeal);
    });

    test('Different time in the future is rejected', async ({ page }) => {
        await setAppState(page, eatingWindow(HOUR, 7 * HOUR));
        await page.goto('/');
        await endAtCustomTime(page, Date.now() + 2 * HOUR);
        await expect(page.locator('#end-eating-error')).toBeVisible();
        expect(await page.evaluate(() => appState.currentState)).toBe('eating');
    });

    test('Different time equal to the window start minute is accepted and never earlier than the start', async ({ page }) => {
        const state = eatingWindow(3 * HOUR, 5 * HOUR);
        await setAppState(page, state);
        await page.goto('/');
        await endAtCustomTime(page, state.windowStartTime);
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.lastMealTime).toBeGreaterThanOrEqual(state.windowStartTime);
        expect(s.lastMealTime - state.windowStartTime).toBeLessThan(MIN);
    });

    test('Different time equal to the logged meal minute is accepted and not earlier than the logged meal', async ({ page }) => {
        const lastMeal = Date.now() - 40 * MIN - 25 * 1000; // not minute aligned
        await setAppState(page, eatingWindow(4 * HOUR, 4 * HOUR, { lastMealTime: lastMeal }));
        await page.goto('/');
        await endAtCustomTime(page, lastMeal);
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.lastMealTime).toBeGreaterThanOrEqual(lastMeal);
        expect(s.lastMealTime - lastMeal).toBeLessThan(MIN);
    });

    test('"Now" overwrites an already logged last meal', async ({ page }) => {
        const lastMeal = Date.now() - 40 * MIN;
        await setAppState(page, eatingWindow(4 * HOUR, 4 * HOUR, { lastMealTime: lastMeal }));
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-now').click();
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.lastMealTime).toBeGreaterThan(lastMeal + 30 * MIN);
    });

    test('A Fasting window that is already over is fast-forwarded', async ({ page }) => {
        // contrived long window: started 30h ago, ends in 1h; last meal 20h ago -> 16h fast ended 4h ago
        const lastMeal = Date.now() - 20 * HOUR;
        await setAppState(page, eatingWindow(30 * HOUR, HOUR, { lastMealTime: lastMeal }));
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-logged').click();
        const s = await page.evaluate(() => appState);
        expect(s.currentState).not.toBe('fasting');
    });
});

test.describe('US-21: way back to eating', () => {
    // Eating 8:00-17:00 style: started 4h ago, originally ends in 5h; ended explicitly now.
    async function endNow(page) {
        await setAppState(page, eatingWindow(4 * HOUR, 5 * HOUR));
        await page.goto('/');
        await openDialog(page);
        await page.locator('#end-eating-now').click();
    }

    test('Hint explains how to resume eating and mentions the original end E', async ({ page }) => {
        await endNow(page);
        const hint = page.locator('#explicit-end-hint');
        await expect(hint).toBeVisible();
        await expect(hint).toContainText('Break Fast Prematurely');
        await expect(hint).toContainText('Prolong');
        const expected = await page.evaluate(() => renderTime(appState.lastEatingWindowTargetMs).replace(/<[^>]+>/g, ''));
        await expect(hint).toContainText(expected);
    });

    test('Before E only Prolong Eating is offered; from E on Option 2 is back and the hint is gone', async ({ page }) => {
        await endNow(page);
        await page.locator('#btn-toggle-break').click();
        await expect(page.locator('#btn-break-prolong')).toBeVisible();
        await expect(page.locator('#break-premature-card')).toBeHidden();

        await advanceTime(page, 6 * HOUR); // past E (ended explicitly ~now, E is 5h ahead)
        await expect(page.locator('#explicit-end-hint')).toHaveCount(0);
        await expect(page.locator('#break-premature-card')).toBeVisible();
    });

    test('Natural Fasting shows no hint and keeps Option 2', async ({ page }) => {
        await setAppState(page, makeFastingState());
        await page.goto('/');
        await expect(page.locator('#explicit-end-hint')).toHaveCount(0);
        await page.locator('#btn-toggle-break').click();
        await expect(page.locator('#break-premature-card')).toBeVisible();
    });

    test('Break Fast dialog before E shows 0m penalty and the recalculated Eating bonus', async ({ page }) => {
        await endNow(page);
        await advanceTime(page, 3 * HOUR); // 3h later, still 2h before E
        await page.locator('#btn-toggle-break').click();
        await expect(page.locator('#break-prolong-penalty')).toHaveText('0m');
        await expect(page.locator('#break-prolong-bonus-note')).toBeVisible();
        const expected = await page.evaluate(() => formatMinutesBadge(Math.floor((appState.lastEatingWindowTargetMs - getCurrentTime()) / 60000)));
        await expect(page.locator('#break-prolong-bonus')).toHaveText(expected);
    });

    test('Prolong before E (worked example: 15:00 -> bonus 2h, no penalty)', async ({ page }) => {
        await endNow(page);
        await advanceTime(page, 3 * HOUR);
        await page.locator('#btn-toggle-break').click();
        await page.locator('#btn-break-prolong').click();
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.eatingPenaltyMs).toBe(0);
        expect(s.eatingBonusMs).toBe(s.lastEatingWindowTargetMs - s.windowStartTime);
        expect(Math.abs(s.eatingBonusMs - 2 * HOUR)).toBeLessThan(15000);
        // Fasting restarted from the moment of prolonging
        expect(s.windowEndTime - s.windowStartTime).toBe(16 * HOUR);
    });

    test('Prolong after E (worked example: 19:00 -> 4h Eating penalty, bonus discarded)', async ({ page }) => {
        await endNow(page);
        await advanceTime(page, 7 * HOUR); // 2h past E
        await page.locator('#btn-toggle-break').click();
        await page.locator('#btn-break-prolong').click();
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.eatingBonusMs).toBe(0);
        expect(Math.abs(s.eatingPenaltyMs - 4 * HOUR)).toBeLessThan(30000);
    });

    test('Retro last meal before E recalculates the Eating bonus without penalty', async ({ page }) => {
        await endNow(page);
        await advanceTime(page, HOUR);
        const t = await page.evaluate(() => floorToMinute(getCurrentTime() - 30 * 60 * 1000));
        await page.evaluate((ms) => {
            elMealTypeSelect.value = 'last';
            elMealTimeInput.value = formatClockInput(ms);
            submitMealLog();
        }, t);
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.windowStartTime).toBe(t);
        expect(s.eatingPenaltyMs).toBe(0);
        expect(s.eatingBonusMs).toBe(s.lastEatingWindowTargetMs - t);
    });

    test('Retro last meal after E applies the Eating penalty and discards the bonus', async ({ page }) => {
        await endNow(page);
        await advanceTime(page, 6 * HOUR + 30 * MIN); // 1h30 past E
        const t = await page.evaluate(() => floorToMinute(appState.lastEatingWindowTargetMs + 30 * 60 * 1000));
        await page.evaluate((ms) => {
            elMealTypeSelect.value = 'last';
            elMealTimeInput.value = formatClockInput(ms);
            submitMealLog();
        }, t);
        const s = await page.evaluate(() => appState);
        expect(s.currentState).toBe('fasting');
        expect(s.eatingBonusMs).toBe(0);
        expect(s.eatingPenaltyMs).toBe(2 * (t - s.lastEatingWindowTargetMs));
        expect(s.eatingPenaltyMs).toBeGreaterThan(0);
    });
});
