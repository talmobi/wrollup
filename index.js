'use strict'

var rollup = require('rollup')
var chokidar = require('chokidar')
var chalk = require('chalk')
var fs = require('fs')

var os = require('os')

var realpathSync = fs.realpathSync

var argv = require('minimist')(process.argv.slice(2))

var verbose = !!argv.verbose // for debugging
var nolazy = !!argv['nolazy']

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
var cache = undefined
var lazyCachedBundle = undefined // workarond for: https://github.com/rollup/rollup/issues/1010
var watchers = {}

// chalk colours
var colors = ['green', 'yellow', 'blue', 'cyan', 'magenta', 'white']

var configPath = path.resolve(argv['c'] || argv['config'] || 'rollup.config.js')

// return console.log('configPath: ' + configPath)

process.chdir(path.dirname(configPath))

const stderr = console.error.bind( console )
var mtimes = {}

// used to listen for change on all source files when an error occurs
// in order to re-initliaize source watching/bundling
var globalWatcher = undefined

var _globalWatcherTimeout = null
function setupGlobalWatcher () {
  if (globalWatcher === undefined) {

    var opts = {
      usePolling: os.platform() !== 'darwin',
      ignored: /node_modules|[\/\\]\./,
      ignoreInitial: true
    }

    globalWatcher = chokidar.watch('**/*.js*', opts)
    globalWatcher.on('add', triggerRebuild)
    globalWatcher.on('change', triggerRebuild)

    verbose && console.log(cc('starting build error watcher [**/*.js*]', c['yellow']))

    var keys = Object.keys(watchers)
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i]
      let w = watchers[key]
      try {
        w.close()
        watchers[key] = undefined
      } catch (e) {
        verbose && console.log('failed to close watcher')
      }
    }
  } else {
    verbose && console.log(cc('build error watcher still ready [**/*.js*]', c['yellow']))
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
  verbose && console.log(chalk.yellow('initliaized'))
}, function (err) {
  throw err
})

var options = undefined

function init (opts) {
  options = Object.assign({}, opts)
  // console.log(options)
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
  var errorLineNumber = pos.line - 1
  var column = pos.column
  var contents = fs.readFileSync(file, 'utf8')
  var lines = contents.split('\n')

  var line, index, i
  // find last non-empty line
  for (i = 0; i < lines.length; i++) {
    index = errorLineNumber - i
    line = lines[index]
    if (line.trim()) {
      // non-empty line found
      errorLineNumber = index
      break
    }

    // console.log('line was empty')
    // column data is corrupted, is probably last charater of previous line
    column = -1
  }

  // grab last 8 lines
  var linesBelow = 3
  var linesAbove = 5
  var results = []
  var errorLineIndex = 0
  for (i = 0; i <= (linesBelow + linesAbove); i++) {
    index = errorLineNumber + i - linesAbove
    if (index === errorLineNumber) errorLineIndex = (results.length + 1)
    if (index >= 0 && index < lines.length) {
      var l = lines[index]
      // parse away distracting character escapes
      l = l.split('\'').join('"')
      // var prefix = ('    ' + (index + 1) + '| ')
      results.push({
        line: l,
        lineNumber: index + 1
      })
    }
  }

  // calculate minimum start indentation we can slice off
  // without affecting relative indentation
  var minLeftPadding = 999
  results.forEach(function (item) {
    var counter = 0
    for (var i = 0; i < item.line.length; i++) {
      if (item.line[i].trim().length === 0) continue
      minLeftPadding = Math.min(minLeftPadding, i)
      break
    }
  })

  // cut off the extra start indentation
  results = results.map(function (item) {
    item.line = item.line.slice(minLeftPadding)
    return item
  })

  // add line numbers to lines, pad by biggest line number
  var lineLeftPadding = String(results[results.length - 1].lineNumber).length + 1
  // console.log('lineLeftPadding: ' + lineLeftPadding)
  var resultLines = results.map(function (item) {
    var length = String(item.lineNumber).length
    var delta = (lineLeftPadding - length)
    var prefix = ' '
    while (--delta > 0) prefix += ' '
    prefix += String(item.lineNumber)
    prefix += '| '
    return (prefix + item.line)
  })

  results = resultLines

  // lastly push in small arrow indicator after the error line
  // var lastLine = results[results.length - 1]
  var indicator = []
  for (i = 0; i < (column + lineLeftPadding + 2 - minLeftPadding); i++) indicator.push('-')
  if (column < 0) {
    indicator.push('^')
  } else {
    indicator[(column + lineLeftPadding + 2 - minLeftPadding)] = '^'
  }

  var arrowLine = indicator.join('')
  results = results.slice(0, errorLineIndex)
                    .concat([arrowLine])
                    .concat(results.slice(errorLineIndex))
  results.push('')

  return results
}

var buildTimeout = null
var _timeout = null
function triggerRebuild (path) {
  if (options && path.indexOf(options.dest) !== -1) {
    verbose && console.log(chalk.yellow('ignoring trigger from destination bundle'))
    return undefined
  }

  var target = path
  verbose && console.log(chalk.yellow('trigger from target [' + chalk.magenta(target) + ']'))
  fs.stat(target, function (err, stats) {
    if (err) throw err

    if (mtimes[target] === undefined || stats.mtime > mtimes[target]) {
      mtimes[target] = stats.mtime
      clearTimeout(buildTimeout)
      buildTimeout = setTimeout(function () {
        build()
      }, 33)
    } else {
      // ignore, nothing modified
      verbose && console.log('-- nothing modified --')
    }
  })
}

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

function generateLazyCache () {
  if (nolazy) return
  // has to do with workaround for: https://github.com/rollup/rollup/issues/1010
  setTimeout(function () {
    lazyCachedBundle = JSON.parse(JSON.stringify(cache))
    verbose && console.log(chalk.yellow('lazyCachedBundle pre-generated for the next bundle'))
    verbose && console.log(chalk.yellow(''))
  }, 0)
}

function build () {
  // clearConsole()
  verbose && console.log(chalk.gray('bundling... [' + chalk.blue((new Date().toLocaleString())) + ']'))

  var opts = Object.assign({}, options)

  // use cache if available
  if (ENABLE_CACHE && cache && opts) {
    if (verbose && !nolazy) {
      if (lazyCachedBundle) {
        console.log(chalk.yellow('using lazyCachedBundle'))
      } else {
        // console.log(chalk.yellow('no lazyCachedBundle, generating cache...'))
      }
    }

    // this work-around is needed for rollup v0.35.0-> currently
    // rollup version 0.34.13 is the latest that works fine
    // the issue seems to lie in rollup implemetning a deepClone fn
    // in this commit: https://github.com/rollup/rollup/commit/83ccb9725374e0fde9d07043959c397b15d26c67#diff-5c98da346b849e07de8c1173579789b0L320
    //
    // for more info see the issue on github: https://github.com/rollup/rollup/issues/1010
    if (!nolazy) {
      verbose && console.log(chalk.yellow('no lazyCachedBundle, generating cache...'))
      opts.cache = lazyCachedBundle || JSON.parse(JSON.stringify(cache))
      // try and do the workaround cache after the build is complete
      // so that the build times aren't noticably affected
      lazyCachedBundle = undefined
      // generateLazyCache() function is called after bundle has compiled
      // to pre-generate the lazyCachedBundle for the next bundle generation
    } else {
      // use rollups internal caching without the workaround fix
      // the workaround is needed for v0.35.0 -> onwards [6th Oct 2016]
      opts.cache = cache
      verbose && console.log(chalk.yellow('--nolazy set'))
    }
  } else {
    if (verbose) {
      if (!ENABLE_CACHE) {
        console.log(chalk.yellow('--nocache set, not using cache'))
      } else {
        console.log(chalk.yellow('no cache found, probably initial build'))
      }
    }
  }

  var buildStart = Date.now()

  function throwWarning () {
  }

  opts.onwarn = function (warning) {
    throwWarning(warning)
  }

  rollup.rollup(opts).then(function (bundle) {
    cache = bundle

    // close globalWatcher if it was on
    if (globalWatcher !== undefined) {
      verbose && console.log(cc('removing global watcher', c['yellow']))
      globalWatcher.unwatch('*')
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
        watchers[id] = undefined
      }

      if (watchers[id] === undefined) {
        var cwd = process.cwd()
        var base = cwd.substring( cwd.lastIndexOf('/') )
        var filePath = base + id.substring( cwd.length )

        // ignore node_modules
        if (filePath.toLowerCase().indexOf('node_modules') === -1) {
          var watcher = chokidar.watch(id, {
            // use polling on linux and windows
            usePolling: os.platform() !== 'darwin'
          })
          watcher.on('change', triggerRebuild)
          watchers[id] = watcher
          console.log('  \u001b[90mwatching\u001b[0m %s', filePath);
        } else {
          // dont watch node_modules
        }
      }
    }

    return bundle.write(opts)
  }).then(function () {
    generateLazyCache()

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
