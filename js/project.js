'use strict';
/* =========================================================
   Редактор систем — модель проекта и каталог компонентов
   Пока без хранения: проект живёт в памяти вкладки.
   ========================================================= */
window.POM_EDITOR = window.POM_EDITOR || {};

(function () {
  var seq = 1;

  function base(formatVersion) {
    return {
      format: 'pom-system',
      formatVersion: formatVersion || 1,
      id: 'new-system',
      title: 'Новая система',
      version: '0.1.0',
      description: '',
      path: '',
      panel: { views: [] },
      sheets: [],
      libraries: [],
      formulas: [],
      macros: [],
      assets: []
    };
  }

  /* =======================================================
     Каталог компонентов — общий для панели и будущих листов.
     x, y — позиция на сетке из 12 колонок (с 1),
     w, h — размер в колонках и строках.
     ======================================================= */

  POM_EDITOR.COMPONENT_TYPES = [
    {
      type: 'label', title: 'Заголовок', icon: 'T', hint: 'Текст без поля ввода',
      defaults: { text: 'Заголовок', w: 6, h: 1 }
    },
    {
      type: 'text', title: 'Поле', icon: 'Aa', hint: 'Строка текста',
      defaults: { label: 'Поле', placeholder: '', w: 6, h: 1 }
    },
    {
      type: 'number', title: 'Число', icon: '#', hint: 'Числовое значение',
      defaults: { label: 'Число', value: 0, w: 3, h: 1 }
    },
    {
      type: 'textarea', title: 'Длинный текст', icon: '¶', hint: 'Многострочное поле для описания',
      defaults: { label: 'Описание', placeholder: '', rows: 3, w: 12, h: 3 }
    },
    {
      type: 'select', title: 'Список', icon: '▾', hint: 'Выбор из вариантов',
      defaults: { label: 'Выбор', options: ['Вариант 1', 'Вариант 2'], w: 6, h: 1 }
    },
    {
      type: 'library', title: 'Предмет из библиотеки', icon: '▣',
      hint: 'Выпадающий список предметов и доступ к их полям',
      defaults: { label: 'Предмет', libraryId: '', itemId: '', w: 6, h: 1 }
    },
    {
      type: 'checkbox', title: 'Флажок', icon: '☑', hint: 'Отметка да/нет',
      defaults: { text: 'Флажок', value: false, w: 6, h: 1 }
    },
    {
      type: 'button', title: 'Кнопка', icon: '▶', hint: 'Действие или бросок',
      defaults: { text: 'Кнопка', style: 'accent', w: 4, h: 1 }
    },
    {
      type: 'divider', title: 'Линия', icon: '—', hint: 'Разделитель',
      defaults: { w: 12, h: 1 }
    },
    {
      type: 'image', title: 'Поле для картинки', icon: '▧', hint: 'Место для портрета или изображения',
      defaults: { label: 'Портрет', w: 4, h: 3 }
    },
    {
      type: 'spacer', title: 'Отступ', icon: '␣', hint: 'Пустое место',
      defaults: { w: 12, h: 1 }
    }
  ];

  POM_EDITOR.componentType = function (type) {
    var list = POM_EDITOR.COMPONENT_TYPES;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === type) return list[i];
    }
    return list[0];
  };

  /* =======================================================
     Библиотеки: типы характеристик и фабрики
     ======================================================= */

  POM_EDITOR.FIELD_TYPES = [
    { type: 'text', title: 'Текст', icon: 'Aa' },
    { type: 'number', title: 'Число', icon: '#' },
    { type: 'textarea', title: 'Многострочный', icon: '¶' },
    { type: 'checkbox', title: 'Флажок', icon: '☑' },
    { type: 'select', title: 'Список', icon: '▾' }
  ];

  POM_EDITOR.fieldType = function (type) {
    var list = POM_EDITOR.FIELD_TYPES;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === type) return list[i];
    }
    return list[0];
  };

  POM_EDITOR.newField = function (type) {
    var meta = POM_EDITOR.fieldType(type || 'text');
    return {
      id: POM_EDITOR.uid('fld'),
      label: 'Характеристика',
      type: meta.type,
      unit: '',
      required: false,
      defaultValue: '',
      options: meta.type === 'select' ? ['Вариант 1', 'Вариант 2'] : []
    };
  };

  POM_EDITOR.newLibrary = function (number) {
    var n = typeof number === 'number' ? number : 1;
    return {
      id: POM_EDITOR.uid('lib'),
      title: 'Библиотека ' + n,
      icon: '▦',
      category: '',
      fields: [],
      items: []
    };
  };

  POM_EDITOR.newLibraryItem = function (library, name) {
    var item = {
      id: POM_EDITOR.uid('itm'),
      name: name || 'Новый предмет',
      values: {}
    };
    (library.fields || []).forEach(function (field) {
      if (field.defaultValue !== '' && field.defaultValue !== undefined && field.defaultValue !== null) {
        item.values[field.id] = field.defaultValue;
      }
    });
    return item;
  };

  POM_EDITOR.newSheet = function (number) {
    var n = typeof number === 'number' ? number : 1;
    return {
      id: POM_EDITOR.uid('sheet'),
      title: 'Лист ' + n,
      icon: '▤',
      window: { width: 760, height: 620 },
      tabs: [POM_EDITOR.newView(1)]
    };
  };

  POM_EDITOR.newMacro = function (options) {
    options = options || {};
    return {
      id: POM_EDITOR.uid('macro'),
      name: options.name || '',
      surface: options.surface || 'panel',
      sheetId: options.sheetId || null,
      tabId: options.tabId || null,
      itemId: options.itemId || null,
      trigger: options.trigger || 'click',
      steps: []
    };
  };

  POM_EDITOR.newLogicStep = function (type) {
    var step = { id: POM_EDITOR.uid('step'), type: type };
    if (type === 'ask') {
      step.label = 'Вопрос';
      step.key = 'answer';
      step.input = 'number';
    } else if (type === 'roll') {
      step.title = 'Бросок';
      step.formula = '';
    } else if (type === 'set' || type === 'add') {
      step.targetId = '';
      step.value = '';
    } else if (type === 'setText') {
      step.targetId = '';
      step.value = '';
    } else if (type === 'if') {
      step.condition = '';
      step.then = [];
      step.else = [];
    } else if (type === 'log') {
      step.text = '';
    }
    return step;
  };

  POM_EDITOR.createComponent = function (type, position) {
    var meta = POM_EDITOR.componentType(type);
    var item = { id: POM_EDITOR.uid('it'), type: meta.type };
    var defaults = meta.defaults;
    for (var key in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, key)) item[key] = defaults[key];
    }
    item.x = position && position.x ? position.x : 1;
    item.y = position && position.y ? position.y : 1;
    item.w = position && position.w ? position.w : defaults.w;
    item.h = position && position.h ? position.h : defaults.h;
    return item;
  };

  POM_EDITOR.newSection = function (number) {
    return {
      id: POM_EDITOR.uid('sec'),
      title: 'Секция ' + (number || 1),
      items: []
    };
  };

  POM_EDITOR.blankProject = function () {
    return base(1);
  };

  POM_EDITOR.demoProject = function () {
    var project = base(1);
    project.id = 'demo-system';
    project.title = 'Демо-система';
    project.description = 'Пример того, как выглядит модуль в редакторе.';
    project.panel.views = [
      {
        id: 'view-character',
        title: 'Персонаж',
        icon: '▤',
        sections: [
          {
            id: 'sec-main',
            title: 'Основное',
            items: [
              { id: 'it-name-label', type: 'label', text: 'Имя', x: 1, y: 1, w: 6, h: 1 },
              { id: 'it-name-input', type: 'text', label: 'Имя', placeholder: 'Введите имя', x: 1, y: 2, w: 6, h: 1 },
              { id: 'it-roll', type: 'button', text: 'Бросок', style: 'accent', x: 1, y: 3, w: 4, h: 1 }
            ]
          },
          {
            id: 'sec-stats',
            title: 'Характеристики',
            items: [
              { id: 'it-str-label', type: 'label', text: 'Сила', x: 1, y: 1, w: 6, h: 1 },
              { id: 'it-str', type: 'number', label: 'Значение', value: 10, x: 1, y: 2, w: 3, h: 1 },
              { id: 'it-dex-label', type: 'label', text: 'Ловкость', x: 7, y: 1, w: 6, h: 1 },
              { id: 'it-dex', type: 'number', label: 'Значение', value: 12, x: 7, y: 2, w: 3, h: 1 }
            ]
          }
        ]
      },
      {
        id: 'view-inventory',
        title: 'Инвентарь',
        icon: '▦',
        sections: [
          {
            id: 'sec-gear',
            title: 'Снаряжение',
            items: [
              { id: 'it-weapon-label', type: 'label', text: 'Оружие', x: 1, y: 1, w: 6, h: 1 },
              { id: 'it-weapon', type: 'text', label: 'Название', placeholder: 'Название', x: 1, y: 2, w: 6, h: 1 },
              { id: 'it-add', type: 'button', text: 'Добавить', style: 'ghost', x: 1, y: 3, w: 4, h: 1 }
            ]
          }
        ]
      }
    ];
    project.libraries = [{
      id: 'lib-demo-weapons',
      title: 'Оружие',
      icon: '⚔',
      category: 'Снаряжение',
      fields: [
        { id: 'fld-demo-damage', label: 'Урон', type: 'text', unit: '', required: true, defaultValue: '', options: [] },
        { id: 'fld-demo-attack', label: 'Атака', type: 'number', unit: '', required: false, defaultValue: 0, options: [] },
        { id: 'fld-demo-weight', label: 'Вес', type: 'number', unit: 'кг', required: false, defaultValue: '', options: [] },
        { id: 'fld-demo-price', label: 'Цена', type: 'number', unit: 'к.', required: false, defaultValue: '', options: [] }
      ],
      items: [
        { id: 'itm-demo-katana', name: 'Катана', values: { 'fld-demo-damage': '1d8', 'fld-demo-attack': 2, 'fld-demo-weight': 1.2, 'fld-demo-price': 200 } },
        { id: 'itm-demo-nodachi', name: 'Нодати', values: { 'fld-demo-damage': '1d10', 'fld-demo-attack': 1, 'fld-demo-weight': 2.1, 'fld-demo-price': 350 } }
      ]
    }];
    project.sheets = [{
      id: 'sheet-demo-character',
      title: 'Персонаж',
      icon: '▤',
      window: { width: 760, height: 620 },
      tabs: [
        {
          id: 'tab-demo-main',
          title: 'Основное',
          icon: '◈',
          sections: [
            {
              id: 'sec-demo-main',
              title: 'Основное',
              items: [
                { id: 'it-demo-name', type: 'text', label: 'Имя', placeholder: 'Имя персонажа', x: 1, y: 1, w: 6, h: 1 },
                { id: 'it-demo-portrait', type: 'image', label: 'Портрет', x: 9, y: 1, w: 4, h: 4 },
                { id: 'it-demo-class', type: 'select', label: 'Класс', options: ['Воин', 'Маг', 'Плут'], x: 1, y: 2, w: 6, h: 1 },
                { id: 'it-demo-roll', type: 'button', text: 'Бросок', style: 'accent', x: 1, y: 3, w: 4, h: 1 },
                { id: 'it-demo-hp', type: 'number', label: 'HP', value: 10, x: 1, y: 4, w: 3, h: 1 },
                { id: 'it-demo-status-label', type: 'label', text: 'Статус', x: 4, y: 4, w: 2, h: 1 },
                { id: 'it-demo-status', type: 'text', label: 'Состояние', placeholder: 'Здоров', x: 6, y: 4, w: 3, h: 1 },
                { id: 'it-demo-weapon', type: 'library', label: 'Оружие', libraryId: 'lib-demo-weapons', itemId: 'itm-demo-katana', x: 1, y: 5, w: 6, h: 1 }
              ]
            },
            {
              id: 'sec-demo-desc',
              title: 'Описание',
              items: [
                { id: 'it-demo-desc', type: 'textarea', label: 'Описание', rows: 4, x: 1, y: 1, w: 12, h: 4 }
              ]
            }
          ]
        },
        {
          id: 'tab-demo-skills',
          title: 'Навыки',
          icon: '◆',
          sections: [
            {
              id: 'sec-demo-skills',
              title: 'Навыки',
              items: [
                { id: 'it-demo-athletics', type: 'number', label: 'Атлетика', value: 0, x: 1, y: 1, w: 3, h: 1 }
              ]
            }
          ]
        }
      ]
    }];
    project.macros = [{
      id: 'macro-demo-roll',
      name: 'Бросок',
      surface: 'sheet',
      sheetId: 'sheet-demo-character',
      tabId: 'tab-demo-main',
      itemId: 'it-demo-roll',
      trigger: 'click',
      steps: [
        { id: 'step-demo-roll', type: 'roll', title: 'Бросок', formula: 'd20 + {{it-demo-weapon.attack}}' }
      ]
    }];
    return project;
  };

  POM_EDITOR.newView = function (number) {
    var n = typeof number === 'number' ? number : seq;
    return {
      id: 'view-' + (seq++),
      title: 'Вкладка ' + n,
      icon: '▤',
      sections: []
    };
  };

  POM_EDITOR.uid = function (prefix) {
    return (prefix || 'id') + '-' + (seq++);
  };

  /* =======================================================
     Формат модуля: сохранение и чтение system.json
     ======================================================= */

  POM_EDITOR.MODULE_FORMAT = 'pom-system';
  POM_EDITOR.MODULE_VERSION = 1;

  /* =======================================================
     Копирование узлов проекта: новые ID, прежняя геометрия
     ======================================================= */

  POM_EDITOR.cloneItem = function (item, options) {
    options = options || {};
    var copy = JSON.parse(JSON.stringify(item || {}));
    copy.id = POM_EDITOR.uid('it');
    if (options.clearLock) {
      copy.locked = false;
      copy.hidden = false;
    }
    return copy;
  };

  POM_EDITOR.cloneSection = function (section, options) {
    options = options || {};
    var copy = JSON.parse(JSON.stringify(section || {}));
    copy.id = POM_EDITOR.uid('sec');
    copy.title = (copy.title || 'Секция') + (options.suffix === false ? '' : ' (копия)');
    copy.items = (copy.items || []).map(function (item) {
      return POM_EDITOR.cloneItem(item, options);
    });
    return copy;
  };

  POM_EDITOR.cloneView = function (view, options) {
    options = options || {};
    var copy = JSON.parse(JSON.stringify(view || {}));
    copy.id = POM_EDITOR.uid('view');
    copy.title = (copy.title || 'Вкладка') + (options.suffix === false ? '' : ' (копия)');
    copy.sections = (copy.sections || []).map(function (section) {
      return POM_EDITOR.cloneSection(section, options);
    });
    return copy;
  };

  /* =======================================================
     Миграции формата: старые version → текущая
     ======================================================= */

  POM_EDITOR.MIGRATIONS = {
    1: function (data) {
      return data;
    }
  };

  POM_EDITOR.migrateProject = function (data) {
    var version = Number(data && data.formatVersion || 1);
    if (!isFinite(version)) version = 1;
    for (var i = version; i < POM_EDITOR.MODULE_VERSION; i++) {
      var migrate = POM_EDITOR.MIGRATIONS[i];
      if (typeof migrate === 'function') data = migrate(data);
    }
    data.formatVersion = POM_EDITOR.MODULE_VERSION;
    return data;
  };

  POM_EDITOR.serializeProject = function (project) {
    var copy = JSON.parse(JSON.stringify(project || {}));
    delete copy.path;
    delete copy.formulas;
    copy.format = POM_EDITOR.MODULE_FORMAT;
    copy.formatVersion = POM_EDITOR.MODULE_VERSION;
    copy.panel = copy.panel || { views: [] };
    copy.panel.views = copy.panel.views || [];
    copy.sheets = copy.sheets || [];
    copy.libraries = copy.libraries || [];
    copy.macros = copy.macros || [];
    copy.assets = copy.assets || [];
    return copy;
  };

  function normalizeSteps(steps) {
    var list = Array.isArray(steps) ? steps : [];
    list.forEach(function (step) {
      if (step && step.type === 'if') {
        step.then = normalizeSteps(step.then);
        step.else = normalizeSteps(step.else);
      }
    });
    return list;
  }

  POM_EDITOR.normalizeProject = function (data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Файл модуля пуст или повреждён');
    }
    if (data.format && data.format !== POM_EDITOR.MODULE_FORMAT) {
      throw new Error('Это не модуль POM');
    }
    var version = Number(data.formatVersion || 1);
    if (!isFinite(version)) version = 1;
    if (version > POM_EDITOR.MODULE_VERSION) {
      throw new Error('Модуль новее этой версии конструктора');
    }

    data = JSON.parse(JSON.stringify(data));
    data = POM_EDITOR.migrateProject(data);

    var project = {
      format: POM_EDITOR.MODULE_FORMAT,
      formatVersion: POM_EDITOR.MODULE_VERSION,
      id: String(data.id || 'imported-system'),
      title: String(data.title || 'Без названия'),
      version: String(data.version || '0.1.0'),
      description: String(data.description || ''),
      path: '',
      panel: { views: Array.isArray(data.panel && data.panel.views) ? data.panel.views : [] },
      sheets: Array.isArray(data.sheets) ? data.sheets : [],
      libraries: Array.isArray(data.libraries) ? data.libraries : [],
      formulas: [],
      macros: Array.isArray(data.macros) ? data.macros : [],
      assets: Array.isArray(data.assets) ? data.assets : []
    };

    project.panel.views.forEach(function (view) {
      view.sections = Array.isArray(view.sections) ? view.sections : [];
      view.sections.forEach(function (section) {
        section.items = Array.isArray(section.items) ? section.items : [];
      });
    });

    project.sheets.forEach(function (sheet) {
      if (!sheet.window) sheet.window = { width: 760, height: 620 };
      sheet.tabs = Array.isArray(sheet.tabs) ? sheet.tabs : [];
      sheet.tabs.forEach(function (tab) {
        tab.sections = Array.isArray(tab.sections) ? tab.sections : [];
        tab.sections.forEach(function (section) {
          section.items = Array.isArray(section.items) ? section.items : [];
        });
      });
    });

    project.libraries.forEach(function (library) {
      library.fields = Array.isArray(library.fields) ? library.fields : [];
      library.items = Array.isArray(library.items) ? library.items : [];
    });

    project.macros.forEach(function (macro) {
      macro.steps = normalizeSteps(macro.steps);
    });

    return project;
  };
})();
