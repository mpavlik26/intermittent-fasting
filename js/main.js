// --- Initialization ---
function init() {
    loadState();
    setupEventListeners();
    initAppVersionDisplay();

    // Start Ticker
    setInterval(tick, 1000);
    tick(); // Initial call
}

// US-16: Read the live cache name (sw.js's CACHE_NAME) via the Cache Storage API
function initAppVersionDisplay() {
    const el = document.getElementById('app-version-val');
    if (!el) return;
    if (!('serviceWorker' in navigator) || !('caches' in window)) {
        el.textContent = 'N/A';
        return;
    }
    navigator.serviceWorker.ready
        .then(() => caches.keys())
        .then((cacheNames) => {
            el.textContent = cacheNames[0] || 'unregistered';
        })
        .catch(() => {
            el.textContent = 'unknown';
        });
}

// --- Event Listeners ---
function setupEventListeners() {
    setupHoldToConfirm(elBtnFirstMeal, transitionToEating, 'Log First Meal');
    setupHoldToConfirm(elBtnLastMeal, logLastMeal, 'Log Last Meal');

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

    // US-18: Store flow — click the applied bonus badge to move it into storage
    elBonusBadge.addEventListener('click', () => {
        if (appState.currentState === STATES.EATING && appState.fastingBonusMs > 0) {
            openAmountPicker('store');
        } else if (appState.currentState === STATES.FASTING && appState.eatingBonusMs > 0) {
            openAmountPicker('store');
        }
    });

    // US-18: Use flow — click the stored-bonus header indicator to spend it
    if (elStoredBonusIndicator) {
        elStoredBonusIndicator.addEventListener('click', () => {
            if (appState.storedBonusMs > 0) {
                openAmountPicker('use');
            }
        });
    }

    if (elAmountPickerClose) {
        elAmountPickerClose.addEventListener('click', closeAmountPicker);
    }
    if (elAmountPickerConfirm) {
        elAmountPickerConfirm.addEventListener('click', confirmAmountPicker);
    }
    if (elAmountPickerMinus) {
        elAmountPickerMinus.addEventListener('click', () => adjustAmountPicker(-1));
    }
    if (elAmountPickerPlus) {
        elAmountPickerPlus.addEventListener('click', () => adjustAmountPicker(1));
    }
    if (elAmountPickerSlider) {
        elAmountPickerSlider.addEventListener('input', () => {
            amountPickerValueMinutes = parseInt(elAmountPickerSlider.value);
            renderAmountPicker();
        });
    }
}

function addTimeOffset(ms) {
    appState.timeOffsetMs += ms;
    document.getElementById('time-offset-val').textContent = appState.timeOffsetMs;
    saveState();
    tick(); // Force immediate tick to process transitions
}

// Boot up
document.addEventListener('DOMContentLoaded', init);
