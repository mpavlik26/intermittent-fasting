// --- US-18/US-20/US-22: Stored Bonus (independent Fasting/Eating pools) ---

// US-22: store is keyed by the current window (Eating window -> Eating time, Fasting window -> Fasting time),
// entered by tapping the window's end time. Use works in any window for both kinds.
const MIN_MS = 60000;

// US-22: risky = the end of the current window moves to the left, so it must never enter the past:
// use Fasting while Fasting, store Eating while Eating.
function isAmountPickerRisky(mode, bonusType) {
    if (mode === 'use') return bonusType === 'fasting' && appState.currentState === STATES.FASTING;
    return bonusType === 'eating' && appState.currentState === STATES.EATING;
}

function getAmountPickerRawMaxMs(mode, bonusType) {
    if (mode === 'store') {
        if (bonusType === 'fasting') return DURATION_FASTING_MS; // US-22: per action, repeatable
        // US-22: Eating — up to the time remaining until the window's end (whole minutes, US-18.1)
        const remainingMs = Math.max(0, appState.windowEndTime - getCurrentTime());
        return Math.floor(remainingMs / MIN_MS) * MIN_MS;
    }
    if (bonusType === 'eating') return appState.storedEatingBonusMs;
    // US-22: a Fasting reservation made in an Eating window is consumed by transitionToFasting() (no cascade),
    // so the next Fasting window must not become negative
    if (appState.currentState === STATES.EATING) {
        const roomMs = Math.max(0, DURATION_FASTING_MS - appState.fastingBonusMs - appState.pendingFastingBonusUseMs);
        return Math.min(appState.storedFastingBonusMs, roomMs);
    }
    return appState.storedFastingBonusMs;
}

function getAmountPickerSafeMaxMs(mode, bonusType) {
    const rawMaxMs = getAmountPickerRawMaxMs(mode, bonusType);
    if (!isAmountPickerRisky(mode, bonusType)) return rawMaxMs;
    const timeRemainingMs = Math.max(0, appState.windowEndTime - getCurrentTime());
    return Math.min(rawMaxMs, timeRemainingMs);
}

function canOpenAmountPicker(mode, bonusType) {
    return getAmountPickerSafeMaxMs(mode, bonusType) >= MIN_MS; // at least 1 full minute
}

// US-22: tapping the window's end time — Eating window stores Eating time, Fasting window stores Fasting time
function openStoreForCurrentWindow() {
    let bonusType = null;
    if (appState.currentState === STATES.EATING) bonusType = 'eating';
    else if (appState.currentState === STATES.FASTING) bonusType = 'fasting';
    if (!bonusType || !canOpenAmountPicker('store', bonusType)) return;
    openAmountPicker('store', bonusType);
}

function openAmountPicker(mode, bonusType) {
    amountPickerMode = mode;
    amountPickerBonusType = bonusType;
    amountPickerMaxMinutes = Math.floor(getAmountPickerSafeMaxMs(mode, bonusType) / MIN_MS);
    const bonusLabel = bonusType === 'fasting' ? 'Fasting' : 'Eating';
    elAmountPickerTitle.textContent = mode === 'store' ? `Move ${bonusLabel} Bonus to Storage` : `Use Stored ${bonusLabel} Bonus`;
    if (elAmountPickerHint) {
        const showHint = mode === 'store' && bonusType === 'fasting';
        elAmountPickerHint.textContent = showHint ? 'Up to 16 h per action — repeat to store more.' : '';
        elAmountPickerHint.classList.toggle('hidden', !showHint);
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
    amountPickerBonusType = null;
}

function renderAmountPicker() {
    elAmountPickerSlider.value = amountPickerValueMinutes;
    const fillPct = amountPickerMaxMinutes > 0 ? (amountPickerValueMinutes / amountPickerMaxMinutes) * 100 : 0;
    elAmountPickerFill.style.width = `${fillPct}%`;
    elAmountPickerValue.textContent = formatMinutesBadge(amountPickerValueMinutes);
    renderAmountPickerPreview();
}

// US-22: Fasting bonus that an Eating window started right now from Potential would earn
function getPotentialFastingBonusMs(nowMs) {
    return (appState.windowEndTime && nowMs > appState.windowEndTime)
        ? nowMs - appState.windowEndTime
        : appState.fastingBonusMs;
}

function durationText(ms) {
    return formatMinutesBadge(Math.max(0, Math.floor(ms / MIN_MS)));
}

function bonusLabel(bonusType) {
    return bonusType === 'fasting' ? 'Fasting' : 'Eating';
}

function previewLine(html) {
    return `<div>${html}</div>`;
}

// US-22: consequences of storing amountMs (current window's end moves, storage grows)
function buildStorePreviewHtml(bonusType, amountMs) {
    const storedMs = bonusType === 'fasting' ? appState.storedFastingBonusMs : appState.storedEatingBonusMs;
    const newEndMs = bonusType === 'fasting' ? appState.windowEndTime + amountMs : appState.windowEndTime - amountMs;
    return previewLine(`New end of the ${bonusLabel(bonusType)} window: ${renderTime(newEndMs)}`)
        + previewLine(`Stored ${bonusLabel(bonusType)} after: ${durationText(storedMs + amountMs)}`);
}

// US-22: consequences of using amountMs of stored bonus, for the window the bonus lands in
function buildUsePreviewHtml(bonusType, amountMs) {
    const now = getCurrentTime();
    const state = appState.currentState;
    const storedAfterMs = (bonusType === 'fasting' ? appState.storedFastingBonusMs : appState.storedEatingBonusMs) - amountMs;
    const lines = [];

    if (bonusType === 'eating') {
        if (state === STATES.EATING) {
            lines.push(`New end of the Eating window: ${renderTime(appState.windowEndTime + amountMs)}`);
        } else if (state === STATES.POTENTIAL_EATING) {
            const plan = planEatingWindow(now, getPotentialFastingBonusMs(now), { eatingMs: amountMs });
            lines.push(`Eating window: ${durationText(plan.endTime - now)}`);
            lines.push(`Ends at ${renderTime(plan.endTime)} if you start eating now`);
        } else {
            const fastEnd = appState.windowEndTime;
            const plan = planEatingWindow(fastEnd, 0, { eatingMs: amountMs });
            lines.push(`Next Eating window: ${durationText(plan.endTime - fastEnd)}`);
            lines.push(`Ends at ${renderTime(plan.endTime)} if started when this Fasting window ends (${renderTime(fastEnd)})`);
        }
    } else {
        if (state === STATES.FASTING) {
            lines.push(`New end of the Fasting window: ${renderTime(appState.windowEndTime - amountMs)}`);
        } else if (state === STATES.EATING) {
            const lengthMs = DURATION_FASTING_MS - (appState.fastingBonusMs + appState.pendingFastingBonusUseMs + amountMs)
                + appState.fastingPenaltyMs;
            const afterEatingMs = appState.windowEndTime;
            lines.push(`Next Fasting window: ${durationText(lengthMs)}`);
            lines.push(`After the Eating window: ${renderTime(afterEatingMs)} to ${renderTime(afterEatingMs + lengthMs)}`);
            lines.push(`If you log your last meal now: ${renderTime(now)} to ${renderTime(now + lengthMs)}`);
        } else {
            const plan = planEatingWindow(now, getPotentialFastingBonusMs(now), { fastingMs: amountMs });
            const lengthMs = DURATION_FASTING_MS - plan.remainderMs + appState.fastingPenaltyMs;
            lines.push(`Next Fasting window: ${durationText(lengthMs)}`);
            lines.push(`Eating window if you start eating now: ${renderTime(now)} to ${renderTime(plan.endTime)}`);
        }
    }
    lines.push(`Stored ${bonusLabel(bonusType)} after: ${durationText(storedAfterMs)}`);
    return lines.map(previewLine).join('');
}

// US-22: live preview of the consequences, always shown
function renderAmountPickerPreview() {
    const amountMs = amountPickerValueMinutes * MIN_MS;
    elAmountPickerPreview.classList.remove('hidden');
    elAmountPickerPreview.innerHTML = amountPickerMode === 'store'
        ? buildStorePreviewHtml(amountPickerBonusType, amountMs)
        : buildUsePreviewHtml(amountPickerBonusType, amountMs);
}

function adjustAmountPicker(delta) {
    amountPickerValueMinutes = Math.min(amountPickerMaxMinutes, Math.max(0, amountPickerValueMinutes + delta));
    renderAmountPicker();
}

function confirmAmountPicker() {
    // US-18.1: re-clamp against the current time in case the dialog was left open a while
    const amountMs = Math.min(amountPickerValueMinutes * MIN_MS, getAmountPickerSafeMaxMs(amountPickerMode, amountPickerBonusType));
    if (amountMs > 0) {
        const isFasting = amountPickerBonusType === 'fasting';
        if (amountPickerMode === 'store') {
            // US-22: store never touches the live bonuses; the window itself changes
            if (isFasting) {
                appState.windowEndTime += amountMs;
                appState.storedFastingBonusMs += amountMs;
            } else {
                appState.windowEndTime -= amountMs;
                if (appState.lastEatingWindowTargetMs != null) appState.lastEatingWindowTargetMs -= amountMs; // E moves with the end (US-21)
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
                    if (appState.lastEatingWindowTargetMs != null) appState.lastEatingWindowTargetMs += amountMs;
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
        el.textContent = `Stored ${bonusType === 'fasting' ? 'Fasting' : 'Eating'}: +${formatMinutesBadge(mins)}`;
        el.classList.remove('hidden');
        el.classList.toggle('disabled', !canOpenAmountPicker('use', bonusType));
    } else {
        el.classList.add('hidden');
    }
}

function updateStoredBonusIndicators() {
    updateStoredBonusIndicator('fasting', elStoredFastingBonusIndicator);
    updateStoredBonusIndicator('eating', elStoredEatingBonusIndicator);
    refreshManualStoredBonusLabels(); // US-23: open manual forms show the live stored values
}
