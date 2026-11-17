// --- US-18/US-20: Stored Bonus (independent Fasting/Eating pools) ---

// US-20: "store while Fasting" (shortens current Fasting window) and "use while Fasting"
// (also shortens it) are the risky combinations for the Fasting pool; the Eating pool
// never shortens anything, so it's never risky.
function isAmountPickerRisky(mode, bonusType) {
    return mode === 'use' && bonusType === 'fasting' && appState.currentState === STATES.FASTING;
}

function getAmountPickerRawMaxMs(mode, bonusType) {
    if (mode === 'store') {
        return bonusType === 'fasting' ? appState.fastingBonusMs : appState.eatingBonusMs;
    }
    return bonusType === 'fasting' ? appState.storedFastingBonusMs : appState.storedEatingBonusMs;
}

function getAmountPickerSafeMaxMs(mode, bonusType) {
    const rawMaxMs = getAmountPickerRawMaxMs(mode, bonusType);
    if (!isAmountPickerRisky(mode, bonusType)) return rawMaxMs;
    const timeRemainingMs = Math.max(0, appState.windowEndTime - getCurrentTime());
    return Math.min(rawMaxMs, timeRemainingMs);
}

function canOpenAmountPicker(mode, bonusType) {
    return getAmountPickerSafeMaxMs(mode, bonusType) >= 60000; // at least 1 full minute
}

// US-20: whether the currently-open picker's amount affects the window the user is in right now
function amountPickerAffectsCurrentWindow(mode, bonusType) {
    if (mode === 'store') return bonusType === 'fasting' && appState.currentState === STATES.FASTING;
    return (bonusType === 'fasting' && appState.currentState === STATES.FASTING) ||
           (bonusType === 'eating' && appState.currentState === STATES.EATING);
}

function getAmountPickerDeltaMs() {
    const amountMs = amountPickerValueMinutes * 60000;
    if (amountPickerMode === 'store' && amountPickerBonusType === 'fasting' && appState.currentState === STATES.FASTING) {
        return amountMs;
    }
    if (amountPickerMode === 'use' && amountPickerBonusType === 'fasting' && appState.currentState === STATES.FASTING) {
        return -amountMs;
    }
    if (amountPickerMode === 'use' && amountPickerBonusType === 'eating' && appState.currentState === STATES.EATING) {
        return amountMs;
    }
    return 0;
}

function openAmountPicker(mode, bonusType) {
    amountPickerMode = mode;
    amountPickerBonusType = bonusType;
    amountPickerMaxMinutes = Math.floor(getAmountPickerSafeMaxMs(mode, bonusType) / 60000);
    const bonusLabel = bonusType === 'fasting' ? 'Fasting' : 'Eating';
    elAmountPickerTitle.textContent = mode === 'store' ? `Move ${bonusLabel} Bonus to Storage` : `Use Stored ${bonusLabel} Bonus`;
    amountPickerValueMinutes = 0;
    elAmountPickerSlider.min = 0;
    elAmountPickerSlider.max = amountPickerMaxMinutes;
    renderAmountPicker();
    elAmountPickerOverlay.classList.remove('hidden');
}

function closeAmountPicker() {
    elAmountPickerOverlay.classList.add('hidden');
    amountPickerMode = null;
    amountPickerBonusType = null;
}

function renderAmountPicker() {
    elAmountPickerSlider.value = amountPickerValueMinutes;
    const fillPct = amountPickerMaxMinutes > 0 ? (amountPickerValueMinutes / amountPickerMaxMinutes) * 100 : 0;
    elAmountPickerFill.style.width = `${fillPct}%`;
    elAmountPickerValue.textContent = formatMinutesBadge(amountPickerValueMinutes);
    renderAmountPickerPreview();
}

// US-20: live preview of the affected window's resulting end time, only when relevant
function renderAmountPickerPreview() {
    if (!amountPickerAffectsCurrentWindow(amountPickerMode, amountPickerBonusType)) {
        elAmountPickerPreview.classList.add('hidden');
        return;
    }
    elAmountPickerPreview.classList.remove('hidden');
    const resultingEndMs = appState.windowEndTime + getAmountPickerDeltaMs();
    elAmountPickerPreview.innerHTML = `New end time: ${renderTime(resultingEndMs)}`;
}

function adjustAmountPicker(delta) {
    amountPickerValueMinutes = Math.min(amountPickerMaxMinutes, Math.max(0, amountPickerValueMinutes + delta));
    renderAmountPicker();
}

function confirmAmountPicker() {
    // US-18.1: re-clamp against the current time in case the dialog was left open a while
    const amountMs = Math.min(amountPickerValueMinutes * 60000, getAmountPickerSafeMaxMs(amountPickerMode, amountPickerBonusType));
    if (amountMs > 0) {
        const isFasting = amountPickerBonusType === 'fasting';
        if (amountPickerMode === 'store') {
            if (isFasting) {
                appState.fastingBonusMs -= amountMs;
                if (appState.currentState === STATES.FASTING) appState.windowEndTime += amountMs;
                appState.storedFastingBonusMs += amountMs;
            } else {
                appState.eatingBonusMs -= amountMs;
                appState.storedEatingBonusMs += amountMs;
            }
        } else if (amountPickerMode === 'use') {
            if (isFasting) {
                appState.storedFastingBonusMs -= amountMs;
                if (appState.currentState === STATES.FASTING) {
                    appState.windowEndTime -= amountMs;
                } else {
                    appState.pendingFastingBonusUseMs += amountMs;
                }
            } else {
                appState.storedEatingBonusMs -= amountMs;
                if (appState.currentState === STATES.EATING) {
                    appState.windowEndTime += amountMs;
                    appState.lastEatingWindowTargetMs += amountMs;
                } else {
                    appState.pendingEatingBonusUseMs += amountMs;
                }
            }
        }
        saveState();
        updateUI();
    }
    closeAmountPicker();
}

function updateStoredBonusIndicator(bonusType, el) {
    if (!el) return;
    const storedMs = bonusType === 'fasting' ? appState.storedFastingBonusMs : appState.storedEatingBonusMs;
    const mins = Math.floor(storedMs / 60000);
    if (mins > 0) {
        el.textContent = `+${formatMinutesBadge(mins)} stored`;
        el.classList.remove('hidden');
        el.classList.toggle('disabled', !canOpenAmountPicker('use', bonusType));
    } else {
        el.classList.add('hidden');
    }
}

function updateStoredBonusIndicators() {
    updateStoredBonusIndicator('fasting', elStoredFastingBonusIndicator);
    updateStoredBonusIndicator('eating', elStoredEatingBonusIndicator);
}
