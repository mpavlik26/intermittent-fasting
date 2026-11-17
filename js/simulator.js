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

// US-20: In Potential Eating, a late first meal earns a Fasting bonus (1:1). Every full 16h of it
// cascade-skips a whole Fasting/Eating pair, extending the modeled Eating window by 8h; only the
// remainder is left to shorten the following fast.
function getModeledFirstMealEffects(firstMealMs) {
    const delayMs = appState.windowEndTime && firstMealMs > appState.windowEndTime
        ? firstMealMs - appState.windowEndTime
        : 0;
    const { skips, remainderMs } = cascadeSkip(delayMs, DURATION_FASTING_MS);
    return {
        eatingEndMs: firstMealMs + DURATION_EATING_MS + skips * DURATION_EATING_MS,
        fastingBonusMs: delayMs > 0 ? remainderMs : appState.fastingBonusMs,
    };
}

function calcSimulatedFast(firstMealMs, lastMealMs) {
    let effectiveEatingEnd;
    let fastingBonusMs;

    if (appState.currentState === STATES.POTENTIAL_EATING) {
        const effects = getModeledFirstMealEffects(firstMealMs);
        effectiveEatingEnd = effects.eatingEndMs;
        fastingBonusMs = effects.fastingBonusMs;
    } else {
        effectiveEatingEnd = appState.windowEndTime;
        fastingBonusMs = appState.fastingBonusMs;
    }

    // US-20: finishing eating early banks an Eating bonus for the NEXT eating window —
    // it no longer shortens this fast. Only the Fasting bonus/penalty pool does.
    const eatingBonusBankedMs = lastMealMs < effectiveEatingEnd
        ? effectiveEatingEnd - lastMealMs
        : 0;

    const fastStart = lastMealMs;
    const fastEnd = lastMealMs + DURATION_FASTING_MS - fastingBonusMs + appState.fastingPenaltyMs;
    return { fastStart, fastEnd, fastDurationMs: fastEnd - fastStart, eatingBonusBankedMs };
}

// US-13: Calculate the modeled eating window when in Fasting state.
// firstMealMs = when user plans to eat after fasting ends (sliderStartMs = fasting window end).
// US-20: delaying the first meal earns a Fasting bonus that shortens the *next* Fasting
// window, not this modeled Eating window — exposed separately as nextFastShortenedByMs.
function calcSimulatedEating(firstMealMs) {
    const nextFastShortenedByMs = Math.max(0, firstMealMs - simState.sliderStartMs);
    const eatStart = firstMealMs;
    const eatEnd = firstMealMs + DURATION_EATING_MS;
    return { eatStart, eatEnd, eatDurationMs: eatEnd - eatStart, nextFastShortenedByMs };
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
        const { eatStart, eatEnd, eatDurationMs, nextFastShortenedByMs } = calcSimulatedEating(firstMealMs);
        elSimFastStart.innerHTML = renderTime(eatStart);
        elSimFastEnd.innerHTML = renderTime(eatEnd);
        elSimFastDuration.textContent = formatSimDuration(eatDurationMs);
        if (nextFastShortenedByMs > 0) {
            elSimNextFastShortenedVal.textContent = formatSimDuration(nextFastShortenedByMs);
            elSimNextFastShortened.classList.remove('hidden');
        } else {
            elSimNextFastShortened.classList.add('hidden');
        }
    } else {
        const { fastStart, fastEnd, fastDurationMs } = calcSimulatedFast(firstMealMs, lastMealMs);
        elSimFastStart.innerHTML = renderTime(fastStart);
        elSimFastEnd.innerHTML = renderTime(fastEnd);
        elSimFastDuration.textContent = formatSimDuration(fastDurationMs);
        elSimNextFastShortened.classList.add('hidden');
    }
}

// Returns the maximum allowed position (in minutes) for toggle2 in potential state.
// toggle2 cannot go past firstMeal + eating window length (8h, plus 8h per cascade-skipped 16h of Fasting bonus).
function getMaxLastMealMins() {
    const firstMins = parseInt(elSliderFirstMeal.value);
    const firstMealMs = simState.sliderStartMs + firstMins * 60000;
    const maxLastMealMs = getModeledFirstMealEffects(firstMealMs).eatingEndMs;
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
