/* PERFECTKEY - password gate.
   The password is checked by the PERFECTKEY worker (ADMIN_PASSWORD on Cloudflare); the page itself holds no password
   and no secrets. The worker answers with a signed session token (12 h, or 7 days with "remember") used for every request.
   Typing with the Thai keyboard layout still works (Thai letters are turned back into the English keys pressed).
   To change the password: Cloudflare -> worker "perfectkey" -> Settings -> Variables and Secrets -> ADMIN_PASSWORD
   (every signed-in browser is logged out when it changes). */
(function () {
  "use strict";
  var IDLE_MIN = 30;                       // lock again after this many minutes with no activity (unless "remember" is on)
  var REMEMBER_DAYS = 7;
  var MAX_FAILS = 5, COOLDOWN_SEC = 30;    // too many wrong tries -> wait
  var SS_OK = "pkey_unlocked", LS_REMEMBER = "pkey_remember", LS_FAILS = "pkey_lock_fails", LS_UNTIL = "pkey_lock_until";

  var $ = function (id) { return document.getElementById(id); };
  var lock = $("lock"), form = $("lockForm"), inp = $("lockIn"), err = $("lockErr"), btn = $("lockBtn"), icon = $("lockIcon"), pw = $("pw");
  var busy = false, opened = false, cdTimer = null;

  function store(s, k, v) { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch (e) {} }
  function read(s, k) { try { return s.getItem(k); } catch (e) { return null; } }
  var SS = (function () { try { return window.sessionStorage; } catch (e) { return null; } })();
  var LS = (function () { try { return window.localStorage; } catch (e) { return null; } })();

  /* ---------- Thai keyboard -> the English key that was pressed ---------- */
  var TH = "ๆไำพะัีรนยบลฃฟหกดเ้่าสวงผปแอิืทมใฝ" + "ฎฑธํ๊ณฯญฤฆฏโฌ็๋ษศฉฮฺ์",          // normal + Shift/Caps letters
      EN = "qwertyuiop[]\\asdfghjkl;'zxcvbnm,./" + "ertyuiopasdfghjklcvbn";
  function toLatin(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) { var j = TH.indexOf(s[i]); out += j >= 0 ? EN[j] : s[i]; }
    return out.trim().toUpperCase();
  }

  /* ---------- the password is checked by the PERFECTKEY worker; it answers with a signed session token ---------- */
  var SS_TOK = "pkey_token", LS_TOK = "pkey_token_r";
  function tokenOk(t) { var m = /^s\.(\d{10})\./.exec(t || ""); return !!m && +m[1] * 1000 > Date.now() + 60000; }
  window.pkToken = function () { var t = read(SS, SS_TOK); if (tokenOk(t)) return t; t = read(LS, LS_TOK); return tokenOk(t) ? t : ""; };
  window.pkRelock = function () { store(SS, SS_TOK, null); store(LS, LS_TOK, null); store(SS, SS_OK, null); store(LS, LS_REMEMBER, null); location.reload(); };
  function serverUrl() { return ((window.SERVER && window.SERVER.url) || "").replace(/\/+$/, ""); }
  var loginResult = null;
  function isRight(v) {
    if (!v) return Promise.resolve(false);
    return loadScript("assets/products.js").then(function () {
      if (!serverUrl()) throw new Error("ยังไม่ได้ใส่ URL ของเซิร์ฟเวอร์ใน assets/products.js");
      return fetch(serverUrl() + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: v, remember: $("lockRemember").checked }) })
        .catch(function () { throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ต"); });
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: "เซิร์ฟเวอร์ตอบผิดรูปแบบ (HTTP " + r.status + ")" }; }); })
      .then(function (j) {
        loginResult = j;
        if (j.ok) { store(SS, SS_TOK, j.token); if ($("lockRemember").checked) store(LS, LS_TOK, j.token); return true; }
        if (j.code !== "WRONG") throw new Error(j.error || j.code || "เข้าสู่ระบบไม่ได้");
        return false;
      });
  }
  /* ---------- typing ---------- */
  inp.addEventListener("input", function () {
    if (opened) return;
    err.textContent = ""; err.className = "lock-err"; pw.classList.remove("bad");
    pw.classList.toggle("has", inp.value.length > 0);
    if (/[฀-๿]/.test(inp.value)) { err.textContent = "แป้นพิมพ์เป็นภาษาไทยอยู่ — ไม่เป็นไร ระบบแปลงให้อัตโนมัติ"; err.className = "lock-err info"; }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });
  $("pwEye").addEventListener("click", function () {
    var show = inp.type === "password";
    inp.type = show ? "text" : "password"; this.classList.toggle("on", show);
    inp.focus();
  });
  lock.addEventListener("mousedown", function (e) { if (e.target === lock) { e.preventDefault(); inp.focus(); } });

  /* ---------- cooldown after too many wrong tries ---------- */
  function cooldownLeft() { return Math.max(0, Math.ceil((+(read(LS, LS_UNTIL) || 0) - Date.now()) / 1000)); }
  function runCooldown() {
    clearInterval(cdTimer);
    function tick() {
      var s = cooldownLeft();
      inp.disabled = btn.disabled = s > 0;
      if (s > 0) { err.className = "lock-err"; err.textContent = "ใส่ผิดหลายครั้ง — ลองใหม่ใน " + s + " วินาที"; }
      else { clearInterval(cdTimer); err.textContent = ""; inp.disabled = btn.disabled = false; inp.focus(); }
    }
    tick(); cdTimer = setInterval(tick, 250);
  }

  function submit() {
    if (busy || opened || cooldownLeft()) return;
    var v = toLatin(inp.value);
    if (!v) { sfx("error"); pw.classList.add("bad"); err.className = "lock-err"; err.textContent = "กรุณาใส่รหัสผ่าน"; inp.focus(); return; }
    busy = true;
    isRight(v).then(function (ok) {
      busy = false;
      if (ok) return unlock();
      var fails = +(read(LS, LS_FAILS) || 0) + 1;
      store(LS, LS_FAILS, String(fails));
      form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
      pw.classList.add("bad"); sfx("error");
      err.className = "lock-err";
      err.textContent = "รหัสผ่านไม่ถูกต้อง" + (fails < MAX_FAILS ? " (เหลืออีก " + (MAX_FAILS - fails) + " ครั้ง)" : "");
      if (loginResult && loginResult.left === 0) { store(LS, LS_UNTIL, String(Date.now() + 600000)); runCooldown(); }
      inp.select();
      if (fails >= MAX_FAILS) { store(LS, LS_FAILS, "0"); store(LS, LS_UNTIL, String(Date.now() + COOLDOWN_SEC * 1000)); runCooldown(); }
    }).catch(function (e) { busy = false; err.className = "lock-err"; err.textContent = e.message; sfx("error"); });
  }

  /* ---------- open the app ---------- */
  function unlock() {
    if (opened) return; opened = true;
    store(LS, LS_FAILS, null); store(LS, LS_UNTIL, null); store(SS, SS_OK, "1");
    if ($("lockRemember").checked) store(LS, LS_REMEMBER, String(Date.now() + REMEMBER_DAYS * 86400000));
    form.classList.remove("shake"); pw.classList.remove("bad"); pw.classList.add("ok");
    icon.classList.add("open"); err.textContent = ""; sfx("unlock");
    btn.disabled = true; inp.blur();
    // swap the fields for the loading bar, then load the site behind it
    setTimeout(function () {
      form.classList.add("loading");
      $("lockSub").textContent = "รหัสถูกต้อง — กำลังเข้าสู่ระบบ";
      loadWithBar();
    }, 380);
  }

  /* ---------- loading bar ---------- */
  var shown = 0;
  function setBar(v) { shown = v; $("loadBar").style.width = v.toFixed(1) + "%"; $("loadPct").textContent = Math.round(v) + "%"; }
  function barTo(target, ms) {     // smooth fill from the current value to target over ms
    // timer-based on purpose: requestAnimationFrame pauses in a background tab and would freeze the login
    var from = shown, t0 = Date.now();
    return new Promise(function (done) {
      (function step() {
        var k = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        setBar(from + (target - from) * e);
        if (k < 1) setTimeout(step, 16); else done();
      })();
    });
  }
  function stage(text, target, ms, work) {   // the bar never runs ahead of the real work
    $("loadText").textContent = text;
    return Promise.all([barTo(target, ms), work || null]);
  }
  function loadWithBar() {
    setBar(0);
    stage("กำลังตรวจสอบสิทธิ์...", 28, 520)
      .then(function () { return stage("กำลังโหลดข้อมูลโปรแกรม...", 58, 560, loadScript("assets/products.js")); })
      .then(function () { return stage("กำลังเตรียมหน้าเว็บ...", 88, 620, loadScript("assets/app.js")); })
      .then(function () { return stage("พร้อมแล้ว ✓", 100, 380); })
      .then(function () { $("lockLoad").classList.add("done"); sfx("success"); setTimeout(function () { reveal(true); }, 450); })
      .catch(fail);
  }

  function loadScript(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement("script"); s.src = src;
      s.onload = ok; s.onerror = function () { bad(new Error("โหลดไฟล์ " + src + " ไม่ได้ — ตรวจว่าไฟล์อยู่ครบในโฟลเดอร์ assets")); };
      document.body.appendChild(s);
    });
  }
  function reveal(animated) {
    // the login card leaves first; the site only appears once the card is gone, so they never overlap
    if (animated) { lock.classList.add("out"); setTimeout(showSite, 520); }
    else showSite();
  }
  function showSite() {
    if (lock.parentNode) lock.remove();
    document.body.classList.remove("locked");
    $("wrap").classList.add("enter");
    try { window.dispatchEvent(new Event("pk:ready")); } catch (e) {}
    try { $("machine").focus(); } catch (e) {}
    if (!remembered()) watchIdle();
  }
  function sfx(name) { try { if (window.pkSound) window.pkSound(name); } catch (e) {} }
  function fail(e) {
    // never leave the user stuck: show what went wrong on the login card
    lock.style.display = ""; opened = false; btn.disabled = false;
    form.classList.remove("loading"); pw.classList.remove("ok"); icon.classList.remove("open");
    err.className = "lock-err"; err.textContent = e.message;
  }
  function start() {   // already unlocked earlier (same tab / remembered): no login, no bar
    loadScript("assets/products.js").then(function () { return loadScript("assets/app.js"); }).then(function () { reveal(false); }).catch(fail);
  }

  /* ---------- lock again (button / idle) ---------- */
  function remembered() { return +(read(LS, LS_REMEMBER) || 0) > Date.now() && tokenOk(read(LS, LS_TOK)); }
  function relock() { window.pkRelock(); }
  $("lockNow").addEventListener("click", relock);
  function watchIdle() {
    var last = Date.now();
    ["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, function () { last = Date.now(); }, { passive: true, capture: true });
    });
    setInterval(function () { if (Date.now() - last > IDLE_MIN * 60000) window.pkRelock(); }, 20000);
  }

  /* ---------- go ---------- */
  if ((read(SS, SS_OK) === "1" || remembered()) && window.pkToken()) { lock.style.display = "none"; opened = true; start(); }
  else { inp.focus(); if (cooldownLeft()) runCooldown(); }
})();
