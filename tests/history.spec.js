// US-10: History of completed eating and fasting windows
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeEatingState,
    makeFastingState,
    makeState,
    setAppState,
    advanceTime,
} = require('./helpers');

test('history shows empty state when no records', async ({ page }) => {
    await setAppState(page, makeEatingState());
    await page.goto('/');

    await page.click('#btn-toggle-history');
    await expect(page.locator('.empty-history')).toBeVisible();
    await expect(page.locator('.history-record-item')).toHaveCount(0);
});

test('eating record added to history after transition to fasting', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        windowStartTime: now - DURATION_EATING_MS + 5000,
        windowEndTime: now + 5000,
        lastEatingWindowTargetMs: now + 5000,
    }));
    await page.goto('/');

    await advanceTime(page, 10000);
    await expect(page.locator('#current-state')).toHaveText('Fasting Window');

    await page.click('#btn-toggle-history');
    const records = page.locator('.history-record-item');
    await expect(records).toHaveCount(1);
    await expect(records.first().locator('.record-type')).toHaveText('Eating');
});

test('fasting record added to history after transition to potential', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeFastingState({
        windowStartTime: now - DURATION_FASTING_MS + 5000,
        windowEndTime: now + 5000,
        // Seed history with one prior eating record
        history: [{
            type: 'eating',
            startTime: now - DURATION_FASTING_MS - DURATION_EATING_MS,
            endTime: now - DURATION_FASTING_MS,
            bonusMs: 0,
            penaltyMs: 0,
            isManual: false,
            id: 1,
        }],
    }));
    await page.goto('/');

    await advanceTime(page, 10000);
    await expect(page.locator('#current-state')).toHaveText('Potential Eating Window');

    await page.click('#btn-toggle-history');
    const records = page.locator('.history-record-item');
    await expect(records).toHaveCount(2);
    // Most recent (fasting) is at top because history is unshifted
    await expect(records.first().locator('.record-type')).toHaveText('Fasting');
});

test('Manual tag shown for manual sessions in history', async ({ page }) => {
    const now = Date.now();
    await setAppState(page, makeEatingState({
        windowStartTime: now - DURATION_EATING_MS + 5000,
        windowEndTime: now + 5000,
        lastEatingWindowTargetMs: now + 5000,
        isManualSession: true,
    }));
    await page.goto('/');

    await advanceTime(page, 10000);

    await page.click('#btn-toggle-history');
    await expect(page.locator('.history-tag.manual')).toBeVisible();
});

test('Bonus tag shown when fasting bonus was applied to eating window', async ({ page }) => {
    const now = Date.now();
    const bonusMs = 30 * 60 * 1000; // 30 min bonus
    await setAppState(page, makeEatingState({
        windowStartTime: now - DURATION_EATING_MS - bonusMs + 5000,
        windowEndTime: now + 5000,
        lastEatingWindowTargetMs: now + 5000,
        fastingBonusMs: bonusMs,
    }));
    await page.goto('/');

    await advanceTime(page, 10000);

    await page.click('#btn-toggle-history');
    await expect(page.locator('.history-tag.bonus')).toBeVisible();
    await expect(page.locator('.history-tag.bonus')).toContainText('Reward +30m window');
});

test('Penalty tag shown when penalty was applied during fasting window', async ({ page }) => {
    const now = Date.now();
    const penaltyMs = 60 * 60 * 1000; // 1h penalty
    await setAppState(page, makeFastingState({
        windowStartTime: now - DURATION_FASTING_MS + 5000,
        windowEndTime: now + 5000,
        appliedPenaltyMs: penaltyMs,
        prolongingPenaltyMs: penaltyMs,
    }));
    await page.goto('/');

    await advanceTime(page, 10000);

    await page.click('#btn-toggle-history');
    await expect(page.locator('.history-tag.penalty')).toBeVisible();
    await expect(page.locator('.history-tag.penalty')).toContainText('Penalty +60m');
});
