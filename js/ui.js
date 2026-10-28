'use strict';
/* =========================================================
   Редактор систем — маленькие помощники интерфейса
   ========================================================= */
window.POM_EDITOR = window.POM_EDITOR || {};

(function () {
  var toastTimer = null;

  POM_EDITOR.$ = function (selector) {
    return document.querySelector(selector);
  };

  POM_EDITOR.el = function (tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  POM_EDITOR.toast = function (text, kind) {
    var node = POM_EDITOR.$('#ed-toast');
    if (!node) return;
    node.textContent = text;
    node.className = 'ed-toast visible' + (kind ? ' ed-toast-' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.className = 'ed-toast';
    }, 2600);
  };

  POM_EDITOR.field = function (label, input, hint) {
    var wrap = POM_EDITOR.el('label', 'ed-field');
    wrap.appendChild(POM_EDITOR.el('span', 'ed-label', label));
    wrap.appendChild(input);
    if (hint) wrap.appendChild(POM_EDITOR.el('span', 'ed-hint', hint));
    return wrap;
  };

  POM_EDITOR.input = function (value, opts) {
    opts = opts || {};
    var node = document.createElement('input');
    node.className = 'ed-input' + (opts.className ? ' ' + opts.className : '');
    node.type = opts.type || 'text';
    node.value = value === undefined || value === null ? '' : String(value);
    if (opts.placeholder) node.placeholder = opts.placeholder;
    if (opts.maxLength) node.maxLength = opts.maxLength;
    if (opts.min !== undefined) node.min = opts.min;
    if (opts.max !== undefined) node.max = opts.max;
    if (opts.step !== undefined) node.step = opts.step;
    if (opts.readonly) node.readOnly = true;
    return node;
  };

  POM_EDITOR.textarea = function (value, opts) {
    opts = opts || {};
    var node = document.createElement('textarea');
    node.className = 'ed-input ed-textarea';
    node.value = value || '';
    if (opts.placeholder) node.placeholder = opts.placeholder;
    if (opts.rows) node.rows = opts.rows;
    return node;
  };

  POM_EDITOR.button = function (text, opts) {
    opts = opts || {};
    var node = POM_EDITOR.el('button', 'ed-btn' + (opts.className ? ' ' + opts.className : ''), text);
    node.type = 'button';
    if (opts.title) node.title = opts.title;
    if (opts.disabled) node.disabled = true;
    return node;
  };

  POM_EDITOR.iconButton = function (text, title, opts) {
    opts = opts || {};
    var node = POM_EDITOR.el('button', 'ed-icon-btn' + (opts.className ? ' ' + opts.className : ''), text);
    node.type = 'button';
    node.title = title || '';
    if (opts.disabled) node.disabled = true;
    return node;
  };

  /* Подтверждение в стиле редактора вместо нативного confirm(). */
  POM_EDITOR.confirmAction = function (options) {
    var opts = options || {};
    var modal = POM_EDITOR.el('div', 'ed-modal');
    var backdrop = POM_EDITOR.el('div', 'ed-modal-backdrop');
    var card = POM_EDITOR.el('div', 'ed-modal-card ed-confirm-card');

    var head = POM_EDITOR.el('div', 'ed-modal-head');
    head.appendChild(POM_EDITOR.el('div', 'ed-modal-title', opts.title || 'Подтверждение'));
    card.appendChild(head);

    var body = POM_EDITOR.el('div', 'ed-confirm-body');
    body.appendChild(POM_EDITOR.el('p', 'ed-confirm-text', opts.text || 'Продолжить?'));
    card.appendChild(body);

    var foot = POM_EDITOR.el('div', 'ed-confirm-foot');
    var cancel = POM_EDITOR.button(opts.cancelText || 'Отмена');
    var accept = POM_EDITOR.button(opts.confirmText || 'Подтвердить', {
      className: opts.danger ? 'ed-btn-danger' : 'ed-btn-accent'
    });
    foot.appendChild(cancel);
    foot.appendChild(accept);
    card.appendChild(foot);

    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);
    accept.focus();

    function close() {
      document.removeEventListener('keydown', onKey);
      modal.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    cancel.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    accept.addEventListener('click', function () {
      close();
      if (opts.onConfirm) opts.onConfirm();
    });
    document.addEventListener('keydown', onKey);
  };
})();
