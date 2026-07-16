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
        const predictedPenalty1 = PROLONGING_PENALTY_MULTIPLIER * Math.max(0, now - originalEatingEnd);
        const totalPenalty1 = predictedPenalty1 + appState.prematureStartPenaltyMs;
        elBreakProlongPenalty.textContent = `${Math.floor(totalPenalty1 / 60000)}m`;
        elBreakProlongEnd.innerHTML = renderTime(now + DURATION_FASTING_MS + totalPenalty1);

        // Prediction 2: Premature Start
        const predictedPenalty2 = PREMATURE_START_PENALTY_MULTIPLIER * Math.max(0, appState.windowEndTime - now);
        elBreakPrematurePenalty.textContent = `${Math.floor(predictedPenalty2 / 60000)}m`;
        // Interval: Starts now, Ends after (Eating 8h + Fasting 16h + Penalty 2)
        const nextFastStart = now + DURATION_EATING_MS;
        const nextFastEnd = nextFastStart + DURATION_FASTING_MS + predictedPenalty2;
        elBreakPrematureInterval.innerHTML = `${renderTime(nextFastStart)} to ${renderTime(nextFastEnd)}`;

    } else if (appState.currentState === STATES.POTENTIAL_EATING) {
        // US-3 Real-time feedback: Calculate pending bonus
        if (appState.windowEndTime && now > appState.windowEndTime) {
            const pendingBonusMs = Math.floor((now - appState.windowEndTime) / BONUS_DIVISOR);
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
            ? Math.floor((now - appState.windowEndTime) / BONUS_DIVISOR)
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
    updateStoredBonusIndicator();

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
            elBonusBadge.classList.add('storable'); // US-18: Click to move into storage
            desc = `You earned a ${bonusMins}m bonus for prolonged fasting! Total window: ${8 + Math.floor(bonusMins / 60)}h ${bonusMins % 60}m.`;
        } else {
            elBonusBadge.classList.add('hidden');
            elBonusBadge.classList.remove('storable');
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
            elBonusBadge.classList.add('storable'); // US-18: Click to move into storage
            elStateDescription.textContent += ` Fast shortened by ${bonusMins}m because you finished eating earlier.`;
        } else {
            elBonusBadge.classList.add('hidden');
            elBonusBadge.classList.remove('storable');
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
