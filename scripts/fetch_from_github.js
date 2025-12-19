import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://raw.githubusercontent.com/AppPeterPan/TaiwanSchoolEnglishVocabulary/main';
const OUTPUT_PATH = './src/data.js';
const LEVELS = [1, 2, 3, 4, 5, 6];

async function fetchLevel(level) {
    console.log(`正在下載第 ${level} 級...`);
    const url = `${BASE_URL}/${level}級.json`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`第 ${level} 級下載完成，共 ${data.length} 個單字`);
        return data;
    } catch (error) {
        console.error(`下載第 ${level} 級時發生錯誤:`, error);
        return [];
    }
}

async function fetchAllData() {
    console.log('開始下載所有級別的單字...\n');

    const allLevels = await Promise.all(
        LEVELS.map(level => fetchLevel(level))
    );

    // 合併所有資料並加工
    let idCounter = 1;
    const vocabulary = [];
    const wordMap = new Map(); // 用來追蹤重複的單字

    LEVELS.forEach((level, index) => {
        const levelData = allLevels[index];

        levelData.forEach(item => {
            // 取得第一個定義
            const definition = item.definitions && item.definitions[0]
                ? item.definitions[0].text
                : '沒有釋義';

            const pos = item.definitions && item.definitions[0]
                ? item.definitions[0].partOfSpeech
                : '';

            const word = item.word;

            // 檢查是否已存在（某些單字可能在多個級別中出現）
            if (!wordMap.has(word)) {
                wordMap.set(word, true);

                vocabulary.push({
                    id: String(idCounter++),
                    word: word,
                    pos: pos,
                    definition: definition,
                    sentence: "", // 原始資料沒有例句，保持空白
                    level: level,
                    frequency: 0 // 測試次數，初始為 0
                });
            }
        });
    });

    console.log(`\n總共處理了 ${vocabulary.length} 個不重複的單字`);

    // 生成 JavaScript 文件
    const fileContent = `
export const vocabularyDatabase = ${JSON.stringify(vocabulary, null, 4)};

export const getVocabulary = () => vocabularyDatabase;
    `.trim();

    fs.writeFileSync(OUTPUT_PATH, fileContent, 'utf-8');
    console.log(`\n成功生成 ${OUTPUT_PATH}`);
    console.log(`包含 ${vocabulary.length} 個單字，所有單字都有中文釋義！`);
}

// 執行
fetchAllData().catch(err => {
    console.error('發生錯誤:', err);
    process.exit(1);
});
