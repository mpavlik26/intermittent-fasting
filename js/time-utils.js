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
