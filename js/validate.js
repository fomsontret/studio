'use strict';
/* =========================================================
   POM Studio — проверка проекта перед сохранением и экспортом
   Чистый модуль: не трогает DOM, возвращает список проблем.
   ========================================================= */
window.POM_EDITOR = window.POM_EDITOR || {};

(function () {
  var COMPONENT_TYPES = ['label', 'text', 'number', 'textarea', 'select', 'library',
    'checkbox', 'button', 'divider', 'spacer', 'image'];
  var FIELD_TYPES = ['text', 'number', 'textarea', 'checkbox', 'select'];
  var STEP_TYPES = ['ask', 'roll', 'set', 'add', 'setText', 'if', 'log'];
  var TRIGGERS = ['click', 'change', 'load'];
  var SURFACES = ['panel', 'sheet'];

  function add(report, level, path, message) {
    report[level === 'error' ? 'errors' : 'warnings'].push({
      level: level,
      path: path,
      message: message
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function asArray(report, value, path) {
    if (Array.isArray(value)) return value;
    if (value !== undefined && value !== null) {
      add(report, 'error', path, 'Ожидался массив');
    }
    return [];
  }

  function checkId(report, seen, value, path, label) {
    if (!value || typeof value !== 'string') {
      add(report, 'error', path, label + ': не задан ID');
      return;
    }
    if (seen[value]) {
      add(report, 'error', path, label + ': ID «' + value + '» повторяется (ещё ' + seen[value] + ')');
      return;
    }
    seen[value] = path;
  }

  function checkGeometry(report, item, path) {
    ['x', 'y', 'w', 'h'].forEach(function (key) {
      if (!Number.isFinite(Number(item[key]))) {
        add(report, 'error', path, 'Геометрия: ' + key + ' должно быть числом');
      }
    });
    var x = Number(item.x);
    var w = Number(item.w);
    var h = Number(item.h);
    if (x < 1 || x > 12) add(report, 'error', path, 'x должно быть от 1 до 12');
    if (w < 1 || w > 12) add(report, 'error', path, 'w должно быть от 1 до 12');
    if (x + w - 1 > 12) add(report, 'error', path, 'Компонент выходит за 12 колонок');
    if (h < 1) add(report, 'error', path, 'h должно быть не меньше 1');
    if (Number(item.y) < 1) add(report, 'error', path, 'y должно быть не меньше 1');
  }

  function checkSections(report, seen, sections, path) {
    var counters = { sections: 0, items: 0 };
    if (!Array.isArray(sections)) {
      add(report, 'error', path, 'Секции должны быть массивом');
      return counters;
    }
    sections.forEach(function (section, sIndex) {
      var sPath = path + '.sections[' + sIndex + ']';
      if (!isObject(section)) {
        add(report, 'error', sPath, 'Секция должна быть объектом');
        return;
      }
      checkId(report, seen, section.id, sPath, 'Секция');
      if (!String(section.title || '').trim()) {
        add(report, 'warning', sPath, 'У секции нет названия');
      }
      if (!Array.isArray(section.items)) {
        add(report, 'error', sPath, 'items должен быть массивом');
        return;
      }
      counters.sections++;
      var occupied = [];
      section.items.forEach(function (item, iIndex) {
        var iPath = sPath + '.items[' + iIndex + ']';
        if (!isObject(item)) {
          add(report, 'error', iPath, 'Компонент должен быть объектом');
          return;
        }
        checkId(report, seen, item.id, iPath, 'Компонент');
        if (COMPONENT_TYPES.indexOf(item.type) < 0) {
          add(report, 'error', iPath, 'Неизвестный тип компонента: ' + item.type);
        }
        checkGeometry(report, item, iPath);
        if (item.type === 'library' && !item.libraryId) {
          add(report, 'warning', iPath, 'У компонента-предмета не выбрана библиотека');
        }
        if (item.type === 'image' && !String(item.label || '').trim()) {
          add(report, 'warning', iPath, 'У картинки нет подписи');
        }
        counters.items++;

        var x = Number(item.x) || 1;
        var y = Number(item.y) || 1;
        var w = Number(item.w) || 1;
        var h = Number(item.h) || 1;
        occupied.forEach(function (other) {
          if (x < other.x + other.w && x + w > other.x && y < other.y + other.h && y + h > other.y) {
            add(report, 'warning', iPath,
              'Компонент пересекается с «' + (other.label || other.id) + '»');
          }
        });
        occupied.push({ x: x, y: y, w: w, h: h, id: item.id,
          label: item.label || item.text || item.type });
      });
    });
    return counters;
  }

  function collectMacroTargets(project) {
    var targets = {};
    function addView(view, surface, sheetId, tabId) {
      (view.sections || []).forEach(function (section) {
        (section.items || []).forEach(function (item) {
          targets[item.id] = { surface: surface, sheetId: sheetId, tabId: tabId };
        });
      });
    }
    (project.panel && project.panel.views || []).forEach(function (view) {
      addView(view, 'panel', null, view.id);
    });
    (project.sheets || []).forEach(function (sheet) {
      (sheet.tabs || []).forEach(function (tab) {
        addView(tab, 'sheet', sheet.id, tab.id);
      });
    });
    return targets;
  }

  function checkSteps(report, steps, path, targets, askKeys) {
    if (!Array.isArray(steps)) {
      add(report, 'error', path, 'Шаги должны быть массивом');
      return;
    }
    steps.forEach(function (step, index) {
      var stepPath = path + '[' + index + ']';
      if (!isObject(step)) {
        add(report, 'error', stepPath, 'Шаг должен быть объектом');
        return;
      }
      if (STEP_TYPES.indexOf(step.type) < 0) {
        add(report, 'error', stepPath, 'Неизвестный шаг: ' + step.type);
        return;
      }
      if (step.type === 'roll' && !String(step.formula || '').trim()) {
        add(report, 'warning', stepPath, 'У броска пустая формула');
      }
      if (step.type === 'set' || step.type === 'add') {
        if (!step.targetId) add(report, 'warning', stepPath, 'Не выбрано поле для изменения');
        else if (!targets[step.targetId]) add(report, 'error', stepPath, 'Поле «' + step.targetId + '» не найдено');
        if (String(step.value || '').trim() === '') add(report, 'warning', stepPath, 'Не задано значение');
      }
      if (step.type === 'setText') {
        if (!step.targetId) add(report, 'warning', stepPath, 'Не выбрано поле для текста');
        else if (!targets[step.targetId]) add(report, 'error', stepPath, 'Поле «' + step.targetId + '» не найдено');
      }
      if (step.type === 'ask') {
        var key = String(step.key || '').trim();
        if (!key) add(report, 'warning', stepPath, 'Не задан ключ ответа');
        else if (askKeys[key]) add(report, 'warning', stepPath, 'Ключ «' + key + '» повторяется');
        else askKeys[key] = true;
      }
      if (step.type === 'if') {
        if (!String(step.condition || '').trim()) add(report, 'warning', stepPath, 'Пустое условие');
        checkSteps(report, step.then || [], stepPath + '.then', targets, askKeys);
        checkSteps(report, step.else || [], stepPath + '.else', targets, askKeys);
      }
    });
  }

  POM_EDITOR.validateProject = function (project) {
    var report = {
      errors: [],
      warnings: [],
      stats: { views: 0, sections: 0, items: 0, sheets: 0, libraries: 0, macros: 0 }
    };
    if (!isObject(project)) {
      add(report, 'error', '', 'Проект не является объектом');
      return report;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(project.id || ''))) {
      add(report, 'warning', 'id', 'ID модуля лучше писать латиницей: a-z, 0-9 и дефис');
    }
    if (!String(project.title || '').trim()) {
      add(report, 'error', 'title', 'У модуля нет названия');
    }
    if (!/^\d+\.\d+\.\d+/.test(String(project.version || ''))) {
      add(report, 'warning', 'version', 'Версия должна выглядеть как 0.1.0');
    }

    var seen = {};
    var panel = isObject(project.panel) ? project.panel : { views: [] };
    if (!Array.isArray(panel.views)) {
      add(report, 'error', 'panel.views', 'panel.views должен быть массивом');
    } else {
      panel.views.forEach(function (view, index) {
        var path = 'panel.views[' + index + ']';
        if (!isObject(view)) {
          add(report, 'error', path, 'Вкладка должна быть объектом');
          return;
        }
        checkId(report, seen, view.id, path, 'Вкладка');
        if (!String(view.title || '').trim()) add(report, 'warning', path, 'У вкладки нет названия');
        var counts = checkSections(report, seen, view.sections || [], path);
        report.stats.views++;
        report.stats.sections += counts.sections;
        report.stats.items += counts.items;
      });
    }

    asArray(report, project.sheets, 'sheets').forEach(function (sheet, index) {
      var path = 'sheets[' + index + ']';
      if (!isObject(sheet)) {
        add(report, 'error', path, 'Лист должен быть объектом');
        return;
      }
      checkId(report, seen, sheet.id, path, 'Лист');
      if (!String(sheet.title || '').trim()) add(report, 'warning', path, 'У листа нет названия');
      var win = sheet.window || {};
      if (!Number.isFinite(Number(win.width)) || Number(win.width) < 240) {
        add(report, 'warning', path, 'Ширина листа слишком мала');
      }
      if (!Number.isFinite(Number(win.height)) || Number(win.height) < 200) {
        add(report, 'warning', path, 'Высота листа слишком мала');
      }
      var tabs = asArray(report, sheet.tabs, path + '.tabs');
      if (!tabs.length) {
        add(report, 'warning', path, 'У листа нет вкладок');
      } else {
        tabs.forEach(function (tab, tabIndex) {
          var tabPath = path + '.tabs[' + tabIndex + ']';
          if (!isObject(tab)) {
            add(report, 'error', tabPath, 'Вкладка листа должна быть объектом');
            return;
          }
          checkId(report, seen, tab.id, tabPath, 'Вкладка листа');
          var counts = checkSections(report, seen, tab.sections || [], tabPath);
          report.stats.sections += counts.sections;
          report.stats.items += counts.items;
        });
      }
      report.stats.sheets++;
    });

    asArray(report, project.libraries, 'libraries').forEach(function (library, index) {
      var path = 'libraries[' + index + ']';
      if (!isObject(library)) {
        add(report, 'error', path, 'Библиотека должна быть объектом');
        return;
      }
      checkId(report, seen, library.id, path, 'Библиотека');
      if (!String(library.title || '').trim()) add(report, 'warning', path, 'У библиотеки нет названия');
      var fieldIds = {};
      asArray(report, library.fields, path + '.fields').forEach(function (field, fIndex) {
        var fPath = path + '.fields[' + fIndex + ']';
        if (!isObject(field)) {
          add(report, 'error', fPath, 'Поле библиотеки должно быть объектом');
          return;
        }
        checkId(report, seen, field.id, fPath, 'Поле библиотеки');
        if (fieldIds[field.id]) add(report, 'error', fPath, 'Поле повторяется внутри библиотеки');
        fieldIds[field.id] = true;
        if (FIELD_TYPES.indexOf(field.type) < 0) {
          add(report, 'error', fPath, 'Неизвестный тип поля: ' + field.type);
        }
        if (!String(field.label || '').trim()) add(report, 'warning', fPath, 'У поля нет названия');
        if (field.type === 'select' && !(field.options || []).length) {
          add(report, 'warning', fPath, 'У списка нет вариантов');
        }
      });
      asArray(report, library.items, path + '.items').forEach(function (item, iIndex) {
        var iPath = path + '.items[' + iIndex + ']';
        if (!isObject(item)) {
          add(report, 'error', iPath, 'Предмет библиотеки должен быть объектом');
          return;
        }
        checkId(report, seen, item.id, iPath, 'Предмет библиотеки');
        if (!String(item.name || '').trim()) add(report, 'warning', iPath, 'У предмета нет названия');
        Object.keys(item.values || {}).forEach(function (fieldId) {
          if (!fieldIds[fieldId]) {
            add(report, 'warning', iPath, 'Значение ссылается на несуществующее поле «' + fieldId + '»');
          }
        });
      });
      report.stats.libraries++;
    });

    var targets = collectMacroTargets(project);
    var askKeys = {};
    asArray(report, project.macros, 'macros').forEach(function (macro, index) {
      var path = 'macros[' + index + ']';
      if (!isObject(macro)) {
        add(report, 'error', path, 'Макрос должен быть объектом');
        return;
      }
      checkId(report, seen, macro.id, path, 'Макрос');
      if (!String(macro.name || '').trim()) add(report, 'warning', path, 'У макроса нет названия');
      if (SURFACES.indexOf(macro.surface) < 0) {
        add(report, 'error', path, 'Неизвестная поверхность макроса: ' + macro.surface);
      }
      if (TRIGGERS.indexOf(macro.trigger || 'click') < 0) {
        add(report, 'warning', path, 'Неизвестный триггер: ' + macro.trigger);
      }
      if (macro.itemId) {
        var target = targets[macro.itemId];
        if (!target) {
          add(report, 'error', path, 'Компонент «' + macro.itemId + '» не найден');
        } else if (target.surface !== macro.surface) {
          add(report, 'warning', path, 'Компонент находится на другой поверхности');
        } else if (macro.surface === 'sheet' && macro.sheetId && target.sheetId !== macro.sheetId) {
          add(report, 'warning', path, 'Компонент находится на другом листе');
        }
      }
      checkSteps(report, macro.steps || [], path + '.steps', targets, askKeys);
      report.stats.macros++;
    });

    return report;
  };

  POM_EDITOR.formatIssues = function (report, limit) {
    var all = (report.errors || []).concat(report.warnings || []);
    var max = limit || 20;
    return all.slice(0, max).map(function (item) {
      return (item.level === 'error' ? 'Ошибка' : 'Предупреждение') +
        (item.path ? ' · ' + item.path : '') + ': ' + item.message;
    });
  };
})();
