import React from 'react'

const Component = React.createClass({
  render: function () {
    return (
      <div>Component { (new Date()).toLocaleString() }</div>
    )
  }
})

export default Component
