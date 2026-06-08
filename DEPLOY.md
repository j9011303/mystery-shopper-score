# 秘密客評分系統部署說明

這個版本是：

- GitHub Pages：秘密客填分數介面
- Google Apps Script：接收送出資料
- Google Sheets：總部查看評分資料
- Google Drive：保存帳單與照片

## 1. 建立 Apps Script

1. 到 https://script.google.com/ 建立新專案。
2. 把 `apps-script/Code.gs` 的內容貼到 Apps Script 的 `Code.gs`。
3. 如果要加簡單送出 token，修改 `CONFIG.FORM_TOKEN`：

```js
FORM_TOKEN: 'change-this-token',
```

如果不想設 token，保持空字串即可。

## 2. 第一次設定 Google Sheet 與照片資料夾

1. 在 Apps Script 編輯器上方選擇函式 `setup`。
2. 點「執行」。
3. 第一次會要求授權，請用總部管理帳號授權。
4. 執行完後，到 Apps Script 的「執行記錄」查看：
   - Spreadsheet URL
   - Drive folder URL

系統會自動建立：

- `秘密客評分總表`
- `秘密客照片與帳單`

## 3. 部署 Web App

1. Apps Script 右上角點「部署」。
2. 選「新增部署作業」。
3. 類型選「網頁應用程式」。
4. 執行身分選「我」。
5. 存取權選「任何人」。
6. 部署後複製 Web App URL，格式會像：

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## 4. 設定前端

打開 `config.js`，填入 Apps Script URL：

```js
window.MYSTERY_SHOPPER_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  FORM_TOKEN: 'change-this-token',
};
```

如果 Apps Script 的 `CONFIG.FORM_TOKEN` 是空字串，這裡也保持空字串。

## 5. 上傳 GitHub Pages

把下列檔案放到 GitHub repo：

- `index.html`
- `styles.css`
- `script.js`
- `config.js`

GitHub Pages 啟用後，秘密客只需要打開 GitHub Pages 網址填寫即可。

## 重要限制

Google Apps Script Web App 不支援一般前端可讀取的 CORS 回應，所以前端會用 `no-cors` 送出。意思是：

- 資料會送到 Apps Script。
- 前端無法讀取 Apps Script 回傳的成功或錯誤內容。
- 是否成功要以 Google Sheets 是否新增資料為準。

若未來要做「送出後即時顯示報告編號」或「登入驗證」，建議升級到 Firebase 或 Supabase。
