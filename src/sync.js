import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { auth } from './firebase';

export const SyncManager = {
    // Current in-memory state (mirrors localStorage usually)
    state: {
        starredWords: new Set(),
        masteredWords: new Set(),
        dailyProgress: {}, // { "YYYY-MM-DD": { finished: [], score: 0 } }
        customBooks: [], // [{ id, name, wordIds: [] }]
        streakData: { count: 0, lastDate: "", max: 0 },
        fcmToken: null,
        placementTestResult: null // { level: "", score: 0, date: "" }
    },

    init() {
        // Load from LocalStorage to initialize memory state
        this.state.starredWords = new Set(JSON.parse(localStorage.getItem('starredWords') || '[]'));
        this.state.masteredWords = new Set(JSON.parse(localStorage.getItem('masteredWords') || '[]'));
        this.state.dailyProgress = JSON.parse(localStorage.getItem('dailyLearningLog') || '{}');
        // Note: dailyLearningLog was just an array structure in old code, we might need migration if format changes.
        // Old format: { "2023-01-01": [id1, id2] } -> Array of IDs.
        // New format proposal: same is fine for simple progress, but we might want more data. 
        // Let's stick to { "YYYY-MM-DD": [id1, id2...] } for compatibility or migrate.

        this.state.customBooks = JSON.parse(localStorage.getItem('customBooks') || '[]');
        this.state.streakData = JSON.parse(localStorage.getItem('streakData') || '{"count":0, "lastDate":"", "max":0}');
        this.state.fcmToken = localStorage.getItem('fcmToken');
        this.state.placementTestResult = JSON.parse(localStorage.getItem('placementTestResult') || 'null');
    },

    async syncUserDown(uid) {
        console.log("Syncing DOWN for", uid);
        try {
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Cloud data found:", data);

                // MERGE LOGIC (Cloud wins for sets usually, or union?)
                // Strategy: Union for Arrays/Sets to avoid data loss from offline usage

                // 1. Starred
                if (data.starredWords) {
                    const localArr = Array.from(this.state.starredWords);
                    const cloudArr = data.starredWords || [];
                    const union = new Set([...localArr, ...cloudArr]);
                    this.state.starredWords = union;
                    localStorage.setItem('starredWords', JSON.stringify([...union]));
                }

                // 2. Mastered
                if (data.masteredWords) {
                    const localArr = Array.from(this.state.masteredWords);
                    const cloudArr = data.masteredWords || [];
                    const union = new Set([...localArr, ...cloudArr]);
                    this.state.masteredWords = union;
                    localStorage.setItem('masteredWords', JSON.stringify([...union]));
                }

                // 3. Daily Progress (Merge keys)
                if (data.dailyProgress) {
                    const merged = { ...this.state.dailyProgress, ...data.dailyProgress };
                    // For same day, stick to union of arrays if it's array
                    Object.keys(merged).forEach(key => {
                        const localDay = this.state.dailyProgress[key] || [];
                        const cloudDay = data.dailyProgress[key] || [];
                        // Assume simple array of IDs
                        if (Array.isArray(localDay) && Array.isArray(cloudDay)) {
                            merged[key] = [...new Set([...localDay, ...cloudDay])];
                        }
                    });
                    this.state.dailyProgress = merged;
                    localStorage.setItem('dailyLearningLog', JSON.stringify(merged));
                }

                // 4. Custom Books
                if (data.customBooks) {
                    // This is harder to merge if conflicts. 
                    // Simple strategy: append unique IDs or just take Cloud if local is empty.
                    // Let's assume Cloud is source of truth for structural things.
                    if (this.state.customBooks.length === 0 && data.customBooks.length > 0) {
                        this.state.customBooks = data.customBooks;
                        localStorage.setItem('customBooks', JSON.stringify(data.customBooks));
                    }
                    // What if I created a book locally? 
                    // TODO: Robust merge. For now: if cloud has it, use cloud. 
                    // If local has something cloud doesn't, maybe push it up next time?
                    // Let's use Cloud overwrites Local for books for simplicity initially, or Union by Book ID.
                    const bookMap = new Map();
                    // Local
                    this.state.customBooks.forEach(b => bookMap.set(b.id, b));
                    // Cloud (overwrites)
                    data.customBooks.forEach(b => bookMap.set(b.id, b));

                    this.state.customBooks = Array.from(bookMap.values());
                    localStorage.setItem('customBooks', JSON.stringify(this.state.customBooks));
                }

                // 5. Streak
                if (data.streakData) {
                    // Take the one with higher max or more recent date?
                    // Let's trust Cloud if it exists and looks valid
                    if (data.streakData.count > this.state.streakData.count) {
                        this.state.streakData = data.streakData;
                        localStorage.setItem('streakData', JSON.stringify(data.streakData));
                    }
                }

                // 6. Token
                if (data.fcmToken && !this.state.fcmToken) {
                    this.state.fcmToken = data.fcmToken;
                    localStorage.setItem('fcmToken', data.fcmToken);
                }

                // 7. Placement Result
                if (data.placementTestResult) {
                    // Cloud overwrites local for level usually (or take newest?)
                    // Let's assume Cloud is truth.
                    this.state.placementTestResult = data.placementTestResult;
                    localStorage.setItem('placementTestResult', JSON.stringify(data.placementTestResult));
                }

                // Immediately sync back UP to ensure cloud has the union result (convergence)
                await this.syncUserUp(uid);

            } else {
                // No cloud data, push local up
                console.log("No cloud data, uploading local.");
                await this.syncUserUp(uid);
            }
        } catch (e) {
            console.error("Sync Down Error:", e);
        }
    },

    async syncUserUp(uid) {
        if (!uid) return;
        const payload = {
            starredWords: Array.from(this.state.starredWords),
            masteredWords: Array.from(this.state.masteredWords),
            dailyProgress: this.state.dailyProgress,
            customBooks: this.state.customBooks,
            streakData: this.state.streakData,
            lastSyncedAt: new Date().toISOString()
        };

        if (this.state.fcmToken) {
            payload.fcmToken = this.state.fcmToken;
        }

        if (this.state.placementTestResult) {
            payload.placementTestResult = this.state.placementTestResult;
        }

        try {
            await setDoc(doc(db, "users", uid), payload, { merge: true });
            console.log("Sync Up Success");
        } catch (e) {
            console.error("Sync Up Error:", e);
        }
    },

    // Helper to update specific parts
    async saveLocalAndSync(uid, key, value) {
        // 1. Save Local
        if (key === 'starredWords' || key === 'masteredWords') {
            // Expecting Set or Array
            const setVal = value instanceof Set ? value : new Set(value);
            this.state[key] = setVal;
            localStorage.setItem(key, JSON.stringify([...setVal]));

            if (uid) {
                await updateDoc(doc(db, "users", uid), { [key]: [...setVal] });
            }
        }
        else if (key === 'dailyProgress') {
            this.state.dailyProgress = value;
            localStorage.setItem('dailyLearningLog', JSON.stringify(value));
            if (uid) await updateDoc(doc(db, "users", uid), { dailyProgress: value });
        }
        else if (key === 'customBooks') {
            this.state.customBooks = value;
            localStorage.setItem('customBooks', JSON.stringify(value));
            if (uid) await updateDoc(doc(db, "users", uid), { customBooks: value });
        }
        else if (key === 'streakData') {
            this.state.streakData = value;
            localStorage.setItem('streakData', JSON.stringify(value));
            if (uid) await updateDoc(doc(db, "users", uid), { streakData: value });
        }
        else if (key === 'placementTestResult') {
            this.state.placementTestResult = value;
            localStorage.setItem('placementTestResult', JSON.stringify(value));
            if (uid) await updateDoc(doc(db, "users", uid), { placementTestResult: value });
        }
    },

    // Call this when token is received
    async updateToken(uid, token) {
        this.state.fcmToken = token;
        localStorage.setItem('fcmToken', token);
        if (uid) {
            await updateDoc(doc(db, "users", uid), { fcmToken: token });
        }
    },

    // SOCIAL SHARING
    async shareWordbook(book, userDisplayName) {
        try {
            // Generate a simple 6-char code
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();

            const shareData = {
                code: code,
                name: book.name || "未命名單字本",
                wordIds: book.wordIds || [],
                creatorName: userDisplayName || "無名氏",
                creatorId: auth.currentUser?.uid || "anonymous",
                originalBookId: book.id,
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, "shared_books"), shareData);
            return code;
        } catch (e) {
            console.error("Share error:", e);
            throw e;
        }
    },

    async findSharedBook(code) {
        try {
            const q = query(collection(db, "shared_books"), where("code", "==", code.toUpperCase().trim()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) return null;
            return querySnapshot.docs[0].data();
        } catch (e) {
            console.error("Find book error:", e);
            throw e; // Propagate error to UI
        }
    }
};

SyncManager.init();
