/* storage.js — ذخیره‌سازی داده‌ها روی خود گوشی (localStorage) */
(function (root) {
  'use strict';
  var KEY = 'gym-log-v1';
  var data = { v: 1, weeks: {}, logs: {} };
  var persistent = true;

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      persistent = true;
      return true;
    } catch (e) {
      persistent = false;
      return false;
    }
  }

  function init() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.weeks) { data = d; if (!data.logs) data.logs = {}; }
      }
      // تست نوشتن
      localStorage.setItem(KEY + '-test', '1');
      localStorage.removeItem(KEY + '-test');
      persistent = true;
    } catch (e) {
      persistent = false;
    }
    return persistent;
  }

  function logKey(wid, did) { return wid + '|' + did; }

  function newLog() {
    return { pre: null, post: null, note: '', moves: {}, saved: false, savedAt: null };
  }

  function listWeeks() {
    return Object.keys(data.weeks).sort().reverse().map(function (k) { return data.weeks[k]; });
  }
  function getWeek(id) { return data.weeks[id] || null; }
  function weekExists(id) { return !!data.weeks[id]; }
  function saveWeek(week) { data.weeks[week.id] = week; return persist(); }
  function deleteWeek(id) {
    delete data.weeks[id];
    Object.keys(data.logs).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete data.logs[k]; });
    return persist();
  }

  function getLog(wid, did) {
    var l = data.logs[logKey(wid, did)];
    if (!l) return newLog();
    if (!l.moves) l.moves = {};
    return l;
  }
  function setLog(wid, did, log) {
    data.logs[logKey(wid, did)] = log;
    return persist();
  }

  function exportAll() {
    return JSON.stringify({
      app: 'gym-log', v: 1, exportedAt: new Date().toISOString(),
      weeks: data.weeks, logs: data.logs
    });
  }

  // ادغام پشتیبان: هفته‌ها و ثبت‌های هم‌کلید بازنویسی می‌شوند
  function importAll(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('متن پشتیبان معتبر نیست (JSON خراب است).'); }
    if (!d || d.app !== 'gym-log' || !d.weeks || typeof d.weeks !== 'object') {
      throw new Error('این فایل، پشتیبان همین برنامه نیست.');
    }
    var w = 0, l = 0;
    Object.keys(d.weeks).forEach(function (k) { data.weeks[k] = d.weeks[k]; w++; });
    Object.keys(d.logs || {}).forEach(function (k) { data.logs[k] = d.logs[k]; l++; });
    persist();
    return { weeks: w, logs: l };
  }

  function clearAll() { data = { v: 1, weeks: {}, logs: {} }; return persist(); }
  function stats() {
    return { weeks: Object.keys(data.weeks).length, logs: Object.keys(data.logs).length };
  }

  root.Store = {
    init: init, isPersistent: function () { return persistent; },
    listWeeks: listWeeks, getWeek: getWeek, weekExists: weekExists,
    saveWeek: saveWeek, deleteWeek: deleteWeek,
    getLog: getLog, setLog: setLog,
    exportAll: exportAll, importAll: importAll, clearAll: clearAll, stats: stats
  };
})(typeof window !== 'undefined' ? window : globalThis);
