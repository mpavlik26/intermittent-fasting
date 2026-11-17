// --- Ticker ---
function tick() {
    const now = getCurrentTime();

    // Update main clock
    elCurrentTime.textContent = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Transitions & US-5/US-20 Forecasts
    if (appState.currentState === STATES.EATING) {
        if (now >= appState.windowEndTime) {
            transitionToFasting();
            return;
        }

        // US-5/US-20: Eating Window Forecast — eventual Fasting window length, from live
        // Fasting bonus/penalty fields only (Eating penalty no longer affects Fasting window length)
        const fastingBonusMs = appState.fastingBonusMs + appState.pendingFastingBonusUseMs;
        const fastingPenaltyMs = appState.fastingPenaltyMs;

        if (appState.lastMealTime) {
            elForecastLastMealRow.classList.remove('hidden');
            elForecastLastMealTime.innerHTML = renderTime(appState.lastMealTime);
            const forecastLast = appState.lastMealTime + DURATION_FASTING_MS - fastingBonusMs + fastingPenaltyMs;
            elForecastFastingEndLast.innerHTML = renderTime(forecastLast);
        } else {
            elForecastLastMealRow.classList.add('hidden');
        }

        const forecastNow = now + DURATION_FASTING_MS - fastingBonusMs + fastingPenaltyMs;
        elForecastFastingEndNow.innerHTML = renderTime(forecastNow);

    } else if (appState.currentState === STATES.FASTING) {
        if (now >= appState.windowEndTime) {
            transitionToPotential();
            return;
        }

        // US-7/US-20 Real-time predictions for Break Fast options
        const originalEatingEnd = appState.lastEatingWindowTargetMs;

        // Prediction 1: Prolonging — the new Eating penalty is deferred to the next Eating
        // window; it does NOT extend this restarted Fasting window
        const predictedEatingPenalty = PROLONGING_PENALTY_MULTIPLIER * Math.max(0, now - originalEatingEnd);
        elBreakProlongPenalty.textContent = formatMinutesBadge(Math.floor(predictedEatingPenalty / 60000));
        const prolongRestartedEnd = now + DURATION_FASTING_MS - appState.fastingBonusMs + appState.fastingPenaltyMs;
        elBreakProlongEnd.innerHTML = renderTime(prolongRestartedEnd);

        // Prediction 2: Premature Start — the new Fasting penalty is deferred to the next
        // Fasting window (after the upcoming standard Eating window)
        const predictedFastingPenalty = PREMATURE_START_PENALTY_MULTIPLIER * Math.max(0, appState.windowEndTime - now);
        elBreakPrematurePenalty.textContent = formatMinutesBadge(Math.floor(predictedFastingPenalty / 60000));
        // Interval: Starts now, Ends after (Eating 8h + Fasting 16h + Penalty)
        const nextFastStart = now + DURATION_EATING_MS;
        const nextFastEnd = nextFastStart + DURATION_FASTING_MS + predictedFastingPenalty;
        elBreakPrematureInterval.innerHTML = `${renderTime(nextFastStart)} to ${renderTime(nextFastEnd)}`;

    } else if (appState.currentState === STATES.POTENTIAL_EATING) {
        // US-3/US-20 Real-time feedback: pending Fasting bonus (no divisor, full 1:1)
        const pendingFastingBonusMs = (appState.windowEndTime && now > appState.windowEndTime)
            ? (now - appState.windowEndTime)
            : 0;
        if (pendingFastingBonusMs > 0) {
            const bonusMins = Math.floor(pendingFastingBonusMs / (60 * 1000));
            if (bonusMins > 0) {
                elFastingBonusText.textContent = `+${formatMinutesBadge(bonusMins)} pending reward`;
                elFastingBonusBadge.classList.remove('hidden');
            } else {
                elFastingBonusBadge.classList.add('hidden');
            }
        } else {
            elFastingBonusBadge.classList.add('hidden');
        }

        // US-5/US-20: Potential Eating Forecast — eager cascade-skip preview of the eventual
        // Eating window end if the pending Fasting bonus is larger than a standard Fasting window
        const { skips } = cascadeSkip(pendingFastingBonusMs, DURATION_FASTING_MS);
        const forecastedEatingEnd = now + DURATION_EATING_MS + skips * DURATION_EATING_MS;
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

function setupHoldToConfirm(btn, action, defaultLabel) {
    let countdownInterval = null;
    let remaining = 3;

    const cancel = () => {
        if (!countdownInterval) return;
        clearInterval(countdownInterval);
        countdownInterval = null;
        remaining = 3;
        btn.textContent = defaultLabel;
        btn.classList.remove('counting-down');
    };

    const start = (e) => {
        e.preventDefault();
        if (countdownInterval) return;
        remaining = 3;
        btn.textContent = String(remaining);
        btn.classList.add('counting-down');
        countdownInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                cancel();
                action();
            } else {
                btn.textContent = String(remaining);
            }
        }, 1000);
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('mouseup', cancel);
    btn.addEventListener('mouseleave', cancel);
    btn.addEventListener('touchend', cancel);
    btn.addEventListener('touchcancel', cancel);
}

function updateUI() {
    const state = appState.currentState;
    elStatusCard.setAttribute('data-state', state);
    updateStoredBonusIndicators();

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
    elFastingBonusBadge.classList.add('hidden');
    elEatingBonusBadge.classList.add('hidden');
    elFastingPenaltyBadge.classList.add('hidden');
    elEatingPenaltyBadge.classList.add('hidden');

    if (state === STATES.POTENTIAL_EATING) {
        elCurrentStateTitle.textContent = "Potential Eating Window";
        elStateDescription.textContent = "You can start your eating window when you are ready.";
        elBtnFirstMeal.classList.remove('hidden');
        // elFastingBonusBadge visibility handled by tick() for real-time updates

        // US-5: Update Forecast visibility
        elForecastSection.classList.remove('hidden');
        elForecastPotentialContent.classList.remove('hidden');
        elForecastEatingContent.classList.add('hidden');
        elBtnOpenSimulator.textContent = 'Model next fasting window →';
    }
    else if (state === STATES.EATING) {
        elCurrentStateTitle.textContent = "Eating Window";

        let desc = "You have 8 hours to consume your daily meals.";

        // US-4/US-20 UI Feedback: Eating bonus extends THIS Eating window
        // (eatingBonusMs itself is already consumed/reset on entry, so the amount applied to
        // this window lives in appliedEatingBonusMs; it is informational, not storable.)
        elEatingBonusBadge.classList.remove('storable');
        if (appState.appliedEatingBonusMs > 0) {
            const bonusMins = Math.floor(appState.appliedEatingBonusMs / (60 * 1000));
            elEatingBonusText.textContent = `+${formatMinutesBadge(bonusMins)} eating bonus applied!`;
            elEatingBonusBadge.classList.remove('hidden');
            desc = `You earned a ${formatMinutesBadge(bonusMins)} bonus for finishing eating early! Total window: ${formatMinutesBadge(480 + bonusMins)}.`;
        } else {
            elEatingBonusBadge.classList.add('hidden');
        }

        // US-20 Penalty Badge: Eating penalty shortened THIS Eating window
        if (appState.appliedEatingPenaltyMs > 0) {
            const penaltyMins = Math.floor(appState.appliedEatingPenaltyMs / 60000);
            elEatingPenaltyText.textContent = `-${formatMinutesBadge(penaltyMins)} penalty applied!`;
            elEatingPenaltyBadge.classList.remove('hidden');
        } else {
            elEatingPenaltyBadge.classList.add('hidden');
        }

        if (appState.lastMealTime) {
            desc += ` Last meal logged at ${formatTimeOnly(appState.lastMealTime)}.`;

            // US-4/US-20 Real-time feedback in Eating state
            const pendingEatingBonus = calculateEatingBonus();
            if (pendingEatingBonus > 0) {
                const bonusMins = Math.floor(pendingEatingBonus / (60 * 1000));
                desc += ` (Will reward ${formatMinutesBadge(bonusMins)} longer next eating window)`;
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

        // US-3/US-20 UI Feedback: Fasting bonus shortened THIS Fasting window
        if (appState.fastingBonusMs > 0) {
            const bonusMins = Math.floor(appState.fastingBonusMs / (60 * 1000));
            elFastingBonusText.textContent = `-${formatMinutesBadge(bonusMins)} fasting bonus applied!`;
            elFastingBonusBadge.classList.remove('hidden');
            elFastingBonusBadge.classList.toggle('storable', canOpenAmountPicker('store', 'fasting')); // US-18: Click to move into storage
            elStateDescription.textContent += ` Fast shortened by ${formatMinutesBadge(bonusMins)} because you finished eating earlier.`;
        } else {
            elFastingBonusBadge.classList.add('hidden');
            elFastingBonusBadge.classList.remove('storable');
        }

        // US-20: Eating bonus banked by finishing early, waiting for the next Eating window.
        // Storable (US-18) — this is where "Move Eating Bonus to Storage" is reachable.
        if (appState.eatingBonusMs > 0) {
            const bonusMins = Math.floor(appState.eatingBonusMs / (60 * 1000));
            elEatingBonusText.textContent = `+${formatMinutesBadge(bonusMins)} eating bonus banked!`;
            elEatingBonusBadge.classList.remove('hidden');
            elEatingBonusBadge.classList.toggle('storable', canOpenAmountPicker('store', 'eating'));
        } else {
            elEatingBonusBadge.classList.add('hidden');
            elEatingBonusBadge.classList.remove('storable');
        }

        // US-8/US-20 Penalty Badge: Fasting penalty extended THIS Fasting window
        if (appState.appliedFastingPenaltyMs > 0) {
            const penaltyMins = Math.floor(appState.appliedFastingPenaltyMs / 60000);
            elFastingPenaltyText.textContent = `+${formatMinutesBadge(penaltyMins)} penalty applied!`;
            elFastingPenaltyBadge.classList.remove('hidden');
        } else {
            elFastingPenaltyBadge.classList.add('hidden');
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
