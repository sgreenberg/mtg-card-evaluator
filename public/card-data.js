// card-data.js

// This array will be populated by the selected data source.
let cardData = [];

// --- CONFIGURATION: Select your data source ---
// The app is now configured to use Nizzahon and 17Lands data.
const SELECTED_DATA_SOURCE = "NIZZAHON_AND_17LANDS"; 

// --- Common Grade Scale ---
const GRADE_SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const BASIC_LAND_NAMES = ["Plains", "Island", "Swamp", "Mountain", "Forest"]; // Keep this for filtering if needed

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
// --- NIZZAHON & 17LANDS (TSV, TXT, CSV Files) Specific Logic ---
// =================================================================================
async function initializeNizzahonAnd17LandsData() {
    console.log("Initializing card data from Nizzahon (ratings & comments) and 17Lands (GIH WR)...");
    // Ensure these paths are correct relative to your index.html
    // If index.html is in the root, and data files are in 'assets/data/', these paths are correct.
    const nizzahonRatingsPath = './assets/data/nizzahon-ratings-TDM-2025-05-19.tsv';
    const nizzahonCommentsPath = './assets/data/nizzahon-comments-TDM-2025-05-19.txt';
    const seventeenLandsPath = './assets/data/17lands-TDM-card-ratings-2025-05-17.csv';

    try {
        // 1. Fetch Nizzahon Ratings (TSV)
        const nizzahonRatingsResponse = await fetch(nizzahonRatingsPath);
        if (!nizzahonRatingsResponse.ok) throw new Error(`HTTP error! status: ${nizzahonRatingsResponse.status} fetching ${nizzahonRatingsPath}`);
        const nizzahonRatingsText = await nizzahonRatingsResponse.text();
        const nizzahonRatings = {}; // Store as { "Card Name": "Grade" }
        const nizzahonRatingLines = nizzahonRatingsText.trim().split(/\r?\n/);

        // Assume no header for Nizzahon Ratings TSV
        // Card name is in the first column (index 0), Grade is in the second column (index 1)
        if (nizzahonRatingLines.length > 0) {
            nizzahonRatingLines.forEach(line => {
                const parts = line.split('\t');
                if (parts.length >= 2) { // Ensure there are at least two columns
                    const cardName = parts[0].trim(); // First column
                    const grade = parts[1].trim();    // Second column
                    if (cardName && grade) {
                        nizzahonRatings[cardName] = grade;
                    }
                } else {
                    console.warn(`Skipping malformed line in Nizzahon ratings TSV: "${line}"`);
                }
            });
        }
        console.log(`Loaded ${Object.keys(nizzahonRatings).length} ratings from Nizzahon.`);

        // 2. Fetch Nizzahon Comments (TXT)
        const nizzahonCommentsResponse = await fetch(nizzahonCommentsPath);
        if (!nizzahonCommentsResponse.ok) throw new Error(`HTTP error! status: ${nizzahonCommentsResponse.status} fetching ${nizzahonCommentsPath}`);
        const nizzahonCommentsText = await nizzahonCommentsResponse.text();
        const nizzahonComments = {}; // Store as { "Card Name": "Comment" }
        const commentLines = nizzahonCommentsText.trim().split(/\r?\n/);
        let currentCardNameForComment = null;
        let currentCommentLines = [];
        // Regex to capture "Card Name" from lines like "1 - Ugin, Eye of the Storms - A"
        const cardHeaderRegex = /^\s*\d+\s*-\s*(.*?)\s*-\s*([A-F][+-]?(?:\s*\(.*\))?)\s*$/;
        const sectionHeaderRegex = /^(Colorless|White|Blue|Black|Red|Green|Multicolored|Artifact|Land):/i;

        for (const line of commentLines) {
            const headerMatch = line.match(cardHeaderRegex);
            if (headerMatch) {
                if (currentCardNameForComment && currentCommentLines.length > 0) {
                    nizzahonComments[currentCardNameForComment] = currentCommentLines.join(' ').trim();
                }
                currentCardNameForComment = headerMatch[1].trim(); 
                currentCommentLines = []; 
            } else if (currentCardNameForComment && line.trim() !== "" && !line.match(sectionHeaderRegex)) {
                currentCommentLines.push(line.trim());
            } else if (line.match(sectionHeaderRegex) && currentCardNameForComment && currentCommentLines.length > 0){
                nizzahonComments[currentCardNameForComment] = currentCommentLines.join(' ').trim();
                currentCardNameForComment = null; 
                currentCommentLines = []; 
            }
        }
        if (currentCardNameForComment && currentCommentLines.length > 0) {
            nizzahonComments[currentCardNameForComment] = currentCommentLines.join(' ').trim();
        }
        console.log(`Loaded ${Object.keys(nizzahonComments).length} comments from Nizzahon.`);

        // 3. Fetch 17Lands Data (CSV for GIH WR)
        const seventeenLandsResponse = await fetch(seventeenLandsPath);
        if (!seventeenLandsResponse.ok) throw new Error(`HTTP error! status: ${seventeenLandsResponse.status} fetching ${seventeenLandsPath}`);
        const seventeenLandsCsvText = await seventeenLandsResponse.text();
        const seventeenLandsData = {}; // Store as { "Card Name": "GIH WR" }
        let seventeenLines = seventeenLandsCsvText.trim().split(/\r?\n/);
        if (seventeenLines.length > 1) { 
            const headerLine = seventeenLines.shift(); 
            const header = parseCsvLine(headerLine);
            const nameIndex17L = header.indexOf("Name");
            const gihWrIndex17L = header.indexOf("GIH WR");

            if (nameIndex17L === -1 || gihWrIndex17L === -1) {
                console.error("17Lands CSV: Header missing 'Name' or 'GIH WR'. Found:", header);
            } else {
                for (const line of seventeenLines) {
                    const values = parseCsvLine(line);
                    if (values.length > Math.max(nameIndex17L, gihWrIndex17L)) {
                        const cardName = values[nameIndex17L].trim();
                        const gihWrString = values[gihWrIndex17L].trim();
                        if (cardName && gihWrString) {
                            seventeenLandsData[cardName] = gihWrString;
                        }
                    }
                }
            }
        }
        console.log(`Loaded ${Object.keys(seventeenLandsData).length} GIH WR entries from 17Lands.`);

        // 4. Merge Data
        const mergedCardData = [];
        for (const cardName in nizzahonRatings) {
            if (BASIC_LAND_NAMES.includes(cardName)) { 
                console.log(`Skipping basic land: ${cardName}`);
                continue;
            }
            if (Object.hasOwnProperty.call(nizzahonRatings, cardName)) {
                const trueGrade = nizzahonRatings[cardName];
                const description = nizzahonComments[cardName] || "No comment available for this card.";
                const gihWRRaw = seventeenLandsData[cardName]; 
                const gihWR = gihWRRaw ? `17Lands GIH WR: ${gihWRRaw}` : "17Lands GIH WR: N/A";

                mergedCardData.push({
                    name: cardName,
                    imageUrl: `https://api.scryfall.com/cards/named?format=image&version=normal&fuzzy=${encodeURIComponent(cardName)}`,
                    trueGrade: trueGrade,
                    description: description, 
                    gihWR: gihWR,             
                    aiRatingDisplay: "",      
                    proRatingDisplay: ""      
                });
            }
        }
        cardData = mergedCardData;
        console.log(`Successfully processed ${cardData.length} cards using Nizzahon and 17Lands data.`);

    } catch (error) {
        console.error("Failed to load/process Nizzahon/17Lands data:", error);
        cardData = []; 
    }
}


// =================================================================================
// --- Main Initializer ---
// =================================================================================
async function initializeCardData() {
    console.log(`Selected data source: ${SELECTED_DATA_SOURCE}`);
    
    if (SELECTED_DATA_SOURCE === "NIZZAHON_AND_17LANDS") {
        await initializeNizzahonAnd17LandsData();
    } else {
        // This case should ideally not be reached if SELECTED_DATA_SOURCE is always NIZZAHON_AND_17LANDS
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
// If card-data.js is loaded as a module, this might need adjustment, but current setup seems direct script include.
