const CONFIG = {
  SHEET_NAME: '秘密客評分',
  SPREADSHEET_TITLE: '初殿鍋物秘密客評分總表',
  DRIVE_FOLDER_TITLE: '初殿鍋物秘密客照片與帳單',

  // 送出 token：前端 config.js 的 FORM_TOKEN 必須與這裡相同才會接受。
  // 注意：前端是公開靜態網頁，這個 token 任何人看原始碼都看得到，
  // 只能擋住「不看原始碼直接打 API」的最初階濫用，不是真正的密碼。
  FORM_TOKEN: '121d73331b0d92ced58f0414',

  // 總部後台金鑰：開後台時要在網址帶 ?action=admin&key=這串。請勿外流。
  ADMIN_KEY: '5b10d04de03b4711803f5c3cb59702a3',

  // 防機器人：表單從開啟到送出至少要這麼多秒，太快視為灌資料。
  MIN_FILL_SECONDS: 12,

  // 重複送出防護：同門市 + 同用餐日期 + 同秘密客代號 視為重複，拒收。
  BLOCK_DUPLICATE: true,
};

// 八大體驗評分維度（與前端一致）
const SCORE_DEFS = [
  { col: '門口與候位', title: '門口與候位體驗', weight: 10 },
  { col: '儀容與制服', title: '儀容與制服', weight: 10 },
  { col: '點餐與介紹', title: '點餐與介紹', weight: 10 },
  { col: '桌邊服務', title: '桌邊服務', weight: 20 },
  { col: '出餐品質', title: '出餐品質與速度', weight: 20 },
  { col: '顧客可見衛生與安全', title: '顧客可見衛生與安全', weight: 15 },
  { col: '結帳與會員', title: '結帳與會員', weight: 10 },
  { col: '品牌一致性', title: '品牌一致性', weight: 5 },
];

// 文字量表對應分數（後台明細顯示用）
const RATING_POINTS = { '很不滿意': 10, '不滿意': 40, '普通': 65, '滿意': 85, '很滿意': 100 };

// 服務 SOP 細項：欄位名 + payload key + 顯示文字
const SOP_DEFS = [
  { col: 'SOP1 Line/髮圈', key: 'sop1', label: '介紹詞有提到加 Line 好友；女生有給髮圈' },
  { col: 'SOP2 上湯可調味', key: 'sop2', label: '上湯時有說「太鹹或太淡都可以調整」' },
  { col: 'SOP3 加湯問鹹淡', key: 'sop3', label: '加湯時有詢問「會太鹹或太淡嗎」' },
  { col: 'SOP4 優惠說明', key: 'sop4', label: '老顧客／壽星優惠有說明：出示優惠券、證件、拍照打卡' },
  { col: 'SOP5 蛤蠣撈網', key: 'sop5', label: '上蛤蠣有給撈網＋說明「有沙或沒開可更換」' },
  { col: 'SOP6 白蝦濕紙巾', key: 'sop6', label: '上白蝦有給濕紙巾＋說明「剝完蝦可擦手」' },
  { col: 'SOP7 魚卷煮5分', key: 'sop7', label: '雪花魚卷有說明「需煮 5 分鐘以上才會熟」' },
  { col: 'SOP8 手機支架', key: 'sop8', label: '看到客人手機放桌上，主動提供手機支架' },
  { col: 'SOP9 湯頭兌換券', key: 'sop9', label: '結帳有詢問是否使用湯頭兌換券' },
  { col: 'SOP10 統編載具', key: 'sop10', label: '結帳有詢問統編／載具' },
  { col: 'SOP11 集點卡', key: 'sop11', label: '結帳有詢問集點卡' },
  { col: 'SOP12 芳香劑', key: 'sop12', label: '結帳有告知有芳香劑' },
];

const HEADERS = [
  '送出時間', '報告編號', '門市', '用餐日期', '時段', '人數', '秘密客代號', '帳單金額',
  '總分', '等級', '一票否決',
  '門口與候位', '儀容與制服', '點餐與介紹', '桌邊服務', '出餐品質', '顧客可見衛生與安全', '結帳與會員', '品牌一致性',
  '顧客可見衛生勾選', '一票否決項目', '優點備註', '改善備註',
  '帳單照片', '餐點照片', '桌面/醬料區照片', '異常佐證照片',
  '客戶端送出時間', 'User Agent',
  'SOP1 Line/髮圈', 'SOP2 上湯可調味', 'SOP3 加湯問鹹淡', 'SOP4 優惠說明', 'SOP5 蛤蠣撈網', 'SOP6 白蝦濕紙巾',
  'SOP7 魚卷煮5分', 'SOP8 手機支架', 'SOP9 湯頭兌換券', 'SOP10 統編載具', 'SOP11 集點卡', 'SOP12 芳香劑',
  '滿意度分數', 'SOP合格率(%)',
  '原始資料',
];

const COL = {};
HEADERS.forEach((name, idx) => { COL[name] = idx; });

function setup() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create(CONFIG.SPREADSHEET_TITLE);
    spreadsheetId = spreadsheet.getId();
    props.setProperty('SPREADSHEET_ID', spreadsheetId);
  }
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    const folder = DriveApp.createFolder(CONFIG.DRIVE_FOLDER_TITLE);
    folderId = folder.getId();
    props.setProperty('DRIVE_FOLDER_ID', folderId);
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getOrCreateSheet_(spreadsheet);
  ensureHeaders_(sheet);
  Logger.log('Spreadsheet URL: ' + spreadsheet.getUrl());
  Logger.log('Drive folder URL: ' + DriveApp.getFolderById(folderId).getUrl());
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'admin') {
    if (params.key !== CONFIG.ADMIN_KEY) return keyError_();
    return renderAdminDashboard_();
  }
  if (params.action === 'report') {
    if (params.key !== CONFIG.ADMIN_KEY) return keyError_();
    return renderReportDetail_(params.id);
  }
  return json_({
    ok: true,
    service: 'mystery-shopper-score-api',
    message: 'Use POST to submit mystery shopper reports.',
  });
}

function keyError_() {
  return HtmlService.createHtmlOutput('<h2 style="font-family:sans-serif;color:#b00">金鑰錯誤或未提供</h2>');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = parsePayload_(e);
    validatePayload_(payload);
    const spreadsheet = getSpreadsheet_();
    const sheet = getOrCreateSheet_(spreadsheet);
    ensureHeaders_(sheet);
    checkDuplicate_(sheet, payload);
    const folder = getUploadFolder_();
    const reportId = createReportId_(payload);
    const fileUrls = saveUploadedFiles_(folder, reportId, payload.files || {});
    const row = buildRow_(payload, reportId, fileUrls);
    sheet.appendRow(row);
    return json_({ ok: true, reportId, row: sheet.getLastRow(), spreadsheetUrl: spreadsheet.getUrl(), fileUrls });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  throw new Error('No payload received.');
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload must be an object.');
  if (payload.hp) throw new Error('Rejected.');
  const elapsed = Number(payload.elapsedSeconds || 0);
  if (CONFIG.MIN_FILL_SECONDS && elapsed > 0 && elapsed < CONFIG.MIN_FILL_SECONDS) throw new Error('Submitted too fast.');
  if (CONFIG.FORM_TOKEN && payload.token !== CONFIG.FORM_TOKEN) throw new Error('Invalid form token.');
  const requiredFields = ['storeName', 'visitDate', 'visitPeriod', 'shopperCode'];
  requiredFields.forEach((field) => { if (!payload[field]) throw new Error('Missing required field: ' + field); });
}

function checkDuplicate_(sheet, payload) {
  if (!CONFIG.BLOCK_DUPLICATE) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const store = String(payload.storeName || '').trim();
  const date = String(payload.visitDate || '').trim();
  const code = String(payload.shopperCode || '').trim();
  const dup = values.some((r) =>
    String(r[COL['門市']]).trim() === store &&
    String(r[COL['用餐日期']]).trim() === date &&
    String(r[COL['秘密客代號']]).trim() === code
  );
  if (dup) throw new Error('Duplicate report for same store/date/shopper.');
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) { setup(); spreadsheetId = props.getProperty('SPREADSHEET_ID'); }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getUploadFolder_() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) { setup(); folderId = props.getProperty('DRIVE_FOLDER_ID'); }
  return DriveApp.getFolderById(folderId);
}

function getOrCreateSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  const defaultSheet = spreadsheet.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getSheetId() !== sheet.getSheetId()) spreadsheet.deleteSheet(defaultSheet);
  return sheet;
}

// 永遠把第一列維持成最新 HEADERS（這樣新增欄位時舊試算表也會自動補上欄頭）。
function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const same = firstRow.length === HEADERS.length && HEADERS.every((h, i) => firstRow[i] === h);
  if (!same) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatSheet_(sheet);
  }
}

function formatSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#20252b').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
}

function createReportId_(payload) {
  const dateText = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  const randomText = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const storeText = sanitizeFileName_(payload.storeName || 'store').slice(0, 18);
  return 'MS-' + dateText + '-' + randomText + '-' + storeText;
}

function saveUploadedFiles_(folder, reportId, files) {
  return {
    receipt: saveOneFile_(folder, reportId, 'receipt', files.receipt),
    meal: saveOneFile_(folder, reportId, 'meal', files.meal),
    area: saveOneFile_(folder, reportId, 'area', files.area),
    issue: saveOneFile_(folder, reportId, 'issue', files.issue),
  };
}

function saveOneFile_(folder, reportId, label, filePayload) {
  if (!filePayload || !filePayload.dataUrl) return '';
  const parsed = parseDataUrl_(filePayload.dataUrl, filePayload.mimeType);
  const extension = extensionFromMime_(parsed.mimeType);
  const fileName = reportId + '-' + label + extension;
  const blob = Utilities.newBlob(parsed.bytes, parsed.mimeType, fileName);
  return folder.createFile(blob).getUrl();
}

function parseDataUrl_(dataUrl, fallbackMimeType) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error('Invalid file data URL.');
  const mimeType = match[1] || fallbackMimeType || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3] || '';
  const bytes = isBase64 ? Utilities.base64Decode(data) : Utilities.newBlob(decodeURIComponent(data)).getBytes();
  return { mimeType, bytes };
}

function extensionFromMime_(mimeType) {
  const map = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic' };
  return map[mimeType] || '';
}

function buildRow_(payload, reportId, fileUrls) {
  const scores = payload.scores || {};
  const sop = payload.sop || {};
  const criticalItems = payload.criticalItems || [];
  const visibleSafety = payload.visibleSafety || [];

  const row = [
    new Date(),
    reportId,
    payload.storeName || '',
    payload.visitDate || '',
    payload.visitPeriod || '',
    payload.guestCount || '',
    payload.shopperCode || '',
    payload.billAmount || '',
    payload.totalScore || '',
    payload.level || '',
    criticalItems.length ? '是' : '否',
    rawScore_(scores.entry),
    rawScore_(scores.uniform),
    rawScore_(scores.menu),
    rawScore_(scores.service),
    rawScore_(scores.food),
    rawScore_(scores.safety),
    rawScore_(scores.checkout),
    rawScore_(scores.brand),
    visibleSafety.join('\n'),
    criticalItems.join('\n'),
    payload.goodNotes || '',
    payload.badNotes || '',
    fileUrls.receipt || '',
    fileUrls.meal || '',
    fileUrls.area || '',
    fileUrls.issue || '',
    payload.submittedAtClient || '',
    payload.userAgent || '',
  ];
  // 12 個 SOP 值（依 SOP_DEFS 順序）
  SOP_DEFS.forEach((d) => { row.push(sop[d.key] || ''); });
  // 滿意度分數、SOP 合格率
  row.push(payload.satScore !== undefined ? payload.satScore : '');
  row.push(payload.sopScore !== undefined ? payload.sopScore : '');
  // 原始資料
  row.push(JSON.stringify(stripFiles_(payload)));
  return row;
}

function rawScore_(scoreObj) {
  if (!scoreObj || scoreObj.rawScore === undefined || scoreObj.rawScore === null) return '';
  return scoreObj.rawScore;
}

function stripFiles_(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  if (copy.files) {
    Object.keys(copy.files).forEach((key) => {
      if (copy.files[key] && copy.files[key].dataUrl) copy.files[key].dataUrl = '[saved-to-drive]';
    });
  }
  return copy;
}

function sanitizeFileName_(value) {
  return String(value).replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, '-');
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function selfUrl_() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

function sharedStyle_() {
  return '<style>' +
    ':root{color-scheme:light}' +
    'body{margin:0;font-family:"Noto Sans TC",system-ui,sans-serif;background:#fbf3ea;color:#3d2b21}' +
    '.wrap{max-width:1180px;margin:0 auto;padding:20px 16px 60px}' +
    '.dwrap{max-width:760px;margin:0 auto;padding:20px 16px 60px}' +
    'h1{font-size:20px;margin:0 0 4px}.sub{color:#93786a;font-size:13px;margin:0 0 18px}' +
    'a{color:#c2410c}' +
    '.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}' +
    '.card{background:#fff;border:1px solid #f0ddcb;border-radius:12px;padding:14px 18px;min-width:140px}' +
    '.card span{display:block;color:#93786a;font-size:12px}.card strong{font-size:24px}' +
    '.card.alert strong{color:#b3261e}' +
    'h2{font-size:15px;margin:22px 0 10px}' +
    'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #f0ddcb;border-radius:10px;overflow:hidden;font-size:13px}' +
    'th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #f3e7da;vertical-align:top}' +
    'th{background:#7c3a16;color:#fff;font-weight:600}' +
    '.num{text-align:right}.nowrap{white-space:nowrap}.muted{color:#bca893}' +
    '.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#f0e0d4}' +
    '.tag.good{background:#d7f3df;color:#1e7d46}.tag.warn{background:#ffe8bf;color:#9a6a00}' +
    '.tag.bad{background:#ffd9d4;color:#b3261e}.bad{color:#b3261e}' +
    '.scroll{overflow:auto;max-height:70vh;border-radius:10px}' +
    '.hdr{background:linear-gradient(135deg,#c2410c,#ea6a2b);color:#fff;border-radius:16px;padding:18px 20px;margin-bottom:16px}' +
    '.hdr h1{color:#fff}.hdr .sub{color:rgba(255,255,255,.9);margin:0}' +
    '.bigscore{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}' +
    '.bigscore .b{background:#fff;border:1px solid #f0ddcb;border-radius:12px;padding:12px 16px;min-width:110px}' +
    '.bigscore .b span{display:block;color:#93786a;font-size:12px}.bigscore .b strong{font-size:26px}' +
    '.sec{background:#fff;border:1px solid #f0ddcb;border-radius:12px;padding:14px 16px;margin-bottom:14px}' +
    '.sec h3{margin:0 0 10px;font-size:15px}' +
    '.kv{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:14px}' +
    '.kv div{min-width:120px}.kv b{color:#93786a;font-weight:600;font-size:12px;display:block}' +
    '.yes{color:#1e7d46;font-weight:700}.no{color:#b3261e;font-weight:700}' +
    '.li{padding:7px 0;border-bottom:1px solid #f3e7da;font-size:14px;display:flex;justify-content:space-between;gap:10px}' +
    '.li:last-child{border-bottom:none}' +
    '.pill{display:inline-block;min-width:38px;text-align:center;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:700}' +
    '.pill.y{background:#d7f3df;color:#1e7d46}.pill.n{background:#ffd9d4;color:#b3261e}' +
    '.back{display:inline-block;margin-bottom:14px;font-size:14px}' +
    '.photos a{display:inline-block;margin:0 10px 6px 0}' +
    '</style>';
}

function levelClass_(lv) {
  if (lv === '一票否決' || lv === '需改善') return 'bad';
  if (lv === '警戒') return 'warn';
  if (lv === '優秀' || lv === '合格') return 'good';
  return '';
}

/* ===== 總部後台儀表板 ===== */
function renderAdminDashboard_() {
  const sheet = getOrCreateSheet_(getSpreadsheet_());
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues() : [];
  rows.reverse();

  const base = selfUrl_();
  const byStore = {};
  rows.forEach((r) => {
    const store = String(r[COL['門市']] || '未填');
    if (!byStore[store]) byStore[store] = { count: 0, sum: 0, scored: 0, critical: 0 };
    byStore[store].count += 1;
    const score = Number(r[COL['總分']]);
    if (!isNaN(score) && r[COL['總分']] !== '') { byStore[store].sum += score; byStore[store].scored += 1; }
    if (String(r[COL['一票否決']]) === '是') byStore[store].critical += 1;
  });

  const totalReports = rows.length;
  const totalCritical = rows.filter((r) => String(r[COL['一票否決']]) === '是').length;
  const allScored = rows.map((r) => Number(r[COL['總分']])).filter((n) => !isNaN(n));
  const overallAvg = allScored.length ? (allScored.reduce((a, b) => a + b, 0) / allScored.length) : 0;

  let storeRows = '';
  Object.keys(byStore).sort().forEach((store) => {
    const s = byStore[store];
    const avg = s.scored ? (s.sum / s.scored) : 0;
    storeRows += '<tr><td>' + esc_(store) + '</td>' +
      '<td class="num">' + s.count + '</td>' +
      '<td class="num">' + (s.scored ? avg.toFixed(1) : '—') + '</td>' +
      '<td class="num ' + (s.critical ? 'bad' : '') + '">' + s.critical + '</td></tr>';
  });

  let dataRows = '';
  rows.forEach((r) => {
    const submitted = r[COL['送出時間']];
    const submittedText = submitted instanceof Date
      ? Utilities.formatDate(submitted, Session.getScriptTimeZone(), 'MM/dd HH:mm') : esc_(submitted);
    const lv = String(r[COL['等級']] || '');
    const id = String(r[COL['報告編號']] || '');
    const viewUrl = base + '?action=report&key=' + encodeURIComponent(CONFIG.ADMIN_KEY) + '&id=' + encodeURIComponent(id);
    dataRows += '<tr>' +
      '<td class="nowrap"><a href="' + esc_(viewUrl) + '" target="_top">查看</a></td>' +
      '<td class="nowrap">' + submittedText + '</td>' +
      '<td>' + esc_(r[COL['門市']]) + '</td>' +
      '<td class="nowrap">' + esc_(r[COL['用餐日期']]) + '</td>' +
      '<td>' + esc_(r[COL['時段']]) + '</td>' +
      '<td>' + esc_(r[COL['秘密客代號']]) + '</td>' +
      '<td class="num"><b>' + esc_(r[COL['總分']]) + '</b></td>' +
      '<td class="num">' + esc_(r[COL['滿意度分數']]) + '</td>' +
      '<td class="num">' + esc_(r[COL['SOP合格率(%)']]) + '</td>' +
      '<td><span class="tag ' + levelClass_(lv) + '">' + esc_(lv || '—') + '</span></td>' +
      '</tr>';
  });

  const html = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>初殿鍋物秘密客總部後台</title>' +
    sharedStyle_() + '</head><body><div class="wrap">' +
    '<h1>初殿鍋物秘密客 · 總部後台</h1>' +
    '<p class="sub">僅總部可見。資料即時來自 Google Sheet，共 ' + totalReports + ' 筆。點「查看」看單張報告明細（含分數）。</p>' +
    '<div class="cards">' +
    '<div class="card"><span>總報告數</span><strong>' + totalReports + '</strong></div>' +
    '<div class="card"><span>整體平均分</span><strong>' + (allScored.length ? overallAvg.toFixed(1) : '—') + '</strong></div>' +
    '<div class="card alert"><span>一票否決件數</span><strong>' + totalCritical + '</strong></div>' +
    '</div>' +
    '<h2>各門市表現</h2>' +
    '<table><thead><tr><th>門市</th><th class="num">報告數</th><th class="num">平均分</th><th class="num">一票否決</th></tr></thead><tbody>' +
    (storeRows || '<tr><td colspan="4" class="muted">尚無資料</td></tr>') + '</tbody></table>' +
    '<h2>最新報告</h2>' +
    '<div class="scroll"><table><thead><tr>' +
    '<th></th><th>送出</th><th>門市</th><th>用餐日</th><th>時段</th><th>代號</th><th class="num">總分</th><th class="num">滿意度</th><th class="num">SOP%</th><th>等級</th>' +
    '</tr></thead><tbody>' +
    (dataRows || '<tr><td colspan="10" class="muted">尚無資料</td></tr>') + '</tbody></table></div>' +
    '</div></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('初殿鍋物秘密客總部後台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ===== 單張報告明細（有分數版，仿填寫介面） ===== */
function renderReportDetail_(reportId) {
  const sheet = getOrCreateSheet_(getSpreadsheet_());
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues() : [];
  const r = rows.filter((x) => String(x[COL['報告編號']]) === String(reportId))[0];
  const base = selfUrl_();
  const backLink = '<a class="back" target="_top" href="' + esc_(base) + '?action=admin&key=' + encodeURIComponent(CONFIG.ADMIN_KEY) + '">← 回後台</a>';

  if (!r) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8">' + sharedStyle_() +
      '<div class="dwrap">' + backLink + '<p>找不到這張報告。</p></div>')
      .setTitle('報告明細');
  }

  const submitted = r[COL['送出時間']];
  const submittedText = submitted instanceof Date
    ? Utilities.formatDate(submitted, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') : esc_(submitted);
  const lv = String(r[COL['等級']] || '');

  // 體驗評分
  let scoreLis = '';
  SCORE_DEFS.forEach((d) => {
    const label = String(r[COL[d.col]] || '');
    const pts = RATING_POINTS[label];
    const ptsText = (pts === undefined || pts === null) ? (label || '—') : (label + '（' + pts + '/100）');
    scoreLis += '<div class="li"><span>' + esc_(d.title) + ' <span class="muted">·權重' + d.weight + '</span></span><span>' + esc_(ptsText) + '</span></div>';
  });

  // SOP 細項
  let sopLis = '';
  SOP_DEFS.forEach((d, i) => {
    const v = String(r[COL[d.col]] || '');
    const pill = v === '是' ? '<span class="pill y">是</span>' : (v === '否' ? '<span class="pill n">否</span>' : '<span class="muted">—</span>');
    sopLis += '<div class="li"><span>' + (i + 1) + '. ' + esc_(d.label) + '</span>' + pill + '</div>';
  });

  const visible = String(r[COL['顧客可見衛生勾選']] || '').split('\n').filter(Boolean);
  const criticals = String(r[COL['一票否決項目']] || '').split('\n').filter(Boolean);

  function photo(colName, text) {
    const u = r[COL[colName]];
    return u ? '<a href="' + esc_(u) + '" target="_blank" rel="noopener">' + text + '</a>' : '';
  }
  const photos = [photo('帳單照片', '帳單'), photo('餐點照片', '餐點'), photo('桌面/醬料區照片', '桌面/醬料'), photo('異常佐證照片', '異常')].filter(Boolean).join('');

  const html = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>報告明細 ' + esc_(reportId) + '</title>' +
    sharedStyle_() + '</head><body><div class="dwrap">' +
    backLink +
    '<div class="hdr"><h1>初殿鍋物 · 秘密客報告（總部檢視）</h1><p class="sub">' + esc_(r[COL['門市']]) + '　報告編號 ' + esc_(reportId) + '</p></div>' +

    '<div class="bigscore">' +
    '<div class="b"><span>總分</span><strong>' + esc_(r[COL['總分']]) + '</strong></div>' +
    '<div class="b"><span>等級</span><strong><span class="tag ' + levelClass_(lv) + '">' + esc_(lv || '—') + '</span></strong></div>' +
    '<div class="b"><span>滿意度分數</span><strong>' + esc_(r[COL['滿意度分數']]) + '</strong></div>' +
    '<div class="b"><span>SOP 合格率</span><strong>' + esc_(r[COL['SOP合格率(%)']]) + '%</strong></div>' +
    '</div>' +

    '<div class="sec"><h3>基本資料</h3><div class="kv">' +
    '<div><b>用餐日期</b>' + esc_(r[COL['用餐日期']]) + '</div>' +
    '<div><b>時段</b>' + esc_(r[COL['時段']]) + '</div>' +
    '<div><b>人數</b>' + esc_(r[COL['人數']]) + '</div>' +
    '<div><b>秘密客代號</b>' + esc_(r[COL['秘密客代號']]) + '</div>' +
    '<div><b>帳單金額</b>' + esc_(r[COL['帳單金額']]) + '</div>' +
    '<div><b>送出時間</b>' + submittedText + '</div>' +
    '<div><b>一票否決</b>' + (String(r[COL['一票否決']]) === '是' ? '<span class="no">是</span>' : '否') + '</div>' +
    '</div></div>' +

    '<div class="sec"><h3>體驗評分（滿意度）</h3>' + scoreLis + '</div>' +
    '<div class="sec"><h3>服務 SOP 細項</h3>' + sopLis + '</div>' +

    '<div class="sec"><h3>顧客可見衛生勾選</h3>' +
    (visible.length ? visible.map((x) => '<div class="li"><span>' + esc_(x) + '</span><span class="pill y">✓</span></div>').join('') : '<p class="muted">未勾選</p>') + '</div>' +

    (criticals.length ? '<div class="sec"><h3 class="bad">需立即注意 / 一票否決</h3>' +
      criticals.map((x) => '<div class="li"><span>' + esc_(x) + '</span><span class="pill n">!</span></div>').join('') + '</div>' : '') +

    '<div class="sec"><h3>文字備註</h3>' +
    '<p><b style="color:#93786a">印象深刻的優點</b><br>' + (esc_(r[COL['優點備註']]) || '<span class="muted">—</span>') + '</p>' +
    '<p><b style="color:#93786a">可以更好的地方</b><br>' + (esc_(r[COL['改善備註']]) || '<span class="muted">—</span>') + '</p></div>' +

    '<div class="sec"><h3>照片</h3><div class="photos">' + (photos || '<span class="muted">無</span>') + '</div></div>' +

    '</div></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('報告明細 ' + reportId)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
