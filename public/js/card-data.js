// card-data.js

// This array will be populated by the selected data source.
let cardData = [];

// --- CONFIGURATION: Select your data source ---
const SELECTED_DATA_SOURCE = "TDM_CSV_ONLY"; // Updated to reflect the single CSV source

// --- Common Grade Scale (used for reference or UI, not for AH_Pro_Rating conversion directly) ---
const GRADE_SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const BASIC_LAND_NAMES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

// --- Helper: Generic CSV Line Parser ---
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
            values.push(currentVal.trim().replace(/^"|"$/g, '')); // Also remove surrounding quotes from values
            currentVal = '';
        } else {
            currentVal += char;
        }
    }
    values.push(currentVal.trim().replace(/^"|"$/g, ''));
    return values;
}

// --- Helper: Convert AH_Pro_Rating (numeric string) to Letter Grade ---
function convertProRatingToGrade(ratingString) {
    if (ratingString === null || typeof ratingString === 'undefined' || ratingString.trim() === "" || ratingString.trim().toUpperCase() === "N/A") {
        return "N/A";
    }

    let numericPart = ratingString.split(/[\/\s]+/)[0].trim(); // Take the first part if there's a / or //, and trim

    if (numericPart === "") return "N/A";

    const numValue = parseFloat(numericPart);

    if (isNaN(numValue)) {
        return "N/A";
    }

    const ratingMap = {
        0.0: "F",
        0.5: "D",
        1.0: "C-",
        1.5: "C",
        2.0: "C+",
        2.5: "B-",
        3.0: "B",
        3.5: "B+",
        4.0: "A-",
        4.5: "A",
        5.0: "A+"
    };

    return ratingMap[numValue] !== undefined ? ratingMap[numValue] : "N/A";
}


// =================================================================================
// --- TDM_DATA.CSV Specific Logic ---
// =================================================================================
async function initializeTdmCsvData() {
    console.log("Initializing card data from tdm_data.csv...");
    const tdmDataPath = './assets/data/tdm/tdm_data.csv';

    try {
        const response = await fetch(tdmDataPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} fetching ${tdmDataPath}`);
        const csvText = await response.text();
        const lines = csvText.trim().split(/\r?\n/);

        if (lines.length < 2) {
            console.error("CSV data is empty or missing headers.");
            cardData = [];
            return;
        }

        const headerLine = lines.shift();
        const header = parseCsvLine(headerLine);

        // Find column indices - more robustly
        const nameIndex = header.findIndex(h => h.toLowerCase() === 'name');
        const ahProRatingIndex = header.findIndex(h => h.toLowerCase() === 'ah_pro_rating');
        const ahCommentIndex = header.findIndex(h => h.toLowerCase() === 'ah_comment');
        const gihWrIndex = header.findIndex(h => h.toLowerCase() === '17l_gih wr'); // Note: 17L specific prefix and space

        if (nameIndex === -1) throw new Error("CSV Header missing 'Name'");
        if (ahProRatingIndex === -1) throw new Error("CSV Header missing 'AH_Pro_Rating'");
        if (ahCommentIndex === -1) throw new Error("CSV Header missing 'AH_Comment'");
        if (gihWrIndex === -1) throw new Error("CSV Header missing '17L_GIH WR'");

        const processedCardData = [];
        for (const line of lines) {
            const values = parseCsvLine(line);
            if (values.length < header.length) {
                console.warn(`Skipping malformed CSV line (expected ${header.length} values, got ${values.length}): "${line}"`);
                continue;
            }

            const cardName = values[nameIndex];
            if (BASIC_LAND_NAMES.includes(cardName)) {
                // console.log(`Skipping basic land: ${cardName}`);
                continue;
            }

            const ahProRatingRaw = values[ahProRatingIndex];
            const trueGrade = convertProRatingToGrade(ahProRatingRaw);

            let description = values[ahCommentIndex];
            if (!description || description.toUpperCase() === "N/A") {
                description = "No comment available for this card.";
            }
            
            let gihWRRaw = values[gihWrIndex];
            let gihWR = "Win Rate: N/A";
            if (gihWRRaw && gihWRRaw.toUpperCase() !== "N/A" && gihWRRaw.trim() !== "") {
                 gihWR = `Win Rate: ${gihWRRaw}`;
            }


            processedCardData.push({
                name: cardName,
                imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(cardName)}`,
                trueGrade: trueGrade,
                description: description,
                gihWR: gihWR,
                aiRatingDisplay: "", // Per requirements, not directly used from CSV for display
                proRatingDisplay: "" // Per requirements, trueGrade is the converted Pro Rating
            });
        }
        cardData = processedCardData;
        console.log(`Successfully processed ${cardData.length} cards from ${tdmDataPath}.`);

    } catch (error) {
        console.error("Failed to load/process data from tdm_data.csv:", error);
        cardData = [];
    }
}


// =================================================================================
// --- Main Initializer ---
// =================================================================================
async function initializeCardData() {
    console.log(`Selected data source: ${SELECTED_DATA_SOURCE}`);
    
    if (SELECTED_DATA_SOURCE === "TDM_CSV_ONLY") {
        await initializeTdmCsvData();
    } else {
        console.error("Invalid or unsupported data source selected in card-data.js:", SELECTED_DATA_SOURCE);
        cardData = [];
    }

    if (cardData.length === 0) {
        console.warn("Card data is empty after initialization attempt.");
        if (typeof document !== 'undefined' && document.getElementById('cardName')) {
             document.getElementById('cardName').textContent = "Error: No card data loaded!";
        }
        if (typeof document !== 'undefined' && document.getElementById('cardImage')) {
            document.getElementById('cardImage').src = "https://placehold.co/265x370/FF0000/FFFFFF?text=No+Data&font=lora";
        }
    }
}

// Make sure initializeCardData is globally accessible if it's called from HTML's window.onload
// If card-data.js is loaded as a module, this might need adjustment.
// Assuming direct script include as per original structure.