// --- History Helpers ---

function addToHistory(type, startTime, endTime, bonusMs = 0, penaltyMs = 0) {
    if (!startTime || !endTime) return;

    const record = {
        type,
        startTime,
        endTime,
        bonusMs,
        penaltyMs,
        isManual: appState.isManualSession, // US-11
        id: Date.now()
    };

    appState.isManualSession = false; // Reset manual flag

    appState.history.unshift(record); // Add to top (descending)
    saveState();
}

function renderHistory() {
    if (!elHistoryList) return;

    if (appState.history.length === 0) {
        elHistoryList.innerHTML = '<p class="empty-history">No records yet.</p>';
        return;
    }

    // Group by date
    const groups = {};
    appState.history.forEach(record => {
        const d = new Date(record.startTime);
        const dateKey = d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(record);
    });

    let html = '';
    // Groups are already roughly in order because history is unshifted
    for (const date in groups) {
        html += `<div class="history-date-group">
            <h4 class="history-date-header">${date}</h4>
            <div class="history-records">`;

        groups[date].forEach(r => {
            const isEating = r.type === STATES.EATING;
            const icon = isEating ? '🍴' : '🌙';
            const typeLabel = isEating ? 'Eating' : 'Fasting';

            let extras = '';
            if (r.isManual) {
                extras += `<span class="history-tag manual">Manual</span>`;
            }
            if (r.bonusMs > 0) {
                const label = isEating ? `Reward +${Math.round(r.bonusMs / 60000)}m window` : `Reward -${Math.round(r.bonusMs / 60000)}m fast`;
                extras += `<span class="history-tag bonus">${label}</span>`;
            }
            if (r.penaltyMs > 0) {
                extras += `<span class="history-tag penalty">Penalty +${Math.round(r.penaltyMs / 60000)}m</span>`;
            }

            html += `
                <div class="history-record-item" data-type="${r.type}">
                    <div class="record-main">
                        <span class="record-icon">${icon}</span>
                        <div class="record-details">
                            <span class="record-type">${typeLabel}</span>
                            <span class="record-time">${formatTimeOnly(r.startTime)} - ${formatTimeOnly(r.endTime)}</span>
                        </div>
                    </div>
                    <div class="record-extras">
                        ${extras}
                    </div>
                </div>`;
        });

        html += `</div></div>`;
    }

    elHistoryList.innerHTML = html;
}
