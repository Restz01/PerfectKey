/* PERFECTKEY - key generator for every program in products.js.
   The page holds no secrets: keys are made and checked by the PERFECTKEY worker (server/worker.js), which also keeps the
   history and the inbox, so the site works the same from any computer or phone.
   Short key = 25 Crockford base32 chars (125 bits):
     type(3) | count(10) | expires(26, minutes since 2025-01-01 UTC, 0 = never) | machine(32) | serial(16) | mac(38)
   machine: FFFFFFFF = "1 key = 1 PC" (the first PC that activates it owns it - the default now),
            anything else = only that machine ID; websites: the package code. */
"use strict";
var BIND = 0xFFFFFFFF;
var SERVER = window.SERVER || { url: "" };
var TYPES = ["hour", "day", "month", "year", "perm"];
var UNIT_TH = { hour: "ชั่วโมง", day: "วัน", month: "เดือน", year: "ปี" };
var CAT_NAME = { bug: "โปรแกรมค้าง / ข้อผิดพลาด", subs: "ถอดเสียง / ซับ", cut: "ตัดช่วงเงียบ / AutoCUT", assets: "คลังไฟล์ / ทรานซิชัน",
  license: "คีย์ / เปิดใช้งาน", install: "ติดตั้ง / เปิดไม่ได้", emu: "อีมูเลเตอร์ / เกม", idea: "ข้อเสนอแนะ", other: "อื่น ๆ",
  tweak: "ปรับแต่งเครื่อง / ประสิทธิภาพ" };
var LS_PRODUCT = "pkey_product", LS_MIGRATED = "pkey_migrated_v2";
var $ = function (id) { return document.getElementById(id); };
var PRODUCTS = window.PRODUCTS || [];
var P = PRODUCTS[0];                 // the program being worked on
var sel = { t: "month", c: 1 }, last = null;
var histCache = {}, inboxCache = {};

/* ---------------- small helpers ---------------- */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsKey(p, name) { return (p.ls && p.ls[name]) || "pkey_" + p.id + "_" + name; }
function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 1900); }
function copy(text, label) {
  function done() { toast(label || "คัดลอกแล้ว ✓"); if (window.pkSound) pkSound("copy"); }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function fmt(sec) {
  if (!sec) return "ไม่มีวันหมดอายุ";
  return new Date(sec * 1000).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function ago(sec) {
  var s = Date.now() / 1000 - sec;
  if (s < 60) return "เมื่อสักครู่"; if (s < 3600) return Math.floor(s / 60) + " นาทีที่แล้ว"; if (s < 86400) return Math.floor(s / 3600) + " ชั่วโมงที่แล้ว";
  return fmt(sec);
}
function durText(t, c) { return t === "perm" ? "ถาวร" : c + " " + UNIT_TH[t]; }
function productById(id) { return PRODUCTS.filter(function (p) { return p.id === id; })[0]; }
function productByTag(tag) { return PRODUCTS.filter(function (p) { return p.tag === tag; })[0]; }

/* ---------------- server ---------------- */
function api(path, body) {
  if (!SERVER.url) return Promise.reject(new Error("ยังไม่ได้ใส่ URL ของเซิร์ฟเวอร์ใน assets/products.js"));
  var tok = window.pkToken ? window.pkToken() : "";
  return fetch(SERVER.url.replace(/\/+$/, "") + path, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok }, body: JSON.stringify(body || {}) })
    .then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }).then(function (j) { j._status = r.status; return j; }); },
      function () { throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ต"); })
    .then(function (j) {
      if (j._status === 401 && window.pkRelock) { window.pkRelock(j.error); throw new Error(j.error || "หมดเวลาเข้าสู่ระบบ"); }
      if (!j.ok) throw new Error(j.error || j.code || "ผิดพลาด");
      return j;
    });
}

/* web products (SetBio / SetDonate): no machine ID - the machine field carries the package code */
var planSel = {};
function isWeb(p) { return !!(p && p.web && p.web.plans); }
function planOf(p, code) { return isWeb(p) ? p.web.plans.filter(function (x) { return x.code === code; })[0] : null; }
function planCode(p) { if (!isWeb(p)) return 0; if (!planOf(p, planSel[p.id])) planSel[p.id] = p.web.plans[0].code; return planSel[p.id]; }
function renderPlans() {
  var web = isWeb(P);
  $("stepMachine").style.display = web ? "none" : ""; $("stepPlan").style.display = web ? "" : "none";
  if (!web) return;
  var cur = planCode(P);
  $("planChips").innerHTML = P.web.plans.map(function (x) {
    return "<button data-code='" + x.code + "'" + (x.code === cur ? " class='on'" : "") + ">" + esc(x.name) + (x.sub ? " <small style='opacity:.6'>· " + esc(x.sub) + "</small>" : "") + "</button>";
  }).join("");
  $("planHint").textContent = "คีย์นี้ใช้แทนการสมัคร: ลูกค้าวางคีย์ในหน้าเข้าสู่ระบบของ " + P.name + " แล้วตั้งชื่อผู้ใช้ · 1 คีย์ = 1 บัญชี · ระยะเวลา = อายุแพ็กเกจ";
}
$("planChips").onclick = function (e) {
  var b = e.target.closest("button"); if (!b) return;
  planSel[P.id] = +b.dataset.code; renderPlans(); update();
};

/* ---------------- program switcher ---------------- */
function renderProducts() {
  $("products").innerHTML = PRODUCTS.map(function (p) {
    var n = loadHist(p).length, unread = unreadCount(p);
    return "<button class='prod" + (p === P ? " on" : "") + "' data-id='" + esc(p.id) + "'><span class='pm'>" + esc(p.mark) + "</span>" +
      "<span class='pt'><span class='pn'>" + esc(p.name) + "</span><span class='ps'>ออกคีย์แล้ว " + n + " คีย์</span></span>" +
      (unread ? "<span class='pb badge-new on'>" + (unread > 99 ? "99+" : unread) + "</span>" : "") + "</button>";
  }).join("");
}
$("products").onclick = function (e) {
  var b = e.target.closest("button.prod"); if (!b || b.dataset.id === P.id) return;
  selectProduct(productById(b.dataset.id));
};
function selectProduct(p) {
  P = p; lsSet(LS_PRODUCT, p.id);
  document.title = "PERFECTKEY · " + p.name;
  $("current").innerHTML = "กำลังทำงานกับ <b>" + esc(p.name) + "</b> · " + esc(p.sub);
  $("genBtn").textContent = "สร้างคีย์ " + p.name;
  $("machineHint").innerHTML = "<b>เว้นว่าง (แนะนำ)</b> = 1 คีย์ใช้ได้ 1 เครื่อง ลูกค้าไม่ต้องส่งรหัสเครื่อง เครื่องแรกที่เปิดใช้งานเป็นเจ้าของ (ต่อเน็ตครั้งแรกครั้งเดียว) · " +
    "ใส่รหัสเครื่อง = ล็อกกับเครื่องนั้น ใช้ได้แม้ไม่มีเน็ต (ลูกค้าดูรหัสได้จากหน้าเปิดใช้งานของ " + esc(p.name) + ")";
  $("checkTitle").textContent = "ตรวจคีย์ " + p.name + " ที่ลูกค้าส่งมา";
  // anything typed for the previous program must not leak into this one
  $("machine").value = ""; $("machine").classList.remove("bad"); $("customer").value = ""; $("genErr").textContent = "";
  $("result").classList.remove("on"); last = null;
  $("chkIn").value = ""; $("chkOut").innerHTML = ""; $("search").value = ""; $("inboxSearch").value = "";
  renderPlans(); renderProducts(); update(); renderHist(); inboxView();
  if (pageOn("inbox")) { markRead(); fetchInbox(P); }
}

/* ---------------- tabs ---------------- */
function pageOn(name) { return $("p-" + name).classList.contains("on"); }
[].forEach.call(document.querySelectorAll(".tabs button"), function (b) {
  b.onclick = function () {
    [].forEach.call(document.querySelectorAll(".tabs button"), function (x) { x.classList.toggle("on", x === b); });
    [].forEach.call(document.querySelectorAll(".page"), function (pg) { pg.classList.toggle("on", pg.id === "p-" + b.dataset.p); });
    $("wrap").classList.toggle("wide", b.dataset.p === "hist");
    if (b.dataset.p === "hist") renderHist();
    if (b.dataset.p === "check") $("chkIn").focus();
    if (b.dataset.p === "inbox") { inboxView(); markRead(); fetchInbox(P); }
  };
});

/* ---------------- make ---------------- */
function machineHex() { var h = $("machine").value.toUpperCase().replace(/[^0-9A-F]/g, ""); return h.length >= 8 ? h.slice(0, 8) : null; }
$("machine").oninput = function () {
  // accepts "XXXX-XXXX" and PERFECTKIT's old long "XXXX-XXXX-XXXX-XXXX" (only the first 8 count)
  var h = this.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 16);
  var f = (h.match(/.{1,4}/g) || []).join("-");
  if (f !== this.value) this.value = f;
  this.classList.remove("bad"); $("genErr").textContent = "";
  update();
};
$("machine").onkeydown = function (e) { if (e.key === "Enter") $("genBtn").click(); };
$("customer").onkeydown = function (e) { if (e.key === "Enter") $("genBtn").click(); };
[].forEach.call($("chips").children, function (b) {
  b.onclick = function () {
    [].forEach.call($("chips").children, function (x) { x.classList.toggle("on", x === b); });
    sel = b.dataset.t === "custom" ? { t: "custom" } : { t: b.dataset.t, c: +b.dataset.c };
    $("custom").classList.toggle("on", sel.t === "custom");
    update();
  };
});
$("cCount").oninput = update; $("cUnit").onchange = update;

function duration() {
  if (sel.t !== "custom") return sel;
  var n = parseInt($("cCount").value, 10);
  return n >= 1 && n <= 1023 ? { t: $("cUnit").value, c: n } : null;
}
function expiry(t, c) {   // unix seconds, rounded down to the minute; 0 = never
  if (t === "perm") return 0;
  var d = new Date(); d.setSeconds(0, 0);
  if (t === "hour") d.setTime(d.getTime() + c * 3600000);
  else if (t === "day") d.setDate(d.getDate() + c);
  else { var day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (t === "year" ? 12 * c : c)); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return Math.floor(d.getTime() / 1000);
}
function update() {
  var d = duration(), m = machineHex();
  $("machine").classList.toggle("full", !!m);
  var who = isWeb(P) ? "แพ็กเกจ <b>" + esc(planOf(P, planCode(P)).name) + "</b> · 1 คีย์ = 1 บัญชี" : m ? "ล็อกกับเครื่อง <b>" + esc(m.slice(0, 4) + "-" + m.slice(4)) + "</b>" : "<b>1 เครื่อง</b> (เครื่องแรกที่เปิดใช้)";
  $("summary").innerHTML = d ? "<b>" + esc(P.name) + "</b> · " + (d.t === "perm" ? "<b>ถาวร</b> ไม่มีวันหมดอายุ" : "ใช้ได้ <b>" + durText(d.t, d.c) + "</b> ถึง <b>" + esc(fmt(expiry(d.t, d.c))) + "</b>") + " · " + who
    : "ใส่จำนวน 1–1023";
}
var making = false;
$("genBtn").onclick = function () {
  if (making) return;
  var p = P, d = duration(), m = machineHex(), typed = $("machine").value.replace(/[^0-9A-F]/gi, "");
  var web = isWeb(p), plan = web ? planCode(p) : 0;
  if (web) { m = ("00000000" + plan.toString(16).toUpperCase()).slice(-8); typed = ""; }
  if (!web && typed && !m) { $("machine").classList.add("bad"); $("genErr").textContent = "รหัสเครื่องต้องมี 8 ตัว เช่น F886-F73D (หรือเว้นว่าง = 1 เครื่อง)"; $("machine").focus(); return; }
  if (!d) { $("genErr").textContent = "ใส่จำนวนระยะเวลา 1–1023"; return; }
  var exp = expiry(d.t, d.c);
  making = true; $("genBtn").disabled = true; $("genErr").textContent = "";
  api("/admin/make", { tag: p.tag, type: d.t, count: d.t === "perm" ? 0 : d.c, expires: exp, machine: m || "", plan: plan, customer: $("customer").value.trim() }).then(function (j) {
    last = j.item; last.product = p.id;
    (histCache[p.tag] = histCache[p.tag] || []).unshift(last); renderProducts();
    if (p !== P) return;   // switched program while signing
    $("histCount").textContent = "(" + loadHist(p).length + ")";
    $("keyLabel").innerHTML = "คีย์ <b>" + esc(p.name) + "</b> ของลูกค้า";
    if (window.pkScramble) pkScramble($("keyText"), last.key); else $("keyText").textContent = last.key;
    $("keyMeta").textContent = durText(last.type, last.count) + " · " + (last.expires ? "หมดอายุ " + fmt(last.expires) : "ไม่มีวันหมดอายุ") + " · " + whoText(last) + (last.customer ? " · " + last.customer : "");
    $("result").classList.remove("on"); void $("result").offsetWidth; $("result").classList.add("on");
    $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (window.pkSound) pkSound("key");
    if (window.pkBurst) setTimeout(function () { pkBurst($("result")); }, 120);
  }).catch(function (e) { $("genErr").textContent = e.message; })
    .then(function () { making = false; $("genBtn").disabled = false; });
};
function customerMessage(p, k) {
  var pl = planOf(p, k.plan);
  return "คีย์ " + p.name + (pl ? " แพ็กเกจ " + pl.name : "") + " ของคุณ (" + durText(k.type, k.count) + (k.expires ? " · ใช้ได้ถึง " + fmt(k.expires) : "") + ")\n\n" + k.key +
    "\n\nวิธีใช้: " + p.howTo +
    (k.bind ? "\n\n* คีย์นี้ใช้ได้ 1 เครื่อง (เครื่องแรกที่เปิดใช้งาน) และต้องต่ออินเทอร์เน็ตตอนเปิดใช้งานครั้งแรก" : "");
}
function whoText(k) { var pl = k.plan && planOf(P, k.plan); if (pl) return "แพ็กเกจ " + pl.name + " · 1 บัญชี"; return k.machine ? "เครื่อง " + k.machine : k.bind ? "1 เครื่อง (เครื่องแรกที่เปิดใช้)" : "ทุกเครื่อง"; }

/* ---------------- activation (which PC owns a "1 key = 1 PC" key) ---------------- */
var actCache = {}, actFetched = {}, actCount = {};
function nk(key) { return String(key).replace(/-/g, ""); }
function fetchActs(p, force) {
  var keys = loadHist(p).filter(function (k) { return k.bind; }).map(function (k) { return nk(k.key); });
  if (!keys.length) return;
  // re-ask at most every 15 s, but right away when the list of keys changed (e.g. a key was just made)
  if (!force && actFetched[p.id] && actCount[p.id] === keys.length && Date.now() - actFetched[p.id] < 15000) return;
  actFetched[p.id] = Date.now(); actCount[p.id] = keys.length;
  api("/admin/status", { tag: p.tag, keys: keys }).then(function (j) {
    actCache[p.id] = j.list || {};
    if (p === P && pageOn("hist")) renderHist();
  }).catch(function (e) { actCache[p.id] = actCache[p.id] || {}; actCache[p.id]._err = e.message; if (p === P && pageOn("hist")) renderHist(); });
}
function actCell(p, k) {
  if (!k.bind) return esc(k.plan && planOf(p, k.plan) ? "แพ็กเกจ " + planOf(p, k.plan).name : k.machine || "ทุกเครื่อง");
  var c = actCache[p.id];
  if (!c) return "<span class='act wait'>กำลังตรวจ...</span>";
  var a = c[nk(k.key)];
  if (a) return "<span class='act on' title='เปิดใช้เมื่อ " + esc(fmt(a.at)) + "'>" + esc(a.machine) + "</span>";
  return "<span class='act wait'>" + (c._err ? "ตรวจไม่ได้" : "ยังไม่เปิดใช้") + "</span>";
}
function resetAct(p, key) {
  if (!confirm("ปลดคีย์นี้ออกจากเครื่องเดิม?\n\nใช้ตอนลูกค้าเปลี่ยนเครื่อง — หลังจากนี้เครื่องใหม่ที่เปิดใช้ก่อนจะเป็นเจ้าของคีย์\n(เครื่องเดิมที่เปิดใช้ไปแล้วยังใช้ต่อได้ เพราะเก็บการเปิดใช้งานไว้ในเครื่อง)")) return Promise.resolve(false);
  return api("/admin/reset", { tag: p.tag, key: nk(key) }).then(function () {
    if (actCache[p.id]) delete actCache[p.id][nk(key)];
    toast("ปลดคีย์แล้ว — เปิดใช้กับเครื่องใหม่ได้ ✓"); return true;
  }).catch(function (e) { toast("ทำไม่สำเร็จ: " + e.message); return false; });
}
$("copyKey").onclick = function () { if (last) copy(last.key, "คัดลอกคีย์ " + P.name + " แล้ว ✓"); };
$("copyMsg").onclick = function () { if (last) copy(customerMessage(P, last), "คัดลอกข้อความแล้ว ✓"); };
$("newBtn").onclick = function () { $("machine").value = ""; $("customer").value = ""; $("result").classList.remove("on"); update(); $("machine").focus(); };

/* ---------------- history (on the server, per program) ---------------- */
function loadHist(p) { return histCache[p.tag] || []; }
function loadAllHist() { return api("/admin/hist", {}).then(function (j) { histCache = j.list || {}; }); }
function renderHist() {
  var all = loadHist(P), q = $("search").value.trim().toLowerCase(), now = Date.now() / 1000;
  fetchActs(P);
  $("histCount").textContent = all.length ? "(" + all.length + ")" : "";
  var h = all.filter(function (k) { return !q || [k.customer, k.machine, k.key].join(" ").toLowerCase().indexOf(q) >= 0; });
  $("histEmpty").style.display = h.length ? "none" : "";
  $("histEmpty").textContent = all.length ? "ไม่พบที่ค้นหา" : "ยังไม่มีคีย์ " + P.name;
  $("hist").innerHTML = h.map(function (k) {
    var live = !k.expires || now < k.expires, i = all.indexOf(k);
    return "<tr><td>" + esc(k.customer || "—") + "</td><td>" + esc(durText(k.type, k.count)) + "</td><td>" + esc(fmt(k.expires)) +
      "<span class='tag " + (live ? "live" : "dead") + "'>" + (live ? "ใช้งานอยู่" : "หมดอายุ") + "</span></td><td class='mono'>" + actCell(P, k) +
      "</td><td>" + esc(fmt(k.created)) + "</td><td class='actions'>" +
      (k.bind && actCache[P.id] && actCache[P.id][nk(k.key)] ? "<button class='small' data-reset='" + i + "' title='ลูกค้าเปลี่ยนเครื่อง: ปลดคีย์ให้เปิดใช้กับเครื่องใหม่ได้'>ย้ายเครื่อง</button> " : "") +
      "<button class='small' data-copy='" + i + "'>คัดลอกคีย์</button> " +
      "<button class='small danger' data-del='" + i + "' title='ลบออกจากรายการ (คีย์ยังใช้ได้ตามปกติ)'>ลบ</button></td></tr>";
  }).join("");
}
$("hist").onclick = function (e) {
  var b = e.target.closest("button"); if (!b) return;
  var all = loadHist(P), p = P;
  if (b.dataset.copy) copy(all[+b.dataset.copy].key, "คัดลอกคีย์แล้ว ✓");
  if (b.dataset.reset) resetAct(P, all[+b.dataset.reset].key).then(function (ok) { if (ok) renderHist(); });
  if (b.dataset.del && confirm("ลบคีย์นี้ออกจากรายการ?\n\nเป็นการลบบันทึกเท่านั้น คีย์ยังใช้ได้จนหมดอายุ")) {
    var k = all[+b.dataset.del];
    api("/admin/hist/delete", { tag: p.tag, key: k.key }).then(function () {
      histCache[p.tag] = loadHist(p).filter(function (x) { return x !== k; }); renderHist(); renderProducts();
    }).catch(function (er) { toast("ลบไม่สำเร็จ: " + er.message); });
  }
};
$("search").oninput = renderHist;
$("exportCsv").onclick = function () {
  var rows = [["โปรแกรม", "ลูกค้า", "ระยะเวลา", "หมดอายุ", "เครื่อง", "สร้างเมื่อ", "คีย์"]].concat(loadHist(P).map(function (k) {
    var a = k.bind && actCache[P.id] && actCache[P.id][nk(k.key)];
    return [P.name, k.customer, durText(k.type, k.count), fmt(k.expires), a ? a.machine : k.plan && planOf(P, k.plan) ? "แพ็กเกจ " + planOf(P, k.plan).name : k.bind ? "1 เครื่อง (ยังไม่เปิดใช้)" : k.machine || "ทุกเครื่อง", fmt(k.created), k.key];
  }));
  var csv = "﻿" + rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "keys-" + P.id + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
};

/* ---------------- check (tells you if the key belongs to another program) ---------------- */
var chkSeq = 0;
$("chkIn").oninput = function () {
  var out = $("chkOut"), v = this.value.trim(), p = P, seq = ++chkSeq;
  if (!v) { out.innerHTML = ""; return; }
  var s = v.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (/^PK1/.test(s)) { out.innerHTML = "<div class='verdict bad'>คีย์แบบยาวรุ่นเก่าของ PERFECTKIT — ยังใช้ได้ในโปรแกรม แต่หน้านี้ตรวจให้ไม่ได้</div>"; return; }
  if (s.length !== 25) { out.innerHTML = "<div class='verdict bad'>คีย์ต้องมี 25 ตัวอักษร (ตอนนี้มี " + s.length + " ตัว)</div>"; return; }
  out.innerHTML = "<div class='verdict'>กำลังตรวจ...</div>";
  api("/admin/check", { key: s }).then(function (j) {
    if (seq !== chkSeq || p !== P) return;
    var mine = j.matches.filter(function (m) { return m.tag === p.tag; })[0];
    if (mine) return show(mine, j.key, p);
    var o = j.matches.map(function (m) { return productByTag(m.tag); }).filter(Boolean)[0];
    out.innerHTML = o ? "<div class='verdict warn'>คีย์นี้เป็นของ <b>" + esc(o.name) + "</b> ไม่ใช่ " + esc(p.name) + " — ใช้กับ " + esc(p.name) + " ไม่ได้</div>"
      : "<div class='verdict bad'>✕ คีย์ปลอมหรือพิมพ์ผิด</div>";
  }).catch(function (e) { if (seq === chkSeq) out.innerHTML = "<div class='verdict bad'>" + esc(e.message) + "</div>"; });
  function show(m, key, p) {
    var hx = ("00000000" + m.machine.toString(16).toUpperCase()).slice(-8), bind = m.machine === BIND;
    var i = { type: m.type, count: m.count, expires: m.expires, bind: bind && !isWeb(p), plan: isWeb(p) ? m.machine : 0,
      machine: m.machine && !bind && !isWeb(p) ? hx.slice(0, 4) + "-" + hx.slice(4) : "", key: key };
    var expired = i.expires && Date.now() / 1000 >= i.expires;
    var rec = loadHist(p).filter(function (h) { return h.key === i.key; })[0];
    out.innerHTML = "<div class='verdict " + (expired ? "bad" : "ok") + "'>" + (expired ? "คีย์ " + esc(p.name) + " ของจริง แต่หมดอายุแล้ว" : "✓ คีย์ " + esc(p.name) + " ของจริง ใช้งานได้") + "</div>" +
      "<div class='kv'><div>ระยะเวลา</div><div>" + esc(durText(i.type, i.count)) + "</div>" +
      "<div>หมดอายุ</div><div>" + esc(fmt(i.expires)) + "</div>" +
      "<div>" + (isWeb(p) ? "แพ็กเกจ" : "เครื่อง") + "</div><div id='chkAct'>" + esc(whoText(i)) + "</div>" +
      (rec ? "<div>ลูกค้า</div><div>" + esc(rec.customer || "—") + "</div><div>สร้างเมื่อ</div><div>" + esc(fmt(rec.created)) + "</div>" : "") + "</div>";
    if (i.bind) {
      api("/admin/status", { tag: p.tag, keys: [nk(i.key)] }).then(function (j) {
        var el = $("chkAct"); if (!el || p !== P) return;
        var a = (j.list || {})[nk(i.key)];
        el.innerHTML = a ? "เปิดใช้แล้วกับเครื่อง <b class='mono'>" + esc(a.machine) + "</b> เมื่อ " + esc(fmt(a.at)) + " <button class='small' id='chkReset'>ย้ายเครื่อง</button>"
          : "1 เครื่อง — <b>ยังไม่มีเครื่องไหนเปิดใช้</b>";
        if (a) $("chkReset").onclick = function () { resetAct(p, i.key).then(function (ok) { if (ok) $("chkIn").oninput(); }); };
      }).catch(function (e) { var el = $("chkAct"); if (el) el.textContent = whoText(i) + " · ตรวจสถานะไม่ได้ (" + e.message + ")"; });
    }
  }
};

/* ---------------- inbox (messages from each program's "แจ้งปัญหา" button, kept on the server) ---------------- */
var inboxBusy = {}, seenBefore = 0, openLog = {}, liveState = {};
function loadInbox(p) { return (inboxCache[p.id] && inboxCache[p.id].list) || []; }
function lastRead(p) { return (inboxCache[p.id] && inboxCache[p.id].read) || 0; }
function unreadCount(p) { return p.inbox ? loadInbox(p).filter(function (m) { return m.time > lastRead(p); }).length : 0; }
function markRead() {
  seenBefore = lastRead(P);   // newer messages stay highlighted while the tab is open
  var newest = loadInbox(P).reduce(function (m, x) { return Math.max(m, x.time); }, 0);
  if (newest > seenBefore && inboxCache[P.id]) { inboxCache[P.id].read = newest; api("/admin/inbox/read", { product: P.id, time: newest }).catch(function () {}); }
  inboxBadge();
}
function inboxBadge() {
  var n = pageOn("inbox") ? 0 : unreadCount(P);
  $("inboxBadge").textContent = n > 99 ? "99+" : n; $("inboxBadge").classList.toggle("on", n > 0);
  renderProducts();
}
function inboxView() {
  var on = !!P.inbox;
  $("inboxOn").style.display = on ? "" : "none"; $("inboxOff").style.display = on ? "none" : "";
  if (!on) $("inboxOff").innerHTML = esc(P.name) + " ยังไม่ได้เชื่อมระบบแจ้งปัญหา<br><small>ตั้ง <b>inbox: true</b> ในไฟล์ assets/products.js และใส่ชื่อห้อง ntfy ของโปรแกรมนี้ใน INBOX ของ Cloudflare Worker (ดู README)</small>";
  else { var s = liveState[P.id]; setLive(s ? s.ok : true, s ? s.text : "กำลังเชื่อมต่อ..."); renderInbox(); }
  inboxBadge();
}
function setLive(ok, text) { $("live").classList.toggle("off", !ok); $("liveText").textContent = text; }
function fetchInbox(p) {
  if (!p.inbox || inboxBusy[p.id]) return;
  inboxBusy[p.id] = true;
  var before = loadInbox(p).length, had = !!inboxCache[p.id];
  api("/admin/inbox", { product: p.id }).then(function (j) {
    inboxCache[p.id] = { list: j.list || [], read: Math.max(j.read || 0, lastRead(p)) };
    var added = had ? Math.max(0, inboxCache[p.id].list.length - before) : 0, t = new Date();
    liveState[p.id] = { ok: !j.pullError, text: j.pullError ? "ดึงข้อความใหม่ไม่ได้ (" + j.pullError + ") — แสดงข้อความที่เก็บไว้" :
      "เชื่อมต่อแล้ว · อัปเดต " + ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2) + (added ? " · ใหม่ " + added + " ข้อความ" : "") };
    if (p === P) {
      if (pageOn("inbox")) { var keep = seenBefore; markRead(); seenBefore = keep; renderInbox(); }
      setLive(liveState[p.id].ok, liveState[p.id].text);
    }
    inboxBadge();
    if (added && !(p === P && pageOn("inbox"))) toast(p.name + ": มีข้อความใหม่ " + added + " ข้อความ");
  }).catch(function (e) {
    liveState[p.id] = { ok: false, text: "เชื่อมต่อไม่ได้ (" + e.message + ")" };
    if (p === P) setLive(false, liveState[p.id].text);
  }).then(function () { inboxBusy[p.id] = false; });
}
function renderInbox() {
  var q = $("inboxSearch").value.trim().toLowerCase(), all = loadInbox(P);
  var list = all.filter(function (m) { return !q || [m.msg, m.contact, m.machine].join(" ").toLowerCase().indexOf(q) >= 0; });
  $("inboxEmpty").style.display = list.length ? "none" : "";
  $("inboxEmpty").textContent = all.length ? "ไม่พบข้อความที่ค้นหา" : "ยังไม่มีข้อความ — ข้อความที่ผู้ใช้กด \"แจ้งปัญหา\" ใน " + P.name + " จะขึ้นที่นี่";
  $("inboxList").innerHTML = list.map(function (m) {
    var who = m.contact || (m.machine ? "เครื่อง " + m.machine : "ไม่ระบุชื่อ");
    var unread = m.time > seenBefore;
    var info = [m.machine && "เครื่อง " + m.machine, m.host, m.ext && "v" + m.ext].filter(Boolean).join(" · ");
    var detail = [["รหัสเครื่อง", m.machine], ["คีย์", m.license], ["โปรแกรม", m.host], ["เวอร์ชัน", m.ext], ["เครื่อง", m.os], ["ส่งเมื่อ", fmt(m.time)]]
      .filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ": " + r[1]; }).join("\n") + (m.log ? "\n\n--- Log ---\n" + m.log : "");
    return "<div class='msg" + (unread ? " unread" : "") + "' data-id='" + esc(m.id) + "'>" +
      "<div class='avatar'>" + esc(who.charAt(0).toUpperCase()) + "</div><div class='msg-main'>" +
      "<div class='msg-top'>" + (unread ? "<span class='dot' title='ใหม่'></span>" : "") + "<span class='who'>" + esc(who) + "</span>" +
      (CAT_NAME[m.cat] ? "<span class='ctag'>" + esc(CAT_NAME[m.cat]) + "</span>" : "") + "<span class='when' title='" + esc(fmt(m.time)) + "'>" + esc(ago(m.time)) + "</span></div>" +
      "<div class='bubble'>" + esc(m.msg) + "</div>" +
      "<div class='msg-meta'>" + (info ? "<span>" + esc(info) + "</span>" : "") +
        "<a data-act='copy'>คัดลอกข้อความ</a>" + (m.contact ? "<a data-act='contact'>คัดลอกช่องทางติดต่อ</a>" : "") +
        "<a data-act='info'>" + (openLog[m.id] ? "ซ่อนข้อมูลเครื่อง" : "ข้อมูลเครื่อง / Log") + "</a>" +
        (/^[0-9A-F]{4}-[0-9A-F]{4}/.test(m.machine) ? "<a data-act='key'>สร้างคีย์ให้เครื่องนี้</a>" : "") +
        "<a data-act='del'>ลบ</a></div>" +
      (openLog[m.id] ? "<pre>" + esc(detail) + "</pre>" : "") +
      "</div></div>";
  }).join("");
}
$("inboxList").onclick = function (e) {
  var a = e.target.closest("a[data-act]"); if (!a) return;
  var id = a.closest(".msg").dataset.id, p = P, m = loadInbox(p).filter(function (x) { return x.id === id; })[0]; if (!m) return;
  var act = a.dataset.act;
  if (act === "copy") copy(m.msg, "คัดลอกข้อความแล้ว ✓");
  if (act === "contact") copy(m.contact, "คัดลอกช่องทางติดต่อแล้ว ✓");
  if (act === "info") { openLog[id] = !openLog[id]; renderInbox(); }
  if (act === "key") {
    document.querySelector(".tabs button[data-p='make']").click();
    $("machine").value = m.machine.slice(0, 9);
    if (m.contact) $("customer").value = m.contact;
    $("result").classList.remove("on"); update(); $("machine").focus();
  }
  if (act === "del" && confirm("ลบข้อความนี้?")) {
    api("/admin/inbox/delete", { product: p.id, id: id }).then(function () {
      inboxCache[p.id].list = loadInbox(p).filter(function (x) { return x.id !== id; }); renderInbox(); inboxBadge();
    }).catch(function (er) { toast("ลบไม่สำเร็จ: " + er.message); });
  }
};
$("inboxSearch").oninput = renderInbox;
$("inboxRefresh").onclick = function () { fetchInbox(P); };
function pollAll() { PRODUCTS.forEach(function (p) { fetchInbox(p); }); }

/* ---------------- old offline page: upload the history / inbox it kept in this browser ---------------- */
function localData() {
  var out = [], n = 0;
  PRODUCTS.forEach(function (p) {
    var h = [], m = [];
    try { h = JSON.parse(lsGet(lsKey(p, "hist")) || "[]"); } catch (e) {}
    try { m = JSON.parse(lsGet(lsKey(p, "inbox")) || "[]"); } catch (e) {}
    if (h.length || m.length) { out.push({ p: p, hist: h, inbox: m }); n += h.length; }
  });
  return { list: out, keys: n };
}
function offerMigration() {
  if (lsGet(LS_MIGRATED)) return;
  var d = localData(); if (!d.list.length) return;
  var box = $("migrate");
  box.innerHTML = "พบประวัติคีย์ <b>" + d.keys + "</b> รายการ ที่หน้าเว็บรุ่นเก่าเก็บไว้ในเบราว์เซอร์นี้ " +
    "<button class='small primary' id='migGo'>อัปโหลดขึ้นเซิร์ฟเวอร์</button> <button class='small' id='migNo'>ไม่ต้อง</button>";
  box.style.display = "";
  $("migNo").onclick = function () { lsSet(LS_MIGRATED, "skip"); box.style.display = "none"; };
  $("migGo").onclick = function () {
    $("migGo").disabled = true; $("migGo").textContent = "กำลังอัปโหลด...";
    var added = 0;
    d.list.reduce(function (pr, x) {
      return pr.then(function () { return x.hist.length ? api("/admin/hist/import", { tag: x.p.tag, items: x.hist }).then(function (j) { added += j.added || 0; }) : null; })
        .then(function () { return x.inbox.length ? api("/admin/inbox/import", { product: x.p.id, items: x.inbox }) : null; });
    }, Promise.resolve()).then(function () {
      lsSet(LS_MIGRATED, "done"); box.style.display = "none";
      toast("อัปโหลดแล้ว — เพิ่มประวัติ " + added + " คีย์ ✓");
      return loadAllHist();
    }).then(function () { renderProducts(); renderHist(); pollAll(); })
      .catch(function (e) { $("migGo").disabled = false; $("migGo").textContent = "ลองอีกครั้ง"; toast("อัปโหลดไม่สำเร็จ: " + e.message); });
  };
}

/* ---------------- button effects ---------------- */
document.addEventListener("mousemove", function (e) {
  var b = e.target.closest && e.target.closest("button"); if (!b || b.disabled) return;
  var r = b.getBoundingClientRect();
  b.style.setProperty("--mx", Math.round(e.clientX - r.left) + "px");
  b.style.setProperty("--my", Math.round(e.clientY - r.top) + "px");
}, true);
document.addEventListener("mousedown", function (e) {
  var b = e.target.closest && e.target.closest("button"); if (!b || b.disabled || b.closest(".tabs")) return;
  b.classList.remove("clicked"); void b.offsetWidth; b.classList.add("clicked");
  clearTimeout(b._ringT); b._ringT = setTimeout(function () { b.classList.remove("clicked"); }, 600);
}, true);

/* ---------------- start ---------------- */
selectProduct(productById(lsGet(LS_PRODUCT)) || PRODUCTS[0]);
$("machine").focus();
loadAllHist().then(function () { renderProducts(); renderHist(); offerMigration(); })
  .catch(function (e) { toast("โหลดประวัติไม่สำเร็จ: " + e.message); });
pollAll(); setInterval(pollAll, 30000);
