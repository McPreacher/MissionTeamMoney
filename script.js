const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwCPQFRpv1spWrgaRKRuceX62y64VxUZ5slPtEc0Zyqf6lmzz5cAtEiIWZo7n1e7oVDsQ/exec";

const moneyForm = document.getElementById('moneyForm');
const personForm = document.getElementById('personForm');
const nameDropdown = document.getElementById('nameDropdown');
const globalGoalInput = document.getElementById('globalGoal');
const groupView = document.getElementById('groupView');

let participantRoles = {};
let lastData = []; 

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
        lastData = data; 
        processAndRender(data);
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

    setTimeout(async () => {
        await fetchData();
    }, 2000);
}

function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value) || 0;
    const sortType = document.getElementById('sortOrder').value;
    const currentGroup = groupView.value;

    // --- SUMMARY TRACKERS ---
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
            acc[entry.Name] = { role: entry.Role, total: 0, comments: [], lastId: 0 };
            participantRoles[entry.Name] = entry.Role;
            participantCount++; // Increment count for unique name
        }

        const amount = parseFloat(entry.Amount || 0);
        acc[entry.Name].total += amount;
        runningTotal += amount; // Increment group grand total

        if (entry.id > acc[entry.Name].lastId) acc[entry.Name].lastId = entry.id;
        
        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].comments.push(entry.Comment);
        }
        return acc;
    }, {});

    // --- UPDATE SUMMARY UI ---
    // Make sure these IDs exist in your HTML!
    if(document.getElementById('groupTotal')) {
        document.getElementById('groupTotal').innerText = `$${runningTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    }
    if(document.getElementById('groupCount')) {
        document.getElementById('groupCount').innerText = participantCount;
    }
    // Update the timestamp to now
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
                <ul style="font-size: 0.85rem; margin-top: 5px; padding-left: 20px; color: #444;">
                    ${person.comments.map(c => `<li>${c}</li>`).join('') || '<li>Registered</li>'}
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
    setTimeout(async () => { await fetchData(); toggleLoading('personForm', false); }, 2000);
});

moneyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameDropdown.value;
    const amount = document.getElementById('amount').value;
    const comment = document.getElementById('comment').value;
    toggleLoading('moneyForm', true, "Posting...");
    await sendToSheet({ name, amount, comment, role: participantRoles[name], group: groupView.value });
    moneyForm.reset();
    setTimeout(async () => { await fetchData(); toggleLoading('moneyForm', false); }, 2000);
});

async function sendToSheet(payload) {
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                id: Date.now(),
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

function generateReport() {
    const group = groupView.value;
    const goal = parseFloat(globalGoalInput.value);
    const studentCards = document.querySelectorAll('#studentCards .card');
    const chaperoneCards = document.querySelectorAll('#chaperoneCards .card');
    let reportWindow = window.open('', '_blank');
    let html = `<html><head><title>${group} Report</title><style>body{font-family:sans-serif;padding:40px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:10px;}</style></head>
                <body><h2>${group} Balance Report - ${new Date().toLocaleDateString()}</h2><p>Goal: $${goal.toFixed(2)}</p><table><thead><tr><th>Name</th><th>Paid</th><th>Status</th></tr></thead><tbody>`;
    [...studentCards, ...chaperoneCards].forEach(card => {
        const name = card.querySelector('.card-name').innerText;
        const paidSpan = card.querySelector('.balance-red, .balance-black, .balance-green');
        const paidText = paidSpan ? paidSpan.innerText : "$0.00";
        const paid = parseFloat(paidText.replace('$',''));
        html += `<tr><td>${name}</td><td>${paidText}</td><td>${paid >= goal ? 'PAID' : 'PENDING'}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;
    reportWindow.document.write(html); reportWindow.document.close();
    setTimeout(() => reportWindow.print(), 500);
}

window.addEventListener('DOMContentLoaded', () => {
    handleGroupSwitch();
    fetchData();
});