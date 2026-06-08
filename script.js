const scoreItems = [
  {
    key: "entry",
    title: "門口與候位體驗",
    hint: "主動招呼、訂位確認、候位時間說明是否清楚。",
    weight: 10,
  },
  {
    key: "uniform",
    title: "儀容與制服",
    hint: "制服一致、名牌、鞋子、頭髮、整潔度。",
    weight: 10,
  },
  {
    key: "menu",
    title: "點餐與介紹",
    hint: "鍋底差異、加點建議、優惠或活動說明。",
    weight: 10,
  },
  {
    key: "service",
    title: "桌邊服務",
    hint: "加湯、收空盤、回應速度、服務態度。",
    weight: 20,
  },
  {
    key: "food",
    title: "出餐品質",
    hint: "鍋底正確、食材完整、溫度、漏單、擺盤。",
    weight: 20,
  },
  {
    key: "safety",
    title: "顧客可見衛生與安全",
    hint: "桌面、餐具、醬料區、廁所、地板、爐具提醒。",
    weight: 15,
  },
  {
    key: "checkout",
    title: "結帳與會員",
    hint: "帳單正確、發票、會員介紹、優惠核銷清楚。",
    weight: 10,
  },
  {
    key: "brand",
    title: "品牌一致性",
    hint: "服務節奏、話術、門市氛圍是否符合品牌感。",
    weight: 5,
  },
];

const scoreItemsEl = document.getElementById("scoreItems");
const totalScoreEl = document.getElementById("totalScore");
const scoreLevelEl = document.getElementById("scoreLevel");
const submitSummaryEl = document.getElementById("submitSummary");
const submittedDialog = document.getElementById("submittedDialog");
const submittedText = document.getElementById("submittedText");
const appConfig = window.MYSTERY_SHOPPER_CONFIG || {};

function setDefaultDate() {
  const dateInput = document.getElementById("visitDate");
  if (!dateInput.value) {
    dateInput.value = "2026-06-08";
  }
}

function renderScoreItems() {
  scoreItemsEl.innerHTML = scoreItems
    .map((item) => {
      const options = [0, 1, 2, 3, 4, 5]
        .map(
          (score) => `
            <label>
              <input type="radio" name="score-${item.key}" value="${score}" ${score === 4 ? "checked" : ""} />
              <span>${score}</span>
            </label>
          `
        )
        .join("");

      return `
        <div class="score-item">
          <div class="score-copy">
            <strong>${item.title}</strong>
            <span>${item.hint}</span>
            <em>權重 ${item.weight} 分</em>
          </div>
          <div class="score-options" aria-label="${item.title}">
            ${options}
          </div>
        </div>
      `;
    })
    .join("");
}

function hasCriticalIssue() {
  return Array.from(document.querySelectorAll('input[name="critical"]')).some((input) => input.checked);
}

function calculateScore() {
  const total = scoreItems.reduce((sum, item) => {
    const selected = document.querySelector(`input[name="score-${item.key}"]:checked`);
    const value = selected ? Number(selected.value) : 0;
    return sum + (value / 5) * item.weight;
  }, 0);

  const critical = hasCriticalIssue();
  totalScoreEl.textContent = total.toFixed(1);

  if (critical) {
    scoreLevelEl.textContent = "一票否決";
    scoreLevelEl.style.color = "#ffd5d0";
  } else if (total >= 90) {
    scoreLevelEl.textContent = "優秀";
    scoreLevelEl.style.color = "#d7f3df";
  } else if (total >= 85) {
    scoreLevelEl.textContent = "合格";
    scoreLevelEl.style.color = "#d7f3df";
  } else if (total >= 80) {
    scoreLevelEl.textContent = "警戒";
    scoreLevelEl.style.color = "#ffe1a5";
  } else {
    scoreLevelEl.textContent = "需改善";
    scoreLevelEl.style.color = "#ffd5d0";
  }

  submitSummaryEl.textContent = `總分 ${total.toFixed(1)}｜${critical ? "有一票否決" : "未勾一票否決"}`;
  return total;
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

function getSelectedScore(key) {
  const selected = document.querySelector(`input[name="score-${key}"]:checked`);
  return selected ? Number(selected.value) : 0;
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
    return {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      dataUrl: originalDataUrl,
      originalSize: file.size,
    };
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
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    return {
      name: file.name.replace(/\.[^.]+$/, ".jpg"),
      mimeType: "image/jpeg",
      dataUrl: canvas.toDataURL("image/jpeg", 0.76),
      originalSize: file.size,
    };
  } catch (error) {
    return {
      name: file.name,
      mimeType: file.type || "image/jpeg",
      dataUrl: originalDataUrl,
      originalSize: file.size,
    };
  }
}

async function buildPayload(score) {
  const fileInput = (previewId) => document.querySelector(`input[data-preview="${previewId}"]`);
  const scorePayload = {};
  scoreItems.forEach((item) => {
    scorePayload[item.key] = {
      title: item.title,
      rawScore: getSelectedScore(item.key),
      weight: item.weight,
      weightedScore: (getSelectedScore(item.key) / 5) * item.weight,
    };
  });

  return {
    token: appConfig.FORM_TOKEN || "",
    submittedAtClient: new Date().toISOString(),
    userAgent: navigator.userAgent,
    storeName: document.getElementById("storeName").value,
    visitDate: document.getElementById("visitDate").value,
    visitPeriod: document.getElementById("visitPeriod").value,
    guestCount: Number(document.getElementById("guestCount").value || 0),
    shopperCode: document.getElementById("shopperCode").value.trim(),
    billAmount: Number(document.getElementById("billAmount").value || 0),
    totalScore: score,
    level: scoreLevelEl.textContent,
    visibleSafety: getCheckedLabelText("visibleSafety"),
    criticalItems: getCheckedLabelText("critical"),
    scores: scorePayload,
    goodNotes: document.getElementById("goodNotes").value.trim(),
    badNotes: document.getElementById("badNotes").value.trim(),
    files: {
      receipt: await imageFileToUpload(fileInput("receiptPreview").files[0]),
      meal: await imageFileToUpload(fileInput("mealPreview").files[0]),
      area: await imageFileToUpload(fileInput("areaPreview").files[0]),
      issue: await imageFileToUpload(fileInput("issuePreview").files[0]),
    },
  };
}

async function submitToAppsScript(payload) {
  const endpoint = (appConfig.APPS_SCRIPT_URL || "").trim();
  if (!endpoint) {
    return { mode: "demo" };
  }

  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  return { mode: "apps-script" };
}

function bindEvents() {
  document.addEventListener("change", (event) => {
    if (event.target.name && event.target.name.startsWith("score-")) {
      calculateScore();
    }

    if (event.target.name === "critical") {
      calculateScore();
    }
  });

  document.getElementById("scoreForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const score = calculateScore();
    const store = document.getElementById("storeName").value;
    const amount = Number(document.getElementById("billAmount").value || 0);
    const critical = hasCriticalIssue();
    const submitButton = event.submitter;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "送出中...";
    }

    try {
      const payload = await buildPayload(score);
      const result = await submitToAppsScript(payload);
      const targetText =
        result.mode === "apps-script"
          ? "資料已送至 Apps Script。由於 Google Apps Script 跨網域限制，前端無法讀取回傳結果，請以總部 Google Sheet 為準。"
          : "目前尚未設定 Apps Script URL，這次是原型送出預覽。";

      submittedText.textContent = `${store} 本次評分 ${score.toFixed(1)} 分，帳單金額 $${amount.toLocaleString("zh-TW")}。${
        critical ? "此報告含一票否決項目，總部將優先複查。" : "總部將審核帳單與照片後進行消費核銷。"
      }${targetText}`;

      if (typeof submittedDialog.showModal === "function") {
        submittedDialog.showModal();
      } else {
        alert(submittedText.textContent);
      }
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
calculateScore();
