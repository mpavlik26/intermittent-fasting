// --- US-11: Manual Session Control ---

function showSetupOverlay() {
    const elOverlay = document.getElementById('setup-overlay');
    const elContainer = document.getElementById('setup-form-container');
    if (elOverlay && elContainer) {
        elOverlay.classList.remove('hidden');
        setupManualForm('setup-form-container', true);
    }
}

function toggleManualControl(forceValue) {
    const manualContent = document.getElementById('manual-content');
    if (!manualContent) return;

    const isExpanding = typeof forceValue === 'boolean' ? forceValue : manualContent.classList.contains('collapsed');

    if (isExpanding) {
        // Close others
        toggleHistory(false);
        toggleRetroLog(false);

        manualContent.classList.remove('collapsed');
        setupManualForm('manual-form-target');
    } else {
        manualContent.classList.add('collapsed');
    }
}

function setupManualForm(targetId, isInitialSetup = false) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const template = document.getElementById('manual-form-template');
    const content = template.content.cloneNode(true);
    target.innerHTML = '';
    target.appendChild(content);

    const elType = target.querySelector('#manual-type');
    const elStart = target.querySelector('#manual-start');
    const elEnd = target.querySelector('#manual-end');
    const elEndBox = target.querySelector('#manual-end-box');
    const elApply = target.querySelector('#btn-apply-manual');

    // Default start to "now" HH:mm
    const now = new Date(getCurrentTime());
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    elStart.value = `${hours}:${minutes}`;

    const updateVisibility = () => {
        if (elType.value === STATES.POTENTIAL_EATING) {
            elEndBox.classList.add('hidden');
        } else {
            elEndBox.classList.remove('hidden');
            updateManualEndDefault(elType, elStart, elEnd);
        }
    };

    elType.addEventListener('change', updateVisibility);
    elStart.addEventListener('change', () => updateManualEndDefault(elType, elStart, elEnd));
    elApply.addEventListener('click', () => handleManualApply(elType, elStart, elEnd, isInitialSetup));

    updateVisibility();
}

function updateManualEndDefault(elType, elStart, elEnd) {
    if (elType.value === STATES.POTENTIAL_EATING || !elStart.value) return;

    const [h, m] = elStart.value.split(':').map(Number);
    const durationHours = (elType.value === STATES.EATING) ? 8 : 16;

    let endH = (h + durationHours) % 24;
    elEnd.value = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function handleManualApply(elType, elStart, elEnd, isInitialSetup) {
    const type = elType.value;
    const startVal = elStart.value;
    const endVal = elEnd.value;
    const nowMs = getCurrentTime();

    if (!startVal || (type !== STATES.POTENTIAL_EATING && !endVal)) {
        alert("Please enter valid times.");
        return;
    }

    const [sH, sM] = startVal.split(':').map(Number);
    let startMs, endMs = null;

    if (type === STATES.POTENTIAL_EATING) {
        // Just resolve startMs to be either today or yesterday so it's closest to now
        const todayStart = new Date(nowMs).setHours(sH, sM, 0, 0);
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
        // Potential eating starts in the past or now
        startMs = (todayStart <= nowMs) ? todayStart : yesterdayStart;
    } else {
        const [eH, eM] = endVal.split(':').map(Number);

        const trySpan = (baseDateOffset) => {
            const base = nowMs + baseDateOffset;
            const s = new Date(base).setHours(sH, sM, 0, 0);
            let e = new Date(base).setHours(eH, eM, 0, 0);
            if (e < s) e += 24 * 60 * 60 * 1000; // Crosses midnight
            return { s, e };
        };

        // Try spans starting Yesterday, Today
        const spans = [trySpan(-24 * 60 * 60 * 1000), trySpan(0)];
        const match = spans.find(span => nowMs >= span.s && nowMs <= span.e);

        if (match) {
            startMs = match.s;
            endMs = match.e;
        } else {
            alert("The current time is not within the specified window span. Please ensure the window covers 'Now'.");
            return;
        }
    }

    manualSetWindow(type, startMs, endMs);
    if (isInitialSetup) document.getElementById('setup-overlay').classList.add('hidden');
    else toggleManualControl(false);
}

function manualSetWindow(type, startTimeMs, endTimeMs) {
    if (appState.windowStartTime !== null) addToHistory();

    appState.currentState = type;
    appState.windowStartTime = startTimeMs;
    appState.windowEndTime = (type === STATES.POTENTIAL_EATING) ? startTimeMs : endTimeMs;
    appState.lastMealTime = (type !== STATES.POTENTIAL_EATING) ? startTimeMs : null;
    appState.isManualSession = true;

    appState.fastingBonusMs = 0;
    appState.eatingBonusMs = 0;
    appState.prolongingPenaltyMs = 0;
    appState.prematureStartPenaltyMs = 0;
    appState.appliedPenaltyMs = 0;

    saveState();
    updateUI();
}
