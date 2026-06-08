const CONFIG = {
  SHEET_NAME: '秘密客評分',
  SPREADSHEET_TITLE: '秘密客評分總表',
  DRIVE_FOLDER_TITLE: '秘密客照片與帳單',
  FORM_TOKEN: '',
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

function doGet() {
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

  if (CONFIG.FORM_TOKEN && payload.token !== CONFIG.FORM_TOKEN) {
    throw new Error('Invalid form token.');
  }

  const requiredFields = ['storeName', 'visitDate', 'visitPeriod', 'shopperCode'];
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      throw new Error('Missing required field: ' + field);
    }
  });

  if (!payload.files || !payload.files.receipt || !payload.files.receipt.dataUrl) {
    throw new Error('Receipt photo is required.');
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
  if (!scoreObj || scoreObj.rawScore === undefined) {
    return '';
  }
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
