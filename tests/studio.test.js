'use strict';
/* =========================================================
   Тесты модели и проверки проекта POM Studio.
   Запуск: node --test studio/tests/studio.test.js
   Без npm-зависимостей: используется встроенный node:test.
   ========================================================= */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/project.js');
require('../js/validate.js');

const P = window.POM_EDITOR;
const demoPath = path.join(__dirname, '..', '..', 'systems', 'demo-module', 'system.json');

function demoData() {
  return JSON.parse(fs.readFileSync(demoPath, 'utf8'));
}

test('демо-модуль нормализуется и проходит проверку без ошибок', () => {
  const project = P.normalizeProject(demoData());
  const report = P.validateProject(project);
  assert.equal(project.format, 'pom-system');
  assert.equal(project.formatVersion, 1);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.stats.views, 2);
  assert.equal(report.stats.sheets, 1);
  assert.equal(report.stats.libraries, 1);
  assert.equal(report.stats.macros, 1);
});

test('пустой проект сериализуется в актуальный формат', () => {
  const project = P.blankProject();
  project.path = 'C:/tmp/demo';
  project.formulas = [{ id: 'old' }];
  const out = P.serializeProject(project);
  assert.equal(out.format, 'pom-system');
  assert.equal(out.formatVersion, P.MODULE_VERSION);
  assert.equal(out.path, undefined);
  assert.equal(out.formulas, undefined);
  assert.deepEqual(out.panel.views, []);
  assert.deepEqual(out.sheets, []);
  assert.deepEqual(out.libraries, []);
  assert.deepEqual(out.macros, []);
  assert.deepEqual(out.assets, []);
});

test('normalizeProject копирует вход и заполняет пропущенные массивы', () => {
  const input = {
    format: 'pom-system',
    id: 'copy-test',
    title: 'Копия',
    version: '1.2.3',
    panel: { views: [{ id: 'v1', title: 'V1' }] },
    sheets: [{ id: 's1', title: 'S1' }],
    libraries: [{ id: 'l1', title: 'L1' }],
    macros: [{ id: 'm1', surface: 'panel', steps: [{ id: 'st1', type: 'if' }] }]
  };
  const project = P.normalizeProject(input);
  input.title = 'Изменено снаружи';
  input.panel.views[0].title = 'Тоже изменено';

  assert.equal(project.title, 'Копия');
  assert.equal(project.panel.views[0].title, 'V1');
  assert.deepEqual(project.panel.views[0].sections, []);
  assert.deepEqual(project.sheets[0].tabs, []);
  assert.deepEqual(project.libraries[0].fields, []);
  assert.deepEqual(project.macros[0].steps[0].then, []);
  assert.deepEqual(project.macros[0].steps[0].else, []);
  assert.deepEqual(project.assets, []);
});

test('normalizeProject отвергает чужой формат и слишком новую версию', () => {
  assert.throws(() => P.normalizeProject({ format: 'other', formatVersion: 1 }), /не модуль POM/);
  assert.throws(() => P.normalizeProject({ format: 'pom-system', formatVersion: 99 }), /новее/);
  assert.throws(() => P.normalizeProject(null), /пуст или повреждён/);
});

test('migrateProject поднимает старую версию и вызывает миграции по порядку', () => {
  const oldVersion = P.MODULE_VERSION;
  try {
    P.MODULE_VERSION = 3;
    const calls = [];
    P.MIGRATIONS[1] = (data) => { calls.push(1); data.title += ' →1'; return data; };
    P.MIGRATIONS[2] = (data) => { calls.push(2); data.title += ' →2'; return data; };
    const result = P.migrateProject({ formatVersion: 1, title: 'Модуль' });
    assert.deepEqual(calls, [1, 2]);
    assert.equal(result.formatVersion, 3);
    assert.equal(result.title, 'Модуль →1 →2');
  } finally {
    P.MODULE_VERSION = oldVersion;
    P.MIGRATIONS[1] = (data) => data;
    delete P.MIGRATIONS[2];
  }
});

test('клонирование выдаёт новые ID на всех уровнях и сохраняет геометрию', () => {
  const project = P.normalizeProject(demoData());
  const view = project.panel.views[0];
  const cloned = P.cloneView(view);

  assert.notEqual(cloned.id, view.id);
  assert.notEqual(cloned.sections[0].id, view.sections[0].id);
  assert.notEqual(cloned.sections[0].items[0].id, view.sections[0].items[0].id);
  assert.equal(cloned.sections[0].items[0].type, view.sections[0].items[0].type);
  assert.equal(cloned.sections[0].items[0].x, view.sections[0].items[0].x);
  assert.equal(cloned.sections[0].items[0].w, view.sections[0].items[0].w);
  assert.match(cloned.title, /\(копия\)$/);

  cloned.sections[0].items[0].x = 12;
  assert.notEqual(cloned.sections[0].items[0].x, view.sections[0].items[0].x);

  const allIds = [];
  cloned.sections.forEach((section) => {
    allIds.push(section.id);
    section.items.forEach((item) => allIds.push(item.id));
  });
  assert.equal(new Set(allIds).size, allIds.length);
});

test('cloneItem может снимать замок и скрытость', () => {
  const item = { id: 'it-1', type: 'text', x: 1, y: 1, w: 3, h: 1, locked: true, hidden: true };
  const copy = P.cloneItem(item, { clearLock: true });
  assert.notEqual(copy.id, item.id);
  assert.equal(copy.locked, false);
  assert.equal(copy.hidden, false);
  assert.equal(item.locked, true);
});

test('валидатор разделяет ошибки и предупреждения', () => {
  const project = P.normalizeProject({
    format: 'pom-system',
    id: 'Bad_ID',
    title: '',
    version: '1.0',
    panel: {
      views: [{
        id: 'view-1',
        title: 'Вкладка',
        sections: [{
          id: 'sec-1',
          title: '',
          items: [
            { id: 'item-1', type: 'nope', x: 12, y: 0, w: 5, h: 0 }
          ]
        }]
      }]
    },
    sheets: [{ id: 'sheet-1', title: 'Лист', window: { width: 100, height: 100 }, tabs: [] }],
    libraries: [],
    macros: [{ id: 'macro-1', name: '', surface: 'nope', itemId: 'missing', steps: [{ id: 'step-1', type: 'roll', formula: '' }] }]
  });
  const report = P.validateProject(project);
  const errorText = report.errors.map((item) => item.message).join('\n');
  const warningText = report.warnings.map((item) => item.message).join('\n');

  assert.match(errorText, /Неизвестный тип компонента/);
  assert.match(errorText, /выходит за 12 колонок/);
  assert.match(errorText, /h должно быть не меньше 1/);
  assert.doesNotMatch(errorText, /ID модуля/);
  assert.doesNotMatch(errorText, /У секции нет названия/);
  assert.match(warningText, /ID модуля/);
  assert.match(warningText, /У секции нет названия/);
  assert.match(warningText, /У макроса нет названия/);
  assert.match(warningText, /У броска пустая формула/);
  assert.match(warningText, /Ширина листа слишком мала/);
  assert.equal(report.stats.items, 1);
});

test('валидатор ловит повторяющиеся ID и неизвестные ссылки', () => {
  const project = P.normalizeProject({
    format: 'pom-system',
    id: 'dup-test',
    title: 'Дубли',
    version: '0.1.0',
    panel: {
      views: [
        {
          id: 'view-1', title: 'A', sections: [{
            id: 'sec-1', title: 'S', items: [
              { id: 'same', type: 'text', x: 1, y: 1, w: 3, h: 1 }
            ]
          }]
        },
        {
          id: 'view-2', title: 'B', sections: [{
            id: 'sec-2', title: 'S', items: [
              { id: 'same', type: 'text', x: 1, y: 1, w: 3, h: 1 }
            ]
          }]
        }
      ]
    },
    sheets: [],
    libraries: [{
      id: 'lib-1', title: 'L', fields: [
        { id: 'fld-1', label: 'A', type: 'text' }
      ], items: [{
        id: 'itm-1', name: 'I', values: { 'fld-missing': 1 }
      }]
    }],
    macros: [{
      id: 'macro-1', name: 'M', surface: 'panel', itemId: 'same',
      steps: [{ id: 'step-1', type: 'set', targetId: 'missing', value: '' }]
    }]
  });
  const report = P.validateProject(project);
  const all = report.errors.concat(report.warnings);

  assert.ok(all.some((item) => /повторяется/.test(item.message)));
  assert.ok(all.some((item) => /несуществующее поле/.test(item.message)));
  assert.ok(all.some((item) => /Поле «missing» не найдено/.test(item.message)));
});

test('formatIssues нумерует проблемы и соблюдает лимит', () => {
  const report = {
    errors: [{ level: 'error', path: 'a', message: 'Ошибка A' }],
    warnings: [{ level: 'warning', path: '', message: 'Предупреждение B' }]
  };
  const lines = P.formatIssues(report, 1);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Ошибка · a: Ошибка A$/);
});

test('JSON-схема формата читается и описывает ключевые поля', () => {
  const schemaPath = path.join(__dirname, '..', 'schema', 'system.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.format.const, 'pom-system');
  assert.equal(schema.properties.formatVersion.maximum, 1);
  assert.deepEqual(schema.required.sort(), ['format', 'formatVersion', 'id', 'panel', 'title', 'version']);
  assert.ok(schema.$defs.component.properties.type.enum.includes('library'));
  assert.ok(schema.$defs.macroStep.properties.type.enum.includes('if'));

  const refs = JSON.stringify(schema).match(/"#\/\$defs\/[^"]+"/g) || [];
  refs.forEach((ref) => {
    const name = ref.replace('"#/$defs/', '').replace('"', '');
    assert.ok(schema.$defs[name], 'нет определения ' + name);
  });

  const demo = demoData();
  demo.panel.views.forEach((view) => {
    view.sections.forEach((section) => {
      section.items.forEach((item) => {
        assert.ok(schema.$defs.component.properties.type.enum.includes(item.type), item.type);
      });
    });
  });
  demo.macros.forEach((macro) => {
    assert.ok(schema.$defs.macro.properties.surface.enum.includes(macro.surface), macro.surface);
  });
});
