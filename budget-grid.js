/**
 * Budget Grid Engine v2.0 — Phase 2B
 * 
 * Changes from v1:
 * - Action buttons (+ Añadir, + Extracto) moved to frozen left panel after each section
 * - Removed action buttons from scrollable right area
 * - Tab navigation between cells
 * - Improved inline editing (Enter → next row, Tab → next cell)
 * - Card extract import drawer (tarjeta + mes + file upload)
 * - Delete row via ✕ button on hover (sticky right column removed, delete in drawer only)
 */

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const BudgetGrid = {
  accounts: [],
  lines: [],
  summaries: [],
  activeBank: null,
  collapsedCards: {},

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    if (this.accounts.length > 0 && !this.activeBank) {
      this.activeBank = this.accounts[0].name;
    }
    this.render();
  },

  async refresh() {
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this.render();
  },

  getBankLines() {
    const bankLines = this.lines.filter(l => l.bank === this.activeBank);
    return {
      gastos: bankLines.filter(l => l.section === 'GASTOS').sort((a,b) => a.sortOrder - b.sortOrder),
      tarjetas: bankLines.filter(l => l.section === 'TARJETAS').sort((a,b) => a.sortOrder - b.sortOrder),
      ingresos: bankLines.filter(l => l.section === 'INGRESOS').sort((a,b) => a.sortOrder - b.sortOrder)
    };
  },

  render() {
    const container = document.getElementById('budget-content');
    if (!container) return;

    if (this.accounts.length === 0) {
      container.innerHTML = `<div style="padding:60px 40px; text-align:center;">
        <div style="font-size:40px; margin-bottom:16px;">📋</div>
        <p style="font-size:18px; font-weight:600; color:var(--text-primary); margin-bottom:8px;">No hay bancos configurados</p>
        <p style="color:var(--text-secondary);">Ve a <a href="#" onclick="navigateTo('settings'); return false;" style="color:var(--accent); font-weight:600;">Ajustes → Bancos</a> para añadir tu primer banco.</p>
      </div>`;
      return;
    }

    const { gastos, tarjetas, ingresos } = this.getBankLines();
    const cm = AppState.currentMonth - 1;
    const account = this.accounts.find(a => a.name === this.activeBank);
    const summaryList = this.summaries.filter(s => s.bank === this.activeBank);
    const uncatCount = [...gastos, ...tarjetas, ...ingresos].filter(l => !l.casa && !l.categoria).length;

    let html = this.renderBankTabs(uncatCount);
    html += '<div class="budget-grid-wrap"><table class="budget-grid">';
    html += this.renderHeader(cm, summaryList);
    html += '<tbody>';

    // GASTOS section
    html += this.renderSectionHeader('GASTOS');
    html += this.renderLines(gastos, cm, summaryList);
    html += this.renderAddRow('GASTOS', '+ Añadir gasto');
    html += this.renderSectionTotal('Total Gastos', gastos, cm);

    // TARJETAS section
    html += this.renderSectionHeader('TARJETAS');
    html += this.renderLines(tarjetas, cm, summaryList);
    html += this.renderAddRow('TARJETAS', '+ Añadir movimiento');
    html += this.renderAddExtractRow();
    html += this.renderSectionTotal('Total Tarjetas', tarjetas, cm);

    // INGRESOS section
    html += this.renderSectionHeader('INGRESOS');
    html += this.renderLines(ingresos, cm, summaryList);
    html += this.renderAddRow('INGRESOS', '+ Añadir ingreso');
    html += this.renderSectionTotal('Total Ingresos', ingresos, cm);

    // RESUMEN
    html += this.renderSummaryRows(gastos, tarjetas, ingresos, cm, account, summaryList);

    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  // ======================== RENDER PARTS ========================

  renderBankTabs(uncatCount) {
    let tabs = `<div class="budget-bank-tabs">${this.accounts.map(a =>
      `<button class="budget-bank-tab ${a.name === this.activeBank ? 'active' : ''}" 
        onclick="BudgetGrid.switchBank('${a.name.replace(/'/g,"\\'")}')">
        ${a.name}
      </button>`
    ).join('')}`;
    if (uncatCount > 0) {
      tabs += `<span style="margin-left:auto; padding:6px 14px; font-size:12px; font-weight:600; color:var(--danger); background:var(--danger-light); border-radius:20px;">${uncatCount} sin categorizar</span>`;
    }
    tabs += '</div>';
    return tabs;
  },

  renderHeader(cm, summaryList) {
    let h1 = '<thead><tr><th class="th-concept">Concepto</th>';
    let h2 = '<tr class="sub-header"><th class="th-concept"></th>';
    for (let m = 0; m < 12; m++) {
      const isCurrent = m === cm;
      const summ = summaryList.find(s => s.month === m + 1);
      const isClosed = summ && summ.mesCerrado;
      const cls = isCurrent ? 'th-current-month' : (isClosed ? 'th-closed-month' : '');
      h1 += `<th class="th-month ${cls}" colspan="2">${MONTHS[m]}</th>`;
      h2 += `<th class="th-plan ${cls}">Plan</th><th class="th-real ${cls}">Real</th>`;
    }
    h1 += '</tr>';
    h2 += '</tr></thead>';
    return h1 + h2;
  },

  renderSectionHeader(sectionName) {
    return `<tr class="bg-section-header"><td class="td-concept td-section-label">${sectionName}</td>${this.emptyMonthCells('bg-section-cell')}</tr>`;
  },

  renderLines(lines, cm, summaryList) {
    if (lines.length === 0) return '';
    let html = '';
    lines.forEach((line, idx) => {
      const isUncat = !line.casa && !line.categoria;
      html += `<tr class="${isUncat ? 'uncategorized' : ''}" data-line-id="${line.id}">`;
      html += `<td class="td-concept" ondblclick="BudgetGrid.openDrawer('${line.id}')" title="${this.escHtml(line.concepto)}${isUncat ? '\nSin categorizar — doble click para asignar' : ''}">
        <span class="concept-text">${this.escHtml(line.concepto) || '(vacío)'}</span>
      </td>`;
      for (let m = 0; m < 12; m++) {
        const isCurrent = m === cm;
        const summ = summaryList.find(s => s.month === m + 1);
        const isClosed = summ && summ.mesCerrado;
        const cls = isCurrent ? 'td-current-month' : (isClosed ? 'td-closed-month' : '');
        const pv = line.plan[m];
        const rv = line.real[m];
        const rCls = rv > 0 && pv > 0 ? (rv > pv ? 'val-over' : (rv < pv ? 'val-under' : '')) : '';

        html += `<td class="editable ${cls}" data-lid="${line.id}" data-type="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this.fmtVal(pv)}</td>`;
        html += `<td class="editable ${cls} ${rCls}" data-lid="${line.id}" data-type="real" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this.fmtVal(rv)}</td>`;
      }
      html += '</tr>';
    });
    return html;
  },

  renderAddRow(section, label) {
    return `<tr class="bg-add-row">
      <td class="td-concept td-add-btn" onclick="BudgetGrid.addLine('${section}')">
        <span class="add-row-label">${label}</span>
      </td>${this.emptyMonthCells('')}
    </tr>`;
  },

  renderAddExtractRow() {
    return `<tr class="bg-add-row">
      <td class="td-concept td-add-btn td-add-extract" onclick="BudgetGrid.openImportCardDrawer()">
        <span class="add-row-label" style="color:#6366f1;">+ Importar extracto tarjeta</span>
      </td>${this.emptyMonthCells('')}
    </tr>`;
  },

  renderSectionTotal(label, lines, cm) {
    let html = `<tr class="bg-total-row"><td class="td-concept td-total-label">${label}</td>`;
    for (let m = 0; m < 12; m++) {
      const cls = m === cm ? 'td-current-month' : '';
      const pt = lines.reduce((s, l) => s + (l.plan[m] || 0), 0);
      const rt = lines.reduce((s, l) => s + (l.real[m] || 0), 0);
      html += `<td class="td-total ${cls}">${this.fmtVal(pt, true)}</td>`;
      html += `<td class="td-total ${cls}">${this.fmtVal(rt, true)}</td>`;
    }
    html += '</tr>';
    return html;
  },

  renderSummaryRows(gastos, tarjetas, ingresos, cm, account, summaryList) {
    const tMin = account ? account.targetMinBalance : 0;

    let html = `<tr class="bg-section-header"><td class="td-concept td-section-label" style="border-left-color:#0ea5e9;">RESUMEN${tMin > 0 ? ` · Mín: ${tMin.toLocaleString('es-ES')}€` : ''}</td>${this.emptyMonthCells('bg-section-cell')}</tr>`;

    const rows = { gastosT: [], ingresosT: [], cashflow: [], envio: [] };
    let prevSaldo = 0;
    const fs = summaryList.find(s => s.month === 1);
    if (fs) prevSaldo = fs.saldoInicio;

    for (let m = 0; m < 12; m++) {
      const gP = gastos.reduce((s, l) => s + (l.plan[m] || 0), 0) + tarjetas.reduce((s, l) => s + (l.plan[m] || 0), 0);
      const gR = gastos.reduce((s, l) => s + (l.real[m] || 0), 0) + tarjetas.reduce((s, l) => s + (l.real[m] || 0), 0);
      const iP = ingresos.reduce((s, l) => s + (l.plan[m] || 0), 0);
      const iR = ingresos.reduce((s, l) => s + (l.real[m] || 0), 0);
      rows.gastosT.push([gP, gR]);
      rows.ingresosT.push([iP, iR]);
      rows.cashflow.push([iP - gP, iR - gR]);
      rows.envio.push([Math.max(0, gP - iP - prevSaldo + tMin), Math.max(0, gR - iR - prevSaldo + tMin)]);
    }

    const defs = [
      { label: 'Total Gastos+Tarjetas', data: rows.gastosT },
      { label: 'Total Ingresos', data: rows.ingresosT },
      { label: 'Cashflow Neto', data: rows.cashflow, colorize: true },
      { label: 'Envío Necesario', data: rows.envio, highlight: true }
    ];

    defs.forEach(d => {
      html += `<tr class="bg-summary-row"><td class="td-concept td-summary-label">${d.label}</td>`;
      for (let m = 0; m < 12; m++) {
        const cls = m === cm ? 'td-current-month' : '';
        const [p, r] = d.data[m];
        let pStyle = '';
        if (d.colorize) pStyle = p < 0 ? 'color:var(--danger);' : 'color:var(--success);';
        if (d.highlight && p > 0) pStyle = 'color:var(--danger); font-weight:700;';
        html += `<td class="td-summary ${cls}" style="${pStyle}">${p ? p.toLocaleString('es-ES', {minimumFractionDigits:2}) : '-'}</td>`;
        html += `<td class="td-summary ${cls}">${r ? r.toLocaleString('es-ES', {minimumFractionDigits:2}) : '-'}</td>`;
      }
      html += '</tr>';
    });
    return html;
  },

  // ======================== HELPERS ========================

  emptyMonthCells(cls) {
    let h = '';
    for (let m = 0; m < 12; m++) h += `<td class="${cls}"></td><td class="${cls}"></td>`;
    return h;
  },

  fmtVal(v, forceDecimals) {
    if (!v) return '';
    return v.toLocaleString('es-ES', { minimumFractionDigits: forceDecimals ? 2 : 0, maximumFractionDigits: 2 });
  },

  escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  },

  // ======================== INTERACTIONS ========================

  switchBank(bankName) {
    this.activeBank = bankName;
    this.render();
  },

  editCell(td) {
    if (td.classList.contains('editing')) return;
    const lineId = td.dataset.lid;
    const type = td.dataset.type;
    const monthIdx = parseInt(td.dataset.m);
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    const currentVal = type === 'plan' ? line.plan[monthIdx] : line.real[monthIdx];
    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${currentVal || ''}">`;
    const input = td.querySelector('input');
    input.focus();
    input.select();

    input.addEventListener('blur', () => this.commitCell(td, input, lineId, type, monthIdx));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); this.moveToNextRow(td); }
      else if (e.key === 'Tab') { e.preventDefault(); input.blur(); this.moveToNextCell(td, e.shiftKey); }
      else if (e.key === 'Escape') { e.preventDefault(); input.dataset.cancel = '1'; input.blur(); }
    });
  },

  async commitCell(td, input, lineId, type, monthIdx) {
    if (input.dataset.cancel === '1') {
      this.render(); // Re-render restores original
      return;
    }
    const newVal = parseFloat(input.value) || 0;
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    if (type === 'plan') {
      line.plan[monthIdx] = newVal;
      await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getPlanCol(monthIdx), newVal);
    } else {
      line.real[monthIdx] = newVal;
      await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getRealCol(monthIdx), newVal);
    }
    this.render();
  },

  moveToNextRow(td) {
    const tr = td.closest('tr');
    const nextTr = tr.nextElementSibling;
    if (!nextTr) return;
    const colIdx = Array.from(tr.children).indexOf(td);
    const nextTd = nextTr.children[colIdx];
    if (nextTd && nextTd.classList.contains('editable')) {
      setTimeout(() => nextTd.click(), 50);
    }
  },

  moveToNextCell(td, reverse) {
    const tr = td.closest('tr');
    const cells = Array.from(tr.querySelectorAll('td.editable'));
    const idx = cells.indexOf(td);
    const nextIdx = reverse ? idx - 1 : idx + 1;
    if (nextIdx >= 0 && nextIdx < cells.length) {
      setTimeout(() => cells[nextIdx].click(), 50);
    }
  },

  async addLine(section) {
    const concepto = prompt(`Nuevo concepto (${section}):`);
    if (!concepto || !concepto.trim()) return;
    await BudgetLogic.addBudgetLine(this.activeBank, AppState.currentYear, section, concepto.trim());
    await this.refresh();
  },

  async deleteLine(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    if (!confirm(`¿Eliminar "${line.concepto}"?`)) return;
    await BudgetLogic.deleteBudgetLine(line.sheetRow);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ======================== DRAWER — Edit line metadata ========================

  openDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const cats = AppState.config ? AppState.config.categorias : {};
    const casas = AppState.config ? AppState.config.casas : [];
    const catKeys = Object.keys(cats);
    const subcats = line.categoria && cats[line.categoria] ? cats[line.categoria] : [];

    const overlay = document.createElement('div');
    overlay.className = 'budget-drawer-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `<div class="budget-drawer">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="margin:0;">Editar Línea</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-secondary);">✕</button>
      </div>
      <label>Concepto</label>
      <input id="drawer-concepto" value="${this.escHtml(line.concepto || '')}">
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
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}')">Eliminar esta línea</button>
    </div>`;

    document.body.appendChild(overlay);
  },

  updateSubcatOptions() {
    const catSel = document.getElementById('drawer-cat');
    const subSel = document.getElementById('drawer-subcat');
    if (!catSel || !subSel) return;
    const cats = AppState.config ? AppState.config.categorias : {};
    const subs = cats[catSel.value] || [];
    subSel.innerHTML = '<option value="">— Sin asignar —</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join('');
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const now = new Date().toISOString();
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: line.sheetRow, col: 5, value: document.getElementById('drawer-concepto').value },
      { row: line.sheetRow, col: 6, value: document.getElementById('drawer-casa').value },
      { row: line.sheetRow, col: 7, value: document.getElementById('drawer-cat').value },
      { row: line.sheetRow, col: 8, value: document.getElementById('drawer-subcat').value },
      { row: line.sheetRow, col: 9, value: document.getElementById('drawer-cadence').value },
      { row: line.sheetRow, col: 38, value: now }
    ]);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ======================== DRAWER — Import card extract ========================

  openImportCardDrawer() {
    const tarjetas = AppState.config ? AppState.config.tarjetas : [];
    const overlay = document.createElement('div');
    overlay.className = 'budget-drawer-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `<div class="budget-drawer">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="margin:0;">Importar Extracto Tarjeta</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-secondary);">✕</button>
      </div>
      <label>Tarjeta</label>
      <select id="import-card-name">
        ${tarjetas.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
        ${tarjetas.length === 0 ? '<option value="">— No hay tarjetas configuradas —</option>' : ''}
      </select>
      <label>Mes</label>
      <select id="import-card-month">
        ${MONTHS_FULL.slice(1).map((m,i) => `<option value="${i+1}" ${i+1 === AppState.currentMonth ? 'selected' : ''}>${m} ${AppState.currentYear}</option>`).join('')}
      </select>
      <label style="margin-top:20px;">Archivo (CSV, HTML, XLSX)</label>
      <div class="import-dropzone" id="card-dropzone" onclick="document.getElementById('card-file-input').click()" style="padding:24px 16px; margin-top:8px;">
        <div style="font-size:32px; margin-bottom:8px;">📁</div>
        <div style="font-size:13px; font-weight:600; color:var(--text-primary);">Arrastra o haz clic</div>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">CSV · HTML · XLSX</div>
        <input type="file" id="card-file-input" accept=".csv,.html,.htm,.xls,.xlsx" style="display:none" onchange="BudgetGrid.handleCardFile(this)">
      </div>
      <div id="card-import-preview" style="margin-top:16px;"></div>
      <div id="card-import-actions" style="display:none; margin-top:16px;">
        <button class="btn-save" onclick="BudgetGrid.confirmCardImport()" style="width:100%;">Importar movimientos</button>
      </div>
    </div>`;

    document.body.appendChild(overlay);

    // Drag & drop
    const dz = document.getElementById('card-dropzone');
    if (dz) {
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault(); dz.classList.remove('dragover');
        if (e.dataTransfer.files.length) BudgetGrid.processCardFile(e.dataTransfer.files[0]);
      });
    }
  },

  _cardImportRows: [],

  handleCardFile(input) {
    if (input.files.length) this.processCardFile(input.files[0]);
  },

  async processCardFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const preview = document.getElementById('card-import-preview');
    const actions = document.getElementById('card-import-actions');
    preview.innerHTML = '<div style="color:var(--text-secondary); font-size:12px;">Procesando...</div>';

    try {
      let rows = [];
      if (ext === 'csv') rows = await parseCSV(file);
      else if (ext === 'html' || ext === 'htm') rows = await parseHTML(file);
      else if (ext === 'xlsx' || ext === 'xls') rows = await parseXLSX(file);
      else { preview.innerHTML = '<div style="color:var(--danger);">Formato no soportado</div>'; return; }

      this._cardImportRows = rows;
      if (rows.length <= 1) { preview.innerHTML = '<div style="color:var(--text-secondary);">Sin datos</div>'; return; }

      const header = rows[0];
      const data = rows.slice(1, 8); // Max 7 preview rows
      preview.innerHTML = `<div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">${rows.length - 1} movimientos encontrados</div>
        <div style="overflow-x:auto; border:1px solid var(--border-light); border-radius:6px; max-height:200px; overflow-y:auto;">
        <table class="import-preview-table">
          <thead><tr>${header.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${data.map(r => `<tr>${r.map(c => `<td>${c || ''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
      if (actions) actions.style.display = 'block';
    } catch (e) {
      preview.innerHTML = `<div style="color:var(--danger);">Error: ${e.message}</div>`;
    }
  },

  async confirmCardImport() {
    const rows = this._cardImportRows;
    if (!rows || rows.length <= 1) return;
    const cardName = document.getElementById('import-card-name').value;
    const month = parseInt(document.getElementById('import-card-month').value);
    const preview = document.getElementById('card-import-preview');

    if (!cardName) { alert('Selecciona una tarjeta'); return; }

    preview.innerHTML = '<div style="color:var(--text-secondary); font-size:12px;">Importando...</div>';

    try {
      const now = new Date().toISOString();
      const monthIdx = month - 1;
      let count = 0;

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        // Try to extract concepto and amount from the row
        // Common formats: [date, concepto, amount] or [concepto, amount] etc.
        let concepto = '', amount = 0;
        
        if (r.length >= 3) {
          // Assume: col 0=date, col 1=concepto, last numeric col = amount
          concepto = r[1] || r[0] || '';
          for (let j = r.length - 1; j >= 0; j--) {
            const parsed = parseFloat(String(r[j]).replace(',', '.').replace(/[^\d.-]/g, ''));
            if (!isNaN(parsed) && parsed !== 0) { amount = Math.abs(parsed); break; }
          }
        } else if (r.length === 2) {
          concepto = r[0] || '';
          amount = Math.abs(parseFloat(String(r[1]).replace(',', '.').replace(/[^\d.-]/g, '')) || 0);
        }

        if (!concepto && !amount) continue;
        const label = `${cardName}: ${concepto}`.substring(0, 80);

        // Create budget line with the real value in the corresponding month
        const id = BudgetLogic.generateId('BL');
        const planArr = new Array(12).fill(0);
        const realArr = new Array(12).fill(0);
        realArr[monthIdx] = amount;

        const row = [id, this.activeBank, AppState.currentYear, 'TARJETAS', label,
          '', '', '', 'one-off',
          ...planArr, ...realArr,
          'FALSE', 999, 'ACTIVE', now, now
        ];
        await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, row);
        count++;
      }

      preview.innerHTML = `<div style="color:var(--success); font-weight:600; padding:8px; background:var(--success-light); border-radius:6px;">✅ ${count} movimientos importados como ${cardName}</div>`;
      document.getElementById('card-import-actions').style.display = 'none';
      this._cardImportRows = [];

      // Refresh grid after short delay
      setTimeout(() => {
        document.querySelector('.budget-drawer-overlay')?.remove();
        this.refresh();
      }, 1500);
    } catch (e) {
      preview.innerHTML = `<div style="color:var(--danger);">Error: ${e.message}</div>`;
    }
  }
};
