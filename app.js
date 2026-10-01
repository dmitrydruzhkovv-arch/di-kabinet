/* ════════════════════════════════════════════════════════════════
   app.js — Кабинет D. (v1, 21.09.2026, Кодер по ТЗ 09 Атласа)

   Три раздела:
   • Неделя   — расписание пн–вс: вписать, изменить, отменить на день, удалить;
   • Чек-лист — блоки с галочками, сделанное уходит вниз;
   • Окна     — свободное время для родителей, без имён (скрин или текст).

   Где живут данные:
   • всегда — в этом браузере (localStorage): кабинет работает сразу;
   • если введён ключ — ещё и на нашем сервере в РФ (cabinet.py рядом
     с hw_report, 152-ФЗ): телефон и Мак видят одно и то же.
   Имён учеников в репозитории нет: стартовый набор (seed.js) — без имён.

   Синхронизация: каждая правка — операция {put|del, вид, id, ts}.
   У каждой записи время последней правки; побеждает более поздняя.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ═════════ 1. адреса и справочники ═════════ */

  var LS = { state: 'kab:state:v1', out: 'kab:outbox:v1', key: 'kab:key', linked: 'kab:linked', tab: 'kab:tab', theme: 'kab:theme', api: 'kab:api' };
  // Прямой адрес RF-сервера и запасной через шлюз в Хельсинки (25.09): с VPN до
  // прямого не достать. Шлюз не расшифровывает — пересылает поток на тот же
  // RF-сервер, имена учеников читает только РФ. Не прошла сверка по сети —
  // следующая идёт через другой адрес; сработавший помним (kab:api).
  var APIS = pickApi();
  var API = APIS[0];
  var HUB = 'https://dmitrydruzhkovv-arch.github.io/di-hub/';
  var SCHOOL = 'https://dmitrydruzhkovv-arch.github.io/uroki-gagarina/';
  var ZAPIS_URL = 'https://dmitrydruzhkovv-arch.github.io/di-kabinet/zapis.html';   // живая запись (28.09)
  var KINDS = ['events', 'blocks', 'items', 'cfg'];
  var TABS = ['week', 'list', 'okna', 'train'];
  // Расписание D. живёт по Екатеринбургу (МСК+2). Окна для родителя из другого
  // пояса пересчитываются: переключатель 0 / +1 / +2 / » (+3…+6) во вкладке «Окна».
  var HOME_MSK = 2;
  var TZ_MAIN = [0, 1, 2], TZ_MORE = [3, 4, 5, 6];

  // cls — внешний вид в сетке; tag — метка на блоке (группы различаются подписью, не цветом)
  var TYPES = {
    solo:    { label: 'Индивидуально',   word: 'индивидуально',   cls: 'solo',    dur: 60,  tag: '' },
    oge:     { label: 'Группа ОГЭ',      word: 'группа ОГЭ',      cls: 'group',   dur: 60,  tag: 'ОГЭ' },
    ege:     { label: 'Группа ЕГЭ база', word: 'группа ЕГЭ база', cls: 'group',   dur: 60,  tag: 'ЕГЭ' },
    school:  { label: 'Школа',           word: 'школа',           cls: 'school',  dur: 45,  tag: '' },
    reserve: { label: 'Резерв',          word: 'резерв',          cls: 'reserve', dur: 180, tag: '' },
    other:   { label: 'Другое',          word: 'другое',          cls: 'other',   dur: 60,  tag: '' }
  };
  var TYPE_ORDER = ['solo', 'oge', 'ege', 'school', 'reserve', 'other'];
  var DURS = [40, 45, 60, 90, 120];

  var DOW_S = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var DOW_L = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  var DOW_EVERY = ['', 'каждый понедельник', 'каждый вторник', 'каждую среду', 'каждый четверг', 'каждую пятницу', 'каждую субботу', 'каждое воскресенье'];
  var DOW_ACC = ['', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
  var MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function pickApi() {
    // ?api= — только локальный сервер (проверка на Маке). Чужой адрес не берём:
    // ссылка с подменой увела бы ключ D на чужой сервер.
    try {
      var q = new URLSearchParams(location.search).get('api') || '';
      if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?(\/[\w\/-]*)?$/.test(q)) return [q.replace(/\/$/, '')];
    } catch (e) { /* старый браузер — берём боевой адрес */ }
    var list = ['https://194-87-110-53.nip.io/cabinet', 'https://hw.157-228-128-116.nip.io/cabinet'];
    var saved = lsGet(LS.api, '');
    return list.indexOf(saved) > 0 ? [saved].concat(list.filter(function (a) { return a !== saved; })) : list;
  }

  // сеть не пустила к серверу — следующая попытка идёт через другой адрес
  function nextApi() { if (APIS.length > 1) API = APIS[(APIS.indexOf(API) + 1) % APIS.length]; }
  // сработавший адрес помним; прямой — не пишем (он и так первый)
  function rememberApi() { if (APIS.length > 1) lsSet(LS.api, API.indexOf('https://hw.') === 0 ? API : ''); }

  /* ═════════ 2. иконки ═════════ */

  var IC = {
    week:  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    list:  '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12.5l2.8 2.8L16.5 9"/>',
    okna:  '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M12 3v18M4 12h16"/>',
    school:'<path d="M2 9.5L12 5l10 4.5L12 14z"/><path d="M6 11.5v4.5c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5M22 9.5v5"/>',
    link:  '<path d="M10 14L20 4M14 4h6v6"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/>',
    set:   '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    prev:  '<path d="M15 5l-7 7 7 7"/>',
    next:  '<path d="M9 5l7 7-7 7"/>',
    x:     '<path d="M6 6l12 12M18 6L6 18"/>',
    more:  '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></g>',
    copy:  '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    down:  '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    up:    '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    undo:  '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    chat:  '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>',
    train: '<circle cx="9.5" cy="4" r="1.7"/><path d="M4.5 9.5q5-2.2 10 0l-2 5.5h-6z"/><path d="M4.5 9.5c-1.4 1.6-1.6 4-1.2 6.5"/><path d="M14.5 9.5c1-2.6 4-2.6 5-.4V5"/><path d="M20 5.5l-.4 5q-2.6 1.2-5.2.4"/><path d="M8 15l-.6 6M12 15l.6 6"/>'
  };
  function ic(n, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>';
  }

  /* ═════════ 3. даты, время, текст ═════════ */

  function pad(n) { n = Math.floor(n); return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(s, n) { var d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function dowOf(s) { var w = parseIso(s).getDay(); return w === 0 ? 7 : w; }
  function mondayOf(s) { return addDays(s, 1 - dowOf(s)); }
  function todayIso() { return iso(new Date()); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function toMin(t) { var p = String(t || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function hhmm(m) { m = Math.max(0, Math.round(m)); return pad(m / 60) + ':' + pad(m % 60); }
  function dm(s) { var d = parseIso(s); return d.getDate() + ' ' + MON_G[d.getMonth()]; }
  function ddmm(s) { var d = parseIso(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function weekLabel(mon) {
    var sun = addDays(mon, 6), a = parseIso(mon), b = parseIso(sun);
    return a.getMonth() === b.getMonth()
      ? a.getDate() + '–' + b.getDate() + ' ' + MON_G[b.getMonth()]
      : a.getDate() + ' ' + MON_G[a.getMonth()] + ' – ' + b.getDate() + ' ' + MON_G[b.getMonth()];
  }
  function durLabel(m) {
    m = Math.max(0, Math.round(m));
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' мин';
    return h + ' ч' + (r ? ' ' + r + ' мин' : '');
  }
  function relDay(d) {
    var t = todayIso();
    if (d === addDays(t, 1)) return 'завтра';
    if (d === addDays(t, 2)) return 'послезавтра';
    return DOW_ACC[dowOf(d)];
  }
  function plural(n, a, b, c) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b;
    return c;
  }
  // msk — пояс того, кому показываем окна (сдвиг от Москвы); без него — пояс этого устройства
  function tzInfo(msk) {
    if (msk == null) msk = -new Date().getTimezoneOffset() / 60 - 3;
    var off = msk + 3;
    var city = { 2: 'калининградское', 3: 'московское', 4: 'самарское', 5: 'екатеринбургское', 6: 'омское', 7: 'красноярское', 8: 'иркутское', 9: 'якутское', 10: 'владивостокское', 11: 'магаданское', 12: 'камчатское' }[off];
    var shift = msk === 0 ? '' : 'МСК' + (msk > 0 ? '+' : '−') + Math.abs(msk);
    if (off === 3) return { long: 'Время московское.', short: 'время московское' };
    if (city) return { long: 'Время ' + city + ' (' + shift + ').', short: 'время ' + city + ', ' + shift };
    var u = 'UTC' + (off >= 0 ? '+' : '−') + Math.abs(off);
    return { long: 'Время ' + u + '.', short: 'время ' + u };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // мини-разметка Атласа: **жирный** и [текст](https://…). Сначала экранируем — потом размечаем.
  function md(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function plain(s) { return String(s || '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); }
  // номер пункта: «1б» → «1Б» — строчная «б» рядом с цифрой читается как «16» в любом шрифте
  function numTxt(n) { return String(n || '').replace(/(\d)([а-яё])$/i, function (m, d, l) { return d + l.toUpperCase(); }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clampInt(v, a, b, d) { var n = parseInt(v, 10); if (isNaN(n)) return d; return Math.min(b, Math.max(a, n)); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function cssId(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'); }
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia && matchMedia('(hover: none)').matches;

  /* ═════════ 4. хранилище ═════════ */

  var S = blank();
  var outbox = [];
  var lastTs = 0;

  function blank() { return { events: {}, blocks: {}, items: {}, cfg: {} }; }
  function stamp() { var t = Date.now(); if (t <= lastTs) t = lastTs + 1; lastTs = t; return t; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function persist() { lsSet(LS.state, S); lsSet(LS.out, outbox); }

  function load() {
    var saved = lsGet(LS.state, null);
    if (saved && typeof saved === 'object' && saved.events) {
      S = blank();
      KINDS.forEach(function (k) { S[k] = saved[k] && typeof saved[k] === 'object' ? saved[k] : {}; });
      outbox = lsGet(LS.out, []);
      if (!Array.isArray(outbox)) outbox = [];
    } else {
      seed();
    }
  }
  function seed() {
    var sd = window.KAB_SEED || {};
    S = blank();
    ['events', 'blocks', 'items'].forEach(function (k) {
      (sd[k] || []).forEach(function (o) { var c = clone(o); c.ts = 1; S[k][c.id] = c; });
    });
    var cf = sd.cfg || {};
    Object.keys(cf).forEach(function (id) { S.cfg[id] = { id: id, v: clone(cf[id]), ts: 1 }; });
    persist();
  }

  function cfg(id, d) { var o = S.cfg[id]; return o && o.v != null ? o.v : d; }
  function setCfg(id, v) { put('cfg', { id: id, v: v }); }

  function put(kind, obj) {
    var o = clone(obj);
    o.ts = stamp();
    S[kind][o.id] = o;
    enqueue({ t: 'put', k: kind, id: o.id, d: clone(o), ts: o.ts });
    return o;
  }
  function drop(kind, id) {
    var old = S[kind][id];
    if (!old) return null;
    delete S[kind][id];
    enqueue({ t: 'del', k: kind, id: id, ts: stamp() });
    return old;
  }
  function enqueue(op) {
    outbox = outbox.filter(function (o) { return !(o.k === op.k && o.id === op.id); });
    outbox.push(op);
    persist();
    scheduleSync();
  }

  /* ═════════ 5. синхронизация с сервером в РФ ═════════ */

  var SY = { s: 'local', busy: false, again: false, timer: 0, last: 0 };
  function getKey() { return String(lsGet(LS.key, '') || ''); }

  function scheduleSync(ms) {
    if (!getKey()) { setStatus('local'); return; }
    clearTimeout(SY.timer);
    SY.timer = setTimeout(syncNow, ms == null ? 700 : ms);
  }

  function syncNow() {
    var key = getKey();
    if (!key) { setStatus('local'); return; }
    if (SY.busy) { SY.again = true; return; }
    SY.busy = true;
    // фоновая сверка раз в несколько секунд не мигает «сохраняю…» — только когда есть что отправить
    if (outbox.length || SY.s !== 'synced') setStatus('syncing');

    // первый выход на сервер: отдать всё, что накоплено на устройстве (побеждает более поздняя правка)
    if (!lsGet(LS.linked, false)) {
      KINDS.forEach(function (k) {
        Object.keys(S[k]).forEach(function (id) {
          var o = S[k][id];
          if (!outbox.some(function (x) { return x.k === k && x.id === id; })) {
            outbox.push({ t: 'put', k: k, id: id, d: clone(o), ts: o.ts || 1 });
          }
        });
      });
    }
    var sending = outbox.slice();
    var ctrl = window.AbortController ? new AbortController() : null;
    var guard = setTimeout(function () { if (ctrl) ctrl.abort(); }, 9000);

    fetch(API + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ ops: sending }),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw { badKey: true };
        rememberApi();   // сервер ответил — этот адрес рабочий
        if (!r.ok) throw { http: r.status };
        return r.json();
      })
      .then(function (data) {
        outbox = outbox.filter(function (o) {
          return !sending.some(function (s) { return s.k === o.k && s.id === o.id && s.ts === o.ts; });
        });
        var next = blank();
        (data && data.objects || []).forEach(function (o) {
          if (!next[o.k] || !o.d || typeof o.d !== 'object') return;
          var d = o.d; d.id = o.id; d.ts = o.ts;
          next[o.k][o.id] = d;
        });
        // правки, сделанные пока шёл запрос, накладываем сверху
        outbox.forEach(function (op) {
          if (!next[op.k]) return;
          if (op.t === 'put') next[op.k][op.id] = clone(op.d); else delete next[op.k][op.id];
        });
        var changed = JSON.stringify(next) !== JSON.stringify(S);
        S = next;
        lsSet(LS.linked, true);
        persist();
        SY.last = Date.now();
        setStatus('synced');
        if (changed) safeRender();
      })
      .catch(function (e) {
        if (!e || (!e.badKey && !e.http)) nextApi();   // до сервера не достали (VPN?) — сменить адрес
        setStatus(e && e.badKey ? 'badkey' : 'offline');
      })
      .then(function () {
        clearTimeout(guard);
        SY.busy = false;
        if (SY.again) { SY.again = false; scheduleSync(300); }
      });
  }

  function setStatus(s) { SY.s = s; paintStatus(); }
  function statusShort() {
    return { synced: 'синхронно', syncing: 'сохраняю…', offline: 'нет связи', badkey: 'не тот ключ' }[SY.s] || 'локально';
  }
  function statusLong() {
    switch (SY.s) {
      case 'synced': return 'Синхронизировано с сервером в ' + hhmm(new Date(SY.last).getHours() * 60 + new Date(SY.last).getMinutes()) + '. Телефон и Мак видят одно и то же.';
      case 'syncing': return 'Сохраняю на сервер…';
      case 'offline': return 'Сервер не отвечает. Всё сохранено здесь и уйдёт на сервер, когда он оживёт' + (outbox.length ? ' (ждут правок: ' + outbox.length + ')' : '') + '.';
      case 'badkey': return 'Сервер не принял ключ. Проверь его и введи ещё раз.';
      default: return 'Данные хранятся только в этом браузере. Чтобы телефон и Мак видели одно и то же, нужен ключ сервера.';
    }
  }
  function paintStatus() {
    var b = $('#kbStatus');
    if (b) {
      b.setAttribute('data-s', SY.s);
      b.querySelector('span').textContent = statusShort();
      b.setAttribute('aria-label', 'Хранение данных: ' + statusShort());
    }
    var s = $('#shStatus');
    if (s) { s.setAttribute('data-s', SY.s); s.querySelector('span').textContent = statusLong(); }
  }

  /* ═════════ 6. расписание: вхождения, дорожки, окна ═════════ */

  // все занятия недели (mon — дата понедельника), по одному на каждое появление
  function occurrences(mon) {
    var sun = addDays(mon, 6), out = [];
    Object.keys(S.events).forEach(function (id) {
      var ev = S.events[id], date;
      if (!ev || !ev.start) return;
      if (ev.rep) {
        if (!(ev.dow >= 1 && ev.dow <= 7)) return;
        date = addDays(mon, ev.dow - 1);
        if (ev.from && date < ev.from) return;
        if (ev.until && date > ev.until) return;
      } else {
        date = ev.date;
        if (!date || date < mon || date > sun) return;
      }
      var s = toMin(ev.start), d = Math.max(5, +ev.dur || 60);
      out.push({ ev: ev, date: date, s: s, e: s + d, off: !!(ev.rep && ev.skip && ev.skip.indexOf(date) >= 0) });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.s - b.s) || (b.e - a.e); });
    return out;
  }
  function isLesson(o) { return o.ev.type !== 'reserve' && !o.off; }
  function typeOf(ev) { return TYPES[ev.type] || TYPES.other; }

  // пересекающиеся занятия дня встают рядом, каждое в свою дорожку
  function lanes(list) {
    var groups = [], cur = null, end = -1;
    list.forEach(function (o) {
      if (!cur || o.s >= end) { cur = { cols: [], items: [] }; groups.push(cur); end = -1; }
      var lane = -1;
      for (var i = 0; i < cur.cols.length; i++) { if (cur.cols[i] <= o.s) { lane = i; break; } }
      if (lane < 0) { lane = cur.cols.length; cur.cols.push(o.e); } else { cur.cols[lane] = o.e; }
      o.lane = lane;
      cur.items.push(o);
      end = Math.max(end, o.e);
    });
    groups.forEach(function (g) { g.items.forEach(function (o) { o.n = g.cols.length; }); });
  }

  // видимые часы сетки: 08–21, раздвигаются, если занятие выходит за край
  function range(occ) {
    var a = 8 * 60, b = 21 * 60;
    occ.forEach(function (o) {
      if (o.s < a) a = Math.floor(o.s / 60) * 60;
      if (o.e > b) b = Math.ceil(o.e / 60) * 60;
    });
    return { a: Math.max(0, a), b: Math.min(24 * 60, b) };
  }

  // свободные окна: старт каждый час в часы приёма, занятие целиком помещается
  function freeSlots(mon) {
    var hours = cfg('hours', {}) || {}, slot = +cfg('slot', 60) || 60;
    var today = todayIso(), nm = nowMin(), res = [];
    var occ = occurrences(mon).filter(isLesson);
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), hw = hours[i + 1];
      if (!hw || d < today) continue;
      var a = toMin(hw[0]), b = toMin(hw[1]), list = [];
      var busy = occ.filter(function (o) { return o.date === d; });
      for (var m = a; m + slot <= b; m += 60) {
        if (d === today && m < nm + 30) continue;
        var clash = busy.some(function (o) { return m < o.e && o.s < m + slot; });
        if (!clash) list.push(m);
      }
      res.push({ date: d, dow: i + 1, list: list });
    }
    return res;
  }

  // короткая подпись для узкой колонки телефона
  function shortOf(ev) {
    if (ev.short) return ev.short;
    var T = typeOf(ev), t = String(ev.title || '').trim();
    if (!t || t === T.label) return T.tag || T.label;
    var m = t.match(/(\d{1,2})\s*кл/i);
    if (/^учени/i.test(t) && m) return m[1] + ' кл';
    return t.split(/[\s,]+/)[0];
  }

  function nowInfo() {
    var t = todayIso(), nm = nowMin();
    var today = occurrences(mondayOf(t)).filter(function (o) { return o.date === t && isLesson(o); });
    var cur = null, next = null, ahead = null;
    today.forEach(function (o) {
      if (!cur && o.s <= nm && nm < o.e) cur = o;
      if (!next && o.s > nm) next = o;
    });
    if (!cur && !next) {
      for (var k = 1; k <= 14 && !ahead; k++) {
        var d = addDays(t, k);
        var list = occurrences(mondayOf(d)).filter(function (o) { return o.date === d && isLesson(o); });
        if (list.length) ahead = list[0];
      }
    }
    return { today: today, cur: cur, next: next, ahead: ahead, nm: nm };
  }

  /* ═════════ 7. чек-лист: выборки ═════════ */

  function sortedBlocks() {
    return Object.keys(S.blocks).map(function (k) { return S.blocks[k]; })
      .sort(function (a, b) { return ((a.order || 0) - (b.order || 0)) || String(a.id).localeCompare(String(b.id)); });
  }
  function itemsOf(blockId) {
    return Object.keys(S.items).map(function (k) { return S.items[k]; })
      .filter(function (x) { return x.block === blockId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function isDone(it) { return it.goal ? (it.count || 0) >= it.goal : !!it.done; }
  function nextStep() {
    var bl = sortedBlocks();
    for (var i = 0; i < bl.length; i++) {
      var open = itemsOf(bl[i].id).filter(function (x) { return !isDone(x); });
      if (open.length) return { b: bl[i], it: open[0] };
    }
    return null;
  }

  /* ═════════ 8. оболочка ═════════ */

  var V = { tab: 'week', week: mondayOf(todayIso()), oknaNext: false, today: todayIso(), tz: HOME_MSK, tzMore: false };
  var FAB, SH = { el: null, bg: null, onSubmit: null, lastFocus: null };

  function mountShell() {
    var tabs = [['week', 'Неделя'], ['list', 'Чек-лист'], ['okna', 'Окна'], ['train', 'Тренировка']];
    var links = tabs.map(function (t) {
      return '<a href="#' + t[0] + '" data-tab="' + t[0] + '" title="' + t[1] + '" aria-label="' + t[1] + '">' + ic(t[0]) + '<span>' + t[1] + '</span></a>';
    }).join('') +
      '<a href="perepiska.html" title="Переписка" aria-label="Переписка">' + ic('chat') + '<span>Переписка</span></a>' +   // что бот пишет людям (28.09)
      '<a href="sistemy.html" title="Системы" aria-label="Системы">' + ic('pulse') + '<span>Системы</span></a>' +   // пульт: что работает, сервер, люди (ТЗ 13, 29.09)
      '<a href="' + SCHOOL + '" target="_blank" rel="noopener" title="Школа" aria-label="Школа">' + ic('school') + '<span>Школа</span></a>' +
      '<a href="' + HUB + '" target="_blank" rel="noopener" title="Ссылки" aria-label="Ссылки">' + ic('link') + '<span>Ссылки</span></a>';

    $('#kbTop').innerHTML =
      '<div class="kb-brand">' +
        '<div class="lk-sign kb-theme" role="group" aria-label="Тема оформления">' +
          '<button class="kb-tm" type="button" data-act="theme" data-v="light" aria-pressed="false" aria-label="Светлая тема" title="Светлая тема"><span class="lk-badge lk-badge-l lk-badge--sm">Λ</span></button>' +
          '<button class="kb-tm" type="button" data-act="theme" data-v="dark" aria-pressed="false" aria-label="Тёмная тема" title="Тёмная тема"><span class="lk-badge lk-badge-d lk-badge--sm">D.</span></button>' +
        '</div>' +
        '<a class="kb-name" href="#week">Кабинет</a></div>' +
      '<nav class="kb-tabs" aria-label="Разделы">' + links + '</nav>' +
      '<span class="kb-clock mono js-clock" aria-label="Время">' + hhmm(nowMin()) + '</span>' +   // часы на всех страницах (01.10)
      '<button class="kb-status" id="kbStatus" type="button" data-act="settings" data-s="local"><i></i><span>локально</span></button>' +
      '<button class="kb-ibtn" type="button" data-act="settings" aria-label="Хранение и копия">' + ic('set') + '</button>';
    $('#kbNav').innerHTML = links;
    FAB.innerHTML = ic('plus');
  }

  // тема: Λ — светлая, D. — тёмная (как на сайте учеников); выбор помнит этот браузер
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function setTheme(t) {
    var root = document.documentElement, light = t === 'light';
    if (light === (currentTheme() === 'light')) return;
    if (!reduceMotion) {
      root.classList.add('kb-theming');
      setTimeout(function () { root.classList.remove('kb-theming'); }, 450);
    }
    if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    try { localStorage.setItem(LS.theme, light ? 'light' : 'dark'); } catch (e) { /* без памяти — просто на этот раз */ }
    paintTheme();
  }
  function paintTheme() {
    var t = currentTheme();
    $$('[data-act="theme"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === t)); });
    var m = $('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f1edf8' : '#0A0610');
  }

  function go(tab, anim) {
    if (TABS.indexOf(tab) < 0) tab = 'week';
    V.tab = tab;
    lsSet(LS.tab, tab);
    TABS.forEach(function (n) {
      var sec = $('#v-' + n);
      sec.hidden = n !== tab;
      sec.classList.remove('is-in');
    });
    $$('.kb-tabs a[data-tab], .kb-nav a[data-tab]').forEach(function (a) {
      var on = a.getAttribute('data-tab') === tab;
      a.classList.toggle('is-on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // нижняя панель листается вбок: открытая вкладка не должна прятаться за краем
    var navOn = $('.kb-nav a.is-on');
    if (navOn) navOn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    FAB.hidden = tab !== 'week';
    render(true);
    if (anim !== false && !reduceMotion) {
      var v = $('#v-' + tab);
      void v.offsetWidth;
      v.classList.add('is-in');
    }
  }

  function render(anim) {
    V.dirty = false;
    paintStatus();
    if (V.tab === 'week') renderWeek(anim);
    else if (V.tab === 'list') renderList();
    else if (V.tab === 'train') renderTrain();
    else renderOkna();
  }

  // перерисовка «со стороны» (пришли данные с сервера или из другой вкладки):
  // пока D печатает в поле или открыта карточка — ждём, иначе набранное пропадёт
  function isTyping() {
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox');
  }
  function safeRender() {
    if (isSheetOpen() || isTyping()) { V.dirty = true; paintStatus(); return; }
    render(false);
  }
  function flushDirty() {
    setTimeout(function () {
      if (V.dirty && !isSheetOpen() && !isTyping()) render(false);
    }, 60);
  }

  /* ═════════ 9. раздел «Неделя» ═════════ */

  function renderWeek(anim) {
    var mon = V.week, today = todayIso(), thisMon = mondayOf(today), nm = nowMin();
    var occ = occurrences(mon);
    var lessons = occ.filter(isLesson);
    var mins = lessons.reduce(function (a, o) { return a + (o.e - o.s); }, 0);
    var free = freeSlots(mon).reduce(function (a, d) { return a + d.list.length; }, 0);
    var R = range(occ), rows = (R.b - R.a) / 60;
    var kick = mon === thisMon ? 'эта неделя' : mon === addDays(thisMon, 7) ? 'следующая' : mon === addDays(thisMon, -7) ? 'прошлая' : 'неделя';

    var h = '<div class="wkv">';
    h += '<aside class="wkv-rail" id="wkRail">' + railHtml() + '</aside>';
    h += '<div class="wkv-main">';
    h += '<div class="wk-head">' +
      '<button class="wk-arrow" type="button" data-act="wk-prev" aria-label="Прошлая неделя">' + ic('prev') + '</button>' +
      '<div class="wk-title"><small>' + kick + '</small>' + esc(weekLabel(mon)) + '</div>' +
      '<button class="wk-arrow" type="button" data-act="wk-next" aria-label="Следующая неделя">' + ic('next') + '</button>' +
      (mon !== thisMon ? '<button class="wk-today" type="button" data-act="wk-today">К сегодня</button>' : '') +
      '<button class="lk-btn wk-add" type="button" data-act="ev-new">' + ic('plus') + 'Занятие</button>' +
      '</div>';
    h += '<div class="wk-stats">' +
      '<div><b>' + lessons.length + '</b><span>' + plural(lessons.length, 'занятие', 'занятия', 'занятий') + '</span></div>' +
      '<div><b>' + Math.floor(mins / 60) + '<small>ч</small>' + (mins % 60 ? pad(mins % 60) + '<small>мин</small>' : '') + '</b><span>в сумме</span></div>' +
      '<button type="button" data-act="to-okna" aria-label="Свободные окна: ' + free + '"><b>' + free + ic('arrow') + '</b><span>' + plural(free, 'окно', 'окна', 'окон') + ' свободно</span></button>' +
      '</div>';
    if (!occ.length) h += '<div class="wk-empty">Неделя пустая. Нажми на время в сетке или на «+», чтобы вписать занятие.</div>';

    h += '<div class="wk' + (anim ? ' is-anim' : '') + '" style="--rows:' + rows + '">';
    h += '<div class="wk-corner"></div>';
    var i, d;
    for (i = 0; i < 7; i++) {
      d = addDays(mon, i);
      h += '<div class="wk-dh' + (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '') + '">' +
        '<span>' + DOW_S[i + 1] + '</span><b>' + parseIso(d).getDate() + '</b></div>';
    }
    h += '<div class="wk-times" aria-hidden="true">';
    for (var t = R.a; t < R.b; t += 60) h += '<span style="--h:' + ((t - R.a) / 60) + '">' + pad(t / 60) + '</span>';
    h += '</div>';

    var n = 0;
    for (i = 0; i < 7; i++) {
      d = addDays(mon, i);
      var day = occ.filter(function (o) { return o.date === d; });
      var zones = day.filter(function (o) { return o.ev.type === 'reserve'; });
      var evs = day.filter(function (o) { return o.ev.type !== 'reserve'; });
      lanes(evs);
      h += '<div class="wk-col' + (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '') + '" data-act="slot" data-date="' + d + '" data-a="' + R.a + '"' +
        ' aria-label="' + DOW_L[i + 1] + ', ' + dm(d) + ': нажми на время, чтобы вписать занятие">';
      zones.forEach(function (o) { h += zoneHtml(o, R.a); });
      for (var j = 0; j < evs.length; j++) h += evHtml(evs[j], R.a, today, nm, n++);
      if (d === today && nm >= R.a && nm <= R.b) h += '<div class="wk-now" style="--m:' + (nm - R.a) + '"></div>';
      h += '</div>';
    }
    h += '</div>';
    h += '<div class="wk-legend" aria-hidden="true">' +
      '<span><i class="lg-solo"></i>индивидуально</span><span><i class="lg-group"></i>группа (ОГЭ, ЕГЭ)</span>' +
      '<span><i class="lg-school"></i>школа</span><span><i class="lg-reserve"></i>резерв под группы</span>' +
      '<span><i class="lg-other"></i>другое</span><span><i class="lg-off"></i>отменено</span></div>';
    h += '</div></div>';
    $('#v-week').innerHTML = h;
  }

  function evHtml(o, a, today, nm, i) {
    var ev = o.ev, T = typeOf(ev), d = o.date;
    var st = o.off ? ' is-off'
      : (d < today || (d === today && nm >= o.e)) ? ' is-past'
      : (d === today && nm >= o.s) ? ' is-now' : '';
    var full = ev.title || T.label;
    var aria = full + ', ' + hhmm(o.s) + '–' + hhmm(o.e) + (o.off ? ', отменено' : '');
    return '<button class="ev ev--' + T.cls + st + ((o.e - o.s) < 50 ? ' is-short' : '') + '" type="button" data-act="ev" data-id="' + esc(ev.id) + '" data-date="' + d + '"' +
      ' style="--s:' + (o.s - a) + ';--d:' + (o.e - o.s) + ';--l:' + (o.lane || 0) + ';--n:' + (o.n || 1) + ';--i:' + i + '"' +
      ' aria-label="' + esc(aria) + '" title="' + esc(aria) + '">' +
      '<span class="ev-t">' + hhmm(o.s) + '<span class="ev-end">–' + hhmm(o.e) + '</span></span>' +
      '<span class="ev-n ev-short">' + esc(shortOf(ev)) + '</span>' +
      '<span class="ev-n ev-full">' + (T.tag && full !== T.label ? '<span class="ev-tag">' + T.tag + '</span> ' : '') + esc(full) + '</span>' +
      '</button>';
  }

  function zoneHtml(o, a) {
    var ev = o.ev, lbl = ev.title || 'Резерв';
    var aria = lbl + ', ' + hhmm(o.s) + '–' + hhmm(o.e) + (o.off ? ', снят на эту неделю' : '');
    return '<div class="zone' + (o.off ? ' is-off' : '') + '" style="--s:' + (o.s - a) + ';--d:' + (o.e - o.s) + '">' +
      '<button class="zone-tag" type="button" data-act="ev" data-id="' + esc(ev.id) + '" data-date="' + o.date + '" title="' + esc(aria) + '" aria-label="' + esc(aria) + '">' + esc(lbl) + '</button></div>';
  }

  function railHtml() { return helloHtml() + nowHtml() + nextHtml() + agendaHtml(); }

  // список дня (на широком экране): сегодня, а если сегодня пусто — ближайший день с занятиями
  function agendaHtml() {
    var t = todayIso(), nm = nowMin(), day = t, list = [];
    for (var k = 0; k <= 14 && !list.length; k++) {
      day = addDays(t, k);
      var d0 = day;
      list = occurrences(mondayOf(d0)).filter(function (o) { return o.date === d0 && isLesson(o); });
    }
    var head = day === t ? 'Сегодня' : cap(relDay(day)) + ', ' + dm(day);
    if (!list.length) return '<section class="agenda"><h3>Впереди</h3><p class="ag-none">Занятий на две недели вперёд нет.</p></section>';
    return '<section class="agenda" aria-label="' + esc(head) + '"><h3>' + esc(head) + '</h3>' + list.map(function (o) {
      var st = day === t ? (nm >= o.e ? ' is-past' : nm >= o.s ? ' is-now' : '') : '';
      var T = typeOf(o.ev);
      return '<button class="ag' + st + '" type="button" data-act="ev" data-id="' + esc(o.ev.id) + '" data-date="' + o.date + '">' +
        '<span class="mono">' + hhmm(o.s) + '–' + hhmm(o.e) + '</span><i class="sw-' + T.cls + '"></i><b>' + esc(o.ev.title || T.label) + '</b></button>';
    }).join('') + '</section>';
  }

  function helloHtml() {
    var hr = new Date().getHours(), t = todayIso();
    var hi = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : hr < 23 ? 'Добрый вечер' : 'Доброй ночи';
    return '<div class="hello"><small>' + hi + ', D.</small>' +
      '<h1><span>' + cap(DOW_L[dowOf(t)]) + ', ' + dm(t) + '</span><span class="mono js-clock">' + hhmm(nowMin()) + '</span></h1></div>';
  }

  function nowHtml() {
    var N = nowInfo(), nm = N.nm, kick, chip = '', target = null, title, sub, live = false;
    if (N.cur) { live = true; kick = 'Сейчас'; target = N.cur; chip = 'ещё ' + durLabel(N.cur.e - nm); }
    else if (N.next) { kick = 'Дальше'; target = N.next; chip = 'через ' + durLabel(N.next.s - nm); }
    else { kick = N.today.length ? 'На сегодня всё' : 'Сегодня свободно'; if (N.ahead) { target = N.ahead; chip = 'дальше: ' + relDay(N.ahead.date); } }

    if (target) {
      title = target.ev.title || typeOf(target.ev).label;
      sub = (target === N.ahead ? cap(relDay(target.date)) + ', ' : '') + hhmm(target.s) + '–' + hhmm(target.e) + ', ' + typeOf(target.ev).word;
    } else {
      title = 'Впереди пусто';
      sub = 'Вписать занятие: кнопка «+» или нажатие на время в сетке.';
    }

    var a0 = 8 * 60, span = 13 * 60;
    var segs = N.today.map(function (o) {
      var s = Math.max(o.s, a0), e = Math.min(o.e, a0 + span);
      if (e <= s) return '';
      return '<i class="t-' + typeOf(o.ev).cls + (o.e <= nm ? ' is-past' : '') + '" style="--a:' + ((s - a0) / span).toFixed(4) + ';--w:' + ((e - s) / span).toFixed(4) + '"></i>';
    }).join('');
    var mark = nm >= a0 && nm <= a0 + span ? '<span class="strip-now" style="--m:' + ((nm - a0) / span).toFixed(4) + '"></span>' : '';
    var ticks = [8, 10, 12, 14, 16, 18, 20].map(function (x) {
      return '<span style="--p:' + ((x * 60 - a0) / span).toFixed(4) + '">' + pad(x) + '</span>';
    }).join('');
    var mins = N.today.reduce(function (s, o) { return s + (o.e - o.s); }, 0);
    var foot = N.today.length
      ? 'Сегодня <b>' + N.today.length + ' ' + plural(N.today.length, 'занятие', 'занятия', 'занятий') + '</b>, ' + durLabel(mins)
      : 'Сегодня занятий нет';

    return '<section class="now' + (live ? ' is-live' : '') + '" aria-label="Сейчас и дальше">' +
      '<div class="now-k"><span>' + kick + '</span>' + (chip ? '<span class="now-chip">' + esc(chip) + '</span>' : '') + '</div>' +
      (target
        ? '<button class="now-t" type="button" data-act="ev" data-id="' + esc(target.ev.id) + '" data-date="' + target.date + '">' + esc(title) + '</button>'
        : '<div class="now-t">' + esc(title) + '</div>') +
      '<div class="now-s">' + esc(sub) + '</div>' +
      '<div class="strip" aria-hidden="true"><div class="strip-bar">' + segs + '</div>' + mark + '</div>' +
      '<div class="strip-h" aria-hidden="true">' + ticks + '</div>' +
      '<div class="now-f">' + foot + '</div></section>';
  }

  function nextHtml() {
    var n = nextStep();
    if (!n) {
      return '<div class="nx is-empty"><div class="nx-tx"><small>Чек-лист</small><p>Всё отмечено. Новые пункты добавляются во вкладке «Чек-лист».</p></div>' +
        '<a class="nx-go" href="#list" aria-label="Открыть чек-лист">' + ic('arrow') + '</a></div>';
    }
    var it = n.it;
    var txt = it.goal ? n.b.title + ', ' + it.text + ': ' + (it.count || 0) + ' из ' + it.goal : plain(it.text);
    return '<div class="nx">' +
      '<label class="nx-ck"><input class="sr" type="checkbox" data-act="nx-tick" data-id="' + esc(it.id) + '" aria-label="Отметить: ' + esc(txt) + '"><span class="ck">' + ic('check') + '</span></label>' +
      '<div class="nx-tx"><small>Следующий шаг</small><p>' + (it.num ? '<b style="color:#c084fc">' + esc(numTxt(it.num)) + '</b> ' : '') + esc(txt) + '</p></div>' +
      '<a class="nx-go" href="#list" aria-label="Весь чек-лист">' + ic('arrow') + '</a></div>';
  }

  function refreshRail() { var r = $('#wkRail'); if (r) r.innerHTML = railHtml(); }

  function slotClick(col, e) {
    var wk = col.closest('.wk');
    var rows = +(wk && wk.style.getPropertyValue('--rows')) || 13;
    var rect = col.getBoundingClientRect();
    var perHour = rect.height / rows;
    var m = +col.getAttribute('data-a') + Math.floor((e.clientY - rect.top) / perHour * 2) * 30;
    m = Math.max(0, Math.min(m, 23 * 60));
    openEvent({ date: col.getAttribute('data-date'), start: hhmm(m) });
  }

  // «+»: ближайший свободный час сегодня (9:00–20:00); если такого нет — 17:00
  function newEventDefaults() {
    var today = todayIso(), thisMon = mondayOf(today);
    if (V.week !== thisMon) return { date: V.week, start: '17:00' };
    var busy = occurrences(thisMon).filter(function (o) { return o.date === today && isLesson(o); });
    for (var m = Math.max(9 * 60, Math.ceil((nowMin() + 1) / 60) * 60); m <= 20 * 60; m += 60) {
      var clash = busy.some(function (o) { return m < o.e && o.s < m + 60; });
      if (!clash) return { date: today, start: hhmm(m) };
    }
    return { date: today, start: '17:00' };
  }

  /* ═════════ 10. карточка занятия ═════════ */

  function openEvent(opt) {
    var ev = opt.id ? S.events[opt.id] : null;
    if (opt.id && !ev) return;
    var isNew = !ev;
    var date = opt.date || todayIso();
    var wkMon = mondayOf(date);
    var f = isNew
      ? { type: 'solo', dow: dowOf(date), dur: TYPES.solo.dur, rep: true }
      : { type: TYPES[ev.type] ? ev.type : 'other', dow: ev.rep ? ev.dow : dowOf(ev.date), dur: +ev.dur || 60, rep: !!ev.rep };
    var durTouched = !isNew;
    var off = !isNew && ev.rep && (ev.skip || []).indexOf(date) >= 0;
    var startVal = isNew ? (opt.start || '17:00') : ev.start;

    var sub = isNew ? DOW_L[f.dow] + ', ' + dm(date)
      : (ev.rep ? cap(DOW_EVERY[ev.dow]) : 'Только ' + dm(ev.date)) + ', ' + ev.start + '–' + hhmm(toMin(ev.start) + (+ev.dur || 60));

    var types = TYPE_ORDER.map(function (t) {
      return '<button type="button" class="chip" data-f="type" data-v="' + t + '" aria-pressed="' + (f.type === t) + '"><span class="sw sw-' + TYPES[t].cls + '"></span>' + TYPES[t].label + '</button>';
    }).join('');
    var days = '';
    for (var d = 1; d <= 7; d++) days += '<button type="button" class="chip" data-f="dow" data-v="' + d + '" aria-pressed="' + (f.dow === d) + '">' + DOW_S[d] + '</button>';
    var durs = DURS.map(function (m) { return '<button type="button" class="chip" data-f="dur" data-v="' + m + '" aria-pressed="' + (f.dur === m) + '">' + m + '</button>'; }).join('');

    var html =
      (off ? '<div class="fl-warn">Занятие ' + dm(date) + ' отменено. Остальные недели на месте.</div>' : '') +
      (!isNew && ev.type === 'solo' ? '<div class="abk" id="evAbon" hidden></div>' : '') +
      '<label class="fl"><span>Кто или что</span><input class="inp" name="title" maxlength="80" value="' + esc(isNew ? '' : ev.title || '') + '" placeholder="Имя ученика, группа или дело" enterkeyhint="done"></label>' +
      '<div class="fl"><span class="fl-lbl">Тип</span><div class="chips" data-g="type">' + types + '</div>' +
        '<p class="fl-hint" id="typeHint"></p></div>' +
      '<div class="fl"><span class="fl-lbl">День</span><div class="chips chips--days" data-g="dow">' + days + '</div></div>' +
      '<label class="fl"><span>Начало</span><input class="inp inp--time inp--start" type="time" name="start" step="300" value="' + esc(startVal) + '"></label>' +
      '<div class="fl"><span class="fl-lbl">Длится, минут</span><div class="dur-row" data-g="dur">' + durs +
        '<input class="inp inp--time inp--num" type="number" inputmode="numeric" name="dur" min="5" max="720" step="5" value="' + f.dur + '" aria-label="Своя длительность в минутах"></div></div>' +
      '<label class="tg"><input type="checkbox" name="rep"' + (f.rep ? ' checked' : '') + '><span class="tg-ui"></span>' +
        '<span class="tg-tx"><b>Каждую неделю</b><small id="repHint"></small></span></label>' +
      '<label class="fl"><span>Заметка</span><input class="inp" name="note" maxlength="160" value="' + esc(isNew ? '' : ev.note || '') + '" placeholder="необязательно: Zoom, тема, оплата"></label>' +
      '<label class="fl"><span>Ссылка на занятие</span><input class="inp" name="meet" type="url" inputmode="url" maxlength="300" value="' + esc(isNew ? '' : ev.meet || '') + '" placeholder="необязательно: https://telemost.yandex.ru/…"></label>' +
      '<div class="fl-warn" id="evWarn" hidden></div>' +
      '<div class="sh-actions"><button class="lk-btn" type="submit">' + (isNew ? 'Вписать' : 'Сохранить') + '</button>' +
      (isNew ? '' :
        (ev.rep
          ? (off
            ? '<button class="btn2 btn2--mint" type="button" data-e="unskip">' + ic('undo') + 'Вернуть занятие ' + ddmm(date) + '</button>'
            : '<button class="btn2" type="button" data-e="skip">Отменить только ' + ddmm(date) + '</button>')
          : '') +
        (ev.type !== 'reserve' ? '<button class="btn2" type="button" data-e="invite">' + ic('link') + 'Ссылка ученику: перенос и отмена</button>' : '') +
        '<button class="btn2 btn2--danger" type="button" data-e="del">' + ic('x') + (ev.rep ? 'Удалить из расписания совсем' : 'Удалить') + '</button>') +
      '</div>';

    var form = sheet(isNew ? 'Новое занятие' : (ev.title || typeOf(ev).label), sub, html, save);
    if (!isNew && ev.type === 'solo') abonMount(form, ev, date);

    function onceDate() { return addDays(wkMon, f.dow - 1); }
    function paintHints() {
      var hint = { reserve: 'Пунктир в сетке: вечер, который держишь под группы. Занятиям не мешает, в «Окнах» считается свободным.', school: 'Серым: школьный урок.', other: 'Любое дело, которое занимает время: встреча, запись видео.' }[f.type] || '';
      $('#typeHint', form).textContent = hint;
      $('#typeHint', form).hidden = !hint;
      $('#repHint', form).textContent = f.rep ? DOW_EVERY[f.dow] : 'только ' + dm(onceDate()) + '. Включи, чтобы повторялось';
      var warn = $('#evWarn', form);
      if (f.type === 'reserve') { warn.hidden = true; return; }
      var s = toMin(form.start.value || startVal), e = s + (clampInt(form.dur.value, 5, 720, f.dur));
      var dd = onceDate();
      var clash = occurrences(wkMon).filter(function (o) {
        return o.date === dd && isLesson(o) && (!ev || o.ev.id !== ev.id) && s < o.e && o.s < e;
      });
      warn.hidden = !clash.length;
      if (clash.length) {
        warn.textContent = 'Пересекается: ' + clash.map(function (o) { return (o.ev.title || typeOf(o.ev).label) + ', ' + hhmm(o.s) + '–' + hhmm(o.e); }).join('; ') + '. Сохранить всё равно можно.';
      }
    }
    function press(group, v) {
      $$('[data-g="' + group + '"] .chip', form).forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-v') === String(v))); });
    }

    form.addEventListener('click', function (e) {
      var c = e.target.closest('[data-f]');
      if (c) {
        var k = c.getAttribute('data-f'), v = c.getAttribute('data-v');
        if (k === 'type') {
          f.type = v; press('type', v);
          if (!durTouched) { f.dur = TYPES[v].dur; form.dur.value = f.dur; press('dur', f.dur); }
          if (v === 'reserve' && !form.title.value.trim()) form.title.placeholder = 'Под группы';
        } else if (k === 'dow') { f.dow = +v; press('dow', v); }
        else if (k === 'dur') { f.dur = +v; durTouched = true; form.dur.value = v; press('dur', v); }
        paintHints();
        return;
      }
      var b = e.target.closest('[data-e]');
      if (!b) return;
      var what = b.getAttribute('data-e');
      if (what === 'skip') skipOnce();
      else if (what === 'unskip') unskip();
      else if (what === 'del') removeEvent();
      else if (what === 'invite') inviteLink(ev);
      else if (what.indexOf('ab-') === 0) abonAct(b);
    });
    form.dur.addEventListener('input', function () { f.dur = clampInt(form.dur.value, 5, 720, f.dur); durTouched = true; press('dur', f.dur); paintHints(); });
    form.start.addEventListener('input', paintHints);
    form.rep.addEventListener('change', function () { f.rep = form.rep.checked; paintHints(); });
    form.title.addEventListener('input', function () { fieldOk(form.title); });
    paintHints();

    function save() {
      var title = form.title.value.trim().slice(0, 80);
      if (!title) {
        if (f.type === 'solo' || f.type === 'other') { fieldErr(form.title, f.type === 'solo' ? 'Впиши имя ученика' : 'Впиши, что это за дело'); return; }
        title = f.type === 'reserve' ? 'Под группы' : TYPES[f.type].label;
      }
      var st = form.start.value;
      if (!/^\d{2}:\d{2}$/.test(st)) { fieldErr(form.start, 'Проверь время начала'); return; }
      var o = isNew ? { id: uid('e') } : clone(S.events[ev.id] || ev);
      if (o.title !== title) delete o.short;
      var w1 = function (t) { return String(t || '').toLowerCase().split(/\s+/).filter(Boolean)[0] || ''; };
      if (o.who && w1(o.title) !== w1(title)) delete o.who;   // слот отдали другому ученику («Лиза» → «Лиза 10 кл» — тот же)
      o.title = title;
      o.type = f.type;
      o.start = st;
      o.dur = clampInt(form.dur.value, 5, 720, f.dur);
      var note = form.note.value.trim().slice(0, 160);
      if (note) o.note = note; else delete o.note;
      var meet = form.meet.value.trim().slice(0, 300);
      if (meet && !/^https:\/\/[^\s"'<>]{4,}$/.test(meet)) { fieldErr(form.meet, 'Ссылка должна начинаться с https://'); return; }
      if (meet) o.meet = meet; else delete o.meet;
      if (!o.who && f.type !== 'reserve') {
        // тот же ученик, что в другом его занятии: разовое занятие-перенос попадёт в его ссылку и абонемент
        var key = title.replace(/\s+/g, ' ').toLowerCase();
        var twin = Object.keys(S.events).map(function (k) { return S.events[k]; }).filter(function (x) {
          return x && x.who && x.id !== o.id && x.type === f.type && String(x.title || '').replace(/\s+/g, ' ').trim().toLowerCase() === key;
        })[0];
        if (twin) o.who = twin.who;
      }
      if (f.rep) {
        if (!o.rep) { o.from = wkMon; o.skip = []; }
        o.rep = 1; o.dow = f.dow; delete o.date;
        if (!o.from) o.from = wkMon;
      } else {
        o.rep = 0; o.date = onceDate();
        delete o.dow; delete o.from; delete o.until; delete o.skip;
      }
      put('events', o);
      closeSheet();
      render(false);
      toast(isNew ? 'Вписано: ' + title : 'Сохранено');
    }
    function addSkip() {
      var o = clone(S.events[ev.id] || ev);
      o.skip = (o.skip || []).filter(function (x) { return x !== date; }).concat([date]);
      put('events', o);
    }
    function dropSkip() {
      var b = S.events[ev.id]; if (!b) return;
      var c = clone(b); c.skip = (c.skip || []).filter(function (x) { return x !== date; });
      put('events', c);
    }
    function skipOnce() {
      if (abonLate(ev, date)) { abonAskCancel(ev, date, addSkip, dropSkip); return; }
      addSkip();
      closeSheet(); render(false);
      toast('Отменено ' + ddmm(date), function () { dropSkip(); render(false); });
    }
    function unskip() {
      var o = clone(S.events[ev.id] || ev);
      o.skip = (o.skip || []).filter(function (x) { return x !== date; });
      put('events', o);
      if (o.who) abonCall('POST', { op: 'mark', ev: ev.id, date: date, st: '' }).catch(function () {});
      closeSheet(); render(false);
      toast('Занятие ' + ddmm(date) + ' вернулось');
    }
    function removeEvent() {
      if (!ev.rep && abonLate(ev, ev.date)) {
        // разовое занятие отменяют удалением — поздняя отмена тоже может списываться
        var kept = null;
        abonAskCancel(ev, ev.date, function () { kept = drop('events', ev.id); }, function () { if (kept) put('events', kept); });
        return;
      }
      var cur = S.events[ev.id] || ev;
      var today = todayIso(), last = abonMinutesLeft(cur, today) <= 0 ? today : addDays(today, -1);
      if (cur.rep && cur.who && cur.from && cur.from <= last) {
        // прошедшие занятия — история абонемента: не стираем, а заканчиваем серию
        var was = clone(cur), o = clone(cur);
        o.until = last;
        put('events', o);
        closeSheet(); render(false);
        toast('Убрано из расписания. Прошедшие занятия остаются в счёте', function () { put('events', was); render(false); });
        return;
      }
      var old = drop('events', ev.id);
      closeSheet(); render(false);
      toast('Удалено: ' + (old.title || typeOf(old).label), function () { put('events', old); render(false); });
    }
  }

  // Личная ссылка ученику на страницу записи (D, 28.09): там он видит свои занятия
  // в своём поясе, может перенести или отменить. Сервер привязывает к ученику это
  // занятие и все его «тёзки» (пн + чт). Имя уходит только на наш сервер в РФ.
  function inviteLink(ev) {
    var key = getKey();
    if (!key || SY.s !== 'synced') { toast('Нужна связь с сервером — подожди «синхронно» и нажми ещё раз'); return; }
    if (outbox.some(function (o) { return o.k === 'events' && o.id === ev.id; })) { scheduleSync(0); toast('Секунду, сохраняю занятие на сервер — нажми ещё раз'); return; }
    fetch(API + '/zapis/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ ev: ev.id })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error(d && d.error);
      scheduleSync(300);   // сервер пометил занятие учеником — подтянуть
      return copyText(d.link).then(function (ok) {
        if (ok) toast('Ссылка скопирована. Отправь её ученику — она личная');
        else window.prompt('Личная ссылка ученику — скопируй:', d.link);
      });
    }).catch(function () { toast('Не вышло получить ссылку. Попробуй ещё раз'); });
  }

  /* ── Абонемент в листе занятия (D, 29.09) ──────────────────────────────────
     Остаток и журнал считает сервер (zapis.py → abon_state): здесь только показ
     и кнопки. Прошло занятие — списано само; отмена позже чем за 3 ч — по правилу
     списано, D. может не списывать. Нужна связь с сервером; нет её — блока нет. */
  var AB = { ev: null };

  function abonCall(method, body, q) {
    return fetch(API + '/zapis/abon' + (q || ''), {
      method: method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getKey() }
    }).then(function (r) { return r.json(); });
  }

  function abonMount(form, ev, date) {
    AB = { ev: ev, date: date, st: null, min: 180, box: $('#evAbon', form), open: false, busy: false };
    if (!getKey()) return;
    AB.box.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });   // Enter не сохраняет занятие
    abonCall('GET', null, '?ev=' + encodeURIComponent(ev.id)).then(function (d) {
      if (!d || !d.ok || AB.ev !== ev) return;   // выключено на сервере, занятие ещё не на сервере или лист уже другой
      AB.st = d.state; AB.min = d.change_min || 180; AB.bound = d.bound || [];
      abonPaint();
    }).catch(function () { /* нет связи — блок просто не появится */ });
  }

  var AB_ST = {
    held: ['проведено', 'Не списывать', 'forgiven'],
    forgiven: ['не списано', 'Списать', ''],
    late: ['поздняя отмена — списано', 'Не списывать', ''],
    free: ['отмена вовремя — не списано', 'Списать как позднюю отмену', 'late']
  };

  function abonPaint() {
    var b = AB.box, s = AB.st;
    if (!b || !document.body.contains(b)) return;
    b.hidden = false;
    if (AB.open) { b.innerHTML = abonFormHtml(); return; }
    if (!s) {
      b.innerHTML = '<button class="btn2" type="button" data-e="ab-open">💳 Внести оплату: сколько занятий оплачено</button>';
      return;
    }
    var p = s.pack, left = s.left;
    var cur = s.journal.filter(function (x) { return x.ev === AB.ev.id && x.date === AB.date; })[0];
    var line = cur && AB_ST[cur.st]
      ? '<div class="abk-now"><span>' + ddmm(AB.date) + ': <b>' + AB_ST[cur.st][0] + (cur.num ? ' · ' + cur.num + ' из ' + cur.of : '') + '</b></span>' +
        '<button class="btn2 btn2--sm" type="button" data-e="ab-mark" data-st="' + AB_ST[cur.st][2] + '">' + AB_ST[cur.st][1] + '</button></div>'
      : '';
    var last = s.journal.filter(function (x) { return x.st !== 'start'; }).slice(0, 4).map(function (x) {
      return '<li><span>' + DOW_S[dowOf(x.date)] + ' ' + ddmm(x.date) + '</span><span>' + (AB_ST[x.st] ? AB_ST[x.st][0] : '') + (x.num ? ' · ' + x.num + '/' + x.of : '') + '</span></li>';
    }).join('');
    b.innerHTML =
      '<div class="abk-h"><b class="' + (left <= 1 ? 'is-low' : '') + '">' + left + '</b><span>' +
        (left < 0 ? 'в долг: ' + (-left) + ' ' + plural(-left, 'занятие', 'занятия', 'занятий')
          : plural(left, 'занятие осталось', 'занятия осталось', 'занятий осталось')) +
        '<small>пакет ' + p.n + ' · проведено ' + p.used + ' · оплата ' + ddmm(p.date) + (p.payer ? ', ' + esc(p.payer) : '') +
        (s.ahead > 0 ? ' · ещё ' + s.ahead + ' наперёд' : '') + '</small></span></div>' +
      line + (last ? '<ul class="abk-j">' + last + '</ul>' : '') +
      (AB.bound && AB.bound.length ? '<p class="abk-b">Занятия ученика в счёте: ' + esc(AB.bound.join(' · ')) + '</p>' : '') +
      '<div class="abk-a"><button class="btn2 btn2--sm" type="button" data-e="ab-open">＋ Новая оплата</button>' +
        '<button class="btn2 btn2--sm" type="button" data-e="ab-unpay">Убрать пакет</button></div>';
    arm($('[data-e="ab-unpay"]', b), function () { abonSend({ op: 'unpay', id: p.id }, 'Пакет убран'); });
  }

  function abonFormHtml() {
    var chip = function (n) { return '<button type="button" class="chip" data-e="ab-n" data-v="' + n + '" aria-pressed="' + (n === 8) + '">' + n + '</button>'; };
    return '<div class="abk-f">' +
      '<div class="fl"><span class="fl-lbl">Сколько занятий оплачено</span><div class="dur-row">' + [4, 8, 12].map(chip).join('') +
        '<input class="inp inp--time inp--num" type="number" inputmode="numeric" name="ab_n" min="1" max="100" value="8" aria-label="Занятий в пакете"></div></div>' +
      (AB.st ? '' :
        '<label class="fl"><span>Из них уже проведено</span><input class="inp inp--num" type="number" inputmode="numeric" name="ab_done" min="0" max="100" value="0">' +
        '<small class="fl-hint">на сегодня: если пакет начался раньше — сколько его занятий уже прошло. Тогда счёт пойдёт с этой минуты</small></label>') +
      (AB.st && AB.st.debt > 0 ? '<p class="fl-hint">Долг ' + AB.st.debt + ' ' + plural(AB.st.debt, 'занятие', 'занятия', 'занятий') + ' спишется из этого пакета сам.</p>' : '') +
      '<label class="fl"><span>Кто платил</span><input class="inp" name="ab_payer" maxlength="24" placeholder="мама, папа, сам"></label>' +
      '<label class="fl"><span>Дата оплаты</span><input class="inp inp--time" type="date" name="ab_date" value="' + todayIso() + '" max="' + todayIso() + '"></label>' +
      '<div class="sh-actions"><button class="lk-btn" type="button" data-e="ab-save">Сохранить оплату</button>' +
        '<button class="btn2" type="button" data-e="ab-close">Отмена</button></div></div>';
  }

  function abonSend(body, okMsg) {
    if (AB.busy) return;
    AB.busy = true;
    body.ev = AB.ev.id;
    var ev = AB.ev;
    abonCall('POST', body).then(function (d) {
      AB.busy = false;
      if (!d || !d.ok) throw new Error(d && d.error);
      if (AB.ev !== ev) return;
      AB.st = d.state; AB.open = false; AB.bound = d.bound || AB.bound;
      abonPaint();
      scheduleSync(300);   // сервер мог привязать занятия к ученику — подтянуть
      if (okMsg) toast(okMsg + (d.state ? ': осталось ' + d.state.left : ''));
    }).catch(function () { AB.busy = false; toast('Не вышло сохранить — нужна связь с сервером'); });
  }

  function abonAct(btn) {
    var what = btn.getAttribute('data-e'), f = AB.box;
    if (what === 'ab-open') { AB.open = true; abonPaint(); }
    else if (what === 'ab-close') { AB.open = false; abonPaint(); }
    else if (what === 'ab-n') {
      $('[name="ab_n"]', f).value = btn.getAttribute('data-v');
      $$('[data-e="ab-n"]', f).forEach(function (c) { c.setAttribute('aria-pressed', String(c === btn)); });
    }
    else if (what === 'ab-mark') abonSend({ op: 'mark', date: AB.date, st: btn.getAttribute('data-st') }, 'Отмечено');
    else if (what === 'ab-save') {
      var dn = $('[name="ab_done"]', f), n = clampInt($('[name="ab_n"]', f).value, 0, 100, 0), done = dn ? clampInt(dn.value, 0, 100, 0) : 0;
      if (n < 1) { fieldErr($('[name="ab_n"]', f), 'Сколько занятий в пакете?'); return; }
      if (done > n) { fieldErr(dn, 'Проведено больше, чем оплачено'); return; }
      abonSend({ op: 'pay', n: n, done: done, payer: $('[name="ab_payer"]', f).value.trim(), date: $('[name="ab_date"]', f).value || todayIso() }, 'Оплата внесена');
    }
  }

  // отмена меньше чем за 3 ч (или уже началось) у ученика, по которому ведём абонемент.
  // Время занятий в Кабинете — екатеринбургское (как HOME_TZ в zapis.py), а не пояс телефона.
  var HOME_UTC = 5;
  function abonMinutesLeft(ev, date) {
    var p = String(date).split('-');
    return (Date.UTC(+p[0], +p[1] - 1, +p[2]) + (toMin(ev.start) - HOME_UTC * 60) * 60000 - Date.now()) / 60000;
  }
  function abonLate(ev, date) { return AB.ev === ev && !!AB.st && !!date && abonMinutesLeft(ev, date) < (AB.min || 180); }

  // поздняя отмена: списать решает D. (ученик отменил поздно — да; сам D. или уважительная причина — нет, п. 4.3–4.4 оферты)
  function abonAskCancel(ev, date, doIt, undoIt) {
    var h = Math.round((AB.min || 180) / 60);
    var form = sheet('Отмена ' + dm(date), abonMinutesLeft(ev, date) <= 0 ? 'занятие уже началось или прошло' : 'до начала меньше ' + h + ' ч',
      '<p class="fl-hint abk-q">Если ученик отменил позже чем за ' + h + ' ч, занятие засчитывается как проведённое (оферта, п. 4.3). Если отменяешь ты или причина уважительная — не списывай.</p>' +
      '<div class="sh-actions">' +
        '<button class="btn2 btn2--danger" type="button" data-e="late-yes">Списать: ученик отменил поздно</button>' +
        '<button class="btn2" type="button" data-e="late-no">Отменить, не списывать</button>' +
        '<button class="btn2" type="button" data-act="close">Назад, не отменять</button></div>', null);
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-e]');
      if (!b) return;
      var charge = b.getAttribute('data-e') === 'late-yes';
      var finish = function () {
        closeSheet(); doIt(); render(false);
        toast('Отменено ' + ddmm(date) + (charge ? ': списано' : ': не списано'), function () {
          undoIt(); render(false);
          if (charge) abonCall('POST', { op: 'mark', ev: ev.id, date: date, st: '' }).catch(function () {});
        });
      };
      if (!charge) { finish(); return; }
      b.disabled = true;
      // отметку — до отмены: разовое занятие удаляется, а сервер отмечает только существующее
      abonCall('POST', { op: 'mark', ev: ev.id, date: date, st: 'late' }).then(function (d) {
        if (!d || !d.ok) throw new Error();
        finish();
      }).catch(function () { b.disabled = false; toast('Нет связи с сервером — ничего не отменено. Попробуй ещё раз'); });
    });
  }

  /* ═════════ 11. раздел «Чек-лист» ═════════ */

  function renderList() {
    var meta = cfg('list', {}) || {};
    var bl = sortedBlocks();
    var all = Object.keys(S.items).map(function (k) { return S.items[k]; });
    var done = all.filter(isDone).length;
    var pct = all.length ? Math.round(done / all.length * 100) : 0;
    var h = '<div class="cl-head"><div class="lk-kicker">Чек-лист</div>' +
      '<div style="display:flex;align-items:flex-start;gap:10px"><h2 class="cl-title" style="flex:1">' + esc(meta.title || 'Мои задачи') + '</h2>' +
      '<button class="bl-more" type="button" data-act="list-meta" aria-label="Изменить название чек-листа">' + ic('more') + '</button></div>' +
      (meta.sub ? '<p class="cl-sub">' + md(meta.sub) + '</p>' : '') +
      '<div class="cl-total"><div class="lk-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + all.length + '" aria-valuenow="' + done + '"><div class="lk-fill" style="width:' + pct + '%"></div></div><b>' + done + ' из ' + all.length + '</b></div></div>';
    if (!bl.length) h += '<div class="cl-empty">Пунктов пока нет. Начни с блока: кнопка ниже.</div>';
    h += '<div class="cl-blocks">' + bl.map(blockHtml).join('') + '</div>';
    h += '<button class="cl-addblock" type="button" data-act="bl-new">' + ic('plus') + 'Новый блок</button>';
    $('#v-list').innerHTML = h;
  }

  function blockHtml(b, idx) {
    var its = itemsOf(b.id);
    var ordered = its.slice().sort(function (x, y) { return (isDone(x) - isDone(y)) || ((x.order || 0) - (y.order || 0)); });
    var done = its.filter(isDone).length, n = its.length, pct = n ? Math.round(done / n * 100) : 0;
    var full = n > 0 && done === n;
    return '<section class="bl' + (full ? ' is-complete' : '') + '" data-block="' + esc(b.id) + '">' +
      '<div class="bl-h"><span class="bl-num">' + esc(b.num || String(idx + 1)) + '</span>' +
      '<div class="bl-tt"><h3>' + esc(b.title) + '</h3>' + (b.tag ? '<span class="bl-tag">' + esc(b.tag) + '</span>' : '') + '</div>' +
      '<span class="bl-cnt">' + done + '/' + n + '</span>' +
      '<button class="bl-more" type="button" data-act="bl-menu" data-id="' + esc(b.id) + '" aria-label="Изменить блок «' + esc(b.title) + '»">' + ic('more') + '</button></div>' +
      '<div class="lk-progress" aria-hidden="true"><div class="lk-fill" style="width:' + pct + '%"></div></div>' +
      (b.note ? '<p class="bl-note">' + md(b.note) + '</p>' : '') +
      '<div class="its">' + ordered.map(itemHtml).join('') + '</div>' +
      '<form class="it-add" data-act="it-add" data-block="' + esc(b.id) + '" autocomplete="off">' +
        '<input name="t" maxlength="400" placeholder="Новый пункт" enterkeyhint="done" aria-label="Новый пункт в блок «' + esc(b.title) + '»">' +
        '<button type="submit" aria-label="Добавить пункт">' + ic('plus') + '</button></form>' +
      '</section>';
  }

  function itemHtml(it) {
    var d = isDone(it), id = esc(it.id);
    if (it.goal) {
      var c = Math.min(it.count || 0, it.goal), dots = '';
      for (var k = 1; k <= it.goal; k++) {
        dots += '<button type="button" class="' + (k <= c ? 'is-on' : '') + '" data-act="it-count" data-id="' + id + '" data-n="' + k + '" aria-label="' + esc(plain(it.text)) + ': ' + k + ' из ' + it.goal + '" aria-pressed="' + (k <= c) + '">' + k + '</button>';
      }
      return '<div class="it it--cnt' + (d ? ' is-done' : '') + '" data-id="' + id + '">' +
        '<div class="it-main"><span class="it-tx">' + md(it.text) + '</span><span class="cnt">' + dots + '</span></div>' +
        '<button class="it-more" type="button" data-act="it-menu" data-id="' + id + '" aria-label="Изменить пункт">' + ic('more') + '</button></div>';
    }
    return '<div class="it' + (d ? ' is-done' : '') + '" data-id="' + id + '">' +
      '<label class="it-main"><input class="sr" type="checkbox" data-act="it-toggle" data-id="' + id + '"' + (d ? ' checked' : '') + '>' +
        '<span class="ck">' + ic('check') + '</span>' +
        (it.num ? '<span class="it-num">' + esc(numTxt(it.num)) + '</span>' : '') +
        '<span class="it-tx">' + md(it.text) + '</span></label>' +
      '<button class="it-more" type="button" data-act="it-menu" data-id="' + id + '" aria-label="Изменить пункт">' + ic('more') + '</button></div>';
  }

  // FLIP: пункт плавно переезжает на новое место, а не прыгает
  function flip(mutate) {
    var root = $('#v-list'), before = {};
    $$('.it[data-id]', root).forEach(function (n) { before[n.getAttribute('data-id')] = n.getBoundingClientRect().top; });
    mutate();
    if (reduceMotion) return;
    $$('.it[data-id]', root).forEach(function (n) {
      var b = before[n.getAttribute('data-id')];
      if (b == null) return;
      var dy = b - n.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      n.style.transition = 'none';
      n.style.transform = 'translateY(' + dy + 'px)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          n.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
          n.style.transform = '';
        });
      });
    });
  }

  function replayCheck(id) {
    var n = $('#v-list .it[data-id="' + cssId(id) + '"]');
    if (!n || reduceMotion) return;
    n.classList.remove('is-done');
    void n.offsetWidth;
    n.classList.add('is-done');
  }

  function toggleItem(id, on) {
    var it = S.items[id];
    if (!it) return;
    var o = clone(it);
    o.done = on ? 1 : 0;
    if (on) o.doneAt = todayIso(); else delete o.doneAt;
    flip(function () { put('items', o); renderList(); });
    if (on) { replayCheck(id); blockDoneToast(o.block); }
  }

  function countItem(id, k) {
    var it = S.items[id];
    if (!it) return;
    var was = isDone(it), o = clone(it), c = o.count || 0;
    o.count = c === k ? k - 1 : k;
    flip(function () { put('items', o); renderList(); });
    if (!was && isDone(o)) blockDoneToast(o.block);
  }

  function blockDoneToast(blockId) {
    var its = itemsOf(blockId), b = S.blocks[blockId];
    if (its.length && its.every(isDone) && b) toast('Блок «' + b.title + '» закрыт целиком');
  }

  function addItem(blockId, text) {
    var max = itemsOf(blockId).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0);
    put('items', { id: uid('i'), block: blockId, order: max + 1, done: 0, text: text.slice(0, 400) });
    renderList();
    var inp = $('#v-list .it-add[data-block="' + cssId(blockId) + '"] input');
    if (inp) inp.focus({ preventScroll: true });
  }

  function tickNext(inp) {
    var id = inp.getAttribute('data-id'), it = S.items[id];
    if (!it) return;
    var box = inp.closest('.nx');
    if (box) box.classList.add('is-done');
    setTimeout(function () {
      var o = clone(it);
      if (o.goal) o.count = Math.min(o.goal, (o.count || 0) + 1);
      else { o.done = 1; o.doneAt = todayIso(); }
      put('items', o);
      refreshRail();
      toast('Отмечено', function () { put('items', it); refreshRail(); });
    }, reduceMotion ? 0 : 420);
  }

  function openItem(id) {
    var it = S.items[id];
    if (!it) return;
    var opts = sortedBlocks().map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (b.id === it.block ? ' selected' : '') + '>' + esc(b.title) + '</option>';
    }).join('');
    var form = sheet('Пункт', it.num ? 'Номер ' + numTxt(it.num) : '',
      '<label class="fl"><span>Текст</span><textarea class="inp" name="text" maxlength="400" rows="4">' + esc(it.text) + '</textarea></label>' +
      (it.goal ? '<label class="fl"><span>Сколько раз нужно</span><input class="inp inp--num" type="number" name="goal" min="1" max="20" value="' + it.goal + '"></label>' : '') +
      '<label class="fl"><span>Блок</span><select class="inp" name="block">' + opts + '</select></label>' +
      '<div class="sh-actions"><button class="lk-btn" type="submit">Сохранить</button>' +
      '<button class="btn2 btn2--danger" type="button" data-e="del">' + ic('x') + 'Удалить пункт</button></div>',
      function (fm) {
        var text = fm.text.value.trim();
        if (!text) { fieldErr(fm.text, 'Пункт не может быть пустым'); return; }
        var o = clone(it);
        o.text = text.slice(0, 400);
        if (o.goal) o.goal = clampInt(fm.goal.value, 1, 20, o.goal);
        if (fm.block.value !== o.block) {
          o.block = fm.block.value;
          o.order = itemsOf(o.block).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
        }
        put('items', o);
        closeSheet(); renderList();
        toast('Сохранено');
      });
    form.addEventListener('click', function (e) {
      if (!e.target.closest('[data-e="del"]')) return;
      var old = drop('items', id);
      closeSheet(); renderList();
      toast('Пункт удалён', function () { put('items', old); renderList(); });
    });
  }

  function openBlock(id) {
    var b = id ? S.blocks[id] : null;
    var form = sheet(b ? 'Блок' : 'Новый блок', b ? '' : 'Например: «Контент на неделю» или «Школа Гагарина»',
      '<label class="fl"><span>Название</span><input class="inp" name="title" maxlength="60" value="' + esc(b ? b.title : '') + '" placeholder="Название блока"></label>' +
      '<label class="fl"><span>Подпись</span><input class="inp" name="tag" maxlength="80" value="' + esc(b && b.tag || '') + '" placeholder="необязательно: срок, приоритет"></label>' +
      '<label class="fl"><span>Заметка</span><textarea class="inp" name="note" maxlength="700" rows="3" placeholder="необязательно">' + esc(b && b.note || '') + '</textarea></label>' +
      '<div class="sh-actions"><button class="lk-btn" type="submit">' + (b ? 'Сохранить' : 'Добавить блок') + '</button>' +
      (b ? '<button class="btn2 btn2--danger" type="button" data-e="del">' + ic('x') + 'Удалить блок вместе с пунктами</button>' : '') + '</div>',
      function (fm) {
        var title = fm.title.value.trim();
        if (!title) { fieldErr(fm.title, 'Назови блок'); return; }
        var o = b ? clone(b) : { id: uid('b'), order: sortedBlocks().reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1 };
        o.title = title.slice(0, 60);
        var tag = fm.tag.value.trim(), note = fm.note.value.trim();
        if (tag) o.tag = tag.slice(0, 80); else delete o.tag;
        if (note) o.note = note.slice(0, 700); else delete o.note;
        put('blocks', o);
        closeSheet(); renderList();
        toast(b ? 'Сохранено' : 'Блок добавлен');
      });
    if (b) {
      var btn = $('[data-e="del"]', form);
      arm(btn, function () {
        var its = itemsOf(b.id), oldB = drop('blocks', b.id);
        var oldI = its.map(function (x) { return drop('items', x.id); });
        closeSheet(); renderList();
        toast('Блок удалён', function () {
          put('blocks', oldB);
          oldI.forEach(function (x) { if (x) put('items', x); });
          renderList();
        });
      });
    }
  }

  function openListMeta() {
    var meta = cfg('list', {}) || {};
    sheet('Чек-лист', 'Название и подпись сверху',
      '<label class="fl"><span>Название</span><input class="inp" name="title" maxlength="60" value="' + esc(meta.title || '') + '"></label>' +
      '<label class="fl"><span>Подпись</span><textarea class="inp" name="sub" maxlength="300" rows="3">' + esc(meta.sub || '') + '</textarea></label>' +
      '<div class="sh-actions"><button class="lk-btn" type="submit">Сохранить</button></div>',
      function (fm) {
        var title = fm.title.value.trim();
        if (!title) { fieldErr(fm.title, 'Назови чек-лист'); return; }
        setCfg('list', { title: title.slice(0, 60), sub: fm.sub.value.trim().slice(0, 300) });
        closeSheet(); renderList();
      });
  }

  /* ═════════ 12. раздел «Окна» ═════════ */

  function oknaMon() { var m = mondayOf(todayIso()); return V.oknaNext ? addDays(m, 7) : m; }

  function renderOkna() {
    var mon = oknaMon();
    var h = '<div class="ok"><div>' +
      '<div class="ok-lead"><div class="lk-kicker">Для родителей</div><h2>Свободные окна</h2>' +
        '<p>Карточка без имён: только свободное время. Выбери пояс родителя, сохрани картинкой или скопируй текстом и отправь.</p></div>' +
      '<div class="seg" role="group" aria-label="Какая неделя" style="margin:16px 0 10px">' +
        '<button type="button" data-act="ok-week" data-n="0" aria-pressed="' + !V.oknaNext + '">Эта неделя</button>' +
        '<button type="button" data-act="ok-week" data-n="1" aria-pressed="' + V.oknaNext + '">Следующая</button></div>' +
      tzSegHtml() +
      '<div id="okCardWrap">' + oknaCardHtml(mon) + '</div>' +
      '<div class="ok-actions" style="margin-top:12px">' +
        '<button class="btn2 btn2--mint ok-photo" type="button" data-act="ok-photo">' + ic('photo') + 'Сохранить в Фото</button>' +
        '<button class="btn2" type="button" data-act="ok-copy">' + ic('copy') + 'Скопировать текстом</button>' +
        '<button class="btn2" type="button" data-act="ok-link">' + ic('link') + 'Ссылка на запись — время закроется само</button></div>' +
      '</div>' +
      '<div class="ok-ctl">' + hoursHtml() + '</div></div>';
    $('#v-okna').innerHTML = h;
  }

  // Переключатель пояса родителя: 0 +1 +2 » — «»» раскрывает +3…+6
  function tzSegHtml() {
    var more = V.tzMore || TZ_MORE.indexOf(V.tz) >= 0;
    var list = more ? TZ_MAIN.concat(TZ_MORE) : TZ_MAIN;
    var b = list.map(function (n) {
      return '<button type="button" data-act="ok-tz" data-n="' + n + '" aria-pressed="' + (n === V.tz) + '"' +
        ' aria-label="' + (n ? 'МСК+' + n : 'Москва') + '">' + (n ? '+' + n : '0') + '</button>';
    }).join('');
    if (!more) b += '<button type="button" data-act="ok-tz-more" aria-label="Ещё пояса: +3…+6">»</button>';
    return '<div class="tz-row"><span class="tz-l">Пояс родителя, часы от Москвы</span>' +
      '<div class="seg seg--tz" role="group" aria-label="Часовой пояс родителя">' + b + '</div></div>';
  }
  // время D. (Екатеринбург) → время родителя
  function tzM(m) { return ((m + (V.tz - HOME_MSK) * 60) % 1440 + 1440) % 1440; }

  function oknaCardHtml(mon) {
    var days = freeSlots(mon), slot = +cfg('slot', 60) || 60;
    var rows = days.map(function (d) {
      return '<div class="ok-day"><div class="ok-dn"><b>' + DOW_S[d.dow] + '</b><span>' + ddmm(d.date) + '</span></div>' +
        (d.list.length
          ? '<div class="ok-slots">' + d.list.map(function (m) { return '<span class="ok-t">' + hhmm(tzM(m)) + '</span>'; }).join('') + '</div>'
          : '<div class="ok-none">всё занято</div>') + '</div>';
    }).join('');
    if (!days.length) rows = '<div class="ok-empty">На этой неделе приёмных дней больше нет. Открой следующую неделю или включи часы приёма.</div>';
    return '<article class="ok-card" id="okCard">' +
      '<div class="ok-top"><span class="lk-sign" aria-hidden="true"><span class="lk-badge lk-badge-l lk-badge--sm">Λ</span><span class="lk-badge lk-badge-d lk-badge--sm">D.</span></span>' +
        '<span class="ok-week">' + esc(weekLabel(mon)) + '</span></div>' +
      '<h3 class="ok-h">Свободное время для занятий</h3>' +
      '<p class="ok-sub">Занятие ' + slot + ' ' + plural(slot, 'минута', 'минуты', 'минут') + '. ' + tzInfo(V.tz).long + '</p>' +
      rows +
      '<div class="ok-foot"><span>© 2026 Дмитрий Дружков</span><span>математика</span></div></article>';
  }

  function hoursHtml() {
    var hours = cfg('hours', {}) || {}, slot = +cfg('slot', 60) || 60, rows = '';
    for (var d = 1; d <= 7; d++) {
      var hw = hours[d], on = !!hw, a = on ? hw[0] : '16:00', b = on ? hw[1] : '20:00';
      rows += '<div class="hr-row' + (on ? '' : ' is-off') + '">' +
        '<label class="tg tg--sm"><input type="checkbox" data-act="hr-on" data-d="' + d + '"' + (on ? ' checked' : '') + '><span class="tg-ui"></span><span class="tg-tx"><b>' + DOW_S[d] + '</b></span></label>' +
        '<input class="inp inp--time" type="time" step="1800" data-act="hr-a" data-d="' + d + '" value="' + a + '"' + (on ? '' : ' disabled') + ' aria-label="' + DOW_L[d] + ', с">' +
        '<span aria-hidden="true">–</span>' +
        '<input class="inp inp--time" type="time" step="1800" data-act="hr-b" data-d="' + d + '" value="' + b + '"' + (on ? '' : ' disabled') + ' aria-label="' + DOW_L[d] + ', до">' +
        '</div>';
    }
    var durs = [45, 60, 90].map(function (m) {
      return '<button class="chip" type="button" data-act="ok-slot" data-m="' + m + '" aria-pressed="' + (m === slot) + '">' + m + ' мин</button>';
    }).join('');
    return '<div class="ok-box"><h3>Часы приёма</h3><p>Только в эти часы кабинет ищет свободное время. Резерв под группы окна не закрывает.</p><div class="hrs">' + rows + '</div></div>' +
      '<div class="ok-box"><h3>Длина занятия</h3><p>Окно показывается, если занятие целиком помещается до следующего.</p><div class="chips">' + durs + '</div></div>';
  }

  function hoursChange(inp) {
    var d = +inp.getAttribute('data-d'), act = inp.getAttribute('data-act');
    var hours = clone(cfg('hours', {}) || {});
    var row = inp.closest('.hr-row');
    var ins = $$('.inp--time', row), a = ins[0].value || '16:00', b = ins[1].value || '20:00';
    if (act === 'hr-on') {
      hours[d] = inp.checked ? [a, b] : null;
      row.classList.toggle('is-off', !inp.checked);
      ins.forEach(function (x) { x.disabled = !inp.checked; });
    } else {
      if (toMin(a) >= toMin(b)) { toast('Конец приёма должен быть позже начала'); return; }
      hours[d] = [a, b];
    }
    setCfg('hours', hours);
    $('#okCardWrap').innerHTML = oknaCardHtml(oknaMon());
  }

  function oknaText(mon) {
    var days = freeSlots(mon), slot = +cfg('slot', 60) || 60;
    var lines = ['Свободное время для занятий, ' + weekLabel(mon) + ' (занятие ' + slot + ' ' + plural(slot, 'минута', 'минуты', 'минут') + ', ' + tzInfo(V.tz).short + '):'];
    days.forEach(function (d) {
      lines.push(DOW_S[d.dow] + ' ' + ddmm(d.date) + ': ' + (d.list.length ? d.list.map(function (m) { return hhmm(tzM(m)); }).join(', ') : 'всё занято'));
    });
    return lines.join('\n');
  }

  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return legacyCopy(t); });
    }
    return Promise.resolve(legacyCopy(t));
  }
  function legacyCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ── Карточка окон картинкой (D, 28.09): «Сохранить в Фото».
     Рисуем карточку сами на холсте — без сторонних библиотек, чётко (×3) и
     мгновенно: iPhone открывает «Поделиться» только сразу после нажатия, а там
     «Сохранить изображение» кладёт картинку в Фото. Вид — как на экране, тёмный. */
  function oknaCanvas(mon) {
    var days = freeSlots(mon), slot = +cfg('slot', 60) || 60;
    var F = 'Geologica, -apple-system, system-ui, sans-serif', M = '"JetBrains Mono", ui-monospace, monospace';
    var SC = 3, W = 390, P = 16, cx = P, cw = W - 2 * P, ix = cx + 18, iw = cw - 36;
    var INK = '#eef0ff', MUTED = '#9aa0c8', DIM = '#737aa8', LINE = 'rgba(255,255,255,.07)';
    var cv = document.createElement('canvas'), g = cv.getContext('2d');

    function font(w, s, f) { g.font = w + ' ' + s + 'px ' + (f || F); }
    function wrap(text, w) {
      var words = String(text).split(' '), lines = [], cur = '';
      words.forEach(function (wd) {
        var t = cur ? cur + ' ' + wd : wd;
        if (cur && g.measureText(t).width > w) { lines.push(cur); cur = wd; } else cur = t;
      });
      if (cur) lines.push(cur);
      return lines;
    }
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }

    // 1) раскладка: считаем высоту, пока ничего не рисуем
    var y = P + 20, L = {};
    L.top = y; y += 26 + 16;
    font(900, 23); L.title = wrap('Свободное время для занятий', iw); L.titleY = y; y += L.title.length * 27 + 4;
    font(400, 14); L.sub = wrap('Занятие ' + slot + ' ' + plural(slot, 'минута', 'минуты', 'минут') + '. ' + tzInfo(V.tz).long, iw);
    L.subY = y; y += L.sub.length * 20 + 12;
    var sx = ix + 74, sw = iw - 74;
    font(700, 14, M);
    L.rows = days.map(function (d) {
      var row = { d: d, y: y, pills: [] }, px = 0, py = 0;
      d.list.forEach(function (m) {
        var t = hhmm(tzM(m)), w = g.measureText(t).width + 20;
        if (px && px + w > sw) { px = 0; py += 36; }
        row.pills.push({ t: t, x: sx + px, y: y + 11 + py, w: w });
        px += w + 6;
      });
      row.h = 22 + Math.max(36, d.list.length ? py + 30 : 24);
      y += row.h;
      return row;
    });
    if (!days.length) { font(400, 14.5); L.empty = wrap('На этой неделе приёмных дней больше нет.', iw); L.emptyY = y + 16; y += 16 + L.empty.length * 21 + 6; }
    L.footY = y + 6; y += 6 + 10 + 16 + 14;
    var ch = y - P, H = y + P;

    // 2) рисуем
    cv.width = W * SC; cv.height = H * SC;
    g = cv.getContext('2d'); g.scale(SC, SC); g.textBaseline = 'top';
    g.fillStyle = '#0A0610'; g.fillRect(0, 0, W, H);

    g.save(); rr(cx, P, cw, ch, 28); g.clip();
    var bg = g.createLinearGradient(cx, P, cx + cw * .27, P + ch);
    bg.addColorStop(0, '#1c1b46'); bg.addColorStop(1, '#111129');
    g.fillStyle = bg; g.fillRect(cx, P, cw, ch);
    [[cx + cw * .92, P - 30, 'rgba(94,234,212,.16)'], [cx - cw * .1, P + ch + 25, 'rgba(168,85,247,.16)']].forEach(function (a) {
      var rg = g.createRadialGradient(a[0], a[1], 0, a[0], a[1], 250);
      rg.addColorStop(0, a[2]); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(cx, P, cw, ch);
    });
    g.restore();
    rr(cx + .5, P + .5, cw - 1, ch - 1, 28); g.strokeStyle = 'rgba(94,234,212,.30)'; g.lineWidth = 1; g.stroke();

    // бейджи Λ и D.
    [['Λ', ix + 13, '#D946EF', '#A855F7'], ['D.', ix + 45, '#A855F7', '#7C3AED']].forEach(function (b) {
      var cy = L.top + 13, gr = g.createLinearGradient(b[1] - 13, cy - 13, b[1] + 13, cy + 13);
      gr.addColorStop(0, b[2]); gr.addColorStop(1, b[3]);
      g.save(); g.shadowColor = 'rgba(168,85,247,.7)'; g.shadowBlur = 14;
      g.beginPath(); g.arc(b[1], cy, 13, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); g.restore();
      font(900, 11); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b[0], b[1], cy + .5); g.textAlign = 'left'; g.textBaseline = 'top';
    });
    // неделя справа
    font(700, 13, M);
    var wl = weekLabel(mon), ww = g.measureText(wl).width + 20, wx = ix + iw - ww;
    rr(wx, L.top, ww, 26, 7); g.fillStyle = 'rgba(94,234,212,.10)'; g.fill(); g.strokeStyle = 'rgba(94,234,212,.3)'; g.stroke();
    g.fillStyle = '#bff7ee'; g.textBaseline = 'middle'; g.fillText(wl, wx + 10, L.top + 13.5); g.textBaseline = 'top';

    font(900, 23); g.fillStyle = INK;
    L.title.forEach(function (t, i) { g.fillText(t, ix, L.titleY + i * 27); });
    font(400, 14); g.fillStyle = MUTED;
    L.sub.forEach(function (t, i) { g.fillText(t, ix, L.subY + i * 20); });

    function hr(yy) { g.fillStyle = LINE; g.fillRect(ix, yy, iw, 1); }
    L.rows.forEach(function (r) {
      hr(r.y);
      font(900, 16); g.fillStyle = INK; g.fillText(DOW_S[r.d.dow], ix, r.y + 11);
      font(400, 12, M); g.fillStyle = MUTED; g.fillText(ddmm(r.d.date), ix, r.y + 32);
      if (!r.pills.length) { font(400, 14); g.fillStyle = DIM; g.fillText('всё занято', sx, r.y + 16); return; }
      r.pills.forEach(function (p) {
        var pg = g.createLinearGradient(p.x, p.y, p.x + p.w, p.y + 30);
        pg.addColorStop(0, '#8ff3e3'); pg.addColorStop(1, '#5EEAD4');
        rr(p.x, p.y, p.w, 30, 7); g.fillStyle = pg; g.fill();
        font(700, 14, M); g.fillStyle = '#042520'; g.textBaseline = 'middle';
        g.fillText(p.t, p.x + 10, p.y + 15.5); g.textBaseline = 'top';
      });
    });
    if (L.empty) { font(400, 14.5); g.fillStyle = MUTED; L.empty.forEach(function (t, i) { g.fillText(t, ix, L.emptyY + i * 21); }); }
    hr(L.footY);
    font(400, 11.5); g.fillStyle = DIM;
    g.fillText('© 2026 Дмитрий Дружков', ix, L.footY + 10);
    g.textAlign = 'right'; g.fillText('математика', ix + iw, L.footY + 10); g.textAlign = 'left';
    return cv;
  }

  function savePhoto() {
    var mon = oknaMon(), url, file = null;
    var name = 'okna-' + ddmm(mon).replace('.', '-') + (V.tz !== HOME_MSK ? '-msk' + V.tz : '') + '.png';
    try { url = oknaCanvas(mon).toDataURL('image/png'); } catch (e) { toast('Не вышло сделать картинку'); return; }
    // синхронно, без ожиданий: иначе iPhone посчитает, что нажатие «остыло», и не откроет меню
    try {
      var bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      file = new File([arr], name, { type: 'image/png' });
    } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function (e) { if (!e || e.name !== 'AbortError') showPhoto(url, name); });
      return;
    }
    showPhoto(url, name);
  }

  // запасной путь: компьютер — скачать файл; телефон без «Поделиться» — картинка поверх экрана
  function showPhoto(url, name) {
    if (window.matchMedia && matchMedia('(pointer:fine)').matches) {
      var a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      toast('Картинка скачана');
      return;
    }
    var ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:rgba(5,3,10,.92);display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;padding:20px;color:#eef0ff;font:15px/1.45 system-ui,sans-serif;text-align:center');
    ov.innerHTML = '<img alt="Свободные окна" style="max-width:100%;max-height:72vh;border-radius:18px">' +
      '<div>Нажми на картинку и удерживай → «Сохранить в Фото»</div>' +
      '<button type="button" style="padding:11px 22px;border-radius:12px;border:1px solid #2a2a4d;background:#15142e;color:#eef0ff;font:600 15px system-ui,sans-serif">Закрыть</button>';
    ov.querySelector('img').src = url;
    ov.querySelector('button').onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
  }

  /* ═════════ 13. хранение и копия ═════════ */

  function openSettings() {
    var k = getKey();
    var form = sheet('Хранение данных', 'Где живут расписание и чек-лист',
      '<div class="sh-status" id="shStatus" data-s="' + SY.s + '"><i></i><span>' + esc(statusLong()) + '</span></div>' +
      '<label class="fl"><span>Ключ сервера</span><input class="inp" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="' + (k ? 'ключ сохранён на этом устройстве' : 'вставь ключ') + '"></label>' +
      '<p class="fl-hint">Сервер наш, в России (152-ФЗ). С ключом телефон и Мак видят одно расписание. Без ключа всё хранится только в этом браузере.</p>' +
      '<div class="sh-actions"><button class="lk-btn" type="submit">' + (k ? 'Сменить ключ' : 'Подключить') + '</button>' +
      (k ? '<button class="btn2" type="button" data-e="sync">Синхронизировать сейчас</button><button class="btn2" type="button" data-e="keyoff">Отключить ключ на этом устройстве</button>' : '') + '</div>' +
      '<div class="sh-sep"></div>' +
      '<div class="fl-lbl" style="margin-top:14px">Резервная копия</div>' +
      '<div class="sh-split" style="margin-top:10px">' +
        '<button class="btn2" type="button" data-e="export">' + ic('down') + 'Скачать</button>' +
        '<label class="btn2" style="cursor:pointer">' + ic('up') + 'Загрузить<input class="sr" type="file" accept="application/json,.json" data-act="import"></label></div>' +
      '<p class="sh-note">Копия — один файл со всей неделей, чек-листом и часами приёма. Удобно перенести на другое устройство, пока сервер не подключён. Загрузка заменяет всё, что есть сейчас.</p>',
      function (fm) {
        var v = fm.key.value.trim();
        if (!v) { fieldErr(fm.key, 'Вставь ключ'); return; }
        if (!/^[\w-]{16,128}$/.test(v)) { fieldErr(fm.key, 'Ключ выглядит не так: только латиница, цифры, «-» и «_»'); return; }
        lsSet(LS.key, v);
        lsSet(LS.linked, false);
        closeSheet();
        toast('Ключ сохранён, подключаюсь…');
        syncNow();
      });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-e]');
      if (!b) return;
      var w = b.getAttribute('data-e');
      if (w === 'export') exportData();
      else if (w === 'sync') { syncNow(); }
      else if (w === 'keyoff') {
        try { localStorage.removeItem(LS.key); localStorage.removeItem(LS.linked); } catch (x) { /* нечего чистить */ }
        closeSheet(); setStatus('local'); toast('Ключ убран. Данные остались на устройстве');
      }
    });
  }

  function exportData() {
    var data = { app: 'kabinet-d', v: 1, at: new Date().toISOString(), state: S };
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kabinet-' + todayIso() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('Копия скачана');
  }

  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      var st;
      try { st = JSON.parse(r.result).state; } catch (e) { st = null; }
      if (!st || typeof st !== 'object' || !st.events || typeof st.events !== 'object') { toast('Файл не похож на копию кабинета'); return; }
      KINDS.forEach(function (k) {
        var src = st[k] && typeof st[k] === 'object' ? st[k] : {};
        Object.keys(S[k]).forEach(function (id) { if (!src[id]) drop(k, id); });
        Object.keys(src).forEach(function (id) {
          var o = src[id];
          if (o && typeof o === 'object') { o.id = id; put(k, o); }
        });
      });
      closeSheet(); render(true);
      toast('Копия загружена');
    };
    r.readAsText(file);
  }

  /* ═════════ 14. лист-окно, поля, всплывашка ═════════ */

  function isSheetOpen() { return SH.el && SH.el.classList.contains('is-open'); }

  function sheet(title, sub, html, onSubmit) {
    SH.onSubmit = onSubmit;
    if (!isSheetOpen()) SH.lastFocus = document.activeElement;
    SH.el.innerHTML = '<div class="sh-grip" aria-hidden="true"></div>' +
      '<div class="sh-h"><div><h2 id="shTitle">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      '<button class="sh-x" type="button" data-act="close" aria-label="Закрыть">' + ic('x') + '</button></div>' +
      '<form novalidate autocomplete="off">' + html + '</form>';
    var form = $('form', SH.el);
    form.addEventListener('submit', function (e) { e.preventDefault(); if (SH.onSubmit) SH.onSubmit(form); });
    SH.el.removeAttribute('inert');
    SH.el.setAttribute('aria-hidden', 'false');
    SH.el.scrollTop = 0;
    SH.el.classList.add('is-open');
    SH.bg.classList.add('is-open');
    document.body.classList.add('is-locked');
    if (!isTouch) {
      var first = $('input:not(.sr):not([type=checkbox]), textarea', form);
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 80);
    }
    return form;
  }

  function closeSheet() {
    if (!isSheetOpen()) return;
    SH.el.classList.remove('is-open');
    SH.bg.classList.remove('is-open');
    SH.el.setAttribute('inert', '');
    SH.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    SH.onSubmit = null;
    var lf = SH.lastFocus;
    SH.lastFocus = null;
    if (lf && lf.focus && document.contains(lf)) { try { lf.focus({ preventScroll: true }); } catch (e) { /* фокус не вернуть — не страшно */ } }
    flushDirty();
  }

  function fieldErr(inp, msg) {
    inp.setAttribute('aria-invalid', 'true');
    var host = inp.closest('.fl') || inp.parentNode;
    var err = $('.fl-err', host);
    if (!err) { err = document.createElement('div'); err.className = 'fl-err'; host.appendChild(err); }
    err.textContent = msg;
    inp.focus();
  }
  function fieldOk(inp) {
    inp.removeAttribute('aria-invalid');
    var host = inp.closest('.fl');
    var err = host && $('.fl-err', host);
    if (err) err.remove();
  }

  // опасная кнопка: первое нажатие взводит, второе — выполняет
  function arm(btn, fn) {
    if (!btn) return;
    var label = btn.innerHTML, timer = 0;
    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-armed')) { clearTimeout(timer); fn(); return; }
      btn.classList.add('is-armed');
      btn.innerHTML = ic('x') + 'Точно? Нажми ещё раз';
      timer = setTimeout(function () { btn.classList.remove('is-armed'); btn.innerHTML = label; }, 3200);
    });
  }

  var TT = { timer: 0, undo: null };
  function toast(msg, undo, undoLabel) {
    var el = $('#toast');
    TT.undo = undo || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" data-act="undo">' + esc(undoLabel || 'Вернуть') + '</button>' : '');
    el.classList.add('is-on');
    clearTimeout(TT.timer);
    TT.timer = setTimeout(function () { el.classList.remove('is-on'); TT.undo = null; }, undo ? 6000 : 2600);
  }

  /* ═════════ 15. события ═════════ */

  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    switch (act) {
      case 'close': closeSheet(); break;
      case 'settings': openSettings(); break;
      case 'theme': setTheme(t.getAttribute('data-v')); break;
      case 'ev-new': var nd = newEventDefaults(); openEvent({ date: nd.date, start: nd.start }); break;
      case 'ev': openEvent({ id: id, date: t.getAttribute('data-date') }); break;
      case 'slot': slotClick(t, e); break;
      case 'wk-prev': V.week = addDays(V.week, -7); renderWeek(true); break;
      case 'wk-next': V.week = addDays(V.week, 7); renderWeek(true); break;
      case 'wk-today': V.week = mondayOf(todayIso()); renderWeek(true); break;
      case 'to-okna': V.oknaNext = V.week === addDays(mondayOf(todayIso()), 7); location.hash = '#okna'; break;
      case 'bl-menu': openBlock(id); break;
      case 'bl-new': openBlock(null); break;
      case 'it-menu': openItem(id); break;
      case 'it-count': countItem(id, +t.getAttribute('data-n')); break;
      case 'list-meta': openListMeta(); break;
      case 'tr-cell': TR.sel = { k: 'cell', rid: id, date: t.getAttribute('data-date') }; renderTrain(); break;
      case 'tr-row': TR.sel = { k: 'row', rid: id }; renderTrain(); break;
      case 'tr-col': TR.sel = { k: 'col', date: t.getAttribute('data-date') }; renderTrain(); break;
      case 'tr-x': TR.sel = null; renderTrain(); break;
      case 'tr-plus': trPlus(+t.getAttribute('data-n')); break;
      case 'tr-day-open': TR.addDay = !TR.addDay; renderTrain(); break;
      case 'tr-day-next': trDayNext(); break;
      case 'tr-col-del': trColDel(); break;
      case 'tr-row-del': trRowDel(); break;
      case 'ok-week': V.oknaNext = t.getAttribute('data-n') === '1'; renderOkna(); break;
      case 'ok-slot': setCfg('slot', +t.getAttribute('data-m')); renderOkna(); break;
      case 'ok-tz': V.tz = +t.getAttribute('data-n'); renderOkna(); break;
      case 'ok-tz-more': V.tzMore = true; renderOkna(); break;
      case 'ok-photo': savePhoto(); break;
      case 'ok-copy':
        copyText(oknaText(oknaMon())).then(function (ok) { toast(ok ? 'Скопировано. Вставь в сообщение родителю' : 'Не вышло скопировать'); });
        break;
      case 'ok-link':
        if (!getKey() || SY.s !== 'synced') { toast('Ссылка заработает, когда подключим сервер. Пока — скриншот или текст'); break; }
        // одна ссылка на всех: родитель сам выбирает время, оно сразу закрывается у остальных;
        // пояс страница берёт с телефона родителя (старая okna.html по прежним ссылкам работает)
        copyText(ZAPIS_URL).then(function (ok) { toast(ok ? 'Ссылка на запись скопирована — отправь родителям' : 'Не вышло скопировать'); });
        break;
      case 'undo':
        if (TT.undo) { var fn = TT.undo; TT.undo = null; fn(); }
        $('#toast').classList.remove('is-on');
        break;
    }
  }

  function onChange(e) {
    var t = e.target, act = t.getAttribute && t.getAttribute('data-act');
    if (!act) return;
    if (act === 'it-toggle') toggleItem(t.getAttribute('data-id'), t.checked);
    else if (act === 'nx-tick') tickNext(t);
    else if (act === 'hr-on' || act === 'hr-a' || act === 'hr-b') hoursChange(t);
    else if (act === 'import' && t.files && t.files[0]) importData(t.files[0]);
  }

  function onSubmit(e) {
    var f = e.target, fa = f.getAttribute('data-act');
    if (/^tr-/.test(fa || '')) { e.preventDefault(); trSubmit(f, fa); return; }
    if (fa !== 'it-add') return;
    e.preventDefault();
    var v = f.t.value.trim();
    if (v) addItem(f.getAttribute('data-block'), v);
  }

  function onKey(e) {
    if (trGripKey(e)) return;
    if (e.key === 'Escape') { closeSheet(); return; }
    if (isSheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (V.tab !== 'week') return;
    if (e.key === 'ArrowLeft') { V.week = addDays(V.week, -7); renderWeek(true); }
    else if (e.key === 'ArrowRight') { V.week = addDays(V.week, 7); renderWeek(true); }
    else if (e.key === 'n' || e.key === 'т') { e.preventDefault(); var nd = newEventDefaults(); openEvent({ date: nd.date, start: nd.start }); }
  }

  // часы: раз в 15 секунд двигаем «сейчас»; сетку перерисовываем, только когда меняется день
  // или начинается/кончается занятие — иначе блоки дёргались бы каждую минуту
  var lastMin = -1;
  function tick() {
    var m = nowMin(), t = todayIso();
    $$('.js-clock').forEach(function (n) { n.textContent = hhmm(m); });
    if (t !== V.today) {
      if (V.week === mondayOf(V.today)) V.week = mondayOf(t);
      V.today = t;
      if (!isSheetOpen()) render(false);
      lastMin = m;
      return;
    }
    if (m === lastMin || V.tab !== 'week' || isSheetOpen()) return;
    lastMin = m;
    var edge = occurrences(mondayOf(t)).some(function (o) { return o.date === t && (o.s === m || o.e === m); });
    if (edge) { renderWeek(false); return; }
    refreshRail();
    var line = $('.wk-now');
    var col = $('.wk-col.is-today');
    if (line && col) line.style.setProperty('--m', m - (+col.getAttribute('data-a')));
  }

  function readKeyFromHash() {
    // одноразовая ссылка вида …/#key=XXXX: ключ сохраняется, адрес чистится
    var m = /^#key=([\w-]{16,128})$/.exec(location.hash || '');
    if (!m) return;
    lsSet(LS.key, m[1]);
    lsSet(LS.linked, false);
    history.replaceState(null, '', location.pathname + location.search + '#week');
  }

  /* ═════════ 15б. раздел «Тренировка» (D, 01.10) ═════════
     Таблица: строки — упражнения, столбцы — дни, в ячейке — сколько сделано, справа сумма.
     Живёт в cfg, поэтому сервер не меняем и телефон с Маком видят одно и то же.
     Каждая запись cfg целиком перезаписывается более поздней правкой, поэтому всё разбито
     по месяцам — запись не растёт выше 8 КБ (MAX_OBJ на сервере):
       tr_order       — порядок упражнений ["r…", …] (одна запись на всю перетяжку)
       tr_<id>        — упражнение {n: название}
       tc_<ггмм>      — дни-столбцы месяца ["дд", …]
       td_<id>_<ггмм> — счётчики месяца {"дд": число}
     Одновременная правка одного месяца с двух устройств, когда одно было без связи, — побеждает позднейшая. */

  var TR = { sel: null, addDay: false, scroll: true, show: null };

  function trOrder() { var o = cfg('tr_order', []); return Array.isArray(o) ? o : []; }
  function trRows() {
    var ord = trOrder();
    return Object.keys(S.cfg).filter(function (k) { return /^tr_r[0-9a-z]+$/.test(k) && S.cfg[k].v; })
      .map(function (k) { return { id: k.slice(3), n: String(S.cfg[k].v.n || '') }; })
      .sort(function (a, b) {
        var x = ord.indexOf(a.id), y = ord.indexOf(b.id);
        return ((x < 0 ? 1e6 : x) - (y < 0 ? 1e6 : y)) || a.id.localeCompare(b.id);
      });
  }
  function trRow(rid) { return trRows().filter(function (r) { return r.id === rid; })[0]; }
  function trCols() {
    var out = [];
    Object.keys(S.cfg).forEach(function (k) {
      var m = /^tc_(\d\d)(\d\d)$/.exec(k), v = S.cfg[k].v;
      if (!m || !Array.isArray(v)) return;
      v.forEach(function (dd) { if (/^\d\d$/.test(dd)) out.push('20' + m[1] + '-' + m[2] + '-' + dd); });
    });
    return out.sort();
  }
  function trMonth(date) { return date.slice(2, 4) + date.slice(5, 7); }
  function trShard(rid, date) { return 'td_' + rid + '_' + trMonth(date); }
  function trGet(rid, date) {
    var v = cfg(trShard(rid, date), null);
    return v && +v[date.slice(8)] || 0;
  }
  function trSet(rid, date, n) {
    n = Math.max(0, Math.min(99999, Math.round(+n || 0)));
    if (n === trGet(rid, date)) return;   // без изменений — не пишем и не будим синхронизацию
    var id = trShard(rid, date), v = clone(cfg(id, null) || {}), dd = date.slice(8);
    if (n > 0) v[dd] = n; else delete v[dd];
    if (Object.keys(v).length) setCfg(id, v); else drop('cfg', id);
  }
  function trSum(rid, cols) { return cols.reduce(function (a, d) { return a + trGet(rid, d); }, 0); }
  function trValidDate(d) {
    return /^\d{4}-\d\d-\d\d$/.test(d) && iso(parseIso(d)) === d && +d.slice(0, 4) >= 2020 && +d.slice(0, 4) <= 2099;
  }

  function trFigure() {
    return '<svg class="tr-fig" viewBox="0 0 64 64" aria-hidden="true"><circle cx="27" cy="9" r="4.6"/><path d="M27 14v3"/>' +
      '<path d="M12 22q15-7 31 0l-6 19H18z"/><path d="M12 22c-4 4-5 12-4 20l1 6"/><path d="M27 24v7M20 28q7 4 14 0"/>' +
      '<path d="M43 22c3-8 11-8 13-1"/><path d="M56 21v-8"/><rect x="55" y="6" width="7" height="7" rx="3"/>' +
      '<path d="M62 13l-1 15q-10 4-21 0"/><path d="M22 41l-2 19M33 41l2 19"/></svg>';
  }

  function renderTrain() {
    var root = $('#v-train'), rows = trRows(), cols = trCols(), t = todayIso(), sel = TR.sel;
    var old = $('.tr-wrap', root), keep = old ? old.scrollLeft : null;
    // то, что D печатал и на чём стоял фокус, переживает перерисовку
    var dN = $('#trN', root), draftN = dN ? dN.value : '', dD = $('#trD', root), draftD = dD ? dD.value : '';
    var ae = document.activeElement, focus = ae && root.contains(ae) && ae.getAttribute('data-act')
      ? { act: ae.getAttribute('data-act'), id: ae.getAttribute('data-id'), date: ae.getAttribute('data-date') } : null;
    if (sel && sel.k !== 'col' && !trRow(sel.rid)) sel = TR.sel = null;

    var h = '<div class="tr-head">' + trFigure() +
      '<div class="tr-ttl"><small>Тренировка</small><h1>Сегодня — ' + dm(t) + '</h1></div>' +
      '<button class="btn2 tr-dbtn" type="button" data-act="tr-day-open">' + ic('plus') + '<span>День</span></button></div>';

    if (TR.addDay) {
      h += '<form class="tr-form" data-act="tr-day"><label class="sr" for="trD">Дата</label>' +
        '<input id="trD" type="date" name="d" value="' + t + '" min="2020-01-01" max="2099-12-31" required>' +
        '<button class="btn2 btn2--mint" type="submit">Добавить день</button></form>';
    }

    if (!rows.length) {
      h += '<p class="tr-empty">Впиши первое упражнение — например «Подтягивание» — и добавь день. Дальше жми на ячейку и записывай, сколько сделал.</p>';
    }

    if (rows.length || cols.length) {
      h += '<div class="tr-wrap"><table class="tr-tbl"><thead><tr><th class="tr-n">Упражнение</th>' +
        cols.map(function (d) {
          return '<th class="tr-d' + (d === t ? ' is-today' : '') + (sel && sel.k === 'col' && sel.date === d ? ' is-sel' : '') + '"><button type="button" data-act="tr-col" data-date="' + d + '" aria-label="День ' + dm(d) + '"><span>' + DOW_S[dowOf(d)] + '</span><b>' + ddmm(d) + '</b></button></th>';
        }).join('') + '<th class="tr-add"><button type="button" data-act="tr-day-next" title="Добавить следующий день" aria-label="Добавить следующий день">' + ic('plus') + '</button></th><th class="tr-s">Сумма</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr data-id="' + esc(r.id) + '"><td class="tr-n"><button class="tr-grip" type="button" data-act="tr-grip" data-id="' + esc(r.id) + '" aria-label="Переместить: ' + esc(r.n) + '. Тяни или жми стрелки вверх и вниз" title="Перетащить">' +
            '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg></button>' +
            '<button class="tr-name' + (sel && sel.k === 'row' && sel.rid === r.id ? ' is-sel' : '') + '" type="button" data-act="tr-row" data-id="' + esc(r.id) + '">' + esc(r.n) + '</button></td>' +
            cols.map(function (d) {
              var n = trGet(r.id, d), on = sel && sel.k === 'cell' && sel.rid === r.id && sel.date === d;
              return '<td class="tr-d' + (d === t ? ' is-today' : '') + '"><button class="tr-c mono' + (n ? ' has' : '') + (on ? ' is-sel' : '') + '" type="button" data-act="tr-cell" data-id="' + esc(r.id) + '" data-date="' + d + '" aria-label="' + esc(r.n) + ', ' + dm(d) + ': ' + n + '">' + (n || '·') + '</button></td>';
            }).join('') +
            '<td class="tr-add" aria-hidden="true"></td><td class="tr-s mono"><b>' + trSum(r.id, cols) + '</b></td></tr>';
        }).join('') +
        '</tbody>' + (rows.length > 1 && cols.length ? '<tfoot><tr><td class="tr-n">Всего за день</td>' + cols.map(function (d) {
          var s = rows.reduce(function (a, r) { return a + trGet(r.id, d); }, 0);
          return '<td class="tr-d mono' + (d === t ? ' is-today' : '') + '">' + (s || '·') + '</td>';
        }).join('') + '<td class="tr-add" aria-hidden="true"></td><td class="tr-s mono"><b>' + rows.reduce(function (a, r) { return a + trSum(r.id, cols); }, 0) + '</b></td></tr></tfoot>' : '') +
        '</table></div>';
    }

    h += '<form class="tr-form" data-act="tr-add"><label class="sr" for="trN">Новое упражнение</label>' +
      '<input id="trN" name="t" maxlength="40" autocomplete="off" placeholder="Новое упражнение">' +
      '<button class="btn2 btn2--mint" type="submit">Добавить</button></form>' +
      '<p class="tr-hint">Тяни «⋮⋮» слева (или жми на неё и стрелки ↑ ↓) — меняй порядок. Нажми на название — переименовать или убрать. «+» в шапке таблицы — следующий день, «День» — любая дата. Нажми на дату — убрать день.</p>';

    h += trPanel(sel);
    root.innerHTML = h;
    root.classList.toggle('has-pan', !!sel);

    if (draftN) $('#trN', root).value = draftN;
    if (draftD && $('#trD', root)) $('#trD', root).value = draftD;
    var wrap = $('.tr-wrap', root);
    if (wrap) {
      if (TR.show) {   // новый день: показать его, а не конец таблицы
        var nb = $('th [data-date="' + TR.show + '"]', wrap);
        if (nb) {
          var nx = nb.parentNode.nextElementSibling;
          wrap.scrollLeft = nx && nx.classList.contains('tr-add') ? wrap.scrollWidth : Math.max(0, nb.parentNode.offsetLeft - wrap.clientWidth / 2);
        }
        TR.show = null; TR.scroll = false;
      } else if (TR.scroll) { wrap.scrollLeft = wrap.scrollWidth; TR.scroll = false; }
      else if (keep != null) wrap.scrollLeft = keep;
    }
    if (focus) {
      var q = '[data-act="' + focus.act + '"]' + (focus.id ? '[data-id="' + cssId(focus.id) + '"]' : '') + (focus.date ? '[data-date="' + focus.date + '"]' : '');
      var fe = $(q, root);
      if (fe) try { fe.focus({ preventScroll: true }); } catch (x) { fe.focus(); }
    }
    trReveal(root);
  }

  // нижняя панель закрывает ячейку, на которую нажали: подкручиваем страницу, чтобы выбранное было над ней
  function trReveal(root) {
    var pan = $('.tr-pan', root), el = $('.tr-c.is-sel, .tr-name.is-sel, th.is-sel button', root);
    if (!pan || !el) return;
    var top = pan.getBoundingClientRect().top, b = el.getBoundingClientRect();
    if (b.bottom > top - 10) window.scrollBy(0, b.bottom - top + 14);
    else if (b.top < 70) window.scrollBy(0, b.top - 80);
  }

  function trPanel(sel) {
    if (!sel) return '';
    var x = '<button class="tr-x" type="button" data-act="tr-x" aria-label="Закрыть">' + ic('x') + '</button>';
    if (sel.k === 'cell') {
      var r = trRow(sel.rid), n = trGet(sel.rid, sel.date);
      return '<div class="tr-pan" role="group" aria-label="Запись"><div class="tr-pan-h"><div><b>' + esc(r.n) + '</b><small>' + dm(sel.date) + ', ' + DOW_L[dowOf(sel.date)] + '</small></div>' + x + '</div>' +
        '<div class="tr-pan-v mono">' + n + '</div>' +
        '<div class="tr-pan-q">' + [[-1, '−1'], [1, '+1'], [5, '+5'], [10, '+10'], [20, '+20']].map(function (q) {
          return '<button class="btn2" type="button" data-act="tr-plus" data-n="' + q[0] + '">' + q[1] + '</button>';
        }).join('') + '</div>' +
        '<form class="tr-form" data-act="tr-set"><label class="sr" for="trV">Поставить число</label>' +
        '<input id="trV" type="number" name="n" inputmode="numeric" min="0" max="99999" placeholder="Поставить число"><button class="btn2 btn2--mint" type="submit">Записать</button>' +
        '<button class="btn2" type="button" data-act="tr-plus" data-n="0">Сброс</button></form></div>';
    }
    if (sel.k === 'row') {
      var rr = trRow(sel.rid);
      return '<div class="tr-pan" role="group" aria-label="Упражнение"><div class="tr-pan-h"><div><b>Упражнение</b><small>переименовать или убрать</small></div>' + x + '</div>' +
        '<form class="tr-form" data-act="tr-rename"><label class="sr" for="trR">Название</label><input id="trR" name="t" maxlength="40" value="' + esc(rr.n) + '" autocomplete="off">' +
        '<button class="btn2 btn2--mint" type="submit">Сохранить</button></form>' +
        '<button class="btn2 btn2--danger tr-del" type="button" data-act="tr-row-del">Убрать упражнение и все его записи</button></div>';
    }
    return '<div class="tr-pan" role="group" aria-label="День"><div class="tr-pan-h"><div><b>' + dm(sel.date) + '</b><small>' + DOW_L[dowOf(sel.date)] + '</small></div>' + x + '</div>' +
      '<button class="btn2 btn2--danger tr-del" type="button" data-act="tr-col-del">Убрать этот день из таблицы</button>' +
      '<p class="tr-hint">Числа за этот день не стираются: добавишь дату снова — они вернутся.</p></div>';
  }

  function trPlus(n) {
    var s = TR.sel;
    if (!s || s.k !== 'cell') return;
    trSet(s.rid, s.date, n === 0 ? 0 : trGet(s.rid, s.date) + n);
    renderTrain();
  }
  function trColSet(date, on) {
    var id = 'tc_' + trMonth(date), dd = date.slice(8), v = cfg(id, []);
    v = (Array.isArray(v) ? v : []).filter(function (x) { return x !== dd; });
    if (on) v.push(dd);
    v.sort();
    if (v.length) setCfg(id, v); else drop('cfg', id);
  }
  // «+» перед «Сумма»: следующий день после последнего столбца (пока дней нет — сегодня)
  function trAddDay(d) {
    if (!trValidDate(d)) { toast('Не разобрал дату — выбери из календаря'); return; }
    if (trCols().indexOf(d) >= 0) toast('Этот день уже есть в таблице');
    else trColSet(d, true);
    TR.sel = null; TR.addDay = false; TR.show = d; renderTrain();
  }
  var trNextAt = 0;
  function trDayNext() {
    var now = Date.now();
    if (now - trNextAt < 350) return;   // двойной тап не должен добавлять два дня
    trNextAt = now;
    var c = trCols();
    trAddDay(c.length ? addDays(c[c.length - 1], 1) : todayIso());
  }
  function trColDel() {
    var s = TR.sel;
    if (!s || s.k !== 'col') return;
    trColSet(s.date, false);
    TR.sel = null; renderTrain();
  }
  function trRowDel() {
    var s = TR.sel, r = s && trRow(s.rid);
    if (!r) return;
    var btn = $('[data-act="tr-row-del"]');
    if (btn && !btn.classList.contains('is-armed')) {   // как в остальном Кабинете: второе нажатие подтверждает
      btn.classList.add('is-armed'); btn.textContent = 'Нажми ещё раз — удалить «' + r.n + '»';
      setTimeout(function () { if (btn.isConnected) { btn.classList.remove('is-armed'); btn.textContent = 'Убрать упражнение и все его записи'; } }, 3200);
      return;
    }
    var snap = [], ord = trOrder().slice();
    Object.keys(S.cfg).forEach(function (k) {
      if (k === 'tr_' + r.id || k.indexOf('td_' + r.id + '_') === 0) { snap.push([k, clone(S.cfg[k].v)]); drop('cfg', k); }
    });
    setCfg('tr_order', ord.filter(function (x) { return x !== r.id; }));
    TR.sel = null; renderTrain();
    toast('Упражнение «' + r.n + '» убрано', function () {
      snap.forEach(function (x) { setCfg(x[0], x[1]); });
      setCfg('tr_order', ord);
      renderTrain();
    });
  }
  function trSubmit(f, act) {
    var s = TR.sel;
    if (act === 'tr-add') {
      var name = f.t.value.trim().slice(0, 40);
      if (!name) return;
      var rid = 'r' + Date.now().toString(36), ord = trRows().map(function (x) { return x.id; });
      setCfg('tr_' + rid, { n: name });
      setCfg('tr_order', ord.concat(rid));
      if (!trCols().length) trColSet(todayIso(), true);   // первая строка — сразу с колонкой «сегодня»
      TR.sel = null; f.t.value = ''; renderTrain();
      var inp = $('#trN'); if (inp) inp.focus({ preventScroll: true });
    } else if (act === 'tr-day') {
      trAddDay(f.d.value);
    } else if (act === 'tr-set') {
      if (!s || s.k !== 'cell' || f.n.value === '') return;
      trSet(s.rid, s.date, f.n.value);
      renderTrain();
    } else if (act === 'tr-rename') {
      var r = s && trRow(s.rid), nn = f.t.value.trim().slice(0, 40);
      if (!r || !nn) return;
      if (nn !== r.n) setCfg('tr_' + r.id, { n: nn });
      TR.sel = null; renderTrain();
    }
  }

  function trSaveOrder(ids) {
    var cur = trRows().map(function (x) { return x.id; });
    if (ids.join() !== cur.join()) setCfg('tr_order', ids);
  }
  // порядок строк: тянем «⋮⋮» (или стрелки ↑ ↓ на ней). Строка едет по таблице вживую, на отпускании порядок пишется одной записью
  function trDragStart(e) {
    var g = e.target.closest && e.target.closest('.tr-grip');
    if (!g || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var tr = g.closest('tr'), body = tr.parentNode, pid = e.pointerId;
    e.preventDefault();
    tr.classList.add('is-drag');
    document.body.classList.add('is-dragging');
    function move(ev) {
      if (ev.pointerId !== pid) return;
      var y = ev.clientY, before = null, sibs = [].slice.call(body.children).filter(function (x) { return x !== tr; });
      for (var i = 0; i < sibs.length; i++) {
        var b = sibs[i].getBoundingClientRect();
        if (y < b.top + b.height / 2) { before = sibs[i]; break; }
      }
      if (before !== tr.nextElementSibling) body.insertBefore(tr, before);
    }
    function up(ev) {
      if (ev.pointerId !== pid) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      tr.classList.remove('is-drag');
      document.body.classList.remove('is-dragging');
      trSaveOrder([].map.call(body.children, function (x) { return x.getAttribute('data-id'); }));
      renderTrain();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }
  function trGripKey(e) {
    var g = e.target.closest && e.target.closest('.tr-grip');
    if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return false;
    e.preventDefault();
    var ids = trRows().map(function (x) { return x.id; }), id = g.getAttribute('data-id'), i = ids.indexOf(id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return true;
    ids.splice(i, 1); ids.splice(j, 0, id);
    trSaveOrder(ids); renderTrain();
    return true;
  }

  /* ═════════ 16. старт ═════════ */

  // okna.html — страница для родителей: только карточка свободного времени.
  // Данные — публичная занятость с сервера (без имён), логика та же, что в кабинете.
  function bootOkna() {
    var root = $('#okna');
    root.innerHTML = '<article class="ok-card ok-card--wait"><div class="ok-skel"></div><div class="ok-skel"></div><div class="ok-skel"></div></article>';
    V.oknaNext = /[?&]w=next\b/.test(location.search);
    // пояс: из ссылки D. (?tz=0…6), иначе — пояс телефона родителя; время пересчитывается
    var tzq = /[?&]tz=(-?\d{1,2})\b/.exec(location.search), dev = -new Date().getTimezoneOffset() / 60 - 3;
    V.tz = tzq ? +tzq[1] : (dev === Math.round(dev) && dev >= -1 && dev <= 9 ? dev : HOME_MSK);
    // у родителя может быть VPN — не достали прямой адрес, пробуем запасной
    function get(i) {
      var ctrl = window.AbortController ? new AbortController() : null;
      var guard = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
      return fetch(APIS[i] + '/okna', { signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { clearTimeout(guard); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
              function (e) { clearTimeout(guard); if (i + 1 < APIS.length) return get(i + 1); throw e; });
    }
    get(0)
      .then(function (data) {
        S = blank();
        (data.busy || []).forEach(function (o, i) {
          if (!o || typeof o !== 'object') return;
          o.id = 'b' + i; o.type = 'busy';
          S.events[o.id] = o;
        });
        S.cfg.hours = { id: 'hours', v: data.hours || {} };
        S.cfg.slot = { id: 'slot', v: +data.slot || 60 };
        root.innerHTML = oknaCardHtml(oknaMon()) +
          '<p class="okp-note">Выберите удобное время и напишите его в ответ на сообщение.</p>';
      })
      .catch(function () {
        root.innerHTML = '<article class="ok-card"><h3 class="ok-h">Расписание обновляется</h3>' +
          '<p class="ok-sub">Загляните чуть позже.</p>' +
          '<div class="ok-foot"><span>© 2026 Дмитрий Дружков</span><span>математика</span></div></article>';
      });
  }

  function boot() {
    if (window.KAB_MODE === 'okna') { bootOkna(); return; }
    SH.el = $('#sh');
    SH.bg = $('#shBg');
    FAB = $('#kbFab');
    readKeyFromHash();
    load();
    mountShell();
    paintTheme();

    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', trDragStart);
    window.addEventListener('hashchange', function () { go(location.hash.slice(1)); window.scrollTo(0, 0); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      tick();
      if (getKey()) scheduleSync(0);
    });
    document.addEventListener('focusout', flushDirty);
    // кабинет открыт в двух вкладках: правка в одной сразу видна в другой,
    // и отставшая вкладка не затрёт свежие данные своей старой копией
    window.addEventListener('storage', function (e) {
      if (e.key !== LS.state && e.key !== LS.out) return;
      load();
      safeRender();
    });

    var h = location.hash.slice(1);
    var tab = TABS.indexOf(h) >= 0 ? h : (lsGet(LS.tab, 'week') || 'week');
    if (TABS.indexOf(h) < 0) history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    go(tab, false);
    lastMin = nowMin();

    if (getKey()) syncNow(); else setStatus('local');
    setInterval(tick, 15000);
    // пока кабинет на экране — сверка каждые 5 с: отметка с телефона видна на Маке почти сразу
    setInterval(function () { if (getKey() && !document.hidden && !SY.busy) syncNow(); }, 5000);
    window.addEventListener('focus', function () { if (getKey()) scheduleSync(0); });
    window.addEventListener('online', function () { if (getKey()) scheduleSync(0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
