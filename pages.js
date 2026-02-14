const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', isAddingBank: false, editingBankData: null,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[onclick="navigateTo('${p}')"]`);
  if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = p.toUpperCase();
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  container.innerHTML = `<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:20px;">
    <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
      <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Pendientes Review</div>
      <div style="font-size:32px; font-weight:700; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
    </div>
    <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
      <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Neto Mes</div>
      <div style="font-size:32px; font-weight:700; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
    </div>
  </div>`;
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  if (AppState.settingsTab === 'bancos') renderBancosTab(container, header);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header);
  else container.innerHTML = header + "En desarrollo...";
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
      <div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Bancos</h3><button onclick="toggleAddBankForm()">+ Nuevo</button></div>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { name: '', iban: '', casa: '', tarjeta: '' };
      const selected = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div style="background:var(--bg-canvas); padding:20px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:12px; align-items:end;">
        <input id="new-bank-name" placeholder="Nombre" value="${d.name}">
        <input id="new-bank-iban" placeholder="IBAN" value="${d.iban}">
        <select id="new-bank-casa">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <div class="custom-multiselect">
          <div class="ms-display" onclick="document.querySelector('.ms-options').classList.toggle('active')"><span id="ms-label">${selected.length > 0 ? selected.join(', ') : 'Tarjetas...'}</span></div>
          <div class="ms-options">${AppState.config.tarjetas.map(t => `<div class="ms-option" onclick="event.stopPropagation()"><input type="checkbox" class="card-cb" value="${t.name}" ${selected.includes(t.name) ? 'checked' : ''} onchange="syncCardLabel()"><label>${t.name}</label></div>`).join('')}</div>
        </div>
        <button onclick="saveBank()">OK</button>
      </div>`;
    }
    html += `<table style="width:100%; border-collapse:collapse;">
      ${accs.slice(1).filter(a => a[0] !== 'DELETED').map((a, i) => `<tr><td style="padding:12px 8px; font-weight:700;">${a[0]}</td><td>${a[1]}</td><td>${(a[3] || '').split(',').map(c => `<span class="tag-card">${c}</span>`).join('')}</td><td style="text-align:right;"><button onclick="deleteBankMaster(${i+2})">Eliminar</button></td></tr>`).join('')}
    </table></div>`;
    container.innerHTML = html;
  });
}

window.syncCardLabel = () => { const sel = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value); document.getElementById('ms-label').textContent = sel.length > 0 ? sel.join(', ') : 'Tarjetas...'; };
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; loadSettingsPage(); };
window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, c = document.getElementById('new-bank-casa').value, t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(',');
  await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]); AppState.isAddingBank = false; loadSettingsPage();
};
window.deleteBankMaster = async function(row) { if (confirm("¿Eliminar banco?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };
function renderTarjetasTab(container, header) { container.innerHTML = `${header}<h3>Gestión de Tarjetas</h3><button onclick="addCardMaster()">+ Nueva Tarjeta</button><div style="margin-top:20px;">${AppState.config.tarjetas.map(t => `<div style="padding:12px; background:white; margin-bottom:8px; border-radius:8px; border:1px solid var(--border-light); display:flex; justify-content:space-between;"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})">Eliminar</button></div>`).join('')}</div>`; }
window.addCardMaster = async function() { const n = prompt("Nombre tarjeta:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCardMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
