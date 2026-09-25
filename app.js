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
  var OKNA_URL = 'https://dmitrydruzhkovv-arch.github.io/di-kabinet/okna.html';
  var KINDS = ['events', 'blocks', 'items', 'cfg'];
  var TABS = ['week', 'list', 'okna'];

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
    undo:  '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'
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
  function tzInfo() {
    var off = -new Date().getTimezoneOffset() / 60, msk = off - 3;
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

  var V = { tab: 'week', week: mondayOf(todayIso()), oknaNext: false, today: todayIso() };
  var FAB, SH = { el: null, bg: null, onSubmit: null, lastFocus: null };

  function mountShell() {
    var tabs = [['week', 'Неделя'], ['list', 'Чек-лист'], ['okna', 'Окна']];
    var links = tabs.map(function (t) {
      return '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + ic(t[0]) + '<span>' + t[1] + '</span></a>';
    }).join('') +
      '<a href="' + SCHOOL + '" target="_blank" rel="noopener">' + ic('school') + '<span>Школа</span></a>' +
      '<a href="' + HUB + '" target="_blank" rel="noopener">' + ic('link') + '<span>Ссылки</span></a>';

    $('#kbTop').innerHTML =
      '<div class="kb-brand">' +
        '<div class="lk-sign kb-theme" role="group" aria-label="Тема оформления">' +
          '<button class="kb-tm" type="button" data-act="theme" data-v="light" aria-pressed="false" aria-label="Светлая тема" title="Светлая тема"><span class="lk-badge lk-badge-l lk-badge--sm">Λ</span></button>' +
          '<button class="kb-tm" type="button" data-act="theme" data-v="dark" aria-pressed="false" aria-label="Тёмная тема" title="Тёмная тема"><span class="lk-badge lk-badge-d lk-badge--sm">D.</span></button>' +
        '</div>' +
        '<a class="kb-name" href="#week">Кабинет</a></div>' +
      '<nav class="kb-tabs" aria-label="Разделы">' + links + '</nav>' +
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
      '<div class="fl-warn" id="evWarn" hidden></div>' +
      '<div class="sh-actions"><button class="lk-btn" type="submit">' + (isNew ? 'Вписать' : 'Сохранить') + '</button>' +
      (isNew ? '' :
        (ev.rep
          ? (off
            ? '<button class="btn2 btn2--mint" type="button" data-e="unskip">' + ic('undo') + 'Вернуть занятие ' + ddmm(date) + '</button>'
            : '<button class="btn2" type="button" data-e="skip">Отменить только ' + ddmm(date) + '</button>')
          : '') +
        '<button class="btn2 btn2--danger" type="button" data-e="del">' + ic('x') + (ev.rep ? 'Удалить из расписания совсем' : 'Удалить') + '</button>') +
      '</div>';

    var form = sheet(isNew ? 'Новое занятие' : (ev.title || typeOf(ev).label), sub, html, save);

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
      var o = isNew ? { id: uid('e') } : clone(ev);
      if (o.title !== title) delete o.short;
      o.title = title;
      o.type = f.type;
      o.start = st;
      o.dur = clampInt(form.dur.value, 5, 720, f.dur);
      var note = form.note.value.trim().slice(0, 160);
      if (note) o.note = note; else delete o.note;
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
    function skipOnce() {
      var o = clone(ev);
      o.skip = (o.skip || []).filter(function (x) { return x !== date; }).concat([date]);
      put('events', o);
      closeSheet(); render(false);
      toast('Отменено ' + ddmm(date), function () {
        var b = S.events[ev.id]; if (!b) return;
        var c = clone(b); c.skip = (c.skip || []).filter(function (x) { return x !== date; });
        put('events', c); render(false);
      });
    }
    function unskip() {
      var o = clone(ev);
      o.skip = (o.skip || []).filter(function (x) { return x !== date; });
      put('events', o);
      closeSheet(); render(false);
      toast('Занятие ' + ddmm(date) + ' вернулось');
    }
    function removeEvent() {
      var old = drop('events', ev.id);
      closeSheet(); render(false);
      toast('Удалено: ' + (old.title || typeOf(old).label), function () { put('events', old); render(false); });
    }
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
        '<p>Карточка без имён: только свободное время. Сделай скриншот или скопируй текстом и отправь родителю.</p></div>' +
      '<div class="seg" role="group" aria-label="Какая неделя" style="margin:16px 0 14px">' +
        '<button type="button" data-act="ok-week" data-n="0" aria-pressed="' + !V.oknaNext + '">Эта неделя</button>' +
        '<button type="button" data-act="ok-week" data-n="1" aria-pressed="' + V.oknaNext + '">Следующая</button></div>' +
      '<div id="okCardWrap">' + oknaCardHtml(mon) + '</div>' +
      '<div class="ok-actions" style="margin-top:12px">' +
        '<button class="btn2 btn2--mint" type="button" data-act="ok-copy">' + ic('copy') + 'Скопировать текстом</button>' +
        '<button class="btn2" type="button" data-act="ok-link">' + ic('link') + 'Ссылка для родителей</button></div>' +
      '</div>' +
      '<div class="ok-ctl">' + hoursHtml() + '</div></div>';
    $('#v-okna').innerHTML = h;
  }

  function oknaCardHtml(mon) {
    var days = freeSlots(mon), slot = +cfg('slot', 60) || 60;
    var rows = days.map(function (d) {
      return '<div class="ok-day"><div class="ok-dn"><b>' + DOW_S[d.dow] + '</b><span>' + ddmm(d.date) + '</span></div>' +
        (d.list.length
          ? '<div class="ok-slots">' + d.list.map(function (m) { return '<span class="ok-t">' + hhmm(m) + '</span>'; }).join('') + '</div>'
          : '<div class="ok-none">всё занято</div>') + '</div>';
    }).join('');
    if (!days.length) rows = '<div class="ok-empty">На этой неделе приёмных дней больше нет. Открой следующую неделю или включи часы приёма.</div>';
    return '<article class="ok-card" id="okCard">' +
      '<div class="ok-top"><span class="lk-sign" aria-hidden="true"><span class="lk-badge lk-badge-l lk-badge--sm">Λ</span><span class="lk-badge lk-badge-d lk-badge--sm">D.</span></span>' +
        '<span class="ok-week">' + esc(weekLabel(mon)) + '</span></div>' +
      '<h3 class="ok-h">Свободное время для занятий</h3>' +
      '<p class="ok-sub">Занятие ' + slot + ' ' + plural(slot, 'минута', 'минуты', 'минут') + '. ' + tzInfo().long + '</p>' +
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
    var lines = ['Свободное время для занятий, ' + weekLabel(mon) + ' (занятие ' + slot + ' ' + plural(slot, 'минута', 'минуты', 'минут') + ', ' + tzInfo().short + '):'];
    days.forEach(function (d) {
      lines.push(DOW_S[d.dow] + ' ' + ddmm(d.date) + ': ' + (d.list.length ? d.list.map(hhmm).join(', ') : 'всё занято'));
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
  function toast(msg, undo) {
    var el = $('#toast');
    TT.undo = undo || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" data-act="undo">Вернуть</button>' : '');
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
      case 'ok-week': V.oknaNext = t.getAttribute('data-n') === '1'; renderOkna(); break;
      case 'ok-slot': setCfg('slot', +t.getAttribute('data-m')); renderOkna(); break;
      case 'ok-copy':
        copyText(oknaText(oknaMon())).then(function (ok) { toast(ok ? 'Скопировано. Вставь в сообщение родителю' : 'Не вышло скопировать'); });
        break;
      case 'ok-link':
        if (!getKey() || SY.s !== 'synced') { toast('Ссылка заработает, когда подключим сервер. Пока — скриншот или текст'); break; }
        copyText(OKNA_URL + (V.oknaNext ? '?w=next' : '')).then(function (ok) { toast(ok ? 'Ссылка скопирована' : 'Не вышло скопировать'); });
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
    var f = e.target;
    if (f.getAttribute('data-act') !== 'it-add') return;
    e.preventDefault();
    var v = f.t.value.trim();
    if (v) addItem(f.getAttribute('data-block'), v);
  }

  function onKey(e) {
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

  /* ═════════ 16. старт ═════════ */

  // okna.html — страница для родителей: только карточка свободного времени.
  // Данные — публичная занятость с сервера (без имён), логика та же, что в кабинете.
  function bootOkna() {
    var root = $('#okna');
    root.innerHTML = '<article class="ok-card ok-card--wait"><div class="ok-skel"></div><div class="ok-skel"></div><div class="ok-skel"></div></article>';
    V.oknaNext = /[?&]w=next\b/.test(location.search);
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
