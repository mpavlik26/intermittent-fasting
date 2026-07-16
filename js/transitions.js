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

function transitionToEating(retroTimeMs) {
    // If called via standard event listener, it passes PointerEvent. We check if it's a number.
    const timeToUse = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();

    // US-3: Calculate bonus if fasting continued into potential eating window
    let bonusMs = appState.fastingBonusMs; // Keep existing if already set (e.g. re-logging)
    if (appState.currentState === STATES.POTENTIAL_EATING && appState.windowEndTime && timeToUse > appState.windowEndTime) {
        bonusMs = Math.floor((timeToUse - appState.windowEndTime) / BONUS_DIVISOR);
    }

    // US-18: Consume any stored-bonus minutes reserved while in Potential Eating
    const pendingUseMs = appState.pendingUseMs;

    appState.currentState = STATES.EATING;
    appState.windowStartTime = timeToUse;
    appState.fastingBonusMs = bonusMs;
    const targetEndTime = timeToUse + DURATION_EATING_MS + bonusMs + pendingUseMs;
    appState.windowEndTime = targetEndTime;
    appState.lastEatingWindowTargetMs = targetEndTime; // US-7: Vital for Penalty 1
    appState.eatingBonusMs = 0; // Reset for new window
    appState.pendingUseMs = 0; // US-18: Reservation consumed
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
        appState.eatingBonusMs = calculateEatingBonus();
        const penalty = appState.prolongingPenaltyMs + appState.prematureStartPenaltyMs;
        appState.windowEndTime = timeToUse + DURATION_FASTING_MS - appState.eatingBonusMs + penalty;
        appState.appliedPenaltyMs = penalty;
    } else if (appState.currentState === STATES.POTENTIAL_EATING) {
        const eatingBonus = calculateEatingBonus();
        const penalty = appState.prolongingPenaltyMs + appState.prematureStartPenaltyMs;
        const fastingEnd = timeToUse + DURATION_FASTING_MS - eatingBonus + penalty;
        if (getCurrentTime() < fastingEnd) {
            appState.currentState = STATES.FASTING;
            appState.windowStartTime = timeToUse;
            appState.eatingBonusMs = eatingBonus;
            appState.windowEndTime = fastingEnd;
            appState.appliedPenaltyMs = penalty;
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
        return Math.floor((appState.lastEatingWindowTargetMs - timeMs) / BONUS_DIVISOR);
    }
    return 0;
}

function transitionToFasting() {
    console.log("Transitioning to FASTING...");
    const now = getCurrentTime();
    const originalEatingStart = appState.windowStartTime;
    const originalEatingTargetEnd = appState.lastEatingWindowTargetMs;

    appState.currentState = STATES.FASTING;
    const baseStartTime = appState.lastMealTime ? appState.lastMealTime : appState.windowEndTime;
    appState.windowStartTime = baseStartTime;

    // US-4 & US-7: Base duration + Penalty - Bonus
    appState.eatingBonusMs = calculateEatingBonus();
    const totalPenalty = appState.prolongingPenaltyMs + appState.prematureStartPenaltyMs;
    appState.windowEndTime = baseStartTime + DURATION_FASTING_MS - appState.eatingBonusMs + totalPenalty;
    appState.appliedPenaltyMs = totalPenalty;

    // US-10: Record the Eating window that just finished
    // US-10 refined: End time is target end time. Bonus shown is what was APPLIED to this window (fastingBonusMs).
    addToHistory(STATES.EATING, originalEatingStart, originalEatingTargetEnd, appState.fastingBonusMs, 0);

    appState.fastingBonusMs = 0; // Reset for new cycle
    saveState();
    updateUI();
}

function transitionToPotential() {
    appState.currentState = STATES.POTENTIAL_EATING;
    appState.lastMealTime = null;

    const totalPenaltyAtEnd = appState.appliedPenaltyMs;
    const eatingBonusAtEnd = appState.eatingBonusMs;
    const fastingWindowStart = appState.windowStartTime;
    const fastingWindowEnd = appState.windowEndTime;

    appState.prolongingPenaltyMs = 0;
    appState.prematureStartPenaltyMs = 0;
    appState.appliedPenaltyMs = 0;
    appState.eatingBonusMs = 0;

    // US-10: Record the Fasting window that just finished
    // US-10 refined: Applied bonus (eatingBonusMs) and penalties (prolonging/premature) are shown here.
    addToHistory(STATES.FASTING, fastingWindowStart, fastingWindowEnd, eatingBonusAtEnd, totalPenaltyAtEnd);

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
        if (type === 'first') {
            startEatingPrematurely(mealTime);
        } else {
            prolongEatingAndStartFast(mealTime);
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
    const originalPenalty = appState.appliedPenaltyMs;

    // Option 2 (Penalty 2): set based on remaining fast time
    appState.prematureStartPenaltyMs = PREMATURE_START_PENALTY_MULTIPLIER * Math.max(0, originalEnd - now);

    // US-7: Clear Penalty 1 when starting a new Eating window
    appState.prolongingPenaltyMs = 0;
    appState.appliedPenaltyMs = 0;

    // Transition to 100% standard eating window (no rewards/penalties here)
    appState.currentState = STATES.EATING;
    appState.windowStartTime = now;
    appState.fastingBonusMs = 0;
    const targetEatingEnd = now + DURATION_EATING_MS;
    appState.windowEndTime = targetEatingEnd;
    appState.lastEatingWindowTargetMs = targetEatingEnd;
    appState.eatingBonusMs = 0;
    appState.lastMealTime = null;

    // US-10: Record the Fasting window that was cut short
    // US-10 refined: Show target end time and active bonus/penalty
    addToHistory(STATES.FASTING, originalStartTime, originalEnd, appState.eatingBonusMs, originalPenalty);

    toggleBreakFastLog(false);
    saveState();
    updateUI();
}

function prolongEatingAndStartFast(retroTimeMs) {
    const now = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();
    const originalTargetEnd = appState.lastEatingWindowTargetMs;
    const originalStartTime = appState.windowStartTime;
    const originalPenalty = appState.appliedPenaltyMs;

    // Option 1 (Penalty 1): Recalculated from original target end
    appState.prolongingPenaltyMs = PROLONGING_PENALTY_MULTIPLIER * Math.max(0, now - originalTargetEnd);

    // Restart Fast from now
    appState.currentState = STATES.FASTING;
    appState.windowStartTime = now;
    appState.eatingBonusMs = 0;
    const totalPenalty = appState.prolongingPenaltyMs + appState.prematureStartPenaltyMs;
    appState.windowEndTime = now + DURATION_FASTING_MS + totalPenalty;
    appState.appliedPenaltyMs = totalPenalty;

    toggleBreakFastLog(false);
    saveState();
    updateUI();
}
