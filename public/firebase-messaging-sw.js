// Give the service worker access to Firebase Messaging.
// Note: We need to import the scripts from CDN because SW runs in a separate context
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
firebase.initializeApp({
    apiKey: "AIzaSyBKRfdeJLiuqctIoP190hDUa43-WdneRjc",
    authDomain: "yanyanball.firebaseapp.com",
    projectId: "yanyanball",
    storageBucket: "yanyanball.firebasestorage.app",
    messagingSenderId: "611007061494",
    appId: "1:611007061494:web:cffbe1131f392ff9873bd7",
    measurementId: "G-SLY9CLLS61"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Customize notification here
    const notificationTitle = payload.notification.title || '雁雁球學習';
    const notificationOptions = {
        body: payload.notification.body || '該回來背單字囉！',
        icon: '/yanyan_mascot_logo.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
