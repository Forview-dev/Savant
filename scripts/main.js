const TRUNCATE_SIZE = 150;

const cardContainer = document.querySelector('.card-container');
const SOPModal = document.querySelector('.full-SOP-modal');
const searchField = document.querySelector('#search');
searchField.addEventListener('input', (e) => {
    console.log(e.target.value);
});

// TODO: Implement a search feature

const SOPList = [];

function SOP(title, desc, content, author, tags, date) {
    if (!new.target) {
        throw Error("You must use the 'new' operator to call the constructor");
    }

    this.uuid = crypto.randomUUID();
    this.title = title;
    this.desc = desc;
    this.content = content;
    this.author = author;
    this.tags = tags;
    this.date = date;
}

function addSOPToList(title, desc, content, author, tags, date) {
    const sop = new SOP(title, desc, content, author, tags, date);

    SOPList.push(sop);
}

function updateCardList() {
    for(let i = 0; i < SOPList.length; i++){
        createNewCard(i);
    }
}

function createNewCard(SOPListIndex) {
    const card = document.createElement('div');
    card.classList.add('card');

    const cardTitle = document.createElement('span');
    cardTitle.classList.add('card-title');
    cardTitle.textContent = SOPList[SOPListIndex].title;
    card.appendChild(cardTitle);

    const cardDesc = document.createElement('p');
    cardDesc.textContent = SOPList[SOPListIndex].desc;
    card.appendChild(cardDesc);

    const cardContent = document.createElement('p');
    let content = SOPList[SOPListIndex].content
    if(content.length > TRUNCATE_SIZE) {
        cardContent.textContent = content.substring(0, TRUNCATE_SIZE) + ' [...]';
    }
    else {
        cardContent.textContent = content;
    }
    card.appendChild(cardContent);

    const cardFooter = document.createElement('footer');
    cardFooter.textContent = SOPList[SOPListIndex].uuid;
    card.appendChild(cardFooter);

    card.addEventListener('click', () => {
        SOPModal.replaceChildren();
        const modalTitle = document.createElement('div');
        modalTitle.classList.add('card-title');
        modalTitle.textContent = SOPList[SOPListIndex].title;
        SOPModal.appendChild(modalTitle);

        const modalContent = document.createElement('p');
        modalContent.textContent = SOPList[SOPListIndex].content
        SOPModal.appendChild(modalContent);

        const modalFooter = document.createElement('footer');
        modalFooter.textContent = 'Par '+SOPList[SOPListIndex].author+' le '+SOPList[SOPListIndex].date;
        SOPModal.appendChild(modalFooter);

        SOPModal.showModal();
    });
    cardContainer.appendChild(card);
}

addSOPToList("SONE - Effectuer un BAS", "Etapes pour effectuer un BAS dans SONE", "1. Aller dans le FOU. \n2. Sélectionner le BBE. \n3. Cliquer sur *Fin des formalités*", "Alex", "SONE;BAS", "21/09/2025");

addSOPToList("Ci5 - Effectuer un BAS", "Etapes pour effectuer un BAS dans Ci5", "1. Aller dans le dossier. \n2. Cliquer sur *Close*", "Alex", "Ci5;BAS", "21/09/2025");

addSOPToList("Soumettre un titre de transit", "Etapes pour soumettre un titre de transit dans CVC", "1. Aller dans l'onglet Transit sur CVC. \n2. *a rédiger*", "Alex", "CVC;transit;T1;T2;T2L", "21/09/2025");

addSOPToList("SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");
addSOPToList("SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");
addSOPToList("SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");
addSOPToList("SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");
addSOPToList("SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");
addSOPToList("SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");
addSOPToList("Long SOP de test", "Etapes pour soumettre un SOP de test", "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. \nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.", "Alex", "CVC;SOP", "21/09/2025");

updateCardList();
