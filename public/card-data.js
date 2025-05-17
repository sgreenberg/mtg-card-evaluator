// card-data.js

// This array will be populated by the selected data source.
let cardData = [];

// --- CONFIGURATION: Select your data source ---
// Options: "17LANDS_CSV", "AETHERHUB_RATINGS_TXT_FILE", "AETHERHUB_DETAILS_TXT_FILE"
const SELECTED_DATA_SOURCE = "AETHERHUB_DETAILS_TXT_FILE"; // Ensure this is set to use the details parser

// --- Common Grade Scale (used by 17Lands normal distribution) ---
const GRADE_SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const CENTER_GRADE_INDEX = GRADE_SCALE.indexOf("C");
const STD_DEV_BAND_SIZE = 0.33; // For 17Lands normal distribution grading

// Basic land names to exclude
const BASIC_LAND_NAMES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

// --- Helper: Generic CSV Line Parser (used by 17Lands) ---
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
let stdDevGihWr17Lands = 1;

function getGradeFrom17LandsNormalDist(winRateFloat, mean, stdDev) {
    if (isNaN(winRateFloat)) return "N/A";
    if (stdDev === 0 || isNaN(stdDev)) return GRADE_SCALE[CENTER_GRADE_INDEX];

    const deviationBands = (winRateFloat - mean) / (STD_DEV_BAND_SIZE * stdDev);
    let gradeIndex = Math.floor(deviationBands + 0.5) + CENTER_GRADE_INDEX;

    if (gradeIndex < 0) gradeIndex = 0;
    else if (gradeIndex >= GRADE_SCALE.length) gradeIndex = GRADE_SCALE.length - 1;
    
    return GRADE_SCALE[gradeIndex];
}

async function initialize17LandsData() {
    console.log("Initializing card data from 17Lands CSV...");
    const csvFilePath17Lands = './assets/data/17lands-TDM-card-ratings-2025-05-17.csv';
    try {
        const response = await fetch(csvFilePath17Lands);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} fetching ${csvFilePath17Lands}`);
        
        const csvText = await response.text();
        let lines = csvText.trim().split(/\r?\n/);

        if (lines.length < 2) {
            console.error("17Lands CSV: File is empty or has no data rows.");
            cardData = []; return;
        }

        const headerLine = lines.shift(); 
        const header = parseCsvLine(headerLine);
        const nameIndex = header.indexOf("Name");
        const gihWrIndex = header.indexOf("GIH WR");

        if (nameIndex === -1 || gihWrIndex === -1) {
            console.error("17Lands CSV: Header missing 'Name' or 'GIH WR'. Found:", header);
            cardData = []; return;
        }

        const allGihWrValues = [];
        const rawCardObjects = [];
        for (const line of lines) { 
            const values = parseCsvLine(line);
            if (values.length > Math.max(nameIndex, gihWrIndex)) {
                const cardName = values[nameIndex];
                if (BASIC_LAND_NAMES.includes(cardName.trim())) {
                    console.log(`17Lands CSV: Skipping basic land: ${cardName.trim()}`);
                    continue;
                }
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
            console.error("17Lands CSV: No valid GIH WR values found (excluding basic lands).");
            cardData = []; return;
        }

        const n = allGihWrValues.length;
        meanGihWr17Lands = allGihWrValues.reduce((acc, val) => acc + val, 0) / n;
        const sumSqDiff = allGihWrValues.reduce((acc, val) => acc + Math.pow(val - meanGihWr17Lands, 2), 0);
        stdDevGihWr17Lands = n > 1 ? Math.sqrt(sumSqDiff / (n - 1)) : 0;
        console.log(`17Lands Stats: Mean=${meanGihWr17Lands.toFixed(2)}%, StdDev=${stdDevGihWr17Lands.toFixed(2)}% from ${n} cards (excluding basic lands).`);

        cardData = rawCardObjects.map(rawCard => ({
            name: rawCard.name,
            imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(rawCard.name)}`,
            trueGrade: getGradeFrom17LandsNormalDist(rawCard.gihWrFloat, meanGihWr17Lands, stdDevGihWr17Lands),
            description: "", // 17Lands data doesn't have descriptions
            aiRatingDisplay: "", // No AI Rating from this source
            proRatingDisplay: "" // No Pro Rating display string from this source
        }));
        
        console.log(`Successfully processed ${cardData.length} cards from 17Lands CSV.`);

    } catch (error) {
        console.error("Failed to load/process 17Lands CSV data:", error);
        cardData = [];
    }
}

// =================================================================================
// --- AETHERHUB (from .TXT File - Ratings Only) Specific Logic ---
// =================================================================================
function getGradeFromAetherhubRating(numericalRating) {
    if (typeof numericalRating !== 'number' || isNaN(numericalRating)) {
        console.warn(`Invalid numericalRating for Aetherhub: ${numericalRating}`);
        return "N/A";
    }
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

async function initializeAetherhubRatingsTxtFileData() {
    console.log("Initializing card data from Aetherhub RATINGS TXT file using Pro Ratings...");
    const aetherhubRatingsTxtFilePath = './assets/data/aetherhub-tdm-ratings-2025-05-17.txt'; 
    const AETHERHUB_RATINGS_HEADER = "Card\tPro Rating\tAI Rating\tAPA\tPicked\tALSA\tSeen";
    
    try {
        const response = await fetch(aetherhubRatingsTxtFilePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${aetherhubRatingsTxtFilePath}`);
        }
        const rawTextData = await response.text();
        let lines = rawTextData.trim().split(/\r?\n/);
        const processedCards = [];

        if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
            console.log("Aetherhub RATINGS TXT file: File is effectively empty.");
            cardData = []; return;
        }

        if (lines[0].trim() === AETHERHUB_RATINGS_HEADER.trim()) {
            lines.shift(); 
            console.log("Aetherhub RATINGS TXT: Header row detected and skipped.");
        }
        
        if (lines.length < 2 && !(lines.length === 1 && lines[0].trim() === '')) {
            console.warn("Aetherhub RATINGS TXT file: File has insufficient data rows after potentially skipping header.");
            cardData = []; return;
        }

        for (let i = 0; i < lines.length; i += 2) {
            if (i + 1 >= lines.length) {
                if (lines[i].trim() !== "") {
                    console.warn(`Aetherhub RATINGS TXT: Skipping card name at end, missing ratings: "${lines[i]}"`);
                }
                continue;
            }

            const cardNameLine = lines[i].trim(); 
            const ratingsLine = lines[i+1].trim();

            if (!cardNameLine) {
                if (ratingsLine) {
                    console.warn(`Aetherhub RATINGS TXT: Skipping empty card name at index ${i}. Next line was: "${ratingsLine}"`);
                }
                continue;
            }

            if (BASIC_LAND_NAMES.includes(cardNameLine)) {
                console.log(`Aetherhub RATINGS TXT: Skipping basic land: ${cardNameLine}`);
                continue;
            }
            
            const ratingValues = ratingsLine.split(/\s+/); 
            if (ratingValues.length >= 1) { 
                let proRatingString = ratingValues[0]; 
                let aiRatingDisplayString = ratingValues.length >= 2 ? `AI Rating: ${ratingValues[1]}` : "AI Rating: N/A";

                if (proRatingString.includes("//")) {
                    proRatingString = proRatingString.split("//")[0].trim();
                }
                const proRatingFloat = parseFloat(proRatingString);

                if (!isNaN(proRatingFloat)) {
                    processedCards.push({
                        name: cardNameLine,
                        imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(cardNameLine)}`,
                        trueGrade: getGradeFromAetherhubRating(proRatingFloat),
                        description: "", // This format doesn't have descriptions
                        aiRatingDisplay: aiRatingDisplayString,
                        proRatingDisplay: `Pro Rating: ${ratingValues[0]}` // Store the original string for display
                    });
                } else {
                    console.warn(`Aetherhub RATINGS TXT: Could not parse Pro Rating for "${cardNameLine}". Original: "${ratingValues[0]}", Processed: "${proRatingString}"`);
                }
            } else {
                console.warn(`Aetherhub RATINGS TXT: Could not parse ratings for "${cardNameLine}". Line: "${ratingsLine}"`);
            }
        }
        cardData = processedCards;
        console.log(`Successfully processed ${cardData.length} cards from Aetherhub RATINGS TXT file (using Pro Ratings).`);
        if (cardData.length === 0 && lines.length >=2 && !(lines.length === 1 && lines[0].trim() === '') ) {
            console.error("Aetherhub RATINGS TXT: All entries invalid or unparsable. Check data format and parser.");
        }

    } catch (error) {
        console.error("Failed to load/process Aetherhub RATINGS TXT data:", error);
        cardData = [];
    }
}

// =================================================================================
// --- AETHERHUB (from .TXT File - Card Details with Descriptions) Specific Logic ---
// =================================================================================
async function initializeAetherhubDetailsTxtFileData() {
    console.log("Initializing card data from Aetherhub DETAILS TXT file using Pro Ratings...");
    const aetherhubDetailsTxtFilePath = './assets/data/aetherhub-tdm-details-2025-05-17.txt'; 
    
    try {
        const response = await fetch(aetherhubDetailsTxtFilePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching ${aetherhubDetailsTxtFilePath}`);
        }
        const rawTextData = await response.text();
        const cardBlocks = rawTextData.split(/\n?image\n/).filter(block => block.trim() !== "");
        const processedCards = [];

        if (cardBlocks.length === 0) {
            console.log("Aetherhub DETAILS TXT file: No card blocks found after splitting by 'image'.");
            cardData = []; return;
        }

        for (const block of cardBlocks) {
            const lines = block.trim().split(/\r?\n/);
            if (lines.length < 3) { 
                console.warn(`Aetherhub DETAILS TXT: Skipping block, too few lines: "${block.substring(0, 50)}..."`);
                continue;
            }

            const cardName = lines[0].trim();
            if (!cardName) {
                console.warn(`Aetherhub DETAILS TXT: Skipping block, empty card name. Block: "${block.substring(0,50)}..."`);
                continue;
            }

            if (BASIC_LAND_NAMES.includes(cardName)) {
                console.log(`Aetherhub DETAILS TXT: Skipping basic land: ${cardName}`);
                continue;
            }

            let proRatingStringRaw = null; // Store the full "Pro Rating: X // Y" string
            let proRatingValueForGrade = null; // Store the first part for grading
            let aiRatingDisplayString = null; // Store the full "AI Rating: X" string
            let descriptionLines = [];
            let proRatingLineFound = false;

            for (let j = 1; j < lines.length; j++) {
                const currentLine = lines[j].trim();
                if (currentLine.startsWith("Pro Rating:")) {
                    proRatingStringRaw = currentLine; // e.g., "Pro Rating: 1.5 // 3.0"
                    let tempProRating = currentLine.substring("Pro Rating:".length).trim();
                    if (tempProRating.includes("//")) {
                        proRatingValueForGrade = tempProRating.split("//")[0].trim();
                    } else {
                        proRatingValueForGrade = tempProRating;
                    }
                    proRatingLineFound = true;
                } else if (currentLine.startsWith("AI Rating:")) {
                    aiRatingDisplayString = currentLine; // e.g., "AI Rating: 5"
                } else if (proRatingLineFound || aiRatingDisplayString) { 
                    // If we've already found Pro or AI Rating, subsequent lines are part of the description
                    descriptionLines.push(currentLine);
                } else if (j > 2 && !proRatingLineFound && !aiRatingDisplayString) { 
                    // Fallback for description if ratings are not found quickly
                    descriptionLines.push(currentLine);
                }
            }
            
            if (!proRatingValueForGrade) { // Check if we got a value to parse for grading
                console.warn(`Aetherhub DETAILS TXT: Could not find or parse "Pro Rating:" value for card "${cardName}". Raw Pro Rating line: "${proRatingStringRaw}"`);
                continue; 
            }

            const proRatingFloat = parseFloat(proRatingValueForGrade);

            if (!isNaN(proRatingFloat)) {
                processedCards.push({
                    name: cardName,
                    imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(cardName)}`,
                    trueGrade: getGradeFromAetherhubRating(proRatingFloat),
                    description: descriptionLines.join(" ").trim(),
                    aiRatingDisplay: aiRatingDisplayString || "AI Rating: N/A", // Store the full string or default
                    proRatingDisplay: proRatingStringRaw || `Pro Rating: ${proRatingValueForGrade}` // Store the full string or reconstructed
                });
            } else {
                console.warn(`Aetherhub DETAILS TXT: Could not parse Pro Rating float for "${cardName}". Value used for parsing: "${proRatingValueForGrade}"`);
            }
        }

        cardData = processedCards;
        console.log(`Successfully processed ${cardData.length} cards from Aetherhub DETAILS TXT file.`);
        if (cardData.length === 0 && cardBlocks.length > 0 ) {
            console.error("Aetherhub DETAILS TXT: All card blocks invalid or unparsable. Check data format and parser logic.");
        }

    } catch (error) {
        console.error("Failed to load/process Aetherhub DETAILS TXT data:", error);
        cardData = [];
    }
}


// =================================================================================
// --- Main Initializer ---
// =================================================================================
async function initializeCardData() {
    console.log(`Selected data source: ${SELECTED_DATA_SOURCE}`);
    if (SELECTED_DATA_SOURCE === "17LANDS_CSV") {
        await initialize17LandsData();
    } else if (SELECTED_DATA_SOURCE === "AETHERHUB_RATINGS_TXT_FILE") { 
        await initializeAetherhubRatingsTxtFileData();
    } else if (SELECTED_DATA_SOURCE === "AETHERHUB_DETAILS_TXT_FILE") {
        await initializeAetherhubDetailsTxtFileData();
    } else {
        console.error("Invalid data source selected in card-data.js:", SELECTED_DATA_SOURCE);
        cardData = [];
    }

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
