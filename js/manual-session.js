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
    setupManualStoredBonusSection(target);
}

// --- US-23: manual setting of stored bonuses ---

const MANUAL_STORED_BONUS_TYPES = ['eating', 'fasting'];

// "h:mm" (any number of hours, minutes 0-59) -> whole minutes, or null when invalid
function parseHoursMinutes(text) {
    const m = /^\s*(\d{1,6}):([0-5]\d)\s*$/.exec(text);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function formatHoursMinutes(totalMinutes) {
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function getStoredBonusMinutes(bonusType) {
    const ms = bonusType === 'fasting' ? appState.storedFastingBonusMs : appState.storedEatingBonusMs;
    return Math.floor((ms || 0) / MIN_MS);
}

function setupManualStoredBonusSection(target) {
    const section = target.querySelector('.manual-stored-section');
    if (!section) return;
    const elConfirm = section.querySelector('.manual-stored-confirm');

    // Per-row draft: minutes shown in the field, whether the user edited it, whether the typed text is invalid
    const rows = {};
    MANUAL_STORED_BONUS_TYPES.forEach(type => {
        rows[type] = {
            minutes: 0,
            touched: false,
            invalid: false,
            elInput: section.querySelector(`.manual-stored-input[data-bonus="${type}"]`),
            elCurrent: section.querySelector(`.manual-stored-current[data-bonus="${type}"]`),
        };
    });

    const updateConfirmState = () => {
        elConfirm.disabled = MANUAL_STORED_BONUS_TYPES.some(type => rows[type].invalid);
    };

    // Refreshes "Current" labels; untouched rows follow the live stored value, edited drafts are kept
    const refresh = () => {
        MANUAL_STORED_BONUS_TYPES.forEach(type => {
            const row = rows[type];
            const current = getStoredBonusMinutes(type);
            row.elCurrent.textContent = formatMinutesBadge(current);
            if (!row.touched) {
                row.minutes = current;
                row.invalid = false;
                const text = formatHoursMinutes(current);
                if (row.elInput.value !== text) row.elInput.value = text;
                row.elInput.classList.remove('invalid');
            }
        });
        updateConfirmState();
    };
    section._refreshStoredBonus = refresh;

    MANUAL_STORED_BONUS_TYPES.forEach(type => {
        const row = rows[type];
        row.elInput.addEventListener('input', () => {
            row.touched = true;
            const parsed = parseHoursMinutes(row.elInput.value);
            row.invalid = parsed === null;
            if (parsed !== null) row.minutes = parsed;
            row.elInput.classList.toggle('invalid', row.invalid);
            updateConfirmState();
        });
    });

    section.querySelectorAll('.manual-stored-step').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = rows[btn.dataset.bonus];
            row.touched = true;
            row.invalid = false;
            row.minutes = Math.max(0, row.minutes + Number(btn.dataset.deltaMin));
            row.elInput.value = formatHoursMinutes(row.minutes);
            row.elInput.classList.remove('invalid');
            updateConfirmState();
        });
    });

    elConfirm.addEventListener('click', () => {
        if (MANUAL_STORED_BONUS_TYPES.some(type => rows[type].invalid)) return;
        // Only rows that were actually changed are written (an untouched row keeps its exact value);
        // pending reservations, current window and live bonuses/penalties stay untouched.
        MANUAL_STORED_BONUS_TYPES.forEach(type => {
            const row = rows[type];
            if (row.touched && row.minutes !== getStoredBonusMinutes(type)) {
                const ms = row.minutes * MIN_MS;
                if (type === 'fasting') appState.storedFastingBonusMs = ms;
                else appState.storedEatingBonusMs = ms;
            }
            row.touched = false;
        });
        saveState();
        updateUI();
        refresh();
    });

    refresh();
}

// Keeps the "Current" labels of open manual forms in sync with the stored bonuses
function refreshManualStoredBonusLabels() {
    document.querySelectorAll('.manual-stored-section').forEach(section => {
        if (section._refreshStoredBonus) section._refreshStoredBonus();
    });
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
    // "Last meal" is only known for a manually set Fasting window (it starts at the last meal).
    // A manually set Eating window has no logged last meal yet — if none is logged, the last meal
    // counts as being at the window's end, like in a naturally started Eating window.
    appState.lastMealTime = (type === STATES.FASTING) ? startTimeMs : null;
    // E (target end of the Eating window): needed by history recording (Eating → Fasting), the Eating
    // bonus and the retroactive break-fast penalties. For Eating it is the window end; for a manual
    // Fasting window the preceding Eating window is considered to have ended with the last meal.
    if (type === STATES.EATING) appState.lastEatingWindowTargetMs = endTimeMs;
    else if (type === STATES.FASTING) appState.lastEatingWindowTargetMs = startTimeMs;
    else appState.lastEatingWindowTargetMs = null;
    appState.isManualSession = true;

    appState.fastingBonusMs = 0;
    appState.eatingBonusMs = 0;
    appState.eatingPenaltyMs = 0;
    appState.fastingPenaltyMs = 0;
    appState.appliedFastingBonusMs = 0;
    appState.appliedEatingBonusMs = 0;
    appState.appliedFastingPenaltyMs = 0;
    appState.appliedEatingPenaltyMs = 0;

    saveState();
    updateUI();
}
