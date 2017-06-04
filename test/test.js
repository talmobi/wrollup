var path = require('path')
var childProcess = require('child_process')
var fs = require('fs')

var test = require('tape')

var _spawns = []

process.on('exit', function () {
  _spawns.forEach(function (spawn) {
    try {
      spawn.kill()
    } catch (err) {}
  })
})

function exec (cmd, args) {
  var spawn = childProcess.spawn(cmd, args)
  _spawns.push(spawn)

  var _buffer
  var _listeners = {}

  function handler (chunk) {
    _buffer += chunk.toString('utf8')
    _listeners['data'] && _listeners['data'].forEach(function (cb) {
      cb(chunk)
    })
  }

  spawn.stdout.on('data', handler)
  spawn.stderr.on('data', handler)

  var api = {}
  api.kill = function () {
    spawn.kill()
  }
  api.getBuffer = function () {
    return _buffer
  }
  api.on = function (evt, cb) {
    _listeners[evt] = _listeners[evt] || []
    _listeners[evt].push(cb)
    return function () {
      var i = _listeners[evt].indexOf(cb)
      return _listeners.splice(i, 1)
    }
  }

  return api
}

function stripAnsi (str) {
  // https://github.com/chalk/ansi-regex
  var ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]/g
  return str.replace(ansiRegex, '')
}

function normalize (str) {
  var s = stripAnsi(str)
  s = s.replace(/\s+/g, '')
  s = s.toLowerCase()
  return s
}

test('start watching on successful initial build', function (t) {
  t.plan(1)

  // clean project files
  var a, b, data
  a = path.resolve('untouched_src/App.jsx')
  b = path.resolve('src/App.jsx')
  data = fs.readFileSync(a)
  fs.writeFileSync(b, data)
  a = path.resolve('untouched_src/index.js')
  b = path.resolve('src/index.js')
  data = fs.readFileSync(a)
  fs.writeFileSync(b, data)
  a = path.resolve('untouched_src/message.js')
  b = path.resolve('src/message.js')
  data = fs.readFileSync(a)
  fs.writeFileSync(b, data)

  // exec('../cli.js', ['-c', 'rollup.config.js'], function (buffer) {
  console.log('cwd: ' + process.cwd())
  var api = exec('npm', ['start'])

  var finish = function () {
    console.log('finishing tests...')
    setTimeout(function () {
      var buffer = api.getBuffer()
      api.kill()
      buffer = stripAnsi(buffer)
      var lines = buffer.split('\n')

      var expectedLines = [
        '  watching /test/src/message.js',
        '  watching /test/src/App.jsx',
        '  watching /test/src/index.js',
        'compiled dist/bundle.js',
        'modification from ./src/App.jsx',
        'compiled dist/bundle.js',
        'modification from ./src/index.js',
        'compiled dist/bundle.js',
        'modification from ./src/message.js',
        'compiled dist/bundle.js',
        'modification from ./src/App.jsx',
        '``` SyntaxError (3:37)',
        ' 1| import React from "react"',
        ' 2| ',
        ' 3| const Component = React.createClass({:',
        '-----------------------------------------^',
        ' 4|   render: function () {',
        ' 5|     return (',
        ' 6|       <div>Component { (new Date()).toLocaleString() }</div>',
        '',
        'SyntaxError: Error transforming [App.jsx]',
        'url: ' + path.resolve('src/App.jsx'),
        'modification from ./src/message.js',
        '``` SyntaxError (1:49)',
        ' 1| export default "yippeee, yaahhoooo, waaahhoooooo":',
        '-----------------------------------------------------^',
        ' 2| ',
        '',
        'SyntaxError: Error transforming [message.js]',
        'url: ' + path.resolve('src/message.js'),
        'modification from ./src/message.js',
        '``` SyntaxError (3:37)',
        ' 1| import React from "react"',
        ' 2| ',
        ' 3| const Component = React.createClass({:',
        '-----------------------------------------^',
        ' 4|   render: function () {',
        ' 5|     return (',
        ' 6|       <div>Component { (new Date()).toLocaleString() }</div>',
        '',
        'SyntaxError: Error transforming [App.jsx]',
        'url: ' + path.resolve('src/App.jsx'),
        'modification from ./src/App.jsx',
        '  watching /test/src/message.js',
        '  watching /test/src/App.jsx',
        '  watching /test/src/index.js',
        'compiled dist/bundle.js',
        ''
      ]

      var diffLines = lines.slice(4).filter(function (line, index, arr) {
        var isDifferent = (line !== expectedLines[index])
        if (isDifferent) {
          console.log('index: ' + index)
          console.log('[' + line + ']')
          console.log('[' + expectedLines[index] + ']')
        }
        return isDifferent
      })

      console.log(' === diffs === ')
      console.log(diffLines)

      t.ok(
        diffLines.length === 0,
        'should be nothing different in the output and expected output'
      )
    }, 500)
  }

  var actions = [
    function () { // trigger change event
      var a = path.resolve('untouched_src/App.jsx')
      var b = path.resolve('src/App.jsx')
      var data = fs.readFileSync(a)
      fs.writeFileSync(b, data)
    },
    function () { // trigger change event
      var a = path.resolve('untouched_src/index.js')
      var b = path.resolve('src/index.js')
      var data = fs.readFileSync(a)
      fs.writeFileSync(b, data)
    },
    function () { // trigger change event
      var a = path.resolve('untouched_src/message.js')
      var b = path.resolve('src/message.js')
      var data = fs.readFileSync(a)
      fs.writeFileSync(b, data)
    },
    function () { // add syntax error
      var a = path.resolve('untouched_src/App.jsx')
      var b = path.resolve('src/App.jsx')
      var data = fs.readFileSync(a)

      var lines = data.toString('utf8').split('\n')
      lines[2] += ':' // add syntax error

      fs.writeFileSync(b, lines.join('\n'))
    },
    function () { // add syntax error
      var a = path.resolve('untouched_src/message.js')
      var b = path.resolve('src/message.js')
      var data = fs.readFileSync(a)

      var lines = data.toString('utf8').split('\n')
      lines[0] += ':' // add syntax error

      fs.writeFileSync(b, lines.join('\n'))
    },
    function () { // fix message.js
      var a = path.resolve('untouched_src/message.js')
      var b = path.resolve('src/message.js')
      var data = fs.readFileSync(a)
      fs.writeFileSync(b, data)
    },
    function () { // fix App.jsx
      var a = path.resolve('untouched_src/App.jsx')
      var b = path.resolve('src/App.jsx')
      var data = fs.readFileSync(a)
      fs.writeFileSync(b, data)
    }
  ]

  setTimeout(function () {
    var i = 0;
    var next = function () {
      console.log('--> next action')
      var a = actions[i]
      a()
      if (actions[++i]) {
        setTimeout(next, 1000)
      } else {
        finish()
      }
    }
    next()
  }, 2000)
})
