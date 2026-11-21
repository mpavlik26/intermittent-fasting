// US-21: whether the last updateUI() rendered the explicitly-ended-fast hint (null = not rendered yet)
let explicitEndRendered = null;

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
        const originalEatingEnd = appState.lastEatingWindowTargetMs ?? appState.windowStartTime; // null-safe: no E → no overshoot

        // Prediction 1: Prolonging — the new Eating penalty is deferred to the next Eating
        // window; it does NOT extend this restarted Fasting window
        const predictedEatingPenalty = PROLONGING_PENALTY_MULTIPLIER * Math.max(0, now - originalEatingEnd);
        elBreakProlongPenalty.textContent = formatMinutesBadge(Math.floor(predictedEatingPenalty / 60000));
        const prolongRestartedEnd = now + DURATION_FASTING_MS - appState.fastingBonusMs + appState.fastingPenaltyMs;
        elBreakProlongEnd.innerHTML = renderTime(prolongRestartedEnd);

        // US-21: the "resume eating" hint / Option 2 card depend on now < E, which flips
        // while the state stays FASTING — re-render once when that happens
        if (isExplicitlyEndedFast() !== explicitEndRendered) {
            updateUI();
        }

        // US-21: before E, prolonging is free and the Eating bonus is recalculated as E - now
        if (elBreakProlongBonusNote) {
            const beforeE = isExplicitlyEndedFast();
            elBreakProlongBonusNote.classList.toggle('hidden', !beforeE);
            if (beforeE) {
                elBreakProlongBonus.textContent = formatMinutesBadge(Math.floor(getEatingBonusForTime(now) / 60000));
            }
        }

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

        // US-5/US-20: Potential Eating Forecast — exactly the window transitionToEating() would
        // create now: banked/stored Eating bonus, Eating penalty and cascade-skips all included
        const bonusForForecastMs = pendingFastingBonusMs > 0 ? pendingFastingBonusMs : appState.fastingBonusMs;
        elForecastEatingEnd.innerHTML = renderTime(planEatingWindow(now, bonusForForecastMs).endTime);
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

    updateEndStoreIcon();
}

// US-22: storage icon + arrow next to the end time. Eating: arrow left (store Eating time),
// Fasting: arrow right (store Fasting time), Potential: no icon, end time not clickable.
function updateEndStoreIcon() {
    if (!elEndStoreIcon) return;
    const state = appState.currentState;
    const active = state === STATES.EATING || state === STATES.FASTING;
    elEndStoreIcon.classList.toggle('hidden', !active);
    if (elEndTimeBlock) elEndTimeBlock.classList.toggle('store-enabled', active);
    if (!active) return;
    const bonusType = state === STATES.EATING ? 'eating' : 'fasting';
    elEndStoreArrow.textContent = state === STATES.EATING ? '←' : '→';
    elEndStoreIcon.classList.toggle('disabled', !canOpenAmountPicker('store', bonusType));
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
    if (elBtnEndEating) elBtnEndEating.classList.add('hidden'); // US-21
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

        // Real window length (8h + Eating bonus - Eating penalty + 8h per cascade-skip)
        const totalMins = Math.round((appState.windowEndTime - appState.windowStartTime) / 60000);
        let desc = totalMins === 480
            ? "You have 8 hours to consume your daily meals."
            : `You have ${formatMinutesBadge(totalMins)} to consume your daily meals.`;

        // US-4/US-20 UI Feedback: Eating bonus extends THIS Eating window
        // (eatingBonusMs itself is already consumed/reset on entry, so the amount applied to
        // this window lives in appliedEatingBonusMs; it is informational only.)
        if (appState.appliedEatingBonusMs > 0) {
            const bonusMins = Math.floor(appState.appliedEatingBonusMs / (60 * 1000));
            elEatingBonusText.textContent = `+${formatMinutesBadge(bonusMins)} eating bonus applied!`;
            elEatingBonusBadge.classList.remove('hidden');
            desc = `You earned a ${formatMinutesBadge(bonusMins)} bonus for finishing eating early! Total window: ${formatMinutesBadge(totalMins)}.`;
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
        if (elBtnEndEating) elBtnEndEating.classList.remove('hidden'); // US-21

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

        // US-21: Fasting was started by explicitly ending the Eating window before it ran out
        // -> explain how to get back to eating (only possible until the original end E)
        const explicitlyEnded = isExplicitlyEndedFast();
        explicitEndRendered = explicitlyEnded;
        if (explicitlyEnded) {
            elStateDescription.innerHTML = 'Time to let your body rest and digest. ' +
                '<span id="explicit-end-hint">Changed your mind? Until ' +
                renderTime(appState.lastEatingWindowTargetMs) +
                " you can go back to eating: open 'Break Fast Prematurely' and choose " +
                "'Option 1: Prolong Eating' (Prolong &amp; Start Fast).</span>";
        }
        // Option 2 (start a new Eating window early) is only offered once the original Eating
        // window would have ended; before that only prolonging is possible.
        if (elBreakPrematureCard) elBreakPrematureCard.classList.toggle('hidden', explicitlyEnded);

        elTimerLabel.textContent = "Fasting Target Reached In";
        elTimerDisplay.classList.remove('hidden');
        elProgressBar.style.backgroundColor = 'var(--state-fasting)';

        // elStartTimeVal/elEndTimeVal now handled by tick() for dynamic US-9 updates

        // US-3/US-20 UI Feedback: Fasting bonus shortened THIS Fasting window
        if (appState.fastingBonusMs > 0) {
            const bonusMins = Math.floor(appState.fastingBonusMs / (60 * 1000));
            elFastingBonusText.textContent = `-${formatMinutesBadge(bonusMins)} fasting bonus applied!`;
            elFastingBonusBadge.classList.remove('hidden');
            elStateDescription.insertAdjacentText('beforeend', ` Fast shortened by ${formatMinutesBadge(bonusMins)} because you finished eating earlier.`);
        } else {
            elFastingBonusBadge.classList.add('hidden');
        }

        // US-20: Eating bonus banked by finishing early, waiting for the next Eating window.
        // US-22: informational only (no longer storable).
        if (appState.eatingBonusMs > 0) {
            const bonusMins = Math.floor(appState.eatingBonusMs / (60 * 1000));
            elEatingBonusText.textContent = `+${formatMinutesBadge(bonusMins)} eating bonus banked!`;
            elEatingBonusBadge.classList.remove('hidden');
        } else {
            elEatingBonusBadge.classList.add('hidden');
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
