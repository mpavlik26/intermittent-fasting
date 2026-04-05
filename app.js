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
    isDebugUnlocked: false // US-8: Secret toggle
};

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
    }
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
        isDebugUnlocked: appState.isDebugUnlocked // US-8: Preserve unlocked state across app resets if desired, or set to false
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
    appState.currentState = STATES.FASTING;
    const baseStartTime = appState.lastMealTime ? appState.lastMealTime : appState.windowEndTime;
    appState.windowStartTime = baseStartTime;

    // US-4 & US-7: Base duration + Penalty - Bonus
    appState.eatingBonusMs = calculateEatingBonus();
    const totalPenalty = appState.prolongingPenaltyMs + appState.prematureStartPenaltyMs;
    appState.windowEndTime = baseStartTime + DURATION_FASTING_MS - appState.eatingBonusMs + totalPenalty;
    appState.appliedPenaltyMs = totalPenalty;

    appState.fastingBonusMs = 0; // Reset for new cycle
    saveState();
    updateUI();
}

function transitionToPotential() {
    appState.currentState = STATES.POTENTIAL_EATING;
    appState.lastMealTime = null;

    // US-7: Clear all penalties only after completing a fast
    appState.prolongingPenaltyMs = 0;
    appState.prematureStartPenaltyMs = 0;
    appState.appliedPenaltyMs = 0;

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
    const isExpanded = typeof forceValue === 'boolean' ? forceValue : elRetroLogContent.classList.contains('collapsed');

    if (isExpanded) {
        elRetroLogContent.classList.remove('collapsed');
        elBtnToggleRetro.classList.add('active');
        elBtnToggleRetro.querySelector('.btn-text').textContent = "Close Retrospective Log";
    } else {
        elRetroLogContent.classList.add('collapsed');
        elBtnToggleRetro.classList.remove('active');
        elBtnToggleRetro.querySelector('.btn-text').textContent = "Add Retrospective Log";
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

    toggleBreakFastLog(false);
    saveState();
    updateUI();
}

function prolongEatingAndStartFast() {
    const now = getCurrentTime();
    const originalTargetEnd = appState.lastEatingWindowTargetMs;

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

        // US-5: Update Forecast visibility
        elForecastSection.classList.add('hidden');

        // US-7: Show punishment section
        elBreakFastSection.classList.remove('hidden');
    }

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

    if (elAppTitle) {
        elAppTitle.addEventListener('click', handleTitleClick);
    }

    document.getElementById('btn-debug-add-min').addEventListener('click', () => addTimeOffset(60 * 1000));
    document.getElementById('btn-debug-add-hour').addEventListener('click', () => addTimeOffset(60 * 60 * 1000));
    document.getElementById('btn-debug-add-8hour').addEventListener('click', () => addTimeOffset(8 * 60 * 60 * 1000));
    document.getElementById('btn-debug-reset').addEventListener('click', resetState);
}

function addTimeOffset(ms) {
    appState.timeOffsetMs += ms;
    document.getElementById('time-offset-val').textContent = appState.timeOffsetMs;
    saveState();
    tick(); // Force immediate tick to process transitions
}

// Boot up
document.addEventListener('DOMContentLoaded', init);
