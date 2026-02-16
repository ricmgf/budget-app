/**
 * [ARCHIVO_PROTEGIDO_V1.55_ESTABLE]
 * ⚠️ PROHIBIDO MODIFICAR EL MOTOR DE LÓGICA Y MAPEOS DE COLUMNAS.
 */
const BudgetLogic = {
  async loadConfig() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      const cfg = { categorias: {}, cuentas: [], casas: [], tarjetas: [] };
      if (!rows || rows.length <= 1) return cfg;

      rows.slice(1).forEach((row, index) => {
        const rowIdx = index + 2;
        if (row[0] && row[4] !== 'DELETED') {
          const cat = row[0].trim();
          if (!cfg.categorias[cat]) cfg.categorias[cat] = [];
          if (row[1] && row[1].trim() !== "") cfg.categorias[cat].push(row[1].trim());
        }
        // Columna D: Casas (Legacy Fix)
        if (row[3] && row[3].trim() !== "" && row[5] !== 'DELETED') {
          cfg.casas.push({ name: row[3].trim(), row: rowIdx });
        }
        // Columna E: Tarjetas
        if (row[4] && row[4].trim() !== "" && row[4].trim() !== 'DELETED' && row[6] !== 'DELETED') {
          cfg.tarjetas.push({ name: row[4].trim(), row: rowIdx });
        }
      });
      AppState.config = cfg;
      return cfg;
    } catch (e) {
      console.error("Error loadConfig:", e);
      throw e;
    }
  },

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

  async loadAccounts() {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    return (rows || []).slice(1).filter(r => r[0] && r[0] !== 'DELETED').map((r, i) => ({
      name: r[0], iban: r[1] || '', casa: r[2] || '', tarjetas: r[3] || '',
      targetMinBalance: parseFloat(r[4]) || 0, row: i + 2
    }));
  },

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
        notas: r[38] || '',
        parentId: r[39] || '',
        alias: r[40] || '',
        sheetRow: i + 1 // i is 0-based from rows array (row 0=header), sheet is 1-based, so data row i → sheet row i+1
      });
    }
    return results;
  },

  toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    // Handle formatted strings like "1,000.00" or "1.000,00"
    const s = String(v).replace(/[^\d.,-]/g, '');
    // If both comma and dot present, determine which is decimal
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      return parseFloat(s.replace(/,/g, '')) || 0;
    }
    if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0;
    return parseFloat(s) || 0;
  },

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
        buffer: this.toNum(r[15]),       // col P (16th, 0-based index 15)
        saldoCuenta: this.toNum(r[16]),  // col Q (17th, 0-based index 16)
        sheetRow: i + 1
      });
    }
    return results;
  },

  generateId(prefix) {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${ts}${rnd}`.toUpperCase().substring(0, 12);
  },

  async addBudgetLine(bank, year, section, concepto) {
    const id = this.generateId('BL');
    const now = new Date().toISOString();
    const sortOrder = 999; // Will be sorted by section
    const row = [id, bank, year, section, concepto, '', '', '', 'variable',
      0,0,0,0,0,0,0,0,0,0,0,0, // plan ene-dic
      0,0,0,0,0,0,0,0,0,0,0,0, // real ene-dic
      'FALSE', sortOrder, 'ACTIVE', now, now
    ];
    await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, row);
    return id;
  },

  async updateBudgetCell(sheetRow, colIndex, value) {
    // colIndex: 1-based column in BUDGET_LINES
    await SheetsAPI.updateCell(CONFIG.SHEETS.BUDGET_LINES, sheetRow, colIndex, value);
  },

  async deleteBudgetLine(sheetRow) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.BUDGET_LINES, sheetRow, 36, 'DELETED'); // col AJ = status
  },

  // Plan columns: J=10 to U=21, Real columns: V=22 to AG=33
  getPlanCol(monthIndex) { return 10 + monthIndex; }, // monthIndex 0-11 → col 10-21
  getRealCol(monthIndex) { return 22 + monthIndex; }, // monthIndex 0-11 → col 22-33

  // ══════════ RULES ENGINE (Phase 2C) ══════════

  _rules: [],

  async loadRules() {
    try {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
      if (!rows || rows.length <= 1) { this._rules = []; return []; }
      this._rules = [];
      const str = (v) => v == null ? '' : String(v).trim();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0]) continue;
        this._rules.push({
          pattern: str(r[0]).toUpperCase(),
          bank: str(r[1]),
          casa: str(r[2]),
          categoria: str(r[3]),
          subcategoria: str(r[4]),
          confidence: str(r[5]) || 'auto',
          timesUsed: parseInt(r[6]) || 0,
          sheetRow: i + 1
        });
      }
    // Sort: manual first, then by times_used descending
    this._rules.sort((a, b) => {
      if (a.confidence === 'manual' && b.confidence !== 'manual') return -1;
      if (b.confidence === 'manual' && a.confidence !== 'manual') return 1;
      return b.timesUsed - a.timesUsed;
    });
    return this._rules;
    } catch(e) { console.error('loadRules error:', e); this._rules = []; return []; }
  },

  findRule(concepto, bankName) {
    if (!concepto || !this._rules.length) return null;
    const c = concepto.trim().toUpperCase();

    // 1. Exact match with bank
    let match = this._rules.find(r => r.pattern === c && r.bank === bankName);
    if (match) return match;

    // 2. Exact match any bank
    match = this._rules.find(r => r.pattern === c && !r.bank);
    if (match) return match;

    // 3. Partial match: concepto contains pattern or pattern contains concepto
    match = this._rules.find(r => c.includes(r.pattern) || r.pattern.includes(c));
    if (match) return match;

    // 4. Word-level match: any word ≥4 chars from pattern found in concepto
    for (const rule of this._rules) {
      const words = rule.pattern.split(/\s+/).filter(w => w.length >= 4);
      if (words.length && words.some(w => c.includes(w))) return rule;
    }

    return null;
  },

  // Smart matching that also considers notes/details for disambiguation
  findRuleWithNotes(concepto, notes, bankName) {
    if (!concepto || !this._rules.length) return null;
    const normC = this._normalize(concepto);
    const normN = this._normalize(notes || '');
    const combined = normC + ' ' + normN;

    // Rules may have pattern stored as "concepto|||notes"
    for (const rule of this._rules) {
      const parts = rule.pattern.split('|||');
      const ruleConcepto = this._normalize(parts[0] || '');
      const ruleNotes = this._normalize(parts[1] || '');

      if (!ruleConcepto) continue;
      if (rule.bank && rule.bank !== bankName) continue;

      // If rule has notes, both concepto AND notes must match
      if (ruleNotes) {
        const cMatch = normC.includes(ruleConcepto) || ruleConcepto.includes(normC) || this._wordMatch(ruleConcepto, normC);
        const nMatch = normN.includes(ruleNotes) || this._wordMatch(ruleNotes, normN);
        if (cMatch && nMatch) return rule;
      } else {
        // No notes in rule — match concepto only
        if (normC.includes(ruleConcepto) || ruleConcepto.includes(normC)) return rule;
        if (this._wordMatch(ruleConcepto, combined)) return rule;
      }
    }

    // Fallback to basic findRule
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

    // Apply rule to the budget line
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: sheetRow, col: 6, value: rule.casa },
      { row: sheetRow, col: 7, value: rule.categoria },
      { row: sheetRow, col: 8, value: rule.subcategoria },
      { row: sheetRow, col: 38, value: new Date().toISOString() }
    ]);

    // Increment times_used
    rule.timesUsed++;
    await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, rule.sheetRow, 7, rule.timesUsed);

    return { casa: rule.casa, categoria: rule.categoria, subcategoria: rule.subcategoria, auto: true };
  },

  async createRule(concepto, bankName, casa, categoria, subcategoria) {
    // Check if rule already exists
    const existing = this._rules.find(r => r.pattern === concepto.trim().toUpperCase());
    if (existing) {
      // Update existing
      existing.casa = casa;
      existing.categoria = categoria;
      existing.subcategoria = subcategoria;
      existing.confidence = 'manual';
      await SheetsAPI.batchUpdate(CONFIG.SHEETS.RULES, [
        { row: existing.sheetRow, col: 3, value: casa },
        { row: existing.sheetRow, col: 4, value: categoria },
        { row: existing.sheetRow, col: 5, value: subcategoria },
        { row: existing.sheetRow, col: 6, value: 'manual' }
      ]);
      return;
    }
    // Create new
    const now = new Date().toISOString();
    const row = [concepto.trim(), bankName, casa, categoria, subcategoria, 'manual', 1, now];
    await SheetsAPI.appendRow(CONFIG.SHEETS.RULES, row);
    this._rules.push({
      pattern: concepto.trim().toUpperCase(), bank: bankName,
      casa, categoria, subcategoria, confidence: 'manual', timesUsed: 1,
      sheetRow: -1 // Will be corrected on next load
    });
  },

  // ══════════ CLOSE MONTH (Phase 2D) ══════════

  async toggleCloseMonth(bank, month) {
    const summ = await this._getOrCreateSummary(bank, month);
    const newVal = !summ.mesCerrado;
    await SheetsAPI.updateCell(CONFIG.SHEETS.BANK_SUMMARY, summ.sheetRow, 14, newVal ? 'TRUE' : 'FALSE');
    return newVal;
  },

  async _getOrCreateSummary(bank, month) {
    // Check loaded summaries first
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

    // Create new row
    const id = this.generateId('BMS');
    const now = new Date().toISOString();
    const row = [id, bank, AppState.currentYear, month, 0,0,0,0,0,0,0,0,0, 'FALSE', now, 0, 0];
    await SheetsAPI.appendRow(CONFIG.SHEETS.BANK_SUMMARY, row);
    // Approximate sheetRow
    const reread = await SheetsAPI.readSheet(CONFIG.SHEETS.BANK_SUMMARY);
    return { sheetRow: reread.length, mesCerrado: false };
  }
};
