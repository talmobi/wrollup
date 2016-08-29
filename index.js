var rollup = require('rollup')
var chokidar = require('chokidar')
var fs = require('fs')

var cache
var watchers = {}

var options = {
  entry: 'entry.js',
  dest: 'bundle.js'
}

function snapShot (file, pos) {
  var lineNumber = pos.line - 1
  var column = pos.column
  var contents = fs.readFileSync(file, 'utf8')
  var lines = contents.split('\n')

  var line = ''
  // find last non-empty line
  for (var i = 0; i < lines.length; i++) {
    var index = lineNumber - i
    line = lines[index]
    if (line.trim()) {
      // non-empty line found
      lineNumber = index
      break
    }

    console.log('line was empty')
    // column data is corrupted, is probably last charater of previous line
    column = -1
  }

  // grab last 5 lines
  var results = []
  for (var i = 0; i < 5; i++) {
    var index = lineNumber + i - 4
    if (index >= 0) {
      var l = lines[index]
      // parse distracting escapes
      l = l.split('\'').join('"')
      l = l.split('\"').join('"')
      results.push(l)
    }
  }

  // lastly push in small arrow indicator
  var lastLine = results[results.length - 1]
  var indicator = []
  for (var i = 0; i < lastLine.length; i++) indicator.push('_')
  if (column < 0) {
    indicator.push('^')
  } else {
    indicator[column] = '^'
  }
  results.push(indicator.join(''))
  results.push('')

  console.log(results)
}

var buildTimeout = null
function triggerRebuild () {
  console.log('trigger...')
  clearTimeout( buildTimeout )
  buildTimeout = setTimeout(function () {
    build()
  }, 50)
}

function honeydripError (err) {
  console.log('honeydripping')
  try {
    var honey = Object.assign({}, err)
    var type = err.stack.substring(0, err.stack.indexOf(':'))
    var info = err.stack.substring(0, err.stack.indexOf('/'))
    var file = honey.file
    info += '[' + file.substring(file.lastIndexOf('/') + 1) + ']'
    honey.type = type
    honey.info = info

    snapShot(honey.file, honey.loc)
    return [honey.code, honey.loc, honey.info]
  } catch (e) {
    console.log('honey failed')
    console.log(e)
    console.log('-------')
    return err // on failure, return default err object
  }
}

function build () {
  console.log('building...')
  var opts = Object.assign({}, options)

  // use cache if available
  if (cache && opts) {
    opts.cache = cache
  }

  var buildStart = Date.now()

  rollup.rollup(opts).then(function (bundle) {
    cache = bundle

    for (var i = 0; i < bundle.modules.length; i++) {
      var module = bundle.modules[i]
      var id = module.id
      console.log('[' + module.id + '] for loop, index: ' + i)

      // skip plugin helper modules
      if (/\0/.test( id ) ) {
        console.log('skipping helper module')
        return 
      }

      if (!watchers[id]) {
        function trigger (evt, path) {
          console.log(evt, path)
          triggerRebuild()
        }

        var watcher = chokidar.watch(id)
        watcher.on('change', trigger)
        watchers[id] = watcher
        console.log('watcher added')
      }
    }

    return bundle.write({ dest: 'bundle.js' })
  }).then(function () {
    var delta = Date.now() - buildStart
    console.log('bundling took: ' + delta + 'ms')
  }, function (err) {
    console.log( honeydripError(err) )
  })
  console.log('after')
}

console.log('starting')
build()
console.log('ending')
