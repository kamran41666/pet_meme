import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "D:/workspace/pet_meme/outputs/01a01f1b-ccef-7783-b034-e17a696b4bd5/订单总表.xlsx";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 6000,
  tableMaxRows: 10,
  tableMaxCols: 24,
  tableMaxCellChars: 100,
});
console.log("SUMMARY");
console.log(summary.ndjson);

const register = await workbook.inspect({
  kind: "table",
  range: "订单总表!A1:X20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 24,
  tableMaxCellChars: 120,
});
console.log("REGISTER");
console.log(register.ndjson);

const formulas = await workbook.inspect({
  kind: "formula",
  sheetId: "订单总表",
  range: "A1:X207",
  maxChars: 5000,
  options: { maxResults: 50 },
});
console.log("FORMULAS");
console.log(formulas.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log("ERRORS");
console.log(errors.ndjson);
