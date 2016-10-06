# wrollup - Simple watcher for rollup


[![npm](https://img.shields.io/npm/v/wrollup.svg?maxAge=2592000)](https://www.npmjs.com/package/wrollup)
[![npm](https://img.shields.io/npm/dm/wrollup.svg?maxAge=2592000)](https://www.npmjs.com/package/wrollup)
[![npm](https://img.shields.io/npm/l/wrollup.svg?maxAge=2592000)](https://www.npmjs.com/package/wrollup)


## Simple to use
```bash
npm install -g wrollup
wrollup -c path/to/rollup.config.js # looks for ./rollup.config.js by default
```

# About
A simple watcher for building rollup bundles inspired by the https://github.com/stylus/stylus watcher

# Why
The plugin 'rollup-watch' is pretty OK, but has a few issues like not being able to recover, hanging forever when not connected to the internet -- all in all a bit of a pain to deal with. wrollup is intended to make the watching and bundle process as smooth as possible.

# How
Using a similar init process we use rollup internally to parse the rollup.config.js file and star the watcher with a set of streamlined logging procedure (similar to stylus-lang) and pretty error parsing.

# Arguments
```bash
-c, --config - specify path to rollup.config.js (defaults to rollup.config.js)
--nocache    - disables bundle caching
--verbose    - wrollup will console.log some extra info of what it is doing
```

# Installation
```bash
npm install --save-dev wrollup # locally (for use with npm scripts)
```
or
```bash
npm install -g wrollup # globally (not recommended)
```

# Requirements
Rollup
```bash
npm install --save-dev rollup # locally (for use with npm scripts)
```
or
```bash
npm install -g rollup # globally (not recommended)
```

A rollup config file (looks for rollup.config.js by default). A basic one can be for example:
```js
import buble from 'rollup-plugin-buble'
import nodeResolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'

export default {
  entry: 'src/index.js',    // required
  dest: 'dist/bundle.js',   // required
  format: 'iife',           // required
  plugins: [
    buble(),
    nodeResolve(),
    commonjs({
      include: 'node_modules/**'
    })
  ]
}
```
