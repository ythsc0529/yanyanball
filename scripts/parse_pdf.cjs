const fs = require('fs');
let pdfLib = require('pdf-parse');
if (pdfLib.default) pdfLib = pdfLib.default;
// If it's still an object check if it's a named export, but usually default is it. 
// Assuming pdfLib is the function now.

const pdfPath = './pdf/4.pdf';
const outputPath = './src/data.js';

async function parsePDF() {
    try {
        if (!fs.existsSync(pdfPath)) {
            console.error('PDF file not found at:', pdfPath);
            return;
        }

        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdfLib(dataBuffer);

        const lines = data.text.split('\n').filter(line => line.trim() !== '');
        console.log(`Found ${lines.length} lines of text.`);

        const vocabulary = [];
        let idCounter = 1;

        // Visual inspection of typical word lists:
        // "1. ability (n.) 能力" or "abandon v. 放棄"
        // Let's try to match a general pattern: English word + optional part of speech + Chinese definition

        const lineRegex = /^([a-zA-Z\-\s]+?)\s+(?:(v\.|n\.|adj\.|adv\.|prep\.|conj\.)\s*)?([^\u0000-\u007F]+.*)$/;

        for (const line of lines) {
            // Clean up numbers if they exist at start "1. apple" -> "apple"
            const cleanLine = line.replace(/^\d+\.?\s*/, '').trim();

            const match = cleanLine.match(lineRegex);

            if (match) {
                const word = match[1].trim();
                // Filter out junk matches (too short or too long)
                if (word.length < 2 || word.length > 30) continue;

                vocabulary.push({
                    id: String(idCounter++),
                    word: word,
                    pos: match[2] || 'n.', // Default if missing
                    definition: match[3].trim(),
                    sentence: `Example sentence for ${word}.`,
                    level: Math.floor(Math.random() * 6) + 1, // Random level 1-6
                    frequency: Math.floor(Math.random() * 5) + 1
                });
            }
        }

        console.log(`Extracted ${vocabulary.length} words.`);

        const fileContent = `
export const vocabularyDatabase = ${JSON.stringify(vocabulary, null, 4)};

export const getVocabulary = () => vocabularyDatabase;
        `;

        fs.writeFileSync(outputPath, fileContent);
        console.log('Successfully generated src/data.js');

    } catch (error) {
        console.error('Error parsing PDF:', error);
    }
}

parsePDF();
