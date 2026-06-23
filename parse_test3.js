const XLSX = require('xlsx');
const wb = XLSX.readFile('siasn_export.xlsx');
const ws1 = wb.Sheets['INFOJAB I'];
const rows = XLSX.utils.sheet_to_json(ws1, {header: 1, defval: ''});

console.log("Row 0:", rows[0]);
console.log("Row 1:", rows[1]);
console.log("Row 2:", rows[2]);
