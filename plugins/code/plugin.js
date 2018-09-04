(function () {
var code = (function () {
  'use strict';

  var global = tinymce.util.Tools.resolve('tinymce.PluginManager');

  var global$1 = tinymce.util.Tools.resolve('tinymce.dom.DOMUtils');

  var getMinWidth = function (editor) {
    return editor.getParam('code_dialog_width', 600);
  };
  var getMinHeight = function (editor) {
    return editor.getParam('code_dialog_height', Math.min(global$1.DOM.getViewPort().h - 200, 500));
  };
  var $_2qvwg6a2jlnue9xo = {
    getMinWidth: getMinWidth,
    getMinHeight: getMinHeight
  };

  var setContent = function (editor, html) {
    editor.focus();
    editor.undoManager.transact(function () {
      editor.setContent(html);
    });
    editor.selection.setCursorLocation();
    editor.nodeChanged();
  };
  var getContent = function (editor) {
    return editor.getContent({ source_view: true });
  };
  var $_d5ctaqa4jlnue9xr = {
    setContent: setContent,
    getContent: getContent
  };

  var open = function (editor) {
    var minWidth = $_2qvwg6a2jlnue9xo.getMinWidth(editor);
    var minHeight = $_2qvwg6a2jlnue9xo.getMinHeight(editor);
    var win = editor.windowManager.open({
      title: 'Source code',
      body: {
        type: 'textbox',
        name: 'code',
        multiline: true,
        minWidth: minWidth,
        minHeight: minHeight,
        spellcheck: false,
        style: 'direction: ltr; text-align: left'
      },
      onSubmit: function (e) {
        $_d5ctaqa4jlnue9xr.setContent(editor, e.data.code);
      }
    });
    win.find('#code').value($_d5ctaqa4jlnue9xr.getContent(editor));
  };
  var $_ewrjhma1jlnue9xl = { open: open };

  var register = function (editor) {
    editor.addCommand('mceCodeEditor', function () {
      $_ewrjhma1jlnue9xl.open(editor);
    });
  };
  var $_4klq85a0jlnue9xi = { register: register };

  var register$1 = function (editor) {
    editor.addButton('code', {
      icon: 'code',
      tooltip: 'Source code',
      onclick: function () {
        $_ewrjhma1jlnue9xl.open(editor);
      }
    });
    editor.addMenuItem('code', {
      icon: 'code',
      text: 'Source code',
      onclick: function () {
        $_ewrjhma1jlnue9xl.open(editor);
      }
    });
  };
  var $_bh1jima5jlnue9xt = { register: register$1 };

  global.add('code', function (editor) {
    $_4klq85a0jlnue9xi.register(editor);
    $_bh1jima5jlnue9xt.register(editor);
    return {};
  });
  function Plugin () {
  }

  return Plugin;

}());
})();
