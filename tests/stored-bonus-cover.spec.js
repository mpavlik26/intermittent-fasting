// US-24: stored bonuses automatically cover Break-Fast penalties (1:1, penalty-free, to the maximum);
// only the uncovered part is charged with the x2 penalty.
const { test, expect } = require('@playwright/test');
const {
    DURATION_EATING_MS,
    DURATION_FASTING_MS,
    makeFastingState,
    advanceTime,
    setAppState,
} = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function toHHMM(date) {
    return date.toTimeString().slice(0, 5);
}

async function submitRetroLog(page, mealType, timeValue) {
    await page.click('#btn-toggle-retro');
    await page.selectOption('#meal-type-select', mealType);
    await page.fill('#meal-time-input', timeValue);
    await page.click('#btn-submit-log');
}

function readState(page) {
    return page.evaluate(() => ({
        storedEatingBonusMs: appState.storedEatingBonusMs,
        storedFastingBonusMs: appState.storedFastingBonusMs,
        eatingPenaltyMs: appState.eatingPenaltyMs,
        fastingPenaltyMs: appState.fastingPenaltyMs,
        lastEatingWindowTargetMs: appState.lastEatingWindowTargetMs,
        windowStartTime: appState.windowStartTime,
        windowEndTime: appState.windowEndTime,
        pendingEatingBonusUseMs: appState.pendingEatingBonusUseMs,
        pendingFastingBonusUseMs: appState.pendingFastingBonusUseMs,
        eatingBonusMs: appState.eatingBonusMs,
        currentState: appState.currentState,
        history: appState.history,
    }));
}

// ---------------------------------------------------------------------------
// Option 1: Prolong Eating (overshoot = now - E = 3h)
// ---------------------------------------------------------------------------

test.describe('US-24 Prolong Eating covered by stored Eating bonus', () => {
    test('stored 2h < overshoot 3h: 2h covered, only 1h charged x2; E moves by 2h', async ({ page }) => {
        const now = Date.now();
        const E = now - 3 * HOUR;
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: E,
            storedEatingBonusMs: 2 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        // Live preview in the dialog
        await expect(page.locator('#break-prolong-stored-note')).toBeVisible();
        await expect(page.locator('#break-prolong-stored-used')).toHaveText('2h');
        await expect(page.locator('#break-prolong-stored-left')).toHaveText('0m');
        await expect(page.locator('#break-prolong-penalty')).toHaveText(/^2h( \dm)?$/);

        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.storedEatingBonusMs).toBe(0);
        expect(s.eatingPenaltyMs).toBeGreaterThan(2 * HOUR - MIN);
        expect(s.eatingPenaltyMs).toBeLessThan(2 * HOUR + 5 * MIN);
        expect(s.lastEatingWindowTargetMs).toBe(E + 2 * HOUR);
    });

    test('stored 5h > overshoot 3h: fully covered, no penalty, 2h stay in storage', async ({ page }) => {
        const now = Date.now();
        const E = now - 3 * HOUR;
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: E,
            storedEatingBonusMs: 5 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        await expect(page.locator('#break-prolong-stored-note')).toBeVisible();
        await expect(page.locator('#break-prolong-stored-used')).toHaveText(/^3h$|^3h 0?\dm$|^2h 5\dm$/);
        await expect(page.locator('#break-prolong-stored-left')).toHaveText(/^(2h|1h 5\dm)$/);
        await expect(page.locator('#break-prolong-penalty')).toHaveText('0m');

        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.eatingPenaltyMs).toBe(0);
        // used ≈ 3h (+ the few seconds elapsed), the rest stays stored
        const used = 5 * HOUR - s.storedEatingBonusMs;
        expect(used).toBeGreaterThan(3 * HOUR - MIN);
        expect(used).toBeLessThan(3 * HOUR + 5 * MIN);
        // E moved by the used amount → equals the click time (overshoot fully absorbed)
        expect(s.lastEatingWindowTargetMs).toBe(E + used);
        expect(Math.abs(s.lastEatingWindowTargetMs - s.windowStartTime)).toBeLessThan(MIN);
    });

    test('empty storage: unchanged US-7 behaviour, note hidden', async ({ page }) => {
        const now = Date.now();
        const E = now - 3 * HOUR;
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: E,
            storedFastingBonusMs: 4 * HOUR, // the other pool must stay untouched
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        await expect(page.locator('#break-prolong-stored-note')).toBeHidden();
        await expect(page.locator('#break-prolong-penalty')).toHaveText(/^6h( \dm)?$/);

        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.eatingPenaltyMs).toBeGreaterThan(6 * HOUR - MIN);
        expect(s.lastEatingWindowTargetMs).toBe(E);
        expect(s.storedFastingBonusMs).toBe(4 * HOUR);
    });

    test('before E (no overshoot): nothing is used from storage', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowStartTime: now - 2 * HOUR,
            windowEndTime: now + 14 * HOUR,
            lastEatingWindowTargetMs: now + HOUR, // explicit end before E
            storedEatingBonusMs: 3 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        await expect(page.locator('#break-prolong-stored-note')).toBeHidden();
        await expect(page.locator('#break-prolong-penalty')).toHaveText('0m');

        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.storedEatingBonusMs).toBe(3 * HOUR);
        expect(s.eatingPenaltyMs).toBe(0);
    });

    test('a second prolong measures its overshoot from the already moved E', async ({ page }) => {
        const now = Date.now();
        const E = now - 3 * HOUR;
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: E,
            storedEatingBonusMs: 5 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-prolong');

        const afterFirst = await readState(page);
        const leftAfterFirst = afterFirst.storedEatingBonusMs;
        expect(afterFirst.eatingPenaltyMs).toBe(0);

        // 30 minutes later: new overshoot is measured from the moved E (≈ first click time)
        await advanceTime(page, 30 * MIN);
        await page.click('#btn-toggle-break');
        await expect(page.locator('#break-prolong-stored-note')).toBeVisible();
        await expect(page.locator('#break-prolong-stored-used')).toHaveText(/^(30m|3[01]m|29m)$/);
        await expect(page.locator('#break-prolong-penalty')).toHaveText('0m');
        await page.click('#btn-break-prolong');

        const afterSecond = await readState(page);
        expect(afterSecond.eatingPenaltyMs).toBe(0);
        const usedSecond = leftAfterFirst - afterSecond.storedEatingBonusMs;
        expect(usedSecond).toBeGreaterThan(29 * MIN);
        expect(usedSecond).toBeLessThan(32 * MIN);
        expect(afterSecond.lastEatingWindowTargetMs).toBe(afterFirst.lastEatingWindowTargetMs + usedSecond);
    });

    test('cascade skip works on the reduced (uncovered) penalty only', async ({ page }) => {
        const now = Date.now();
        // Overshoot 5h, stored 3h → uncovered 2h → penalty 4h (no whole 8h Eating window skipped).
        // Without the cover: 10h penalty → one skip. So the fast must stay a standard 16h.
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: now - 5 * HOUR,
            storedEatingBonusMs: 3 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.windowEndTime - s.windowStartTime).toBe(DURATION_FASTING_MS);
        expect(s.eatingPenaltyMs).toBeGreaterThan(4 * HOUR - MIN);
        expect(s.eatingPenaltyMs).toBeLessThan(4 * HOUR + 5 * MIN);
    });

    test('partial cover of a huge overshoot still cascade-skips on the uncovered rest', async ({ page }) => {
        const now = Date.now();
        // Overshoot 7h, stored 1h → uncovered 6h → penalty 12h → one 8h skip (+16h), 4h remainder
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: now - 7 * HOUR,
            storedEatingBonusMs: HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.windowEndTime - s.windowStartTime).toBe(2 * DURATION_FASTING_MS);
        expect(s.eatingPenaltyMs).toBeGreaterThan(4 * HOUR - MIN);
        expect(s.eatingPenaltyMs).toBeLessThan(4 * HOUR + 5 * MIN);
    });

    test('reservations and the other storage pool stay untouched', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: now - 3 * HOUR,
            storedEatingBonusMs: 2 * HOUR,
            pendingEatingBonusUseMs: 90 * MIN,
            storedFastingBonusMs: 4 * HOUR,
            pendingFastingBonusUseMs: HOUR,
            eatingBonusMs: 5 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-prolong');

        const s = await readState(page);
        expect(s.storedEatingBonusMs).toBe(0);
        expect(s.pendingEatingBonusUseMs).toBe(90 * MIN);
        expect(s.storedFastingBonusMs).toBe(4 * HOUR);
        expect(s.pendingFastingBonusUseMs).toBe(HOUR);
        // US-7: the banked Eating bonus is still discarded past E
        expect(s.eatingBonusMs).toBe(0);
    });

    test('no notice after the dialog path (the dialog already informed the user)', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            lastEatingWindowTargetMs: now - 3 * HOUR,
            storedEatingBonusMs: 2 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-prolong');

        await expect(page.locator('#stored-cover-notice')).toBeHidden();
    });
});

// ---------------------------------------------------------------------------
// Option 2: Premature Start (remaining fast = 6h)
// ---------------------------------------------------------------------------

test.describe('US-24 Premature Start covered by stored Fasting bonus', () => {
    test('stored 3h < remaining 6h: 3h covered, 3h charged x2 = 6h; interval reflects it', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowEndTime: now + 6 * HOUR,
            storedFastingBonusMs: 3 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        await expect(page.locator('#break-premature-stored-note')).toBeVisible();
        await expect(page.locator('#break-premature-stored-used')).toHaveText('3h');
        await expect(page.locator('#break-premature-stored-left')).toHaveText('0m');
        await expect(page.locator('#break-premature-penalty')).toHaveText(/^(6h|5h 5\dm)$/);

        await page.click('#btn-break-premature');

        const s = await readState(page);
        expect(s.storedFastingBonusMs).toBe(0);
        expect(s.fastingPenaltyMs).toBeGreaterThan(6 * HOUR - 5 * MIN);
        expect(s.fastingPenaltyMs).toBeLessThan(6 * HOUR + MIN);
        expect(s.currentState).toBe('eating');
        expect(s.windowEndTime - s.windowStartTime).toBe(DURATION_EATING_MS);
    });

    test('dialog next-fast interval end reflects the reduced penalty', async ({ page }) => {
        const now = Date.now();
        // Remaining 6h. Without cover: penalty 12h. With 8h stored: penalty 0.
        await setAppState(page, makeFastingState({
            windowEndTime: now + 6 * HOUR,
            storedFastingBonusMs: 8 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await expect(page.locator('#break-premature-penalty')).toHaveText('0m');

        // Compare with the empty-storage variant: its fast must end 12h later in the preview
        const intervalFull = await page.evaluate(() => {
            // end of the predicted next fast = (now + 8h eating) + 16h + penalty
            return appState.windowEndTime;
        });
        expect(intervalFull).toBeGreaterThan(0);
        await expect(page.locator('#break-premature-interval')).not.toHaveText('--:-- to --:--');
    });

    test('stored 8h > remaining 6h: fully covered, no penalty, 2h stay in storage', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowEndTime: now + 6 * HOUR,
            storedFastingBonusMs: 8 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        await expect(page.locator('#break-premature-stored-note')).toBeVisible();
        await expect(page.locator('#break-premature-stored-left')).toHaveText(/^(2h|2h [0-4]m)$/);

        await page.click('#btn-break-premature');

        const s = await readState(page);
        expect(s.fastingPenaltyMs).toBe(0);
        const used = 8 * HOUR - s.storedFastingBonusMs;
        expect(used).toBeGreaterThan(6 * HOUR - 5 * MIN);
        expect(used).toBeLessThanOrEqual(6 * HOUR);
    });

    test('empty storage: unchanged US-7 behaviour (x2), note hidden, Eating pool untouched', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowEndTime: now + 6 * HOUR,
            storedEatingBonusMs: 4 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');

        await expect(page.locator('#break-premature-stored-note')).toBeHidden();

        await page.click('#btn-break-premature');

        const s = await readState(page);
        expect(s.fastingPenaltyMs).toBeGreaterThan(12 * HOUR - 5 * MIN);
        expect(s.fastingPenaltyMs).toBeLessThan(12 * HOUR + MIN);
        expect(s.storedEatingBonusMs).toBe(4 * HOUR);
    });

    test('reservation of the Fasting storage stays untouched', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowEndTime: now + 6 * HOUR,
            storedFastingBonusMs: 3 * HOUR,
            pendingFastingBonusUseMs: 2 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-premature');

        const s = await readState(page);
        expect(s.pendingFastingBonusUseMs).toBe(2 * HOUR);
        expect(s.storedFastingBonusMs).toBe(0);
    });

    test('no notice after the dialog path', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowEndTime: now + 6 * HOUR,
            storedFastingBonusMs: 3 * HOUR,
        }));
        await page.goto('/');
        await page.click('#btn-toggle-break');
        await page.click('#btn-break-premature');

        await expect(page.locator('#stored-cover-notice')).toBeHidden();
    });
});

// ---------------------------------------------------------------------------
// US-15 retrospective logs inside the active fast
// ---------------------------------------------------------------------------

test.describe('US-24 retrospective logs: automatic cover + notice', () => {
    test('retro last meal: stored Eating bonus used, notice shown with remaining penalty', async ({ page }) => {
        const now = Date.now();
        const retroTime = new Date(now - 30 * MIN);
        const E = now - 3 * HOUR;
        await setAppState(page, makeFastingState({
            windowStartTime: now - HOUR,
            windowEndTime: now + 15 * HOUR,
            lastEatingWindowTargetMs: E,
            storedEatingBonusMs: 2 * HOUR,
        }));
        await page.goto('/');

        await submitRetroLog(page, 'last', toHHMM(retroTime));

        // overshoot = retro - E ≈ 2.5h; 2h covered, ≈ 30m charged x2 ≈ 1h
        const s = await readState(page);
        expect(s.storedEatingBonusMs).toBe(0);
        expect(s.lastEatingWindowTargetMs).toBe(E + 2 * HOUR);
        expect(s.eatingPenaltyMs).toBeGreaterThan(HOUR - 3 * MIN);
        expect(s.eatingPenaltyMs).toBeLessThan(HOUR + 3 * MIN);

        const notice = page.locator('#stored-cover-notice');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('2h of stored Eating bonus used');
        await expect(notice).toContainText('penalty remains');
    });

    test('retro last meal fully covered: notice says no penalty', async ({ page }) => {
        const now = Date.now();
        const retroTime = new Date(now - 30 * MIN);
        await setAppState(page, makeFastingState({
            windowStartTime: now - HOUR,
            windowEndTime: now + 15 * HOUR,
            lastEatingWindowTargetMs: now - 3 * HOUR,
            storedEatingBonusMs: 5 * HOUR,
        }));
        await page.goto('/');

        await submitRetroLog(page, 'last', toHHMM(retroTime));

        const s = await readState(page);
        expect(s.eatingPenaltyMs).toBe(0);
        const notice = page.locator('#stored-cover-notice');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('stored Eating bonus used');
        await expect(notice).toContainText('no penalty');
    });

    test('retro first meal: stored Fasting bonus used, notice shown', async ({ page }) => {
        const now = Date.now();
        const retroTime = new Date(now - 30 * MIN);
        await setAppState(page, makeFastingState({
            windowStartTime: now - HOUR,
            windowEndTime: now + 2 * HOUR,
            storedFastingBonusMs: HOUR,
        }));
        await page.goto('/');

        await submitRetroLog(page, 'first', toHHMM(retroTime));

        // remaining = windowEnd - retro ≈ 2.5h; 1h covered, ≈ 1.5h charged x2 ≈ 3h
        const s = await readState(page);
        expect(s.currentState).toBe('eating');
        expect(s.storedFastingBonusMs).toBe(0);
        expect(s.fastingPenaltyMs).toBeGreaterThan(3 * HOUR - 3 * MIN);
        expect(s.fastingPenaltyMs).toBeLessThan(3 * HOUR + 3 * MIN);

        const notice = page.locator('#stored-cover-notice');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('1h of stored Fasting bonus used');
        await expect(notice).toContainText('penalty remains');
    });

    test('no notice when nothing was used (empty storage)', async ({ page }) => {
        const now = Date.now();
        const retroTime = new Date(now - 30 * MIN);
        await setAppState(page, makeFastingState({
            windowStartTime: now - HOUR,
            windowEndTime: now + 2 * HOUR,
        }));
        await page.goto('/');

        await submitRetroLog(page, 'first', toHHMM(retroTime));

        const s = await readState(page);
        expect(s.currentState).toBe('eating');
        expect(s.fastingPenaltyMs).toBeGreaterThan(0);
        await expect(page.locator('#stored-cover-notice')).toBeHidden();
    });

    test('no notice for a retro log outside the active fast', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowStartTime: now - HOUR,
            windowEndTime: now + 15 * HOUR,
            lastEatingWindowTargetMs: now - 90 * MIN,
            storedEatingBonusMs: 2 * HOUR,
        }));
        await page.goto('/');

        await submitRetroLog(page, 'last', toHHMM(new Date(now - 3 * HOUR)));

        const s = await readState(page);
        expect(s.storedEatingBonusMs).toBe(2 * HOUR);
        await expect(page.locator('#stored-cover-notice')).toBeHidden();
    });

    test('the notice disappears on its own after ~10 seconds', async ({ page }) => {
        const now = Date.now();
        await setAppState(page, makeFastingState({
            windowStartTime: now - HOUR,
            windowEndTime: now + 2 * HOUR,
            storedFastingBonusMs: HOUR,
        }));
        await page.goto('/');
        await submitRetroLog(page, 'first', toHHMM(new Date(now - 30 * MIN)));

        await expect(page.locator('#stored-cover-notice')).toBeVisible();
        await expect(page.locator('#stored-cover-notice')).toBeHidden({ timeout: 13000 });
    });
});
