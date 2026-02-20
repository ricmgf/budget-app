/**
 * logic.js — v2.0 (Fase 2)
 * CAMBIOS vs v1:
 *   - loadConfig() absorbe ACCOUNTS (batchGet en una llamada) → fix bug token Bancos
 *   - loadConfig() parsea extractos maestros (CONFIG col F)
 *   - calcEnvioNecesario() — función pública reutilizable para Dashboard
 *   - checkMissingStatements() — valida extractos importados por banco/mes
 *   - registerImport() — persiste importación en IMPORTED_STATEMENTS
 */

const BudgetLogic = {

  // ─── loadConfig — UNA llamada batchGet lee CONFIG + ACCOUNTS ──────────────
  async loadConfig() {
    try {
      // Una sola llamada API para CONFIG y ACCOUNTS
      const sheets = await SheetsAPI.batchGet([
        CONFIG.SHEETS.CONFIG,
        CONFIG.SHEETS.ACCOUNTS
      ]);
      const configRows  = sheets[CONFIG.SHEETS.CONFIG]  || [];
      const accountRows = sheets[CONFIG.SHEETS.ACCOUNTS] || [];

      const cfg = { categorias: {}, cuentas: [], casas: [], tarjetas: [], extractos: [], accounts: [] };

      // ── Parsear CONFIG ──
      if (configRows.length > 1) {
        configRows.slice(1).forEach((row, index) => {
          const rowIdx = index + 2;

          // Col A+B: Categorías / Subcategorías
          if (row[0] && row[4] !== 'DELETED') {
            const cat = row[0].trim();
            if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
            if (row[1] && row[1].trim() !== '') cfg.categorias[cat].push(row[1].trim());
          }
          // Col D (idx 3): Casas
          if (row[3] && row[3].trim() !== '' && row[5] !== 'DELETED') {
            cfg.casas.push({ name: row[3].trim(), row: rowIdx });
          }
          // Col E (idx 4): Tarjetas
          if (row[4] && row[4].trim() !== '' && row[4].trim() !== 'DELETED' && row[6] !== 'DELETED') {
            cfg.tarjetas.push({ name: row[4].trim(), row: rowIdx });
          }
          // Col F (idx 5): Extractos maestros — NUEVO Fase 2
          if (row[5] && row[5].trim() !== '' && row[5].trim() !== 'EXTRACTOS_MAESTRA' && row[7] !== 'DELETED') {
            cfg.extractos.push({ name: row[5].trim(), row: rowIdx });
          }
        });
      }

      // ── Parsear ACCOUNTS ── (ya en memoria, sin llamada extra)
      if (accountRows.length > 1) {
        accountRows.slice(1).forEach((r, i) => {
          if (!r[0] || r[0] === 'DELETED') return;
          cfg.accounts.push({
            name:      r[0] || '',
            iban:      r[1] || '',
            casa:      r[2] || '',
            tarjeta:   r[3] || '',
            order:     parseInt(r[4]) || (i + 1),
            extractos: r[5] || '',   // CSV de extractos requeridos — col F ACCOUNTS
            row:       i + 2         // sheet row (1-based, +1 header)
          });
        });
        cfg.accounts.sort((a, b) => a.order - b.order);
      }

      AppState.config = cfg;
      return cfg;
    } catch (e) {
      console.error('Error loadConfig:', e);
      throw e;
    }
  },

  // ─── getDashboardData — sin cambios ────────────────────────────────────────
  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m), actI = f(i, y, m);
    const totalG = actG.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0);
    const totalI = actI.reduce((acc, r) => acc + parseFloat(r[5] || 0), 0);
    return {
      gastos: actG, ingresos: actI,
      resumen: { totalGastos: totalG, totalIngresos: totalI, ahorro: totalI - totalG }
    };
  },

  // ─── loadAccounts — mantiene compatibilidad (usa AppState si disponible) ──
  async loadAccounts() {
    if (AppState.config && AppState.config.accounts && AppState.config.accounts.length > 0) {
      return AppState.config.accounts;
    }
    // Fallback: leer directamente (primera carga antes de loadConfig)
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    return (rows || []).slice(1).filter(r => r[0] && r[0] !== 'DELETED').map((r, i) => ({
      name: r[0], iban: r[1] || '', casa: r[2] || '', tarjeta: r[3] || '',
      extractos: r[5] || '', order: parseInt(r[4]) || (i + 1), row: i + 2
    })).sort((a, b) => a.order - b.order);
  },

  // ─── loadBudgetLines — sin cambios ─────────────────────────────────────────
  async loadBudgetLines(year) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_LINES);
    if (!rows || rows.length <= 1) return [];
    const results = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || r[2] != year || r[35] === 'DELETED') continue;
      results.push({
        id: r[0], bank: r[1], year: parseInt(r[2]), section: r[3],
        concepto: r[4] || '', casa: r[5] || '', categoria: r[6] || '',
        subcategoria: r[7] || '', cadence: r[8] || 'variable',
        plan: [r[9],r[10],r[11],r[12],r[13],r[14],r[15],r[16],r[17],r[18],r[19],r[20]].map(v => this.toNum(v)),
        real: [r[21],r[22],r[23],r[24],r[25],r[26],r[27],r[28],r[29],r[30],r[31],r[32]].map(v => this.toNum(v)),
        isOverride: r[33] === 'TRUE' || r[33] === true,
        sortOrder: parseInt(r[34]) || 0,
        notas: r[38] || '', parentId: r[39] || '', alias: r[40] || '',
        breakdown: r[41] || '', sheetRow: i + 1
      });
    }
    return results;
  },

  toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      return parseFloat(s.replace(/,/g, '')) || 0;
    }
    if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0;
    return parseFloat(s) || 0;
  },

  // ─── loadBankSummary — sin cambios ─────────────────────────────────────────
  async loadBankSummary(year) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BANK_SUMMARY);
    if (!rows || rows.length <= 1) return [];
    const results = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || r[2] != year) continue;
      results.push({
        id: r[0], bank: r[1], year: parseInt(r[2]), month: parseInt(r[3]),
        saldoInicio: this.toNum(r[4]), mesCerrado: r[13] === 'TRUE' || r[13] === true,
        buffer: this.toNum(r[15]), saldoCuenta: this.toNum(r[16]), sheetRow: i + 1
      });
    }
    return results;
  },

  // ─── calcEnvioNecesario — NUEVO: extraída de _summaryBlock() ───────────────
  // Misma lógica que BudgetGrid, ahora reutilizable desde el Dashboard
  // month: 1-12 (mes del dashboard — el que se quiere cubrir)
  calcEnvioNecesario(lines, bankMeta, bank, month) {
    const m    = month - 1;  // índice 0-based
    const prev = m - 1;      // mes anterior

    const bk = lines.filter(l => l.bank === bank);
    const G  = bk.filter(l => l.section === 'GASTOS');
    const T  = bk.filter(l => l.section === 'TARJETAS');
    const I  = bk.filter(l => l.section === 'INGRESOS');
    const meta = bankMeta[bank] || { buffer: new Array(12).fill(0), saldo: new Array(12).fill(0) };

    const gastosPlan    = G.reduce((s, l) => s + (l.plan[m]    || 0), 0);
    const tarjetasReal  = prev >= 0 ? T.reduce((s, l) => s + (l.real[prev] || 0), 0) : 0;
    const buffer        = meta.buffer[m] || 0;
    const ingresosPlan  = I.reduce((s, l) => s + (l.plan[m]    || 0), 0);
    const saldoAnterior = prev >= 0 ? meta.saldo[prev] : 0;

    const raw = gastosPlan + tarjetasReal + buffer - ingresosPlan - saldoAnterior;
    return {
      amount:       Math.max(0, raw),
      isSufficient: raw <= 0,
      breakdown:    { gastosPlan, tarjetasReal, buffer, ingresosPlan, saldoAnterior }
    };
  },

  // ── _toDateStr: convierte número Excel, Date o string a 'YYYY-MM-DD' ──────
  _toDateStr(val) {
    if (!val && val !== 0) return '';
    // Número Excel (días desde 30/12/1899)
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    const s = String(val).trim();
    // Ya es YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY o DD-MM-YYYY
    const m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return s;
  },

  // ── _fmtDateHuman: 'YYYY-MM-DD' → '28 Ene 2026' ────────────────────────
  _fmtDateHuman(dateStr) {
    if (!dateStr) return 'desconocido';
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const [y, mo, d] = dateStr.split('-');
    return `${parseInt(d)} ${months[parseInt(mo)-1]} ${y}`;
  },

  // ─── checkMissingStatements — NUEVO ────────────────────────────────────────
  // Valida si todos los extractos requeridos para bank/year/month están importados
  // y con cobertura de días completa.
  // importedRows: filas ya cargadas de IMPORTED_STATEMENTS (para no releer)
  checkMissingStatements(bank, year, month, importedRows) {
    const acc = (AppState.config?.accounts || []).find(a => a.name === bank);
    if (!acc || !acc.extractos) return { missing: [], incomplete: [], allOk: true };

    const required = acc.extractos.split(',').map(s => s.trim()).filter(Boolean);
    if (!required.length) return { missing: [], incomplete: [], allOk: true };

    // Filtrar importaciones para este banco/mes/año
    const bankImports = (importedRows || []).slice(1).filter(r =>
      r[1] === bank && String(r[3]) == String(year) && String(r[4]) == String(month)
    );

    const missing    = [];
    const incomplete = [];

    const today = new Date();
    const isCurrentMonth = (today.getFullYear() === year && today.getMonth() + 1 === month);
    const expectedStart  = `${year}-${String(month).padStart(2,'0')}-01`;
    let   expectedEnd;
    if (isCurrentMonth) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      expectedEnd = yesterday.toISOString().slice(0, 10);
    } else {
      const lastDay = new Date(year, month, 0).getDate();
      expectedEnd = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }

    for (const label of required) {
      const stmtRows = bankImports.filter(r => r[2] === label);
      if (stmtRows.length === 0) {
        missing.push(label);
        continue;
      }
      // Tomar el registro con mayor fecha_max
      const best = stmtRows.reduce((a, b) => ((b[9]||'') > (a[9]||'') ? b : a));
      const fechaMin = this._toDateStr(best[8]);
      const fechaMax = this._toDateStr(best[9]);

      const coversStart = !fechaMin || fechaMin <= expectedStart;
      const coversEnd   = !fechaMax || fechaMax >= expectedEnd;

      if (!coversStart || !coversEnd) {
        incomplete.push({
          label,
          fechaMax,
          message: `${label}: datos hasta ${this._fmtDateHuman(fechaMax)}`
        });
      }
    }

    return { missing, incomplete, allOk: missing.length === 0 && incomplete.length === 0 };
  },

  // ─── registerImport — NUEVO ────────────────────────────────────────────────
  // Llamar al final de cada importación exitosa en el drawer de importación.
  // fechaMin/fechaMax: 'YYYY-MM-DD', primero y último día del extracto importado.
  async registerImport(bank, statementLabel, year, month, filename, rowsImported, fechaMin, fechaMax) {
    const id  = this.generateId('IS');
    const now = new Date().toISOString();
    await SheetsAPI.appendRow(CONFIG.SHEETS.IMPORTED_STATEMENTS, [
      id, bank, statementLabel, year, month,
      now, filename, rowsImported, fechaMin, fechaMax
    ]);
  },

  // ─── generateId — sin cambios ───────────────────────────────────────────────
  generateId(prefix) {
    const ts  = Date.now().toString(36);
    const rnd = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${ts}${rnd}`.toUpperCase().substring(0, 12);
  },

  // ─── addBudgetLine — sin cambios ────────────────────────────────────────────
  async addBudgetLine(bank, year, section, concepto) {
    const id  = this.generateId('BL');
    const now = new Date().toISOString();
    const row = [id, bank, year, section, concepto, '', '', '', 'variable',
      0,0,0,0,0,0,0,0,0,0,0,0,
      0,0,0,0,0,0,0,0,0,0,0,0,
      'FALSE', 999, 'ACTIVE', now, now
    ];
    await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, row);
    return id;
  },

  async updateBudgetCell(sheetRow, colIndex, value) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.BUDGET_LINES, sheetRow, colIndex, value);
  },

  async deleteBudgetLine(sheetRow) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.BUDGET_LINES, sheetRow, 36, 'DELETED');
  },

  getPlanCol(monthIndex) { return 10 + monthIndex; },
  getRealCol(monthIndex) { return 22 + monthIndex; },

  // ─── Lines cache — source of truth for search and reporting ─────────────────
  // GASTOS_TOTAL is unused. All data lives in BUDGET_LINES.
  _linesCache: {},

  // Returns parsed lines for one bank (prefers live BudgetGrid data)
  async getLinesForBank(bank) {
    if (typeof BudgetGrid !== 'undefined' && BudgetGrid.lines && BudgetGrid.lines.length) {
      const bl = BudgetGrid.lines.filter(l => l.bank === bank);
      if (bl.length) return bl;
    }
    if (this._linesCache[bank]) return this._linesCache[bank];
    try {
      const all = await this.loadBudgetLines(new Date().getFullYear());
      this._linesCache = {};
      all.forEach(l => {
        if (!this._linesCache[l.bank]) this._linesCache[l.bank] = [];
        this._linesCache[l.bank].push(l);
      });
      return this._linesCache[bank] || [];
    } catch(e) { console.warn('[BudgetLogic] getLinesForBank error:', e); return []; }
  },

  // Returns all parsed lines across all banks
  async getAllLines() {
    if (typeof BudgetGrid !== 'undefined' && BudgetGrid.lines && BudgetGrid.lines.length) {
      return BudgetGrid.lines;
    }
    try { return await this.loadBudgetLines(new Date().getFullYear()); }
    catch(e) { console.warn('[BudgetLogic] getAllLines error:', e); return []; }
  },

  invalidateGastosCache(bank) {
    if (bank) delete this._linesCache[bank];
    else this._linesCache = {};
  },

  // Normalize: lowercase, strip accents, collapse spaces
  _norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  },

  // Fuzzy: every query word must appear as substring OR edit-dist≤1 (5+ char words)
  _fuzzyMatch(haystack, query) {
    const h = this._norm(haystack);
    const words = this._norm(query).split(' ').filter(Boolean);
    return words.every(w => {
      if (h.includes(w)) return true;
      if (w.length < 5) return false;
      for (let i = 0; i <= h.length - w.length + 1; i++) {
        const slice = h.slice(i, i + w.length);
        let diff = 0;
        for (let j = 0; j < w.length; j++) {
          if (slice[j] !== w[j]) { diff++; if (diff > 1) break; }
        }
        if (diff <= 1) return true;
      }
      return false;
    });
  },

  // All searchable text for a budget line:
  // concepto + notas + alias + original concpetos inside breakdown JSON
  _lineText(line) {
    const parts = [line.concepto, line.notas, line.alias];
    if (line.breakdown && line.breakdown !== 'None') {
      try {
        const bd = typeof line.breakdown === 'string' ? JSON.parse(line.breakdown) : line.breakdown;
        Object.values(bd).forEach(txns => {
          if (Array.isArray(txns)) txns.forEach(t => { if (t.c) parts.push(t.c); });
        });
      } catch(e) {}
    }
    return parts.filter(Boolean).join(' ');
  },

  // Search budget lines. Returns matching line objects.
  async searchGastos(query, bank) {
    if (!query || query.trim().length < 2) return [];
    const lines = bank ? await this.getLinesForBank(bank) : await this.getAllLines();
    return lines.filter(l => this._fuzzyMatch(this._lineText(l), query.trim()));
  },

  // ─── Rules engine — sin cambios ─────────────────────────────────────────────
  _rules: [], _groupRules: [], _excludeRules: [],

  async loadRules() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
      if (!rows || rows.length <= 1) { this._rules = []; this._groupRules = []; this._excludeRules = []; return []; }
      this._rules = []; this._groupRules = []; this._excludeRules = [];
      const str = (v) => v == null ? '' : String(v).trim();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        const enabled = r[9];
        if (enabled === false || String(enabled).toUpperCase() === 'FALSE') continue;
        const rule = {
          pattern: str(r[0]).toUpperCase(), matchType: str(r[1]) || 'contains',
          bank: str(r[2]), action: str(r[3]) || 'categorize', label: str(r[4]),
          casa: str(r[5]), categoria: str(r[6]), subcategoria: str(r[7]),
          priority: parseInt(r[8]) || 10, confidence: str(r[10]) || 'auto',
          timesUsed: parseInt(r[11]) || 0, sheetRow: i + 1
        };
        if (rule.action === 'exclude') this._excludeRules.push(rule);
        else if (rule.action === 'group') this._groupRules.push(rule);
        else this._rules.push(rule);
      }
      this._rules.sort((a, b) => {
        if (a.confidence === 'manual' && b.confidence !== 'manual') return -1;
        if (b.confidence === 'manual' && a.confidence !== 'manual') return 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.timesUsed - a.timesUsed;
      });
      return this._rules;
    } catch(e) { console.error('loadRules error:', e); this._rules = []; this._groupRules = []; this._excludeRules = []; return []; }
  },

  getExclusionPatterns(bankName) {
    return this._excludeRules.filter(r => !r.bank || r.bank === bankName).map(r => r.pattern);
  },
  getGroupRules(bankName) {
    return this._groupRules.filter(r => !r.bank || r.bank === bankName);
  },
  _matchPattern(rule, text) {
    const t = text.toUpperCase();
    switch (rule.matchType) {
      case 'exact':  return t === rule.pattern;
      case 'begins': return t.startsWith(rule.pattern);
      case 'ends':   return t.endsWith(rule.pattern);
      default:       return t.includes(rule.pattern);
    }
  },
  findRule(concepto, bankName) {
    if (!concepto || !this._rules.length) return null;
    const c = concepto.trim().toUpperCase();
    let match = this._rules.find(r => r.pattern === c && r.bank === bankName); if (match) return match;
    match = this._rules.find(r => r.pattern === c && !r.bank); if (match) return match;
    match = this._rules.find(r => r.bank === bankName && this._matchPattern(r, c)); if (match) return match;
    match = this._rules.find(r => !r.bank && this._matchPattern(r, c)); if (match) return match;
    for (const rule of this._rules) {
      if (rule.bank && rule.bank !== bankName) continue;
      const words = rule.pattern.split(/\s+/).filter(w => w.length >= 4);
      if (words.length && words.some(w => c.includes(w))) return rule;
    }
    return null;
  },
  findRuleWithNotes(concepto, notes, bankName) {
    if (!concepto || !this._rules.length) return null;
    const normC = this._normalize(concepto), normN = this._normalize(notes || '');
    const combined = normC + ' ' + normN;
    for (const rule of this._rules) {
      const parts = rule.pattern.split('|||');
      const ruleConcepto = this._normalize(parts[0] || ''), ruleNotes = this._normalize(parts[1] || '');
      if (!ruleConcepto) continue;
      if (rule.bank && rule.bank !== bankName) continue;
      if (ruleNotes) {
        const cMatch = normC.includes(ruleConcepto) || ruleConcepto.includes(normC) || this._wordMatch(ruleConcepto, normC);
        const nMatch = normN.includes(ruleNotes) || this._wordMatch(ruleNotes, normN);
        if (cMatch && nMatch) return rule;
      } else {
        if (normC.includes(ruleConcepto) || ruleConcepto.includes(normC)) return rule;
        if (this._wordMatch(ruleConcepto, combined)) return rule;
      }
    }
    return this.findRule(concepto, bankName);
  },
  _normalize(s) {
    return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  },
  _wordMatch(pattern, text) {
    const words = pattern.split(/\s+/).filter(w => w.length >= 4);
    return words.length > 0 && words.some(w => text.includes(w));
  },
  async autoCategorizeLine(lineId, concepto, bankName, sheetRow) {
    const rule = this.findRule(concepto, bankName);
    if (!rule) return null;
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: sheetRow, col: 6, value: rule.casa },
      { row: sheetRow, col: 7, value: rule.categoria },
      { row: sheetRow, col: 8, value: rule.subcategoria },
      { row: sheetRow, col: 38, value: new Date().toISOString() }
    ]);
    rule.timesUsed++;
    await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, rule.sheetRow, 12, rule.timesUsed);
    return { casa: rule.casa, categoria: rule.categoria, subcategoria: rule.subcategoria, auto: true };
  },
  async createRule(concepto, bankName, casa, categoria, subcategoria, alias) {
    const pattern  = concepto.trim().toUpperCase();
    const label    = (alias && alias !== concepto.trim()) ? alias.trim() : '';
    const existing = this._rules.find(r => r.pattern === pattern && (!r.bank || r.bank === bankName));
    if (existing && existing.sheetRow > 0) {
      existing.casa = casa; existing.categoria = categoria;
      existing.subcategoria = subcategoria; existing.confidence = 'manual';
      if (label) existing.label = label;
      const updates = [
        { row: existing.sheetRow, col: 6, value: casa },
        { row: existing.sheetRow, col: 7, value: categoria },
        { row: existing.sheetRow, col: 8, value: subcategoria },
        { row: existing.sheetRow, col: 11, value: 'manual' }
      ];
      if (label) updates.push({ row: existing.sheetRow, col: 5, value: label });
      await SheetsAPI.batchUpdate(CONFIG.SHEETS.RULES, updates);
      return;
    }
    if (existing) { const idx = this._rules.indexOf(existing); if (idx >= 0) this._rules.splice(idx, 1); }
    const now = new Date().toISOString();
    const row = [concepto.trim(), 'contains', bankName, 'categorize', label, casa, categoria, subcategoria, 10, 'TRUE', 'manual', 1, now, 'manual'];
    await SheetsAPI.appendRow(CONFIG.SHEETS.RULES, row);
    this._rules.push({ pattern, matchType: 'contains', bank: bankName, action: 'categorize', label, casa, categoria, subcategoria, priority: 10, confidence: 'manual', timesUsed: 1, sheetRow: -1 });
  },
  async createGroupRule(pattern, label, bankName) {
    const now = new Date().toISOString();
    const row = [pattern.trim(), 'contains', bankName || '', 'group', label, '', '', '', 50, 'TRUE', 'manual', 0, now, 'manual'];
    await SheetsAPI.appendRow(CONFIG.SHEETS.RULES, row);
    this._groupRules.push({ pattern: pattern.trim().toUpperCase(), matchType: 'contains', bank: bankName || '', action: 'group', label, casa: '', categoria: '', subcategoria: '', priority: 50, confidence: 'manual', timesUsed: 0, sheetRow: -1 });
  },

  // ─── toggleCloseMonth — sin cambios ─────────────────────────────────────────
  async toggleCloseMonth(bank, month) {
    const summ  = await this._getOrCreateSummary(bank, month);
    const newVal = !summ.mesCerrado;
    await SheetsAPI.updateCell(CONFIG.SHEETS.BANK_SUMMARY, summ.sheetRow, 14, newVal ? 'TRUE' : 'FALSE');
    return newVal;
  },
  async _getOrCreateSummary(bank, month) {
    let existing = null;
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BANK_SUMMARY);
    if (rows) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === bank && rows[i][2] == AppState.currentYear && rows[i][3] == month) {
          existing = { sheetRow: i + 1, mesCerrado: rows[i][13] === 'TRUE' || rows[i][13] === true };
          break;
        }
      }
    }
    if (existing) return existing;
    const id  = this.generateId('BMS');
    const now = new Date().toISOString();
    const row = [id, bank, AppState.currentYear, month, 0,0,0,0,0,0,0,0,0,'FALSE',now,0,0];
    await SheetsAPI.appendRow(CONFIG.SHEETS.BANK_SUMMARY, row);
    const reread = await SheetsAPI.readSheet(CONFIG.SHEETS.BANK_SUMMARY);
    return { sheetRow: reread.length, mesCerrado: false };
  }
};
