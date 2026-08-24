/* ---------- تبدیل تاریخ میلادی به شمسی (فقط برای نمایش) ---------- */
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function formatJalali(isoDate) {
  if (!isoDate) return "";
  const [gy, gm, gd] = isoDate.split("-").map(Number);
  const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
  return `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`;
}

function todayIso() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function formatAmount(n) {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("fa-IR") + " تومان";
}

/* ---------- ذخیره‌سازی محلی (IndexedDB) ---------- */
const DB_NAME = "invoice-archive-db";
const STORE = "invoices";
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ---------- حالت برنامه ---------- */
let state = {
  invoices: [],
  filter: "",
  editingId: null,
  photoBlob: null,
  photoRemoved: false,
};

const $ = (sel) => document.querySelector(sel);

const screens = {
  list: $("#screen-list"),
  form: $("#screen-form"),
  detail: $("#screen-detail"),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

/* ---------- رندر لیست ---------- */
async function refreshList() {
  state.invoices = await dbAll();
  renderList();
}

function renderList() {
  const container = $("#invoice-list");
  const q = state.filter.trim().toLowerCase();
  let items = state.invoices.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
  if (q) {
    items = items.filter(
      (i) => (i.title || "").toLowerCase().includes(q) || (i.note || "").toLowerCase().includes(q)
    );
  }

  container.innerHTML = "";
  $("#empty-state").classList.toggle("hidden", state.invoices.length > 0);

  for (const inv of items) {
    const card = document.createElement("div");
    card.className = "invoice-card";
    card.dataset.id = inv.id;

    let thumbHtml;
    if (inv.photo) {
      const url = URL.createObjectURL(inv.photo);
      thumbHtml = `<img class="thumb" src="${url}" alt="">`;
    } else {
      thumbHtml = `<div class="thumb placeholder">🧾</div>`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="info">
        <div class="title">${escapeHtml(inv.title || "بدون عنوان")}</div>
        <div class="meta">
          <span>${formatJalali(inv.date)}</span>
          ${inv.amount ? `<span>${formatAmount(inv.amount)}</span>` : ""}
        </div>
      </div>
    `;
    card.addEventListener("click", () => openDetail(inv.id));
    container.appendChild(card);
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/* ---------- فرم افزودن/ویرایش ---------- */
function openForm(editing) {
  state.editingId = editing ? editing.id : null;
  state.photoBlob = editing ? editing.photo || null : null;
  state.photoRemoved = false;

  $("#form-title").textContent = editing ? "ویرایش فاکتور" : "فاکتور جدید";
  $("#f-title").value = editing?.title || "";
  $("#f-amount").value = editing?.amount || "";
  $("#f-date").value = editing?.date || todayIso();
  $("#f-note").value = editing?.note || "";
  updateJalaliHint();
  updatePhotoPreview();

  showScreen("form");
}

function updateJalaliHint() {
  $("#f-date-jalali").textContent = formatJalali($("#f-date").value);
}

function updatePhotoPreview() {
  const img = $("#photo-preview");
  const placeholder = $("#photo-placeholder");
  const removeBtn = $("#btn-remove-photo");
  if (state.photoBlob && !state.photoRemoved) {
    img.src = URL.createObjectURL(state.photoBlob);
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
    removeBtn.classList.remove("hidden");
  } else {
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
    removeBtn.classList.add("hidden");
  }
}

async function saveForm() {
  const title = $("#f-title").value.trim();
  const amount = $("#f-amount").value ? Number($("#f-amount").value) : null;
  const date = $("#f-date").value || todayIso();
  const note = $("#f-note").value.trim();

  if (!title && !state.photoBlob) {
    toast("حداقل یک عنوان یا عکس وارد کنید");
    return;
  }

  const record = {
    title,
    amount,
    date,
    note,
    photo: state.photoRemoved ? null : state.photoBlob,
    updatedAt: Date.now(),
  };
  if (state.editingId) record.id = state.editingId;

  const id = await dbPut(record);
  await refreshList();
  toast("ذخیره شد");
  openDetail(state.editingId || id);
}

/* ---------- جزئیات ---------- */
let currentDetailId = null;

async function openDetail(id) {
  const inv = await dbGet(id);
  if (!inv) return;
  currentDetailId = id;

  const img = $("#detail-photo");
  if (inv.photo) {
    img.src = URL.createObjectURL(inv.photo);
    img.classList.remove("hidden");
  } else {
    img.classList.add("hidden");
  }
  $("#detail-title").textContent = inv.title || "بدون عنوان";
  $("#detail-amount").textContent = inv.amount ? formatAmount(inv.amount) : "";
  $("#detail-date").textContent = formatJalali(inv.date);
  $("#detail-note").textContent = inv.note || "";

  showScreen("detail");
}

async function deleteCurrentDetail() {
  if (!currentDetailId) return;
  if (!confirm("این فاکتور حذف بشه؟")) return;
  await dbDelete(currentDetailId);
  await refreshList();
  showScreen("list");
  toast("حذف شد");
}

async function shareCurrentDetail() {
  const inv = await dbGet(currentDetailId);
  if (!inv) return;
  const text = `${inv.title || "فاکتور"}\n${inv.amount ? formatAmount(inv.amount) + "\n" : ""}${formatJalali(inv.date)}${inv.note ? "\n" + inv.note : ""}`;

  try {
    if (inv.photo && navigator.canShare && navigator.canShare({ files: [new File([inv.photo], "invoice.jpg", { type: inv.photo.type || "image/jpeg" })] })) {
      const file = new File([inv.photo], "invoice.jpg", { type: inv.photo.type || "image/jpeg" });
      await navigator.share({ text, files: [file] });
    } else if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      toast("متن کپی شد");
    }
  } catch (e) {
    /* کاربر اشتراک‌گذاری رو لغو کرده */
  }
}

/* ---------- پشتیبان‌گیری / بازیابی ---------- */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function exportBackup() {
  const items = await dbAll();
  const payload = [];
  for (const inv of items) {
    payload.push({
      title: inv.title,
      amount: inv.amount,
      date: inv.date,
      note: inv.note,
      photo: inv.photo ? await blobToBase64(inv.photo) : null,
    });
  }
  const json = JSON.stringify({ app: "invoice-archive", version: 1, items: payload }, null, 2);
  const file = new File([json], `invoice-archive-backup-${todayIso()}.json`, { type: "application/json" });

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "پشتیبان آرشیو فاکتور" });
      return;
    }
  } catch (e) {
    /* کاربر لغو کرد یا اشتراک‌گذاری فایل پشتیبانی نشد؛ حالت جایگزین زیر اجرا می‌شود */
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function base64ToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*);base64/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function importBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    toast("فایل پشتیبان معتبر نیست");
    return;
  }
  const items = data.items || [];
  for (const it of items) {
    await dbPut({
      title: it.title,
      amount: it.amount,
      date: it.date,
      note: it.note,
      photo: it.photo ? base64ToBlob(it.photo) : null,
      updatedAt: Date.now(),
    });
  }
  await refreshList();
  toast(`${items.length} فاکتور بازیابی شد`);
}

/* ---------- رویدادها ---------- */
$("#btn-add").addEventListener("click", () => openForm(null));
$("#form-back").addEventListener("click", () => showScreen("list"));
$("#form-save").addEventListener("click", saveForm);

$("#f-date").addEventListener("change", updateJalaliHint);

$("#photo-placeholder").addEventListener("click", () => $("#photo-input").click());
$("#photo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.photoBlob = file;
  state.photoRemoved = false;
  updatePhotoPreview();
});
$("#btn-remove-photo").addEventListener("click", () => {
  state.photoRemoved = true;
  state.photoBlob = null;
  updatePhotoPreview();
});

$("#detail-back").addEventListener("click", () => showScreen("list"));
$("#btn-edit").addEventListener("click", async () => {
  const inv = await dbGet(currentDetailId);
  openForm(inv);
});
$("#btn-delete").addEventListener("click", deleteCurrentDetail);
$("#btn-share").addEventListener("click", shareCurrentDetail);

$("#search-input").addEventListener("input", (e) => {
  state.filter = e.target.value;
  renderList();
});

$("#btn-menu").addEventListener("click", () => $("#menu-overlay").classList.remove("hidden"));
$("#menu-cancel").addEventListener("click", () => $("#menu-overlay").classList.add("hidden"));
$("#menu-overlay").addEventListener("click", (e) => {
  if (e.target.id === "menu-overlay") $("#menu-overlay").classList.add("hidden");
});
$("#btn-export").addEventListener("click", async () => {
  $("#menu-overlay").classList.add("hidden");
  await exportBackup();
});
$("#import-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  $("#menu-overlay").classList.add("hidden");
  if (file) await importBackup(file);
  e.target.value = "";
});

/* ---------- شروع ---------- */
refreshList();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
