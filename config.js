// ============================================================
// Budget App — Configuration (IDs, Sheets, Columns)
// ============================================================

var CONFIG = {
  CLIENT_ID: '824143713001-hkpisl7k9js7001f87o80jpoq86k4cm2.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCwrt8rREK0fWIFwGpbsft6Ad8FatQY4Ec',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
  SPREADSHEET_ID: '1Clobogf_4Db6YYfNGPUnzJ83NmT3Q_Kqt_tg8a2wXi8',

  SHEETS: {
    GASTOS: 'GASTOS_TOTAL',
    INGRESOS: 'INGRESOS',
    CONFIG: 'CONFIG',
    RULES: 'RULES',
    BALANCES: 'BALANCES',
    AUDIT: 'AUDIT_LOG'
  }
};

// Column indices for GASTOS_TOTAL (0-based)
var GASTOS_COLS = {
  ID: 0,
  AÑO: 1,
  MES: 2,
  FECHA: 3,
  CONCEPTO: 4,
  IMPORTE: 5,
  CUENTA: 6,
  CASA: 7,
  CATEGORIA: 8,
  SUBCATEGORIA: 9,
  NOTAS: 10,
  ORIGEN: 11,
  ESTADO: 12,
  FECHA_IMPORT: 13
};

// Column indices for INGRESOS (0-based)
var INGRESOS_COLS = {
  ID: 0,
  AÑO: 1,
  MES: 2,
  CUENTA: 3,
  CONCEPTO: 4,
  TIPO: 5,
  IMPORTE: 6,
  RECURRENTE: 7,
  NOTAS: 8
};

// Column indices for RULES (0-based)
var RULES_COLS = {
  ID: 0,
  PRIORIDAD: 1,
  TIPO_MATCH: 2,
  PATRON: 3,
  CUENTA: 4,
  CATEGORIA: 5,
  SUBCATEGORIA: 6,
  CASA: 7,
  HABILITADO: 8,
  FECHA_CREACION: 9,
  CREADO_POR: 10
};

// Column indices for BALANCES (0-based)
var BALANCES_COLS = {
  ID: 0,
  AÑO: 1,
  MES: 2,
  CUENTA: 3,
  SALDO_INICIAL: 4,
  TOTAL_INGRESOS: 5,
  TOTAL_GASTOS: 6,
  SALDO_FINAL: 7,
  DEFICIT: 8,
  TRANSFER_NECESARIA: 9,
  NOTAS: 10
};
