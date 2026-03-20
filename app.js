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
    lastEatingWindowTargetMs: null,
    timeOffsetMs: 0
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
        lastEatingWindowTargetMs: null,
        timeOffsetMs: 0
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
    appState.lastEatingWindowTargetMs = targetEndTime;
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
        appState.windowEndTime = timeToUse + DURATION_FASTING_MS - appState.eatingBonusMs;
    } else if (appState.currentState === STATES.POTENTIAL_EATING) {
        const eatingBonus = calculateEatingBonus();
        const fastingEnd = timeToUse + DURATION_FASTING_MS - eatingBonus;
        if (getCurrentTime() < fastingEnd) {
            appState.currentState = STATES.FASTING;
            appState.windowStartTime = timeToUse;
            appState.eatingBonusMs = eatingBonus;
            appState.windowEndTime = fastingEnd;
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

    // US-4: Calculate reward for shorter eating window
    appState.eatingBonusMs = calculateEatingBonus();
    appState.windowEndTime = baseStartTime + DURATION_FASTING_MS - appState.eatingBonusMs;

    console.log("Fasting windowEndTime set to:", formatTimeOnly(appState.windowEndTime));

    appState.fastingBonusMs = 0; // Reset bonus for new cycle
    saveState();
    updateUI();
}

function transitionToPotential() {
    appState.currentState = STATES.POTENTIAL_EATING;
    // Keep windowStartTime and windowEndTime to calculate US-3 bonus later
    appState.lastMealTime = null;
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
    tick(); // Fast-forward state if needed
}

// --- Ticker ---
function tick() {
    const now = getCurrentTime();

    // Update main clock
    elCurrentTime.textContent = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Transitions
    if (appState.currentState === STATES.EATING) {
        if (now >= appState.windowEndTime) {
            transitionToFasting();
            return;
        }
    } else if (appState.currentState === STATES.FASTING) {
        if (now >= appState.windowEndTime) {
            transitionToPotential();
            return;
        }
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
        elForecastEatingEnd.textContent = formatTimeOnly(forecastedEatingEnd);

    } else if (appState.currentState === STATES.EATING) {
        // US-5: Eating Window Forecast
        if (appState.lastMealTime) {
            elForecastLastMealRow.classList.remove('hidden');
            elForecastLastMealTime.textContent = formatTimeOnly(appState.lastMealTime);
            const bonusLastMeal = getEatingBonusForTime(appState.lastMealTime);
            const forecastLast = appState.lastMealTime + DURATION_FASTING_MS - bonusLastMeal;
            elForecastFastingEndLast.textContent = formatTimeOnly(forecastLast);
        } else {
            elForecastLastMealRow.classList.add('hidden');
        }

        const bonusNow = getEatingBonusForTime(now);
        const forecastNow = now + DURATION_FASTING_MS - bonusNow;
        elForecastFastingEndNow.textContent = formatTimeOnly(forecastNow);
    }

    // Update timers
    if (appState.currentState === STATES.EATING || appState.currentState === STATES.FASTING) {
        const remainingMs = appState.windowEndTime - now;
        elCountdown.textContent = formatDuration(remainingMs);

        const totalDuration = appState.windowEndTime - appState.windowStartTime;
        const elapsed = now - appState.windowStartTime;
        const progressPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

        elProgressBar.style.width = `${progressPercent}%`;
    }
}

// --- UI Updates ---
function updateUI() {
    const state = appState.currentState;
    elStatusCard.setAttribute('data-state', state);

    elTimerDisplay.classList.add('hidden');
    elBtnFirstMeal.classList.add('hidden');
    elBtnLastMeal.classList.add('hidden');

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

        elStartTimeVal.textContent = formatTimeOnly(appState.windowStartTime);
        elEndTimeVal.textContent = formatTimeOnly(appState.windowEndTime);

        elBtnLastMeal.classList.remove('hidden');

        elBtnLastMeal.classList.remove('logged');
        elBtnLastMeal.textContent = "Log Last Meal";
        elBtnLastMeal.disabled = false;

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

        elStartTimeVal.textContent = formatTimeOnly(appState.windowStartTime);
        elEndTimeVal.textContent = formatTimeOnly(appState.windowEndTime);

        // US-4 UI Feedback
        if (appState.eatingBonusMs > 0) {
            const bonusMins = Math.floor(appState.eatingBonusMs / (60 * 1000));
            elBonusText.textContent = `-${bonusMins}m fast reward applied!`;
            elBonusBadge.classList.remove('hidden');
            elStateDescription.textContent += ` Fast shortened by ${bonusMins}m because you finished eating earlier.`;
        } else {
            elBonusBadge.classList.add('hidden');
        }

        // US-5: Update Forecast visibility
        elForecastSection.classList.add('hidden');
    }

}

// --- Event Listeners ---
function setupEventListeners() {
    elBtnFirstMeal.addEventListener('click', transitionToEating);
    elBtnLastMeal.addEventListener('click', logLastMeal);

    if (elBtnSubmitLog) {
        elBtnSubmitLog.addEventListener('click', submitMealLog);
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
