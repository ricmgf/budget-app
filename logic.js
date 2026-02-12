// ============================================================
// Budget App v2 — Business Logic (runs in browser)
// Reads/writes via SheetsAPI, all computation client-side
// ============================================================

// ============================================================
// CONFIG
// ============================================================

var BudgetLogic = {

  // --- PARSE CONFIG SHEET ---
  // CONFIG sheet has: Col A = Categoría/Cuenta/Casa headers, Col B = Subcategoría
  loadConfig: function() {
    var cached = DataCache.get('config');
    if (cached) return cached;

    return SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG).then(function(rows) {
      var categorias = [];
      var cuentas = [];
      var casas = [];
      var section = 'categorias'; // Start reading categories

      rows.forEach(function(row) {
        var colA = (row[0] || '').trim();
        var colB = (row[1] || '').trim();

        // Detect section changes
        if (colA === 'Cuenta' && !colB) { section = 'cuentas'; return; }
        if (colA === 'Casa' && !colB) { section = 'casas'; return; }
        if (!colA && !colB) return; // Skip empty rows

        if (section === 'categorias' && colA && colB) {
          categorias.push({ categoria: colA, subcategoria: colB });
        } else if (section === 'cuentas' && colA) {
          cuentas.push(colA);
        } else if (section === 'casas' && colA) {
          casas.push(colA);
        }
      });

      // Build grouped categories
      var categoriasGrouped = {};
      categorias.forEach(function(c) {
        if (!categoriasGrouped[c.categoria]) categoriasGrouped[c.categoria] = [];
        categoriasGrouped[c.categoria].push(c.subcategoria);
      });

      var config = {
        categorias: categorias,
        categoriasGrouped: categoriasGrouped,
        cuentas: cuentas,
        casas: casas
      };

      DataCache.set('config', config);
      return config;
    });
  },

  // --- ADD CATEGORY ---
  addCategory: function(categoria, subcategoria) {
    if (!categoria || !subcategoria) return Promise.reject(new Error('Both fields required'));
    return SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG).then(function(rows) {
      // Find last category row (before Cuenta section)
      var insertIdx = 0;
      for (var i = 0; i < rows.length; i++) {
        var a = (rows[i][0] || '').trim();
        if (a === 'Cuenta') { insertIdx = i + 1; break; } // +1 for header row
        insertIdx = i + 2; // +1 for header, +1 for 0-index
      }
      // Append after last category (simpler: just append before Cuenta section)
      // For simplicity, append at end of categories section
      return SheetsAPI.appendRows(CONFIG.SHEETS.CONFIG, [[categoria, subcategoria]]);
    }).then(function() {
      DataCache.invalidate('config');
      return { message: 'Category added' };
    });
  },

  // ============================================================
  // GASTOS
  // ============================================================

  // Load all gastos
  loadGastos: function() {
    var cached = DataCache.get('gastos');
    if (cached) return cached;

    return SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS).then(function(rows) {
      var gastos = rows.map(function(row, idx) {
        return {
          _rowIndex: idx + 2, // 1-based, +1 for header
          id: row[GASTOS_COLS.ID] || '',
          año: parseInt(row[GASTOS_COLS.AÑO]) || 0,
          mes: parseInt(row[GASTOS_COLS.MES]) || 0,
          fecha: row[GASTOS_COLS.FECHA] || '',
          concepto: row[GASTOS_COLS.CONCEPTO] || '',
          importe: parseFloat(row[GASTOS_COLS.IMPORTE]) || 0,
          cuenta: row[GASTOS_COLS.CUENTA] || '',
          casa: row[GASTOS_COLS.CASA] || '',
          categoria: row[GASTOS_COLS.CATEGORIA] || '',
          subcategoria: row[GASTOS_COLS.SUBCATEGORIA] || '',
          notas: row[GASTOS_COLS.NOTAS] || '',
          origen: row[GASTOS_COLS.ORIGEN] || '',
          estado: row[GASTOS_COLS.ESTADO] || '',
          fechaImport: row[GASTOS_COLS.FECHA_IMPORT] || ''
        };
      });
      DataCache.set('gastos', gastos);
      return gastos;
    });
  },

  // Get gastos filtered by year/month
  getGastos: function(año, mes, filters) {
    return this.loadGastos().then(function(gastos) {
      return gastos.filter(function(g) {
        if (año && g.año !== año) return false;
        if (mes && g.mes !== mes) return false;
        if (filters) {
          if (filters.cuenta && g.cuenta !== filters.cuenta) return false;
          if (filters.casa && g.casa !== filters.casa) return false;
          if (filters.categoria && g.categoria !== filters.categoria) return false;
          if (filters.estado && g.estado !== filters.estado) return false;
        }
        return true;
      });
    });
  },

  // Get pending (uncategorized) gastos
  getPending: function() {
    return this.loadGastos().then(function(gastos) {
      return gastos.filter(function(g) { return g.estado === 'pendiente'; });
    });
  },

  // Update a single gasto (categorize it)
  updateGasto: function(id, updates) {
    return this.loadGastos().then(function(gastos) {
      var found = null;
      for (var i = 0; i < gastos.length; i++) {
        if (gastos[i].id === id) { found = gastos[i]; break; }
      }
      if (!found) throw new Error('Transaction not found: ' + id);

      var rowNum = found._rowIndex;
      var range = CONFIG.SHEETS.GASTOS + '!H' + rowNum + ':M' + rowNum;
      // Columns H-M: Casa, Categoría, Subcategoría, Notas, Origen, Estado
      var newValues = [[
        updates.casa || found.casa,
        updates.categoria || found.categoria,
        updates.subcategoria || found.subcategoria,
        updates.notas !== undefined ? updates.notas : found.notas,
        found.origen,
        (updates.categoria && updates.subcategoria && updates.casa) ? 'categorizado' : found.estado
      ]];

      return SheetsAPI.updateRange(range, newValues);
    }).then(function() {
      DataCache.invalidate('gastos');
      return { message: 'Updated' };
    });
  },

  // Bulk update gastos
  bulkUpdateGastos: function(ids, updates) {
    return this.loadGastos().then(function(gastos) {
      var batchData = [];
      ids.forEach(function(id) {
        for (var i = 0; i < gastos.length; i++) {
          if (gastos[i].id === id) {
            var rn = gastos[i]._rowIndex;
            batchData.push({
              range: CONFIG.SHEETS.GASTOS + '!H' + rn + ':M' + rn,
              values: [[
                updates.casa,
                updates.categoria,
                updates.subcategoria,
                '',
                gastos[i].origen,
                'categorizado'
              ]]
            });
            break;
          }
        }
      });

      if (!batchData.length) throw new Error('No matching transactions');
      return SheetsAPI.batchUpdate(batchData);
    }).then(function() {
      DataCache.invalidate('gastos');
      return { message: ids.length + ' updated' };
    });
  },

  // Add manual gasto
  addManualGasto: function(data) {
    var fecha = new Date(data.fecha);
    var id = 'M' + Date.now().toString(36);
    var row = [
      id,
      fecha.getFullYear(),
      fecha.getMonth() + 1,
      data.fecha,
      data.concepto,
      data.importe,
      data.cuenta,
      data.casa || '',
      data.categoria || '',
      data.subcategoria || '',
      data.notas || '',
      'manual',
      (data.categoria && data.subcategoria && data.casa) ? 'categorizado' : 'pendiente',
      new Date().toISOString()
    ];

    return SheetsAPI.appendRows(CONFIG.SHEETS.GASTOS, [row]).then(function() {
      DataCache.invalidate('gastos');
      return { message: 'Added', id: id };
    });
  },

  // ============================================================
  // RULES ENGINE
  // ============================================================

  loadRules: function() {
    var cached = DataCache.get('rules');
    if (cached) return cached;

    return SheetsAPI.readSheet(CONFIG.SHEETS.RULES).then(function(rows) {
      var rules = rows.map(function(row, idx) {
        return {
          _rowIndex: idx + 2,
          id: parseInt(row[RULES_COLS.ID]) || idx + 1,
          prioridad: parseInt(row[RULES_COLS.PRIORIDAD]) || 50,
          tipoMatch: row[RULES_COLS.TIPO_MATCH] || 'contains',
          patron: row[RULES_COLS.PATRON] || '',
          cuenta: row[RULES_COLS.CUENTA] || '',
          categoria: row[RULES_COLS.CATEGORIA] || '',
          subcategoria: row[RULES_COLS.SUBCATEGORIA] || '',
          casa: row[RULES_COLS.CASA] || '',
          habilitado: row[RULES_COLS.HABILITADO] !== 'false' && row[RULES_COLS.HABILITADO] !== false,
          fechaCreacion: row[RULES_COLS.FECHA_CREACION] || '',
          creadoPor: row[RULES_COLS.CREADO_POR] || ''
        };
      });
      // Sort by priority
      rules.sort(function(a, b) { return a.prioridad - b.prioridad; });
      DataCache.set('rules', rules);
      return rules;
    });
  },

  // Check if a concepto matches a rule
  matchesRule: function(concepto, cuenta, rule) {
    if (!rule.habilitado) return false;
    if (rule.cuenta && rule.cuenta !== cuenta) return false;

    var text = (concepto || '').toLowerCase().trim();
    var pattern = (rule.patron || '').toLowerCase().trim();

    if (rule.tipoMatch === 'regex') {
      try { return new RegExp(pattern, 'i').test(concepto); }
      catch (e) { return false; }
    }
    return text.indexOf(pattern) !== -1;
  },

  // Categorize a transaction using rules
  categorizeTransaction: function(concepto, cuenta, rules) {
    for (var i = 0; i < rules.length; i++) {
      if (this.matchesRule(concepto, cuenta, rules[i])) {
        return {
          categoria: rules[i].categoria,
          subcategoria: rules[i].subcategoria,
          casa: rules[i].casa,
          ruleId: rules[i].id
        };
      }
    }
    return null;
  },

  // Add a rule
  addRule: function(data) {
    return this.loadRules().then(function(rules) {
      var maxId = 0;
      rules.forEach(function(r) { if (r.id > maxId) maxId = r.id; });
      var newId = maxId + 1;

      var row = [
        newId,
        data.prioridad || 50,
        data.tipoMatch || 'contains',
        data.patron,
        data.cuenta || '',
        data.categoria,
        data.subcategoria,
        data.casa,
        true,
        new Date().toISOString(),
        currentUser || ''
      ];

      return SheetsAPI.appendRows(CONFIG.SHEETS.RULES, [row]).then(function() {
        DataCache.invalidate('rules');
        return { message: 'Rule added', id: newId };
      });
    });
  },

  // Delete a rule (by setting habilitado to false — simpler than row delete)
  toggleRule: function(ruleId, enabled) {
    return this.loadRules().then(function(rules) {
      for (var i = 0; i < rules.length; i++) {
        if (rules[i].id === ruleId) {
          var rn = rules[i]._rowIndex;
          return SheetsAPI.updateRange(
            CONFIG.SHEETS.RULES + '!I' + rn,
            [[enabled ? 'true' : 'false']]
          );
        }
      }
      throw new Error('Rule not found');
    }).then(function() {
      DataCache.invalidate('rules');
      return { message: 'Rule updated' };
    });
  },

  // Test a rule pattern against existing gastos
  testRule: function(patron, tipoMatch, cuenta) {
    var self = this;
    return this.loadGastos().then(function(gastos) {
      var fakeRule = { habilitado: true, patron: patron, tipoMatch: tipoMatch || 'contains', cuenta: cuenta || '' };
      var matches = gastos.filter(function(g) { return self.matchesRule(g.concepto, g.cuenta, fakeRule); });
      return { totalMatches: matches.length, matches: matches.slice(0, 50) };
    });
  },

  // Apply rule retroactively to all pending gastos
  applyRuleRetroactive: function(ruleId) {
    var self = this;
    return Promise.all([this.loadGastos(), this.loadRules()]).then(function(results) {
      var gastos = results[0];
      var rules = results[1];
      var rule = null;
      for (var i = 0; i < rules.length; i++) {
        if (rules[i].id === ruleId) { rule = rules[i]; break; }
      }
      if (!rule) throw new Error('Rule not found');

      var batchData = [];
      gastos.forEach(function(g) {
        if (g.estado === 'pendiente' && self.matchesRule(g.concepto, g.cuenta, rule)) {
          batchData.push({
            range: CONFIG.SHEETS.GASTOS + '!H' + g._rowIndex + ':M' + g._rowIndex,
            values: [[rule.casa, rule.categoria, rule.subcategoria, '', g.origen, 'categorizado']]
          });
        }
      });

      if (!batchData.length) return { applied: 0 };
      return SheetsAPI.batchUpdate(batchData).then(function() {
        DataCache.invalidate('gastos');
        return { applied: batchData.length };
      });
    });
  },

  // ============================================================
  // IMPORT
  // ============================================================

  importCSV: function(csvText, cuenta, fileName) {
    var self = this;
    return Promise.all([this.loadGastos(), this.loadRules()]).then(function(results) {
      var existing = results[0];
      var rules = results[1];

      // Build existing hash set for dedup
      var existingHashes = {};
      existing.forEach(function(g) {
        var h = self._computeHash(g.fecha, g.importe, g.concepto, g.cuenta);
        existingHashes[h] = true;
      });

      // Parse CSV
      var lines = csvText.split(/\r?\n/).filter(function(l) { return l.trim(); });
      if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

      // Detect delimiter
      var header = lines[0];
      var delimiter = header.indexOf(';') !== -1 ? ';' : ',';

      // Parse header
      var headers = self._splitCSV(header, delimiter).map(function(h) {
        return h.toLowerCase().trim().replace(/["']/g, '');
      });

      // Find columns
      var dateCol = self._findCol(headers, ['fecha', 'date', 'data', 'fecha valor', 'fecha operación']);
      var conceptCol = self._findCol(headers, ['concepto', 'concept', 'description', 'descrizione', 'libellé', 'movimiento']);
      var amountCol = self._findCol(headers, ['importe', 'amount', 'importo', 'montant', 'cantidad']);
      var debitCol = self._findCol(headers, ['débit', 'debit', 'cargo']);
      var creditCol = self._findCol(headers, ['crédit', 'credit', 'abono']);

      if (dateCol === -1) throw new Error('Could not find date column. Headers: ' + headers.join(', '));
      if (conceptCol === -1) throw new Error('Could not find description column');
      if (amountCol === -1 && debitCol === -1) throw new Error('Could not find amount column');

      var imported = 0, duplicates = 0, categorized = 0, pending = 0, errors = [];
      var newRows = [];

      for (var i = 1; i < lines.length; i++) {
        try {
          var cols = self._splitCSV(lines[i], delimiter);
          if (cols.length < 2) continue;

          var dateStr = (cols[dateCol] || '').replace(/["']/g, '').trim();
          var concepto = (cols[conceptCol] || '').replace(/["']/g, '').trim();
          var importe;

          if (amountCol !== -1) {
            importe = self._parseAmount(cols[amountCol]);
          } else {
            var debit = debitCol !== -1 ? self._parseAmount(cols[debitCol]) : 0;
            var credit = creditCol !== -1 ? self._parseAmount(cols[creditCol]) : 0;
            importe = debit || credit || 0;
          }

          if (!dateStr || !concepto || !importe) continue;

          var fecha = self._parseDate(dateStr);
          if (!fecha) { errors.push('Row ' + (i+1) + ': bad date "' + dateStr + '"'); continue; }

          importe = Math.abs(importe);

          // Dedup
          var hash = self._computeHash(fecha, importe, concepto, cuenta);
          if (existingHashes[hash]) { duplicates++; continue; }
          existingHashes[hash] = true;

          // Categorize
          var cat = self.categorizeTransaction(concepto, cuenta, rules);
          var estado = cat ? 'categorizado' : 'pendiente';
          if (cat) categorized++;
          else pending++;

          var fechaObj = new Date(fecha);
          var id = 'I' + Date.now().toString(36) + i.toString(36);

          newRows.push([
            id,
            fechaObj.getFullYear(),
            fechaObj.getMonth() + 1,
            fecha,
            concepto,
            importe,
            cuenta,
            cat ? cat.casa : '',
            cat ? cat.categoria : '',
            cat ? cat.subcategoria : '',
            '',
            fileName || 'import',
            estado,
            new Date().toISOString()
          ]);

          imported++;
        } catch (e) {
          errors.push('Row ' + (i+1) + ': ' + e.message);
        }
      }

      if (newRows.length === 0) {
        return { imported: 0, duplicates: duplicates, categorized: 0, pending: 0, errors: errors, cuenta: cuenta };
      }

      return SheetsAPI.appendRows(CONFIG.SHEETS.GASTOS, newRows).then(function() {
        DataCache.invalidate('gastos');
        // Audit log
        SheetsAPI.appendRows(CONFIG.SHEETS.AUDIT, [[
          new Date().toISOString(), currentUser, 'import',
          JSON.stringify({ fileName: fileName, cuenta: cuenta, imported: imported, duplicates: duplicates, categorized: categorized, pending: pending })
        ]]);
        return { imported: imported, duplicates: duplicates, categorized: categorized, pending: pending, errors: errors, cuenta: cuenta, adapter: 'auto' };
      });
    });
  },

  // ============================================================
  // INGRESOS
  // ============================================================

  loadIngresos: function() {
    return SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS).then(function(rows) {
      return rows.map(function(row, idx) {
        return {
          _rowIndex: idx + 2,
          id: row[INGRESOS_COLS.ID] || '',
          año: parseInt(row[INGRESOS_COLS.AÑO]) || 0,
          mes: parseInt(row[INGRESOS_COLS.MES]) || 0,
          cuenta: row[INGRESOS_COLS.CUENTA] || '',
          concepto: row[INGRESOS_COLS.CONCEPTO] || '',
          tipo: row[INGRESOS_COLS.TIPO] || '',
          importe: parseFloat(row[INGRESOS_COLS.IMPORTE]) || 0,
          recurrente: row[INGRESOS_COLS.RECURRENTE] === 'true',
          notas: row[INGRESOS_COLS.NOTAS] || ''
        };
      });
    });
  },

  addIngreso: function(data) {
    var id = 'ING' + Date.now().toString(36);
    var row = [id, data.año, data.mes, data.cuenta, data.concepto, data.tipo || 'Otro', data.importe, data.recurrente || false, data.notas || ''];
    return SheetsAPI.appendRows(CONFIG.SHEETS.INGRESOS, [row]).then(function() {
      return { message: 'Income added', id: id };
    });
  },

  deleteIngreso: function(id) {
    return this.loadIngresos().then(function(ingresos) {
      for (var i = 0; i < ingresos.length; i++) {
        if (ingresos[i].id === id) {
          return SheetsAPI.deleteRow(CONFIG.SHEETS.INGRESOS, ingresos[i]._rowIndex);
        }
      }
      throw new Error('Income not found');
    });
  },

  // ============================================================
  // BALANCES & CASH FLOW
  // ============================================================

  calculateCashFlow: function(año, mes) {
    var self = this;
    return Promise.all([
      this.loadConfig(),
      this.getGastos(año, mes),
      this.loadIngresos()
    ]).then(function(results) {
      var config = results[0];
      var gastos = results[1];
      var allIngresos = results[2];
      var ingresos = allIngresos.filter(function(i) { return i.año === año && i.mes === mes; });

      var accounts = config.cuentas.map(function(cuenta) {
        var cuentaGastos = gastos.filter(function(g) {
          return g.cuenta === cuenta && g.categoria !== 'Transferencias';
        });
        var cuentaIngresos = ingresos.filter(function(i) { return i.cuenta === cuenta; });

        var totalGastos = cuentaGastos.reduce(function(s, g) { return s + g.importe; }, 0);
        var totalIngresos = cuentaIngresos.reduce(function(s, i) { return s + i.importe; }, 0);
        var saldoInicial = 0; // TODO: load from BALANCES sheet
        var saldoFinal = saldoInicial + totalIngresos - totalGastos;

        return {
          cuenta: cuenta,
          saldoInicial: saldoInicial,
          totalIngresos: totalIngresos,
          totalGastos: totalGastos,
          saldoFinal: saldoFinal,
          transferNecesaria: saldoFinal < 0 ? Math.abs(saldoFinal) : 0
        };
      });

      var gt = {
        totalIngresos: accounts.reduce(function(s, a) { return s + a.totalIngresos; }, 0),
        totalGastos: accounts.reduce(function(s, a) { return s + a.totalGastos; }, 0),
        totalTransferNecesaria: accounts.reduce(function(s, a) { return s + a.transferNecesaria; }, 0)
      };

      return { accounts: accounts, grandTotal: gt };
    });
  },

  // ============================================================
  // REPORTING
  // ============================================================

  getDashboardData: function(año, mes) {
    var self = this;
    return Promise.all([
      this.getGastos(año, mes),
      this.loadIngresos(),
      this.loadGastos() // all gastos for pending count
    ]).then(function(results) {
      var gastos = results[0];
      var allIngresos = results[1];
      var allGastos = results[2];

      var ingresos = allIngresos.filter(function(i) { return i.año === año && i.mes === mes; });
      var pendingAll = allGastos.filter(function(g) { return g.estado === 'pendiente'; });

      var totalGastos = gastos.filter(function(g) { return g.categoria !== 'Transferencias'; })
        .reduce(function(s, g) { return s + g.importe; }, 0);
      var totalIngresos = ingresos.reduce(function(s, i) { return s + i.importe; }, 0);

      var categorized = gastos.filter(function(g) { return g.estado === 'categorizado'; }).length;
      var total = gastos.length;
      var rate = total > 0 ? Math.round((categorized / total) * 100) : 100;

      // Top categories
      var catTotals = {};
      gastos.forEach(function(g) {
        if (g.categoria && g.categoria !== 'Transferencias') {
          catTotals[g.categoria] = (catTotals[g.categoria] || 0) + g.importe;
        }
      });
      var topCats = Object.keys(catTotals).map(function(k) { return { name: k, total: catTotals[k] }; });
      topCats.sort(function(a, b) { return b.total - a.total; });

      // By casa
      var casaTotals = {};
      gastos.forEach(function(g) {
        if (g.casa) { casaTotals[g.casa] = (casaTotals[g.casa] || 0) + g.importe; }
      });
      var byCasa = Object.keys(casaTotals).map(function(k) { return { name: k, total: casaTotals[k] }; });
      byCasa.sort(function(a, b) { return b.total - a.total; });

      return {
        totalGastos: totalGastos,
        totalIngresos: totalIngresos,
        cashFlow: totalIngresos - totalGastos,
        categorizationRate: rate,
        pendingCount: pendingAll.length,
        topCategories: topCats.slice(0, 7),
        byCasa: byCasa,
        transferNecesaria: 0,
        recentImports: []
      };
    });
  },

  getMonthlySummary: function(año, mes) {
    return this.getGastos(año, mes).then(function(gastos) {
      var catMap = {};
      gastos.forEach(function(g) {
        if (!g.categoria) return;
        var key = g.categoria;
        if (!catMap[key]) catMap[key] = { categoria: key, total: 0, subcategorias: {} };
        catMap[key].total += g.importe;
        var sk = g.subcategoria || 'Sin sub';
        catMap[key].subcategorias[sk] = (catMap[key].subcategorias[sk] || 0) + g.importe;
      });

      var summary = Object.values(catMap).map(function(c) {
        c.subcategorias = Object.keys(c.subcategorias).map(function(k) {
          return { subcategoria: k, total: c.subcategorias[k] };
        });
        c.subcategorias.sort(function(a, b) { return b.total - a.total; });
        return c;
      });
      summary.sort(function(a, b) { return b.total - a.total; });

      var grandTotal = summary.reduce(function(s, c) { return s + c.total; }, 0);
      return { summary: summary, grandTotal: grandTotal };
    });
  },

  getCasaSummary: function(año, mes) {
    return this.getGastos(año, mes).then(function(gastos) {
      var casaMap = {};
      gastos.forEach(function(g) {
        if (!g.casa) return;
        if (!casaMap[g.casa]) casaMap[g.casa] = { casa: g.casa, total: 0, categorias: {} };
        casaMap[g.casa].total += g.importe;
        var ck = g.categoria || 'Sin cat';
        casaMap[g.casa].categorias[ck] = (casaMap[g.casa].categorias[ck] || 0) + g.importe;
      });

      var summary = Object.values(casaMap).map(function(c) {
        c.categorias = Object.keys(c.categorias).map(function(k) {
          return { categoria: k, total: c.categorias[k] };
        }).sort(function(a, b) { return b.total - a.total; });
        return c;
      });
      summary.sort(function(a, b) { return b.total - a.total; });
      return { summary: summary };
    });
  },

  getAnnualSummary: function(año) {
    return this.loadGastos().then(function(gastos) {
      var yearGastos = gastos.filter(function(g) { return g.año === año; });
      var catMonths = {};
      var monthlyTotals = {};

      yearGastos.forEach(function(g) {
        if (!g.categoria) return;
        if (!catMonths[g.categoria]) catMonths[g.categoria] = { categoria: g.categoria, months: {}, total: 0 };
        catMonths[g.categoria].months[g.mes] = (catMonths[g.categoria].months[g.mes] || 0) + g.importe;
        catMonths[g.categoria].total += g.importe;
        monthlyTotals[g.mes] = (monthlyTotals[g.mes] || 0) + g.importe;
      });

      var categories = Object.values(catMonths).sort(function(a, b) { return b.total - a.total; });
      var grandTotal = categories.reduce(function(s, c) { return s + c.total; }, 0);

      return { categories: categories, monthlyTotals: monthlyTotals, grandTotal: grandTotal };
    });
  },

  // ============================================================
  // HELPERS
  // ============================================================

  _computeHash: function(fecha, importe, concepto, cuenta) {
    var str = fecha + '|' + parseFloat(importe).toFixed(2) + '|' + this._normalize(concepto) + '|' + (cuenta || '').toLowerCase().trim();
    // Simple hash (no SHA256 in browser without crypto API, use djb2)
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit
    }
    return Math.abs(hash).toString(16).substring(0, 16);
  },

  _normalize: function(text) {
    if (!text) return '';
    return text.toString().toLowerCase().trim().replace(/\s+/g, ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  _splitCSV: function(line, delimiter) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === delimiter && !inQuotes) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  },

  _findCol: function(headers, names) {
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < names.length; j++) {
        if (headers[i].indexOf(names[j]) !== -1) return i;
      }
    }
    return -1;
  },

  _parseDate: function(str) {
    str = (str || '').replace(/["']/g, '').trim();
    var m;
    // DD/MM/YYYY
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    // YYYY-MM-DD
    m = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    return null;
  },

  _parseAmount: function(str) {
    if (!str) return 0;
    str = str.toString().replace(/["']/g, '').trim();
    str = str.replace(/[€$£\s]/g, '');
    // Handle comma as decimal separator (European format)
    if (str.indexOf(',') !== -1 && str.indexOf('.') !== -1) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.indexOf(',') !== -1) {
      str = str.replace(',', '.');
    }
    return parseFloat(str) || 0;
  }
};
