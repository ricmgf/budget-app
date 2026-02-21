/**
 * reporting.js — Módulo de Informes v2.0
 * - Usa GASTOS_COLS e INGRESOS_COLS de config.js (índices correctos)
 * - Carga bajo demanda con un único batchGet
 * - Todo el filtrado/agrupado en cliente, sin llamadas adicionales
 */

const Reporting = (() => {

  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  let _loaded  = false;
  let _loading = false;
  let _lines   = [];   // parsed BUDGET_LINES rows (all banks, all sections)

  let _tab       = 'casas';
  let _view      = 'ytd';    // 'ytd' | '12m'
  let _hijosView = 'anual';  // 'anual' | 'mensual'
  let _dateFrom  = null;
  let _dateTo    = null;

  // Multiselect state per tab (null = all selected)
  let _selCasas     = null;   // array of casa names or null
  let _selCategorias = null;  // array of cat names or null
  let _selHijos     = null;   // array of hijo names or null
  let _selTarjetas  = null;   // array of tarjeta names or null
  let _selIngresos  = null;   // array of concepto keys or null

  // Usa los índices ya definidos en config.js
  // GASTOS_COLS: ID=0,AÑO=1,MES=2,FECHA=3,CONCEPTO=4,IMPORTE=5,CUENTA=6,CASA=7,CATEGORIA=8,SUBCATEGORIA=9,NOTAS=10,ORIGEN=11,ESTADO=12,HASH=13
  // INGRESOS_COLS: ID=0,AÑO=1,MES=2,FECHA=3,CONCEPTO=4,IMPORTE=5,CUENTA=6,CASA=7,CATEGORIA=8,ORIGEN=9,HASH=10
  const G = GASTOS_COLS;
  const I = INGRESOS_COLS;

  const MONTH_SHORT = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MONTH_LONG  = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const CASA_COLORS  = ['#2563eb','#0891b2','#7c3aed','#059669','#d97706','#dc2626','#64748b','#b45309'];
  const HIJOS_CATS   = ['Sandra','Dani','Cris'];
  const HIJOS_COLORS = ['#2563eb','#0891b2','#059669'];

  /* ─────────────────────────────────────────────
     UTILS
  ───────────────────────────────────────────── */
  function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      return s.lastIndexOf(',') > s.lastIndexOf('.')
        ? parseFloat(s.replace(/\./g,'').replace(',','.')) || 0
        : parseFloat(s.replace(/,/g,'')) || 0;
    }
    return parseFloat(s.replace(',','.')) || 0;
  }

  // Formato miles con punto (mismo algoritmo que budget-grid._f, sin decimales)
  function _fmtInt(n) {
    const abs = Math.round(Math.abs(n));
    return String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fmt(n) {
    if (!n || n === 0) return '<span class="rpt-nil">—</span>';
    return _fmtInt(n);
  }
  function fmtPlain(n) {
    if (!n || n === 0) return '—';
    return _fmtInt(n);
  }

  let _uid = 0;
  function uid() { return 'u' + (++_uid); }

  /* ─────────────────────────────────────────────
     MULTISELECT COMPONENT
     msId: unique id for this instance
     allItems: array of strings (all possible options)
     selected: array of selected strings (null = all)
     onChange: js expression string called with selected array
  ───────────────────────────────────────────── */
  function buildMultiSelect(msId, label, allItems, selected) {
    // allItems already sorted by caller; selected=null means all selected
    const selSet   = selected ? new Set(selected) : new Set(allItems);
    const allSel   = selSet.size === allItems.length;
    const dispText = allSel
      ? 'Todos'
      : selSet.size === 0
        ? 'Ninguno'
        : selSet.size === 1
          ? [...selSet][0]
          : `${selSet.size} seleccionados`;

    const allJson  = JSON.stringify(allItems).replace(/"/g, '&quot;');

    const opts = allItems.map(item => {
      const chk  = selSet.has(item) ? 'checked' : '';
      const safe = item.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<label class="rpt-ms-opt">
        <input type="checkbox" ${chk} onchange="Reporting.msToggle('${msId}','${safe}')">
        <span>${item}</span>
      </label>`;
    }).join('');

    const searchHtml = allItems.length > 8
      ? `<input class="rpt-ms-search" type="text" placeholder="Buscar..." oninput="Reporting.msFilter('${msId}',this.value)">`
      : '';

    return `<div class="rpt-ms" id="ms-${msId}" data-msid="${msId}" data-all="${allJson}">
      <span class="rpt-sel-label">${label}</span>
      <div class="rpt-ms-wrap">
        <button class="rpt-ms-btn" onclick="event.stopPropagation();Reporting.msTogglePanel('${msId}')">
          <span id="ms-disp-${msId}">${dispText}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="rpt-ms-panel" id="ms-panel-${msId}">
          ${searchHtml}
          <label class="rpt-ms-opt rpt-ms-all">
            <input type="checkbox" id="ms-all-${msId}" ${allSel?'checked':''} onchange="Reporting.msToggleAll('${msId}',this.checked)">
            <span><strong>Seleccionar todos</strong></span>
          </label>
          <div class="rpt-ms-divider"></div>
          <div id="ms-opts-${msId}">${opts}</div>
        </div>
      </div>
    </div>`;
  }

  function xbtn(id) {
    return `<button class="rpt-xb" id="b${id}" onclick="event.stopPropagation();Reporting.toggle('${id}')">+</button>`;
  }
  // xbtnSec: for category-level rows that use toggleSec (shows/hides data-g rows)
  function xbtnSec(id) {
    return `<button class="rpt-xb" id="b${id}" onclick="event.stopPropagation();Reporting.toggleSec('${id}')">+</button>`;
  }
  const xph = `<span class="rpt-xph"></span>`;

  /* ─────────────────────────────────────────────
     DATE SETUP
  ───────────────────────────────────────────── */
  function initDates() {
    if (_dateFrom) return;
    applyPresetDates('ytd');
  }

  function applyPresetDates(p) {
    const now = new Date();
    const y   = now.getFullYear();
    if (p === 'ytd') {
      _dateFrom = new Date(y, 0, 1);
      _dateTo   = new Date(now);
      _view     = 'ytd';
    } else if (p === '12m') {
      _dateTo   = new Date(now);
      _dateFrom = new Date(y - 1, now.getMonth(), 1);
      _view     = '12m';
    } else if (p === 'prev') {
      _dateFrom = new Date(y - 1, 0, 1);
      _dateTo   = new Date(y - 1, 11, 31);
      _view     = null;
    }
  }

  // Returns array of {year, month} objects covered by current date range
  function activeMonths() {
    const result = [];
    const cur = new Date(_dateFrom.getFullYear(), _dateFrom.getMonth(), 1);
    const end = new Date(_dateTo.getFullYear(), _dateTo.getMonth(), 1);
    while (cur <= end) {
      result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }

  function monthLabel(m) {
    const ms = activeMonths();
    return (ms.length <= 3) ? MONTH_LONG[m.month] : MONTH_SHORT[m.month];
  }

  function fmtDateRange() {
    const f = _dateFrom, t = _dateTo;
    return `${f.getDate()} ${MONTH_SHORT[f.getMonth()+1]} ${f.getFullYear()} → ${t.getDate()} ${MONTH_SHORT[t.getMonth()+1]} ${t.getFullYear()}`;
  }

  /* ─────────────────────────────────────────────
     DATA LOADING
  ───────────────────────────────────────────── */
  async function loadData(force) {
    if (_loaded && !force) return;
    if (_loading) return;
    _loading = true;
    showLoading(true);

    try {
      if (!AppState.config) await BudgetLogic.loadConfig();

      // Source of truth: BUDGET_LINES (GASTOS_TOTAL is empty/unused)
      const year = new Date().getFullYear();
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_LINES);
      console.log(`[Reporting] BUDGET_LINES raw: ${rows ? rows.length : 0} filas`);

      if (!rows || rows.length < 2) {
        document.getElementById('rpt-wrap').innerHTML =
          '<div class="rpt-empty">Sin datos en BUDGET_LINES.</div>';
        return;
      }

      // Parse same way as loadBudgetLines but keep ALL years for reporting
      _lines = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0] || r[35] === 'DELETED') continue;
        const bd = r[41] && r[41] !== 'None' ? r[41] : null;
        _lines.push({
          id: r[0], bank: r[1], year: parseInt(r[2]) || year,
          section: r[3], concepto: r[4] || '',
          casa: r[5] || '', categoria: r[6] || '', subcategoria: r[7] || '',
          cadence: r[8] || 'variable',
          plan: [r[9],r[10],r[11],r[12],r[13],r[14],r[15],r[16],r[17],r[18],r[19],r[20]].map(v => parseFloat(v)||0),
          real: [r[21],r[22],r[23],r[24],r[25],r[26],r[27],r[28],r[29],r[30],r[31],r[32]].map(v => parseFloat(v)||0),
          notas: r[38] || '', parentId: r[39] || '', alias: r[40] || '',
          breakdown: bd, sheetRow: i + 1
        });
      }

      console.log(`[Reporting] Parsed: ${_lines.length} líneas`);
      const sample = _lines[0];
      if (sample) console.log(`[Reporting] Muestra: banco=${sample.bank} concepto=${sample.concepto} real=${sample.real}`);

      _loaded = true;

    } catch (err) {
      console.error('[Reporting] Error en loadData:', err);
      document.getElementById('rpt-wrap').innerHTML =
        '<div class="rpt-empty">Error cargando datos: ' + (err.message || err) + '</div>';
    } finally {
      _loading = false;
      showLoading(false);
    }
  }

  function showLoading(on) {
    const lo = document.getElementById('rpt-loading');
    const ct = document.getElementById('rpt-wrap');
    if (lo) lo.style.display = on ? 'flex' : 'none';
    if (ct) ct.style.display = on ? 'none' : 'block';
  }

  /* ─────────────────────────────────────────────
     FILTERS — all data from BUDGET_LINES
  ───────────────────────────────────────────── */

  // Months covered by the selected date range as Set keys "year-month"
  function monthSet() {
    const s = new Set();
    activeMonths().forEach(m => s.add(m.year + '-' + m.month));
    return s;
  }

  // All GASTOS lines (any month in range has non-zero real)
  function gastosFiltrados() {
    const ms = activeMonths();
    return _lines.filter(l =>
      l.section === 'GASTOS' &&
      ms.some(m => (l.real[m.month - 1] || 0) !== 0)
    );
  }

  // All INGRESOS lines (any month in range has non-zero real)
  function ingresosFiltrados() {
    const ms = activeMonths();
    return _lines.filter(l =>
      l.section === 'INGRESOS' &&
      ms.some(m => (l.real[m.month - 1] || 0) !== 0)
    );
  }

  // Sum real[month-1] for given month across matching lines
  function sumReal(lines, month) {
    return lines.reduce((s, l) => s + (l.real[month - 1] || 0), 0);
  }

  // Sum real across all active months
  function sumRealAll(lines) {
    const ms = activeMonths();
    return lines.reduce((s, l) => s + ms.reduce((ss, m) => ss + (l.real[m.month - 1] || 0), 0), 0);
  }

  /* ─────────────────────────────────────────────
     TABLE HELPERS
  ───────────────────────────────────────────── */
  function buildThead(firstLabel, colDefs) {
    // colDefs: [{label, color?}]
    let ths = `<th class="rpt-th-first">${firstLabel}</th>`;
    colDefs.forEach(c => {
      const inner = c.color
        ? `<div class="rpt-th-inner">${c.label}<div class="rpt-th-bar" style="background:${c.color}"></div></div>`
        : c.label;
      ths += `<th class="rpt-th">${inner}</th>`;
    });
    ths += `<th class="rpt-th rpt-th-total">Total</th>`;
    return `<thead><tr>${ths}</tr></thead>`;
  }

  function totRow(label, vals, totalColor) {
    const tot = vals.reduce((a,b) => a+(b||0), 0);
    let tds = vals.map(v => `<td class="rpt-td rpt-tot-num">${fmt(v)}</td>`).join('');
    tds += `<td class="rpt-td rpt-tot-num" style="color:${totalColor||'#60a5fa'}">${fmt(tot)}</td>`;
    return `<tr class="rpt-tot-row"><td class="rpt-td rpt-tot-label">${label}</td>${tds}</tr>`;
  }

  function detailRows(id, txns, colspan) {
    if (!txns || !txns.length) return '';
    const inner = txns.map(t =>
      `<div class="rpt-dtx">
        <span class="rpt-dtx-d">${t.mes}</span>
        <span class="rpt-dtx-c">${t.concepto}</span>
        <span class="rpt-dtx-a">${t.cuenta}</span>
        <span class="rpt-dtx-m${t.income?' rpt-gn':''}">${t.income?'+':''}${fmtPlain(t.importe)}</span>
      </div>`
    ).join('');
    return `<tr class="rpt-drow" id="${id}">
      <td class="rpt-dc" colspan="${colspan}">
        <div class="rpt-di">
          <div class="rpt-di-label">${txns.length} transacción${txns.length!==1?'es':''}</div>
          <div class="rpt-dtxns">${inner}</div>
        </div>
      </td>
    </tr>`;
  }

  // Convert budget line objects to flat transaction list for detailRows()
  // Uses breakdown JSON {monthIdx: [{d, a, c}]} when available, otherwise
  // falls back to real[] array (one entry per month)
  function linesToTxns(lines) {
    const txns = [];
    const ms   = activeMonths();
    lines.forEach(l => {
      let parsed = null;
      if (l.breakdown && l.breakdown !== 'None') {
        try { parsed = JSON.parse(l.breakdown); } catch(e) {}
      }
      if (parsed) {
        // breakdown: {"0":[{d,a,c}], "1":[...]} — key is 0-based month index
        Object.entries(parsed).forEach(([mIdx, arr]) => {
          const monthNum = parseInt(mIdx) + 1; // convert to 1-based
          if (!ms.some(m => m.month === monthNum)) return;
          const label = MONTH_SHORT[monthNum] || String(monthNum);
          (arr || []).forEach(t => {
            txns.push({
              mes: t.d || label,
              concepto: l.alias || l.concepto || t.c,
              cuenta: l.bank,
              importe: parseFloat(t.a) || 0,
              income: l.section === 'INGRESOS'
            });
          });
        });
      } else {
        // Fallback: one entry per active month with real value
        ms.forEach(m => {
          const v = l.real[m.month - 1] || 0;
          if (!v) return;
          txns.push({
            mes: MONTH_SHORT[m.month] || String(m.month),
            concepto: l.alias || l.concepto,
            cuenta: l.bank,
            importe: v,
            income: l.section === 'INGRESOS'
          });
        });
      }
    });
    return txns.sort((a,b) => String(a.mes).localeCompare(String(b.mes)));
  }

  // Like linesToTxns but respects existing groupings and aliases:
  // shows one row per line (alias||concepto + real[m]) instead of exploding breakdown entries.
  // Used for tarjeta detail where groupings have already been set up by the user.
  function linesToTxnsGrouped(lines) {
    const txns = [];
    const ms   = activeMonths();
    lines.forEach(l => {
      const name = l.alias || l.concepto;
      ms.forEach(m => {
        const v = l.real[m.month - 1] || 0;
        if (!v) return;
        txns.push({
          mes:      MONTH_SHORT[m.month] || String(m.month),
          concepto: name,
          cuenta:   l.bank,
          importe:  v,
          income:   false
        });
      });
    });
    return txns.sort((a,b) => String(a.mes).localeCompare(String(b.mes)));
  }

  /* ─────────────────────────────────────────────
     TAB: CASAS
  ───────────────────────────────────────────── */
  function renderCasas() {
    const gastos = gastosFiltrados();
    if (!gastos.length) return '<p class="rpt-empty">Sin datos de gastos en el período seleccionado.</p>';

    const ms = activeMonths();

    const configCasas = (AppState.config?.casas || []).map(c => c.name);
    const dataCasas   = [...new Set(gastos.map(l => l.casa).filter(Boolean))];
    const allCasas    = (configCasas.length ? configCasas.filter(c => dataCasas.includes(c)) : dataCasas).sort((a,b) => a.localeCompare(b,'es'));
    if (!allCasas.length) return '<p class="rpt-empty">No hay gastos con Casa asignada.</p>';

    // Apply multiselect filter
    if (!_selCasas) _selCasas = [...allCasas];
    const casas = allCasas.filter(c => _selCasas.includes(c));
    if (!casas.length) return buildMultiSelect('casas', 'Casas', allCasas, _selCasas) + '<p class="rpt-empty">Selecciona al menos una casa.</p>';

    const COLSPAN = casas.length + 2;
    const colDefs = casas.map((c, i) => ({ label: c, color: CASA_COLORS[i % CASA_COLORS.length] }));

    const configCats = Object.keys(AppState.config?.categorias || {});
    const dataCats   = [...new Set(gastos.map(l => l.categoria).filter(Boolean))];
    const cats = [...configCats, ...dataCats.filter(c => !configCats.includes(c))];

    let tbody = '';
    const grandTotals = new Array(casas.length).fill(0);

    cats.forEach(cat => {
      const catLines = gastos.filter(l => l.categoria === cat);
      if (!catLines.length) return;

      const catVals = casas.map(casa => sumRealAll(catLines.filter(l => l.casa === casa)));
      if (catVals.every(v => v === 0)) return;
      catVals.forEach((v, i) => grandTotals[i] += v);

      const catId = uid();
      let catTds = catVals.map(v => `<td class="rpt-td rpt-hi">${fmt(v)}</td>`).join('');
      catTds += `<td class="rpt-td rpt-hi">${fmt(catVals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${catId}')">
        <td class="rpt-td rpt-td-first">${xbtnSec(catId)}${cat}</td>${catTds}
      </tr>`;

      const subs = [...new Set(catLines.map(l => l.subcategoria).filter(Boolean))];
      subs.forEach(sub => {
        const subLines = catLines.filter(l => l.subcategoria === sub);
        const subVals  = casas.map(casa => sumRealAll(subLines.filter(l => l.casa === casa)));
        if (subVals.every(v => v === 0)) return;
        const subId = uid();
        const txns  = linesToTxns(subLines);
        let tds = subVals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi">${fmt(subVals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none"
          onclick="event.stopPropagation();Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-sub">${xbtn(subId)}${sub}</td>${tds}
        </tr>`;
        tbody += detailRows(subId, txns, COLSPAN);
      });

      const uncat = catLines.filter(l => !l.subcategoria);
      if (uncat.length) {
        const uVals = casas.map(casa => sumRealAll(uncat.filter(l => l.casa === casa)));
        if (uVals.some(v => v > 0)) {
          const subId = uid();
          let tds = uVals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
          tds += `<td class="rpt-td rpt-hi">${fmt(uVals.reduce((a,b)=>a+b,0))}</td>`;
          tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none"
            onclick="event.stopPropagation();Reporting.toggle('${subId}')">
            <td class="rpt-td rpt-td-sub">${xbtn(subId)}Sin subcategoría</td>${tds}
          </tr>`;
          tbody += detailRows(subId, linesToTxns(uncat), COLSPAN);
        }
      }
    });

    tbody += totRow('Total por casa', grandTotals, '#60a5fa');
    return buildMultiSelect('casas', 'Casas', allCasas, _selCasas) +
      `<div class="rpt-table-outer"><div class="rpt-table-wrap"><table class="rpt-table">${buildThead('Concepto', colDefs)}<tbody>${tbody}</tbody></table></div></div>`;
  }

  /* ─────────────────────────────────────────────
     TAB: CATEGORÍAS
  ───────────────────────────────────────────── */
  function renderCategorias() {
    const gastos = gastosFiltrados();
    const ms     = activeMonths();

    const configCats = Object.keys(AppState.config?.categorias || {});
    const dataCats   = [...new Set(gastos.map(l => l.categoria).filter(Boolean))];
    const allCats    = [...configCats, ...dataCats.filter(c => !configCats.includes(c))].sort((a,b) => a.localeCompare(b,'es'));

    if (!_selCategorias) _selCategorias = [...allCats];
    const selCats = allCats.filter(c => _selCategorias.includes(c));

    const msHtml = buildMultiSelect('categorias', 'Categoría', allCats, _selCategorias);

    if (!selCats.length) return msHtml + '<p class="rpt-empty">Selecciona al menos una categoría.</p>';

    const COLSPAN = ms.length + 2;
    const colDefs = ms.map(m => ({ label: monthLabel(m) }));
    const totals  = new Array(ms.length).fill(0);
    let tbody     = '';

    selCats.forEach(cat => {
      const catLines = gastos.filter(l => l.categoria === cat);
      if (!catLines.length) return;

      const catVals = ms.map(m => sumReal(catLines, m.month));
      if (catVals.every(v => v === 0)) return;
      catVals.forEach((v, i) => totals[i] += v);

      const catId = uid();
      let catTds = catVals.map(v => `<td class="rpt-td rpt-hi">${fmt(v)}</td>`).join('');
      catTds += `<td class="rpt-td rpt-hi">${fmt(catVals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${catId}')">
        <td class="rpt-td rpt-td-first">${xbtnSec(catId)}${cat}</td>${catTds}
      </tr>`;

      const subs = [...new Set(catLines.map(l => l.subcategoria).filter(Boolean))];
      subs.forEach(sub => {
        const subLines = catLines.filter(l => l.subcategoria === sub);
        const vals     = ms.map(m => sumReal(subLines, m.month));
        if (vals.every(v => v === 0)) return;
        const subId = uid();
        let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none" onclick="event.stopPropagation();Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-sub">${xbtn(subId)}${sub}</td>${tds}
        </tr>`;
        tbody += detailRows(subId, linesToTxns(subLines), COLSPAN);
      });

      const uncat = catLines.filter(l => !l.subcategoria);
      if (uncat.length) {
        const vals = ms.map(m => sumReal(uncat, m.month));
        if (vals.some(v => v > 0)) {
          const subId = uid();
          let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
          tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
          tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none" onclick="event.stopPropagation();Reporting.toggle('${subId}')">
            <td class="rpt-td rpt-td-sub">${xbtn(subId)}Sin subcategoría</td>${tds}
          </tr>`;
          tbody += detailRows(subId, linesToTxns(uncat), COLSPAN);
        }
      }
    });

    tbody += totRow('Total selección', totals);
    return msHtml + `<div class="rpt-table-outer"><div class="rpt-table-wrap"><table class="rpt-table">${buildThead('Categoría / Subcategoría', colDefs)}<tbody>${tbody}</tbody></table></div></div>`;
  }

  /* ─────────────────────────────────────────────
     TAB: HIJOS
  ───────────────────────────────────────────── */
  function renderHijos() {
    const gastos   = gastosFiltrados();
    const ms       = activeMonths();
    const allHijos = HIJOS_CATS.filter(h =>
      Object.keys(AppState.config?.categorias || {}).includes(h) || gastos.some(l => l.categoria === h)
    ).sort((a,b) => a.localeCompare(b,'es'));
    if (!allHijos.length) return '<p class="rpt-empty">No se encontraron categorías de hijos.</p>';

    if (!_selHijos) _selHijos = [...allHijos];
    const hijoCats = allHijos.filter(h => _selHijos.includes(h));
    const msHtml   = buildMultiSelect('hijos', 'Hijos', allHijos, _selHijos);

    if (!hijoCats.length) return msHtml + '<p class="rpt-empty">Selecciona al menos un hijo.</p>';

    if (_hijosView === 'anual') {
      const COLSPAN = hijoCats.length + 2;
      const colDefs = hijoCats.map((h, i) => ({ label: h, color: HIJOS_COLORS[i % HIJOS_COLORS.length] }));
      const hijoLines = gastos.filter(l => hijoCats.includes(l.categoria));
      const allSubs   = [...new Set(hijoLines.map(l => l.subcategoria).filter(Boolean))];
      const totals    = new Array(hijoCats.length).fill(0);
      let tbody = '';

      allSubs.forEach(sub => {
        const vals = hijoCats.map(h => sumRealAll(hijoLines.filter(l => l.categoria===h && l.subcategoria===sub)));
        if (vals.every(v => v === 0)) return;
        vals.forEach((v, i) => totals[i] += v);
        const subId = uid();
        let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-first">${xbtn(subId)}${sub}</td>${tds}
        </tr>`;
        tbody += detailRows(subId, linesToTxns(hijoLines.filter(l=>l.subcategoria===sub)), COLSPAN);
      });

      tbody += totRow('Total por hijo', totals, '#60a5fa');
      return msHtml + `<div class="rpt-table-outer"><div class="rpt-table-wrap"><table class="rpt-table">${buildThead('Concepto', colDefs)}<tbody>${tbody}</tbody></table></div></div>`;

    } else {
      const COLSPAN = ms.length + 2;
      const colDefs = ms.map(m => ({ label: monthLabel(m) }));
      const totals  = new Array(ms.length).fill(0);
      let tbody = '';

      hijoCats.forEach(h => {
        const hLines = gastos.filter(l => l.categoria === h);
        const hijoId = uid();
        const vals   = ms.map(m => sumReal(hLines, m.month));
        vals.forEach((v, i) => totals[i] += v);
        let tds = vals.map(v => `<td class="rpt-td rpt-hi">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi" style="color:#60a5fa">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${hijoId}')">
          <td class="rpt-td rpt-td-first">${xbtnSec(hijoId)}${h}</td>${tds}
        </tr>`;
        const subs = [...new Set(hLines.map(l => l.subcategoria).filter(Boolean))];
        subs.forEach(sub => {
          const subLines = hLines.filter(l => l.subcategoria === sub);
          const sVals    = ms.map(m => sumReal(subLines, m.month));
          if (sVals.every(v => v === 0)) return;
          const subId = uid();
          let sTds = sVals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
          sTds += `<td class="rpt-td rpt-hi">${fmt(sVals.reduce((a,b)=>a+b,0))}</td>`;
          tbody += `<tr class="rpt-sub-row" data-g="${hijoId}" style="display:none"
            onclick="event.stopPropagation();Reporting.toggle('${subId}')">
            <td class="rpt-td rpt-td-sub">${xbtn(subId)}${sub}</td>${sTds}
          </tr>`;
          tbody += detailRows(subId, linesToTxns(subLines), COLSPAN);
        });
      });

      tbody += totRow('Total hijos', totals, '#60a5fa');
      return msHtml + `<div class="rpt-table-outer"><div class="rpt-table-wrap"><table class="rpt-table">${buildThead('Hijo', colDefs)}<tbody>${tbody}</tbody></table></div></div>`;
    }
  }

  /* ─────────────────────────────────────────────
     TAB: TARJETAS
  ───────────────────────────────────────────── */
  function renderTarjetas() {
    const ms      = activeMonths();
    const COLSPAN = ms.length + 2;
    const colDefs = ms.map(m => ({ label: monthLabel(m) }));

    // All TARJETAS lines (all banks)
    const allTarjetaLines = _lines.filter(l => l.section === 'TARJETAS');

    // Parents = tarjeta rows (parentId empty) — these are the cards (incl. associated ones)
    // Children = individual charges that belong to a parent card
    const parentLines   = allTarjetaLines.filter(l => !l.parentId);
    const childrenLines = allTarjetaLines.filter(l =>  !!l.parentId);

    if (!parentLines.length) {
      return '<p class="rpt-empty">Sin tarjetas en el presupuesto. Añade líneas TARJETAS en Budget.</p>';
    }

    // Display name for each parent: alias if set, else concepto
    // Sort alphabetically
    const allNames = [...new Set(
      parentLines.map(l => l.alias || l.concepto)
    )].sort((a,b) => a.localeCompare(b,'es'));

    if (!_selTarjetas) _selTarjetas = [...allNames];
    // Remove any stale names that no longer exist in data (but keep empty array as valid "none selected")
    else _selTarjetas = _selTarjetas.filter(n => allNames.includes(n));

    const selNames = allNames.filter(n => _selTarjetas.includes(n));
    const msHtml   = buildMultiSelect('tarjetas', 'Tarjeta', allNames, _selTarjetas);

    if (!selNames.length) return msHtml + '<p class="rpt-empty">Selecciona al menos una tarjeta.</p>';

    const totals = new Array(ms.length).fill(0);
    let tbody    = '';
    let hasData  = false;

    selNames.forEach(name => {
      // Find all parent lines matching this name (could be in multiple banks)
      const cardParents = parentLines.filter(l => (l.alias || l.concepto) === name);

      // Find all children belonging to these parents
      const cardChildren = childrenLines.filter(c =>
        cardParents.some(p => p.id === c.parentId)
      );

      // Total per month = parent.real[m] + sum(children.real[m])
      // (parent may have its own charges AND children may have theirs — e.g. Sylvia)
      const vals = ms.map(m => {
        const mIdx = m.month - 1;
        const parentSum   = cardParents.reduce((s, l) => s + (l.real[mIdx] || 0), 0);
        const childrenSum = cardChildren.reduce((s, l) => s + (l.real[mIdx] || 0), 0);
        return parentSum + childrenSum;
      });

      if (vals.every(v => v === 0)) {
        // Card exists but no activity in this period
        let tds = vals.map(() => `<td class="rpt-td"><span class="rpt-nil">—</span></td>`).join('');
        tds += `<td class="rpt-td"><span class="rpt-nil">—</span></td>`;
        tbody += `<tr class="rpt-sub-row">
          <td class="rpt-td rpt-td-first" style="color:var(--text-tertiary)">${name}</td>${tds}
        </tr>`;
        return;
      }

      hasData = true;
      vals.forEach((v, i) => totals[i] += v);
      const cardId = uid();

      // Detail: children lines with their aliases/groupings already applied
      // Use grouped version so Amazon shows once (not 10x Kindle), with alias name
      const detailLines = cardChildren.length ? cardChildren : cardParents;
      const txns = linesToTxnsGrouped(detailLines);

      let tds = vals.map(v => `<td class="rpt-td rpt-hi">${fmt(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${cardId}')">
        <td class="rpt-td rpt-td-first">${xbtn(cardId)}${name}</td>${tds}
      </tr>`;
      tbody += detailRows(cardId, txns, COLSPAN);
    });

    if (hasData) tbody += totRow('Total Tarjetas', totals, '#60a5fa');
    return msHtml + `<div class="rpt-table-outer"><div class="rpt-table-wrap"><table class="rpt-table">${buildThead('Tarjeta', colDefs)}<tbody>${tbody}</tbody></table></div></div>`;
  }

  /* ─────────────────────────────────────────────
     TAB: INGRESOS
  ───────────────────────────────────────────── */
  function renderIngresos() {
    const ing     = ingresosFiltrados();
    const ms      = activeMonths();
    const COLSPAN = ms.length + 2;
    const colDefs = ms.map(m => ({ label: monthLabel(m) }));

    if (!ing.length) return '<p class="rpt-empty">Sin ingresos en el período seleccionado.</p>';

    const allConceptos = [...new Set(ing.map(l => l.alias || l.concepto))].sort((a,b) => a.localeCompare(b,'es'));
    if (!_selIngresos) _selIngresos = [...allConceptos];
    const selConceptos = allConceptos.filter(c => _selIngresos.includes(c));
    const msHtml = buildMultiSelect('ingresos', 'Concepto', allConceptos, _selIngresos);

    if (!selConceptos.length) return msHtml + '<p class="rpt-empty">Selecciona al menos un concepto.</p>';

    const filteredIng = ing.filter(l => selConceptos.includes(l.alias || l.concepto));
    const totals = new Array(ms.length).fill(0);
    let tbody = '';

    filteredIng.forEach(l => {
      const vals = ms.map(m => l.real[m.month - 1] || 0);
      if (vals.every(v => v === 0)) return;
      vals.forEach((v, i) => totals[i] += v);
      const lId  = uid();
      const txns = linesToTxns([l]);
      let tds = vals.map(v => `<td class="rpt-td rpt-gn">${fmt(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-gn rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${lId}')">
        <td class="rpt-td rpt-td-first">${xbtn(lId)}${l.alias||l.concepto}</td>${tds}
      </tr>`;
      tbody += detailRows(lId, txns, COLSPAN);
    });

    const tot = totals.reduce((a,b)=>a+b,0);
    let totTds = totals.map(v => `<td class="rpt-td rpt-tot-num" style="color:#4ade80">${fmt(v)}</td>`).join('');
    totTds += `<td class="rpt-td rpt-tot-num" style="color:#4ade80">${fmt(tot)}</td>`;
    tbody += `<tr class="rpt-tot-row"><td class="rpt-td rpt-tot-label">Total Ingresos</td>${totTds}</tr>`;

    return msHtml + `<div class="rpt-table-outer"><div class="rpt-table-wrap"><table class="rpt-table">${buildThead('Concepto', colDefs)}<tbody>${tbody}</tbody></table></div></div>`;
  }

    /* ─────────────────────────────────────────────
     RENDER SHELL
  ───────────────────────────────────────────── */
  function tabLabel(t) {
    return {casas:'Casas',categorias:'Categorías',hijos:'Hijos',tarjetas:'Tarjetas',ingresos:'Ingresos'}[t];
  }

  function toolbarHtml() {
    const hints = {
      casas:      '+ amplía categoría · + en subcategoría muestra transacciones',
      categorias: '+ en subcategoría muestra transacciones individuales',
      hijos:      'Vista anual: columnas por hijo · Vista mensual: fila por hijo expandible',
      tarjetas:   '+ muestra transacciones individuales',
      ingresos:   '+ muestra transacciones individuales',
    };
    const titles = {
      casas:      'Gastos por Casa y Categoría',
      categorias: 'Análisis por Categoría',
      hijos:      'Gasto por Hijo',
      tarjetas:   'Gasto por Tarjeta',
      ingresos:   'Ingresos por Concepto',
    };

    let right = '';
    if (_tab === 'hijos') {
      right += `<button class="ctl${_hijosView==='anual'?' on':''}" onclick="Reporting.setHijosView('anual')">Vista anual</button>`;
      right += `<button class="ctl${_hijosView==='mensual'?' on':''}" onclick="Reporting.setHijosView('mensual')">Vista mensual</button>`;
    }
    right += `<button class="ctl" onclick="Reporting.exportCSV()">↓ CSV</button>`;

    return `<div class="rpt-toolbar">
      <div>
        <div class="rpt-toolbar-title">${titles[_tab]}</div>
        <div class="rpt-toolbar-sub">${hints[_tab]}</div>
      </div>
      <div class="rpt-toolbar-right">${right}</div>
    </div>`;
  }

  function render() {
    if (!_loaded) return;
    _uid = 0;

    const tabs = ['casas','categorias','hijos','tarjetas','ingresos'];
    const labels = { casas:'Casas', categorias:'Categorías', hijos:'Hijos', tarjetas:'Tarjetas', ingresos:'Ingresos' };
    const hints  = {
      casas:      '+ amplía categoría · + en subcategoría muestra transacciones',
      categorias: '+ en categoría muestra subcategorías · + en subcategoría muestra transacciones',
      hijos:      'Vista anual: columnas por hijo · Vista mensual: fila por hijo',
      tarjetas:   '+ muestra transacciones de la tarjeta',
      ingresos:   '+ muestra transacciones individuales',
    };
    const titles = {
      casas:'Gastos por Casa y Categoría', categorias:'Análisis por Categoría',
      hijos:'Gasto por Hijo', tarjetas:'Gasto por Tarjeta', ingresos:'Ingresos por Concepto',
    };

    // ── Controls right ──
    let ctrlRight = '';
    if (_tab === 'hijos') {
      ctrlRight += `<button class="ctl${_hijosView==='anual'?' on':''}" onclick="Reporting.setHijosView('anual')">Anual</button>`;
      ctrlRight += `<button class="ctl${_hijosView==='mensual'?' on':''}" onclick="Reporting.setHijosView('mensual')">Mensual</button>`;
    }
    ctrlRight += `<button class="ctl" onclick="Reporting.exportCSV()">↓ CSV</button>`;
    ctrlRight += `<button class="ctl${_view==='ytd'?' on':''}" onclick="Reporting.setView('ytd')">YTD</button>`;
    ctrlRight += `<button class="ctl${_view==='12m'?' on':''}" onclick="Reporting.setView('12m')">12m</button>`;
    ctrlRight += `<button class="ctl" onclick="Reporting.toggleDatePicker()">📅 ${fmtDateRange()} ▾</button>`;
    ctrlRight += `<button class="btn btn-primary" onclick="Reporting.reload()" style="font-size:12px;padding:5px 12px;">↺ Recargar</button>`;

    // ── Tab bar ──
    const tabsHtml = `<div class="rpt-tabs">
      ${tabs.map(t => `<button class="rpt-tab${_tab===t?' active':''}" onclick="Reporting.switchTab('${t}')">${labels[t]}</button>`).join('')}
    </div>`;

    // ── Table content ──
    let tableHtml = '';
    if      (_tab === 'casas')      tableHtml = renderCasas();
    else if (_tab === 'categorias') tableHtml = renderCategorias();
    else if (_tab === 'hijos')      tableHtml = renderHijos();
    else if (_tab === 'tarjetas')   tableHtml = renderTarjetas();
    else if (_tab === 'ingresos')   tableHtml = renderIngresos();

    document.getElementById('rpt-wrap').innerHTML = `
      <div class="rpt-sticky">
        <div class="rpt-controls-row">
          <div>
            <div class="rpt-toolbar-title">${titles[_tab]}</div>
            <div class="rpt-toolbar-sub">${hints[_tab]}</div>
          </div>
          <div class="rpt-controls-right">${ctrlRight}</div>
        </div>
        <div class="rpt-datepicker" id="rpt-dp">
          <label>Desde</label>
          <input type="date" id="rpt-from" value="${_dateFrom.toISOString().slice(0,10)}">
          <label>Hasta</label>
          <input type="date" id="rpt-to"   value="${_dateTo.toISOString().slice(0,10)}">
          <button class="btn btn-primary" onclick="Reporting.applyDates()" style="font-size:12px;padding:5px 12px;">Aplicar</button>
          <button class="ctl" onclick="Reporting.preset('ytd')">Este año</button>
          <button class="ctl" onclick="Reporting.preset('12m')">Últ 12m</button>
          <button class="ctl" onclick="Reporting.preset('prev')">Año ant</button>
        </div>
        ${tabsHtml}
      </div>
      <div class="rpt-body">${tableHtml}</div>
    `;
  }




  /* ─────────────────────────────────────────────
     MULTISELECT STATE HELPERS
  ───────────────────────────────────────────── */
  function _getTabSel(tabKey) {
    if (tabKey === 'casas')      return _selCasas;
    if (tabKey === 'categorias') return _selCategorias;
    if (tabKey === 'hijos')      return _selHijos;
    if (tabKey === 'tarjetas')   return _selTarjetas;
    if (tabKey === 'ingresos')   return _selIngresos;
    return null;
  }
  function _setTabSel(tabKey, val) {
    if (tabKey === 'casas')      _selCasas      = val;
    if (tabKey === 'categorias') _selCategorias = val;
    if (tabKey === 'hijos')      _selHijos      = val;
    if (tabKey === 'tarjetas')   _selTarjetas   = val;
    if (tabKey === 'ingresos')   _selIngresos   = val;
  }

  return {
    async init(force) {
      initDates();
      const root = document.getElementById('reporting-content');
      if (!root) return;

      // Install ONE global delegated listener to close dropdowns on outside click
      // Use a flag so we only install it once across re-inits
      if (!window._rptClickListenerInstalled) {
        window._rptClickListenerInstalled = true;
        document.addEventListener('click', (e) => {
          // If click is NOT inside any .rpt-ms element, close all open panels
          if (!e.target.closest('.rpt-ms')) {
            document.querySelectorAll('.rpt-ms-panel.open')
              .forEach(p => p.classList.remove('open'));
          }
        }, true); // capture phase so it fires before stopPropagation
      }

      // If already loaded and not forced, just re-render without destroying DOM
      if (_loaded && !force) { render(); return; }

      root.innerHTML = `
        <div id="rpt-loading" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:80px 0">
          <div class="spin"></div>
          <div class="rpt-load-text">Cargando datos desde Google Sheets...</div>
        </div>
        <div id="rpt-wrap" style="display:none;"></div>
      `;

      await loadData(force);
      if (_loaded) render();
    },

    switchTab(tab)   { _tab = tab; render(); },
    setView(v) {
      applyPresetDates(v);
      const fi = document.getElementById('rpt-from');
      const ti = document.getElementById('rpt-to');
      if (fi) fi.value = _dateFrom.toISOString().slice(0,10);
      if (ti) ti.value = _dateTo.toISOString().slice(0,10);
      render();
    },
    setHijosView(v)  { _hijosView = v; render(); },

    // Multiselect handlers
    msTogglePanel(msId) {
      const panel = document.getElementById(`ms-panel-${msId}`);
      if (!panel) return;
      const isOpen = panel.classList.contains('open');
      // Close all panels
      document.querySelectorAll('.rpt-ms-panel.open').forEach(p => p.classList.remove('open'));
      if (!isOpen) panel.classList.add('open');
    },

    msToggle(msId, item) {
      const el = document.getElementById(`ms-${msId}`);
      if (!el) return;
      const allItems = JSON.parse(el.dataset.all || '[]');
      let sel = _getTabSel(msId) || [...allItems];
      if (!Array.isArray(sel)) sel = [...allItems];
      const idx = sel.indexOf(item);
      if (idx >= 0) sel.splice(idx, 1); else sel.push(item);
      _setTabSel(msId, sel.length === allItems.length ? null : [...sel]);
      render();
      // Re-open panel after re-render
      const panel = document.getElementById(`ms-panel-${msId}`);
      if (panel) panel.classList.add('open');
    },

    msToggleAll(msId, checked) {
      const el = document.getElementById(`ms-${msId}`);
      if (!el) return;
      const allItems = JSON.parse(el.dataset.all || '[]');
      _setTabSel(msId, checked ? null : []);
      render();
      const panel = document.getElementById(`ms-panel-${msId}`);
      if (panel) panel.classList.add('open');
    },

    msFilter(msId, query) {
      const container = document.getElementById(`ms-opts-${msId}`);
      if (!container) return;
      const q = query.toLowerCase().trim();
      container.querySelectorAll('.rpt-ms-opt').forEach(opt => {
        const text = opt.querySelector('span')?.textContent?.toLowerCase() || '';
        opt.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    },

    toggleSec(id) {
      const rows = document.querySelectorAll(`[data-g="${id}"]`);
      const btn  = document.getElementById('b' + id);
      const open = btn && btn.textContent === '−';
      rows.forEach(r => r.style.display = open ? 'none' : '');
      if (btn) btn.textContent = open ? '+' : '−';
    },

    toggle(id) {
      const row = document.getElementById(id);
      const btn = document.getElementById('b' + id);
      if (!row) return;
      const open = row.classList.contains('open');
      row.classList.toggle('open', !open);
      if (btn) btn.textContent = open ? '+' : '−';
    },

    toggleDatePicker() {
      const dp = document.getElementById('rpt-dp');
      if (!dp) return;
      const isVisible = dp.style.display === 'flex';
      dp.style.display = isVisible ? '' : 'flex';
    },

    applyDates() {
      const f = document.getElementById('rpt-from')?.value;
      const t = document.getElementById('rpt-to')?.value;
      if (f) _dateFrom = new Date(f);
      if (t) _dateTo   = new Date(t);
      render();
    },

    preset(p) {
      applyPresetDates(p);
      const fi = document.getElementById('rpt-from');
      const ti = document.getElementById('rpt-to');
      if (fi) fi.value = _dateFrom.toISOString().slice(0,10);
      if (ti) ti.value = _dateTo.toISOString().slice(0,10);
      render();
    },

    async reload() {
      _loaded = false;
      await this.init(true);
    },

    exportCSV() {
      const table = document.querySelector('.rpt-table');
      if (!table) return;
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('th,td')].map(c => `"${c.textContent.replace(/"/g,'""').trim()}"`);
        if (cells.length) rows.push(cells.join(','));
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `informe-${_tab}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    },
  };
})();
