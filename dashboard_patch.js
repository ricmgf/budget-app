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
        <div class="dash-eyebrow">Dashboard</div>
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

  const cardClass = hasAlerts    ? 'dash-bank-card alert-missing'
    : isSufficient               ? 'dash-bank-card sufficient'
    :                              'dash-bank-card needs-transfer';

  // Bloque de alertas
  let alertsHtml = '';
  if (hasAlerts) {
    const items = [
      ...missing.map(l    => `<li class="dash-alert-item red">⚠ Falta: <strong>${l}</strong></li>`),
      ...incomplete.map(s => `<li class="dash-alert-item amber">📅 ${s.message}</li>`),
    ].join('');
    alertsHtml = `<ul class="dash-stmt-alert">${items}</ul>`;
  }

  // Importe y estado
  const amountColor = isSufficient ? '#10b981' : '#0f172a';
  const statusText  = isSufficient
    ? '✓ Saldo suficiente'
    : `→ Enviar a cuenta ${acc.iban ? acc.iban.slice(-4) : '—'}`;

  const ibanDisplay = acc.iban
    ? acc.iban.replace(/(.{4})/g, '$1 ').trim()
    : '';

  const nextMonthName = monthNames[month === 12 ? 1 : month + 1];

  return `
    <div class="${cardClass}" onclick="navigateTo('budget'); setTimeout(()=>BudgetGrid.switchBank('${acc.name.replace(/'/g,"\\'")}'),300)">
      <div class="dash-card-header">
        <div>
          <div class="dash-bank-name">${acc.name}</div>
          <div class="dash-bank-iban">${ibanDisplay}</div>
        </div>
        <div class="dash-card-arrow">›</div>
      </div>
      ${alertsHtml}
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
