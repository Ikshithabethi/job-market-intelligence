/**
 * Graph algorithms used by the knowledge graph and career-path features.
 *
 * The career graph is a small directed graph of job roles. We deliberately avoid
 * a third-party graph library so the traversal logic stays readable:
 *
 *   buildAdjacency  - turn an edge list into a neighbour map
 *   dijkstra        - shortest path by the sum of edge weights
 *   rankPaths       - DFS enumeration of simple paths, ranked by total cost
 *   jaccard         - skill-overlap similarity between two sets
 *
 * Every function is pure so it can be unit tested without a database.
 */

/**
 * @param {Array<{from:number,to:number,weight?:number}>} edges
 * @param {{directed?:boolean}} [options]
 * @returns {Map<number, Array<{to:number, weight:number, edge:Object}>>}
 */
function buildAdjacency(edges, options = {}) {
  const directed = options.directed !== false;
  const adjacency = new Map();

  const push = (from, entry) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(entry);
  };

  edges.forEach((edge) => {
    const weight = Number.isFinite(edge.weight) ? edge.weight : 1;
    push(edge.from, { to: edge.to, weight, edge });
    if (!directed) push(edge.to, { to: edge.from, weight, edge });
  });

  return adjacency;
}

/**
 * Dijkstra shortest path.
 * @param {Map<number, Array<{to:number, weight:number, edge:Object}>>} adjacency
 * @param {number} start
 * @param {number} goal
 * @returns {{nodes:number[], edges:Object[], cost:number}|null}
 */
function dijkstra(adjacency, start, goal) {
  if (start === goal) return { nodes: [start], edges: [], cost: 0 };

  const distance = new Map([[start, 0]]);
  const previous = new Map();
  const visited = new Set();
  const queue = [{ node: start, cost: 0 }];

  while (queue.length > 0) {
    // Small graphs: a linear scan for the cheapest frontier node is enough.
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[bestIndex].cost) bestIndex = i;
    }
    const current = queue.splice(bestIndex, 1)[0];

    if (visited.has(current.node)) continue;
    visited.add(current.node);

    if (current.node === goal) break;

    const neighbours = adjacency.get(current.node) || [];
    neighbours.forEach((neighbour) => {
      if (visited.has(neighbour.to)) return;
      const candidate = current.cost + neighbour.weight;
      const known = distance.has(neighbour.to) ? distance.get(neighbour.to) : Infinity;
      if (candidate < known) {
        distance.set(neighbour.to, candidate);
        previous.set(neighbour.to, { node: current.node, edge: neighbour.edge, weight: neighbour.weight });
        queue.push({ node: neighbour.to, cost: candidate });
      }
    });
  }

  if (!distance.has(goal)) return null;

  const nodes = [goal];
  const edges = [];
  let cursor = goal;
  while (cursor !== start) {
    const step = previous.get(cursor);
    if (!step) return null;
    edges.unshift(step.edge);
    nodes.unshift(step.node);
    cursor = step.node;
  }

  return { nodes, edges, cost: distance.get(goal) };
}

/**
 * Enumerate simple (no repeated node) paths from start to goal, ranked by cost.
 * Used to offer alternative career routes next to the optimal one.
 *
 * @param {Map} adjacency
 * @param {number} start
 * @param {number} goal
 * @param {{maxDepth?:number, limit?:number}} [options]
 * @returns {Array<{nodes:number[], edges:Object[], cost:number}>}
 */
function rankPaths(adjacency, start, goal, options = {}) {
  const maxDepth = options.maxDepth || 4;
  const limit = options.limit || 3;
  const results = [];

  const walk = (node, nodes, edges, cost) => {
    if (node === goal && nodes.length > 1) {
      results.push({ nodes: [...nodes], edges: [...edges], cost });
      return;
    }
    if (nodes.length - 1 >= maxDepth) return;
    const neighbours = adjacency.get(node) || [];
    neighbours.forEach((neighbour) => {
      if (nodes.includes(neighbour.to)) return;
      nodes.push(neighbour.to);
      edges.push(neighbour.edge);
      walk(neighbour.to, nodes, edges, cost + neighbour.weight);
      nodes.pop();
      edges.pop();
    });
  };

  walk(start, [start], [], 0);
  results.sort((a, b) => a.cost - b.cost || a.nodes.length - b.nodes.length);
  return results.slice(0, limit);
}

/**
 * Jaccard similarity between two arrays treated as sets.
 * @returns {number} 0..1
 */
function jaccard(a, b) {
  const setA = a instanceof Set ? a : new Set(a);
  const setB = b instanceof Set ? b : new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((value) => {
    if (setB.has(value)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * All pairs whose Jaccard similarity is at or above a threshold.
 * @param {Map<number, Set<string>>} setsByNode
 * @param {number} threshold
 * @returns {Array<{from:number,to:number,similarity:number,shared:string[]}>}
 */
function similarPairs(setsByNode, threshold) {
  const ids = Array.from(setsByNode.keys());
  const pairs = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = setsByNode.get(ids[i]);
      const b = setsByNode.get(ids[j]);
      const similarity = jaccard(a, b);
      if (similarity >= threshold) {
        const shared = [];
        a.forEach((value) => {
          if (b.has(value)) shared.push(value);
        });
        pairs.push({ from: ids[i], to: ids[j], similarity, shared });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

module.exports = { buildAdjacency, dijkstra, rankPaths, jaccard, similarPairs };
