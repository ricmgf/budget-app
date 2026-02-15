/**
 * Budget Grid Engine v1.0
 * Spreadsheet-like 12-month budget view per bank
 * Sections: GASTOS, TARJETAS, INGRESOS + Summary
 */

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const BudgetGrid = {
  accounts: [],
  lines: [],
  summaries: [],
  activeBank: null,
  activeBankIdx: 0,
  editingCell: null,
  collapsedCards: {},

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    if (this.accounts.length > 0) {
      this.activeBank = this.accounts[0].name;
    }
    this.render();
  },

  async refresh() {
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this.render();
  },

  render() {
    const container = document.getElementById('budget-content');
    if (!container) return;

    if (this.accounts.length === 0) {
      container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-secondary);"><p style="font-size:18px; margin-bottom:12px;">No hay bancos configurados</p><p>Ve a <a href="#" onclick="navigateTo(\'settings\'); return false;" style="color:var(--accent);">Ajustes > Bancos</a> para añadir tu primer banco.</p></div>';
      return;
    }

    const bankLines = this.lines.filter(l => l.bank === this.activeBank);
    const gastos = bankLines.filter(l => l.section === 'GASTOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const tarjetas = bankLines.filter(l => l.section === 'TARJETAS').sort((a,b) => a.sortOrder - b.sortOrder);
    const ingresos = bankLines.filter(l => l.section === 'INGRESOS').sort((a,b) => a.sortOrder - b.sortOrder);

    const currentMonth = AppState.currentMonth - 1; // 0-based
    const account = this.accounts.find(a => a.name === this.activeBank);
    const summary = this.summaries.filter(s => s.bank === this.activeBank);

    let html = this.renderBankTabs();
    html += '<div class="budget-grid-wrap"><table class="budget-grid">';
    html += this.renderHeader(currentMonth, summary);
    html += '<tbody>';
    html += this.renderSection('GASTOS', gastos, currentMonth, summary);
    html += this.renderSectionTotal('Total Gastos', gastos, currentMonth);
    html += this.renderSection('TARJETAS', tarjetas, currentMonth, summary);
    html += this.renderSectionTotal('Total Tarjetas', tarjetas, currentMonth);
    html += this.renderSection('INGRESOS', ingresos, currentMonth, summary);
    html += this.renderSectionTotal('Total Ingresos', ingresos, currentMonth);
    html += this.renderSummaryRows(gastos, tarjetas, ingresos, currentMonth, account, summary);
    html += '</tbody></table></div>';

    container.innerHTML = html;
  },

  renderBankTabs() {
    return `<div class="budget-bank-tabs">${this.accounts.map(a =>
      `<button class="budget-bank-tab ${a.name === this.activeBank ? 'active' : ''}" onclick="BudgetGrid.switchBank('${a.name.replace(/'/g,"\\'")}')">
        ${a.name}
      </button>`
    ).join('')}</div>`;
  },

  renderHeader(currentMonth, summaryList) {
    let h1 = '<thead><tr><th class="th-concept">Concepto</th>';
    let h2 = '<tr class="sub-header"><th class="th-concept"></th>';
    for (let m = 0; m < 12; m++) {
      const isCurrent = m === currentMonth;
      const summ = summaryList.find(s => s.month === m + 1);
      const isClosed = summ && summ.mesCerrado;
      const cls = isCurrent ? 'th-current-month' : (isClosed ? 'th-closed-month' : '');
      h1 += `<th class="th-month ${cls}" colspan="2">${MONTHS[m]}</th>`;
      h2 += `<th class="th-plan ${cls}">Plan</th><th class="th-real ${cls}">Real</th>`;
    }
    h1 += '<th class="th-actions"></th></tr>';
    h2 += '<th></th></tr></thead>';
    return h1 + h2;
  },

  renderSection(sectionName, lines, currentMonth, summaryList) {
    const sectionLabels = { GASTOS: 'GASTOS', TARJETAS: 'TARJETAS', INGRESOS: 'INGRESOS' };
    let html = `<tr class="bg-section-header"><td colspan="${26}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span>${sectionLabels[sectionName]}</span>
        <div class="section-actions">
          <button onclick="BudgetGrid.addLine('${sectionName}')">+ Añadir</button>
          ${sectionName === 'TARJETAS' ? '<button onclick="BudgetGrid.importCardExtract()" style="background:#6366f1;">+ Extracto</button>' : ''}
        </div>
      </div>
    </td></tr>`;

    if (lines.length === 0) {
      html += `<tr><td class="td-concept" style="color:var(--text-tertiary); font-style:italic;">Sin líneas — clic "+ Añadir"</td>`;
      for (let m = 0; m < 12; m++) html += '<td></td><td></td>';
      html += '<td></td></tr>';
    }

    lines.forEach(line => {
      const isUncat = !line.casa && !line.categoria;
      html += `<tr class="${isUncat ? 'uncategorized' : ''}" ondblclick="BudgetGrid.openDrawer('${line.id}')">`;
      html += `<td class="td-concept" title="${line.concepto}${isUncat ? ' — Sin categorizar (doble click)' : ''}">${line.concepto || '(vacío)'}</td>`;
      for (let m = 0; m < 12; m++) {
        const isCurrent = m === currentMonth;
        const summ = summaryList.find(s => s.month === m + 1);
        const isClosed = summ && summ.mesCerrado;
        const cls = isCurrent ? 'td-current-month' : (isClosed ? 'td-closed-month' : '');
        const planVal = line.plan[m];
        const realVal = line.real[m];
        const realCls = realVal > 0 && planVal > 0 ? (realVal > planVal ? 'val-over' : (realVal < planVal ? 'val-under' : '')) : '';
        html += `<td class="editable ${cls}" onclick="BudgetGrid.editCell(this, '${line.id}', 'plan', ${m})">${planVal ? planVal.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:2}) : ''}</td>`;
        html += `<td class="editable ${cls} ${realCls}" onclick="BudgetGrid.editCell(this, '${line.id}', 'real', ${m})">${realVal ? realVal.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:2}) : ''}</td>`;
      }
      html += `<td class="td-actions">
        <button class="row-action-btn delete" onclick="event.stopPropagation(); BudgetGrid.deleteLine('${line.id}')" title="Eliminar">✕</button>
      </td>`;
      html += '</tr>';
    });
    return html;
  },

  renderSectionTotal(label, lines, currentMonth) {
    let html = `<tr class="bg-total-row"><td class="td-concept" style="font-weight:700; background:#f8fafc;">${label}</td>`;
    for (let m = 0; m < 12; m++) {
      const isCurrent = m === currentMonth;
      const cls = isCurrent ? 'td-current-month' : '';
      const planTotal = lines.reduce((sum, l) => sum + (l.plan[m] || 0), 0);
      const realTotal = lines.reduce((sum, l) => sum + (l.real[m] || 0), 0);
      html += `<td class="${cls}" style="font-weight:700; background:#f8fafc;">${planTotal ? planTotal.toLocaleString('es-ES', {minimumFractionDigits:2}) : ''}</td>`;
      html += `<td class="${cls}" style="font-weight:700; background:#f8fafc;">${realTotal ? realTotal.toLocaleString('es-ES', {minimumFractionDigits:2}) : ''}</td>`;
    }
    html += '<td></td></tr>';
    return html;
  },

  renderSummaryRows(gastos, tarjetas, ingresos, currentMonth, account, summaryList) {
    const targetMin = account ? account.targetMinBalance : 0;
    let html = `<tr class="bg-section-header"><td colspan="26" style="border-left-color:#0ea5e9;">
      <span>RESUMEN${targetMin > 0 ? ` · Saldo mín objetivo: ${targetMin.toLocaleString('es-ES')} €` : ''}</span>
    </td></tr>`;

    // Build monthly arrays
    const labels = ['Total Gastos+Tarjetas', 'Total Ingresos', 'Cashflow Neto', 'Envío Necesario'];
    const rows = [[], [], [], []];

    let prevSaldo = 0;
    const firstSummary = summaryList.find(s => s.month === 1);
    if (firstSummary) prevSaldo = firstSummary.saldoInicio;

    for (let m = 0; m < 12; m++) {
      const gPlan = gastos.reduce((s, l) => s + (l.plan[m] || 0), 0) + tarjetas.reduce((s, l) => s + (l.plan[m] || 0), 0);
      const gReal = gastos.reduce((s, l) => s + (l.real[m] || 0), 0) + tarjetas.reduce((s, l) => s + (l.real[m] || 0), 0);
      const iPlan = ingresos.reduce((s, l) => s + (l.plan[m] || 0), 0);
      const iReal = ingresos.reduce((s, l) => s + (l.real[m] || 0), 0);
      const cfPlan = iPlan - gPlan;
      const cfReal = iReal - gReal;
      const envioPlan = Math.max(0, gPlan - iPlan - prevSaldo + targetMin);
      const envioReal = Math.max(0, gReal - iReal - prevSaldo + targetMin);

      rows[0].push([gPlan, gReal]);
      rows[1].push([iPlan, iReal]);
      rows[2].push([cfPlan, cfReal]);
      rows[3].push([envioPlan, envioReal]);
    }

    labels.forEach((label, i) => {
      const isEnvio = i === 3;
      html += `<tr class="bg-summary-row"><td class="td-concept" style="background:var(--accent-subtle); font-weight:600;">${label}</td>`;
      for (let m = 0; m < 12; m++) {
        const isCurrent = m === currentMonth;
        const cls = isCurrent ? 'td-current-month' : '';
        const [plan, real] = rows[i][m];
        const cfCls = i === 2 ? (plan < 0 ? 'val-over' : 'val-under') : (isEnvio && plan > 0 ? 'val-over' : '');
        html += `<td class="${cls}" style="background:var(--accent-subtle); font-weight:600; ${cfCls ? 'color:' + (cfCls === 'val-over' ? 'var(--danger)' : 'var(--success)') : ''}">${plan ? plan.toLocaleString('es-ES', {minimumFractionDigits:2}) : '-'}</td>`;
        html += `<td class="${cls}" style="background:var(--accent-subtle); font-weight:600;">${real ? real.toLocaleString('es-ES', {minimumFractionDigits:2}) : '-'}</td>`;
      }
      html += '<td></td></tr>';
    });

    return html;
  },

  // === INTERACTIONS ===

  switchBank(bankName) {
    this.activeBank = bankName;
    this.render();
  },

  editCell(td, lineId, type, monthIdx) {
    if (td.classList.contains('editing')) return;

    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    const currentVal = type === 'plan' ? line.plan[monthIdx] : line.real[monthIdx];
    const oldHTML = td.innerHTML;

    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${currentVal || ''}" 
      onblur="BudgetGrid.commitCell(this, '${lineId}', '${type}', ${monthIdx})"
      onkeydown="if(event.key==='Enter')this.blur(); if(event.key==='Escape'){this.dataset.cancel='1';this.blur();}"
      >`;
    const input = td.querySelector('input');
    input.focus();
    input.select();
  },

  async commitCell(input, lineId, type, monthIdx) {
    const td = input.parentElement;
    if (!td) return;

    if (input.dataset.cancel === '1') {
      // Restore
      const line = this.lines.find(l => l.id === lineId);
      const val = type === 'plan' ? line.plan[monthIdx] : line.real[monthIdx];
      td.classList.remove('editing');
      td.innerHTML = val ? val.toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:2}) : '';
      return;
    }

    const newVal = parseFloat(input.value) || 0;
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    // Update local state
    if (type === 'plan') {
      line.plan[monthIdx] = newVal;
      const col = BudgetLogic.getPlanCol(monthIdx);
      await BudgetLogic.updateBudgetCell(line.sheetRow, col, newVal);
    } else {
      line.real[monthIdx] = newVal;
      const col = BudgetLogic.getRealCol(monthIdx);
      await BudgetLogic.updateBudgetCell(line.sheetRow, col, newVal);
    }

    // Re-render to update totals
    this.render();
  },

  async addLine(section) {
    const concepto = prompt(`Nuevo concepto (${section}):`);
    if (!concepto) return;
    await BudgetLogic.addBudgetLine(this.activeBank, AppState.currentYear, section, concepto);
    await this.refresh();
  },

  async deleteLine(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    if (!confirm(`¿Eliminar "${line.concepto}"?`)) return;
    await BudgetLogic.deleteBudgetLine(line.sheetRow);
    await this.refresh();
  },

  // === DRAWER (side panel for editing line metadata) ===

  openDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    const cats = AppState.config ? AppState.config.categorias : {};
    const casas = AppState.config ? AppState.config.casas : [];
    const catKeys = Object.keys(cats);

    const overlay = document.createElement('div');
    overlay.className = 'budget-drawer-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const subcats = line.categoria && cats[line.categoria] ? cats[line.categoria] : [];

    overlay.innerHTML = `<div class="budget-drawer">
      <h3>Editar Línea</h3>
      <label>Concepto</label>
      <input id="drawer-concepto" value="${line.concepto || ''}">
      <label>Casa</label>
      <select id="drawer-casa">
        <option value="">— Sin asignar —</option>
        ${casas.map(c => `<option value="${c.name}" ${line.casa === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <label>Categoría</label>
      <select id="drawer-cat" onchange="BudgetGrid.updateSubcatOptions()">
        <option value="">— Sin asignar —</option>
        ${catKeys.map(c => `<option value="${c}" ${line.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <label>Subcategoría</label>
      <select id="drawer-subcat">
        <option value="">— Sin asignar —</option>
        ${subcats.map(s => `<option value="${s}" ${line.subcategoria === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label>Cadencia</label>
      <select id="drawer-cadence">
        ${['variable','monthly','quarterly','annual','one-off'].map(c => `<option value="${c}" ${line.cadence === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <div class="drawer-actions">
        <button class="btn-cancel" onclick="this.closest('.budget-drawer-overlay').remove()">Cancelar</button>
        <button class="btn-save" onclick="BudgetGrid.saveDrawer('${line.id}')">Guardar</button>
      </div>
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}'); this.closest('.budget-drawer-overlay').remove();">Eliminar línea</button>
    </div>`;

    document.body.appendChild(overlay);
  },

  updateSubcatOptions() {
    const catSel = document.getElementById('drawer-cat');
    const subSel = document.getElementById('drawer-subcat');
    if (!catSel || !subSel) return;
    const cats = AppState.config ? AppState.config.categorias : {};
    const subs = cats[catSel.value] || [];
    subSel.innerHTML = '<option value="">— Sin asignar —</option>' +
      subs.map(s => `<option value="${s}">${s}</option>`).join('');
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    const concepto = document.getElementById('drawer-concepto').value;
    const casa = document.getElementById('drawer-casa').value;
    const cat = document.getElementById('drawer-cat').value;
    const subcat = document.getElementById('drawer-subcat').value;
    const cadence = document.getElementById('drawer-cadence').value;
    const now = new Date().toISOString();

    // Update sheet: E=5(concepto), F=6(casa), G=7(cat), H=8(subcat), I=9(cadence), AL=38(updated_at)
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: line.sheetRow, col: 5, value: concepto },
      { row: line.sheetRow, col: 6, value: casa },
      { row: line.sheetRow, col: 7, value: cat },
      { row: line.sheetRow, col: 8, value: subcat },
      { row: line.sheetRow, col: 9, value: cadence },
      { row: line.sheetRow, col: 38, value: now }
    ]);

    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  importCardExtract() {
    // Placeholder — will be fully built in Phase 2C
    alert('Importar extracto de tarjeta — disponible en próxima versión.\nPor ahora, añade movimientos manualmente con "+ Añadir".');
  }
};
