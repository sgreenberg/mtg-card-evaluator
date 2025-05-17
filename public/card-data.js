// card-data.js

// This array will be populated dynamically from the CSV file.
let cardData = [];

/**
 * Converts a win rate (as a string like "70.3%") to a letter grade.
 * @param {string} winRateString - The win rate string (e.g., "70.3%").
 * @returns {string} The corresponding letter grade (F to A+).
 */
function getGradeFromWinRate(winRateString) {
    if (!winRateString || typeof winRateString !== 'string' || !winRateString.includes('%')) {
        return "N/A";
    }
    const wr = parseFloat(winRateString);
    if (isNaN(wr)) {
        return "N/A";
    }

    if (wr >= 68) return "A+";
    if (wr >= 65) return "A";
    if (wr >= 62) return "A-";
    if (wr >= 60) return "B+";
    if (wr >= 58) return "B";
    if (wr >= 56) return "B-";
    if (wr >= 54) return "C+";
    if (wr >= 52) return "C";
    if (wr >= 50) return "C-";
    if (wr >= 48) return "D+";
    if (wr >= 46) return "D";
    if (wr >= 44) return "D-";
    return "F";
}

/**
 * Parses a single line of CSV text into an array of strings.
 * @param {string} line - A single line from a CSV file.
 * @returns {string[]} An array of string values.
 */
function parseCsvLine(line) {
    const values = [];
    let currentVal = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i+1] === '"') {
                currentVal += '"';
                i++; 
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(currentVal.trim());
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    values.push(currentVal.trim());
    return values;
}

/**
 * Asynchronously fetches card data from a CSV file, processes it,
 * and populates the `cardData` array.
 */
async function initializeCardData() {
    const csvFilePath = './assets/data/17lands-TDM-card-ratings-2025-05-17.csv';
    try {
        const response = await fetch(csvFilePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${csvFilePath}`);
        }
        const csvText = await response.text();
        const lines = csvText.trim().split(/\r?\n/);

        if (lines.length < 2) {
            console.error("CSV file is empty or has no data rows.");
            cardData = [];
            return;
        }

        const headerLine = lines[0];
        const header = parseCsvLine(headerLine);
        const nameIndex = header.indexOf("Name");
        const gihWrIndex = header.indexOf("GIH WR");

        if (nameIndex === -1 || gihWrIndex === -1) {
            console.error("CSV header is missing 'Name' or 'GIH WR' column.");
            cardData = [];
            return;
        }

        const processedCards = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            if (values.length > Math.max(nameIndex, gihWrIndex)) {
                const cardNameValue = values[nameIndex];
                const gihWrString = values[gihWrIndex];

                if (cardNameValue && typeof cardNameValue === 'string' && cardNameValue.trim() !== "" && gihWrString) {
                    const trimmedCardName = cardNameValue.trim();
                    processedCards.push({
                        name: trimmedCardName,
                        // Use Scryfall API to fetch images by card name
                        imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(trimmedCardName)}`,
                        trueGrade: getGradeFromWinRate(gihWrString)
                    });
                }
            }
        }
        cardData = processedCards;
        console.log(`Successfully loaded and processed ${cardData.length} cards from CSV.`);

    } catch (error) {
        console.error("Failed to load or process card data:", error);
        cardData = [];
        if (document.getElementById('cardName')) {
             document.getElementById('cardName').textContent = "Error loading card data!";
        }
        if (document.getElementById('cardImage')) {
            document.getElementById('cardImage').src = "https://placehold.co/265x370/FF0000/FFFFFF?text=Data+Error&font=lora";
        }
    }
}
