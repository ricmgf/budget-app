// ============================================================
// Budget App — Page Controllers
// ============================================================

// --- NAVIGATION ---
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  AppState.currentPage = page;
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'import': loadImportPage(); break;
    case 'review': loadReviewPage(); break;
    case 'rules': loadRulesPage(); break;
    case 'reporting': loadReportingPage(); break;
    case 'balances': loadBalancesPage(); break;
    case 'settings': loadSettingsPage(); break;
  }
}

// --- MONTH SELECTOR ---
function updateMonthSelector() {
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`;
}
function prevMonth() {
  AppState.prevMonth(); updateMonthSelector();
  const p = AppState.currentPage;
  if (['dashboard','reporting','balances'].includes(p)) navigateTo(p);
}
function nextMonth() {
  AppState.nextMonth(); updateMonthSelector();
  const p = AppState.currentPage;
  if (['dashboard','reporting','balances'].includes(p)) navigateTo(p);
}
function updatePendingBadge() {
  const badge = document.getElementById('pending-badge');
  if (!badge) return;
  if (AppState.pendingCount > 0) { badge.textContent = AppState.pendingCount; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }
}

// --- DASHBOARD ---
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  c.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> Loading...</div>';
  try {
    const d = await BudgetLogic.getDashboardData( AppState.currentYear, AppState.currentMonth);
    AppState.pendingCount = d.pendingCount || 0;
    updatePendingBadge();
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    c.innerHTML = `
      ${d.transferNecesaria > 0 ? `<div class="alert alert-warning">💰 Transfer needed: <strong>${Utils.formatCurrency(d.transferNecesaria)}</strong></div>` : ''}
      <div class="metric-grid">
        <div class="card"><div class="card-title">Gastos</div><div class="card-value negative">${Utils.formatCurrency(d.totalGastos)}</div></div>
        <div class="card"><div class="card-title">Ingresos</div><div class="card-value positive">${Utils.formatCurrency(d.totalIngresos)}</div></div>
        <div class="card"><div class="card-title">Cash Flow</div><div class="card-value ${cfClass}">${Utils.formatCurrency(d.cashFlow)}</div></div>
        <div class="card"><div class="card-title">Categorización</div><div class="card-value">${d.categorizationRate}%</div>
          <div class="progress-bar" style="margin-top:8px"><div class="progress-bar-fill ${d.categorizationRate>=90?'success':''}" style="width:${d.categorizationRate}%"></div></div>
          ${d.pendingCount > 0 ? `<a href="#" onclick="navigateTo('review');return false" style="font-size:var(--text-xs);color:var(--accent);margin-top:4px;display:block">${d.pendingCount} pendientes →</a>` : ''}</div>
      </div>
      <div class="two-col-equal">
        <div class="card"><div class="card-title">Top Categorías</div><table><tbody>
          ${(d.topCategories||[]).map(x=>`<tr><td>${Utils.escapeHtml(x.name)}</td><td class="amount">${Utils.formatCurrency(x.total)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="card"><div class="card-title">Por Casa</div><table><tbody>
          ${(d.byCasa||[]).map(x=>`<tr><td>${Utils.escapeHtml(x.name)}</td><td class="amount">${Utils.formatCurrency(x.total)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card" style="margin-top:var(--sp-4)"><div class="card-title">Recent Imports</div>
        ${(d.recentImports||[]).length>0 ? `<table><thead><tr><th>Date</th><th>File</th><th>Account</th><th>New</th><th>Auto</th><th>Pending</th></tr></thead><tbody>
          ${d.recentImports.map(i=>`<tr><td>${Utils.formatDate(i.date)}</td><td>${Utils.escapeHtml(i.fileName)}</td><td><span class="tag">${Utils.escapeHtml(i.cuenta)}</span></td><td class="mono">${i.imported}</td><td class="mono">${i.categorized}</td><td class="mono">${i.pending>0?`<span class="badge badge-warning">${i.pending}</span>`:'0'}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty-state"><p>No imports yet</p><button class="btn btn-primary" onclick="navigateTo(\'import\')">Import First File</button></div>'}
      </div>`;
  } catch (err) { c.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`; }
}

// --- IMPORT ---
function loadImportPage() {
  const c = document.getElementById('import-content');
  c.innerHTML = `
    <div id="import-upload">
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
        <div class="icon">📁</div><p>Drop CSV/XLSX file here or click to browse</p>
        <p class="hint">CaixaBank, Intesa, CIC, Revolut, AMEX, Visa</p>
      </div>
      <input type="file" id="file-input" accept=".csv,.xlsx,.xls" style="display:none" onchange="handleFileSelect(event)">
      <div class="form-group" style="margin-top:var(--sp-4)">
        <label class="form-label">Override Account (optional)</label>
        <select class="form-select" id="import-cuenta"><option value="">Auto-detect</option>
          ${AppState.config ? AppState.config.cuentas.map(x=>`<option value="${x}">${x}</option>`).join('') : ''}
        </select>
      </div>
    </div>
    <div id="import-result" class="hidden"></div>`;
  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if(e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]); });
}
async function handleFileSelect(e) { if(e.target.files[0]) processFile(e.target.files[0]); }
async function processFile(file) {
  const upload = document.getElementById('import-upload');
  const result = document.getElementById('import-result');
  upload.classList.add('hidden'); result.classList.remove('hidden');
  result.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> Importing...</div>';
  try {
    const csvText = await new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsText(file);
    });
    window._pendingCSVText = csvText;
    window._pendingFN = file.name;
    const cuenta = document.getElementById('import-cuenta')?.value || '';
    if (!cuenta) {
      result.innerHTML = `<div class="alert alert-warning">Please select an account for this file.</div>
        <select class="form-select mb-4" id="manual-imp-cuenta">${Utils.buildCuentaSelect(AppState.config,'')}</select>
        <button class="btn btn-primary" id="retry-btn">Import</button> <button class="btn btn-secondary" onclick="loadImportPage()">Cancel</button>`;
      document.getElementById('retry-btn').onclick = async()=>{
        const ct = document.getElementById('manual-imp-cuenta').value;
        if(!ct){Utils.showAlert('Select account','warning');return;}
        result.innerHTML='<div class="loading-overlay"><div class="spinner"></div></div>';
        try{const r2=await BudgetLogic.importCSV(window._pendingCSVText,ct,window._pendingFN);showImportResult(r2,result);}
        catch(e2){result.innerHTML=`<div class="alert alert-danger">${e2.message}</div>`;}
      };
      return;
    }
    const r = await BudgetLogic.importCSV(csvText, cuenta, file.name);
    showImportResult(r, result);
  } catch(err) { result.innerHTML=`<div class="alert alert-danger">${err.message}</div><button class="btn btn-secondary" onclick="loadImportPage()">Try Again</button>`; }
}
function showImportResult(r, container) {
  container.innerHTML = `<div class="card">
    <div class="alert alert-success">✅ Import Complete</div>
    <div class="metric-grid">
      <div><strong>${r.imported}</strong><br><span class="text-muted text-sm">Imported</span></div>
      <div><strong>${r.duplicates}</strong><br><span class="text-muted text-sm">Duplicates</span></div>
      <div><strong>${r.categorized}</strong><br><span class="text-muted text-sm">Auto-Mapped</span></div>
      <div><strong>${r.pending}</strong><br><span class="text-muted text-sm">Need Review</span></div>
    </div>
    <div class="text-sm text-muted">Account: ${Utils.escapeHtml(r.cuenta)} · Adapter: ${Utils.escapeHtml(r.adapter)}</div>
    ${r.errors?.length ? `<details style="margin-top:8px"><summary class="text-sm" style="color:var(--warning);cursor:pointer">${r.errors.length} warnings</summary><pre style="font-size:10px;max-height:150px;overflow:auto">${r.errors.join('\n')}</pre></details>` : ''}
    <div style="margin-top:var(--sp-4);display:flex;gap:var(--sp-2)">
      ${r.pending>0?'<button class="btn btn-primary" onclick="navigateTo(\'review\')">Review →</button>':''}
      <button class="btn btn-secondary" onclick="loadImportPage()">Import Another</button>
    </div></div>`;
}

// --- REVIEW ---
async function loadReviewPage() {
  const c = document.getElementById('review-content');
  c.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> Loading...</div>';
  try {
    const d = await BudgetLogic.getPending();
    const txns = d.transactions || [];
    AppState.pendingCount = txns.length; updatePendingBadge();
    if (!txns.length) { c.innerHTML = '<div class="empty-state"><div class="icon">✅</div><p>All categorized!</p><button class="btn btn-primary" onclick="navigateTo(\'import\')">Import</button></div>'; return; }
    const {catOptions} = Utils.buildCategorySelect(AppState.config,'','');
    const casaOpts = Utils.buildCasaSelect(AppState.config,'');
    c.innerHTML = `<div class="table-container"><div class="table-toolbar"><div class="table-toolbar-left"><strong>${txns.length}</strong> pending</div>
      <div class="table-toolbar-right"><button class="btn btn-sm btn-secondary" onclick="document.querySelectorAll('.pcb').forEach(c=>c.checked=true)">Select All</button>
      <button class="btn btn-sm btn-primary" onclick="showBulkCat()">Bulk Categorize</button></div></div>
      <div style="max-height:70vh;overflow-y:auto"><table><thead><tr><th style="width:30px"><input type="checkbox" onchange="document.querySelectorAll('.pcb').forEach(c=>c.checked=this.checked)"></th>
      <th>Date</th><th>Description</th><th class="text-right">Amount</th><th>Account</th><th>Categoría</th><th>Sub</th><th>Casa</th><th></th></tr></thead><tbody>
      ${txns.map(t=>`<tr class="pending" data-id="${t.id}"><td><input type="checkbox" class="pcb" value="${t.id}"></td>
        <td class="mono">${Utils.formatDateShort(t.fecha)}</td><td title="${Utils.escapeHtml(t.concepto)}">${Utils.escapeHtml((t.concepto||'').substring(0,45))}</td>
        <td class="amount">${Utils.formatCurrency(t.importe)}</td><td><span class="tag">${Utils.escapeHtml(t.cuenta)}</span></td>
        <td><select class="form-select" style="min-width:110px" data-f="cat" onchange="onRevCatChg(this,'${t.id}')">${catOptions}</select></td>
        <td><select class="form-select" style="min-width:110px" data-f="sub" id="rsub-${t.id}"><option value="">—</option></select></td>
        <td><select class="form-select" style="min-width:90px" data-f="casa">${casaOpts}</select></td>
        <td class="actions"><button class="btn btn-sm btn-primary" onclick="saveRev('${t.id}')">✓</button>
        <button class="btn btn-sm btn-ghost" onclick="showRuleFromTxn('${t.id}','${Utils.escapeHtml(t.concepto)}')">Rule</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  } catch(err) { c.innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
}
function onRevCatChg(sel, id) {
  const sub = document.getElementById(`rsub-${id}`);
  const subs = (AppState.config?.categoriasGrouped[sel.value]) || [];
  sub.innerHTML = '<option value="">—</option>' + subs.map(s=>`<option value="${s}">${s}</option>`).join('');
}
async function saveRev(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  const cat = row.querySelector('[data-f="cat"]').value;
  const sub = row.querySelector('[data-f="sub"]').value;
  const casa = row.querySelector('[data-f="casa"]').value;
  if (!cat||!sub||!casa) { Utils.showAlert('Fill Categoría, Sub, and Casa','warning'); return; }
  try {
    await BudgetLogic.updateGasto(id, {categoria:cat, subcategoria:sub, casa:casa});
    row.remove(); AppState.pendingCount--; updatePendingBadge();
    Utils.showAlert('Saved ✅','success');
    if (!document.querySelectorAll('#review-content tbody tr').length) loadReviewPage();
  } catch(err) { Utils.showAlert(err.message,'danger'); }
}
function showBulkCat() {
  const ids = [...document.querySelectorAll('.pcb:checked')].map(c=>c.value);
  if(!ids.length) { Utils.showAlert('Select transactions','warning'); return; }
  const {catOptions} = Utils.buildCategorySelect(AppState.config,'','');
  showModal('Bulk Categorize ('+ids.length+')', `
    <div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="bcat" onchange="onBCatChg()">${catOptions}</select></div>
    <div class="form-group"><label class="form-label">Subcategoría</label><select class="form-select" id="bsub"><option>—</option></select></div>
    <div class="form-group"><label class="form-label">Casa</label><select class="form-select" id="bcasa">${Utils.buildCasaSelect(AppState.config,'')}</select></div>
  `, async()=>{
    const cat=document.getElementById('bcat').value, sub=document.getElementById('bsub').value, casa=document.getElementById('bcasa').value;
    if(!cat||!sub||!casa){Utils.showAlert('Fill all','warning');return;}
    try{await BudgetLogic.bulkUpdateGastos(ids, {categoria:cat, subcategoria:sub, casa:casa});closeModal();Utils.showAlert(`${ids.length} updated`,'success');loadReviewPage();}
    catch(err){Utils.showAlert(err.message,'danger');}
  });
}
function onBCatChg() {
  const subs=(AppState.config?.categoriasGrouped[document.getElementById('bcat').value])||[];
  document.getElementById('bsub').innerHTML='<option>—</option>'+subs.map(s=>`<option value="${s}">${s}</option>`).join('');
}

// --- CREATE RULE FROM TXN ---
function showRuleFromTxn(id, concepto) {
  const suggested = concepto.split(/\s+/).slice(0,3).join(' ').toUpperCase();
  const {catOptions}=Utils.buildCategorySelect(AppState.config,'','');
  showModal('Create Rule', `
    <div class="form-group"><label class="form-label">Pattern</label><input class="form-input" id="rp" value="${suggested}"><div class="form-hint">Text to match in descriptions</div></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Type</label><select class="form-select" id="rt"><option value="contains">Contains</option><option value="regex">Regex</option></select></div>
    <div class="form-group"><label class="form-label">Priority</label><input class="form-input" id="rpri" type="number" value="50"></div></div>
    <div class="form-group"><label class="form-label">Account scope</label><select class="form-select" id="rcu"><option value="">Any</option>${AppState.config?AppState.config.cuentas.map(c=>`<option value="${c}">${c}</option>`).join(''):''}</select></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="rcat" onchange="onRCatChg()">${catOptions}</select></div>
    <div class="form-group"><label class="form-label">Sub</label><select class="form-select" id="rsub"><option>—</option></select></div></div>
    <div class="form-group"><label class="form-label">Casa</label><select class="form-select" id="rcasa">${Utils.buildCasaSelect(AppState.config,'')}</select></div>
    <div id="rprev" class="text-sm text-muted"></div>
    <button class="btn btn-sm btn-ghost" onclick="prevRule()">Preview matches</button>
  `, async()=>{
    const data={patron:document.getElementById('rp').value,tipoMatch:document.getElementById('rt').value,prioridad:document.getElementById('rpri').value,
      cuenta:document.getElementById('rcu').value,categoria:document.getElementById('rcat').value,subcategoria:document.getElementById('rsub').value,casa:document.getElementById('rcasa').value};
    try{const r=await BudgetLogic.addRule(data);if(r.id!==undefined)await BudgetLogic.applyRuleRetroactive(r.id);closeModal();Utils.showAlert(r.message,'success');
      if(AppState.currentPage==='review')loadReviewPage();else if(AppState.currentPage==='rules')loadRulesPage();}
    catch(err){Utils.showAlert(err.message,'danger');}
  });
}
function onRCatChg(){
  const subs=(AppState.config?.categoriasGrouped[document.getElementById('rcat').value])||[];
  document.getElementById('rsub').innerHTML='<option>—</option>'+subs.map(s=>`<option value="${s}">${s}</option>`).join('');
}
async function prevRule(){
  const el=document.getElementById('rprev');
  try{const r=await BudgetLogic.testRule(document.getElementById('rp').value,tipoMatch:document.getElementById('rt').value,cuenta:document.getElementById('rcu').value});
    el.innerHTML=`<strong>${r.totalMatches}</strong> matches`+(r.matches.length?':<br>'+r.matches.slice(0,5).map(m=>`• ${Utils.formatDateShort(m.fecha)} ${Utils.escapeHtml((m.concepto||'').substring(0,40))} ${Utils.formatCurrency(m.importe)}`).join('<br>'):'');
  }catch(err){el.textContent=err.message;}
}

// --- RULES PAGE ---
async function loadRulesPage() {
  const c = document.getElementById('rules-content');
  c.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const d = await BudgetLogic.loadRules();
    const rules = d.rules || [];
    c.innerHTML = `<div class="table-container"><div class="table-toolbar"><div class="table-toolbar-left"><strong>${rules.length}</strong> rules</div>
      <div class="table-toolbar-right"><button class="btn btn-sm btn-primary" onclick="showRuleFromTxn('','')">+ New</button>
      <button class="btn btn-sm btn-secondary" onclick="showTestDialog()">Test</button></div></div>
      <table><thead><tr><th>Pri</th><th>On</th><th>Pattern</th><th>Type</th><th>Account</th><th>Cat</th><th>Sub</th><th>Casa</th><th></th></tr></thead><tbody>
      ${rules.map(r=>`<tr><td class="mono">${r.prioridad}</td>
        <td>${r.habilitado?'<span class="badge badge-success">✓</span>':'<span class="badge badge-danger">✗</span>'}</td>
        <td><code style="font-size:var(--text-xs)">${Utils.escapeHtml(r.patron)}</code></td><td class="text-sm">${r.tipoMatch}</td>
        <td>${r.cuenta?`<span class="tag">${Utils.escapeHtml(r.cuenta)}</span>`:'<span class="text-muted">Any</span>'}</td>
        <td class="text-sm">${Utils.escapeHtml(r.categoria)}</td><td class="text-sm">${Utils.escapeHtml(r.subcategoria)}</td><td class="text-sm">${Utils.escapeHtml(r.casa)}</td>
        <td class="actions"><button class="btn btn-sm btn-ghost" onclick="toggleRule(${r.id},${!r.habilitado})">${r.habilitado?'Off':'On'}</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="delRule(${r.id})">✕</button></td></tr>`).join('')}
      </tbody></table>${!rules.length?'<div class="empty-state"><p>No rules yet</p></div>':''}</div>`;
  } catch(err) { c.innerHTML=`<div class="alert alert-danger">${err.message}</div>`; }
}
async function toggleRule(id,en){try{await BudgetLogic.toggleRule(id,en);loadRulesPage();}catch(e){Utils.showAlert(e.message,'danger');}}
async function delRule(id){if(!confirm('Delete rule?'))return;try{await BudgetLogic.toggleRule(id,false);loadRulesPage();}catch(e){Utils.showAlert(e.message,'danger');}}
function showTestDialog(){
  showModal('Test Pattern',`
    <div class="form-group"><label class="form-label">Pattern</label><input class="form-input" id="tp" placeholder="e.g. MERCADONA"></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Type</label><select class="form-select" id="tt"><option value="contains">Contains</option><option value="regex">Regex</option></select></div></div>
    <button class="btn btn-sm btn-secondary" onclick="runTest()">Search</button><div id="tres" style="margin-top:12px"></div>`,null,'Close');
}
async function runTest(){
  const el=document.getElementById('tres');el.innerHTML='<div class="spinner"></div>';
  try{const r=await BudgetLogic.testRule(document.getElementById('tp').value,tipoMatch:document.getElementById('tt').value});
    el.innerHTML=`<strong>${r.totalMatches} matches</strong>`+(r.matches.length?'<table style="margin-top:8px"><tbody>'+r.matches.slice(0,20).map(m=>`<tr><td class="mono">${Utils.formatDateShort(m.fecha)}</td><td>${Utils.escapeHtml((m.concepto||'').substring(0,50))}</td><td class="amount">${Utils.formatCurrency(m.importe)}</td></tr>`).join('')+'</tbody></table>':'');
  }catch(e){el.innerHTML=`<span style="color:var(--danger)">${e.message}</span>`;}
}

// --- REPORTING ---
async function loadReportingPage() {
  const c = document.getElementById('reporting-content');
  c.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const [mo, ca] = await Promise.all([
      BudgetLogic.getMonthlySummary(AppState.currentYear, AppState.currentMonth),
      BudgetLogic.getCasaSummary(AppState.currentYear, AppState.currentMonth)
    ]);
    c.innerHTML = `
      <div class="section"><div class="flex-between mb-4"><h3 class="section-title">By Categoría</h3>
        <span class="text-sm text-muted">Total: <strong class="font-mono">${Utils.formatCurrency(mo.grandTotal)}</strong></span></div>
        <div class="table-container"><table><thead><tr><th>Categoría</th><th class="text-right">Total</th><th>Detail</th></tr></thead><tbody>
        ${(mo.summary||[]).map(x=>`<tr><td><strong>${Utils.escapeHtml(x.categoria)}</strong></td><td class="amount">${Utils.formatCurrency(x.total)}</td>
          <td class="text-sm text-muted">${x.subcategorias.map(s=>`${s.subcategoria} ${Utils.formatCurrency(s.total)}`).join(' · ')}</td></tr>`).join('')}
        </tbody></table>${!(mo.summary||[]).length?'<div class="empty-state"><p>No data</p></div>':''}</div></div>
      <div class="section"><h3 class="section-title">By Casa</h3>
        <div class="table-container"><table><thead><tr><th>Casa</th><th class="text-right">Total</th><th>Top Categories</th></tr></thead><tbody>
        ${(ca.summary||[]).map(x=>`<tr><td><strong>${Utils.escapeHtml(x.casa)}</strong></td><td class="amount">${Utils.formatCurrency(x.total)}</td>
          <td class="text-sm text-muted">${x.categorias.slice(0,3).map(c=>`${c.categoria} ${Utils.formatCurrency(c.total)}`).join(' · ')}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="section"><div class="flex-between mb-4"><h3 class="section-title">Annual</h3>
        <div class="flex gap-2"><button class="btn btn-sm btn-secondary" onclick="loadAnnual()">Load Grid</button>
        <button class="btn btn-sm btn-secondary" onclick="exportCSV()">Export CSV</button></div></div>
        <div id="annual-grid"></div></div>`;
  } catch(err) { c.innerHTML=`<div class="alert alert-danger">${err.message}</div>`; }
}
async function loadAnnual() {
  const g = document.getElementById('annual-grid');
  g.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const d = await BudgetLogic.getAnnualSummary(AppState.currentYear);
    const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    g.innerHTML = `<div class="table-container" style="overflow-x:auto"><table><thead><tr><th>Categoría</th>
      ${mn.map(m=>`<th class="text-right">${m}</th>`).join('')}<th class="text-right"><strong>TOTAL</strong></th></tr></thead><tbody>
      ${(d.categories||[]).map(c=>`<tr><td><strong>${Utils.escapeHtml(c.categoria)}</strong></td>
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<td class="amount mono">${c.months[m]?Utils.formatCurrency(c.months[m]):'—'}</td>`).join('')}
        <td class="amount mono"><strong>${Utils.formatCurrency(c.total)}</strong></td></tr>`).join('')}
      <tr style="border-top:2px solid var(--border-medium)"><td><strong>TOTAL</strong></td>
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<td class="amount mono"><strong>${d.monthlyTotals[m]?Utils.formatCurrency(d.monthlyTotals[m]):'—'}</strong></td>`).join('')}
        <td class="amount mono"><strong>${Utils.formatCurrency(d.grandTotal)}</strong></td></tr></tbody></table></div>`;
  } catch(err) { g.innerHTML=`<div class="alert alert-danger">${err.message}</div>`; }
}
async function exportCSV() {
  try { 
    const gastos = await BudgetLogic.getGastos(AppState.currentYear);
    const header = 'Fecha,Concepto,Importe,Cuenta,Casa,Categoría,Subcategoría,Estado\n';
    const csv = header + gastos.map(function(g){return [g.fecha,'"'+g.concepto+'"',g.importe,g.cuenta,g.casa,g.categoria,g.subcategoria,g.estado].join(',');}).join('\n');
    Utils.downloadCSV(csv, 'gastos_'+AppState.currentYear+'.csv'); Utils.showAlert('Downloaded','success'); }
  catch(err) { Utils.showAlert(err.message,'danger'); }
}

// --- BALANCES ---
async function loadBalancesPage() {
  const c = document.getElementById('balances-content');
  c.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const d = await BudgetLogic.calculateCashFlow( año:AppState.currentYear, mes:AppState.currentMonth });
    const accs = d.accounts||[], gt = d.grandTotal||{};
    c.innerHTML = `
      ${gt.totalTransferNecesaria>0?`<div class="alert alert-warning">💰 Transfer needed: <strong>${Utils.formatCurrency(gt.totalTransferNecesaria)}</strong></div>`:'<div class="alert alert-success">✅ Accounts covered</div>'}
      <div class="table-container"><table><thead><tr><th>Account</th><th class="text-right">Opening</th><th class="text-right">Income</th><th class="text-right">Expenses</th><th class="text-right">Closing</th><th class="text-right">Transfer</th></tr></thead><tbody>
      ${accs.map(a=>`<tr><td><strong>${Utils.escapeHtml(a.cuenta)}</strong></td><td class="amount">${Utils.formatCurrency(a.saldoInicial)}</td>
        <td class="amount positive">${Utils.formatCurrency(a.totalIngresos)}</td><td class="amount negative">${Utils.formatCurrency(a.totalGastos)}</td>
        <td class="amount ${a.saldoFinal<0?'negative':''}">${Utils.formatCurrency(a.saldoFinal)}</td>
        <td class="amount">${a.transferNecesaria>0?`<span class="badge badge-warning">${Utils.formatCurrency(a.transferNecesaria)}</span>`:'—'}</td></tr>`).join('')}
      <tr style="border-top:2px solid var(--border-medium);font-weight:700"><td>TOTAL</td>
        <td class="amount">${Utils.formatCurrency(accs.reduce((s,a)=>s+a.saldoInicial,0))}</td>
        <td class="amount positive">${Utils.formatCurrency(gt.totalIngresos)}</td><td class="amount negative">${Utils.formatCurrency(gt.totalGastos)}</td>
        <td class="amount">${Utils.formatCurrency(gt.totalIngresos-gt.totalGastos+accs.reduce((s,a)=>s+a.saldoInicial,0))}</td>
        <td class="amount">${gt.totalTransferNecesaria>0?`<strong>${Utils.formatCurrency(gt.totalTransferNecesaria)}</strong>`:'—'}</td></tr>
      </tbody></table></div>
      <div style="margin-top:var(--sp-4);display:flex;gap:var(--sp-2)">
        <button class="btn btn-secondary" onclick="editBalances()">Edit Balances</button>
        <button class="btn btn-secondary" onclick="editIngresos()">Edit Income</button></div>`;
  } catch(err) { c.innerHTML=`<div class="alert alert-danger">${err.message}</div>`; }
}
async function editBalances() {
  const {balances} = await BudgetLogic.loadBalances({año:AppState.currentYear,mes:AppState.currentMonth});
  const bm={}; balances.forEach(b=>bm[b.cuenta]=b.saldoInicial||0);
  showModal('Opening Balances — '+AppState.getMonthName(AppState.currentMonth)+' '+AppState.currentYear,
    AppState.config.cuentas.map(c=>`<div class="form-row mb-4"><div style="flex:1;display:flex;align-items:center"><strong class="text-sm">${c}</strong></div>
      <div style="flex:1"><input class="form-input" type="number" step="0.01" id="bl-${c.replace(/\s/g,'_')}" value="${bm[c]||0}"></div></div>`).join(''),
    async()=>{
      try{for(const c of AppState.config.cuentas){
        // TODO: implement balance persistence
        console.log('Balance update for', c, ':', parseFloat(document.getElementById(`bl-${c.replace(/\s/g,'_')}`).value)||0);}
        closeModal();Utils.showAlert('Updated','success');loadBalancesPage();}catch(e){Utils.showAlert(e.message,'danger');}
    });
}
async function editIngresos() {
  const {ingresos} = await BudgetLogic.loadIngresos({año:AppState.currentYear,mes:AppState.currentMonth});
  showModal('Income — '+AppState.getMonthName(AppState.currentMonth)+' '+AppState.currentYear, `
    <div id="ing-list">${ingresos.map(i=>`<div class="form-row mb-4" style="align-items:end" data-iid="${i.id}">
      <div class="form-group" style="flex:2"><label class="form-label">Concept</label><input class="form-input" value="${Utils.escapeHtml(i.concepto)}" data-f="concepto"></div>
      <div class="form-group" style="flex:1"><label class="form-label">€</label><input class="form-input" type="number" step="0.01" value="${i.importe}" data-f="importe"></div>
      <div class="form-group" style="flex:1"><label class="form-label">Account</label><select class="form-select" data-f="cuenta">${Utils.buildCuentaSelect(AppState.config,i.cuenta)}</select></div>
      <div class="form-group" style="flex:1"><label class="form-label">Type</label><select class="form-select" data-f="tipo">${['Salario','Alquiler','Transferencia','Otro'].map(t=>`<option ${t===i.tipo?'selected':''}>${t}</option>`).join('')}</select></div>
      <button class="btn btn-sm btn-danger" onclick="delIng(${i.id})">×</button></div>`).join('')}</div>
    <button class="btn btn-sm btn-ghost" onclick="addIng()">+ Add</button>`, async()=>{closeModal();loadBalancesPage();}, 'Done');
}
function addIng() {
  const list=document.getElementById('ing-list');
  const d=document.createElement('div');d.className='form-row mb-4';d.style.alignItems='end';d.dataset.iid='new';
  d.innerHTML=`<div class="form-group" style="flex:2"><label class="form-label">Concept</label><input class="form-input" data-f="concepto"></div>
    <div class="form-group" style="flex:1"><label class="form-label">€</label><input class="form-input" type="number" step="0.01" data-f="importe"></div>
    <div class="form-group" style="flex:1"><label class="form-label">Account</label><select class="form-select" data-f="cuenta">${Utils.buildCuentaSelect(AppState.config,'')}</select></div>
    <div class="form-group" style="flex:1"><label class="form-label">Type</label><select class="form-select" data-f="tipo"><option>Salario</option><option>Alquiler</option><option>Transferencia</option><option>Otro</option></select></div>
    <button class="btn btn-sm btn-primary" onclick="saveIng(this)">Save</button>`;
  list.appendChild(d);
}
async function saveIng(btn) {
  const row=btn.closest('[data-iid]');
  try{await BudgetLogic.addIngreso({año:AppState.currentYear,mes:AppState.currentMonth,concepto:row.querySelector('[data-f="concepto"]').value,
    importe:row.querySelector('[data-f="importe"]').value,cuenta:row.querySelector('[data-f="cuenta"]').value,tipo:row.querySelector('[data-f="tipo"]').value,recurrente:false});
    btn.textContent='✓';btn.disabled=true;Utils.showAlert('Added','success');}catch(e){Utils.showAlert(e.message,'danger');}
}
async function delIng(id) {
  if(!confirm('Delete?'))return;
  try{await BudgetLogic.deleteIngreso(id);document.querySelector(`[data-iid="${id}"]`).remove();Utils.showAlert('Deleted','success');}catch(e){Utils.showAlert(e.message,'danger');}
}

// --- SETTINGS ---
async function loadSettingsPage() {
  if(!AppState.config)AppState.config = await BudgetLogic.loadConfig();
  const cfg=AppState.config;
  const c=document.getElementById('settings-content');
  c.innerHTML=`<div class="two-col-equal">
    <div class="card"><div class="flex-between mb-4"><div class="card-title">Categorías</div><button class="btn btn-sm btn-primary" onclick="addCatDlg()">+ Add</button></div>
      <div style="max-height:400px;overflow-y:auto">${Object.entries(cfg.categoriasGrouped).map(([cat,subs])=>`<div style="margin-bottom:12px"><strong class="text-sm">${Utils.escapeHtml(cat)}</strong>
        <div style="padding-left:16px">${subs.map(s=>`<div class="flex-between" style="padding:2px 0"><span class="text-sm">${Utils.escapeHtml(s)}</span>
          <button class="btn btn-sm btn-ghost" onclick="delCat('${cat}','${s}')" style="font-size:10px;color:var(--danger)">✕</button></div>`).join('')}</div></div>`).join('')}</div></div>
    <div><div class="card mb-4"><div class="flex-between mb-4"><div class="card-title">Accounts</div><button class="btn btn-sm btn-primary" onclick="addCuentaDlg()">+ Add</button></div>
      ${cfg.cuentas.map(c=>`<div class="text-sm" style="padding:2px 0">• ${Utils.escapeHtml(c)}</div>`).join('')}</div>
      <div class="card mb-4"><div class="flex-between mb-4"><div class="card-title">Properties</div><button class="btn btn-sm btn-primary" onclick="addCasaDlg()">+ Add</button></div>
      ${cfg.casas.map(c=>`<div class="text-sm" style="padding:2px 0">• ${Utils.escapeHtml(c)}</div>`).join('')}</div>
      <div class="card"><div class="card-title">Preferences</div>
        <div class="flex-between" style="margin-top:12px"><span class="text-sm">Dark Mode</span>
        <div class="toggle ${AppState.theme==='dark'?'active':''}" onclick="AppState.toggleTheme();this.classList.toggle('active')"></div></div></div></div></div>`;
}
function addCatDlg(){
  const cats=[...new Set((AppState.config?.categorias||[]).map(c=>c.categoria))];
  showModal('Add Category',`<div class="form-group"><label class="form-label">Categoría</label><input class="form-input" id="nc" list="ncl" placeholder="Existing or new"><datalist id="ncl">${cats.map(c=>`<option value="${c}">`).join('')}</datalist></div>
    <div class="form-group"><label class="form-label">Subcategoría</label><input class="form-input" id="ns" placeholder="New subcategory"></div>`,
    async()=>{try{await BudgetLogic.addCategory(document.getElementById('nc').value,document.getElementById('ns').value);closeModal();AppState.config = await BudgetLogic.loadConfig();loadSettingsPage();Utils.showAlert('Added','success');}catch(e){Utils.showAlert(e.message,'danger');}});
}
async function delCat(cat,sub){if(!confirm(`Delete "${cat}/${sub}"?`))return;try{await BudgetLogic.deleteCategory(cat,sub);AppState.config = await BudgetLogic.loadConfig();loadSettingsPage();Utils.showAlert('Deleted','success');}catch(e){Utils.showAlert(e.message,'danger');}}
function addCuentaDlg(){showModal('Add Account',`<div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ncu"></div>`,
  async()=>{try{await BudgetLogic.addCuenta(document.getElementById('ncu').value);closeModal();AppState.config = await BudgetLogic.loadConfig();loadSettingsPage();Utils.showAlert('Added','success');}catch(e){Utils.showAlert(e.message,'danger');}});}
function addCasaDlg(){showModal('Add Property',`<div class="form-group"><label class="form-label">Name</label><input class="form-input" id="nca"></div>`,
  async()=>{try{await BudgetLogic.addCasa(document.getElementById('nca').value);closeModal();AppState.config = await BudgetLogic.loadConfig();loadSettingsPage();Utils.showAlert('Added','success');}catch(e){Utils.showAlert(e.message,'danger');}});}

// --- MANUAL ENTRY ---
function showManualEntry(){
  const cfg=AppState.config; if(!cfg)return;
  const {catOptions}=Utils.buildCategorySelect(cfg,'','');
  showModal('Add Manual Expense',`
    <div class="form-row"><div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="me-f" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-group"><label class="form-label">Amount €</label><input class="form-input" type="number" step="0.01" id="me-i"></div></div>
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="me-c" placeholder="e.g. Cash electrician"></div>
    <div class="form-group"><label class="form-label">Account</label><select class="form-select" id="me-cu">${Utils.buildCuentaSelect(cfg,'')}</select></div>
    <div class="form-row"><div class="form-group"><label class="form-label">Categoría</label><select class="form-select" id="me-cat" onchange="onMECatChg()">${catOptions}</select></div>
    <div class="form-group"><label class="form-label">Sub</label><select class="form-select" id="me-sub"><option>—</option></select></div></div>
    <div class="form-group"><label class="form-label">Casa</label><select class="form-select" id="me-casa">${Utils.buildCasaSelect(cfg,'')}</select></div>
    <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="me-n"></div>`,
    async()=>{try{await BudgetLogic.addManualGasto({fecha:document.getElementById('me-f').value,concepto:document.getElementById('me-c').value,importe:document.getElementById('me-i').value,
      cuenta:document.getElementById('me-cu').value,categoria:document.getElementById('me-cat').value,subcategoria:document.getElementById('me-sub').value,
      casa:document.getElementById('me-casa').value,notas:document.getElementById('me-n').value});closeModal();Utils.showAlert('Added ✅','success');
      if(AppState.currentPage==='dashboard')loadDashboard();}catch(e){Utils.showAlert(e.message,'danger');}});
}
function onMECatChg(){
  const subs=(AppState.config?.categoriasGrouped[document.getElementById('me-cat').value])||[];
  document.getElementById('me-sub').innerHTML='<option>—</option>'+subs.map(s=>`<option value="${s}">${s}</option>`).join('');
}

// --- MODAL ---
function showModal(title, body, onConfirm, confirmText) {
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').innerHTML=body;
  const btn=document.getElementById('modal-confirm');
  if(onConfirm){btn.classList.remove('hidden');btn.textContent=confirmText||'Save';btn.onclick=onConfirm;}else{btn.classList.add('hidden');}
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(){document.getElementById('modal-overlay').classList.add('hidden');}

// --- INIT ---
async function initApp() {
  AppState.init(); updateMonthSelector();
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); }
  catch(err) {
    document.getElementById('page-dashboard').classList.add('active');
    document.getElementById('dashboard-content').innerHTML=`<div class="alert alert-danger">
      <strong>Connection Error</strong><br>Could not load config from Google Sheet.<br>
      <code style="font-size:10px">${err.message}</code></div>`;
  }
}
document.addEventListener('DOMContentLoaded', initApp);
