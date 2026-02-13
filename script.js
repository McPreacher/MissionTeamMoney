const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzj4WZl5mc97Iu7WCeJ3cc3-TEeg0CwdSeYaKh392Q5p5PNWv-f5JOxYIDceb7DDsXh_A/exec";

const moneyForm = document.getElementById('moneyForm');
const personForm = document.getElementById('personForm');
const nameDropdown = document.getElementById('nameDropdown');
const globalGoalInput = document.getElementById('globalGoal');
const groupView = document.getElementById('groupView');

let participantRoles = {};
let lastData = []; 

// --- AUTO-REFRESH ---
setInterval(() => {
    fetchData(); 
}, 30000);

function handleGroupSwitch() {
    const group = groupView.value;
    document.getElementById('currentGroupName').innerText = group;
    const savedGoal = localStorage.getItem(`goal_${group}`) || "2300";
    globalGoalInput.value = savedGoal;
    processAndRender(lastData);
}

function toggleLoading(formId, isLoading, message = "Processing...") {
    const form = document.getElementById(formId);
    if(!form) return;
    const btn = form.querySelector('button');
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerText;
        btn.innerText = message;
    } else {
        btn.disabled = false;
        btn.innerText = btn.dataset.originalText;
    }
}

async function fetchData() {
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`);
        const data = await response.json();
        if (JSON.stringify(data) !== JSON.stringify(lastData)) {
            lastData = data; 
            processAndRender(data);
        }
        return data; 
    } catch (error) { console.error("Fetch Error:", error); }
}

async function handleGoalUpdate() {
    localStorage.setItem(`goal_${groupView.value}`, globalGoalInput.value);
    processAndRender(lastData);
}

// --- UPDATED DELETE TRANSACTION ---
async function deleteTransaction(name, comment) {
    if (!confirm(`Delete: "${comment}" for ${name}?`)) return;
    document.body.style.cursor = "wait";
    
    await sendToSheet({ 
        name: name, 
        comment: comment, 
        group: groupView.value, 
        action: 'DELETE_TRANSACTION' 
    });
    
    setTimeout(async () => {
        await fetchData();
        document.body.style.cursor = "default";
    }, 2000);
}

async function deletePerson(name) {
    if (!confirm(`Delete all records for ${name}?`)) return;
    await sendToSheet({ name: name, action: 'DELETE', group: groupView.value });
    setTimeout(fetchData, 2000);
}

function toggleTrxMenu(event, uniqueMenuId) {
    event.stopPropagation(); 
    document.querySelectorAll('.trx-menu').forEach(menu => {
        if (menu.id !== uniqueMenuId) menu.classList.remove('show');
    });
    const menu = document.getElementById(uniqueMenuId);
    if (menu) {
        menu.classList.toggle('show');
        document.addEventListener('click', () => menu.classList.remove('show'), { once: true });
    }
}

function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value) || 0;
    const sortType = document.getElementById('sortOrder').value;
    const currentGroup = groupView.value;

    studentContainer.innerHTML = '';
    chaperoneContainer.innerHTML = '';
    
    const totals = data.reduce((acc, entry) => {
        const entryGroup = entry.Group || 'Seniors'; 
        if (entryGroup !== currentGroup) return acc;
        if (!acc[entry.Name]) {
            acc[entry.Name] = { role: entry.Role, total: 0, transactions: [], lastId: 0 };
            participantRoles[entry.Name] = entry.Role;
        }
        const amount = parseFloat(entry.Amount || 0);
        acc[entry.Name].total += amount;
        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].transactions.push({ id: entry.id, comment: entry.Comment, amount: amount });
        }
        return acc;
    }, {});

    Object.keys(totals).sort().forEach(name => {
        const person = totals[name];
        const card = document.createElement('div');
        card.className = 'card';
        let balanceClass = person.total >= goal ? 'balance-green' : 'balance-red';

        card.innerHTML = `
            <button onclick="deletePerson('${name}')" class="delete-btn">🗑️</button>
            <div class="card-header"><strong>${name}</strong><span>${person.role}</span></div>
            <hr>
            <div>Balance: <span class="${balanceClass}">$${person.total.toFixed(2)}</span></div>
            <div class="history-section">
                <ul class="history-list">
                    ${person.transactions.map((t, idx) => {
                        const uiMenuId = `menu-${name.replace(/\s+/g, '-')}-${idx}`;
                        return `
                        <li class="history-item">
                            <span>${t.comment} ($${t.amount})</span>
                            <div class="menu-container">
                                <button class="trx-dots" onclick="toggleTrxMenu(event, '${uiMenuId}')">⋮</button>
                                <div id="${uiMenuId}" class="trx-menu">
                                    <button onclick="deleteTransaction('${name}', '${t.comment.replace(/'/g, "\\'")}')">Delete</button>
                                </div>
                            </div>
                        </li>`;
                    }).join('') || '<li>Registered</li>'}
                </ul>
            </div>`;
        (person.role === 'Student' ? studentContainer : chaperoneContainer).appendChild(card);
    });

    nameDropdown.innerHTML = '<option value="">-- Select Person --</option>';
    Object.keys(totals).sort().forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        nameDropdown.appendChild(opt);
    });
}

moneyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameDropdown.value;
    toggleLoading('moneyForm', true, "Posting...");
    await sendToSheet({ 
        id: "TRX-" + Date.now(),
        name, amount: document.getElementById('amount').value, 
        comment: document.getElementById('comment').value, 
        role: participantRoles[name], group: groupView.value 
    });
    moneyForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('moneyForm', false); }, 2000);
});

personForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoading('personForm', true, "Registering...");
    await sendToSheet({ 
        id: "USR-" + Date.now(),
        name: document.getElementById('newName').value, 
        role: document.getElementById('newRole').value, 
        amount: 0, comment: "Registration", group: groupView.value 
    });
    personForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('personForm', false); }, 2000);
});

async function sendToSheet(payload) {
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ ...payload, action: payload.action || 'ADD' })
        });
    } catch (e) { console.error("POST Error:", e); }
}

window.addEventListener('DOMContentLoaded', () => { handleGroupSwitch(); fetchData(); });