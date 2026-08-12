// ===================== حالت کلی برنامه =====================
const state = {
  user: null,
  token: null,
  captchaId: null,
  items: [],
  categories: [],
  parties: [],
  saleCart: [],
  purchaseCart: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

// ===================== تبدیل تاریخ میلادی به شمسی (بدون کتابخانه خارجی) =====================
const _FA_DIGITS = { '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴', '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹' };
function toFaDigits(str) { return String(str).replace(/[0-9]/g, d => _FA_DIGITS[d]); }

const _J_DAYS_IN_MONTH = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

function gregorianToJalali(gy, gm, gd) {
  const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const gy2 = gy - 1600, gm2 = gm - 1, gd2 = gd - 1;
  let gDayNo = 365 * gy2 + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400);
  for (let i = 0; i < gm2; i++) gDayNo += gDaysInMonth[i];
  if (gm2 > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) gDayNo += 1;
  gDayNo += gd2;

  let jDayNo = gDayNo - 79;
  const jNp = Math.floor(jDayNo / 12053);
  jDayNo %= 12053;
  let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
  jDayNo %= 1461;
  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365);
    jDayNo = (jDayNo - 1) % 365;
  }
  let jm = 12, jd = 29;
  let remaining = jDayNo;
  let found = false;
  for (let i = 0; i < 11; i++) {
    if (remaining < _J_DAYS_IN_MONTH[i]) { jm = i + 1; jd = remaining + 1; found = true; break; }
    remaining -= _J_DAYS_IN_MONTH[i];
  }
  if (!found) { jm = 12; jd = remaining + 1; }
  return [jy, jm, jd];
}

function toJalaliDate(dateTimeStr, withTime = false) {
  if (!dateTimeStr) return '';
  try {
    const [datePart, timePart] = dateTimeStr.split(' ');
    const [gy, gm, gd] = datePart.split('-').map(Number);
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    let result = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    if (withTime && timePart) result += ` - ${timePart.slice(0, 5)}`;
    return toFaDigits(result);
  } catch (e) {
    return dateTimeStr;
  }
}
function todayJalaliStr() {
  const now = new Date();
  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}
function toJalaliMonthLabel(yyyyMm) {
  // ورودی مثل "2026-07" (فرمت ماه میلادی از دیتابیس) -> برچسب شمسی کوتاه برای نمودار/جدول
  try {
    const [gy, gm] = yyyyMm.split('-').map(Number);
    const [jy, jm] = gregorianToJalali(gy, gm, 15); // روز ۱۵ برای تشخیص ماه شمسی غالب در آن بازه کافی است
    return toFaDigits(`${jy}/${String(jm).padStart(2, '0')}`);
  } catch (e) {
    return yyyyMm;
  }
}

// ===================== تبدیل عدد به حروف فارسی (برای پیش‌نمایش زنده مبالغ) =====================
const _ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const _TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const _TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const _HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const _SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];

function threeDigitsToWords(n) {
  const parts = [];
  const hundred = Math.floor(n / 100), remainder = n % 100;
  if (hundred) parts.push(_HUNDREDS[hundred]);
  if (remainder) {
    if (remainder < 10) parts.push(_ONES[remainder]);
    else if (remainder < 20) parts.push(_TEENS[remainder - 10]);
    else {
      const tensDigit = Math.floor(remainder / 10), onesDigit = remainder % 10;
      parts.push(_TENS[tensDigit] + (onesDigit ? (' و ' + _ONES[onesDigit]) : ''));
    }
  }
  return parts.join(' و ');
}

function numberToPersianWords(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'صفر';
  const negative = n < 0;
  n = Math.abs(n);
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    let words = threeDigitsToWords(g);
    if (i > 0) words += ' ' + _SCALES[i];
    parts.push(words);
  }
  const result = parts.join(' و ');
  return negative ? ('منفی ' + result) : result;
}

function wordsTitle(n) {
  n = Number(n) || 0;
  return n ? `به حروف: ${numberToPersianWords(n)} تومان` : '';
}

// ===================== کامپوننت جستجوی تایپی (به‌جای select ساده) =====================
// containerId: یک <div> خالی که این کامپوننت داخلش رندر می‌شود
// options: آرایه‌ای از {value, label}
// روی state[stateKey] مقدار انتخاب‌شده (value) نگه‌داری می‌شود
function createSearchableSelect(containerId, options, { placeholder = 'جستجو...', onSelect, allowEmpty = true, emptyLabel = '— هیچ‌کدام —' } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const selectedValueHolder = { value: '' };

  container.innerHTML = `
    <div class="ss-wrap" style="position:relative">
      <input type="text" class="ss-input" placeholder="${placeholder}" autocomplete="off">
      <div class="ss-dropdown hidden"></div>
    </div>`;
  const input = container.querySelector('.ss-input');
  const dropdown = container.querySelector('.ss-dropdown');

  function renderList(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    let list = options;
    if (q) list = options.filter(o => o.label.toLowerCase().includes(q));
    list = list.slice(0, 60);
    let html = '';
    if (allowEmpty && !q) html += `<div class="ss-item" data-value="">${emptyLabel}</div>`;
    html += list.map(o => `<div class="ss-item" data-value="${o.value}">${o.label}</div>`).join('');
    dropdown.innerHTML = html || '<div class="ss-item muted">موردی پیدا نشد</div>';
    dropdown.classList.remove('hidden');
  }

  input.addEventListener('focus', () => renderList(input.value === selectedLabel() ? '' : input.value));
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 150));

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.ss-item');
    if (!item || item.dataset.value === undefined) return;
    const val = item.dataset.value;
    selectedValueHolder.value = val;
    const found = options.find(o => String(o.value) === String(val));
    input.value = found ? found.label : '';
    dropdown.classList.add('hidden');
    if (onSelect) onSelect(val, found);
  });

  function selectedLabel() {
    const found = options.find(o => String(o.value) === String(selectedValueHolder.value));
    return found ? found.label : '';
  }

  return {
    getValue: () => selectedValueHolder.value,
    setValue: (val) => {
      selectedValueHolder.value = val;
      const found = options.find(o => String(o.value) === String(val));
      input.value = found ? found.label : '';
    },
    updateOptions: (newOptions) => { options = newOptions; },
  };
}

// نمایش زنده «مبلغ به حروف» زیر یک فیلد ورودی مبلغ
function attachWordsPreview(input, wordsElId) {
  if (!input) return;
  const wordsEl = document.getElementById(wordsElId);
  if (!wordsEl) return;
  const update = () => {
    const num = parseFloat((input.value || '').replace(/,/g, '')) || 0;
    wordsEl.textContent = num ? `به حروف: ${numberToPersianWords(num)} تومان` : '';
  };
  input.addEventListener('input', update);
  input.addEventListener('blur', update);
  update();
}

// فرمت‌بندی سه‌رقم‌سه‌رقم مبالغ داخل فیلدهای ورودی، هنگام تایپ خوانا بمونه
function attachThousandsFormatting(input) {
  if (!input) return;
  input.addEventListener('focus', () => {
    input.value = input.value.replace(/,/g, '');
  });
  input.addEventListener('blur', () => {
    const num = parseFloat(input.value.replace(/,/g, ''));
    input.value = isNaN(num) ? '' : num.toLocaleString('en-US');
  });
}
function readAmount(input) {
  return parseFloat((input.value || '').replace(/,/g, '')) || 0;
}

// ===================== ارتباط با API =====================
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(path, opts);
    if (res.status === 401) {
      // نشست منقضی شده یا اصلاً واردنشده — برگشت به صفحه ورود
      forceLogout('نشست شما منقضی شده، دوباره وارد شوید');
      return null;
    }
    if (!res.ok && res.status !== 400 && res.status !== 404 && res.status !== 403 && res.status !== 429) {
      throw new Error('server error ' + res.status);
    }
    return await res.json();
  } catch (e) {
    console.error(e);
    toast('ارتباط با سرور برقرار نشد', 'danger');
    return null;
  }
}

function forceLogout(message) {
  state.user = null;
  state.token = null;
  $('#app').classList.add('hidden');
  $('#force-password-screen').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
  $('#login-error').textContent = message || '';
}

// دانلود/باز کردن فایل‌هایی که نیاز به لاگین دارند (PDF، اکسل، صفحه چاپ فاکتور).
// window.open ساده یا <a href> کار نمی‌کند چون هدر Authorization را همراه ندارند؛
// اینجا با fetch احراز هویت‌شده، فایل را می‌گیریم و به‌صورت Blob محلی نمایش/دانلود می‌دهیم.
async function fetchAuthedBlob(path) {
  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  try {
    const res = await fetch(path, { headers });
    if (res.status === 401) { forceLogout('نشست شما منقضی شده، دوباره وارد شوید'); return null; }
    if (!res.ok) { toast('خطا در دریافت فایل', 'danger'); return null; }
    return await res.blob();
  } catch (e) {
    console.error(e);
    toast('ارتباط با سرور برقرار نشد', 'danger');
    return null;
  }
}

async function openAuthedInNewTab(path, mimeType) {
  const blob = await fetchAuthedBlob(path);
  if (!blob) return;
  const typedBlob = mimeType ? new Blob([blob], { type: mimeType }) : blob;
  const url = URL.createObjectURL(typedBlob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function downloadAuthed(path, filename) {
  const blob = await fetchAuthedBlob(path);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ===================== نوتیفیکیشن ساده =====================
function toast(msg, type = 'primary') {
  let el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:var(--${type === 'danger' ? 'danger' : type === 'success' ? 'accent' : 'primary'});
    color:#fff;padding:10px 20px;border-radius:8px;z-index:999;box-shadow:var(--shadow-md);font-size:13px;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===================== جشن کوچک لحظه فروش موفق =====================
function celebrateSuccess() {
  const colors = ['#1B9C6B', '#14375E', '#F59E0B', '#2FBE83', '#4C8FC9'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:998;overflow:hidden;';
  document.body.appendChild(container);

  for (let i = 0; i < 26; i++) {
    const piece = document.createElement('div');
    const size = 6 + Math.random() * 6;
    const startX = 45 + Math.random() * 10; // از نزدیکی وسط بالا شروع می‌شن
    const drift = (Math.random() - 0.5) * 40;
    const duration = 1100 + Math.random() * 700;
    const delay = Math.random() * 150;
    piece.style.cssText = `
      position:absolute; top:-20px; left:${startX}vw; width:${size}px; height:${size}px;
      background:${colors[i % colors.length]}; border-radius:${Math.random() > 0.5 ? '50%' : '3px'};
      opacity:0.95; transform:rotate(${Math.random() * 360}deg);
      animation: confettiFall ${duration}ms ease-in ${delay}ms forwards;
      --drift: ${drift}vw;
    `;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 2200);
}

// ===================== مودال عمومی =====================
function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() {
  $('#modal-overlay').classList.add('hidden');
}
$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ===================== ورود =====================
$('#login-btn').addEventListener('click', doLogin);
$('#login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#login-captcha-answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('#login-captcha-refresh').addEventListener('click', refreshCaptcha);

// نمایش نام و لوگوی مغازه (در صورت تنظیم‌شدن) روی پنل صفحه ورود
(async function loadLoginBranding() {
  try {
    const res = await fetch('/settings/shop');
    const s = await res.json();
    if (s && s.name) {
      $('#login-panel-name').textContent = s.name;
      document.title = s.name;
    }
    if (s && s.logo_url) {
      $('#login-panel-logo').src = s.logo_url;
      $('#login-panel-logo').classList.remove('hidden');
    }
  } catch (e) { /* اگر سرور آماده نبود، از نام پیش‌فرض استفاده می‌شود */ }
})();

async function refreshCaptcha() {
  $('#login-captcha-question').textContent = '...';
  $('#login-captcha-answer').value = '';
  const res = await api('GET', '/captcha');
  if (res) {
    state.captchaId = res.captcha_id;
    $('#login-captcha-question').textContent = res.question;
  }
}
refreshCaptcha();

async function doLogin() {
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  const captcha_answer = $('#login-captcha-answer').value.trim();
  const res = await api('POST', '/login', { username, password, captcha_id: state.captchaId, captcha_answer });
  if (res && res.ok) {
    state.user = res.user;
    state.token = res.token;
    $('#login-screen').classList.add('hidden');
    if (state.user.must_change_password) {
      $('#fp-new-password').value = '';
      $('#fp-confirm-password').value = '';
      $('#fp-error').textContent = '';
      $('#force-password-screen').classList.remove('hidden');
      return;
    }
    enterApp();
  } else {
    $('#login-error').textContent = (res && res.message) || 'ورود ناموفق بود';
    refreshCaptcha(); // هر کد امنیتی فقط یک‌بار مصرفه، پس چه موفق چه ناموفق باید تازه بشه
  }
}

function enterApp() {
  $('#app').classList.remove('hidden');
  $('#user-name').textContent = state.user.username;
  $('#user-role').textContent = state.user.role === 'admin' ? 'مدیر' : 'کارمند';
  if (state.user.role !== 'admin') $$('.admin-only').forEach(el => el.style.display = 'none');
  initApp();
}

$('#fp-submit-btn').addEventListener('click', async () => {
  const p1 = $('#fp-new-password').value;
  const p2 = $('#fp-confirm-password').value;
  if (!p1 || p1.length < 4) { $('#fp-error').textContent = 'رمز عبور باید حداقل ۴ کاراکتر باشد'; return; }
  if (p1 !== p2) { $('#fp-error').textContent = 'رمز عبور و تکرار آن یکسان نیستند'; return; }
  const res = await api('POST', '/users/me/password', { new_password: p1 });
  if (res && res.ok) {
    state.user.must_change_password = false;
    $('#force-password-screen').classList.add('hidden');
    toast('رمز عبور با موفقیت تغییر کرد', 'success');
    enterApp();
  } else if (res) {
    $('#fp-error').textContent = res.message || 'خطا در تغییر رمز عبور';
  }
});
$('#fp-confirm-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#fp-submit-btn').click(); });

$('#btn-change-own-password').addEventListener('click', () => {
  openModal(`
    <h3>تغییر رمز عبور من</h3>
    <div class="field"><label>رمز عبور جدید</label><input type="password" id="own-pw-new"></div>
    <div class="field"><label>تکرار رمز عبور جدید</label><input type="password" id="own-pw-confirm"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">انصراف</button>
      <button class="btn btn-primary" id="own-pw-save-btn">ذخیره</button>
    </div>`);
  $('#own-pw-save-btn').addEventListener('click', async () => {
    const p1 = $('#own-pw-new').value;
    const p2 = $('#own-pw-confirm').value;
    if (!p1 || p1.length < 4) { toast('رمز عبور باید حداقل ۴ کاراکتر باشد', 'danger'); return; }
    if (p1 !== p2) { toast('رمز عبور و تکرار آن یکسان نیستند', 'danger'); return; }
    const res = await api('POST', '/users/me/password', { new_password: p1 });
    if (res && res.ok) {
      toast('رمز عبور با موفقیت تغییر کرد', 'success');
      closeModal();
    } else if (res) {
      toast(res.message || 'خطا در تغییر رمز عبور', 'danger');
    }
  });
});

$('#logout-btn').addEventListener('click', () => {
  api('POST', '/logout');
  forceLogout();
});

// ===================== ناوبری =====================
$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    $$('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-' + item.dataset.page).classList.add('active');
    $('#sidebar').classList.remove('open');
    loadPage(item.dataset.page);
  });
});

function navigateToPage(page) {
  $$('.nav-item').forEach(i => i.classList.remove('active'));
  const navItem = $$('.nav-item').find(i => i.dataset.page === page);
  if (navItem) navItem.classList.add('active');
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-' + page).classList.add('active');
  $('#sidebar').classList.remove('open');
  loadPage(page);
}

function loadPage(page) {
  const loaders = {
    dashboard: loadDashboard, items: loadItems, sale: () => loadInvoiceForm('sale'),
    purchase: () => loadInvoiceForm('purchase'), history: loadHistory, parties: loadParties,
    checks: loadChecks, cash: loadCash, bank: loadBankPage, monthly: loadMonthly, 'extra-reports': loadExtraReports,
    'settings-hub': loadSettingsHub,
    'ai-scan': loadAiScanPage, 'bulk-price': loadBulkPricePage, 'quick-sale': loadQuickSalePage,
    'send-invoice': loadSendInvoicePage,
  };
  if (loaders[page]) loaders[page]();
}

// ===================== حالت تاریک/روشن =====================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}
$('#theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});
applyTheme(localStorage.getItem('theme') || 'light');

// ===================== بزرگ/کوچک کردن اندازه نوشته‌ها =====================
const ZOOM_MIN = 0.8, ZOOM_MAX = 1.5, ZOOM_STEP = 0.1;
function applyZoom(z) {
  z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  document.documentElement.style.zoom = z;
  localStorage.setItem('uiZoom', z);
}
$('#zoom-in-btn').addEventListener('click', () => {
  applyZoom((parseFloat(localStorage.getItem('uiZoom')) || 1) + ZOOM_STEP);
});
$('#zoom-out-btn').addEventListener('click', () => {
  applyZoom((parseFloat(localStorage.getItem('uiZoom')) || 1) - ZOOM_STEP);
});
applyZoom(parseFloat(localStorage.getItem('uiZoom')) || 1);

// ===================== ساعت و تاریخ زنده =====================
const _WEEKDAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
function updateLiveClock() {
  const now = new Date();
  const gy = now.getFullYear(), gm = now.getMonth() + 1, gd = now.getDate();
  const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
  const weekday = _WEEKDAY_NAMES[now.getDay()];
  const dateEl = $('#live-clock-date');
  if (dateEl) dateEl.textContent = toFaDigits(`${weekday} ${jd} ${_PERSIAN_MONTH_NAMES_FULL[jm - 1]} ${jy}`);
  const timeEl = $('#live-clock-time');
  if (timeEl) {
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = toFaDigits(`${h}:${m}:${s}`);
  }
}
const _PERSIAN_MONTH_NAMES_FULL = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
setInterval(updateLiveClock, 1000);
updateLiveClock();

// ===================== جستجوی سریع =====================
$('#global-search').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  const activePage = $('.page.active');
  if (!activePage) return;
  const rows = $$('tbody tr', activePage);
  rows.forEach(row => {
    row.style.display = !q || row.textContent.includes(q) ? '' : 'none';
  });
});

// ===================== نمودار میله‌ای ساده (بدون کتابخانه خارجی) =====================
function drawBarChart(canvas, labels, values, opts = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = canvas.height || 90;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!values.length) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-2');
    ctx.font = '13px Vazirmatn, Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText('داده‌ای برای نمایش وجود ندارد', cssWidth / 2, cssHeight / 2);
    return;
  }

  const padding = { top: 10, bottom: 26, left: 10, right: 10 };
  const chartW = cssWidth - padding.left - padding.right;
  const chartH = cssHeight - padding.top - padding.bottom;
  const maxAbs = Math.max(1, ...values.map(v => Math.abs(v)));
  const zeroY = padding.top + chartH / 2;
  const barW = Math.min(46, (chartW / values.length) * 0.6);
  const gap = chartW / values.length;

  const styles = getComputedStyle(document.documentElement);
  const posColor = styles.getPropertyValue('--accent').trim();
  const negColor = styles.getPropertyValue('--danger').trim();
  const textColor = styles.getPropertyValue('--text-2').trim();

  values.forEach((v, i) => {
    const x = padding.left + gap * i + (gap - barW) / 2;
    const h = (Math.abs(v) / maxAbs) * (chartH / 2 - 4);
    ctx.fillStyle = v >= 0 ? posColor : negColor;
    if (v >= 0) {
      ctx.fillRect(x, zeroY - h, barW, h);
    } else {
      ctx.fillRect(x, zeroY, barW, h);
    }
    ctx.fillStyle = textColor;
    ctx.font = '11px Vazirmatn, Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW / 2, cssHeight - 8);
  });

  ctx.strokeStyle = styles.getPropertyValue('--border').trim();
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(cssWidth - padding.right, zeroY);
  ctx.stroke();
}

// ===================== داشبورد =====================
// ===================== نمودار دونات (بدون کتابخانه خارجی) =====================
function drawDonutChart(canvas, values, colors) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = canvas.height || 170;
  canvas.width = cssWidth * dpr; canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px'; canvas.style.height = cssHeight + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const styles = getComputedStyle(document.documentElement);
  const total = values.reduce((a, b) => a + b, 0);
  const cx = cssWidth / 2, cy = cssHeight / 2, rOuter = Math.min(cssWidth, cssHeight) / 2 - 8, rInner = rOuter * 0.62;

  if (total <= 0) {
    ctx.fillStyle = styles.getPropertyValue('--text-2');
    ctx.font = '13px Vazirmatn, Tahoma'; ctx.textAlign = 'center';
    ctx.fillText('داده‌ای موجود نیست', cx, cy);
    return;
  }
  let startAngle = -Math.PI / 2;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const angle = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOuter, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    startAngle += angle;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fillStyle = styles.getPropertyValue('--surface');
  ctx.fill();
  ctx.fillStyle = styles.getPropertyValue('--text');
  ctx.font = 'bold 14px Vazirmatn, Tahoma';
  ctx.textAlign = 'center';
  ctx.fillText(fmt(total), cx, cy + 5);
}

// ===================== نمودار خطی چندسری (بدون کتابخانه خارجی) =====================
function drawLineChart(canvas, labels, series) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth;
  const cssHeight = canvas.height || 90;
  canvas.width = cssWidth * dpr; canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px'; canvas.style.height = cssHeight + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const styles = getComputedStyle(document.documentElement);

  const allValues = series.flatMap(s => s.values);
  if (!allValues.length || !labels.length) {
    ctx.fillStyle = styles.getPropertyValue('--text-2');
    ctx.font = '13px Vazirmatn, Tahoma'; ctx.textAlign = 'center';
    ctx.fillText('داده‌ای برای نمایش وجود ندارد', cssWidth / 2, cssHeight / 2);
    return;
  }
  const maxV = Math.max(1, ...allValues);
  const minV = Math.min(0, ...allValues);
  const padding = { top: 12, bottom: 26, left: 14, right: 14 };
  const chartW = cssWidth - padding.left - padding.right;
  const chartH = cssHeight - padding.top - padding.bottom;
  const n = labels.length;
  const xStep = n > 1 ? chartW / (n - 1) : 0;
  const yFor = (v) => padding.top + chartH - ((v - minV) / ((maxV - minV) || 1)) * chartH;

  series.forEach(s => {
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = padding.left + i * xStep, y = yFor(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    s.values.forEach((v, i) => {
      const x = padding.left + i * xStep, y = yFor(v);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
    });
  });

  ctx.fillStyle = styles.getPropertyValue('--text-2');
  ctx.font = '10.5px Vazirmatn, Tahoma'; ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    if (n > 8 && i % 2 !== 0) return; // جلوگیری از تراکم برچسب‌ها وقتی ماه زیاده
    ctx.fillText(l, padding.left + i * xStep, cssHeight - 8);
  });
}

// ===================== انیمیشن شمارش اعداد کارت‌های KPI =====================
function animateKpiCounters() {
  document.querySelectorAll('.kpi-value[data-count-target]').forEach(el => {
    const target = parseFloat(el.dataset.countTarget) || 0;
    const suffix = el.dataset.countSuffix || '';
    const duration = 800;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = fmt(Math.round(target * eased)) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

const ICONS = {
  sales: '<svg viewBox="0 0 24 24"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>',
  profit: '<svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  cash: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
  debt: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  inventory: '<svg viewBox="0 0 24 24"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M3 8h18"/></svg>',
  customers: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  invoices: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
  checks: '<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22M7 15h.01M11 15h4"/></svg>',
};

async function loadDashboard() {
  const isAdmin = state.user.role === 'admin';
  const today = new Date().toISOString().slice(0, 10);

  const [data, cash, items, invoices, customers, checks, monthly, stockRanking, topItems, debtors] = await Promise.all([
    api('GET', `/reports/summary?role=${state.user.role}`),
    api('GET', '/cash'),
    api('GET', `/items?role=${state.user.role}`),
    api('GET', '/invoices'),
    api('GET', '/parties?type=customer'),
    api('GET', '/checks'),
    api('GET', `/reports/monthly?role=${state.user.role}`),
    api('GET', '/reports/stock-ranking'),
    api('GET', '/reports/top-items'),
    api('GET', '/reports/debtors'),
  ]);
  if (!data) return;

  const todaysInvoices = (invoices || []).filter(inv => inv.date && inv.date.startsWith(today));
  const todaysSales = todaysInvoices.filter(i => i.invoice_type === 'sale');
  const todaySalesTotal = todaysSales.reduce((s, i) => s + i.total, 0);
  const inventoryValue = (items || []).reduce((s, it) => s + (it.stock_qty > 0 ? it.stock_qty * it.sale_price : 0), 0);
  const pendingChecks = (checks || []).filter(c => c.status === 'pending');

  // ---- کارت‌های KPI ----
  const cards = [
    { label: 'موجودی کل کالا', value: fmt(inventoryValue) + ' تومان', cls: 'primary', icon: ICONS.inventory, raw: inventoryValue },
    { label: 'فروش امروز', value: fmt(todaySalesTotal) + ' تومان', cls: 'accent', icon: ICONS.sales, raw: todaySalesTotal },
  ];
  if (isAdmin && data.estimated_profit !== null) {
    cards.push({ label: 'سود تقریبی (کل)', value: fmt(data.estimated_profit) + ' تومان', cls: data.estimated_profit >= 0 ? 'accent' : 'danger', icon: ICONS.profit, raw: data.estimated_profit });
  }
  cards.push(
    { label: 'موجودی صندوق', value: fmt(cash ? cash.balance : 0) + ' تومان', cls: 'accent', icon: ICONS.cash, raw: cash ? cash.balance : 0 },
    { label: 'تعداد مشتریان', value: String((customers || []).length), cls: 'primary', icon: ICONS.customers },
    { label: 'فاکتورهای امروز', value: String(todaysInvoices.length), cls: 'primary', icon: ICONS.invoices },
    { label: 'چک‌های در انتظار', value: String(pendingChecks.length), cls: 'warning', icon: ICONS.checks },
  );
  $('#stat-grid').innerHTML = cards.map(c => `
    <div class="kpi-card ${c.cls}" title="${c.raw ? 'به حروف: ' + numberToPersianWords(c.raw) + ' تومان' : ''}">
      <div class="kpi-icon">${c.icon}</div>
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value" data-count-target="${c.raw !== undefined ? c.raw : (parseInt(c.value) || 0)}" data-count-suffix="${c.raw !== undefined ? ' تومان' : ''}">0</div>
    </div>`).join('');
  animateKpiCounters();

  // ---- نمودار خطی فروش/سود ماهانه ----
  if (monthly) {
    const series = [{ name: 'فروش', color: '#1B4A79', values: monthly.map(m => m.sales || 0) }];
    if (isAdmin) series.push({ name: 'سود', color: '#1B9C6B', values: monthly.map(m => m.profit || 0) });
    drawLineChart($('#dashboard-chart'), monthly.map(m => toJalaliMonthLabel(m.month)), series);
  }

  // ---- دونات وضعیت مالی ----
  const financeSlices = [
    { label: 'ارزش موجودی کالا', value: inventoryValue, color: '#14375E' },
    { label: 'موجودی صندوق', value: cash ? Math.max(cash.balance, 0) : 0, color: '#1B9C6B' },
    { label: 'طلب از مشتریان', value: data.total_debtors || 0, color: '#F59E0B' },
  ];
  drawDonutChart($('#finance-donut'), financeSlices.map(s => s.value), financeSlices.map(s => s.color));
  $('#finance-legend').innerHTML = financeSlices.map(s =>
    `<li><span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.color};margin-left:6px"></span>${s.label}</span><strong>${fmt(s.value)}</strong></li>`
  ).join('');

  // ---- بنر هشدار موجودی کم (پررنگ و واضح، بالای داشبورد) ----
  const lowStockItems = data.low_stock_items || [];
  const outOfStockCount = lowStockItems.filter(it => it.stock_qty <= 0).length;
  const banner = $('#low-stock-banner');
  if (lowStockItems.length) {
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <span class="lsb-text"><span class="lsb-icon">⚠️</span>
        ${outOfStockCount > 0 ? `${toFaDigits(outOfStockCount)} کالا تمام شده` + (lowStockItems.length > outOfStockCount ? ` و ${toFaDigits(lowStockItems.length - outOfStockCount)} کالا موجودی کم دارد` : '') : `${toFaDigits(lowStockItems.length)} کالا موجودی کم دارد`}
      </span>
      <span class="lsb-count">${toFaDigits(lowStockItems.length)}</span>`;
    banner.onclick = () => { navigateToPage('items'); };
    if (outOfStockCount > 0 && !state._lowStockBeeped) {
      state._lowStockBeeped = true;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch (e) { /* صدا اختیاری است، اگر مرورگر پشتیبانی نکرد نادیده گرفته می‌شود */ }
    }
  } else {
    banner.classList.add('hidden');
  }

  // ---- یادآوری‌ها (کالای کم‌موجود + چک در انتظار) ----
  const reminders = [];
  (data.low_stock_items || []).forEach(it => {
    reminders.push({ text: `${it.name} — ${it.stock_qty <= 0 ? 'تمام شده' : 'موجودی کم: ' + fmt(it.stock_qty)}`, color: it.stock_qty <= 0 ? 'danger' : 'warning' });
  });
  pendingChecks.slice(0, 5).forEach(c => {
    reminders.push({ text: `چک ${fmt(c.amount)} تومانی ${c.party_name || ''} — سررسید ${toFaDigits(c.due_date)}`, color: 'warning' });
  });
  $('#reminders-list').innerHTML = reminders.length
    ? reminders.slice(0, 8).map(r => `<li><span>${r.text}</span><span class="badge badge-${r.color === 'danger' ? 'red' : 'orange'}">!</span></li>`).join('')
    : '<li class="muted">یادآوری‌ای برای الان نیست ✅</li>';

  // ---- آخرین فاکتورها ----
  const typeLabelShort = { sale: 'فروش', purchase: 'خرید', sale_return: 'مرجوعی فروش', purchase_return: 'مرجوعی خرید' };
  $('#dash-recent-invoices').innerHTML = (invoices || []).slice(0, 6).map(inv => `
    <tr>
      <td>${inv.number || inv.id}</td>
      <td>${toJalaliDate(inv.date)}</td>
      <td>${inv.party_name || '—'}</td>
      <td title="${wordsTitle(inv.total)}">${fmt(inv.total)} <span class="muted" style="font-size:11px">(${typeLabelShort[inv.invoice_type] || ''})</span></td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">فاکتوری ثبت نشده</td></tr>';

  // ---- موجودی کالاها / پرفروش‌ترین‌ها / بیشترین بدهکار ----
  $('#dash-stock-ranking').innerHTML = (stockRanking || []).slice(0, 5).map((it, i) =>
    `<li><span><span class="insight-rank">${toFaDigits(i + 1)}</span>${it.name}${it.brand ? ' (' + it.brand + ')' : ''}</span><strong>${fmt(it.stock_qty)} ${it.unit}</strong></li>`
  ).join('') || '<li class="muted">کالایی ثبت نشده</li>';

  $('#dash-top-items').innerHTML = (topItems || []).slice(0, 5).map((it, i) =>
    `<li><span><span class="insight-rank">${toFaDigits(i + 1)}</span>${it.name}</span><strong>${fmt(it.total_qty)} عدد</strong></li>`
  ).join('') || '<li class="muted">فروشی در ۳۰ روز اخیر ثبت نشده</li>';

  const sortedDebtors = (debtors || []).slice().sort((a, b) => b.balance - a.balance);
  $('#dash-top-debtor').innerHTML = sortedDebtors.slice(0, 5).map((p, i) =>
    `<li><span><span class="insight-rank">${toFaDigits(i + 1)}</span>${p.name}</span><strong title="${wordsTitle(p.balance)}" style="color:var(--danger)">${fmt(p.balance)}</strong></li>`
  ).join('') || '<li class="muted">مشتری بدهکاری ثبت نشده ✅</li>';
}

// ===================== کالاها =====================
async function loadItems() {
  const [items, categories] = await Promise.all([api('GET', `/items?role=${state.user.role}`), api('GET', '/categories')]);
  state.items = items || [];
  state.categories = categories || [];
  renderItemsTable();
}
function renderItemsTable() {
  $('#items-tbody').innerHTML = state.items.map(it => `
    <tr>
      <td><input type="checkbox" class="item-select-checkbox" value="${it.id}" style="width:auto"></td>
      <td>${it.code || '—'}</td><td>${it.name}</td><td>${it.brand || '—'}</td><td>${it.unit}</td>
      <td title="${it.purchase_price ? 'به حروف: ' + numberToPersianWords(it.purchase_price) + ' تومان' : ''}">${it.purchase_price === null ? '—' : fmt(it.purchase_price)}</td>
      <td title="${it.sale_price ? 'به حروف: ' + numberToPersianWords(it.sale_price) + ' تومان' : ''}">${fmt(it.sale_price)}</td>
      <td>${it.stock_qty <= 0 ? `<span class="badge badge-red">تمام شده${it.stock_qty < 0 ? ' (' + fmt(Math.abs(it.stock_qty)) + ' کسری)' : ''}</span>` : (it.stock_qty <= it.min_stock ? `<span class="badge badge-orange">${fmt(it.stock_qty)}</span>` : fmt(it.stock_qty))}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="showStockLedger(${it.id})">گردش انبار</button></td>
    </tr>`).join('');
}
$('#items-select-all').addEventListener('change', (e) => {
  $$('.item-select-checkbox').forEach(cb => { if (cb.closest('tr').style.display !== 'none') cb.checked = e.target.checked; });
});
$('#btn-print-labels').addEventListener('click', () => {
  const ids = $$('.item-select-checkbox:checked').map(cb => cb.value);
  if (!ids.length) { toast('حداقل یک کالا را انتخاب کن', 'danger'); return; }
  openAuthedInNewTab(`/items/labels/print?ids=${ids.join(',')}`, 'text/html');
});
$('#items-filter').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  $$('#items-tbody tr').forEach(row => row.style.display = !q || row.textContent.includes(q) ? '' : 'none');
});
$('#btn-export-items').addEventListener('click', () => {
  downloadAuthed('/export/items.xlsx', 'کالاها.xlsx');
});
$('#btn-new-category').addEventListener('click', () => {
  openModal(`
    <h3>دسته‌بندی جدید</h3>
    <div class="field"><label>نام دسته</label><input type="text" id="new-cat-name"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
      <button class="btn btn-primary" id="save-cat-btn">ذخیره</button>
    </div>`);
  $('#save-cat-btn').addEventListener('click', async () => {
    const name = $('#new-cat-name').value.trim();
    if (!name) return;
    const res = await api('POST', '/categories', { name });
    if (res && res.ok) { toast('دسته اضافه شد', 'success'); closeModal(); loadItems(); }
    else toast((res && res.message) || 'خطا', 'danger');
  });
});
$('#btn-new-item').addEventListener('click', () => {
  const catOptions = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  openModal(`
    <h3>کالای جدید</h3>
    <div class="form-row"><div><label>کد/بارکد</label><input id="ni-code"></div><div><label>نام کالا</label><input id="ni-name"></div></div>
    <div class="form-row"><div><label>برند</label><input id="ni-brand"></div><div><label>واحد</label><input id="ni-unit" value="عدد"></div></div>
    <div class="form-row"><div><label>دسته‌بندی</label><select id="ni-cat"><option value="">—</option>${catOptions}</select></div></div>
    <div class="form-row"><div${state.user.role !== 'admin' ? ' style="display:none"' : ''}><label>قیمت خرید</label><input type="text" inputmode="decimal" id="ni-purchase"><div class="words-hint" id="ni-purchase-words"></div></div><div><label>قیمت فروش</label><input type="text" inputmode="decimal" id="ni-sale"><div class="words-hint" id="ni-sale-words"></div></div></div>
    <div class="form-row"><div><label>موجودی</label><input type="number" id="ni-stock" value="0"></div><div><label>حداقل موجودی</label><input type="number" id="ni-min" value="0"></div></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">انصراف</button><button class="btn btn-primary" id="save-item-btn">ذخیره</button></div>`);
  attachThousandsFormatting($('#ni-purchase'));
  attachThousandsFormatting($('#ni-sale'));
  attachWordsPreview($('#ni-purchase'), 'ni-purchase-words');
  attachWordsPreview($('#ni-sale'), 'ni-sale-words');
  $('#save-item-btn').addEventListener('click', async () => {
    const name = $('#ni-name').value.trim();
    if (!name) { toast('نام کالا الزامی است', 'danger'); return; }
    const payload = {
      code: $('#ni-code').value, name, brand: $('#ni-brand').value, unit: $('#ni-unit').value || 'عدد',
      category_id: $('#ni-cat').value || null,
      purchase_price: readAmount($('#ni-purchase')), sale_price: readAmount($('#ni-sale')),
      stock_qty: parseFloat($('#ni-stock').value || 0), min_stock: parseFloat($('#ni-min').value || 0),
    };
    const res = await api('POST', '/items', payload);
    if (res && res.ok) { toast('کالا اضافه شد', 'success'); closeModal(); loadItems(); }
  });
});
async function showStockLedger(itemId) {
  const data = await api('GET', `/reports/stock-ledger/${itemId}`);
  if (!data) return;
  const rows = data.ledger.map(r => `<tr><td>${toJalaliDate(r.date, true)}</td><td>${r.type}</td><td>${r.number || '—'}</td><td>${fmt(r.qty)}</td><td>${fmt(r.running_balance)}</td></tr>`).join('');
  openModal(`
    <h3>گردش انبار: ${data.item.name}</h3>
    <table class="data-table"><thead><tr><th>تاریخ</th><th>نوع</th><th>شماره فاکتور</th><th>تعداد</th><th>مانده</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">حرکتی ثبت نشده</td></tr>'}</tbody></table>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">بستن</button></div>`);
}

// ===================== فرم فاکتور فروش/خرید =====================
function loadInvoiceForm(type) {
  const containerId = 'invoice-form-' + type;
  const label = type === 'sale' ? 'فروش' : 'خرید';
  const partyLabel = type === 'sale' ? 'مشتری' : 'تامین‌کننده';
  $('#' + containerId).innerHTML = `
    <div class="invoice-form">
      <div class="card">
        <div class="card-title">مشخصات فاکتور</div>
        <div class="form-row"><div><label>${partyLabel}</label><div id="${type}-party"></div></div>
          <div><label>نوع پرداخت</label><select id="${type}-pay"><option value="cash">نقدی</option><option value="credit">نسیه</option><option value="check">چک</option></select></div></div>
        <div class="form-row"><div><label>تخفیف کل فاکتور (تومان)</label><input type="text" inputmode="decimal" id="${type}-discount" value="0"><div class="words-hint" id="${type}-discount-words"></div></div></div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:6px">
          <input type="checkbox" id="${type}-return" style="width:auto"> این فاکتور مرجوعی ${label} است
        </label>
        <div class="form-row" style="margin-top:10px"><div>
          <label>یادداشت سفارش (اختیاری)</label>
          <input type="text" id="${type}-note" placeholder="مثلاً: تحویل جمعه، رنگ خاص سفارش داده شده و...">
        </div></div>
      </div>
      <div class="card">
        <div class="card-title">اسکن بارکد</div>
        <input type="text" id="${type}-barcode" placeholder="بارکد را با دستگاه اسکن کن یا کد کالا را تایپ و Enter بزن..."
               autocomplete="off" style="font-size:16px;padding:10px">
        <p class="muted" style="margin-top:6px" id="${type}-barcode-status"></p>
      </div>
      <div class="card">
        <div class="card-title">افزودن کالا</div>
        <div class="form-row"><div><label>کالا</label><div id="${type}-item"></div></div>
          <div><label>تعداد</label><input type="number" step="any" id="${type}-qty"></div>
          <div><label>قیمت واحد</label><input type="text" inputmode="decimal" id="${type}-price"><div class="words-hint" id="${type}-price-words"></div></div></div>
        ${type === 'sale' ? `
        <div class="form-row"><div><label>شماره سریال (اختیاری)</label><input type="text" id="${type}-serial" placeholder="مثلاً SN-12345"></div>
          <div><label>گارانتی (ماه، اختیاری)</label><input type="number" step="1" min="0" id="${type}-warranty" placeholder="مثلاً 12"></div></div>` : ''}
        <button class="btn btn-secondary" id="${type}-add-line">+ افزودن به سبد فاکتور</button>
        <table class="data-table" style="margin-top:14px"><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت</th><th>جمع</th>${type === 'sale' ? '<th>سریال/گارانتی</th>' : ''}</tr></thead><tbody id="${type}-cart-tbody"></tbody></table>
        <div class="cart-total" id="${type}-cart-total">جمع کل: ۰ تومان</div>
        <div class="words-hint" id="${type}-cart-total-words"></div>
        <button class="btn btn-primary btn-block" id="${type}-submit" style="margin-top:14px">ثبت فاکتور</button>
      </div>
    </div>`;

  state.invoiceUI = state.invoiceUI || {};

  Promise.all([api('GET', '/parties'), api('GET', `/items?role=${state.user.role}`)]).then(([parties, items]) => {
    state.parties = parties || [];
    state.items = items || [];
    const wantedType = type === 'sale' ? 'customer' : 'supplier';
    const filteredParties = state.parties.filter(p => p.type === wantedType);

    const partySS = createSearchableSelect(`${type}-party`, filteredParties.map(p => ({ value: p.id, label: p.name })),
      { placeholder: `جستجوی ${partyLabel}...`, emptyLabel: '— بدون طرف‌حساب —' });

    const priceField = type === 'sale' ? 'sale_price' : 'purchase_price';
    const itemSS = createSearchableSelect(`${type}-item`,
      state.items.map(it => ({ value: it.id, label: it.name, price: it[priceField] })),
      {
        placeholder: 'جستجوی کالا (نام یا کد)...', allowEmpty: false,
        onSelect: (val, found) => {
          $(`#${type}-price`).value = found && found.price ? Number(found.price).toLocaleString('en-US') : '';
        },
      });
    state.invoiceUI[type] = { partySS, itemSS };

    if (!state.items.length) {
      toast('هنوز هیچ کالایی تعریف نشده — اول از صفحه «کالاها» یک کالا اضافه کن', 'danger');
    }
    attachThousandsFormatting($(`#${type}-price`));
    attachThousandsFormatting($(`#${type}-discount`));
    attachWordsPreview($(`#${type}-price`), `${type}-price-words`);
    attachWordsPreview($(`#${type}-discount`), `${type}-discount-words`);
  });

  const cartKey = type + 'Cart';
  state[cartKey] = [];

  $(`#${type}-add-line`).addEventListener('click', () => {
    const ui = state.invoiceUI[type];
    const itemId = parseInt(ui.itemSS.getValue());
    const itemObj = state.items.find(it => it.id === itemId);
    const qty = parseFloat($(`#${type}-qty`).value);
    const price = readAmount($(`#${type}-price`));
    if (!itemId || !qty || !price) { toast('کالا، تعداد و قیمت را وارد کنید', 'danger'); return; }
    if (type === 'sale' && itemObj) {
      const alreadyInCart = state[cartKey].filter(c => c.item_id === itemId).reduce((s, c) => s + c.qty, 0);
      if (qty + alreadyInCart > itemObj.stock_qty) {
        toast(`❌ موجودی «${itemObj.name}» فقط ${fmt(itemObj.stock_qty)} عدد است — نمی‌توان ${fmt(qty)} تا ثبت کرد`, 'danger');
        return;
      }
    }
    const cartItem = { item_id: itemId, item_name: itemObj?.name, qty, unit_price: price };
    if (type === 'sale') {
      const serial = $(`#${type}-serial`).value.trim();
      const warranty = $(`#${type}-warranty`).value;
      if (serial) cartItem.serial_number = serial;
      if (warranty) cartItem.warranty_months = parseInt(warranty);
      $(`#${type}-serial`).value = '';
      $(`#${type}-warranty`).value = '';
    }
    state[cartKey].push(cartItem);
    renderCart(type);
  });

  // ===== اسکن بارکد: دستگاه بارکدخوان مثل کیبورد عمل می‌کند (کد را تایپ و Enter می‌زند) =====
  const barcodeInput = $(`#${type}-barcode`);
  const barcodeStatus = $(`#${type}-barcode-status`);
  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = barcodeInput.value.trim();
    barcodeInput.value = '';
    if (!code) return;
    const itemObj = state.items.find(it => it.code && it.code.toLowerCase() === code.toLowerCase());
    if (!itemObj) {
      barcodeStatus.textContent = `❌ کالایی با کد «${code}» پیدا نشد`;
      barcodeStatus.style.color = 'var(--danger)';
      return;
    }
    if (type === 'sale') {
      const alreadyInCart = state[cartKey].filter(c => c.item_id === itemObj.id).reduce((s, c) => s + c.qty, 0);
      if (alreadyInCart + 1 > itemObj.stock_qty) {
        barcodeStatus.textContent = `❌ موجودی «${itemObj.name}» فقط ${fmt(itemObj.stock_qty)} عدد است`;
        barcodeStatus.style.color = 'var(--danger)';
        return;
      }
    }
    const priceField = type === 'sale' ? 'sale_price' : 'purchase_price';
    const existingRow = state[cartKey].find(c => c.item_id === itemObj.id);
    if (existingRow) {
      existingRow.qty += 1;
    } else {
      state[cartKey].push({ item_id: itemObj.id, item_name: itemObj.name, qty: 1, unit_price: itemObj[priceField] || 0 });
    }
    renderCart(type);
    barcodeStatus.textContent = `✅ «${itemObj.name}» اضافه شد`;
    barcodeStatus.style.color = 'var(--accent, green)';
  });
  barcodeInput.focus();

  $(`#${type}-submit`).addEventListener('click', () => showInvoicePreview(type));

  async function showInvoicePreview(type) {
    const cartKey = type + 'Cart';
    if (!state[cartKey].length) { toast('فاکتور خالی است', 'danger'); return; }
    const ui = state.invoiceUI[type];
    const partyVal = ui.partySS.getValue();
    const partyObj = state.parties.find(p => String(p.id) === String(partyVal));
    const payType = $(`#${type}-pay`).value;
    const payLabel = { cash: 'نقدی', credit: 'نسیه', check: 'چک' }[payType];
    const discount = readAmount($(`#${type}-discount`));
    const isReturn = $(`#${type}-return`).checked;
    const note = $(`#${type}-note`).value.trim();
    const cart = state[cartKey];
    const subtotal = cart.reduce((s, c) => s + c.qty * c.unit_price, 0);
    const grandTotal = Math.max(subtotal - discount, 0);

    const rowsHtml = cart.map(c => `
      <tr><td>${c.item_name}</td><td>${fmt(c.qty)}</td><td>${fmt(c.unit_price)}</td><td>${fmt(c.qty * c.unit_price)}</td></tr>
    `).join('');

    openModal(`
      <h3>پیش‌نمایش نهایی فاکتور — قبل از ثبت بررسی کن</h3>
      <div class="ai-summary-box">
        <div class="item"><span class="k">طرف‌حساب</span><span class="v">${partyObj ? partyObj.name : 'بدون طرف‌حساب'}</span></div>
        <div class="item"><span class="k">نوع پرداخت</span><span class="v">${payLabel}${isReturn ? ' (مرجوعی)' : ''}</span></div>
        <div class="item"><span class="k">یادداشت</span><span class="v">${note || '—'}</span></div>
      </div>
      <table class="data-table">
        <thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <table class="totals" style="margin-top:10px">
        <tr><td class="label">جمع جزء:</td><td class="value">${fmt(subtotal)} تومان</td></tr>
        <tr><td class="label">تخفیف:</td><td class="value">${fmt(discount)} تومان</td></tr>
        <tr class="grand"><td class="label">جمع نهایی:</td><td class="value">${fmt(grandTotal)} تومان</td></tr>
      </table>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">بازگشت و ویرایش</button>
        <button class="btn btn-primary" id="confirm-final-submit-btn">تأیید و ثبت نهایی</button>
      </div>`);

    $('#confirm-final-submit-btn').addEventListener('click', async () => {
      closeModal();
      await actuallySubmitInvoice(type, partyVal, payType, discount, isReturn, note);
    });
  }

  async function actuallySubmitInvoice(type, partyVal, payType, discount, isReturn, note) {
    const cartKey = type + 'Cart';
    const effectiveType = isReturn ? (type === 'sale' ? 'sale_return' : 'purchase_return') : type;
    const payload = {
      invoice_type: effectiveType, party_id: partyVal || null, payment_type: payType,
      discount, username: state.user.username, description: note,
      items: state[cartKey].map(c => ({ item_id: c.item_id, qty: c.qty, unit_price: c.unit_price, serial_number: c.serial_number, warranty_months: c.warranty_months })),
    };
    const res = await api('POST', '/invoices', payload);
    if (res && res.ok) {
      toast(`فاکتور ${res.invoice_number} ثبت شد — جمع کل: ${fmt(res.total)} تومان`, 'success');
      if (payType === 'check') {
        const due = prompt('تاریخ سررسید چک را وارد کنید (مثلاً 1404-06-01):');
        if (due) {
          await api('POST', '/checks', {
            party_id: partyVal || null, invoice_id: res.invoice_id, amount: res.total,
            due_date: due, direction: type === 'sale' ? 'received' : 'issued',
            description: `چک فاکتور شماره ${res.invoice_number}`,
          });
        }
      }
      askPrintInvoice(res.invoice_id);
      state[cartKey] = [];
      renderCart(type);
      $(`#${type}-note`).value = '';
      loadItems();
    } else if (res) {
      toast(res.message || 'خطا در ثبت فاکتور', 'danger');
    }
  }
}
function renderCart(type) {
  const cartKey = type + 'Cart';
  const cart = state[cartKey];
  $(`#${type}-cart-tbody`).innerHTML = cart.map(c =>
    `<tr><td>${c.item_name}</td><td>${fmt(c.qty)}</td>
     <td title="به حروف: ${numberToPersianWords(c.unit_price)} تومان">${fmt(c.unit_price)}</td>
     <td title="به حروف: ${numberToPersianWords(c.qty * c.unit_price)} تومان">${fmt(c.qty * c.unit_price)}</td>
     ${type === 'sale' ? `<td>${[c.serial_number ? escHtml(c.serial_number) : '', c.warranty_months ? `${c.warranty_months} ماه گارانتی` : ''].filter(Boolean).join(' / ') || '—'}</td>` : ''}</tr>`).join('');
  const total = cart.reduce((s, c) => s + c.qty * c.unit_price, 0);
  $(`#${type}-cart-total`).textContent = `جمع کل: ${fmt(total)} تومان`;
  $(`#${type}-cart-total-words`).textContent = total ? `به حروف: ${numberToPersianWords(total)} تومان` : '';
}

// ===================== چاپ فاکتور =====================
function askPrintInvoice(invoiceId) {
  openModal(`
    <h3>چاپ فاکتور</h3>
    <p class="muted">فرمت کاغذ را انتخاب کن:</p>
    <div class="form-row" style="margin-top:12px">
      <button class="btn btn-secondary" onclick="printInvoice(${invoiceId}, 'A4')">A4</button>
      <button class="btn btn-secondary" onclick="printInvoice(${invoiceId}, 'A5')">A5</button>
      <button class="btn btn-secondary" onclick="printInvoice(${invoiceId}, 'thermal80')">رسید ۸۰mm</button>
      <button class="btn btn-secondary" onclick="printInvoice(${invoiceId}, 'thermal58')">رسید ۵۸mm</button>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">فعلاً نه</button></div>`);
}
function printInvoice(invoiceId, format) {
  openAuthedInNewTab(`/invoices/${invoiceId}/print?format=${format}`, 'text/html');
  closeModal();
}

// ===================== تاریخچه فاکتورها =====================
async function loadHistory() {
  const type = $('#history-type-filter').value;
  const data = await api('GET', '/invoices' + (type ? `?type=${type}` : ''));
  if (!data) return;
  const typeLabel = { sale: 'فروش', purchase: 'خرید', sale_return: 'مرجوعی فروش', purchase_return: 'مرجوعی خرید' };
  state.invoicesById = {};
  data.forEach(inv => { state.invoicesById[inv.id] = inv; });
  $('#history-tbody').innerHTML = data.map(inv => `
    <tr>
      <td>${inv.number || inv.id}</td><td>${typeLabel[inv.invoice_type] || inv.invoice_type}</td><td>${toJalaliDate(inv.date, true)}</td>
      <td>${inv.party_name || '—'}</td><td>${inv.description || '—'}</td><td title="${wordsTitle(inv.total)}">${fmt(inv.total)}</td><td title="${wordsTitle(inv.paid)}">${fmt(inv.paid)}</td>
      <td>${escHtml(inv.created_by) || '—'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="askPrintInvoice(${inv.id})">چاپ</button>
        ${state.user.role === 'admin' ? `<button class="btn btn-sm btn-secondary" onclick="openEditInvoiceModal(${inv.id})">ویرایش</button>` : ''}
        ${['sale', 'purchase'].includes(inv.invoice_type) ? `<button class="btn btn-sm btn-danger" onclick="openReturnModal(${inv.id})">ثبت مرجوعی</button>` : ''}
        ${state.user.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteInvoice(${inv.id})">حذف</button>` : ''}
      </td>
    </tr>`).join('');
}
$('#history-type-filter').addEventListener('change', loadHistory);
$('#btn-refresh-history').addEventListener('click', loadHistory);

// ===================== ویرایش کامل فاکتور (اقلام، طرف‌حساب، پرداخت، تخفیف، توضیحات) =====================
let editInvoiceCart = [];

async function openEditInvoiceModal(invoiceId) {
  const inv = state.invoicesById[invoiceId];
  if (!inv) return;
  const items = await api('GET', `/invoices/${invoiceId}/items`);
  if (!items) return;
  if (!state.items || !state.items.length) state.items = await api('GET', `/items?role=${state.user.role}`) || [];
  if (!state.parties || !state.parties.length) state.parties = await api('GET', '/parties') || [];

  editInvoiceCart = items.map(it => ({ item_id: it.item_id, item_name: it.item_name, qty: it.qty, unit_price: it.unit_price }));

  const typeLabel = { sale: 'فروش', purchase: 'خرید', sale_return: 'مرجوعی فروش', purchase_return: 'مرجوعی خرید' };
  const wantedType = ['sale', 'sale_return'].includes(inv.invoice_type) ? 'customer' : 'supplier';
  const filteredParties = state.parties.filter(p => p.type === wantedType);

  openModal(`
    <h3>ویرایش فاکتور ${inv.number || inv.id}</h3>
    <p class="muted">نوع فاکتور (${typeLabel[inv.invoice_type] || inv.invoice_type}) قابل تغییر نیست. موجودی انبار و حساب طرف‌حساب بر اساس مقادیر جدید دوباره محاسبه می‌شود.</p>
    <div class="form-row">
      <div><label>طرف‌حساب</label><div id="edit-inv-party"></div></div>
      <div><label>نوع پرداخت</label><select id="edit-inv-pay">
        <option value="cash">نقدی</option><option value="credit">نسیه</option><option value="check">چک</option>
      </select></div>
    </div>
    <div class="form-row">
      <div><label>تخفیف کل فاکتور (تومان)</label><input type="text" inputmode="decimal" id="edit-inv-discount"></div>
      <div><label>توضیحات</label><input id="edit-inv-description"></div>
    </div>
    <div class="card" style="margin-top:10px">
      <div class="card-title">اقلام فاکتور</div>
      <div class="form-row">
        <div><label>کالا</label><div id="edit-inv-item"></div></div>
        <div><label>تعداد</label><input type="number" step="any" id="edit-inv-qty"></div>
        <div><label>قیمت واحد</label><input type="text" inputmode="decimal" id="edit-inv-price"></div>
      </div>
      <button class="btn btn-secondary" type="button" id="edit-inv-add-line">+ افزودن قلم</button>
      <table class="data-table" style="margin-top:10px"><thead><tr><th>کالا</th><th>تعداد</th><th>قیمت</th><th>جمع</th><th></th></tr></thead><tbody id="edit-inv-cart-tbody"></tbody></table>
      <div class="cart-total" id="edit-inv-cart-total"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">انصراف</button>
      <button class="btn btn-primary" id="edit-inv-save-btn">ذخیره تغییرات</button>
    </div>`);

  const partySS = createSearchableSelect('edit-inv-party', filteredParties.map(p => ({ value: p.id, label: p.name })),
    { placeholder: 'جستجو...', emptyLabel: '— بدون طرف‌حساب —' });
  if (inv.party_id) partySS.setValue(inv.party_id);

  const priceField = ['sale', 'sale_return'].includes(inv.invoice_type) ? 'sale_price' : 'purchase_price';
  const itemSS = createSearchableSelect('edit-inv-item',
    state.items.map(it => ({ value: it.id, label: it.name, price: it[priceField] })),
    {
      placeholder: 'جستجوی کالا (نام یا کد)...', allowEmpty: false,
      onSelect: (val, found) => {
        $('#edit-inv-price').value = found && found.price ? Number(found.price).toLocaleString('en-US') : '';
      },
    });

  $('#edit-inv-pay').value = inv.payment_type;
  attachThousandsFormatting($('#edit-inv-discount'));
  $('#edit-inv-discount').value = Number(inv.discount || 0).toLocaleString('en-US');
  $('#edit-inv-description').value = inv.description || '';
  attachThousandsFormatting($('#edit-inv-price'));

  renderEditInvoiceCart();

  $('#edit-inv-add-line').addEventListener('click', () => {
    const itemId = parseInt(itemSS.getValue());
    const itemObj = state.items.find(it => it.id === itemId);
    const qty = parseFloat($('#edit-inv-qty').value);
    const price = readAmount($('#edit-inv-price'));
    if (!itemId || !qty || !price) { toast('کالا، تعداد و قیمت را وارد کنید', 'danger'); return; }
    editInvoiceCart.push({ item_id: itemId, item_name: itemObj?.name, qty, unit_price: price });
    $('#edit-inv-qty').value = '';
    $('#edit-inv-price').value = '';
    renderEditInvoiceCart();
  });

  $('#edit-inv-save-btn').addEventListener('click', () => saveFullInvoiceEdit(invoiceId, partySS));
}

function renderEditInvoiceCart() {
  $('#edit-inv-cart-tbody').innerHTML = editInvoiceCart.map((c, i) => `
    <tr>
      <td>${c.item_name}</td><td>${fmt(c.qty)}</td><td>${fmt(c.unit_price)}</td><td>${fmt(c.qty * c.unit_price)}</td>
      <td><button class="btn btn-sm btn-danger" type="button" onclick="removeEditInvoiceCartRow(${i})">حذف</button></td>
    </tr>`).join('');
  const total = editInvoiceCart.reduce((s, c) => s + c.qty * c.unit_price, 0);
  $('#edit-inv-cart-total').textContent = `جمع جزء: ${fmt(total)} تومان`;
}

function removeEditInvoiceCartRow(i) {
  editInvoiceCart.splice(i, 1);
  renderEditInvoiceCart();
}

async function saveFullInvoiceEdit(invoiceId, partySS) {
  if (!editInvoiceCart.length) { toast('فاکتور باید حداقل یک کالا داشته باشد', 'danger'); return; }
  if (!confirm('آیا مطمئنی می‌خوای این فاکتور رو با این تغییرات ذخیره کنی؟\nموجودی انبار و حساب طرف‌حساب بر این اساس دوباره محاسبه می‌شود.')) return;

  const payload = {
    party_id: partySS.getValue() || null,
    payment_type: $('#edit-inv-pay').value,
    discount: readAmount($('#edit-inv-discount')),
    description: $('#edit-inv-description').value,
    username: state.user.username,
    items: editInvoiceCart.map(c => ({ item_id: c.item_id, qty: c.qty, unit_price: c.unit_price })),
  };
  const res = await api('PUT', `/invoices/${invoiceId}`, payload);
  if (res && res.ok) {
    toast('فاکتور با موفقیت ویرایش شد', 'success');
    closeModal();
    loadHistory();
    loadItems();
  } else if (res) {
    toast(res.message || 'خطا در ویرایش فاکتور', 'danger');
  }
}

async function deleteInvoice(invoiceId) {
  const inv = state.invoicesById[invoiceId];
  if (!confirm(`آیا مطمئنی می‌خوای فاکتور ${inv?.number || invoiceId} رو حذف کنی؟\nموجودی کالا، حساب طرف‌حساب و صندوق به حالت قبل از این فاکتور برمی‌گردند.\nاین کار قابل بازگشت نیست.`)) return;
  const res = await api('DELETE', `/invoices/${invoiceId}`, { username: state.user.username });
  if (res && res.ok) {
    toast('فاکتور حذف شد', 'success');
    loadHistory();
    loadItems();
  } else if (res) {
    toast(res.message || 'خطا در حذف', 'danger');
  }
}

// ===================== ارسال فاکتور (پیش‌نمایش + دانلود PDF + اشتراک‌گذاری) =====================
function loadSendInvoicePage() {
  $('#send-inv-result-card').classList.add('hidden');
  $('#send-inv-search-input').value = '';
  $('#send-inv-search-input').focus();
}

$('#send-inv-search-btn').addEventListener('click', searchInvoiceToSend);
$('#send-inv-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchInvoiceToSend(); });

async function searchInvoiceToSend() {
  const q = $('#send-inv-search-input').value.trim();
  if (!q) { toast('شماره فاکتور را وارد کن', 'danger'); return; }
  const all = await api('GET', '/invoices');
  if (!all) return;
  const found = all.find(inv => String(inv.number || '').toLowerCase() === q.toLowerCase() || String(inv.id) === q);
  if (!found) {
    toast('فاکتوری با این شماره پیدا نشد', 'danger');
    $('#send-inv-result-card').classList.add('hidden');
    return;
  }
  showSendInvoiceResult(found);
}

async function showSendInvoiceResult(inv) {
  const typeLabel = { sale: 'فروش', purchase: 'خرید', sale_return: 'مرجوعی فروش', purchase_return: 'مرجوعی خرید' };
  $('#send-inv-title').textContent = `فاکتور ${inv.number || inv.id}`;
  $('#send-inv-summary').innerHTML = `
    <div class="item"><span class="k">نوع</span><span class="v">${typeLabel[inv.invoice_type] || inv.invoice_type}</span></div>
    <div class="item"><span class="k">طرف‌حساب</span><span class="v">${inv.party_name || '—'}</span></div>
    <div class="item"><span class="k">تاریخ</span><span class="v">${toJalaliDate(inv.date, true)}</span></div>
    <div class="item"><span class="k">جمع کل</span><span class="v">${fmt(inv.total)} تومان</span></div>`;
  $('#send-inv-result-card').classList.remove('hidden');
  $('#send-inv-preview-frame').srcdoc = '';

  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  try {
    const resp = await fetch(`/invoices/${inv.id}/print?format=A5`, { headers });
    if (resp.ok) $('#send-inv-preview-frame').srcdoc = await resp.text();
  } catch (e) { console.error(e); }

  const invoiceNumber = inv.number || inv.id;
  $('#send-inv-download-btn').onclick = () => downloadAuthed(`/invoices/${inv.id}/pdf`, `فاکتور-${invoiceNumber}.pdf`);

  const shareBtn = $('#send-inv-share-btn');
  const shareNote = $('#send-inv-share-note');
  if (navigator.share) {
    shareBtn.classList.remove('hidden');
    shareBtn.onclick = () => shareInvoicePdf(inv.id, invoiceNumber);
    shareNote.textContent = 'با زدن این دکمه، منوی اشتراک‌گذاری گوشی باز می‌شود و می‌توانی فاکتور را مستقیم برای مشتری در بله، روبیکا، ایتا، واتس‌اپ یا هر برنامه دیگری بفرستی.';
  } else {
    shareBtn.classList.add('hidden');
    shareNote.textContent = 'مرورگر یا سیستم فعلی از اشتراک‌گذاری مستقیم پشتیبانی نمی‌کند (این ویژگی معمولاً فقط روی گوشی موبایل یا آدرس‌های HTTPS کار می‌کند). فاکتور را دانلود کن و از داخل بله/روبیکا/ایتا/واتس‌اپ برای مشتری ضمیمه و ارسال کن.';
  }
}

async function shareInvoicePdf(invoiceId, invoiceNumber) {
  const blob = await fetchAuthedBlob(`/invoices/${invoiceId}/pdf`);
  if (!blob) return;
  const file = new File([blob], `فاکتور-${invoiceNumber}.pdf`, { type: 'application/pdf' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `فاکتور ${invoiceNumber}` });
    } else {
      toast('مرورگر شما اشتراک‌گذاری مستقیم فایل را پشتیبانی نمی‌کند — از دکمه «دانلود PDF» استفاده کن', 'danger');
    }
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); toast('خطا در اشتراک‌گذاری', 'danger'); }
  }
}

// ===================== مشتریان و تامین‌کنندگان =====================
async function loadParties() {
  const parties = await api('GET', '/parties');
  state.parties = parties || [];
  $('#parties-tbody').innerHTML = state.parties.map(p => `
    <tr>
      <td>${p.name}${p.is_vip ? ' <span class="badge badge-green">VIP</span>' : ''}${p.note ? ` <span title="${p.note}">📝</span>` : ''}</td>
      <td>${p.phone || '—'}</td><td>${p.type === 'customer' ? 'مشتری' : 'تامین‌کننده'}</td>
      <td>${p.balance > 0 ? `<span class="badge badge-orange" title="${wordsTitle(p.balance)}">${fmt(p.balance)}</span>` : (p.balance < 0 ? `<span class="badge badge-red" title="${wordsTitle(Math.abs(p.balance))}">${fmt(Math.abs(p.balance))}</span>` : '0')}</td>
      <td>${p.last_purchase ? toJalaliDate(p.last_purchase) : '—'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="showLedger(${p.id})">ریز حساب</button>
        <button class="btn btn-sm btn-success" onclick="settlePayment(${p.id}, '${p.name.replace(/'/g, "")}')">تسویه</button>
      </td>
    </tr>`).join('');
}
$('#btn-new-party').addEventListener('click', () => {
  openModal(`
    <h3>طرف‌حساب جدید</h3>
    <div class="field"><label>نام</label><input id="np-name"></div>
    <div class="field"><label>شماره تماس (۱۱ رقم، مثلاً 09123456789)</label><input id="np-phone" maxlength="13"></div>
    <div class="field"><label>آدرس محل کار یا سکونت</label><input id="np-address"></div>
    <div class="field"><label>نوع</label><select id="np-type"><option value="customer">مشتری</option><option value="supplier">تامین‌کننده</option></select></div>
    <div class="field"><label>سقف اعتبار نسیه (تومان — صفر یعنی بدون محدودیت)</label><input type="text" inputmode="decimal" id="np-credit-limit" value="0"></div>
    <div class="field"><label>یادداشت (اختیاری)</label><input id="np-note" placeholder="مثلاً: همیشه سروقت پول می‌ده"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:6px">
      <input type="checkbox" id="np-vip" style="width:auto"> مشتری ویژه (VIP)
    </label>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">انصراف</button><button class="btn btn-primary" id="save-party-btn">ذخیره</button></div>`);
  attachThousandsFormatting($('#np-credit-limit'));
  $('#save-party-btn').addEventListener('click', async () => {
    const name = $('#np-name').value.trim();
    const phoneRaw = $('#np-phone').value.trim();
    const address = $('#np-address').value.trim();
    if (!name) { toast('نام الزامی است', 'danger'); return; }
    const phoneDigits = phoneRaw.replace(/[\s-]/g, '');
    const phoneValid = /^0?9\d{9}$/.test(phoneDigits) || /^989\d{9}$/.test(phoneDigits);
    if (!phoneValid) {
      toast('شماره تماس نامعتبر است — باید ۱۱ رقم (مثلاً 09123456789) یا ۱۲ رقم با پیش‌شماره کشور باشد', 'danger');
      return;
    }
    if (!address) { toast('آدرس محل کار یا سکونت الزامی است', 'danger'); return; }
    const res = await api('POST', '/parties', {
      name, phone: phoneDigits, address, type: $('#np-type').value,
      credit_limit: readAmount($('#np-credit-limit')), note: $('#np-note').value.trim(),
      is_vip: $('#np-vip').checked ? 1 : 0,
    });
    if (res && res.ok) { toast('طرف‌حساب اضافه شد', 'success'); closeModal(); loadParties(); }
    else if (res) toast(res.message || 'خطا در ثبت', 'danger');
  });
});
async function showLedger(partyId) {
  const data = await api('GET', `/parties/${partyId}/ledger`);
  if (!data) return;
  const rows = data.invoices.map(inv => `<tr><td>${toJalaliDate(inv.date, true)}</td><td>${inv.invoice_type}</td><td title="${wordsTitle(inv.total)}">${fmt(inv.total)}</td><td title="${wordsTitle(inv.paid)}">${fmt(inv.paid)}</td></tr>`).join('');
  openModal(`
    <h3>ریز حساب: ${data.party.name}</h3>
    <p>مانده فعلی: <strong title="${wordsTitle(data.party.balance)}">${fmt(data.party.balance)} تومان</strong></p>
    <table class="data-table" style="margin-top:12px"><thead><tr><th>تاریخ</th><th>نوع</th><th>جمع کل</th><th>پرداخت‌شده</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">فاکتوری ثبت نشده</td></tr>'}</tbody></table>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">بستن</button>
      <button class="btn btn-secondary" id="ledger-print-btn">چاپ صورت‌حساب کامل</button>
      <button class="btn btn-secondary" id="ledger-download-btn">دانلود PDF</button>
      ${navigator.share ? '<button class="btn btn-primary" id="ledger-share-btn">ارسال صورت‌حساب</button>' : ''}
    </div>`);
  $('#ledger-print-btn').addEventListener('click', () => openAuthedInNewTab(`/parties/${partyId}/statement/print`, 'text/html'));
  $('#ledger-download-btn').addEventListener('click', () => downloadAuthed(`/parties/${partyId}/statement/pdf`, `صورت‌حساب-${data.party.name}.pdf`));
  const shareBtn = $('#ledger-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const blob = await fetchAuthedBlob(`/parties/${partyId}/statement/pdf`);
      if (!blob) return;
      const file = new File([blob], `صورت‌حساب-${data.party.name}.pdf`, { type: 'application/pdf' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `صورت‌حساب ${data.party.name}` });
        } else {
          toast('مرورگر شما اشتراک‌گذاری مستقیم فایل را پشتیبانی نمی‌کند — از دکمه «دانلود PDF» استفاده کن', 'danger');
        }
      } catch (e) {
        if (e.name !== 'AbortError') { console.error(e); toast('خطا در اشتراک‌گذاری', 'danger'); }
      }
    });
  }
}
function settlePayment(partyId, partyName) {
  openModal(`
    <h3>تسویه حساب با ${partyName}</h3>
    <div class="field"><label>مبلغ (تومان)</label><input type="text" inputmode="decimal" id="settle-amount"><div class="words-hint" id="settle-amount-words"></div></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">انصراف</button><button class="btn btn-primary" id="settle-btn">ثبت</button></div>`);
  attachThousandsFormatting($('#settle-amount'));
  attachWordsPreview($('#settle-amount'), 'settle-amount-words');
  $('#settle-btn').addEventListener('click', async () => {
    const amount = readAmount($('#settle-amount'));
    if (!amount) return;
    const res = await api('POST', `/parties/${partyId}/payment`, { amount });
    if (res && res.ok) { toast(`ثبت شد. مانده جدید: ${fmt(res.new_balance)} تومان`, 'success'); closeModal(); loadParties(); }
  });
}

// ===================== چک‌ها =====================
function normalizeDigitsForCompare(s) {
  return String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}
async function loadChecks() {
  const checks = await api('GET', '/checks');
  if (!checks) return;
  const statusLabel = { pending: ['در انتظار', 'orange'], cashed: ['وصول‌شده', 'green'], bounced: ['برگشتی', 'red'] };
  const dirLabel = { received: 'دریافتی', issued: 'صادرشده' };
  const today = todayJalaliStr();
  const dueTodayIds = [];
  $('#checks-tbody').innerHTML = checks.map(ch => {
    const st = statusLabel[ch.status] || ['—', 'gray'];
    const isDue = ch.status === 'pending' && ch.direction === 'received' && normalizeDigitsForCompare(ch.due_date) <= today;
    if (isDue) dueTodayIds.push(ch.id);
    return `<tr${isDue ? ' style="background:var(--warning-100)"' : ''}>
      <td>${ch.party_name || '—'}</td><td title="${wordsTitle(ch.amount)}">${fmt(ch.amount)}</td><td>${ch.due_date}${isDue ? ' <span class="badge badge-orange">سررسید شده</span>' : ''}</td><td>${dirLabel[ch.direction] || ch.direction}</td>
      <td><span class="badge badge-${st[1]}">${st[0]}</span></td>
      <td>
        ${ch.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="setCheckStatus(${ch.id},'cashed')">وصول شد</button>
        <button class="btn btn-sm btn-danger" onclick="setCheckStatus(${ch.id},'bounced')">برگشت خورد</button>` : '—'}
      </td>
    </tr>`;
  }).join('');
  const settleBtn = $('#btn-settle-due-checks');
  if (dueTodayIds.length) {
    settleBtn.classList.remove('hidden');
    settleBtn.textContent = `تسویه سریع ${toFaDigits(dueTodayIds.length)} چک سررسید شده`;
    settleBtn.onclick = () => settleDueChecks(dueTodayIds);
  } else {
    settleBtn.classList.add('hidden');
  }
}
async function settleDueChecks(ids) {
  if (!confirm(`${toFaDigits(ids.length)} چک سررسیدشده به‌عنوان «وصول شد» ثبت شود؟`)) return;
  let okCount = 0;
  for (const id of ids) {
    const res = await api('PUT', `/checks/${id}`, { status: 'cashed' });
    if (res && res.ok) okCount++;
  }
  toast(`${toFaDigits(okCount)} چک با موفقیت وصول ثبت شد`, 'success');
  loadChecks();
}
async function setCheckStatus(id, status) {
  const res = await api('PUT', `/checks/${id}`, { status });
  if (res && res.ok) { toast('بروزرسانی شد', 'success'); loadChecks(); }
}

// ===================== صندوق =====================
// ===================== بانک =====================
async function loadBankPage() {
  const accounts = await api('GET', '/bank-accounts');
  state.bankAccounts = accounts || [];

  $('#bank-accounts-grid').innerHTML = state.bankAccounts.map(a => `
    <div class="stat-card primary" title="${wordsTitle(a.balance)}">
      <div class="stat-label">${a.name}${a.bank_name ? ' — ' + a.bank_name : ''}</div>
      <div class="stat-value">${fmt(a.balance)} تومان</div>
    </div>`).join('') || '<p class="muted">هنوز حساب بانکی تعریف نشده.</p>';

  const bankOptions = state.bankAccounts.map(a => `<option value="bank:${a.id}">${a.name}</option>`).join('');
  $('#transfer-from').innerHTML = `<option value="cash:">صندوق</option>${bankOptions}`;
  $('#transfer-to').innerHTML = `<option value="cash:">صندوق</option>${bankOptions}`;
  $('#bank-tx-account').innerHTML = state.bankAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#statement-account').innerHTML = state.bankAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  attachThousandsFormatting($('#transfer-amount'));
  attachThousandsFormatting($('#bank-tx-amount'));

  if (state.bankAccounts.length) loadBankStatement();
}

$('#btn-new-bank-account').addEventListener('click', () => {
  openModal(`
    <h3>حساب بانکی جدید</h3>
    <div class="field"><label>نام حساب (مثلاً: حساب اصلی مغازه)</label><input id="nba-name"></div>
    <div class="field"><label>نام بانک</label><input id="nba-bank"></div>
    <div class="field"><label>شماره حساب/کارت</label><input id="nba-number"></div>
    <div class="field"><label>موجودی اولیه</label><input type="text" inputmode="decimal" id="nba-balance" value="0"></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">انصراف</button><button class="btn btn-primary" id="save-bank-account-btn">ذخیره</button></div>`);
  attachThousandsFormatting($('#nba-balance'));
  $('#save-bank-account-btn').addEventListener('click', async () => {
    const name = $('#nba-name').value.trim();
    if (!name) { toast('نام حساب الزامی است', 'danger'); return; }
    const res = await api('POST', '/bank-accounts', {
      name, bank_name: $('#nba-bank').value.trim(), account_number: $('#nba-number').value.trim(),
      balance: readAmount($('#nba-balance')), username: state.user.username,
    });
    if (res && res.ok) { toast('حساب اضافه شد', 'success'); closeModal(); loadBankPage(); }
    else toast((res && res.message) || 'خطا', 'danger');
  });
});

$('#btn-do-transfer').addEventListener('click', async () => {
  const [fromType, fromId] = $('#transfer-from').value.split(':');
  const [toType, toId] = $('#transfer-to').value.split(':');
  const amount = readAmount($('#transfer-amount'));
  if (!amount) { toast('مبلغ را وارد کن', 'danger'); return; }
  if (fromType === toType && fromId === toId) { toast('مبدأ و مقصد نمی‌تواند یکی باشد', 'danger'); return; }
  const res = await api('POST', '/bank-transfer', {
    from_type: fromType, from_id: fromId ? parseInt(fromId) : null,
    to_type: toType, to_id: toId ? parseInt(toId) : null,
    amount, description: $('#transfer-desc').value.trim(), username: state.user.username,
  });
  if (res && res.ok) {
    toast('انتقال با موفقیت ثبت شد', 'success');
    $('#transfer-amount').value = ''; $('#transfer-desc').value = '';
    loadBankPage();
  } else if (res) toast(res.message || 'خطا در انتقال', 'danger');
});

$('#btn-bank-tx-submit').addEventListener('click', async () => {
  const accountId = $('#bank-tx-account').value;
  const amount = readAmount($('#bank-tx-amount'));
  if (!accountId || !amount) { toast('حساب و مبلغ را وارد کن', 'danger'); return; }
  const res = await api('POST', `/bank-accounts/${accountId}/transaction`, {
    tx_type: $('#bank-tx-type').value, amount, description: $('#bank-tx-desc').value.trim(), username: state.user.username,
  });
  if (res && res.ok) {
    toast('تراکنش ثبت شد', 'success');
    $('#bank-tx-amount').value = ''; $('#bank-tx-desc').value = '';
    loadBankPage();
  } else if (res) toast(res.message || 'خطا', 'danger');
});

$('#statement-account').addEventListener('change', loadBankStatement);
async function loadBankStatement() {
  const accountId = $('#statement-account').value;
  if (!accountId) { $('#bank-statement-tbody').innerHTML = ''; return; }
  const data = await api('GET', `/bank-accounts/${accountId}/statement`);
  if (!data) return;
  const typeLabel = { deposit: 'واریز', withdrawal: 'برداشت', transfer_in: 'انتقال ورودی', transfer_out: 'انتقال خروجی' };
  $('#bank-statement-tbody').innerHTML = (data.transactions || []).map(tx => `
    <tr><td>${toJalaliDate(tx.date, true)}</td><td>${typeLabel[tx.tx_type] || tx.tx_type}</td>
    <td title="${wordsTitle(tx.amount)}">${fmt(tx.amount)}</td><td>${tx.description || '—'}</td></tr>`
  ).join('') || '<tr><td colspan="4" class="muted">تراکنشی ثبت نشده</td></tr>';
}

const EXPENSE_CATEGORY_LABELS = {
  rent: 'اجاره', salary: 'حقوق پرسنل', utilities: 'قبوض', repairs: 'تعمیر و نگهداری',
  transport: 'حمل و نقل', supplies: 'لوازم مصرفی مغازه', other: 'متفرقه',
};
async function loadCash() {
  attachThousandsFormatting($('#cash-amount'));
  attachWordsPreview($('#cash-amount'), 'cash-amount-words');
  attachThousandsFormatting($('#cash-closing-counted'));
  attachWordsPreview($('#cash-closing-counted'), 'cash-closing-counted-words');
  const data = await api('GET', '/cash');
  if (!data) return;
  $('#cash-stat').innerHTML = `<div class="stat-card accent" title="${wordsTitle(data.balance)}"><div class="stat-label">موجودی صندوق</div><div class="stat-value">${fmt(data.balance)} تومان</div></div>`;
  $('#cash-tbody').innerHTML = data.transactions.map(tx => `
    <tr><td>${toJalaliDate(tx.date, true)}</td><td>${tx.tx_type === 'in' ? 'دریافت' : 'پرداخت'}</td><td title="${wordsTitle(tx.amount)}">${fmt(tx.amount)}</td>
    <td>${tx.expense_category ? (EXPENSE_CATEGORY_LABELS[tx.expense_category] || tx.expense_category) : '—'}</td>
    <td>${tx.description || '—'}</td></tr>`).join('');
  loadCashClosings();
}
$('#cash-type').addEventListener('change', () => {
  $('#cash-expense-category').style.display = $('#cash-type').value === 'out' ? '' : 'none';
});
$('#btn-add-cash').addEventListener('click', async () => {
  const amount = readAmount($('#cash-amount'));
  if (!amount) { toast('مبلغ را وارد کنید', 'danger'); return; }
  const txType = $('#cash-type').value;
  const res = await api('POST', '/cash', {
    tx_type: txType, amount, description: $('#cash-desc').value, username: state.user.username,
    expense_category: txType === 'out' ? ($('#cash-expense-category').value || null) : null,
  });
  if (res && res.ok) { toast('ثبت شد', 'success'); $('#cash-amount').value = ''; $('#cash-desc').value = ''; $('#cash-expense-category').value = ''; loadCash(); }
});

async function loadCashClosings() {
  const data = await api('GET', '/cash/closings');
  if (!data) return;
  $('#cash-closings-tbody').innerHTML = data.map(c => `
    <tr><td>${toJalaliDate(c.created_at, true)}</td><td>${fmt(c.expected_balance)}</td><td>${fmt(c.counted_balance)}</td>
    <td style="color:${c.difference === 0 ? 'var(--accent)' : 'var(--danger)'}">${fmt(c.difference)}</td>
    <td>${escHtml(c.note) || '—'}</td><td>${escHtml(c.username) || '—'}</td></tr>`).join('');
}
$('#btn-close-cash').addEventListener('click', async () => {
  if (!$('#cash-closing-counted').value.trim()) { toast('مبلغ شمارش‌شده را وارد کنید', 'danger'); return; }
  const counted = readAmount($('#cash-closing-counted'));
  const res = await api('POST', '/cash/closings', {
    counted_balance: counted, note: $('#cash-closing-note').value.trim(), username: state.user.username,
  });
  if (res && res.ok) {
    const diffMsg = res.difference === 0 ? 'صندوق مطابقت دارد ✅' : `⚠️ اختلاف: ${fmt(Math.abs(res.difference))} تومان (${res.difference > 0 ? 'اضافه' : 'کسری'})`;
    toast(`بستن صندوق ثبت شد — ${diffMsg}`, res.difference === 0 ? 'success' : 'danger');
    $('#cash-closing-counted').value = ''; $('#cash-closing-note').value = '';
    loadCashClosings();
  }
});

// ===================== گزارش ماهانه =====================
async function loadMonthly() {
  const data = await api('GET', `/reports/monthly?role=${state.user.role}`);
  if (!data) return;
  $('#monthly-tbody').innerHTML = data.map(m => `
    <tr><td>${toJalaliMonthLabel(m.month)}</td><td title="${wordsTitle(m.sales)}">${fmt(m.sales)}</td><td title="${wordsTitle(m.purchases)}">${m.purchases === null ? '—' : fmt(m.purchases)}</td>
    <td style="color:${m.profit >= 0 ? 'var(--accent)' : 'var(--danger)'}" title="${m.profit !== null ? wordsTitle(Math.abs(m.profit)) : ''}">${m.profit === null ? '—' : fmt(m.profit)}</td></tr>`).join('');
  drawBarChart($('#monthly-chart'), data.map(m => toJalaliMonthLabel(m.month)), data.map(m => m.profit || 0));
}

// ===================== گزارش‌های تکمیلی =====================
async function loadExtraReports() {
  const isAdmin = state.user.role === 'admin';
  $('#admin-only-reports-grid').classList.toggle('hidden', !isAdmin);
  const [debtors, creditors, topItems, byEmployee, expenses] = await Promise.all([
    api('GET', '/reports/debtors'), api('GET', '/reports/creditors'), api('GET', '/reports/top-items'),
    isAdmin ? api('GET', '/reports/by-employee') : Promise.resolve(null),
    isAdmin ? api('GET', '/reports/expenses') : Promise.resolve(null),
  ]);
  if (byEmployee) $('#by-employee-tbody').innerHTML = byEmployee.map(e => `<tr><td>${escHtml(e.username)}</td><td>${fmt(e.invoice_count)}</td><td title="${wordsTitle(e.total_amount)}">${fmt(e.total_amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">فروشی ثبت نشده</td></tr>';
  if (expenses) $('#expenses-tbody').innerHTML = expenses.categories.map(c => `<tr><td>${EXPENSE_CATEGORY_LABELS[c.category] || c.category}</td><td>${fmt(c.tx_count)}</td><td title="${wordsTitle(c.total_amount)}">${fmt(c.total_amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">هزینه‌ای ثبت نشده</td></tr>';
  if (debtors) $('#debtors-tbody').innerHTML = debtors.map(p => `<tr><td>${p.name}</td><td>${p.phone || '—'}</td><td title="${wordsTitle(p.balance)}">${fmt(p.balance)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">بدهکاری ثبت نشده</td></tr>';
  if (creditors) $('#creditors-tbody').innerHTML = creditors.map(p => `<tr><td>${p.name}</td><td>${p.phone || '—'}</td><td title="${wordsTitle(p.owed_amount)}">${fmt(p.owed_amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">بدهی‌ای ثبت نشده</td></tr>';
  if (topItems) $('#top-items-tbody').innerHTML = topItems.map(it => `<tr><td>${it.name}</td><td>${it.brand || '—'}</td><td>${fmt(it.total_qty)}</td><td title="${wordsTitle(it.total_amount)}">${fmt(it.total_amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">فروشی ثبت نشده</td></tr>';
}

// ===================== پشتیبان‌گیری =====================
// ===================== تنظیمات فاکتور (نام/تلفن/آدرس/لوگو) =====================
// ===================== تنظیمات کلی (زیرتب‌ها) =====================
let settingsSubnavBound = false;
async function loadSettingsHub() {
  if (!settingsSubnavBound) {
    settingsSubnavBound = true;
    $$('.settings-subnav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.settings-subnav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.settings-subpage').forEach(p => p.classList.remove('active'));
        const sub = btn.dataset.subtab;
        $('#subpage-' + sub).classList.add('active');
        if (sub === 'shop-info') loadShopSettings();
        else if (sub === 'backup') loadBackup();
        else if (sub === 'users') loadUsers();
        else if (sub === 'activity') loadActivity();
        else if (sub === 'security-log') loadSecurityLog();
      });
    });
  }
  // پیش‌فرض: نمایش اولین زیرتب (اطلاعات فاکتور)
  $$('.settings-subnav-btn').forEach(b => b.classList.remove('active'));
  $('.settings-subnav-btn[data-subtab="shop-info"]').classList.add('active');
  $$('.settings-subpage').forEach(p => p.classList.remove('active'));
  $('#subpage-shop-info').classList.add('active');
  loadShopSettings();
}

async function loadShopSettings() {
  const s = await api('GET', '/settings/shop');
  if (!s) return;
  $('#shop-name').value = s.name || '';
  $('#shop-phones').value = s.phones || '';
  $('#shop-address').value = s.address || '';
  $('#shop-next-invoice-number').value = s.next_invoice_number || '';
  renderLogoPreview(s.logo_url);
}
function renderLogoPreview(logoUrl) {
  const el = $('#shop-logo-preview');
  el.innerHTML = logoUrl
    ? `<img src="${logoUrl}?t=${Date.now()}" alt="لوگو" style="max-height:70px;border:1px solid var(--border);border-radius:8px;padding:6px">`
    : '<span class="muted">هنوز لوگویی آپلود نشده</span>';
}
$('#btn-save-shop-info').addEventListener('click', async () => {
  const res = await api('POST', '/settings/shop', {
    name: $('#shop-name').value.trim(), phones: $('#shop-phones').value.trim(), address: $('#shop-address').value.trim(),
  });
  if (res && res.ok) toast('اطلاعات مغازه ذخیره شد', 'success');
});
$('#btn-save-next-invoice-number').addEventListener('click', async () => {
  const val = $('#shop-next-invoice-number').value;
  if (!val) { toast('یک شماره وارد کن', 'danger'); return; }
  const res = await api('POST', '/settings/shop', { next_invoice_number: val });
  if (res && res.ok) {
    toast('شماره فاکتور بعدی ذخیره شد', 'success');
    loadShopSettings();
  } else if (res) {
    toast(res.message || 'خطا در ذخیره', 'danger');
  }
});
$('#btn-upload-logo').addEventListener('click', async () => {
  const fileInput = $('#shop-logo-file');
  if (!fileInput.files.length) { toast('یک فایل انتخاب کن', 'danger'); return; }
  const formData = new FormData();
  formData.append('logo', fileInput.files[0]);
  try {
    const headers = {};
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch('/settings/shop/logo', { method: 'POST', body: formData, headers });
    const data = await res.json();
    if (data.ok) {
      toast('لوگو آپلود شد', 'success');
      renderLogoPreview(data.logo_url);
      fileInput.value = '';
    } else {
      toast(data.message || 'خطا در آپلود', 'danger');
    }
  } catch (e) {
    toast('ارتباط با سرور برقرار نشد', 'danger');
  }
});
$('#btn-remove-logo').addEventListener('click', async () => {
  if (!confirm('آیا از حذف لوگو مطمئنی؟')) return;
  const res = await api('DELETE', '/settings/shop/logo');
  if (res && res.ok) { toast('لوگو حذف شد', 'success'); renderLogoPreview(null); }
});

// ===================== اسکن فاکتور خرید با هوش مصنوعی =====================
let aiScanExtractedItems = [];

async function loadAiScanPage() {
  $('#ai-scan-result-card').classList.add('hidden');
  $('#ai-scan-file').value = '';
  const parties = await api('GET', '/parties?type=supplier');
  state.suppliersList = parties || [];
  $('#ai-scan-party-suggestions').innerHTML = state.suppliersList.map(p => `<option value="${p.name}">`).join('');
  $('#ai-scan-party-name').value = '';
}

function findMatchingItem(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return state.items.find(it => it.name.toLowerCase() === n) ||
         state.items.find(it => it.name.toLowerCase().includes(n) || n.includes(it.name.toLowerCase())) ||
         null;
}

$('#btn-ai-scan').addEventListener('click', async () => {
  const fileInput = $('#ai-scan-file');
  if (!fileInput.files.length) { toast('یک عکس انتخاب کن', 'danger'); return; }
  $('#ai-scan-loading').classList.remove('hidden');
  $('#ai-scan-result-card').classList.add('hidden');

  const formData = new FormData();
  formData.append('photo', fileInput.files[0]);
  formData.append('method', $('#ai-scan-method').value);
  let result;
  try {
    const headers = {};
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch('/ai/analyze-invoice-photo', { method: 'POST', body: formData, headers });
    result = await res.json();
  } catch (e) {
    $('#ai-scan-loading').classList.add('hidden');
    toast('ارتباط با سرور برقرار نشد', 'danger');
    return;
  }
  $('#ai-scan-loading').classList.add('hidden');
  if (!result.ok) {
    toast(result.message || 'خطا در آنالیز عکس', 'danger');
    return;
  }
  try {
    const items = await api('GET', `/items?role=${state.user.role}`);
    state.items = items || [];
    aiScanExtractedItems = (result.data.items || []).map(it => ({
      name: it.name, qty: it.qty || 1, unit_price: it.unit_price || 0,
      matched_item_id: findMatchingItem(it.name)?.id || null,
      include: true,
    }));
    renderAiScanResults(result.data);
  } catch (e) {
    console.error('AI scan render error:', e);
    toast('عکس با موفقیت آنالیز شد ولی نمایش نتیجه با خطا مواجه شد — یک‌بار صفحه را کامل رفرش کن (Ctrl+Shift+R) و دوباره امتحان کن', 'danger');
  }
});

function renderAiScanResults(data) {
  const card = $('#ai-scan-result-card');
  if (!card) throw new Error('عنصر ai-scan-result-card در صفحه پیدا نشد — احتمالاً نسخه صفحه قدیمی کش شده است');
  card.classList.remove('hidden');

  const summaryBox = $('#ai-summary-box');
  if (!summaryBox) throw new Error('عنصر ai-summary-box در صفحه پیدا نشد — احتمالاً نسخه صفحه قدیمی کش شده است');
  summaryBox.innerHTML = `
    <div class="item"><span class="k">تامین‌کننده تشخیص‌داده‌شده</span><span class="v">${data.supplier_name || '— خوانا نبود —'}</span></div>
    <div class="item"><span class="k">شماره فاکتور روی برگه</span><span class="v">${data.invoice_number || '—'}</span></div>
    <div class="item"><span class="k">تاریخ روی برگه</span><span class="v">${data.date || '—'}</span></div>
    <div class="item"><span class="k">تعداد ردیف شناسایی‌شده</span><span class="v">${(data.items || []).length}</span></div>
  `;

  const partyNameInput = $('#ai-scan-party-name');
  if (partyNameInput) partyNameInput.value = data.supplier_name || '';
  renderAiScanTable();
}

function renderAiScanTable() {
  $('#ai-scan-items-tbody').innerHTML = aiScanExtractedItems.map((row, i) => {
    const itemOptions = state.items.map(it =>
      `<option value="${it.id}" ${row.matched_item_id === it.id ? 'selected' : ''}>${it.name}</option>`).join('');
    return `
    <tr>
      <td><input type="checkbox" ${row.include ? 'checked' : ''} onchange="aiScanExtractedItems[${i}].include=this.checked"></td>
      <td>${row.name}</td>
      <td>
        <select onchange="aiScanExtractedItems[${i}].matched_item_id = this.value === 'NEW' ? null : parseInt(this.value)">
          <option value="NEW" ${row.matched_item_id ? '' : 'selected'}>+ کالای جدید با همین نام</option>
          ${itemOptions}
        </select>
      </td>
      <td><input type="number" step="any" value="${row.qty}" style="width:70px" onchange="aiScanExtractedItems[${i}].qty=parseFloat(this.value)||0"></td>
      <td><input type="text" inputmode="decimal" value="${row.unit_price.toLocaleString('en-US')}" style="width:100px"
          onchange="aiScanExtractedItems[${i}].unit_price=parseFloat(this.value.replace(/,/g,''))||0; renderAiScanTable();"></td>
    </tr>`;
  }).join('');
  const total = aiScanExtractedItems.filter(r => r.include).reduce((s, r) => s + r.qty * r.unit_price, 0);
  $('#ai-scan-total').textContent = `جمع کل (فقط ردیف‌های تیک‌خورده): ${fmt(total)} تومان`;
}

async function resolveSupplierByName(name) {
  name = (name || '').trim();
  if (!name) return null;
  const existing = state.suppliersList.find(p => p.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  // تامین‌کننده جدید — با نام تشخیص‌داده‌شده خودکار ساخته می‌شود (بعداً می‌تونی تلفن/آدرسش رو کامل کنی)
  const res = await api('POST', '/parties', {
    name, type: 'supplier', _auto_created: true, username: state.user.username,
  });
  return (res && res.ok) ? res.id : null;
}

$('#btn-ai-scan-confirm').addEventListener('click', () => {
  const rows = aiScanExtractedItems.filter(r => r.include && r.qty > 0);
  if (!rows.length) { toast('هیچ ردیفی برای ثبت انتخاب نشده', 'danger'); return; }

  const supplierName = $('#ai-scan-party-name').value.trim() || 'بدون تامین‌کننده';
  const payLabel = { cash: 'نقدی', credit: 'نسیه' }[$('#ai-scan-pay').value];
  const total = rows.reduce((s, r) => s + r.qty * r.unit_price, 0);

  const rowsHtml = rows.map(r => {
    const matched = state.items.find(it => it.id === r.matched_item_id);
    return `<tr>
      <td>${r.name}${matched ? '' : ' <span class="badge badge-orange">کالای جدید</span>'}</td>
      <td>${fmt(r.qty)}</td><td>${fmt(r.unit_price)}</td><td>${fmt(r.qty * r.unit_price)}</td>
    </tr>`;
  }).join('');

  openModal(`
    <h3>پیش‌نمایش نهایی فاکتور خرید — قبل از ثبت بررسی کن</h3>
    <div class="ai-summary-box">
      <div class="item"><span class="k">تامین‌کننده</span><span class="v">${supplierName}</span></div>
      <div class="item"><span class="k">نوع پرداخت</span><span class="v">${payLabel}</span></div>
      <div class="item"><span class="k">تعداد ردیف</span><span class="v">${rows.length}</span></div>
    </div>
    <table class="data-table">
      <thead><tr><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <table class="totals" style="margin-top:10px">
      <tr class="grand"><td class="label">جمع نهایی:</td><td class="value">${fmt(total)} تومان</td></tr>
    </table>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">بازگشت و ویرایش</button>
      <button class="btn btn-primary" id="ai-scan-final-confirm-btn">تأیید نهایی و ثبت فاکتور</button>
    </div>`);

  $('#ai-scan-final-confirm-btn').addEventListener('click', async () => {
    closeModal();
    await actuallySubmitAiScanInvoice(rows);
  });
});

async function actuallySubmitAiScanInvoice(rows) {
  const finalItems = [];
  for (const row of rows) {
    let itemId = row.matched_item_id;
    if (!itemId) {
      // کالای جدید با همین نام و قیمت‌ها ساخته می‌شود
      const res = await api('POST', '/items', {
        name: row.name, unit: 'عدد', purchase_price: row.unit_price, sale_price: row.unit_price,
        stock_qty: 0, min_stock: 0,
      });
      if (res && res.ok) {
        const allItems = await api('GET', `/items?role=${state.user.role}`);
        const created = (allItems || []).find(it => it.name === row.name);
        itemId = created ? created.id : null;
      }
    }
    if (itemId) finalItems.push({ item_id: itemId, qty: row.qty, unit_price: row.unit_price });
  }

  if (!finalItems.length) { toast('مشکلی در ثبت کالاها پیش آمد', 'danger'); return; }

  const partyId = await resolveSupplierByName($('#ai-scan-party-name').value);

  const payload = {
    invoice_type: 'purchase',
    party_id: partyId,
    payment_type: $('#ai-scan-pay').value,
    username: state.user.username,
    items: finalItems,
  };
  const res = await api('POST', '/invoices', payload);
  if (res && res.ok) {
    toast(`فاکتور خرید ${res.invoice_number} با موفقیت ثبت شد`, 'success');
    $('#ai-scan-result-card').classList.add('hidden');
    $('#ai-scan-file').value = '';
    aiScanExtractedItems = [];
  } else if (res) {
    toast(res.message || 'خطا در ثبت فاکتور', 'danger');
  }
}

// ===================== ثبت مرجوعی متصل به یک فاکتور اصلی =====================
let returnModalState = { invoiceId: null, items: [] };

async function openReturnModal(invoiceId) {
  const invoice = state.invoicesById[invoiceId];
  if (!invoice) { toast('اطلاعات فاکتور پیدا نشد', 'danger'); return; }
  const items = await api('GET', `/invoices/${invoiceId}/items`);
  if (!items) return;

  returnModalState = { invoiceId, invoice, items: items.map(it => ({ ...it, return_qty: 0 })) };
  const isSale = invoice.invoice_type === 'sale';

  openModal(`
    <h3>ثبت مرجوعی برای فاکتور ${invoice.number || invoice.id}</h3>
    <p class="muted">تعداد کالایی که ${isSale ? 'مشتری پس آورده' : 'به تامین‌کننده پس داده‌ای'} را وارد کن (حداکثر تا سقف تعداد خریداری‌شده).</p>
    <table class="data-table">
      <thead><tr><th>کالا</th><th>تعداد خریداری‌شده</th><th>قیمت واحد</th><th>تعداد مرجوعی</th></tr></thead>
      <tbody id="return-modal-tbody"></tbody>
    </table>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">انصراف</button>
      <button class="btn btn-primary" id="return-modal-submit">ثبت فاکتور مرجوعی</button>
    </div>`);

  $('#return-modal-tbody').innerHTML = returnModalState.items.map((it, i) => `
    <tr>
      <td>${it.item_name}</td><td>${fmt_qty_js(it.qty)}</td><td>${fmt(it.unit_price)}</td>
      <td><input type="number" step="any" min="0" max="${it.qty}" value="0" style="width:80px"
          onchange="returnModalState.items[${i}].return_qty = Math.min(parseFloat(this.value)||0, ${it.qty})"></td>
    </tr>`).join('');

  $('#return-modal-submit').addEventListener('click', submitReturnInvoice);
}

function fmt_qty_js(q) {
  q = Number(q) || 0;
  return q % 1 === 0 ? String(q) : String(q);
}

async function submitReturnInvoice() {
  const { invoice, items } = returnModalState;
  const toReturn = items.filter(it => it.return_qty > 0);
  if (!toReturn.length) { toast('حداقل برای یک کالا تعداد مرجوعی وارد کن', 'danger'); return; }

  const effectiveType = invoice.invoice_type === 'sale' ? 'sale_return' : 'purchase_return';
  const payload = {
    invoice_type: effectiveType,
    party_id: invoice.party_id || null,
    payment_type: invoice.payment_type || 'cash',
    username: state.user.username,
    description: `مرجوعی از فاکتور ${invoice.number || invoice.id}`,
    items: toReturn.map(it => ({ item_id: it.item_id, qty: it.return_qty, unit_price: it.unit_price })),
  };
  const res = await api('POST', '/invoices', payload);
  if (res && res.ok) {
    toast(`فاکتور مرجوعی ${res.invoice_number} ثبت شد`, 'success');
    closeModal();
    loadHistory();
    loadItems();
  }
}

// ===================== افزایش قیمت گروهی (با پیش‌نمایش و تاریخچه) =====================
let bulkPriceRows = [];

async function loadBulkPricePage() {
  $('#bulk-price-preview-card').classList.add('hidden');
  await refreshPriceHistory();
  const categories = await api('GET', '/categories');
  const select = $('#bulk-price-category');
  const currentValue = select.value;
  select.innerHTML = '<option value="">همه دسته‌ها</option>' +
    (categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  select.value = currentValue;
}

$('#btn-bulk-price-preview').addEventListener('click', async () => {
  const percent = parseFloat($('#bulk-price-percent').value);
  if (isNaN(percent)) { toast('درصد را وارد کن', 'danger'); return; }
  const target = $('#bulk-price-target').value;
  const categoryId = $('#bulk-price-category').value;
  let items = await api('GET', '/items');
  if (!items) return;
  if (categoryId) items = items.filter(it => String(it.category_id) === categoryId);
  if (!items.length) { toast('کالایی در این دسته‌بندی پیدا نشد', 'danger'); return; }

  const factor = 1 + percent / 100;
  bulkPriceRows = items.map(it => ({
    item_id: it.id, name: it.name,
    old_purchase_price: it.purchase_price, old_sale_price: it.sale_price,
    new_purchase_price: (target === 'purchase' || target === 'both') ? Math.round(it.purchase_price * factor) : it.purchase_price,
    new_sale_price: (target === 'sale' || target === 'both') ? Math.round(it.sale_price * factor) : it.sale_price,
    include: true,
  }));
  renderBulkPriceTable();
  $('#bulk-price-preview-card').classList.remove('hidden');
});

function renderBulkPriceTable() {
  $('#bulk-price-tbody').innerHTML = bulkPriceRows.map((r, i) => `
    <tr>
      <td><input type="checkbox" ${r.include ? 'checked' : ''} onchange="bulkPriceRows[${i}].include=this.checked"></td>
      <td>${r.name}</td>
      <td>${fmt(r.old_purchase_price)}</td>
      <td><input type="text" inputmode="decimal" value="${r.new_purchase_price.toLocaleString('en-US')}" style="width:100px"
          onchange="bulkPriceRows[${i}].new_purchase_price=parseFloat(this.value.replace(/,/g,''))||0"></td>
      <td>${fmt(r.old_sale_price)}</td>
      <td><input type="text" inputmode="decimal" value="${r.new_sale_price.toLocaleString('en-US')}" style="width:100px"
          onchange="bulkPriceRows[${i}].new_sale_price=parseFloat(this.value.replace(/,/g,''))||0"></td>
    </tr>`).join('');
}

$('#btn-bulk-price-apply').addEventListener('click', async () => {
  const changes = bulkPriceRows.filter(r => r.include).map(r => ({
    item_id: r.item_id, new_purchase_price: r.new_purchase_price, new_sale_price: r.new_sale_price,
  }));
  if (!changes.length) { toast('حداقل یک کالا باید تیک خورده باشد', 'danger'); return; }
  const percent = $('#bulk-price-percent').value;
  const target = $('#bulk-price-target').selectedOptions[0].textContent;
  const categorySelect = $('#bulk-price-category');
  const categoryName = categorySelect.value ? categorySelect.selectedOptions[0].textContent : null;
  if (!confirm(`آیا مطمئنی می‌خوای قیمت ${changes.length} کالا رو تغییر بدی؟`)) return;

  const note = `تغییر ${percent}٪ روی ${target}` + (categoryName ? ` — دسته: ${categoryName}` : '');
  const res = await api('POST', '/items/apply-bulk-prices', {
    changes, note, username: state.user.username,
  });
  if (res && res.ok) {
    toast(`قیمت ${res.updated_count} کالا با موفقیت تغییر کرد`, 'success');
    $('#bulk-price-preview-card').classList.add('hidden');
    bulkPriceRows = [];
    loadItems();
    refreshPriceHistory();
  }
});

async function refreshPriceHistory() {
  const history = await api('GET', '/price-history');
  $('#price-history-tbody').innerHTML = (history || []).map(h => `
    <tr>
      <td>${toJalaliDate(h.changed_at, true)}</td><td>${h.item_name}</td>
      <td>${fmt(h.old_purchase_price)} ← ${fmt(h.new_purchase_price)}</td>
      <td>${fmt(h.old_sale_price)} ← ${fmt(h.new_sale_price)}</td>
      <td>${h.note || '—'}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="revertPriceHistory(${h.id})">بازگردانی</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">هنوز تغییری ثبت نشده</td></tr>';
}

async function revertPriceHistory(historyId) {
  if (!confirm('آیا می‌خوای قیمت این کالا به مقدار قبل از این تغییر برگرده؟')) return;
  const res = await api('POST', `/price-history/${historyId}/revert`, { username: state.user.username });
  if (res && res.ok) {
    toast('قیمت بازگردانده شد', 'success');
    refreshPriceHistory();
    loadItems();
  }
}

// ===================== فروش سریع (پشت صندوق) =====================
let qsCart = [];
let qsPartySS = null;

async function loadQuickSalePage() {
  qsCart = [];
  renderQsCart();
  const [items, parties] = await Promise.all([api('GET', `/items?role=${state.user.role}`), api('GET', '/parties?type=customer')]);
  state.items = items || [];
  qsPartySS = createSearchableSelect('qs-party', (parties || []).map(p => ({ value: p.id, label: p.name })),
    { placeholder: 'جستجوی مشتری...', emptyLabel: '— بدون مشتری (نقدی ساده) —' });
  $('#qs-search').value = '';
  $('#qs-suggestions').classList.add('hidden');
  $('#qs-search').focus();
}

function qsAddItem(item) {
  const existing = qsCart.find(c => c.item_id === item.id);
  const currentQtyInCart = existing ? existing.qty : 0;
  if (currentQtyInCart + 1 > item.stock_qty) {
    toast(`❌ موجودی «${item.name}» فقط ${fmt(item.stock_qty)} عدد است`, 'danger');
    $('#qs-search').value = '';
    $('#qs-suggestions').classList.add('hidden');
    $('#qs-search').focus();
    return;
  }
  if (existing) existing.qty += 1;
  else qsCart.push({ item_id: item.id, item_name: item.name, qty: 1, unit_price: item.sale_price });
  renderQsCart();
  $('#qs-search').value = '';
  $('#qs-suggestions').classList.add('hidden');
  $('#qs-search').focus();
}

function qsValidateAndSetQty(i, input) {
  const newQty = parseFloat(input.value) || 0;
  const itemObj = state.items.find(it => it.id === qsCart[i].item_id);
  if (itemObj && newQty > itemObj.stock_qty) {
    toast(`❌ موجودی «${itemObj.name}» فقط ${fmt(itemObj.stock_qty)} عدد است`, 'danger');
    input.value = qsCart[i].qty;
    return;
  }
  qsCart[i].qty = newQty;
  renderQsCart();
}

function renderQsCart() {
  $('#qs-cart-tbody').innerHTML = qsCart.map((c, i) => `
    <tr>
      <td>${c.item_name}</td>
      <td><input type="number" step="any" value="${c.qty}" style="width:70px" onchange="qsValidateAndSetQty(${i}, this)"></td>
      <td><input type="text" inputmode="decimal" value="${c.unit_price.toLocaleString('en-US')}" style="width:100px"
          onchange="qsCart[${i}].unit_price=parseFloat(this.value.replace(/,/g,''))||0; renderQsCart();"></td>
      <td>${fmt(c.qty * c.unit_price)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="qsCart.splice(${i},1); renderQsCart();">حذف</button></td>
    </tr>`).join('');
  const total = qsCart.reduce((s, c) => s + c.qty * c.unit_price, 0);
  $('#qs-total').textContent = `جمع کل: ${fmt(total)} تومان`;
  $('#qs-total-words').textContent = total ? `به حروف: ${numberToPersianWords(total)} تومان` : '';
}

let qsCurrentMatches = [];

$('#qs-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;

  // ابتدا تطابق دقیق با کد/بارکد (برای اسکنر بارکد که خودش Enter می‌فرستد)
  const exactCode = state.items.find(it => it.code && it.code === q);
  if (exactCode) { qsAddItem(exactCode); return; }

  const matches = state.items.filter(it => it.name.toLowerCase().includes(q.toLowerCase()));
  if (matches.length === 1) { qsAddItem(matches[0]); return; }
  if (matches.length === 0) { toast('کالایی با این نام/کد پیدا نشد', 'danger'); return; }

  qsCurrentMatches = matches.slice(0, 8);
  $('#qs-suggestions').classList.remove('hidden');
  $('#qs-suggestions').innerHTML = qsCurrentMatches.map((it, i) =>
    `<div class="ss-item" style="border:1px solid var(--border);border-radius:6px;margin-bottom:4px" data-qs-idx="${i}">${it.name} — ${fmt(it.sale_price)} تومان</div>`
  ).join('');
});
$('#qs-suggestions').addEventListener('click', (e) => {
  const el = e.target.closest('[data-qs-idx]');
  if (!el) return;
  qsAddItem(qsCurrentMatches[parseInt(el.dataset.qsIdx)]);
});

$('#qs-submit').addEventListener('click', submitQuickSale);
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter' && $('#page-quick-sale').classList.contains('active')) submitQuickSale();
});

async function submitQuickSale() {
  if (!qsCart.length) { toast('سبد خرید خالی است', 'danger'); return; }
  const partyVal = qsPartySS ? qsPartySS.getValue() : '';
  const payType = $('#qs-pay').value;
  const payload = {
    invoice_type: 'sale', party_id: partyVal || null, payment_type: payType,
    username: state.user.username,
    items: qsCart.map(c => ({ item_id: c.item_id, qty: c.qty, unit_price: c.unit_price })),
  };
  const res = await api('POST', '/invoices', payload);
  if (res && res.ok) {
    toast(`فروش ${res.invoice_number} ثبت شد — جمع کل: ${fmt(res.total)} تومان`, 'success');
    celebrateSuccess();
    if (payType === 'check') {
      const due = prompt('تاریخ سررسید چک را وارد کنید (مثلاً 1404-06-01):');
      if (due) {
        await api('POST', '/checks', {
          party_id: partyVal || null, invoice_id: res.invoice_id, amount: res.total,
          due_date: due, direction: 'received', description: `چک فاکتور شماره ${res.invoice_number}`,
        });
      }
    }
    askPrintInvoice(res.invoice_id);
    qsCart = [];
    renderQsCart();
    $('#qs-search').focus();
  }
}

async function loadBackup() {
  const files = await api('GET', '/backup/list');
  $('#backup-list').innerHTML = (files || []).map(f => `
    <li style="display:flex;justify-content:space-between;align-items:center">
      <span>${f}</span>
      <button class="btn btn-sm btn-danger" onclick="restoreBackup('${f}')">بازیابی</button>
    </li>`).join('') || '<li class="muted">هنوز نسخه پشتیبانی ثبت نشده</li>';
}
$('#btn-backup-now').addEventListener('click', async () => {
  const res = await api('POST', '/backup/now');
  if (res && res.ok) { toast('نسخه پشتیبان ساخته شد', 'success'); loadBackup(); }
});
$('#btn-nightly-now').addEventListener('click', async () => {
  const res = await api('POST', '/nightly/run-now');
  if (res) toast(`ایمیل: ${res.email.message} | VPS: ${res.vps.message}`, res.email.ok ? 'success' : 'danger');
});
async function restoreBackup(filename) {
  if (!confirm(`آیا مطمئنی می‌خوای دیتابیس فعلی با نسخه «${filename}» جایگزین بشه؟`)) return;
  const res = await api('POST', '/backup/restore', { filename, username: state.user.username });
  if (res) toast(res.message, res.ok ? 'success' : 'danger');
}

// ===================== مدیریت کاربران =====================
async function loadUsers() {
  const users = await api('GET', '/users');
  $('#users-tbody').innerHTML = (users || []).map(u => `
    <tr><td>${u.username}</td><td>${u.role === 'admin' ? 'مدیر' : 'کارمند'}</td>
    <td>${u.id !== state.user.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">حذف</button>` : '—'}</td></tr>`).join('');
}
$('#btn-add-user').addEventListener('click', async () => {
  const username = $('#new-user-username').value.trim();
  const password = $('#new-user-password').value;
  if (!username || !password) { toast('نام کاربری و رمز الزامی است', 'danger'); return; }
  const res = await api('POST', '/users', { username, password, role: $('#new-user-role').value });
  if (res) {
    if (res.ok) { toast('کاربر اضافه شد', 'success'); $('#new-user-username').value = ''; $('#new-user-password').value = ''; loadUsers(); }
    else toast(res.message, 'danger');
  }
});
async function deleteUser(id) {
  if (!confirm('آیا از حذف این کاربر مطمئنی؟')) return;
  const res = await api('DELETE', `/users/${id}`);
  if (res && res.ok) { toast('حذف شد', 'success'); loadUsers(); }
}

// ===================== لاگ فعالیت =====================
async function loadActivity() {
  const logs = await api('GET', '/activity-log');
  $('#activity-tbody').innerHTML = (logs || []).map(lg =>
    `<tr><td>${toJalaliDate(lg.timestamp, true)}</td><td>${lg.username || '—'}</td><td>${lg.action}</td><td>${lg.details || '—'}</td></tr>`).join('');
}

// ===================== لاگ امنیتی =====================
async function loadSecurityLog() {
  const logs = await api('GET', '/security-log');
  $('#security-log-tbody').innerHTML = (logs || []).map(lg =>
    `<tr><td>${toJalaliDate(lg.timestamp, true)}</td><td>${escHtml(lg.username) || '—'}</td><td>${escHtml(lg.event)}</td><td>${escHtml(lg.details) || '—'}</td></tr>`).join('');
}

// ===================== شروع برنامه =====================
function initApp() {
  loadDashboard();
}
window.addEventListener('resize', () => {
  if ($('#page-dashboard').classList.contains('active')) drawBarChart($('#dashboard-chart'), [], []);
});
