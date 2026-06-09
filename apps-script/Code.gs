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

const HEADERS = [
  '送出時間',
  '報告編號',
  '門市',
  '用餐日期',
  '時段',
  '人數',
  '秘密客代號',
  '帳單金額',
  '總分',
  '等級',
  '一票否決',
  '門口與候位',
  '儀容與制服',
  '點餐與介紹',
  '桌邊服務',
  '出餐品質',
  '顧客可見衛生與安全',
  '結帳與會員',
  '品牌一致性',
  '顧客可見衛生勾選',
  '一票否決項目',
  '優點備註',
  '改善備註',
  '帳單照片',
  '餐點照片',
  '桌面/醬料區照片',
  '異常佐證照片',
  '客戶端送出時間',
  'User Agent',
  '原始資料',
];

// 各欄位在 HEADERS 中的索引（0 起算），給後台讀取用。
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

  // 總部後台：?action=admin&key=ADMIN_KEY
  if (params.action === 'admin') {
    if (params.key !== CONFIG.ADMIN_KEY) {
      return HtmlService.createHtmlOutput(
        '<h2 style="font-family:sans-serif;color:#b00">金鑰錯誤或未提供</h2>'
      );
    }
    return renderAdminDashboard_();
  }

  return json_({
    ok: true,
    service: 'mystery-shopper-score-api',
    message: 'Use POST to submit mystery shopper reports.',
  });
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
    formatSheet_(sheet);

    return json_({
      ok: true,
      reportId,
      row: sheet.getLastRow(),
      spreadsheetUrl: spreadsheet.getUrl(),
      fileUrls,
    });
  } catch (error) {
    return json_({
      ok: false,
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // Lock may not have been acquired if waitLock failed.
    }
  }
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }

  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  throw new Error('No payload received.');
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object.');
  }

  // 1) Honeypot：人類看不到的隱藏欄位，被填了一定是機器人。
  if (payload.hp) {
    throw new Error('Rejected.');
  }

  // 2) 填寫時間太短，視為自動灌資料。
  const elapsed = Number(payload.elapsedSeconds || 0);
  if (CONFIG.MIN_FILL_SECONDS && elapsed > 0 && elapsed < CONFIG.MIN_FILL_SECONDS) {
    throw new Error('Submitted too fast.');
  }

  // 3) 送出 token。
  if (CONFIG.FORM_TOKEN && payload.token !== CONFIG.FORM_TOKEN) {
    throw new Error('Invalid form token.');
  }

  const requiredFields = ['storeName', 'visitDate', 'visitPeriod', 'shopperCode'];
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      throw new Error('Missing required field: ' + field);
    }
  });
}

// 重複送出防護：同門市 + 同用餐日期 + 同秘密客代號。
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

  if (dup) {
    throw new Error('Duplicate report for same store/date/shopper.');
  }
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    setup();
    spreadsheetId = props.getProperty('SPREADSHEET_ID');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getUploadFolder_() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    setup();
    folderId = props.getProperty('DRIVE_FOLDER_ID');
  }
  return DriveApp.getFolderById(folderId);
}

function getOrCreateSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  const defaultSheet = spreadsheet.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getSheetId() !== sheet.getSheetId()) {
    spreadsheet.deleteSheet(defaultSheet);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeaders = firstRow.every((value) => value === '');

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatSheet_(sheet);
  }
}

function formatSheet_(sheet) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#20252b')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true);
  sheet.autoResizeColumns(1, HEADERS.length);
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
  if (!filePayload || !filePayload.dataUrl) {
    return '';
  }

  const parsed = parseDataUrl_(filePayload.dataUrl, filePayload.mimeType);
  const extension = extensionFromMime_(parsed.mimeType);
  const fileName = reportId + '-' + label + extension;
  const blob = Utilities.newBlob(parsed.bytes, parsed.mimeType, fileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function parseDataUrl_(dataUrl, fallbackMimeType) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) {
    throw new Error('Invalid file data URL.');
  }

  const mimeType = match[1] || fallbackMimeType || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3] || '';
  const bytes = isBase64
    ? Utilities.base64Decode(data)
    : Utilities.newBlob(decodeURIComponent(data)).getBytes();

  return { mimeType, bytes };
}

function extensionFromMime_(mimeType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
  };
  return map[mimeType] || '';
}

function buildRow_(payload, reportId, fileUrls) {
  const scores = payload.scores || {};
  const criticalItems = payload.criticalItems || [];
  const visibleSafety = payload.visibleSafety || [];

  return [
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
    JSON.stringify(stripFiles_(payload)),
  ];
}

function rawScore_(scoreObj) {
  if (!scoreObj || scoreObj.rawScore === undefined || scoreObj.rawScore === null) {
    return '';
  }
  // N/A 在前端會送 'NA'，原樣寫入。
  return scoreObj.rawScore;
}

function stripFiles_(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  if (copy.files) {
    Object.keys(copy.files).forEach((key) => {
      if (copy.files[key] && copy.files[key].dataUrl) {
        copy.files[key].dataUrl = '[saved-to-drive]';
      }
    });
  }
  return copy;
}

function sanitizeFileName_(value) {
  return String(value).replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, '-');
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
 *  總部後台儀表板（HtmlService，秘密客看不到）
 *  網址：<Web App URL>?action=admin&key=<ADMIN_KEY>
 * ========================================================= */
function renderAdminDashboard_() {
  const sheet = getOrCreateSheet_(getSpreadsheet_());
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
    : [];

  // 由新到舊
  rows.reverse();

  // 各門市統計
  const byStore = {};
  rows.forEach((r) => {
    const store = String(r[COL['門市']] || '未填');
    if (!byStore[store]) byStore[store] = { count: 0, sum: 0, scored: 0, critical: 0 };
    byStore[store].count += 1;
    const score = Number(r[COL['總分']]);
    if (!isNaN(score) && r[COL['總分']] !== '') { byStore[store].sum += score; byStore[store].scored += 1; }
    if (String(r[COL['一票否決']]) === '是') byStore[store].critical += 1;
  });

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const link = (url, text) => url
    ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + text + '</a>'
    : '<span class="muted">—</span>';

  const levelClass = (lv) => {
    if (lv === '一票否決' || lv === '需改善') return 'bad';
    if (lv === '警戒') return 'warn';
    if (lv === '優秀' || lv === '合格') return 'good';
    return '';
  };

  // 統計卡片
  const totalReports = rows.length;
  const totalCritical = rows.filter((r) => String(r[COL['一票否決']]) === '是').length;
  const allScored = rows.map((r) => Number(r[COL['總分']])).filter((n) => !isNaN(n));
  const overallAvg = allScored.length ? (allScored.reduce((a, b) => a + b, 0) / allScored.length) : 0;

  let storeRows = '';
  Object.keys(byStore).sort().forEach((store) => {
    const s = byStore[store];
    const avg = s.scored ? (s.sum / s.scored) : 0;
    storeRows +=
      '<tr>' +
      '<td>' + esc(store) + '</td>' +
      '<td class="num">' + s.count + '</td>' +
      '<td class="num">' + (s.scored ? avg.toFixed(1) : '—') + '</td>' +
      '<td class="num ' + (s.critical ? 'bad' : '') + '">' + s.critical + '</td>' +
      '</tr>';
  });

  let dataRows = '';
  rows.forEach((r) => {
    const submitted = r[COL['送出時間']];
    const submittedText = submitted instanceof Date
      ? Utilities.formatDate(submitted, Session.getScriptTimeZone(), 'MM/dd HH:mm')
      : esc(submitted);
    const lv = String(r[COL['等級']] || '');
    dataRows +=
      '<tr>' +
      '<td class="nowrap">' + submittedText + '</td>' +
      '<td>' + esc(r[COL['門市']]) + '</td>' +
      '<td class="nowrap">' + esc(r[COL['用餐日期']]) + '</td>' +
      '<td>' + esc(r[COL['時段']]) + '</td>' +
      '<td>' + esc(r[COL['秘密客代號']]) + '</td>' +
      '<td class="num">' + esc(r[COL['帳單金額']]) + '</td>' +
      '<td class="num"><b>' + esc(r[COL['總分']]) + '</b></td>' +
      '<td><span class="tag ' + levelClass(lv) + '">' + esc(lv || '—') + '</span></td>' +
      '<td>' + link(r[COL['帳單照片']], '帳單') + '</td>' +
      '<td>' + link(r[COL['異常佐證照片']], '異常') + '</td>' +
      '<td class="memo">' + esc(r[COL['改善備註']]) + '</td>' +
      '</tr>';
  });

  const html =
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>初殿鍋物秘密客總部後台</title><style>' +
    ':root{color-scheme:light}' +
    'body{margin:0;font-family:"Noto Sans TC",system-ui,sans-serif;background:#f4f5f7;color:#1d2329}' +
    '.wrap{max-width:1180px;margin:0 auto;padding:24px 18px 60px}' +
    'h1{font-size:20px;margin:0 0 4px}.sub{color:#6b7480;font-size:13px;margin:0 0 20px}' +
    '.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px}' +
    '.card{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:14px 18px;min-width:150px}' +
    '.card span{display:block;color:#6b7480;font-size:12px}.card strong{font-size:26px}' +
    '.card.alert strong{color:#c0392b}' +
    'h2{font-size:15px;margin:24px 0 10px}' +
    'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e6ea;border-radius:10px;overflow:hidden;font-size:13px}' +
    'th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #eef0f2;vertical-align:top}' +
    'th{background:#20252b;color:#fff;font-weight:600;position:sticky;top:0}' +
    '.num{text-align:right}.nowrap{white-space:nowrap}.muted{color:#aab0b8}' +
    '.memo{max-width:260px;color:#444}' +
    '.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#eef0f2}' +
    '.tag.good{background:#d7f3df;color:#1e7d46}.tag.warn{background:#ffe8bf;color:#9a6a00}' +
    '.tag.bad{background:#ffd9d4;color:#b3261e}.bad{color:#c0392b}' +
    'a{color:#2563eb}.scroll{overflow:auto;max-height:70vh;border-radius:10px}' +
    '</style></head><body><div class="wrap">' +
    '<h1>初殿鍋物秘密客 · 總部後台</h1>' +
    '<p class="sub">僅總部可見。資料即時來自 Google Sheet，共 ' + totalReports + ' 筆。</p>' +
    '<div class="cards">' +
    '<div class="card"><span>總報告數</span><strong>' + totalReports + '</strong></div>' +
    '<div class="card"><span>整體平均分</span><strong>' + (allScored.length ? overallAvg.toFixed(1) : '—') + '</strong></div>' +
    '<div class="card alert"><span>一票否決件數</span><strong>' + totalCritical + '</strong></div>' +
    '</div>' +
    '<h2>各門市表現</h2>' +
    '<table><thead><tr><th>門市</th><th class="num">報告數</th><th class="num">平均分</th><th class="num">一票否決</th></tr></thead><tbody>' +
    (storeRows || '<tr><td colspan="4" class="muted">尚無資料</td></tr>') +
    '</tbody></table>' +
    '<h2>最新報告</h2>' +
    '<div class="scroll"><table><thead><tr>' +
    '<th>送出</th><th>門市</th><th>用餐日</th><th>時段</th><th>代號</th><th class="num">帳單</th><th class="num">總分</th><th>等級</th><th>帳單照</th><th>異常照</th><th>改善備註</th>' +
    '</tr></thead><tbody>' +
    (dataRows || '<tr><td colspan="11" class="muted">尚無資料</td></tr>') +
    '</tbody></table></div>' +
    '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('初殿鍋物秘密客總部後台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
