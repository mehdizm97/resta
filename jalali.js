/* jalali.js — تبدیل تاریخ شمسی/میلادی و ابزارهای اعداد فارسی */
(function (root) {
  'use strict';

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

  /* ---------- الگوریتم تبدیل (بر پایه jalaali-js) ---------- */
  var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function div(a, b) { return Math.trunc(a / b); }
  function mod(a, b) { return a - Math.trunc(a / b) * b; }

  function jalCal(jy, withoutLeap) {
    var bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap, leapG, march, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalali year ' + jy);
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (withoutLeap) return { gy: gy, march: march };
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }

  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1;
    var gm = mod(div(i, 153), 12) + 1;
    var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  function j2d(jy, jm, jd) {
    var r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy, false), jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy: jy, jm: jm, jd: jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }

  /* ---------- اعداد ---------- */
  function enDigits(s) {
    return String(s == null ? '' : s)
      .replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); });
  }
  function fa(s) {
    return String(s == null ? '' : s).replace(/\d/g, function (d) { return String.fromCharCode(0x06F0 + Number(d)); });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* نرمال‌سازی نام‌ها برای مقایسه (نیم‌فاصله، ی/ک عربی، آ/ا) */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\u200c\u200f\u200e\s]/g, '')
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[أإآ]/g, 'ا');
  }
  function indexByName(list, name) {
    var n = norm(name);
    for (var i = 0; i < list.length; i++) if (norm(list[i]) === n) return i;
    return -1;
  }
  function monthFromName(name) { return indexByName(MONTHS, name) + 1; } // 0 = پیدا نشد
  function weekdayFromName(name) { return indexByName(WEEKDAYS, name); }  // -1 = پیدا نشد

  /* ---------- تاریخ ---------- */
  function fromDate(dt) {
    var r = d2j(g2d(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()));
    return { y: r.jy, m: r.jm, d: r.jd };
  }
  function toUTC(j) {
    var g = d2g(j2d(j.y, j.m, j.d));
    return Date.UTC(g.gy, g.gm - 1, g.gd);
  }
  function fromUTC(ms) {
    var dt = new Date(ms);
    var r = d2j(g2d(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
    return { y: r.jy, m: r.jm, d: r.jd };
  }
  function addDays(j, n) { return fromUTC(toUTC(j) + n * 86400000); }
  function weekdayIndex(j) { return (new Date(toUTC(j)).getUTCDay() + 1) % 7; } // شنبه = 0
  function key(j) { return j.y + '-' + pad(j.m) + '-' + pad(j.d); }
  function parseKey(k) { var p = String(k).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function format(j) { return fa(j.d) + ' ' + MONTHS[j.m - 1] + ' ' + fa(j.y); }
  function isValid(j) {
    if (!j || !(j.y > 1200 && j.y < 1700) || !(j.m >= 1 && j.m <= 12) || !(j.d >= 1 && j.d <= 31)) return false;
    if (j.m > 6 && j.d > 30) return false;
    return true;
  }

  root.Jalali = {
    MONTHS: MONTHS, WEEKDAYS: WEEKDAYS,
    enDigits: enDigits, fa: fa, norm: norm, pad: pad,
    monthFromName: monthFromName, weekdayFromName: weekdayFromName,
    fromDate: fromDate, addDays: addDays, weekdayIndex: weekdayIndex,
    key: key, parseKey: parseKey, format: format, isValid: isValid
  };
})(typeof window !== 'undefined' ? window : globalThis);
