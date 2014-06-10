/*
  D3.js OTPAGraphs
*/

d3.otpaGraph = function module() {
  "use strict";

  // Public variables width default settings
  var type = 'line',
      width = 300;

  // Private variables

  function otpaGraph(selection) {
    var graph;
    if (type == 'line') {
      graph = d3.otpaGraphLine();
    } else if (type == 'bar') {
      graph = d3.otpaGraphBar();
    } else if (type == 'circle') {
      graph = d3.otpaGraphCircle();
    } else if (type == 'table') {
      graph = d3.otpaGraphTable();
    }

    graph = graph.width(width);

    selection
      .call(graph);
  }

  // Getter/setter functions
  otpaGraph.type = function(_) {
    if (!arguments.length) return type;
    type = _;
    return otpaGraph;
  };

  otpaGraph.width = function(_) {
    if (!arguments.length) return width;
    width = _;
    return otpaGraph;
    };

  return otpaGraph;

};