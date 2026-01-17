export class Countdown {
    constructor(targetDate, elementId) {
        this.targetDate = new Date(targetDate).getTime();
        this.element = document.getElementById(elementId);
        this.timer = null;
    }

    start() {
        this.update();
        this.timer = setInterval(() => this.update(), 1000);
    }

    update() {
        if (!this.element) return;

        const now = new Date().getTime();
        const distance = this.targetDate - now;

        if (distance < 0) {
            // Check if we passed the 2026 exam date
            // The original logic just stops.
            // New Request: If > 2026/1/18, switch to 2027/1/15 (116 GSAT)
            const current = new Date();
            const threshold = new Date('2026-01-18T00:00:00');

            if (current > threshold) {
                // Reset target to 2027/1/15
                this.targetDate = new Date('2027-01-15T00:00:00').getTime();
                const newDist = this.targetDate - current.getTime();
                if (newDist > 0) {
                    // Recalculate immediately for this frame
                    distance = newDist;
                } else {
                    clearInterval(this.timer);
                    this.element.innerHTML = "考試開始！";
                    return;
                }
            } else {
                clearInterval(this.timer);
                this.element.innerHTML = "考試開始！";
                return;
            }
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        this.element.innerHTML = `
            <div class="time-block">
                <span class="number">${days}</span>
                <span class="label">天</span>
            </div>
            <div class="separator">:</div>
            <div class="time-block">
                <span class="number">${String(hours).padStart(2, '0')}</span>
                <span class="label">時</span>
            </div>
            <div class="separator">:</div>
            <div class="time-block">
                <span class="number">${String(minutes).padStart(2, '0')}</span>
                <span class="label">分</span>
            </div>
            <div class="separator">:</div>
            <div class="time-block">
                <span class="number">${String(seconds).padStart(2, '0')}</span>
                <span class="label">秒</span>
            </div>
        `;
    }
}
