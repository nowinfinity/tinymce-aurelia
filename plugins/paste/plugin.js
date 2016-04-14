/* */ 
"format cjs";
(function(process) {
  (function(exports, undefined) {
    "use strict";
    var modules = {};
    function require(ids, callback) {
      var module,
          defs = [];
      for (var i = 0; i < ids.length; ++i) {
        module = modules[ids[i]] || resolve(ids[i]);
        if (!module) {
          throw 'module definition dependecy not found: ' + ids[i];
        }
        defs.push(module);
      }
      callback.apply(null, defs);
    }
    function define(id, dependencies, definition) {
      if (typeof id !== 'string') {
        throw 'invalid module definition, module id must be defined and be a string';
      }
      if (dependencies === undefined) {
        throw 'invalid module definition, dependencies must be specified';
      }
      if (definition === undefined) {
        throw 'invalid module definition, definition function must be specified';
      }
      require(dependencies, function() {
        modules[id] = definition.apply(null, arguments);
      });
    }
    function defined(id) {
      return !!modules[id];
    }
    function resolve(id) {
      var target = exports;
      var fragments = id.split(/[.\/]/);
      for (var fi = 0; fi < fragments.length; ++fi) {
        if (!target[fragments[fi]]) {
          return;
        }
        target = target[fragments[fi]];
      }
      return target;
    }
    function expose(ids) {
      var i,
          target,
          id,
          fragments,
          privateModules;
      for (i = 0; i < ids.length; i++) {
        target = exports;
        id = ids[i];
        fragments = id.split(/[.\/]/);
        for (var fi = 0; fi < fragments.length - 1; ++fi) {
          if (target[fragments[fi]] === undefined) {
            target[fragments[fi]] = {};
          }
          target = target[fragments[fi]];
        }
        target[fragments[fragments.length - 1]] = modules[id];
      }
      if (exports.AMDLC_TESTS) {
        privateModules = exports.privateModules || {};
        for (id in modules) {
          privateModules[id] = modules[id];
        }
        for (i = 0; i < ids.length; i++) {
          delete privateModules[ids[i]];
        }
        exports.privateModules = privateModules;
      }
    }
    define("tinymce/pasteplugin/Utils", ["tinymce/util/Tools", "tinymce/html/DomParser", "tinymce/html/Schema"], function(Tools, DomParser, Schema) {
      function filter(content, items) {
        Tools.each(items, function(v) {
          if (v.constructor == RegExp) {
            content = content.replace(v, '');
          } else {
            content = content.replace(v[0], v[1]);
          }
        });
        return content;
      }
      function innerText(html) {
        var schema = new Schema(),
            domParser = new DomParser({}, schema),
            text = '';
        var shortEndedElements = schema.getShortEndedElements();
        var ignoreElements = Tools.makeMap('script noscript style textarea video audio iframe object', ' ');
        var blockElements = schema.getBlockElements();
        function walk(node) {
          var name = node.name,
              currentNode = node;
          if (name === 'br') {
            text += '\n';
            return;
          }
          if (shortEndedElements[name]) {
            text += ' ';
          }
          if (ignoreElements[name]) {
            text += ' ';
            return;
          }
          if (node.type == 3) {
            text += node.value;
          }
          if (!node.shortEnded) {
            if ((node = node.firstChild)) {
              do {
                walk(node);
              } while ((node = node.next));
            }
          }
          if (blockElements[name] && currentNode.next) {
            text += '\n';
            if (name == 'p') {
              text += '\n';
            }
          }
        }
        html = filter(html, [/<!\[[^\]]+\]>/g]);
        walk(domParser.parse(html));
        return text;
      }
      function trimHtml(html) {
        function trimSpaces(all, s1, s2) {
          if (!s1 && !s2) {
            return ' ';
          }
          return '\u00a0';
        }
        html = filter(html, [/^[\s\S]*<body[^>]*>\s*|\s*<\/body[^>]*>[\s\S]*$/g, /<!--StartFragment-->|<!--EndFragment-->/g, [/( ?)<span class="Apple-converted-space">\u00a0<\/span>( ?)/g, trimSpaces], /<br class="Apple-interchange-newline">/g, /<br>$/i]);
        return html;
      }
      function createIdGenerator(prefix) {
        var count = 0;
        return function() {
          return prefix + (count++);
        };
      }
      return {
        filter: filter,
        innerText: innerText,
        trimHtml: trimHtml,
        createIdGenerator: createIdGenerator
      };
    });
    define("tinymce/pasteplugin/Clipboard", ["tinymce/Env", "tinymce/dom/RangeUtils", "tinymce/util/VK", "tinymce/pasteplugin/Utils", "tinymce/util/Delay"], function(Env, RangeUtils, VK, Utils, Delay) {
      return function(editor) {
        var self = this,
            pasteBinElm,
            lastRng,
            keyboardPasteTimeStamp = 0,
            draggingInternally = false;
        var pasteBinDefaultContent = '%MCEPASTEBIN%',
            keyboardPastePlainTextState;
        var mceInternalUrlPrefix = 'data:text/mce-internal,';
        var uniqueId = Utils.createIdGenerator("mceclip");
        function pasteHtml(html) {
          var args,
              dom = editor.dom;
          args = editor.fire('BeforePastePreProcess', {content: html});
          args = editor.fire('PastePreProcess', args);
          html = args.content;
          if (!args.isDefaultPrevented()) {
            if (editor.hasEventListeners('PastePostProcess') && !args.isDefaultPrevented()) {
              var tempBody = dom.add(editor.getBody(), 'div', {style: 'display:none'}, html);
              args = editor.fire('PastePostProcess', {node: tempBody});
              dom.remove(tempBody);
              html = args.node.innerHTML;
            }
            if (!args.isDefaultPrevented()) {
              editor.insertContent(html, {
                merge: editor.settings.paste_merge_formats !== false,
                data: {paste: true}
              });
            }
          }
        }
        function pasteText(text) {
          text = editor.dom.encode(text).replace(/\r\n/g, '\n');
          var startBlock = editor.dom.getParent(editor.selection.getStart(), editor.dom.isBlock);
          var forcedRootBlockName = editor.settings.forced_root_block;
          var forcedRootBlockStartHtml;
          if (forcedRootBlockName) {
            forcedRootBlockStartHtml = editor.dom.createHTML(forcedRootBlockName, editor.settings.forced_root_block_attrs);
            forcedRootBlockStartHtml = forcedRootBlockStartHtml.substr(0, forcedRootBlockStartHtml.length - 3) + '>';
          }
          if ((startBlock && /^(PRE|DIV)$/.test(startBlock.nodeName)) || !forcedRootBlockName) {
            text = Utils.filter(text, [[/\n/g, "<br>"]]);
          } else {
            text = Utils.filter(text, [[/\n\n/g, "</p>" + forcedRootBlockStartHtml], [/^(.*<\/p>)(<p>)$/, forcedRootBlockStartHtml + '$1'], [/\n/g, "<br />"]]);
            if (text.indexOf('<p>') != -1) {
              text = forcedRootBlockStartHtml + text;
            }
          }
          pasteHtml(text);
        }
        function createPasteBin() {
          var dom = editor.dom,
              body = editor.getBody();
          var viewport = editor.dom.getViewPort(editor.getWin()),
              scrollTop = viewport.y,
              top = 20;
          var scrollContainer;
          lastRng = editor.selection.getRng();
          if (editor.inline) {
            scrollContainer = editor.selection.getScrollContainer();
            if (scrollContainer && scrollContainer.scrollTop > 0) {
              scrollTop = scrollContainer.scrollTop;
            }
          }
          function getCaretRect(rng) {
            var rects,
                textNode,
                node,
                container = rng.startContainer;
            rects = rng.getClientRects();
            if (rects.length) {
              return rects[0];
            }
            if (!rng.collapsed || container.nodeType != 1) {
              return;
            }
            node = container.childNodes[lastRng.startOffset];
            while (node && node.nodeType == 3 && !node.data.length) {
              node = node.nextSibling;
            }
            if (!node) {
              return;
            }
            if (node.tagName == 'BR') {
              textNode = dom.doc.createTextNode('\uFEFF');
              node.parentNode.insertBefore(textNode, node);
              rng = dom.createRng();
              rng.setStartBefore(textNode);
              rng.setEndAfter(textNode);
              rects = rng.getClientRects();
              dom.remove(textNode);
            }
            if (rects.length) {
              return rects[0];
            }
          }
          if (lastRng.getClientRects) {
            var rect = getCaretRect(lastRng);
            if (rect) {
              top = scrollTop + (rect.top - dom.getPos(body).y);
            } else {
              top = scrollTop;
              var container = lastRng.startContainer;
              if (container) {
                if (container.nodeType == 3 && container.parentNode != body) {
                  container = container.parentNode;
                }
                if (container.nodeType == 1) {
                  top = dom.getPos(container, scrollContainer || body).y;
                }
              }
            }
          }
          pasteBinElm = dom.add(editor.getBody(), 'div', {
            id: "mcepastebin",
            contentEditable: true,
            "data-mce-bogus": "all",
            style: 'position: absolute; top: ' + top + 'px;' + 'width: 10px; height: 10px; overflow: hidden; opacity: 0'
          }, pasteBinDefaultContent);
          if (Env.ie || Env.gecko) {
            dom.setStyle(pasteBinElm, 'left', dom.getStyle(body, 'direction', true) == 'rtl' ? 0xFFFF : -0xFFFF);
          }
          dom.bind(pasteBinElm, 'beforedeactivate focusin focusout', function(e) {
            e.stopPropagation();
          });
          pasteBinElm.focus();
          editor.selection.select(pasteBinElm, true);
        }
        function removePasteBin() {
          if (pasteBinElm) {
            var pasteBinClone;
            while ((pasteBinClone = editor.dom.get('mcepastebin'))) {
              editor.dom.remove(pasteBinClone);
              editor.dom.unbind(pasteBinClone);
            }
            if (lastRng) {
              editor.selection.setRng(lastRng);
            }
          }
          pasteBinElm = lastRng = null;
        }
        function getPasteBinHtml() {
          var html = '',
              pasteBinClones,
              i,
              clone,
              cloneHtml;
          pasteBinClones = editor.dom.select('div[id=mcepastebin]');
          for (i = 0; i < pasteBinClones.length; i++) {
            clone = pasteBinClones[i];
            if (clone.firstChild && clone.firstChild.id == 'mcepastebin') {
              clone = clone.firstChild;
            }
            cloneHtml = clone.innerHTML;
            if (html != pasteBinDefaultContent) {
              html += cloneHtml;
            }
          }
          return html;
        }
        function getDataTransferItems(dataTransfer) {
          var items = {};
          if (dataTransfer) {
            if (dataTransfer.getData) {
              var legacyText = dataTransfer.getData('Text');
              if (legacyText && legacyText.length > 0) {
                if (legacyText.indexOf(mceInternalUrlPrefix) == -1) {
                  items['text/plain'] = legacyText;
                }
              }
            }
            if (dataTransfer.types) {
              for (var i = 0; i < dataTransfer.types.length; i++) {
                var contentType = dataTransfer.types[i];
                items[contentType] = dataTransfer.getData(contentType);
              }
            }
          }
          return items;
        }
        function getClipboardContent(clipboardEvent) {
          return getDataTransferItems(clipboardEvent.clipboardData || editor.getDoc().dataTransfer);
        }
        function hasHtmlOrText(content) {
          return hasContentType(content, 'text/html') || hasContentType(content, 'text/plain');
        }
        function pasteImageData(e, rng) {
          var dataTransfer = e.clipboardData || e.dataTransfer;
          function getBase64FromUri(uri) {
            var idx;
            idx = uri.indexOf(',');
            if (idx !== -1) {
              return uri.substr(idx + 1);
            }
            return null;
          }
          function processItems(items) {
            var i,
                item,
                reader,
                hadImage = false;
            function pasteImage(reader, blob) {
              if (rng) {
                editor.selection.setRng(rng);
                rng = null;
              }
              var blobCache = editor.editorUpload.blobCache;
              var blobInfo = blobCache.create(uniqueId(), blob, getBase64FromUri(reader.result));
              blobCache.add(blobInfo);
              pasteHtml('<img src="' + blobInfo.blobUri() + '">');
            }
            if (items) {
              for (i = 0; i < items.length; i++) {
                item = items[i];
                if (/^image\/(jpeg|png|gif|bmp)$/.test(item.type)) {
                  var blob = item.getAsFile ? item.getAsFile() : item;
                  reader = new FileReader();
                  reader.onload = pasteImage.bind(null, reader, blob);
                  reader.readAsDataURL(blob);
                  e.preventDefault();
                  hadImage = true;
                }
              }
            }
            return hadImage;
          }
          if (editor.settings.paste_data_images && dataTransfer) {
            return processItems(dataTransfer.items) || processItems(dataTransfer.files);
          }
        }
        function isBrokenAndroidClipboardEvent(e) {
          var clipboardData = e.clipboardData;
          return navigator.userAgent.indexOf('Android') != -1 && clipboardData && clipboardData.items && clipboardData.items.length === 0;
        }
        function getCaretRangeFromEvent(e) {
          return RangeUtils.getCaretRangeFromPoint(e.clientX, e.clientY, editor.getDoc());
        }
        function hasContentType(clipboardContent, mimeType) {
          return mimeType in clipboardContent && clipboardContent[mimeType].length > 0;
        }
        function isKeyboardPasteEvent(e) {
          return (VK.metaKeyPressed(e) && e.keyCode == 86) || (e.shiftKey && e.keyCode == 45);
        }
        function registerEventHandlers() {
          editor.on('keydown', function(e) {
            function removePasteBinOnKeyUp(e) {
              if (isKeyboardPasteEvent(e) && !e.isDefaultPrevented()) {
                removePasteBin();
              }
            }
            if (isKeyboardPasteEvent(e) && !e.isDefaultPrevented()) {
              keyboardPastePlainTextState = e.shiftKey && e.keyCode == 86;
              if (keyboardPastePlainTextState && Env.webkit && navigator.userAgent.indexOf('Version/') != -1) {
                return;
              }
              e.stopImmediatePropagation();
              keyboardPasteTimeStamp = new Date().getTime();
              if (Env.ie && keyboardPastePlainTextState) {
                e.preventDefault();
                editor.fire('paste', {ieFake: true});
                return;
              }
              removePasteBin();
              createPasteBin();
              editor.once('keyup', removePasteBinOnKeyUp);
              editor.once('paste', function() {
                editor.off('keyup', removePasteBinOnKeyUp);
              });
            }
          });
          function insertClipboardContent(clipboardContent, isKeyBoardPaste, plainTextMode) {
            var content;
            if (hasContentType(clipboardContent, 'text/html')) {
              content = clipboardContent['text/html'];
            } else {
              content = getPasteBinHtml();
              if (content == pasteBinDefaultContent) {
                plainTextMode = true;
              }
            }
            content = Utils.trimHtml(content);
            if (pasteBinElm && pasteBinElm.firstChild && pasteBinElm.firstChild.id === 'mcepastebin') {
              plainTextMode = true;
            }
            removePasteBin();
            if (!content.length) {
              plainTextMode = true;
            }
            if (plainTextMode) {
              if (hasContentType(clipboardContent, 'text/plain') && content.indexOf('</p>') == -1) {
                content = clipboardContent['text/plain'];
              } else {
                content = Utils.innerText(content);
              }
            }
            if (content == pasteBinDefaultContent) {
              if (!isKeyBoardPaste) {
                editor.windowManager.alert('Please use Ctrl+V/Cmd+V keyboard shortcuts to paste contents.');
              }
              return;
            }
            if (plainTextMode) {
              pasteText(content);
            } else {
              pasteHtml(content);
            }
          }
          var getLastRng = function() {
            return lastRng || editor.selection.getRng();
          };
          editor.on('paste', function(e) {
            var clipboardTimer = new Date().getTime();
            var clipboardContent = getClipboardContent(e);
            var clipboardDelay = new Date().getTime() - clipboardTimer;
            var isKeyBoardPaste = (new Date().getTime() - keyboardPasteTimeStamp - clipboardDelay) < 1000;
            var plainTextMode = self.pasteFormat == "text" || keyboardPastePlainTextState;
            keyboardPastePlainTextState = false;
            if (e.isDefaultPrevented() || isBrokenAndroidClipboardEvent(e)) {
              removePasteBin();
              return;
            }
            if (!hasHtmlOrText(clipboardContent) && pasteImageData(e, getLastRng())) {
              removePasteBin();
              return;
            }
            if (!isKeyBoardPaste) {
              e.preventDefault();
            }
            if (Env.ie && (!isKeyBoardPaste || e.ieFake)) {
              createPasteBin();
              editor.dom.bind(pasteBinElm, 'paste', function(e) {
                e.stopPropagation();
              });
              editor.getDoc().execCommand('Paste', false, null);
              clipboardContent["text/html"] = getPasteBinHtml();
            }
            if (hasContentType(clipboardContent, 'text/html')) {
              e.preventDefault();
              insertClipboardContent(clipboardContent, isKeyBoardPaste, plainTextMode);
            } else {
              Delay.setEditorTimeout(editor, function() {
                insertClipboardContent(clipboardContent, isKeyBoardPaste, plainTextMode);
              }, 0);
            }
          });
          editor.on('dragstart dragend', function(e) {
            draggingInternally = e.type == 'dragstart';
          });
          function isPlainTextFileUrl(content) {
            return content['text/plain'].indexOf('file://') === 0;
          }
          editor.on('drop', function(e) {
            var dropContent,
                rng;
            rng = getCaretRangeFromEvent(e);
            if (e.isDefaultPrevented() || draggingInternally) {
              return;
            }
            dropContent = getDataTransferItems(e.dataTransfer);
            if ((!hasHtmlOrText(dropContent) || isPlainTextFileUrl(dropContent)) && pasteImageData(e, rng)) {
              return;
            }
            if (rng && editor.settings.paste_filter_drop !== false) {
              var content = dropContent['mce-internal'] || dropContent['text/html'] || dropContent['text/plain'];
              if (content) {
                e.preventDefault();
                Delay.setEditorTimeout(editor, function() {
                  editor.undoManager.transact(function() {
                    if (dropContent['mce-internal']) {
                      editor.execCommand('Delete');
                    }
                    editor.selection.setRng(rng);
                    content = Utils.trimHtml(content);
                    if (!dropContent['text/html']) {
                      pasteText(content);
                    } else {
                      pasteHtml(content);
                    }
                  });
                });
              }
            }
          });
          editor.on('dragover dragend', function(e) {
            if (editor.settings.paste_data_images) {
              e.preventDefault();
            }
          });
        }
        self.pasteHtml = pasteHtml;
        self.pasteText = pasteText;
        editor.on('preInit', function() {
          registerEventHandlers();
          editor.parser.addNodeFilter('img', function(nodes, name, args) {
            function isPasteInsert(args) {
              return args.data && args.data.paste === true;
            }
            function remove(node) {
              if (!node.attr('data-mce-object') && src !== Env.transparentSrc) {
                node.remove();
              }
            }
            function isWebKitFakeUrl(src) {
              return src.indexOf("webkit-fake-url") === 0;
            }
            function isDataUri(src) {
              return src.indexOf("data:") === 0;
            }
            if (!editor.settings.paste_data_images && isPasteInsert(args)) {
              var i = nodes.length;
              while (i--) {
                var src = nodes[i].attributes.map.src;
                if (!src) {
                  continue;
                }
                if (isWebKitFakeUrl(src)) {
                  remove(nodes[i]);
                } else if (!editor.settings.allow_html_data_urls && isDataUri(src)) {
                  remove(nodes[i]);
                }
              }
            }
          });
        });
      };
    });
    define("tinymce/pasteplugin/WordFilter", ["tinymce/util/Tools", "tinymce/html/DomParser", "tinymce/html/Schema", "tinymce/html/Serializer", "tinymce/html/Node", "tinymce/pasteplugin/Utils"], function(Tools, DomParser, Schema, Serializer, Node, Utils) {
      function isWordContent(content) {
        return ((/<font face="Times New Roman"|class="?Mso|style="[^"]*\bmso-|style='[^'']*\bmso-|w:WordDocument/i).test(content) || (/class="OutlineElement/).test(content) || (/id="?docs\-internal\-guid\-/.test(content)));
      }
      function isNumericList(text) {
        var found,
            patterns;
        patterns = [/^[IVXLMCD]{1,2}\.[ \u00a0]/, /^[ivxlmcd]{1,2}\.[ \u00a0]/, /^[a-z]{1,2}[\.\)][ \u00a0]/, /^[A-Z]{1,2}[\.\)][ \u00a0]/, /^[0-9]+\.[ \u00a0]/, /^[\u3007\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]+\.[ \u00a0]/, /^[\u58f1\u5f10\u53c2\u56db\u4f0d\u516d\u4e03\u516b\u4e5d\u62fe]+\.[ \u00a0]/];
        text = text.replace(/^[\u00a0 ]+/, '');
        Tools.each(patterns, function(pattern) {
          if (pattern.test(text)) {
            found = true;
            return false;
          }
        });
        return found;
      }
      function isBulletList(text) {
        return /^[\s\u00a0]*[\u2022\u00b7\u00a7\u25CF]\s*/.test(text);
      }
      function WordFilter(editor) {
        var settings = editor.settings;
        editor.on('BeforePastePreProcess', function(e) {
          var content = e.content,
              retainStyleProperties,
              validStyles;
          content = content.replace(/<b[^>]+id="?docs-internal-[^>]*>/gi, '');
          content = content.replace(/<br class="?Apple-interchange-newline"?>/gi, '');
          retainStyleProperties = settings.paste_retain_style_properties;
          if (retainStyleProperties) {
            validStyles = Tools.makeMap(retainStyleProperties.split(/[, ]/));
          }
          function convertFakeListsToProperLists(node) {
            var currentListNode,
                prevListNode,
                lastLevel = 1;
            function getText(node) {
              var txt = '';
              if (node.type === 3) {
                return node.value;
              }
              if ((node = node.firstChild)) {
                do {
                  txt += getText(node);
                } while ((node = node.next));
              }
              return txt;
            }
            function trimListStart(node, regExp) {
              if (node.type === 3) {
                if (regExp.test(node.value)) {
                  node.value = node.value.replace(regExp, '');
                  return false;
                }
              }
              if ((node = node.firstChild)) {
                do {
                  if (!trimListStart(node, regExp)) {
                    return false;
                  }
                } while ((node = node.next));
              }
              return true;
            }
            function removeIgnoredNodes(node) {
              if (node._listIgnore) {
                node.remove();
                return;
              }
              if ((node = node.firstChild)) {
                do {
                  removeIgnoredNodes(node);
                } while ((node = node.next));
              }
            }
            function convertParagraphToLi(paragraphNode, listName, start) {
              var level = paragraphNode._listLevel || lastLevel;
              if (level != lastLevel) {
                if (level < lastLevel) {
                  if (currentListNode) {
                    currentListNode = currentListNode.parent.parent;
                  }
                } else {
                  prevListNode = currentListNode;
                  currentListNode = null;
                }
              }
              if (!currentListNode || currentListNode.name != listName) {
                prevListNode = prevListNode || currentListNode;
                currentListNode = new Node(listName, 1);
                if (start > 1) {
                  currentListNode.attr('start', '' + start);
                }
                paragraphNode.wrap(currentListNode);
              } else {
                currentListNode.append(paragraphNode);
              }
              paragraphNode.name = 'li';
              if (level > lastLevel && prevListNode) {
                prevListNode.lastChild.append(currentListNode);
              }
              lastLevel = level;
              removeIgnoredNodes(paragraphNode);
              trimListStart(paragraphNode, /^\u00a0+/);
              trimListStart(paragraphNode, /^\s*([\u2022\u00b7\u00a7\u25CF]|\w+\.)/);
              trimListStart(paragraphNode, /^\u00a0+/);
            }
            var elements = [],
                child = node.firstChild;
            while (typeof child !== 'undefined' && child !== null) {
              elements.push(child);
              child = child.walk();
              if (child !== null) {
                while (typeof child !== 'undefined' && child.parent !== node) {
                  child = child.walk();
                }
              }
            }
            for (var i = 0; i < elements.length; i++) {
              node = elements[i];
              if (node.name == 'p' && node.firstChild) {
                var nodeText = getText(node);
                if (isBulletList(nodeText)) {
                  convertParagraphToLi(node, 'ul');
                  continue;
                }
                if (isNumericList(nodeText)) {
                  var matches = /([0-9]+)\./.exec(nodeText);
                  var start = 1;
                  if (matches) {
                    start = parseInt(matches[1], 10);
                  }
                  convertParagraphToLi(node, 'ol', start);
                  continue;
                }
                if (node._listLevel) {
                  convertParagraphToLi(node, 'ul', 1);
                  continue;
                }
                currentListNode = null;
              } else {
                prevListNode = currentListNode;
                currentListNode = null;
              }
            }
          }
          function filterStyles(node, styleValue) {
            var outputStyles = {},
                matches,
                styles = editor.dom.parseStyle(styleValue);
            Tools.each(styles, function(value, name) {
              switch (name) {
                case 'mso-list':
                  matches = /\w+ \w+([0-9]+)/i.exec(styleValue);
                  if (matches) {
                    node._listLevel = parseInt(matches[1], 10);
                  }
                  if (/Ignore/i.test(value) && node.firstChild) {
                    node._listIgnore = true;
                    node.firstChild._listIgnore = true;
                  }
                  break;
                case "horiz-align":
                  name = "text-align";
                  break;
                case "vert-align":
                  name = "vertical-align";
                  break;
                case "font-color":
                case "mso-foreground":
                  name = "color";
                  break;
                case "mso-background":
                case "mso-highlight":
                  name = "background";
                  break;
                case "font-weight":
                case "font-style":
                  if (value != "normal") {
                    outputStyles[name] = value;
                  }
                  return;
                case "mso-element":
                  if (/^(comment|comment-list)$/i.test(value)) {
                    node.remove();
                    return;
                  }
                  break;
              }
              if (name.indexOf('mso-comment') === 0) {
                node.remove();
                return;
              }
              if (name.indexOf('mso-') === 0) {
                return;
              }
              if (retainStyleProperties == "all" || (validStyles && validStyles[name])) {
                outputStyles[name] = value;
              }
            });
            if (/(bold)/i.test(outputStyles["font-weight"])) {
              delete outputStyles["font-weight"];
              node.wrap(new Node("b", 1));
            }
            if (/(italic)/i.test(outputStyles["font-style"])) {
              delete outputStyles["font-style"];
              node.wrap(new Node("i", 1));
            }
            outputStyles = editor.dom.serializeStyle(outputStyles, node.name);
            if (outputStyles) {
              return outputStyles;
            }
            return null;
          }
          if (settings.paste_enable_default_filters === false) {
            return;
          }
          if (isWordContent(e.content)) {
            e.wordContent = true;
            content = Utils.filter(content, [/<!--[\s\S]+?-->/gi, /<(!|script[^>]*>.*?<\/script(?=[>\s])|\/?(\?xml(:\w+)?|img|meta|link|style|\w:\w+)(?=[\s\/>]))[^>]*>/gi, [/<(\/?)s>/gi, "<$1strike>"], [/&nbsp;/gi, "\u00a0"], [/<span\s+style\s*=\s*"\s*mso-spacerun\s*:\s*yes\s*;?\s*"\s*>([\s\u00a0]*)<\/span>/gi, function(str, spaces) {
              return (spaces.length > 0) ? spaces.replace(/./, " ").slice(Math.floor(spaces.length / 2)).split("").join("\u00a0") : "";
            }]]);
            var validElements = settings.paste_word_valid_elements;
            if (!validElements) {
              validElements = ('-strong/b,-em/i,-u,-span,-p,-ol,-ul,-li,-h1,-h2,-h3,-h4,-h5,-h6,' + '-p/div,-a[href|name],sub,sup,strike,br,del,table[width],tr,' + 'td[colspan|rowspan|width],th[colspan|rowspan|width],thead,tfoot,tbody');
            }
            var schema = new Schema({
              valid_elements: validElements,
              valid_children: '-li[p]'
            });
            Tools.each(schema.elements, function(rule) {
              if (!rule.attributes["class"]) {
                rule.attributes["class"] = {};
                rule.attributesOrder.push("class");
              }
              if (!rule.attributes.style) {
                rule.attributes.style = {};
                rule.attributesOrder.push("style");
              }
            });
            var domParser = new DomParser({}, schema);
            domParser.addAttributeFilter('style', function(nodes) {
              var i = nodes.length,
                  node;
              while (i--) {
                node = nodes[i];
                node.attr('style', filterStyles(node, node.attr('style')));
                if (node.name == 'span' && node.parent && !node.attributes.length) {
                  node.unwrap();
                }
              }
            });
            domParser.addAttributeFilter('class', function(nodes) {
              var i = nodes.length,
                  node,
                  className;
              while (i--) {
                node = nodes[i];
                className = node.attr('class');
                if (/^(MsoCommentReference|MsoCommentText|msoDel)$/i.test(className)) {
                  node.remove();
                }
                node.attr('class', null);
              }
            });
            domParser.addNodeFilter('del', function(nodes) {
              var i = nodes.length;
              while (i--) {
                nodes[i].remove();
              }
            });
            domParser.addNodeFilter('a', function(nodes) {
              var i = nodes.length,
                  node,
                  href,
                  name;
              while (i--) {
                node = nodes[i];
                href = node.attr('href');
                name = node.attr('name');
                if (href && href.indexOf('#_msocom_') != -1) {
                  node.remove();
                  continue;
                }
                if (href && href.indexOf('file://') === 0) {
                  href = href.split('#')[1];
                  if (href) {
                    href = '#' + href;
                  }
                }
                if (!href && !name) {
                  node.unwrap();
                } else {
                  if (name && !/^_?(?:toc|edn|ftn)/i.test(name)) {
                    node.unwrap();
                    continue;
                  }
                  node.attr({
                    href: href,
                    name: name
                  });
                }
              }
            });
            var rootNode = domParser.parse(content);
            if (settings.paste_convert_word_fake_lists !== false) {
              convertFakeListsToProperLists(rootNode);
            }
            e.content = new Serializer({validate: settings.validate}, schema).serialize(rootNode);
          }
        });
      }
      WordFilter.isWordContent = isWordContent;
      return WordFilter;
    });
    define("tinymce/pasteplugin/Quirks", ["tinymce/Env", "tinymce/util/Tools", "tinymce/pasteplugin/WordFilter", "tinymce/pasteplugin/Utils"], function(Env, Tools, WordFilter, Utils) {
      "use strict";
      return function(editor) {
        function addPreProcessFilter(filterFunc) {
          editor.on('BeforePastePreProcess', function(e) {
            e.content = filterFunc(e.content);
          });
        }
        function removeExplorerBrElementsAfterBlocks(html) {
          if (!WordFilter.isWordContent(html)) {
            return html;
          }
          var blockElements = [];
          Tools.each(editor.schema.getBlockElements(), function(block, blockName) {
            blockElements.push(blockName);
          });
          var explorerBlocksRegExp = new RegExp('(?:<br>&nbsp;[\\s\\r\\n]+|<br>)*(<\\/?(' + blockElements.join('|') + ')[^>]*>)(?:<br>&nbsp;[\\s\\r\\n]+|<br>)*', 'g');
          html = Utils.filter(html, [[explorerBlocksRegExp, '$1']]);
          html = Utils.filter(html, [[/<br><br>/g, '<BR><BR>'], [/<br>/g, ' '], [/<BR><BR>/g, '<br>']]);
          return html;
        }
        function removeWebKitStyles(content) {
          if (WordFilter.isWordContent(content)) {
            return content;
          }
          var webKitStyles = editor.settings.paste_webkit_styles;
          if (editor.settings.paste_remove_styles_if_webkit === false || webKitStyles == "all") {
            return content;
          }
          if (webKitStyles) {
            webKitStyles = webKitStyles.split(/[, ]/);
          }
          if (webKitStyles) {
            var dom = editor.dom,
                node = editor.selection.getNode();
            content = content.replace(/(<[^>]+) style="([^"]*)"([^>]*>)/gi, function(all, before, value, after) {
              var inputStyles = dom.parseStyle(value, 'span'),
                  outputStyles = {};
              if (webKitStyles === "none") {
                return before + after;
              }
              for (var i = 0; i < webKitStyles.length; i++) {
                var inputValue = inputStyles[webKitStyles[i]],
                    currentValue = dom.getStyle(node, webKitStyles[i], true);
                if (/color/.test(webKitStyles[i])) {
                  inputValue = dom.toHex(inputValue);
                  currentValue = dom.toHex(currentValue);
                }
                if (currentValue != inputValue) {
                  outputStyles[webKitStyles[i]] = inputValue;
                }
              }
              outputStyles = dom.serializeStyle(outputStyles, 'span');
              if (outputStyles) {
                return before + ' style="' + outputStyles + '"' + after;
              }
              return before + after;
            });
          } else {
            content = content.replace(/(<[^>]+) style="([^"]*)"([^>]*>)/gi, '$1$3');
          }
          content = content.replace(/(<[^>]+) data-mce-style="([^"]+)"([^>]*>)/gi, function(all, before, value, after) {
            return before + ' style="' + value + '"' + after;
          });
          return content;
        }
        if (Env.webkit) {
          addPreProcessFilter(removeWebKitStyles);
        }
        if (Env.ie) {
          addPreProcessFilter(removeExplorerBrElementsAfterBlocks);
        }
      };
    });
    define("tinymce/pasteplugin/Plugin", ["tinymce/PluginManager", "tinymce/pasteplugin/Clipboard", "tinymce/pasteplugin/WordFilter", "tinymce/pasteplugin/Quirks"], function(PluginManager, Clipboard, WordFilter, Quirks) {
      var userIsInformed;
      PluginManager.add('paste', function(editor) {
        var self = this,
            clipboard,
            settings = editor.settings;
        function isUserInformedAboutPlainText() {
          return userIsInformed || editor.settings.paste_plaintext_inform === false;
        }
        function togglePlainTextPaste() {
          if (clipboard.pasteFormat == "text") {
            this.active(false);
            clipboard.pasteFormat = "html";
            editor.fire('PastePlainTextToggle', {state: false});
          } else {
            clipboard.pasteFormat = "text";
            this.active(true);
            if (!isUserInformedAboutPlainText()) {
              var message = editor.translate('Paste is now in plain text mode. Contents will now ' + 'be pasted as plain text until you toggle this option off.');
              editor.notificationManager.open({
                text: message,
                type: 'info'
              });
              userIsInformed = true;
              editor.fire('PastePlainTextToggle', {state: true});
            }
          }
          editor.focus();
        }
        self.clipboard = clipboard = new Clipboard(editor);
        self.quirks = new Quirks(editor);
        self.wordFilter = new WordFilter(editor);
        if (editor.settings.paste_as_text) {
          self.clipboard.pasteFormat = "text";
        }
        if (settings.paste_preprocess) {
          editor.on('PastePreProcess', function(e) {
            settings.paste_preprocess.call(self, self, e);
          });
        }
        if (settings.paste_postprocess) {
          editor.on('PastePostProcess', function(e) {
            settings.paste_postprocess.call(self, self, e);
          });
        }
        editor.addCommand('mceInsertClipboardContent', function(ui, value) {
          if (value.content) {
            self.clipboard.pasteHtml(value.content);
          }
          if (value.text) {
            self.clipboard.pasteText(value.text);
          }
        });
        if (editor.settings.paste_block_drop) {
          editor.on('dragend dragover draggesture dragdrop drop drag', function(e) {
            e.preventDefault();
            e.stopPropagation();
          });
        }
        if (!editor.settings.paste_data_images) {
          editor.on('drop', function(e) {
            var dataTransfer = e.dataTransfer;
            if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
              e.preventDefault();
            }
          });
        }
        editor.addButton('pastetext', {
          icon: 'pastetext',
          tooltip: 'Paste as text',
          onclick: togglePlainTextPaste,
          active: self.clipboard.pasteFormat == "text"
        });
        editor.addMenuItem('pastetext', {
          text: 'Paste as text',
          selectable: true,
          active: clipboard.pasteFormat,
          onclick: togglePlainTextPaste
        });
      });
    });
    expose(["tinymce/pasteplugin/Utils"]);
  })(this);
})(require('process'));
