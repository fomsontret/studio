'use strict';
/* =========================================================
   POM Studio — предпросмотр правой панели, листов и чата
   Отдельный модуль: не знает о площадке, работает на ctx.
   ========================================================= */
window.POM_EDITOR = window.POM_EDITOR || {};

(function () {
  var el = POM_EDITOR.el;

  var ctx = null;
  var modal = null;
  var lastFocus = null;
  var previewViewId = null;

  var options = {
    width: 430,
    zoom: 100,
    role: 'player',
    sample: false
  };

  var chat = {
    draft: '',
    log: [
      { author: 'Мастер', text: 'Добро пожаловать за стол.' },
      { author: 'Игрок', text: 'Готов к игре.' },
      { author: 'Мастер', text: 'Это предпросмотр правой панели.' }
    ]
  };

  function init(context) {
    ctx = context;
  }

  function selectViewInEditor(id) {
    if (ctx && ctx.selectView) ctx.selectView(id);
  }

  /* ================== Панель инструментов ================== */

  function chip(text, active, onClick, title) {
    var btn = el('button', 'pv-chip' + (active ? ' active' : ''), text);
    btn.type = 'button';
    btn.title = title || text;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.addEventListener('click', onClick);
    return btn;
  }

  function toolbarGroup(label) {
    var group = el('div', 'pv-toolbar-group');
    group.appendChild(el('span', 'pv-toolbar-label', label));
    return group;
  }

  function renderToolbar() {
    var bar = el('div', 'pv-toolbar');

    var widths = toolbarGroup('Ширина');
    [
      [320, 'Узкая'],
      [384, 'Панель площадки'],
      [430, 'Широкая']
    ].forEach(function (item) {
      widths.appendChild(chip(item[1], options.width === item[0], function () {
        options.width = item[0];
        renderModal();
      }, item[0] + ' px'));
    });
    bar.appendChild(widths);

    var zoom = toolbarGroup('Масштаб');
    [80, 100, 125, 150].forEach(function (value) {
      zoom.appendChild(chip(value + '%', options.zoom === value, function () {
        options.zoom = value;
        renderModal();
      }));
    });
    bar.appendChild(zoom);

    var roles = toolbarGroup('Режим');
    [
      ['player', 'Игрок'],
      ['gm', 'Мастер']
    ].forEach(function (item) {
      roles.appendChild(chip(item[1], options.role === item[0], function () {
        options.role = item[0];
        renderModal();
      }, item[0] === 'gm' ? 'Показать компоненты только для мастера' : 'Обычный вид игрока'));
    });
    bar.appendChild(roles);

    var data = toolbarGroup('Данные');
    data.appendChild(chip('Пример', options.sample, function () {
      options.sample = !options.sample;
      renderModal();
    }, 'Заполнить поля тестовыми значениями'));
    bar.appendChild(data);

    return bar;
  }

  /* ================== Чат ================== */

  function chatLine(author, text) {
    var row = el('div', 'pv-chat-line');
    row.appendChild(el('span', 'pv-chat-author', author));
    row.appendChild(el('span', 'pv-chat-text', text));
    return row;
  }

  function renderChatPreview(body) {
    body.className = 'pb-screen-body pv-chat';

    var log = el('div', 'pv-chat-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    chat.log.forEach(function (line) {
      log.appendChild(chatLine(line.author, line.text));
    });
    body.appendChild(log);

    var form = el('form', 'pv-chat-form');
    var input = document.createElement('input');
    input.className = 'pv-chat-input';
    input.placeholder = 'Сообщение…';
    input.value = chat.draft;
    input.setAttribute('aria-label', 'Сообщение в чат');
    input.addEventListener('input', function () {
      chat.draft = input.value;
    });
    var send = el('button', 'pv-chat-send', '→');
    send.type = 'submit';
    send.title = 'Отправить';
    form.appendChild(input);
    form.appendChild(send);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = chat.draft.trim();
      if (!text) return;
      chat.log.push({ author: 'Вы', text: text });
      chat.draft = '';
      renderModal();
    });
    body.appendChild(form);

    body.appendChild(el('div', 'pv-chat-note',
      'Черновик и история сохраняются при переключении вкладок. Чат принадлежит движку.'));
    log.scrollTop = log.scrollHeight;
  }

  /* ================== Компоненты ================== */

  function sampleValue(item) {
    if (item.value !== undefined && item.value !== null && item.value !== '') return item.value;
    if (item.type === 'number') return 10;
    if (item.type === 'checkbox') return true;
    if (item.type === 'select') return (item.options || [])[0] || '';
    if (item.type === 'textarea') return 'Пример текста для проверки переноса строк.';
    return item.placeholder || 'Пример значения';
  }

  function fieldWrap(item, control) {
    var label = el('label', 'pv-field');
    if (item.label) label.appendChild(el('span', 'pv-field-label', item.label));
    label.appendChild(control);
    return label;
  }

  function renderPreviewItem(item) {
    var type = item.type || 'text';
    if (item.gmOnly) item = Object.assign({}, item, { gmOnly: true });

    if (type === 'label') return el('div', 'pv-label', item.text || 'Текст');

    if (type === 'button') {
      var btn = el('button', 'pv-btn' + (item.style === 'accent' ? ' accent' : ''), item.text || 'Кнопка');
      btn.type = 'button';
      if (item.gmOnly) btn.title = 'Только для мастера';
      return btn;
    }

    if (type === 'divider') return el('div', 'pv-divider');

    if (type === 'spacer') return el('div', 'pv-spacer');

    if (type === 'image') {
      var img = el('div', 'pv-image');
      if (item.src) {
        var picture = document.createElement('img');
        picture.className = 'pv-image-picture';
        picture.src = item.src;
        picture.alt = item.alt || item.label || 'Изображение';
        picture.addEventListener('error', function () {
          picture.remove();
          img.appendChild(el('span', 'pv-image-label', item.label || 'Портрет'));
          img.appendChild(el('span', 'pv-image-hint', 'картинка не найдена'));
        });
        img.appendChild(picture);
      } else {
        img.appendChild(el('span', 'pv-image-label', item.label || 'Портрет'));
        img.appendChild(el('span', 'pv-image-hint', 'поле для картинки'));
      }
      return img;
    }

    if (type === 'library') {
      var library = ctx.findLibrary(item.libraryId);
      var libraryWrap = el('div', 'pv-library');
      libraryWrap.appendChild(el('span', 'pv-field-label', item.label || 'Предмет'));
      var librarySelect = document.createElement('select');
      librarySelect.className = 'pv-input';
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = library ? '— выбранный предмет —' : 'Библиотека не выбрана';
      librarySelect.appendChild(placeholder);
      if (library) {
        (library.items || []).forEach(function (libraryItem) {
          var option = document.createElement('option');
          option.value = libraryItem.id;
          option.textContent = libraryItem.name || 'Без названия';
          librarySelect.appendChild(option);
        });
      }
      var selected = item.itemId || '';
      if (!selected && options.sample && library && library.items && library.items.length) {
        selected = library.items[0].id;
      }
      librarySelect.value = selected;
      libraryWrap.appendChild(librarySelect);
      var summary = ctx.libraryItemSummary(library, selected);
      if (summary) libraryWrap.appendChild(el('div', 'pv-library-summary', summary));
      return libraryWrap;
    }

    if (type === 'checkbox') {
      var check = el('label', 'pv-check');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = options.sample ? true : !!item.value;
      check.appendChild(cb);
      check.appendChild(el('span', null, item.text || 'Флажок'));
      return check;
    }

    var value = options.sample ? sampleValue(item) : item.value;

    if (type === 'textarea') {
      return fieldWrap(item, POM_EDITOR.textarea(value === undefined ? '' : value, {
        rows: item.rows || 3,
        placeholder: item.placeholder || ''
      }));
    }

    if (type === 'select') {
      var select = document.createElement('select');
      select.className = 'pv-input';
      (item.options || []).forEach(function (option) {
        var opt = document.createElement('option');
        opt.textContent = option;
        select.appendChild(opt);
      });
      if (options.sample && select.options.length) select.selectedIndex = 0;
      return fieldWrap(item, select);
    }

    var input = document.createElement('input');
    input.className = 'pv-input';
    input.type = type === 'number' ? 'number' : 'text';
    input.placeholder = item.placeholder || '';
    if (value !== undefined && value !== null) input.value = value;
    return fieldWrap(item, input);
  }

  function visibleItems(items) {
    return (items || []).filter(function (item) {
      if (!item || item.hidden) return false;
      if (options.role === 'player' && item.gmOnly) return false;
      return true;
    });
  }

  function renderViewPreview(body, view, hintText) {
    body.className = 'pb-screen-body pv-view';

    if (!view.sections || !view.sections.length) {
      var empty = el('div', 'pv-empty');
      empty.appendChild(el('div', 'pv-empty-ico', '▢'));
      empty.appendChild(el('div', 'pv-empty-title', 'Пустая вкладка'));
      empty.appendChild(el('div', 'pv-empty-text',
        'Добавьте секции и компоненты на холсте — здесь появится результат.'));
      body.appendChild(empty);
      return;
    }

    var rendered = 0;
    view.sections.forEach(function (section) {
      var items = visibleItems(section.items);
      if (!items.length) return;
      var box = el('section', 'pv-section');
      if (section.title) box.appendChild(el('div', 'pv-section-title', section.title));
      var inner = el('div', 'pv-section-body pv-grid');
      items.forEach(function (item) {
        var cell = el('div', 'pv-cell');
        var w = Math.max(1, Math.min(item.w || 6, 12 - (item.x || 1) + 1));
        cell.style.gridColumn = (item.x || 1) + ' / span ' + w;
        cell.style.gridRow = (item.y || 1) + ' / span ' + Math.max(1, item.h || 1);
        cell.style.order = String((item.y || 1) * 100 + (item.x || 1));
        if (item.gmOnly) cell.classList.add('pv-cell-gm');
        cell.appendChild(renderPreviewItem(item));
        inner.appendChild(cell);
        rendered++;
      });
      if (!inner.children.length) return;
      box.appendChild(inner);
      body.appendChild(box);
    });

    if (!rendered) {
      var blank = el('div', 'pv-empty');
      blank.appendChild(el('div', 'pv-empty-ico', '◌'));
      blank.appendChild(el('div', 'pv-empty-title', 'Нет видимых компонентов'));
      blank.appendChild(el('div', 'pv-empty-text',
        options.role === 'player'
          ? 'Все компоненты скрыты или доступны только мастеру.'
          : 'Все компоненты скрыты.'));
      body.appendChild(blank);
      return;
    }

    if (hintText !== false) {
      body.appendChild(el('div', 'pv-view-hint',
        hintText || 'Так панель увидит ' + (options.role === 'gm' ? 'мастер' : 'игрок') +
        '. Сетка из 12 колонок, на узком экране — одна колонка.'));
    }
  }

  /* ================== Устройство панели ================== */

  function railButton(icon, title, active, viewId, onClick) {
    var btn = el('button', 'pb-rail-btn' + (active ? ' active' : ''));
    btn.type = 'button';
    btn.dataset.viewId = viewId;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.setAttribute('role', 'tab');
    btn.tabIndex = active ? 0 : -1;
    btn.appendChild(el('span', 'pb-rail-icon', icon));
    btn.appendChild(el('span', 'pb-rail-text', title));
    btn.addEventListener('click', onClick);
    btn.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' &&
          e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var list = Array.prototype.slice.call(btn.parentNode.querySelectorAll('.pb-rail-btn'));
      var index = list.indexOf(btn);
      var delta = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
      var next = list[(index + delta + list.length) % list.length];
      if (next) next.focus();
    });
    return btn;
  }

  function buildDevice(forModal) {
    var state = ctx.getState();
    var device = el('div', 'pb-device' + (forModal ? ' pb-device-modal' : ''));
    if (forModal) {
      device.style.width = options.width + 'px';
      device.style.zoom = options.zoom / 100;
    }
    var views = state.project.panel.views;
    var currentId = forModal ? previewViewId : state.activeViewId;

    function switchView(id) {
      if (forModal) {
        previewViewId = id;
        renderModal();
      } else {
        selectViewInEditor(id);
      }
    }

    if (views.length) {
      var rail = el('div', 'pb-rail');
      rail.setAttribute('role', 'tablist');
      rail.setAttribute('aria-label', 'Вкладки правой панели');
      rail.appendChild(railButton('💬', 'Чат', currentId === null, 'chat', function () {
        switchView(null);
      }));
      views.forEach(function (view) {
        rail.appendChild(railButton(view.icon, view.title, currentId === view.id, view.id, function () {
          switchView(view.id);
        }));
      });
      device.appendChild(rail);
    }

    var screen = el('div', 'pb-screen');
    var view = currentId ? ctx.findView(currentId) : null;
    var head = el('div', 'pb-screen-head');
    head.appendChild(el('span', 'pb-screen-icon', view ? view.icon : '💬'));
    head.appendChild(el('span', 'pb-screen-title', view ? view.title : 'Чат стола'));
    head.appendChild(el('span', 'pb-screen-badge', view ? 'модуль' : 'движок'));

    var body = el('div', 'pb-screen-body');
    if (view) renderViewPreview(body, view);
    else renderChatPreview(body);

    screen.appendChild(head);
    screen.appendChild(body);
    device.appendChild(screen);
    return device;
  }

  /* ================== Модальное окно ================== */

  function open() {
    if (modal) return;
    lastFocus = document.activeElement;
    var active = ctx.getState().activeViewId;
    previewViewId = active && ctx.findView(active) ? active : null;

    var root = el('div', 'ed-modal');
    var backdrop = el('div', 'ed-modal-backdrop');
    var card = el('div', 'ed-modal-card preview-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'pv-modal-title');

    var head = el('div', 'ed-modal-head');
    var title = el('div', 'ed-modal-title', 'Предпросмотр правой панели');
    title.id = 'pv-modal-title';
    head.appendChild(title);
    var close = POM_EDITOR.iconButton('✕', 'Закрыть предпросмотр');
    close.setAttribute('aria-label', 'Закрыть предпросмотр');
    close.addEventListener('click', closeModal);
    head.appendChild(close);
    card.appendChild(head);

    var body = el('div', 'ed-modal-body preview-body');
    card.appendChild(body);

    modal = { root: root, card: card, body: body };
    root.appendChild(backdrop);
    root.appendChild(card);
    backdrop.addEventListener('click', closeModal);
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);
    renderModal();
    close.focus();
  }

  function renderModal() {
    if (!modal) return;
    var scroll = modal.body.scrollTop;
    modal.body.innerHTML = '';
    modal.body.appendChild(renderToolbar());
    var stage = el('div', 'pv-stage');
    stage.appendChild(buildDevice(true));
    modal.body.appendChild(stage);
    modal.body.appendChild(el('div', 'ed-hint',
      'Предпросмотр интерактивный: вкладки, поля и чат работают локально. Данные не сохраняются.'));
    modal.body.scrollTop = scroll;
  }

  function refresh() {
    if (!modal) return;
    if (previewViewId && !ctx.findView(previewViewId)) previewViewId = null;
    renderModal();
  }

  function onKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  function closeModal() {
    if (!modal) return;
    modal.root.remove();
    modal = null;
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  POM_EDITOR.preview = {
    init: init,
    open: open,
    close: closeModal,
    refresh: refresh,
    buildDevice: buildDevice,
    renderViewPreview: renderViewPreview,
    renderPreviewItem: renderPreviewItem,
    renderChatPreview: renderChatPreview,
    getOptions: function () {
      return {
        width: options.width,
        zoom: options.zoom,
        role: options.role,
        sample: options.sample
      };
    }
  };
})();
