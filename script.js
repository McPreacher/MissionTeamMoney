const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwCPQFRpv1spWrgaRKRuceX62y64VxUZ5slPtEc0Zyqf6lmzz5cAtEiIWZo7n1e7oVDsQ/exec";

const moneyForm = document.getElementById('moneyForm');
const personForm = document.getElementById('personForm');
const nameDropdown = document.getElementById('nameDropdown');
const globalGoalInput = document.getElementById('globalGoal');

let participantRoles = {};

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
        processAndRender(data);
    } catch (error) {
        console.error("Error:", error);
    }
}

function processAndRender(data) {
    const studentContainer = document.getElementById('studentCards');
    const chaperoneContainer = document.getElementById('chaperoneCards');
    const goal = parseFloat(globalGoalInput.value);

    studentContainer.innerHTML = '';
    chaperoneContainer.innerHTML = '';
    
    const totals = data.reduce((acc, entry) => {
        if (!acc[entry.Name]) {
            acc[entry.Name] = { role: entry.Role, total: 0, comments: [] };
            participantRoles[entry.Name] = entry.Role;
        }
        acc[entry.Name].total += parseFloat(entry.Amount || 0);
        if (entry.Comment && entry.Comment !== "Registration") {
            acc[entry.Name].comments.push(entry.Comment);
        }
        return acc;
    }, {});

    const sortedNames = Object.keys(totals).sort();
    nameDropdown.innerHTML = '<option value="">-- Select Person --</option>';
    sortedNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        nameDropdown.appendChild(opt);
    });

    for (const name in totals) {
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
    }
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
        // Note: keeping admin panel open so they can add multiple names quickly
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

fetchData();