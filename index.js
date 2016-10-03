'use strict'

var rollup = require('rollup')
var chokidar = require('chokidar')
var chalk = require('chalk')
var fs = require('fs')

var os = require('os')

var realpathSync = fs.realpathSync

var verbose = false // for debugging

var argv = require('minimist')(process.argv.slice(2))

// var relative = require('require-relative')
// var nodeResolve = require('rollup-plugin-node-resolve')
// var commonjs = require('rollup-plugin-commonjs')

var requireFromString = require('require-from-string')

var __last_error = null

var __error_timeout = null
var __warning_timeout = null

function cc (text, code) {
  // return ('\033[' + code + text + '\033[0m')
  return ('\u001b[' + code + text + '\u001b[0m')

}

var c = {
  'cyan': '36m',
  'magenta': '35m',
  'blue': '34m',
  'yellow': '33m',
  'green': '32m',
  'red': '31m',
  'gray': '90m',
}

var path = require('path')

// var _eval = require('eval')

var ENABLE_CACHE = !argv['nocache']
var cache
var watchers = {}

// chalk colours
var colors = ['green', 'yellow', 'blue', 'cyan', 'magenta', 'white']

var configPath = path.resolve(argv['c'] || argv['config'] || 'rollup.config.js')

// return console.log('configPath: ' + configPath)

process.chdir(configPath.substring(0, configPath.lastIndexOf('/')))

const stderr = console.error.bind( console )


// used to listen for change on all source files when an error occurs
// in order to re-initliaize source watching/bundling
var globalWatcher = undefined

var _globalWatcherTimeout = null
function setupGlobalWatcher () {
  if (globalWatcher === undefined) {
    // function trigger (evt, path) {
    //   // console.log(evt, path)
    //   triggerRebuild()
    // }
    globalWatcher = chokidar.watch('**/**/*.js?')
    globalWatcher.on('add', trigger, { usePolling: true })
    globalWatcher.on('change', trigger, { usePolling: true })

    verbose && console.log(cc('starting build error watcher [**/**/*.js]', c['yellow']))

    Object.keys(watchers).forEach(function (watcher) {
      try {
        watcher.close()
      } catch (e) {} // ignore
    })
    watchers = {}
  } else {
    verbose && console.log(cc('build error watcher still ready [**/**/*.js]', c['yellow']))
  }
}

rollup.rollup({
  entry: configPath,
  onwarn: function (message) {
    if ( /Treating .+ as external dependency/.test( message ) ) return
    printError( message )
    //setupGlobalWatcher()
  }
  // plugins: [ nodeResolve(), commonjs() ]
}).then(function (bundle) {
  var result = bundle.generate({ format: 'cjs' })
  var opts = requireFromString(result.code)
  // console.log(opts)
  init(opts)
}).then(function () {
  // console.log('initliaized')
}, function (err) {
  throw err
})

var options = undefined

function init (opts) {
  options = Object.assign({}, opts)
  build()
}

function log (text) {
  // console.log(chalk.gray(text))
}

// source: https://github.com/facebookincubator/create-react-app/b/m/s/start.js#L69-L73
function clearConsole () {
  // This seems to work best on Windows and other systems.
  // The intention is to clear the output so you can focus on most recent build.
  process.stdout.write('\x1bc')
}

function sliceOfFile (file, pos) {
  // console.log('slice file: ' + file)
  // console.log('slice pos: ' + pos)
  var lineNumber = pos.line - 1
  var column = pos.column
  var contents = fs.readFileSync(file, 'utf8')
  var lines = contents.split('\n')

  var line, index, i
  // find last non-empty line
  for (i = 0; i < lines.length; i++) {
    index = lineNumber - i
    line = lines[index]
    if (line.trim()) {
      // non-empty line found
      lineNumber = index
      break
    }

    // console.log('line was empty')
    // column data is corrupted, is probably last charater of previous line
    column = -1
  }

  // grab last 5 lines
  var results = []
  for (i = 0; i < 5; i++) {
    index = lineNumber + i - 4
    if (index >= 0) {
      var l = lines[index]
      // parse distracting escapes
      l = l.split('\'').join('"')
      results.push(l)
    }
  }

  // lastly push in small arrow indicator
  var lastLine = results[results.length - 1]
  var indicator = []
  for (i = 0; i < column; i++) indicator.push('_')
  if (column < 0) {
    indicator.push('^')
  } else {
    indicator[column] = '^'
  }
  results.push(indicator.join(''))
  results.push('')

  return results
}

var buildTimeout = null
var _timeout = null
function triggerRebuild () {
  clearTimeout(_timeout)
  // _timeout = setTimeout(function () {
  //   verbose && console.log(chalk.gray('triggering...'))
  // }, 20)
  clearTimeout(buildTimeout)
  buildTimeout = setTimeout(function () {
    build()
  }, 33)
}
var trigger = triggerRebuild

function honeydripError (err) {
  // console.log('honeydripping')
  try {
    // console.log('----  KEYS  ----')
    // console.log(Object.keys(err))
    // console.log('-------------')
    // console.log(err.id)
    // console.log('-------------')

    var honey = Object.assign({}, err)
    var type = err.stack.substring(0, err.stack.indexOf(':'))
    var info = err.stack.substring(0, err.stack.indexOf('/'))
    var file = honey.file || honey.id
    info += '[' + file.substring(file.lastIndexOf('/') + 1) + ']'
    honey.type = type
    honey.info = info

    var e = {
      type: honey.code || info.substring(0, info.indexOf(':')),
      msg: info.substring(info.indexOf(':') + 1, info.indexOf('[')),
      file: file,
      stub: file.substring(file.lastIndexOf('/') + 1),
      path: file.substring(0, file.lastIndexOf('/') + 1)
    }
    honey.info = e

    honey.slice = sliceOfFile(file, honey.loc)
    return [e.type, honey.loc, honey.info, honey.slice]
  } catch (e) {
    //console.error(e)
    // return e // return honey error for debugging purposes
    return err // return original error (probably a warning)
  }
}

function build () {
  // clearConsole()
  log(chalk.gray('bundling... [' + chalk.blue((new Date().toLocaleString())) + ']'))

  var opts = Object.assign({}, options)

  // use cache if available
  if (ENABLE_CACHE && cache && opts) {
    opts.cache = cache
  }

  var buildStart = Date.now()

  function throwWarning () {
  }

  opts.onwarn = function (warning) {
    throwWarning(warning)
  }

  rollup.rollup(opts).then(function (bundle) {
    // console.log('bla')
    cache = bundle

    // close globalWatcher if it was on
    if (globalWatcher !== undefined) {
      verbose && console.log(cc('removing global watcher', c['yellow']))
      globalWatcher.close()
      globalWatcher = undefined
    }

    for (let i = 0; i < bundle.modules.length; i++) {
      let module = bundle.modules[i]
      let id = module.id
      // log('[' + module.id + '] for loop, index: ' + i)

      // skip plugin helper modules
      if (/\0/.test(id)) {
        log(chalk.yellow('skipping helper module'))
        continue
      }

      // re-bind watchers on other platforms
      if (watchers[id] && os.platform() !== 'darwin') {
        var watcher = watchers[id]
        watcher.close()
        watchers[id] = null
      }

      if (!watchers[id]) {
        var cwd = process.cwd()
        var base = cwd.substring( cwd.lastIndexOf('/') )
        var filePath = base + id.substring( cwd.length )

        // ignore node_modules
        if (filePath.toLowerCase().indexOf('node_modules') === -1) {
          var watcher = chokidar.watch(id)
          watcher.on('change', function (path) {
            var now = Date.now()
            var t = watcher.__mtime

            fs.stat(id, function (err, stats) {
              var mtime = stats.mtime

              if (err) return console.log(err)

              if (t === undefined || mtime > t) {
                verbose && console.log('trigger from: ' + id)
                trigger()
                watcher.__mtime = mtime
              } else {
                verbose && console.log('ignoring trigger, nothing modified from: ' + id)
              }
            })
          }, {
            // use polling on linux and windows
            usePolling: os.platform() !== 'darwin'
          })
          watchers[id] = watcher

          console.log('  \u001b[90mwatching\u001b[0m %s', filePath);
        } else {
          // dont watch node_modules
        }
      }
    }

    return bundle.write(opts)
  }).then(function () {

    // console.log('XXXXXXXXXXXXXXXXXX')
    // console.log('XXXXXXXXXXXXXXXXXX')
    // console.log(a)
    // console.log(b)
    // console.log(c)
    // console.log('XXXXXXXXXXXXXXXXXX')
    // console.log('XXXXXXXXXXXXXXXXXX')

    var delta = Date.now() - buildStart
    log('bundling took: ' + chalk.cyan(delta) + ' milliseconds')
    log(chalk['green']('Success.'))

    // var str = (chalk.gray('compiled ') + options.dest)
    // process.stdout.write(str)

    var filePath = options.dest || 'successfully'
    //console.log('  \033[90mcompiled\033[0m %s', filePath);
    console.log(cc('compiled', c['gray']) + ' %s', filePath);

    // create dots after success message to more easily
    // distinguish between old and new rebuilds
    // for (var i = 0; i < 22; i++) {
    //   setTimeout(function () {
    //     process.stdout.write(chalk['green']('.'))
    //   }, i * 15)
    // }

  }, function (err) {

    // console.log('log: in error')
    // console.error('err: in error')
    // console.log('error')
    // console.log(err)
    var honey = honeydripError(err)

    try {
      var error = []
      // error.push('')
      // error.push('\n')
      // error.push(cc('-------------------', c['gray']))
      // error.push('\n')

      // error.push(chalk.gray('``` \033[31m' + honey[0] + '\033[0m'))
      error.push(cc('``` ', c['gray']) + cc(honey[0], c['red']))

      honey[3].forEach(function (line) { error.push(line) })
      // console.log('```')
      // console.log(honey[2])
      var e = honey[2]
      error.push(cc(e.type, c['magenta']) + ':' + e.msg + '[' + cc(e.stub, c['magenta']) + ']')
      error.push(cc('url: ' + e.path, c['gray']) + cc(e.stub, c['magenta']))

      // console.error(error.join('\n'))

      // console.error(error.join('\n'))
      printError(error.join('\n'))
    } catch (e) {
      // just print the raw error on failure
      // console.error(honey)
      printError(honey)
    }

    // temporary watcher to listen for all changes to rebuild to
    //setupGlobalWatcher()
  })

  // console.log('after')
}

function printError (err) {
  if (__last_error != err) { // dont repeat errors/warnings
    console.error(err)
    __last_error = err
    setupGlobalWatcher() // recover watch process after build errors
  }

  clearTimeout(__error_timeout)
  __error_timeout = setTimeout(function () {
    __last_error = null
  }, 3000)
}
