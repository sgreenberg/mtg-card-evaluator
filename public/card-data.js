// card-data.js

// This array will be populated dynamically from the CSV file.
let cardData = [];

// Statistics for GIH WR, to be calculated from the CSV data.
let meanGihWr = 0;
let stdDevGihWr = 1; // Default to 1 to prevent division by zero if calculation fails.

// Grade scale configuration
const GRADE_SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const CENTER_GRADE_INDEX = GRADE_SCALE.indexOf("C"); // Should be 5
const STD_DEV_BAND_SIZE = 0.33;

/**
 * Calculates the grade based on a normal distribution of win rates.
 * @param {number} winRateFloat - The card's win rate as a float (e.g., 55.3 for 55.3%).
 * @param {number} mean - The mean win rate of all cards.
 * @param {number} stdDev - The standard deviation of win rates of all cards.
 * @returns {string} The corresponding letter grade (F to A+).
 */
function getGradeFromWinRate(winRateFloat, mean, stdDev) {
    if (isNaN(winRateFloat)) {
        return "N/A"; // Not a Number
    }

    // Handle edge case where standard deviation is zero (e.g., all cards have same WR, or only one card)
    if (stdDev === 0 || isNaN(stdDev)) {
        if (winRateFloat === mean) return GRADE_SCALE[CENTER_GRADE_INDEX]; // 'C'
        // If stdDev is 0 but WR differs from mean (shouldn't happen if calculated correctly),
        // it's hard to grade. Could return 'C' or 'N/A'.
        return GRADE_SCALE[CENTER_GRADE_INDEX]; // Default to 'C' if stdDev is 0
    }

    // Calculate how many 0.33 standard deviation bands the card is away from the mean.
    // A positive value means above average, negative means below.
    const deviationBands = (winRateFloat - mean) / (STD_DEV_BAND_SIZE * stdDev);

    // Map the deviationBands to an index in our GRADE_SCALE array.
    // Math.floor(deviationBands + 0.5) effectively rounds to the nearest band.
    // Then add to the center grade index.
    let gradeIndex = Math.floor(deviationBands + 0.5) + CENTER_GRADE_INDEX;

    // Clamp the index to the valid range of the GRADE_SCALE array.
    if (gradeIndex < 0) {
        gradeIndex = 0; // F
    } else if (gradeIndex >= GRADE_SCALE.length) {
        gradeIndex = GRADE_SCALE.length - 1; // A+
    }

    return GRADE_SCALE[gradeIndex];
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
 * calculates statistics, assigns grades, and populates the `cardData` array.
 */
async function initializeCardData() {
    const csvFilePath = './assets/data/17lands-TDM-card-ratings-2025-05-17.csv';
    console.log(`Initializing card data from: ${csvFilePath}`);
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
            console.error("CSV header is missing 'Name' or 'GIH WR' column. Found headers:", header);
            cardData = [];
            return;
        }

        // --- First pass: Parse CSV and collect all GIH WR values for statistics ---
        const allGihWrValues = [];
        const rawCardObjects = []; // To store initially parsed data

        for (let i = 1; i < lines.length; i++) { // Start from 1 to skip header row
            const values = parseCsvLine(lines[i]);
            if (values.length > Math.max(nameIndex, gihWrIndex)) {
                const cardNameValue = values[nameIndex];
                const gihWrString = values[gihWrIndex];

                if (cardNameValue && typeof cardNameValue === 'string' && cardNameValue.trim() !== "" && gihWrString && gihWrString.includes('%')) {
                    const gihWrFloat = parseFloat(gihWrString);
                    if (!isNaN(gihWrFloat)) {
                        allGihWrValues.push(gihWrFloat);
                        rawCardObjects.push({
                            name: cardNameValue.trim(),
                            gihWrFloat: gihWrFloat // Store the float for grading
                        });
                    }
                }
            }
        }

        if (allGihWrValues.length === 0) {
            console.error("No valid GIH WR values found in CSV to calculate statistics.");
            cardData = [];
            return;
        }

        // --- Calculate Mean and Standard Deviation ---
        const n = allGihWrValues.length;
        const sum = allGihWrValues.reduce((acc, val) => acc + val, 0);
        meanGihWr = sum / n;

        const sumOfSquaredDifferences = allGihWrValues.reduce((acc, val) => acc + Math.pow(val - meanGihWr, 2), 0);
        // Use (n - 1) for sample standard deviation if n > 1, otherwise stdDev is 0 or not well-defined.
        stdDevGihWr = n > 1 ? Math.sqrt(sumOfSquaredDifferences / (n - 1)) : 0;

        console.log(`Calculated GIH WR Stats: Mean = ${meanGihWr.toFixed(2)}%, StdDev = ${stdDevGihWr.toFixed(2)}% from ${n} cards.`);
        if (stdDevGihWr === 0 && n > 1) {
            console.warn("Standard deviation is 0. All cards might receive the same grade or 'N/A'. This usually means all cards have the exact same GIH WR.");
        }


        // --- Second pass: Assign grades and populate the final cardData array ---
        const processedCards = [];
        for (const rawCard of rawCardObjects) {
            const finalGrade = getGradeFromWinRate(rawCard.gihWrFloat, meanGihWr, stdDevGihWr);
            processedCards.push({
                name: rawCard.name,
                imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(rawCard.name)}`,
                trueGrade: finalGrade
            });
        }
        
        cardData = processedCards;
        console.log(`Successfully loaded, processed, and graded ${cardData.length} cards.`);

    } catch (error) {
        console.error("Failed to load or process card data:", error);
        cardData = []; // Ensure it's empty on error
        if (document.getElementById('cardName')) {
             document.getElementById('cardName').textContent = "Error loading card data!";
        }
        if (document.getElementById('cardImage')) {
            document.getElementById('cardImage').src = "https://placehold.co/265x370/FF0000/FFFFFF?text=Data+Error&font=lora";
        }
    }
}
