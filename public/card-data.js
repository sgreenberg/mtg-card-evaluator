// card-data.js

// This array will be populated by the selected data source.
let cardData = [];

// --- CONFIGURATION: Select your data source ---
// The app is now configured to use Nizzahon ratings, Aetherhub comments, and 17Lands data.
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
// --- NIZZAHON Ratings, AETHERHUB Comments & 17LANDS (TSV, TXT, CSV Files) Specific Logic ---
// =================================================================================
async function initializeNizzahonAnd17LandsData() {
    console.log("Initializing card data from Nizzahon ratings, Aetherhub comments, and 17Lands (GIH WR)...");
    // Ensure these paths are correct relative to your index.html
    const nizzahonRatingsPath = './assets/data/nizzahon-ratings-TDM-2025-05-19.tsv';
    const aetherhubCommentsPath = './assets/data/aetherhub-comments-TDM-2025-05-20.txt'; // Updated path for comments
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
                if (parts.length >= 2) { 
                    const cardName = parts[0].trim(); 
                    const grade = parts[1].trim();    
                    if (cardName && grade) {
                        nizzahonRatings[cardName] = grade;
                    }
                } else {
                    console.warn(`Skipping malformed line in Nizzahon ratings TSV: "${line}"`);
                }
            });
        }
        console.log(`Loaded ${Object.keys(nizzahonRatings).length} ratings from Nizzahon.`);

        // 2. Fetch Aetherhub Comments (TXT)
        const aetherhubCommentsResponse = await fetch(aetherhubCommentsPath);
        if (!aetherhubCommentsResponse.ok) throw new Error(`HTTP error! status: ${aetherhubCommentsResponse.status} fetching ${aetherhubCommentsPath}`);
        const aetherhubCommentsText = await aetherhubCommentsResponse.text();
        const cardComments = {}; // Stores comments, now from Aetherhub
        const commentFileLines = aetherhubCommentsText.trim().split(/\r?\n/);

        let currentCardNameForComment = null;
        let currentCommentLines = [];
        const aiRatingRegex = /^AI Rating:/i;
        const proRatingRegex = /^Pro Rating:/i;

        for (const line of commentFileLines) {
            const trimmedLine = line.trim();
            if (!currentCardNameForComment) { // Expecting a card name
                if (trimmedLine !== "") {
                    currentCardNameForComment = trimmedLine;
                    currentCommentLines = []; // Reset for new card
                }
            } else { // Already have a card name
                if (trimmedLine === "") { // Empty line signifies end of entry for currentCardNameForComment
                    if (currentCardNameForComment) { // Check if a card name was actually set
                        if (currentCommentLines.length > 0) {
                            cardComments[currentCardNameForComment] = currentCommentLines.join(' ').trim();
                        } else {
                            // Card name was found, but no actual comment lines (could be just name, or name + ratings then empty line)
                            cardComments[currentCardNameForComment] = "No comment available for this card."; 
                        }
                    }
                    currentCardNameForComment = null; // Reset to expect new card name
                    currentCommentLines = []; // Clear lines for the next card
                } else if (aiRatingRegex.test(trimmedLine) || proRatingRegex.test(trimmedLine)) {
                    // This is a rating line, ignore it for comment text
                    continue;
                } else {
                    // This is a comment line
                    currentCommentLines.push(trimmedLine);
                }
            }
        }
        // After loop, handle any pending comment for the last card in the file
        if (currentCardNameForComment) { // Check if a card name was pending
             if (currentCommentLines.length > 0) {
                cardComments[currentCardNameForComment] = currentCommentLines.join(' ').trim();
            } else {
                cardComments[currentCardNameForComment] = "No comment available for this card.";
            }
        }
        console.log(`Loaded ${Object.keys(cardComments).length} comments from Aetherhub.`);

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
        for (const cardName in nizzahonRatings) { // Iterate based on Nizzahon's ratings list
            if (BASIC_LAND_NAMES.includes(cardName)) { 
                console.log(`Skipping basic land: ${cardName}`);
                continue;
            }
            if (Object.hasOwnProperty.call(nizzahonRatings, cardName)) {
                const trueGrade = nizzahonRatings[cardName];
                // Use comments from Aetherhub (cardComments object)
                const description = cardComments[cardName] || "Comment not found for this card."; 
                const gihWRRaw = seventeenLandsData[cardName]; 
                const gihWR = gihWRRaw ? `Win Rate: ${gihWRRaw}` : "Win Rate: N/A";

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
        console.log(`Successfully processed ${cardData.length} cards using Nizzahon ratings, Aetherhub comments, and 17Lands data.`);

    } catch (error) {
        console.error("Failed to load/process data:", error);
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
