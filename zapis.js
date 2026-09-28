/* zapis.js — живая запись на занятия (D, 28.09.2026).

   Одна ссылка на всех: родитель видит свободное время в СВОЁМ поясе, жмёт —
   время сразу его и сразу закрыто у остальных (сервер пускает первого).
   Бронь тут же появляется в Кабинете D. Здесь же «Мои занятия»: перенести,
   отменить. Постоянный ученик приходит по личной ссылке ?p=… из Кабинета.

   Страница запоминает человека ключом p в этом браузере (localStorage).
   Имена и контакты живут только на сервере в РФ (152-ФЗ); здесь их нет.
   Сервер: /cabinet/zapis/* (vk_bot/zapis.py). */
(function () {
  'use strict';

  var HOME = 2;   // расписание D. — Екатеринбург, МСК+2
  var POLICY = 'politika.html', SOGLASIE = 'soglasie.html';   // тексты Нормы v2 (28.09)
  var LS = { p: 'zapis:p', tz: 'zapis:tz', api: 'zapis:api' };
  var DOW = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var DOW_L = ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  var MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var CITY = { '-1': 'калининградское', 0: 'московское', 1: 'самарское', 2: 'екатеринбургское', 3: 'омское', 4: 'красноярское', 5: 'иркутское', 6: 'якутское', 7: 'владивостокское', 8: 'магаданское', 9: 'камчатское' };

  var root = document.getElementById('zp');
  var Z = { data: null, week: 0, tz: HOME, tzMore: false, p: '', move: null, err: '' };

  /* ── мелочи ── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toMin(s) { var p = String(s).split(':'); return +p[0] * 60 + (+p[1] || 0); }
  function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function tzM(m) { return m + (Z.tz - HOME) * 60; }                 // время D. → время человека
  function ddmm(s) { return s.slice(8, 10) + '.' + s.slice(5, 7); }
  function dow(s) { var d = new Date(s + 'T12:00:00'); return d.getDay() || 7; }
  function dayLong(s) { return DOW_L[dow(s)] + ', ' + (+s.slice(8, 10)) + ' ' + MON_G[+s.slice(5, 7) - 1]; }
  function tzLong(tz) {
    var c = CITY[tz], shift = tz === 0 ? '' : ' (МСК' + (tz > 0 ? '+' : '−') + Math.abs(tz) + ')';
    return c ? 'время ' + c + shift : 'время МСК' + (tz >= 0 ? '+' : '−') + Math.abs(tz);
  }
  function weekLabel(mon) {
    var a = new Date(mon + 'T12:00:00'), b = new Date(a.getTime() + 6 * 864e5);
    return a.getMonth() === b.getMonth()
      ? a.getDate() + '–' + b.getDate() + ' ' + MON_G[b.getMonth()]
      : a.getDate() + ' ' + MON_G[a.getMonth()] + ' – ' + b.getDate() + ' ' + MON_G[b.getMonth()];
  }
  function when(date, m) { return DOW[dow(date)].toLowerCase() + ' ' + ddmm(date) + ' в ' + hhmm(tzM(m)); }
  var tt = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('is-on'); }, 3200);
  }

  /* ── сервер: прямой адрес и запасной через шлюз (с VPN прямой не отвечает) ── */
  var APIS = (function () {
    var q = new URLSearchParams(location.search).get('api') || '';
    if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?(\/[\w\/-]*)?$/.test(q)) return [q.replace(/\/$/, '')];
    var list = ['https://194-87-110-53.nip.io/cabinet', 'https://hw.157-228-128-116.nip.io/cabinet'];
    var saved = lsGet(LS.api);
    return list.indexOf(saved) > 0 ? [saved].concat(list.filter(function (a) { return a !== saved; })) : list;
  })();
  var API = APIS[0];

  function call(path, body, tries) {
    tries = tries == null ? APIS.length : tries;
    var ctrl = window.AbortController ? new AbortController() : null;
    var guard = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    var opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(API + path, opts).then(function (r) {
      clearTimeout(guard);
      lsSet(LS.api, API === APIS[0] && API.indexOf('https://hw.') < 0 ? null : API);
      return r.json().catch(function () { return { ok: false, error: 'http' }; });
    }, function (e) {
      clearTimeout(guard);
      if (tries > 1) { API = APIS[(APIS.indexOf(API) + 1) % APIS.length]; return call(path, body, tries - 1); }
      throw e;
    });
  }

  /* ── кто на странице ── */
  (function who() {
    var q = new URLSearchParams(location.search), p = q.get('p');
    if (p && /^[\w-]{8,64}$/.test(p)) {
      lsSet(LS.p, p);
      q.delete('p');   // ключ не светим в адресе: скриншот/пересылка не выдаст чужие записи
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    }
    Z.p = lsGet(LS.p) || '';
    var saved = lsGet(LS.tz), dev = -new Date().getTimezoneOffset() / 60 - 3;
    Z.tz = saved != null && /^-?\d$/.test(saved) ? +saved
      : (dev === Math.round(dev) && dev >= -1 && dev <= 9 ? dev : HOME);
    Z.tzMore = Z.tz > 2 || Z.tz < 0;
  })();

  function load(quiet) {
    return call('/zapis/slots' + (Z.p ? '?p=' + encodeURIComponent(Z.p) : '')).then(function (d) {
      if (!d || !d.ok) throw new Error('bad');
      if (Z.p && !d.me) { lsSet(LS.p, null); Z.p = ''; }   // ключ забыт сервером — начинаем как новый
      Z.data = d; Z.err = '';
      render();
    }).catch(function () {
      if (!quiet || !Z.data) { Z.err = 'Не получилось загрузить расписание. Проверьте интернет и обновите страницу.'; render(); }
    });
  }

  /* ── отрисовка ── */
  function render() {
    if (!Z.data) {
      root.innerHTML = head() + (Z.err
        ? '<article class="ok-card"><p class="ok-sub" style="margin:0">' + esc(Z.err) + '</p></article>'
        : '<article class="ok-card ok-card--wait"><div class="ok-skel"></div><div class="ok-skel"></div><div class="ok-skel"></div></article>');
      return;
    }
    var d = Z.data, w = d.weeks[Z.week];
    root.innerHTML = head() + meHtml() + moveHtml() + tzHtml() +
      '<div class="seg" role="group" aria-label="Какая неделя" style="margin:0 0 12px">' +
        '<button type="button" data-a="week" data-n="0" aria-pressed="' + (Z.week === 0) + '">Эта неделя</button>' +
        '<button type="button" data-a="week" data-n="1" aria-pressed="' + (Z.week === 1) + '">Следующая</button></div>' +
      cardHtml(w) +
      '<p class="okp-note">Нажмите на время — оно сразу закрепится за вами.<br>Занятие ' + d.slot + ' минут, онлайн.</p>' +
      '<footer class="zp-foot">© 2026 Дмитрий Дружков · <a href="' + POLICY + '" target="_blank" rel="noopener">Политика обработки данных</a></footer>';
  }

  function head() {
    return '<header class="zp-head"><span class="lk-sign" aria-hidden="true"><span class="lk-badge lk-badge-l lk-badge--sm">Λ</span><span class="lk-badge lk-badge-d lk-badge--sm">D.</span></span>' +
      '<div class="lk-kicker">Математика · Дмитрий Дружков</div><h1 class="zp-h1">Запись на занятия</h1></header>';
  }

  function meHtml() {
    var me = Z.data.me;
    if (!me) return '';
    var rows = me.lessons.map(function (l) {
      var m = toMin(l.start);
      return '<div class="zp-les"><div><b>' + DOW[dow(l.date)] + ' ' + ddmm(l.date) + ' · ' + hhmm(tzM(m)) + '</b>' +
          '<span>' + (l.rep ? 'постоянное занятие' : 'разовое занятие') + '</span></div>' +
        (l.can_change
          ? '<div class="zp-les-a"><button type="button" class="zp-mini" data-a="move" data-ev="' + esc(l.ev) + '" data-d="' + l.date + '" data-m="' + m + '">Перенести</button>' +
            '<button type="button" class="zp-mini zp-mini--bad" data-a="cancel" data-ev="' + esc(l.ev) + '" data-d="' + l.date + '" data-m="' + m + '">Отменить</button></div>'
          : '<div class="zp-late">меньше 12 ч —<br>напишите Дмитрию</div>') +
        '</div>';
    }).join('');
    return '<section class="ok-box zp-me"><h3>' + esc(me.name) + ', ваши занятия</h3>' +
      (rows || '<p>Пока ничего не запланировано. Выберите время ниже.</p>') + '</section>';
  }

  function moveHtml() {
    if (!Z.move) return '';
    return '<div class="fl-warn zp-move">🔁 Переносим занятие <b>' + when(Z.move.date, Z.move.m) + '</b>. Выберите новое время ниже.' +
      '<button type="button" class="zp-mini" data-a="move-off">Не переносить</button></div>';
  }

  function tzHtml() {
    var list = [0, 1, 2], more = [-1, 3, 4, 5, 6];
    if (Z.tzMore) list = [-1].concat(list, [3, 4, 5, 6]);
    var b = list.map(function (n) {
      return '<button type="button" data-a="tz" data-n="' + n + '" aria-pressed="' + (n === Z.tz) + '">' + (n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0') + '</button>';
    }).join('') + (Z.tzMore ? '' : '<button type="button" data-a="tz-more" aria-label="Другие пояса">»</button>');
    return '<div class="tz-row"><span class="tz-l">Время на странице — <b>' + tzLong(Z.tz).replace(/^время /, '') + '</b>. Не ваше? Выберите часы от Москвы:</span>' +
      '<div class="seg seg--tz" role="group" aria-label="Ваш часовой пояс">' + b + '</div></div>';
  }

  function cardHtml(w) {
    var rows = w.days.map(function (d) {
      return '<div class="ok-day"><div class="ok-dn"><b>' + DOW[d.dow] + '</b><span>' + ddmm(d.date) + '</span></div>' +
        (d.list.length
          ? '<div class="ok-slots">' + d.list.map(function (m) {
              return '<button type="button" class="ok-t" data-a="pick" data-d="' + d.date + '" data-m="' + m + '">' + hhmm(tzM(m)) + '</button>';
            }).join('') + '</div>'
          : '<div class="ok-none">всё занято</div>') + '</div>';
    }).join('');
    if (!w.days.length) rows = '<div class="ok-empty">На этой неделе свободного времени уже нет — загляните в следующую.</div>';
    return '<article class="ok-card"><div class="ok-top"><span class="ok-week">' + esc(weekLabel(w.mon)) + '</span></div>' +
      '<h3 class="ok-h">Свободное время</h3>' + rows + '</article>';
  }

  /* ── окно подтверждения ── */
  var sh = null;
  function sheet(html) {
    close();
    sh = document.createElement('div');
    sh.className = 'zp-sh';
    sh.innerHTML = '<div class="zp-sh-bg" data-a="close"></div><section class="zp-sh-card" role="dialog" aria-modal="true">' + html + '</section>';
    document.body.appendChild(sh);
    document.body.classList.add('is-locked');
    var f = sh.querySelector('input');
    if (f && !('ontouchstart' in window)) f.focus();
  }
  function close() { if (sh) { sh.remove(); sh = null; } document.body.classList.remove('is-locked'); }

  function pick(date, m) {
    var me = Z.data.me, head = '<div class="zp-when">' + DOW[dow(date)] + ', ' + dayLong(date).split(', ')[1] + ' · ' + hhmm(tzM(m)) + '</div>' +
      '<p class="zp-tz">' + tzLong(Z.tz) + '</p>';
    if (Z.move) {
      sheet(head + '<p>Перенести занятие <b>' + when(Z.move.date, Z.move.m) + '</b> на это время?</p>' +
        btns('Перенести', 'do-move', date, m));
    } else if (me) {
      sheet(head + '<p>Записать: <b>' + esc(me.name) + '</b></p>' + btns('Записаться', 'do-book', date, m));
    } else {
      sheet(head +
        '<form id="zpForm" novalidate>' +
        '<label class="fl"><span>Имя ученика</span><input class="inp" name="name" maxlength="60" autocomplete="name" placeholder="например, Маша, 9 класс" required></label>' +
        '<label class="fl"><span>Как с вами связаться</span><input class="inp" name="contact" maxlength="80" autocomplete="tel" placeholder="телефон или @ник в Телеграме" required></label>' +
        '<label class="zp-ok"><input type="checkbox" name="consent"> <span>Даю согласие на обработку персональных данных — моих и ребёнка — на <a href="' + SOGLASIE + '" target="_blank" rel="noopener">этих условиях</a>. Данные хранятся в России.</span></label>' +
        '<p class="fl-err" id="zpErr" hidden></p>' +
        btns('Записаться', 'do-book', date, m, true) + '</form>');
    }
  }
  function btns(label, act, date, m, submit) {
    return '<div class="sh-actions"><button class="lk-btn" type="' + (submit ? 'submit' : 'button') + '" data-a="' + act + '" data-d="' + date + '" data-m="' + m + '">' + label + '</button>' +
      '<button class="btn2" type="button" data-a="close">Назад</button></div>';
  }

  var busy = false;
  function doBook(date, m) {
    if (busy) return;
    var body = { date: date, start: hhmm(m), tz: Z.tz };
    if (Z.p) body.p = Z.p;
    else {
      var f = document.getElementById('zpForm'), err = document.getElementById('zpErr');
      body.name = f.name.value.trim(); body.contact = f.contact.value.trim(); body.consent = f.consent.checked;
      var bad = !body.name ? 'Напишите имя ученика' : !body.contact ? 'Оставьте телефон или ник в Телеграме' : !body.consent ? 'Нужно согласие на обработку данных' : '';
      if (bad) { err.textContent = bad; err.hidden = false; return; }
    }
    busy = true; spin(true);
    call('/zapis/book', body).then(function (r) {
      busy = false;
      if (r.ok) {
        if (r.p) { Z.p = r.p; lsSet(LS.p, r.p); }
        done('✅ Вы записаны', 'Занятие: <b>' + dayLong(date) + ', ' + hhmm(tzM(m)) + '</b> (' + tzLong(Z.tz) + ').<br>Дмитрий уже видит запись. Перенести или отменить можно на этой же странице — она вас запомнила.');
      } else fail(r.error);
    }, netFail);
  }
  function doMove(date, m) {
    if (busy || !Z.move) return;
    busy = true; spin(true);
    call('/zapis/move', { p: Z.p, ev: Z.move.ev, date: Z.move.date, to_date: date, to_start: hhmm(m) }).then(function (r) {
      busy = false;
      if (r.ok) {
        var was = when(Z.move.date, Z.move.m); Z.move = null;
        done('✅ Перенесли', 'Было: ' + was + '.<br>Стало: <b>' + dayLong(date) + ', ' + hhmm(tzM(m)) + '</b> (' + tzLong(Z.tz) + ').');
      } else fail(r.error);
    }, netFail);
  }
  function askCancel(ev, date, m) {
    sheet('<div class="zp-when">Отменить занятие?</div><p><b>' + dayLong(date) + ', ' + hhmm(tzM(m)) + '</b> (' + tzLong(Z.tz) + ')</p>' +
      '<div class="sh-actions"><button class="btn2 btn2--danger" type="button" data-a="do-cancel" data-ev="' + esc(ev) + '" data-d="' + date + '">Да, отменить</button>' +
      '<button class="btn2" type="button" data-a="close">Нет, оставить</button></div>');
  }
  function doCancel(ev, date) {
    if (busy) return;
    busy = true; spin(true);
    call('/zapis/cancel', { p: Z.p, ev: ev, date: date }).then(function (r) {
      busy = false;
      if (r.ok) { close(); toast('Занятие отменено. Дмитрий получил уведомление'); load(); } else fail(r.error);
    }, netFail);
  }

  function spin(on) { var b = sh && sh.querySelector('.lk-btn, .btn2--danger'); if (b) { b.disabled = on; if (on) b.textContent = 'Секунду…'; } }
  function done(title, text) {
    sheet('<div class="zp-when">' + title + '</div><p>' + text + '</p>' +
      '<div class="sh-actions"><button class="lk-btn" type="button" data-a="close-reload">Хорошо</button>' +
      '<button class="btn2" type="button" data-a="copy-link">Скопировать личную ссылку — для другого телефона</button></div>');
  }
  function fail(code) {
    var msg = {
      taken: 'Это время только что заняли. Выберите, пожалуйста, другое.',
      too_late: 'До занятия меньше 12 часов — перенести или отменить можно только через Дмитрия. Напишите ему.',
      too_many: 'У вас уже три записи наперёд. Сначала пройдите ближайшее занятие или отмените лишнее.',
      need_name: 'Напишите имя ученика и контакт.',
      need_consent: 'Нужно согласие на обработку данных.',
      limit: 'Слишком много записей с этого подключения. Напишите Дмитрию напрямую.'
    }[code] || 'Не получилось. Попробуйте ещё раз через минуту.';
    close(); toast(msg);
    if (code === 'taken' || code === 'too_late') load();
  }
  function netFail() { busy = false; close(); toast('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз'); }

  function copyLink() {
    var url = location.origin + location.pathname + '?p=' + encodeURIComponent(Z.p);
    var ok = function () { toast('Ссылка скопирована. Она личная — не пересылайте её чужим'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(ok, function () { prompt('Ваша личная ссылка:', url); });
    else prompt('Ваша личная ссылка:', url);
  }

  /* ── нажатия ── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]');
    if (!t) return;
    var a = t.getAttribute('data-a'), d = t.getAttribute('data-d'), m = +t.getAttribute('data-m');
    switch (a) {
      case 'week': Z.week = +t.getAttribute('data-n'); render(); break;
      case 'tz': Z.tz = +t.getAttribute('data-n'); lsSet(LS.tz, String(Z.tz)); render(); break;
      case 'tz-more': Z.tzMore = true; render(); break;
      case 'pick': pick(d, m); break;
      case 'move': Z.move = { ev: t.getAttribute('data-ev'), date: d, m: m }; render(); toast('Выберите новое время в таблице'); break;
      case 'move-off': Z.move = null; render(); break;
      case 'cancel': askCancel(t.getAttribute('data-ev'), d, m); break;
      case 'do-cancel': doCancel(t.getAttribute('data-ev'), d); break;
      case 'do-book': e.preventDefault(); doBook(d, m); break;
      case 'do-move': doMove(d, m); break;
      case 'close': close(); break;
      case 'close-reload': close(); load(); break;
      case 'copy-link': copyLink(); break;
    }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var b = e.target.querySelector('[data-a="do-book"]');
    if (b) doBook(b.getAttribute('data-d'), +b.getAttribute('data-m'));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // живая таблица: пока страница открыта — сверяемся раз в 20 с и при возвращении на вкладку
  setInterval(function () { if (!document.hidden && !sh) load(true); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !sh) load(true); });

  render();
  load();
})();
