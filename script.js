const PAGE_LOADED_AT = Date.now();

// 評分維度與權重（合計 100）
const scoreItems = [
  { key: "entry", title: "門口與候位體驗", hint: "主動招呼、訂位確認、候位時間說明是否清楚。", weight: 10 },
  { key: "uniform", title: "儀容與制服", hint: "制服一致、名牌、鞋子、頭髮、整潔度。", weight: 10 },
  { key: "menu", title: "點餐與介紹", hint: "鍋底差異、加點建議、優惠或活動說明。", weight: 10 },
  { key: "service", title: "桌邊服務", hint: "加湯、收空盤、回應速度、服務態度。", weight: 20 },
  { key: "food", title: "出餐品質與速度", hint: "鍋底正確、食材完整、溫度、出餐速度、漏單、擺盤。", weight: 20 },
  { key: "safety", title: "顧客可見衛生與安全", hint: "桌面、餐具、醬料區、廁所、地板、爐具提醒。", weight: 15 },
  { key: "checkout", title: "結帳與會員", hint: "帳單正確、發票、會員介紹、優惠核銷清楚。", weight: 10 },
  { key: "brand", title: "品牌一致性", hint: "服務節奏、話術、門市氛圍是否符合品牌感。", weight: 5 },
];

// 文字量表（不給秘密客看到數字，背後對應 0-100 的分數）
const RATING_SCALE = [
  { label: "很不滿意", points: 10 },
  { label: "不滿意", points: 40 },
  { label: "普通", points: 65 },
  { label: "滿意", points: 85 },
  { label: "很滿意", points: 100 },
];

function pointsForLabel(label) {
  const found = RATING_SCALE.find((s) => s.label === label);
  return found ? found.points : null;
}

const scoreItemsEl = document.getElementById("scoreItems");
const submittedDialog = document.getElementById("submittedDialog");
const submittedText = document.getElementById("submittedText");
const appConfig = window.MYSTERY_SHOPPER_CONFIG || {};

function setDefaultDate() {
  const dateInput = document.getElementById("visitDate");
  if (!dateInput.value) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    dateInput.max = `${yyyy}-${mm}-${dd}`;
  }
}

function renderScoreItems() {
  scoreItemsEl.innerHTML = scoreItems
    .map((item) => {
      const options = RATING_SCALE.map(
        (s) => `
          <label class="rate-option">
            <input type="radio" name="score-${item.key}" value="${s.label}" />
            <span>${s.label}</span>
          </label>`
      ).join("");

      const naOption = `
        <label class="rate-option na-option">
          <input type="radio" name="score-${item.key}" value="NA" />
          <span>未觀察</span>
        </label>`;

      return `
        <div class="score-item">
          <div class="score-copy">
            <strong>${item.title}</strong>
            <span>${item.hint}</span>
          </div>
          <div class="score-options" role="radiogroup" aria-label="${item.title}">
            ${options}
            ${naOption}
          </div>
        </div>`;
    })
    .join("");
}

function hasCriticalIssue() {
  return Array.from(document.querySelectorAll('input[name="critical"]')).some((input) => input.checked);
}

// 回傳該項目選擇：文字標籤、'NA'，或 null（未作答）
function getSelection(key) {
  const selected = document.querySelector(`input[name="score-${key}"]:checked`);
  return selected ? selected.value : null;
}

function answeredCount() {
  return scoreItems.filter((item) => getSelection(item.key) !== null).length;
}

// 背後計分（秘密客看不到）：只計入有評分（非未觀察）的項目並正規化成 0-100。
function computeScore() {
  let earned = 0;
  let applicableWeight = 0;

  scoreItems.forEach((item) => {
    const sel = getSelection(item.key);
    if (sel && sel !== "NA") {
      const pts = pointsForLabel(sel);
      if (pts !== null) {
        earned += (pts / 100) * item.weight;
        applicableWeight += item.weight;
      }
    }
  });

  const total = applicableWeight > 0 ? (earned / applicableWeight) * 100 : 0;
  const critical = hasCriticalIssue();

  let level;
  if (critical) level = "一票否決";
  else if (total >= 90) level = "優秀";
  else if (total >= 85) level = "合格";
  else if (total >= 80) level = "警戒";
  else level = "需改善";

  return { total, level, critical };
}

function bindPhotoPreview() {
  document.querySelectorAll("input[type='file'][data-preview]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      const output = document.getElementById(input.dataset.preview);
      output.innerHTML = "";
      if (!file) return;
      const image = document.createElement("img");
      image.alt = file.name;
      image.src = URL.createObjectURL(file);
      output.appendChild(image);
    });
  });
}

function getCheckedLabelText(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) =>
    input.parentElement.textContent.trim()
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function imageFileToUpload(file) {
  if (!file) return null;
  const originalDataUrl = await readFileAsDataUrl(file);

  if (!file.type.startsWith("image/")) {
    return { name: file.name, mimeType: file.type || "application/octet-stream", dataUrl: originalDataUrl, originalSize: file.size };
  }

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = originalDataUrl;
    });

    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    return { name: file.name.replace(/\.[^.]+$/, ".jpg"), mimeType: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.76), originalSize: file.size };
  } catch (error) {
    return { name: file.name, mimeType: file.type || "image/jpeg", dataUrl: originalDataUrl, originalSize: file.size };
  }
}

async function buildPayload(scoreResult) {
  const fileInput = (previewId) => document.querySelector(`input[data-preview="${previewId}"]`);
  const scorePayload = {};
  scoreItems.forEach((item) => {
    const sel = getSelection(item.key);
    const pts = sel && sel !== "NA" ? pointsForLabel(sel) : "";
    scorePayload[item.key] = {
      title: item.title,
      rawScore: sel === null ? "" : sel, // 文字標籤或 'NA'
      points: pts,
      weight: item.weight,
      weightedScore: typeof pts === "number" ? (pts / 100) * item.weight : "",
    };
  });

  return {
    token: appConfig.FORM_TOKEN || "",
    hp: document.getElementById("hpField").value,
    elapsedSeconds: Math.round((Date.now() - PAGE_LOADED_AT) / 1000),
    submittedAtClient: new Date().toISOString(),
    userAgent: navigator.userAgent,
    storeName: document.getElementById("storeName").value,
    visitDate: document.getElementById("visitDate").value,
    visitPeriod: document.getElementById("visitPeriod").value,
    guestCount: Number(document.getElementById("guestCount").value || 0),
    shopperCode: document.getElementById("shopperCode").value.trim(),
    billAmount: Number(document.getElementById("billAmount").value || 0),
    totalScore: Number(scoreResult.total.toFixed(1)),
    level: scoreResult.level,
    visibleSafety: getCheckedLabelText("visibleSafety"),
    criticalItems: getCheckedLabelText("critical"),
    scores: scorePayload,
    goodNotes: document.getElementById("goodNotes").value.trim(),
    badNotes: document.getElementById("badNotes").value.trim(),
    files: {
      meal: await imageFileToUpload(fileInput("mealPreview").files[0]),
      area: await imageFileToUpload(fileInput("areaPreview").files[0]),
      issue: await imageFileToUpload(fileInput("issuePreview").files[0]),
    },
  };
}

async function submitToAppsScript(payload) {
  const endpoint = (appConfig.APPS_SCRIPT_URL || "").trim();
  if (!endpoint) return { mode: "demo" };

  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  return { mode: "apps-script" };
}

function bindEvents() {
  document.getElementById("scoreForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (answeredCount() < scoreItems.length) {
      alert(`還有 ${scoreItems.length - answeredCount()} 個評分項目未作答，請全部選擇後再送出。`);
      return;
    }

    const scoreResult = computeScore();
    const store = document.getElementById("storeName").value;
    const critical = scoreResult.critical;
    const submitButton = event.submitter;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "送出中...";
    }

    try {
      const payload = await buildPayload(scoreResult);
      const result = await submitToAppsScript(payload);
      const targetText =
        result.mode === "apps-script"
          ? "感謝您的填寫，總部已收到這份評分。"
          : "目前尚未設定送出端點，這次是預覽。";

      submittedText.textContent = `${store} 的評分已送出。${
        critical ? "您勾選了需要立即注意的項目，總部會優先處理。" : ""
      }${targetText}`;

      if (typeof submittedDialog.showModal === "function") submittedDialog.showModal();
      else alert(submittedText.textContent);
    } catch (error) {
      alert(`送出失敗：${error.message || error}`);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "送出評分";
      }
    }
  });

  document.getElementById("closeDialog").addEventListener("click", () => {
    submittedDialog.close();
  });
}

renderScoreItems();
setDefaultDate();
bindPhotoPreview();
bindEvents();
