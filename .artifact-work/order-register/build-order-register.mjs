import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "outputs", "01a01f1b-ccef-7783-b034-e17a696b4bd5");
const previewDir = path.join(projectRoot, ".artifact-work", "order-register", "previews");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();
const register = workbook.worksheets.add("订单总表");
const statusSheet = workbook.worksheets.add("状态配置");
const intakeSheet = workbook.worksheets.add("客户需求字段");
const guideSheet = workbook.worksheets.add("使用说明");

const navy = "#17324D";
const blue = "#2F6690";
const paleBlue = "#EAF3F8";
const paleGreen = "#E8F5EE";
const paleAmber = "#FFF4D6";
const paleRed = "#FDECEC";
const gray = "#64748B";
const lightBorder = "#D7E1E8";

register.showGridLines = false;
register.getRange("A1:X1").merge();
register.getRange("A1").values = [["宠物表情包订单总表"]];
register.getRange("A1:X1").format = {
  fill: navy,
  font: { bold: true, color: "#FFFFFF", size: 18 },
  verticalAlignment: "center",
  horizontalAlignment: "left",
};
register.getRange("A1:X1").format.rowHeight = 34;

register.getRange("A2:J2").values = [["总订单", null, "进行中", null, "已完成", null, "已逾期", null, "累计实收", null]];
register.getRange("A3:J3").values = [[null, null, null, null, null, null, null, null, null, null]];
register.getRange("B3").formulas = [["=COUNTIF($A$8:$A$207,\"<>\")"]];
register.getRange("D3").formulas = [["=COUNTIFS($A$8:$A$207,\"<>\",$O$8:$O$207,\"<>已完成\",$O$8:$O$207,\"<>已取消\")"]];
register.getRange("F3").formulas = [["=COUNTIF($O$8:$O$207,\"已完成\")"]];
register.getRange("H3").formulas = [["=COUNTIF($X$8:$X$207,\"已逾期\")"]];
register.getRange("J3").formulas = [["=SUMIFS($E$8:$E$207,$F$8:$F$207,\"已支付\")"]];

for (const col of ["A", "C", "E", "G", "I"]) {
  register.getRange(`${col}2:${col}3`).format = {
    fill: paleBlue,
    font: { bold: true, color: navy },
    borders: { preset: "outside", style: "thin", color: lightBorder },
  };
}
for (const col of ["B", "D", "F", "H", "J"]) {
  register.getRange(`${col}2:${col}3`).format = {
    fill: "#FFFFFF",
    font: { bold: true, color: blue },
    borders: { preset: "outside", style: "thin", color: lightBorder },
    horizontalAlignment: "center",
  };
}
register.getRange("J3").format.numberFormat = "¥#,##0.00";
register.getRange("A5:X5").merge();
register.getRange("A5").values = [["使用规则：每个订单一行；照片与成品只填受控路径，不嵌入工作簿。黄色字段需要人工持续更新。"]];
register.getRange("A5:X5").format = { fill: paleAmber, font: { color: "#7C5A00" }, wrapText: true };

const headers = [
  "订单编号", "下单时间", "客户昵称", "联系方式", "支付金额", "支付状态", "宠物名字", "宠物类型",
  "照片位置", "资料检查", "必须保留特征", "禁止元素", "案例授权", "照片权利确认", "当前状态", "交付截止时间",
  "试作状态", "质检分数", "客户确认", "交付位置", "原图删除日期", "售后情况", "备注", "时效检查"
];
register.getRange("A7:X7").values = [headers];
register.getRange("A7:X7").format = {
  fill: blue,
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "inside", style: "thin", color: "#B8CDD9" },
};
register.getRange("A7:X7").format.rowHeight = 32;

register.getRange("A8:W8").values = [[null, null, null, null, null, "待付款", null, null, null, "待检查", null, null, "否", "否", "待提交资料", null, "未开始", null, "未确认", null, null, "无", null]];
register.getRange("X8").formulas = [["=IF(OR(A8=\"\",P8=\"\",O8=\"已完成\",O8=\"已取消\"),\"\",IF(P8<NOW(),\"已逾期\",\"正常\"))"]];
const table = register.tables.add("A7:X8", true, "OrderRegisterTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

register.getRange("A8:X207").format.verticalAlignment = "center";
register.getRange("B8:B207").format.numberFormat = "yyyy-mm-dd hh:mm";
register.getRange("E8:E207").format.numberFormat = "¥#,##0.00";
register.getRange("P8:P207").format.numberFormat = "yyyy-mm-dd hh:mm";
register.getRange("R8:R207").format.numberFormat = "0";
register.getRange("U8:U207").format.numberFormat = "yyyy-mm-dd";
register.getRange("K8:L207").format.wrapText = true;
register.getRange("W8:W207").format.wrapText = true;

register.getRange("F8:F207").dataValidation = { rule: { type: "list", values: ["待付款", "已支付", "部分退款", "已退款"] } };
register.getRange("H8:H207").dataValidation = { rule: { type: "list", values: ["cat", "dog"] } };
register.getRange("J8:J207").dataValidation = { rule: { type: "list", values: ["待检查", "合格", "待补图"] } };
register.getRange("M8:N207").dataValidation = { rule: { type: "list", values: ["是", "否"] } };
register.getRange("O8:O207").dataValidation = { rule: { type: "list", values: ["待付款", "待提交资料", "待补充照片", "待制作身份卡", "身份卡待确认", "试作中", "试作待确认", "批量生成中", "质检中", "待客户确认", "待交付", "已交付", "售后处理中", "已完成", "已取消"] } };
register.getRange("Q8:Q207").dataValidation = { rule: { type: "list", values: ["未开始", "生成中", "待确认", "通过", "需返工"] } };
register.getRange("S8:S207").dataValidation = { rule: { type: "list", values: ["未确认", "已确认", "需修改"] } };
register.getRange("V8:V207").dataValidation = { rule: { type: "list", values: ["无", "处理中", "已解决", "已退款"] } };

register.getRange("O8:O207").conditionalFormats.add("containsText", { text: "已完成", format: { fill: paleGreen, font: { color: "#166534", bold: true } } });
register.getRange("O8:O207").conditionalFormats.add("containsText", { text: "待补充照片", format: { fill: paleAmber, font: { color: "#92400E" } } });
register.getRange("O8:O207").conditionalFormats.add("containsText", { text: "售后处理中", format: { fill: paleRed, font: { color: "#991B1B" } } });
register.getRange("X8:X207").conditionalFormats.add("containsText", { text: "已逾期", format: { fill: paleRed, font: { color: "#991B1B", bold: true } } });

const widths = {
  A: 18, B: 19, C: 14, D: 18, E: 11, F: 12, G: 12, H: 10, I: 28, J: 12, K: 28, L: 22,
  M: 11, N: 13, O: 15, P: 19, Q: 13, R: 11, S: 13, T: 28, U: 15, V: 13, W: 28, X: 12
};
for (const [column, width] of Object.entries(widths)) register.getRange(`${column}:${column}`).format.columnWidth = width;
register.freezePanes.freezeRows(7);
register.freezePanes.freezeColumns(2);

const statuses = [
  ["状态", "含义", "下一步"],
  ["待付款", "客户尚未完成付款", "确认付款后发送需求表"],
  ["待提交资料", "已付款但照片或需求未提交", "催交需求表和照片"],
  ["待补充照片", "照片数量或角度不合格", "发送具体补图清单"],
  ["待制作身份卡", "资料齐全，可提取特征", "运行 Skill 生成身份卡"],
  ["身份卡待确认", "身份卡已生成", "人工确认稳定特征"],
  ["试作中", "正在制作开心和委屈", "等待两张试作完成"],
  ["试作待确认", "试作已完成", "检查身份一致性和结构"],
  ["批量生成中", "试作通过，生成剩余八张", "完成无字图"],
  ["质检中", "进行排版和质量检查", "修复关键失败"],
  ["待客户确认", "预览已发送", "收集一次集中反馈"],
  ["待交付", "客户已确认", "打包最终文件"],
  ["已交付", "最终文件已发出", "等待售后期限结束"],
  ["售后处理中", "客户提出有效问题", "记录并解决"],
  ["已完成", "订单闭环", "按计划删除原图"],
  ["已取消", "订单停止", "记录退款和原因"]
];
statusSheet.showGridLines = false;
statusSheet.getRange("A1:C1").merge();
statusSheet.getRange("A1").values = [["订单状态标准"]];
statusSheet.getRange("A1:C1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 16 } };
statusSheet.getRange(`A3:C${statuses.length + 2}`).values = statuses;
statusSheet.getRange("A3:C3").format = { fill: blue, font: { bold: true, color: "#FFFFFF" } };
statusSheet.getRange(`A4:C${statuses.length + 2}`).format = { borders: { preset: "inside", style: "thin", color: lightBorder }, verticalAlignment: "center" };
statusSheet.getRange(`B4:C${statuses.length + 2}`).format.wrapText = true;
statusSheet.getRange("A:A").format.columnWidth = 18;
statusSheet.getRange("B:B").format.columnWidth = 36;
statusSheet.getRange("C:C").format.columnWidth = 36;
statusSheet.freezePanes.freezeRows(3);

const intakeRows = [
  ["字段", "必填", "填写要求", "示例", "保存位置"],
  ["订单编号", "是", "由运营生成，不含真实姓名", "PS-20260820-001", "总表、order.json"],
  ["客户昵称", "是", "用于联系，不作为文件夹名", "小红书昵称", "仅总表"],
  ["联系方式", "是", "使用完成订单所需的最少信息", "用户号", "仅总表"],
  ["宠物名字", "是", "用于预览和交付", "团子", "总表、order.json"],
  ["宠物类型", "是", "仅 cat 或 dog", "cat", "总表、order.json"],
  ["参考照片", "是", "5–8 张，至少 2 正脸、1 侧脸、1 全身", "受控文件夹路径", "订单 input/"],
  ["必须保留特征", "是", "仅记录可见且稳定的识别特征", "左眼上方浅色斑", "总表、order.json"],
  ["禁止元素", "否", "客户不希望出现的服饰、道具等", "不要帽子", "总表、order.json"],
  ["照片权利确认", "是", "必须确认后才能生产", "是", "总表、order.json"],
  ["案例授权", "是", "与订单处理授权分开，默认否", "否", "总表、order.json"],
  ["其他备注", "否", "不改变 19.9 元套餐边界", "保留项圈", "总表、customer-request.md"]
];
intakeSheet.showGridLines = false;
intakeSheet.getRange("A1:E1").merge();
intakeSheet.getRange("A1").values = [["客户需求字段说明"]];
intakeSheet.getRange("A1:E1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 16 } };
intakeSheet.getRange(`A3:E${intakeRows.length + 2}`).values = intakeRows;
intakeSheet.getRange("A3:E3").format = { fill: blue, font: { bold: true, color: "#FFFFFF" } };
intakeSheet.getRange(`A4:E${intakeRows.length + 2}`).format = { borders: { preset: "inside", style: "thin", color: lightBorder }, wrapText: true, verticalAlignment: "center" };
for (const [col, width] of Object.entries({ A: 18, B: 10, C: 44, D: 28, E: 26 })) intakeSheet.getRange(`${col}:${col}`).format.columnWidth = width;
intakeSheet.freezePanes.freezeRows(3);

const guideRows = [
  ["步骤", "操作", "完成标志"],
  [1, "客户付款后发送客户需求表", "收到照片、需求和授权选择"],
  [2, "运行 order-system/scripts/new-order.ps1", "orders 下出现独立订单目录"],
  [3, "把照片放入订单 input 文件夹并更新 order.json", "照片路径与实际文件一致"],
  [4, "在订单总表新增一行", "状态为待制作身份卡或待补充照片"],
  [5, "调用 $pet-sticker-studio", "身份卡、试作、成品和 QA 文件形成"],
  [6, "每完成一个节点更新当前状态", "总表与 status-log.md 一致"],
  [7, "客户确认后交付并记录删除日期", "状态变为已交付或已完成"]
];
guideSheet.showGridLines = false;
guideSheet.getRange("A1:C1").merge();
guideSheet.getRange("A1").values = [["订单体系使用说明"]];
guideSheet.getRange("A1:C1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 16 } };
guideSheet.getRange(`A3:C${guideRows.length + 2}`).values = guideRows;
guideSheet.getRange("A3:C3").format = { fill: blue, font: { bold: true, color: "#FFFFFF" } };
guideSheet.getRange(`A4:C${guideRows.length + 2}`).format = { borders: { preset: "inside", style: "thin", color: lightBorder }, wrapText: true, verticalAlignment: "center" };
guideSheet.getRange("A:A").format.columnWidth = 10;
guideSheet.getRange("B:B").format.columnWidth = 54;
guideSheet.getRange("C:C").format.columnWidth = 42;
guideSheet.getRange("A12:C12").merge();
guideSheet.getRange("A12").values = [["原则：总表只保存路径，不嵌入客户原图；每单独立文件夹；案例授权默认关闭；删除资料前核对售后状态。"]];
guideSheet.getRange("A12:C12").format = { fill: paleAmber, font: { color: "#7C5A00" }, wrapText: true };

const inspect = await workbook.inspect({ kind: "table", range: "订单总表!A1:X10", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 24 });
console.log(inspect.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

for (const sheetName of ["订单总表", "状态配置", "客户需求字段", "使用说明"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "订单总表.xlsx"));
console.log(path.join(outputDir, "订单总表.xlsx"));
