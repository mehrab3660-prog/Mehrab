const state = { token: localStorage.getItem('token') || null };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STATUS_LABELS = {
  received: ['پذیرش‌شده', 'gray'], in_progress: ['در حال بررسی/تعمیر', 'orange'],
  ready: ['آماده تحویل', 'green'], delivered: ['تحویل‌شده', 'green'], cancelled: ['لغو‌شده', 'red'],
};

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}
function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(path, opts);
    if (res.status === 401) { forceLogout(); return null; }
    return await res.json();
  } catch (e) {
    console.error(e);
    toast('ارتباط با سرور برقرار نشد', 'danger');
    return null;
  }
}

function forceLogout() {
  state.token = null;
  localStorage.removeItem('token');
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() { $('#modal-overlay').classList.add('hidden'); }
$('#modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });

// دانلود/باز کردن فایل‌هایی که نیاز به لاگین دارند (چاپ رسید، دانلود بکاپ). window.open ساده
// یا <a href> کار نمی‌کند چون هدر Authorization را همراه ندارند؛ اینجا با fetch احراز
// هویت‌شده، فایل را می‌گیریم و به‌صورت Blob محلی نمایش/دانلود می‌دهیم.
async function fetchAuthedBlob(path) {
  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  try {
    const res = await fetch(path, { headers });
    if (res.status === 401) { forceLogout(); return null; }
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
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------------- ورود ----------------
async function loadShopNameIntoHeaders() {
  const s = await api('GET', '/settings');
  if (!s) return;
  $('#login-shop-name').textContent = s.shop_name || 'سیستم پذیرش دستگاه';
  $('#topbar-shop-name').textContent = s.shop_name || 'سیستم پذیرش دستگاه';
}

$('#login-btn').addEventListener('click', doLogin);
$('#login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const password = $('#login-password').value;
  const res = await fetch('/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then(r => r.json()).catch(() => null);
  if (res && res.ok) {
    state.token = res.token;
    localStorage.setItem('token', res.token);
    $('#login-error').textContent = '';
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    initApp();
  } else {
    $('#login-error').textContent = (res && res.message) || 'خطا در ورود';
  }
}
$('#btn-logout').addEventListener('click', async () => {
  await api('POST', '/logout');
  forceLogout();
});

// ---------------- داشبورد/لیست ----------------
async function loadStats() {
  const s = await api('GET', '/stats');
  if (!s) return;
  const cards = [
    { label: 'پذیرش‌شده امروز', value: s.intake_today, cls: '' },
    { label: 'در حال بررسی/تعمیر', value: s.in_progress, cls: 'warning' },
    { label: 'آماده تحویل', value: s.ready, cls: 'accent' },
    { label: 'تحویل‌شده (کل)', value: s.delivered, cls: '' },
  ];
  $('#stat-grid').innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls}"><div class="stat-label">${c.label}</div><div class="stat-value">${fmt(c.value)}</div></div>`).join('');
}

let filterTimer = null;
async function loadDevices() {
  const q = $('#filter-q').value.trim();
  const status = $('#filter-status').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const rows = await api('GET', `/devices?${params.toString()}`);
  if (!rows) return;
  $('#devices-tbody').innerHTML = rows.map(d => {
    const st = STATUS_LABELS[d.status] || ['—', 'gray'];
    return `<tr>
      <td><a href="javascript:void(0)" data-open="${d.id}"><b>${escHtml(d.ticket_number)}</b></a></td>
      <td>${escHtml(d.customer_name)}${d.customer_phone ? ' — ' + escHtml(d.customer_phone) : ''}</td>
      <td>${escHtml(d.device_brand)} ${escHtml(d.device_model)}</td>
      <td>${escHtml((d.created_at || '').slice(0, 16))}</td>
      <td><span class="badge badge-${st[1]}">${st[0]}</span></td>
      <td><button class="btn btn-secondary btn-sm" data-open="${d.id}">مشاهده</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="muted">دستگاهی ثبت نشده</td></tr>';
  $$('[data-open]', $('#devices-tbody')).forEach(el => {
    el.addEventListener('click', () => openDeviceDetail(parseInt(el.dataset.open)));
  });
}
$('#filter-q').addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(loadDevices, 250); });
$('#filter-status').addEventListener('change', loadDevices);

function refreshAll() { loadStats(); loadDevices(); }

// ---------------- پذیرش دستگاه جدید ----------------
$('#btn-new-device').addEventListener('click', () => {
  openModal(`
    <h3>پذیرش دستگاه جدید</h3>
    <div class="form-row">
      <div><label>نام مشتری *</label><input id="nd-customer-name"></div>
      <div><label>شماره تماس</label><input id="nd-customer-phone" dir="ltr"></div>
    </div>
    <div class="form-row">
      <div><label>برند دستگاه</label><input id="nd-brand" placeholder="مثلاً Samsung"></div>
      <div><label>مدل دستگاه</label><input id="nd-model" placeholder="مثلاً Galaxy A54"></div>
      <div><label>رنگ</label><input id="nd-color"></div>
    </div>
    <div class="form-row">
      <div><label>IMEI</label><input id="nd-imei" dir="ltr"></div>
      <div><label>رمز/الگوی دستگاه</label><input id="nd-password" dir="ltr"></div>
    </div>
    <div class="form-row">
      <div><label>تاریخ تحویل احتمالی</label><input type="date" id="nd-expected"></div>
      <div><label>پیش‌پرداخت (تومان)</label><input type="number" id="nd-prepayment" value="0"></div>
    </div>
    <div class="field"><label>وضعیت ظاهری</label><input id="nd-condition" placeholder="مثلاً خط‌وخش جزئی روی درب پشت"></div>
    <div class="field"><label>لوازم همراه</label><input id="nd-accessories" placeholder="مثلاً شارژر، قاب"></div>
    <div class="field"><label>مشکل اعلام‌شده توسط مشتری</label><textarea id="nd-issue" rows="2"></textarea></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">انصراف</button><button class="btn btn-primary" id="save-new-device-btn">ثبت پذیرش</button></div>
  `);
  $('#save-new-device-btn').addEventListener('click', async () => {
    const payload = {
      customer_name: $('#nd-customer-name').value.trim(), customer_phone: $('#nd-customer-phone').value.trim(),
      device_brand: $('#nd-brand').value.trim(), device_model: $('#nd-model').value.trim(),
      device_color: $('#nd-color').value.trim(), imei: $('#nd-imei').value.trim(),
      device_password: $('#nd-password').value.trim(), device_condition: $('#nd-condition').value.trim(),
      accessories: $('#nd-accessories').value.trim(), reported_issue: $('#nd-issue').value.trim(),
      expected_delivery_date: $('#nd-expected').value || null, prepayment: $('#nd-prepayment').value || 0,
    };
    const res = await api('POST', '/devices', payload);
    if (res && res.ok) {
      toast(`پذیرش ثبت شد — شماره ${res.ticket_number}`, 'success');
      closeModal();
      refreshAll();
      openDeviceDetail(res.device_id);
    } else if (res) toast(res.message || 'خطا در ثبت', 'danger');
  });
});

// ---------------- جزئیات/ویرایش دستگاه ----------------
async function openDeviceDetail(deviceId) {
  const d = await api('GET', `/devices/${deviceId}`);
  if (!d) return;
  const st = STATUS_LABELS[d.status] || ['—', 'gray'];
  const statusOptions = Object.entries(STATUS_LABELS).map(([k, v]) =>
    `<option value="${k}" ${k === d.status ? 'selected' : ''}>${v[0]}</option>`).join('');
  openModal(`
    <h3>پذیرش ${escHtml(d.ticket_number)} <span class="badge badge-${st[1]}">${st[0]}</span></h3>
    <div class="form-row">
      <div><label>وضعیت</label><select id="dd-status">${statusOptions}</select></div>
      <div style="align-self:flex-end"><button class="btn btn-primary btn-sm" id="dd-save-status">اعمال</button></div>
      <div style="align-self:flex-end"><button class="btn btn-secondary btn-sm" id="dd-print">چاپ رسید</button></div>
    </div>
    <div class="form-row">
      <div><label>نام مشتری</label><input id="dd-customer-name" value="${escHtml(d.customer_name)}"></div>
      <div><label>شماره تماس</label><input id="dd-customer-phone" value="${escHtml(d.customer_phone || '')}" dir="ltr"></div>
    </div>
    <div class="form-row">
      <div><label>برند دستگاه</label><input id="dd-brand" value="${escHtml(d.device_brand || '')}"></div>
      <div><label>مدل دستگاه</label><input id="dd-model" value="${escHtml(d.device_model || '')}"></div>
      <div><label>رنگ</label><input id="dd-color" value="${escHtml(d.device_color || '')}"></div>
    </div>
    <div class="form-row">
      <div><label>IMEI</label><input id="dd-imei" value="${escHtml(d.imei || '')}" dir="ltr"></div>
      <div><label>رمز/الگوی دستگاه</label><input id="dd-password" value="${escHtml(d.device_password || '')}" dir="ltr"></div>
    </div>
    <div class="form-row">
      <div><label>تاریخ تحویل احتمالی</label><input type="date" id="dd-expected" value="${d.expected_delivery_date || ''}"></div>
      <div><label>پیش‌پرداخت (تومان)</label><input type="number" id="dd-prepayment" value="${d.prepayment || 0}"></div>
    </div>
    <div class="field"><label>وضعیت ظاهری</label><input id="dd-condition" value="${escHtml(d.device_condition || '')}"></div>
    <div class="field"><label>لوازم همراه</label><input id="dd-accessories" value="${escHtml(d.accessories || '')}"></div>
    <div class="field"><label>مشکل اعلام‌شده</label><textarea id="dd-issue" rows="2">${escHtml(d.reported_issue || '')}</textarea></div>
    <div class="field"><label>یادداشت داخلی</label><textarea id="dd-note" rows="2">${escHtml(d.note || '')}</textarea></div>
    <p class="muted">پذیرش: ${escHtml(d.created_at)}${d.delivered_at ? ' — تحویل: ' + escHtml(d.delivered_at) : ''}</p>
    <div class="modal-actions">
      <button class="btn btn-danger" id="dd-delete">حذف</button>
      <button class="btn btn-secondary" onclick="closeModal()">بستن</button>
      <button class="btn btn-primary" id="dd-save">ذخیره تغییرات</button>
    </div>
  `);
  $('#dd-save-status').addEventListener('click', async () => {
    const res = await api('PUT', `/devices/${deviceId}/status`, { status: $('#dd-status').value });
    if (res && res.ok) { toast('وضعیت به‌روزرسانی شد', 'success'); openDeviceDetail(deviceId); refreshAll(); }
  });
  $('#dd-print').addEventListener('click', () => openAuthedInNewTab(`/devices/${deviceId}/print`));
  $('#dd-save').addEventListener('click', async () => {
    const payload = {
      customer_name: $('#dd-customer-name').value.trim(), customer_phone: $('#dd-customer-phone').value.trim(),
      device_brand: $('#dd-brand').value.trim(), device_model: $('#dd-model').value.trim(),
      device_color: $('#dd-color').value.trim(), imei: $('#dd-imei').value.trim(),
      device_password: $('#dd-password').value.trim(), device_condition: $('#dd-condition').value.trim(),
      accessories: $('#dd-accessories').value.trim(), reported_issue: $('#dd-issue').value.trim(),
      expected_delivery_date: $('#dd-expected').value || null, prepayment: $('#dd-prepayment').value || 0,
      note: $('#dd-note').value.trim(),
    };
    const res = await api('PUT', `/devices/${deviceId}`, payload);
    if (res && res.ok) { toast('ذخیره شد', 'success'); closeModal(); refreshAll(); }
    else if (res) toast(res.message || 'خطا', 'danger');
  });
  $('#dd-delete').addEventListener('click', async () => {
    if (!confirm(`پذیرش ${d.ticket_number} برای همیشه حذف شود؟`)) return;
    const res = await api('DELETE', `/devices/${deviceId}`);
    if (res && res.ok) { toast('حذف شد', 'success'); closeModal(); refreshAll(); }
  });
}

// ---------------- تنظیمات ----------------
$('#btn-settings').addEventListener('click', async () => {
  const s = await api('GET', '/settings');
  if (!s) return;
  openModal(`
    <h3>تنظیمات</h3>
    <div class="field"><label>نام مغازه/تعمیرگاه</label><input id="st-shop-name" value="${escHtml(s.shop_name || '')}"></div>
    <div class="field"><label>تلفن</label><input id="st-shop-phone" value="${escHtml(s.shop_phone || '')}" dir="ltr"></div>
    <div class="field"><label>آدرس</label><input id="st-shop-address" value="${escHtml(s.shop_address || '')}"></div>
    <button class="btn btn-primary btn-sm" id="st-save">ذخیره</button>
    <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
    <div class="field"><label>رمز فعلی</label><input type="password" id="st-current-password"></div>
    <div class="field"><label>رمز جدید</label><input type="password" id="st-new-password"></div>
    <button class="btn btn-secondary btn-sm" id="st-change-password">تغییر رمز</button>
    <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
    <button class="btn btn-secondary btn-sm" id="st-backup-now">گرفتن بکاپ همین الان</button>
    <button class="btn btn-secondary btn-sm" id="st-backup-download">دانلود فایل دیتابیس</button>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">بستن</button></div>
  `);
  $('#st-save').addEventListener('click', async () => {
    const res = await api('POST', '/settings', {
      shop_name: $('#st-shop-name').value.trim(), shop_phone: $('#st-shop-phone').value.trim(),
      shop_address: $('#st-shop-address').value.trim(),
    });
    if (res && res.ok) { toast('ذخیره شد', 'success'); loadShopNameIntoHeaders(); }
  });
  $('#st-change-password').addEventListener('click', async () => {
    const res = await api('POST', '/settings/password', {
      current_password: $('#st-current-password').value, new_password: $('#st-new-password').value,
    });
    if (res && res.ok) toast('رمز عبور تغییر کرد', 'success');
    else if (res) toast(res.message || 'خطا', 'danger');
  });
  $('#st-backup-now').addEventListener('click', async () => {
    const res = await api('POST', '/backup/now');
    if (res && res.ok) toast('بکاپ گرفته شد', 'success');
  });
  $('#st-backup-download').addEventListener('click', () => downloadAuthed('/backup/download', 'reception_backup.db'));
});

// ---------------- شروع ----------------
function initApp() { refreshAll(); }

(async function boot() {
  await loadShopNameIntoHeaders();
  if (state.token) {
    const check = await fetch('/stats', { headers: { Authorization: 'Bearer ' + state.token } });
    if (check.status === 200) {
      $('#login-screen').classList.add('hidden');
      $('#app').classList.remove('hidden');
      initApp();
      return;
    }
  }
  forceLogout();
})();
