/**
 * [ARCHIVO_MAESTRO_V2.0]
 * REGLA DE ORO: NO MUTILAR ARRANQUE.
 * Tabs: Bancos, Categorías, Casas, Tarjetas
 * Import: CSV, HTML, PDF widget
 * Sidebar: Colapsable con iconos
 */

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', sidebarCollapsed: false,
  isAddingBank: false, editingBankData: null,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// ===================== NAVEGACIÓN =====================
window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-tab, .nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  const titleMap = { dashboard: 'Dashboard', budget: 'Budget', review: 'Review', balances: 'Balances', import: 'Importar', reporting: 'Reporting', rules: 'Reglas', settings: 'Settings' };
  if (document.getElementById('page-title')) document.getElementById('page-title').textContent = titleMap[p] || p;

  // Toggle full-width mode for budget and reporting
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    if (p === 'budget' || p === 'reporting') mainContent.classList.add('full-width');
    else mainContent.classList.remove('full-width');
  }

  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'rules') loadRulesPage();
  else if (p === 'import') loadImportPage();
  else if (p === 'budget') BudgetGrid.init();
  else if (p === 'reporting') Reporting.init();
};

window.toggleSidebar = function() { /* sidebar removed in Fase 2 */ };

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

// ===================== DASHBOARD =====================
// Fase 2 — reemplaza SOLO esta función en pages.js
// El resto del archivo no cambia.

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  // ── 1. Skeleton: 7 placeholders mientras carga ─────────────────────────
  container.innerHTML = `
    <div class="dash-header">
      <div>
        <h1 class="dash-title">Transferencias a realizar</h1>
      </div>
      <div class="month-nav">
        <button onclick="prevMonth()">‹</button>
        <span id="month-display-dash"></span>
        <button onclick="nextMonth()">›</button>
      </div>
    </div>
    <div class="dash-cards-grid" id="dash-cards-grid">
      ${Array(7).fill('<div class="dash-bank-card dash-skeleton"></div>').join('')}
    </div>
    <div class="dash-total-bar" id="dash-total-bar"></div>`;

  _dashUpdateMonthLabel();

  try {
    const year  = AppState.currentYear;
    const month = AppState.currentMonth;

    // ── 2. UNA sola llamada batchGet lee BUDGET_LINES + BANK_MONTHLY_SUMMARY
    //        + IMPORTED_STATEMENTS en paralelo con la carga de accounts ──────
    const [sheetsData, accounts] = await Promise.all([
      SheetsAPI.batchGet([
        CONFIG.SHEETS.BUDGET_LINES,
        CONFIG.SHEETS.BANK_SUMMARY,
        CONFIG.SHEETS.IMPORTED_STATEMENTS,
      ]),
      BudgetLogic.loadAccounts(),
    ]);

    // ── 3. Parsear cada hoja localmente (sin más llamadas API) ─────────────
    const lines      = _dashParseBudgetLines(sheetsData[CONFIG.SHEETS.BUDGET_LINES],  year);
    const summaries  = _dashParseSummaries(sheetsData[CONFIG.SHEETS.BANK_SUMMARY],    year);
    const importRows = sheetsData[CONFIG.SHEETS.IMPORTED_STATEMENTS] || [];

    // ── 4. Construir bankMeta (idéntico a BudgetGrid._buildMeta) ──────────
    const bankMeta = {};
    accounts.forEach(a => {
      const buf    = new Array(12).fill(0);
      const sal    = new Array(12).fill(0);
      const closed = new Array(12).fill(false);
      summaries.filter(s => s.bank === a.name).forEach(s => {
        buf[s.month - 1]    = s.buffer     || 0;
        sal[s.month - 1]    = s.saldoCuenta || 0;
        closed[s.month - 1] = !!s.mesCerrado;
      });
      bankMeta[a.name] = { buffer: buf, saldo: sal, closed };
    });

    // ── 5. Calcular envío + validar extractos para cada banco ─────────────
    //       Todo local — cero llamadas API adicionales
    const bankResults = accounts.map(acc => {
      const envio = BudgetLogic.calcEnvioNecesario(lines, bankMeta, acc.name, month);
      const stmts = BudgetLogic.checkMissingStatements(acc.name, year, month, importRows);
      return { acc, envio, stmts };
    });

    // ── 6. Renderizar tarjetas y barra de total ────────────────────────────
    const totalEnvio = bankResults.reduce((s, r) => s + r.envio.amount, 0);
    const alertCount = bankResults.filter(r => !r.stmts.allOk).length;

    const monthNames = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    document.getElementById('dash-cards-grid').innerHTML =
      bankResults.map(r => _dashBankCardHTML(r, month, monthNames)).join('');

    document.getElementById('dash-total-bar').innerHTML = `
      <span class="dash-total-label">
        Total a transferir ${monthNames[month]}
        ${alertCount > 0 ? `<span class="dash-alert-badge">⚠ ${alertCount} extracto${alertCount>1?'s':''} pendiente${alertCount>1?'s':''}</span>` : ''}
      </span>
      <span class="dash-total-amount">${_fmtEur(totalEnvio)}</span>`;

  } catch (e) {
    console.error('Dashboard error:', e);
    container.innerHTML = `
      <div class="dash-error">
        Error cargando el dashboard.
        <button onclick="loadDashboard()" style="margin-left:12px; padding:6px 16px; border-radius:8px; border:1px solid #e2e8f0; background:white; cursor:pointer; font-weight:600;">Reintentar</button>
      </div>`;
  }
}

// ── Helpers de parseo local (sin llamadas API) ─────────────────────────────

function _dashParseBudgetLines(rows, year) {
  if (!rows || rows.length <= 1) return [];
  const res = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || r[2] != year || r[35] === 'DELETED') continue;
    res.push({
      id: r[0], bank: r[1], section: r[3],
      plan: [r[9],r[10],r[11],r[12],r[13],r[14],r[15],r[16],r[17],r[18],r[19],r[20]]
            .map(v => BudgetLogic.toNum(v)),
      real: [r[21],r[22],r[23],r[24],r[25],r[26],r[27],r[28],r[29],r[30],r[31],r[32]]
            .map(v => BudgetLogic.toNum(v)),
    });
  }
  return res;
}

function _dashParseSummaries(rows, year) {
  if (!rows || rows.length <= 1) return [];
  const res = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || r[2] != year) continue;
    res.push({
      bank: r[1], month: parseInt(r[3]),
      buffer: BudgetLogic.toNum(r[15]), saldoCuenta: BudgetLogic.toNum(r[16]),
      mesCerrado: r[13] === 'TRUE' || r[13] === true
    });
  }
  return res;
}

// ── Render de tarjeta individual ───────────────────────────────────────────

function _dashBankCardHTML({ acc, envio, stmts }, month, monthNames) {
  const { amount, isSufficient } = envio;
  const { missing, incomplete }  = stmts;
  const hasAlerts = missing.length > 0 || incomplete.length > 0;

  // Lista completa de extractos requeridos para este banco
  const accCfg   = AppState.config?.accounts?.find(a => a.name === acc.name);
  const required = accCfg?.extractos?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const okLabels = required.filter(l =>
    !missing.includes(l) && !incomplete.find(i => i.label === l)
  );

  const cardClass = hasAlerts    ? 'dash-bank-card alert-missing'
    : isSufficient               ? 'dash-bank-card sufficient'
    :                              'dash-bank-card needs-transfer';

  // Bloque de extractos — sólo si hay configurados
  let extractosHtml = '';
  if (required.length > 0) {
    const items = [
      ...missing.map(l =>
        `<li class="dash-ext-item ext-missing">⚠ Falta: <strong>${l}</strong></li>`),
      ...incomplete.map(s =>
        `<li class="dash-ext-item ext-incomplete">${s.message}</li>`),
      ...okLabels.map(l =>
        `<li class="dash-ext-item ext-ok"><span class="dash-ext-check">✓</span> ${l}</li>`),
    ].join('');
    extractosHtml = `<ul class="dash-ext-list">${items}</ul>`;
  }

  const ibanDisplay   = acc.iban ? acc.iban.replace(/(.{4})/g, '$1 ').trim() : '';
  const nextMonthName = monthNames[month === 12 ? 1 : month + 1];
  const amountColor   = isSufficient ? '#10b981' : '#0f172a';
  const statusText    = isSufficient
    ? '<span class="dash-ext-check">✓</span> Saldo suficiente'
    : `→ Enviar a cuenta ${acc.iban ? acc.iban.slice(-4) : '—'}`;

  return `
    <div class="${cardClass}" onclick="navigateTo('budget'); setTimeout(()=>BudgetGrid.switchBank('${acc.name.replace(/'/g,"\'")}'),300)">
      <div class="dash-card-header">
        <div>
          <div class="dash-bank-name">${acc.name}</div>
          <div class="dash-bank-iban">${ibanDisplay}</div>
        </div>
        <div class="dash-card-arrow">›</div>
      </div>
      ${extractosHtml}
      <div class="dash-card-amount" style="color:${amountColor}">
        ${isSufficient ? '—' : _fmtEur(amount)}
      </div>
      <div class="dash-card-status ${isSufficient ? 'green' : 'muted'}">
        ${statusText}
      </div>
      ${!isSufficient && !hasAlerts ? `<div class="dash-card-deadline">antes del 1 de ${nextMonthName}</div>` : ''}
    </div>`;
}
// ── Utilidades ─────────────────────────────────────────────────────────────

function _fmtEur(n) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(n || 0);
}

function _dashUpdateMonthLabel() {
  const el = document.getElementById('month-display-dash');
  if (!el) return;
  const names = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  el.textContent = `${names[AppState.currentMonth]} ${AppState.currentYear}`;
}

// Sobreescribir nextMonth/prevMonth para actualizar también el label del dash
// (además del label del sidebar que ya hace AppState.initUI)
const _origNext = window.nextMonth;
const _origPrev = window.prevMonth;
window.nextMonth = () => { _origNext(); _dashUpdateMonthLabel(); };
window.prevMonth = () => { _origPrev(); _dashUpdateMonthLabel(); };


// ===================== SETTINGS =====================
function buildSettingsHeader(uncatCount) {
  const tabs = ['bancos', 'categorias', 'casas', 'tarjetas'];
  const badge = uncatCount > 0
    ? `<span style="background:var(--negative,#ef4444);color:white;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:4px;">${uncatCount}</span>`
    : '';
  return `<div class="settings-tabs">
    ${tabs.map(t => `<button class="settings-tab ${AppState.settingsTab === t ? 'active' : ''}" onclick="setSettingsTab('${t}')">${t.toUpperCase()}</button>`).join('')}
    <button class="settings-tab ${AppState.settingsTab === 'sin-categorizar' ? 'active' : ''}" onclick="setSettingsTab('sin-categorizar')">SIN CATEGORIZAR${badge}</button>
  </div>`;
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  if (!AppState.config) await BudgetLogic.loadConfig();
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;
  const tarjetas = AppState.config.tarjetas || [];

  // Count uncategorized lines for badge (use in-memory lines if available)
  let uncatLines = [];
  try {
    const allLines = await BudgetLogic.getAllLines();
    uncatLines = allLines.filter(l => !l.categoria && !l.parentId && l.section !== 'INGRESOS');
  } catch(e) {}
  const header = buildSettingsHeader(uncatLines.length);

  if (AppState.settingsTab === 'sin-categorizar') renderSinCategorizarTab(container, header, uncatLines, cats, casas);
  else if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header, tarjetas);
  else renderBancosTab(container, header, casas, tarjetas);
}

// -------- BANCOS TAB --------
function renderBancosTab(container, header, casas, tarjetas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    if (!accs || accs.length <= 1) { container.innerHTML = header + '<p>No hay bancos configurados.</p>'; return; }

    // Build bank list with real sheet row indices (not filtered index)
    const banks = [];
    for (let i = 1; i < accs.length; i++) {
      const a = accs[i];
      if (a[0] && a[0] !== 'DELETED') {
        banks.push({ name: a[0]||'', iban: a[1]||'', casa: a[2]||'', tarjeta: a[3]||'', extractos: a[5]||'', sheetRow: i + 1, order: parseInt(a[4]) || i });
      }
    }
    banks.sort((a, b) => a.order - b.order);

    let html = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
           <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Gestión de Bancos</h3>
           <button onclick="toggleAddBankForm()" class="btn-save" style="padding:10px 20px; font-size:14px;">${AppState.isAddingBank ? 'Cancelar' : '+ Nuevo Banco'}</button>
        </div>`;

    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      const selectedCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()).filter(Boolean) : [];
      const tarjetaNames = tarjetas.map(t => t.name);
      const selectedExtractos = d.extractos ? d.extractos.split(',').map(s => s.trim()).filter(Boolean) : [];
      const extractoNames = (AppState.config?.extractos || []).map(e => e.name);

      html += `<div style="background:var(--bg-canvas,#f1f5f9); padding:20px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap:12px; align-items:end;">
          <div><label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Nombre</label><input id="new-bank-name" type="text" value="${d.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light); font-size:14px;"></div>
          <div><label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">IBAN</label><input id="new-bank-iban" type="text" value="${d.iban}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light); font-size:14px;"></div>
          <div><label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Casa</label><select id="new-bank-casa" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light); font-size:14px;">
            ${casas.map(c => `<option value="${c.name}" ${String(d.casa).trim().toLowerCase() === String(c.name).trim().toLowerCase() ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select></div>
          <div>
            <label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Tarjetas</label>
            <div class="custom-multiselect">
              <div class="ms-display" onclick="document.querySelector('.ms-options').classList.toggle('active')">
                <span id="ms-label">${selectedCards.length > 0 ? selectedCards.join(', ') : 'Seleccionar...'}</span>
              </div>
              <div class="ms-options">
                ${tarjetaNames.map(t => `
                  <div class="ms-option">
                    <input type="checkbox" class="card-cb" value="${t}" ${selectedCards.includes(t) ? 'checked' : ''} onchange="syncCardLabel()">
                    <label>${t}</label>
                  </div>`).join('')}
              </div>
            </div>
          </div>
          <div>
            <label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Extractos Requeridos</label>
            <div class="custom-multiselect">
              <div class="ms-display" onclick="document.getElementById('ms-ext-opts').classList.toggle('active')">
                <span id="ms-ext-label">${selectedExtractos.length > 0 ? selectedExtractos.join(', ') : 'Seleccionar...'}</span>
              </div>
              <div class="ms-options" id="ms-ext-opts">
                ${extractoNames.map(e => `
                  <div class="ms-option">
                    <input type="checkbox" class="ext-cb" value="${e}" ${selectedExtractos.includes(e) ? 'checked' : ''} onchange="syncExtLabel()">
                    <label>${e}</label>
                  </div>`).join('')}
              </div>
            </div>
          </div>
          <button onclick="saveBank()" style="background:var(--positive,#10b981); color:white; border:none; padding:10px 24px; border-radius:8px; cursor:pointer; font-weight:700; font-size:14px; text-transform:uppercase;">${d.row ? 'Actualizar' : 'GUARDAR'}</button>
        </div>`;
    }

    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; letter-spacing:0.05em; border-bottom: 1px solid var(--border-light);">
            <th style="padding:12px 8px; font-weight:700; width:36px;">Orden</th><th style="font-weight:700;">Banco</th><th style="font-weight:700;">IBAN</th><th style="font-weight:700;">Tarjetas</th><th style="font-weight:700;">Extractos Requeridos</th><th style="font-weight:700;">Casa</th><th style="text-align:right; font-weight:700;">Acciones</th></tr>
          </thead>
          <tbody>`;

    banks.forEach((bk, idx) => {
      const cards = bk.tarjeta ? bk.tarjeta.split(',').filter(c => c.trim()) : [];
      const safeName = bk.name.replace(/'/g, "\\'");
      const safeIban = bk.iban.replace(/'/g, "\\'");
      const safeCasa = bk.casa.replace(/'/g, "\\'");
      const safeCards = bk.tarjeta.replace(/'/g, "\\'");
      const safeExts = (bk.extractos || '').replace(/'/g, "\\'");
      html += `<tr style="border-bottom:1px solid var(--border-light);" data-row="${bk.sheetRow}">
        <td style="padding:12px 4px; text-align:center;">
          <button class="bank-order-btn" onclick="moveBankOrder(${bk.sheetRow},-1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="bank-order-btn" onclick="moveBankOrder(${bk.sheetRow},1)" ${idx === banks.length-1 ? 'disabled' : ''}>▼</button>
        </td>
        <td style="padding:16px 8px; font-weight:600; color:var(--text-primary);">${bk.name}</td>
        <td style="font-family:monospace; color:var(--text-secondary); font-size:13px;">${bk.iban}</td>
        <td>${cards.map(c => `<span class="tag-card">${c.trim()}</span>`).join('')}</td>
        <td>${(bk.extractos ? bk.extractos.split(',').filter(e=>e.trim()) : []).map(e=>`<span class="tag-ext">${e.trim()}</span>`).join('')}</td>
        <td><span style="color:var(--text-secondary); font-size:13px;">${bk.casa}</span></td>
        <td style="text-align:right;">
          <button onclick="initEditBank(${bk.sheetRow}, '${safeName}', '${safeIban}', '${safeCasa}', '${safeCards}', '${safeExts}', ${bk.order})" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600; margin-right:12px;">Editar</button>
          <button onclick="deleteBankMaster(${bk.sheetRow})" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-weight:600;">Eliminar</button>
        </td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }).catch(e => {
    console.error("Error cargando bancos:", e);
    container.innerHTML = header + '<div style="padding:24px; color:var(--text-secondary);">Error al cargar bancos. Verifica que la hoja ACCOUNTS exista.</div>';
  });
}

// Close multiselect on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-multiselect')) {
    document.querySelectorAll('.ms-options.active').forEach(el => el.classList.remove('active'));
  }
});

window.syncCardLabel = () => {
  const selected = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  const label = document.getElementById('ms-label');
  if (label) label.textContent = selected.length > 0 ? selected.join(', ') : 'Seleccionar...';
};

window.syncExtLabel = () => {
  const selected = Array.from(document.querySelectorAll('.ext-cb:checked')).map(cb => cb.value);
  const label = document.getElementById('ms-ext-label');
  if (label) label.textContent = selected.length > 0 ? selected.join(', ') : 'Seleccionar...';
};

window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.initEditBank = (row, n, i, c, t, e, o) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t, extractos: e, order: o }; loadSettingsPage(); };

window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value.trim();
  const i = document.getElementById('new-bank-iban').value.trim();
  const c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(',');
  const ext = Array.from(document.querySelectorAll('.ext-cb:checked')).map(cb => cb.value).join(',');

  if (!n || !i) return alert("Nombre e IBAN obligatorios");
  try {
    if (AppState.editingBankData && AppState.editingBankData.row) {
      // Single API call to update the entire row
      await SheetsAPI.updateRow(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, [n, i, c, t, AppState.editingBankData.order || 999, ext]);
    } else {
      // New bank — add with order = 999 (goes to end)
      await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t, 999, ext]);
    }
    AppState.isAddingBank = false; AppState.editingBankData = null;
    await BudgetLogic.loadConfig();
    loadSettingsPage();
  } catch(e) { console.error("Error guardando banco:", e); alert("Error al guardar: " + (e?.result?.error?.message || e.message || '')); }
};

window.deleteBankMaster = async function(row) {
  if (confirm("¿Seguro que quieres eliminar este banco?")) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED');
    await BudgetLogic.loadConfig();
    loadSettingsPage();
  }
};

window.moveBankOrder = async function(sheetRow, direction) {
  try {
    const accs = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    if (!accs) return;
    // Build sorted bank list with orders
    const banks = [];
    for (let i = 1; i < accs.length; i++) {
      if (accs[i][0] && accs[i][0] !== 'DELETED') {
        banks.push({ sheetRow: i + 1, order: parseInt(accs[i][4]) || i });
      }
    }
    banks.sort((a, b) => a.order - b.order);
    const idx = banks.findIndex(b => b.sheetRow === sheetRow);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= banks.length) return;
    // Swap orders
    const tempOrder = banks[idx].order;
    banks[idx].order = banks[swapIdx].order;
    banks[swapIdx].order = tempOrder;
    // Write both in parallel
    await Promise.all([
      SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, banks[idx].sheetRow, 5, banks[idx].order),
      SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, banks[swapIdx].sheetRow, 5, banks[swapIdx].order)
    ]);
    await BudgetLogic.loadConfig();
    loadSettingsPage();
  } catch(e) { console.error('Error reordering:', e); alert('Error al reordenar'); }
};

// -------- CATEGORÍAS TAB --------
function renderCategoriasTab(container, header, cats) {
  let html = header + `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Categorías</h3>
      <button onclick="addCategoryMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">+ Nueva</button>
    </div>`;
  Object.keys(cats).forEach(cat => {
    const safeCat = cat.replace(/'/g, "\\'");
    html += `<div style="margin-bottom:16px; padding:20px; background:white; border-radius:16px; border: 1px solid var(--border-light); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <strong style="font-size:16px; color:var(--text-primary);">${cat}</strong>
          <div>
            <button onclick="renameCategoryMaster('${safeCat}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:13px; font-weight:600; margin-right:10px;">Editar</button>
            <button onclick="deleteCategoryMaster('${safeCat}')" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-size:13px; font-weight:600;">Borrar</button>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${cats[cat].map(sub => {
            const safeSub = sub.replace(/'/g, "\\'");
            return `<span style="background:white; border: 1px solid var(--border-light); padding:6px 14px; border-radius:20px; font-size:13px; color:var(--text-secondary); display:inline-flex; align-items:center; gap:6px;">
            ${sub}
            <button onclick="deleteSubcategory('${safeCat}','${safeSub}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:14px; padding:0; line-height:1;">×</button>
          </span>`;
          }).join('')}
          <button onclick="addSubcategory('${safeCat}')" style="background:none; border: 1px dashed var(--accent); color:var(--accent); padding:6px 14px; border-radius:20px; font-size:13px; cursor:pointer; font-weight:500;">+ Sub</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

// -------- CASAS TAB --------
function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Mis Casas</h3>
        <button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">+ Nueva Casa</button>
      </div>
      <div style="display:grid; gap:12px;">${casas.map(c => {
        const safeName = c.name.replace(/'/g, "\\'");
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:var(--bg-canvas,#f1f5f9); border-radius:12px;">
            <span style="font-weight:600; color:var(--text-primary);">${c.name}</span>
            <div style="display:flex; gap:16px;">
              <button onclick="renameCasaMaster(${c.row}, '${safeName}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600;">Editar</button>
              <button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-weight:600;">Eliminar</button>
            </div>
          </div>`;
      }).join('')}</div></div>`;
}

// -------- TARJETAS TAB --------
function renderTarjetasTab(container, header, tarjetas) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Mis Tarjetas</h3>
        <button onclick="addTarjetaMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">+ Nueva Tarjeta</button>
      </div>
      <div style="display:grid; gap:12px;">${tarjetas.map(t => {
        const safeName = t.name.replace(/'/g, "\\'");
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:var(--bg-canvas,#f1f5f9); border-radius:12px;">
            <span style="font-weight:600; color:var(--text-primary);">${t.name}</span>
            <div style="display:flex; gap:16px;">
              <button onclick="renameTarjetaMaster(${t.row}, '${safeName}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600;">Editar</button>
              <button onclick="deleteTarjetaMaster(${t.row})" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-weight:600;">Eliminar</button>
            </div>
          </div>`;
      }).join('')}</div></div>`;
}

// ===================== IMPORT PAGE =====================
function loadImportPage() {
  const container = document.getElementById('import-content');
  if (!container) return;
  container.innerHTML = `
    <div style="background:white; padding:32px; border-radius:16px; border:1px solid var(--border-light); box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 24px 0; font-weight:700;">Importar Movimientos</h3>
      <div class="import-dropzone" id="import-dropzone" onclick="document.getElementById('import-file-input').click()">
        <div class="import-dropzone-icon">📁</div>
        <div class="import-dropzone-text">Arrastra tu archivo aquí o haz clic para seleccionar</div>
        <div class="import-dropzone-sub">Formatos soportados:</div>
        <div class="import-format-badges">
          <span class="import-format-badge">CSV</span>
          <span class="import-format-badge">HTML</span>
          <span class="import-format-badge">PDF</span>
          <span class="import-format-badge">XLS/XLSX</span>
        </div>
        <input type="file" id="import-file-input" accept=".csv,.html,.htm,.pdf,.xls,.xlsx" style="display:none" onchange="handleImportFile(this)">
      </div>
      <div id="import-preview" style="margin-top:24px;"></div>
      <div id="import-actions" style="display:none; margin-top:16px; text-align:right;">
        <button onclick="cancelImport()" style="background:var(--bg-tertiary,#eef0f4); color:var(--text-secondary); border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; margin-right:8px;">Cancelar</button>
        <button onclick="confirmImport()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600;">Importar a Google Sheets</button>
      </div>
    </div>`;

  // Drag & drop
  const dz = document.getElementById('import-dropzone');
  if (dz) {
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImportFileObj(e.dataTransfer.files[0]); });
  }
}

window._importedRows = [];

window.handleImportFile = function(input) {
  if (input.files.length) handleImportFileObj(input.files[0]);
};

async function handleImportFileObj(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const preview = document.getElementById('import-preview');
  const actions = document.getElementById('import-actions');
  preview.innerHTML = '<div style="color:var(--text-secondary); padding:12px;">Procesando archivo...</div>';

  try {
    let rows = [];
    if (ext === 'csv') {
      rows = await parseCSV(file);
    } else if (ext === 'html' || ext === 'htm') {
      rows = await parseHTML(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rows = await parseXLSX(file);
    } else if (ext === 'pdf') {
      preview.innerHTML = '<div style="color:var(--warning,#d97706); padding:12px; background:var(--warning-light,#fef3c7); border-radius:8px;">⚠️ La importación de PDF requiere extracción de texto. Por favor convierte a CSV primero si es posible.</div>';
      return;
    } else {
      preview.innerHTML = '<div style="color:var(--danger,#dc2626); padding:12px;">Formato no soportado</div>';
      return;
    }

    window._importedRows = rows;
    if (rows.length === 0) {
      preview.innerHTML = '<div style="color:var(--text-secondary); padding:12px;">No se encontraron datos en el archivo.</div>';
      return;
    }

    const headerRow = rows[0];
    const dataRows = rows.slice(0, 11);
    let tbl = `<div style="font-size:13px; color:var(--text-secondary); margin-bottom:8px;">Vista previa — ${rows.length - 1} filas encontradas (mostrando máx. 10)</div>
      <div style="overflow-x:auto; border:1px solid var(--border-light); border-radius:8px;">
      <table class="import-preview-table">
        <thead><tr>${headerRow.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${dataRows.slice(1).map(r => `<tr>${r.map(c => `<td>${c || ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    preview.innerHTML = tbl;
    if (actions) actions.style.display = 'block';
  } catch (e) {
    console.error("Error parsing file:", e);
    preview.innerHTML = `<div style="color:var(--danger,#dc2626); padding:12px;">Error al procesar: ${e.message}</div>`;
  }
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const rows = lines.map(l => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < l.length; i++) {
          const ch = l[i];
          if (ch === '"') { inQuotes = !inQuotes; }
          else if ((ch === ',' || ch === ';') && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += ch; }
        }
        result.push(current.trim());
        return result;
      });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseHTML(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(e.target.result, 'text/html');
      const table = doc.querySelector('table');
      if (!table) { resolve([]); return; }
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(td => cells.push(td.textContent.trim()));
        if (cells.length > 0) rows.push(cells);
      });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') { reject(new Error("Librería XLSX no cargada")); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

window.cancelImport = function() {
  window._importedRows = [];
  const preview = document.getElementById('import-preview');
  const actions = document.getElementById('import-actions');
  if (preview) preview.innerHTML = '';
  if (actions) actions.style.display = 'none';
};

window.confirmImport = async function() {
  const rows = window._importedRows;
  if (!rows || rows.length <= 1) return alert("No hay datos para importar");
  const preview = document.getElementById('import-preview');
  preview.innerHTML = '<div style="color:var(--text-secondary); padding:12px;">Importando filas a Google Sheets...</div>';
  try {
    for (let i = 1; i < rows.length; i++) {
      await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, rows[i]);
    }
    preview.innerHTML = `<div style="color:var(--success,#16a34a); padding:16px; background:var(--success-light,#dcfce7); border-radius:8px; font-weight:600;">✅ ${rows.length - 1} filas importadas correctamente a ${CONFIG.SHEETS.GASTOS}</div>`;
    document.getElementById('import-actions').style.display = 'none';
    window._importedRows = [];
  } catch (e) {
    console.error("Error importando:", e);
    preview.innerHTML = `<div style="color:var(--danger,#dc2626); padding:12px;">Error al importar: ${e.message}</div>`;
  }
};

// ===================== CRUD: CASAS =====================
// -------- SIN CATEGORIZAR TAB --------
function renderSinCategorizarTab(container, header, uncatLines, cats, casas) {
  // Group by bank, then by concepto (to show aggregated totals)
  const byBank = {};
  uncatLines.forEach(l => {
    if (!byBank[l.bank]) byBank[l.bank] = [];
    byBank[l.bank].push(l);
  });

  const casaOpts = ['', ...casas.map(c => c.name)].map(c => `<option value="${c}">${c || '— Sin casa —'}</option>`).join('');
  const catOpts  = (cat) => ['', ...Object.keys(cats)].map(c => `<option value="${c}" ${c===cat?'selected':''}>${c || '— Sin categoría —'}</option>`).join('');
  const subOpts  = (cat, sub) => {
    const subs = cat && cats[cat] ? cats[cat] : [];
    return ['', ...subs].map(s => `<option value="${s}" ${s===sub?'selected':''}>${s || '— Sin subcategoría —'}</option>`).join('');
  };

  let rows = '';
  Object.entries(byBank).sort((a,b) => a[0].localeCompare(b[0])).forEach(([bank, lines]) => {
    // Group lines by normalized concepto
    const byConcepto = {};
    lines.forEach(l => {
      const key = l.concepto;
      if (!byConcepto[key]) byConcepto[key] = { lines: [], total: 0, bank };
      byConcepto[key].lines.push(l);
      byConcepto[key].total += l.real.reduce((s,v) => s+v, 0);
    });

    rows += `<tr><td colspan="7" style="background:var(--bg-secondary,#f8fafc);padding:6px 12px;font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:.05em;border-top:2px solid var(--border-light);">${bank}</td></tr>`;

    Object.entries(byConcepto).sort((a,b) => b[1].total - a[1].total).forEach(([concepto, grp]) => {
      const ids = grp.lines.map(l => l.id).join(',');
      const sheetRows = grp.lines.map(l => l.sheetRow).join(',');
      const safeId = concepto.replace(/[^a-z0-9]/gi, '_').substring(0, 30) + '_' + Math.random().toString(36).substring(2,5);
      // Collect unique notas snippets for context
      const notasSnippets = [...new Set(grp.lines.map(l => (l.notas||'').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z/,'').trim()).filter(Boolean))].slice(0,2);
      const notasHtml = notasSnippets.length
        ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${notasSnippets.join(' · ')}</div>`
        : '';
      rows += `<tr data-sincat-row="${safeId}">
        <td style="padding:8px 12px;font-size:13px;max-width:220px;overflow:hidden;" title="${concepto}">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">${concepto}</div>
          ${notasHtml}
        </td>
        <td style="padding:8px;font-size:12px;color:var(--text-secondary);white-space:nowrap;">${grp.lines.length} línea${grp.lines.length>1?'s':''}</td>
        <td style="padding:8px;font-size:13px;font-weight:600;text-align:right;white-space:nowrap;">${grp.total.toLocaleString('es-ES',{minimumFractionDigits:2})} €</td>
        <td style="padding:4px;"><select onchange="scUpdateSub(this,'${safeId}')" style="width:100%;padding:4px;font-size:12px;border-radius:6px;border:1px solid var(--border-light);">${casaOpts}</select></td>
        <td style="padding:4px;"><select id="sc-cat-${safeId}" onchange="scCatChange(this,'${safeId}')" style="width:100%;padding:4px;font-size:12px;border-radius:6px;border:1px solid var(--border-light);">${catOpts('')}</select></td>
        <td style="padding:4px;"><select id="sc-sub-${safeId}" style="width:100%;padding:4px;font-size:12px;border-radius:6px;border:1px solid var(--border-light);">${subOpts('','')}</select></td>
        <td style="padding:4px;">
          <input id="sc-alias-${safeId}" placeholder="Alias…" style="width:100%;padding:4px;font-size:12px;border-radius:6px;border:1px solid var(--border-light);box-sizing:border-box;">
        </td>
        <td style="padding:4px;">
          <button onclick="scSave('${safeId}','${bank}','${concepto.replace(/'/g,"\'")}','${ids}','${sheetRows}')" style="background:var(--accent);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">Guardar</button>
        </td>
      </tr>`;
    });
  });

  container.innerHTML = header + `
    <div style="padding:0 0 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;color:var(--text-primary);font-weight:700;">Sin Categorizar <span style="font-size:14px;font-weight:400;color:var(--text-secondary);">(${uncatLines.length} líneas)</span></h3>
      </div>
      ${uncatLines.length === 0 ? '<div style="padding:40px;text-align:center;color:var(--text-secondary);">✅ Todo categorizado</div>' : `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="border-bottom:2px solid var(--border-light);">
            <th style="padding:8px 12px;text-align:left;font-weight:600;font-size:11px;color:var(--text-secondary);">CONCEPTO</th>
            <th style="padding:8px;text-align:left;font-weight:600;font-size:11px;color:var(--text-secondary);">LÍNEAS</th>
            <th style="padding:8px;text-align:right;font-weight:600;font-size:11px;color:var(--text-secondary);">TOTAL</th>
            <th style="padding:8px;text-align:left;font-weight:600;font-size:11px;color:var(--text-secondary);">CASA</th>
            <th style="padding:8px;text-align:left;font-weight:600;font-size:11px;color:var(--text-secondary);">CATEGORÍA</th>
            <th style="padding:8px;text-align:left;font-weight:600;font-size:11px;color:var(--text-secondary);">SUBCATEGORÍA</th>
            <th style="padding:8px;text-align:left;font-weight:600;font-size:11px;color:var(--text-secondary);">ALIAS</th>
            <th style="padding:8px;"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    </div>`;
}

// Called when category select changes — repopulate subcategory select
window.scCatChange = function(catSel, id) {
  const cat = catSel.value;
  const subSel = document.getElementById('sc-sub-' + id);
  if (!subSel) return;
  const cats = AppState.config?.categorias || {};
  const subs = cat && cats[cat] ? cats[cat] : [];
  subSel.innerHTML = ['', ...subs].map(s => `<option value="${s}">${s || '— Sin subcategoría —'}</option>`).join('');
};

window.scUpdateSub = function(casaSel, id) { /* casa change hook — extend if needed */ };

window.scSave = async function(id, bank, concepto, idsStr, sheetRowsStr) {
  const casaSel  = document.querySelector(`[data-sincat-row="${id}"] select:nth-of-type(1)`);
  const catSel   = document.getElementById('sc-cat-' + id);
  const subSel   = document.getElementById('sc-sub-' + id);
  const aliasEl  = document.getElementById('sc-alias-' + id);
  const casa     = casaSel?.value || '';
  const cat      = catSel?.value  || '';
  const sub      = subSel?.value  || '';
  const alias    = aliasEl?.value.trim() || '';

  if (!cat) { alert('Selecciona al menos una categoría.'); return; }

  const sheetRows = sheetRowsStr.split(',').map(Number).filter(r => r > 0);
  const updates   = [];
  sheetRows.forEach(r => {
    if (casa) updates.push({ row: r, col: 6, value: casa });
    updates.push({ row: r, col: 7, value: cat });
    if (sub)   updates.push({ row: r, col: 8, value: sub });
    if (alias) updates.push({ row: r, col: 41, value: alias });
  });

  // Also create a categorize rule for future imports
  try {
    await BudgetLogic.createRule(concepto, bank, casa, cat, sub, alias);
  } catch(e) { console.warn('Rule creation failed (non-critical):', e); }

  // Batch update sheet
  for (let i = 0; i < updates.length; i += 20) {
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, updates.slice(i, i + 20));
  }

  // Update in-memory lines
  const ids = idsStr.split(',');
  if (typeof BudgetGrid !== 'undefined' && BudgetGrid.lines) {
    BudgetGrid.lines.forEach(l => {
      if (ids.includes(l.id)) {
        if (casa)  l.casa         = casa;
        l.categoria    = cat;
        if (sub)   l.subcategoria = sub;
        if (alias) l.alias        = alias;
      }
    });
  }

  // Remove row from UI
  const row = document.querySelector(`[data-sincat-row="${id}"]`);
  if (row) row.remove();

  // Update badge count
  BudgetLogic.invalidateGastosCache(bank);
  loadSettingsPage(); // refresh to update badge
};

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };

window.addCasaMaster = async function() {
  const n = prompt("Nombre de la nueva casa:");
  if (!n) return;
  try {
    // Find next empty row in column D (casas column)
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    let targetRow = -1;
    if (rows) {
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][3] || rows[i][3].toString().trim() === '') { targetRow = i + 1; break; }
      }
    }
    if (targetRow > 0) {
      await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, targetRow, 4, n);
    } else {
      // All rows in col D are used — append a new row with just col D
      const emptyRow = new Array(3).fill('');
      await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [...emptyRow, n]);
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error adding casa:", e); alert("Error al añadir casa"); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current);
  if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar esta casa?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};

// ===================== CRUD: TARJETAS (Col E = col 5 en Sheets) =====================
window.addTarjetaMaster = async function() {
  const n = prompt("Nombre de la nueva tarjeta:");
  if (!n) return;
  try {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    let targetRow = -1;
    if (rows) {
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][4] || rows[i][4].toString().trim() === '' || rows[i][4].toString().trim() === 'DELETED') { targetRow = i + 1; break; }
      }
    }
    if (targetRow > 0) {
      await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, targetRow, 5, n);
    } else {
      const emptyRow = new Array(4).fill('');
      await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [...emptyRow, n]);
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error adding tarjeta:", e); alert("Error al añadir tarjeta"); }
};
window.renameTarjetaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current);
  if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 5, n); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteTarjetaMaster = async function(row) {
  if (confirm("¿Eliminar esta tarjeta?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};

// ===================== CRUD: CATEGORÍAS =====================
window.addCategoryMaster = async function() {
  const n = prompt("Nombre de la nueva categoría:");
  if (!n) return;
  try {
    // Categories use col A of CONFIG. appendRow is safe for col A since Sheets detects end of data by col A.
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]);
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error adding category:", e); alert("Error al añadir categoría"); }
};
window.renameCategoryMaster = async function(oldName) {
  const n = prompt("Nuevo nombre para la categoría:", oldName);
  if (!n || n === oldName) return;
  try {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === oldName) {
        updates.push({ row: i + 1, col: 1, value: n });
      }
    }
    if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.CONFIG, updates);
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error renaming category:", e); alert("Error al renombrar"); }
};
window.deleteCategoryMaster = async function(catName) {
  if (!confirm(`¿Eliminar la categoría "${catName}" y todas sus subcategorías?`)) return;
  try {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === catName) {
        updates.push({ row: i + 1, col: 5, value: 'DELETED' });
      }
    }
    if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.CONFIG, updates);
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error deleting category:", e); alert("Error al eliminar"); }
};
window.addSubcategory = async function(catName) {
  const n = prompt(`Nueva subcategoría para "${catName}":`);
  if (!n) return;
  try {
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [catName, n]);
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error adding subcategory:", e); alert("Error al añadir subcategoría"); }
};
window.deleteSubcategory = async function(catName, subName) {
  if (!confirm(`¿Eliminar "${subName}" de "${catName}"?`)) return;
  try {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === catName && rows[i][1] && rows[i][1].trim() === subName) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 5, 'DELETED');
        break;
      }
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  } catch(e) { console.error("Error deleting subcategory:", e); alert("Error al eliminar subcategoría"); }
};

// ===================== INIT (llamado por onSignedIn en api.js) =====================
async function initApp() {
  try {
    let retry = 0;
    while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
      if (retry > 20) throw new Error("API Timeout");
      await new Promise(r => setTimeout(r, 200));
      retry++;
    }
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) {
    console.error("Fallo initApp:", e);
  }
}

// ===================== RULES PAGE =====================
async function loadRulesPage() {
  const container = document.getElementById('rules-content');
  if (!container) return;
  if (!BudgetLogic._groupRules.length && !BudgetLogic._rules.length && !BudgetLogic._excludeRules.length) {
    await BudgetLogic.loadRules();
  }
  _rulesRender();
}

// ── Estado local ─────────────────────────────────────────────────────────────
let _rulesActiveTab = 'group';
let _rulesQuery     = '';
let _rulesOpenKey   = null;

window._rulesSetTab = function(tab) {
  _rulesActiveTab = tab; _rulesOpenKey = null; _rulesQuery = ''; _rulesRender();
};
window._rulesToggle = function(key) {
  _rulesOpenKey = (_rulesOpenKey === key) ? null : key; _rulesRender();
};

function _rulesRender() {
  const container = document.getElementById('rules-content');
  if (!container) return;
  const cg = BudgetLogic._groupRules.length;
  const cc = BudgetLogic._rules.length;
  const ce = BudgetLogic._excludeRules.length;

  let html = `
  <div style="margin-bottom:16px;">
    <div class="settings-tabs" style="margin-bottom:14px;">
      <button class="settings-tab ${_rulesActiveTab==='group'?'active':''}" onclick="_rulesSetTab('group')">AGRUPACIONES <span style="font-size:11px;font-weight:400;opacity:.7;">(${cg})</span></button>
      <button class="settings-tab ${_rulesActiveTab==='categorize'?'active':''}" onclick="_rulesSetTab('categorize')">CATEGORIZACIONES <span style="font-size:11px;font-weight:400;opacity:.7;">(${cc})</span></button>
      <button class="settings-tab ${_rulesActiveTab==='exclude'?'active':''}" onclick="_rulesSetTab('exclude')">EXCLUSIONES <span style="font-size:11px;font-weight:400;opacity:.7;">(${ce})</span></button>
    </div>
    <input id="rules-search" placeholder="Buscar por nombre, patrón o banco..."
      value="${_esc(_rulesQuery)}"
      oninput="_rulesQuery=this.value;_rulesRender();"
      style="width:100%;max-width:420px;padding:8px 12px;border:1px solid var(--border-light);border-radius:8px;font-size:13px;margin-bottom:16px;">
  </div>`;

  if (_rulesActiveTab === 'group')      html += _rulesGroup();
  else if (_rulesActiveTab === 'categorize') html += _rulesCat();
  else                                  html += _rulesExcl();

  container.innerHTML = html;

  // Restore search focus
  const inp = document.getElementById('rules-search');
  if (inp) { const v = inp.value; inp.focus(); inp.setSelectionRange(v.length, v.length); }

  // Wire Enter on add-pattern inputs + live search preview
  container.querySelectorAll('.rules-add-input').forEach(inp => {
    inp.onkeydown = (e) => { if (e.key === 'Enter') addGroupPatternFromPage(inp.nextElementSibling); };

    // Inject preview div after the button
    const btn = inp.nextElementSibling;
    if (!btn) return;
    let pvDiv = inp.parentNode.querySelector('.rules-pattern-preview');
    if (!pvDiv) {
      pvDiv = document.createElement('div');
      pvDiv.className = 'rules-pattern-preview';
      pvDiv.style.cssText = 'margin-top:6px;max-height:180px;overflow-y:auto;grid-column:1/-1;';
      inp.parentNode.parentNode.insertBefore(pvDiv, inp.parentNode.nextSibling);
    }
    _rulesAttachPreview(inp, pvDiv);
  });
}

function _esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; }
function esc(s) { return _esc(s); }

// ── Shared live-search preview for pattern inputs (Rules page + Budget drawer) ─
function _rulesAttachPreview(inputEl, previewEl) {
  const MIN  = 2;
  const hint = '<span style="font-size:10px;color:var(--text-tertiary);">Escribe 2+ letras para buscar en concepto, notas y detalles</span>';
  previewEl.innerHTML = hint;
  const getBank = () => (typeof BudgetGrid !== 'undefined' ? BudgetGrid.activeBank : null);
  let _timer = null;
  inputEl.oninput = () => {
    clearTimeout(_timer);
    const q = inputEl.value.trim();
    if (q.length < MIN) { previewEl.innerHTML = hint; return; }
    previewEl.innerHTML = '<span style="font-size:10px;color:var(--text-tertiary);">Buscando...</span>';
    _timer = setTimeout(async () => {
      const bank  = getBank();
      const lines = await BudgetLogic.searchGastos(q, bank || null);
      if (!lines.length) {
        previewEl.innerHTML = '<span style="font-size:10px;color:var(--text-tertiary);">Sin coincidencias</span>';
        return;
      }
      let html = '<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px;">'
        + lines.length + ' línea' + (lines.length!==1?'s':'') + ' encontradas'
        + (bank ? ' en ' + bank : '') + '</div>';
      lines.slice(0, 12).forEach(l => {
        const total = l.real.reduce((s,v)=>s+v, 0);
        const amt   = total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const label = l.alias || l.concepto;
        const sub   = l.notas ? String(l.notas).slice(0, 60) : '';
        html += '<div style="padding:5px 8px;background:white;border:1px solid var(--border-light);'
          + 'border-radius:4px;margin-bottom:2px;font-size:11px;">'
          + '<div style="display:flex;justify-content:space-between;gap:8px;">'
          + '<span style="color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(label) + '</span>'
          + '<span style="color:var(--text-secondary);font-weight:600;flex-shrink:0;">' + amt + '</span>'
          + '</div>'
          + (sub ? '<div style="color:var(--text-tertiary);font-size:10px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(sub) + '</div>' : '')
          + '</div>';
      });
      if (lines.length > 12) html += '<div style="font-size:10px;color:var(--text-tertiary);padding:2px 8px;">+' + (lines.length-12) + ' más...</div>';
      previewEl.innerHTML = html;
    }, 250);
  };
}

// ── Shared live-search preview for rules-add-input fields ─────────────────────

// ── AGRUPACIONES ─────────────────────────────────────────────────────────────
function _rulesGroup() {
  const groups = new Map();
  BudgetLogic._groupRules.forEach(r => {
    if (!groups.has(r.label)) groups.set(r.label, []);
    groups.get(r.label).push(r);
  });
  const q = _rulesQuery.toUpperCase().trim();
  let entries = [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0],'es'));
  if (q) entries = entries.filter(([lbl, pats]) =>
    lbl.toUpperCase().includes(q) || pats.some(r => r.pattern.includes(q) || (r.bank||'').toUpperCase().includes(q))
  );
  if (!entries.length) return `<p style="color:var(--text-tertiary);padding:20px 0;">${q?'Sin coincidencias.':'No hay reglas de agrupación. Créalas desde el drawer de cada línea en Budget.'}</p>`;

  let html = `<div style="border:1px solid var(--border-light);border-radius:10px;overflow:hidden;">`;
  entries.forEach(([lbl, pats], i) => {
    const key = 'g_' + lbl;
    const open = _rulesOpenKey === key;
    html += `
    <div style="${i>0?'border-top:1px solid var(--border-light);':''}">
      <div onclick="_rulesToggle('${_esc(key)}')" style="display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;user-select:none;background:${open?'#f8f8ff':'white'};">
        <span style="font-size:11px;font-weight:700;color:#7c3aed;background:#ede9fe;padding:2px 7px;border-radius:4px;flex-shrink:0;">grupo</span>
        <span style="font-weight:600;font-size:14px;flex:1;">${_esc(lbl)}</span>
        <span style="font-size:11px;color:var(--text-tertiary);">${pats.length} patrón${pats.length>1?'es':''}</span>
        <span style="color:var(--text-tertiary);font-size:18px;line-height:1;transition:transform .2s;${open?'transform:rotate(90deg)':''}">›</span>
      </div>
      ${open ? `<div style="padding:10px 16px 14px;background:#fafaff;border-top:1px solid #ebe8f8;">
        ${pats.map(r=>`
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <code style="flex:1;font-size:11px;background:#f0eefe;color:#5b21b6;padding:3px 8px;border-radius:4px;">${_esc(r.pattern)}</code>
          <span style="font-size:10px;color:var(--text-tertiary);min-width:80px;">${r.bank||'todos los bancos'}</span>
          <button class="rules-del-btn" onclick="event.stopPropagation();deleteGroupPattern('${_esc(r.pattern)}')" title="Eliminar">✕</button>
        </div>`).join('')}
        <div style="display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px dashed #e2e8f0;">
          <input class="rules-add-input" placeholder="Nuevo patrón..." data-label="${_esc(lbl)}" style="flex:1;padding:6px 10px;border:1px solid var(--border-light);border-radius:6px;font-size:12px;">
          <button class="rules-add-btn" onclick="addGroupPatternFromPage(this)">+</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button onclick="event.stopPropagation();renameGroup('${_esc(lbl)}')" style="font-size:12px;padding:4px 12px;border:1px solid var(--border-light);border-radius:6px;background:white;cursor:pointer;">✎ Renombrar</button>
          <button onclick="event.stopPropagation();deleteGroup('${_esc(lbl)}')" style="font-size:12px;padding:4px 12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#dc2626;cursor:pointer;">🗑 Eliminar grupo</button>
        </div>
      </div>` : ''}
    </div>`;
  });
  return html + '</div>';
}

// ── CATEGORIZACIONES ──────────────────────────────────────────────────────────
function _rulesCat() {
  const q = _rulesQuery.toUpperCase().trim();
  let list = BudgetLogic._rules.slice().sort((a,b) => (a.pattern).localeCompare(b.pattern,'es'));
  if (q) list = list.filter(r =>
    r.pattern.includes(q) || (r.bank||'').toUpperCase().includes(q) ||
    (r.categoria||'').toUpperCase().includes(q) || (r.casa||'').toUpperCase().includes(q)
  );
  if (!list.length) return `<p style="color:var(--text-tertiary);padding:20px 0;">${q?'Sin coincidencias.':'No hay reglas de categorización.'}</p>`;

  let html = `<div style="border:1px solid var(--border-light);border-radius:10px;overflow:hidden;">`;
  list.forEach((r, i) => {
    const key = 'c_' + r.pattern + '_' + (r.bank||'');
    const open = _rulesOpenKey === key;
    const cat = [r.casa, r.categoria, r.subcategoria].filter(Boolean).join(' › ');
    html += `
    <div style="${i>0?'border-top:1px solid var(--border-light);':''}">
      <div onclick="_rulesToggle('${_esc(key)}')" style="display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;user-select:none;background:${open?'#f8fff9':'white'};">
        <span style="font-size:11px;font-weight:700;color:#065f46;background:#dcfce7;padding:2px 7px;border-radius:4px;flex-shrink:0;">cat</span>
        <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(r.pattern)}">${_esc(r.pattern)}</span>
        <span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;">${_esc(cat)}</span>
        <span style="font-size:10px;color:#94a3b8;white-space:nowrap;">${_esc(r.bank||'todos')}</span>
        <span style="color:var(--text-tertiary);font-size:18px;line-height:1;${open?'transform:rotate(90deg)':''}">›</span>
      </div>
      ${open ? `<div style="padding:10px 16px 14px;background:#f8fff9;border-top:1px solid #bbf7d0;font-size:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-bottom:12px;">
          <div><div style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;margin-bottom:2px;">Banco</div><strong>${_esc(r.bank||'todos')}</strong></div>
          <div><div style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;margin-bottom:2px;">Casa</div><strong>${_esc(r.casa||'—')}</strong></div>
          <div><div style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;margin-bottom:2px;">Categoría</div><strong>${_esc(r.categoria||'—')}</strong></div>
          <div><div style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;margin-bottom:2px;">Subcategoría</div><strong>${_esc(r.subcategoria||'—')}</strong></div>
        </div>
        <button onclick="event.stopPropagation();deleteCatRule('${_esc(r.pattern)}','${_esc(r.bank||'')}')" style="font-size:12px;padding:4px 12px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;color:#dc2626;cursor:pointer;">🗑 Eliminar regla</button>
      </div>` : ''}
    </div>`;
  });
  return html + '</div>';
}

// ── EXCLUSIONES ───────────────────────────────────────────────────────────────
function _rulesExcl() {
  const q = _rulesQuery.toUpperCase().trim();
  let list = BudgetLogic._excludeRules.slice().sort((a,b) => a.pattern.localeCompare(b.pattern,'es'));
  if (q) list = list.filter(r => r.pattern.includes(q) || (r.bank||'').toUpperCase().includes(q));
  if (!list.length) return `<p style="color:var(--text-tertiary);padding:20px 0;">${q?'Sin coincidencias.':'No hay reglas de exclusión.'}</p>`;

  let html = `<div style="border:1px solid var(--border-light);border-radius:10px;overflow:hidden;">`;
  list.forEach((r, i) => {
    html += `
    <div style="${i>0?'border-top:1px solid var(--border-light);':''}display:flex;align-items:center;gap:10px;padding:11px 16px;background:white;">
      <span style="font-size:11px;font-weight:700;color:#991b1b;background:#fef2f2;padding:2px 7px;border-radius:4px;flex-shrink:0;">excl</span>
      <code style="flex:1;font-size:12px;">${_esc(r.pattern)}</code>
      <span style="font-size:11px;color:var(--text-tertiary);">${_esc(r.bank||'todos')}</span>
      <button class="rules-del-btn" onclick="deleteCatRule('${_esc(r.pattern)}','${_esc(r.bank||'')}','exclude')" title="Eliminar">✕</button>
    </div>`;
  });
  return html + '</div>';
}

// ── Acciones ──────────────────────────────────────────────────────────────────
window.deleteGroupPattern = async function(pattern) {
  const rule = BudgetLogic._groupRules.find(r => r.pattern === pattern.toUpperCase());
  if (!rule) return;
  try {
    if (rule.sheetRow > 0) {
      await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, rule.sheetRow, 10, 'FALSE');
    } else {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
      if (rows) for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]||'').trim().toUpperCase() === rule.pattern && String(rows[i][3]||'') === 'group') {
          await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, i+1, 10, 'FALSE'); break;
        }
      }
    }
    const idx = BudgetLogic._groupRules.indexOf(rule);
    if (idx >= 0) BudgetLogic._groupRules.splice(idx, 1);
    _rulesRender();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};

window.deleteCatRule = async function(pattern, bank, action) {
  const arr = action === 'exclude' ? BudgetLogic._excludeRules : BudgetLogic._rules;
  const rule = arr.find(r => r.pattern === pattern.toUpperCase() && (r.bank||'') === (bank||''));
  if (!rule) { alert('Regla no encontrada'); return; }
  if (!confirm(`¿Eliminar la regla "${pattern}"?`)) return;
  try {
    if (rule.sheetRow > 0) await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, rule.sheetRow, 10, 'FALSE');
    arr.splice(arr.indexOf(rule), 1);
    _rulesRender();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};

window.addGroupPatternFromPage = async function(btn) {
  const input = btn.previousElementSibling;
  const pattern = input?.value?.trim();
  const label = input?.dataset?.label;
  if (!pattern || !label) return;
  try {
    await BudgetLogic.createGroupRule(pattern, label, '');
    input.value = '';
    _rulesRender();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};

window.renameGroup = async function(oldLabel) {
  const newLabel = prompt('Nuevo nombre del grupo:', oldLabel);
  if (!newLabel || newLabel === oldLabel) return;
  try {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    if (!rows) return;
    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][3]||'').trim() === 'group' && String(rows[i][4]||'').trim() === oldLabel)
        updates.push({ row: i+1, col: 5, value: newLabel });
    }
    if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.RULES, updates);
    BudgetLogic._groupRules.forEach(r => { if (r.label === oldLabel) r.label = newLabel; });
    _rulesOpenKey = 'g_' + newLabel;
    _rulesRender();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};

window.deleteGroup = async function(label) {
  if (!confirm(`¿Eliminar el grupo "${label}" y todos sus patrones?`)) return;
  try {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    if (!rows) return;
    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][3]||'').trim() === 'group' && String(rows[i][4]||'').trim() === label)
        updates.push({ row: i+1, col: 10, value: 'FALSE' });
    }
    if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.RULES, updates);
    BudgetLogic._groupRules = BudgetLogic._groupRules.filter(r => r.label !== label);
    _rulesOpenKey = null;
    _rulesRender();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};


async function initApp() {
  try {
    let retry = 0;
    while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
      if (retry > 20) throw new Error("API Timeout");
      await new Promise(r => setTimeout(r, 200));
      retry++;
    }
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) {
    console.error("Fallo initApp:", e);
  }
}

