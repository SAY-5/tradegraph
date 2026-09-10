import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3';
import { useMemo } from 'react';

import type { NeighborGraph, NeighborNode } from '../graph';
import { compactMoney } from '../lib/format';

/*
 * The neighbourhood graph the explorer draws, laid out with d3-force.
 *
 * The simulation is ticked to a rest position synchronously rather than animated frame by
 * frame: the positions are then a pure function of the graph, nodes start on a fixed
 * circle so no two ever coincide, and the only motion is the CSS transition that carries
 * a node from its old place to its new one when an expansion changes the layout.
 */

const WIDTH = 760;
const HEIGHT = 500;
/** Room kept at the sides for a label that reads outward from its node. */
const LABEL_ROOM = 108;
const TICKS = 320;

interface SimNode extends NeighborNode {
  x: number;
  y: number;
  index?: number;
  vx?: number;
  vy?: number;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  rel: string;
  weight: number;
}

function radiusFor(node: NeighborNode, center: boolean): number {
  if (center) return 11;
  if (node.kinds.includes('Fund')) return 8;
  if (node.kinds.includes('Issuer')) return 7;
  return 5;
}

function classFor(node: NeighborNode): { fill: string; stroke: string } {
  if (node.kinds.includes('Fund')) return { fill: 'var(--accent)', stroke: 'var(--accent)' };
  if (node.kinds.includes('Issuer')) return { fill: 'transparent', stroke: 'var(--accent-line)' };
  return { fill: 'var(--neutral-bar)', stroke: 'var(--line-strong)' };
}

interface Props {
  data: NeighborGraph;
  reduced: boolean;
  onExpand: (id: string) => void;
  expanded: ReadonlySet<string>;
}

export function ForceGraph({ data, reduced, onExpand, expanded }: Props) {
  const layout = useMemo(() => {
    const nodes: SimNode[] = data.nodes.map((node, i) => {
      // Deterministic start: evenly spaced on a circle, centre pinned in the middle.
      const angle = (2 * Math.PI * i) / Math.max(1, data.nodes.length);
      return {
        ...node,
        x: WIDTH / 2 + Math.cos(angle) * (node.id === data.center ? 0 : 150),
        y: HEIGHT / 2 + Math.sin(angle) * (node.id === data.center ? 0 : 130),
      };
    });
    const links: SimLink[] = data.links
      .filter((link) => nodes.some((n) => n.id === link.source) && nodes.some((n) => n.id === link.target))
      .map((link) => ({ ...link }));

    const simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => (l.rel === 'subsidiaryOf' ? 74 : 148))
        .strength(0.35))
      .force('charge', forceManyBody<SimNode>().strength(-420).distanceMax(420))
      .force('centre', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force('collide', forceCollide<SimNode>().radius((d) => radiusFor(d, d.id === data.center) + 22))
      .stop();
    simulation.tick(TICKS);

    for (const node of nodes) {
      node.x = Math.max(LABEL_ROOM, Math.min(WIDTH - LABEL_ROOM, node.x));
      node.y = Math.max(30, Math.min(HEIGHT - 30, node.y));
    }
    const at = new Map(nodes.map((node) => [node.id, node]));
    const centre = at.get(data.center) ?? { x: WIDTH / 2, y: HEIGHT / 2 };
    return { nodes, links, at, centre };
  }, [data]);

  const centre = layout.centre;

  return (
    <div className="canvas">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Neighbourhood graph of the selected entity">
        <g>
          {layout.links.map((link, i) => {
            const source = typeof link.source === 'string' ? layout.at.get(link.source) : link.source;
            const target = typeof link.target === 'string' ? layout.at.get(link.target) : link.target;
            if (!source || !target) return null;
            return (
              <line
                key={`${source.id}-${target.id}-${link.rel}-${i}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={link.rel === 'subsidiaryOf' ? 'var(--accent-line)' : 'var(--line-strong)'}
                strokeWidth={link.rel === 'subsidiaryOf' ? 1.3 : 1}
                strokeDasharray={link.rel === 'subsidiaryOf' ? undefined : '3 3'}
              >
                <title>
                  {`${source.name} ${link.rel} ${target.name}`}
                  {link.weight > 0 ? ` (${compactMoney(link.weight)})` : ''}
                </title>
              </line>
            );
          })}
        </g>
        <g>
          {layout.nodes.map((node) => {
            const isCentre = node.id === data.center;
            const colours = classFor(node);
            const radius = radiusFor(node, isCentre);
            // Labels sit on the spoke away from the centre, which keeps a hub and its ring
            // of neighbours legible where centred labels would pile up on each other.
            const dx = node.x - centre.x;
            const dy = node.y - centre.y;
            const length = Math.hypot(dx, dy) || 1;
            const label = node.name.length > 17 ? `${node.name.slice(0, 15)}...` : node.name;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                style={{ transition: reduced ? undefined : 'transform 480ms cubic-bezier(0.2,0.7,0.2,1)' }}
              >
                <circle
                  r={radiusFor(node, isCentre)}
                  fill={colours.fill}
                  stroke={isCentre ? 'var(--accent)' : colours.stroke}
                  strokeWidth={isCentre ? 2.4 : 1.4}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.name}, expand neighbours`}
                  style={{ cursor: 'pointer', outlineOffset: 3 }}
                  onClick={() => onExpand(node.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onExpand(node.id); }}
                >
                  <title>{`${node.name} (${node.kinds.join(', ')})`}</title>
                </circle>
                {expanded.has(node.id) && !isCentre ? (
                  <circle r={radiusFor(node, false) + 4} fill="none" stroke="var(--accent-line)" strokeDasharray="2 2" />
                ) : null}
                <text
                  className="node-label"
                  x={isCentre ? 0 : (dx / length) * (radius + 7)}
                  y={isCentre ? radius + 13 : (dy / length) * (radius + 7) + 3}
                  textAnchor={isCentre ? 'middle' : (dx >= 0 ? 'start' : 'end')}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
