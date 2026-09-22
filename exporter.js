/* exporter.js — ساخت متن گزارش هفته برای ارسال به مربی */
(function (root) {
  'use strict';
  var J = root.Jalali;

  function n(x) { return J.fa(String(Math.round(x * 100) / 100)); }

  function repsLabel(mv) {
    return mv.repMin === mv.repMax ? n(mv.repMin) : n(mv.repMin) + '-' + n(mv.repMax);
  }
  function unitLabel(mv) { return mv.repUnit || 'تکرار'; }
  function weightLabel(w, type) {
    if (!w) return type ? type : 'بدون وزنه';
    return n(w) + ' کیلو' + (type ? ' (' + type + ')' : '');
  }

  function weekText(week, getLog) {
    var L = [];
    var totalMoves = 0, doneMoves = 0, failedMoves = 0, doneDays = 0;
    var failedNames = [], upNames = [];

    L.push('🏋️ گزارش تمرین');
    L.push(week.title);
    L.push('━━━━━━━━━━━━━━━━');

    week.days.forEach(function (day) {
      var log = getLog(day.id);
      var head = day.weekday + ' ' + J.format(day.date);
      L.push('');
      L.push('📅 ' + head);
      if (day.title) L.push('🎯 ' + day.title);

      var anyData = log.saved || log.pre != null || log.post != null ||
        Object.keys(log.moves).some(function (k) { var m = log.moves[k]; return m && (m.reps != null || m.failed); });

      if (!anyData) {
        L.push('⬜ این روز ثبت نشده');
        totalMoves += day.moves.length;
        return;
      }
      if (log.saved) doneDays++;
      else L.push('⏳ ذخیره نهایی نشده');

      if (log.pre != null || log.post != null) {
        var w = '⚖️ وزن بدن: ';
        var parts = [];
        if (log.pre != null) parts.push('قبل ' + n(log.pre));
        if (log.post != null) parts.push('بعد ' + n(log.post));
        w += parts.join(' — ') + ' کیلو';
        if (log.pre != null && log.post != null && log.pre !== log.post) {
          var diff = Math.abs(log.post - log.pre);
          w += ' (' + n(diff) + ' کیلو ' + (log.post < log.pre ? 'کمتر' : 'بیشتر') + ')';
        }
        L.push(w);
      }
      L.push('────────────');

      day.moves.forEach(function (mv, i) {
        totalMoves++;
        var ml = log.moves[i] || {};
        var plan = 'برنامه: ' + n(mv.sets) + ' ست × ' + repsLabel(mv) + ' ' + unitLabel(mv) + ' — ' + weightLabel(mv.weight, mv.weightType);
        L.push('');
        L.push(n(i + 1) + ') ' + mv.name + (mv.type ? ' — ' + mv.type : ''));
        if (ml.failed) {
          failedMoves++;
          failedNames.push(mv.name);
          L.push('   ❌ نتونستم انجام بدم');
        } else if (ml.reps != null) {
          doneMoves++;
          var actualW = ml.weight != null ? ml.weight : mv.weight;
          var line = '   ✅ ' + n(mv.sets) + ' ست × ' + n(ml.reps) + ' ' + unitLabel(mv) + ' — ' + weightLabel(actualW, mv.weightType);
          if (actualW > mv.weight) { line += ' ⬆️'; upNames.push(mv.name); }
          else if (actualW < mv.weight) line += ' ⬇️';
          L.push(line);
        } else {
          L.push('   ⬜ ثبت نشده');
        }
        L.push('   ' + plan);
      });

      if (log.note && log.note.trim()) {
        L.push('');
        L.push('📝 ' + log.note.trim());
      }
    });

    L.push('');
    L.push('━━━━━━━━━━━━━━━━');
    L.push('📊 خلاصه هفته');
    L.push('روز ذخیره‌شده: ' + n(doneDays) + ' از ' + n(week.days.length));
    L.push('حرکت انجام‌شده: ' + n(doneMoves) + ' از ' + n(totalMoves));
    if (failedMoves) L.push('حرکت ناموفق: ' + n(failedMoves) + ' (' + failedNames.join('، ') + ')');
    if (upNames.length) L.push('افزایش وزنه: ' + upNames.join('، '));
    return L.join('\n');
  }

  root.Exporter = { weekText: weekText };
})(typeof window !== 'undefined' ? window : globalThis);
