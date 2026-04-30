// --- Constants ---
console.log("APP_VERSION: US-3-READY");
const STATES = {
    POTENTIAL_EATING: 'potential',
    EATING: 'eating',
    FASTING: 'fasting'
};

const DURATION_EATING_MS = 8 * 60 * 60 * 1000;
const DURATION_FASTING_MS = 16 * 60 * 60 * 1000;

// --- State Variables ---
let appState = {
    currentState: STATES.POTENTIAL_EATING,
    windowStartTime: null,
    windowEndTime: null,
    lastMealTime: null,
    fastingBonusMs: 0,
    eatingBonusMs: 0,
    prolongingPenaltyMs: 0, // Option 1
    prematureStartPenaltyMs: 0, // Option 2
    appliedPenaltyMs: 0,
    lastEatingWindowTargetMs: null,
    timeOffsetMs: 0,
    isDebugUnlocked: false, // US-8: Secret toggle
    isManualSession: false, // US-11: Manual override flag
    history: [] // US-10: History of windows
};

// US-12: Simulator state (not persisted)
let simState = { sliderStartMs: 0, sliderEndMs: 0, lastMealMinMins: 0 };

// --- DOM Elements ---
const elCurrentTime = document.getElementById('current-time');
const elStatusCard = document.getElementById('status-card');
const elCurrentStateTitle = document.getElementById('current-state');
const elStateDescription = document.getElementById('state-description');

const elTimerDisplay = document.getElementById('timer-display');
const elTimerLabel = document.getElementById('timer-label');
const elCountdown = document.getElementById('countdown');
const elProgressBar = document.getElementById('progress-bar');
const elStartTimeVal = document.getElementById('start-time-val');
const elEndTimeVal = document.getElementById('end-time-val');

const elBtnFirstMeal = document.getElementById('btn-first-meal');
const elBtnLastMeal = document.getElementById('btn-last-meal');

const elMealTypeSelect = document.getElementById('meal-type-select');
const elMealTimeInput = document.getElementById('meal-time-input');
const elBtnSubmitLog = document.getElementById('btn-submit-log');
const elBonusText = document.getElementById('bonus-text');
const elBonusBadge = document.getElementById('bonus-badge');

// US-5 DOM Elements
const elForecastSection = document.getElementById('forecast-section');
const elForecastPotentialContent = document.getElementById('forecast-potential-content');
const elForecastEatingContent = document.getElementById('forecast-eating-content');
const elForecastEatingEnd = document.getElementById('forecast-eating-end');
const elForecastLastMealRow = document.getElementById('forecast-last-meal-row');
const elForecastLastMealTime = document.getElementById('forecast-last-meal-time');
const elForecastFastingEndLast = document.getElementById('forecast-fasting-end-last');
const elForecastFastingEndNow = document.getElementById('forecast-fasting-end-now');

// US-6 DOM Elements
const elBtnToggleRetro = document.getElementById('btn-toggle-retro');
const elRetroLogContent = document.getElementById('retro-log-content');

// US-7 DOM Elements
const elBreakFastSection = document.getElementById('break-fast-section');
const elBreakFastContent = document.getElementById('break-fast-content');
const elBtnToggleBreak = document.getElementById('btn-toggle-break');
const elBtnBreakProlong = document.getElementById('btn-break-prolong');
const elBtnBreakPremature = document.getElementById('btn-break-premature');

const elPenaltyBadge = document.getElementById('penalty-badge');
const elPenaltyText = document.getElementById('penalty-text');

const elBreakProlongPenalty = document.getElementById('break-prolong-penalty');
const elBreakProlongEnd = document.getElementById('break-prolong-end');
const elBreakPrematurePenalty = document.getElementById('break-premature-penalty');
const elBreakPrematureInterval = document.getElementById('break-premature-interval');

const elAppTitle = document.getElementById('app-title');
const elDebugSection = document.querySelector('.debug-controls');

// US-12: Simulator DOM Elements
const elSimOverlay = document.getElementById('simulator-overlay');
const elSimLabelStart = document.getElementById('sim-label-start');
const elSimLabelEnd = document.getElementById('sim-label-end');
const elSliderFirstMeal = document.getElementById('slider-first-meal');
const elSliderLastMeal = document.getElementById('slider-last-meal');
const elSimRangeFill = document.getElementById('sim-range-fill');
const elSimTimeFirst = document.getElementById('sim-time-first');
const elSimTimeLast = document.getElementById('sim-time-last');
const elSimFastStart = document.getElementById('sim-fast-start');
const elSimFastEnd = document.getElementById('sim-fast-end');
const elSimFastDuration = document.getElementById('sim-fast-duration');
// US-13: Additional simulator DOM refs for dynamic labels
const elSimTitle = document.getElementById('simulator-title');
const elSimOutputLabel = document.getElementById('sim-output-label');
const elSimLabelFirst = document.getElementById('sim-label-first');
const elSimLabelLast = document.getElementById('sim-label-last');
const elBtnOpenSimulator = document.getElementById('btn-open-simulator');

// US-10 DOM Elements
const elBtnToggleHistory = document.getElementById('btn-toggle-history');
const elHistoryContent = document.getElementById('history-content');
const elHistoryList = document.getElementById('history-list');

// --- Initialization ---
function init() {
    loadState();
    setupEventListeners();

    // Start Ticker
    setInterval(tick, 1000);
    tick(); // Initial call
}

function loadState() {
    const saved = localStorage.getItem('fastingTrackerState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            appState = { ...appState, ...parsed };
        } catch (e) {
            console.error('Failed to load state', e);
        }
    } else {
        // US-11: No state found, trigger setup
        showSetupOverlay();
    }
    appState.isDebugUnlocked = false; // US-8: Always hide by default on load
    updateUI();
}

function saveState() {
    localStorage.setItem('fastingTrackerState', JSON.stringify(appState));
}

function resetState() {
    appState = {
        currentState: STATES.POTENTIAL_EATING,
        windowStartTime: null,
        windowEndTime: null,
        lastMealTime: null,
        fastingBonusMs: 0,
        eatingBonusMs: 0,
        prolongingPenaltyMs: 0,
        prematureStartPenaltyMs: 0,
        appliedPenaltyMs: 0,
        lastEatingWindowTargetMs: null,
        timeOffsetMs: 0,
        isDebugUnlocked: appState.isDebugUnlocked,
        history: [] // US-10: Clear history on hard reset
    };
    saveState();
    updateUI();
}

// --- Time Utilities ---
function getCurrentTime() {
    return Date.now() + appState.timeOffsetMs;
}

function formatTimeOnly(timestamp) {
    if (!timestamp) return '--:--';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderTime(timestamp) {
    if (!timestamp) return '--:--';
    const timeStr = formatTimeOnly(timestamp);

    const now = new Date(getCurrentTime());
    const target = new Date(timestamp);

    // Compare date parts only
    const isSameDay = now.getFullYear() === target.getFullYear() &&
        now.getMonth() === target.getMonth() &&
        now.getDate() === target.getDate();

    if (isSameDay) return timeStr;

    // Get 2-char day abbreviation
    const dayName = target.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    return `${timeStr}<sup class="day-label">${dayName}</sup>`;
}

function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        seconds.toString().padStart(2, '0')
    ].join(':');
}

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

// --- History Helpers ---

function addToHistory(type, startTime, endTime, bonusMs = 0, penaltyMs = 0) {
    if (!startTime || !endTime) return;

    const record = {
        type,
        startTime,
        endTime,
        bonusMs,
        penaltyMs,
        isManual: appState.isManualSession, // US-11
        id: Date.now()
    };

    appState.isManualSession = false; // Reset manual flag

    appState.history.unshift(record); // Add to top (descending)
    saveState();
}

function renderHistory() {
    if (!elHistoryList) return;

    if (appState.history.length === 0) {
        elHistoryList.innerHTML = '<p class="empty-history">No records yet.</p>';
        return;
    }

    // Group by date
    const groups = {};
    appState.history.forEach(record => {
        const d = new Date(record.startTime);
        const dateKey = d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(record);
    });

    let html = '';
    // Groups are already roughly in order because history is unshifted
    for (const date in groups) {
        html += `<div class="history-date-group">
            <h4 class="history-date-header">${date}</h4>
            <div class="history-records">`;

        groups[date].forEach(r => {
            const isEating = r.type === STATES.EATING;
            const icon = isEating ? '🍴' : '🌙';
            const typeLabel = isEating ? 'Eating' : 'Fasting';

            let extras = '';
            if (r.isManual) {
                extras += `<span class="history-tag manual">Manual</span>`;
            }
            if (r.bonusMs > 0) {
                const label = isEating ? `Reward +${Math.round(r.bonusMs / 60000)}m window` : `Reward -${Math.round(r.bonusMs / 60000)}m fast`;
                extras += `<span class="history-tag bonus">${label}</span>`;
            }
            if (r.penaltyMs > 0) {
                extras += `<span class="history-tag penalty">Penalty +${Math.round(r.penaltyMs / 60000)}m</span>`;
            }

            html += `
                <div class="history-record-item" data-type="${r.type}">
                    <div class="record-main">
                        <span class="record-icon">${icon}</span>
                        <div class="record-details">
                            <span class="record-type">${typeLabel}</span>
                            <span class="record-time">${formatTimeOnly(r.startTime)} - ${formatTimeOnly(r.endTime)}</span>
                        </div>
                    </div>
                    <div class="record-extras">
                        ${extras}
                    </div>
                </div>`;
        });

        html += `</div></div>`;
    }

    elHistoryList.innerHTML = html;
}

function transitionToEating(retroTimeMs) {
    // If called via standard event listener, it passes PointerEvent. We check if it's a number.
    const timeToUse = typeof retroTimeMs === 'number' ? retroTimeMs : getCurrentTime();

    // US-3: Calculate bonus if fasting continued into potential eating window
    let bonusMs = appState.fastingBonusMs; // Keep existing if already set (e.g. re-logging)
    if (appState.currentState === STATES.POTENTIAL_EATING && appState.windowEndTime && timeToUse > appState.windowEndTime) {
        bonusMs = Math.floor((timeToUse - appState.windowEndTime) / 2);
    }

    appState.currentState = STATES.EATING;
    appState.windowStartTime = timeToUse;
    appState.fastingBonusMs = bonusMs;
    const targetEndTime = timeToUse + DURATION_EATING_MS + bonusMs;
    appState.windowEndTime = targetEndTime;
    appState.lastEatingWindowTargetMs = targetEndTime; // US-7: Vital for Penalty 1
    appState.eatingBonusMs = 0; // Reset for new window
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
        return Math.floor((appState.lastEatingWindowTargetMs - timeMs) / 2);
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
    if (type === 'first') {
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

function startEatingPrematurely() {
    const now = getCurrentTime();
    const originalEnd = appState.windowEndTime;
    const originalStartTime = appState.windowStartTime;
    const originalPenalty = appState.appliedPenaltyMs;

    // Option 2 (Penalty 2): set based on remaining fast time
    appState.prematureStartPenaltyMs = 4 * Math.max(0, originalEnd - now);

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

function prolongEatingAndStartFast() {
    const now = getCurrentTime();
    const originalTargetEnd = appState.lastEatingWindowTargetMs;
    const originalStartTime = appState.windowStartTime;
    const originalPenalty = appState.appliedPenaltyMs;

    // Option 1 (Penalty 1): Recalculated from original target end
    appState.prolongingPenaltyMs = 2 * Math.max(0, now - originalTargetEnd);

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

// --- US-12: Fasting Window Simulator ---

function openSimulator() {
    const now = getCurrentTime();

    if (appState.currentState === STATES.POTENTIAL_EATING) {
        simState.sliderStartMs = appState.windowEndTime;
        simState.sliderEndMs = now + 24 * 60 * 60 * 1000;
    } else if (appState.currentState === STATES.EATING) {
        simState.sliderStartMs = appState.windowStartTime;
        simState.sliderEndMs = appState.windowEndTime;
    } else {
        // US-13: Fasting — model the next eating window
        simState.sliderStartMs = appState.windowEndTime;
        simState.sliderEndMs = simState.sliderStartMs + 24 * 60 * 60 * 1000;
    }

    const totalMins = Math.floor((simState.sliderEndMs - simState.sliderStartMs) / 60000);
    elSliderFirstMeal.min = 0;
    elSliderFirstMeal.max = totalMins;
    elSliderLastMeal.min = 0;
    elSliderLastMeal.max = totalMins;

    elSimLabelStart.innerHTML = renderTime(simState.sliderStartMs);
    elSimLabelEnd.innerHTML = renderTime(simState.sliderEndMs);

    if (appState.currentState === STATES.POTENTIAL_EATING) {
        elSimTitle.textContent = 'Fasting Window Simulator';
        elSimOutputLabel.textContent = 'Modeled Fasting Window';
        elSimLabelFirst.textContent = 'First meal';
        elSimLabelLast.textContent = 'Last meal';
        elSliderFirstMeal.disabled = false;
        const initFirst = Math.max(0, Math.floor((now - simState.sliderStartMs) / 60000));
        const initLast = Math.min(initFirst + 480, totalMins);
        elSliderFirstMeal.value = initFirst;
        elSliderLastMeal.value = initLast;
    } else if (appState.currentState === STATES.EATING) {
        elSimTitle.textContent = 'Fasting Window Simulator';
        elSimOutputLabel.textContent = 'Modeled Fasting Window';
        elSimLabelFirst.textContent = 'First meal';
        elSimLabelLast.textContent = 'Last meal';
        // Eating: first meal is fixed at window start
        elSliderFirstMeal.disabled = true;
        elSliderFirstMeal.value = 0;
        const baseMs = appState.lastMealTime || now;
        const initLast = Math.min(Math.max(0, Math.floor((baseMs - simState.sliderStartMs) / 60000)), totalMins);
        elSliderLastMeal.value = initLast;
        // If a last meal was logged, its position is the lower bound — cannot model eating earlier
        simState.lastMealMinMins = appState.lastMealTime ? initLast : 0;
    } else {
        // US-13: Fasting — model next eating window with coupled toggles
        elSimTitle.textContent = 'Eating Window Simulator';
        elSimOutputLabel.textContent = 'Modeled Eating Window';
        elSimLabelFirst.textContent = 'Eating starts';
        elSimLabelLast.textContent = 'Eating ends';
        elSliderFirstMeal.disabled = false;
        elSliderFirstMeal.value = 0;
        elSliderLastMeal.value = Math.min(480, totalMins);
        simState.lastMealMinMins = 0;
    }

    updateSimulatorOutput();
    elSimOverlay.classList.remove('hidden');
}

function closeSimulator() {
    elSimOverlay.classList.add('hidden');
}

function calcSimulatedFast(firstMealMs, lastMealMs) {
    let effectiveEatingEnd;

    if (appState.currentState === STATES.POTENTIAL_EATING) {
        let fastingBonus = 0;
        if (appState.windowEndTime && firstMealMs > appState.windowEndTime) {
            fastingBonus = Math.floor((firstMealMs - appState.windowEndTime) / 2);
        }
        effectiveEatingEnd = firstMealMs + DURATION_EATING_MS + fastingBonus;
    } else {
        effectiveEatingEnd = appState.windowEndTime;
    }

    const eatingBonus = lastMealMs < effectiveEatingEnd
        ? Math.floor((effectiveEatingEnd - lastMealMs) / 2)
        : 0;

    const fastStart = lastMealMs;
    const fastEnd = lastMealMs + DURATION_FASTING_MS - eatingBonus + appState.prematureStartPenaltyMs;
    return { fastStart, fastEnd, fastDurationMs: fastEnd - fastStart };
}

// US-13: Calculate the modeled eating window when in Fasting state.
// firstMealMs = when user plans to eat after fasting ends (sliderStartMs = fasting window end).
function calcSimulatedEating(firstMealMs) {
    let fastingBonus = 0;
    if (firstMealMs > simState.sliderStartMs) {
        fastingBonus = Math.floor((firstMealMs - simState.sliderStartMs) / 2);
    }
    const eatStart = firstMealMs;
    const eatEnd = firstMealMs + DURATION_EATING_MS + fastingBonus;
    return { eatStart, eatEnd, eatDurationMs: eatEnd - eatStart };
}

function updateSimulatorOutput() {
    const totalMins = parseInt(elSliderFirstMeal.max);
    const firstMins = parseInt(elSliderFirstMeal.value);
    const lastMins = parseInt(elSliderLastMeal.value);

    const firstMealMs = simState.sliderStartMs + firstMins * 60000;
    const lastMealMs = simState.sliderStartMs + lastMins * 60000;

    elSimTimeFirst.innerHTML = renderTime(firstMealMs);
    elSimTimeLast.innerHTML = renderTime(lastMealMs);

    const fillLeft = totalMins > 0 ? (firstMins / totalMins) * 100 : 0;
    const fillRight = totalMins > 0 ? 100 - (lastMins / totalMins) * 100 : 100;
    elSimRangeFill.style.left = `${fillLeft}%`;
    elSimRangeFill.style.right = `${fillRight}%`;

    if (appState.currentState === STATES.FASTING) {
        const { eatStart, eatEnd, eatDurationMs } = calcSimulatedEating(firstMealMs);
        elSimFastStart.innerHTML = renderTime(eatStart);
        elSimFastEnd.innerHTML = renderTime(eatEnd);
        elSimFastDuration.textContent = formatSimDuration(eatDurationMs);
    } else {
        const { fastStart, fastEnd, fastDurationMs } = calcSimulatedFast(firstMealMs, lastMealMs);
        elSimFastStart.innerHTML = renderTime(fastStart);
        elSimFastEnd.innerHTML = renderTime(fastEnd);
        elSimFastDuration.textContent = formatSimDuration(fastDurationMs);
    }
}

// Returns the maximum allowed position (in minutes) for toggle2 in potential state.
// toggle2 cannot go past firstMeal + eating window length (8h + US-3 fasting bonus).
function getMaxLastMealMins() {
    const firstMins = parseInt(elSliderFirstMeal.value);
    const firstMealMs = simState.sliderStartMs + firstMins * 60000;
    let fastingBonus = 0;
    if (appState.windowEndTime && firstMealMs > appState.windowEndTime) {
        fastingBonus = Math.floor((firstMealMs - appState.windowEndTime) / 2);
    }
    const maxLastMealMs = firstMealMs + DURATION_EATING_MS + fastingBonus;
    return Math.min(
        Math.floor((maxLastMealMs - simState.sliderStartMs) / 60000),
        parseInt(elSliderLastMeal.max)
    );
}

function formatSimDuration(ms) {
    const totalMins = Math.round(ms / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// --- Ticker ---
function tick() {
    const now = getCurrentTime();

    // Update main clock
    elCurrentTime.textContent = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Transitions & US-5 Forecasts
    if (appState.currentState === STATES.EATING) {
        if (now >= appState.windowEndTime) {
            transitionToFasting();
            return;
        }

        // US-5: Eating Window Forecast
        const currentPenalties = appState.prolongingPenaltyMs + appState.prematureStartPenaltyMs;

        if (appState.lastMealTime) {
            elForecastLastMealRow.classList.remove('hidden');
            elForecastLastMealTime.innerHTML = renderTime(appState.lastMealTime);
            const bonusLastMeal = getEatingBonusForTime(appState.lastMealTime);
            const forecastLast = appState.lastMealTime + DURATION_FASTING_MS - bonusLastMeal + currentPenalties;
            elForecastFastingEndLast.innerHTML = renderTime(forecastLast);
        } else {
            elForecastLastMealRow.classList.add('hidden');
        }

        const bonusNow = getEatingBonusForTime(now);
        const forecastNow = now + DURATION_FASTING_MS - bonusNow + currentPenalties;
        elForecastFastingEndNow.innerHTML = renderTime(forecastNow);

    } else if (appState.currentState === STATES.FASTING) {
        if (now >= appState.windowEndTime) {
            transitionToPotential();
            return;
        }

        // US-7 Real-time predictions for Break Fast options
        const originalEatingEnd = appState.lastEatingWindowTargetMs;

        // Prediction 1: Prolonging
        const predictedPenalty1 = 2 * Math.max(0, now - originalEatingEnd);
        const totalPenalty1 = predictedPenalty1 + appState.prematureStartPenaltyMs;
        elBreakProlongPenalty.textContent = `${Math.floor(totalPenalty1 / 60000)}m`;
        elBreakProlongEnd.innerHTML = renderTime(now + DURATION_FASTING_MS + totalPenalty1);

        // Prediction 2: Premature Start
        const predictedPenalty2 = 4 * Math.max(0, appState.windowEndTime - now);
        elBreakPrematurePenalty.textContent = `${Math.floor(predictedPenalty2 / 60000)}m`;
        // Interval: Starts now, Ends after (Eating 8h + Fasting 16h + Penalty 2)
        const nextFastStart = now + DURATION_EATING_MS;
        const nextFastEnd = nextFastStart + DURATION_FASTING_MS + predictedPenalty2;
        elBreakPrematureInterval.innerHTML = `${renderTime(nextFastStart)} to ${renderTime(nextFastEnd)}`;

    } else if (appState.currentState === STATES.POTENTIAL_EATING) {
        // US-3 Real-time feedback: Calculate pending bonus
        if (appState.windowEndTime && now > appState.windowEndTime) {
            const pendingBonusMs = Math.floor((now - appState.windowEndTime) / 2);
            const bonusMins = Math.floor(pendingBonusMs / (60 * 1000));
            if (bonusMins > 0) {
                elBonusText.textContent = `+${bonusMins}m pending reward`;
                elBonusBadge.classList.remove('hidden');
            } else {
                elBonusBadge.classList.add('hidden');
            }
        } else {
            elBonusBadge.classList.add('hidden');
        }

        // US-5: Potential Eating Forecast
        const pendingBonusMs = (appState.windowEndTime && now > appState.windowEndTime)
            ? Math.floor((now - appState.windowEndTime) / 2)
            : 0;
        const forecastedEatingEnd = now + DURATION_EATING_MS + pendingBonusMs;
        elForecastEatingEnd.innerHTML = renderTime(forecastedEatingEnd);
    }

    // Update timers & labels (US-9: Global updates for midnight transitions)
    if (appState.currentState === STATES.EATING || appState.currentState === STATES.FASTING) {
        const remainingMs = appState.windowEndTime - now;
        elCountdown.textContent = formatDuration(remainingMs);

        const totalDuration = appState.windowEndTime - appState.windowStartTime;
        const elapsed = now - appState.windowStartTime;
        const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

        elProgressBar.style.width = `${progressPercent}%`;
    }

    if (appState.windowStartTime && appState.windowEndTime) {
        elStartTimeVal.innerHTML = renderTime(appState.windowStartTime);
        elEndTimeVal.innerHTML = renderTime(appState.windowEndTime);
    }
}

let clickCount = 0;
let clickTimer = null;

function handleTitleClick() {
    clickCount++;
    if (clickTimer) clearTimeout(clickTimer);

    if (clickCount >= 5) {
        appState.isDebugUnlocked = !appState.isDebugUnlocked;
        saveState();
        updateUI();
        clickCount = 0;
    } else {
        clickTimer = setTimeout(() => {
            clickCount = 0;
        }, 3000);
    }
}

function updateUI() {
    const state = appState.currentState;
    elStatusCard.setAttribute('data-state', state);

    // US-8 Handle debug visibility
    if (appState.isDebugUnlocked) {
        elDebugSection.classList.add('visible');
    } else {
        elDebugSection.classList.remove('visible');
    }

    elTimerDisplay.classList.add('hidden');
    elBtnFirstMeal.classList.add('hidden');
    elBtnLastMeal.classList.add('hidden');
    elBreakFastSection.classList.add('hidden');
    elPenaltyBadge.classList.add('hidden');

    if (state === STATES.POTENTIAL_EATING) {
        elCurrentStateTitle.textContent = "Potential Eating Window";
        elStateDescription.textContent = "You can start your eating window when you are ready.";
        elBtnFirstMeal.classList.remove('hidden');
        // elBonusBadge visibility handled by tick() for real-time updates

        // US-5: Update Forecast visibility
        elForecastSection.classList.remove('hidden');
        elForecastPotentialContent.classList.remove('hidden');
        elForecastEatingContent.classList.add('hidden');
        elBtnOpenSimulator.textContent = 'Model next fasting window →';
    }
    else if (state === STATES.EATING) {
        elCurrentStateTitle.textContent = "Eating Window";

        let desc = "You have 8 hours to consume your daily meals.";

        // US-3 UI Feedback
        if (appState.fastingBonusMs > 0) {
            const bonusMins = Math.floor(appState.fastingBonusMs / (60 * 1000));
            elBonusText.textContent = `+${bonusMins}m fasting bonus applied!`;
            elBonusBadge.classList.remove('hidden');
            desc = `You earned a ${bonusMins}m bonus for prolonged fasting! Total window: ${8 + Math.floor(bonusMins / 60)}h ${bonusMins % 60}m.`;
        } else {
            elBonusBadge.classList.add('hidden');
        }

        if (appState.lastMealTime) {
            desc += ` Last meal logged at ${formatTimeOnly(appState.lastMealTime)}.`;

            // US-4 Real-time feedback in Eating state
            const pendingEatingBonus = calculateEatingBonus();
            if (pendingEatingBonus > 0) {
                const bonusMins = Math.floor(pendingEatingBonus / (60 * 1000));
                desc += ` (Will reward ${bonusMins}m shorter fast)`;
            }
        }
        elStateDescription.textContent = desc;

        elTimerLabel.textContent = "Eating Window Ends In";
        elTimerDisplay.classList.remove('hidden');
        elProgressBar.style.backgroundColor = 'var(--state-eating)';

        // elStartTimeVal/elEndTimeVal now handled by tick() for dynamic US-9 updates

        elBtnLastMeal.classList.remove('hidden');

        elBtnLastMeal.classList.remove('logged');
        elBtnLastMeal.textContent = "Log Last Meal";
        elBtnLastMeal.disabled = false;

        // Penalty badge should NOT be shown in the Eating window
        elPenaltyBadge.classList.add('hidden');

        // US-5: Update Forecast visibility
        elForecastSection.classList.remove('hidden');
        elForecastPotentialContent.classList.add('hidden');
        elForecastEatingContent.classList.remove('hidden');
        elBtnOpenSimulator.textContent = 'Model next fasting window →';
    }
    else if (state === STATES.FASTING) {
        elCurrentStateTitle.textContent = "Fasting Window";
        elStateDescription.textContent = "Time to let your body rest and digest.";

        elTimerLabel.textContent = "Fasting Target Reached In";
        elTimerDisplay.classList.remove('hidden');
        elProgressBar.style.backgroundColor = 'var(--state-fasting)';

        // elStartTimeVal/elEndTimeVal now handled by tick() for dynamic US-9 updates

        // US-4 UI Feedback
        if (appState.eatingBonusMs > 0) {
            const bonusMins = Math.floor(appState.eatingBonusMs / (60 * 1000));
            elBonusText.textContent = `-${bonusMins}m fast reward applied!`;
            elBonusBadge.classList.remove('hidden');
            elStateDescription.textContent += ` Fast shortened by ${bonusMins}m because you finished eating earlier.`;
        } else {
            elBonusBadge.classList.add('hidden');
        }

        // US-8 Penalty Badge
        if (appState.appliedPenaltyMs > 0) {
            const penaltyMins = Math.floor(appState.appliedPenaltyMs / 60000);
            elPenaltyText.textContent = `+${penaltyMins}m penalty applied!`;
            elPenaltyBadge.classList.remove('hidden');
        } else {
            elPenaltyBadge.classList.add('hidden');
        }

        // US-5/US-13: Show forecast section in fasting state (for eating window simulator link)
        elForecastSection.classList.remove('hidden');
        elForecastPotentialContent.classList.add('hidden');
        elForecastEatingContent.classList.add('hidden');
        elBtnOpenSimulator.textContent = 'Model next eating window →';

        // US-7: Show punishment section
        elBreakFastSection.classList.remove('hidden');
    }

    // US-10: Render history
    renderHistory();
}

// --- Event Listeners ---
function setupEventListeners() {
    elBtnFirstMeal.addEventListener('click', transitionToEating);
    elBtnLastMeal.addEventListener('click', logLastMeal);

    if (elBtnSubmitLog) {
        elBtnSubmitLog.addEventListener('click', submitMealLog);
    }

    if (elBtnToggleRetro) {
        elBtnToggleRetro.addEventListener('click', () => toggleRetroLog());
    }

    if (elBtnToggleBreak) {
        elBtnToggleBreak.addEventListener('click', () => toggleBreakFastLog());
    }

    if (elBtnBreakProlong) {
        elBtnBreakProlong.addEventListener('click', prolongEatingAndStartFast);
    }

    if (elBtnBreakPremature) {
        elBtnBreakPremature.addEventListener('click', startEatingPrematurely);
    }

    if (elBtnToggleHistory) {
        elBtnToggleHistory.addEventListener('click', () => toggleHistory());
    }

    if (elAppTitle) {
        elAppTitle.addEventListener('click', handleTitleClick);
    }

    const elBtnToggleManual = document.getElementById('btn-toggle-manual');
    if (elBtnToggleManual) {
        elBtnToggleManual.addEventListener('click', () => toggleManualControl());
    }

    document.getElementById('btn-debug-add-min').addEventListener('click', () => addTimeOffset(60 * 1000));
    document.getElementById('btn-debug-add-hour').addEventListener('click', () => addTimeOffset(60 * 60 * 1000));
    document.getElementById('btn-debug-add-8hour').addEventListener('click', () => addTimeOffset(8 * 60 * 60 * 1000));
    document.getElementById('btn-debug-reset').addEventListener('click', resetState);

    // US-12: Simulator
    document.getElementById('btn-open-simulator').addEventListener('click', (e) => {
        e.preventDefault();
        openSimulator();
    });
    document.getElementById('btn-close-simulator').addEventListener('click', closeSimulator);
    elSliderFirstMeal.addEventListener('input', () => {
        if (appState.currentState === STATES.FASTING) {
            // US-13: Coupled sliders — eating start drives eating end
            const t1 = parseInt(elSliderFirstMeal.value);
            const fastingBonusMins = Math.max(0, Math.floor(t1 / 2));
            elSliderLastMeal.value = Math.min(parseInt(elSliderLastMeal.max), t1 + 480 + fastingBonusMins);
        } else {
            if (parseInt(elSliderFirstMeal.value) > parseInt(elSliderLastMeal.value)) {
                elSliderLastMeal.value = elSliderFirstMeal.value;
            }
            if (appState.currentState === STATES.POTENTIAL_EATING) {
                const maxLast = getMaxLastMealMins();
                if (parseInt(elSliderLastMeal.value) > maxLast) {
                    elSliderLastMeal.value = maxLast;
                }
            }
        }
        updateSimulatorOutput();
    });
    elSliderLastMeal.addEventListener('input', () => {
        if (appState.currentState === STATES.FASTING) {
            // US-13: Coupled sliders — desired eating end back-calculates eating start
            const t2 = parseInt(elSliderLastMeal.value);
            const t1 = t2 <= 480 ? 0 : Math.max(0, Math.round((t2 - 480) * 2 / 3));
            elSliderFirstMeal.value = t1;
            // Recompute actual t2 from t1 to correct any rounding
            const fastingBonusMins = Math.max(0, Math.floor(t1 / 2));
            elSliderLastMeal.value = Math.min(parseInt(elSliderLastMeal.max), t1 + 480 + fastingBonusMins);
        } else {
            if (parseInt(elSliderLastMeal.value) < parseInt(elSliderFirstMeal.value)) {
                elSliderLastMeal.value = elSliderFirstMeal.value;
            }
            if (appState.currentState === STATES.POTENTIAL_EATING) {
                const maxLast = getMaxLastMealMins();
                if (parseInt(elSliderLastMeal.value) > maxLast) {
                    elSliderLastMeal.value = maxLast;
                }
            }
            if (appState.currentState === STATES.EATING && simState.lastMealMinMins > 0) {
                if (parseInt(elSliderLastMeal.value) < simState.lastMealMinMins) {
                    elSliderLastMeal.value = simState.lastMealMinMins;
                }
            }
        }
        updateSimulatorOutput();
    });
}

function addTimeOffset(ms) {
    appState.timeOffsetMs += ms;
    document.getElementById('time-offset-val').textContent = appState.timeOffsetMs;
    saveState();
    tick(); // Force immediate tick to process transitions
}

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

// Boot up
document.addEventListener('DOMContentLoaded', init);
