/**
 * Knowledge Graph.
 *
 * Renders the role / skill / company graph the backend derives from
 * role_skills, career_paths and job_skills. Selecting a node fetches that node's
 * neighbourhood so you can walk the graph hop by hop.
 *
 * Relationship types:
 *   SKILL_REQUIRED_FOR  role -> skill
 *   LEADS_TO            role -> role   (career transition)
 *   SIMILAR_TO          role <-> role  (skill overlap)
 *   USED_BY             skill -> company
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

import { graphApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, SampleDataBanner } from '../components/StateBlocks.jsx';
import { formatCompact, formatNumber } from '../utils/format';

const NODE_COLORS = {
  role: '#2f6fd0',
  skill: '#7ab0e8',
  company: '#1f7a4d',
};

const NODE_TYPE_LABELS = {
  role: 'Job role',
  skill: 'Skill',
  company: 'Company',
};

const EDGE_STYLES = {
  SKILL_REQUIRED_FOR: { color: '#c7d0dd', style: 'solid', label: 'requires' },
  LEADS_TO: { color: '#2f6fd0', style: 'solid', label: 'leads to' },
  SIMILAR_TO: { color: '#9a6510', style: 'dashed', label: 'similar to' },
  USED_BY: { color: '#54a37a', style: 'dotted', label: 'used by' },
};

const LAYOUTS = ['cose', 'concentric', 'breadthfirst', 'circle', 'grid'];

function graphStateToElements(graphData) {
  if (!graphData) return [];
  return [...(graphData.nodes || []), ...(graphData.edges || [])];
}

/**
 * Thin Cytoscape wrapper. It owns the instance and reports node taps upward.
 */
function GraphCanvas({ elements, layoutName, onNodeSelect, focusedNodeId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const selectRef = useRef(onNodeSelect);
  selectRef.current = onNodeSelect;
  const elementsKey = useMemo(() => JSON.stringify(elements), [elements]);

  // Create / rebuild the graph when the elements change.
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const cy = cytoscape({
      container: containerRef.current,
      elements: JSON.parse(elementsKey),
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 8,
            'text-valign': 'bottom',
            'text-margin-y': 3,
            color: '#5c6b80',
            'text-outline-width': 0,
            width: 'mapData(degree, 0, 30, 12, 38)',
            height: 'mapData(degree, 0, 30, 12, 38)',
            'background-color': '#94a6bd',
            'border-width': 1,
            'border-color': '#ffffff',
          },
        },
        {
          selector: 'node[type = "role"]',
          style: { 'background-color': NODE_COLORS.role, shape: 'round-rectangle' },
        },
        {
          selector: 'node[type = "skill"]',
          style: { 'background-color': NODE_COLORS.skill, shape: 'ellipse' },
        },
        {
          selector: 'node[type = "company"]',
          style: { 'background-color': NODE_COLORS.company, shape: 'diamond' },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 3, 'border-color': '#1f2733' },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#dfe4ec',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
            opacity: 0.75,
          },
        },
        {
          selector: 'edge[type = "LEADS_TO"]',
          style: { 'line-color': EDGE_STYLES.LEADS_TO.color, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6, width: 1.6 },
        },
        {
          selector: 'edge[type = "SIMILAR_TO"]',
          style: { 'line-color': EDGE_STYLES.SIMILAR_TO.color, 'line-style': 'dashed', width: 1.4 },
        },
        {
          selector: 'edge[type = "USED_BY"]',
          style: { 'line-color': EDGE_STYLES.USED_BY.color, 'line-style': 'dotted' },
        },
      ],
    });

    cy.on('tap', 'node', (event) => {
      const node = event.target;
      selectRef.current({
        id: node.id(),
        type: node.data('type'),
        entityId: node.data('entityId'),
        label: node.data('label'),
        data: node.data(),
      });
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elementsKey]);

  // Re-run the layout when the user changes it (without rebuilding the graph).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout({
      name: layoutName,
      animate: false,
      fit: true,
      padding: 24,
      numIter: 250,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 60,
    }).run();
  }, [layoutName, elementsKey]);

  // Highlight the node the detail panel is currently showing.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (!focusedNodeId) return;
    const node = cy.getElementById(focusedNodeId);
    if (node && node.length) {
      node.select();
      cy.animate({ center: { eles: node }, duration: 200 });
    }
  }, [focusedNodeId, elementsKey]);

  return <div className="graph-canvas" ref={containerRef} />;
}

export default function KnowledgeGraph() {
  const [options, setOptions] = useState({
    minImportance: 3,
    similarityThreshold: 0.5,
    usedByLimit: 2,
    includeCompanies: true,
    includeSimilarTo: true,
  });
  const [layoutName, setLayoutName] = useState('cose');
  const [selected, setSelected] = useState(null);
  const [depth, setDepth] = useState(1);

  const graph = useApiData((signal) => graphApi.graph(options, signal), [JSON.stringify(options)]);
  const stats = useApiData((signal) => graphApi.stats(signal), []);
  const neighbours = useApiData(
    (signal) =>
      graphApi.neighbours(
        { type: selected ? selected.type : 'role', id: selected ? selected.entityId : 1, depth },
        signal
      ),
    [selected ? `${selected.type}-${selected.entityId}` : '', depth],
    { enabled: Boolean(selected) }
  );

  const elements = useMemo(() => graphStateToElements(graph.data), [graph.data]);

  const nodeCounts = useMemo(() => {
    const counts = { role: 0, skill: 0, company: 0 };
    (graph.data && graph.data.nodes ? graph.data.nodes : []).forEach((node) => {
      counts[node.data.type] = (counts[node.data.type] || 0) + 1;
    });
    return counts;
  }, [graph.data]);

  const edgeCounts = useMemo(() => {
    const counts = {};
    (graph.data && graph.data.edges ? graph.data.edges : []).forEach((edge) => {
      counts[edge.data.type] = (counts[edge.data.type] || 0) + 1;
    });
    return counts;
  }, [graph.data]);

  return (
    <div>
      <PageHeader
        title="Knowledge Graph"
        subtitle="An interactive graph of job roles, skills and companies. Select any node to inspect it and walk to its neighbours."
      />

      <SampleDataBanner />

      <Card
        title="Graph controls"
        note="Fewer edges makes the structure easier to read. Raising the minimum importance keeps only the core requirements."
      >
        <div className="filter-grid">
          <label className="field">
            <span className="field-label">Minimum skill importance</span>
            <select
              value={options.minImportance}
              onChange={(event) =>
                setOptions({ ...options, minImportance: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} of 5 {value === 1 ? '(every edge)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">SIMILAR_TO similarity threshold</span>
            <select
              value={options.similarityThreshold}
              onChange={(event) =>
                setOptions({ ...options, similarityThreshold: Number(event.target.value) })
              }
            >
              {[0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((value) => (
                <option key={value} value={value}>
                  {value.toFixed(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">USED_BY employers per skill</span>
            <select
              value={options.usedByLimit}
              onChange={(event) =>
                setOptions({ ...options, usedByLimit: Number(event.target.value) })
              }
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  Top {value}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Layout</span>
            <select value={layoutName} onChange={(event) => setLayoutName(event.target.value)}>
              {LAYOUTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="filter-actions">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={options.includeCompanies}
              onChange={(event) =>
                setOptions({ ...options, includeCompanies: event.target.checked })
              }
            />
            Include company nodes
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={options.includeSimilarTo}
              onChange={(event) =>
                setOptions({ ...options, includeSimilarTo: event.target.checked })
              }
            />
            Include SIMILAR_TO edges
          </label>
          <button type="button" className="btn btn-sm" onClick={graph.reload}>
            Reload graph
          </button>
        </div>
      </Card>

      <div className="grid grid-4 mt-3">
        <StatCard
          label="Nodes shown"
          value={formatNumber(elements.filter((element) => element.data.source === undefined).length)}
          hint={`${nodeCounts.role} roles, ${nodeCounts.skill} skills, ${nodeCounts.company} companies`}
        />
        <StatCard
          label="Edges shown"
          value={formatNumber(elements.filter((element) => element.data.source !== undefined).length)}
          hint="Across all four relationship types"
        />
        <StatCard
          label="SKILL_REQUIRED_FOR"
          value={formatNumber(edgeCounts.SKILL_REQUIRED_FOR || 0)}
          hint="role to skill requirements"
        />
        <StatCard
          label="LEADS_TO / SIMILAR_TO"
          value={`${formatNumber(edgeCounts.LEADS_TO || 0)} / ${formatNumber(edgeCounts.SIMILAR_TO || 0)}`}
          hint={`USED_BY: ${formatNumber(edgeCounts.USED_BY || 0)} skill to company edges`}
        />
      </div>

      <Card className="mt-3" title="Graph" note="Click a node to open its neighbourhood below.">
        {graph.loading && <LoadingBlock message="Building the graph..." />}
        {graph.error && <ErrorBlock error={graph.error} onRetry={graph.reload} />}
        {!graph.loading && !graph.error && elements.length === 0 && (
          <EmptyBlock message="The graph came back empty. Load the dataset with 'npm run seed' and try again." />
        )}
        {!graph.loading && !graph.error && elements.length > 0 && (
          <>
            <GraphCanvas
              elements={elements}
              layoutName={layoutName}
              onNodeSelect={setSelected}
              focusedNodeId={selected ? `${selected.type}-${selected.entityId}` : null}
            />
            <div className="graph-legend mt-2">
              {Object.entries(NODE_TYPE_LABELS).map(([type, label]) => (
                <span key={type}>
                  <span className="legend-swatch" style={{ background: NODE_COLORS[type] }} />
                  {label}
                </span>
              ))}
              <span style={{ marginLeft: 12 }}>
                {Object.entries(EDGE_STYLES).map(([type, style]) => (
                  <span key={type} style={{ marginRight: 12 }}>
                    <span
                      className="legend-line"
                      style={{
                        background:
                          style.style === 'solid' ? style.color : 'transparent',
                        borderTop: style.style === 'solid' ? 'none' : `2px ${style.style} ${style.color}`,
                      }}
                    />
                    {type}
                  </span>
                ))}
              </span>
            </div>
          </>
        )}
      </Card>

      <Card
        className="mt-3"
        title="Node inspector"
        note="Relationships are read straight from the graph endpoint, including the importance or similarity weight."
        actions={
          <>
            <label className="checkbox-row">
              <span className="small">Depth</span>
              <select
                value={depth}
                onChange={(event) => setDepth(Number(event.target.value))}
                style={{ width: 70 }}
              >
                {[1, 2].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      >
        {!selected && (
          <>
            {stats.data && (
              <div className="small muted">
                Full graph per the stats endpoint: {formatNumber(stats.data.nodeCount)} nodes and{' '}
                {formatNumber(stats.data.edgeCount)} edges. The canvas above applies your filters.
              </div>
            )}
            <EmptyBlock message="Select a node in the graph to inspect it." />
          </>
        )}

        {selected && (
          <>
            <div className="page-header-row">
              <div>
                <h2>{selected.label}</h2>
                <p className="page-subtitle">
                  {NODE_TYPE_LABELS[selected.type] || selected.type} - node id{' '}
                  <code>{selected.id}</code>
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
                Clear selection
              </button>
            </div>

            <dl className="kv-list mt-2">
              {Object.entries(selected.data)
                .filter(([key]) => !['id', 'label', 'type', 'entityId'].includes(key))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {typeof value === 'number' ? formatNumber(value) : String(value)}
                    </dd>
                  </div>
                ))}
            </dl>

            <h3 className="mt-3">Connections within {depth} hop(s)</h3>
            {neighbours.loading && <LoadingBlock message="Loading neighbours..." />}
            {neighbours.error && <ErrorBlock error={neighbours.error} onRetry={neighbours.reload} />}
            {neighbours.data && (
              <>
                <div className="grid grid-3 mt-2">
                  {['role', 'skill', 'company'].map((type) => {
                    const nodes = neighbours.data.nodes
                      .map((entry) => entry.data)
                      .filter((node) => node.type === type && node.id !== selected.id);
                    return (
                      <div key={type}>
                        <div className="field-label">
                          {NODE_TYPE_LABELS[type]} ({nodes.length})
                        </div>
                        {nodes.length === 0 ? (
                          <div className="small muted">none</div>
                        ) : (
                          <div className="badge-row">
                            {nodes.map((node) => (
                              <button
                                key={node.id}
                                type="button"
                                className="skill-pill"
                                onClick={() =>
                                  setSelected({
                                    id: node.id,
                                    type: node.type,
                                    entityId: node.entityId,
                                    label: node.label,
                                    data: node,
                                  })
                                }
                              >
                                {node.label}
                                <span className="muted small">{node.degree}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <h3 className="mt-3">Relationships</h3>
                {neighbours.data.edges.length === 0 ? (
                  <EmptyBlock message="This node has no relationships in the filtered graph." />
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>From</th>
                          <th>To</th>
                          <th className="num">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {neighbours.data.edges.map((edge) => {
                          const data = edge.data;
                          const weight = data.importance ?? data.similarity ?? data.postingCount;
                          return (
                            <tr key={data.id}>
                              <td>
                                <span className="badge">{data.type}</span>
                              </td>
                              <td className="mono small">{data.source}</td>
                              <td className="mono small">{data.target}</td>
                              <td className="num">
                                {weight === undefined ? (
                                  <span className="muted">--</span>
                                ) : (
                                  formatCompact(weight)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
