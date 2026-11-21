// --- Logic & Transitions ---

function parseRetrospectiveTime(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date(getCurrentTime());
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

    if (candidate.getTime() > now.getTime()) {
        candidate.setDate(candidate.getDate() - 1);
    }
    return candidate.getTime();
}

// US-20: how many full standardWindowMs chunks fit in amountMs, and what's left over
function cascadeSkip(amountMs, standardWindowMs) {
    const skips = Math.floor(amountMs / standardWindowMs);
    const remainderMs = amountMs - skips * standardWindowMs;
    return { skips, remainderMs };
}

// US-24: how much of a stored bonus covers amountMs (1:1), what remains uncovered, and what is left
// in the storage. Shared by the break-fast handlers and the live previews in ui.js.
function computeStoredCover(storedMs, amountMs) {
    const baseMs = Math.max(0, amountMs);
    const usedMs = Math.min(Math.max(0, storedMs), baseMs);
    return { usedMs, uncoveredMs: baseMs - usedMs, remainingMs: Math.max(0, storedMs) - usedMs };
}

// US-20: single source of truth for the Eating window that starts at startMs, given the
// Fasting bonus that will be earned by starting then. Applies stored/banked Eating bonus,
// Eating penalty, and eager cascade-skips (each full 16h of Fasting bonus adds 8h).
// US-22: a reserved (pending) Fasting bonus joins the cascade; `extra` lets the stored-bonus
// dialog preview "what if X were used" with the very same code as the real transition.
function planEatingWindow(startMs, fastingBonusMs, extra = { eatingMs: 0, fastingMs: 0 }) {
    const { skips, remainderMs } = cascadeSkip(
        fastingBonusMs + appState.pendingFastingBonusUseMs + (extra.fastingMs || 0), DURATION_FASTING_MS);
    const endTime = startMs + DURATION_EATING_MS
        + appState.pendingEatingBonusUseMs
        + (extra.eatingMs || 0)
        + appState.eatingBonusMs
        - appState.eatingPenaltyMs
        + skips * DURATION_EATING_MS;
    return { endTime, skips, remainderMs };
}

function transitionToEating(retroTimeMs) {
    // If called via standard event listener, it passes PointerEvent. We check if it's a number.
    const timeToUse = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();

    // US-20: Fasting bonus earned from delaying the start of eating (full 1:1, no divisor)
    let bonusMs = appState.fastingBonusMs; // Keep existing if already set (e.g. re-logging)
    if (appState.currentState === STATES.POTENTIAL_EATING && appState.windowEndTime && timeToUse > appState.windowEndTime) {
        bonusMs = timeToUse - appState.windowEndTime;
    }

    // US-20: Eating bonus/penalty banked during the previous cycle, applied now
    const eatingBonusMs = appState.eatingBonusMs;
    const eatingPenaltyMs = appState.eatingPenaltyMs;

    // US-20: eagerly cascade-skip whole Fasting/Potential-Eating pairs if the
    // Fasting bonus is large enough, extending this Eating window immediately
    const plan = planEatingWindow(timeToUse, bonusMs);
    const targetEndTime = plan.endTime;
    bonusMs = plan.remainderMs;

    appState.currentState = STATES.EATING;
    appState.windowStartTime = timeToUse;

    appState.fastingBonusMs = bonusMs;
    appState.windowEndTime = targetEndTime;
    appState.lastEatingWindowTargetMs = targetEndTime; // US-7: Vital for Penalty 1
    appState.appliedEatingBonusMs = eatingBonusMs;
    appState.appliedEatingPenaltyMs = eatingPenaltyMs;
    appState.eatingBonusMs = 0; // Applied, reset for new window
    appState.eatingPenaltyMs = 0; // Applied, reset for new window
    appState.pendingEatingBonusUseMs = 0; // US-18: Reservation consumed
    appState.pendingFastingBonusUseMs = 0; // US-22: Reserved Fasting bonus consumed into the cascade
    appState.lastMealTime = null;

    // US-10: We don't add to history here, but we could if we wanted to track Potential windows.
    // US-10 only mentions Eating and Fasting windows.

    saveState();
    updateUI();
}

function logLastMeal(retroTimeMs) {
    const timeToUse = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();
    appState.lastMealTime = timeToUse;

    if (appState.currentState === STATES.FASTING) {
        appState.windowStartTime = timeToUse;
        appState.eatingBonusMs = calculateEatingBonus(); // US-20: banked for the next Eating window
        const fastingBonusMs = appState.fastingBonusMs;
        const fastingPenaltyMs = appState.fastingPenaltyMs;
        appState.windowEndTime = timeToUse + DURATION_FASTING_MS - fastingBonusMs + fastingPenaltyMs;
        appState.appliedFastingBonusMs = fastingBonusMs;
        appState.appliedFastingPenaltyMs = fastingPenaltyMs;
    } else if (appState.currentState === STATES.POTENTIAL_EATING) {
        const eatingBonus = calculateEatingBonus();
        const fastingBonusMs = appState.fastingBonusMs;
        const fastingPenaltyMs = appState.fastingPenaltyMs;
        const fastingEnd = timeToUse + DURATION_FASTING_MS - fastingBonusMs + fastingPenaltyMs;
        if (getCurrentTime() < fastingEnd) {
            appState.currentState = STATES.FASTING;
            appState.windowStartTime = timeToUse;
            // E: this Fasting window follows no Eating window of its own (it starts at the last meal), so the
            // "target end of the Eating window" is the last meal itself. Without it E stays null/stale and the
            // break-fast penalties (2 × (now − E)) explode into thousands of hours.
            appState.lastEatingWindowTargetMs = timeToUse;
            appState.eatingBonusMs = eatingBonus; // US-20: banked for the next Eating window
            appState.windowEndTime = fastingEnd;
            appState.appliedFastingBonusMs = fastingBonusMs;
            appState.appliedFastingPenaltyMs = fastingPenaltyMs;
        }
    }

    saveState();
    updateUI();
}

function calculateEatingBonus() {
    return getEatingBonusForTime(appState.lastMealTime);
}

function getEatingBonusForTime(timeMs) {
    if (timeMs && appState.lastEatingWindowTargetMs && timeMs < appState.lastEatingWindowTargetMs) {
        return appState.lastEatingWindowTargetMs - timeMs;
    }
    return 0;
}

function transitionToFasting() {
    console.log("Transitioning to FASTING...");
    const originalEatingStart = appState.windowStartTime;
    const originalEatingTargetEnd = appState.lastEatingWindowTargetMs;
    const appliedEatingBonusMs = appState.appliedEatingBonusMs;
    const appliedEatingPenaltyMs = appState.appliedEatingPenaltyMs;

    appState.currentState = STATES.FASTING;
    const baseStartTime = appState.lastMealTime ? appState.lastMealTime : appState.windowEndTime;
    appState.windowStartTime = baseStartTime;

    // US-20: Eating bonus from finishing early is banked for the next Eating window
    appState.eatingBonusMs = calculateEatingBonus();

    // US-20: Apply whatever Fasting bonus/penalty is pending. The live fields are
    // NOT cleared here - they stay "untouched" until this window is actually lived
    // through (transitionToPotential) or abandoned (startEatingPrematurely), so a
    // retroactive prolong() landing inside this window can still reuse them.
    const fastingBonusMs = appState.fastingBonusMs + appState.pendingFastingBonusUseMs;
    const fastingPenaltyMs = appState.fastingPenaltyMs;
    appState.windowEndTime = baseStartTime + DURATION_FASTING_MS - fastingBonusMs + fastingPenaltyMs;
    appState.appliedFastingBonusMs = fastingBonusMs;
    appState.appliedFastingPenaltyMs = fastingPenaltyMs;
    appState.pendingFastingBonusUseMs = 0; // US-18: Reservation consumed

    // US-10: Record the Eating window that just finished, with what was applied to IT
    addToHistory(STATES.EATING, originalEatingStart, originalEatingTargetEnd, {
        eatingBonusMs: appliedEatingBonusMs,
        eatingPenaltyMs: appliedEatingPenaltyMs,
    });

    saveState();
    updateUI();
}

// US-21: lowest time the user may pick as "last meal" when explicitly ending the Eating window —
// never earlier than an already logged last meal (or the window start if none is logged)
function getExplicitEndMinMs() {
    return appState.lastMealTime ? appState.lastMealTime : appState.windowStartTime;
}

// US-21: explicitly end the running Eating window as if the last meal had been at timeMs.
// Reuses the normal Eating→Fasting transition: Fasting starts at timeMs, Eating bonus = E − timeMs,
// history records the Eating window with its original end E. Returns false if timeMs is not allowed.
// The caller is responsible for tick() (fast-forward if the Fasting window is already over).
function endEatingWindowExplicitly(timeMs) {
    if (appState.currentState !== STATES.EATING) return false;
    if (typeof timeMs !== 'number' || timeMs < getExplicitEndMinMs() || timeMs > getCurrentTime()) return false;

    // E = the window's current end (also covers manual sessions, which don't set the target)
    appState.lastEatingWindowTargetMs = appState.windowEndTime;
    appState.lastMealTime = timeMs;
    transitionToFasting();
    return true;
}

// US-21: a Fasting window that was started by explicitly ending Eating early is still "before E";
// a naturally started Fasting window always begins at or after E.
function isExplicitlyEndedFast() {
    return appState.currentState === STATES.FASTING &&
        appState.lastEatingWindowTargetMs != null &&
        getCurrentTime() < appState.lastEatingWindowTargetMs;
}

function transitionToPotential() {
    appState.currentState = STATES.POTENTIAL_EATING;
    appState.lastMealTime = null;

    const appliedFastingBonusMs = appState.appliedFastingBonusMs;
    const appliedFastingPenaltyMs = appState.appliedFastingPenaltyMs;
    const fastingWindowStart = appState.windowStartTime;
    const fastingWindowEnd = appState.windowEndTime;

    // US-20: This Fasting window was actually lived through to completion, so
    // whatever Fasting bonus/penalty it carried is now fully spent.
    appState.fastingBonusMs = 0;
    appState.fastingPenaltyMs = 0;
    appState.appliedFastingBonusMs = 0;
    appState.appliedFastingPenaltyMs = 0;

    // US-10: Record the Fasting window that just finished, with what was applied to IT
    addToHistory(STATES.FASTING, fastingWindowStart, fastingWindowEnd, {
        fastingBonusMs: appliedFastingBonusMs,
        fastingPenaltyMs: appliedFastingPenaltyMs,
    });

    saveState();
    updateUI();
}

function submitMealLog() {
    const timeVal = elMealTimeInput.value;
    const mealTime = parseRetrospectiveTime(timeVal);
    if (!mealTime) return;

    const type = elMealTypeSelect.value;
    // US-15: retrospective entries landing inside the active Fasting window
    // retroactively confess breaking that fast — apply US-7 consequences instead.
    const isInsideActiveFast = appState.currentState === STATES.FASTING &&
        mealTime >= appState.windowStartTime && mealTime <= appState.windowEndTime;

    if (isInsideActiveFast) {
        // US-24: no dialog here, so the automatic use of the stored bonus is reported by a notice
        if (type === 'first') {
            showStoredCoverNotice('Fasting', startEatingPrematurely(mealTime));
        } else {
            showStoredCoverNotice('Eating', prolongEatingAndStartFast(mealTime));
        }
    } else if (type === 'first') {
        transitionToEating(mealTime);
    } else {
        logLastMeal(mealTime);
    }

    elMealTimeInput.value = "";
    toggleRetroLog(false); // US-6: Auto-collapse after submit
    tick(); // Fast-forward state if needed
}

// US-24: transient notice after a retrospective log used part of a stored bonus
let storedCoverNoticeTimer = null;
function showStoredCoverNotice(kind, result) {
    if (!elStoredCoverNotice || !result || result.usedMs <= 0) return;
    const penaltyText = result.penaltyMs > 0
        ? `${formatMinutesBadge(Math.floor(result.penaltyMs / 60000))} ${kind} penalty remains`
        : 'no penalty';
    elStoredCoverNotice.textContent = `${formatMinutesBadge(Math.floor(result.usedMs / 60000))} of stored ${kind} bonus used; ${penaltyText}.`;
    elStoredCoverNotice.classList.remove('hidden');
    clearTimeout(storedCoverNoticeTimer);
    storedCoverNoticeTimer = setTimeout(() => elStoredCoverNotice.classList.add('hidden'), 10000);
}

function toggleRetroLog(forceValue) {
    const isExpanding = typeof forceValue === 'boolean' ? forceValue : elRetroLogContent.classList.contains('collapsed');

    if (isExpanding) {
        // Close others
        toggleHistory(false);
        toggleManualControl(false);

        elRetroLogContent.classList.remove('collapsed');
        elBtnToggleRetro.classList.add('active');
        elBtnToggleRetro.querySelector('.btn-text').textContent = "Close Retrospective Log";
    } else {
        elRetroLogContent.classList.add('collapsed');
        elBtnToggleRetro.classList.remove('active');
        elBtnToggleRetro.querySelector('.btn-text').textContent = "Add Retrospective Log";
    }
}

function toggleHistory(forceValue) {
    const isExpanding = typeof forceValue === 'boolean' ? forceValue : elHistoryContent.classList.contains('collapsed');

    if (isExpanding) {
        // Close others
        toggleRetroLog(false);
        toggleManualControl(false);

        elHistoryContent.classList.remove('collapsed');
        elBtnToggleHistory.classList.add('active');
        elBtnToggleHistory.querySelector('.btn-text').textContent = "Close Windows History";
        renderHistory();
    } else {
        elHistoryContent.classList.add('collapsed');
        elBtnToggleHistory.classList.remove('active');
        elBtnToggleHistory.querySelector('.btn-text').textContent = "View Windows History";
    }
}

function toggleBreakFastLog(forceValue) {
    const isExpanded = typeof forceValue === 'boolean' ? forceValue : elBreakFastContent.classList.contains('collapsed');

    if (isExpanded) {
        elBreakFastContent.classList.remove('collapsed');
        elBtnToggleBreak.classList.add('active');
        elBtnToggleBreak.querySelector('.btn-text').textContent = "Close Break Options";
    } else {
        elBreakFastContent.classList.add('collapsed');
        elBtnToggleBreak.classList.remove('active');
        elBtnToggleBreak.querySelector('.btn-text').textContent = "Break Fast Prematurely";
    }
}

function startEatingPrematurely(retroTimeMs) {
    const now = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();
    const originalEnd = appState.windowEndTime;
    const originalStartTime = appState.windowStartTime;
    const originalAppliedFastingBonusMs = appState.appliedFastingBonusMs;
    const originalAppliedFastingPenaltyMs = appState.appliedFastingPenaltyMs;

    // US-24: the stored Fasting bonus covers the remaining fast time 1:1 before any penalty is charged
    const cover = computeStoredCover(appState.storedFastingBonusMs, originalEnd - now);
    appState.storedFastingBonusMs -= cover.usedMs;

    // Option 2 (Penalty 2): set based on the uncovered remaining fast time, deferred to the next Fasting window
    appState.fastingPenaltyMs = PREMATURE_START_PENALTY_MULTIPLIER * cover.uncoveredMs;

    // US-7/US-20: Clear Option 1's deferred Eating penalty when starting a new Eating window this way
    appState.eatingPenaltyMs = 0;
    appState.appliedEatingPenaltyMs = 0;
    appState.appliedEatingBonusMs = 0;

    // US-20: This Fasting window is abandoned here (cut short), so whatever
    // Fasting bonus/penalty it carried is now fully spent.
    appState.fastingBonusMs = 0;
    appState.appliedFastingBonusMs = 0;
    appState.appliedFastingPenaltyMs = 0;

    // Transition to 100% standard eating window (no rewards/penalties here)
    appState.currentState = STATES.EATING;
    appState.windowStartTime = now;
    const targetEatingEnd = now + DURATION_EATING_MS;
    appState.windowEndTime = targetEatingEnd;
    appState.lastEatingWindowTargetMs = targetEatingEnd;
    appState.eatingBonusMs = 0;
    appState.lastMealTime = null;

    // US-10: Record the Fasting window that was cut short, with what was actually applied to IT
    addToHistory(STATES.FASTING, originalStartTime, originalEnd, {
        fastingBonusMs: originalAppliedFastingBonusMs,
        fastingPenaltyMs: originalAppliedFastingPenaltyMs,
    });

    toggleBreakFastLog(false);
    saveState();
    updateUI();
    return { usedMs: cover.usedMs, penaltyMs: appState.fastingPenaltyMs, remainingStoredMs: cover.remainingMs };
}

function prolongEatingAndStartFast(retroTimeMs) {
    const now = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();
    const originalTargetEnd = appState.lastEatingWindowTargetMs ?? appState.windowStartTime; // null-safe: no E → no overshoot

    // US-24: the stored Eating bonus covers the overshoot 1:1; the Eating window end E moves by the used amount
    const cover = computeStoredCover(appState.storedEatingBonusMs, now - originalTargetEnd);
    appState.storedEatingBonusMs -= cover.usedMs;
    if (cover.usedMs > 0) appState.lastEatingWindowTargetMs = originalTargetEnd + cover.usedMs;

    // Option 1 (Penalty 1): the uncovered overshoot past the Eating window's target end,
    // deferred to the next Eating window (US-20: no longer applied immediately here)
    appState.eatingPenaltyMs = PROLONGING_PENALTY_MULTIPLIER * cover.uncoveredMs;

    // Restart Fast from now. Past E the previously banked Eating bonus is discarded;
    // US-21: before E the bonus is simply recalculated for the new "last meal" time (E − now).
    appState.currentState = STATES.FASTING;
    appState.windowStartTime = now;
    appState.eatingBonusMs = getEatingBonusForTime(now);

    // US-20: this restarted window never actually completed (we're correcting it
    // before it did), so any Fasting bonus/penalty already applied to it is still
    // "untouched" and simply gets re-applied to the new end time.
    const fastingBonusMs = appState.fastingBonusMs;
    const fastingPenaltyMs = appState.fastingPenaltyMs;
    let targetEnd = now + DURATION_FASTING_MS - fastingBonusMs + fastingPenaltyMs;
    appState.appliedFastingBonusMs = fastingBonusMs;
    appState.appliedFastingPenaltyMs = fastingPenaltyMs;

    // US-20: eagerly cascade-skip whole Eating windows if the new Eating penalty
    // is large enough, extending this restarted Fasting window immediately
    const { skips, remainderMs } = cascadeSkip(appState.eatingPenaltyMs, DURATION_EATING_MS);
    targetEnd += skips * DURATION_FASTING_MS;
    appState.eatingPenaltyMs = remainderMs;

    appState.windowEndTime = targetEnd;

    toggleBreakFastLog(false);
    saveState();
    updateUI();
    return { usedMs: cover.usedMs, penaltyMs: PROLONGING_PENALTY_MULTIPLIER * cover.uncoveredMs, remainingStoredMs: cover.remainingMs };
}
