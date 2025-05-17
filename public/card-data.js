// card-data.js

// This array will be populated by the selected data source.
let cardData = [];

// --- CONFIGURATION: Select your data source ---
// Options: "17LANDS_CSV", "AETHERHUB_TXT_FILE" // Updated Aetherhub option
const SELECTED_DATA_SOURCE = "AETHERHUB_TXT_FILE"; // Change this to switch data source

// --- Common Grade Scale (used by 17Lands normal distribution) ---
const GRADE_SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const CENTER_GRADE_INDEX = GRADE_SCALE.indexOf("C"); // Should be 5 for a 13-step scale
const STD_DEV_BAND_SIZE = 0.33; // For 17Lands normal distribution grading

// --- Helper: Generic CSV Line Parser (used by 17Lands) ---
/**
 * Parses a single line of CSV text into an array of strings.
 * Handles values enclosed in double quotes, including escaped quotes ("").
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


// =================================================================================
// --- 17LANDS (CSV File) Specific Logic ---
// =================================================================================
let meanGihWr17Lands = 0;
let stdDevGihWr17Lands = 1; // Default to 1 to prevent division by zero.

/**
 * Converts a 17Lands "GIH WR" (float percentage) to a letter grade
 * based on a normal distribution.
 * @param {number} winRateFloat - The card's win rate as a float (e.g., 55.3 for 55.3%).
 * @param {number} mean - The mean win rate of all cards from 17Lands.
 * @param {number} stdDev - The standard deviation of win rates from 17Lands.
 * @returns {string} The corresponding letter grade (F to A+).
 */
function getGradeFrom17LandsNormalDist(winRateFloat, mean, stdDev) {
    if (isNaN(winRateFloat)) return "N/A";
    if (stdDev === 0 || isNaN(stdDev)) return GRADE_SCALE[CENTER_GRADE_INDEX]; // Default to 'C'

    const deviationBands = (winRateFloat - mean) / (STD_DEV_BAND_SIZE * stdDev);
    let gradeIndex = Math.floor(deviationBands + 0.5) + CENTER_GRADE_INDEX;

    if (gradeIndex < 0) gradeIndex = 0;
    else if (gradeIndex >= GRADE_SCALE.length) gradeIndex = GRADE_SCALE.length - 1;
    
    return GRADE_SCALE[gradeIndex];
}

/**
 * Initializes cardData from a 17Lands CSV file.
 */
async function initialize17LandsData() {
    console.log("Initializing card data from 17Lands CSV...");
    const csvFilePath17Lands = './assets/data/17lands-TDM-card-ratings-2025-05-17.csv'; // Make sure this path is correct
    try {
        const response = await fetch(csvFilePath17Lands);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} fetching ${csvFilePath17Lands}`);
        
        const csvText = await response.text();
        const lines = csvText.trim().split(/\r?\n/);

        if (lines.length < 2) {
            console.error("17Lands CSV: File is empty or has no data rows.");
            cardData = []; return;
        }

        const header = parseCsvLine(lines[0]);
        const nameIndex = header.indexOf("Name");
        const gihWrIndex = header.indexOf("GIH WR");

        if (nameIndex === -1 || gihWrIndex === -1) {
            console.error("17Lands CSV: Header missing 'Name' or 'GIH WR'. Found:", header);
            cardData = []; return;
        }

        const allGihWrValues = [];
        const rawCardObjects = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            if (values.length > Math.max(nameIndex, gihWrIndex)) {
                const cardName = values[nameIndex];
                const gihWrString = values[gihWrIndex];
                if (cardName && gihWrString && gihWrString.includes('%')) {
                    const gihWrFloat = parseFloat(gihWrString);
                    if (!isNaN(gihWrFloat)) {
                        allGihWrValues.push(gihWrFloat);
                        rawCardObjects.push({ name: cardName.trim(), gihWrFloat });
                    }
                }
            }
        }

        if (allGihWrValues.length === 0) {
            console.error("17Lands CSV: No valid GIH WR values found.");
            cardData = []; return;
        }

        const n = allGihWrValues.length;
        meanGihWr17Lands = allGihWrValues.reduce((acc, val) => acc + val, 0) / n;
        const sumSqDiff = allGihWrValues.reduce((acc, val) => acc + Math.pow(val - meanGihWr17Lands, 2), 0);
        stdDevGihWr17Lands = n > 1 ? Math.sqrt(sumSqDiff / (n - 1)) : 0;
        console.log(`17Lands Stats: Mean=${meanGihWr17Lands.toFixed(2)}%, StdDev=${stdDevGihWr17Lands.toFixed(2)}% from ${n} cards.`);

        cardData = rawCardObjects.map(rawCard => ({
            name: rawCard.name,
            imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(rawCard.name)}`,
            trueGrade: getGradeFrom17LandsNormalDist(rawCard.gihWrFloat, meanGihWr17Lands, stdDevGihWr17Lands)
        }));
        
        console.log(`Successfully processed ${cardData.length} cards from 17Lands CSV.`);

    } catch (error) {
        console.error("Failed to load/process 17Lands CSV data:", error);
        cardData = [];
    }
}

// =================================================================================
// --- AETHERHUB (from .TXT File) Specific Logic ---
// =================================================================================

/**
 * Converts an Aetherhub numerical rating (0.0-5.0) to a letter grade.
 * @param {number} numericalRating - The Aetherhub rating (e.g., 4.5).
 * @returns {string} The corresponding letter grade (F to A+).
 */
function getGradeFromAetherhubRating(numericalRating) {
    if (typeof numericalRating !== 'number' || isNaN(numericalRating)) {
        console.warn(`Invalid numericalRating for Aetherhub: ${numericalRating}`);
        return "N/A";
    }
    // Example mapping (same as before, adjust as needed)
    if (numericalRating >= 4.8) return "A+";
    if (numericalRating >= 4.5) return "A";
    if (numericalRating >= 4.2) return "A-";
    if (numericalRating >= 3.9) return "B+";
    if (numericalRating >= 3.6) return "B";
    if (numericalRating >= 3.3) return "B-";
    if (numericalRating >= 3.0) return "C+";
    if (numericalRating >= 2.7) return "C";
    if (numericalRating >= 2.4) return "C-";
    if (numericalRating >= 2.0) return "D+";
    if (numericalRating >= 1.6) return "D";
    if (numericalRating >= 1.0) return "D-";
    return "F";
}

/**
 * Initializes cardData by fetching and parsing a .txt file with Aetherhub data.
 */
async function initializeAetherhubTxtFileData() { // Renamed from initializeAetherhubTextData
    console.log("Initializing card data from Aetherhub TXT file...");
    const aetherhubTxtFilePath = './assets/data/aetherhub-tdm-ratings-2025-05-17.txt'; // Define your .txt file name here
    
    try {
        const response = await fetch(aetherhubTxtFilePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${aetherhubTxtFilePath}`);
        }
        const rawTextData = await response.text(); // Get text from the fetched file

        const lines = rawTextData.trim().split(/\r?\n/);
        const processedCards = [];

        if (lines.length < 2 && !(lines.length === 1 && lines[0] === '')) { // Allow empty file, but warn if not just an empty string
            console.warn("Aetherhub TXT file: File is too short or empty. (Content: '" + rawTextData.substring(0,50) + "...')");
             // cardData will remain empty if this is the only source and it fails
        } else if (lines.length === 1 && lines[0] === '') {
            console.log("Aetherhub TXT file: File is empty."); // Valid empty file
        }


        for (let i = 0; i < lines.length; i += 2) {
            if (i + 1 >= lines.length) {
                if (lines[i].trim() !== "") { // Don't warn for a trailing empty line
                    console.warn(`Aetherhub TXT: Skipping card name at end, missing ratings: "${lines[i]}"`);
                }
                continue;
            }

            const cardNameLine = lines[i].trim();
            const ratingsLine = lines[i+1].trim();

            if (!cardNameLine) {
                if (ratingsLine) { // Only warn if there's a ratings line without a preceding card name
                    console.warn(`Aetherhub TXT: Skipping empty card name at index ${i}. Next line was: "${ratingsLine}"`);
                }
                continue;
            }
            
            const ratingValues = ratingsLine.split(/\s+/); 
            if (ratingValues.length >= 2) {
                const aiRatingString = ratingValues[1]; // AI Rating is the second number
                const aiRatingFloat = parseFloat(aiRatingString);

                if (!isNaN(aiRatingFloat)) {
                    processedCards.push({
                        name: cardNameLine,
                        imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(cardNameLine)}`,
                        trueGrade: getGradeFromAetherhubRating(aiRatingFloat)
                    });
                } else {
                    console.warn(`Aetherhub TXT: Could not parse AI Rating for "${cardNameLine}". Rating string: "${aiRatingString}"`);
                }
            } else {
                console.warn(`Aetherhub TXT: Could not parse ratings for "${cardNameLine}". Line: "${ratingsLine}"`);
            }
        }
        cardData = processedCards; // Assign to global cardData
        console.log(`Successfully processed ${cardData.length} cards from Aetherhub TXT file.`);
        if (cardData.length === 0 && lines.length >=2 && !(lines.length === 1 && lines[0] === '') ) {
            console.error("Aetherhub TXT: All entries invalid or unparsable. Check data format in the .txt file.");
        }

    } catch (error) {
        console.error("Failed to load/process Aetherhub TXT data:", error);
        cardData = []; // Ensure cardData is empty on error
    }
}

// =================================================================================
// --- Main Initializer ---
// =================================================================================
/**
 * Main function to initialize card data based on the SELECTED_DATA_SOURCE.
 * This is called by index.html on window.onload.
 */
async function initializeCardData() {
    console.log(`Selected data source: ${SELECTED_DATA_SOURCE}`);
    if (SELECTED_DATA_SOURCE === "17LANDS_CSV") {
        await initialize17LandsData();
    } else if (SELECTED_DATA_SOURCE === "AETHERHUB_TXT_FILE") { // Updated to match new function name
        await initializeAetherhubTxtFileData();
    } else {
        console.error("Invalid data source selected in card-data.js:", SELECTED_DATA_SOURCE);
        cardData = [];
    }

    // Common error display in UI if cardData ends up empty after attempting to load
    if (cardData.length === 0) {
        console.warn("Card data is empty after initialization attempt.");
        if (document.getElementById('cardName')) {
             document.getElementById('cardName').textContent = "Error: No card data loaded!";
        }
        if (document.getElementById('cardImage')) {
            document.getElementById('cardImage').src = "https://placehold.co/265x370/FF0000/FFFFFF?text=No+Data&font=lora";
        }
    }
}
