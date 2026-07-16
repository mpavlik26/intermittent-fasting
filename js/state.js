// --- Constants ---
console.log("APP_VERSION: US-18-ver-3");
const STATES = {
    POTENTIAL_EATING: 'potential',
    EATING: 'eating',
    FASTING: 'fasting'
};

const DURATION_EATING_MS = 8 * 60 * 60 * 1000;
const DURATION_FASTING_MS = 16 * 60 * 60 * 1000;

const BONUS_DIVISOR = 2; // US-3/US-4: bonus = half of excess/early time
const PROLONGING_PENALTY_MULTIPLIER = 2; // US-7 Option 1
const PREMATURE_START_PENALTY_MULTIPLIER = 2; // US-7 Option 2 (was 4, halved by US-17)

// --- State Variables ---
let appState = {
    currentState: STATES.POTENTIAL_EATING,
    windowStartTime: null,
    windowEndTime: null,
    lastMealTime: null,
    fastingBonusMs: 0,
    eatingBonusMs: 0,
    storedBonusMs: 0, // US-18: Bonus minutes moved into personal storage
    pendingUseMs: 0, // US-18: Stored minutes reserved for next Eating window
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

// US-18: Amount picker state (not persisted)
let amountPickerMode = null; // 'store' | 'use'
let amountPickerMaxMinutes = 0;
let amountPickerValueMinutes = 0;

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

// US-18 DOM Elements
const elStoredBonusIndicator = document.getElementById('stored-bonus-indicator');
const elAmountPickerOverlay = document.getElementById('amount-picker-overlay');
const elAmountPickerTitle = document.getElementById('amount-picker-title');
const elAmountPickerClose = document.getElementById('amount-picker-close');
const elAmountPickerSlider = document.getElementById('amount-picker-slider');
const elAmountPickerFill = document.getElementById('amount-picker-fill');
const elAmountPickerValue = document.getElementById('amount-picker-value');
const elAmountPickerMinus = document.getElementById('amount-picker-minus');
const elAmountPickerPlus = document.getElementById('amount-picker-plus');
const elAmountPickerConfirm = document.getElementById('amount-picker-confirm');

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
        storedBonusMs: 0,
        pendingUseMs: 0,
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
