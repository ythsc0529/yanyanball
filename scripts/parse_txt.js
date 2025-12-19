import fs from 'fs';

const txtPath = './pdf/1.txt';
const outputPath = './src/data.js';

function parseTXT() {
    try {
        if (!fs.existsSync(txtPath)) {
            console.error('TXT file not found at:', txtPath);
            return;
        }

        const text = fs.readFileSync(txtPath, 'utf-8');
        const lines = text.split('\n');

        console.log(`Found ${lines.length} lines of text.`);

        const vocabulary = [];
        let idCounter = 1;

        for (let line of lines) {
            line = line.trim();
            // Skip empty lines, page numbers, or section headers
            if (!line || line.startsWith('+') || line.length < 2) continue;

            // Strategy: Split by whitespace
            // Format is generally: Word PartOfSpeech Level
            // Example: "abandon v. 4"
            // Example: "according to prep. 1"

            const parts = line.split(/\s+/);

            // We need at least 3 parts usually, but simple words might have 2 if checking strictly?
            // Actually, "Word Pos Level". 
            // Level is the last item.

            if (parts.length < 2) continue; // Skip outliers

            const levelStr = parts[parts.length - 1];

            // Check if last part is a number (Level)
            if (!/^\d+$/.test(levelStr)) {
                // Sometimes there might be weird formatting, skip if not valid level
                continue;
            }

            const level = parseInt(levelStr, 10);
            const pos = parts.length > 2 ? parts[parts.length - 2] : '';

            // The word is everything before the pos
            // If parts.length is 3: [abandon, v., 4] -> word is parts[0]
            // If parts.length is 4: [according, to, prep., 1] -> word is parts[0] + " " + parts[1]

            // Caution: "switch n./v. 3" -> pos is "n./v."
            // Caution: "A" section header -> might be just "A" (filtered by length < 2 check?)
            // "A" line length is 1. filtered.

            // Reconstruct word
            const wordParts = parts.slice(0, parts.length - 2);
            let word = wordParts.join(' ');

            // Fallback for cases with weird spacing or fewer parts?
            // If parts.length == 2, e.g. "Word 4" (missing pos?) -> unlikely based on sample
            // Sample: "a/an art. 1" -> parts: ["a/an", "art.", "1"] -> word: "a/an"

            if (word.length === 0) continue;

            vocabulary.push({
                id: String(idCounter++),
                word: word,
                pos: pos,
                definition: "(暫無釋義)", // Placeholder as text file has no definitions
                sentence: "", // Placeholder
                level: level,
                frequency: Math.floor(Math.random() * 5) + 1 // Random frequency for features
            });
        }

        console.log(`Extracted ${vocabulary.length} words.`);

        const fileContent = `
export const vocabularyDatabase = ${JSON.stringify(vocabulary, null, 4)};

export const getVocabulary = () => vocabularyDatabase;
        `;

        fs.writeFileSync(outputPath, fileContent);
        console.log('Successfully generated src/data.js');

    } catch (error) {
        console.error('Error parsing TXT:', error);
    }
}

parseTXT();
