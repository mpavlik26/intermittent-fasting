const { expect } = require('@playwright/test');

async function openSimulator(page) {
    await page.click('#btn-open-simulator');
    await expect(page.locator('#simulator-overlay')).toBeVisible();
}

// Directly call calcSimulatedFast with minute offsets from sliderStartMs
async function calcFast(page, firstMins, lastMins) {
    return page.evaluate(({ f, l }) => {
        const firstMs = simState.sliderStartMs + f * 60000;
        const lastMs = simState.sliderStartMs + l * 60000;
        return calcSimulatedFast(firstMs, lastMs);
    }, { f: firstMins, l: lastMins });
}

// US-13: Directly call calcSimulatedEating with minute offset from sliderStartMs
async function calcEat(page, firstMins) {
    return page.evaluate(({ f }) => {
        const firstMs = simState.sliderStartMs + f * 60000;
        return calcSimulatedEating(firstMs);
    }, { f: firstMins });
}

module.exports = { openSimulator, calcFast, calcEat };
