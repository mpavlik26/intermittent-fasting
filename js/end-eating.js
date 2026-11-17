// --- US-21: Explicit end of the Eating window (dialog) ---

const MS_PER_MINUTE = 60 * 1000;

function floorToMinute(ms) {
    return Math.floor(ms / MS_PER_MINUTE) * MS_PER_MINUTE;
}

function openEndEatingDialog() {
    if (appState.currentState !== STATES.EATING || !elEndEatingOverlay) return;

    const now = getCurrentTime();
    const minMs = getExplicitEndMinMs();

    elEndEatingOriginal.innerHTML = 'The Eating window originally ends at ' +
        '<strong>' + renderTime(appState.windowEndTime) + '</strong>.';

    if (appState.lastMealTime) {
        elEndEatingLogged.innerHTML = 'Last logged meal at ' + renderTime(appState.lastMealTime);
        elEndEatingLogged.classList.remove('hidden');
    } else {
        elEndEatingLogged.classList.add('hidden');
    }

    elEndEatingCustom.classList.add('hidden');
    elEndEatingError.classList.add('hidden');
    elEndEatingError.textContent = '';
    elEndEatingRange.innerHTML = 'Allowed: from ' + renderTime(minMs) + ' until now.';
    elEndEatingTimeInput.value = formatClockInput(now);

    elEndEatingOverlay.classList.remove('hidden');
}

function closeEndEatingDialog() {
    if (elEndEatingOverlay) elEndEatingOverlay.classList.add('hidden');
}

function formatClockInput(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function confirmEndEating(timeMs) {
    const ok = endEatingWindowExplicitly(timeMs);
    if (ok) {
        closeEndEatingDialog();
        tick(); // fast-forwards if the Fasting window is already over
    }
    return ok;
}

function endEatingNow() {
    confirmEndEating(getCurrentTime());
}

function endEatingAtLoggedMeal() {
    if (appState.lastMealTime) confirmEndEating(appState.lastMealTime);
}

function toggleEndEatingCustom() {
    elEndEatingCustom.classList.toggle('hidden');
}

function endEatingAtCustomTime() {
    const minMs = getExplicitEndMinMs();
    const candidate = parseRetrospectiveTime(elEndEatingTimeInput.value);

    if (candidate === null || floorToMinute(candidate) < floorToMinute(minMs)) {
        elEndEatingError.textContent = 'Please choose a time between the allowed range.';
        elEndEatingError.classList.remove('hidden');
        return;
    }

    // Minute precision of the input must never put the time before an already logged meal
    const timeMs = Math.max(candidate, minMs);
    if (!confirmEndEating(timeMs)) {
        elEndEatingError.textContent = 'Please choose a time between the allowed range.';
        elEndEatingError.classList.remove('hidden');
    }
}
