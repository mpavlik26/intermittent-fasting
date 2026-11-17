// US-20 bug fixes (manual testing):
//  1. Potential Eating forecast must include banked/stored Eating bonus, Eating penalty and cascade-skips.
//  2. Eating window description "Total window" must be the real window length (incl. cascade-skips).
const { test, expect } = require('@playwright/test');
const { makePotentialState, makeEatingState, setAppState } = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// The forecast shows hh:mm (+ optional day label); accept the current minute or the one before
// in case the clock ticked over while the test was running.
async function expectForecastEnd(page, expectedOffsetMs) {
    const text = await page.locator('#forecast-eating-end').textContent();
    const candidates = await page.evaluate((off) => {
        const now = Date.now();
        return [formatTimeOnly(now + off), formatTimeOnly(now + off - 60 * 1000), formatTimeOnly(now + off + 60 * 1000)];
    }, expectedOffsetMs);
    expect(candidates.some(c => text.includes(c))).toBe(true);
}

async function openPotential(page, overrides) {
    const now = Date.now();
    // Potential window ended 30 min ago unless a test overrides it
    await setAppState(page, makePotentialState({
        windowStartTime: now - 16 * HOUR - 30 * MIN,
        windowEndTime: now - 30 * MIN,
        ...overrides,
    }));
    await page.goto('/');
    await page.waitForTimeout(1200); // let tick() render the forecast
}

test.describe('Potential forecast of the eating window end', () => {
    test('baseline: 8h window, no bonuses', async ({ page }) => {
        await openPotential(page, {});
        await expectForecastEnd(page, 8 * HOUR);
    });

    test('banked Eating bonus is included', async ({ page }) => {
        await openPotential(page, { eatingBonusMs: 90 * MIN });
        await expectForecastEnd(page, 8 * HOUR + 90 * MIN);
    });

    test('Eating penalty is subtracted', async ({ page }) => {
        await openPotential(page, { eatingPenaltyMs: 2 * HOUR });
        await expectForecastEnd(page, 6 * HOUR);
    });

    test('reserved stored bonus is included', async ({ page }) => {
        await openPotential(page, { pendingEatingBonusUseMs: HOUR });
        await expectForecastEnd(page, 9 * HOUR);
    });

    test('Eating bonus plus cascade-skip from a big Fasting bonus', async ({ page }) => {
        const now = Date.now();
        // Potential window ended 20h ago → 20h Fasting bonus → one cascade-skip (+8h), 4h remainder
        await openPotential(page, {
            windowStartTime: now - 16 * HOUR - 20 * HOUR,
            windowEndTime: now - 20 * HOUR,
            eatingBonusMs: HOUR,
        });
        await expectForecastEnd(page, 17 * HOUR);
    });

    test('forecast equals the window transitionToEating() really creates', async ({ page }) => {
        const now = Date.now();
        await openPotential(page, {
            windowStartTime: now - 16 * HOUR - 36 * HOUR,
            windowEndTime: now - 36 * HOUR, // 36h bonus → 2 skips
            eatingBonusMs: 45 * MIN,
            eatingPenaltyMs: 15 * MIN,
        });
        const { forecast, actualEnd, now2 } = await page.evaluate(() => {
            const n = getCurrentTime();
            const f = planEatingWindow(n, n - appState.windowEndTime).endTime;
            transitionToEating();
            return { forecast: f, actualEnd: appState.windowEndTime, now2: n };
        });
        expect(Math.abs(actualEnd - forecast)).toBeLessThan(5000);
        // 8h + 2×8h + 45m − 15m
        expect(Math.abs((actualEnd - now2) - (24 * HOUR + 30 * MIN))).toBeLessThan(5000);
    });
});

test.describe('Eating window description total', () => {
    test('Eating bonus only: total = 8h + bonus', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeEatingState({
            windowStartTime: now,
            windowEndTime: now + 8 * HOUR + HOUR,
            lastEatingWindowTargetMs: now + 9 * HOUR,
            appliedEatingBonusMs: HOUR,
        }));
        await page.goto('/');
        await expect(page.locator('#state-description')).toContainText('You earned a 1h bonus');
        await expect(page.locator('#state-description')).toContainText('Total window: 9h.');
    });

    test('Eating bonus plus cascade-skip: total includes the extra 8h', async ({ page }) => {
        const now = Date.now();
        // 1h bonus + 8h base + 8h skip = 17h
        await setAppState(page, makeEatingState({
            windowStartTime: now,
            windowEndTime: now + 17 * HOUR,
            lastEatingWindowTargetMs: now + 17 * HOUR,
            appliedEatingBonusMs: HOUR,
            fastingBonusMs: 4 * HOUR,
        }));
        await page.goto('/');
        await expect(page.locator('#state-description')).toContainText('You earned a 1h bonus');
        await expect(page.locator('#state-description')).toContainText('Total window: 17h.');
    });

    test('Eating bonus with an Eating penalty: total reflects the penalty too', async ({ page }) => {
        const now = Date.now();
        // 8h + 2h bonus − 1h penalty = 9h
        await setAppState(page, makeEatingState({
            windowStartTime: now,
            windowEndTime: now + 9 * HOUR,
            lastEatingWindowTargetMs: now + 9 * HOUR,
            appliedEatingBonusMs: 2 * HOUR,
            appliedEatingPenaltyMs: HOUR,
        }));
        await page.goto('/');
        await expect(page.locator('#state-description')).toContainText('Total window: 9h.');
    });

    test('end-to-end: starting eating after a 20h-late start with a banked bonus shows 17h', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makePotentialState({
            windowStartTime: now - 16 * HOUR - 20 * HOUR,
            windowEndTime: now - 20 * HOUR,
            eatingBonusMs: HOUR,
        }));
        await page.goto('/');
        await page.evaluate(() => { transitionToEating(); tick(); });
        await expect(page.locator('#state-description')).toContainText('Total window: 17h.');
    });

    test('skip-only window (no Eating bonus) states its real length', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeEatingState({
            windowStartTime: now,
            windowEndTime: now + 16 * HOUR,
            lastEatingWindowTargetMs: now + 16 * HOUR,
            fastingBonusMs: 0,
        }));
        await page.goto('/');
        await expect(page.locator('#state-description')).toContainText('You have 16h to consume your daily meals.');
    });
});
