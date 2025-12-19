export class NotificationManager {
    constructor() {
        this.config = JSON.parse(localStorage.getItem('notificationConfig') || '{"enabled": false, "time": "20:00"}');
        this.checkInterval = null;
        this.init();
    }

    init() {
        if (this.config.enabled) {
            this.startChecking();
        }
    }

    async requestPermission() {
        if (!("Notification" in window)) {
            alert("您的瀏覽器不支援桌面通知");
            return false;
        }

        const permission = await Notification.requestPermission();
        return permission === "granted";
    }

    updateConfig(enabled, time) {
        this.config = { enabled, time };
        localStorage.setItem('notificationConfig', JSON.stringify(this.config));

        if (enabled) {
            this.startChecking();
        } else {
            this.stopChecking();
        }
    }

    startChecking() {
        if (this.checkInterval) return;

        console.log("Notification check started for:", this.config.time);

        this.checkInterval = setInterval(() => {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            if (currentTime === this.config.time) {
                // Check if we already notified today to avoid multiple notifications in the same minute
                const lastNotified = localStorage.getItem('lastNotifiedDate');
                const today = now.toDateString();

                if (lastNotified !== today) {
                    this.sendNotification();
                    localStorage.setItem('lastNotifiedDate', today);
                }
            }
        }, 30000); // Check every 30 seconds
    }

    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    sendNotification() {
        if (Notification.permission === "granted") {
            new Notification("雁雁球學習提醒", {
                body: "嘿！是時候學習新的單字了，快回來練習吧！",
                icon: "/yanyan_mascot_logo.png"
            });
        }
    }
}
