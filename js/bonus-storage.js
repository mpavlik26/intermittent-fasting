// --- US-18: Stored Bonus ---
function openAmountPicker(mode) {
    amountPickerMode = mode;
    if (mode === 'store') {
        const state = appState.currentState;
        const activeBonusMs = state === STATES.EATING ? appState.fastingBonusMs : appState.eatingBonusMs;
        amountPickerMaxMinutes = Math.floor(activeBonusMs / 60000);
        elAmountPickerTitle.textContent = 'Move Bonus to Storage';
    } else {
        amountPickerMaxMinutes = Math.floor(appState.storedBonusMs / 60000);
        elAmountPickerTitle.textContent = 'Use Stored Bonus';
    }
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
    elAmountPickerValue.textContent = `${amountPickerValueMinutes}m`;
}

function adjustAmountPicker(delta) {
    amountPickerValueMinutes = Math.min(amountPickerMaxMinutes, Math.max(0, amountPickerValueMinutes + delta));
    renderAmountPicker();
}

function confirmAmountPicker() {
    const amountMs = amountPickerValueMinutes * 60000;
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
        elStoredBonusIndicator.textContent = `+${mins}m stored`;
        elStoredBonusIndicator.classList.remove('hidden');
    } else {
        elStoredBonusIndicator.classList.add('hidden');
    }
}
