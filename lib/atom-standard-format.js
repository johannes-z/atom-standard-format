'use babel'

import { Range, Point } from 'atom'

var path = require('path')
var htmlSplitter = require('../utils/html-splitter')
var allowUnsafeNewFunction = require('loophole').allowUnsafeNewFunction

function syncLintText (text) {
  try {
    opts = this.parseOpts({ fix: true }).eslintConfig
    var engine = new this.eslint.CLIEngine(opts)
    var results = engine.executeOnText(text).results[0]
    if (results.errorCount > 0) {
      var messages = []
      for (let error in results.messages) {
        if (!error.fatal) continue
        var message = 'line: ' + error.line + ', ' + error.message
        messages.push(message)
      }
      if (messages.length > 0) {
        atom.notifications.addError(messages.join('\n'))
      }
    }
    return results.output
  } catch (err) {
    console.log('Error transforming using standard:', e)
    return text
  }
}

export default {
  style: null,
  fileTypes: [],

  activate () {
    this.commands = atom.commands.add('atom-workspace', {
      'atom-standard-format:format': () => {
        this.setStyle()
        this.format()
      }
    })
    this.editorObserver = atom.workspace.observeTextEditors(this.handleEvents.bind(this))
  },

  deactivate () {
    this.commands.dispose()
    this.editorObserver.dispose()
  },

  format (options) {
    var editor = atom.workspace.getActiveTextEditor()
    if (!editor) {
      // Return if the current active item is not a `TextEditor`
      return
    }
    var text = editor.getText()
    var filePath = editor.getPath()
    var fileScope = editor.getGrammar().scopeName
    var extension = filePath.slice((filePath.lastIndexOf('.') - 1 >>> 0) + 2)
    var cursorPosition = editor.getCursorScreenPosition()

    if (this.fileTypes.indexOf('.' + extension) < 0) {
      // Don't attempt format if the fileType is not supported
      return
    }

    if (/^.*\.js/.test(fileScope)) {
      var transformed = this.transformText(text)
      editor.setText(transformed ? transformed : text)
    } else {
      var scriptCodeBlocks = htmlSplitter(text)
      scriptCodeBlocks.forEach(function (block) {
        var range = this.getBlockRange(editor, block)
        var blockText = editor.buffer.getTextInRange(range)
        var transformed = this.transformText(blockText)
        editor.buffer.setTextInRange(range,
          transformed ? transformed.slice(0, -1) : blockText)
      }.bind(this))
    }
    editor.setCursorScreenPosition(cursorPosition)
  },

  transformText (text) {
    var style = this.style
    try {
      if (style === 'standard' || style === 'semistandard') {
        return allowUnsafeNewFunction(function () {
          return syncLintText.call(require(style), text)
        })
      } else {
        return require(style).transform(text)
      }
    } catch (e) {
      console.log(e)
    }
    return text
  },

  getBlockRange (editor, block) {
    var start = editor.buffer.positionForCharacterIndex(block.start)
    var end = editor.buffer.positionForCharacterIndex(block.end)
    if (start.row !== end.row) {
      var endAdj = new Point(end.row - 1,
                             editor.buffer.lineLengthForRow(end.row - 1))
      var startAdj = new Point(start.row + 1, 0)
      return new Range(startAdj, endAdj)
    } else {
      return new Range(start, end)
    }
  },

  setStyle () {
    this.fileTypes = atom.config.get('atom-standard-format.fileTypes')
    this.style = atom.config.get('atom-standard-format.style')
  },

  handleEvents (editor) {
    return editor.getBuffer().onWillSave(() => {
      var formatOnSave = atom.config.get('atom-standard-format.formatOnSave')
      if (!formatOnSave) return

      var path = editor.getPath()
      if (!path) return

      this.setStyle()
      this.format()
    })
  },

  config: {
    fileTypes: {
      type: 'array',
      default: ['.js', '.jsx', '.html', '.vue'],
      title: 'File Types',
      description: 'Applies formatter to scripts or script tags inside these file types.'
    },
    formatOnSave: {
      type: 'boolean',
      default: false
    },
    style: {
      type: 'string',
      default: 'standard',
      title: 'Style Formatter',
      description: 'The module to use for automatically fixing style issues',
      enum: ['standard', 'semistandard']
    }
  }
}
