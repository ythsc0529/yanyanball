import './style.css';
import { Countdown } from './src/utils/countdown.js';
import { loginWithGoogle, loginAsGuest, onUserStatusChanged } from './src/auth.js';

// 116 學測 Date (Estimated: 2026/01/20, adjusting as needed)
const EXAM_DATE = '2027-01-16T09:00:00';

console.log("Main.js loaded and running");

document.addEventListener('DOMContentLoaded', () => {
    try {
        // 1. Initialize Countdown
        const countdown = new Countdown(EXAM_DATE, 'countdown');
        countdown.start();
        console.log("Countdown started");
    } catch (e) {
        console.error("Countdown error:", e);
    }

    // 2. Setup Auth Listeners
    const googleBtn = document.getElementById('google-login');
    const guestBtn = document.getElementById('guest-login');

    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            console.log("Google login clicked");
            try {
                await loginWithGoogle();
                // Auth state listener will handle the redirect
            } catch (err) {
                alert('登入失敗: ' + err.message);
                console.error(err);
            }
        });
    }

    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            console.log("Guest login clicked");
            loginAsGuest();
        });
    }

    // 3. Listen for user state
    onUserStatusChanged((user) => {
        if (user) {
            console.log('User logged in:', user.displayName);
            window.location.href = '/app.html';
        }
    });
});
