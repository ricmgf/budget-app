/**
 * Budget Grid v6.0 — All fixes applied
 * Does NOT touch bootstrap/auth
 */
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const BudgetGrid = {
  accounts: [], lines: [], summaries: [], activeBank: null,
  bankMeta: {},

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    await BudgetLogic.loadRules();
    this._buildMeta();
    if (this.accounts.length > 0 && !this.activeBank) this.activeBank = this.accounts[0].name;
    this.render();
  },

  async refresh() {
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this._buildMeta();
    this.render();
  },

  _buildMeta() {
    this.bankMeta = {};
    this.accounts.forEach(a => {
      const buf = new Array(12).fill(0), sal = new Array(12).fill(0), closed = new Array(12).fill(false);
      this.summaries.filter(s => s.bank === a.name).forEach(s => {
        buf[s.month - 1] = s.buffer || 0;
        sal[s.month - 1] = s.saldoCuenta || 0;
        closed[s.month - 1] = !!s.mesCerrado;
      });
      this.bankMeta[a.name] = { buffer: buf, saldo: sal, closed };
    });
  },

  render() {
    const ct = document.getElementById('budget-content');
    if (!ct) return;
    if (!this.accounts.length) { ct.innerHTML = '<div style="padding:60px;text-align:center;"><p style="font-size:18px;font-weight:600;">No hay bancos configurados</p><p style="color:var(--text-secondary);">Ve a <a href="#" onclick="navigateTo(\'settings\');return false;" style="color:var(--accent);">Ajustes → Bancos</a></p></div>'; return; }

    const bk = this.lines.filter(l => l.bank === this.activeBank);
    const G = bk.filter(l => l.section === 'GASTOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const T = bk.filter(l => l.section === 'TARJETAS').sort((a,b) => a.sortOrder - b.sortOrder);
    const I = bk.filter(l => l.section === 'INGRESOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const cm = AppState.currentMonth - 1;
    const acc = this.accounts.find(a => a.name === this.activeBank);
    const sl = this.summaries.filter(s => s.bank === this.activeBank);
    const unc = [...G,...T,...I].filter(l => !l.casa && !l.categoria).length;

    let h = this._tabs(unc);
    h += '<div class="budget-grid-wrap"><table class="budget-grid">';
    h += this._thead(cm);
    h += '<tbody>';
    h += this._secHdr('GASTOS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('GASTOS')">+ gasto</a> · <a onclick="BudgetGrid.openImportDrawer('banco')">+ extracto</a></span>`);
    h += this._rows(G, cm);
    h += this._totRow('Total Gastos', G, cm);
    h += this._secHdr('TARJETAS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('TARJETAS')">+ manual</a> · <a onclick="BudgetGrid.openImportDrawer('tarjeta')">+ extracto</a></span>`);
    h += this._rows(T, cm);
    h += this._totRow('Total Tarjetas', T, cm);
    h += this._secHdr('INGRESOS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('INGRESOS')">+ ingreso</a></span>`);
    h += this._rows(I, cm);
    h += this._totRow('Total Ingresos', I, cm);
    h += this._summaryBlock(G, T, I, cm, acc);
    h += '</tbody></table></div>';
    ct.innerHTML = h;
  },

  _tabs(unc) {
    let h = '<div class="budget-bank-tabs">';
    this.accounts.forEach(a => { h += `<button class="budget-bank-tab ${a.name===this.activeBank?'active':''}" onclick="BudgetGrid.switchBank('${this._e(a.name)}')">${a.name}</button>`; });
    if (unc > 0) h += `<span class="uncat-badge" onclick="BudgetGrid._scrollUncat()">${unc} sin categorizar</span>`;
    return h + '</div>';
  },

  _thead(cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let r1 = '<thead><tr><th class="th-left"></th>';
    let r2 = '<tr class="sub-hdr"><th class="th-left"></th>';
    for (let m = 0; m < 12; m++) {
      const cur = m === cm, closed = meta.closed[m], past = m < cm;
      let cls = cur ? 'cur-hdr' : (closed ? 'closed-hdr' : (past && !closed ? 'unclosed-hdr' : ''));
      const icon = closed ? ' 🔒' : (past && !closed ? ' ⚠' : '');
      const click = past || cur ? ` onclick="BudgetGrid.toggleClose(${m+1})" style="cursor:pointer;" title="${closed?'Reabrir mes':'Cerrar/conciliar mes'}"` : '';
      r1 += `<th class="th-month ${cls}" colspan="2"${click}>${MONTHS[m]}${icon}</th>`;
      const subCls = cur ? 'cur-hdr' : (closed ? 'closed-hdr' : '');
      r2 += `<th class="${subCls}">Plan</th><th class="${subCls}">Real</th>`;
    }
    return r1 + '</tr>' + r2 + '</tr></thead>';
  },

  _secHdr(name, actions) {
    return `<tr class="bg-section-hdr"><td class="frozen"><span class="sec-name">${name}</span>${actions||''}</td>${this._ec('sec-cell')}</tr>`;
  },

  _rows(lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let h = '';
    lines.forEach(line => {
      const uc = !line.casa && !line.categoria;
      const autoTag = (!uc && line.cadence === 'one-off' && BudgetLogic.findRule(line.concepto, this.activeBank)) ? '<span class="auto-tag">⚡</span>' : '';
      h += `<tr class="${uc?'uncat':''}" data-lid="${line.id}">`;
      h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${line.id}')" title="${this._e(line.concepto)}${uc?'\n⚠ Sin categorizar — doble clic para asignar':''}">${autoTag}${this._e(line.concepto)||'(vacío)'}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
        const pv = line.plan[m], rv = line.real[m];
        const rc = rv > 0 && pv > 0 ? (rv > pv ? 'val-neg' : (rv < pv ? 'val-pos' : '')) : '';
        h += `<td class="editable ${c}" data-lid="${line.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(pv)}</td>`;
        h += `<td class="editable ${c} ${rc}" data-lid="${line.id}" data-t="real" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(rv)}</td>`;
      }
      h += '</tr>';
    });
    return h;
  },

  _totRow(label, lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let h = `<tr class="bg-total"><td class="frozen"><strong>${label}</strong></td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      h += `<td class="${c}">${this._f(lines.reduce((s,l)=>s+(l.plan[m]||0),0),1)}</td>`;
      h += `<td class="${c}">${this._f(lines.reduce((s,l)=>s+(l.real[m]||0),0),1)}</td>`;
    }
    return h + '</tr>';
  },

  _summaryBlock(G, T, I, cm, acc) {
    const meta = this.bankMeta[this.activeBank] || { buffer: new Array(12).fill(0), saldo: new Array(12).fill(0), closed: new Array(12).fill(false) };
    let h = `<tr class="bg-section-hdr"><td class="frozen" style="border-left-color:#0ea5e9;">RESUMEN</td>${this._ec('sec-cell')}</tr>`;

    const d = [];
    for (let m = 0; m < 12; m++) {
      const gasP = G.reduce((s,l)=>s+(l.plan[m]||0),0);
      const gasR = G.reduce((s,l)=>s+(l.real[m]||0),0);
      const tarP = T.reduce((s,l)=>s+(l.plan[m]||0),0);
      const tarR = T.reduce((s,l)=>s+(l.real[m]||0),0);
      const totP = gasP + tarP, totR = gasR + tarR;
      const iP = I.reduce((s,l)=>s+(l.plan[m]||0),0);
      const iR = I.reduce((s,l)=>s+(l.real[m]||0),0);
      const cf = iP - totP, cfR = iR - totR;
      const buf = meta.buffer[m] || 0, sal = meta.saldo[m] || 0;
      const nextTotP = m < 11 ? (G.reduce((s,l)=>s+(l.plan[m+1]||0),0) + T.reduce((s,l)=>s+(l.plan[m+1]||0),0)) : 0;
      const envio = Math.max(0, nextTotP + tarR + buf - sal);
      d.push({ gasP, gasR, tarP, tarR, totP, totR, iP, iR, cf, cfR, buf, sal, envio });
    }

    const sRow = (label, kP, kR, opts={}) => {
      const { sign, bold, color, cls } = opts;
      let r = `<tr class="bg-summ ${cls||''}"><td class="frozen">${sign?`<span class="formula-sign">${sign}</span>`:''}${bold?`<strong>${label}</strong>`:label}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
        const pv = d[m][kP], rv = d[m][kR];
        let sP = '', sR = '';
        if (color) { sP = pv < 0 ? 'val-neg' : (pv > 0 ? 'val-pos' : ''); sR = rv < 0 ? 'val-neg' : (rv > 0 ? 'val-pos' : ''); }
        r += `<td class="${c} ${sP}">${this._f(pv,1)}</td><td class="${c} ${sR}">${this._f(rv,1)}</td>`;
      }
      return r + '</tr>';
    };

    h += sRow('Gastos', 'gasP', 'gasR', { sign: '−' });
    h += sRow('Tarjetas', 'tarP', 'tarR', { sign: '+' });
    h += sRow('Total Gastos', 'totP', 'totR', { bold: true, sign: '=' });
    h += sRow('Ingresos', 'iP', 'iR');
    h += sRow('Cashflow', 'cf', 'cfR', { bold: true, sign: '=', color: true });

    // Buffer (editable in Plan col, mirrored in Real)
    h += `<tr class="bg-summ"><td class="frozen"><span class="formula-sign">+</span>Buffer</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const v = d[m].buf, disp = v ? this._f(v,1) : '—';
      h += `<td class="editable ${c}" data-meta="buffer" data-m="${m}" onclick="BudgetGrid.editMeta(this)" style="color:#7c3aed;">${disp}</td>`;
      h += `<td class="${c}" style="color:#7c3aed;">${disp}</td>`;
    }
    h += '</tr>';

    // Saldo en Cuenta (editable in Real col, mirrored in Plan)
    h += `<tr class="bg-summ"><td class="frozen"><span class="formula-sign">−</span>Saldo en Cuenta</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const v = d[m].sal, disp = v ? this._f(v,1) : '—';
      h += `<td class="${c}" style="color:#0ea5e9;">${disp}</td>`;
      h += `<td class="editable ${c}" data-meta="saldo" data-m="${m}" onclick="BudgetGrid.editMeta(this)" style="color:#0ea5e9;">${disp}</td>`;
    }
    h += '</tr>';

    // Envío Necesario — dark band, value in REAL column only
    h += `<tr class="bg-envio"><td class="frozen">💰 ENVÍO NECESARIO</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : '';
      h += `<td class="${c}"></td><td class="${c}" style="font-weight:800;">${this._f(d[m].envio,1)}</td>`;
    }
    h += '</tr>';
    return h;
  },

  // ══════════ FORMAT / UTIL ══════════

  _f(v, force) {
    if (v == null || v === '') return '';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '';
    if (n === 0 && !force) return '';
    const parts = Math.abs(n).toFixed(2).split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-' : '') + int + ',' + parts[1];
  },
  _e(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; },
  _ec(cls) { let h=''; for(let i=0;i<24;i++) h+=`<td class="${cls}"></td>`; return h; },

  // ══════════ CELL EDITING ══════════

  editCell(td) {
    if (td.classList.contains('editing')) return;
    const lid = td.dataset.lid, type = td.dataset.t, m = parseInt(td.dataset.m);
    const line = this.lines.find(l => l.id === lid);
    if (!line) return;
    const val = type === 'plan' ? line.plan[m] : line.real[m];
    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${val || ''}">`;
    const inp = td.querySelector('input');
    inp.focus(); inp.select();
    let committed = false;
    const doCommit = async () => {
      if (committed) return; committed = true;
      if (inp.dataset.cancel === '1') { this.render(); return; }
      const nv = parseFloat(inp.value) || 0;
      if (type === 'plan') { line.plan[m] = nv; await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getPlanCol(m), nv); }
      else { line.real[m] = nv; await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getRealCol(m), nv); }
      this.render();
    };
    inp.addEventListener('blur', doCommit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doCommit().then(() => this._nav(td, 'down')); }
      else if (e.key === 'Tab') { e.preventDefault(); doCommit().then(() => this._nav(td, e.shiftKey ? 'left' : 'right')); }
      else if (e.key === 'Escape') { e.preventDefault(); inp.dataset.cancel = '1'; inp.blur(); }
    });
  },

  editMeta(td) {
    if (td.classList.contains('editing')) return;
    const field = td.dataset.meta, m = parseInt(td.dataset.m);
    const meta = this.bankMeta[this.activeBank];
    const val = field === 'buffer' ? meta.buffer[m] : meta.saldo[m];
    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${val || ''}">`;
    const inp = td.querySelector('input');
    inp.focus(); inp.select();
    let committed = false;
    const doCommit = async () => {
      if (committed) return; committed = true;
      if (inp.dataset.cancel === '1') { this.render(); return; }
      const nv = parseFloat(inp.value) || 0;
      if (field === 'buffer') meta.buffer[m] = nv; else meta.saldo[m] = nv;
      await this._saveBankMeta(m, field, nv);
      this.render();
    };
    inp.addEventListener('blur', doCommit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); doCommit(); }
      else if (e.key === 'Escape') { e.preventDefault(); inp.dataset.cancel = '1'; inp.blur(); }
    });
  },

  async _saveBankMeta(month, field, value) {
    const summ = this.summaries.find(s => s.bank === this.activeBank && s.month === month + 1);
    if (summ) {
      const col = field === 'buffer' ? 16 : 17;
      await SheetsAPI.updateCell(CONFIG.SHEETS.BANK_SUMMARY, summ.sheetRow, col, value);
    } else {
      const id = BudgetLogic.generateId('BMS');
      const now = new Date().toISOString();
      const row = [id, this.activeBank, AppState.currentYear, month + 1, 0,0,0,0,0,0,0,0,0, 'FALSE', now, field==='buffer'?value:0, field==='saldo'?value:0];
      await SheetsAPI.appendRow(CONFIG.SHEETS.BANK_SUMMARY, row);
      await this.refresh();
    }
  },

  _nav(td, dir) {
    setTimeout(() => {
      let sel = null;
      if (dir === 'down') { const tr = td.closest('tr'), next = tr?.nextElementSibling; if (next) { sel = next.children[Array.from(tr.children).indexOf(td)]; } }
      else if (dir === 'right') { sel = td.nextElementSibling; if (sel && !sel.classList.contains('editable')) sel = sel.nextElementSibling; }
      else if (dir === 'left') { sel = td.previousElementSibling; if (sel && !sel.classList.contains('editable')) sel = sel.previousElementSibling; }
      if (sel && sel.classList.contains('editable')) sel.click();
    }, 80);
  },

  // ══════════ ACTIONS ══════════

  switchBank(name) { this.activeBank = name; this.render(); },

  async addLine(section) {
    const concepto = prompt(`Nuevo concepto (${section}):`);
    if (!concepto?.trim()) return;
    await BudgetLogic.addBudgetLine(this.activeBank, AppState.currentYear, section, concepto.trim());
    await this.refresh();
  },

  async deleteLine(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line || !confirm(`¿Eliminar "${line.concepto}"?`)) return;
    await BudgetLogic.deleteBudgetLine(line.sheetRow);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  _scrollUncat() {
    const row = document.querySelector('tr.uncat');
    if (row) { row.scrollIntoView({ behavior:'smooth', block:'center' }); row.style.outline = '2px solid var(--danger)'; setTimeout(() => row.style.outline = '', 2000); }
  },

  async toggleClose(month) {
    const newVal = await BudgetLogic.toggleCloseMonth(this.activeBank, month);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this._buildMeta(); this.render();
    this._toast(newVal ? `${MONTHS_FULL[month]} cerrado 🔒` : `${MONTHS_FULL[month]} reabierto`);
  },

  _toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fbbf24;padding:10px 24px;border-radius:8px;font-weight:600;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
  },

  // ══════════ DRAWER: Edit ══════════

  openDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const cats = AppState.config?.categorias || {}, casas = AppState.config?.casas || [];
    const catKeys = Object.keys(cats);
    const subcats = line.categoria && cats[line.categoria] ? cats[line.categoria] : [];
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><h3 style="margin:0;">Editar Línea</h3><button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button></div>
      <label>Concepto</label><input id="dw-con" value="${this._e(line.concepto)}">
      <label>Casa</label><select id="dw-cas"><option value="">— Sin asignar —</option>${casas.map(c=>`<option value="${c.name}" ${line.casa===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
      <label>Categoría</label><select id="dw-cat" onchange="BudgetGrid._updSub()"><option value="">— Sin asignar —</option>${catKeys.map(c=>`<option value="${c}" ${line.categoria===c?'selected':''}>${c}</option>`).join('')}</select>
      <label>Subcategoría</label><select id="dw-sub"><option value="">— Sin asignar —</option>${subcats.map(s=>`<option value="${s}" ${line.subcategoria===s?'selected':''}>${s}</option>`).join('')}</select>
      <label>Cadencia</label><select id="dw-cad">${['variable','monthly','quarterly','annual','one-off'].map(c=>`<option value="${c}" ${line.cadence===c?'selected':''}>${c}</option>`).join('')}</select>
      <div class="drawer-actions"><button class="btn-cancel" onclick="this.closest('.budget-drawer-overlay').remove()">Cancelar</button><button class="btn-save" onclick="BudgetGrid.saveDrawer('${line.id}')">Guardar</button></div>
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}')">Eliminar línea</button>
    </div>`;
    document.body.appendChild(ov);
  },

  _updSub() {
    const c = document.getElementById('dw-cat'), s = document.getElementById('dw-sub');
    if (!c||!s) return;
    s.innerHTML = '<option value="">— Sin asignar —</option>' + ((AppState.config?.categorias||{})[c.value]||[]).map(o=>`<option value="${o}">${o}</option>`).join('');
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const con = document.getElementById('dw-con').value, cas = document.getElementById('dw-cas').value;
    const cat = document.getElementById('dw-cat').value, sub = document.getElementById('dw-sub').value;
    const cad = document.getElementById('dw-cad').value;
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: line.sheetRow, col: 5, value: con }, { row: line.sheetRow, col: 6, value: cas },
      { row: line.sheetRow, col: 7, value: cat }, { row: line.sheetRow, col: 8, value: sub },
      { row: line.sheetRow, col: 9, value: cad }, { row: line.sheetRow, col: 38, value: new Date().toISOString() }
    ]);
    if (cat && con.trim()) await BudgetLogic.createRule(con, this.activeBank, cas, cat, sub);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ══════════ IMPORT DRAWER ══════════

  openImportDrawer(type) {
    const tarjetas = AppState.config?.tarjetas || [];
    const isTarjeta = type === 'tarjeta';
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;">Importar ${isTarjeta ? 'Extracto Tarjeta' : 'Extracto Banco'}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      ${isTarjeta ? `<label>Tarjeta</label><select id="imp-card">${tarjetas.length ? tarjetas.map(t=>`<option value="${t.name}">${t.name}</option>`).join('') : '<option value="">— Sin tarjetas —</option>'}</select>` : ''}
      <label>Mes</label><select id="imp-month">${MONTHS_FULL.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===AppState.currentMonth?'selected':''}>${m} ${AppState.currentYear}</option>`).join('')}</select>
      <label style="margin-top:16px;">Archivo</label>
      <div class="import-dropzone" id="imp-dz" onclick="document.getElementById('imp-fi').click()" style="padding:24px 16px;margin-top:8px;">
        <div style="font-size:28px;margin-bottom:6px;">📁</div>
        <div style="font-size:13px;font-weight:600;">Arrastra o haz clic</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">CSV · HTML · XLSX</div>
        <input type="file" id="imp-fi" accept=".csv,.html,.htm,.xls,.xlsx" style="display:none" onchange="BudgetGrid._impFile(this,'${type}')">
      </div>
      <div id="imp-pv" style="margin-top:16px;"></div>
      <div id="imp-act" style="display:none;margin-top:16px;"><button class="btn-save" onclick="BudgetGrid._impConfirm('${type}')" style="width:100%;">Importar movimientos</button></div>
    </div>`;
    document.body.appendChild(ov);
    const dz = document.getElementById('imp-dz');
    if (dz) { dz.ondragover=e=>{e.preventDefault();dz.classList.add('dragover');}; dz.ondragleave=()=>dz.classList.remove('dragover'); dz.ondrop=e=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files.length)this._impProcess(e.dataTransfer.files[0],type);}; }
  },

  _impMovements: [],
  _impFile(input, type) { if (input.files.length) this._impProcess(input.files[0], type); },

  // ══════════ SMART PARSERS ══════════

  async _impProcess(file, type) {
    const ext = file.name.split('.').pop().toLowerCase();
    const pv = document.getElementById('imp-pv'), act = document.getElementById('imp-act');
    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Procesando archivo...</div>';
    try {
      let movements = [];
      if (ext === 'xlsx' || ext === 'xls') movements = await this._parseSmartXLSX(file);
      else if (ext === 'csv') movements = await this._parseGenericCSV(file);
      else if (ext === 'html' || ext === 'htm') movements = await this._parseGenericHTML(file);
      else { pv.innerHTML = '<div style="color:var(--danger);">Formato no soportado.</div>'; return; }

      this._impMovements = movements;
      if (!movements.length) { pv.innerHTML = '<div style="color:var(--text-secondary);">No se encontraron movimientos.</div>'; return; }

      const preview = movements.slice(0, 10);
      let tbl = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${movements.length} movimientos</div>`;
      tbl += `<div style="overflow-x:auto;border:1px solid var(--border-light);border-radius:6px;max-height:200px;overflow-y:auto;"><table class="import-preview-table"><thead><tr><th>Concepto</th><th style="text-align:right;">Importe</th></tr></thead><tbody>`;
      preview.forEach(mv => { tbl += `<tr><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._e(mv.concepto)}</td><td style="text-align:right;white-space:nowrap;">${this._f(mv.amount,1)}</td></tr>`; });
      if (movements.length > 10) tbl += `<tr><td colspan="2" style="text-align:center;color:var(--text-secondary);font-size:11px;">... y ${movements.length-10} más</td></tr>`;
      tbl += '</tbody></table></div>';
      pv.innerHTML = tbl;
      if (act) act.style.display = 'block';
    } catch (e) {
      console.error('Import error:', e);
      pv.innerHTML = `<div style="color:var(--danger);padding:8px;background:#fef2f2;border-radius:6px;">❌ Error: ${e.message}</div>`;
    }
  },

  async _parseSmartXLSX(file) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let format = 'generic';
    for (let i = 0; i < Math.min(rows.length, 35); i++) {
      const row = rows[i];
      if (!row) continue;
      const joined = row.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('OPERAZIONE') && joined.includes('IMPORTO')) { format = 'intessa'; break; }
      if (joined.includes('COMERCIO') && joined.includes('IMPORTE EUROS')) { format = 'iberia'; break; }
      if (joined.includes('FECHA OPERACIÓN')) { format = 'iberia'; break; }
    }

    if (format === 'intessa') return this._parseIntessa(rows);
    if (format === 'iberia') return this._parseIberia(rows);
    return this._parseGenericRows(rows);
  },

  _parseIntessa(rows) {
    let hdr = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].some(c => String(c||'').toUpperCase().includes('OPERAZIONE'))) { hdr = i; break; }
    }
    if (hdr < 0) return [];
    const mvs = [];
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 8) continue;
      const concepto = String(r[1] || '').trim();
      const amount = parseFloat(r[7]) || 0;
      if (!concepto || amount === 0) continue;
      mvs.push({ concepto: concepto.substring(0, 80), amount: Math.abs(amount), date: r[0] || '' });
    }
    return mvs;
  },

  _parseIberia(rows) {
    const mvs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 6) continue;
      const num = r[1];
      if (typeof num !== 'number' || num < 1 || num > 999) continue;
      const concepto = String(r[3] || '').trim();
      const amount = parseFloat(r[5]) || 0;
      if (!concepto || Math.abs(amount) < 0.01) continue;
      mvs.push({ concepto: concepto.substring(0, 80), amount: Math.abs(amount), date: String(r[2] || '') });
    }
    return mvs;
  },

  _parseGenericRows(rows) {
    const mvs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      let concepto = '', amount = 0;
      for (let j = 0; j < r.length; j++) {
        const v = r[j];
        if (v && typeof v === 'string' && v.trim().length > 2 && !concepto) concepto = v.trim();
        if (typeof v === 'number' && Math.abs(v) > 0.01 && !amount) amount = Math.abs(v);
      }
      if (concepto && amount) mvs.push({ concepto: String(concepto).substring(0, 80), amount, date: '' });
    }
    return mvs;
  },

  async _parseGenericCSV(file) {
    const text = await file.text();
    const lines = text.split('\n').map(l => l.split(/[,;\t]/).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
    return this._parseGenericRows(lines.map(l => l.map(c => { const n = parseFloat(String(c).replace(',', '.')); return isNaN(n) ? c : n; })));
  },

  async _parseGenericHTML(file) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const rows = [];
    doc.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('td,th').forEach(td => { const t = td.textContent.trim(); const n = parseFloat(t.replace(/\./g,'').replace(',','.')); cells.push(isNaN(n) ? t : n); });
      if (cells.length) rows.push(cells);
    });
    return this._parseGenericRows(rows);
  },

  async _impConfirm(type) {
    const movements = this._impMovements;
    if (!movements || !movements.length) return;
    const month = parseInt(document.getElementById('imp-month').value);
    const card = type === 'tarjeta' ? (document.getElementById('imp-card')?.value || '') : '';
    const section = type === 'tarjeta' ? 'TARJETAS' : 'GASTOS';
    const pv = document.getElementById('imp-pv');
    if (type === 'tarjeta' && !card) { alert('Selecciona una tarjeta'); return; }

    const total = movements.length;
    let count = 0, autoCat = 0;
    const mi = month - 1, now = new Date().toISOString();

    const showProg = () => {
      pv.innerHTML = `<div style="padding:8px;"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Importando ${count}/${total}...</div><div style="background:#e2e8f0;border-radius:4px;height:6px;"><div style="background:var(--accent);height:100%;width:${Math.round(count/total*100)}%;transition:width .2s;border-radius:4px;"></div></div></div>`;
    };
    showProg();

    for (let i = 0; i < movements.length; i++) {
      const mv = movements[i];
      const label = card ? `${card}: ${String(mv.concepto).substring(0,70)}` : String(mv.concepto).substring(0,80);
      const rule = BudgetLogic.findRule(label, this.activeBank) || BudgetLogic.findRule(String(mv.concepto), this.activeBank);
      const casa = rule ? rule.casa : '', cat = rule ? rule.categoria : '', subcat = rule ? rule.subcategoria : '';
      if (rule) { autoCat++; rule.timesUsed++; }

      const id = BudgetLogic.generateId('BL');
      const plan = new Array(12).fill(0), real = new Array(12).fill(0);
      real[mi] = mv.amount;
      await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, [id, this.activeBank, AppState.currentYear, section, label, casa, cat, subcat, 'one-off', ...plan, ...real, 'FALSE', 999, 'ACTIVE', now, now]);
      count++;
      if (count % 3 === 0) showProg();
    }

    const catMsg = autoCat > 0 ? `<br><span style="color:var(--accent);">⚡ ${autoCat} auto-categorizados</span>` : '';
    pv.innerHTML = `<div style="font-weight:600;padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;">✅ ${count} movimientos importados${catMsg}</div>`;
    document.getElementById('imp-act').style.display = 'none';
    this._impMovements = [];
    setTimeout(() => { document.querySelector('.budget-drawer-overlay')?.remove(); this.refresh(); }, 1500);
  }
};
