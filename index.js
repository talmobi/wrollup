var rollup = require('rollup')
var chokidar = require('chokidar')
var chalk = require('chalk')
var fs = require('fs')

var realpathSync = fs.realpathSync

// var relative = require('require-relative')
// var nodeResolve = require('rollup-plugin-node-resolve')
// var commonjs = require('rollup-plugin-commonjs')

var requireFromString = require('require-from-string')

function cc (text, code) {
  return ('\033[' + code + text + '\033[0m')
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

var cache
var watchers = {}

// chalk colours
var colors = ['green', 'yellow', 'blue', 'cyan', 'magenta', 'white']

var configPath = path.resolve(process.argv[2] || 'rollup.config.js')

// return console.log('configPath: ' + configPath)

process.chdir(configPath.substring(0, configPath.lastIndexOf('/')))

const stderr = console.error.bind( console )

rollup.rollup({
  entry: configPath,
  onwarn: function (message) {
    if ( /Treating .+ as external dependency/.test( message ) ) return
    stderr( message )
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


return
var contents = fs.readFileSync(configPath, 'utf8')



// var Module = module.constructor
// var m = new Module()
// try {
//   m._compile(content, 'rollup.config.js.tmp') // filename mandatory but unused
//   // options = require('rollup.config.js.tmp')
// } catch (err) {
//   console.log(err)
// }

// var res = _eval(content)
// console.log(res)

// configPath = relative.resolve(configPath, process.cwd())
// configPath = fs.realpathSync( configPath )
// console.log(configPath)

// using rollup itself to read and parse the rollup config
// (else nodejs fails on 'export' es6 syntax by default)
// rollup.rollup({
//   entry: configPath,
//   // plugins: [
//   //   nodeResolve({
//   //     jsnext: true,
//   //     main: true
//   //   }),
//   //   commonjs({
//   //     exclude: 'node_modules/**',
//   //     ignoreGlobal: true
//   //   })
//   // ]
// }).then(function (bundle) {
// 
//   console.log('x')
//   var result = bundle.generate({ format: 'cjs' })
// 
//   console.log('x')
//   var src = result.code
// 
//   console.log('x')
//   var Module = module.constructor
// 
//   console.log('x')
//   var m = new Module()
// 
//   console.log('x')
//   console.log(src)
//   console.log( process.cwd() )
//   try {
//     m._compile(src, 'rollup.config.js.tmp') // filename mandatory but unused
//   } catch (err) {
//     console.log(err)
//   }
// 
//   console.log('xxx')
//   // options = _eval(result.code)
//   //options = m.exports
//   console.log(m.exports)
// 
//   console.log('x')
//   options = m.exports
//   console.log('__rollup config loaded__')
// 
//   console.log('x')
//   console.log(options)
// 
//   console.log('x')
// 
//   if (!options || !options.entry) {
//     console.log('')
//     console.log('')
//     var msgs = [
//       'no rollup.config.js found -- please specify location when running',
//       '```wrollup pathToRollupConfig```',
//     ]
//     msgs.forEach(function (msg) { console.log(msg) })
//     console.log('')
//     console.log('')
// 
//     throw new Error('please create a rollup.config.js file')
//   }
// 
//   console.log(options)
//   // fire the lazers with our rollup config options
//   setTimeout(function () {
//     init(options)
//   }, 2000)
// }, function (err) {
//   console.error(err)
//   console.error('')
//   var msgs = [
//     chalk.red('no rollup.config.js found -- please specify location when running'),
//     '',
//     '```wrollup path/to/rollup.config.js```',
//   ]
//   msgs.forEach(function (msg) { console.error(msg) })
//   console.error('')
// })

function init (options) {
  //console.log('init called')
  //console.log(options)

  // used to listen for change on all source files when an error occurs
  // in order to re-initliaize source watching/bundling
  var globalWatcher = null

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
    _timeout = setTimeout(function () {
      log(chalk.gray('triggering...'))
    }, 20)
    clearTimeout(buildTimeout)
    buildTimeout = setTimeout(function () {
      build()
    }, 50)
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
      console.error(e)
      return e // return honey error for debugging purposes
    }
  }

  function build () {
    // clearConsole()
    log(chalk.gray('bundling... [' + chalk.blue((new Date().toLocaleString())) + ']'))

    var opts = Object.assign({}, options)

    // use cache if available
    if (cache && opts) {
      opts.cache = cache
    }

    var buildStart = Date.now()

    rollup.rollup(opts).then(function (bundle) {
      // console.log('bla')
      cache = bundle

      // close globalWatcher if it was on
      if (globalWatcher) {
        globalWatcher.close()
        globalWatcher = null
      }

      for (var i = 0; i < bundle.modules.length; i++) {
        var module = bundle.modules[i]
        var id = module.id
        // log('[' + module.id + '] for loop, index: ' + i)

        // skip plugin helper modules
        if (/\0/.test(id)) {
          log(chalk.yellow('skipping helper module'))
          continue
        }

        if (!watchers[id]) {
          var watcher = chokidar.watch(id)
          watcher.on('change', trigger)
          watchers[id] = watcher
          var cwd = process.cwd()
          var base = cwd.substring( cwd.lastIndexOf('/') )
          var filePath = base + id.substring( cwd.length )
          console.log('  \033[90mwatching\033[0m %s', filePath);
        }
      }

      return bundle.write(opts)
    }).then(function () {
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
      console.error(error.join('\n'))

      // temporary watcher to listen for all changes to rebuild to
      if (!globalWatcher) {
        log('trying to set up globalWatcher')
        // function trigger (evt, path) {
        //   // console.log(evt, path)
        //   triggerRebuild()
        // }
        globalWatcher = chokidar.watch('**/*.js')
        globalWatcher.on('add', trigger).on('change', trigger)
        log('global watcher setup')
      }
    })

    // console.log('after')
  }

  build()
}
