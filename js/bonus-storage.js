// --- US-18: Stored Bonus ---

// US-18.1: "store while Eating" and "use while Fasting" are the only combinations that
// subtract from windowEndTime - they're the only ones that risk pushing it into the past.
function isAmountPickerRisky(mode) {
    return (mode === 'store' && appState.currentState === STATES.EATING) ||
           (mode === 'use' && appState.currentState === STATES.FASTING);
}

function getAmountPickerRawMaxMs(mode) {
    if (mode === 'store') {
        return appState.currentState === STATES.EATING ? appState.fastingBonusMs : appState.eatingBonusMs;
    }
    return appState.storedBonusMs;
}

function getAmountPickerSafeMaxMs(mode) {
    const rawMaxMs = getAmountPickerRawMaxMs(mode);
    if (!isAmountPickerRisky(mode)) return rawMaxMs;
    const timeRemainingMs = Math.max(0, appState.windowEndTime - getCurrentTime());
    return Math.min(rawMaxMs, timeRemainingMs);
}

function canOpenAmountPicker(mode) {
    return getAmountPickerSafeMaxMs(mode) >= 60000; // at least 1 full minute
}

function getAmountPickerDeltaMs() {
    const amountMs = amountPickerValueMinutes * 60000;
    return isAmountPickerRisky(amountPickerMode) ? -amountMs : amountMs;
}

function openAmountPicker(mode) {
    amountPickerMode = mode;
    amountPickerMaxMinutes = Math.floor(getAmountPickerSafeMaxMs(mode) / 60000);
    elAmountPickerTitle.textContent = mode === 'store' ? 'Move Bonus to Storage' : 'Use Stored Bonus';
    amountPickerValueMinutes = 0;
    elAmountPickerSlider.min = 0;
    elAmountPickerSlider.max = amountPickerMaxMinutes;
    renderAmountPicker();
    elAmountPickerOverlay.classList.remove('hidden');
}

function closeAmountPicker() {
    elAmountPickerOverlay.classList.add('hidden');
    amountPickerMode = null;
}

function renderAmountPicker() {
    elAmountPickerSlider.value = amountPickerValueMinutes;
    const fillPct = amountPickerMaxMinutes > 0 ? (amountPickerValueMinutes / amountPickerMaxMinutes) * 100 : 0;
    elAmountPickerFill.style.width = `${fillPct}%`;
    elAmountPickerValue.textContent = formatMinutesBadge(amountPickerValueMinutes);
    renderAmountPickerPreview();
}

// US-18.1: live preview of the window's resulting end time - applies to both modes
// whenever a window end time exists (not just the risky combinations above)
function renderAmountPickerPreview() {
    if (amountPickerMode === 'use' && appState.currentState === STATES.POTENTIAL_EATING) {
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
    const amountMs = Math.min(amountPickerValueMinutes * 60000, getAmountPickerSafeMaxMs(amountPickerMode));
    if (amountMs > 0) {
        if (amountPickerMode === 'store') {
            if (appState.currentState === STATES.EATING) {
                appState.fastingBonusMs -= amountMs;
                appState.lastEatingWindowTargetMs -= amountMs;
                appState.windowEndTime -= amountMs;
            } else if (appState.currentState === STATES.FASTING) {
                appState.eatingBonusMs -= amountMs;
                appState.windowEndTime += amountMs;
            }
            appState.storedBonusMs += amountMs;
        } else if (amountPickerMode === 'use') {
            appState.storedBonusMs -= amountMs;
            if (appState.currentState === STATES.EATING) {
                appState.windowEndTime += amountMs;
                appState.lastEatingWindowTargetMs += amountMs;
            } else if (appState.currentState === STATES.FASTING) {
                appState.windowEndTime -= amountMs;
            } else if (appState.currentState === STATES.POTENTIAL_EATING) {
                appState.pendingUseMs += amountMs;
            }
        }
        saveState();
        updateUI();
    }
    closeAmountPicker();
}

function updateStoredBonusIndicator() {
    const mins = Math.floor(appState.storedBonusMs / 60000);
    if (mins > 0) {
        elStoredBonusIndicator.textContent = `+${formatMinutesBadge(mins)} stored`;
        elStoredBonusIndicator.classList.remove('hidden');
        elStoredBonusIndicator.classList.toggle('disabled', !canOpenAmountPicker('use'));
    } else {
        elStoredBonusIndicator.classList.add('hidden');
    }
}
