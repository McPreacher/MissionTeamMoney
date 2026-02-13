const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyIuzCSRmEijv2cI1vrgpF4I-0SfqUvXx8iLnqVhX4dCzJfhpk2z2IXHqnU0E9bbWjhnQ/exec";

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

// --- GROUP MANAGEMENT ---
function handleGroupSwitch() {
    const group = groupView.value;
    document.getElementById('currentGroupName').innerText = group;
    const savedGoal = localStorage.getItem(`goal_${group}`) || "2300";
    globalGoalInput.value = savedGoal;
    processAndRender(lastData);
}

// --- UI FEEDBACK ---
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

// --- DATA FETCHING ---
async function fetchData() {
    try {
        // Cache buster prevents the browser from showing deleted data
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`);
        const data = await response.json();
        
        if (JSON.stringify(data) !== JSON.stringify(lastData)) {
            lastData = data; 
            processAndRender(data);
            console.log("Sync Complete.");
        }
        return data; 
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

async function handleGoalUpdate() {
    const btn = document.getElementById('goalBtn');
    localStorage.setItem(`goal_${groupView.value}`, globalGoalInput.value);
    btn.disabled = true;
    btn.innerText = "Saving...";
    processAndRender(lastData);
    setTimeout(() => {
        btn.disabled = false;
        btn.innerText = "Update Goal";
    }, 500);
}

// --- DELETE LOGIC ---
async function deleteTransaction(id, comment) {
    if (!confirm(`Are you sure you want to delete: "${comment}"?`)) return;
    
    document.body.style.cursor = "wait";
    
    // Crucial: ID must be a string to match the Google Script formatting
    await sendToSheet({ id: String(id), action: 'DELETE_TRANSACTION' });
    
    // Allow 2 seconds for Sheets to flush changes before we re-fetch
    setTimeout(async () => {
        await fetchData();
        document.body.style.cursor = "default";
    }, 2000);
}

function toggleTrxMenu(event, uniqueMenuId) {
    event.stopPropagation(); 
    document.querySelectorAll('.trx-menu').forEach(menu => {
        if (menu.id !== uniqueMenuId) menu.classList.remove('show');
    });

    const menu = document.getElementById(uniqueMenuId);
    if (menu) {
        menu.classList.toggle('show');
        document.addEventListener('click', () => {
            menu.classList.remove('show');
        }, { once: true });
    }
}

async function deletePerson(name) {
    if (!confirm(`Are you sure you want to delete all records for ${name}?`)) return;

    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        if (card.querySelector('.card-name').innerText === name) {
            card.classList.add('card-loading');
        }
    });

    await sendToSheet({ name: name, action: 'DELETE', group: groupView.value });
    setTimeout(fetchData, 2000);
}

async function resetSystem() {
    if (!confirm("⚠️ Erase everything?")) return;
    if (!confirm("FINAL WARNING: Are you sure?")) return;

    document.body.style.opacity = "0.5";
    await sendToSheet({ action: 'RESET' });
    location.reload(); 
}

// --- RENDERING ---
function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value) || 0;
    const sortType = document.getElementById('sortOrder').value;
    const currentGroup = groupView.value;

    let runningTotal = 0;
    let participantCount = 0;

    studentContainer.innerHTML = '';
    chaperoneContainer.innerHTML = '';
    
    const totals = data.reduce((acc, entry) => {
        const entryGroup = entry.Group || 'Seniors'; 
        if (entryGroup !== currentGroup) return acc;

        if (!acc[entry.Name]) {
            acc[entry.Name] = { role: entry.Role, total: 0, transactions: [], lastId: 0 };
            participantRoles[entry.Name] = entry.Role;
            participantCount++; 
        }

        const amount = parseFloat(entry.Amount || 0);
        acc[entry.Name].total += amount;
        runningTotal += amount; 

        if (entry.id > acc[entry.Name].lastId) acc[entry.Name].lastId = entry.id;
        
        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].transactions.push({
                id: entry.id,
                comment: entry.Comment,
                amount: amount
            });
        }
        return acc;
    }, {});

    // Update Stats
    if(document.getElementById('groupTotal')) document.getElementById('groupTotal').innerText = `$${runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if(document.getElementById('groupCount')) document.getElementById('groupCount').innerText = participantCount;
    if(document.getElementById('lastUpdated')) document.getElementById('lastUpdated').innerText = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    // Sort and Render Cards
    let sortedNames = Object.keys(totals);
    if (sortType === 'name') sortedNames.sort();
    else if (sortType === 'recent') sortedNames.sort((a, b) => totals[b].lastId - totals[a].lastId);
    else if (sortType === 'balance') sortedNames.sort((a, b) => totals[b].total - totals[a].total);

    sortedNames.forEach(name => {
        const person = totals[name];
        const card = document.createElement('div');
        card.className = 'card';
        let balanceClass = person.total >= goal ? 'balance-green' : 'balance-red';

        card.innerHTML = `
            <button onclick="deletePerson('${name}')" class="delete-btn">🗑️</button>
            <div class="card-header"><strong class="card-name">${name}</strong><span class="card-role">${person.role}</span></div>
            <hr>
            <div><strong>Balance: </strong><span class="${balanceClass}">$${person.total.toFixed(2)}</span> / $${goal}</div>
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
                                    <button onclick="deleteTransaction('${t.id}', '${t.comment.replace(/'/g, "\\'")}')">Delete</button>
                                </div>
                            </div>
                        </li>`;
                    }).join('') || '<li>Registered</li>'}
                </ul>
            </div>`;
        (person.role === 'Student' ? studentContainer : chaperoneContainer).appendChild(card);
    });

    // Sync Dropdown
    nameDropdown.innerHTML = '<option value="">-- Select Person --</option>';
    Object.keys(totals).sort().forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        nameDropdown.appendChild(opt);
    });
}

// --- FORM SUBMISSIONS ---
personForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleLoading('personForm', true, "Registering...");
    await sendToSheet({ 
        name: document.getElementById('newName').value, 
        role: document.getElementById('newRole').value, 
        amount: 0, comment: "Registration", group: groupView.value 
    });
    personForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('personForm', false); }, 2000);
});

moneyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameDropdown.value;
    toggleLoading('moneyForm', true, "Posting...");
    await sendToSheet({ 
        name, amount: document.getElementById('amount').value, 
        comment: document.getElementById('comment').value, 
        role: participantRoles[name], group: groupView.value 
    });
    moneyForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('moneyForm', false); }, 2000);
});

async function sendToSheet(payload) {
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                id: payload.id || Date.now(),
                name: payload.name,
                role: payload.role || "Student",
                group: payload.group,
                amount: payload.amount,
                comment: payload.comment,
                action: payload.action || 'ADD'
            })
        });
    } catch (e) { console.error("POST Error:", e); }
}

window.addEventListener('DOMContentLoaded', () => {
    handleGroupSwitch();
    fetchData();
});