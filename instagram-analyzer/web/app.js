const accountsView = document.getElementById("accounts-view");
const accountDetail = document.getElementById("account-detail");
const accountsList = document.getElementById("accounts-list");
const accountHeader = document.getElementById("account-header");
const reportsList = document.getElementById("reports-list");
const mediaTableBody = document.querySelector("#media-table tbody");

let currentAccountId = null;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const verifyRow = document.getElementById("verify-row");
const codeInput = document.getElementById("login-code");
let pendingLoginToken = null;

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    let result;
    if (pendingLoginToken) {
      result = await fetchJson("/auth/private/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login_token: pendingLoginToken,
          code: codeInput.value.trim(),
          username,
          password,
        }),
      });
    } else {
      result = await fetchJson("/auth/private/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    }

    if (result.status === "challenge_required") {
      pendingLoginToken = result.login_token;
      verifyRow.classList.remove("hidden");
      loginMessage.textContent = result.message;
    } else if (result.status === "ok") {
      pendingLoginToken = null;
      verifyRow.classList.add("hidden");
      loginForm.reset();
      loginMessage.textContent = "اکانت با موفقیت وصل شد.";
      await loadAccounts();
    }
  } catch (err) {
    loginMessage.textContent = "خطا: " + err.message;
  } finally {
    submitBtn.disabled = false;
  }
};

async function loadAccounts() {
  const accounts = await fetchJson("/accounts");
  accountsList.innerHTML = "";
  if (accounts.length === 0) {
    accountsList.innerHTML = "<p>هنوز اکانتی متصل نشده. از دکمه بالا یک اکانت اینستاگرام وصل کنید.</p>";
    return;
  }
  for (const acc of accounts) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="username">@${escapeHtml(acc.username)}</div>
      <div class="stat">فالوور: ${acc.followers_count ?? 0}</div>
      <div class="stat">پست‌ها: ${acc.media_count ?? 0}</div>
    `;
    card.onclick = () => openAccount(acc.id);
    accountsList.appendChild(card);
  }
}

async function openAccount(id) {
  currentAccountId = id;
  accountsView.classList.add("hidden");
  accountDetail.classList.remove("hidden");
  await refreshAccountDetail();
}

async function refreshAccountDetail() {
  const acc = await fetchJson(`/accounts/${currentAccountId}`);
  accountHeader.innerHTML = `
    <h2>@${escapeHtml(acc.username)}</h2>
    <p>فالوور: ${acc.followers_count} | پست‌ها: ${acc.media_count}</p>
    <p>آخرین به‌روزرسانی: ${acc.last_synced_at ? new Date(acc.last_synced_at).toLocaleString("fa-IR") : "هرگز"}</p>
  `;
  await Promise.all([loadMedia(), loadReports()]);
}

async function loadMedia() {
  const media = await fetchJson(`/accounts/${currentAccountId}/media`);
  mediaTableBody.innerHTML = "";
  for (const m of media) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml((m.caption || "").slice(0, 60))}</td>
      <td>${m.like_count}</td>
      <td>${m.comments_count}</td>
      <td>${m.reach ?? "-"}</td>
    `;
    mediaTableBody.appendChild(row);
  }
}

async function loadReports() {
  const reports = await fetchJson(`/accounts/${currentAccountId}/reports`);
  reportsList.innerHTML = "";
  if (reports.length === 0) {
    reportsList.innerHTML = "<p>هنوز گزارشی تولید نشده.</p>";
    return;
  }
  for (const r of reports) {
    const card = document.createElement("div");
    card.className = "report-card";
    card.innerHTML = `
      <div class="report-date">${new Date(r.created_at).toLocaleString("fa-IR")}</div>
      <div>${escapeHtml(r.summary_text)}</div>
    `;
    reportsList.appendChild(card);
  }
}

document.getElementById("back-btn").onclick = () => {
  accountDetail.classList.add("hidden");
  accountsView.classList.remove("hidden");
  loadAccounts();
};

document.getElementById("sync-btn").onclick = async (e) => {
  e.target.disabled = true;
  e.target.textContent = "در حال به‌روزرسانی...";
  try {
    await fetchJson(`/accounts/${currentAccountId}/sync`, { method: "POST" });
    await refreshAccountDetail();
  } catch (err) {
    alert("خطا در به‌روزرسانی: " + err.message);
  } finally {
    e.target.disabled = false;
    e.target.textContent = "به‌روزرسانی داده‌ها";
  }
};

document.getElementById("analyze-btn").onclick = async (e) => {
  e.target.disabled = true;
  e.target.textContent = "در حال تحلیل...";
  try {
    await fetchJson(`/accounts/${currentAccountId}/analyze`, { method: "POST" });
    await loadReports();
  } catch (err) {
    alert("خطا در تحلیل: " + err.message);
  } finally {
    e.target.disabled = false;
    e.target.textContent = "تحلیل با هوش‌مصنوعی";
  }
};

loadAccounts();
