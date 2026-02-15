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
    return rows.slice(1).filter(r => r[0] && r[2] == year && r[35] !== 'DELETED').map((r, i) => ({
      id: r[0], bank: r[1], year: parseInt(r[2]), section: r[3],
      concepto: r[4] || '', casa: r[5] || '', categoria: r[6] || '',
      subcategoria: r[7] || '', cadence: r[8] || 'variable',
      plan: [r[9],r[10],r[11],r[12],r[13],r[14],r[15],r[16],r[17],r[18],r[19],r[20]].map(v => parseFloat(v) || 0),
      real: [r[21],r[22],r[23],r[24],r[25],r[26],r[27],r[28],r[29],r[30],r[31],r[32]].map(v => parseFloat(v) || 0),
      isOverride: r[33] === 'TRUE', sortOrder: parseInt(r[34]) || 0,
      sheetRow: i + 2 // 1-based row in sheet (header=1)
    }));
  },

  async loadBankSummary(year) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.BANK_SUMMARY);
    if (!rows || rows.length <= 1) return [];
    return rows.slice(1).filter(r => r[0] && r[2] == year).map((r, i) => ({
      id: r[0], bank: r[1], year: parseInt(r[2]), month: parseInt(r[3]),
      saldoInicio: parseFloat(r[4]) || 0, mesCerrado: r[13] === 'TRUE',
      sheetRow: i + 2
    }));
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
  getRealCol(monthIndex) { return 22 + monthIndex; }  // monthIndex 0-11 → col 22-33
};
