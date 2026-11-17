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
            // US-13/US-20: Coupled sliders — eating start drives eating end (1:1, no bonus coupling)
            const t1 = parseInt(elSliderFirstMeal.value);
            elSliderLastMeal.value = Math.min(parseInt(elSliderLastMeal.max), t1 + 480);
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
            // US-13/US-20: Coupled sliders — desired eating end back-calculates eating start (1:1)
            const t2 = parseInt(elSliderLastMeal.value);
            const t1 = Math.max(0, t2 - 480);
            elSliderFirstMeal.value = t1;
            elSliderLastMeal.value = Math.min(parseInt(elSliderLastMeal.max), t1 + 480);
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

    // US-20: Store flow — click a bonus badge to move it into its own storage pool
    if (elFastingBonusBadge) {
        elFastingBonusBadge.addEventListener('click', () => {
            if (appState.currentState === STATES.FASTING && appState.fastingBonusMs > 0 && canOpenAmountPicker('store', 'fasting')) {
                openAmountPicker('store', 'fasting');
            }
        });
    }
    if (elEatingBonusBadge) {
        elEatingBonusBadge.addEventListener('click', () => {
            if (appState.currentState === STATES.FASTING && appState.eatingBonusMs > 0 && canOpenAmountPicker('store', 'eating')) {
                openAmountPicker('store', 'eating');
            }
        });
    }

    // US-20: Use flow — click a stored-bonus header indicator to spend it
    if (elStoredFastingBonusIndicator) {
        elStoredFastingBonusIndicator.addEventListener('click', () => {
            if (appState.storedFastingBonusMs > 0 && canOpenAmountPicker('use', 'fasting')) {
                openAmountPicker('use', 'fasting');
            }
        });
    }
    if (elStoredEatingBonusIndicator) {
        elStoredEatingBonusIndicator.addEventListener('click', () => {
            if (appState.storedEatingBonusMs > 0 && canOpenAmountPicker('use', 'eating')) {
                openAmountPicker('use', 'eating');
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
