import message from './message'

import React from 'react'

console.log('Hello world, message: ' + message)

import App from './App.jsx'

// fake react
// var React = {
//   createElement: function (el, props) {
//     return String(el)
//   }
// }

console.log(<div animal={'giraffe'} />)
console.log(<App name='bebop' />)
