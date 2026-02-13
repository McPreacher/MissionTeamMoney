const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwA6kiGzsLYaBDGv9LOTHK2QoE4jSLmDgH7tN6cmLyZzdZBUYSGjmQyKpXp47518eSObA/exec";

const moneyForm = document.getElementById('moneyForm');
const personForm = document.getElementById('personForm');
const nameDropdown = document.getElementById('nameDropdown');
const globalGoalInput = document.getElementById('globalGoal');
const groupView = document.getElementById('groupView');

let participantRoles = {};
let lastData = []; 

// --- AUTO-REFRESH (Conflict Prevention) ---
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
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.json();
        
        if (JSON.stringify(data) !== JSON.stringify(lastData)) {
            lastData = data; 
            processAndRender(data);
            console.log("Sync Complete: Data is fresh.");
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

// --- DELETE & RESET LOGIC ---

// 1. Delete Specific Transaction
async function deleteTransaction(id, comment) {
    if (!confirm(`Are you sure you want to delete: "${comment}"?`)) return;
    
    document.body.style.cursor = "wait";
    // Ensure ID is passed as a string
    await sendToSheet({ id: String(id), action: 'DELETE_TRANSACTION' });
    
    // Slight delay to allow Google's servers to settle before refreshing
    setTimeout(fetchData, 1500);
}

// Fixed Toggle: Uses the unique generated ID to find the correct menu
function toggleTrxMenu(event, uniqueMenuId) {
    event.stopPropagation(); 
    
    // Close all other menus first to prevent stacking
    document.querySelectorAll('.trx-menu').forEach(menu => {
        if (menu.id !== uniqueMenuId) menu.classList.remove('show');
    });

    const menu = document.getElementById(uniqueMenuId);
    if (menu) {
        menu.classList.toggle('show');

        // Close when clicking anywhere else
        document.addEventListener('click', () => {
            menu.classList.remove('show');
        }, { once: true });
    }
}

// 2. Delete Entire Person
async function deletePerson(name) {
    if (!confirm(`Are you sure you want to delete all records for ${name} in the ${groupView.value} group?`)) return;

    const cards = document.querySelectorAll('.card');
    let targetCard = null;
    
    cards.forEach(card => {
        if (card.querySelector('.card-name').innerText === name) {
            targetCard = card;
        }
    });

    if (targetCard) {
        targetCard.classList.add('card-loading');
        const btn = targetCard.querySelector('.delete-btn');
        btn.innerText = "⌛"; 
        btn.style.opacity = "1";
    }

    await sendToSheet({ name: name, action: 'DELETE', group: groupView.value });
    setTimeout(fetchData, 1500);
}

async function resetSystem() {
    const confirm1 = confirm("⚠️ DANGER: You are about to erase ALL NAMES and ALL PAYMENTS. This cannot be undone.");
    if (!confirm1) return;

    const confirm2 = confirm("FINAL WARNING: Are you absolutely sure?");
    if (!confirm2) return;

    document.body.style.opacity = "0.5";
    document.body.style.pointerEvents = "none";

    await sendToSheet({ action: 'RESET' });
    alert("System has been reset. Starting fresh!");
    location.reload(); 
}

// --- RENDERING LOGIC ---
function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value) || 0;
    const sortType = document.getElementById('sortOrder').value;
    const currentGroup = groupView.value;

    let runningTotal = 0;
    let participantCount = 0;

    studentContainer.style.opacity = '1';
    chaperoneContainer.style.opacity = '1';
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

    if(document.getElementById('groupTotal')) {
        document.getElementById('groupTotal').innerText = `$${runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }
    if(document.getElementById('groupCount')) {
        document.getElementById('groupCount').innerText = participantCount;
    }
    if(document.getElementById('lastUpdated')) {
        const now = new Date();
        document.getElementById('lastUpdated').innerText = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    let sortedNames = Object.keys(totals);
    if (sortType === 'name') sortedNames.sort();
    else if (sortType === 'recent') sortedNames.sort((a, b) => totals[b].lastId - totals[a].lastId);
    else if (sortType === 'balance') sortedNames.sort((a, b) => totals[b].total - totals[a].total);

    const dropdownNames = Object.keys(totals).sort();
    nameDropdown.innerHTML = '<option value="">-- Select Person --</option>';
    dropdownNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        nameDropdown.appendChild(opt);
    });

    sortedNames.forEach(name => {
        const person = totals[name];
        const card = document.createElement('div');
        card.className = 'card';

        let balanceClass = person.total >= goal ? 'balance-green' : 'balance-red';
        if (person.total === goal && goal > 0) balanceClass = 'balance-black';

        card.innerHTML = `
            <button onclick="deletePerson('${name}')" class="delete-btn" title="Delete ${name}">🗑️</button>
            <div class="card-header">
                <strong class="card-name">${name}</strong>
                <span class="card-role">${person.role}</span>
            </div>
            <hr style="border: 0; border-top: 1px dashed #ccc; margin: 8px 0;">
            <div style="margin-bottom: 10px;">
                <strong>Balance: </strong>
                <span class="${balanceClass}">$${person.total.toFixed(2)}</span> / $${goal}
            </div>
            <div class="history-section">
                <ul class="history-list">
                    ${person.transactions.map((t, index) => {
                        const uiMenuId = `menu-${name.replace(/\s+/g, '-')}-${index}`;
                        return `
                        <li class="history-item">
                            <span class="history-text">${t.comment} ($${t.amount})</span>
                            <div class="menu-container">
                                <button class="trx-dots" onclick="toggleTrxMenu(event, '${uiMenuId}')">⋮</button>
                                <div id="${uiMenuId}" class="trx-menu">
                                    <button onclick="deleteTransaction('${t.id}', '${t.comment.replace(/'/g, "\\'")}')">Delete</button>
                                </div>
                            </div>
                        </li>
                    `}).join('') || '<li class="history-text">Registered</li>'}
                </ul>
            </div>
        `;

        if (person.role === 'Student') studentContainer.appendChild(card);
        else chaperoneContainer.appendChild(card);
    });
}

// --- FORM SUBMISSIONS ---
personForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newName').value;
    const role = document.getElementById('newRole').value;
    toggleLoading('personForm', true, "Registering...");
    await sendToSheet({ name, role, amount: 0, comment: "Registration", group: groupView.value });
    personForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('personForm', false); }, 1500);
});

moneyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameDropdown.value;
    const amount = document.getElementById('amount').value;
    const comment = document.getElementById('comment').value;
    toggleLoading('moneyForm', true, "Posting...");
    await sendToSheet({ name, amount, comment, role: participantRoles[name], group: groupView.value });
    moneyForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('moneyForm', false); }, 1500);
});

async function sendToSheet(payload) {
    document.body.style.cursor = "wait"; 
    try {
        // Change: Sending as text/plain to avoid CORS preflight, 
        // while still stringifying the object for code.gs to parse.
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
    } catch (e) { 
        console.error("POST Error:", e);
    } finally {
        document.body.style.cursor = "default";
    }
}

// --- REPORT GENERATION ---
function generateReport() {
    const group = groupView.value;
    const goal = parseFloat(globalGoalInput.value);
    const currentGroupData = lastData.filter(entry => (entry.Group || 'Seniors') === group);
    
    const reportData = currentGroupData.reduce((acc, entry) => {
        if (!acc[entry.Name]) {
            acc[entry.Name] = { role: entry.Role, total: 0, transactions: [] };
        }
        const amount = parseFloat(entry.Amount || 0);
        acc[entry.Name].total += amount;
        
        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].transactions.push({
                amount: amount,
                comment: entry.Comment,
                date: entry.Date ? new Date(entry.Date).toLocaleDateString() : 'N/A'
            });
        }
        return acc;
    }, {});

    let reportWindow = window.open('', '_blank');
    let html = `<html><head><title>${group} Report</title><style>body { font-family: sans-serif; padding: 20px; color: #333; } h2 { color: #2e7d32; border-bottom: 2px solid #2e7d32; } .student-section { margin-bottom: 30px; page-break-inside: avoid; } .student-header { background: #f4f4f9; padding: 10px; display: flex; justify-content: space-between; font-weight: bold; border-left: 5px solid #333; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.9rem; } th { background-color: #eee; } .status-paid { color: #5cb85c; font-weight: bold; } .status-pending { color: #d9534f; font-weight: bold; }</style></head><body><h2>${group} Detailed Trip Report - ${new Date().toLocaleDateString()}</h2><p><strong>Group Goal:</strong> $${goal.toFixed(2)}</p>`;

    Object.keys(reportData).sort().forEach(name => {
        const person = reportData[name];
        const statusClass = person.total >= goal ? 'status-paid' : 'status-pending';
        const statusText = person.total >= goal ? 'PAID IN FULL' : 'BALANCE PENDING';
        html += `<div class="student-section"><div class="student-header"><span>${name} (${person.role})</span><span class="${statusClass}">Total: $${person.total.toFixed(2)} — ${statusText}</span></div><table><thead><tr><th>Date</th><th>Donor / Comment</th><th>Amount</th></tr></thead><tbody>${person.transactions.length > 0 ? person.transactions.map(t => `<tr><td>${t.date}</td><td>${t.comment}</td><td>$${t.amount.toFixed(2)}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;">No transactions.</td></tr>'}</tbody></table></div>`;
    });

    html += `</body></html>`;
    reportWindow.document.write(html);
    reportWindow.document.close();
    setTimeout(() => reportWindow.print(), 750);
}

window.addEventListener('DOMContentLoaded', () => {
    handleGroupSwitch();
    fetchData();
});