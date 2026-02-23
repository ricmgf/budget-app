/**
 * Budget Grid v12.0 — Rules engine migration, drawer grouping, dynamic exclusions/consolidation
 * v11: Iberia CARD regex, titulares, breakdown modal, Visa groups, Revolut parser
 * v12: RULES sheet unified schema (categorize/group/exclude), hardcoded constants removed,
 *      drawer "Agrupar conceptos" feature, BudgetLogic.getExclusionPatterns/getGroupRules
 */
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Exclusion patterns are now loaded from RULES sheet via BudgetLogic.getExclusionPatterns()

const BudgetGrid = {
  accounts: [], lines: [], summaries: [], activeBank: null,
  bankMeta: {},
  _collapsed: {},

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    await BudgetLogic.loadRules();
    this._buildMeta();
    if (this.accounts.length > 0 && !this.activeBank) this.activeBank = this.accounts[0].name;
    this.render();
  },

  _refreshing: false,
  _renderVersion: 0,

  async refresh() {
    if (this._refreshing) { console.log('[refresh] Already refreshing, skipping'); return; }
    this._refreshing = true;
    this._vgrpRegistry = {};
    // Show subtle loading indicator on year nav
    const yearNav = document.getElementById('year-nav');
    if (yearNav) yearNav.style.opacity = '0.5';
    try {
      this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
      this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
      this._buildMeta();
      this.render();
    } catch(err) {
      console.error('[refresh] Error:', err);
      // If it's an auth error, try to re-auth silently without page reload
      if (err?.status === 401 || String(err).includes('401')) {
        try {
          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('auth timeout')), 5000);
            tokenClient.callback = (resp) => {
              clearTimeout(t);
              resp.error ? reject(resp) : resolve();
            };
            tokenClient.requestAccessToken({ prompt: '' });
          });
          // Retry after silent re-auth
          this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
          this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
          this._buildMeta();
          this.render();
        } catch(authErr) {
          // Show non-intrusive retry banner instead of losing the page
          const container = document.getElementById('budget-grid-container') || document.body;
          const banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:12px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.15)';
          banner.innerHTML = '<span style="color:#991b1b">⚠️ Sesión expirada</span><button onclick="this.parentElement.remove();BudgetGrid.refresh();" style="background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px">Reintentar</button>';
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 15000);
        }
      }
    } finally {
      this._refreshing = false;
      if (yearNav) yearNav.style.opacity = '';
    }
  },

  async changeYear(delta) {
    AppState.currentYear += delta;
    document.getElementById('year-display').textContent = AppState.currentYear;
    await this.refresh();
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

  // ══════════ RENDER ══════════

  render() {
    const ct = document.getElementById('budget-content');
    if (!ct) return;
    const wrap = ct.querySelector('.budget-grid-wrap');
    const sT = wrap ? wrap.scrollTop : 0, sL = wrap ? wrap.scrollLeft : 0;

    if (!this.accounts.length) { ct.innerHTML = '<div style="padding:60px;text-align:center;"><p style="font-size:18px;font-weight:600;">No hay bancos configurados</p></div>'; return; }

    const bk = this.lines.filter(l => l.bank === this.activeBank);
    const stableSort = (a, b) => (a.sortOrder - b.sortOrder) || (a.sheetRow - b.sheetRow);
    const groupRules = BudgetLogic.getGroupRules ? BudgetLogic.getGroupRules(this.activeBank) : [];
    // Visual group consolidation: if group rules exist and individual lines haven't been
    // consolidated in the sheet yet, collapse them into virtual group lines at render time
    // Registry of virtual group lines created this render cycle.
    // Keyed by vgrp_ id → array of real child line objects.
    // openDrawer uses this to open the first real child when a virtual is clicked.
    this._vgrpRegistry = {};

    const applyGroups = (lines) => {
      const result = [];
      const consumed = new Set();

      // ── ALIAS FUSION PASS ────────────────────────────────────────────
      // Lines with the same non-empty alias are fused into a single virtual
      // row regardless of concepto. This lets users unify any lines manually
      // by setting the same alias in the drawer.
      // Safety: only fuse when there are 2+ lines sharing the alias AND
      // each line has a distinct month with value (prevents accidental fusion
      // of legitimately separate rows that happen to share a label).
      const aliasBuckets = {};
      lines.forEach(l => {
        const a = (l.alias || '').trim();
        if (!a) return;
        if (!aliasBuckets[a]) aliasBuckets[a] = [];
        aliasBuckets[a].push(l);
      });

      Object.entries(aliasBuckets).forEach(([alias, group]) => {
        if (group.length < 2) return; // nothing to fuse
        // Always fuse — picker handles multiple values in the same month
        const real = new Array(12).fill(0);
        const plan = new Array(12).fill(0);
        group.forEach(l => {
          for (let m = 0; m < 12; m++) {
            real[m] += l.real[m] || 0;
            plan[m] += l.plan[m] || 0;
          }
        });
        // Merge breakdowns from all lines in the group
        const mergedBd = {};
        group.forEach(l => {
          if (!l.breakdown) return;
          try {
            const bd = JSON.parse(l.breakdown);
            Object.entries(bd).forEach(([mKey, items]) => {
              if (!mergedBd[mKey]) mergedBd[mKey] = [];
              mergedBd[mKey] = mergedBd[mKey].concat(items);
            });
          } catch(e) {}
        });
        const mergedBdStr = Object.keys(mergedBd).length ? JSON.stringify(mergedBd) : '';
        const vId = 'vgrp_alias_' + alias.replace(/\s+/g, '_');
        const virtual = Object.assign({}, group[0], {
          id: vId, alias, isVirtual: true, real, plan, sheetRow: -1,
          breakdown: mergedBdStr
        });
        this._vgrpRegistry[vId] = group;
        result.push(virtual);
        group.forEach(l => consumed.add(l.id));
      });

      // ── GROUP RULES PASS ─────────────────────────────────────────────
      if (!groupRules.length) {
        lines.forEach(l => { if (!consumed.has(l.id)) result.push(l); });
        return result;
      }

      // Pre-pass: identify real consolidated header lines (concepto === rule.label, sheetRow > 0).
      const realHeaders = new Set();
      groupRules.forEach(r => {
        lines.filter(x => x.concepto === r.label && x.sheetRow > 0 && !consumed.has(x.id))
             .forEach(x => realHeaders.add(x.id));
      });

      // REALHEADER FUSION: if multiple realHeaders share the same concepto
      // and their months don't overlap, fuse them into one row.
      const rhByConcepto = {};
      realHeaders.forEach(id => {
        const l = lines.find(x => x.id === id);
        if (!l) return;
        if (!rhByConcepto[l.concepto]) rhByConcepto[l.concepto] = [];
        rhByConcepto[l.concepto].push(l);
      });
      Object.entries(rhByConcepto).forEach(([concepto, group]) => {
        if (group.length < 2) return;
        const usedMonths = new Set();
        let overlaps = false;
        group.forEach(l => {
          for (let m = 0; m < 12; m++) {
            if ((l.real[m] || l.plan[m]) && usedMonths.has(m)) overlaps = true;
            if (l.real[m] || l.plan[m]) usedMonths.add(m);
          }
        });
        if (overlaps) return;
        const real = new Array(12).fill(0);
        const plan = new Array(12).fill(0);
        group.forEach(l => {
          for (let m = 0; m < 12; m++) {
            real[m] += l.real[m] || 0;
            plan[m] += l.plan[m] || 0;
          }
        });
        const vId = 'vgrp_rh_' + concepto.replace(/\s+/g, '_');
        const virtual = Object.assign({}, group[0], {
          id: vId, isVirtual: true, real, plan, sheetRow: -1
        });
        this._vgrpRegistry[vId] = group;
        result.push(virtual);
        group.forEach(l => { consumed.add(l.id); realHeaders.delete(l.id); });
      });

      lines.forEach(l => {
        if (consumed.has(l.id)) return;

        // Single realHeader — emit directly, consume stale siblings
        if (realHeaders.has(l.id)) {
          const rule = groupRules.find(r => r.label === l.concepto);
          if (rule) {
            lines.forEach(x => {
              if (!consumed.has(x.id) && x !== l && x.concepto &&
                  x.concepto.toUpperCase().includes(rule.pattern) &&
                  !realHeaders.has(x.id)) {
                consumed.add(x.id);
              }
            });
          }
          result.push(l);
          consumed.add(l.id);
          return;
        }

        // Find matching group rule
        const matchingRule = groupRules.find(r =>
          l.concepto && l.concepto.toUpperCase().includes(r.pattern)
        );
        if (matchingRule) {
          const label = matchingRule.label;
          const hasRealHeader = lines.some(x => x.concepto === label && x.sheetRow > 0 && !consumed.has(x.id));
          if (hasRealHeader) { consumed.add(l.id); return; }

          const siblings = lines.filter(x =>
            !consumed.has(x.id) &&
            !realHeaders.has(x.id) &&
            x.concepto && x.concepto.toUpperCase().includes(matchingRule.pattern)
          );
          if (siblings.length > 1) {
            const real = new Array(12).fill(0);
            siblings.forEach(s => { for (let i = 0; i < 12; i++) real[i] += s.real[i] || 0; });
            const plan = new Array(12).fill(0);
            siblings.forEach(s => { for (let i = 0; i < 12; i++) plan[i] += s.plan[i] || 0; });
            const vId = 'vgrp_' + matchingRule.pattern;
            const virtual = Object.assign({}, siblings[0], {
              id: vId, concepto: label, alias: '', isVirtual: true,
              real, plan, sheetRow: -1
            });
            this._vgrpRegistry[vId] = siblings;
            result.push(virtual);
            siblings.forEach(s => consumed.add(s.id));
            return;
          }
        }
        if (!consumed.has(l.id)) result.push(l);
      });
      return result;
    };

    const G = applyGroups(bk.filter(l => l.section === 'GASTOS').sort(stableSort));
    const T = applyGroups(bk.filter(l => l.section === 'TARJETAS').sort(stableSort));
    const I = applyGroups(bk.filter(l => l.section === 'INGRESOS').sort(stableSort));
    const cm = AppState.currentMonth - 1;
    const acc = this.accounts.find(a => a.name === this.activeBank);
    // Count uncategorized: everything except TARJETAS headers (titular lines like Daniel Iberia/Ricardo Amex)
    // which never need a category. Includes GASTOS, INGRESOS, and TARJETAS children.
    const unc = [...G,...T,...I].filter(l => !l.categoria && !(l.section === 'TARJETAS' && !l.parentId)).length;

    let h = this._yearNav();
    h += this._tabs(unc);
    h += '<div class="budget-grid-wrap"><table class="budget-grid">';
    h += this._thead(cm);
    h += '<tbody>';
    h += this._secHdr('GASTOS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('GASTOS')">+ gasto</a> <a onclick="BudgetGrid.openImportDrawer('banco')">+ extracto</a></span>`);
    // Use tarjeta-style rendering if GASTOS has parent/child (e.g. Revolut with titular)
    const gHasParents = G.some(l => l.parentId) || G.some(l => G.some(c => c.parentId === (l.rawId || l.id)));
    h += gHasParents ? this._tarjetaRows(G, cm) : this._rows(G, cm);
    h += this._totRow('Total Gastos', G, cm);
    h += this._secHdr('TARJETAS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('TARJETAS')">+ manual</a> <a onclick="BudgetGrid.openImportDrawer('tarjeta')">+ extracto</a></span>`);
    h += this._tarjetaRows(T, cm);
    h += this._totRow('Total Tarjetas', T, cm);
    h += this._secHdr('INGRESOS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('INGRESOS')">+ ingreso</a></span>`);
    const iHasParents = I.some(l => l.parentId) || I.some(l => I.some(c => c.parentId === (l.rawId || l.id)));
    h += iHasParents ? this._tarjetaRows(I, cm) : this._rows(I, cm);
    h += this._totRow('Total Ingresos', I, cm);
    h += this._summaryBlock(G, T, I, cm, acc);
    h += '</tbody></table></div>';
    ct.innerHTML = h;

    requestAnimationFrame(() => {
      const nw = ct.querySelector('.budget-grid-wrap');
      if (nw) { nw.scrollTop = sT; nw.scrollLeft = sL; }
      // Re-apply active search filter after render (e.g. bank switch)
      if (this._searchTerm) this._applySearchFilter();
      // Restore X button state
      const clr = document.getElementById('bg-search-clear');
      if (clr) clr.style.display = this._searchTerm ? 'block' : 'none';
    });
  },



  _yearNav() {
    return `<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:var(--bg-tertiary);border-radius:20px;padding:4px 14px;flex-shrink:0;">
        <button onclick="BudgetGrid.changeYear(-1)" style="background:none;border:none;font-size:15px;cursor:pointer;padding:3px 7px;color:var(--text-secondary);border-radius:12px;">◀</button>
        <span id="year-display" style="font-weight:700;font-size:14px;min-width:40px;text-align:center;color:var(--text-primary);">${AppState.currentYear}</span>
        <button onclick="BudgetGrid.changeYear(1)" style="background:none;border:none;font-size:15px;cursor:pointer;padding:3px 7px;color:var(--text-secondary);border-radius:12px;">▶</button>
      </div>
      <div id="bg-search-inline" style="display:inline-flex;align-items:center;gap:0;background:var(--bg-secondary);border:1.5px solid var(--border-light);border-radius:20px;padding:0 10px;min-width:260px;"
           onfocusin="this.style.borderColor='var(--accent)';this.style.boxShadow='0 0 0 3px rgba(59,130,246,.1)'"
           onfocusout="this.style.borderColor='var(--border-light)';this.style.boxShadow='none'">
        <span style="font-size:14px;color:var(--text-tertiary);margin-right:6px;flex-shrink:0;">⌕</span>
        <input id="bg-search" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          data-lpignore="true" data-form-type="other"
          placeholder="Buscar concepto o importe…"
          oninput="BudgetGrid._onSearch(this.value)"
          onkeydown="if(event.key==='Escape'){BudgetGrid._clearSearch();}"
          style="flex:1;border:none;background:transparent;font-size:13px;color:var(--text-primary);padding:7px 0;outline:none;font-family:inherit;min-width:160px;">
        <button id="bg-search-clear" onclick="BudgetGrid._clearSearch()"
          style="display:none;background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:16px;padding:0 2px 0 6px;line-height:1;flex-shrink:0;" title="Limpiar búsqueda">✕</button>
        <span id="bg-search-count" style="font-size:11px;font-weight:600;border-radius:10px;padding:2px 8px;margin-left:4px;white-space:nowrap;flex-shrink:0;display:none;"></span>
      </div>
    </div>`;
  },

  _tabs(unc) {
    let h = '<div class="budget-bank-tabs">';
    this.accounts.forEach(a => { h += `<button class="budget-bank-tab ${a.name===this.activeBank?'active':''}" onclick="BudgetGrid.switchBank('${this._e(a.name)}')">${a.name}</button>`; });
    if (unc > 0) h += `<span class="uncat-badge" onclick="BudgetGrid._scrollUncat()">${unc} sin categorizar</span>`;
    return h + '</div>';
  },

  _searchDebounce: null,
  _onSearch(val) {
    this._searchTerm = val.trim();
    // Show/hide clear button
    const clr = document.getElementById('bg-search-clear');
    if (clr) clr.style.display = this._searchTerm ? 'block' : 'none';
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => this._applySearchFilter(), 150);
  },

  _clearSearch() {
    this._searchTerm = '';
    const inp = document.getElementById('bg-search');
    if (inp) inp.value = '';
    const clr = document.getElementById('bg-search-clear');
    if (clr) clr.style.display = 'none';
    const cnt = document.getElementById('bg-search-count');
    if (cnt) cnt.style.display = 'none';
    this._applySearchFilter();
  },

  // Normalize text for accent-insensitive search
  _norm(s) {
    try { return String(s).normalize('NFD').replace(/̀|́|̂|̃|̄|̈|̊|̧/g, '').toLowerCase(); }
    catch(e) { return String(s).toLowerCase(); }
  },

  // Parse Spanish-format number: "1.234,56" → 1234.56
  _parseSpanishNum(s) {
    return parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.'));
  },

  _applySearchFilter() {
    const rawTerm = this._searchTerm.trim();
    const table = document.querySelector('.budget-grid tbody');
    if (!table) return;

    // Reset all rows
    table.querySelectorAll('tr[data-lid]').forEach(tr => {
      tr.style.display = ''; tr.onclick = null; tr.style.cursor = '';
      tr.querySelectorAll('mark').forEach(m => m.outerHTML = m.textContent);
      tr.querySelectorAll('td[data-srch-green]').forEach(td => {
        td.style.background = ''; td.removeAttribute('data-srch-green');
      });
      const ind = tr.querySelector('.bd-search-ind'); if (ind) ind.remove();
    });

    if (!rawTerm) {
      const cnt = document.getElementById('bg-search-count'); if (cnt) cnt.style.display = 'none';
      return;
    }

    const t     = this._norm(rawTerm);
    const num   = this._parseSpanishNum(rawTerm);
    const isNum = !isNaN(num) && /\d/.test(rawTerm);
    let count   = 0;

    table.querySelectorAll('tr[data-lid]').forEach(tr => {
      const lid = tr.dataset.lid;

      // Resolve line — direct or virtual group
      let line = this.lines.find(l => l.id === lid);
      if (!line && this._vgrpRegistry) {
        for (const [vId, kids] of Object.entries(this._vgrpRegistry)) {
          if (vId === lid) { line = { ...kids[0], breakdown: this._mergeChildBreakdowns(kids) }; break; }
        }
      }

      // ── 1. Name match (accent-insensitive) ───────────────────────
      const frozen = tr.querySelector('td.frozen');
      const nameText = this._norm(frozen ? frozen.textContent : '');
      const nameMatch = nameText.includes(t);

      // ── 2. Exact cell amount match ────────────────────────────────
      const matchedAmtTds = [];
      if (isNum) {
        tr.querySelectorAll('td.td-real, td.td-annual-real').forEach(td => {
          if (Math.abs(this._parseSpanishNum(td.textContent) - num) < 0.015) matchedAmtTds.push(td);
        });
      }

      // ── 3. Breakdown match ────────────────────────────────────────
      let bdMatch = false;
      let bdAllItems = [];
      if (line && line.breakdown) {
        try {
          const bd = typeof line.breakdown === 'string' ? JSON.parse(line.breakdown) : line.breakdown;
          Object.values(bd).forEach(items => {
            if (!Array.isArray(items)) return;
            items.forEach(it => {
              bdAllItems.push(it);
              const cNorm = this._norm(it.c || it.concepto || '');
              const aVal  = parseFloat(it.a) || 0;
              if (cNorm.includes(t) || (isNum && Math.abs(aVal - num) < 0.015)) bdMatch = true;
            });
          });
        } catch(e) {}
      }

      const matches = nameMatch || matchedAmtTds.length > 0 || bdMatch;
      tr.style.display = matches ? '' : 'none';
      if (!matches) return;
      count++;

      // ── Highlight name in yellow ──────────────────────────────────
      if (nameMatch && frozen) {
        const orig = frozen.textContent;
        const idx = this._norm(orig).indexOf(t);
        if (idx >= 0) {
          frozen.innerHTML = this._e(orig.slice(0, idx))
            + '<mark style="background:#fef08a;border-radius:2px;padding:0 1px;">'
            + this._e(orig.slice(idx, idx + t.length)) + '</mark>'
            + this._e(orig.slice(idx + t.length));
        }
      }

      // ── Green cell for exact amount match ─────────────────────────
      matchedAmtTds.forEach(td => {
        td.style.background = '#bbf7d0';
        td.setAttribute('data-srch-green', '1');
      });

      // ── Breakdown match: red triangle indicator + click for modal ─
      if (bdMatch && matchedAmtTds.length === 0) {
        // Highlight triangle indicators in red-orange
        tr.querySelectorAll('.note-indicator.grey').forEach(tri => {
          tri.style.color = '#ef4444';
          tri.style.opacity = '1';
          tri.style.fontSize = '13px';
        });
        // Click row → open breakdown modal with green on matching items
        tr.style.cursor = 'pointer';
        tr.onclick = (e) => {
          if (e.target.closest('td[data-t]') || e.target.closest('.note-indicator')) return;
          const fakeEl = { _items: bdAllItems };
          this._showBreakdownModal(fakeEl, rawTerm);
        };
      }
    });

    // Counter
    const el = document.getElementById('bg-search-count');
    if (el) {
      if (count > 0) {
        el.textContent = count + ' resultado' + (count !== 1 ? 's' : '');
        el.style.display = 'inline-block'; el.style.color = 'var(--accent)'; el.style.background = '#eff6ff';
      } else {
        el.textContent = 'Sin resultados';
        el.style.display = 'inline-block'; el.style.color = '#dc2626'; el.style.background = '#fef2f2';
      }
    }
  },

  _mergeChildBreakdowns(children) {
    const merged = {};
    children.forEach(l => {
      if (!l.breakdown) return;
      try {
        const bd = typeof l.breakdown === 'string' ? JSON.parse(l.breakdown) : l.breakdown;
        Object.entries(bd).forEach(([mKey, items]) => {
          if (!merged[mKey]) merged[mKey] = [];
          merged[mKey] = merged[mKey].concat(items);
        });
      } catch(e) {}
    });
    return JSON.stringify(merged);
  },



  _matchesSearch(line) {
    const t = this._searchTerm;
    if (!t) return true;
    const name = (this._displayName(line) || '').toLowerCase();
    if (name.includes(t.toLowerCase())) return true;
    const num = parseFloat(t.replace(',', '.'));
    if (!isNaN(num)) {
      for (let m = 0; m < 12; m++) {
        if (Math.abs((line.real[m] || 0) - num) < 1.01) return true;
        if (Math.abs((line.plan[m] || 0) - num) < 1.01) return true;
      }
    }
    return false;
  },

  _highlightMatch(text) {
    if (!this._searchTerm) return this._e(text);
    const t = this._searchTerm;
    const idx = text.toLowerCase().indexOf(t.toLowerCase());
    if (idx < 0) return this._e(text);
    return this._e(text.slice(0, idx))
      + `<mark style="background:#fef08a;border-radius:2px;padding:0 1px;">${this._e(text.slice(idx, idx + t.length))}</mark>`
      + this._e(text.slice(idx + t.length));
  },

  _thead(cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let r1 = '<thead><tr><th class="th-left"></th>';
    let r2 = '<tr class="sub-hdr"><th class="th-left"></th>';
    for (let m = 0; m < 12; m++) {
      const cur = m === cm, closed = meta.closed[m], past = m < cm;
      let cls = cur ? 'cur-hdr' : (closed ? 'closed-hdr' : (past && !closed ? 'unclosed-hdr' : ''));
      const icon = closed ? ' 🔒' : (past && !closed ? ' ⚠' : '');
      const click = past || cur ? ` onclick="BudgetGrid.toggleClose(${m+1})" style="cursor:pointer;"` : '';
      r1 += `<th class="th-month ${cls}" colspan="2"${click}>${MONTHS[m]}${icon}</th>`;
      const subCls = cur ? 'cur-hdr' : (closed ? 'closed-hdr' : '');
      r2 += `<th class="${subCls}">Plan</th><th class="${subCls}">Real</th>`;
    }
    // Total column + right frozen concepto
    r1 += '<th class="th-month th-total-hdr" colspan="2">AÑO</th>';
    r1 += '<th class="th-left th-right-frozen th-right-hdr"></th>';
    r2 += '<th class="th-total-sub">Plan</th>';
    r2 += '<th class="th-total-sub th-total-sub-real">Real</th>';
    r2 += '<th class="th-left th-right-frozen th-right-hdr"></th>';
    return r1 + '</tr>' + r2 + '</tr></thead>';
  },

  _secHdr(name, actions) {
    return `<tr class="bg-section-hdr"><td class="frozen"><span class="sec-name">${name}</span>${actions||''}</td>${this._ec('sec-cell')}</tr>`;
  },

  // Display name: alias if exists, else concepto
  _displayName(line) {
    return line.alias ? line.alias : line.concepto;
  },

  _noteTriangle(notes, color) {
    if (!notes) return '';
    const cls = color === 'grey' ? 'note-indicator grey' : 'note-indicator';
    if (color === 'grey') {
      return `<span class="${cls}" onclick="event.stopPropagation();BudgetGrid._showBreakdownModal(this)" data-bd="${this._e(notes)}">◥</span>`;
    }
    return `<span class="${cls}" onmouseenter="BudgetGrid._showTip(this)" onmouseleave="BudgetGrid._hideTip()" data-tip="${this._e(notes)}">◥</span>`;
  },

  // Breakdown modal — clean white modal with Fecha/Concepto/Importe table
  // highlightTerm: optional string to highlight matching rows
  _showBreakdownModal(el, highlightTerm) {
    const raw = el ? el.dataset.bd : null;
    let items;
    if (raw) {
      try { items = JSON.parse(raw); } catch(e) { return; }
    } else if (el && el._items) {
      items = el._items; // passed directly
    } else return;
    if (!Array.isArray(items)) items = [items];
    const total = items.reduce((s, it) => s + (parseFloat(it.a) || 0), 0);
    const ht = highlightTerm ? highlightTerm.toLowerCase() : '';
    const htNum = ht ? parseFloat(ht.replace(/\./g, '').replace(',', '.')) : NaN;

    let rows = '';
    items.forEach(it => {
      const concept = String(it.c || it.concepto || '');
      const amt = parseFloat(it.a) || 0;
      const conceptMatch = ht && this._norm(concept).includes(this._norm(ht));
      const amtMatch = !isNaN(htNum) && Math.abs(amt - htNum) < 0.015;
      const isMatch = conceptMatch || amtMatch;
      const rowStyle = isMatch ? 'background:#fef9c3;font-weight:600;' : '';
      // Highlight concept text
      let conceptHtml = this._e(concept);
      if (conceptMatch) {
        const idx = concept.toLowerCase().indexOf(ht);
        conceptHtml = this._e(concept.slice(0, idx))
          + '<mark style="background:#fef08a;border-radius:2px;padding:0 1px;">'
          + this._e(concept.slice(idx, idx + ht.length)) + '</mark>'
          + this._e(concept.slice(idx + ht.length));
      }
      const amtHtml = amtMatch
        ? `<mark style="background:#bbf7d0;border-radius:2px;padding:0 2px;font-weight:700;color:#166534;">${this._f(amt, 1)}</mark>`
        : this._f(amt, 1);
      const rowBg = isMatch ? (amtMatch && !conceptMatch ? 'background:#f0fdf4;' : 'background:#fef9c3;') : '';
      rows += `<tr style="${rowBg}"><td class="bd-date">${this._e(String(it.d||''))}</td><td class="bd-concept">${conceptHtml}</td><td class="bd-amount">${amtHtml}</td></tr>`;
    });

    const matchCount = items.filter(it => {
      const c = String(it.c||it.concepto||'').toLowerCase();
      const a = parseFloat(it.a)||0;
      return (ht && c.includes(ht)) || (!isNaN(htNum) && Math.abs(a-htNum)<0.02);
    }).length;
    const headerExtra = ht && matchCount > 0
      ? ` <span style="font-size:11px;color:var(--accent);background:#eff6ff;border-radius:8px;padding:2px 8px;margin-left:8px;">${matchCount} coincidencia${matchCount>1?'s':''}</span>`
      : '';

    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay bd-modal-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="bd-modal">
      <div class="bd-modal-header">
        <h3>📋 Desglose (${items.length})${headerExtra}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" class="bd-modal-close">✕</button>
      </div>
      <div class="bd-modal-body">
        <table class="bd-modal-table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th class="bd-amount">Importe</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="bd-modal-footer">
        <span>TOTAL</span>
        <span class="bd-modal-total">${this._f(total, 1)}</span>
      </div>
    </div>`;
    document.body.appendChild(ov);
    // Scroll to first match
    if (ht) requestAnimationFrame(() => {
      const first = ov.querySelector('tr[style*="fef9c3"]');
      if (first) first.scrollIntoView({ block: 'center' });
    });
  },

  _showTip(el) {
    let tip = document.getElementById('bg-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'bg-tip'; tip.className = 'bg-tooltip'; document.body.appendChild(tip); }
    tip.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = Math.min(r.left, window.innerWidth - 320) + 'px';
    tip.style.top = (r.bottom + 6) + 'px';
  },

  _hideTip() {
    const tip = document.getElementById('bg-tip');
    if (tip) tip.style.display = 'none';
  },

  _rows(lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let h = '';
    lines.forEach(line => {
      const uc = !line.casa && !line.categoria;
      const autoTag = '';
      const name = this._displayName(line);
      const noteTip = this._noteTriangle(line.notas, 'blue');
      let bdMap = null;
      if (line.breakdown) { try { bdMap = JSON.parse(line.breakdown); } catch(e) { bdMap = null; } }
      h += `<tr class="${uc?'uncat':''}" data-lid="${line.id}">`;
      const displayName = this._searchTerm ? this._highlightMatch(name) : (this._e(name) || '(vacío)');
      h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${line.id}')">${autoTag}${displayName}${noteTip}</td>`;
      let totP = 0, totR = 0;
      for (let m = 0; m < 12; m++) {
        const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
        const pv = line.plan[m], rv = line.real[m];
        totP += pv || 0; totR += rv || 0;
        const bdTip = (bdMap && bdMap[m] && bdMap[m].length >= 1) ? this._noteTriangle(JSON.stringify(bdMap[m]), 'grey') : '';
        const propagateBtn = (m === 0)
          ? `<span class="prop-btn" onclick="event.stopPropagation();BudgetGrid.openPropagatePanel('${line.id}')" title="Propagar plan anual">⟳</span>`
          : '';
        h += `<td class="editable ${c} td-plan" data-lid="${line.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)" style="position:relative;">${propagateBtn}${this._f(pv)}</td>`;
        h += `<td class="editable ${c} td-real" data-lid="${line.id}" data-t="real" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(rv)}${bdTip}</td>`;
      }
      // Total anual + right-frozen concepto
      h += `<td class="td-annual-plan">${this._f(totP, 1)}</td>`;
      h += `<td class="td-annual-real">${this._f(totR, 1)}</td>`;
      h += `<td class="td-right-name" ondblclick="BudgetGrid.openDrawer('${line.id}')">${displayName}</td>`;
      h += '</tr>';
    });
    return h;
  },

  _tarjetaRows(lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    const parents = lines.filter(l => !l.parentId);
    const children = lines.filter(l => l.parentId);
    let h = '';
    parents.forEach(line => {
      // ENTERPRISE FIX: parentId in the sheet stores the rawId (pre-composite-key).
      // line.id may be "rawId::sheetRow" for duplicate IDs, so match against rawId.
      const lineRawId = line.rawId || line.id;
      const kids = children.filter(c => c.parentId === lineRawId);
      const isParent = kids.length > 0;
      const collapsed = this._collapsed[line.id] !== false;
      if (isParent) {
        h += `<tr class="tarjeta-parent" data-lid="${line.id}">`;
        h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${line.id}')"><span class="collapse-toggle" onclick="event.stopPropagation();BudgetGrid.toggleCollapse('${line.id}')">${collapsed ? '+' : '−'}</span><strong>${this._e(this._displayName(line))}</strong></td>`;
        for (let m = 0; m < 12; m++) {
          const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
          const pSum = kids.reduce((s,k)=>s+(k.plan[m]||0),0) + (line.plan[m]||0);
          const rSum = kids.reduce((s,k)=>s+(k.real[m]||0),0) + (line.real[m]||0);
          h += `<td class="editable ${c}" data-lid="${line.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(pSum)}</td>`;
          h += `<td class="${c}" style="font-weight:600;">${this._f(rSum)}</td>`;
        }
        h += '</tr>';
        if (!collapsed) {
          kids.forEach(kid => {
            const ucK = !kid.casa && !kid.categoria;
            const noteT = this._noteTriangle(kid.notas, 'blue');
            let bdMapK = null;
            if (kid.breakdown) { try { bdMapK = JSON.parse(kid.breakdown); } catch(e) { bdMapK = null; } }
            h += `<tr class="tarjeta-child ${ucK?'uncat':''}" data-lid="${kid.id}">`;
            h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${kid.id}')" style="padding-left:28px;font-size:11px;color:var(--text-secondary);">${this._e(this._displayName(kid))}${noteT}</td>`;
            for (let m = 0; m < 12; m++) {
              const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
              const bdTipK = (bdMapK && bdMapK[m] && bdMapK[m].length >= 1) ? this._noteTriangle(JSON.stringify(bdMapK[m]), 'grey') : '';
              h += `<td class="editable ${c}" data-lid="${kid.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)" style="font-size:11px;">${this._f(kid.plan[m])}</td>`;
              h += `<td class="editable ${c}" data-lid="${kid.id}" data-t="real" data-m="${m}" onclick="BudgetGrid.editCell(this)" style="font-size:11px;">${this._f(kid.real[m])}${bdTipK}</td>`;
            }
            h += '</tr>';
          });
        }
      } else {
        h += this._rows([line], cm);
      }
    });
    return h;
  },

  toggleCollapse(lineId) { this._collapsed[lineId] = this._collapsed[lineId] === false ? true : false; this.render(); },

  _totRow(label, lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let h = `<tr class="bg-total"><td class="frozen"><strong>${label}</strong></td>`;
    let totP = 0, totR = 0;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const p = lines.reduce((s,l)=>s+(l.plan[m]||0),0);
      const r = lines.reduce((s,l)=>s+(l.real[m]||0),0);
      totP += p; totR += r;
      h += `<td class="td-tot ${c}">${this._f(p,1)}</td>`;
      h += `<td class="td-tot ${c}">${this._f(r,1)}</td>`;
    }
    h += `<td class="td-annual-plan td-annual-tot">${this._f(totP,1)}</td>`;
    h += `<td class="td-annual-real td-annual-tot">${this._f(totR,1)}</td>`;
    h += `<td class="frozen td-right-name td-right-tot"><strong>${label}</strong></td>`;
    return h + '</tr>';
  },

  // ══════════ SUMMARY + ENVÍO ══════════

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
      d.push({ gasP, gasR, tarP, tarR, totP, totR, iP, iR, cf, cfR, buf, sal });
    }
    this._envioData = d;

    const sRow = (label, kP, kR, opts={}) => {
      const { sign, bold, negOnly, cls, greenVal } = opts;
      let r = `<tr class="bg-summ ${cls||''}"><td class="frozen">${sign?`<span class="formula-sign">${sign}</span>`:''}${bold?`<strong>${label}</strong>`:label}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
        const pv = d[m][kP], rv = d[m][kR];
        let sP = '', sR = '';
        if (negOnly) { sP = pv < 0 ? 'val-neg' : ''; sR = rv < 0 ? 'val-neg' : ''; }
        if (greenVal) { sP = 'val-pos'; sR = 'val-pos'; }
        r += `<td class="${c} ${sP}">${this._f(pv,1)}</td><td class="${c} ${sR}">${this._f(rv,1)}</td>`;
      }
      return r + '</tr>';
    };

    h += sRow('Gastos', 'gasP', 'gasR');
    h += sRow('Tarjetas', 'tarP', 'tarR', { sign: '+' });
    h += sRow('Total Gastos', 'totP', 'totR', { bold: true, sign: '=', cls: 'row-total' });
    h += sRow('Ingresos', 'iP', 'iR', { cls: 'row-income', greenVal: true });
    h += sRow('Cashflow', 'cf', 'cfR', { bold: true, sign: '=', negOnly: true, cls: 'row-cashflow' });

    // Buffer
    h += `<tr class="bg-summ row-meta"><td class="frozen"><span class="formula-sign">+</span>Buffer</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const v = d[m].buf, disp = v ? this._f(v,1) : '—';
      h += `<td class="editable ${c}" data-meta="buffer" data-m="${m}" onclick="BudgetGrid.editMeta(this)">${disp}</td>`;
      h += `<td class="${c}">${disp}</td>`;
    }
    h += '</tr>';

    // Saldo en Cuenta
    h += `<tr class="bg-summ row-meta"><td class="frozen"><span class="formula-sign">−</span>Saldo en Cuenta</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const v = d[m].sal, disp = v ? this._f(v,1) : '—';
      h += `<td class="${c}">${disp}</td>`;
      h += `<td class="editable ${c}" data-meta="saldo" data-m="${m}" onclick="BudgetGrid.editMeta(this)">${disp}</td>`;
    }
    h += '</tr>';

    // Envío Necesario — shown in PLAN column of month m (the current month being closed)
    // Envío for month m = Gastos_Plan(m+1) + Tarjetas_Real(m) + Buffer(m+1) - Ingresos_Plan(m+1) - Saldo(m)
    h += `<tr class="bg-envio"><td class="frozen">💰 ENVÍO NECESARIO</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : '';
      let envDisplay = '';
      if (m < 11) {
        const nextM = m + 1;
        const envRaw = d[nextM].gasP + d[m].tarR + d[nextM].buf - d[nextM].iP - d[m].sal;
        envDisplay = this._f(Math.max(0, envRaw), 1);
      }
      h += `<td class="${c}" style="font-weight:800;${m < 11 ? 'cursor:pointer;' : ''}" ${m < 11 ? `onclick="BudgetGrid.showEnvioModal(${m})"` : ''}>${envDisplay}</td>`;
      h += `<td class="${c}"></td>`;
    }
    h += '</tr>';
    return h;
  },

  showEnvioModal(srcMonth) {
    // srcMonth = the current month (where envío is displayed in PLAN column)
    // target = srcMonth + 1 (the month we need to cover)
    const d = this._envioData;
    if (!d) return;
    const tgtM = srcMonth + 1;
    if (tgtM > 11) return;

    const gastosPlan = d[tgtM].gasP;
    const tarjetasReal = d[srcMonth].tarR;
    const bufferPlan = d[tgtM].buf;
    const ingresosPlan = d[tgtM].iP;
    const saldo = d[srcMonth].sal;
    const raw = gastosPlan + tarjetasReal + bufferPlan - ingresosPlan - saldo;
    const isNeg = raw <= 0;
    const color = isNeg ? '#10b981' : '#0f172a';
    const srcName = MONTHS_FULL[srcMonth + 1] || MONTHS[srcMonth];
    const tgtName = MONTHS_FULL[tgtM + 1] || MONTHS[tgtM];

    const row = (label, value, sign) => {
      const vf = this._f(Math.abs(value), 1);
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f3f5;">
        <span style="color:#64748b;">${sign ? `<span style="display:inline-block;width:16px;font-weight:700;color:#94a3b8;">${sign}</span>` : '<span style="width:16px;display:inline-block;"></span>'}${label}</span>
        <span style="font-weight:600;font-variant-numeric:tabular-nums;">${vf}</span>
      </div>`;
    };

    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.style.cssText += 'justify-content:center;align-items:center;';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div style="background:white;border-radius:16px;padding:28px;width:400px;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:16px;">💰 Envío Necesario — ${tgtName}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <div style="font-size:13px;">
        ${row(`Gastos previstos ${tgtName}`, gastosPlan, '')}
        ${row(`Recibo tarjetas ${srcName}`, tarjetasReal, '+')}
        ${row(`Buffer ${tgtName}`, bufferPlan, '+')}
        ${row(`Ingresos previstos ${tgtName}`, ingresosPlan, '−')}
        ${row(`Saldo en cuenta`, saldo, '−')}
      </div>
      <div style="border-top:2px solid #0f172a;margin-top:4px;padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:800;font-size:15px;">ENVÍO NECESARIO</span>
        <span style="font-weight:800;font-size:18px;color:${color};">${this._f(isNeg ? raw : Math.max(0, raw), 1)}</span>
      </div>
      ${isNeg ? '<div style="margin-top:8px;padding:8px 12px;background:#ecfdf5;border-radius:8px;color:#065f46;font-size:12px;font-weight:600;text-align:center;">✅ Sobra dinero, no hace falta que envíes nada</div>' : ''}
    </div>`;
    document.body.appendChild(ov);
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
  _norm(s) { return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); },

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

  // ══════════ DRAWER ══════════

  openDrawer(lineId) {
    // ENTERPRISE PATTERN: lineId is always a string passed directly from the HTML
    // onclick handler (e.g. ondblclick="openDrawer('BL-XXX::42')").
    // We never traverse the DOM to find the ID — that was the source of the bug.
    if (!lineId || typeof lineId !== 'string') {
      console.error('[openDrawer] Called without a valid lineId. All callers must pass the ID string directly.');
      return;
    }
    // Remove any existing drawer first to avoid DOM ID conflicts
    document.querySelectorAll('.budget-drawer-overlay').forEach(el => el.remove());

    let line = this.lines.find(l => l.id === lineId);

    // LAYER 3: resolve virtual group IDs — vgrp_* lines don't exist in this.lines
    // but their real children are registered in _vgrpRegistry from last render.
    if (!line && lineId.startsWith('vgrp_')) {
      const children = this._vgrpRegistry?.[lineId];
      if (children && children.length) {
        // Open drawer on the first real child
        line = children[0];
        lineId = line.id;
      }
    }

    if (!line) {
      console.warn(`[openDrawer] Line not found: ${lineId}`);
      this._toast('Línea no encontrada — recarga la página (F5).');
      return;
    }
    // Detect if this is a parent line (has children)
    const isParent = this.lines.some(l => l.parentId === (line.rawId || line.id));
    const cats = AppState.config?.categorias || {}, casas = AppState.config?.casas || [];
    const catKeys = Object.keys(cats).sort((a,b) => a.localeCompare(b, 'es'));
    const subcats = (line.categoria && cats[line.categoria] ? cats[line.categoria] : []).sort((a,b) => a.localeCompare(b, 'es'));
    const notes = line.notas || '';
    const alias = line.alias || '';
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><h3 style="margin:0;">Editar Línea</h3><button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button></div>
      ${isParent ? `<div style="padding:10px 14px;background:#f0f4ff;border-radius:8px;margin-bottom:16px;font-size:12px;color:var(--accent);font-weight:600;">📂 Línea agrupadora — haz doble-click en un gasto específico para editarlo</div>` : ''}
      <label>Concepto original</label><input value="${this._e(line.concepto)}" readonly style="background:#f8fafc;color:var(--text-tertiary);">
      <label>Nombre en grilla</label><input id="dw-alias" value="${this._e(alias || line.concepto)}" placeholder="${this._e(line.concepto)}">
      ${notes ? `<label>Detalles</label><textarea readonly style="width:100%;height:50px;padding:8px;border-radius:8px;border:1px solid var(--border-light);font-size:12px;color:var(--text-secondary);resize:vertical;background:#f8fafc;">${this._e(notes)}</textarea>
      <label style="margin-top:12px;display:block;">Palabra clave en detalle <span style="font-size:10px;font-weight:400;color:var(--text-tertiary);">— para reconocer futuros imports similares</span></label>
      <input id="dw-notes-kw" placeholder="ej: RICARDO, DENISE…" value="${this._e(BudgetGrid._extractKeyword(notes))}" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border-light);font-size:13px;font-family:inherit;box-sizing:border-box;">` : ''}
      ${!isParent ? `<label>Casa</label><select id="dw-cas"><option value="">— Sin asignar —</option>${casas.map(c=>`<option value="${c.name}" ${line.casa===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;"><label style="margin:0;flex:1;">Categoría</label><a onclick="BudgetGrid._addNewCat()" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:600;">+ nueva</a></div>
      <select id="dw-cat" onchange="BudgetGrid._updSub()"><option value="">— Sin asignar —</option>${catKeys.map(c=>`<option value="${c}" ${line.categoria===c?'selected':''}>${c}</option>`).join('')}</select>
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;"><label style="margin:0;flex:1;">Subcategoría</label><a onclick="BudgetGrid._addNewSub()" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:600;">+ nueva</a></div>
      <select id="dw-sub"><option value="">— Sin asignar —</option>${subcats.map(s=>`<option value="${s}" ${line.subcategoria===s?'selected':''}>${s}</option>`).join('')}</select>
      <label>Cadencia</label><select id="dw-cad">${['variable','monthly','bimonthly','quarterly','annual','one-off'].map(c=>`<option value="${c}" ${line.cadence===c?'selected':''}>${c === 'bimonthly' ? 'bimensual' : c}</option>`).join('')}</select>` : `<input type="hidden" id="dw-cas" value="${this._e(line.casa)}"><input type="hidden" id="dw-cat" value="${this._e(line.categoria)}"><input type="hidden" id="dw-sub" value="${this._e(line.subcategoria)}"><input type="hidden" id="dw-cad" value="${this._e(line.cadence)}">`}
      <div class="drawer-actions"><button class="btn-cancel" onclick="this.closest('.budget-drawer-overlay').remove()">Cancelar</button><button class="btn-save" onclick="BudgetGrid.saveDrawer('${line.id}')">Guardar</button></div>
      <div class="dw-group-section">
        <div class="dw-group-header" onclick="document.getElementById('dw-group-body').classList.toggle('hidden');BudgetGrid._grpRenderCtx('${line.id}')">
          <span>${BudgetLogic._groupRules.find(r=>(!r.bank||r.bank===this.activeBank)&&(line.concepto.toUpperCase().includes(r.pattern)||r.label.toUpperCase()===line.concepto.toUpperCase()))?'🔗 Gestionar Agrupación':'🔗 Crear Agrupación'}</span><span class="dw-group-chevron">▸</span>
        </div>
        <div id="dw-group-body" class="hidden">
          <div id="dw-grp-ctx"></div>
        </div>
      </div>
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}')">Eliminar línea</button>
    </div>`;
    document.body.appendChild(ov);
  },

  async _addNewCat() {
    const name = prompt('Nueva categoría:');
    if (!name?.trim()) return;
    const cats = AppState.config?.categorias || {};
    if (cats[name.trim()]) { alert(`"${name.trim()}" ya existe.`); return; }
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [name.trim(), '', '', '', '', '']);
    cats[name.trim()] = [];
    const sel = document.getElementById('dw-cat');
    if (sel) { const opt = document.createElement('option'); opt.value = name.trim(); opt.textContent = name.trim(); opt.selected = true; sel.appendChild(opt); }
    this._toast(`Categoría "${name.trim()}" creada`);
  },

  async _addNewSub() {
    const cat = document.getElementById('dw-cat')?.value;
    if (!cat) { alert('Selecciona primero una categoría.'); return; }
    const name = prompt(`Nueva subcategoría para "${cat}":`);
    if (!name?.trim()) return;
    const cats = AppState.config?.categorias || {};
    const subs = cats[cat] || [];
    if (subs.includes(name.trim())) { alert(`"${name.trim()}" ya existe.`); return; }
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, name.trim(), '', '', '', '']);
    subs.push(name.trim()); cats[cat] = subs;
    const sel = document.getElementById('dw-sub');
    if (sel) { const opt = document.createElement('option'); opt.value = name.trim(); opt.textContent = name.trim(); opt.selected = true; sel.appendChild(opt); }
    this._toast(`Subcategoría "${name.trim()}" creada`);
  },

  _updSub() {
    const c = document.getElementById('dw-cat'), s = document.getElementById('dw-sub');
    if (!c||!s) return;
    const subs = ((AppState.config?.categorias||{})[c.value]||[]).slice().sort((a,b) => a.localeCompare(b, 'es'));
    s.innerHTML = '<option value="">— Sin asignar —</option>' + subs.map(o=>`<option value="${o}">${o}</option>`).join('');
  },

  // ══════════ GROUP EDITOR (Drawer — contextual) ══════════

  // Renders a live-search preview using BudgetLogic.searchGastos
  // Returns an HTML string. Attaches itself to previewEl via async update.
  _grpAttachPreviewChecked(searchEl, previewEl, patternEl, bank, existingPatterns) {
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const MIN = 2;

    // selected: Set of line IDs (not conceptos) — this is the key fix.
    // Using IDs allows two lines with identical concepto to be toggled independently.
    // idToConcepto: Map<id, concepto.toUpperCase()> used to build the pattern string.
    const selected     = new Set();   // Set<lineId>
    const idToConcepto = new Map();   // Map<lineId, conceptoUpper>

    // Pre-populate from existing group patterns
    if (existingPatterns && existingPatterns.length && typeof BudgetGrid !== 'undefined' && BudgetGrid.lines) {
      BudgetGrid.lines.filter(l => l.bank === bank).forEach(l => {
        const cUp = (l.concepto || '').toUpperCase();
        if (existingPatterns.some(p => cUp.includes(p.toUpperCase()))) {
          selected.add(l.id);
          idToConcepto.set(l.id, cUp);
        }
      });
    }

    // Pre-existing IDs — restored when search is cleared
    const preExisting = new Set(selected);

    const updatePattern = () => {
      if (!patternEl) return;
      // Build pattern from unique conceptos of selected IDs
      // Two lines with same concepto produce one pattern entry (deduped via Set)
      const uniqueConceptos = [...new Set([...selected].map(id => idToConcepto.get(id)).filter(Boolean))];
      patternEl.value = uniqueConceptos.join('|||');
    };
    updatePattern();

    const showHint = () => {
      previewEl.innerHTML = '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Escribe para buscar líneas...</p>';
    };
    showHint();

    let _timer = null;
    searchEl.oninput = () => {
      clearTimeout(_timer);
      const q = searchEl.value.trim();
      if (q.length < MIN) {
        selected.clear();
        preExisting.forEach(id => selected.add(id));
        updatePattern();
        showHint();
        return;
      }
      previewEl.innerHTML = '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Buscando...</p>';
      _timer = setTimeout(async () => {
        let lines;
        try { lines = await BudgetLogic.searchGastos(q, bank); }
        catch(e) { previewEl.innerHTML = '<p style="font-size:11px;color:#ef4444;margin:4px 0 0;">Error al buscar</p>'; return; }

        if (!lines || !lines.length) {
          previewEl.innerHTML = '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Sin coincidencias</p>';
          return;
        }

        // Register all visible lines in idToConcepto so toggle can build pattern
        lines.slice(0, 15).forEach(l => {
          idToConcepto.set(l.id, (l.concepto || '').toUpperCase());
        });

        const render = () => {
          let html = '<p style="font-size:11px;color:#64748b;font-weight:600;margin:4px 0 6px;">'
            + lines.length + ' resultado' + (lines.length !== 1 ? 's' : '') + ' · haz clic para seleccionar</p>';

          lines.slice(0, 15).forEach(function(l, idx) {
            const total   = (l.real || []).reduce(function(s, v) { return s + (v || 0); }, 0);
            const amt     = total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const display = esc(l.alias || l.concepto || '(sin nombre)');
            // isOn is now per line ID — two lines with same concepto toggle independently
            const isOn    = selected.has(l.id);
            const sub     = l.notas ? String(l.notas).slice(0, 55) : '';

            html += '<div data-idx="' + idx + '" style="display:flex;align-items:flex-start;gap:8px;'
              + 'padding:7px 9px;margin-bottom:3px;border-radius:6px;cursor:pointer;'
              + 'background:' + (isOn ? '#eff6ff' : 'white') + ';'
              + 'border:1.5px solid ' + (isOn ? '#2563eb' : '#e2e8f0') + ';'
              + 'font-size:12px;line-height:1.3;">'
              + '<div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;margin-top:2px;'
              +   'background:' + (isOn ? '#2563eb' : 'white') + ';'
              +   'border:2px solid ' + (isOn ? '#2563eb' : '#cbd5e1') + ';'
              +   'display:flex;align-items:center;justify-content:center;">'
              +   (isOn ? '<span style="color:white;font-size:9px;line-height:1;font-weight:900;">✓</span>' : '')
              + '</div>'
              + '<div style="flex:1;min-width:0;">'
              +   '<div style="display:flex;justify-content:space-between;gap:6px;">'
              +     '<span style="font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + display + '</span>'
              +     '<span style="font-weight:600;color:#2563eb;flex-shrink:0;font-size:11px;">' + amt + '</span>'
              +   '</div>'
              +   (sub ? '<div style="font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(sub) + '</div>' : '')
              + '</div>'
              + '</div>';
          });
          previewEl.innerHTML = html;

          // Event delegation on container — survives re-renders, toggles by line ID
          previewEl.onmousedown = function(e) {
            e.preventDefault();
            const div = e.target.closest('[data-idx]');
            if (!div) return;
            const i = parseInt(div.dataset.idx, 10);
            if (isNaN(i) || !lines[i]) return;
            const lineId = lines[i].id;
            if (selected.has(lineId)) selected.delete(lineId);
            else selected.add(lineId);
            updatePattern();
            render();
          };
        };
        render();
      }, 300);
    };
  },

  _grpAttachPreview(inputEl, previewEl, bank) {
    const MIN  = 2;
    const hint = '<span style="font-size:10px;color:var(--text-tertiary);">Escribe ' + MIN + '+ letras para buscar en concepto, notas y detalles</span>';
    previewEl.innerHTML = hint;
    let _timer = null;
    inputEl.oninput = () => {
      clearTimeout(_timer);
      const q = inputEl.value.trim();
      if (q.length < MIN) { previewEl.innerHTML = hint; return; }
      previewEl.innerHTML = '<span style="font-size:10px;color:var(--text-tertiary);">Buscando...</span>';
      _timer = setTimeout(async () => {
        const lines = await BudgetLogic.searchGastos(q, bank);
        if (!lines.length) {
          previewEl.innerHTML = '<span style="font-size:10px;color:var(--text-tertiary);">Sin coincidencias</span>';
          return;
        }
        let html = '<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px;">'
          + lines.length + ' línea' + (lines.length!==1?'s':'') + ' encontradas</div>';
        lines.slice(0, 12).forEach(l => {
          const total = l.real.reduce((s,v)=>s+v, 0);
          const amt   = total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const label = l.alias || l.concepto;
          const sub   = l.notas ? String(l.notas).slice(0, 60) : '';
          html += '<div style="padding:5px 8px;background:var(--bg-secondary);border:1px solid var(--border-light);'
            + 'border-radius:4px;margin-bottom:2px;font-size:11px;">'
            + '<div style="display:flex;justify-content:space-between;gap:8px;">'
            + '<span style="color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + this._e(label) + '</span>'
            + '<span style="color:var(--text-secondary);font-weight:600;flex-shrink:0;">' + amt + '</span>'
            + '</div>'
            + (sub ? '<div style="color:var(--text-tertiary);font-size:10px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + this._e(sub) + '</div>' : '')
            + '</div>';
        });
        if (lines.length > 12) html += '<div style="font-size:10px;color:var(--text-tertiary);padding:2px 8px;">+' + (lines.length-12) + ' más...</div>';
        previewEl.innerHTML = html;
      }, 250);
    };
  },

  _grpRenderCtx(lineId) {
    const container = document.getElementById('dw-grp-ctx');
    if (!container) return;
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;

    const bank = this.activeBank;
    const cUp = line.concepto.toUpperCase();

    // Check 1: concepto contiene el patrón (movimiento individual dentro de un grupo)
    // Check 2: concepto ES el label del grupo (línea cabecera consolidada)
    const matchingRule = BudgetLogic._groupRules.find(r =>
      (!r.bank || r.bank === bank) && (cUp.includes(r.pattern) || r.label.toUpperCase() === cUp)
    );

    if (matchingRule) {
      // ── Line belongs to a group — show group info with edit options ──
      const label = matchingRule.label;
      const allPatterns = BudgetLogic._groupRules.filter(r => r.label === label && (!r.bank || r.bank === bank));

      let html = `<div class="dw-grp-group">
        <div class="dw-grp-group-hdr"><strong>${this._e(label)}</strong><span class="dw-grp-count">${allPatterns.length} patrón${allPatterns.length > 1 ? 'es' : ''}</span></div>`;
      allPatterns.forEach(r => {
        html += `<div class="dw-grp-pattern">
          <span class="dw-grp-pattern-text">${this._e(r.pattern)}</span>
          <span class="dw-grp-pattern-bank">${r.bank || 'todos'}</span>
          <button class="dw-grp-del" data-pattern="${this._e(r.pattern)}" onclick="BudgetGrid._grpDeletePattern(this.dataset.pattern,'${lineId}')" title="Eliminar patrón">✕</button>
        </div>`;
      });
      // Add-pattern section with search preview and checkboxes
      html += `<div class="dw-grp-add-section">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Añadir patrón</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <input class="dw-grp-add-input" placeholder="Buscar en concepto, notas, detalles..." data-label="${this._e(label)}"
              style="flex:1;padding:7px 10px;border:1px solid var(--border-light);border-radius:6px;font-size:12px;min-width:0;">
          </div>
          <div class="dw-grp-preview-wrap" style="margin-top:6px;max-height:200px;overflow-y:auto;"></div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <input class="dw-grp-pattern-input" placeholder="Patrón a guardar..." data-label="${this._e(label)}"
              style="flex:1;padding:7px 10px;border:1px solid var(--border-light);border-radius:6px;font-size:12px;min-width:0;">
            <button class="dw-grp-add-btn" onclick="BudgetGrid._grpAddPattern(this,'${lineId}')">+</button>
          </div>
        </div>
      </div>`;
      container.innerHTML = html;

      const searchInput  = container.querySelector('.dw-grp-add-input');
      const patternInput = container.querySelector('.dw-grp-pattern-input');
      const previewWrap  = container.querySelector('.dw-grp-preview-wrap');

      if (searchInput && previewWrap) {
        const existingPatterns = allPatterns.map(r => r.pattern);
        this._grpAttachPreviewChecked(searchInput, previewWrap, patternInput, bank, existingPatterns);
        patternInput.onkeydown = (e) => {
          if (e.key === 'Enter') this._grpAddPattern(container.querySelector('.dw-grp-add-btn'), lineId);
        };
        // Pre-fill search with line concepto and trigger automatic search
        const concepto = (line.concepto || '').substring(0, 20);
        if (concepto) {
          searchInput.value = concepto;
          searchInput.dispatchEvent(new Event('input'));
        }
      }
    } else {
      // ── Line not in any group — offer to create ──
      const shortConcepto = line.concepto.substring(0, 30).trim();
      container.innerHTML = `<div class="dw-grp-empty">Este concepto no pertenece a ningún grupo.</div>
        <div style="margin-top:8px;">
          <label>Nombre del grupo</label>
          <input id="dw-grp-new-label" value="${this._e(shortConcepto)}" placeholder="Ej: Amazon, Peaje...">
          <label>Buscar líneas a incluir</label>
          <input id="dw-grp-new-search" value="${this._e(shortConcepto.substring(0,20))}" placeholder="Escribe para buscar...">
          <div id="dw-grp-preview" style="margin:6px 0;max-height:160px;overflow-y:auto;"></div>
          <label>Patrón a guardar</label>
          <input id="dw-grp-new-pattern" value="${this._e(cUp.substring(0, 20))}" placeholder="Texto que matchea...">
          <button class="btn-save" style="width:100%;margin-top:8px;" onclick="BudgetGrid._grpCreateNew('${lineId}')">Crear grupo</button>
        </div>`;
      // Two separate inputs: searchEl for searching, patternEl for the saved pattern
      const searchEl = document.getElementById('dw-grp-new-search');
      const patInput = document.getElementById('dw-grp-new-pattern');
      const pvEl     = document.getElementById('dw-grp-preview');
      if (searchEl && patInput && pvEl) {
        // Start pattern field empty — user must type/confirm the pattern to save
        patInput.value = '';
        this._grpAttachPreviewChecked(searchEl, pvEl, patInput, bank, []);
        if (searchEl.value.trim().length >= 2) {
          searchEl.dispatchEvent(new Event('input'));
        }
      }
    }
  },

  async _grpCreateNew(lineId) {
    const label = document.getElementById('dw-grp-new-label')?.value?.trim();
    const pattern = document.getElementById('dw-grp-new-pattern')?.value?.trim();
    if (!label) { alert('Introduce un nombre para el grupo'); return; }
    if (!pattern) { alert('Introduce un patrón'); return; }

    try {
      await BudgetLogic.createGroupRule(pattern, label, this.activeBank);
      this._toast(`Grupo "${label}" creado`);
      await this._grpApplyToGrid(pattern.toUpperCase(), label);
    } catch(e) {
      console.error('Error creating group:', e);
      alert('Error: ' + (e?.result?.error?.message || e.message || 'Error'));
    }
  },

  async _grpAddPattern(btn, lineId) {
    // Try new pattern-input first, fallback to previousElementSibling
    const input = btn.closest('.dw-grp-add-section')?.querySelector('.dw-grp-pattern-input')
                  || btn.previousElementSibling;
    const pattern = input?.value?.trim();
    const label   = input?.dataset?.label;
    if (!pattern || !label) { alert('Introduce un patrón'); return; }

    try {
      await BudgetLogic.createGroupRule(pattern, label, this.activeBank);
      this._toast(`Patrón "${pattern}" añadido a "${label}"`);
      await this._grpApplyToGrid(pattern.toUpperCase(), label);
    } catch(e) {
      console.error('Error adding pattern:', e);
      alert('Error: ' + (e?.result?.error?.message || e.message || 'Error'));
    }
  },

  async _grpDeletePattern(pattern, lineId) {
    const rule = BudgetLogic._groupRules.find(r => r.pattern === pattern.toUpperCase());
    if (!rule) return;
    try {
      if (rule.sheetRow > 0) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, rule.sheetRow, 10, 'FALSE');
      } else {
        const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
        if (rows) {
          for (let i = 1; i < rows.length; i++) {
            if (String(rows[i][0]||'').trim().toUpperCase() === rule.pattern && String(rows[i][3]||'') === 'group') {
              await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, i + 1, 10, 'FALSE');
              break;
            }
          }
        }
      }
      const idx = BudgetLogic._groupRules.indexOf(rule);
      if (idx >= 0) BudgetLogic._groupRules.splice(idx, 1);

      // D — Clean breakdown entries matching this pattern from all affected lines in memory + sheet
      const patUp = pattern.toUpperCase();
      const bdUpdates = [];
      this.lines.forEach(line => {
        if (line.bank !== this.activeBank || !line.breakdown) return;
        let bd;
        try { bd = JSON.parse(line.breakdown); } catch(e) { return; }
        let changed = false;
        Object.keys(bd).forEach(mi => {
          if (!Array.isArray(bd[mi])) return;
          const before = bd[mi].length;
          bd[mi] = bd[mi].filter(entry => {
            const c = String(entry.c || '').toUpperCase();
            return !c.includes(patUp);
          });
          if (bd[mi].length !== before) changed = true;
        });
        if (changed) {
          // Remove empty month keys
          Object.keys(bd).forEach(mi => { if (!bd[mi] || !bd[mi].length) delete bd[mi]; });
          const newJson = Object.keys(bd).length ? JSON.stringify(bd) : '';
          line.breakdown = newJson;
          if (line.sheetRow > 0) bdUpdates.push({ row: line.sheetRow, col: 42, value: newJson });
        }
      });
      if (bdUpdates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, bdUpdates);

      this._toast(`Patrón "${pattern}" eliminado`);
      if (lineId) this._grpRenderCtx(lineId);
    } catch(e) {
      console.error('Error deleting pattern:', e);
      alert('Error: ' + (e?.result?.error?.message || e.message || 'Error'));
    }
  },

  // Apply a group rule to existing BUDGET_LINES: consolidate matching lines into one
  async _grpApplyToGrid(pattern, label) {
    const bank = this.activeBank;
    const year = AppState.currentYear;

    // Split multi-pattern using ||| separator. Each sub-pattern is an alternative
    // concepto to match (OR logic). Single | within a pattern is treated as part of the text.
    const patterns = pattern.split('|||').map(p => p.trim().toUpperCase()).filter(Boolean);

    // Determine which section to operate on from the first matching line.
    // This prevents mixing GASTOS and INGRESOS lines (e.g. GEO ALTERNATIVA
    // can appear in both sections when a provider issues both charges and refunds).
    // We use the section of the line that triggered the group creation (the drawer line).
    // All matching lines must be from the same section.
    const allMatching = this.lines.filter(l => {
      if (l.bank !== bank) return false;
      if (!l.concepto) return false;
      if (l.estado === 'DELETED') return false;
      const cUp = l.concepto.toUpperCase();
      return patterns.some(p => cUp.includes(p));
    });

    if (!allMatching.length) return;

    // Pick the dominant section (most lines), then filter to that section only
    const sectionCounts = {};
    allMatching.forEach(l => { sectionCounts[l.section] = (sectionCounts[l.section] || 0) + 1; });
    const dominantSection = Object.entries(sectionCounts).sort((a,b) => b[1]-a[1])[0][0];
    const matching = allMatching.filter(l => l.section === dominantSection);

    if (!matching.length) return;

    // Existing group line: a line with concepto === label that was already in the sheet.
    // For TARJETAS, group lines are children (have parentId), so we must NOT exclude them.
    let groupLine = this.lines.find(l =>
      l.bank === bank && l.concepto === label && l.sheetRow > 0 && !matching.includes(l)
    );

    // _newGroupId declared here (not inside if block) so it is accessible
    // in the in-memory push below — was a const inside if = scope bug.
    let _newGroupId = null;

    if (!groupLine) {
      const firstMatch = matching[0];
      const section = firstMatch.section;
      const parentId = firstMatch.parentId || '';
      _newGroupId = BudgetLogic.generateId('BL');
      const now = new Date().toISOString();
      const amounts = new Array(12).fill(0);
      matching.forEach(m => { for (let i = 0; i < 12; i++) amounts[i] += m.real[i]; });
      const bd = {};
      matching.forEach(m => {
        for (let i = 0; i < 12; i++) {
          if (m.real[i]) {
            if (!bd[i]) bd[i] = [];
            bd[i].push({ d: '', a: m.real[i], c: m.concepto.substring(0, 50) });
          }
        }
      });
      const breakdownJson = Object.keys(bd).length ? JSON.stringify(bd) : '';
      const plan = new Array(12).fill(0);
      await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, [
        _newGroupId, bank, year, section, label, '', '', '', 'one-off',
        ...plan, ...amounts,
        'FALSE', 999, 'ACTIVE', now, now, '', parentId, '', breakdownJson
      ]);
    } else {
      // Batch update group line amounts
      const updates = [];
      for (let i = 0; i < 12; i++) {
        const addAmt = matching.reduce((s, m) => s + (m.real[i] || 0), 0);
        if (addAmt) {
          groupLine.real[i] = (groupLine.real[i] || 0) + addAmt;
          updates.push({ row: groupLine.sheetRow, col: BudgetLogic.getRealCol(i), value: groupLine.real[i] });
        }
      }
      let bd = {};
      if (groupLine.breakdown) { try { bd = JSON.parse(groupLine.breakdown); } catch(e) {} }
      matching.forEach(m => {
        for (let i = 0; i < 12; i++) {
          if (m.real[i]) {
            if (!bd[i]) bd[i] = [];
            bd[i].push({ d: '', a: m.real[i], c: m.concepto.substring(0, 50) });
          }
        }
      });
      updates.push({ row: groupLine.sheetRow, col: 42, value: JSON.stringify(bd) });
      if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, updates);
    }

    // Batch delete matching lines (single batchUpdate setting all to DELETED)
    const delUpdates = matching.map(m => ({ row: m.sheetRow, col: 36, value: 'DELETED' }));
    if (delUpdates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, delUpdates);

    // LAYER 2: update this.lines in memory immediately so render() is consistent
    // without waiting for the round-trip refresh from Sheets.
    const matchingIds = new Set(matching.map(m => m.id));
    this.lines = this.lines.filter(l => !matchingIds.has(l.id));

    if (!groupLine) {
      // Add the newly created consolidated line to memory with provisional sheetRow=-1
      // (refresh() below will assign the real sheetRow)
      const amounts = new Array(12).fill(0);
      matching.forEach(m => { for (let i = 0; i < 12; i++) amounts[i] += m.real[i]; });
      const bd = {};
      matching.forEach(m => {
        for (let i = 0; i < 12; i++) {
          if (m.real[i]) {
            if (!bd[i]) bd[i] = [];
            bd[i].push({ d: '', a: m.real[i], c: m.concepto.substring(0, 50) });
          }
        }
      });
      const firstMatch = matching[0];
      this.lines.push({
        id: _newGroupId,
        bank,
        year,
        section: firstMatch.section,
        concepto: label,
        casa: '',
        categoria: '',
        subcategoria: '',
        cadence: 'one-off',
        plan: new Array(12).fill(0),
        real: amounts,
        notas: '',
        parentId: firstMatch.parentId || '',
        alias: '',
        breakdown: Object.keys(bd).length ? JSON.stringify(bd) : '',
        sheetRow: -1
      });
    }
    // Immediately render with updated memory, then silently sync sheetRows from Sheets
    document.querySelector('.budget-drawer-overlay')?.remove();
    this.render();
    // Background sync to get real sheetRow for the new line
    this.refresh();
  },

  // Extract the most meaningful keyword from a notes string.
  // Strips: dates (DD/MM/YYYY, YYYY-MM-DD), long ref numbers (6+ digits),
  // IBANs, standard banking codes, and returns the remaining words capitalised.
  openPropagatePanel(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    document.querySelectorAll('.prop-panel-overlay').forEach(e => e.remove());

    // Detect active option by inspecting actual plan data, not cadence field
    // (user may have propagated without setting cadence in the drawer)
    const options_check = [
      { label: 'Mensual',    months: [0,1,2,3,4,5,6,7,8,9,10,11] },
      { label: 'Bimestral',  months: [0,2,4,6,8,10] },
      { label: 'Trimestral', months: [0,3,6,9] },
      { label: 'Semestral',  months: [0,6] },
    ];
    const baseVal = line.plan[0] || 0;
    let active = null;
    if (baseVal !== 0) {
      for (const opt of options_check) {
        const allMatch = opt.months.every(m => (line.plan[m] || 0) === baseVal);
        const othersBlank = [0,1,2,3,4,5,6,7,8,9,10,11]
          .filter(m => !opt.months.includes(m))
          .every(m => (line.plan[m] || 0) === 0);
        if (allMatch && othersBlank) { active = opt.label; break; }
      }
    }

    const options = [
      { label: 'Mensual',   months: [0,1,2,3,4,5,6,7,8,9,10,11] },
      { label: 'Bimestral', months: [0,2,4,6,8,10] },
      { label: 'Trimestral',months: [0,3,6,9] },
      { label: 'Semestral', months: [0,6] },
      { label: 'Anual',     months: [0] },
    ];

    const ov = document.createElement('div');
    ov.className = 'prop-panel-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };

    ov.innerHTML = `<div class="prop-panel">
      <div class="prop-panel-header">
        <span>Propagar plan — <strong>${this._e(this._displayName(line))}</strong></span>
        <button onclick="this.closest('.prop-panel-overlay').remove()" class="prop-panel-close">✕</button>
      </div>
      <div class="prop-panel-sub">Valor base (Enero): <strong>${this._f(baseVal, 1) || '0,00'} €</strong></div>
      <div class="prop-panel-opts">
        ${options.map(o => `
          <button class="prop-opt${o.label === active ? ' active' : ''}"
            onclick="BudgetGrid._doPropagation('${lineId}', ${JSON.stringify(o.months)}, '${o.label}', this)">
            <span class="prop-opt-label">${o.label}</span>
            <span class="prop-opt-sub">${o.months.map(m => ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m]).join(' · ')}</span>
          </button>`).join('')}
      </div>
      <p class="prop-panel-hint">Pulsa una opción para propagar · vuelve a pulsar para desmarcar (pone a 0)</p>
    </div>`;
    document.body.appendChild(ov);
  },

  async _doPropagation(lineId, months, label, btn) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const isActive = btn.classList.contains('active');
    const baseVal  = line.plan[0] || 0;
    const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    if (isActive) {
      // Toggle OFF — confirm before clearing, then blank propagated months, keep January
      const toBlank = months.filter(m => m !== 0 && (line.plan[m] || 0) !== 0);
      if (toBlank.length) {
        const names = toBlank.map(m => MN[m]).join(', ');
        const confirmed = confirm(`Se borrarán los valores de:\n${names}\n\nEnero se mantiene intacto. ¿Continuar?`);
        if (!confirmed) return; // panel stays open
      }
      const allPropagated = months.filter(m => m !== 0);
      const updates = allPropagated.map(m => {
        line.plan[m] = 0;
        return { row: line.sheetRow, col: BudgetLogic.getPlanCol(m), value: 0 };
      });
      if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, updates);
      document.querySelector('.prop-panel-overlay')?.remove();
      this.render();
    } else {
      // Toggle ON — check for existing non-zero months that would be overwritten
      const nonZero = months.filter(m => m !== 0 && (line.plan[m] || 0) !== 0);
      if (nonZero.length) {
        const names = nonZero.map(m => MN[m]).join(', ');
        const confirmed = confirm(`Los siguientes meses ya tienen valor:\n${names}\n\n¿Sobreescribir con ${this._f(baseVal,1) || '0,00'} €?`);
        if (!confirmed) return; // panel stays open
      }
      const updates = months.filter(m => m !== 0).map(m => {
        line.plan[m] = baseVal;
        return { row: line.sheetRow, col: BudgetLogic.getPlanCol(m), value: baseVal };
      });
      if (updates.length) await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, updates);
      document.querySelector('.prop-panel-overlay')?.remove();
      this.render();
    }
  },

  _extractKeyword(notes) {
    if (!notes) return '';
    let s = String(notes)
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '')    // ISO timestamps
      .replace(/\b\d{4,}\b/g, '')                       // long ref numbers
      .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{8,}\b/g, '')   // IBANs
      .replace(/\b\w*INTER\w*\b/gi, '')                  // INTER codes (02INTER, INTERBANK, etc.)
      .replace(/\b(NOTPROVIDED|TFR|SEPA|SWIFT|BIC|REF|OUR|SHA|BEN)\b/gi, '')
      .replace(/[.\-·/|·,]+/g, ' ')                     // separators + dots
      .replace(/\s+/g, ' ').trim();
    // Return up to 2 most significant words (≥3 chars, not pure numbers)
    const words = s.split(' ').filter(w => w.length >= 3 && !/^\d+$/.test(w));
    return words.slice(0, 2).join(' ').toUpperCase();
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const alias = document.getElementById('dw-alias').value.trim();
    const cas = document.getElementById('dw-cas').value;
    const cat = document.getElementById('dw-cat').value, sub = document.getElementById('dw-sub').value;
    const cad = document.getElementById('dw-cad').value;
    // Save alias in col 41 (0-indexed 40)
    const aliasVal = (alias && alias !== line.concepto) ? alias : '';
    try {
      await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
        { row: line.sheetRow, col: 6, value: cas },
        { row: line.sheetRow, col: 7, value: cat }, { row: line.sheetRow, col: 8, value: sub },
        { row: line.sheetRow, col: 9, value: cad }, { row: line.sheetRow, col: 38, value: new Date().toISOString() },
        { row: line.sheetRow, col: 41, value: aliasVal }
      ]);
      // Create categorization rule con alias — sin llamada API extra, va en mismo batchUpdate
      if (cat && line.concepto.trim()) {
        try {
          // Use the keyword input if visible, else fall back to full notes
          const kwEl = document.getElementById('dw-notes-kw');
          const notesKey = kwEl ? kwEl.value.trim() : '';
          // If user cleared the keyword field, don't include notes in pattern (concepto-only rule)
          const rulePattern = line.concepto + (notesKey ? '|||' + notesKey : '');
          await BudgetLogic.createRule(rulePattern, this.activeBank, cas, cat, sub, aliasVal || '');
        } catch(re) { console.warn('createRule failed (line still saved):', re); }
      }
      // Update all fields in memory immediately so render() removes the red band
      // without waiting for the round-trip refresh from Sheets
      line.casa         = cas;
      line.categoria    = cat;
      line.subcategoria = sub;
      line.cadence      = cad;
      line.alias        = aliasVal;
      document.querySelector('.budget-drawer-overlay')?.remove();
      this.render(); // immediate re-render with correct in-memory data
      await this.refresh(); // background sync to confirm sheet state
    } catch(e) {
      console.error('saveDrawer error:', e);
      alert('Error guardando: ' + (e?.result?.error?.message || e.message || 'Error desconocido'));
    }
  },

  // ══════════ IMPORT DRAWER ══════════

  openImportDrawer(type) {
    const isTarjeta = type === 'tarjeta';
    const acc = AppState.config?.accounts?.find(a => a.name === this.activeBank);
    const exts = acc?.extractos?.split(',').map(s=>s.trim()).filter(Boolean) || [];
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;">Importar ${isTarjeta ? 'Extracto Tarjeta' : 'Extracto Banco'}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <div id="imp-month-row" style="display:none;margin-bottom:12px;">
        <label style="margin-top:0;margin-bottom:4px;display:block;font-size:13px;font-weight:600;">Mes del extracto <span style="color:var(--negative,#ef4444);">*</span></label>
        <select id="imp-month" style="width:100%;padding:10px;border-radius:8px;border:2px solid var(--accent);font-size:13px;font-family:inherit;background:white;">
          <option value="">-- Selecciona mes --</option>
          <option value="1">Enero</option>
          <option value="2">Febrero</option>
          <option value="3">Marzo</option>
          <option value="4">Abril</option>
          <option value="5">Mayo</option>
          <option value="6">Junio</option>
          <option value="7">Julio</option>
          <option value="8">Agosto</option>
          <option value="9">Septiembre</option>
          <option value="10">Octubre</option>
          <option value="11">Noviembre</option>
          <option value="12">Diciembre</option>
        </select>
      </div>
      <label style="margin-top:0;">Extracto <span style="color:var(--negative,#ef4444);">*</span></label>
      <select id="imp-extracto" required style="width:100%;padding:10px;border-radius:8px;border:2px solid var(--accent);font-size:13px;font-family:inherit;margin-bottom:4px;background:white;" onchange="BudgetGrid._onExtractoChange(this,'${type}')">
        <option value="">— Seleccionar extracto —</option>
        ${exts.map(e => '<option value="' + e + '">' + e + '</option>').join('')}
        ${!exts.length ? '<option disabled>Sin extractos configurados para este banco</option>' : ''}
      </select>
      <div id="imp-bank-warn" style="display:none;margin-bottom:10px;padding:8px 10px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:12px;color:#92400e;"></div>
      <label style="margin-top:8px;">Archivo</label>
      <div class="import-dropzone" id="imp-dz" style="padding:24px 16px;margin-top:8px;cursor:not-allowed;opacity:0.5;pointer-events:none;">
        <div style="font-size:28px;margin-bottom:6px;">📁</div>
        <div style="font-size:13px;font-weight:600;">Arrastra o haz clic</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">CSV · XLSX · XLS · PDF</div>
        <input type="file" id="imp-fi" accept=".csv,.html,.htm,.xls,.xlsx,.pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" onchange="BudgetGrid._impFile(this,'${type}')">
      </div>
      <div id="imp-pv" style="margin-top:16px;"></div>
      <div id="imp-act" style="display:none;margin-top:16px;">
        <button class="btn-save" onclick="BudgetGrid._impConfirm('${type}')" style="width:100%;">Importar movimientos</button>
      </div>
      <div id="imp-undo-persistent" style="margin-top:12px;"></div>
    </div>`;
    document.body.appendChild(ov);

    // Show month selector only for tarjeta, hide for gastos/ingresos
    const monthRow = document.getElementById('imp-month-row');
    const monthSel = document.getElementById('imp-month');
    if (type === 'tarjeta') {
      if (monthRow) monthRow.style.display = 'block';
      // Pre-select current month as default
      if (monthSel) monthSel.value = String(AppState.currentMonth);
    } else {
      if (monthRow) monthRow.style.display = 'none';
      if (monthSel) monthSel.value = String(AppState.currentMonth);
    }

    // Always show undo section — populate from memory, localStorage, or sheet scan
    this._renderUndoSection();

    // Dropzone enabled only after extracto is selected
    const dz = document.getElementById('imp-dz');
    if (dz) {
      dz.onclick = (e) => {
        if (!document.getElementById('imp-extracto').value) return;
        e.stopPropagation(); document.getElementById('imp-fi').click();
      };
      dz.ondragover = e => { if (!document.getElementById('imp-extracto').value) return; e.preventDefault(); dz.classList.add('dragover'); };
      dz.ondragleave = () => dz.classList.remove('dragover');
      dz.ondrop = e => {
        if (!document.getElementById('imp-extracto').value) return;
        e.preventDefault(); dz.classList.remove('dragover');
        if (e.dataTransfer.files.length) this._impProcess(e.dataTransfer.files[0], type);
      };
    }
  },

  // Called when extracto selector changes — enables dropzone and runs bank validation
  _onExtractoChange(sel, type) {
    const val = sel.value;
    const dz  = document.getElementById('imp-dz');
    const warn = document.getElementById('imp-bank-warn');
    if (!val) {
      if (dz) { dz.style.opacity = '0.5'; dz.style.pointerEvents = 'none'; dz.style.cursor = 'not-allowed'; }
      return;
    }
    // Enable dropzone
    if (dz) { dz.style.opacity = '1'; dz.style.pointerEvents = 'auto'; dz.style.cursor = 'pointer'; }
    // Bank mismatch validation: check if the selected extracto is allowed for active bank
    const acc = AppState.config?.accounts?.find(a => a.name === this.activeBank);
    const allowed = acc?.extractos?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) || [];
    if (warn) {
      if (allowed.length && !allowed.includes(val.toUpperCase())) {
        warn.style.display = 'block';
        warn.innerHTML = `⚠️ <strong>${val}</strong> no está configurado para <strong>${this.activeBank}</strong>. Verifica que estás importando en el banco correcto.`;
      } else {
        warn.style.display = 'none';
      }
    }
  },

  _impMovements: [], _impSaldo: null,
  _lastImportMeta: null,

  async _renderUndoSection() {
    const div = document.getElementById('imp-undo-persistent');
    if (!div) return;

    // Try memory first, then localStorage
    let meta = this._lastImportMeta;
    if (!meta) {
      try {
        const saved = localStorage.getItem('budgetLastImport');
        if (saved) { meta = JSON.parse(saved); this._lastImportMeta = meta; }
      } catch(e) {}
    }

    // If still nothing, scan sheet for most recent import for this bank
    if (!meta) {
      try {
        div.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary);padding:6px 0;">Buscando último import…</div>`;
        const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_LINES);
        let latestTs = '', latestBank = this.activeBank;
        const year = String(AppState.currentYear);
        (rows || []).forEach(r => {
          if (!r[0] || r[35] === 'DELETED') return;
          if (String(r[2]||'').split('.')[0] !== year) return;
          if (r[1] !== this.activeBank) return;
          const ts = String(r[36] || r[37] || '');
          if (ts > latestTs) { latestTs = ts; latestBank = r[1]; }
        });
        if (latestTs) {
          meta = { bank: latestBank, ts: latestTs };
          this._lastImportMeta = meta;
          try { localStorage.setItem('budgetLastImport', JSON.stringify(meta)); } catch(e) {}
        }
      } catch(e) {}
    }

    if (meta) {
      const dt = new Date(meta.ts).toLocaleString('es-ES', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      div.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-size:10px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.05em;">Último import</div>
          <div style="font-size:12px;color:#7f1d1d;margin-top:2px;">${this._e(meta.bank)} · ${dt}</div>
        </div>
        <button onclick="BudgetGrid._undoLastImport()" style="background:#ef4444;color:white;border:none;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0;">↩ Deshacer</button>
      </div>`;
    } else {
      div.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary);padding:4px 0;text-align:center;">Sin imports recientes para ${this._e(this.activeBank)}</div>`;
    }
  },

  async _undoLastImport() {
    // Restore from localStorage if in-memory lost
    if (!this._lastImportMeta) {
      try {
        const saved = localStorage.getItem('budgetLastImport');
        if (saved) this._lastImportMeta = JSON.parse(saved);
      } catch(e) {}
    }
    if (!this._lastImportMeta) {
      alert('No hay import reciente para deshacer.');
      return;
    }
    const { bank, ts, ids } = this._lastImportMeta;
    const dt = new Date(ts).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    if (!confirm(`¿Deshacer el import de ${bank} del ${dt}?\n\nEsto marcará como eliminadas las ${ids ? ids.length : '?'} líneas creadas en ese import.`)) return;

    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_LINES);
    const updates = [];
    const deletedIds = new Set();

    if (ids && ids.length > 0) {
      // Precise undo: delete exactly the rows created in this import by ID
      const idSet = new Set(ids);
      (rows || []).forEach((r, i) => {
        if (!r[0] || r[35] === 'DELETED') return;
        if (idSet.has(r[0])) {
          updates.push({ row: i + 1, col: 36, value: 'DELETED' });
          deletedIds.add(r[0]);
        }
      });
    } else {
      // Fallback for old imports without IDs: use timestamp (second precision)
      const tsPrefix = ts.substring(0, 19);
      (rows || []).forEach((r, i) => {
        if (!r[0] || r[35] === 'DELETED') return;
        if (r[1] !== bank) return;
        const created = String(r[36] || '').substring(0, 19);
        if (created === tsPrefix) {
          updates.push({ row: i + 1, col: 36, value: 'DELETED' });
          deletedIds.add(r[0]);
        }
      });
    }

    if (!updates.length) {
      alert('No se encontraron líneas de ese import (puede que ya se hayan eliminado).');
      return;
    }
    // Batch delete in chunks
    for (let i = 0; i < updates.length; i += 20) {
      await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, updates.slice(i, i + 20));
    }
    // Remove from memory
    this.lines = this.lines.filter(l => !deletedIds.has(l.id));
    this._lastImportMeta = null;
    try { localStorage.removeItem('budgetLastImport'); } catch(e) {}
    this._renderUndoSection();
    BudgetLogic.invalidateGastosCache(bank);
    const pv = document.getElementById('imp-pv');
    if (pv) pv.innerHTML = `<div style="padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;font-weight:600;">✅ ${updates.length} líneas eliminadas. Import deshecho.</div>`;
    setTimeout(() => { document.querySelector('.budget-drawer-overlay')?.remove(); this.refresh(); }, 1500);
  },
  _impFile(input, type) { if (input.files.length) this._impProcess(input.files[0], type); },

  async _impProcess(file, type) {
    const ext = file.name.split('.').pop().toLowerCase();
    const pv = document.getElementById('imp-pv'), act = document.getElementById('imp-act');
    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Procesando archivo...</div>';
    this._impSaldo = null;
    try {
      let movements = [];
      if (ext === 'xlsx' || ext === 'xls') movements = await this._parseSmartXLSX(file);
      else if (ext === 'csv') movements = await this._parseCSV(file);
      else if (ext === 'html' || ext === 'htm') movements = await this._parseGenericHTML(file);
      else if (ext === 'pdf') movements = await this._parsePDF(file);
      else { pv.innerHTML = '<div style="color:var(--danger);">Formato no soportado.</div>'; return; }

      // Apply exclusion patterns from RULES sheet (only for bank imports — not for tarjeta extracts)
      if (type !== 'tarjeta') {
        const excl = BudgetLogic.getExclusionPatterns(this.activeBank);
        if (excl.length) {
          const before = movements.length;
          movements = movements.filter(mv => {
            const searchText = (String(mv.concepto) + ' ' + String(mv.notes || '')).toUpperCase();
            return !excl.some(p => searchText.includes(p));
          });
          if (before !== movements.length) console.log(`Excluded ${before - movements.length} movements by rules`);
        }
      }

      this._impMovements = movements;
      if (!movements.length) { pv.innerHTML = '<div style="color:var(--text-secondary);">No se encontraron movimientos.</div>'; return; }

      // Auto-detect month from parsed dates
      const monthCounts = new Array(12).fill(0);
      movements.forEach(mv => {
        if (mv.date) {
          const ext = this._extractDate(mv.date, AppState.currentMonth - 1);
          if (ext.year === AppState.currentYear) monthCounts[ext.month]++;
        }
      });
      const detectedMonth = monthCounts.indexOf(Math.max(...monthCounts));
      // For tarjeta: extracto month is detected+1 (gastos de enero → extracto febrero)
      const extractoMonth = type === 'tarjeta' ? (detectedMonth + 1 > 11 ? 0 : detectedMonth + 1) : detectedMonth;
      // Set the hidden imp-month to the auto-detected value (1-based)
      const impMonthEl = document.getElementById('imp-month');
      if (impMonthEl) impMonthEl.value = type === 'tarjeta' ? (extractoMonth + 1) : (detectedMonth + 1);

      const TARJETA_PV = ['IBERIA CARDS','VISA ','MASTERCARD','AMEX','AMERICAN EXPRESS'];
      const preview = movements.slice(0, 12);
      const nInc = movements.filter(m => m.originalSign > 0).length;
      const MONTHS_SHORT = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const monthLabel = type === 'tarjeta'
        ? `Extracto ${MONTHS_SHORT[extractoMonth+1]} → gastos ${MONTHS_SHORT[detectedMonth+1]}`
        : `Mes detectado: ${MONTHS_SHORT[detectedMonth+1]}`;
      let tbl = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${movements.length} movimientos${nInc ? ` (${nInc} ingresos)` : ''}${this._impSaldo ? ` · Saldo: ${this._f(this._impSaldo.value,1)}` : ''} · <strong>${monthLabel}</strong></div>`;
      tbl += `<div style="overflow-x:auto;border:1px solid var(--border-light);border-radius:6px;max-height:200px;overflow-y:auto;"><table class="import-preview-table"><thead><tr><th>Concepto</th><th style="text-align:right;">Importe</th><th>Tipo</th></tr></thead><tbody>`;
      preview.forEach(mv => {
        const isTar = TARJETA_PV.some(p => String(mv.concepto).toUpperCase().includes(p));
        const tipo = type === 'tarjeta' ? (mv.titular || 'Tarj.') : (isTar ? '<span style="color:#7c3aed;">Tarj.</span>' : (mv.originalSign > 0 ? '<span style="color:#10b981;">Ingr.</span>' : 'Gasto'));
        tbl += `<tr><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._e(mv.concepto)}</td><td style="text-align:right;white-space:nowrap;">${this._f(mv.amount,1)}</td><td style="font-size:10px;">${tipo}</td></tr>`;
      });
      if (movements.length > 12) tbl += `<tr><td colspan="3" style="text-align:center;color:var(--text-secondary);font-size:11px;">... y ${movements.length-12} más</td></tr>`;
      tbl += '</tbody></table></div>';
      pv.innerHTML = tbl;
      if (act) act.style.display = 'block';
    } catch (e) {
      console.error('Import error:', e);
      pv.innerHTML = `<div style="color:var(--danger);padding:8px;background:#fef2f2;border-radius:6px;">❌ Error: ${e.message}</div>`;
    }
  },

  // ══════════ SMART PARSERS ══════════

  async _parseSmartXLSX(file) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const row = rows[i]; if (!row) continue;
        // Check each cell individually — avoid false matches from long text paragraphs
        const cells = row.map(c => String(c||'').toUpperCase().trim()).filter(c => c.length > 0 && c.length < 50);
        const cellJoined = cells.join('|');
        // Amex Excel: "Fecha|Descripción|Titular de la Tarjeta|Cuenta|Importe"
        if (cellJoined.includes('TITULAR DE LA TARJETA') && cellJoined.includes('IMPORTE')) return this._parseAmexXLSX(rows);
        // Intessa V1 (app export): "Data|Operazione|Dettagli|...Importo"
        if (cellJoined.includes('OPERAZIONE') && cellJoined.includes('IMPORTO')) return this._parseIntessa(rows);
        // Visa Intesa card (check BEFORE V2 — has "ACCREDITI IN VALUTA" or "ADDEBITI IN VALUTA")
        if (cellJoined.includes('DATA CONTABILE') && cellJoined.includes('DESCRIZIONE') && (cellJoined.includes('IN VALUTA') || cellJoined.includes('ADDEBITI IN'))) return this._parseVisaIntesa(rows);
        // Intessa V2 (bank statement with saldo): "Data contabile|Data valuta|Descrizione|Accrediti|Addebiti|Descrizione estesa"
        if (cellJoined.includes('DATA CONTABILE') && cellJoined.includes('DESCRIZIONE') && cellJoined.includes('DESCRIZIONE ESTESA')) return this._parseIntessaV2(rows);
        if (cellJoined.includes('FECHA OPERACIÓN') || (cellJoined.includes('COMERCIO') && cellJoined.includes('IMPORTE EUROS'))) return this._parseIberia(rows);
        // Iberia annual export: "Fecha operación|Comercio|||Importe" — no Nº column, no IMPORTE EUROS
        if (cellJoined.includes('COMERCIO') && cellJoined.includes('IMPORTE') && !cellJoined.includes('IMPORTE EUROS') && !cellJoined.includes('Nº') && !cellJoined.includes('NO')) return this._parseIberiaAnual(rows);
        if (cellJoined.includes('MOVIMIENTO') && (cellJoined.includes('MÁS DATOS') || cellJoined.includes('MAS DATOS') || cellJoined.includes('IMPORTE'))) return this._parseCaixa(rows);
        if (cellJoined.includes('MESSAGE') && (cellJoined.includes('DEBIT') || cellJoined.includes('CREDIT'))) return this._parseCIC(rows);
      }
      // Also check for Intessa V2 / Visa by scanning for saldo line patterns
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i]; if (!row) continue;
        const joined = row.map(c => String(c||'').toUpperCase()).join('|');
        if (joined.includes('SALDO CONTABILE') && joined.includes('FINALE')) return this._parseIntessaV2(rows);
        if (joined.includes('SBILANCIO ALLA DATA')) return this._parseVisaIntesa(rows);
      }
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    return this._parseGenericRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }));
  },

  _parseAmexXLSX(rows) {
    console.log('[Amex XLSX] Starting parse, rows:', rows.length);
    let hdrRow = -1, cFecha = -1, cDesc = -1, cTitular = -1, cImporte = -1, cRef = -1;
    const SKIP = ['RECIBO ENVIADO'];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v === 'FECHA') cFecha = j;
        if (v.includes('DESCRIPCI')) cDesc = j;
        if (v.includes('TITULAR')) cTitular = j;
        if (v === 'IMPORTE') cImporte = j;
        if (v === 'REFERENCIA') cRef = j;
      }
      if (cDesc >= 0 && cImporte >= 0) { hdrRow = i; break; }
    }
    if (hdrRow < 0) { console.log('[Amex XLSX] Header not found'); return []; }
    console.log(`[Amex XLSX] Header at row ${hdrRow}: cFecha=${cFecha} cDesc=${cDesc} cTitular=${cTitular} cImporte=${cImporte}`);

    const mvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const desc = String(r[cDesc] || '').trim();
      const amount = parseFloat(r[cImporte]);
      if (!desc || isNaN(amount) || amount === 0) continue;
      const cUp = desc.toUpperCase();
      if (SKIP.some(s => cUp.includes(s))) { console.log(`[Amex XLSX] Skip: '${desc}'`); continue; }
      const fecha = r[cFecha] || '';
      const titular = String(r[cTitular] || '').trim();
      const parts = titular.split(/\s+/);
      let firstName = parts[0] || 'Principal';
      if (firstName.length <= 2 && parts.length > 2) firstName = parts[2];
      if (firstName.length <= 2) firstName = titular;
      // Map known names → friendly first name + Amex
      const nameUp = firstName.toUpperCase();
      if (nameUp === 'GARCIA' || nameUp.includes('GARCIA')) firstName = 'Ricardo';
      else if (nameUp === 'SYLVIA' || nameUp === 'BORNHOLT' || nameUp.includes('BORNHOLT')) firstName = 'Sylvia';
      else if (nameUp === 'SANDRA') firstName = 'Sandra';
      else firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      firstName += ' Amex';
      mvs.push({
        concepto: desc.substring(0, 80),
        amount: amount,
        originalSign: amount >= 0 ? -1 : 1,
        date: fecha,
        notes: '',
        titular: firstName,
        txRef: cRef >= 0 ? String(r[cRef] || '').trim() : ''  // Amex unique transaction reference
      });
    }
    console.log(`[Amex XLSX] Parsed ${mvs.length} movements`);
    return mvs;
  },

  _parseIntessaV2(rows) {
    console.log('[Intessa V2] Starting parse, rows:', rows.length);
    // Find header: "Data contabile|Data valuta|Descrizione|Accrediti|Addebiti|Descrizione estesa"
    let hdrRow = -1, cDate = -1, cDesc = -1, cCredit = -1, cDebit = -1, cDescExt = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v === 'DATA CONTABILE') cDate = j;
        if (v === 'DESCRIZIONE' && cDesc < 0) cDesc = j;
        if (v === 'DESCRIZIONE ESTESA') cDescExt = j;
        if (v === 'ACCREDITI' && !v.includes('VALUTA')) cCredit = j;
        if (v === 'ADDEBITI' && !v.includes('VALUTA')) cDebit = j;
      }
      if (cDesc >= 0 && (cCredit >= 0 || cDebit >= 0)) { hdrRow = i; break; }
    }
    if (hdrRow < 0) { console.log('[Intessa V2] Header not found'); return []; }
    console.log(`[Intessa V2] Header at row ${hdrRow}: cDate=${cDate} cDesc=${cDesc} cCredit=${cCredit} cDebit=${cDebit} cDescExt=${cDescExt}`);

    // Extract saldo finale — scan ALL rows for "Saldo contabile finale"
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const joined = r.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('SALDO CONTABILE FINALE')) {
        // Find the numeric value and the date in this row
        let saldoVal = null, saldoDate = '';
        for (let j = 0; j < r.length; j++) {
          const v = r[j];
          if (typeof v === 'number' && v !== 0 && saldoVal === null) saldoVal = v;
          else if (typeof v === 'string' && v !== 0) {
            const n = parseFloat(v);
            if (!isNaN(n) && n !== 0 && saldoVal === null) saldoVal = n;
          }
          // Capture date string (e.g. "31.01.2026")
          if (typeof v === 'string' && /\d{2}\.\d{2}\.\d{4}/.test(v)) saldoDate = v;
          if (v instanceof Date && !isNaN(v.getTime())) saldoDate = v;
        }
        if (saldoVal !== null) {
          this._impSaldo = { value: saldoVal, date: saldoDate };
          console.log(`[Intessa V2] Saldo finale: ${saldoVal} date: ${saldoDate}`);
        }
      }
    }

    const rawMvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const desc = String(r[cDesc] || '').trim();
      if (!desc) continue;
      // Skip ALL saldo-related lines — these are never real movements
      const descUp = desc.toUpperCase();
      if (descUp.includes('SALDO')) continue;
      const credit = parseFloat(r[cCredit]) || 0;
      const debit = parseFloat(r[cDebit]) || 0;
      const rawAmount = credit + debit; // debit is already negative
      if (rawAmount === 0) continue;
      const descExt = cDescExt >= 0 ? String(r[cDescExt] || '').trim() : '';
      const date = r[cDate] || '';
      rawMvs.push({ concepto: desc.substring(0, 80), amount: Math.abs(rawAmount), originalSign: rawAmount > 0 ? 1 : -1, date, notes: descExt.substring(0, 200), _rawAmount: rawAmount });
    }
    console.log(`[Intessa V2] Raw movements: ${rawMvs.length}`);

    // Don't consolidate fees at parser level — GROUP_RULES in _impConfirm
    // will group all COMMISSIONE/COSTO BONIFICO/CANONE MENSILE into separate summary lines
    // so they appear as their own row in the budget grid with breakdown hover
    const result = rawMvs.map(mv => ({ concepto: mv.concepto, amount: mv.amount, originalSign: mv.originalSign, date: mv.date, notes: mv.notes }));
    console.log(`[Intessa V2] Final: ${result.length} movements`);
    return result;
  },

  _parseVisaIntesa(rows) {
    console.log('[Visa Intesa] Starting parse, rows:', rows.length);
    // Header: "Data contabile|Data valuta|Descrizione|Accrediti in valuta|Accrediti|Addebiti in valuta|Addebiti"
    let hdrRow = -1, cDate = -1, cDesc = -1, cCreditEur = -1, cDebitEur = -1, cCreditFx = -1, cDebitFx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v === 'DATA CONTABILE') cDate = j;
        if (v === 'DESCRIZIONE') cDesc = j;
        if (v === 'ACCREDITI IN VALUTA') cCreditFx = j;
        if (v === 'ACCREDITI' && !v.includes('VALUTA')) cCreditEur = j;
        if (v === 'ADDEBITI IN VALUTA') cDebitFx = j;
        if (v === 'ADDEBITI' && !v.includes('VALUTA')) cDebitEur = j;
      }
      if (cDesc >= 0 && (cCreditEur >= 0 || cDebitEur >= 0 || cCreditFx >= 0 || cDebitFx >= 0)) { hdrRow = i; break; }
    }
    if (hdrRow < 0) { console.log('[Visa Intesa] Header not found'); return []; }
    console.log(`[Visa Intesa] Header at row ${hdrRow}: cDate=${cDate} cDesc=${cDesc} cCreditEur=${cCreditEur} cDebitEur=${cDebitEur}`);

    const mvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const desc = String(r[cDesc] || '').trim();
      if (!desc) continue;
      if (desc.toUpperCase().includes('IMPORTO TOTALE')) continue;
      // Get amount: prefer EUR columns, fallback to FX
      let amount = 0;
      for (const col of [cDebitEur, cCreditEur, cDebitFx, cCreditFx]) {
        if (col < 0) continue;
        const v = r[col];
        if (v == null) continue;
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').split(/\s/)[0]);
        if (!isNaN(n) && n !== 0) { amount = Math.abs(n); break; }
      }
      if (amount === 0) continue;
      mvs.push({
        concepto: desc.substring(0, 80),
        amount: amount,
        originalSign: -1, // card charges are expenses
        date: r[cDate] || '',
        notes: '',
        titular: 'Sylvia Visa'
      });
    }
    console.log(`[Visa Intesa] Parsed ${mvs.length} movements`);
    return mvs;
  },

  // Shared fee consolidation logic for Intessa parsers
  _consolidateIntessaFees(rawMvs, FEE_PATTERNS, label) {
    const consolidated = [];
    const used = new Set();
    for (let i = 0; i < rawMvs.length; i++) {
      if (used.has(i)) continue;
      const mv = rawMvs[i];
      const cUp = mv.concepto.toUpperCase();
      if (FEE_PATTERNS.some(p => cUp.includes(p))) continue; // skip standalone fees
      const children = [];
      for (let j = i + 1; j < rawMvs.length && j <= i + 2; j++) {
        if (used.has(j)) continue;
        const cand = rawMvs[j];
        const candUp = cand.concepto.toUpperCase();
        if (FEE_PATTERNS.some(p => candUp.includes(p)) && cand._rawAmount < 0) {
          children.push(cand); used.add(j);
        } else break;
      }
      if (children.length > 0) {
        const totalAmount = mv.amount + children.reduce((s, c) => s + c.amount, 0);
        const feeDetail = children.map(c => c.concepto.substring(0, 30) + ': ' + c.amount.toFixed(2)).join(', ');
        consolidated.push({
          concepto: mv.concepto, amount: totalAmount, originalSign: mv.originalSign,
          date: mv.date, notes: mv.notes + (mv.notes ? ' | ' : '') + 'Incl. ' + feeDetail
        });
        console.log(`[${label}] Consolidated: '${mv.concepto.substring(0,40)}' + ${children.length} fees → ${totalAmount.toFixed(2)}`);
      } else {
        consolidated.push({ concepto: mv.concepto, amount: mv.amount, originalSign: mv.originalSign, date: mv.date, notes: mv.notes });
      }
    }
    console.log(`[${label}] Final: ${consolidated.length} movements (from ${rawMvs.length} raw)`);
    return consolidated;
  },

  _parseIntessa(rows) {
    console.log('[Intessa] Starting parse, rows:', rows.length);
    // Find header row with "Operazione" AND "Importo" on the SAME row
    let hdrRow = -1, cOp = -1, cDett = -1, cCat = -1, cImporto = -1, cDate = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      let foundOp = -1, foundImp = -1;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        // Must be a short header cell (not "Tipo operazione: Tutti")
        if (v.length > 30) continue;
        if (v === 'OPERAZIONE' || v === 'OPERAZIONE ') foundOp = j;
        if (v === 'IMPORTO' || v === 'IMPORTO ') foundImp = j;
        if (v.includes('DETTAGLI')) cDett = j;
        if (v.includes('CATEGORIA')) cCat = j;
        if (v === 'DATA' || v === 'DATA ') cDate = j;
      }
      if (foundOp >= 0 && foundImp >= 0) {
        hdrRow = i; cOp = foundOp; cImporto = foundImp;
        break;
      }
    }
    console.log(`[Intessa] Header at row ${hdrRow}: cDate=${cDate} cOp=${cOp} cDett=${cDett} cCat=${cCat} cImporto=${cImporto}`);
    if (hdrRow < 0 || cImporto < 0) {
      console.log('[Intessa] Header not found, trying fallback');
      return [];
    }

    if (cDett < 0) cDett = cOp + 1;
    if (cCat < 0) cCat = 5;
    if (cDate < 0) cDate = 0;

    const mvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const concepto = String(r[cOp] || '').trim();
      if (!concepto) continue;
      // Skip all SALDO-related lines — never real movements
      if (concepto.toUpperCase().includes('SALDO')) continue;
      // Try primary column, then scan for amount if not found
      let rawAmount = parseFloat(r[cImporto]);
      if (isNaN(rawAmount) || rawAmount === 0) {
        // Scan row for a numeric value that could be the amount
        for (let j = r.length - 1; j >= 0; j--) {
          if (j === cOp || j === cDett || j === cCat || j === cDate) continue;
          const v = r[j];
          if (typeof v === 'number' && v !== 0) { rawAmount = v; break; }
          const n = parseFloat(v);
          if (!isNaN(n) && n !== 0) { rawAmount = n; break; }
        }
      }
      if (!rawAmount || rawAmount === 0) continue;
      const dettagli = String(r[cDett] || '').trim();
      const categoria = String(r[cCat] || '').trim();
      const notes = [dettagli, categoria].filter(Boolean).join(' | ');
      mvs.push({ concepto: concepto.substring(0, 80), amount: Math.abs(rawAmount), originalSign: rawAmount > 0 ? 1 : -1, date: r[cDate] || '', notes, _rawAmount: rawAmount });
    }
    console.log(`[Intessa] Parsed ${mvs.length} raw movements`);
    // Fees ahora llegan como filas individuales — las reglas de agrupación en RULES las consolidan
    console.log(`[Intessa V1] Final: ${mvs.length} movements`);
    return mvs;
  },


  _parseIberiaAnual(rows) {
    // Annual Iberia VISA export: one file with all 4 cardholders, full year.
    // Format: row with IBERIA ICON + card number + name → data rows with datetime in col 0
    // Col 0: fecha (Date object), Col 1: comercio, Col 4: importe (float, always positive)
    // No Nº column, no IMPORTE EUROS/DIVISA split — everything already in euros.
    console.log('[Iberia Annual] Starting parse, rows:', rows.length);

    const mvs = [];
    const SKIP_CONCEPTO = ['TOTAL','CARGAR','COMISION','IMPORTE','DEUDA','EXTRACTO','PUNTOS','INTERESES','TAE','FORMA DE PAGO','PAGO APLAZADO','CAJEROS','DETALLE'];
    let currentTitular = '';

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;

      // Detect titular row: col 0 = 'IBERIA ICON', col 4 = name
      const col0 = String(r[0] || '').trim();
      const col4 = String(r[4] || '').trim();
      if (col0.toUpperCase().includes('IBERIA') && col4.length > 3 && isNaN(parseFloat(col4))) {
        const firstName = col4.split(/\s+/)[0];
        if (!/^(comision|total|importe|extracto|deuda|interese|puntos)/i.test(firstName)) {
          currentTitular = firstName + ' Iberia';
          console.log('[Iberia Annual] Titular: "' + currentTitular + '" at row ' + i);
        }
        continue;
      }

      // Skip header rows (contain text like 'Fecha operación')
      if (typeof r[0] === 'string' && r[0].toUpperCase().includes('FECHA')) continue;

      // Data row: col 0 must be a Date object (openpyxl → SheetJS both parse as Date)
      const fecha = r[0];
      if (!(fecha instanceof Date) && !(typeof fecha === 'string' && /\d{4}-\d{2}-\d{2}/.test(fecha))) continue;
      if (!currentTitular) continue;

      const comercio = String(r[1] || '').trim();
      const amount = parseFloat(r[4]);
      if (!comercio || isNaN(amount) || Math.abs(amount) < 0.01) continue;

      const cUp = comercio.toUpperCase();
      if (SKIP_CONCEPTO.some(w => cUp.includes(w))) {
        console.log('[Iberia Annual] Skip: "' + comercio + '"');
        continue;
      }

      const dateStr = fecha instanceof Date
        ? fecha.toLocaleDateString('es')
        : String(fecha).substring(0, 10);

      mvs.push({
        concepto: comercio.substring(0, 80),
        amount: Math.abs(amount),
        originalSign: -1,  // card charges are always expenses (positive = gasto)
        date: fecha,
        notes: dateStr,
        titular: currentTitular
      });
    }

    console.log('[Iberia Annual] Parsed ' + mvs.length + ' movements across ' +
      [...new Set(mvs.map(m => m.titular))].length + ' cardholders');
    return mvs;
  },

  _parseIberia(rows) {
    console.log('[Iberia] Starting parse, rows:', rows.length);
    const mvs = [];
    let currentTitular = '';
    const SKIP_CONCEPTO = ['TOTAL','CARGAR','COMISION','IMPORTE','DEUDA','EXTRACTO','PUNTOS','INTERESES','TAE','FORMA DE PAGO','PAGO APLAZADO','CAJEROS'];

    // Step 1: Find header row and detect column indices dynamically
    let hdrRow = -1, cNum = -1, cFecha = -1, cComercio = -1, cDivisa = -1, cEuros = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v.includes('COMERCIO')) { cComercio = j; hdrRow = i; }
        if (v.includes('IMPORTE EUROS') || v === 'IMPORTE EUR') cEuros = j;
        if (v.includes('IMPORTE DIVISA') || v === 'IMPORTE DIV') cDivisa = j;
        if (v.includes('FECHA OPERACIÓN') || v === 'FECHA OPERACION') cFecha = j;
        if (v === 'Nº' || v === 'N°' || v === 'NO') cNum = j;
      }
      if (cComercio >= 0) break;
    }
    console.log(`[Iberia] Header at row ${hdrRow}: cNum=${cNum} cFecha=${cFecha} cComercio=${cComercio} cDivisa=${cDivisa} cEuros=${cEuros}`);
    if (cComercio < 0) { console.log('[Iberia] No COMERCIO column found'); return []; }
    // Fallback: if IMPORTE EUROS not found, use last numeric column
    if (cEuros < 0) cEuros = cDivisa >= 0 ? cDivisa : cComercio + 2;

    // Step 2: Find titular rows (above header sections, contain "IBERIA")
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;

      // Titular detection: any cell contains "IBERIA" and another cell has a name
      let hasIberia = false, name = '';
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').trim();
        if (v.toUpperCase().includes('IBERIA') && v.length < 80) hasIberia = true;
        // Name is typically a cell with text that's not a number and not IBERIA-related
        // Use \b word boundaries to avoid matching CARD inside "Ricardo"
        if (v.length > 5 && !/\bIBERIA\b|\bICON\b|\bVISA\b|\bMASTERCARD\b|\bMASTER\b|\bCARD\b|\bCARDS\b|Nº|FECHA|COMERCIO|IMPORTE|TOTAL/i.test(v) && isNaN(parseFloat(v))) {
          name = v;
        }
      }
      if (hasIberia && name) {
        // Use first name + " Iberia" (e.g. "Daniel Garcia Bornholt" → "Daniel Iberia")
        const firstName = name.split(/\s+/)[0];
        if (/^(comision|total|importe|extracto|deuda|interese|puntos)/i.test(firstName)) continue;
        currentTitular = firstName + ' Iberia';
        console.log(`[Iberia] Titular: '${currentTitular}' at row ${i}`);
        continue;
      }

      // Skip rows before/at header
      if (i <= hdrRow) continue;

      // Data row: must have a sequential number in cNum column
      const numVal = cNum >= 0 ? r[cNum] : r[0];
      const num = typeof numVal === 'number' ? numVal : parseFloat(numVal);
      if (isNaN(num) || num < 1 || num > 999 || num !== Math.floor(num)) continue;

      const concepto = String(r[cComercio] || '').trim();
      const amount = parseFloat(r[cEuros]) || 0;
      const fecha = cFecha >= 0 ? String(r[cFecha] || '') : '';

      if (!concepto || Math.abs(amount) < 0.01) continue;
      if (!currentTitular) continue;

      const cUp = concepto.toUpperCase();
      if (SKIP_CONCEPTO.some(w => cUp.includes(w))) {
        console.log(`[Iberia] Skip keyword: '${concepto}'`);
        continue;
      }

      mvs.push({
        concepto: concepto.substring(0, 80),
        amount: amount,  // keep original sign (negative = refund/bonification)
        originalSign: amount >= 0 ? -1 : 1,
        date: fecha,
        notes: '',
        titular: currentTitular
      });
    }
    console.log(`[Iberia] Parsed ${mvs.length} movements`);
    return mvs;
  },

  _parseCaixa(rows) {
    let hdr = -1, colMap = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]; if (!row) continue;
      const joined = row.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('MOVIMIENTO') && (joined.includes('IMPORTE') || joined.includes('SALDO'))) {
        hdr = i;
        row.forEach((c, j) => {
          const val = String(c||'').toUpperCase().trim();
          if (val === 'FECHA') colMap.fecha = j;
          if (val === 'MOVIMIENTO') colMap.movimiento = j;
          if (val.includes('MÁS DATOS') || val.includes('MAS DATOS')) colMap.masDatos = j;
          if (val === 'IMPORTE') colMap.importe = j;
          if (val === 'SALDO') colMap.saldo = j;
        });
        break;
      }
    }
    if (hdr < 0) return [];
    const cF = colMap.fecha ?? 0, cM = colMap.movimiento ?? 2, cD = colMap.masDatos ?? 3, cI = colMap.importe ?? 4, cS = colMap.saldo ?? 5;
    const mvs = [];
    let latestSaldo = null, latestSaldoDate = null, latestSaldoTs = -Infinity;
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const mov = String(r[cM] || '').trim();
      // Robust amount parsing: handle numbers, European-format strings, etc.
      let rawImp = this._parseEuroNum(r[cI]);
      if (!mov || rawImp === 0) continue;
      const masDatos = String(r[cD] || '').trim();
      const date = r[cF] || '';
      const saldo = this._parseEuroNum(r[cS]);
      if (saldo !== 0) {
        // Track saldo from the LATEST date — first row for a given date wins (newest transaction)
        let ts = 0;
        if (date instanceof Date && !isNaN(date.getTime())) ts = date.getTime();
        else { const parsed = new Date(date); if (!isNaN(parsed.getTime())) ts = parsed.getTime(); }
        if (ts > latestSaldoTs) { latestSaldo = saldo; latestSaldoDate = date; latestSaldoTs = ts; }
      }
      mvs.push({ concepto: mov.substring(0, 80), amount: Math.abs(rawImp), originalSign: rawImp > 0 ? 1 : -1, date, notes: masDatos.substring(0, 200) });
    }
    if (latestSaldo !== null) this._impSaldo = { value: latestSaldo, date: latestSaldoDate };
    return mvs;
  },

  // Robust European number parser: handles 1.234,56 and -46,83 strings as well as plain numbers
  _parseEuroNum(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (!s) return 0;
    // Try native parseFloat first (works for "123.45" and "-46.83")
    const direct = parseFloat(s);
    if (!isNaN(direct) && !s.includes(',')) return direct;
    // European format: strip thousand-separator dots, replace decimal comma
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  },

  _parseCIC(rows) {
    let hdr = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]; if (!row) continue;
      const joined = row.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('MESSAGE') && (joined.includes('DEBIT') || joined.includes('CREDIT'))) { hdr = i; break; }
    }
    if (hdr < 0) return [];
    const mvs = [];
    let lastSaldo = null, lastDate = null;
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const date = r[0] || '';
      const message = String(r[2] || '').trim();
      const debit = parseFloat(r[3]) || 0;
      const credit = parseFloat(r[4]) || 0;
      if (!message || (debit === 0 && credit === 0)) continue;
      const amount = debit !== 0 ? Math.abs(debit) : credit;
      const sign = credit > 0 ? 1 : -1;
      if (typeof r[5] === 'number') { lastSaldo = r[5]; lastDate = date; }
      // Col 1 puede contener referencia/descripción adicional en algunos formatos CIC
      const cicRef = String(r[1] || '').trim();
      const cicNotes = cicRef && cicRef !== message ? cicRef.substring(0, 200) : '';
      mvs.push({ concepto: message.substring(0, 80), amount, originalSign: sign, date, notes: cicNotes });
    }
    for (let i = rows.length - 1; i > hdr; i--) {
      const r = rows[i]; if (!r) continue;
      if (String(r[3]||'').toUpperCase().includes('BALANCE') && typeof r[5] === 'number') { lastSaldo = r[5]; break; }
    }
    if (lastSaldo !== null) this._impSaldo = { value: lastSaldo, date: lastDate };
    return mvs;
  },

  async _parseCSV(file) {
    const text = await file.text();
    const firstLine = text.split('\n')[0] || '';
    const flUpper = firstLine.toUpperCase();
    if (flUpper.includes('TITULAR') || flUpper.includes('CARD')) return this._parseAmexCSV(text);
    // Revolut CSV: "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance"
    if (flUpper.includes('TYPE') && flUpper.includes('DESCRIPTION') && flUpper.includes('AMOUNT') && flUpper.includes('BALANCE')) return this._parseRevolut(text);
    const lines = text.split('\n').map(l => l.split(/[,;\t]/).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
    return this._parseGenericRows(lines.map(l => l.map(c => { const n = parseFloat(String(c).replace(/\./g,'').replace(',', '.')); return isNaN(n) ? c : n; })));
  },

  _parseRevolut(text) {
    console.log('[Revolut] Starting parse');
    // Parse CSV properly (handles quoted fields with commas)
    const lines = text.split('\n');
    const parseLine = (line) => {
      const parts = []; let cur = '', inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur.trim());
      return parts;
    };

    // Parse header to find column indices
    const hdr = parseLine(lines[0]);
    const col = {};
    hdr.forEach((h, i) => {
      const u = h.toUpperCase().trim();
      if (u === 'TYPE') col.type = i;
      if (u === 'STARTED DATE') col.date = i;
      if (u === 'DESCRIPTION') col.desc = i;
      if (u === 'AMOUNT') col.amount = i;
      if (u === 'FEE') col.fee = i;
      if (u === 'STATE') col.state = i;
      if (u === 'BALANCE') col.balance = i;
    });
    console.log(`[Revolut] Columns:`, col);

    const mvs = [];
    let latestBal = null, latestBalDate = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const r = parseLine(line);

      const state = (r[col.state] || '').trim().toUpperCase();
      if (state === 'REVERTED') { console.log(`[Revolut] Skip REVERTED: ${r[col.desc]}`); continue; }

      const desc = (r[col.desc] || '').trim();
      if (!desc) continue;

      const rawAmt = parseFloat(r[col.amount]) || 0;
      const rawFee = parseFloat(r[col.fee]) || 0;
      const typ = (r[col.type] || '').trim();
      const dateRaw = (r[col.date] || '').trim();
      const dateStr = dateRaw.substring(0, 10); // YYYY-MM-DD
      const balStr = (r[col.balance] || '').trim();

      // Track saldo — latest date wins
      if (balStr) {
        const balVal = parseFloat(balStr);
        if (!isNaN(balVal) && dateStr >= latestBalDate) { latestBal = balVal; latestBalDate = dateStr; }
      }

      // Effective amount: for Charge type, fee IS the cost; amount may be 0
      let effective = rawAmt;
      if (typ === 'Charge' && rawFee > 0 && rawAmt === 0) effective = -rawFee;
      if (effective === 0) continue;

      const isIncome = effective > 0;
      // Notes: type gives context (Transfer, ATM, Exchange, Card Refund, Charge)
      let notes = typ;
      if (rawFee > 0) notes += ` (fee: ${rawFee.toFixed(2)})`;

      mvs.push({
        concepto: desc.substring(0, 80),
        amount: Math.abs(effective),
        originalSign: isIncome ? 1 : -1,
        date: dateStr,
        notes,
        titular: 'Ricardo Revolut'
      });
    }

    if (latestBal !== null) {
      this._impSaldo = { value: latestBal, date: latestBalDate };
      console.log(`[Revolut] Saldo: ${latestBal} at ${latestBalDate}`);
    }
    console.log(`[Revolut] Parsed ${mvs.length} movements`);
    return mvs;
  },

  _parseAmexCSV(text) {
    const lines = text.split('\n');
    const mvs = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim(); if (!line) continue;
      const parts = []; let cur = '', inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur.trim());
      if (parts.length < 5) continue;
      const amount = parseFloat(parts[4].replace(/\./g,'').replace(',','.')) || 0;
      if (!parts[1] || amount === 0) continue;
      mvs.push({ concepto: parts[1].substring(0, 80), amount: Math.abs(amount), originalSign: -1, date: parts[0], notes: '', titular: parts[2] || '' });
    }
    return mvs;
  },

  // ══════════ PDF PARSING ══════════

  async _parsePDF(file) {
    // Load pdf.js if not already loaded
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let allText = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Join items with spaces, but add newline between page sections
      const pageText = content.items.map(i => i.str).join(' ');
      allText += pageText + ' \n ';
    }
    console.log('[PDF] Pages:', pdf.numPages, 'Text length:', allText.length);
    // Detect Amex format
    if (allText.toUpperCase().includes('AMERICAN EXPRESS') || allText.toUpperCase().includes('TARJETA PLATINUM')) {
      return this._parseAmexPDF(allText);
    }
    console.log('[PDF] Unknown format, no parser matched');
    return [];
  },

  _parseAmexPDF(text) {
    console.log('[Amex PDF] Starting parse, text length:', text.length);
    const mvs = [];
    let currentTitular = '';

    // Lines to skip entirely
    const SKIP = ['RECIBO ENVIADO','TOTAL DE TRANSAC','TRANSACCIONES FINANC','SALDO ANTERIOR',
      'PAGOS Y/O','NUEVAS COMPRAS','SALDO ACTUAL','IMPORTE A PAGAR','MEMBERSHIP','PUNTOS',
      'INFORME ANUAL','CUOTAS Y OTROS','INFORMACIÓN AJENA'];

    // ── Step 1: Detect titulares and their positions ──
    const titularMap = [];
    const titRe = /cargos y abonos del Titular\s+(?:SR[A]?\.\s+)?([A-ZÁÉÍÓÚÑ]+)/gi;
    let tm;
    while ((tm = titRe.exec(text)) !== null) {
      titularMap.push({ pos: tm.index, name: tm[1] });
      console.log(`[Amex PDF] Titular: '${tm[1]}' at pos ${tm.index}`);
    }
    // Also detect TRANSACCIONES FINANCIERAS section
    const finIdx = text.toUpperCase().indexOf('TRANSACCIONES FINANCIERAS');
    if (finIdx >= 0) titularMap.push({ pos: finIdx, name: '_FINANCIERAS' });

    // ── Step 2: Find all DD.MM.YY DD.MM.YY anchors (transaction starts) ──
    const txRe = /(\d{2}\.\d{2}\.\d{2})\s+(\d{2}\.\d{2}\.\d{2})\s+/g;
    const anchors = [];
    let am;
    while ((am = txRe.exec(text)) !== null) {
      anchors.push({ pos: am.index, date1: am[1], date2: am[2], afterPos: am.index + am[0].length });
    }
    console.log(`[Amex PDF] Found ${anchors.length} date anchors, ${titularMap.length} titulares`);

    // ── Step 3: Process each anchor ──
    for (let idx = 0; idx < anchors.length; idx++) {
      const a = anchors[idx];
      const nextPos = idx + 1 < anchors.length ? anchors[idx + 1].pos : text.length;
      let block = text.substring(a.afterPos, nextPos).trim();

      // Determine titular for this position
      let tit = 'Principal';
      for (let t = titularMap.length - 1; t >= 0; t--) {
        if (titularMap[t].pos < a.pos) { tit = titularMap[t].name; break; }
      }
      currentTitular = tit;

      // Cut at section boundaries
      const STOP = ['Total de transac','Nuevos cargos','Tarjeta Platinum','Número de Cuenta',
        'TRANSACCIONES FINANC','Información ajena','Informe anual','Membership Rewards',
        'American Express Europe'];
      for (const stop of STOP) {
        const si = block.toLowerCase().indexOf(stop.toLowerCase());
        if (si >= 0) block = block.substring(0, si).trim();
      }
      if (!block) continue;

      // ── Step 4: Clean block — remove metadata BEFORE extracting amounts ──
      // Cut at "Cambio aplicado" (FX detail), "Itinerario", "Llegada", "Nº de billete"
      // These lines contain EUR-format numbers that would confuse amount extraction
      let cleanBlock = block;
      cleanBlock = cleanBlock.replace(/Cambio aplicado.*/i, '').trim();
      cleanBlock = cleanBlock.replace(/Itinerario.*/i, '').trim();
      cleanBlock = cleanBlock.replace(/Llegada.*/i, '').trim();
      cleanBlock = cleanBlock.replace(/Nº de billete.*/i, '').trim();
      if (!cleanBlock) continue;

      // ── Step 5: Extract EUR amount from clean block ──
      // Find ALL amounts in European format: "329,00" or "6.270,40" or "9.864,70"
      const amtMatches = [...cleanBlock.matchAll(/([\d.]+,\d{2})\s*(CR)?/g)];
      if (!amtMatches.length) continue;

      // The LAST EUR-format amount in the block is always the EUR importe
      const lastAmt = amtMatches[amtMatches.length - 1];
      const amtStr = lastAmt[1].replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(amtStr) || 0;
      const isCR = !!lastAmt[2];

      // ── Step 6: Extract concepto from clean block ──
      let concepto = cleanBlock;

      // Remove foreign currency amounts and labels
      concepto = concepto.replace(/[\d.,]+\s*(Dólar|Libra|Dong|Euro|U\.S\.A\.|Esterlina|Vietnamita)[^\n]*/gi, '').trim();
      // Remove standalone decimal amounts (foreign amounts like "279.39", "745.27")
      concepto = concepto.replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, '').trim();
      // Remove EUR amounts that leaked in
      concepto = concepto.replace(/[\d.]+,\d{2}\s*(CR)?/g, '').trim();
      // Clean up card fee reference numbers
      concepto = concepto.replace(/\d{15,}/g, '').trim();
      // Collapse whitespace
      concepto = concepto.replace(/\s{2,}/g, ' ').trim();

      if (!concepto || amount < 0.01) continue;

      // Check skip list
      const cUp = concepto.toUpperCase();
      if (SKIP.some(s => cUp.includes(s))) {
        console.log(`[Amex PDF] Skip: '${concepto}'`);
        continue;
      }

      // Convert DD.MM.YY to DD/MM/YYYY
      const [d, m, y] = a.date1.split('.');
      const fullDate = `${d}/${m}/20${y}`;

      // For FINANCIERAS section, use titular = 'Financiero'
      let titular = currentTitular === '_FINANCIERAS' ? 'Financiero' : currentTitular;
      // Map known names → friendly first name + Amex
      if (titular && titular !== 'Financiero') {
        const tUp = titular.toUpperCase();
        if (tUp === 'RICARDO' || tUp === 'GARCIA' || tUp.includes('GARCIA')) titular = 'Ricardo Amex';
        else if (tUp === 'SYLVIA' || tUp === 'BORNHOLT' || tUp.includes('BORNHOLT')) titular = 'Sylvia Amex';
        else if (tUp === 'SANDRA') titular = 'Sandra Amex';
        else titular = titular.charAt(0).toUpperCase() + titular.slice(1).toLowerCase() + ' Amex';
      }

      mvs.push({
        concepto: concepto.substring(0, 80),
        amount: isCR ? -amount : amount,
        originalSign: isCR ? 1 : -1,
        date: fullDate,
        notes: '',
        titular: titular || 'Principal'
      });
    }

    console.log(`[Amex PDF] Parsed ${mvs.length} movements`);
    // Debug: log first 10
    mvs.slice(0, 10).forEach((m, i) => console.log(`  [${i}] ${m.date} ${m.titular} ${m.concepto} → ${m.amount}`));
    return mvs;
  },

  _parseGenericRows(rows) {
    const mvs = [];
    const HDR = ['FECHA','CONCEPTO','IMPORTE','SALDO','VALOR','DATE','AMOUNT','DESCRIPTION','OPERAZIONE','COMERCIO','BALANCE','MOVIMIENTO'];
    for (const r of rows) {
      if (!r) continue;
      const txt = r.map(c => String(c||'').toUpperCase()).join(' ');
      if (HDR.filter(w => txt.includes(w)).length >= 2) continue;
      let concepto = '', amount = 0, notes = '';
      for (const v of r) {
        if (v && typeof v === 'string' && v.trim().length > 2 && !concepto) concepto = v.trim();
        else if (v && typeof v === 'string' && v.trim().length > 10 && concepto && !notes) notes = v.trim();
        if (typeof v === 'number' && Math.abs(v) > 0.01 && !amount) amount = v;
      }
      if (concepto && amount) mvs.push({ concepto: concepto.substring(0, 80), amount: Math.abs(amount), originalSign: amount > 0 ? 1 : -1, date: '', notes: notes.substring(0, 200) });
    }
    return mvs;
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

  // ══════════ IMPORT CONFIRM ══════════

  async _impConfirm(type) {
    const movements = this._impMovements;
    if (!movements || !movements.length) return;
    const monthEl = document.getElementById('imp-month');
    const fallbackMonth = parseInt(monthEl?.value || '0');
    if (type === 'tarjeta' && !fallbackMonth) {
      alert('Por favor selecciona el mes del extracto antes de importar.');
      monthEl?.focus();
      return;
    }
    const pv = document.getElementById('imp-pv');

    try {

    // For tarjeta: exclude payment/recibo rows and filter to selected month
    const TARJETA_EXCLUDE = ['RECIBO ENVIADO A SU BANCO', 'PAGO RECIBIDO', 'PAYMENT RECEIVED', 'ABONO RECIBIDO'];
    let filteredMovements = movements.filter(mv => {
      const desc = (mv.concepto || mv.description || '').toUpperCase();
      return !TARJETA_EXCLUDE.some(ex => desc.includes(ex));
    });
    if (type === 'tarjeta' && fallbackMonth) {
      filteredMovements = filteredMovements.filter(mv => {
        if (!mv.date) return true;
        const ext = this._extractDate(mv.date, fallbackMonth - 1);
        return ext.month === (fallbackMonth - 1); // 0-based month
      });
      console.log(`[tarjeta] Filtrado mes ${fallbackMonth}: ${filteredMovements.length}/${movements.length} movimientos`);
    }
    const TARJETA_PATTERNS = ['IBERIA CARDS','VISA ','MASTERCARD','AMEX','AMERICAN EXPRESS'];
    const now = new Date().toISOString();
    const year = AppState.currentYear;
    // Track this import so undo can find these rows by created_at timestamp
    // _lastImportMeta will be updated with exact IDs after rows are written
    this._lastImportMeta = { bank: this.activeBank, ts: now, ids: [] };
    let tarIdx = 0;

    // Load consolidation groups from RULES sheet
    const allGroupRules = BudgetLogic.getGroupRules(this.activeBank);
    // Single group rules list: global rules + rules for this bank
    const GROUP_RULES = allGroupRules.filter(r => !r.bank || r.bank === this.activeBank);
    const consolidated = new Map();
    const breakdowns = new Map();

    // ── DEDUP: build fingerprint set from all existing lines for this bank/year ──
    // Three layers, most to least precise:
    // 1. txRef  — Amex unique transaction reference (AT260...) — perfect match
    // 2. date + amount + concepto_norm — reliable for all banks
    // 3. date + amount — fallback to catch edge cases
    const _normFp = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 40);
    const _dateFp = s => {
      if (!s) return '';
      const str = String(s);
      const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) return `${m[3].length === 2 ? '20'+m[3] : m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      return str.substring(0, 10);
    };
    const _amtFp = a => Math.round(parseFloat(a || 0) * 100);

    const existingFingerprints = new Set();
    const existingTxRefs = new Set();
    const existingLinesForDedup = this.lines.filter(l => l.bank === this.activeBank && !l.parentId);

    for (const line of existingLinesForDedup) {
      if (line.breakdown) {
        try {
          const bd = typeof line.breakdown === 'string' ? JSON.parse(line.breakdown) : line.breakdown;
          for (const monthEntries of Object.values(bd)) {
            if (!Array.isArray(monthEntries)) continue;
            for (const entry of monthEntries) {
              if (entry.r) existingTxRefs.add(entry.r);
              existingFingerprints.add(`${_dateFp(entry.d)}|${_amtFp(entry.a)}|${_normFp(entry.c || line.concepto)}`);
              existingFingerprints.add(`${_dateFp(entry.d)}|${_amtFp(entry.a)}|`);
            }
          }
        } catch(e) {}
      }
      if (line.notas) {
        const dateMatch = String(line.notas).match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dateMatch) {
          (line.real || []).forEach((amt) => {
            if (amt && amt !== 0) {
              existingFingerprints.add(`${_dateFp(dateMatch[1])}|${_amtFp(amt)}|${_normFp(line.concepto)}`);
              existingFingerprints.add(`${_dateFp(dateMatch[1])}|${_amtFp(amt)}|`);
            }
          });
        }
      }
    }

    console.log(`[dedup] ${existingTxRefs.size} txRefs + ${existingFingerprints.size} fingerprints from ${existingLinesForDedup.length} lines`);
    let dedupSkipped = 0;

    for (const mv of filteredMovements) {
      // ── DEDUP CHECK: skip if this exact movement already exists ──
      // Layer 1: Amex txRef — most precise, zero false positives
      if (mv.txRef && existingTxRefs.has(mv.txRef)) {
        dedupSkipped++;
        console.log(`[dedup] SKIP txRef: ${mv.txRef} | ${mv.concepto}`);
        continue;
      }
      // Layer 2+3: date + amount + concepto (and date + amount alone)
      const mvRawDate = mv.date instanceof Date ? mv.date.toLocaleDateString('es') : String(mv.date || '').substring(0, 10);
      const mvDateFp = _dateFp(mvRawDate);
      const mvAmtFp = _amtFp(Math.abs(mv.amount));
      const mvConFp = _normFp(mv.concepto);
      const fpFull = `${mvDateFp}|${mvAmtFp}|${mvConFp}`;
      const fpDateAmt = `${mvDateFp}|${mvAmtFp}|`;
      if (existingFingerprints.has(fpFull) || existingFingerprints.has(fpDateAmt)) {
        dedupSkipped++;
        console.log(`[dedup] SKIP fp: ${mvRawDate} | ${mv.amount} | ${mv.concepto}`);
        continue;
      }
      const rawC = String(mv.concepto || '').substring(0, 80);
      const notes = mv.notes ? String(mv.notes).substring(0, 200) : '';
      const titular = mv.titular || '';

      // For tarjeta: ALL charges go to month BEFORE the combo (extracto month)
      // For bank: use date from movement, fallback to combo month
      let mi, mvYear;
      if (type === 'tarjeta') {
        // User selects the month of the charges directly (not the extracto month)
        // fallbackMonth=1 (Enero) → mi=0, mvYear=year
        mi = fallbackMonth - 1; // 0-based, direct
        mvYear = year;
      } else {
        const extracted = this._extractDate(mv.date, fallbackMonth - 1);
        mi = extracted.month;
        mvYear = extracted.year;
      }

      if (mvYear !== null && mvYear !== year) continue;

      let section;
      if (type === 'tarjeta') { section = 'TARJETAS'; }
      else {
        const isTar = TARJETA_PATTERNS.some(p => rawC.toUpperCase().includes(p));
        section = isTar ? 'TARJETAS' : (mv.originalSign > 0 ? 'INGRESOS' : 'GASTOS');
      }

      const dateStr = mv.date instanceof Date ? mv.date.toLocaleDateString('es') : String(mv.date || '').substring(0, 10);
      // Enrich notes with date for traceability
      const enrichedNotes = dateStr ? (notes ? dateStr + ' · ' + notes : dateStr) : notes;

      if (type === 'tarjeta') {
        // Check if this movement matches a consolidation group
        const cUp = rawC.toUpperCase();
        const searchUp = (cUp + ' ' + (mv.notes || '').toUpperCase()); // buscar también en notas/descripción
        const group = GROUP_RULES.find(g => searchUp.includes(g.pattern));

        if (group) {
          // Consolidate into a single row per titular+group+month
          const groupKey = `grp_${titular}_${group.label}`;

          if (consolidated.has(groupKey)) {
            consolidated.get(groupKey).amounts[mi] = (consolidated.get(groupKey).amounts[mi] || 0) + mv.amount;
            if (!breakdowns.get(groupKey)[mi]) breakdowns.get(groupKey)[mi] = [];
            breakdowns.get(groupKey)[mi].push({ d: dateStr, a: mv.amount, c: rawC.substring(0, 50), ...(mv.txRef ? {r: mv.txRef} : {}) });
          } else {
            const amounts = new Array(12).fill(0);
            amounts[mi] = mv.amount;
            const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(group.label, '', this.activeBank) : BudgetLogic.findRule(group.label, this.activeBank);
            consolidated.set(groupKey, { concepto: group.label, section, notes: '', titular, amounts, rule });
            const bd = {};
            bd[mi] = [{ d: dateStr, a: mv.amount, c: rawC.substring(0, 50), ...(mv.txRef ? {r: mv.txRef} : {}) }];
            breakdowns.set(groupKey, bd);
          }
        } else {
          // No consolidation — each row is individual child of titular
          const uid = `tar_${tarIdx++}_${Math.random().toString(36).substring(2,6)}`;
          const amounts = new Array(12).fill(0);
          amounts[mi] = mv.amount;
          const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(rawC, notes, this.activeBank) : BudgetLogic.findRule(rawC, this.activeBank);
          consolidated.set(uid, { concepto: rawC, section, notes: enrichedNotes, titular, amounts, rule });
        }
      } else {
        // Bank imports (including Revolut with titular): flat rows, no parent/child
        // Check consolidation group rules, then standard consolidation
        // Buscar en concepto + notas para capturar descripciones largas (Intessa Descrizione, Caixa Más datos, etc.)
        const cUp = rawC.toUpperCase();
        const searchUp = (cUp + ' ' + (mv.notes || '').toUpperCase());
        const group = GROUP_RULES.find(g => searchUp.includes(g.pattern));

        if (group) {
          const groupKey = `bankgrp_${group.label}|||${section}`;
          if (consolidated.has(groupKey)) {
            consolidated.get(groupKey).amounts[mi] = (consolidated.get(groupKey).amounts[mi] || 0) + Math.abs(mv.amount);
            if (!breakdowns.get(groupKey)[mi]) breakdowns.get(groupKey)[mi] = [];
            breakdowns.get(groupKey)[mi].push({ d: dateStr, a: Math.abs(mv.amount), c: rawC.substring(0, 50), ...(mv.txRef ? {r: mv.txRef} : {}) });
          } else {
            const amounts = new Array(12).fill(0);
            amounts[mi] = Math.abs(mv.amount);
            const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(group.label, '', this.activeBank) : BudgetLogic.findRule(group.label, this.activeBank);
            consolidated.set(groupKey, { concepto: group.label, section, notes: '', titular: '', amounts, rule });
            const bd = {};
            bd[mi] = [{ d: dateStr, a: Math.abs(mv.amount), c: rawC.substring(0, 50), ...(mv.txRef ? {r: mv.txRef} : {}) }];
            breakdowns.set(groupKey, bd);
          }
        } else {
          // Normal bank consolidation: concepto + notes + section
          // Si el movimiento tiene descripción (notes), se usa como parte de la clave
          // para que "PAGAMENTO ADUE + PayPal" y "PAGAMENTO ADUE + Netflix" sean líneas distintas.
          // Strip leading date ("8/1/2025 · ") before using notes as key — Intessa notes start
          // with the transaction date which changes every month, causing each month's charge to
          // get a unique key → ladder of single-month lines instead of one consolidated line.
          // After stripping: PAGAMENTO ADUE+COMPAGNIE GENERALE Jan == Feb == Mar → one line.
          const notesForKey = notes
            ? notes
                .replace(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*[·•]\s*/, '')  // strip "8/1/2025 · "
                .replace(/^\d{4}-\d{2}-\d{2}\s*[·•]\s*/, '')                      // strip "2025-01-08 · "
                .replace(/COD\.\s*DISP\.\s*:\s*\d+\s*/gi, '')                    // strip Intessa tx ID "COD. DISP.: 0124122338839140"
                .trim()
            : '';
          const notesKey = notesForKey ? '|||' + this._norm(notesForKey).substring(0, 60) : '';
          const normKey = this._norm(rawC) + notesKey + '|||' + section;
          if (consolidated.has(normKey)) {
            consolidated.get(normKey).amounts[mi] = (consolidated.get(normKey).amounts[mi] || 0) + Math.abs(mv.amount);
            if (!breakdowns.get(normKey)[mi]) breakdowns.get(normKey)[mi] = [];
            breakdowns.get(normKey)[mi].push({ d: dateStr, a: Math.abs(mv.amount) });
          } else {
            const amounts = new Array(12).fill(0);
            amounts[mi] = Math.abs(mv.amount);
            const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(rawC, notes, this.activeBank) : BudgetLogic.findRule(rawC, this.activeBank);
            consolidated.set(normKey, { concepto: rawC, section, notes: enrichedNotes, titular: '', amounts, rule });
            const bd = {};
            bd[mi] = [{ d: dateStr, a: Math.abs(mv.amount) }];
            breakdowns.set(normKey, bd);
          }
        }
      }
    }

    const existingLines = this.lines.filter(l => l.bank === this.activeBank);
    const total = consolidated.size;
    let count = 0, merged = 0, autoCat = 0;

    const showProg = () => {
      pv.innerHTML = `<div style="padding:8px;"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Importando ${count}/${total}...</div><div style="background:#e2e8f0;border-radius:4px;height:6px;"><div style="background:var(--accent);height:100%;width:${Math.round(count/total*100)}%;transition:width .2s;border-radius:4px;"></div></div></div>`;
    };
    showProg();

    const titularParents = new Map();
    // Check existing parent lines in BUDGET_LINES for this bank (any section)
    // ENTERPRISE FIX: use rawId (the actual sheet ID) not the composite uniqueId,
    // since parentId is stored as the raw sheet ID.
    existingLines.filter(l => !l.parentId).forEach(l => {
      titularParents.set(l.concepto.trim() + '|||' + l.section, l.rawId || l.id);
    });

    const newRows = []; // Collect all new rows for batch write
    const updateCells = []; // Collect all cell updates for existing rows

    for (const [key, entry] of consolidated) {
      try {
      const { concepto, section, notes, amounts, rule, titular } = entry;
      const normLabel = this._norm(concepto);
      // Fix: search by concepto only (ignore notes) so same recurring charge across months merges correctly
      const existing = existingLines.find(l => this._norm(l.concepto) === normLabel && l.section === section)
                    || existingLines.find(l => this._norm(l.alias || '') === normLabel && l.section === section);

      const bd = breakdowns.get(key);
      // Always save breakdown — even single-item months get it so alias-fusion
      // can merge breakdowns across months when lines are grouped later
      const breakdownJson = (bd && Object.keys(bd).length) ? JSON.stringify(bd) : '';

      if (existing) {
        let updated = false;
        for (let m = 0; m < 12; m++) {
          if (amounts[m] > 0 && !existing.real[m]) {
            existing.real[m] = amounts[m];
            updateCells.push({ row: existing.sheetRow, col: BudgetLogic.getRealCol(m), value: amounts[m] });
            updated = true;
          }
        }
        // Fix 3: if existing has alias, clear stale date-based notas so it doesn't show old month's date
        if (updated && existing.sheetRow > 0 && existing.alias && notes && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(notes)) {
          updateCells.push({ row: existing.sheetRow, col: 39, value: '' });
          existing.notas = '';
        }
        if (updated) merged++;
      } else {
        const casa = rule ? rule.casa : '', cat = rule ? rule.categoria : '', subcat = rule ? rule.subcategoria : '';
        if (rule) autoCat++;
        let parentId = '';
        if (titular) {
          if (!titularParents.has(titular + '|||' + section)) {
            const existParent = existingLines.find(l => l.concepto.trim() === titular && l.section === section && !l.parentId);
            if (existParent) {
              titularParents.set(titular + '|||' + section, existParent.rawId || existParent.id);
            } else {
              const pid = BudgetLogic.generateId('BL');
              titularParents.set(titular + '|||' + section, pid);
              newRows.push([pid, this.activeBank, year, section, titular, '', '', '', 'variable', ...new Array(24).fill(0), 'FALSE', 0, 'ACTIVE', now, now, '', '', '', '']);
            }
          }
          parentId = titularParents.get(titular + '|||' + section);
        }
        const id = BudgetLogic.generateId('BL');
        const plan = new Array(12).fill(0);
        // Aplicar alias desde rule.label si existe — incluido en batchAppend, cero llamadas extra
        const importAlias = (rule && rule.label && rule.label !== concepto) ? rule.label : '';
        newRows.push([id, this.activeBank, year, section, concepto, casa, cat, subcat, 'one-off', ...plan, ...amounts, 'FALSE', 999, 'ACTIVE', now, now, notes, parentId, importAlias, breakdownJson]);
      }
      count++;
      } catch (rowErr) {
        console.error(`[Import] Error processing row ${count}/${total}:`, rowErr);
        count++;
      }
    }

    // Batch write all new rows in one API call
    showProg();
    if (newRows.length) {
      await SheetsAPI.batchAppend(CONFIG.SHEETS.BUDGET_LINES, newRows);
      // Track exact IDs for undo
      if (this._lastImportMeta) {
        newRows.forEach(r => { if (r[0]) this._lastImportMeta.ids.push(r[0]); });
      }
      // Persist to localStorage after IDs are collected
      try { localStorage.setItem('budgetLastImport', JSON.stringify(this._lastImportMeta)); } catch(e) {}
      // Fix: add new rows to this.lines immediately so subsequent imports in the
      // same session find them and merge instead of creating duplicates.
      newRows.forEach(r => {
        this.lines.push({
          id: r[0], bank: r[1], year: parseInt(r[2]), section: r[3], concepto: r[4],
          casa: r[5]||'', categoria: r[6]||'', subcategoria: r[7]||'',
          cadence: r[8]||'one-off',
          plan:  [r[9],r[10],r[11],r[12],r[13],r[14],r[15],r[16],r[17],r[18],r[19],r[20]].map(v=>parseFloat(v)||0),
          real:  [r[21],r[22],r[23],r[24],r[25],r[26],r[27],r[28],r[29],r[30],r[31],r[32]].map(v=>parseFloat(v)||0),
          isOverride: false, sortOrder: parseInt(r[34])||999,
          notas: r[38]||'', parentId: r[39]||'', alias: r[40]||'',
          breakdown: r[41]||'', sheetRow: -1
        });
      });
    }
    // Batch update existing rows (in chunks of 20 to avoid API limits)
    for (let i = 0; i < updateCells.length; i += 20) {
      const chunk = updateCells.slice(i, i + 20);
      await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, chunk);
    }

    // Post-import hooks — bank-specific enrichment
    // Use the bank of the imported movements, not the active tab
    const importedBank = (movements[0] && movements[0].bank) || this.activeBank;
    if (importedBank === 'Intessa') {
      await this._postImportIntessa(year);
    }
    if (importedBank === 'American Express' || importedBank === 'Amex') {
      await this._postImportAmex(year);
    }

    // Auto-import saldo
    if (this._impSaldo) {
      const { month: sm } = this._extractDate(this._impSaldo.date, fallbackMonth - 1);
      const meta = this.bankMeta[this.activeBank];
      if (meta) { meta.saldo[sm] = this._impSaldo.value; await this._saveBankMeta(sm, 'saldo', this._impSaldo.value); }
    }

    let msg = `✅ ${count} conceptos importados`;
    if (merged > 0) msg += `<br><span style="color:#64748b;">🔄 ${merged} fusionados</span>`;
    if (autoCat > 0) msg += `<br><span style="color:var(--accent);">⚡ ${autoCat} auto-categorizados</span>`;
    if (dedupSkipped > 0) msg += `<br><span style="color:#9ca3af;">⏭️ ${dedupSkipped} duplicados omitidos</span>`;
    if (this._impSaldo) msg += `<br><span style="color:#0ea5e9;">💰 Saldo: ${this._f(this._impSaldo.value,1)}</span>`;
    pv.innerHTML = `<div style="font-weight:600;padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;">${msg}</div>`;
    document.getElementById('imp-act').style.display = 'none';

    // Registrar extracto importado en IMPORTED_STATEMENTS
    try {
      const extractoLabel = document.getElementById('imp-extracto')?.value || '';
      if (extractoLabel && this._impMovements !== undefined) {
        // Usar _extractDate para manejar fechas Excel, Date object y string
        const isoToSort = (mv) => {
          const d = mv.date;
          if (!d) return '';
          if (d instanceof Date && !isNaN(d)) return d.toISOString().slice(0,10);
          if (typeof d === 'number') {
            // Número de serie Excel → fecha real
            const dt = new Date(Math.round((d - 25569) * 86400 * 1000));
            return isNaN(dt) ? '' : dt.toISOString().slice(0,10);
          }
          const s = String(d).trim();
          // DD/MM/YYYY → YYYY-MM-DD para poder ordenar
          const m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
          if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
          return s.slice(0,10);
        };
        const allDates = (this._impMovements || [])
          .map(isoToSort).filter(Boolean).sort();
        const fechaMin = allDates.length ? allDates[0] : '';
        const fechaMax = allDates.length ? allDates[allDates.length-1] : '';
        const impYear  = AppState.currentYear;
        const impMonth = parseInt(document.getElementById('imp-month')?.value) || AppState.currentMonth;
        const filename = document.getElementById('imp-fi')?.files?.[0]?.name || '';
        await BudgetLogic.registerImport(
          this.activeBank, extractoLabel, impYear, impMonth,
          filename, count, fechaMin, fechaMax
        );
      }
    } catch(regErr) { console.warn('registerImport error (no crítico):', regErr); }

    this._impMovements = [];
    BudgetLogic.invalidateGastosCache(this.activeBank);
    setTimeout(() => { document.querySelector('.budget-drawer-overlay')?.remove(); this.refresh(); }, 1500);
    } catch (importErr) {
      console.error('[Import] Fatal error:', importErr);
      if (pv) pv.innerHTML = `<div style="color:var(--danger);padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">❌ Error de importación: ${importErr.message || 'Error desconocido'}. Verifica tu conexión e inténtalo de nuevo.</div>`;
    }
  },


  // ─── _postImportIntessa — post-import enrichment for Intessa ────────────────
  // Runs automatically after every Intessa import. Does:
  //   1. Alias for PAGAMENTO ADUE (extracts from NOME:)
  //   2. Alias for DISPOSIZIONE DI BONIFICO (extracts from A FAVORE DI:)
  //   3. Alias for COMM.PRELIEVO → "Commissioni"
  //   4. Consolidates PAGAMENTO POS + TRAMITE POS + PRELIEVO CARTA DEBITO +
  //      PAGAMENTO EFFETTUATO SU POS ESTERO + PRELIEVO SPORTELLO into
  //      monthly "Visa Débito Ricardo" lines
  async _postImportIntessa(year) {
    console.log('[PostImport] Running Intessa enrichment...');
    const sheet = CONFIG.SHEETS.BUDGET_LINES;

    // Re-read lines fresh from sheet
    const allRows = await SheetsAPI.readSheet(sheet);
    if (!allRows || !allRows.length) return;

    const ALIAS_MAP_BONIFICO = [
      { keys: ['PATRICK GAUDET'],                           alias: 'Patrick Gaudet' },
      { keys: ['DENISE BORREL'],                            alias: 'Denise Borrel' },
      { keys: ['NAUTICA TRO'],                              alias: 'Nautica Tro Boats' },
      { keys: ['FARMACIA BARRACHINA'],                      alias: 'Farmacia Barrachina' },
      { keys: ['GARCIA FERREIRA','GARCIA FERRIERA'],        alias: 'Traspaso Ricardo' },
      { keys: ['RICARDO GARCIA','RICARDO MANUEL GARCIA'],   alias: 'Traspaso Ricardo' },
      { keys: ['SYLVIA BORNHOLT','SYLVIA BORNH'],           alias: 'Traspaso Sylvia' },
      { keys: ['CHRISTIAN MINOUX'],                         alias: 'Christian Minoux' },
      { keys: ['UMV CLINICA','UMV CLINIC'],                 alias: 'Clínica Veterinaria Pancho' },
      { keys: ['GOLDEN DATA'],                              alias: 'Golden Data' },
      { keys: ['PROTECTIVE COMFORT'],                       alias: 'Protective Comfort' },
      { keys: ['LEC SUPLEMENT'],                            alias: 'LEC Suplement' },
      { keys: ['SOLSAM'],                                   alias: 'Solsam Spas' },
      { keys: ['DE LA ESPERANZA'],                          alias: 'De La Esperanza Yuste' },
      { keys: ['EMMEGI ASSICURAZIONI'],                     alias: 'Emmegi Assicurazioni' },
      { keys: ['MACCIONI FABRIZIO'],                        alias: 'Maccioni Fabrizio' },
      { keys: ['ECKART PLAZA'],                             alias: 'Eckart Plaza' },
      { keys: ['WINTERSTEIGER'],                            alias: 'Wintersteiger' },
      { keys: ['AIR TECK'],                                 alias: 'Air Teck' },
      { keys: ['ANNA BIRGITTA','HOHOFF'],                   alias: 'Anna Birgitta Hohoff' },
      { keys: ['HOROGA GARCIA'],                            alias: 'Horoga Garcia' },
      { keys: ['ATTRAP GUEPES'],                            alias: 'Attrap Guêpes' },
      { keys: ['JUARMAVIAL'],                               alias: 'Juarmavial' },
      { keys: ['JOSE LUIS VILLALONGA'],                     alias: 'Jose Luis Villalonga' },
      { keys: ['CARLOS BARREDA'],                           alias: 'Carlos Barreda' },
      { keys: ['TERMOCLIMA'],                               alias: 'Termoclima Braina' },
      { keys: ['SODITEC'],                                  alias: 'Soditec' },
      { keys: ['REGISTRO POZUELO'],                         alias: 'Registro Pozuelo' },
      { keys: ['PLOMBERIE HAUTE'],                          alias: 'Plomberie Haute Tarantaise' },
      { keys: ['TINTORERIA'],                               alias: 'Tintorería Cobo' },
      { keys: ['MUNAM VIDA','VIDA MUNAM'],                  alias: 'Munam Vida (Sylvia)' },
    ];

    const VDR_CONCEPTOS = [
      'PAGAMENTO POS',
      'PAGAMENTO TRAMITE POS',
      'PRELIEVO CARTA DEBITO SU BANCHE ITALIA/SEPA',
      'PAGAMENTO EFFETTUATO SU POS ESTERO',
      'PRELIEVO SPORTELLO BANCA DEL GRUPPO'
    ];

    const aliasUpdates  = []; // {sheetRow, alias}
    const toDelete      = []; // sheetRows to mark DELETED
    const byMonth       = {}; // month 0-11 → [{amount, merchant, date}]

    for (let i = 1; i < allRows.length; i++) {
      const r = allRows[i];
      if (!r || !r[0]) continue;
      if (String(r[1] || '').trim() !== 'Intessa') continue;
      if (String(String(r[2] || '')).split('.')[0] !== String(year)) continue;
      if (String(r[35] || '').trim() !== 'ACTIVE') continue;

      const concepto  = String(r[4] || '').trim();
      const notas     = String(r[38] || '');
      const sheetRow  = i + 1;
      const existAlias = String(r[40] || '').trim();

      // ── ADUE: extract NOME: ──────────────────────────────────────
      if (concepto === 'PAGAMENTO ADUE' && !existAlias) {
        const m = notas.match(/NOME:\s*(.+?)(?:\s+MANDATO:|$)/i);
        if (m) {
          const a = m[1].trim().replace(/\s+/g, ' ');
          aliasUpdates.push({ sheetRow, alias: a });
        }
      }

      // ── BONIFICO: extract A FAVORE DI: ──────────────────────────
      if (concepto === 'DISPOSIZIONE DI BONIFICO' && !existAlias) {
        const m = notas.match(/A FAVORE DI:\s*(.+?)(?:\s+CAUSALE:|\s+BIC:|\s+IBAN:|$)/i);
        if (m) {
          const raw   = m[1].trim().substring(0, 40);
          const upper = raw.toUpperCase();
          let alias   = raw;
          for (const entry of ALIAS_MAP_BONIFICO) {
            if (entry.keys.some(k => upper.includes(k))) { alias = entry.alias; break; }
          }
          aliasUpdates.push({ sheetRow, alias });
        }
      }

      // ── COMM.PRELIEVO → Commissioni ─────────────────────────────
      if (concepto === 'COMM.PRELIEVO CARTA DEBITO ITALIA/SEPA' && !existAlias) {
        aliasUpdates.push({ sheetRow, alias: 'Commissioni' });
      }

      // ── VDR consolidation ────────────────────────────────────────
      if (!VDR_CONCEPTOS.includes(concepto)) continue;

      let month = -1, amount = 0;
      for (let m = 0; m < 12; m++) {
        const v = parseFloat(r[21 + m]) || 0;
        if (v > 0) { month = m; amount = v; break; }
      }
      if (month < 0) { toDelete.push(sheetRow); continue; }

      const merchant = this._extractIntessaMerchant(concepto, notas);
      const dateMt   = notas.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
      const date     = dateMt ? dateMt[1] : '';

      toDelete.push(sheetRow);
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push({ amount, merchant, date });
    }

    // Apply alias updates in batch
    if (aliasUpdates.length) {
      const cells = aliasUpdates.map(u => ({ row: u.sheetRow, col: 41, value: u.alias }));
      for (let i = 0; i < cells.length; i += 20) {
        await SheetsAPI.batchUpdate(sheet, cells.slice(i, i + 20));
      }
      console.log('[PostImport] Aliases set:', aliasUpdates.length);
    }

    // Create VDR consolidated lines
    const now = new Date().toISOString();
    const newVdrRows = [];
    for (let m = 0; m < 12; m++) {
      const lines = byMonth[m];
      if (!lines || !lines.length) continue;
      const total      = parseFloat(lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
      const realAmts   = new Array(12).fill(0);
      realAmts[m]      = total;
      const breakdown  = {}; breakdown[m] = lines.map(l => ({ d: l.date, a: parseFloat(l.amount.toFixed(2)), c: l.merchant }));
      const id = BudgetLogic.generateId('BL');
      newVdrRows.push([
        id, 'Intessa', year, 'GASTOS', 'Visa Débito Ricardo',
        'Italia', '', '', 'one-off',
        0,0,0,0,0,0,0,0,0,0,0,0,
        ...realAmts,
        'FALSE', 999, 'ACTIVE', now, now,
        '', '', 'Visa Débito Ricardo',
        JSON.stringify(breakdown)
      ]);
    }
    if (newVdrRows.length) {
      await SheetsAPI.batchAppend(sheet, newVdrRows);
      console.log('[PostImport] VDR lines created:', newVdrRows.length);
    }

    // Mark originals DELETED
    if (toDelete.length) {
      const delCells = [...new Set(toDelete)].map(sr => ({ row: sr, col: 36, value: 'DELETED' }));
      for (let i = 0; i < delCells.length; i += 25) {
        await SheetsAPI.batchUpdate(sheet, delCells.slice(i, i + 25));
      }
      console.log('[PostImport] Deleted:', delCells.length);
    }

    // ── INGRESOS consolidation ──────────────────────────────────────
    const INGRESO_ALIAS_MAP = [
      { alias: 'Nómina Idealista',    test: (c,n) => c==='STIPENDIO O PENSIONE' && /IDEALISTA/i.test(n) },
      { alias: 'Transferencia Ricardo', test: (c,n) => c==='BONIFICO IN EURO DA PAESI UE/SEPA' && /DISPOSTO DA\s+RICARDO/i.test(n) },
      { alias: 'Alquiler Cerdeña',    test: (c,n) => /CLAUDIA PIGA|AIRBNB|ROMEO CONTI/i.test(n) || c==='ACCREDITO BONIFICO ISTANTANEO' },
      { alias: 'Traspaso Sylvia',     test: (c,n) => /SYLVIA/i.test(n) && (c==='BONIFICO IN EURO DA PAESI UE/SEPA'||c==='ACCREDITO BEU CON CONTABILE') },
      { alias: 'Mascellaro Alessandra', test: (c,n) => /MASCELLARO/i.test(n) },
      { alias: 'Alvaro Cofino',       test: (c,n) => /COFINO/i.test(n) },
      { alias: 'Ricardo Santos',      test: (c,n) => /RICARDO SANTOS/i.test(n) },
      { alias: 'Protective Comfort',  test: (c,n) => /PROTECTIVE/i.test(n) && c==='ACCREDITO BEU CON CONTABILE' },
      { alias: 'Pablo Moreno',        test: (c,n) => /MORENO/i.test(n) },
      { alias: 'ENEL (devolución)',   test: (c,n) => /ENEL/i.test(n) && c==='ACCREDITO BEU CON CONTABILE' },
      { alias: 'Storno POS',          test: (c,n) => c==='STORNO PAGAMENTO POS' },
    ];

    const ingresoAliasUpdates = [];
    for (let i = 1; i < allRows.length; i++) {
      const r = allRows[i];
      if (!r || !r[0]) continue;
      if (String(r[1]||'').trim() !== 'Intessa') continue;
      if (String(String(r[2]||'')).split('.')[0] !== String(year)) continue;
      if (String(r[35]||'').trim() !== 'ACTIVE') continue;
      if (String(r[3]||'').trim() !== 'INGRESOS') continue;
      if (String(r[40]||'').trim()) continue; // already has alias
      const concepto = String(r[4]||'').trim();
      const notas    = String(r[38]||'');
      for (const rule of INGRESO_ALIAS_MAP) {
        if (rule.test(concepto, notas)) {
          ingresoAliasUpdates.push({ sheetRow: i+1, alias: rule.alias });
          break;
        }
      }
    }
    if (ingresoAliasUpdates.length) {
      const cells = ingresoAliasUpdates.map(u => ({ row: u.sheetRow, col: 41, value: u.alias }));
      for (let i = 0; i < cells.length; i += 20) {
        await SheetsAPI.batchUpdate(sheet, cells.slice(i, i + 20));
      }
      console.log('[PostImport] Ingreso aliases set:', ingresoAliasUpdates.length);
    }

    console.log('[PostImport] Intessa enrichment complete.');
  },

  _extractIntessaMerchant(concepto, notas) {
    if (!notas) return '';
    const s = String(notas);
    const idx = s.toUpperCase().indexOf('PRESSO');

    if (concepto === 'PAGAMENTO POS') {
      if (idx < 0) return '';
      return s.substring(idx + 6).trim().split(/  +/)[0].trim();
    }
    if (concepto === 'PAGAMENTO TRAMITE POS') {
      const dotIdx = s.indexOf('·');
      if (dotIdx < 0) return '';
      const after = s.substring(dotIdx + 1).trim();
      const cartaIdx = after.indexOf(' - Carta');
      const raw = cartaIdx >= 0 ? after.substring(0, cartaIdx) : after;
      return raw.replace(/\s+\d{1,2}\/\d{2}-\d{2}:\d{2}.*$/, '')
                .replace(/\d{2}\/\d{2}-\d{2}:\d{2}.*$/, '')
                .replace(/\s+(VIA\s+)?\w{3}\d{2}\/\d{2}.*$/, '').trim();
    }
    if (concepto.includes('PRELIEVO')) {
      if (idx < 0) return 'ATM';
      const after = s.substring(idx + 6).trim();
      const parts = after.split(/\s+/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        return 'ATM ' + parts.slice(1).join(' ').replace(/\s*-.*$/, '').trim();
      }
      return 'ATM';
    }
    if (concepto === 'PAGAMENTO EFFETTUATO SU POS ESTERO') {
      if (idx < 0) return '';
      return s.substring(idx + 6).trim().split(/  +/)[0].replace(/\s*\(CTV\..*$/, '').trim();
    }
    return '';
  },

  // ─── _postImportAmex — alias enrichment for American Express ───────────────
  // Groups recurring services that appear with different IDs in their concepto
  async _postImportAmex(year) {
    console.log('[PostImport] Running Amex enrichment...');
    const sheet = CONFIG.SHEETS.BUDGET_LINES;
    const allRows = await SheetsAPI.readSheet(sheet);
    if (!allRows || !allRows.length) return;

    const AMEX_ALIAS_MAP = [
      { keys: ['KINDLE SVCS', 'KINDLE'],                    alias: 'Kindle' },
      { keys: ['CLAUDE.AI SUBSCRIPTION', 'ANTHROPIC'],      alias: 'Claude.ai' },
      { keys: ['GOOGLE *YOUTUBEPREMIUM', 'YOUTUBE PREMIUM'],alias: 'YouTube Premium' },
      { keys: ['STARLINK INTERNET'],                         alias: 'Starlink' },
      { keys: ['BLOOMBERG'],                                 alias: 'Bloomberg' },
      { keys: ['OPENAI', 'CHATGPT'],                        alias: 'ChatGPT' },
      { keys: ['APPLE.COM/BILL', 'APPLE SUBSCR'],           alias: 'Apple' },
      { keys: ['NETFLIX'],                                   alias: 'Netflix' },
      { keys: ['SPOTIFY'],                                   alias: 'Spotify' },
      { keys: ['SP REP FITNESS', 'TAASTRUP'],                alias: 'Taastrup Fitness' },
      { keys: ['UBER TRIP'],                                 alias: 'Uber' },
      { keys: ['IBERIA.COM'],                                alias: 'Iberia.com' },
    ];

    const updates = [];
    for (let i = 1; i < allRows.length; i++) {
      const r = allRows[i];
      if (!r || !r[0]) continue;
      const bank = String(r[1] || '').trim();
      if (bank !== 'American Express' && bank !== 'Amex') continue;
      if (String(String(r[2] || '')).split('.')[0] !== String(year)) continue;
      if (String(r[35] || '').trim() !== 'ACTIVE') continue;
      if (String(r[40] || '').trim()) continue; // already has alias
      const concepto = String(r[4] || '').toUpperCase();
      for (const rule of AMEX_ALIAS_MAP) {
        if (rule.keys.some(k => concepto.includes(k.toUpperCase()))) {
          updates.push({ sheetRow: i + 1, alias: rule.alias });
          break;
        }
      }
    }

    if (updates.length) {
      const cells = updates.map(u => ({ row: u.sheetRow, col: 41, value: u.alias }));
      for (let i = 0; i < cells.length; i += 20) {
        await SheetsAPI.batchUpdate(sheet, cells.slice(i, i + 20));
      }
      console.log('[PostImport] Amex aliases set:', updates.length);
    }
    console.log('[PostImport] Amex enrichment complete.');
  },

  // ─── _extractDate ────────────────────────────────────────────────────────────
  // Date extraction — uses LOCAL time (not UTC) because SheetJS creates Date objects
  // at local midnight; using getUTCMonth/getUTCFullYear shifts 1st-of-month dates
  // back to the previous month/year in positive-offset timezones (CET, etc.)
  _extractDate(dateVal, fallbackMonth) {
    if (!dateVal) return { month: fallbackMonth, year: AppState.currentYear };
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return { month: dateVal.getMonth(), year: dateVal.getFullYear() };
    }
    const s = String(dateVal);
    let match = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (match) return { month: parseInt(match[2]) - 1, year: parseInt(match[3]) };
    match = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (match) return { month: parseInt(match[2]) - 1, year: parseInt(match[1]) };
    return { month: fallbackMonth, year: AppState.currentYear };
  }
};
