// US-22: stored bonus store/use rework — consequences shown in the dialog, worked examples
// from user-stories.md, the Fasting-reservation cascade, and interplay with US-7/US-21.
// The wall clock is pinned (page.clock.setFixedTime) so "now"-dependent previews are exact.
const { test, expect } = require('@playwright/test');
const {
    makeState,
    setAppState,
    advanceTime,
} = require('./helpers');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Local clock time on a fixed scenario day (day 10; hours >= 24 roll into the next day)
const at = (hour, minute = 0, day = 10) => new Date(2026, 5, day, hour, minute, 0, 0).getTime();

async function pinClock(page, nowMs) {
    await page.clock.setFixedTime(new Date(nowMs));
}

async function rt(page, ms) {
    return page.evaluate((m) => renderTime(m), ms);
}

const div = (html) => `<div>${html}</div>`;

// Opens a dialog with the app's own functions and moves the slider to `mins`
async function openPicker(page, mode, type, mins) {
    await page.evaluate(([m, t, x]) => { openAmountPicker(m, t); adjustAmountPicker(x); }, [mode, type, mins]);
}

async function previewHtml(page) {
    return page.locator('#amount-picker-preview').innerHTML();
}

async function readState(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('fastingTrackerState')));
}

async function expectPreview(page, lines) {
    expect(await previewHtml(page)).toBe(lines.map(div).join(''));
}

// --- Worked examples from user-stories.md ---

test('US-22 example: Eating 8–16, at 12:00 store 2h → ends 14:00, storage 2h, max further 2h', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'eating',
        windowStartTime: at(8),
        windowEndTime: at(16),
        lastEatingWindowTargetMs: at(16),
    }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-overlay')).toBeVisible();
    await openPicker(page, 'store', 'eating', 120);
    await expectPreview(page, [`New end time: ${await rt(page, at(14))}`, 'Stored after: 2h']);

    await page.locator('#amount-picker-confirm').click();
    const s = await readState(page);
    expect(s.windowEndTime).toBe(at(14));
    expect(s.lastEatingWindowTargetMs).toBe(at(14));
    expect(s.storedEatingBonusMs).toBe(2 * HOUR);

    // Only the remaining 2h can still be stored
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-slider')).toHaveAttribute('max', '120');
});

test('US-22 example: Fasting 18–10, at 20:00 store 3h → ends 13:00; then use 2h Eating → next Eating 10h ending 23:00', async ({ page }) => {
    await pinClock(page, at(20, 0, 9));
    await setAppState(page, makeState({
        currentState: 'fasting',
        windowStartTime: at(18, 0, 9),
        windowEndTime: at(10),
        lastEatingWindowTargetMs: at(18, 0, 9),
        storedEatingBonusMs: 2 * HOUR,
    }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await openPicker(page, 'store', 'fasting', 180);
    await expectPreview(page, [`New end time: ${await rt(page, at(13))}`, 'Stored after: 3h']);
    await page.locator('#amount-picker-confirm').click();

    let s = await readState(page);
    expect(s.windowEndTime).toBe(at(13));
    expect(s.storedFastingBonusMs).toBe(3 * HOUR);

    await openPicker(page, 'use', 'eating', 120);
    await expectPreview(page, [
        'Next Eating window: 10h',
        `Ends at ${await rt(page, at(23))} if started when this Fasting window ends (${await rt(page, at(13))})`,
        'Stored after: 0m',
    ]);
    await page.locator('#amount-picker-confirm').click();

    s = await readState(page);
    expect(s.storedEatingBonusMs).toBe(0);
    expect(s.pendingEatingBonusUseMs).toBe(2 * HOUR);
    expect(s.windowEndTime).toBe(at(13)); // reserved, the Fasting window itself is untouched
});

test('US-22 example: use 3h Fasting in Eating 8–16 at 12:00 → next Fasting 13h, both start/end variants', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'eating',
        windowStartTime: at(8),
        windowEndTime: at(16),
        lastEatingWindowTargetMs: at(16),
        storedFastingBonusMs: 3 * HOUR,
    }));
    await page.goto('/');

    await openPicker(page, 'use', 'fasting', 180);
    await expectPreview(page, [
        'Next Fasting window: 13h',
        `After the Eating window: ${await rt(page, at(16))} to ${await rt(page, at(29))}`,
        `If you log your last meal now: ${await rt(page, at(12))} to ${await rt(page, at(25))}`,
        'Stored after: 0m',
    ]);
});

test('US-22 example: use 3h Fasting in Potential at 10:00 → 13h Fasting, Eating 10:00–18:00 if started now', async ({ page }) => {
    await pinClock(page, at(10));
    await setAppState(page, makeState({
        currentState: 'potential',
        windowStartTime: at(10) - 16 * HOUR,
        windowEndTime: at(10),
        storedFastingBonusMs: 3 * HOUR,
    }));
    await page.goto('/');

    await openPicker(page, 'use', 'fasting', 180);
    await expectPreview(page, [
        'Next Fasting window: 13h',
        `Eating window if you start eating now: ${await rt(page, at(10))} to ${await rt(page, at(18))}`,
        'Stored after: 0m',
    ]);
});

// --- The six "use" previews (window × bonus kind), now = 12:00 ---

test.describe('US-22 use previews, all window × kind combinations', () => {
    test('Eating bonus in EATING → new end time', async ({ page }) => {
        await pinClock(page, at(12));
        await setAppState(page, makeState({
            currentState: 'eating', windowStartTime: at(8), windowEndTime: at(16),
            lastEatingWindowTargetMs: at(16), storedEatingBonusMs: HOUR,
        }));
        await page.goto('/');
        await openPicker(page, 'use', 'eating', 60);
        await expectPreview(page, [`New end time: ${await rt(page, at(17))}`, 'Stored after: 0m']);
    });

    test('Eating bonus in POTENTIAL → Eating window length + end if started now (incl. elapsed Fasting bonus)', async ({ page }) => {
        await pinClock(page, at(12));
        await setAppState(page, makeState({
            currentState: 'potential', windowStartTime: at(10) - 16 * HOUR, windowEndTime: at(10),
            storedEatingBonusMs: 90 * MIN,
        }));
        await page.goto('/');
        await openPicker(page, 'use', 'eating', 60);
        await expectPreview(page, [
            'Eating window: 9h',
            `Ends at ${await rt(page, at(21))} if you start eating now`,
            'Stored after: 30m',
        ]);
    });

    test('Eating bonus in FASTING → next Eating window and its end if started when the fast ends', async ({ page }) => {
        await pinClock(page, at(12));
        await setAppState(page, makeState({
            currentState: 'fasting', windowStartTime: at(8), windowEndTime: at(24),
            lastEatingWindowTargetMs: at(8), storedEatingBonusMs: HOUR,
        }));
        await page.goto('/');
        await openPicker(page, 'use', 'eating', 60);
        await expectPreview(page, [
            'Next Eating window: 9h',
            `Ends at ${await rt(page, at(33))} if started when this Fasting window ends (${await rt(page, at(24))})`,
            'Stored after: 0m',
        ]);
    });

    test('Fasting bonus in EATING → next Fasting length, after Eating end and if last meal is logged now', async ({ page }) => {
        await pinClock(page, at(12));
        await setAppState(page, makeState({
            currentState: 'eating', windowStartTime: at(8), windowEndTime: at(16),
            lastEatingWindowTargetMs: at(16), storedFastingBonusMs: 2 * HOUR,
            fastingBonusMs: HOUR, fastingPenaltyMs: 30 * MIN,
        }));
        await page.goto('/');
        await openPicker(page, 'use', 'fasting', 60);
        // 16h − (1h bonus + 1h used) + 30m penalty = 14h 30m
        await expectPreview(page, [
            'Next Fasting window: 14h 30m',
            `After the Eating window: ${await rt(page, at(16))} to ${await rt(page, at(16) + 14.5 * HOUR)}`,
            `If you log your last meal now: ${await rt(page, at(12))} to ${await rt(page, at(12) + 14.5 * HOUR)}`,
            'Stored after: 1h',
        ]);
    });

    test('Fasting bonus in POTENTIAL → next Fasting length + Eating window if started now', async ({ page }) => {
        await pinClock(page, at(12));
        await setAppState(page, makeState({
            currentState: 'potential', windowStartTime: at(10) - 16 * HOUR, windowEndTime: at(10),
            storedFastingBonusMs: HOUR,
        }));
        await page.goto('/');
        await openPicker(page, 'use', 'fasting', 60);
        // 2h elapsed + 1h used = 3h bonus → Fasting 13h, Eating 8h
        await expectPreview(page, [
            'Next Fasting window: 13h',
            `Eating window if you start eating now: ${await rt(page, at(12))} to ${await rt(page, at(20))}`,
            'Stored after: 0m',
        ]);
    });

    test('Fasting bonus in FASTING → new end time', async ({ page }) => {
        await pinClock(page, at(12));
        await setAppState(page, makeState({
            currentState: 'fasting', windowStartTime: at(8), windowEndTime: at(24),
            lastEatingWindowTargetMs: at(8), storedFastingBonusMs: HOUR,
        }));
        await page.goto('/');
        await openPicker(page, 'use', 'fasting', 60);
        await expectPreview(page, [`New end time: ${await rt(page, at(23))}`, 'Stored after: 0m']);
    });
});

// --- Cascade of a reserved Fasting bonus ---

test('US-22 cascade: 20h reserved Fasting bonus → Eating window 16h, 4h left as ordinary Fasting bonus, reservation consumed', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'potential',
        windowStartTime: at(12) - 16 * HOUR,
        windowEndTime: at(12),
        pendingFastingBonusUseMs: 20 * HOUR,
    }));
    await page.goto('/');

    // The Potential forecast already includes the cascade (16h Eating window from now)
    await expect(page.locator('#forecast-eating-end')).toHaveText(
        await page.evaluate((ms) => { const d = document.createElement('div'); d.innerHTML = renderTime(ms); return d.textContent; }, at(28)));

    await page.evaluate(() => transitionToEating());
    const s = await page.evaluate(() => ({
        len: appState.windowEndTime - appState.windowStartTime,
        fastingBonusMs: appState.fastingBonusMs,
        pending: appState.pendingFastingBonusUseMs,
        state: appState.currentState,
    }));
    expect(s.state).toBe('eating');
    expect(s.len).toBe(16 * HOUR);
    expect(s.fastingBonusMs).toBe(4 * HOUR);
    expect(s.pending).toBe(0);
});

test('US-22 cascade: reserving Fasting bonus in a Fasting window joins the cascade at the next Eating start', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'fasting', windowStartTime: at(8), windowEndTime: at(24),
        lastEatingWindowTargetMs: at(8), pendingFastingBonusUseMs: 17 * HOUR, eatingBonusMs: 0,
    }));
    await page.goto('/');
    await advanceTime(page, 12 * HOUR + MIN); // Fasting is over → Potential
    expect(await page.evaluate(() => appState.currentState)).toBe('potential');
    expect(await page.evaluate(() => appState.pendingFastingBonusUseMs)).toBe(17 * HOUR); // not lost on the way

    await page.evaluate(() => transitionToEating());
    const s = await page.evaluate(() => ({
        len: appState.windowEndTime - appState.windowStartTime,
        fastingBonusMs: appState.fastingBonusMs,
    }));
    // 1m elapsed Fasting bonus + 17h = 17h 1m → one skip (+8h), 1h 1m remains
    expect(s.len).toBe(16 * HOUR);
    expect(s.fastingBonusMs).toBe(HOUR + MIN);
});

test('US-22: a Fasting reservation made in EATING is capped so the next Fasting window cannot go negative', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'eating', windowStartTime: at(8), windowEndTime: at(16),
        lastEatingWindowTargetMs: at(16),
        fastingBonusMs: 2 * HOUR, pendingFastingBonusUseMs: HOUR, storedFastingBonusMs: 20 * HOUR,
    }));
    await page.goto('/');
    await page.evaluate(() => openAmountPicker('use', 'fasting'));
    // 16h − 2h bonus − 1h already reserved = 13h = 780 min
    await expect(page.locator('#amount-picker-slider')).toHaveAttribute('max', '780');
});

// --- Re-store / cancel / break-fast / explicit end / Potential ---

test('US-22: Eating time reserved in Fasting is applied in the next Eating window and can be stored again', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'fasting', windowStartTime: at(8), windowEndTime: at(24),
        lastEatingWindowTargetMs: at(8), storedEatingBonusMs: 2 * HOUR,
    }));
    await page.goto('/');

    await openPicker(page, 'use', 'eating', 120);
    await page.locator('#amount-picker-confirm').click();
    let s = await readState(page);
    expect(s.pendingEatingBonusUseMs).toBe(2 * HOUR);
    expect(s.storedEatingBonusMs).toBe(0);

    await advanceTime(page, 12 * HOUR); // Fasting ends → Potential, elapsed 0
    await page.evaluate(() => transitionToEating());
    s = await page.evaluate(() => ({
        len: appState.windowEndTime - appState.windowStartTime,
        pending: appState.pendingEatingBonusUseMs,
        stored: appState.storedEatingBonusMs,
    }));
    expect(s.len).toBe(10 * HOUR);
    expect(s.pending).toBe(0);
    expect(s.stored).toBe(0);

    // Now truly in that Eating window → the time can be stored again from the end-time tap
    await page.locator('#end-time-block').click();
    await openPicker(page, 'store', 'eating', 120);
    await page.locator('#amount-picker-confirm').click();
    s = await page.evaluate(() => ({
        len: appState.windowEndTime - appState.windowStartTime,
        stored: appState.storedEatingBonusMs,
    }));
    expect(s.len).toBe(8 * HOUR);
    expect(s.stored).toBe(2 * HOUR);
});

test('US-22: a reservation cannot be cancelled — storage does not regain it and there is no UI path back', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'fasting', windowStartTime: at(8), windowEndTime: at(24),
        lastEatingWindowTargetMs: at(8), storedEatingBonusMs: HOUR,
    }));
    await page.goto('/');
    await openPicker(page, 'use', 'eating', 60);
    await page.locator('#amount-picker-confirm').click();

    await expect(page.locator('#stored-eating-bonus-indicator')).toBeHidden();
    await expect(page.locator('#eating-bonus-badge')).toBeHidden(); // badges are informational only
    // The end-time tap in Fasting is a Fasting store, never an Eating one
    await page.locator('#end-time-block').click();
    await expect(page.locator('#amount-picker-title')).toContainText('Fasting');
    const s = await readState(page);
    expect(s.storedEatingBonusMs).toBe(0);
    expect(s.pendingEatingBonusUseMs).toBe(HOUR);
});

test('US-22: Break Fast → Prolong leaves stored time untouched and restarts a standard Fasting window', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'fasting', windowStartTime: at(8), windowEndTime: at(24),
        lastEatingWindowTargetMs: at(12), // Eating ended exactly now → no overshoot penalty
        storedFastingBonusMs: 3 * HOUR, storedEatingBonusMs: 2 * HOUR,
    }));
    await page.goto('/');
    await page.evaluate(() => prolongEatingAndStartFast(getCurrentTime()));
    const s = await page.evaluate(() => ({
        state: appState.currentState,
        end: appState.windowEndTime,
        sf: appState.storedFastingBonusMs,
        se: appState.storedEatingBonusMs,
    }));
    expect(s.state).toBe('fasting');
    expect(s.end).toBe(at(12) + 16 * HOUR);
    expect(s.sf).toBe(3 * HOUR);
    expect(s.se).toBe(2 * HOUR);
});

test('US-22: no store in POTENTIAL — end-time block hidden, nothing opens', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'potential', windowStartTime: at(12) - 16 * HOUR, windowEndTime: at(12),
        storedFastingBonusMs: HOUR, storedEatingBonusMs: HOUR,
    }));
    await page.goto('/');
    await expect(page.locator('#end-time-block')).toBeHidden();
    await page.evaluate(() => openStoreForCurrentWindow());
    await expect(page.locator('#amount-picker-overlay')).toBeHidden();
});

test('US-21 + US-22: explicit end after storing Eating time — bonus counts from the moved end, history records it', async ({ page }) => {
    await pinClock(page, at(12));
    await setAppState(page, makeState({
        currentState: 'eating', windowStartTime: at(8), windowEndTime: at(16),
        lastEatingWindowTargetMs: at(16),
    }));
    await page.goto('/');

    await page.locator('#end-time-block').click();
    await openPicker(page, 'store', 'eating', 120); // end → 14:00
    await page.locator('#amount-picker-confirm').click();

    await page.evaluate(() => endEatingNow());
    const s = await page.evaluate(() => ({
        state: appState.currentState,
        eatingBonusMs: appState.eatingBonusMs, // E (14:00) − 12:00
        stored: appState.storedEatingBonusMs,
        rec: appState.history[0],
    }));
    expect(s.state).toBe('fasting');
    expect(s.eatingBonusMs).toBe(2 * HOUR);
    expect(s.stored).toBe(2 * HOUR);
    expect(s.rec.type).toBe('eating');
    expect(s.rec.endTime).toBe(at(14));
});
