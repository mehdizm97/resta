/* app.js — رابط کاربری و منطق اصلی برنامه */
(function () {
  'use strict';

  var J = window.Jalali, S = window.Store, P = window.Parser, X = window.Exporter;
  var $app = document.getElementById('app');
  var fa = J.fa;

  var ctx = null;          // اطلاعات روزِ باز
  var pending = null;      // برنامه‌ی پردازش‌شده که منتظر تایید ذخیره است
  var warnedStorage = false;

  /* ================= ابزارها ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(x) { return fa(String(Math.round(x * 100) / 100)); }
  function round2(x) { return Math.round(x * 100) / 100; }
  function parseInput(s) {
    var t = J.enDigits(String(s == null ? '' : s)).replace(/[٫،,]/g, '.').trim();
    var v = parseFloat(t);
    return isNaN(v) ? null : v;
  }
  function $(id) { return document.getElementById(id); }
  function go(path) { location.hash = '#/' + path; }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- دیالوگ‌ها ---------- */
  function ask(message, okText, danger) {
    return new Promise(function (resolve) {
      var root = $('modal-root');
      root.innerHTML =
        '<div class="overlay" data-r="0"><div class="dialog" data-stop="1"><p>' + esc(message) + '</p>' +
        '<div class="dialog-actions"><button class="btn ghost" data-r="0">انصراف</button>' +
        '<button class="btn ' + (danger ? 'solid-danger' : 'primary') + '" data-r="1">' + esc(okText || 'تایید') + '</button></div></div></div>';
      root.onclick = function (e) {
        var b = e.target.closest('[data-r]');
        if (!b) return;
        if (b.classList.contains('overlay') && e.target !== b) return;
        root.innerHTML = ''; root.onclick = null;
        resolve(b.getAttribute('data-r') === '1');
      };
    });
  }

  function promptNumber(title, initial) {
    return new Promise(function (resolve) {
      var root = $('modal-root');
      root.innerHTML =
        '<div class="overlay" data-r="0"><div class="dialog"><h3>' + esc(title) + '</h3>' +
        '<input class="input" id="dlg-input" inputmode="decimal" value="' + (initial != null ? esc(fa(initial)) : '') + '">' +
        '<div class="dialog-actions"><button class="btn ghost" data-r="0">انصراف</button>' +
        '<button class="btn primary" data-r="1">تایید</button></div></div></div>';
      var inp = $('dlg-input');
      setTimeout(function () { inp.focus(); inp.select(); }, 50);
      function close(val) { root.innerHTML = ''; root.onclick = null; root.onkeydown = null; resolve(val); }
      root.onclick = function (e) {
        var b = e.target.closest('[data-r]');
        if (!b) return;
        if (b.classList.contains('overlay') && e.target !== b) return;
        if (b.getAttribute('data-r') === '1') {
          var v = parseInput(inp.value);
          if (v == null || v < 0) { toast('یک عدد معتبر وارد کن'); return; }
          close(v);
        } else close(null);
      };
      root.onkeydown = function (e) {
        if (e.key === 'Enter') { var v = parseInput(inp.value); if (v != null && v >= 0) close(v); }
      };
    });
  }

  /* ---------- کپی / دانلود / اشتراک ---------- */
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function doCopy(text) {
    copyText(text).then(function (ok) { toast(ok ? 'کپی شد ✓' : 'کپی نشد؛ متن را دستی انتخاب و کپی کن'); });
  }
  function download(name, text) {
    try {
      var blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
      toast('فایل دانلود شد');
    } catch (e) { toast('دانلود در این مرورگر کار نکرد؛ از «کپی» استفاده کن'); }
  }
  function share(title, text) {
    if (navigator.share) {
      navigator.share({ title: title, text: text }).catch(function () {});
    } else toast('اشتراک‌گذاری اینجا پشتیبانی نمی‌شود؛ از «کپی» استفاده کن');
  }

  /* ================= تایمر استراحت ================= */
  var timer = { end: 0, iv: null, label: '', audio: null, hideT: null };

  function beep() {
    try {
      if (!timer.audio) timer.audio = new (window.AudioContext || window.webkitAudioContext)();
      var ac = timer.audio;
      [0, 0.28, 0.56].forEach(function (d) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        var t0 = ac.currentTime + d;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.start(t0); o.stop(t0 + 0.22);
      });
    } catch (e) { /* بی‌صدا */ }
  }
  function mmss(sec) { sec = Math.max(0, sec); return fa(J.pad(Math.floor(sec / 60)) + ':' + J.pad(sec % 60)); }

  function renderTimer(finished) {
    var el = $('timer');
    var left = Math.ceil((timer.end - Date.now()) / 1000);
    el.hidden = false;
    el.className = 'timer' + (finished ? ' finished' : '');
    el.innerHTML =
      '<button data-act="t-stop" aria-label="بستن">✕</button>' +
      '<div class="t-lbl">' + (finished ? 'استراحت تموم شد!' : 'استراحت') + '<br>' + esc(timer.label) + '</div>' +
      '<div class="t-time">' + (finished ? '✓' : mmss(left)) + '</div>' +
      (finished ? '' : '<button data-act="t-add" aria-label="۳۰ ثانیه بیشتر">+۳۰</button>');
  }
  function tick() {
    var left = Math.ceil((timer.end - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(timer.iv); timer.iv = null;
      renderTimer(true);
      beep();
      if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]);
      timer.hideT = setTimeout(stopTimer, 6000);
      return;
    }
    var t = $('timer').querySelector('.t-time');
    if (t) t.textContent = mmss(left); else renderTimer(false);
  }
  function startTimer(sec, label) {
    stopTimer();
    timer.end = Date.now() + sec * 1000;
    timer.label = label;
    try { if (!timer.audio) timer.audio = new (window.AudioContext || window.webkitAudioContext)(); if (timer.audio.resume) timer.audio.resume(); } catch (e) {}
    renderTimer(false);
    timer.iv = setInterval(tick, 250);
  }
  function stopTimer() {
    clearInterval(timer.iv); timer.iv = null;
    clearTimeout(timer.hideT);
    var el = $('timer'); el.hidden = true; el.innerHTML = '';
  }

  /* ================= قالب‌های مشترک ================= */
  var ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    backup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"/></svg>'
  };

  function header(title, opt) {
    opt = opt || {};
    return '<header class="top">' +
      (opt.back != null ? '<a class="icon-btn" href="#/' + opt.back + '" aria-label="بازگشت">' + ICON.back + '</a>' : '<span class="icon-spacer"></span>') +
      '<div class="top-title"><h1>' + esc(title) + '</h1>' + (opt.sub ? '<p>' + esc(opt.sub) + '</p>' : '') + '</div>' +
      '<span class="icon-spacer"></span></header>';
  }
  function nav(active) {
    function a(id, href, icon, label) {
      return '<a href="' + href + '" class="' + (active === id ? 'on' : '') + '">' + icon + '<span>' + label + '</span></a>';
    }
    return '<nav class="nav"><div class="nav-in">' +
      a('home', '#/', ICON.home, 'تمرین‌ها') +
      a('import', '#/import', ICON.add, 'برنامه جدید') +
      a('backup', '#/backup', ICON.backup, 'پشتیبان') +
      '</div></nav>';
  }
  function screen(head, body, navActive) {
    return '<div class="screen' + (navActive ? '' : ' no-nav') + '">' + head + body + '</div>' + (navActive ? nav(navActive) : '');
  }

  function dayProgress(week, day) {
    var log = S.getLog(week.id, day.id), filled = 0;
    day.moves.forEach(function (m, i) {
      var x = log.moves[i];
      if (x && (x.reps != null || x.failed)) filled++;
    });
    return { log: log, filled: filled, total: day.moves.length, done: !!log.saved };
  }
  function statusBadge(p) {
    if (p.done) return '<span class="badge ok">✓ ذخیره شد</span>';
    if (p.filled) return '<span class="badge warn">' + fa(p.filled) + ' از ' + fa(p.total) + '</span>';
    return '<span class="badge">انجام نشده</span>';
  }
  function dayCard(week, day, isToday) {
    var p = dayProgress(week, day);
    return '<a class="card day-card" href="#/day/' + week.id + '/' + day.id + '">' +
      '<div class="plate ' + (p.done ? 'done' : (p.filled ? 'partial' : '')) + '"><b>' + fa(day.date.d) + '</b><span>' + J.MONTHS[day.date.m - 1] + '</span></div>' +
      '<div class="dc-main"><div class="dc-wd">' + esc(day.weekday) + (isToday ? '<span class="badge today">امروز</span>' : '') + '</div>' +
      '<div class="dc-title">' + esc(day.title || '—') + '</div>' +
      '<div class="dc-meta">' + fa(day.moves.length) + ' حرکت</div></div>' +
      '<div class="dc-side">' + statusBadge(p) + '</div></a>';
  }
  function weekProgress(week) {
    var done = 0;
    week.days.forEach(function (d) { if (S.getLog(week.id, d.id).saved) done++; });
    return { done: done, total: week.days.length };
  }

  /* ================= صفحه‌ها ================= */
  function viewHome() {
    var weeks = S.listWeeks(), tj = J.fromDate(new Date()), tkey = J.key(tj), todayItem = null;
    weeks.forEach(function (w) { w.days.forEach(function (d) { if (d.id === tkey) todayItem = { w: w, d: d }; }); });

    var h = '';
    if (!S.isPersistent()) {
      h += '<div class="notice err">ذخیره‌سازی مرورگر کار نمی‌کند و اطلاعات با بستن صفحه پاک می‌شود. برنامه را در مرورگر معمولی گوشی باز کن.</div>';
    }
    h += '<div class="hero"><small>امروز</small><h2>' + J.WEEKDAYS[J.weekdayIndex(tj)] + ' ' + J.format(tj) + '</h2></div>';

    if (todayItem) {
      h += '<div class="section-title">تمرین امروز</div>' + dayCard(todayItem.w, todayItem.d, true);
    } else if (weeks.length) {
      h += '<div class="card"><b>امروز تمرینی نداری</b><div class="muted small">روز استراحته؛ ریکاوری هم بخشی از تمرینه.</div></div>';
    }

    h += '<div class="section-title">هفته‌ها</div>';
    if (!weeks.length) {
      h += '<div class="card empty"><div class="big">🏋️</div><h3>هنوز برنامه‌ای ثبت نشده</h3>' +
        '<p>متن برنامه‌ای که مربی داده را وارد کن تا روزها و حرکت‌ها ساخته شود.</p>' +
        '<a class="btn primary" href="#/import">وارد کردن برنامه</a></div>';
    } else {
      weeks.forEach(function (w) {
        var p = weekProgress(w);
        h += '<a class="card week-card" href="#/week/' + w.id + '"><div class="wc-top"><div><h3>' + esc(w.title) + '</h3>' +
          '<div class="muted small">' + fa(w.days.length) + ' روز تمرین</div></div>' +
          '<span class="badge ' + (p.done === p.total ? 'ok' : '') + '">' + fa(p.done) + ' از ' + fa(p.total) + ' روز</span></div>' +
          '<div class="bar"><i style="width:' + (p.total ? Math.round(p.done / p.total * 100) : 0) + '%"></i></div></a>';
      });
    }
    return screen(header('دفتر تمرین'), h, 'home');
  }

  function notFound() {
    return screen(header('پیدا نشد', { back: '' }),
      '<div class="card empty"><div class="big">🤔</div><h3>این صفحه وجود ندارد</h3><a class="btn primary" href="#/">بازگشت به خانه</a></div>');
  }

  function viewWeek(wid) {
    var w = S.getWeek(wid);
    if (!w) return notFound();
    var tkey = J.key(J.fromDate(new Date())), p = weekProgress(w);
    var h = '<div class="card"><div class="prog-row"><span>پیشرفت هفته</span><span>' + fa(p.done) + ' از ' + fa(p.total) + ' روز</span></div>' +
      '<div class="bar"><i style="width:' + (p.total ? Math.round(p.done / p.total * 100) : 0) + '%"></i></div></div>';
    h += '<div class="section-title">روزهای تمرین</div>';
    w.days.forEach(function (d) { h += dayCard(w, d, d.id === tkey); });
    h += '<div class="section-title">خروجی و مدیریت</div>' +
      '<a class="btn primary block" href="#/export/' + w.id + '">📤 خروجی این هفته برای مربی</a>' +
      '<div style="height:10px"></div>' +
      '<button class="btn danger block" data-act="del-week" data-w="' + w.id + '">حذف این هفته</button>';
    return screen(header(w.title, { back: '', sub: fa(w.days.length) + ' روز تمرین' }), h);
  }

  /* ---------- صفحه روز ---------- */
  function repValues(mv) {
    var a = mv.repMin, b = mv.repMax, vals = [], v;
    if (a === b) {
      for (v = Math.max(1, a - 2); v <= a + 2; v++) vals.push(v);
    } else {
      var step = Math.max(1, Math.ceil((b - a + 1) / 14));
      for (v = a; v <= b; v += step) vals.push(v);
      if (vals[vals.length - 1] !== b) vals.push(b);
    }
    return vals;
  }
  function actualWeight(i) {
    var m = ctx.log.moves[i], plan = ctx.day.moves[i].weight;
    return (m && m.weight != null) ? m.weight : plan;
  }

  function moveCard(i) {
    var mv = ctx.day.moves[i], m = ctx.log.moves[i] || {};
    var unit = mv.repUnit || 'تکرار';
    var state = m.failed ? 'failed' : (m.reps != null ? 'done' : '');
    var vals = repValues(mv);
    var chips = vals.map(function (v) {
      return '<button class="chip' + (m.reps === v ? ' on' : '') + '" data-act="rep" data-i="' + i + '" data-v="' + v + '"' + (m.failed ? ' disabled' : '') + '>' + fa(v) + '</button>';
    }).join('');
    if (m.reps != null && vals.indexOf(m.reps) < 0) {
      chips += '<button class="chip on" data-act="rep-custom" data-i="' + i + '">' + fa(m.reps) + '</button>';
    }
    chips += '<button class="chip more" data-act="rep-custom" data-i="' + i + '"' + (m.failed ? ' disabled' : '') + '>عدد دیگر</button>';

    var w = actualWeight(i), diff = round2(w - mv.weight);
    var delta = diff > 0 ? '<span class="delta up">▲ ' + num(diff) + '</span>' : (diff < 0 ? '<span class="delta down">▼ ' + num(-diff) + '</span>' : '');
    var reset = diff !== 0 ? '<button class="link-btn" data-act="w-reset" data-i="' + i + '">برگرد به ' + num(mv.weight) + '</button>' : '';

    return '<section class="card move ' + state + '" id="m-' + i + '">' +
      '<div class="mv-head"><div class="mv-num">' + fa(i + 1) + '</div>' +
      '<div class="mv-title"><h3>' + esc(mv.name) + '</h3>' + (mv.type ? '<div class="sub">' + esc(mv.type) + '</div>' : '') + '</div>' +
      (mv.rest ? '<button class="rest-btn" data-act="rest" data-i="' + i + '">⏱ ' + fa(mv.rest) + ' ثانیه</button>' : '') + '</div>' +
      '<div class="plan"><b>' + fa(mv.sets) + ' ست</b> × ' + (mv.repMin === mv.repMax ? fa(mv.repMin) : fa(mv.repMin) + ' تا ' + fa(mv.repMax)) + ' ' + unit + '</div>' +
      '<div class="row"><div class="row-lbl"><span>چند ' + (mv.repUnit ? unit : 'تکرار') + ' زدی؟</span></div><div class="chips">' + chips + '</div></div>' +
      '<div class="row"><div class="row-lbl"><span>وزنه (کیلو)' + (mv.weightType ? ' — ' + esc(mv.weightType) : '') + '</span>' + reset + '</div>' +
      '<div class="wrow"><div class="stepper"><button data-act="w-minus" data-i="' + i + '" aria-label="نیم کیلو کمتر">−</button>' +
      '<button class="val" data-act="w-edit" data-i="' + i + '">' + num(w) + '</button>' +
      '<button data-act="w-plus" data-i="' + i + '" aria-label="نیم کیلو بیشتر">+</button></div>' + delta + '</div></div>' +
      '<button class="fail-btn" data-act="fail" data-i="' + i + '">' + (m.failed ? '❌ نتونستم بزنم (لغو)' : 'نتونستم بزنم') + '</button>' +
      '</section>';
  }

  function updateProgress() {
    var filled = 0;
    ctx.day.moves.forEach(function (mv, i) { var x = ctx.log.moves[i]; if (x && (x.reps != null || x.failed)) filled++; });
    var total = ctx.day.moves.length;
    var f = $('prog-fill'), t = $('prog-text');
    if (f) f.style.width = (total ? Math.round(filled / total * 100) : 0) + '%';
    if (t) t.textContent = fa(filled) + ' از ' + fa(total) + ' حرکت';
  }
  function refreshMove(i) {
    var el = $('m-' + i);
    if (el) {
      var tmp = document.createElement('div');
      tmp.innerHTML = moveCard(i);
      el.parentNode.replaceChild(tmp.firstElementChild, el);
    }
    updateProgress();
  }
  function commit() {
    if (!ctx) return;
    if (!S.setLog(ctx.week.id, ctx.day.id, ctx.log) && !warnedStorage) {
      warnedStorage = true;
      toast('⚠️ ذخیره‌سازی مرورگر کار نمی‌کند');
    }
  }
  function mlog(i) {
    var m = ctx.log.moves[i];
    if (!m) m = ctx.log.moves[i] = { reps: null, weight: null, failed: false };
    return m;
  }
  function setWeight(i, val) {
    var m = mlog(i);
    m.weight = round2(Math.max(0, val)) === ctx.day.moves[i].weight ? null : round2(Math.max(0, val));
    commit(); refreshMove(i);
  }

  function viewDay(wid, did) {
    var w = S.getWeek(wid), day = w && w.days.filter(function (d) { return d.id === did; })[0];
    if (!day) return notFound();
    ctx = { week: w, day: day, log: S.getLog(wid, did) };

    var seen = {}, tags = '';
    day.moves.forEach(function (mv) {
      mv.type.split('+').forEach(function (t) {
        t = t.trim();
        if (t && !seen[t]) { seen[t] = 1; tags += '<span class="tag">' + esc(t) + '</span>'; }
      });
    });

    var p = dayProgress(w, day);
    var h = '<div class="banner"><div class="kind">برنامه امروز</div><h2>' + esc(day.title || 'تمرین') + '</h2>' +
      (tags ? '<div class="tags">' + tags + '</div>' : '') +
      '<div class="prog-row"><span>پیشرفت</span><span id="prog-text">' + fa(p.filled) + ' از ' + fa(p.total) + ' حرکت</span></div>' +
      '<div class="bar"><i id="prog-fill" style="width:' + (p.total ? Math.round(p.filled / p.total * 100) : 0) + '%"></i></div></div>';

    h += '<div class="card"><div class="field"><label for="f-pre">⚖️ وزن بدن قبل از تمرین</label>' +
      '<input class="input" id="f-pre" data-field="pre" inputmode="decimal" placeholder="۰۰.۰" value="' + (ctx.log.pre != null ? esc(fa(ctx.log.pre)) : '') + '">' +
      '<span class="unit">کیلو</span></div></div>';

    day.moves.forEach(function (mv, i) { h += moveCard(i); });

    h += '<div class="card"><div class="field"><label for="f-post">⚖️ وزن بدن بعد از تمرین</label>' +
      '<input class="input" id="f-post" data-field="post" inputmode="decimal" placeholder="۰۰.۰" value="' + (ctx.log.post != null ? esc(fa(ctx.log.post)) : '') + '">' +
      '<span class="unit">کیلو</span></div></div>';

    h += '<div class="card"><label for="f-note" style="font-weight:700;display:block;margin-bottom:8px">📝 یادداشت (اختیاری)</label>' +
      '<textarea class="textarea" id="f-note" data-field="note" placeholder="مثلا: شانه چپ درد داشت…">' + esc(ctx.log.note || '') + '</textarea></div>';

    h += '<div class="savebar"><div class="savebar-in"><div class="saved-note" id="saved-note"' + (ctx.log.saved ? '' : ' hidden') + '>' + savedText() + '</div>' +
      '<button class="btn primary block" data-act="save">💾 ذخیره تمرین امروز</button></div></div>';

    return screen(header(day.weekday + ' ' + J.format(day.date), { back: 'week/' + wid, sub: w.title }), h);
  }
  function savedText() {
    if (!ctx.log.saved || !ctx.log.savedAt) return '';
    var d = new Date(ctx.log.savedAt);
    return '✓ ذخیره شد — ساعت ' + fa(J.pad(d.getHours()) + ':' + J.pad(d.getMinutes()));
  }

  /* ---------- خروجی هفته ---------- */
  function weekReport(w) {
    return X.weekText(w, function (did) { return S.getLog(w.id, did); });
  }
  function viewExport(wid) {
    var w = S.getWeek(wid);
    if (!w) return notFound();
    var h = '<div class="card"><p class="muted small" style="margin-bottom:10px">این متن را کپی کن یا مستقیم برای مربی بفرست. اگر بعد از این تغییری ثبت کنی، دوباره همین صفحه را باز کن تا به‌روز شود.</p>' +
      '<textarea class="export-box" id="exp-text" readonly>' + esc(weekReport(w)) + '</textarea></div>' +
      '<div class="btn-row"><button class="btn primary" data-act="ex-copy">📋 کپی متن</button>' +
      '<button class="btn" data-act="ex-share" data-w="' + w.id + '">📨 ارسال</button>' +
      '<button class="btn" data-act="ex-download" data-w="' + w.id + '">⬇️ فایل txt</button></div>';
    return screen(header('خروجی هفته', { back: 'week/' + wid, sub: w.title }), h);
  }

  /* ---------- ورود برنامه ---------- */
  var SAMPLE = 'برنامه: هفته ۲۹ شهریور تا ۴ مهر ۱۴۰۵\n====================\nروز: یکشنبه\nتاریخ برنامه: ۲۹ شهریور ۱۴۰۵\nعنوان: پشت + سرشانه\n====================\nحرکت ۱\nنام: لت سیمکش\nنوع: زیربغل\nست: 3\nتکرار: 10-12\nوزنه: 30\nنوع وزنه: دستگاه\nاستراحت: 90 ثانیه';

  function viewImport() {
    pending = null;
    var h = '<div class="card"><p class="muted small" style="margin-bottom:10px">متن برنامه‌ای که مربی فرستاده را همین‌جا paste کن. تاریخ هر روز از خود متن خوانده می‌شود.</p>' +
      '<textarea class="paste-box" id="imp-text" placeholder="' + esc(SAMPLE) + '"></textarea>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="paste">📥 چسباندن از کلیپ‌بورد</button>' +
      '<label class="btn file-btn">📄 انتخاب فایل txt<input type="file" accept=".txt,text/plain" data-file="imp-text" data-after="parse"></label></div>' +
      '<div style="height:10px"></div><button class="btn primary block" data-act="parse">پردازش برنامه</button></div>' +
      '<div id="imp-preview"></div>';
    return screen(header('برنامه جدید'), h, 'import');
  }
  function doParse() {
    var txt = $('imp-text').value;
    if (!txt.trim()) { toast('اول متن برنامه را وارد کن'); return; }
    var r = P.parse(txt), h = '';
    pending = r.ok ? r.week : null;

    if (r.errors.length) {
      h += '<div class="notice err"><b>مشکل در متن:</b><ul>' + r.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }
    if (r.warnings.length) {
      h += '<div class="notice warn"><b>توجه:</b><ul>' + r.warnings.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }
    if (r.week) {
      var total = 0;
      var days = r.week.days.map(function (d) {
        total += d.moves.length;
        return '<div class="prev-day"><span><b>' + esc(d.weekday) + '</b> ' + J.format(d.date) + '<br><span class="muted small">' + esc(d.title) + '</span></span>' +
          '<span class="badge">' + fa(d.moves.length) + ' حرکت</span></div>';
      }).join('');
      h += '<div class="card"><h3 style="margin-bottom:6px">' + esc(r.week.title) + '</h3>' + days + '</div>';
      if (r.ok) {
        if (S.weekExists(r.week.id)) h += '<div class="notice warn">این هفته قبلا ثبت شده. با ذخیره، خود برنامه جایگزین می‌شود ولی اطلاعات تمرین‌های ثبت‌شده حفظ می‌ماند.</div>';
        h += '<button class="btn primary block" data-act="commit">✓ ذخیره برنامه (' + fa(r.week.days.length) + ' روز، ' + fa(total) + ' حرکت)</button>';
      }
    }
    $('imp-preview').innerHTML = h;
    var pv = $('imp-preview');
    if (pv.scrollIntoView) pv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function doCommit() {
    if (!pending) return;
    var w = pending;
    var go2 = function () {
      if (!S.saveWeek(w)) { toast('⚠️ ذخیره نشد؛ حافظه مرورگر کار نمی‌کند'); return; }
      pending = null;
      toast('برنامه ذخیره شد ✓');
      go('week/' + w.id);
    };
    if (S.weekExists(w.id)) {
      ask('این هفته قبلا ثبت شده. جایگزین شود؟ (تمرین‌های ثبت‌شده حفظ می‌شوند)', 'جایگزین کن').then(function (ok) { if (ok) go2(); });
    } else go2();
  }

  /* ---------- پشتیبان ---------- */
  function viewBackup() {
    var st = S.stats();
    var h = '<div class="card"><h3 style="margin-bottom:4px">وضعیت داده‌ها</h3>' +
      '<p class="muted small">' + fa(st.weeks) + ' هفته برنامه و ' + fa(st.logs) + ' روز تمرین ثبت‌شده روی همین گوشی ذخیره است.</p>' +
      (S.isPersistent() ? '' : '<div class="notice err">ذخیره‌سازی مرورگر کار نمی‌کند!</div>') + '</div>';

    h += '<div class="notice warn">داده‌ها به آدرس صفحه (مثلا پورت Acode) وابسته‌اند. اگر آدرس عوض شد یا داده‌های مرورگر پاک شد، همه چیز از بین می‌رود؛ پس هر چند وقت یک بار پشتیبان بگیر.</div>';

    h += '<div class="section-title">گرفتن پشتیبان</div><div class="card">' +
      '<div class="btn-row"><button class="btn primary" data-act="bk-copy">📋 کپی</button>' +
      '<button class="btn" data-act="bk-download">⬇️ فایل</button>' +
      '<button class="btn" data-act="bk-share">📨 ارسال</button></div></div>';

    h += '<div class="section-title">بازگردانی پشتیبان</div><div class="card">' +
      '<textarea class="paste-box" id="bk-text" style="min-height:120px;direction:ltr" placeholder="متن پشتیبان را اینجا paste کن"></textarea>' +
      '<div class="btn-row" style="margin-top:10px"><label class="btn file-btn">📄 انتخاب فایل<input type="file" accept=".json,.txt,application/json,text/plain" data-file="bk-text"></label>' +
      '<button class="btn primary" data-act="bk-restore">بازگردانی</button></div>' +
      '<p class="muted small" style="margin-top:8px">داده‌های فعلی حذف نمی‌شوند؛ فقط با پشتیبان ادغام می‌شوند.</p></div>';

    h += '<div class="section-title">خطرناک</div><button class="btn danger block" data-act="bk-clear">پاک کردن همه اطلاعات</button>';
    return screen(header('پشتیبان‌گیری'), h, 'backup');
  }

  /* ================= مسیریابی ================= */
  function render() {
    ctx = null;
    var p = location.hash.replace(/^#\/?/, '').split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var html;
    switch (p[0]) {
      case 'week': html = viewWeek(p[1]); break;
      case 'day': html = viewDay(p[1], p[2]); break;
      case 'export': html = viewExport(p[1]); break;
      case 'import': html = viewImport(); break;
      case 'backup': html = viewBackup(); break;
      default: html = viewHome();
    }
    $app.innerHTML = html;
  }

  /* ================= رویدادها ================= */
  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var i = t.getAttribute('data-i'); i = i == null ? null : +i;
    var m;

    switch (act) {
      /* --- صفحه روز --- */
      case 'rep':
        if (!ctx) return;
        m = mlog(i); var v = +t.getAttribute('data-v');
        m.reps = m.reps === v ? null : v; m.failed = false;
        commit(); refreshMove(i);
        break;
      case 'rep-custom':
        if (!ctx) return;
        promptNumber('تعداد ' + (ctx.day.moves[i].repUnit || 'تکرار') + ' را وارد کن', ctx.log.moves[i] && ctx.log.moves[i].reps).then(function (val) {
          if (val == null) return;
          var mm = mlog(i); mm.reps = Math.round(val); mm.failed = false;
          commit(); refreshMove(i);
        });
        break;
      case 'fail':
        if (!ctx) return;
        m = mlog(i); m.failed = !m.failed;
        if (m.failed) m.reps = null;
        commit(); refreshMove(i);
        break;
      case 'w-plus': if (ctx) setWeight(i, actualWeight(i) + 0.5); break;
      case 'w-minus': if (ctx) setWeight(i, actualWeight(i) - 0.5); break;
      case 'w-reset': if (ctx) setWeight(i, ctx.day.moves[i].weight); break;
      case 'w-edit':
        if (!ctx) return;
        promptNumber('وزنه (کیلو)', actualWeight(i)).then(function (val) { if (val != null) setWeight(i, val); });
        break;
      case 'rest':
        if (ctx) startTimer(ctx.day.moves[i].rest, ctx.day.moves[i].name);
        break;
      case 'save': saveDay(); break;

      /* --- تایمر --- */
      case 't-stop': stopTimer(); break;
      case 't-add':
        timer.end += 30000;
        if (!timer.iv) startTimer(30, timer.label); else tick();
        break;

      /* --- هفته --- */
      case 'del-week':
        var wid = t.getAttribute('data-w'), wk = S.getWeek(wid);
        ask('«' + (wk ? wk.title : '') + '» و همه تمرین‌های ثبت‌شده‌اش حذف شود؟ این کار برگشت ندارد.', 'حذف کن', true).then(function (ok) {
          if (!ok) return;
          S.deleteWeek(wid); toast('حذف شد'); go('');
        });
        break;

      /* --- خروجی --- */
      case 'ex-copy': doCopy($('exp-text').value); break;
      case 'ex-share': share('گزارش تمرین', $('exp-text').value); break;
      case 'ex-download': download('gym-report-' + t.getAttribute('data-w') + '.txt', $('exp-text').value); break;

      /* --- ورود برنامه --- */
      case 'paste':
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function (txt) { $('imp-text').value = txt; doParse(); },
            function () { toast('اجازه دسترسی به کلیپ‌بورد نیست؛ داخل کادر نگه دار و paste کن'); });
        } else toast('داخل کادر نگه دار و paste کن');
        break;
      case 'parse': doParse(); break;
      case 'commit': doCommit(); break;

      /* --- پشتیبان --- */
      case 'bk-copy': doCopy(S.exportAll()); break;
      case 'bk-download': download('gym-backup-' + J.key(J.fromDate(new Date())) + '.json', S.exportAll()); break;
      case 'bk-share': share('پشتیبان دفتر تمرین', S.exportAll()); break;
      case 'bk-restore':
        var txt = $('bk-text').value.trim();
        if (!txt) { toast('اول متن پشتیبان را وارد کن'); return; }
        try {
          var r = S.importAll(txt);
          toast('بازگردانی شد: ' + fa(r.weeks) + ' هفته، ' + fa(r.logs) + ' روز');
          render();
        } catch (err) { toast(err.message); }
        break;
      case 'bk-clear':
        ask('همه برنامه‌ها و تمرین‌های ثبت‌شده برای همیشه پاک شود؟', 'پاک کن', true).then(function (ok) {
          if (!ok) return;
          S.clearAll(); toast('همه چیز پاک شد'); render();
        });
        break;
    }
  }

  function saveDay() {
    if (!ctx) return;
    var p = dayProgress(ctx.week, ctx.day), missing = p.total - p.filled;
    var doIt = function () {
      ctx.log.saved = true; ctx.log.savedAt = Date.now();
      commit();
      var n = $('saved-note'); n.textContent = savedText(); n.hidden = false;
      toast('تمرین امروز ذخیره شد ✓');
    };
    if (missing > 0) {
      ask(fa(missing) + ' حرکت هنوز ثبت نشده. با همین وضعیت ذخیره شود؟', 'ذخیره کن').then(function (ok) { if (ok) doIt(); });
    } else doIt();
  }

  function onInput(e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-field');
    if (!f || !ctx) return;
    if (f === 'note') ctx.log.note = e.target.value;
    else {
      var val = e.target.value.trim();
      ctx.log[f] = val === '' ? null : parseInput(val);
    }
    commit();
  }

  function onChange(e) {
    var inp = e.target;
    if (!inp.getAttribute || !inp.getAttribute('data-file')) return;
    var file = inp.files && inp.files[0];
    if (!file) return;
    var target = inp.getAttribute('data-file'), after = inp.getAttribute('data-after');
    var rd = new FileReader();
    rd.onload = function () {
      $(target).value = String(rd.result).replace(/^\ufeff/, '');
      if (after === 'parse') doParse(); else toast('فایل خوانده شد');
    };
    rd.onerror = function () { toast('خواندن فایل ممکن نشد'); };
    rd.readAsText(file, 'utf-8');
    inp.value = '';
  }

  /* ================= شروع ================= */
  S.init();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  document.addEventListener('click', onClick);
  $app.addEventListener('input', onInput);
  $app.addEventListener('change', onChange);
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && timer.iv) tick(); });
  render();
})();
