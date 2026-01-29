const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwCPQFRpv1spWrgaRKRuceX62y64VxUZ5slPtEc0Zyqf6lmzz5cAtEiIWZo7n1e7oVDsQ/exec";

const moneyForm = document.getElementById('moneyForm');
const personForm = document.getElementById('personForm');
const nameDropdown = document.getElementById('nameDropdown');
const globalGoalInput = document.getElementById('globalGoal');

let participantRoles = {};
let lastData = []; // Stores the latest data for re-sorting

// --- HELPER: UI FEEDBACK ---
function toggleLoading(formId, isLoading, message = "Processing...") {
    const form = document.getElementById(formId);
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
        lastData = data; // Cache data for sorting
        processAndRender(data);
        return data; 
    } catch (error) {
        console.error("Error:", error);
    }
}

// --- GOAL PERSISTENCE & UPDATING ---
async function handleGoalUpdate() {
    const btn = document.getElementById('goalBtn');
    localStorage.setItem('tripGoal', globalGoalInput.value);
    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = "Updating...";
    try {
        await fetchData();
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value);
    const sortType = document.getElementById('sortOrder').value;

    studentContainer.innerHTML = '';
    chaperoneContainer.innerHTML = '';
    
    // Process totals and track IDs for "recent" sorting
    const totals = data.reduce((acc, entry) => {
        if (!acc[entry.Name]) {
            acc[entry.Name] = { role: entry.Role, total: 0, comments: [], lastId: 0 };
            participantRoles[entry.Name] = entry.Role;
        }
        acc[entry.Name].total += parseFloat(entry.Amount || 0);
        
        // Track the highest ID (timestamp) for each person
        if (entry.id > acc[entry.Name].lastId) {
            acc[entry.Name].lastId = entry.id;
        }

        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].comments.push(entry.Comment);
        }
        return acc;
    }, {});

    // Sorting Logic
    let sortedNames = Object.keys(totals);
    if (sortType === 'name') {
        sortedNames.sort();
    } else if (sortType === 'recent') {
        sortedNames.sort((a, b) => totals[b].lastId - totals[a].lastId);
    } else if (sortType === 'balance') {
        sortedNames.sort((a, b) => totals[b].total - totals[a].total);
    }

    // Update Dropdown (always alphabetical for ease of use)
    const dropdownNames = Object.keys(totals).sort();
    nameDropdown.innerHTML = '<option value="">-- Select Person --</option>';
    dropdownNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        nameDropdown.appendChild(opt);
    });

    // Render Cards
    sortedNames.forEach(name => {
        const person = totals[name];
        const card = document.createElement('div');
        card.className = 'card';

        let balanceClass = 'balance-red';
        if (person.total === goal) balanceClass = 'balance-black';
        else if (person.total > goal) balanceClass = 'balance-green';

        const commentList = person.comments.length > 0 
            ? person.comments.map(c => `<li>${c}</li>`).join('') 
            : '<li>No payments recorded</li>';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <strong style="font-size: 1.1rem;">${name}</strong>
                <span style="font-size: 0.8rem; color: #666;">${person.role}</span>
            </div>
            <hr style="border: 0; border-top: 1px dashed #ccc; margin: 8px 0;">
            <div style="margin-bottom: 10px;">
                <strong>Balance: </strong>
                <span class="${balanceClass}">$${person.total.toFixed(2)}</span> / $${goal}
            </div>
            <div class="history-section">
                <strong>Transaction History:</strong>
                <ul style="font-size: 0.85rem; margin-top: 5px; padding-left: 20px; color: #444;">
                    ${commentList}
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
    toggleLoading('personForm', true, "Adding...");
    await sendToSheet({ name, role, amount: 0, comment: "Registration" });
    personForm.reset();
    setTimeout(async () => {
        await fetchData();
        toggleLoading('personForm', false);
    }, 2000);
});

moneyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameDropdown.value;
    const amount = document.getElementById('amount').value;
    const comment = document.getElementById('comment').value;
    const role = participantRoles[name] || "Student";
    toggleLoading('moneyForm', true, "Saving...");
    await sendToSheet({ name, amount, comment, role: role });
    moneyForm.reset();
    setTimeout(async () => {
        await fetchData();
        toggleLoading('moneyForm', false);
    }, 2000);
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
                goal: globalGoalInput.value,
                amount: payload.amount,
                comment: payload.comment
            })
        });
    } catch (e) { 
        console.error(e);
        alert("Error connecting to server.");
    }
}

// --- REPORT GENERATION ---
function generateReport() {
    const goal = parseFloat(globalGoalInput.value);
    const studentCards = document.querySelectorAll('#studentCards .card');
    const chaperoneCards = document.querySelectorAll('#chaperoneCards .card');
    let reportWindow = window.open('', '_blank');
    let html = `
        <html>
        <head>
            <title>Senior Trip Balance Report</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #333; }
                h2 { text-align: center; margin-bottom: 5px; }
                .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                th { background-color: #f8f9fa; font-weight: bold; }
                .status-paid { color: #2e7d32; font-weight: bold; }
                .status-pending { color: #c62828; font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>Senior Trip 2026 Balance Report</h2>
            <div class="subtitle">Generated: ${new Date().toLocaleDateString()}</div>
            <p><strong>Official Trip Goal:</strong> $${goal.toFixed(2)}</p>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Total Paid</th>
                        <th>Remaining</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

    [...studentCards, ...chaperoneCards].forEach(card => {
        const name = card.querySelector('strong').innerText;
        const role = card.querySelector('span').innerText;
        const balanceText = card.querySelector('.balance-red, .balance-black, .balance-green').innerText;
        const paid = parseFloat(balanceText.replace('$', ''));
        const remaining = Math.max(0, goal - paid);
        const status = paid >= goal ? '<span class="status-paid">PAID</span>' : '<span class="status-pending">PENDING</span>';
        html += `
            <tr>
                <td>${name}</td>
                <td>${role}</td>
                <td>$${paid.toFixed(2)}</td>
                <td>$${remaining.toFixed(2)}</td>
                <td>${status}</td>
            </tr>`;
    });
    html += `</tbody></table></body></html>`;
    reportWindow.document.write(html);
    reportWindow.document.close();
    setTimeout(() => { reportWindow.print(); }, 500);
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    const savedGoal = localStorage.getItem('tripGoal');
    if (savedGoal) {
        globalGoalInput.value = savedGoal;
    }
    fetchData();
});