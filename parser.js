/* parser.js — تبدیل متن برنامه تمرینی به ساختار داده */
(function (root) {
  'use strict';
  var J = root.Jalali;

  var KEYMAP = {};
  [
    ['برنامه', 'week'], ['روز', 'day'], ['تاریخ برنامه', 'planDate'], ['تاریخ انجام', 'doneDate'],
    ['عنوان', 'title'], ['تعداد حرکات', 'count'],
    ['نام', 'name'], ['نوع', 'type'], ['ست', 'sets'], ['تکرار', 'reps'],
    ['وزنه', 'weight'], ['نوع وزنه', 'weightType'], ['استراحت', 'rest']
  ].forEach(function (p) { KEYMAP[J.norm(p[0])] = p[1]; });

  var MOVE_KEYS = { name: 1, type: 1, sets: 1, reps: 1, weight: 1, weightType: 1, rest: 1 };

  function parseNum(s) {
    var t = J.enDigits(s).replace(/[٫،,]/g, '.');
    var m = t.match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function parseReps(s) {
    s = J.enDigits(s || '').trim();
    var unit = /ثانیه|sec/i.test(s) ? 'ثانیه' : (/دقیقه|min/i.test(s) ? 'دقیقه' : '');
    var r = s.match(/(\d+)\s*(?:-|–|—|~|تا|to)\s*(\d+)/);
    var a, b;
    if (r) {
      a = parseInt(r[1], 10); b = parseInt(r[2], 10);
      if (a > b) { var t = a; a = b; b = t; }
    } else {
      var n = s.match(/\d+/);
      if (!n) return null;
      a = b = parseInt(n[0], 10);
    }
    return { min: a, max: b, unit: unit };
  }

  function parseDateStr(s, defY) {
    if (!s) return null;
    s = J.enDigits(s);
    var m = s.match(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
    if (m) {
      var a = { y: +m[1], m: +m[2], d: +m[3] };
      return J.isValid(a) ? a : null;
    }
    m = s.match(/(\d{1,2})\s*([^\d\s,،]+)\s*(\d{4})?/);
    if (m) {
      var mo = J.monthFromName(m[2]);
      if (mo) {
        var b = { y: m[3] ? +m[3] : defY, m: mo, d: +m[1] };
        return J.isValid(b) ? b : null;
      }
    }
    return null;
  }

  // «هفته ۲۹ شهریور تا ۴ مهر ۱۴۰۵» → تاریخ شروع و پایان
  function parseRange(title) {
    var t = J.enDigits(title || '');
    var m = t.match(/(\d{1,2})\s*([^\d\s]+)?\s*(?:تا|-|–)\s*(\d{1,2})\s*([^\d\s]+)\s*(\d{4})/);
    if (!m) return null;
    var m2 = J.monthFromName(m[4]);
    var m1 = m[2] ? J.monthFromName(m[2]) : m2;
    if (!m1 || !m2) return null;
    var y2 = +m[5], y1 = m1 > m2 ? y2 - 1 : y2;
    var s = { y: y1, m: m1, d: +m[1] }, e = { y: y2, m: m2, d: +m[3] };
    return (J.isValid(s) && J.isValid(e)) ? { start: s, end: e } : null;
  }

  function parse(input) {
    var errors = [], warnings = [];
    var text = J.enDigits(String(input || '')).replace(/\r/g, '').replace(/[\u200f\u200e\ufeff]/g, '');
    var lines = text.split('\n');
    var weekTitle = '', days = [], day = null, mv = null;

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line || /^[=\-_*~─━]{3,}$/.test(line)) continue;

      if (/^حرکت\s*\d*\s*$/.test(line)) {
        if (!day) { errors.push('خط ' + (li + 1) + ': «حرکت» قبل از تعریف «روز» آمده است.'); continue; }
        mv = {}; day.moves.push(mv);
        continue;
      }

      var m = line.match(/^([^:：]+?)\s*[:：]\s*(.*)$/);
      if (!m) { warnings.push('خط ' + (li + 1) + ' نامفهوم بود و نادیده گرفته شد.'); continue; }
      var k = KEYMAP[J.norm(m[1])], v = m[2].trim();
      if (!k) { warnings.push('کلید ناشناخته «' + m[1].trim() + '» در خط ' + (li + 1) + ' نادیده گرفته شد.'); continue; }

      if (k === 'week') { weekTitle = v; continue; }
      if (k === 'day') { day = { weekdayRaw: v, moves: [] }; days.push(day); mv = null; continue; }
      if (!day) { errors.push('خط ' + (li + 1) + ': اطلاعات قبل از تعریف «روز» آمده است.'); continue; }

      if (MOVE_KEYS[k]) {
        if (k === 'name' && (!mv || mv.name !== undefined)) { mv = {}; day.moves.push(mv); }
        if (!mv) { mv = {}; day.moves.push(mv); }
        mv[k] = v;
      } else {
        day[k] = v; // planDate, doneDate, title, count
      }
    }

    if (!days.length) errors.push('هیچ روزی پیدا نشد. مطمئن شو خط «روز: ...» در متن هست.');

    var range = parseRange(weekTitle);
    var defY = range ? range.end.y : J.fromDate(new Date()).y;
    var outDays = [], seen = {};

    days.forEach(function (d, di) {
      var label = 'روز ' + J.fa(di + 1) + (d.weekdayRaw ? ' (' + d.weekdayRaw + ')' : '');
      var wdIdx = J.weekdayFromName(d.weekdayRaw);
      var date = parseDateStr(d.planDate, defY) || parseDateStr(d.doneDate, defY);
      if (!date && range && wdIdx >= 0) {
        var off = (wdIdx - J.weekdayIndex(range.start) + 7) % 7;
        date = J.addDays(range.start, off);
        warnings.push(label + ': تاریخ نداشت؛ از روی عنوان هفته محاسبه شد.');
      }
      if (!date) { errors.push(label + ': تاریخ مشخص نیست (تاریخ برنامه را بنویس).'); return; }

      var realWd = J.weekdayIndex(date);
      if (wdIdx < 0) {
        warnings.push(label + ': نام روز شناخته نشد؛ از روی تاریخ «' + J.WEEKDAYS[realWd] + '» در نظر گرفته شد.');
        wdIdx = realWd;
      } else if (wdIdx !== realWd) {
        warnings.push(label + ': تاریخ ' + J.format(date) + ' در واقع «' + J.WEEKDAYS[realWd] + '» است، نه «' + d.weekdayRaw + '».');
      }

      var dkey = J.key(date);
      if (seen[dkey]) { errors.push(label + ': تاریخ ' + J.format(date) + ' دوبار تکرار شده.'); return; }
      seen[dkey] = true;

      var moves = [];
      d.moves.forEach(function (raw, mi) {
        var ml = label + '، حرکت ' + J.fa(mi + 1);
        var name = (raw.name || '').trim();
        if (!name) { errors.push(ml + ': نام حرکت خالی است.'); return; }
        var sets = parseNum(raw.sets);
        if (!sets) { sets = 3; warnings.push(ml + ' (' + name + '): تعداد ست مشخص نبود، ۳ در نظر گرفته شد.'); }
        var reps = parseReps(raw.reps);
        if (!reps) { reps = { min: 10, max: 12, unit: '' }; warnings.push(ml + ' (' + name + '): تکرار مشخص نبود، ۱۰ تا ۱۲ در نظر گرفته شد.'); }
        var w = parseNum(raw.weight);
        var rest = parseNum(raw.rest);
        if (rest != null && /دقیقه|min/i.test(J.enDigits(raw.rest))) rest = rest * 60;
        moves.push({
          name: name,
          type: (raw.type || '').trim(),
          sets: Math.round(sets),
          repMin: reps.min, repMax: reps.max, repUnit: reps.unit,
          weight: w == null ? 0 : w,
          weightType: (raw.weightType || '').trim(),
          rest: rest == null ? 0 : Math.round(rest)
        });
      });
      if (!moves.length) warnings.push(label + ': هیچ حرکتی ندارد.');
      var declared = parseNum(d.count);
      if (declared != null && declared !== moves.length) {
        warnings.push(label + ': «تعداد حرکات» ' + J.fa(declared) + ' نوشته شده ولی ' + J.fa(moves.length) + ' حرکت پیدا شد.');
      }

      outDays.push({
        id: dkey, weekdayIndex: wdIdx, weekday: J.WEEKDAYS[wdIdx],
        date: date, title: (d.title || '').trim(), moves: moves
      });
    });

    outDays.sort(function (a, b) { return a.id < b.id ? -1 : 1; });

    var week = null;
    if (outDays.length) {
      var first = outDays[0].date, last = outDays[outDays.length - 1].date;
      week = {
        id: range ? J.key(range.start) : J.key(first),
        title: weekTitle ? J.fa(weekTitle) : 'هفته ' + J.format(first) + ' تا ' + J.format(last),
        days: outDays,
        createdAt: Date.now()
      };
    }
    return { ok: errors.length === 0 && !!week, week: week, errors: errors, warnings: warnings };
  }

  root.Parser = { parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
