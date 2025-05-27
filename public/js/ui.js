// ui.js

const grades = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]; 
const gradeValues = {}; 
grades.forEach((grade, index) => gradeValues[grade] = index);
const loadingCardPlaceholderBase = "https://placehold.co/{width}x{height}/1f2937/e2e8f0?text=Loading+Card...&font=lora";

const cardImageEl = document.getElementById('cardImage');
const gradeButtonsContainerEl = document.getElementById('gradeButtonsContainer');

const resultModalEl = document.getElementById('resultModal'); 
const userGuessTextEl = document.getElementById('userGuessText');
const trueGradeTextEl = document.getElementById('trueGradeText');

const proRatingDisplayEl = document.getElementById('proRatingDisplay'); 
const aiRatingDisplayEl = document.getElementById('aiRatingDisplay');   
const gihWRDisplayEl = document.getElementById('gihWRDisplay');       
const cardDescriptionEl = document.getElementById('cardDescription'); 
const cardDetailsContainerEl = document.getElementById('cardDetailsContainer');

const hamburgerBtnEl = document.getElementById('hamburgerBtn');
const slideOutMenuEl = document.getElementById('slideOutMenu');

const menuNewGameLink = document.getElementById('menuNewGame');
const menuResultsLink = document.getElementById('menuResults');
const menuHowToPlayLink = document.getElementById('menuHowToPlay');
const menuAboutLink = document.getElementById('menuAbout');

const newGameModalEl = document.getElementById('newGameModal');
const resultsModalPopupEl = document.getElementById('resultsModalPopup');
const howToPlayModalEl = document.getElementById('howToPlayModal');
const aboutModalEl = document.getElementById('aboutModal');

const allPopupModals = document.querySelectorAll('.popup-modal');

let currentCard = null; 
let evaluatedCardIndices = []; 

function createGradeButtons() {
    gradeButtonsContainerEl.innerHTML = ''; 
    const gradeOrderForGrid = ['D+', 'C+', 'B+', 'A+', 'D',  'C',  'B',  'A', 'D-', 'C-', 'B-', 'A-'];
    const fButton = document.createElement('button');
    fButton.textContent = 'F';
    fButton.classList.add('grade-button', 'grade-button-f');
    fButton.addEventListener('click', () => { if (!currentCard) return; handleSubmitGrade('F'); });
    gradeButtonsContainerEl.appendChild(fButton);
    gradeOrderForGrid.forEach(gradeKey => {
        const button = document.createElement('button');
        button.textContent = gradeKey;
        button.classList.add('grade-button');
        button.addEventListener('click', () => { if (!currentCard) return; handleSubmitGrade(gradeKey); });
        gradeButtonsContainerEl.appendChild(button);
    });
}

function getLoadingCardPlaceholder() {
    const w = 300; 
    const h = 419;
    return loadingCardPlaceholderBase.replace("{width}", w).replace("{height}", h);
}

function loadRandomCard() {
    cardImageEl.src = getLoadingCardPlaceholder();
    resultModalEl.classList.remove('visible'); 
    gradeButtonsContainerEl.classList.remove('hidden'); 

    if (typeof cardData === 'undefined' || !Array.isArray(cardData) || cardData.length === 0) {
        console.error("Card data not loaded or empty!");
        cardImageEl.src = `https://placehold.co/300x419/FF0000/FFFFFF?text=Data+Error&font=lora`;
        gradeButtonsContainerEl.classList.add('hidden');
        return;
    }
    
    if (evaluatedCardIndices.length === cardData.length && cardData.length > 0) {
            evaluatedCardIndices = []; 
            console.log("All cards seen, reshuffling.");
    }

    let randomIndex;
    let attempts = 0; 
    do {
        randomIndex = Math.floor(Math.random() * cardData.length);
        attempts++;
    } while (evaluatedCardIndices.includes(randomIndex) && cardData.length > evaluatedCardIndices.length && attempts < cardData.length * 2);
    
    currentCard = cardData[randomIndex];
    evaluatedCardIndices.push(randomIndex);

    cardImageEl.onerror = function() { 
        this.onerror=null; 
        this.src=`https://placehold.co/300x419/7F8C8D/FFFFFF?text=Image+Not+Found&font=lora`;
        console.warn(`Failed to load image for: ${currentCard.name} from ${currentCard.imageUrl}. Using placeholder.`);
    };
    cardImageEl.src = currentCard.imageUrl; 
    cardImageEl.alt = currentCard.name; 

    resultModalEl.classList.remove('visible');
    gradeButtonsContainerEl.classList.remove('hidden');
    allPopupModals.forEach(modal => modal.classList.remove('visible'));
    slideOutMenuEl.classList.remove('open');
}

function handleSubmitGrade(userGrade) { 
    if (!currentCard) return; 
    const trueGrade = currentCard.trueGrade; 
    userGuessTextEl.textContent = `Your Guess: ${userGrade}`;
    trueGradeTextEl.textContent = `True Grade: ${trueGrade}`; 
    const userGradeVal = gradeValues[userGrade];
    const trueGradeVal = gradeValues[trueGrade];
    let feedbackBorderClass = "border-slate-500"; 

    if (trueGrade !== "N/A" && typeof trueGradeVal !== 'undefined') {
        if (userGradeVal === trueGradeVal) feedbackBorderClass = "modal-feedback-correct";
        else if (Math.abs(userGradeVal - trueGradeVal) <= 2) feedbackBorderClass = "modal-feedback-close";
        else if (Math.abs(userGradeVal - trueGradeVal) <= 4) feedbackBorderClass = "modal-feedback-close";
        else feedbackBorderClass = "modal-feedback-off";
    }
    
    cardDescriptionEl.textContent = currentCard.description || "No comments available.";
    gihWRDisplayEl.textContent = currentCard.gihWR || "Win Rate: N/A";
    proRatingDisplayEl.classList.add('hidden'); 
    aiRatingDisplayEl.classList.add('hidden');
    gihWRDisplayEl.classList.toggle('hidden', !currentCard.gihWR || currentCard.gihWR === "Win Rate: N/A");
    cardDescriptionEl.classList.toggle('hidden', !currentCard.description || currentCard.description.includes("No comment available") || currentCard.description.includes("Comment not found"));
    const hasDetailsToShow = (gihWRDisplayEl.textContent !== "Win Rate: N/A" && !gihWRDisplayEl.classList.contains('hidden')) || 
                            (cardDescriptionEl.textContent !== "No comments available." && !cardDescriptionEl.classList.contains('hidden'));
    cardDetailsContainerEl.classList.toggle('hidden', !hasDetailsToShow);
    
    resultModalEl.className = ''; 
    resultModalEl.classList.add(feedbackBorderClass, 'visible'); 
    gradeButtonsContainerEl.classList.add('hidden'); 
}

function handleAdvanceScreen(event) {
    if (resultModalEl.classList.contains('visible') && !event.target.closest('a, button')) {
        resultModalEl.classList.remove('visible');
        loadRandomCard();
    }
}
document.body.addEventListener('click', handleAdvanceScreen, true); 

hamburgerBtnEl.addEventListener('click', (e) => {
    e.stopPropagation(); 
    slideOutMenuEl.classList.toggle('open');
    allPopupModals.forEach(modal => modal.classList.remove('visible')); 
});

document.addEventListener('click', (e) => {
    if (slideOutMenuEl.classList.contains('open') && !slideOutMenuEl.contains(e.target) && e.target !== hamburgerBtnEl && !hamburgerBtnEl.contains(e.target)) {
        slideOutMenuEl.classList.remove('open');
    }
});

function openPopupModal(modalElement) {
    allPopupModals.forEach(m => m.classList.remove('visible')); 
    if (modalElement) {
        modalElement.classList.add('visible');
        slideOutMenuEl.classList.remove('open'); 
    }
}

menuNewGameLink.addEventListener('click', (e) => { e.preventDefault(); openPopupModal(newGameModalEl); });
menuResultsLink.addEventListener('click', (e) => { e.preventDefault(); openPopupModal(resultsModalPopupEl); });
menuHowToPlayLink.addEventListener('click', (e) => { e.preventDefault(); openPopupModal(howToPlayModalEl); });
menuAboutLink.addEventListener('click', (e) => { e.preventDefault(); openPopupModal(aboutModalEl); });

allPopupModals.forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) { this.classList.remove('visible'); }
        const targetLink = e.target.closest('.cancel-link');
        if (targetLink) {
            e.preventDefault();
            const action = targetLink.dataset.action;
            const modalIdToClose = targetLink.dataset.modalId;
            if (action === 'confirm-new-game') {
                this.classList.remove('visible');
                evaluatedCardIndices = []; 
                loadRandomCard(); 
            } else if (action === 'close-modal' && modalIdToClose) {
                document.getElementById(modalIdToClose).classList.remove('visible');
            } else if (action === 'close-modal') { 
                this.classList.remove('visible');
            }
        }
    });
});

window.onload = async () => {
    const initialPlaceholder = document.getElementById('cardImage');
    if (initialPlaceholder) {
        initialPlaceholder.src = getLoadingCardPlaceholder();
    }

    createGradeButtons(); 
    if (typeof initializeCardData === 'function') {
        await initializeCardData(); 
    } else {
        console.error("initializeCardData function not found.");
        if (cardImageEl) cardImageEl.src = `https://placehold.co/300x419/FF0000/FFFFFF?text=Script+Error&font=lora`;
        if (gradeButtonsContainerEl) gradeButtonsContainerEl.classList.add('hidden');
        return;
    }
    loadRandomCard(); 
};