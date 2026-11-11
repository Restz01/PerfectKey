/* PERFECTKEY - visual effects only (no key logic here):
   drifting starfield background, sliding tab indicator, card spotlight, button ripple, key "decode" reveal. */
(function () {
  "use strict";
  // always animate: Windows with "Animation effects" off reports reduced motion, and the owner wants the effects
  var reduce = false;

  /* ================= sounds (made with Web Audio, no sound files) ================= */
  var AC = null, master = null;
  var muted = (function () { try { return localStorage.getItem("pkey_mute") === "1"; } catch (e) { return false; } })();
  function audio() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination); }
      catch (e) { AC = null; return null; }
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  // one short tone: frequency glides f1 -> f2, quick attack, smooth release
  function tone(f1, f2, dur, type, vol, delay) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f1, t);
    if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, vol, delay) {   // soft filtered "whoosh"
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = "bandpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 2.2, t + dur); f.Q.value = 1.2;
    g.gain.value = vol; src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  var SOUNDS = {
    click:   function () { tone(1500, 700, 0.06, "sine", 0.10); },
    tick:    function () { tone(2300, 1800, 0.04, "triangle", 0.07); },
    tab:     function () { noise(0.12, 900, 0.10); tone(660, 990, 0.09, "sine", 0.06); },
    type:    function () { tone(2600 + Math.random() * 500, 0, 0.018, "square", 0.012); },
    copy:    function () { tone(1046, 0, 0.07, "sine", 0.09); tone(1568, 0, 0.10, "sine", 0.08, 0.06); },
    error:   function () { tone(240, 180, 0.12, "square", 0.035); tone(200, 150, 0.16, "square", 0.035, 0.11); },
    ok:      function () { tone(880, 0, 0.08, "sine", 0.07); tone(1320, 0, 0.12, "sine", 0.06, 0.06); },
    unlock:  function () { tone(520, 0, 0.07, "triangle", 0.09); tone(780, 0, 0.09, "triangle", 0.09, 0.07); },
    success: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0, 0.22, "sine", 0.08, i * 0.07); }); tone(2093, 0, 0.35, "sine", 0.03, 0.28); },
    key:     function () { noise(0.25, 600, 0.08); [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0, 0.25, "triangle", 0.06, 0.05 + i * 0.06); }); }
  };
  window.pkSound = function (name) { if (muted || !SOUNDS[name]) return; try { SOUNDS[name](); } catch (e) {} };

  // every button click makes a sound; tabs / chips get their own
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b || b.disabled) return;
    if (b.id === "sndBtn") return;
    pkSound(b.closest(".tabs") ? "tab" : b.closest(".chips") || b.classList.contains("prod") ? "tick" : "click");
  }, true);
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && (t.id === "lockIn" || t.id === "machine" || t.id === "chkIn") && e.key.length === 1) pkSound("type");
  }, true);
  document.addEventListener("click", function (e) {
    if (e.target.closest && (e.target.closest(".adv summary") || e.target.closest(".remember") || e.target.closest(".msg-meta a"))) pkSound("tick");
  }, true);

  /* ================= star sparks burst ================= */
  window.pkBurst = function (el) {
    if (!el) return;
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 80);
    for (var i = 0; i < 26; i++) {
      var s = document.createElement("span"); s.className = "spark" + (i % 4 === 0 ? " star" : "");
      s.style.left = cx + "px"; s.style.top = cy + "px";
      document.body.appendChild(s);
      var ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 170, dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist * 0.6 - 20;
      var anim = s.animate([
        { transform: "translate(0,0) scale(.4)", opacity: 1 },
        { transform: "translate(" + dx * 0.7 + "px," + dy * 0.7 + "px) scale(1.1)", opacity: 1, offset: 0.55 },
        { transform: "translate(" + dx + "px," + (dy + 40) + "px) scale(.2)", opacity: 0 }
      ], { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.16,1,.3,1)" });
      anim.onfinish = (function (n) { return function () { n.remove(); }; })(s);
    }
  };

  /* ================= starfield ================= */
  var cv = document.getElementById("stars"), ctx = cv && cv.getContext("2d");
  if (ctx) {
    var W = 0, H = 0, dpr = 1, stars = [], shoot = null, nextShoot = performance.now() + 5000;
    var mx = 0, my = 0, px = 0, py = 0, lastT = performance.now();

    var mk = function () {
      var z = Math.pow(Math.random(), 1.6);          // depth: most stars far & dim, a few near & brighter
      return { x: Math.random() * W, y: Math.random() * H, z: z,
        r: 0.3 + z * 1.15, a: 0.12 + z * 0.5,
        ang: Math.random() * Math.PI * 2, sp: 0.025 + z * 0.11,  // each star wanders in its own slowly-turning direction
        tw: Math.random() * Math.PI * 2, ts: 0.4 + Math.random() * 1.4 };
    };
    var resize = function () {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(380, Math.round(W * H / 5200));
      while (stars.length < n) stars.push(mk());
      stars.length = n;
      if (reduce) draw(performance.now(), 0);
    };
    var draw = function (t, dt) {
      ctx.clearRect(0, 0, W, H);
      px += (mx - px) * 0.035; py += (my - py) * 0.035;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (dt) {
          s.ang += (Math.random() - 0.5) * 0.03 * dt;
          s.x += Math.cos(s.ang) * s.sp * dt; s.y += Math.sin(s.ang) * s.sp * dt - 0.012 * dt;
          if (s.x < -30) s.x += W + 60; else if (s.x > W + 30) s.x -= W + 60;
          if (s.y < -30) s.y += H + 60; else if (s.y > H + 30) s.y -= H + 60;
        }
        var x = s.x - px * s.z * 26, y = s.y - py * s.z * 26;
        var a = s.a * (0.6 + 0.4 * Math.sin(t * 0.001 * s.ts + s.tw));
        if (s.z > 0.6) {   // soft halo on the nearer stars
          ctx.fillStyle = "rgba(255,255,255," + (a * 0.12).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(x, y, s.r * 3.2, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
      }
      // a faint shooting star now and then
      if (!reduce) {
        if (!shoot && t > nextShoot) {
          var ang = Math.PI * (0.15 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : Math.PI);
          shoot = { x: Math.random() * W, y: Math.random() * H * 0.6, vx: Math.cos(ang), vy: Math.abs(Math.sin(ang)), t0: t, life: 1100 };
        }
        if (shoot) {
          var k = (t - shoot.t0) / shoot.life;
          if (k >= 1) { shoot = null; nextShoot = t + 7000 + Math.random() * 9000; }
          else {
            var d = k * 520, hx = shoot.x + shoot.vx * d, hy = shoot.y + shoot.vy * d, tail = 110;
            var g = ctx.createLinearGradient(hx, hy, hx - shoot.vx * tail, hy - shoot.vy * tail);
            var al = Math.sin(k * Math.PI) * 0.45;
            g.addColorStop(0, "rgba(255,255,255," + al.toFixed(3) + ")"); g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - shoot.vx * tail, hy - shoot.vy * tail); ctx.stroke();
          }
        }
      }
    };
    var loop = function (t) {
      var dt = Math.min(3, (t - lastT) / 16.667); lastT = t;
      draw(t, dt);
      requestAnimationFrame(loop);
    };
    addEventListener("resize", resize);
    addEventListener("mousemove", function (e) { mx = e.clientX / W - 0.5; my = e.clientY / H - 0.5; }, { passive: true });
    resize();
    if (!reduce) requestAnimationFrame(function (t) { lastT = t; loop(t); });
  }

  /* ================= card spotlight + button ripple ================= */
  document.addEventListener("mousemove", function (e) {
    var c = e.target.closest && e.target.closest(".card, .lock-card"); if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty("--cx", Math.round(e.clientX - r.left) + "px");
    c.style.setProperty("--cy", Math.round(e.clientY - r.top) + "px");
  }, { passive: true });
  document.addEventListener("pointerdown", function (e) {
    if (reduce) return;
    var b = e.target.closest && e.target.closest("button"); if (!b || b.disabled || b.closest(".tabs")) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2, rp = document.createElement("span");
    rp.className = "ripple";
    rp.style.cssText = "width:" + s + "px;height:" + s + "px;left:" + (e.clientX - r.left - s / 2) + "px;top:" + (e.clientY - r.top - s / 2) + "px";
    b.appendChild(rp);
    setTimeout(function () { rp.remove(); }, 700);
  }, true);

  /* ================= key "decode" reveal ================= */
  var CH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  window.pkScramble = function (el, text) {
    clearInterval(el._scr);
    if (reduce) { el.textContent = text; return; }
    var t0 = performance.now(), dur = 750;
    el._scr = setInterval(function () {
      var k = (performance.now() - t0) / dur, fixed = Math.floor(k * text.length), out = "";
      for (var i = 0; i < text.length; i++) out += i < fixed || text[i] === "-" ? text[i] : CH[(Math.random() * 32) | 0];
      el.textContent = out;
      if (k >= 1) { clearInterval(el._scr); el.textContent = text; }
    }, 30);
  };

  /* ================= once the app is unlocked ================= */
  window.addEventListener("pk:ready", function () {
    // sliding pill behind the active tab
    var tabs = document.querySelector(".tabs");
    if (tabs) {
      var ind = document.createElement("span"); ind.className = "tab-ind"; tabs.insertBefore(ind, tabs.firstChild);
      // only the tab index is set here; CSS sizes the pill as a fraction of the bar, so it stays
      // on its tab while the page widens / narrows (the history tab makes the page wider)
      var place = function () {
        var btns = tabs.querySelectorAll("button"), on = tabs.querySelector("button.on");
        tabs.style.setProperty("--ti", Math.max(0, Array.prototype.indexOf.call(btns, on)));
      };
      place();
      requestAnimationFrame(function () { tabs.classList.add("ready"); });
      new MutationObserver(place).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["class"] });
      addEventListener("resize", place);
    }
    // sound on/off
    var sb = document.getElementById("sndBtn");
    if (sb) {
      sb.classList.toggle("off", muted);
      sb.onclick = function () {
        muted = !muted; try { localStorage.setItem("pkey_mute", muted ? "1" : "0"); } catch (e) {}
        sb.classList.toggle("off", muted);
        if (!muted) pkSound("ok");
      };
    }
    // error / result sounds by watching what the page shows
    var watch = function (id, fn) { var el = document.getElementById(id); if (el) new MutationObserver(function () { fn(el); }).observe(el, { childList: true, characterData: true, subtree: true }); };
    var lastErr = "";
    watch("genErr", function (el) { var t = el.textContent; if (t && t !== lastErr) pkSound("error"); lastErr = t; });
    var lastVerdict = "";
    watch("chkOut", function (el) {
      var v = el.querySelector(".verdict"), k = v ? v.className : "";
      if (k && k !== lastVerdict) pkSound(/\bok\b/.test(k) ? "ok" : "error");
      lastVerdict = k;
    });
    // machine field glows once all 8 characters are in; summary flashes on change
    var mi = document.getElementById("machine");
    var wasFull = false;   // app.js toggles the "full" class itself; this only adds the sound
    if (mi) mi.addEventListener("input", function () {
      var full = mi.value.replace(/[^0-9A-F]/gi, "").length >= 8;
      if (full && !wasFull) pkSound("ok");
      wasFull = full;
    });
    var sm = document.getElementById("summary"), lastSum = sm ? sm.textContent : "";
    if (sm) new MutationObserver(function () {
      if (sm.textContent === lastSum) return; lastSum = sm.textContent;
      sm.classList.remove("flash"); void sm.offsetWidth; sm.classList.add("flash");
    }).observe(sm, { childList: true, subtree: true, characterData: true });
    // the entrance animation runs once; drop it so switching tabs uses the normal page animation
    setTimeout(function () { var w = document.getElementById("wrap"); if (w) w.classList.remove("enter"); }, 1400);
  });
})();
