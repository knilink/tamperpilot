var fs = require('fs');
var createGraph = require('ngraph.graph');
var pageRank = require('ngraph.pagerank');
var g = createGraph();

var edited = ''
  .split('\n')
  .map((line) => line.trim().replace(/\.js$/, '.ts'))
  .filter((line) => line.length > 0);

var { imports } = JSON.parse(fs.readFileSync('./deps-1.41.0.json'));

var edges = Object.entries(imports)
  .flatMap(([dependent, dependencies]) => Object.entries(dependencies).map(([dependency]) => [dependent, dependency]))
  .filter(([depenent, dependency]) => !dependency.includes('node_modules'));

var nodes = [...new Set(edges.flatMap((a) => a))];

var unchanged = nodes.filter((a) => !edited.includes(a));

var edited_edges = edges.filter((edge) => !unchanged.includes(edge[0]) && !unchanged.includes(edge[1]));

function in_degree(nodes, edges) {
  return edges.filter((edge) => nodes.includes(edge[1]) && !nodes.includes(edge[0])).length;
}

function out_degree(nodes, edges) {
  return edges.filter((edge) => nodes.includes(edge[0]) && !nodes.includes(edge[1])).length;
}

function calculate_distances(edges) {
  var leaves = new Set(nodes.filter((node) => out_degree(node, edges) === 0));
  var distances = Object.fromEntries(nodes.map((a) => [a, {}]));
  var count = edges.length;
  while (count--) {
    for (const [a, b] of edges) {
      if (leaves.has(b)) {
        distances[a][b] = 1;
      } else {
        for (const [l, distance] of Object.entries(distances[b])) {
          if (distances[a][l] === undefined || distances[a][l] > distance + 1) {
            distances[a][l] = distance + 1;
          }
        }
      }
    }
  }

  return Object.entries(distances)
    .map(([node, dsts]) => [node, Math.max(0, ...Object.values(dsts))])
    .sort((a, b) => a[1] - b[1]);
}

function find_mutual(edges) {
  const result = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i][0] == edges[j][1] && edges[i][1] == edges[j][0]) {
        result.push([edges[i][0], edges[i][1]]);
      }
    }
  }
  return result;
}

function remove_nodes(edges, nodes) {
  return edges.filter(([a, b]) => nodes.includes(a) && nodes.includes(b));
}

function strongly_connected_components(edges) {
  const graph = new Map();
  const reversedGraph = new Map();

  // Build the graph and its reverse
  for (const [dependent, dependency] of edges) {
    if (!graph.has(dependent)) graph.set(dependent, []);
    if (!graph.has(dependency)) graph.set(dependency, []);
    if (!reversedGraph.has(dependent)) reversedGraph.set(dependent, []);
    if (!reversedGraph.has(dependency)) reversedGraph.set(dependency, []);

    graph.get(dependent).push(dependency);
    reversedGraph.get(dependency).push(dependent);
  }

  const visited = new Set();
  const stack = [];

  // First DFS to fill the stack
  function dfs1(node) {
    visited.add(node);
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs1(neighbor);
      }
    }
    stack.push(node);
  }

  // Second DFS to find SCCs
  function dfs2(node, component) {
    visited.add(node);
    component.push(node);
    const neighbors = reversedGraph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs2(neighbor, component);
      }
    }
  }

  // Perform first DFS on all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs1(node);
    }
  }

  // Reset visited set for second DFS
  visited.clear();

  const scc = [];
  // Perform second DFS on reversed graph
  while (stack.length > 0) {
    const node = stack.pop();
    if (!visited.has(node)) {
      const component = [];
      dfs2(node, component);
      scc.push(component);
    }
  }

  return scc;
}

for (let [dependent, dependency] of edges) {
  g.addLink(dependent, dependency);
}

function sort(edges) {
  let groups = strongly_connected_components(edges);
  groups = groups.map((a) => a.sort()).sort((a, b) => (a[0] > b[0] ? 1 : -1));
  const results = [];
  while (groups.length) {
    let res = groups.filter((nodes) => out_degree(nodes, edges) === 0);
    groups = groups.filter((g) => !res.includes(g));
    const remove = res.flat();
    edges = edges.filter((edge) => remove.includes(edge[1]));
    results.push(res);
  }
  return results.flatMap((v, i) => v.flatMap((v2, j) => v2.map((v3) => [v3, `${i}-${j.toString().padStart(3, ' ')}`])));
}

// var rank = pageRank(g);
var res = sort(edges);
console.log(
  res
    .filter((a) => edited.includes(a[0]))
    .map(([file, i]) => `- [ ] ${i} ${file}`)
    .join('\n')
);
