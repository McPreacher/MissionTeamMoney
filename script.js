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
    // Load group-specific goal
    const savedGoal = localStorage.getItem(`goal_${group}`) || "2300";
    globalGoalInput.value = savedGoal;
    processAndRender(lastData);
}

// --- HELPER: UI FEEDBACK ---
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
        console.error("Error:", error);
    }
}

async function handleGoalUpdate() {
    const btn = document.getElementById('goalBtn');
    localStorage.setItem(`goal_${groupView.value}`, globalGoalInput.value);
    btn.disabled = true;
    btn.innerText = "Saving...";
    await fetchData();
    btn.disabled = false;
    btn.innerText = "Update Goal";
}

// --- DELETE LOGIC ---
async function deletePerson(name) {
    if (!confirm(`Are you sure you want to delete all records for ${name}? This cannot be undone.`)) return;
    
    // We send a request with amount -99999 or a specific 'DELETE' flag
    // For this to work, your Google Script needs to handle action: 'DELETE'
    await sendToSheet({ name: name, action: 'DELETE', group: groupView.value });
    
    setTimeout(fetchData, 1500);
}

function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value);
    const sortType = document.getElementById('sortOrder').value;
    const currentGroup = groupView.value;

    studentContainer.innerHTML = '';
    chaperoneContainer.innerHTML = '';
    
    // Filter data by group and reduce to totals
    const totals = data.reduce((acc, entry) => {
        // If the entry doesn't match the group we are looking at, skip it
        // Note: For existing data without a group, we assume 'Seniors'
        const entryGroup = entry.Group || 'Seniors';
        if (entryGroup !== currentGroup) return acc;

        if (!acc[entry.Name]) {
            acc[entry.Name] = { role: entry.Role, total: 0, comments: [], lastId: 0 };
            participantRoles[entry.Name] = entry.Role;
        }
        acc[entry.Name].total += parseFloat(entry.Amount || 0);
        if (entry.id > acc[entry.Name].lastId) acc[entry.Name].lastId = entry.id;
        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].comments.push(entry.Comment);
        }
        return acc;
    }, {});

    let sortedNames = Object.keys(totals);
    if (sortType === 'name') sortedNames.sort();
    else if (sortType === 'recent') sortedNames.sort((a, b) => totals[b].lastId - totals[a].lastId);
    else if (sortType === 'balance') sortedNames.sort((a, b) => totals[b].total - totals[a].total);

    // Dropdown
    nameDropdown.innerHTML = '<option value="">-- Select Person --</option>';
    sortedNames.sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        nameDropdown.appendChild(opt);
    });

    // Cards
    sortedNames.forEach(name => {
        const person = totals[name];
        const card = document.createElement('div');
        card.className = 'card';
        card.style.position = 'relative';

        let balanceClass = person.total >= goal ? 'balance-green' : 'balance-red';
        if (person.total === goal) balanceClass = 'balance-black';

        card.innerHTML = `
            <button onclick="deletePerson('${name}')" style="position:absolute; right:10px; top:10px; background:none; border:none; cursor:pointer;">🗑️</button>
            <div style="display: flex; justify-content: space-between; padding-right: 25px;">
                <strong>${name}</strong>
                <span style="font-size: 0.8rem; color: #666;">${person.role}</span>
            </div>
            <hr>
            <div><strong>Balance: </strong><span class="${balanceClass}">$${person.total.toFixed(2)}</span> / $${goal}</div>
            <div class="history-section">
                <ul style="font-size: 0.8rem; margin-top:5px;">${person.comments.map(c => `<li>${c}</li>`).join('') || '<li>Registered</li>'}</ul>
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
    } catch (e) { console.error(e); }
}

function generateReport() {
    const group = groupView.value;
    const goal = parseFloat(globalGoalInput.value);
    const studentCards = document.querySelectorAll('#studentCards .card');
    const chaperoneCards = document.querySelectorAll('#chaperoneCards .card');
    let reportWindow = window.open('', '_blank');
    let html = `<html><head><title>${group} Report</title><style>body{font-family:sans-serif;padding:40px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:10px;}</style></head>
                <body><h2>${group} Balance Report</h2><p>Goal: $${goal}</p><table><thead><tr><th>Name</th><th>Paid</th><th>Status</th></tr></thead><tbody>`;
    [...studentCards, ...chaperoneCards].forEach(card => {
        const name = card.querySelector('strong').innerText;
        const paid = card.querySelector('.balance-red, .balance-black, .balance-green').innerText;
        html += `<tr><td>${name}</td><td>${paid}</td><td>${parseFloat(paid.replace('$','')) >= goal ? 'PAID' : 'PENDING'}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;
    reportWindow.document.write(html); reportWindow.document.close();
    setTimeout(() => reportWindow.print(), 500);
}

window.addEventListener('DOMContentLoaded', () => {
    handleGroupSwitch();
    fetchData();
});