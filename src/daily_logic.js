import { vocabularyDatabase } from './data';

// Configuration
const DAILY_NEW_COUNT = 10;
const DAILY_REVIEW_COUNT = 5;

export const DailyLogic = {
    /**
     * Generates a daily lesson object.
     * @param {Object} userProfile - Contains masteredWords (Set/Array), incorrectWords (Array), level, etc.
     * @returns {Object} { id: "YYYY-MM-DD", newWords: [], reviewWords: [], total: 15 }
     */
    generateLesson(userProfile) {
        const today = new Date().toISOString().split('T')[0];
        // Check if lesson already exists for today in progress (passed in userProfile?)
        // For logic separation, we assume we just generate the content here.
        // The app calling this should check if "Done" or "InProgress".

        const mastered = new Set(userProfile.masteredWords || []);
        const incorrect = userProfile.incorrectWords || []; // Objects or IDs? detailed in app.js, usually objects with ID

        // 1. Select Review Words (Priority: Incorrect -> Oldest Mastered -> Random Mastered)
        // For simplicity: Incorrect first, then Random Mastered.
        let reviews = [];

        // Add distinct incorrect words
        const incorrectIds = new Set();
        incorrect.forEach(w => {
            if (reviews.length < DAILY_REVIEW_COUNT) {
                if (!incorrectIds.has(w.id)) {
                    reviews.push(w);
                    incorrectIds.add(w.id);
                }
            }
        });

        // Fill rest with mastered words if needed
        if (reviews.length < DAILY_REVIEW_COUNT && mastered.size > 0) {
            const masteredArray = Array.from(mastered);
            // Shuffle
            masteredArray.sort(() => Math.random() - 0.5);

            for (let id of masteredArray) {
                if (reviews.length >= DAILY_REVIEW_COUNT) break;
                if (!incorrectIds.has(id)) { // Don't add if already in review from incorrect
                    // Find word data
                    const wordObj = vocabularyDatabase.find(w => w.id === id);
                    if (wordObj) {
                        reviews.push(wordObj);
                    }
                }
            }
        }

        // 2. Select New Words
        // Filter by User Level (Basic logic: Level 1->6)
        // If user level is unknown, assume 1.
        let targetLevel = 1;
        // Simple logic: If > 80% of L1 known, move to L2.
        // We can do complex calculation or just simple sequential for now.
        // Or simply: Find first level where known < 90%.

        // Let's iterate levels
        for (let l = 1; l <= 6; l++) {
            const levelWords = vocabularyDatabase.filter(w => w.level === l);
            const knownInLevel = levelWords.filter(w => mastered.has(w.id)).length;
            if (knownInLevel / levelWords.length < 0.9) {
                targetLevel = l;
                break;
            }
        }

        const potentialNew = vocabularyDatabase.filter(w => w.level === targetLevel && !mastered.has(w.id));
        // Shuffle
        potentialNew.sort(() => Math.random() - 0.5);

        const newWords = potentialNew.slice(0, DAILY_NEW_COUNT);

        // Fallback: If ran out of words in level, try next level? 
        // For 7000 words, unlikely to run out soon.

        return {
            date: today,
            newWords,
            reviewWords: reviews,
            total: newWords.length + reviews.length
        };
    }
};
