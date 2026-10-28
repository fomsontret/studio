'use strict';
/* =========================================================
   Редактор систем — каркас приложения
   Навигация, демо-проект, конструктор вкладок правой панели.
   ========================================================= */
(function () {
  var el = POM_EDITOR.el;
  var $ = POM_EDITOR.$;

  var SECTIONS = [
    { id: 'overview', title: 'Обзор', icon: '◈', sub: 'Состояние проекта и следующие шаги' },
    { id: 'panel', title: 'Правая панель', icon: '▥', sub: 'Вкладки, рейл и содержимое игровой панели' },
    { id: 'sheets', title: 'Листы персонажа', icon: '▤', sub: 'Шаблоны листов и поля персонажей' },
    { id: 'libraries', title: 'Библиотеки', icon: '▦', sub: 'Списки предметов и их характеристики' },
    { id: 'formulas', title: 'Логика', icon: '⚡', sub: 'Макросы кнопок, полей и текстовых блоков' },
    { id: 'publish', title: 'Публикация', icon: '⇪', sub: 'Проверка и установка модуля в площадку' }
  ];

  var ICON_PRESETS = ['▤', '▦', '✎', '⚔', '🎒', '📖', '🧪', '🛡', '◈'];

  var LOGIC_STEPS = [
    { type: 'ask', title: 'Спросить', icon: '?', hint: 'Спросить число или текст во всплывающем окне' },
    { type: 'roll', title: 'Бросок', icon: '🎲', hint: 'Бросить формулу и отправить в чат' },
    { type: 'set', title: 'Присвоить', icon: '=', hint: 'Присвоить значение числовому полю' },
    { type: 'add', title: 'Изменить число', icon: '±', hint: 'Прибавить или вычесть значение' },
    { type: 'setText', title: 'Изменить текст', icon: 'T', hint: 'Заменить текст заголовка или поля' },
    { type: 'if', title: 'Если', icon: '◆', hint: 'Условие с ветками «тогда» и «иначе»' },
    { type: 'log', title: 'В чат', icon: '💬', hint: 'Сообщение в чат' }
  ];

  var state = {
    section: 'overview',
    project: POM_EDITOR.demoProject(),
    activeViewId: 'view-character',
    selection: null,
    selectedItems: [],
    clipboard: null,
    historyTag: null,
    historyAt: 0,
    historyBytes: 0,
    inspectorOpen: false,
    activeLibraryId: null,
    libraryMode: 'items',
    librarySearch: '',
    libSelection: null,
    activeSheetId: null,
    activeMacroId: null,
    activeStepId: null,
    logicFocus: null,
    projectDirHandle: null,
    dirty: false,
    history: [],
    future: []
  };

  /* =======================================================
     Запуск и шапка
     ======================================================= */

  function init() {
    bindTopbar();
    POM_EDITOR.preview.init({
      getState: function () { return state; },
      findView: findView,
      findLibrary: findLibrary,
      libraryItemSummary: libraryItemSummary,
      selectView: selectView
    });
    updateProjectBar();
    renderNav();
    render();
  }

  function bindTopbar() {
    $('#ed-btn-new').addEventListener('click', function () {
      if (state.dirty) {
        POM_EDITOR.confirmAction({
          title: 'Новый проект',
          text: 'Создать новый проект? Несохранённые изменения будут потеряны.',
          confirmText: 'Создать',
          danger: true,
          onConfirm: createBlankProject
        });
        return;
      }
      createBlankProject();
    });

    $('#ed-btn-open').addEventListener('click', openProjectFolder);
    $('#ed-btn-save').addEventListener('click', saveProject);
    $('#ed-btn-export').addEventListener('click', exportProject);
    $('#ed-btn-preview').addEventListener('click', function () { POM_EDITOR.preview.open(); });

    var inspectorToggle = $('#ed-btn-inspector');
    if (inspectorToggle) inspectorToggle.addEventListener('click', toggleInspector);
    var inspectorClose = $('#ed-inspector-close');
    if (inspectorClose) inspectorClose.addEventListener('click', closeInspector);

    document.addEventListener('keydown', function (e) {
      /* Модальное окно само обрабатывает клавиши и не пускает их на холст. */
      if (document.querySelector('.ed-modal')) return;

      var ctrl = e.ctrlKey || e.metaKey;
      var key = (e.key || '').toLowerCase();
      var tag = e.target && e.target.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (ctrl && key === 's') {
        e.preventDefault();
        saveProject();
        return;
      }

      if ((state.section === 'panel' || state.section === 'libraries' || state.section === 'sheets' || state.section === 'formulas') && ctrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if ((state.section === 'panel' || state.section === 'libraries' || state.section === 'sheets' || state.section === 'formulas') && ctrl && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (!typing && ctrl && key === 'a' && (state.section === 'panel' || state.section === 'sheets')) {
        var allView = activeViewOrNull();
        if (!allView) return;
        e.preventDefault();
        state.selectedItems = [];
        allView.sections.forEach(function (section) {
          section.items.forEach(function (item) {
            if (!item.hidden) state.selectedItems.push(item.id);
          });
        });
        state.selection = state.selectedItems.length
          ? { kind: 'item', id: state.selectedItems[state.selectedItems.length - 1] }
          : null;
        refreshSelectionUI();
        return;
      }

      if (!typing && ctrl && (key === 'c' || key === 'x') && state.selectedItems.length) {
        e.preventDefault();
        copySelection();
        if (key === 'x') deleteSelectedItems();
        return;
      }

      if (!typing && ctrl && key === 'v' && state.clipboard) {
        e.preventDefault();
        pasteClipboard();
        return;
      }

      if (!typing && ctrl && key === 'd' && state.selectedItems.length) {
        e.preventDefault();
        duplicateSelectedItems();
        return;
      }

      if (!typing && e.key === 'Escape') {
        if (state.inspectorOpen && isNarrowScreen()) {
          closeInspector();
          return;
        }
        if (state.libSelection) {
          state.libSelection = null;
          render();
          return;
        }
        if (state.selection) {
          state.selection = null;
          state.selectedItems = [];
          refreshSelectionUI();
          return;
        }
      }

      if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && (state.selectedItems.length || state.selection)) {
        var view = activeViewOrNull();
        if (!view) return;
        if (state.selection && state.selection.kind === 'section') {
          var section = findSectionById(view, state.selection.id);
          if (section) {
            e.preventDefault();
            deleteSection(view, section);
          }
          return;
        }
        if (state.selectedItems.length) {
          e.preventDefault();
          deleteSelectedItems();
        }
        return;
      }

      if (!typing && state.selectedItems.length && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
        e.preventDefault();
        nudgeSelection(e.key, e.shiftKey ? 5 : 1);
      }
    });
  }

  function isNarrowScreen() {
    return window.matchMedia && window.matchMedia('(max-width: 940px)').matches;
  }

  function toggleInspector() {
    state.inspectorOpen = !state.inspectorOpen;
    var app = document.querySelector('.ed-app');
    if (app) app.classList.toggle('inspector-open', state.inspectorOpen);
    var toggle = $('#ed-btn-inspector');
    if (toggle) toggle.setAttribute('aria-pressed', state.inspectorOpen ? 'true' : 'false');
  }

  function closeInspector() {
    state.inspectorOpen = false;
    var app = document.querySelector('.ed-app');
    if (app) app.classList.remove('inspector-open');
    var toggle = $('#ed-btn-inspector');
    if (toggle) toggle.setAttribute('aria-pressed', 'false');
  }

  function createBlankProject() {
    state.project = POM_EDITOR.blankProject();
    state.activeViewId = null;
    state.section = 'overview';
    state.selection = null;
    state.selectedItems = [];
    state.activeLibraryId = null;
    state.libraryMode = 'items';
    state.librarySearch = '';
    state.libSelection = null;
    state.activeSheetId = null;
    state.activeMacroId = null;
    state.activeStepId = null;
    state.logicFocus = null;
    state.projectDirHandle = null;
    state.dirty = true;
    state.history = [];
    state.historyBytes = 0;
    state.historyTag = null;
    state.future = [];
    lastRenderedSection = null;
    updateProjectBar();
    renderNav();
    render();
    POM_EDITOR.toast('Создан пустой проект');
  }

  /* =======================================================
     Сохранение, открытие и выгрузка модуля
     ======================================================= */

  function isAbortError(err) {
    return !!(err && err.name === 'AbortError');
  }

  function errorMessage(err) {
    return err && err.message ? err.message : String(err || 'неизвестная ошибка');
  }

  function readFileText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Не удалось прочитать файл')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  async function writeTextFile(dirHandle, name, text) {
    var fileHandle = await dirHandle.getFileHandle(name, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  function buildProjectReadme(module) {
    return [
      '# ' + (module.title || 'Модуль'),
      '',
      'Модуль POM Studio.',
      '',
      '- `system.json` — данные модуля: панель, листы, библиотеки и логика.',
      '',
      'Идентификатор: `' + (module.id || '—') + '`',
      'Версия: `' + (module.version || '0.1.0') + '`',
      ''
    ].join('\n');
  }

  async function writeProjectToDirectory(dirHandle) {
    var module = POM_EDITOR.serializeProject(state.project);
    await writeTextFile(dirHandle, 'system.json', JSON.stringify(module, null, 2) + '\n');
    await writeTextFile(dirHandle, 'README.md', buildProjectReadme(module));
  }

  function withValidation(action, actionLabel) {
    var report = POM_EDITOR.validateProject(state.project);
    if (report.errors.length) {
      var preview = POM_EDITOR.formatIssues({ errors: report.errors, warnings: [] }, 3);
      POM_EDITOR.confirmAction({
        title: 'В модуле есть ошибки',
        text: 'Ошибок: ' + report.errors.length + '. ' + actionLabel + ' всё равно?\n' +
          preview.join('\n'),
        confirmText: actionLabel,
        danger: true,
        onConfirm: action
      });
      return;
    }
    if (report.warnings.length) {
      POM_EDITOR.toast('Предупреждений: ' + report.warnings.length + ' — можно продолжать');
    }
    action();
  }

  function saveProject() {
    withValidation(saveProjectNow, 'Сохранить');
  }

  async function saveProjectNow() {
    if (!window.showDirectoryPicker) {
      downloadProjectJson();
      return;
    }
    try {
      var dirHandle = state.projectDirHandle;
      if (!dirHandle) {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      }
      await writeProjectToDirectory(dirHandle);
      state.projectDirHandle = dirHandle;
      state.project.path = dirHandle.name;
      state.dirty = false;
      updateProjectBar();
      updateStatus();
      POM_EDITOR.toast('Сохранено в папку «' + dirHandle.name + '»');
    } catch (err) {
      if (isAbortError(err)) return;
      POM_EDITOR.toast('Не удалось сохранить: ' + errorMessage(err), 'error');
    }
  }

  function exportProject() {
    withValidation(exportProjectNow, 'Выгрузить');
  }

  async function exportProjectNow() {
    if (!window.showDirectoryPicker) {
      downloadProjectJson();
      return;
    }
    try {
      var dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await writeProjectToDirectory(dirHandle);
      state.projectDirHandle = dirHandle;
      state.project.path = dirHandle.name;
      state.dirty = false;
      updateProjectBar();
      updateStatus();
      POM_EDITOR.toast('Модуль выгружен в папку «' + dirHandle.name + '»');
    } catch (err) {
      if (isAbortError(err)) return;
      POM_EDITOR.toast('Не удалось выгрузить: ' + errorMessage(err), 'error');
    }
  }

  async function openProjectFolder() {
    if (!window.showDirectoryPicker) {
      openProjectFileFallback();
      return;
    }
    try {
      var dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      var fileHandle = await dirHandle.getFileHandle('system.json');
      var file = await fileHandle.getFile();
      var text = await readFileText(file);
      var project = POM_EDITOR.normalizeProject(JSON.parse(text));
      setProjectData(project, dirHandle, dirHandle.name);
      POM_EDITOR.toast('Проект открыт: ' + dirHandle.name);
    } catch (err) {
      if (isAbortError(err)) return;
      if (err && err.name === 'NotFoundError') {
        POM_EDITOR.toast('В папке нет system.json', 'error');
        return;
      }
      POM_EDITOR.toast('Не удалось открыть папку: ' + errorMessage(err), 'error');
    }
  }

  function openProjectFileFallback() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      readFileText(file).then(function (text) {
        try {
          var project = POM_EDITOR.normalizeProject(JSON.parse(text));
          setProjectData(project, null, file.name);
          POM_EDITOR.toast('Проект открыт из файла');
        } catch (err) {
          POM_EDITOR.toast('Не удалось открыть файл: ' + errorMessage(err), 'error');
        }
      }).catch(function (err) {
        POM_EDITOR.toast('Не удалось прочитать файл: ' + errorMessage(err), 'error');
      });
    });
    input.click();
  }

  function setProjectData(project, dirHandle, source) {
    state.project = project;
    state.projectDirHandle = dirHandle || null;
    state.project.path = dirHandle ? dirHandle.name : (source || '');
    state.section = 'overview';
    state.activeViewId = project.panel.views.length ? project.panel.views[0].id : null;
    state.selection = null;
    state.selectedItems = [];
    state.clipboard = null;
    state.activeLibraryId = null;
    state.libraryMode = 'items';
    state.librarySearch = '';
    state.libSelection = null;
    state.activeSheetId = null;
    state.activeMacroId = null;
    state.activeStepId = null;
    state.logicFocus = null;
    state.dirty = false;
    state.history = [];
    state.historyBytes = 0;
    state.historyTag = null;
    state.future = [];
    lastRenderedSection = null;
    updateProjectBar();
    renderNav();
    render();
  }

  function downloadProjectJson() {
    var module = POM_EDITOR.serializeProject(state.project);
    var blob = new Blob([JSON.stringify(module, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8'
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'system.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    state.projectDirHandle = null;
    state.project.path = 'system.json';
    state.dirty = false;
    updateProjectBar();
    updateStatus();
    POM_EDITOR.toast('Браузер не умеет писать в папку — скачан system.json');
  }

  function updateProjectBar() {
    $('#ed-project-title').textContent = state.project.title || 'Без названия';
    $('#ed-project-path').textContent = state.project.path || 'папка проекта не выбрана';
    $('#ed-dirty').classList.toggle('hidden', !state.dirty);
    document.title = (state.project.title || 'Редактор систем') + ' — Редактор систем';
  }

  function markDirty() {
    state.dirty = true;
    updateProjectBar();
    updateStatus();
  }

  function updateStatus() {
    var views = state.project.panel.views.length;
    if (state.dirty) {
      $('#ed-status-left').textContent = 'Есть несохранённые изменения';
    } else if (state.projectDirHandle) {
      $('#ed-status-left').textContent = 'Сохранено в папку «' +
        (state.project.path || state.projectDirHandle.name) + '»';
    } else if (state.project.path) {
      $('#ed-status-left').textContent = 'Сохранено в файл «' + state.project.path + '»';
    } else {
      $('#ed-status-left').textContent = 'Проект не сохранён';
    }
    $('#ed-status-right').textContent = 'views: ' + views + ' · секций: ' + totalSections() +
      ' · компонентов: ' + totalItems() + ' · формат v1';
  }

  function totalSections() {
    var count = 0;
    state.project.panel.views.forEach(function (view) {
      count += (view.sections || []).length;
    });
    return count;
  }

  function totalItems() {
    var count = 0;
    state.project.panel.views.forEach(function (view) {
      (view.sections || []).forEach(function (section) {
        count += (section.items || []).length;
      });
    });
    return count;
  }

  /* =======================================================
     История: снимок проекта до изменения
     ======================================================= */

  function pushHistory(tag) {
    var snapshot = JSON.stringify(state.project);
    var now = Date.now();
    if (tag && state.historyTag === tag && now - state.historyAt < 900 && state.history.length) {
      state.historyAt = now;
      state.future = [];
      return;
    }
    state.history.push(snapshot);
    state.historyBytes += snapshot.length;
    while (state.history.length > 80 || state.historyBytes > 4 * 1024 * 1024) {
      var removed = state.history.shift();
      state.historyBytes -= removed.length;
      if (state.historyBytes < 0) state.historyBytes = 0;
    }
    state.historyTag = tag || null;
    state.historyAt = now;
    state.future = [];
  }

  function undo() {
    if (!state.history.length) {
      POM_EDITOR.toast('Отменять нечего');
      return;
    }
    var current = JSON.stringify(state.project);
    state.future.push(current);
    state.historyBytes -= current.length;
    if (state.historyBytes < 0) state.historyBytes = 0;
    state.project = JSON.parse(state.history.pop());
    state.historyTag = null;
    afterHistoryJump('Изменение отменено');
  }

  function redo() {
    if (!state.future.length) {
      POM_EDITOR.toast('Повторять нечего');
      return;
    }
    var current = JSON.stringify(state.project);
    state.history.push(current);
    state.historyBytes += current.length;
    state.project = JSON.parse(state.future.pop());
    state.historyTag = null;
    afterHistoryJump('Изменение повторено');
  }

  function afterHistoryJump(message) {
    state.dirty = true;
    validateSelection();
    renderNav();
    render();
    POM_EDITOR.toast(message);
  }

  function validateSelection() {
    if (state.activeViewId && !findView(state.activeViewId)) state.activeViewId = null;
    var view = state.activeViewId ? findView(state.activeViewId) : null;
    if (!view) {
      state.selection = null;
      state.selectedItems = [];
      return;
    }
    state.selectedItems = (state.selectedItems || []).filter(function (id) {
      return !!findItem(view, id);
    });
    if (!state.selection) {
      if (!state.selectedItems.length) return;
      state.selection = { kind: 'item', id: state.selectedItems[state.selectedItems.length - 1] };
      return;
    }
    if (state.selection.kind === 'section') {
      if (!findSectionById(view, state.selection.id)) state.selection = null;
      if (state.selection) state.selectedItems = [];
    } else {
      var hit = findItem(view, state.selection.id);
      if (!hit) {
        state.selection = state.selectedItems.length
          ? { kind: 'item', id: state.selectedItems[state.selectedItems.length - 1] }
          : null;
      }
    }
  }

  /* =======================================================
     Навигация
     ======================================================= */

  function renderNav() {
    var root = $('#ed-nav-list');
    root.innerHTML = '';
    SECTIONS.forEach(function (section) {
      var btn = el('button', 'ed-nav-item' + (state.section === section.id ? ' active' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', 'ed-nav-ico', section.icon));
      btn.appendChild(el('span', 'ed-nav-text', section.title));
      var count = sectionCount(section.id);
      if (count !== null) btn.appendChild(el('span', 'ed-nav-count', String(count)));
      btn.addEventListener('click', function () {
        state.section = section.id;
        renderNav();
        render();
      });
      root.appendChild(btn);
    });
  }

  function sectionCount(id) {
    if (id === 'panel') return state.project.panel.views.length;
    if (id === 'sheets') return state.project.sheets.length;
    if (id === 'libraries') return state.project.libraries.length;
    if (id === 'formulas') return state.project.macros.length;
    return null;
  }

  function findSection(id) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].id === id) return SECTIONS[i];
    }
    return SECTIONS[0];
  }

  function goSection(id) {
    state.section = id;
    renderNav();
    render();
  }

  /* =======================================================
     Общая отрисовка
     ======================================================= */

  var lastRenderedSection = null;

  function render() {
    var section = findSection(state.section);
    if (state.activeViewId && !findView(state.activeViewId)) state.activeViewId = null;
    validateSelection();
    validateLibrarySelection();
    var sectionChanged = lastRenderedSection !== section.id;
    lastRenderedSection = section.id;

    $('#ed-section-title').textContent = section.title;
    $('#ed-section-sub').textContent = section.sub;

    var actions = $('#ed-section-actions');
    actions.innerHTML = '';
    if (section.id === 'overview') {
      var open = POM_EDITOR.button('Открыть папку', { title: 'Открыть папку проекта' });
      open.addEventListener('click', openProjectFolder);
      actions.appendChild(open);
    } else if (section.id === 'panel') {
      var add = POM_EDITOR.button('+ Вкладка', { className: 'ed-btn-accent' });
      add.addEventListener('click', addView);
      actions.appendChild(add);
      var preview = POM_EDITOR.button('Предпросмотр');
      preview.addEventListener('click', function () { POM_EDITOR.preview.open(); });
      actions.appendChild(preview);
    } else if (section.id === 'libraries') {
      var addLibraryBtn = POM_EDITOR.button('+ Библиотека', { className: 'ed-btn-accent' });
      addLibraryBtn.addEventListener('click', addLibrary);
      actions.appendChild(addLibraryBtn);
    } else if (section.id === 'sheets') {
      var addSheetBtn = POM_EDITOR.button('+ Лист', { className: 'ed-btn-accent' });
      addSheetBtn.addEventListener('click', addSheet);
      actions.appendChild(addSheetBtn);
    } else if (section.id === 'formulas') {
      var checkLogicBtn = POM_EDITOR.button('Проверить');
      checkLogicBtn.addEventListener('click', checkLogic);
      actions.appendChild(checkLogicBtn);
    } else {
      var later = POM_EDITOR.button('Следующий этап', { title: 'Раздел в разработке' });
      later.addEventListener('click', function () {
        POM_EDITOR.toast('Этот раздел появится на следующем этапе');
      });
      actions.appendChild(later);
    }

    var workspace = $('#ed-workspace');
    workspace.innerHTML = '';
    if (section.id === 'overview') renderOverview(workspace);
    else if (section.id === 'panel') renderPanel(workspace);
    else if (section.id === 'sheets') renderSheets(workspace);
    else if (section.id === 'libraries') renderLibraries(workspace);
    else if (section.id === 'formulas') renderLogic(workspace);
    else if (section.id === 'publish') renderPublish(workspace);
    if (sectionChanged) workspace.scrollTop = 0;

    renderInspector();
    updateProjectBar();
    updateStatus();
    if (POM_EDITOR.preview) POM_EDITOR.preview.refresh();
  }

  /* =======================================================
     Обзор
     ======================================================= */

  function renderOverview(workspace) {
    var grid = el('div', 'ov-grid');

    var meta = el('section', 'ed-card');
    meta.appendChild(el('h2', 'ed-card-title', 'Проект'));
    meta.appendChild(el('p', 'ed-card-sub',
      'Метаданные модуля. Сохраняются в system.json вместе с панелью, листами, библиотеками и логикой.'));

    var title = POM_EDITOR.input(state.project.title, { placeholder: 'Название системы' });
    title.addEventListener('focus', pushHistory);
    title.addEventListener('input', function () {
      state.project.title = title.value;
      markDirty();
      updateProjectBar();
    });
    meta.appendChild(POM_EDITOR.field('Название', title));

    var id = POM_EDITOR.input(state.project.id, { placeholder: 'my-system' });
    id.addEventListener('focus', pushHistory);
    id.addEventListener('input', function () {
      state.project.id = id.value.trim();
      markDirty();
    });
    meta.appendChild(POM_EDITOR.field('Идентификатор', id, 'Латиница, цифры и дефис. Используется в папке и адресах.'));

    var version = POM_EDITOR.input(state.project.version, { placeholder: '0.1.0' });
    version.addEventListener('focus', pushHistory);
    version.addEventListener('input', function () {
      state.project.version = version.value;
      markDirty();
    });
    meta.appendChild(POM_EDITOR.field('Версия', version));

    var description = POM_EDITOR.textarea(state.project.description, {
      rows: 3,
      placeholder: 'Коротко о системе'
    });
    description.addEventListener('focus', pushHistory);
    description.addEventListener('input', function () {
      state.project.description = description.value;
      markDirty();
    });
    meta.appendChild(POM_EDITOR.field('Описание', description));

    var next = el('section', 'ed-card');
    next.appendChild(el('h2', 'ed-card-title', 'Конструкторы'));
    next.appendChild(el('p', 'ed-card-sub', 'Пять частей модуля. Панель, листы, библиотеки и логика.'));

    var builders = el('div', 'ov-builders');
    builders.appendChild(builderCard('panel', '▥', 'Правая панель',
      state.project.panel.views.length + ' вкладок', 'рейл, чат и содержимое'));
    builders.appendChild(builderCard('sheets', '▤', 'Листы персонажа',
      state.project.sheets.length + ' листов', 'поля, секции и значения'));
    builders.appendChild(builderCard('libraries', '▦', 'Библиотеки',
      state.project.libraries.length + ' библиотек', 'предметы, заклинания, способности'));
    builders.appendChild(builderCard('formulas', '⚡', 'Логика',
      state.project.macros.length + ' макросов', 'кнопки, условия и эффекты'));
    next.appendChild(builders);
    next.appendChild(el('div', 'ed-hint', 'Карточки открывают соответствующий раздел редактора.'));

    grid.appendChild(meta);
    grid.appendChild(next);
    workspace.appendChild(grid);

    var tree = el('section', 'ed-card');
    tree.appendChild(el('h2', 'ed-card-title', 'Папка проекта'));
    tree.appendChild(el('p', 'ed-card-sub', 'Структура папки, которую пишет сохранение.'));
    var pre = el('pre', 'ed-tree');
    pre.textContent =
      (state.project.id || 'my-system') + '/\n' +
      '  system.json\n' +
      '  README.md';
    tree.appendChild(pre);
    tree.appendChild(el('div', 'ed-hint',
      'Сохранение и экспорт пишут system.json и README.md в выбранную папку.'));
    workspace.appendChild(tree);
  }

  function builderCard(sectionId, icon, title, count, sub) {
    var card = el('button', 'ov-builder');
    card.type = 'button';
    card.appendChild(el('span', 'ov-builder-ico', icon));
    var text = el('span', 'ov-builder-text');
    text.appendChild(el('span', 'ov-builder-title', title));
    text.appendChild(el('span', 'ov-builder-sub', sub));
    card.appendChild(text);
    card.appendChild(el('span', 'ov-builder-count', count));
    card.addEventListener('click', function () { goSection(sectionId); });
    return card;
  }

  /* =======================================================
     Правая панель
     ======================================================= */

  function renderPanel(workspace) {
    var layout = el('div', 'pb-layout');
    layout.appendChild(renderViewsList());
    layout.appendChild(renderPanelStage());
    workspace.appendChild(layout);
  }

  function renderViewsList() {
    var card = el('section', 'ed-card pb-views');
    var head = el('div', 'pb-views-head');
    head.appendChild(el('div', 'pb-views-title', 'Вкладки'));
    var add = POM_EDITOR.iconButton('+', 'Новая вкладка', { className: 'pb-add-icon' });
    add.addEventListener('click', addView);
    head.appendChild(add);
    card.appendChild(head);

    var list = el('div', 'pb-view-list');

    var chat = el('div', 'pb-view-row pb-chat-row' + (state.activeViewId === null ? ' active' : ''));
    chat.tabIndex = 0;
    chat.appendChild(el('span', 'pb-view-ico', '💬'));
    chat.appendChild(el('span', 'pb-view-title', 'Чат'));
    chat.appendChild(el('span', 'pb-lock', 'движок'));
    chat.addEventListener('click', function () { selectView(null); });
    chat.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectView(null); }
    });
    list.appendChild(chat);

    state.project.panel.views.forEach(function (view, index) {
      var active = state.activeViewId === view.id;
      var row = el('div', 'pb-view-row' + (active ? ' active' : ''));
      row.dataset.viewId = view.id;
      row.tabIndex = 0;
      row.appendChild(el('span', 'pb-view-ico', view.icon));
      row.appendChild(el('span', 'pb-view-title', view.title));

      var actions = el('span', 'pb-view-actions');
      var up = POM_EDITOR.iconButton('▲', 'Выше', { disabled: index === 0 });
      up.addEventListener('click', function (e) {
        e.stopPropagation();
        moveView(view, -1);
      });
      var down = POM_EDITOR.iconButton('▼', 'Ниже', { disabled: index === state.project.panel.views.length - 1 });
      down.addEventListener('click', function (e) {
        e.stopPropagation();
        moveView(view, 1);
      });
      var dup = POM_EDITOR.iconButton('⧉', 'Дублировать вкладку');
      dup.addEventListener('click', function (e) {
        e.stopPropagation();
        duplicateView(view);
      });
      var del = POM_EDITOR.iconButton('✕', 'Удалить вкладку', { className: 'danger' });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteView(view);
      });
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(dup);
      actions.appendChild(del);
      row.appendChild(actions);

      row.addEventListener('click', function () { selectView(view.id); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectView(view.id);
        }
      });
      list.appendChild(row);
    });

    card.appendChild(list);

    if (!state.project.panel.views.length) {
      card.appendChild(el('div', 'pb-list-empty', 'Своих вкладок нет — рейл скрыт, чат занимает всю панель.'));
    }

    var addBtn = POM_EDITOR.button('+ Добавить вкладку', { className: 'ed-btn-block' });
    addBtn.addEventListener('click', addView);
    card.appendChild(addBtn);
    card.appendChild(el('div', 'ed-hint', 'Чат закреплён движком. Порядок остальных вкладок задаёт автор.'));
    return card;
  }

  function renderComponentPalette(view) {
    var palette = el('div', 'pb-palette pb-palette-wide');
    palette.appendChild(el('span', 'pb-palette-label', 'Добавить:'));
    POM_EDITOR.COMPONENT_TYPES.forEach(function (meta) {
      var btn = POM_EDITOR.button(meta.icon + ' ' + meta.title, {
        className: 'ed-btn-xs',
        title: meta.hint
      });
      btn.addEventListener('click', function () { addComponent(view, meta.type); });
      palette.appendChild(btn);
    });
    return palette;
  }

  function renderPanelStage() {
    var stage = el('div', 'pb-stage');
    var view = state.activeViewId ? findView(state.activeViewId) : null;

    var toolbar = el('div', 'pb-toolbar');
    toolbar.appendChild(el('span', 'pb-toolbar-title',
      view ? 'Конструктор вкладки' : 'Чат — зона движка'));

    var tools = el('div', 'pb-tools');
    if (view) {
      var undoBtn = POM_EDITOR.iconButton('↶', 'Отменить (Ctrl+Z)');
      undoBtn.disabled = !state.history.length;
      undoBtn.addEventListener('click', undo);
      var redoBtn = POM_EDITOR.iconButton('↷', 'Повторить (Ctrl+Shift+Z)');
      redoBtn.disabled = !state.future.length;
      redoBtn.addEventListener('click', redo);
      var addSection = POM_EDITOR.button('+ Секция');
      addSection.addEventListener('click', function () { addSectionTo(view); });
      var preview = POM_EDITOR.button('Предпросмотр', { className: 'ed-btn-accent' });
      preview.addEventListener('click', function () { POM_EDITOR.preview.open(); });
      tools.appendChild(undoBtn);
      tools.appendChild(redoBtn);
      tools.appendChild(addSection);
      tools.appendChild(preview);
    } else {
      var openChat = POM_EDITOR.button('Показать чат', { className: 'ed-btn-accent' });
      openChat.addEventListener('click', function () { POM_EDITOR.preview.open(); });
      tools.appendChild(openChat);
    }
    toolbar.appendChild(tools);
    stage.appendChild(toolbar);

    if (!view) {
      stage.appendChild(POM_EDITOR.preview.buildDevice(false));
      stage.appendChild(el('div', 'pb-note',
        'Чат принадлежит движку: его нельзя переименовать, удалить или заменить. Создайте вкладку, чтобы получить рейл и конструктор.'));
      return stage;
    }

    stage.appendChild(renderComponentPalette(view));

    stage.appendChild(renderCanvas(view));

    var note = el('div', 'pb-note');
    note.appendChild(el('span', 'pb-note-ico', '◌'));
    note.appendChild(el('span', null,
      'Перетаскивайте компоненты по сетке, тяните за угол, чтобы изменить размер. Сетка — 12 колонок.'));
    stage.appendChild(note);

    return stage;
  }

  /* =======================================================
     Холст правой панели: секции и сетка 12 колонок
     ======================================================= */

  var GRID_COLS = 12;
  var CELL_GAP = 8;

  function renderCanvas(view) {
    var board = el('div', 'cv');

    if (!view.sections.length) {
      var empty = el('div', 'cv-empty');
      empty.appendChild(el('div', 'cv-empty-ico', '▢'));
      empty.appendChild(el('div', 'cv-empty-title', 'Во вкладке пока нет секций'));
      empty.appendChild(el('div', 'cv-empty-text',
        'Секции идут сверху вниз. Внутри секции компоненты свободно лежат на сетке из 12 колонок.'));
      var emptyAdd = POM_EDITOR.button('+ Первая секция', { className: 'ed-btn-accent' });
      emptyAdd.addEventListener('click', function () { addSectionTo(view); });
      empty.appendChild(emptyAdd);
      board.appendChild(empty);
      return board;
    }

    view.sections.forEach(function (section, index) {
      board.appendChild(renderCanvasSection(view, section, index));
    });

    var addWrap = el('div', 'cv-add');
    var add = POM_EDITOR.button('+ Секция');
    add.addEventListener('click', function () { addSectionTo(view); });
    addWrap.appendChild(add);
    board.appendChild(addWrap);

    board.addEventListener('click', function (e) {
      if (e.target === board || e.target.classList.contains('cv-add')) {
        selectThing(null);
      }
    });

    return board;
  }

  function renderCanvasSection(view, section, index) {
    var selected = state.selection && state.selection.kind === 'section' && state.selection.id === section.id;
    var box = el('section', 'cv-section' + (selected ? ' selected' : ''));
    box.dataset.sectionId = section.id;

    var head = el('div', 'cv-section-head');
    head.appendChild(el('span', 'cv-grip', '⠿'));
    head.appendChild(el('span', 'cv-section-title', section.title));
    head.appendChild(el('span', 'cv-section-count',
      section.items.length + ' комп. · ' + GRID_COLS + ' колонок'));

    var actions = el('span', 'cv-section-actions');
    var up = POM_EDITOR.iconButton('▲', 'Секция выше');
    up.disabled = index === 0;
    up.addEventListener('click', function (e) {
      e.stopPropagation();
      moveSection(view, section, -1);
    });
    var down = POM_EDITOR.iconButton('▼', 'Секция ниже');
    down.disabled = index === view.sections.length - 1;
    down.addEventListener('click', function (e) {
      e.stopPropagation();
      moveSection(view, section, 1);
    });
    var dup = POM_EDITOR.iconButton('⧉', 'Дублировать секцию');
    dup.addEventListener('click', function (e) {
      e.stopPropagation();
      duplicateSection(view, section);
    });
    var del = POM_EDITOR.iconButton('✕', 'Удалить секцию', { className: 'danger' });
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteSection(view, section);
    });
    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(dup);
    actions.appendChild(del);
    head.appendChild(actions);

    head.addEventListener('click', function () {
      selectThing({ kind: 'section', id: section.id });
    });
    box.appendChild(head);

    var grid = el('div', 'cv-grid');
    grid.style.minHeight = 'calc(' + Math.max(2, sectionRows(section)) + ' * var(--cv-row))';
    grid.dataset.sectionId = section.id;

    if (!section.items.length) {
      var hint = el('div', 'cv-grid-empty', 'Перетащите сюда компонент из палитры выше');
      grid.appendChild(hint);
      hint.style.pointerEvents = 'none';
    }

    var overlaps = overlapsForSection(section);

    section.items.forEach(function (item) {
      grid.appendChild(renderCanvasItem(view, section, item, grid, overlaps));
    });

    grid.addEventListener('click', function (e) {
      if (e.target === grid) selectThing({ kind: 'section', id: section.id });
    });

    box.appendChild(grid);
    return box;
  }

  function sectionRows(section) {
    var rows = 2;
    section.items.forEach(function (item) {
      rows = Math.max(rows, item.y + item.h - 1);
    });
    return rows;
  }

  function renderCanvasItem(view, section, item, grid, overlaps) {
    var meta = POM_EDITOR.componentType(item.type);
    var selected = isItemSelected(item);
    var classes = ['cv-item', 'cv-item-' + item.type];
    if (selected) classes.push('selected');
    if (item.locked) classes.push('is-locked');
    if (item.hidden) classes.push('is-hidden');
    if (item.gmOnly) classes.push('is-gm');
    if (overlaps && overlaps[item.id]) classes.push('overlap');

    var node = el('div', classes.join(' '));
    node.dataset.itemId = item.id;
    node.tabIndex = 0;
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label',
      (meta.title || item.type) + (item.label || item.text ? ': ' + (item.label || item.text) : '') +
      (item.locked ? ', заблокирован' : '') + (item.hidden ? ', скрыт' : '') +
      (overlaps && overlaps[item.id] ? ', пересекается с другим компонентом' : ''));
    applyItemGeometry(node, item);

    var body = el('div', 'cv-item-body');
    body.appendChild(POM_EDITOR.preview.renderPreviewItem(item));
    var librarySelect = body.querySelector('.pv-library select');
    if (librarySelect) {
      librarySelect.addEventListener('change', function () {
        item.itemId = librarySelect.value;
        markDirty();
        refreshCanvas();
      });
    }
    node.appendChild(body);

    var badge = el('div', 'cv-item-badge');
    badge.appendChild(el('span', 'cv-item-name', meta.title));
    if (item.gmOnly) badge.appendChild(el('span', 'cv-item-flag', 'ГМ'));
    if (overlaps && overlaps[item.id]) badge.appendChild(el('span', 'cv-item-flag cv-item-flag-warn', '!'));
    if (item.locked) badge.appendChild(el('span', 'cv-item-flag', '🔒'));
    if (item.hidden) badge.appendChild(el('span', 'cv-item-flag', '◌'));

    var lock = POM_EDITOR.iconButton(item.locked ? '🔒' : '🔓',
      item.locked ? 'Разблокировать компонент' : 'Заблокировать компонент');
    lock.addEventListener('click', function (e) {
      e.stopPropagation();
      pushHistory('lock:' + item.id);
      item.locked = !item.locked;
      markDirty();
      render();
    });
    badge.appendChild(lock);

    var hide = POM_EDITOR.iconButton(item.hidden ? '◌' : '◉',
      item.hidden ? 'Показать компонент' : 'Скрыть компонент');
    hide.addEventListener('click', function (e) {
      e.stopPropagation();
      pushHistory('hide:' + item.id);
      item.hidden = !item.hidden;
      markDirty();
      render();
    });
    badge.appendChild(hide);

    var del = POM_EDITOR.iconButton('✕', 'Удалить компонент', { className: 'danger' });
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteItem(view, section, item);
    });
    badge.appendChild(del);
    node.appendChild(badge);

    if (!item.locked) {
      var resize = el('span', 'cv-resize');
      resize.title = 'Потяните, чтобы изменить размер';
      resize.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        e.preventDefault();
        startItemResize(e, item, node, grid);
      });
      node.appendChild(resize);
    }

    node.addEventListener('click', function (e) {
      e.stopPropagation();
      selectThing({ kind: 'item', id: item.id }, e.ctrlKey || e.metaKey || e.shiftKey);
    });

    node.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectThing({ kind: 'item', id: item.id }, e.ctrlKey || e.metaKey || e.shiftKey);
      }
    });

    node.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || item.locked) return;
      if (e.target === resize || e.target.closest('.cv-item-badge')) return;
      startItemDrag(e, item, node, grid);
    });

    return node;
  }

  function applyItemGeometry(node, item) {
    var w = Math.max(1, Math.min(item.w, GRID_COLS - item.x + 1));
    node.style.gridColumn = item.x + ' / span ' + w;
    node.style.gridRow = item.y + ' / span ' + Math.max(1, item.h);
  }

  function cssPixels(value) {
    return parseFloat(value) || 0;
  }

  function gridMetrics(grid) {
    var rect = grid.getBoundingClientRect();
    var styles = window.getComputedStyle(grid);
    var gap = cssPixels(styles.columnGap) || CELL_GAP;
    var innerWidth = rect.width - cssPixels(styles.paddingLeft) - cssPixels(styles.paddingRight);
    var rows = styles.gridTemplateRows.split(' ').filter(function (part) {
      return part && part.indexOf('px') > 0;
    });
    var rowHeight = rows.length ? cssPixels(rows[0]) : 64;
    return {
      colWidth: (innerWidth - gap * (GRID_COLS - 1)) / GRID_COLS,
      rowHeight: rowHeight,
      gap: gap
    };
  }

  function startItemDrag(event, item, node, grid) {
    var view = activeViewOrNull();
    if (!view) return;
    var startX = event.clientX;
    var startY = event.clientY;
    var group = [];
    view.sections.forEach(function (section) {
      section.items.forEach(function (candidate) {
        if (candidate.locked) return;
        if (candidate.id === item.id || (isItemSelected(item) && isItemSelected(candidate))) {
          group.push({
            item: candidate,
            x: candidate.x,
            y: candidate.y,
            w: candidate.w,
            h: candidate.h
          });
        }
      });
    });
    if (!group.length) return;
    var metrics = gridMetrics(grid);
    var moved = false;

    var minDc = -Infinity;
    var maxDc = Infinity;
    var minDr = -Infinity;
    group.forEach(function (entry) {
      minDc = Math.max(minDc, 1 - entry.x);
      maxDc = Math.min(maxDc, GRID_COLS - entry.w + 1 - entry.x);
      minDr = Math.max(minDr, 1 - entry.y);
    });

    document.body.classList.add('ed-dragging');
    event.preventDefault();

    function nodeFor(id) {
      return document.querySelector('.cv-item[data-item-id="' + id + '"]');
    }

    function onMove(e) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      if (!moved) {
        moved = true;
        pushHistory('drag:' + item.id);
        node.classList.add('dragging');
      }
      var dc = Math.round(dx / (metrics.colWidth + metrics.gap));
      var dr = Math.round(dy / (metrics.rowHeight + metrics.gap));
      dc = Math.max(minDc, Math.min(maxDc, dc));
      dr = Math.max(minDr, dr);
      group.forEach(function (entry) {
        entry.item.x = entry.x + dc;
        entry.item.y = entry.y + dr;
        var target = nodeFor(entry.item.id);
        if (target) applyItemGeometry(target, entry.item);
      });
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('ed-dragging');
      node.classList.remove('dragging');
      if (!moved) return;
      markDirty();
      render();
      POM_EDITOR.toast(group.length > 1
        ? 'Перемещено компонентов: ' + group.length
        : metaPosition(item.x, item.y));
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function metaPosition(col, row) {
    return 'Позиция: колонка ' + col + ', строка ' + row;
  }

  function startItemResize(event, item, node, grid) {
    var startX = event.clientX;
    var startY = event.clientY;
    var startW = item.w;
    var startH = item.h;
    var metrics = gridMetrics(grid);
    var moved = false;

    document.body.classList.add('ed-dragging');

    function onMove(e) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      if (!moved) {
        moved = true;
        pushHistory();
        node.classList.add('dragging');
      }
      var dw = Math.round(dx / (metrics.colWidth + metrics.gap));
      var dh = Math.round(dy / (metrics.rowHeight + metrics.gap));
      item.w = Math.max(2, Math.min(startW + dw, GRID_COLS - item.x + 1));
      item.h = Math.max(1, startH + dh);
      applyItemGeometry(node, item);
      var gridEl = node.parentNode;
      if (gridEl && gridEl.classList.contains('cv-grid')) {
        gridEl.style.minHeight = 'calc(' + Math.max(2, sectionRowsForGrid(gridEl)) + ' * var(--cv-row))';
      }
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('ed-dragging');
      node.classList.remove('dragging');
      if (!moved) return;
      markDirty();
      render();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function sectionRowsForGrid(grid) {
    var rows = 2;
    Array.prototype.forEach.call(grid.children, function (child) {
      if (!child.style.gridRow) return;
      var parts = child.style.gridRow.split('/');
      var start = parseInt(parts[0], 10) || 1;
      var span = parseInt((parts[1] || '').replace('span', '').trim(), 10) || 1;
      rows = Math.max(rows, start + span - 1);
    });
    return rows;
  }

  /* =======================================================
     Действия с вкладками
     ======================================================= */

  function findSheet(id) {
    var sheets = state.project.sheets;
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].id === id) return sheets[i];
    }
    return null;
  }

  function ensureActiveSheet() {
    var sheets = state.project.sheets;
    if (!sheets.length) {
      state.activeSheetId = null;
      return null;
    }
    var sheet = findSheet(state.activeSheetId);
    if (!sheet) {
      sheet = sheets[0];
      state.activeSheetId = sheet.id;
    }
    return sheet;
  }

  function currentViews() {
    if (state.section === 'sheets') {
      var sheet = ensureActiveSheet();
      return sheet ? sheet.tabs : [];
    }
    return state.project.panel.views;
  }

  function ensureActiveSheetTab(sheet) {
    if (!sheet) return null;
    if (!sheet.tabs || !sheet.tabs.length) {
      sheet.tabs = [POM_EDITOR.newView(1)];
    }
    var view = findView(state.activeViewId);
    if (!view) {
      view = sheet.tabs[0];
      state.activeViewId = view.id;
    }
    return view;
  }

  function findView(id) {
    var views = currentViews();
    for (var i = 0; i < views.length; i++) {
      if (views[i].id === id) return views[i];
    }
    return null;
  }

  function findSectionById(view, id) {
    if (!view) return null;
    for (var i = 0; i < view.sections.length; i++) {
      if (view.sections[i].id === id) return view.sections[i];
    }
    return null;
  }

  function findItem(view, id) {
    if (!view) return null;
    for (var s = 0; s < view.sections.length; s++) {
      var section = view.sections[s];
      for (var i = 0; i < section.items.length; i++) {
        if (section.items[i].id === id) return { section: section, item: section.items[i] };
      }
    }
    return null;
  }

  function activeViewOrNull() {
    return state.activeViewId ? findView(state.activeViewId) : null;
  }

  function isItemSelected(item) {
    return state.selectedItems.indexOf(item.id) >= 0;
  }

  function selectThing(selection, additive) {
    if (!selection) {
      state.selection = null;
      state.selectedItems = [];
    } else if (selection.kind === 'item') {
      if (additive) {
        var index = state.selectedItems.indexOf(selection.id);
        if (index >= 0) state.selectedItems.splice(index, 1);
        else state.selectedItems.push(selection.id);
        if (!state.selectedItems.length) {
          state.selection = null;
        } else {
          state.selection = { kind: 'item', id: state.selectedItems[state.selectedItems.length - 1] };
        }
      } else {
        state.selectedItems = [selection.id];
        state.selection = selection;
      }
    } else {
      state.selectedItems = [];
      state.selection = selection;
    }
    refreshSelectionUI();
  }

  /* Выделение не перестраивает холст: обновляем только классы и инспектор. */
  function refreshSelectionUI() {
    var view = activeViewOrNull();
    if (!view) {
      renderInspector();
      return;
    }
    var selectedSection = state.selection && state.selection.kind === 'section'
      ? state.selection.id
      : null;

    Array.prototype.forEach.call(document.querySelectorAll('.cv-item'), function (node) {
      var hit = findItem(view, node.dataset.itemId);
      node.classList.toggle('selected', !!(hit && isItemSelected(hit.item)));
    });
    Array.prototype.forEach.call(document.querySelectorAll('.cv-section'), function (node) {
      node.classList.toggle('selected', node.dataset.sectionId === selectedSection);
    });
    renderInspector();
  }

  function overlapsForSection(section) {
    var map = {};
    var items = section.items || [];
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var a = items[i];
        var b = items[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          map[a.id] = true;
          map[b.id] = true;
        }
      }
    }
    return map;
  }

  function deleteSelectedItems() {
    var view = activeViewOrNull();
    if (!view) return;
    var ids = state.selectedItems.slice();
    if (!ids.length && state.selection && state.selection.kind === 'item') ids = [state.selection.id];
    if (!ids.length) return;
    pushHistory('delete-items');
    var removed = 0;
    var locked = 0;
    view.sections.forEach(function (section) {
      section.items = section.items.filter(function (item) {
        if (ids.indexOf(item.id) < 0) return true;
        if (item.locked) { locked++; return true; }
        removed++;
        return false;
      });
    });
    if (!removed) {
      if (locked) POM_EDITOR.toast('Компоненты заблокированы — сначала снимите замок');
      return;
    }
    state.selectedItems = [];
    state.selection = null;
    markDirty();
    render();
    POM_EDITOR.toast('Удалено: ' + removed + (locked ? ' · заблокировано: ' + locked : '') +
      ' — Ctrl+Z вернёт');
  }

  function copySelection() {
    var view = activeViewOrNull();
    if (!view) return;
    var entries = [];
    view.sections.forEach(function (section) {
      section.items.forEach(function (item) {
        if (!isItemSelected(item)) return;
        entries.push({ sectionId: section.id, item: JSON.parse(JSON.stringify(item)) });
      });
    });
    if (!entries.length) return;
    state.clipboard = { entries: entries };
    POM_EDITOR.toast('Скопировано: ' + entries.length + ' · Ctrl+V вставит копии');
  }

  function pasteClipboard() {
    var view = activeViewOrNull();
    if (!view || !state.clipboard || !state.clipboard.entries.length) return;
    pushHistory('paste');
    var fallback = targetSection(view);
    if (!fallback) {
      fallback = POM_EDITOR.newSection(view.sections.length + 1);
      view.sections.push(fallback);
    }
    var pasted = [];
    state.clipboard.entries.forEach(function (entry) {
      var section = findSectionById(view, entry.sectionId) || fallback;
      var copy = POM_EDITOR.cloneItem(entry.item, { clearLock: true });
      copy.x = Math.max(1, Math.min((entry.item.x || 1) + 1, GRID_COLS - copy.w + 1));
      copy.y = Math.max(1, (entry.item.y || 1) + 1);
      section.items.push(copy);
      pasted.push(copy.id);
    });
    state.selectedItems = pasted;
    state.selection = pasted.length ? { kind: 'item', id: pasted[pasted.length - 1] } : null;
    markDirty();
    render();
    POM_EDITOR.toast('Вставлено: ' + pasted.length);
  }

  function duplicateSelectedItems() {
    if (!state.selectedItems.length) return;
    copySelection();
    pasteClipboard();
  }

  function nudgeSelection(key, step) {
    var view = activeViewOrNull();
    if (!view) return;
    var dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    var dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    var changed = false;
    pushHistory();
    view.sections.forEach(function (section) {
      section.items.forEach(function (item) {
        if (!isItemSelected(item) || item.locked) return;
        item.x = Math.max(1, Math.min(item.x + dx, GRID_COLS - item.w + 1));
        item.y = Math.max(1, item.y + dy);
        changed = true;
      });
    });
    if (!changed) return;
    markDirty();
    render();
  }

  function duplicateSection(view, section) {
    var index = view.sections.indexOf(section);
    if (index < 0) return;
    pushHistory();
    var copy = POM_EDITOR.cloneSection(section);
    view.sections.splice(index + 1, 0, copy);
    state.selection = { kind: 'section', id: copy.id };
    state.selectedItems = [];
    markDirty();
    render();
    POM_EDITOR.toast('Секция продублирована');
  }

  function duplicateView(view) {
    var views = currentViews();
    var index = views.indexOf(view);
    if (index < 0) return;
    pushHistory();
    var copy = POM_EDITOR.cloneView(view);
    views.splice(index + 1, 0, copy);
    state.activeViewId = copy.id;
    state.selection = null;
    state.selectedItems = [];
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Вкладка продублирована');
  }

  function addView() {
    var views = currentViews();
    var view = POM_EDITOR.newView(views.length + 1);
    pushHistory();
    views.push(view);
    state.activeViewId = view.id;
    state.selection = null;
    state.selectedItems = [];
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Вкладка «' + view.title + '» создана');
  }

  function deleteView(view) {
    POM_EDITOR.confirmAction({
      title: 'Удалить вкладку',
      text: 'Удалить вкладку «' + view.title + '»? Её содержимое тоже будет удалено.',
      confirmText: 'Удалить',
      danger: true,
      onConfirm: function () { removeView(view); }
    });
  }

  function removeView(view) {
    var views = currentViews();
    if (state.section === 'sheets' && views.length <= 1) {
      POM_EDITOR.toast('У листа должна остаться хотя бы одна вкладка');
      return;
    }
    var index = views.indexOf(view);
    if (index < 0) return;
    pushHistory();
    views.splice(index, 1);
    if (state.activeViewId === view.id) {
      state.activeViewId = views.length ? views[0].id : null;
    }
    state.selection = null;
    state.selectedItems = [];
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Вкладка удалена');
  }

  function moveView(view, delta) {
    var views = currentViews();
    var index = views.indexOf(view);
    var next = index + delta;
    if (index < 0 || next < 0 || next >= views.length) return;
    pushHistory();
    views.splice(index, 1);
    views.splice(next, 0, view);
    markDirty();
    render();
  }

  function selectView(id) {
    if (id !== null && !findView(id)) id = null;
    state.activeViewId = id;
    state.selection = null;
    state.selectedItems = [];
    render();
  }

  function refreshViewChrome(view) {
    var rows = document.querySelectorAll('.pb-view-row[data-view-id="' + view.id + '"]');
    Array.prototype.forEach.call(rows, function (row) {
      var title = row.querySelector('.pb-view-title');
      var icon = row.querySelector('.pb-view-ico');
      if (title) title.textContent = view.title;
      if (icon) icon.textContent = view.icon;
    });

    var rails = document.querySelectorAll('.pb-rail-btn[data-view-id="' + view.id + '"]');
    Array.prototype.forEach.call(rails, function (btn) {
      btn.textContent = view.icon;
      btn.title = view.title;
    });

    var sheetTabs = document.querySelectorAll('.sheet-tab[data-view-id="' + view.id + '"]');
    Array.prototype.forEach.call(sheetTabs, function (tab) {
      var title = tab.querySelector('.sheet-tab-title');
      var icon = tab.querySelector('.sheet-tab-icon');
      if (title) title.textContent = view.title;
      if (icon) icon.textContent = view.icon;
    });

    if (state.activeViewId === view.id) {
      var screenTitle = document.querySelector('.pb-screen-title');
      var screenIcon = document.querySelector('.pb-screen-icon');
      if (screenTitle) screenTitle.textContent = view.title;
      if (screenIcon) screenIcon.textContent = view.icon;
    }
  }

  /* =======================================================
     Действия с секциями и компонентами
     ======================================================= */

  function targetSection(view) {
    if (state.selection && state.selection.kind === 'section') {
      var picked = findSectionById(view, state.selection.id);
      if (picked) return picked;
    }
    if (state.selection && state.selection.kind === 'item') {
      var hit = findItem(view, state.selection.id);
      if (hit) return hit.section;
    }
    return view.sections.length ? view.sections[0] : null;
  }

  function nextRow(section) {
    var row = 1;
    section.items.forEach(function (item) {
      row = Math.max(row, item.y + item.h);
    });
    return row;
  }

  function addSectionTo(view) {
    pushHistory();
    var section = POM_EDITOR.newSection(view.sections.length + 1);
    view.sections.push(section);
    state.selection = { kind: 'section', id: section.id };
    state.selectedItems = [];
    markDirty();
    render();
    POM_EDITOR.toast('Секция «' + section.title + '» добавлена');
  }

  function moveSection(view, section, delta) {
    var index = view.sections.indexOf(section);
    var next = index + delta;
    if (index < 0 || next < 0 || next >= view.sections.length) return;
    pushHistory();
    view.sections.splice(index, 1);
    view.sections.splice(next, 0, section);
    markDirty();
    render();
  }

  function deleteSection(view, section) {
    var index = view.sections.indexOf(section);
    if (index < 0) return;
    pushHistory();
    view.sections.splice(index, 1);
    if (state.selection && state.selection.kind === 'section' && state.selection.id === section.id) {
      state.selection = null;
    } else if (state.selection && state.selection.kind === 'item') {
      var hit = findItem(view, state.selection.id);
      if (!hit) state.selection = null;
    }
    state.selectedItems = state.selectedItems.filter(function (id) {
      return !!findItem(view, id);
    });
    markDirty();
    render();
    POM_EDITOR.toast('Секция удалена — Ctrl+Z вернёт её');
  }

  function addComponent(view, type) {
    var meta = POM_EDITOR.componentType(type);
    var section = targetSection(view);
    pushHistory();
    if (!section) {
      section = POM_EDITOR.newSection(view.sections.length + 1);
      view.sections.push(section);
    }
    var item = POM_EDITOR.createComponent(type, {
      x: 1,
      y: nextRow(section),
      w: meta.defaults.w,
      h: meta.defaults.h
    });
    section.items.push(item);
    state.selection = { kind: 'item', id: item.id };
    state.selectedItems = [item.id];
    markDirty();
    render();
    POM_EDITOR.toast('Добавлено: ' + meta.title);
  }

  function deleteItem(view, section, item) {
    if (item.locked) {
      POM_EDITOR.toast('Компонент заблокирован — сначала снимите замок');
      return;
    }
    var index = section.items.indexOf(item);
    if (index < 0) return;
    pushHistory();
    section.items.splice(index, 1);
    state.selectedItems = state.selectedItems.filter(function (id) { return id !== item.id; });
    if (state.selection && state.selection.kind === 'item' && state.selection.id === item.id) {
      state.selection = state.selectedItems.length
        ? { kind: 'item', id: state.selectedItems[state.selectedItems.length - 1] }
        : { kind: 'section', id: section.id };
    }
    markDirty();
    render();
    POM_EDITOR.toast('Компонент удалён — Ctrl+Z вернёт его');
  }

  function duplicateItem(view, section, item) {
    pushHistory();
    var copy = POM_EDITOR.cloneItem(item, { clearLock: true });
    copy.y = nextRow(section);
    section.items.push(copy);
    state.selection = { kind: 'item', id: copy.id };
    state.selectedItems = [copy.id];
    markDirty();
    render();
    POM_EDITOR.toast('Компонент продублирован');
  }

  function updateItemGeometry(item, patch) {
    var view = findView(state.activeViewId);
    if (!view) return;
    var hit = findItem(view, item.id);
    if (!hit) return;
    patch = patch || {};
    pushHistory();
    item.w = clampNumber(patch.w !== undefined ? patch.w : item.w, 2, GRID_COLS);
    item.x = clampNumber(patch.x !== undefined ? patch.x : item.x, 1, GRID_COLS - item.w + 1);
    item.y = Math.max(1, parseInt(patch.y !== undefined ? patch.y : item.y, 10) || 1);
    item.h = Math.max(1, parseInt(patch.h !== undefined ? patch.h : item.h, 10) || 1);
    markDirty();
    render();
  }

  function clampNumber(value, min, max) {
    var number = parseInt(value, 10);
    if (isNaN(number)) number = min;
    return Math.max(min, Math.min(max, number));
  }

  /* =======================================================
     Заглушки будущих разделов
     ======================================================= */

  /* =======================================================
     Листы персонажа: окна, вкладки, холст
     ======================================================= */

  function renderSheets(workspace) {
    var sheet = ensureActiveSheet();
    if (!sheet) {
      renderSheetEmpty(workspace);
      return;
    }
    var tab = ensureActiveSheetTab(sheet);
    var layout = el('div', 'sheet-layout');
    layout.appendChild(renderSheetRail());
    layout.appendChild(renderSheetEditor(sheet, tab));
    workspace.appendChild(layout);
  }

  function renderSheetEmpty(workspace) {
    var card = el('section', 'ed-card');
    card.appendChild(el('h2', 'ed-card-title', 'Листы персонажа'));
    card.appendChild(el('p', 'ed-card-sub',
      'Отдельные окна с вкладками, полями и кнопками. Пока без игровых данных.'));

    var empty = el('div', 'ed-empty');
    empty.appendChild(el('div', 'ed-empty-ico', '▤'));
    empty.appendChild(el('div', 'ed-empty-title', 'Окон пока нет'));
    empty.appendChild(el('div', 'ed-empty-text',
      'Создайте окно, добавьте вкладки и расставьте компоненты: подписи, селекторы, кнопки, портрет и длинный текст.'));
    var add = POM_EDITOR.button('Создать лист', { className: 'ed-btn-accent' });
    add.addEventListener('click', addSheet);
    empty.appendChild(add);
    card.appendChild(empty);
    workspace.appendChild(card);

    var hint = el('section', 'ed-card');
    hint.appendChild(el('h2', 'ed-card-title', 'Что можно собрать'));
    var list = el('ul', 'ed-bullets');
    [
      'Окно с собственными вкладками.',
      'Подписи, селекторы и кнопки на сетке 12 колонок.',
      'Поле для портрета и блок длинного описания.',
      'Предпросмотр — как окно увидит игрок.'
    ].forEach(function (text) { list.appendChild(el('li', null, text)); });
    hint.appendChild(list);
    workspace.appendChild(hint);
  }

  function renderSheetRail() {
    var card = el('section', 'ed-card sheet-rail');
    var head = el('div', 'lib-rail-head');
    head.appendChild(el('div', 'lib-rail-title', 'Окна'));
    var add = POM_EDITOR.iconButton('+', 'Новый лист', { className: 'pb-add-icon' });
    add.addEventListener('click', addSheet);
    head.appendChild(add);
    card.appendChild(head);

    var list = el('div', 'lib-list');
    state.project.sheets.forEach(function (sheet, index) {
      var row = el('div', 'lib-row sheet-row' + (sheet.id === state.activeSheetId ? ' active' : ''));
      row.dataset.sheetId = sheet.id;
      row.tabIndex = 0;
      row.appendChild(el('span', 'lib-row-ico', sheet.icon || '▤'));

      var text = el('span', 'lib-row-text');
      text.appendChild(el('span', 'lib-row-title', sheet.title || 'Без названия'));
      var tabs = sheet.tabs || [];
      text.appendChild(el('span', 'lib-row-sub',
        tabs.length + ' вкладок · ' + (sheet.window ? sheet.window.width : 760) + ' px'));
      row.appendChild(text);

      var actions = el('span', 'lib-row-actions');
      var up = POM_EDITOR.iconButton('▲', 'Выше', { disabled: index === 0 });
      up.addEventListener('click', function (e) {
        e.stopPropagation();
        moveSheet(sheet, -1);
      });
      var down = POM_EDITOR.iconButton('▼', 'Ниже', { disabled: index === state.project.sheets.length - 1 });
      down.addEventListener('click', function (e) {
        e.stopPropagation();
        moveSheet(sheet, 1);
      });
      var del = POM_EDITOR.iconButton('✕', 'Удалить лист', { className: 'danger' });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteSheet(sheet);
      });
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(del);
      row.appendChild(actions);

      row.addEventListener('click', function () { selectSheet(sheet.id); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectSheet(sheet.id);
        }
      });
      list.appendChild(row);
    });
    card.appendChild(list);

    var addBtn = POM_EDITOR.button('+ Новый лист', { className: 'ed-btn-block' });
    addBtn.addEventListener('click', addSheet);
    card.appendChild(addBtn);
    card.appendChild(el('div', 'ed-hint', 'Один лист — одно окно со своими вкладками.'));
    return card;
  }

  function renderSheetEditor(sheet, tab) {
    var card = el('section', 'ed-card sheet-editor');
    if (!sheet.window) sheet.window = { width: 760, height: 620 };

    var head = el('div', 'lib-head sheet-head');
    var iconInput = POM_EDITOR.input(sheet.icon || '▤', {
      maxLength: 2,
      className: 'lib-icon-input'
    });
    iconInput.title = 'Иконка листа';
    iconInput.addEventListener('input', function () {
      sheet.icon = iconInput.value || '▤';
      markDirty();
      refreshSheetChrome(sheet);
    });
    head.appendChild(iconInput);

    var titleInput = POM_EDITOR.input(sheet.title || '', {
      placeholder: 'Название листа',
      className: 'lib-title-input'
    });
    titleInput.addEventListener('input', function () {
      sheet.title = titleInput.value;
      markDirty();
      refreshSheetChrome(sheet);
    });
    head.appendChild(titleInput);

    head.appendChild(sizeInput('Ширина', 'width', 320, 1400));
    head.appendChild(sizeInput('Высота', 'height', 240, 1000));

    var preview = POM_EDITOR.button('Предпросмотр', { className: 'ed-btn-accent' });
    preview.addEventListener('click', function () { openSheetPreview(sheet); });
    head.appendChild(preview);

    var headActions = el('span', 'lib-head-actions');
    var del = POM_EDITOR.iconButton('✕', 'Удалить лист', { className: 'danger' });
    del.addEventListener('click', function () { deleteSheet(sheet); });
    headActions.appendChild(del);
    head.appendChild(headActions);
    card.appendChild(head);

    function sizeInput(label, key, min, max) {
      var wrap = el('label', 'sheet-size');
      wrap.appendChild(el('span', 'sheet-size-label', label));
      var input = POM_EDITOR.input(sheet.window[key], {
        type: 'number',
        min: min,
        max: max,
        className: 'sheet-size-input'
      });
      input.addEventListener('change', function () {
        var value = parseInt(input.value, 10);
        if (isNaN(value)) value = sheet.window[key];
        value = Math.max(min, Math.min(max, value));
        sheet.window[key] = value;
        input.value = value;
        markDirty();
        render();
      });
      wrap.appendChild(input);
      return wrap;
    }

    var toolbar = el('div', 'sheet-toolbar');
    var undoBtn = POM_EDITOR.iconButton('↶', 'Отменить (Ctrl+Z)');
    undoBtn.disabled = !state.history.length;
    undoBtn.addEventListener('click', undo);
    var redoBtn = POM_EDITOR.iconButton('↷', 'Повторить (Ctrl+Shift+Z)');
    redoBtn.disabled = !state.future.length;
    redoBtn.addEventListener('click', redo);
    var addSection = POM_EDITOR.button('+ Секция');
    addSection.addEventListener('click', function () { addSectionTo(tab); });
    toolbar.appendChild(undoBtn);
    toolbar.appendChild(redoBtn);
    toolbar.appendChild(addSection);
    card.appendChild(toolbar);

    card.appendChild(renderComponentPalette(tab));

    var win = el('div', 'sheet-window');
    win.style.maxWidth = sheet.window.width + 'px';

    var winHead = el('div', 'sheet-window-head');
    winHead.appendChild(el('span', 'sheet-window-icon', sheet.icon || '▤'));
    winHead.appendChild(el('span', 'sheet-window-title', sheet.title || 'Без названия'));
    winHead.appendChild(el('span', 'sheet-window-meta',
      sheet.window.width + '×' + sheet.window.height));
    win.appendChild(winHead);

    win.appendChild(renderSheetTabs(sheet));

    var body = el('div', 'sheet-window-body');
    body.appendChild(renderCanvas(tab));
    win.appendChild(body);
    card.appendChild(win);

    card.appendChild(el('div', 'ed-hint',
      'Перетаскивайте компоненты по сетке и тяните за угол. Вкладки переключаются сверху; порядок меняется в инспекторе.'));

    return card;
  }

  function renderSheetTabs(sheet) {
    var bar = el('div', 'sheet-tabs');
    sheet.tabs.forEach(function (tab) {
      var active = state.activeViewId === tab.id;
      var btn = el('button', 'sheet-tab' + (active ? ' active' : ''));
      btn.type = 'button';
      btn.dataset.viewId = tab.id;
      btn.appendChild(el('span', 'sheet-tab-icon', tab.icon || '◈'));
      btn.appendChild(el('span', 'sheet-tab-title', tab.title || 'Вкладка'));
      if (sheet.tabs.length > 1) {
        var close = el('span', 'sheet-tab-close', '×');
        close.title = 'Удалить вкладку';
        close.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteView(tab);
        });
        btn.appendChild(close);
      }
      btn.addEventListener('click', function () {
        state.activeViewId = tab.id;
        state.selection = null;
        render();
      });
      bar.appendChild(btn);
    });

    var add = el('button', 'sheet-tab-add', '+');
    add.type = 'button';
    add.title = 'Новая вкладка';
    add.addEventListener('click', addView);
    bar.appendChild(add);
    return bar;
  }

  function selectSheet(id) {
    if (state.activeSheetId === id) return;
    var sheet = findSheet(id);
    if (!sheet) return;
    state.activeSheetId = id;
    state.activeViewId = sheet.tabs.length ? sheet.tabs[0].id : null;
    state.selection = null;
    render();
  }

  function addSheet() {
    pushHistory();
    var sheet = POM_EDITOR.newSheet(state.project.sheets.length + 1);
    state.project.sheets.push(sheet);
    state.activeSheetId = sheet.id;
    state.activeViewId = sheet.tabs[0].id;
    state.selection = null;
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Лист создан — добавьте вкладки и компоненты');
    setTimeout(function () {
      var input = document.querySelector('.sheet-editor .lib-title-input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function deleteSheet(sheet) {
    POM_EDITOR.confirmAction({
      title: 'Удалить лист',
      text: 'Удалить «' + (sheet.title || 'Без названия') + '»? Все вкладки и компоненты будут удалены.',
      confirmText: 'Удалить',
      danger: true,
      onConfirm: function () { removeSheet(sheet); }
    });
  }

  function removeSheet(sheet) {
    var index = state.project.sheets.indexOf(sheet);
    if (index < 0) return;
    pushHistory();
    state.project.sheets.splice(index, 1);
    if (state.activeSheetId === sheet.id) {
      var next = state.project.sheets.length ? state.project.sheets[0] : null;
      state.activeSheetId = next ? next.id : null;
      state.activeViewId = next && next.tabs.length ? next.tabs[0].id : null;
    }
    state.selection = null;
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Лист удалён');
  }

  function moveSheet(sheet, delta) {
    var sheets = state.project.sheets;
    var index = sheets.indexOf(sheet);
    var next = index + delta;
    if (index < 0 || next < 0 || next >= sheets.length) return;
    pushHistory();
    sheets.splice(index, 1);
    sheets.splice(next, 0, sheet);
    markDirty();
    render();
  }

  function refreshSheetChrome(sheet) {
    var rows = document.querySelectorAll('.sheet-row[data-sheet-id="' + sheet.id + '"]');
    Array.prototype.forEach.call(rows, function (row) {
      var title = row.querySelector('.lib-row-title');
      var icon = row.querySelector('.lib-row-ico');
      var sub = row.querySelector('.lib-row-sub');
      if (title) title.textContent = sheet.title || 'Без названия';
      if (icon) icon.textContent = sheet.icon || '▤';
      if (sub) {
        sub.textContent = (sheet.tabs ? sheet.tabs.length : 0) + ' вкладок · ' + sheet.window.width + ' px';
      }
    });
    var winTitle = document.querySelector('.sheet-window-title');
    var winIcon = document.querySelector('.sheet-window-icon');
    if (winTitle) winTitle.textContent = sheet.title || 'Без названия';
    if (winIcon) winIcon.textContent = sheet.icon || '▤';
  }

  function openSheetPreview(sheet) {
    if (!sheet.window) sheet.window = { width: 760, height: 620 };

    var modal = el('div', 'ed-modal');
    var backdrop = el('div', 'ed-modal-backdrop');
    var card = el('div', 'ed-modal-card sheet-preview-card');

    var head = el('div', 'ed-modal-head');
    head.appendChild(el('div', 'ed-modal-title', 'Предпросмотр: ' + (sheet.title || 'лист')));
    var close = POM_EDITOR.iconButton('✕', 'Закрыть');
    head.appendChild(close);
    card.appendChild(head);

    var body = el('div', 'ed-modal-body sheet-preview-body');
    var win = el('div', 'sheet-window sheet-window-preview');
    win.style.width = 'min(' + sheet.window.width + 'px, 94vw)';

    var winHead = el('div', 'sheet-window-head');
    winHead.appendChild(el('span', 'sheet-window-icon', sheet.icon || '▤'));
    winHead.appendChild(el('span', 'sheet-window-title', sheet.title || 'Без названия'));
    winHead.appendChild(el('span', 'sheet-window-meta',
      sheet.window.width + '×' + sheet.window.height));
    win.appendChild(winHead);

    var tabs = el('div', 'sheet-tabs sheet-preview-tabs');
    var content = el('div', 'sheet-preview-content');
    var activeId = sheet.tabs.length ? sheet.tabs[0].id : null;

    function activeTab() {
      for (var i = 0; i < sheet.tabs.length; i++) {
        if (sheet.tabs[i].id === activeId) return sheet.tabs[i];
      }
      return sheet.tabs[0] || null;
    }

    function renderActive() {
      var tab = activeTab();
      content.innerHTML = '';
      if (!tab) return;
      var inner = el('div');
      content.appendChild(inner);
      POM_EDITOR.preview.renderViewPreview(inner, tab, false);
    }

    sheet.tabs.forEach(function (tab) {
      var btn = el('button', 'sheet-tab' + (tab.id === activeId ? ' active' : ''));
      btn.type = 'button';
      btn.dataset.viewId = tab.id;
      btn.appendChild(el('span', 'sheet-tab-icon', tab.icon || '◈'));
      btn.appendChild(el('span', 'sheet-tab-title', tab.title || 'Вкладка'));
      btn.addEventListener('click', function () {
        activeId = tab.id;
        Array.prototype.forEach.call(tabs.querySelectorAll('.sheet-tab'), function (node) {
          node.classList.toggle('active', node.dataset.viewId === activeId);
        });
        renderActive();
      });
      tabs.appendChild(btn);
    });

    win.appendChild(tabs);
    win.appendChild(content);
    body.appendChild(win);
    card.appendChild(body);

    var foot = el('div', 'ed-confirm-foot');
    var closeBtn = POM_EDITOR.button('Закрыть');
    foot.appendChild(closeBtn);
    card.appendChild(foot);

    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    function closeModal() {
      document.removeEventListener('keydown', onKey);
      modal.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape') closeModal();
    }
    close.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', onKey);

    renderActive();
  }

  /* =======================================================
     Библиотеки: списки, схема характеристик, предметы
     ======================================================= */

  function ensureActiveLibrary() {
    var libraries = state.project.libraries;
    if (!libraries.length) {
      state.activeLibraryId = null;
      return null;
    }
    var library = findLibrary(state.activeLibraryId);
    if (!library) {
      library = libraries[0];
      state.activeLibraryId = library.id;
    }
    return library;
  }

  function findLibrary(id) {
    var libraries = state.project.libraries;
    for (var i = 0; i < libraries.length; i++) {
      if (libraries[i].id === id) return libraries[i];
    }
    return null;
  }

  function findLibraryField(library, id) {
    if (!library) return null;
    for (var i = 0; i < library.fields.length; i++) {
      if (library.fields[i].id === id) return library.fields[i];
    }
    return null;
  }

  function findLibraryItem(library, id) {
    if (!library) return null;
    for (var i = 0; i < library.items.length; i++) {
      if (library.items[i].id === id) return library.items[i];
    }
    return null;
  }

  function libraryItemSummary(library, itemId) {
    if (!library || !itemId) return '';
    var item = findLibraryItem(library, itemId);
    if (!item) return '';
    var parts = [];
    (library.fields || []).slice(0, 4).forEach(function (field) {
      var value = item.values ? item.values[field.id] : '';
      if (value !== undefined && value !== null && value !== '') {
        parts.push((field.label || 'Поле') + ': ' + value);
      }
    });
    return parts.join(' · ');
  }

  function validateLibrarySelection() {
    if (state.section !== 'libraries') return;
    var library = ensureActiveLibrary();
    if (!library) {
      state.libSelection = null;
      return;
    }
    if (!state.libSelection) return;
    if (state.libSelection.kind === 'field' && !findLibraryField(library, state.libSelection.id)) {
      state.libSelection = null;
    } else if (state.libSelection.kind === 'item' && !findLibraryItem(library, state.libSelection.id)) {
      state.libSelection = null;
    }
  }

  function renderLibraries(workspace) {
    var library = ensureActiveLibrary();
    if (!library) {
      renderLibraryEmpty(workspace);
      return;
    }
    var layout = el('div', 'lib-layout');
    layout.appendChild(renderLibraryRail());
    layout.appendChild(renderLibraryMain(library));
    workspace.appendChild(layout);
  }

  function renderLibraryEmpty(workspace) {
    var card = el('section', 'ed-card');
    card.appendChild(el('h2', 'ed-card-title', 'Библиотеки'));
    card.appendChild(el('p', 'ed-card-sub',
      'Списки предметов, из которых модуль берёт данные для выпадающих списков.'));

    var empty = el('div', 'ed-empty');
    empty.appendChild(el('div', 'ed-empty-ico', '▦'));
    empty.appendChild(el('div', 'ed-empty-title', 'Списков пока нет'));
    empty.appendChild(el('div', 'ed-empty-text',
      'Создайте список, задайте характеристики и наполните его предметами вручную или из Excel.'));
    var add = POM_EDITOR.button('Создать библиотеку', { className: 'ed-btn-accent' });
    add.addEventListener('click', addLibrary);
    empty.appendChild(add);
    card.appendChild(empty);
    workspace.appendChild(card);

    var hint = el('section', 'ed-card');
    hint.appendChild(el('h2', 'ed-card-title', 'Как это работает'));
    var list = el('ul', 'ed-bullets');
    [
      'Список — это вкладка в библиотеке: «Оружие», «Броня», «Заклинания».',
      'Схема задаёт характеристики, которые есть у каждого предмета списка.',
      'Предметы добавляются вручную или пачкой из Excel по этой схеме.',
      'Порядок вкладок меняется перетаскиванием.'
    ].forEach(function (text) { list.appendChild(el('li', null, text)); });
    hint.appendChild(list);
    workspace.appendChild(hint);
  }

  function renderLibraryRail() {
    var card = el('section', 'ed-card lib-rail');
    var head = el('div', 'lib-rail-head');
    head.appendChild(el('div', 'lib-rail-title', 'Списки'));
    var add = POM_EDITOR.iconButton('+', 'Новая библиотека', { className: 'pb-add-icon' });
    add.addEventListener('click', addLibrary);
    head.appendChild(add);
    card.appendChild(head);

    var list = el('div', 'lib-list');
    state.project.libraries.forEach(function (library, index) {
      var row = el('div', 'lib-row' + (library.id === state.activeLibraryId ? ' active' : ''));
      row.dataset.libraryId = library.id;
      row.draggable = true;
      row.tabIndex = 0;

      var grip = el('span', 'lib-grip', '⠿');
      grip.title = 'Перетащите, чтобы изменить порядок';
      row.appendChild(grip);
      row.appendChild(el('span', 'lib-row-ico', library.icon || '▦'));

      var text = el('span', 'lib-row-text');
      text.appendChild(el('span', 'lib-row-title', library.title || 'Без названия'));
      var sub = (library.category ? library.category + ' · ' : '') + library.items.length + ' предм.';
      text.appendChild(el('span', 'lib-row-sub', sub));
      row.appendChild(text);

      var actions = el('span', 'lib-row-actions');
      var up = POM_EDITOR.iconButton('▲', 'Выше', { disabled: index === 0 });
      up.addEventListener('click', function (e) {
        e.stopPropagation();
        moveLibrary(library, -1);
      });
      var down = POM_EDITOR.iconButton('▼', 'Ниже', { disabled: index === state.project.libraries.length - 1 });
      down.addEventListener('click', function (e) {
        e.stopPropagation();
        moveLibrary(library, 1);
      });
      var del = POM_EDITOR.iconButton('✕', 'Удалить библиотеку', { className: 'danger' });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteLibrary(library);
      });
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(del);
      row.appendChild(actions);

      row.addEventListener('click', function () { selectLibrary(library.id); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectLibrary(library.id);
        }
      });
      row.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', library.id);
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('dragging');
      });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', function () {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('drag-over');
        var draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== library.id) reorderLibrary(draggedId, library.id);
      });

      list.appendChild(row);
    });
    card.appendChild(list);

    var addBtn = POM_EDITOR.button('+ Новая библиотека', { className: 'ed-btn-block' });
    addBtn.addEventListener('click', addLibrary);
    card.appendChild(addBtn);
    card.appendChild(el('div', 'ed-hint', 'Перетащите вкладку или используйте ▲▼.'));
    return card;
  }

  function renderLibraryMain(library) {
    var card = el('section', 'ed-card lib-main');

    var head = el('div', 'lib-head');
    var iconInput = POM_EDITOR.input(library.icon || '▦', {
      maxLength: 2,
      className: 'lib-icon-input'
    });
    iconInput.title = 'Иконка списка';
    iconInput.addEventListener('input', function () {
      library.icon = iconInput.value || '▦';
      markDirty();
      refreshLibraryChrome(library);
    });
    head.appendChild(iconInput);

    var titleInput = POM_EDITOR.input(library.title || '', {
      placeholder: 'Название списка',
      className: 'lib-title-input'
    });
    titleInput.addEventListener('input', function () {
      library.title = titleInput.value;
      markDirty();
      refreshLibraryChrome(library);
    });
    head.appendChild(titleInput);

    var categoryInput = POM_EDITOR.input(library.category || '', {
      placeholder: 'Категория',
      className: 'lib-category-input'
    });
    categoryInput.addEventListener('input', function () {
      library.category = categoryInput.value;
      markDirty();
      refreshLibraryChrome(library);
    });
    head.appendChild(categoryInput);

    head.appendChild(el('span', 'lib-head-counts',
      library.fields.length + ' хар. · ' + library.items.length + ' предм.'));

    var headActions = el('span', 'lib-head-actions');
    var del = POM_EDITOR.iconButton('✕', 'Удалить библиотеку', { className: 'danger' });
    del.addEventListener('click', function () { deleteLibrary(library); });
    headActions.appendChild(del);
    head.appendChild(headActions);
    card.appendChild(head);

    var tabs = el('div', 'lib-mode-tabs');
    tabs.appendChild(libraryModeTab(library, 'schema', 'Схема', library.fields.length));
    tabs.appendChild(libraryModeTab(library, 'items', 'Предметы', library.items.length));
    card.appendChild(tabs);

    if (state.libraryMode === 'schema') {
      card.appendChild(renderLibrarySchema(library));
    } else {
      card.appendChild(renderLibraryItems(library));
    }
    return card;
  }

  function libraryModeTab(library, mode, title, count) {
    var btn = el('button', 'lib-mode-tab' + (state.libraryMode === mode ? ' active' : ''));
    btn.type = 'button';
    btn.appendChild(el('span', null, title));
    btn.appendChild(el('span', 'lib-mode-count', String(count)));
    btn.addEventListener('click', function () {
      state.libraryMode = mode;
      state.libSelection = { kind: 'library', id: library.id };
      render();
    });
    return btn;
  }

  function renderLibrarySchema(library) {
    var wrap = el('div');

    if (!library.fields.length) {
      var empty = el('div', 'lib-empty');
      empty.appendChild(el('div', 'ed-empty-ico', '▤'));
      empty.appendChild(el('div', 'ed-empty-title', 'Характеристик пока нет'));
      empty.appendChild(el('div', 'ed-empty-text',
        'Добавьте поля, которые будут у каждого предмета этого списка.'));
      var addFirst = POM_EDITOR.button('+ Первая характеристика', { className: 'ed-btn-accent' });
      addFirst.addEventListener('click', function () { addLibraryField(library); });
      empty.appendChild(addFirst);
      wrap.appendChild(empty);
      return wrap;
    }

    var tableWrap = el('div', 'lib-table-wrap');
    var table = el('table', 'lib-table lib-schema-table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['', 'Подпись', 'Тип', 'Единица', 'Обяз.', 'По умолчанию', 'Варианты', ''].forEach(function (title) {
      var th = document.createElement('th');
      th.textContent = title;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    library.fields.forEach(function (field, index) {
      var row = el('tr');
      row.dataset.fieldId = field.id;

      var orderCell = el('td', 'lib-col-order');
      orderCell.appendChild(el('span', 'lib-grip', '⠿'));
      orderCell.appendChild(el('span', 'lib-order-num', String(index + 1)));
      row.appendChild(orderCell);

      var labelCell = el('td');
      var labelInput = POM_EDITOR.input(field.label || '', { placeholder: 'Название характеристики' });
      labelInput.addEventListener('focus', pushHistory);
      labelInput.addEventListener('input', function () {
        field.label = labelInput.value;
        markDirty();
      });
      labelCell.appendChild(labelInput);
      row.appendChild(labelCell);

      var typeCell = el('td');
      var typeSelect = document.createElement('select');
      typeSelect.className = 'ed-input';
      POM_EDITOR.FIELD_TYPES.forEach(function (meta) {
        var option = document.createElement('option');
        option.value = meta.type;
        option.textContent = meta.title;
        typeSelect.appendChild(option);
      });
      typeSelect.value = field.type;
      typeSelect.addEventListener('change', function () {
        pushHistory();
        field.type = typeSelect.value;
        if (field.type === 'select' && (!field.options || !field.options.length)) {
          field.options = ['Вариант 1', 'Вариант 2'];
        }
        markDirty();
        render();
      });
      typeCell.appendChild(typeSelect);
      row.appendChild(typeCell);

      var unitCell = el('td');
      var unitInput = POM_EDITOR.input(field.unit || '', { placeholder: 'кг' });
      unitInput.addEventListener('focus', pushHistory);
      unitInput.addEventListener('input', function () {
        field.unit = unitInput.value;
        markDirty();
      });
      unitCell.appendChild(unitInput);
      row.appendChild(unitCell);

      var requiredCell = el('td', 'lib-col-check');
      var required = document.createElement('input');
      required.type = 'checkbox';
      required.checked = !!field.required;
      required.addEventListener('change', function () {
        pushHistory();
        field.required = required.checked;
        markDirty();
      });
      requiredCell.appendChild(required);
      row.appendChild(requiredCell);

      var defaultCell = el('td');
      var defaultInput = POM_EDITOR.input(field.defaultValue == null ? '' : field.defaultValue, {
        placeholder: '—'
      });
      defaultInput.addEventListener('focus', pushHistory);
      defaultInput.addEventListener('input', function () {
        field.defaultValue = defaultInput.value;
        markDirty();
      });
      defaultCell.appendChild(defaultInput);
      row.appendChild(defaultCell);

      var optionsCell = el('td');
      if (field.type === 'select') {
        var optionsInput = POM_EDITOR.input((field.options || []).join(', '), {
          placeholder: 'Вариант 1, Вариант 2'
        });
        optionsInput.addEventListener('focus', pushHistory);
        optionsInput.addEventListener('input', function () {
          field.options = optionsInput.value.split(',').map(function (part) {
            return part.trim();
          }).filter(function (part) {
            return part.length > 0;
          });
          markDirty();
        });
        optionsCell.appendChild(optionsInput);
      } else {
        optionsCell.appendChild(el('span', 'lib-muted', '—'));
      }
      row.appendChild(optionsCell);

      var actionsCell = el('td', 'lib-col-actions');
      var up = POM_EDITOR.iconButton('▲', 'Выше', { disabled: index === 0 });
      up.addEventListener('click', function () { moveLibraryField(library, field, -1); });
      var down = POM_EDITOR.iconButton('▼', 'Ниже', { disabled: index === library.fields.length - 1 });
      down.addEventListener('click', function () { moveLibraryField(library, field, 1); });
      var remove = POM_EDITOR.iconButton('✕', 'Удалить характеристику', { className: 'danger' });
      remove.addEventListener('click', function () { deleteLibraryField(library, field); });
      actionsCell.appendChild(up);
      actionsCell.appendChild(down);
      actionsCell.appendChild(remove);
      row.appendChild(actionsCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    var add = POM_EDITOR.button('+ Характеристика', { className: 'ed-btn-accent' });
    add.addEventListener('click', function () { addLibraryField(library); });
    wrap.appendChild(add);
    wrap.appendChild(el('div', 'ed-hint',
      'Колонка «Название» есть у каждого предмета и не входит в список характеристик.'));
    return wrap;
  }

  function renderLibraryItems(library) {
    var wrap = el('div');

    var toolbar = el('div', 'lib-toolbar');
    var search = POM_EDITOR.input(state.librarySearch, {
      placeholder: 'Поиск по названию и значениям',
      className: 'lib-search'
    });
    search.addEventListener('input', function () {
      state.librarySearch = search.value;
      applyLibraryFilter(wrap, library);
    });
    toolbar.appendChild(search);

    var add = POM_EDITOR.button('+ Предмет', { className: 'ed-btn-accent' });
    add.addEventListener('click', function () { addLibraryItem(library); });
    toolbar.appendChild(add);

    var importBtn = POM_EDITOR.button('Импорт Excel');
    importBtn.addEventListener('click', function () { openLibraryImport(library); });
    toolbar.appendChild(importBtn);

    var exportBtn = POM_EDITOR.button('Экспорт');
    exportBtn.addEventListener('click', function () { exportLibrary(library, true); });
    toolbar.appendChild(exportBtn);

    var templateBtn = POM_EDITOR.button('Скачать шаблон');
    templateBtn.addEventListener('click', function () { exportLibrary(library, false); });
    toolbar.appendChild(templateBtn);
    wrap.appendChild(toolbar);

    if (!library.items.length) {
      var empty = el('div', 'lib-empty');
      empty.appendChild(el('div', 'ed-empty-ico', '▦'));
      empty.appendChild(el('div', 'ed-empty-title', 'Предметов пока нет'));
      empty.appendChild(el('div', 'ed-empty-text',
        'Добавьте первый предмет вручную или загрузите список из Excel.'));
      var first = POM_EDITOR.button('+ Первый предмет', { className: 'ed-btn-accent' });
      first.addEventListener('click', function () { addLibraryItem(library); });
      empty.appendChild(first);
      wrap.appendChild(empty);
      return wrap;
    }

    if (!library.fields.length) {
      wrap.appendChild(el('div', 'lib-notice',
        'У списка пока нет характеристик — предметы состоят только из названия. Добавьте их на вкладке «Схема».'));
    }

    var tableWrap = el('div', 'lib-table-wrap');
    var table = el('table', 'lib-table lib-items-table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.appendChild(headerCell('Название', 'lib-cell-name'));
    library.fields.forEach(function (field) {
      headRow.appendChild(headerCell(
        (field.label || 'Без названия') + (field.unit ? ', ' + field.unit : ''),
        field.type === 'number' ? 'lib-cell-number' : ''
      ));
    });
    headRow.appendChild(headerCell('', 'lib-col-actions'));
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    library.items.forEach(function (item) {
      tbody.appendChild(renderLibraryItemRow(library, item));
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    applyLibraryFilter(wrap, library);
    return wrap;
  }

  function headerCell(text, className) {
    var th = document.createElement('th');
    if (className) th.className = className;
    th.textContent = text;
    return th;
  }

  function renderLibraryItemRow(library, item) {
    var row = el('tr');
    row.dataset.itemId = item.id;
    row.dataset.search = libraryItemSearchText(library, item);

    var nameCell = el('td', 'lib-cell-name');
    var nameInput = POM_EDITOR.input(item.name || '', {
      placeholder: 'Название предмета',
      className: 'lib-item-name'
    });
    nameInput.addEventListener('focus', pushHistory);
    nameInput.addEventListener('input', function () {
      item.name = nameInput.value;
      markDirty();
      updateLibraryRowSearch(row, library, item);
    });
    nameCell.appendChild(nameInput);
    row.appendChild(nameCell);

    library.fields.forEach(function (field) {
      var cell = el('td', 'lib-cell-field' + (field.type === 'number' ? ' lib-cell-number' : ''));
      cell.appendChild(renderLibraryValueControl(field, item, row, library));
      row.appendChild(cell);
    });

    var actionsCell = el('td', 'lib-col-actions');
    var duplicate = POM_EDITOR.iconButton('⧉', 'Дублировать предмет');
    duplicate.addEventListener('click', function () { duplicateLibraryItem(library, item); });
    var remove = POM_EDITOR.iconButton('✕', 'Удалить предмет', { className: 'danger' });
    remove.addEventListener('click', function () { deleteLibraryItem(library, item); });
    actionsCell.appendChild(duplicate);
    actionsCell.appendChild(remove);
    row.appendChild(actionsCell);

    return row;
  }

  function renderLibraryValueControl(field, item, row, library) {
    var value = item.values[field.id];

    if (field.type === 'checkbox') {
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'lib-checkbox';
      checkbox.checked = !!value;
      checkbox.addEventListener('change', function () {
        pushHistory();
        item.values[field.id] = checkbox.checked;
        markDirty();
        updateLibraryRowSearch(row, library, item);
      });
      return checkbox;
    }

    if (field.type === 'select') {
      var select = document.createElement('select');
      select.className = 'ed-input';
      var options = (field.options || []).slice();
      var current = value == null ? '' : String(value);
      if (current && options.indexOf(current) < 0) options.push(current);

      var emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '—';
      select.appendChild(emptyOption);
      options.forEach(function (optionText) {
        var option = document.createElement('option');
        option.value = optionText;
        option.textContent = optionText;
        select.appendChild(option);
      });
      select.value = current;
      select.addEventListener('change', function () {
        pushHistory();
        item.values[field.id] = select.value;
        markDirty();
        updateLibraryRowSearch(row, library, item);
      });
      return select;
    }

    if (field.type === 'textarea') {
      var textarea = document.createElement('textarea');
      textarea.className = 'ed-input lib-cell-textarea';
      textarea.rows = 1;
      textarea.value = value == null ? '' : String(value);
      textarea.addEventListener('focus', pushHistory);
      textarea.addEventListener('input', function () {
        item.values[field.id] = textarea.value;
        markDirty();
        updateLibraryRowSearch(row, library, item);
      });
      return textarea;
    }

    var input = document.createElement('input');
    input.className = 'ed-input';
    if (field.type === 'number') {
      input.type = 'number';
      input.step = 'any';
      input.value = value == null || value === '' ? '' : String(value);
      input.addEventListener('focus', pushHistory);
      input.addEventListener('input', function () {
        if (input.value === '') {
          item.values[field.id] = '';
        } else {
          var number = Number(input.value);
          item.values[field.id] = isNaN(number) ? '' : number;
        }
        markDirty();
        updateLibraryRowSearch(row, library, item);
      });
      return input;
    }

    input.type = 'text';
    input.value = value == null ? '' : String(value);
    input.addEventListener('focus', pushHistory);
    input.addEventListener('input', function () {
      item.values[field.id] = input.value;
      markDirty();
      updateLibraryRowSearch(row, library, item);
    });
    return input;
  }

  function libraryItemSearchText(library, item) {
    var parts = [item.name || ''];
    library.fields.forEach(function (field) {
      var value = item.values[field.id];
      if (value !== undefined && value !== null) parts.push(String(value));
    });
    return parts.join(' ').toLowerCase();
  }

  function updateLibraryRowSearch(row, library, item) {
    row.dataset.search = libraryItemSearchText(library, item);
    var scope = row.closest('.lib-main');
    if (scope) applyLibraryFilter(scope, library);
  }

  function applyLibraryFilter(container, library) {
    var search = (state.librarySearch || '').trim().toLowerCase();
    var rows = container.querySelectorAll('.lib-items-table tbody tr');
    Array.prototype.forEach.call(rows, function (row) {
      var match = !search || (row.dataset.search || '').indexOf(search) >= 0;
      row.style.display = match ? '' : 'none';
    });
  }

  function selectLibrary(id) {
    if (state.activeLibraryId === id) return;
    var library = findLibrary(id);
    if (!library) return;
    state.activeLibraryId = id;
    state.librarySearch = '';
    state.libSelection = { kind: 'library', id: id };
    state.libraryMode = library.fields.length ? 'items' : 'schema';
    render();
  }

  function addLibrary() {
    pushHistory();
    var library = POM_EDITOR.newLibrary(state.project.libraries.length + 1);
    state.project.libraries.push(library);
    state.activeLibraryId = library.id;
    state.libraryMode = 'schema';
    state.librarySearch = '';
    state.libSelection = { kind: 'library', id: library.id };
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Библиотека создана — задайте характеристики');
    setTimeout(function () {
      var input = document.querySelector('.lib-title-input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function deleteLibrary(library) {
    POM_EDITOR.confirmAction({
      title: 'Удалить библиотеку',
      text: 'Удалить «' + (library.title || 'Без названия') + '»? Все характеристики и предметы будут удалены.',
      confirmText: 'Удалить',
      danger: true,
      onConfirm: function () { removeLibrary(library); }
    });
  }

  function removeLibrary(library) {
    var index = state.project.libraries.indexOf(library);
    if (index < 0) return;
    pushHistory();
    state.project.libraries.splice(index, 1);
    if (state.activeLibraryId === library.id) {
      state.activeLibraryId = state.project.libraries.length ? state.project.libraries[0].id : null;
    }
    state.librarySearch = '';
    state.libSelection = null;
    markDirty();
    renderNav();
    render();
    POM_EDITOR.toast('Библиотека удалена');
  }

  function moveLibrary(library, delta) {
    var libraries = state.project.libraries;
    var index = libraries.indexOf(library);
    var next = index + delta;
    if (index < 0 || next < 0 || next >= libraries.length) return;
    pushHistory();
    libraries.splice(index, 1);
    libraries.splice(next, 0, library);
    markDirty();
    render();
  }

  function reorderLibrary(draggedId, targetId) {
    var libraries = state.project.libraries;
    var from = -1;
    var to = -1;
    for (var i = 0; i < libraries.length; i++) {
      if (libraries[i].id === draggedId) from = i;
      if (libraries[i].id === targetId) to = i;
    }
    if (from < 0 || to < 0 || from === to) return;
    pushHistory();
    var moved = libraries.splice(from, 1)[0];
    libraries.splice(to, 0, moved);
    markDirty();
    render();
  }

  function addLibraryField(library) {
    pushHistory();
    var field = POM_EDITOR.newField('text');
    field.label = 'Характеристика ' + (library.fields.length + 1);
    library.fields.push(field);
    state.libraryMode = 'schema';
    state.libSelection = { kind: 'field', id: field.id };
    markDirty();
    render();
    POM_EDITOR.toast('Характеристика добавлена');
    setTimeout(function () {
      var input = document.querySelector('.lib-schema-table tr[data-field-id="' + field.id + '"] input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function deleteLibraryField(library, field) {
    var filled = library.items.filter(function (item) {
      var value = item.values[field.id];
      return value !== undefined && value !== null && value !== '';
    }).length;
    POM_EDITOR.confirmAction({
      title: 'Удалить характеристику',
      text: 'Удалить «' + (field.label || 'Без названия') + '»?' +
        (filled ? ' У ' + filled + ' предметов есть значения — они будут удалены.' : ''),
      confirmText: 'Удалить',
      danger: true,
      onConfirm: function () { removeLibraryField(library, field); }
    });
  }

  function removeLibraryField(library, field) {
    var index = library.fields.indexOf(field);
    if (index < 0) return;
    pushHistory();
    library.fields.splice(index, 1);
    library.items.forEach(function (item) {
      delete item.values[field.id];
    });
    if (state.libSelection && state.libSelection.kind === 'field' && state.libSelection.id === field.id) {
      state.libSelection = { kind: 'library', id: library.id };
    }
    markDirty();
    render();
    POM_EDITOR.toast('Характеристика удалена — Ctrl+Z вернёт её');
  }

  function moveLibraryField(library, field, delta) {
    var index = library.fields.indexOf(field);
    var next = index + delta;
    if (index < 0 || next < 0 || next >= library.fields.length) return;
    pushHistory();
    library.fields.splice(index, 1);
    library.fields.splice(next, 0, field);
    markDirty();
    render();
  }

  function addLibraryItem(library) {
    pushHistory();
    var item = POM_EDITOR.newLibraryItem(library, 'Предмет ' + (library.items.length + 1));
    library.items.push(item);
    state.libraryMode = 'items';
    state.libSelection = { kind: 'item', id: item.id };
    markDirty();
    render();
    POM_EDITOR.toast('Предмет добавлен');
    setTimeout(function () {
      var input = document.querySelector('.lib-items-table tr[data-item-id="' + item.id + '"] .lib-item-name');
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function deleteLibraryItem(library, item) {
    var index = library.items.indexOf(item);
    if (index < 0) return;
    pushHistory();
    library.items.splice(index, 1);
    if (state.libSelection && state.libSelection.kind === 'item' && state.libSelection.id === item.id) {
      state.libSelection = { kind: 'library', id: library.id };
    }
    markDirty();
    render();
    POM_EDITOR.toast('Предмет удалён — Ctrl+Z вернёт его');
  }

  function duplicateLibraryItem(library, item) {
    pushHistory();
    var copy = JSON.parse(JSON.stringify(item));
    copy.id = POM_EDITOR.uid('itm');
    copy.name = (item.name || 'Предмет') + ' (копия)';
    library.items.push(copy);
    state.libSelection = { kind: 'item', id: copy.id };
    markDirty();
    render();
    POM_EDITOR.toast('Предмет продублирован');
  }

  function refreshLibraryChrome(library) {
    var rows = document.querySelectorAll('.lib-row[data-library-id="' + library.id + '"]');
    Array.prototype.forEach.call(rows, function (row) {
      var title = row.querySelector('.lib-row-title');
      var icon = row.querySelector('.lib-row-ico');
      var sub = row.querySelector('.lib-row-sub');
      if (title) title.textContent = library.title || 'Без названия';
      if (icon) icon.textContent = library.icon || '▦';
      if (sub) {
        sub.textContent = (library.category ? library.category + ' · ' : '') + library.items.length + ' предм.';
      }
    });
  }

  /* =======================================================
     Библиотека: Excel
     ======================================================= */

  function libraryHeaderRow(library) {
    var row = ['Название'];
    library.fields.forEach(function (field) {
      row.push(field.unit ? field.label + ', ' + field.unit : field.label);
    });
    return row;
  }

  function libraryItemRow(library, item) {
    var row = [item.name || ''];
    library.fields.forEach(function (field) {
      var value = item.values[field.id];
      row.push(value === undefined || value === null ? '' : value);
    });
    return row;
  }

  function exportLibrary(library, withItems) {
    if (withItems === undefined) withItems = true;
    var aoa = [libraryHeaderRow(library)];
    if (withItems) {
      library.items.forEach(function (item) {
        aoa.push(libraryItemRow(library, item));
      });
    }

    var baseName = sanitizeFile(library.title || 'library');
    var suffix = withItems ? '' : '-шаблон';

    if (window.XLSX) {
      var worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = aoa[0].map(function (_, index) {
        return { wch: index === 0 ? 24 : 16 };
      });
      var workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(library.title || 'Библиотека'));

      var schema = [['Подпись', 'Тип', 'Единица', 'Обязательное', 'По умолчанию', 'Варианты']];
      library.fields.forEach(function (field) {
        schema.push([
          field.label || '',
          POM_EDITOR.fieldType(field.type).title,
          field.unit || '',
          field.required ? 'да' : 'нет',
          field.defaultValue || '',
          (field.options || []).join(', ')
        ]);
      });
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(schema), 'Схема');

      var instructions = [
        ['Как заполнять'],
        ['1. Не меняйте заголовки колонок.'],
        ['2. Одна строка — один предмет.'],
        ['3. Числа можно писать с запятой или точкой.'],
        ['4. Колонка «Название» обязательна.'],
        ['5. Лист «Схема» показывает типы и обязательность полей.']
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions), 'Инструкция');

      XLSX.writeFile(workbook, baseName + suffix + '.xlsx');
    } else {
      downloadCsv(aoa, baseName + suffix + '.csv');
    }
    POM_EDITOR.toast(withItems ? 'Экспорт библиотеки готов' : 'Шаблон Excel готов');
  }

  function downloadCsv(aoa, filename) {
    var lines = aoa.map(function (row) {
      return row.map(csvCell).join(';');
    });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvCell(value) {
    var text = value === undefined || value === null ? '' : String(value);
    if (/[";\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function sanitizeFile(value) {
    return String(value || 'library')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'library';
  }

  function sanitizeSheetName(value) {
    var name = String(value || 'Лист')
      .replace(/[\\/:*?"<>|\[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31);
    return name || 'Лист';
  }

  function openLibraryImport(library) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;

      if (/\.csv$/i.test(file.name || '')) {
        var csvReader = new FileReader();
        csvReader.onload = function () {
          parseLibraryImport(library, parseCsvRows(csvReader.result));
        };
        csvReader.readAsText(file, 'utf-8');
        return;
      }

      if (window.XLSX) {
        if (file.arrayBuffer) {
          file.arrayBuffer().then(function (buffer) {
            var workbook = XLSX.read(buffer, { type: 'array' });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
            parseLibraryImport(library, rows);
          }).catch(function () {
            POM_EDITOR.toast('Не удалось прочитать файл', 'error');
          });
        } else {
          var reader = new FileReader();
          reader.onload = function () {
            var workbook = XLSX.read(reader.result, { type: 'array' });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
            parseLibraryImport(library, rows);
          };
          reader.readAsArrayBuffer(file);
        }
        return;
      }

      var textReader = new FileReader();
      textReader.onload = function () {
        parseLibraryImport(library, parseCsvRows(textReader.result));
      };
      textReader.readAsText(file, 'utf-8');
    });
    input.click();
  }

  function parseLibraryImport(library, rows) {
    if (!rows || !rows.length) {
      POM_EDITOR.toast('Файл пустой', 'error');
      return;
    }

    var header = rows[0].map(function (value) {
      return String(value == null ? '' : value).trim();
    });
    var nameIndex = -1;
    var fieldIndexes = {};
    var unknown = [];

    header.forEach(function (title, index) {
      var normalized = normalizeHeader(title);
      if (!normalized) return;
      if (normalized === 'название' || normalized === 'name' || normalized === 'имя') {
        nameIndex = index;
        return;
      }
      var matched = null;
      library.fields.forEach(function (field) {
        if (matched) return;
        var candidates = [
          field.label,
          field.unit ? field.label + ', ' + field.unit : '',
          field.unit ? field.label + ' (' + field.unit + ')' : ''
        ];
        for (var i = 0; i < candidates.length; i++) {
          if (candidates[i] && normalizeHeader(candidates[i]) === normalized) {
            matched = field;
            return;
          }
        }
      });
      if (matched) fieldIndexes[matched.id] = index;
      else unknown.push(title);
    });

    if (nameIndex < 0) {
      POM_EDITOR.toast('В файле нет колонки «Название»', 'error');
      return;
    }

    var missingRequired = library.fields.filter(function (field) {
      return field.required && fieldIndexes[field.id] === undefined;
    });

    var parsed = [];
    var seen = {};
    for (var r = 1; r < rows.length; r++) {
      var rawRow = rows[r] || [];
      var empty = true;
      for (var c = 0; c < rawRow.length; c++) {
        if (String(rawRow[c] == null ? '' : rawRow[c]).trim() !== '') {
          empty = false;
          break;
        }
      }
      if (empty) continue;

      var name = String(rawRow[nameIndex] == null ? '' : rawRow[nameIndex]).trim();
      var errors = [];
      if (!name) errors.push('не заполнено название');

      var nameKey = name.toLowerCase();
      if (name && seen[nameKey]) errors.push('название повторяется (строка ' + seen[nameKey] + ')');
      else if (name) seen[nameKey] = r + 1;

      var values = {};
      library.fields.forEach(function (field) {
        var index = fieldIndexes[field.id];
        if (index === undefined) return;
        var raw = rawRow[index];
        var valueEmpty = raw === undefined || raw === null || String(raw).trim() === '';
        if (valueEmpty) {
          if (field.required && (field.defaultValue === undefined || field.defaultValue === '')) {
            errors.push('«' + field.label + '» обязательно');
          } else if (field.defaultValue !== undefined && field.defaultValue !== '') {
            values[field.id] = field.defaultValue;
          }
          return;
        }

        if (field.type === 'number') {
          var number = parseNumberCell(raw);
          if (!number.ok) errors.push('«' + field.label + '»: ' + number.error);
          else values[field.id] = number.value;
        } else if (field.type === 'checkbox') {
          var checkbox = parseCheckboxCell(raw);
          if (!checkbox.ok) errors.push('«' + field.label + '»: ' + checkbox.error);
          else values[field.id] = checkbox.value;
        } else if (field.type === 'select') {
          var select = parseSelectCell(raw, field);
          if (!select.ok) errors.push('«' + field.label + '»: ' + select.error);
          else values[field.id] = select.value;
        } else {
          values[field.id] = String(raw).trim();
        }
      });

      parsed.push({ rowNumber: r + 1, name: name, values: values, errors: errors });
    }

    if (!parsed.length) {
      POM_EDITOR.toast('В файле нет строк с предметами', 'error');
      return;
    }

    openLibraryImportPreview(
      library,
      parsed.filter(function (row) { return !row.errors.length; }),
      parsed.filter(function (row) { return row.errors.length; }),
      unknown,
      missingRequired
    );
  }

  function parseNumberCell(raw) {
    if (typeof raw === 'number') {
      return isFinite(raw) ? { ok: true, value: raw } : { ok: false, error: 'ожидается число' };
    }
    var text = String(raw).trim();
    if (!text) return { ok: true, value: '' };
    text = text.replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/,/g, '.');
    text = text.replace(/[^0-9+\-.]/g, '');
    if (!text || text === '+' || text === '-' || text === '.') {
      return { ok: false, error: 'ожидается число' };
    }
    var value = Number(text);
    if (!isFinite(value)) return { ok: false, error: 'ожидается число' };
    return { ok: true, value: value };
  }

  function parseCheckboxCell(raw) {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    var text = String(raw).trim().toLowerCase();
    if (!text || text === '0' || text === 'нет' || text === 'no' || text === 'false' || text === 'ложь') {
      return { ok: true, value: false };
    }
    if (text === '1' || text === 'да' || text === 'yes' || text === 'true' || text === 'истина' || text === '✓') {
      return { ok: true, value: true };
    }
    return { ok: false, error: 'ожидается да/нет' };
  }

  function parseSelectCell(raw, field) {
    var text = String(raw).trim();
    var options = field.options || [];
    for (var i = 0; i < options.length; i++) {
      if (normalizeHeader(options[i]) === normalizeHeader(text)) {
        return { ok: true, value: options[i] };
      }
    }
    return {
      ok: false,
      error: 'нет варианта «' + text + '»' + (options.length ? ' (есть: ' + options.join(', ') + ')' : '')
    };
  }

  function openLibraryImportPreview(library, valid, invalid, unknown, missingRequired) {
    var modal = el('div', 'ed-modal');
    var backdrop = el('div', 'ed-modal-backdrop');
    var card = el('div', 'ed-modal-card ed-import-card');

    var head = el('div', 'ed-modal-head');
    head.appendChild(el('div', 'ed-modal-title', 'Импорт: ' + (library.title || 'библиотека')));
    var close = POM_EDITOR.iconButton('✕', 'Закрыть');
    head.appendChild(close);
    card.appendChild(head);

    var body = el('div', 'ed-modal-body ed-import-body');

    var existingNames = {};
    library.items.forEach(function (item) {
      existingNames[normalizeHeader(item.name)] = true;
    });
    var additions = 0;
    var updates = 0;
    valid.forEach(function (row) {
      if (existingNames[normalizeHeader(row.name)]) updates++;
      else additions++;
    });

    var summary = el('div', 'ed-import-summary');
    summary.appendChild(el('span', 'lib-import-badge', 'Всего: ' + valid.length));
    summary.appendChild(el('span', 'lib-import-badge accent', 'Новых: ' + additions));
    summary.appendChild(el('span', 'lib-import-badge', 'Обновлений: ' + updates));
    summary.appendChild(el('span', 'lib-import-badge', 'Ошибок: ' + invalid.length));
    body.appendChild(summary);

    if (unknown.length) {
      body.appendChild(el('div', 'ed-import-warn',
        'Лишние колонки будут пропущены: ' + unknown.join(', ')));
    }
    if (missingRequired.length) {
      body.appendChild(el('div', 'ed-import-warn',
        'Нет обязательных колонок: ' + missingRequired.map(function (field) {
          return field.label;
        }).join(', ')));
    }

    if (valid.length) {
      var validTable = el('table', 'lib-table ed-import-table');
      var validHead = document.createElement('thead');
      var validHeadRow = document.createElement('tr');
      ['Строка', 'Название', 'Статус'].forEach(function (title) {
        var th = document.createElement('th');
        th.textContent = title;
        validHeadRow.appendChild(th);
      });
      validHead.appendChild(validHeadRow);
      validTable.appendChild(validHead);

      var validBody = document.createElement('tbody');
      valid.slice(0, 20).forEach(function (row) {
        var exists = !!existingNames[normalizeHeader(row.name)];
        var tr = document.createElement('tr');
        tr.appendChild(el('td', null, String(row.rowNumber)));
        tr.appendChild(el('td', null, row.name));
        tr.appendChild(el('td', 'lib-import-status ' + (exists ? 'update' : 'new'),
          exists ? 'обновление' : 'новый'));
        validBody.appendChild(tr);
      });
      validTable.appendChild(validBody);
      body.appendChild(validTable);

      if (valid.length > 20) {
        body.appendChild(el('div', 'ed-hint', 'Показаны первые 20 строк из ' + valid.length + '.'));
      }
    }

    if (invalid.length) {
      var errorTable = el('table', 'lib-table ed-import-table');
      var thead = document.createElement('thead');
      var headRow = document.createElement('tr');
      ['Строка', 'Название', 'Ошибки'].forEach(function (title) {
        var th = document.createElement('th');
        th.textContent = title;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      errorTable.appendChild(thead);

      var tbody = document.createElement('tbody');
      invalid.slice(0, 50).forEach(function (row) {
        var tr = document.createElement('tr');
        tr.appendChild(el('td', null, String(row.rowNumber)));
        tr.appendChild(el('td', null, row.name || '—'));
        tr.appendChild(el('td', 'lib-import-error', row.errors.join('; ')));
        tbody.appendChild(tr);
      });
      errorTable.appendChild(tbody);
      body.appendChild(errorTable);

      if (invalid.length > 50) {
        body.appendChild(el('div', 'ed-hint', 'Показаны первые 50 ошибок из ' + invalid.length + '.'));
      }
    }

    card.appendChild(body);

    var foot = el('div', 'ed-confirm-foot');
    var cancel = POM_EDITOR.button('Отмена');
    var accept = POM_EDITOR.button('Импортировать ' + valid.length, {
      className: 'ed-btn-accent',
      disabled: valid.length === 0
    });
    foot.appendChild(cancel);
    foot.appendChild(accept);
    card.appendChild(foot);

    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    function closeModal() {
      document.removeEventListener('keydown', onKey);
      modal.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape') closeModal();
    }

    cancel.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    close.addEventListener('click', closeModal);
    accept.addEventListener('click', function () {
      if (!valid.length) return;
      closeModal();
      applyLibraryImport(library, valid);
    });
    document.addEventListener('keydown', onKey);
  }

  function applyLibraryImport(library, valid) {
    pushHistory();
    var existing = {};
    library.items.forEach(function (item) {
      existing[normalizeHeader(item.name)] = item;
    });

    var added = 0;
    var updated = 0;
    valid.forEach(function (row) {
      var key = normalizeHeader(row.name);
      var item = existing[key];
      if (item) {
        Object.keys(row.values).forEach(function (fieldId) {
          item.values[fieldId] = row.values[fieldId];
        });
        updated++;
      } else {
        var created = { id: POM_EDITOR.uid('itm'), name: row.name, values: row.values };
        library.items.push(created);
        existing[key] = created;
        added++;
      }
    });

    markDirty();
    render();
    POM_EDITOR.toast('Импорт: добавлено ' + added + ', обновлено ' + updated);
  }

  function normalizeHeader(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .replace(/[.;:]+$/g, '')
      .trim();
  }

  function parseCsvRows(text) {
    var source = String(text || '').replace(/^\uFEFF/, '');
    var delimiter = detectCsvDelimiter(source);
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;

    for (var i = 0; i < source.length; i++) {
      var ch = source[i];
      if (quoted) {
        if (ch === '"') {
          if (source[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }

    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function detectCsvDelimiter(text) {
    var first = String(text || '').split(/\r?\n/)[0] || '';
    var semicolons = (first.match(/;/g) || []).length;
    var commas = (first.match(/,/g) || []).length;
    return semicolons >= commas ? ';' : ',';
  }

  function inspectorLibraries(root) {
    var library = ensureActiveLibrary();
    if (!library) {
      var empty = el('div', 'insp-block');
      empty.appendChild(el('div', 'insp-title', 'Библиотеки'));
      empty.appendChild(el('div', 'insp-note', 'Создайте первый список, чтобы добавлять предметы.'));
      root.appendChild(empty);
      return;
    }

    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Библиотека'));
    block.appendChild(inspRow('Название', library.title || '—'));
    block.appendChild(inspRow('Категория', library.category || '—'));
    block.appendChild(inspRow('Характеристик', String(library.fields.length)));
    block.appendChild(inspRow('Предметов', String(library.items.length)));
    block.appendChild(inspRow('Позиция',
      (state.project.libraries.indexOf(library) + 1) + ' из ' + state.project.libraries.length));
    root.appendChild(block);

    var actions = el('div', 'insp-block');
    actions.appendChild(el('div', 'insp-title', 'Действия'));
    var row = el('div', 'insp-actions');
    var schemaBtn = POM_EDITOR.button('Схема');
    schemaBtn.addEventListener('click', function () {
      state.libraryMode = 'schema';
      render();
    });
    row.appendChild(schemaBtn);
    var itemsBtn = POM_EDITOR.button('Предметы');
    itemsBtn.addEventListener('click', function () {
      state.libraryMode = 'items';
      render();
    });
    row.appendChild(itemsBtn);
    var del = POM_EDITOR.button('Удалить', { className: 'ed-btn-danger' });
    del.addEventListener('click', function () { deleteLibrary(library); });
    row.appendChild(del);
    actions.appendChild(row);
    root.appendChild(actions);

    if (state.libSelection && state.libSelection.kind === 'field') {
      var field = findLibraryField(library, state.libSelection.id);
      if (field) {
        var fieldBlock = el('div', 'insp-block');
        fieldBlock.appendChild(el('div', 'insp-title', 'Характеристика'));
        fieldBlock.appendChild(inspRow('Подпись', field.label || '—'));
        fieldBlock.appendChild(inspRow('Тип', POM_EDITOR.fieldType(field.type).title));
        fieldBlock.appendChild(inspRow('Единица', field.unit || '—'));
        fieldBlock.appendChild(inspRow('Обязательное', field.required ? 'да' : 'нет'));
        if (field.type === 'select') {
          fieldBlock.appendChild(inspRow('Варианты', (field.options || []).join(', ') || '—'));
        }
        root.appendChild(fieldBlock);
      }
    } else if (state.libSelection && state.libSelection.kind === 'item') {
      var item = findLibraryItem(library, state.libSelection.id);
      if (item) {
        var filled = library.fields.filter(function (field) {
          var value = item.values[field.id];
          return value !== undefined && value !== null && value !== '';
        }).length;
        var itemBlock = el('div', 'insp-block');
        itemBlock.appendChild(el('div', 'insp-title', 'Предмет'));
        itemBlock.appendChild(inspRow('Название', item.name || '—'));
        itemBlock.appendChild(inspRow('Заполнено', filled + ' из ' + library.fields.length));
        root.appendChild(itemBlock);
      }
    }
  }

  /* =======================================================
     Логика: макросы кнопок, чисел и текста
     ======================================================= */

  function renderLogic(workspace) {
    state.project.macros = state.project.macros || [];
    if (state.activeMacroId && !findMacro(state.activeMacroId)) {
      state.activeMacroId = null;
      state.activeStepId = null;
    }
    var layout = el('div', 'logic-layout');
    layout.appendChild(renderLogicTree());
    layout.appendChild(renderLogicEditor());
    workspace.appendChild(layout);
  }

  function renderLogicTree() {
    var card = el('section', 'ed-card logic-tree');
    var head = el('div', 'logic-tree-head');
    head.appendChild(el('div', 'lib-rail-title', 'Источники'));
    head.appendChild(el('span', 'logic-tree-count', state.project.macros.length + ' макр.'));
    card.appendChild(head);
    card.appendChild(el('div', 'ed-hint',
      'Кнопка — выбрать макрос. Число или поле предмета — вставить в формулу. ⚡ — логика изменения.'));

    var surfaces = logicSurfaces();
    var sheets = surfaces.filter(function (info) { return info.surface === 'sheet'; });
    var panel = surfaces.filter(function (info) { return info.surface === 'panel'; });

    card.appendChild(renderLogicSurface('Лист персонажа', sheets, true));
    card.appendChild(renderLogicSurface('Боковая панель', panel, false));
    return card;
  }

  function renderLogicSurface(title, surfaces, groupBySheet) {
    var details = el('details', 'logic-surface');
    details.open = true;
    var summary = document.createElement('summary');
    summary.appendChild(el('span', null, title));
    summary.appendChild(el('span', 'logic-count', String(surfaces.length)));
    details.appendChild(summary);

    if (!surfaces.length) {
      details.appendChild(el('div', 'logic-empty-small', 'Пока нет вкладок'));
      return details;
    }

    if (!groupBySheet) {
      surfaces.forEach(function (info) { details.appendChild(renderLogicTab(info)); });
      return details;
    }

    var groups = {};
    surfaces.forEach(function (info) {
      var key = info.sheetId || 'sheet';
      if (!groups[key]) groups[key] = { title: info.sheetTitle || 'Лист', items: [] };
      groups[key].items.push(info);
    });
    Object.keys(groups).forEach(function (key) {
      var sheetGroup = el('details', 'logic-sheet');
      sheetGroup.open = true;
      var sheetSummary = document.createElement('summary');
      sheetSummary.appendChild(el('span', null, groups[key].title));
      sheetSummary.appendChild(el('span', 'logic-count', String(groups[key].items.length)));
      sheetGroup.appendChild(sheetSummary);
      groups[key].items.forEach(function (info) {
        sheetGroup.appendChild(renderLogicTab(info));
      });
      details.appendChild(sheetGroup);
    });
    return details;
  }

  function renderLogicTab(info) {
    var items = logicViewItems(info.view);
    var groups = logicGroups(items);
    var details = el('details', 'logic-tab');
    details.open = true;
    var summary = document.createElement('summary');
    summary.appendChild(el('span', null, info.tabTitle || 'Вкладка'));
    summary.appendChild(el('span', 'logic-count', String(items.length)));
    details.appendChild(summary);

    if (!items.length) {
      details.appendChild(el('div', 'logic-empty-small', 'Нет компонентов'));
      return details;
    }

    [
      renderLogicGroup('Кнопки', groups.buttons, 'button', info),
      renderLogicLibraryGroup(groups.libraries, info),
      renderLogicGroup('Числа', groups.numbers, 'number', info),
      renderLogicGroup('Заголовки', groups.headings, 'heading', info),
      renderLogicGroup('Текстовые поля', groups.texts, 'text', info)
    ].forEach(function (group) {
      if (group) details.appendChild(group);
    });
    return details;
  }

  function renderLogicGroup(title, items, kind, info) {
    if (!items.length) return null;
    var group = el('div', 'logic-group');
    var head = el('div', 'logic-group-head');
    head.appendChild(el('span', null, title));
    head.appendChild(el('span', 'logic-count', String(items.length)));
    group.appendChild(head);
    items.forEach(function (item) {
      group.appendChild(renderLogicItem(item, kind, info));
    });
    return group;
  }

  function renderLogicLibraryGroup(items, info) {
    if (!items.length) return null;
    var group = el('div', 'logic-group');
    var head = el('div', 'logic-group-head');
    head.appendChild(el('span', null, 'Предметы'));
    head.appendChild(el('span', 'logic-count', String(items.length)));
    group.appendChild(head);
    items.forEach(function (item) {
      group.appendChild(renderLogicLibraryItem(item, info));
    });
    return group;
  }

  function renderLogicLibraryItem(item, info) {
    var wrap = el('div', 'logic-library');
    var library = findLibrary(item.libraryId);
    var fixed = library && item.itemId ? findLibraryItem(library, item.itemId) : null;

    var row = el('div', 'logic-item logic-library-head');
    row.appendChild(el('span', 'logic-item-ico', '▣'));
    row.appendChild(el('span', 'logic-item-label', item.label || 'Предмет'));
    row.appendChild(el('span', 'logic-item-badge',
      fixed ? fixed.name : (library ? 'выбранный предмет' : 'нет библиотеки')));
    wrap.appendChild(row);

    if (!library) {
      wrap.appendChild(el('div', 'logic-empty-small', 'Библиотека не выбрана'));
      return wrap;
    }

    var numbers = (library.fields || []).filter(function (field) {
      return field.type === 'number';
    });
    var texts = (library.fields || []).filter(function (field) {
      return field.type === 'text' || field.type === 'textarea' || field.type === 'label';
    });
    wrap.appendChild(renderLogicFieldList(item, library, numbers, 'number', fixed));
    wrap.appendChild(renderLogicFieldList(item, library, texts, 'text', fixed));
    return wrap;
  }

  function renderLogicFieldList(component, library, fields, kind, fixed) {
    var list = el('div', 'logic-library-fields');
    fields.forEach(function (field) {
      var row = el('div', 'logic-item logic-field-item');
      row.appendChild(el('span', 'logic-item-ico', kind === 'number' ? '#' : 'Aa'));
      row.appendChild(el('span', 'logic-item-label', field.label || 'Поле'));
      var value = fixed && fixed.values ? fixed.values[field.id] : '';
      if (value !== undefined && value !== null && value !== '') {
        row.appendChild(el('span', 'logic-field-value', String(value)));
      }
      row.addEventListener('click', function () {
        if (state.logicFocus && document.body.contains(state.logicFocus)) {
          insertLogicText('{{' + component.id + '.' + field.id + '}}');
          return;
        }
        POM_EDITOR.toast('Сначала выберите поле формулы');
      });
      list.appendChild(row);
    });
    return list;
  }

  function renderLogicItem(item, kind, info) {
    var row = el('div', 'logic-item');
    row.tabIndex = 0;
    var trigger = kind === 'button' ? 'click' : 'change';
    var macro = (kind === 'button' || kind === 'number')
      ? findMacroForTarget(info, item.id, trigger)
      : null;
    if (macro && state.activeMacroId === macro.id) row.classList.add('active');

    var current = activeStep();
    if (current && current.type === 'setText' && current.targetId === item.id) {
      row.classList.add('target');
    }
    if (current && (current.type === 'set' || current.type === 'add') && current.targetId === item.id) {
      row.classList.add('target');
    }

    row.appendChild(el('span', 'logic-item-ico', logicItemIcon(item)));
    row.appendChild(el('span', 'logic-item-label', logicItemLabel(item)));
    if (macro) row.appendChild(el('span', 'logic-item-badge', '⚡'));

    if (kind === 'number') {
      var change = POM_EDITOR.iconButton('⚡', 'Логика изменения', { className: 'logic-trigger' });
      change.addEventListener('click', function (e) {
        e.stopPropagation();
        ensureMacroForTarget(info, item, 'change');
      });
      row.appendChild(change);
    }

    row.addEventListener('click', function () {
      if (kind === 'button') {
        ensureMacroForTarget(info, item, 'click');
        return;
      }
      if (state.logicFocus && document.body.contains(state.logicFocus)) {
        insertLogicToken(item);
        return;
      }
      var step = activeStep();
      if (kind === 'number' && step && (step.type === 'set' || step.type === 'add')) {
        pushHistory();
        step.targetId = item.id;
        state.activeStepId = step.id;
        state.logicFocus = null;
        markDirty();
        render();
        POM_EDITOR.toast('Число выбрано как цель');
        return;
      }
      if ((kind === 'text' || kind === 'heading') && step && step.type === 'setText') {
        pushHistory();
        step.targetId = item.id;
        state.activeStepId = step.id;
        state.logicFocus = null;
        markDirty();
        render();
        POM_EDITOR.toast('Текстовый блок выбран как цель');
        return;
      }
      POM_EDITOR.toast('Сначала выберите поле формулы или действие');
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
    return row;
  }

  function logicSurfaces() {
    var result = [];
    (state.project.sheets || []).forEach(function (sheet) {
      (sheet.tabs || []).forEach(function (tab) {
        result.push({
          surface: 'sheet',
          surfaceTitle: 'Лист персонажа',
          sheetId: sheet.id,
          sheetTitle: sheet.title || 'Лист',
          tabId: tab.id,
          tabTitle: tab.title || 'Вкладка',
          view: tab
        });
      });
    });
    (state.project.panel.views || []).forEach(function (view) {
      result.push({
        surface: 'panel',
        surfaceTitle: 'Боковая панель',
        sheetId: null,
        sheetTitle: '',
        tabId: view.id,
        tabTitle: view.title || 'Вкладка',
        view: view
      });
    });
    return result;
  }

  function logicViewItems(view) {
    var items = [];
    (view.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) { items.push(item); });
    });
    return items;
  }

  function logicItemsForMacro(macro) {
    if (!macro) return [];
    var result = [];
    if (macro.surface === 'sheet') {
      var sheet = findSheet(macro.sheetId);
      if (!sheet) return [];
      (sheet.tabs || []).forEach(function (tab) {
        logicViewItems(tab).forEach(function (item) { result.push(item); });
      });
    } else {
      (state.project.panel.views || []).forEach(function (view) {
        logicViewItems(view).forEach(function (item) { result.push(item); });
      });
    }
    return result;
  }

  function logicGroups(items) {
    return {
      buttons: items.filter(function (item) { return item.type === 'button'; }),
      libraries: items.filter(function (item) { return item.type === 'library'; }),
      numbers: items.filter(function (item) { return item.type === 'number'; }),
      headings: items.filter(function (item) { return item.type === 'label'; }),
      texts: items.filter(function (item) {
        return item.type === 'text' || item.type === 'textarea';
      })
    };
  }

  function logicItemLabel(item) {
    if (!item) return '—';
    if (item.type === 'button') return item.text || 'Кнопка';
    if (item.type === 'label') return item.text || 'Заголовок';
    return item.label || item.placeholder || 'Поле';
  }

  function logicItemIcon(item) {
    if (!item) return '•';
    if (item.type === 'button') return '▶';
    if (item.type === 'library') return '▣';
    if (item.type === 'number') return '#';
    if (item.type === 'label') return 'T';
    if (item.type === 'textarea') return '¶';
    if (item.type === 'text') return 'Aa';
    return '•';
  }

  function findMacro(id) {
    var macros = state.project.macros || [];
    for (var i = 0; i < macros.length; i++) {
      if (macros[i].id === id) return macros[i];
    }
    return null;
  }

  function findMacroForTarget(info, itemId, trigger) {
    var macros = state.project.macros || [];
    for (var i = 0; i < macros.length; i++) {
      var macro = macros[i];
      if (macro.surface !== info.surface) continue;
      if ((macro.sheetId || null) !== (info.sheetId || null)) continue;
      if (macro.tabId !== info.tabId) continue;
      if (macro.itemId !== itemId) continue;
      if ((macro.trigger || 'click') !== trigger) continue;
      return macro;
    }
    return null;
  }

  function ensureMacroForTarget(info, item, trigger) {
    var macro = findMacroForTarget(info, item.id, trigger);
    if (!macro) {
      pushHistory();
      macro = POM_EDITOR.newMacro({
        name: logicItemLabel(item),
        surface: info.surface,
        sheetId: info.sheetId,
        tabId: info.tabId,
        itemId: item.id,
        trigger: trigger
      });
      state.project.macros.push(macro);
      markDirty();
      renderNav();
    }
    state.activeMacroId = macro.id;
    state.activeStepId = null;
    state.logicFocus = null;
    render();
    return macro;
  }

  function resolveMacroTarget(macro) {
    if (!macro) return null;
    var view = null;
    if (macro.surface === 'sheet') {
      var sheet = findSheet(macro.sheetId);
      if (!sheet) return null;
      (sheet.tabs || []).forEach(function (tab) {
        if (tab.id === macro.tabId) view = tab;
      });
    } else {
      (state.project.panel.views || []).forEach(function (panelView) {
        if (panelView.id === macro.tabId) view = panelView;
      });
    }
    if (!view) return null;
    var found = null;
    (view.sections || []).forEach(function (section) {
      (section.items || []).forEach(function (item) {
        if (item.id === macro.itemId) found = item;
      });
    });
    return found;
  }

  function activeMacro() {
    return findMacro(state.activeMacroId);
  }

  function findStepById(steps, id) {
    if (!steps || !id) return null;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].id === id) return steps[i];
      if (steps[i].type === 'if') {
        var found = findStepById(steps[i].then, id) || findStepById(steps[i].else, id);
        if (found) return found;
      }
    }
    return null;
  }

  function activeStep() {
    var macro = activeMacro();
    if (!macro) return null;
    return findStepById(macro.steps, state.activeStepId);
  }

  function selectLogicStep(stepId, box) {
    state.activeStepId = stepId;
    state.logicFocus = null;
    Array.prototype.forEach.call(document.querySelectorAll('.logic-step.selected'), function (node) {
      node.classList.remove('selected');
    });
    if (box) box.classList.add('selected');
  }

  function insertLogicText(text) {
    var input = state.logicFocus;
    if (!input || !document.body.contains(input)) {
      POM_EDITOR.toast('Сначала выберите поле формулы');
      return;
    }
    var start = input.selectionStart == null ? input.value.length : input.selectionStart;
    var end = input.selectionEnd == null ? start : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start + text.length;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function insertLogicToken(item) {
    insertLogicText('{{' + item.id + '}}');
  }

  function logicTokenMap(macro) {
    var map = {};
    logicItemsForMacro(macro).forEach(function (item) {
      map[item.id] = logicItemLabel(item);
      if (item.type === 'library') {
        var library = findLibrary(item.libraryId);
        (library ? library.fields : []).forEach(function (field) {
          map[item.id + '.' + field.id] =
            logicItemLabel(item) + ' / ' + (field.label || 'Поле');
        });
      }
    });
    return map;
  }

  function logicFormulaText(value, map) {
    return String(value == null ? '' : value).replace(/\{\{([^}]+)\}\}/g, function (match, id) {
      return map[id] ? '[' + map[id] + ']' : '[?]';
    });
  }

  function renderLogicEditor() {
    var card = el('section', 'ed-card logic-editor');
    var macro = activeMacro();
    if (!macro) {
      var empty = el('div', 'logic-empty');
      empty.appendChild(el('div', 'ed-empty-ico', '⚡'));
      empty.appendChild(el('div', 'ed-empty-title', 'Выберите кнопку или число'));
      empty.appendChild(el('div', 'ed-empty-text',
        'Слева выберите кнопку, чтобы написать макрос, или ⚡ у числового поля, чтобы реагировать на изменение.'));
      card.appendChild(empty);
      return card;
    }

    macro.steps = macro.steps || [];
    var target = resolveMacroTarget(macro);
    var head = el('div', 'logic-head');
    var titleBox = el('div', 'logic-title-box');
    titleBox.appendChild(el('div', 'logic-title', target ? logicItemLabel(target) : 'Цель не найдена'));
    titleBox.appendChild(el('div', 'logic-sub',
      (macro.trigger === 'change' ? 'Изменение числа' : 'Нажатие кнопки') +
      ' · ' + (macro.surface === 'sheet' ? 'лист персонажа' : 'боковая панель')));
    head.appendChild(titleBox);

    var actions = el('span', 'logic-head-actions');
    var del = POM_EDITOR.iconButton('✕', 'Удалить макрос', { className: 'danger' });
    del.addEventListener('click', function () { deleteMacro(macro); });
    actions.appendChild(del);
    head.appendChild(actions);
    card.appendChild(head);

    if (!target) {
      card.appendChild(el('div', 'logic-warning',
        'Компонент-цель не найден. Возможно, он удалён или перенесён.'));
    }

    card.appendChild(renderLogicPalette(macro, macro.steps, false));
    card.appendChild(el('div', 'ed-hint',
      'Нажмите на число слева, чтобы вставить {{...}} в формулу. Кнопка «В чат» пишет в лог стола.'));
    card.appendChild(renderLogicSteps(macro, macro.steps, false));
    return card;
  }

  function renderLogicPalette(macro, list, compact) {
    var palette = el('div', 'logic-palette' + (compact ? ' compact' : ''));
    palette.appendChild(el('span', 'logic-palette-label', compact ? '+' : 'Добавить действие:'));
    LOGIC_STEPS.forEach(function (meta) {
      var btn = POM_EDITOR.button(meta.icon + ' ' + meta.title, {
        className: 'ed-btn-xs',
        title: meta.hint
      });
      btn.addEventListener('click', function () {
        pushHistory();
        var step = POM_EDITOR.newLogicStep(meta.type);
        list.push(step);
        state.activeStepId = step.id;
        state.logicFocus = null;
        markDirty();
        render();
      });
      palette.appendChild(btn);
    });
    return palette;
  }

  function renderLogicSteps(macro, steps, nested) {
    var wrap = el('div', 'logic-steps' + (nested ? ' nested' : ''));
    var list = steps || [];
    if (!list.length) {
      wrap.appendChild(el('div', 'logic-steps-empty', 'Действий пока нет'));
      return wrap;
    }
    list.forEach(function (step, index) {
      wrap.appendChild(renderLogicStep(macro, step, list, index, nested));
    });
    return wrap;
  }

  function renderLogicStep(macro, step, list, index, nested) {
    var meta = logicStepMeta(step.type);
    var box = el('div', 'logic-step' + (state.activeStepId === step.id ? ' selected' : ''));
    box.dataset.stepId = step.id;

    var head = el('div', 'logic-step-head');
    head.appendChild(el('span', 'logic-step-ico', meta.icon));
    head.appendChild(el('span', 'logic-step-title', meta.title));

    var headActions = el('span', 'logic-step-actions');
    var up = POM_EDITOR.iconButton('▲', 'Выше', { disabled: index === 0 });
    up.addEventListener('click', function (e) {
      e.stopPropagation();
      moveLogicStep(list, index, -1);
    });
    var down = POM_EDITOR.iconButton('▼', 'Ниже', { disabled: index === list.length - 1 });
    down.addEventListener('click', function (e) {
      e.stopPropagation();
      moveLogicStep(list, index, 1);
    });
    var remove = POM_EDITOR.iconButton('✕', 'Удалить действие', { className: 'danger' });
    remove.addEventListener('click', function (e) {
      e.stopPropagation();
      removeLogicStep(list, index);
    });
    headActions.appendChild(up);
    headActions.appendChild(down);
    headActions.appendChild(remove);
    head.appendChild(headActions);
    head.addEventListener('click', function () { selectLogicStep(step.id, box); });
    box.appendChild(head);

    var body = el('div', 'logic-step-body');
    body.addEventListener('click', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      selectLogicStep(step.id, box);
    });

    if (step.type === 'ask') {
      body.appendChild(logicInputField(step, 'label', 'Вопрос', 'Например: Модификатор'));
      body.appendChild(logicInputField(step, 'key', 'Ключ', 'mod'));
      body.appendChild(logicInputTypeField(step));
      var insert = POM_EDITOR.button('Вставить @ask.' + (step.key || 'answer'), { className: 'ed-btn-xs' });
      insert.addEventListener('click', function () {
        insertLogicText('@ask.' + (step.key || 'answer'));
      });
      body.appendChild(insert);
    } else if (step.type === 'roll') {
      body.appendChild(logicInputField(step, 'title', 'Название броска', 'Атака'));
      body.appendChild(logicFormulaField(macro, step, 'formula', 'Формула', 'd20 + {{...}}'));
      body.appendChild(el('div', 'ed-hint', 'Результат предыдущего броска доступен как @last.total.'));
    } else if (step.type === 'set' || step.type === 'add') {
      body.appendChild(logicTargetSelect(macro, step, 'targetId', 'number'));
      body.appendChild(logicFormulaField(macro, step, 'value', 'Значение', '{{...}} + 1'));
    } else if (step.type === 'setText') {
      body.appendChild(logicTargetSelect(macro, step, 'targetId', 'text'));
      body.appendChild(logicInputField(step, 'value', 'Новый текст', 'Ранен'));
      body.appendChild(el('div', 'ed-hint', 'Можно вставить число или поле: {{...}}.'));
    } else if (step.type === 'if') {
      body.appendChild(logicFormulaField(macro, step, 'condition', 'Условие', '{{...}} < 10'));
      body.appendChild(renderLogicBranch(macro, step, 'then', 'Тогда'));
      body.appendChild(renderLogicBranch(macro, step, 'else', 'Иначе'));
    } else if (step.type === 'log') {
      body.appendChild(logicInputField(step, 'text', 'Сообщение', 'Текст в чат'));
    }

    var warning = logicStepWarning(macro, step);
    if (warning) body.appendChild(el('div', 'logic-warning', warning));
    box.appendChild(body);
    return box;
  }

  function logicStepMeta(type) {
    for (var i = 0; i < LOGIC_STEPS.length; i++) {
      if (LOGIC_STEPS[i].type === type) return LOGIC_STEPS[i];
    }
    return { type: type, title: type, icon: '•', hint: '' };
  }

  function logicInputField(step, key, label, placeholder) {
    var wrap = el('label', 'logic-field');
    wrap.appendChild(el('span', 'logic-field-label', label));
    var input = POM_EDITOR.input(step[key] == null ? '' : step[key], {
      placeholder: placeholder,
      className: 'logic-input'
    });
    input.addEventListener('focus', function () {
      state.logicFocus = input;
      pushHistory();
    });
    input.addEventListener('input', function () {
      step[key] = input.value;
      markDirty();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function logicInputTypeField(step) {
    var wrap = el('label', 'logic-field');
    wrap.appendChild(el('span', 'logic-field-label', 'Тип ответа'));
    var select = document.createElement('select');
    select.className = 'ed-input';
    [['number', 'Число'], ['text', 'Текст']].forEach(function (pair) {
      var option = document.createElement('option');
      option.value = pair[0];
      option.textContent = pair[1];
      select.appendChild(option);
    });
    select.value = step.input || 'number';
    select.addEventListener('change', function () {
      pushHistory();
      step.input = select.value;
      state.logicFocus = null;
      markDirty();
    });
    wrap.appendChild(select);
    return wrap;
  }

  function logicFormulaField(macro, step, key, label, placeholder) {
    var wrap = el('label', 'logic-field');
    wrap.appendChild(el('span', 'logic-field-label', label));
    var input = POM_EDITOR.input(step[key] == null ? '' : step[key], {
      placeholder: placeholder,
      className: 'logic-formula'
    });
    var preview = el('div', 'logic-preview',
      logicFormulaText(step[key], logicTokenMap(macro)) || '—');
    input.addEventListener('focus', function () {
      state.logicFocus = input;
      pushHistory();
    });
    input.addEventListener('input', function () {
      step[key] = input.value;
      markDirty();
      preview.textContent = logicFormulaText(step[key], logicTokenMap(macro)) || '—';
    });
    wrap.appendChild(input);
    wrap.appendChild(preview);
    return wrap;
  }

  function logicTargetSelect(macro, step, key, kind) {
    var wrap = el('label', 'logic-field');
    wrap.appendChild(el('span', 'logic-field-label', kind === 'number' ? 'Число' : 'Текст'));
    var select = document.createElement('select');
    select.className = 'ed-input';
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '—';
    select.appendChild(empty);

    var options = logicItemsForMacro(macro).filter(function (item) {
      if (kind === 'number') return item.type === 'number';
      return item.type === 'label' || item.type === 'text' || item.type === 'textarea';
    });
    options.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = logicItemLabel(item);
      select.appendChild(option);
    });
    select.value = step[key] || '';
    select.addEventListener('change', function () {
      pushHistory();
      step[key] = select.value;
      state.logicFocus = null;
      markDirty();
    });
    wrap.appendChild(select);
    if (!options.length) {
      wrap.appendChild(el('div', 'ed-hint',
        kind === 'number' ? 'Нет числовых полей.' : 'Нет текстовых блоков.'));
    }
    return wrap;
  }

  function renderLogicBranch(macro, step, key, title) {
    if (!Array.isArray(step[key])) step[key] = [];
    var branch = el('div', 'logic-branch');
    branch.appendChild(el('div', 'logic-branch-title', title));
    branch.appendChild(renderLogicSteps(macro, step[key], true));
    branch.appendChild(renderLogicPalette(macro, step[key], true));
    return branch;
  }

  function moveLogicStep(list, index, delta) {
    var next = index + delta;
    if (index < 0 || next < 0 || next >= list.length) return;
    pushHistory();
    var moved = list.splice(index, 1)[0];
    list.splice(next, 0, moved);
    markDirty();
    render();
  }

  function removeLogicStep(list, index) {
    if (index < 0 || index >= list.length) return;
    var removed = list[index];
    pushHistory();
    list.splice(index, 1);
    if (state.activeStepId === removed.id) state.activeStepId = null;
    markDirty();
    render();
  }

  function logicStepWarning(macro, step) {
    if (!step) return '';
    if (step.type === 'roll' && !String(step.formula || '').trim()) {
      return 'Заполните формулу броска.';
    }
    if (step.type === 'set' || step.type === 'add') {
      if (!step.targetId) return 'Выберите числовой контейнер.';
      if (!String(step.value || '').trim()) return 'Заполните значение.';
    }
    if (step.type === 'setText' && !step.targetId) {
      return 'Выберите заголовок или текстовое поле.';
    }
    if (step.type === 'if') {
      if (!String(step.condition || '').trim()) return 'Заполните условие.';
      if (!(step.then || []).length && !(step.else || []).length) {
        return 'Добавьте действие в ветку.';
      }
    }
    if (step.type === 'ask') {
      var key = String(step.key || '').trim();
      if (!key) return 'Укажите ключ ответа.';
      var keys = collectAskKeys(macro.steps, {});
      if (keys[key] > 1) return 'Ключ ответа повторяется.';
    }
    if (step.type === 'log' && !String(step.text || '').trim()) {
      return 'Заполните сообщение.';
    }
    return '';
  }

  function collectAskKeys(steps, map) {
    (steps || []).forEach(function (step) {
      if (step.type === 'ask') {
        var key = String(step.key || '').trim();
        if (key) map[key] = (map[key] || 0) + 1;
      }
      if (step.type === 'if') {
        collectAskKeys(step.then, map);
        collectAskKeys(step.else, map);
      }
    });
    return map;
  }

  function countLogicSteps(steps) {
    var count = 0;
    (steps || []).forEach(function (step) {
      count++;
      if (step.type === 'if') {
        count += countLogicSteps(step.then) + countLogicSteps(step.else);
      }
    });
    return count;
  }

  function countLogicWarnings(macro) {
    var warnings = 0;
    function walk(steps) {
      (steps || []).forEach(function (step) {
        if (logicStepWarning(macro, step)) warnings++;
        if (step.type === 'if') {
          walk(step.then);
          walk(step.else);
        }
      });
    }
    walk(macro.steps);
    return warnings;
  }

  function checkLogic() {
    var macros = state.project.macros || [];
    if (!macros.length) {
      POM_EDITOR.toast('Макросов пока нет');
      return;
    }
    var warnings = 0;
    var first = null;
    macros.forEach(function (macro) {
      var count = countLogicWarnings(macro);
      warnings += count;
      if (!first && count) first = macro;
    });
    if (first) {
      state.activeMacroId = first.id;
      render();
    }
    POM_EDITOR.toast(warnings
      ? 'Предупреждений: ' + warnings
      : 'Логика без предупреждений');
  }

  function deleteMacro(macro) {
    POM_EDITOR.confirmAction({
      title: 'Удалить макрос',
      text: 'Удалить макрос «' + (macro.name || 'без названия') + '»?',
      confirmText: 'Удалить',
      danger: true,
      onConfirm: function () {
        var index = state.project.macros.indexOf(macro);
        if (index < 0) return;
        pushHistory();
        state.project.macros.splice(index, 1);
        if (state.activeMacroId === macro.id) state.activeMacroId = null;
        state.activeStepId = null;
        state.logicFocus = null;
        markDirty();
        renderNav();
        render();
      }
    });
  }

  function inspectorLogic(root) {
    var macro = activeMacro();
    if (!macro) {
      var empty = el('div', 'insp-block');
      empty.appendChild(el('div', 'insp-title', 'Логика'));
      empty.appendChild(el('div', 'insp-note',
        'Выберите кнопку или числовое поле в дереве слева.'));
      root.appendChild(empty);
      return;
    }
    var target = resolveMacroTarget(macro);
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Макрос'));
    block.appendChild(inspRow('Цель', target ? logicItemLabel(target) : 'не найдена'));
    block.appendChild(inspRow('Триггер', macro.trigger === 'change' ? 'изменение числа' : 'нажатие'));
    block.appendChild(inspRow('Поверхность', macro.surface === 'sheet' ? 'лист персонажа' : 'боковая панель'));
    block.appendChild(inspRow('Действий', String(countLogicSteps(macro.steps))));
    root.appendChild(block);

    var actions = el('div', 'insp-block');
    actions.appendChild(el('div', 'insp-title', 'Действия'));
    var row = el('div', 'insp-actions');
    var check = POM_EDITOR.button('Проверить');
    check.addEventListener('click', checkLogic);
    row.appendChild(check);
    var del = POM_EDITOR.button('Удалить макрос', { className: 'ed-btn-danger' });
    del.addEventListener('click', function () { deleteMacro(macro); });
    row.appendChild(del);
    actions.appendChild(row);
    root.appendChild(actions);
  }

  function renderPublish(workspace) {
    var report = POM_EDITOR.validateProject(state.project);
    var stats = report.stats;

    var main = el('section', 'ed-card');
    main.appendChild(el('h2', 'ed-card-title', 'Публикация'));
    main.appendChild(el('p', 'ed-card-sub',
      'Проверка модуля перед сохранением и установкой в площадку.'));

    var rows = [
      ['Метаданные проекта', 'id, название и версия заполнены',
        !!(state.project.id && state.project.title && /^\d+\.\d+\.\d+/.test(state.project.version || ''))],
      ['Правая панель', 'вкладок: ' + stats.views + ', компонентов: ' + stats.items,
        stats.views > 0],
      ['Листы персонажа', 'листов: ' + stats.sheets, true],
      ['Библиотеки', 'библиотек: ' + stats.libraries, true],
      ['Логика', 'макросов: ' + stats.macros, true]
    ];

    var list = el('div', 'ed-checklist');
    rows.forEach(function (row) {
      var item = el('div', 'ed-check-row' + (row[2] ? ' ready' : ''));
      item.appendChild(el('span', 'ed-check-mark', row[2] ? '●' : '○'));
      var text = el('span', 'ed-check-text');
      text.appendChild(el('span', 'ed-check-title', row[0]));
      text.appendChild(el('span', 'ed-check-sub', row[1]));
      item.appendChild(text);
      item.appendChild(el('span', 'ed-check-state', row[2] ? 'готово' : 'не готово'));
      list.appendChild(item);
    });
    main.appendChild(list);

    var summary = el('div', 'pub-summary');
    summary.appendChild(el('span', 'pub-pill' + (report.errors.length ? ' bad' : ''),
      'Ошибки: ' + report.errors.length));
    summary.appendChild(el('span', 'pub-pill' + (report.warnings.length ? ' warn' : ''),
      'Предупреждения: ' + report.warnings.length));
    main.appendChild(summary);

    if (report.errors.length || report.warnings.length) {
      var issues = el('div', 'pub-issues');
      POM_EDITOR.formatIssues(report, 30).forEach(function (line) {
        var row = el('div', 'pub-issue' + (line.indexOf('Ошибка') === 0 ? ' bad' : ''), line);
        issues.appendChild(row);
      });
      main.appendChild(issues);
    } else {
      main.appendChild(el('div', 'ed-hint',
        'Проверка не нашла проблем. Модуль можно сохранять и передавать в площадку.'));
    }

    var actions = el('div', 'insp-actions');
    var again = POM_EDITOR.button('Проверить снова');
    again.addEventListener('click', function () {
      var fresh = POM_EDITOR.validateProject(state.project);
      render();
      POM_EDITOR.toast(fresh.errors.length
        ? 'Найдены ошибки: ' + fresh.errors.length
        : (fresh.warnings.length ? 'Только предупреждения' : 'Проблем не найдено'));
    });
    var download = POM_EDITOR.button('Скачать JSON');
    download.addEventListener('click', downloadProjectJson);
    actions.appendChild(again);
    actions.appendChild(download);
    main.appendChild(actions);

    var btn = POM_EDITOR.button('Опубликовать модуль', { className: 'ed-btn-accent' });
    btn.disabled = true;
    btn.title = 'Появится после реализации установки в площадку';
    main.appendChild(btn);
    workspace.appendChild(main);
  }

  function plannedCard(title, items) {
    var card = el('section', 'ed-card');
    card.appendChild(el('h2', 'ed-card-title', title));
    var list = el('ul', 'ed-bullets');
    items.forEach(function (text) {
      list.appendChild(el('li', null, text));
    });
    card.appendChild(list);
    card.appendChild(el('div', 'ed-hint', 'Раздел проектируется вместе с конструктором.'));
    return card;
  }

  /* =======================================================
     Инспектор
     ======================================================= */

  function renderInspector() {
    var root = $('#ed-inspector-body');
    root.innerHTML = '';

    if (state.section === 'overview') {
      inspectorProject(root);
      return;
    }

    if (state.section === 'panel') {
      var view = state.activeViewId ? findView(state.activeViewId) : null;
      if (!view) { inspectorChat(root); return; }
      inspectorViewSelection(root, view);
      return;
    }

    if (state.section === 'sheets') {
      var sheet = ensureActiveSheet();
      if (!sheet) { inspectorSheetEmpty(root); return; }
      var sheetView = ensureActiveSheetTab(sheet);
      if (!sheetView) { inspectorSheet(root, sheet); return; }
      inspectorViewSelection(root, sheetView);
      return;
    }

    if (state.section === 'libraries') {
      inspectorLibraries(root);
      return;
    }

    if (state.section === 'formulas') {
      inspectorLogic(root);
      return;
    }

    var generic = el('div', 'insp-block');
    generic.appendChild(el('div', 'insp-title', findSection(state.section).title));
    generic.appendChild(el('div', 'insp-note', 'Раздел в разработке.'));
    root.appendChild(generic);

    var hints = {
      sheets: ['Секции и поля', 'Привязка к персонажу', 'Повторяющиеся блоки'],
      libraries: ['Поля и категории', 'Поиск и фильтры', 'Связи с листами'],
      formulas: ['Выражения без eval', 'Кубы и функции', 'Проверка ошибок'],
      publish: ['Проверка модуля', 'Установка в systems/', 'Версия и совместимость']
    }[state.section] || [];

    if (hints.length) {
      var block = el('div', 'insp-block');
      block.appendChild(el('div', 'insp-title', 'План'));
      var list = el('ul', 'ed-bullets');
      hints.forEach(function (text) { list.appendChild(el('li', null, text)); });
      block.appendChild(list);
      root.appendChild(block);
    }
  }

  function inspectorProject(root) {
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Проект'));
    block.appendChild(inspRow('Формат', 'pom-system'));
    block.appendChild(inspRow('Версия формата', String(state.project.formatVersion)));
    block.appendChild(inspRow('ID', state.project.id || '—'));
    block.appendChild(inspRow('Вкладок', String(state.project.panel.views.length)));
    block.appendChild(inspRow('Листов', String(state.project.sheets.length)));
    block.appendChild(inspRow('Библиотек', String(state.project.libraries.length)));
    block.appendChild(inspRow('Макросов', String(state.project.macros.length)));
    block.appendChild(inspRow('Папка', state.project.path || 'не выбрана'));
    block.appendChild(inspRow('Сохранение',
      state.projectDirHandle ? 'в папку' : (state.project.path ? 'в файл' : 'нет')));
    root.appendChild(block);

    var note = el('div', 'insp-block');
    note.appendChild(el('div', 'insp-title', 'Проект'));
    note.appendChild(el('div', 'insp-note',
      'Сохраняется в system.json в выбранной папке. Открыть папку можно в шапке.'));
    root.appendChild(note);
  }

  function inspectorViewSelection(root, view) {
    if (state.selection && state.selection.kind === 'item') {
      var hit = findItem(view, state.selection.id);
      if (hit) { inspectorItem(root, view, hit.section, hit.item); return; }
    }
    if (state.selection && state.selection.kind === 'section') {
      var section = findSectionById(view, state.selection.id);
      if (section) { inspectorSection(root, view, section); return; }
    }
    inspectorView(root, view);
  }

  function inspectorSheetEmpty(root) {
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Листы персонажа'));
    block.appendChild(el('div', 'insp-note', 'Создайте окно, чтобы собрать вкладки и компоненты.'));
    root.appendChild(block);
  }

  function inspectorSheet(root, sheet) {
    var win = sheet.window || { width: 760, height: 620 };
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Лист'));
    block.appendChild(inspRow('Название', sheet.title || '—'));
    block.appendChild(inspRow('Вкладок', String((sheet.tabs || []).length)));
    block.appendChild(inspRow('Размер', win.width + '×' + win.height));
    block.appendChild(inspRow('Позиция',
      (state.project.sheets.indexOf(sheet) + 1) + ' из ' + state.project.sheets.length));
    root.appendChild(block);

    var actions = el('div', 'insp-block');
    actions.appendChild(el('div', 'insp-title', 'Действия'));
    var row = el('div', 'insp-actions');
    var preview = POM_EDITOR.button('Предпросмотр');
    preview.addEventListener('click', function () { openSheetPreview(sheet); });
    row.appendChild(preview);
    var del = POM_EDITOR.button('Удалить', { className: 'ed-btn-danger' });
    del.addEventListener('click', function () { deleteSheet(sheet); });
    row.appendChild(del);
    actions.appendChild(row);
    root.appendChild(actions);
  }

  function inspectorChat(root) {
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Чат'));
    block.appendChild(el('div', 'insp-note',
      'Чат — встроенная вкладка движка. Его нельзя удалить, переименовать или заменить.'));
    block.appendChild(inspRow('Позиция', 'первая в рейле'));
    block.appendChild(inspRow('Видимость', 'всегда'));
    root.appendChild(block);

    var hint = el('div', 'insp-block');
    hint.appendChild(el('div', 'insp-title', 'Подсказка'));
    hint.appendChild(el('div', 'insp-note',
      'Выберите вкладку модуля слева или создайте новую, чтобы настроить её свойства.'));
    root.appendChild(hint);
  }

  function inspectorView(root, view) {
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Вкладка'));

    var title = POM_EDITOR.input(view.title, { placeholder: 'Название вкладки' });
    title.addEventListener('focus', function () { pushHistory('view-title:' + view.id); });
    title.addEventListener('input', function () {
      view.title = title.value;
      markDirty();
      refreshViewChrome(view);
    });
    block.appendChild(POM_EDITOR.field('Название', title));

    var icon = POM_EDITOR.input(view.icon, { maxLength: 2, placeholder: '▤' });
    icon.addEventListener('focus', function () { pushHistory('view-icon:' + view.id); });
    icon.addEventListener('input', function () {
      view.icon = icon.value || '▤';
      markDirty();
      refreshViewChrome(view);
    });
    block.appendChild(POM_EDITOR.field('Иконка', icon, 'Один символ или эмодзи.'));

    var icons = el('div', 'insp-icons');
    ICON_PRESETS.forEach(function (symbol) {
      var btn = POM_EDITOR.iconButton(symbol, 'Иконка ' + symbol);
      btn.addEventListener('click', function () {
        pushHistory();
        view.icon = symbol;
        icon.value = symbol;
        markDirty();
        refreshViewChrome(view);
      });
      icons.appendChild(btn);
    });
    block.appendChild(icons);

    var id = POM_EDITOR.input(view.id, { readonly: true });
    block.appendChild(POM_EDITOR.field('ID', id, 'Служебный идентификатор, пока не редактируется.'));

    var views = currentViews();
    var order = views.indexOf(view) + 1;
    block.appendChild(inspRow('Порядок', order + ' из ' + views.length));
    root.appendChild(block);

    var actions = el('div', 'insp-block');
    actions.appendChild(el('div', 'insp-title', 'Действия'));

    var row = el('div', 'insp-actions');
    var up = POM_EDITOR.button('Выше');
    up.disabled = order === 1;
    up.addEventListener('click', function () { moveView(view, -1); });
    var down = POM_EDITOR.button('Ниже');
    down.disabled = order === views.length;
    down.addEventListener('click', function () { moveView(view, 1); });
    var dup = POM_EDITOR.button('Дублировать');
    dup.addEventListener('click', function () { duplicateView(view); });
    var del = POM_EDITOR.button('Удалить', { className: 'ed-btn-danger' });
    del.addEventListener('click', function () { deleteView(view); });
    row.appendChild(up);
    row.appendChild(down);
    row.appendChild(dup);
    row.appendChild(del);
    actions.appendChild(row);
    root.appendChild(actions);

    var note = el('div', 'insp-block');
    note.appendChild(el('div', 'insp-title', 'Содержимое'));
    note.appendChild(el('div', 'insp-note',
      'Кликните секцию или компонент на холсте, чтобы выбрать его. Секции идут сверху вниз, внутри — сетка из 12 колонок.'));
    note.appendChild(inspRow('Секций', String(view.sections.length)));
    note.appendChild(inspRow('Компонентов', String(view.sections.reduce(function (sum, section) {
      return sum + section.items.length;
    }, 0))));
    root.appendChild(note);
  }

  function inspectorSection(root, view, section) {
    var block = el('div', 'insp-block');
    block.appendChild(el('div', 'insp-title', 'Секция'));

    var title = POM_EDITOR.input(section.title, { placeholder: 'Название секции' });
    title.addEventListener('focus', function () { pushHistory('section-title:' + section.id); });
    title.addEventListener('input', function () {
      section.title = title.value;
      markDirty();
      refreshCanvas();
    });
    block.appendChild(POM_EDITOR.field('Название', title));

    var index = view.sections.indexOf(section) + 1;
    block.appendChild(inspRow('Порядок', index + ' из ' + view.sections.length));
    block.appendChild(inspRow('Компонентов', String(section.items.length)));
    root.appendChild(block);

    var actions = el('div', 'insp-block');
    actions.appendChild(el('div', 'insp-title', 'Действия'));
    var row = el('div', 'insp-actions');
    var up = POM_EDITOR.button('Выше');
    up.disabled = index === 1;
    up.addEventListener('click', function () { moveSection(view, section, -1); });
    var down = POM_EDITOR.button('Ниже');
    down.disabled = index === view.sections.length;
    down.addEventListener('click', function () { moveSection(view, section, 1); });
    var dup = POM_EDITOR.button('Дублировать');
    dup.addEventListener('click', function () { duplicateSection(view, section); });
    var del = POM_EDITOR.button('Удалить', { className: 'ed-btn-danger' });
    del.addEventListener('click', function () { deleteSection(view, section); });
    row.appendChild(up);
    row.appendChild(down);
    row.appendChild(dup);
    row.appendChild(del);
    actions.appendChild(row);
    root.appendChild(actions);

    var hint = el('div', 'insp-block');
    hint.appendChild(el('div', 'insp-title', 'Подсказка'));
    hint.appendChild(el('div', 'insp-note',
      'Добавляйте компоненты кнопками палитры над холстом. Новый компонент встаёт в следующую свободную строку секции.'));
    root.appendChild(hint);
  }

  function inspectorItem(root, view, section, item) {
    var meta = POM_EDITOR.componentType(item.type);
    var overlaps = overlapsForSection(section);

    var head = el('div', 'insp-block');
    head.appendChild(el('div', 'insp-title', 'Компонент'));
    var typeRow = el('div', 'insp-type');
    typeRow.appendChild(el('span', 'insp-type-ico', meta.icon));
    typeRow.appendChild(el('span', 'insp-type-name', meta.title));
    head.appendChild(typeRow);
    head.appendChild(el('div', 'insp-note', meta.hint || ''));
    head.appendChild(inspRow('Секция', section.title));
    if (item.locked) head.appendChild(inspRow('Замок', 'заблокирован'));
    if (item.hidden) head.appendChild(inspRow('Видимость', 'скрыт'));
    if (item.gmOnly) head.appendChild(inspRow('Доступ', 'только мастер'));
    if (overlaps[item.id]) {
      var warn = el('div', 'insp-warning', 'Компонент пересекается с другим компонентом. Проверьте сетку.');
      head.appendChild(warn);
    }
    if (state.selectedItems.length > 1) {
      head.appendChild(inspRow('Выбрано', String(state.selectedItems.length) + ' комп.'));
    }
    root.appendChild(head);

    var props = el('div', 'insp-block');
    props.appendChild(el('div', 'insp-title', 'Свойства'));
    addItemProps(props, view, item);
    root.appendChild(props);

    var flags = el('div', 'insp-block');
    flags.appendChild(el('div', 'insp-title', 'Доступ и видимость'));
    [
      ['locked', 'Заблокировать перемещение', 'Нельзя двигать, удалять и менять размер'],
      ['hidden', 'Скрыть в игре', 'Компонент останется на холсте, но не попадёт в предпросмотр'],
      ['gmOnly', 'Только для мастера', 'Игрок не увидит компонент в режиме игрока']
    ].forEach(function (def) {
      var label = el('label', 'insp-check');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!item[def[0]];
      box.addEventListener('change', function () {
        pushHistory('flag:' + def[0] + ':' + item.id);
        item[def[0]] = box.checked;
        markDirty();
        render();
      });
      label.appendChild(box);
      label.appendChild(el('span', null, def[1]));
      label.title = def[2];
      flags.appendChild(label);
    });
    root.appendChild(flags);

    var grid = el('div', 'insp-block');
    grid.appendChild(el('div', 'insp-title', 'Сетка'));
    var fields = el('div', 'insp-grid-fields');

    var inputs = {};
    [
      ['x', 'Колонка', 1, GRID_COLS],
      ['y', 'Строка', 1, 200],
      ['w', 'Ширина', 2, GRID_COLS],
      ['h', 'Высота', 1, 40]
    ].forEach(function (def) {
      var input = POM_EDITOR.input(item[def[0]], { type: 'number', min: def[2], max: def[3] });
      input.addEventListener('change', function () {
        updateItemGeometry(item, {
          x: inputs.x.value,
          y: inputs.y.value,
          w: inputs.w.value,
          h: inputs.h.value
        });
      });
      inputs[def[0]] = input;
      fields.appendChild(POM_EDITOR.field(def[1], input));
    });

    grid.appendChild(fields);
    grid.appendChild(el('div', 'ed-hint', '12 колонок. Компонент можно перетаскивать и тянуть за правый нижний угол.'));
    root.appendChild(grid);

    var actions = el('div', 'insp-block');
    actions.appendChild(el('div', 'insp-title', 'Действия'));
    var row = el('div', 'insp-actions');
    var dup = POM_EDITOR.button('Дублировать');
    dup.addEventListener('click', function () { duplicateItem(view, section, item); });
    var del = POM_EDITOR.button('Удалить', { className: 'ed-btn-danger' });
    del.addEventListener('click', function () { deleteItem(view, section, item); });
    row.appendChild(dup);
    row.appendChild(del);
    actions.appendChild(row);
    root.appendChild(actions);
  }

  function addItemProps(root, view, item) {
    var type = item.type;

    if (type === 'label') {
      addTextProp(root, view, item, 'text', 'Текст', 'Заголовок');
    } else if (type === 'text' || type === 'textarea') {
      addTextProp(root, view, item, 'label', 'Подпись', 'Поле');
      addTextProp(root, view, item, 'placeholder', 'Подсказка', 'Введите значение');
      if (type === 'textarea') {
        var rows = POM_EDITOR.input(item.rows || 2, { type: 'number', min: 2, max: 8 });
        rows.addEventListener('change', function () {
          pushHistory();
          item.rows = clampNumber(rows.value, 2, 8);
          markDirty();
          refreshCanvas();
        });
        root.appendChild(POM_EDITOR.field('Строк', rows));
      }
    } else if (type === 'number') {
      addTextProp(root, view, item, 'label', 'Подпись', 'Число');
      var value = POM_EDITOR.input(item.value === undefined ? 0 : item.value, { type: 'number' });
      value.addEventListener('focus', function () { pushHistory('prop:' + item.id + ':value'); });
      value.addEventListener('input', function () {
        item.value = value.value;
        markDirty();
        refreshCanvas();
      });
      root.appendChild(POM_EDITOR.field('Значение', value));
    } else if (type === 'select') {
      addTextProp(root, view, item, 'label', 'Подпись', 'Выбор');
      var options = POM_EDITOR.textarea((item.options || []).join('\n'), {
        rows: 4,
        placeholder: 'Один вариант на строку'
      });
      options.addEventListener('focus', function () { pushHistory('prop:' + item.id + ':options'); });
      options.addEventListener('input', function () {
        item.options = options.value.split('\n').map(function (line) {
          return line.trim();
        }).filter(function (line) {
          return line.length > 0;
        });
        markDirty();
        refreshCanvas();
      });
      root.appendChild(POM_EDITOR.field('Варианты', options, 'По одному на строку.'));
    } else if (type === 'checkbox') {
      addTextProp(root, view, item, 'text', 'Текст', 'Флажок');
      var checked = el('label', 'insp-check');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!item.value;
      box.addEventListener('change', function () {
        pushHistory();
        item.value = box.checked;
        markDirty();
        refreshCanvas();
      });
      checked.appendChild(box);
      checked.appendChild(el('span', null, 'Отмечен по умолчанию'));
      root.appendChild(checked);
    } else if (type === 'button') {
      addTextProp(root, view, item, 'text', 'Текст', 'Кнопка');
      var style = document.createElement('select');
      style.className = 'ed-input';
      [
        ['accent', 'Основная'],
        ['ghost', 'Обычная']
      ].forEach(function (option) {
        var node = document.createElement('option');
        node.value = option[0];
        node.textContent = option[1];
        if ((item.style || 'accent') === option[0]) node.selected = true;
        style.appendChild(node);
      });
      style.addEventListener('change', function () {
        pushHistory();
        item.style = style.value;
        markDirty();
        refreshCanvas();
      });
      root.appendChild(POM_EDITOR.field('Вид', style));
    } else if (type === 'library') {
      addTextProp(root, view, item, 'label', 'Подпись', 'Предмет');

      var librarySelect = document.createElement('select');
      librarySelect.className = 'ed-input';
      var noLibrary = document.createElement('option');
      noLibrary.value = '';
      noLibrary.textContent = '— выберите библиотеку —';
      librarySelect.appendChild(noLibrary);
      (state.project.libraries || []).forEach(function (library) {
        var option = document.createElement('option');
        option.value = library.id;
        option.textContent = library.title || 'Библиотека';
        librarySelect.appendChild(option);
      });
      librarySelect.value = item.libraryId || '';
      librarySelect.addEventListener('change', function () {
        pushHistory();
        item.libraryId = librarySelect.value;
        item.itemId = '';
        markDirty();
        renderInspector();
        refreshCanvas();
      });
      root.appendChild(POM_EDITOR.field('Библиотека', librarySelect));

      var library = findLibrary(item.libraryId);
      if (library) {
        var itemSelect = document.createElement('select');
        itemSelect.className = 'ed-input';
        var autoItem = document.createElement('option');
        autoItem.value = '';
        autoItem.textContent = '— игрок выбирает —';
        itemSelect.appendChild(autoItem);
        (library.items || []).forEach(function (libraryItem) {
          var option = document.createElement('option');
          option.value = libraryItem.id;
          option.textContent = libraryItem.name || 'Без названия';
          itemSelect.appendChild(option);
        });
        itemSelect.value = item.itemId || '';
        itemSelect.addEventListener('change', function () {
          pushHistory();
          item.itemId = itemSelect.value;
          markDirty();
          renderInspector();
          refreshCanvas();
        });
        root.appendChild(POM_EDITOR.field('Предмет', itemSelect));

        var summary = libraryItemSummary(library, item.itemId);
        if (summary) root.appendChild(el('div', 'insp-note', summary));
        root.appendChild(el('div', 'insp-note',
          'Поля предмета доступны в разделе «Логика» как ссылки.'));
      } else {
        root.appendChild(el('div', 'insp-note',
          'Сначала создайте библиотеку с полями и предметами.'));
      }
    } else if (type === 'image') {
      addTextProp(root, view, item, 'label', 'Подпись', 'Портрет');
      root.appendChild(el('div', 'insp-note',
        'Загрузка картинки появится в игровом окне. Пока это место под портрет.'));
    } else {
      root.appendChild(el('div', 'insp-note', 'У этого компонента нет свойств — только размер и позиция.'));
    }
  }

  function addTextProp(root, view, item, key, label, placeholder) {
    var input = POM_EDITOR.input(item[key] || '', { placeholder: placeholder });
    input.addEventListener('focus', function () { pushHistory('prop:' + item.id + ':' + key); });
    input.addEventListener('input', function () {
      item[key] = input.value;
      markDirty();
      refreshCanvas();
    });
    root.appendChild(POM_EDITOR.field(label, input));
  }

  function refreshCanvas() {
    var view = state.activeViewId ? findView(state.activeViewId) : null;
    var current = document.querySelector('.cv');
    if (!view || !current) return;
    current.replaceWith(renderCanvas(view));
    POM_EDITOR.preview.refresh();
  }

  function inspRow(label, value) {
    var row = el('div', 'insp-row');
    row.appendChild(el('span', 'insp-row-label', label));
    row.appendChild(el('span', 'insp-row-value', value));
    return row;
  }

  /* =======================================================
     Поехали
     ======================================================= */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
