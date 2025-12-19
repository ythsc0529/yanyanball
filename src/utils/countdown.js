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
            clearInterval(this.timer);
            this.element.innerHTML = "考試開始！";
            return;
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
