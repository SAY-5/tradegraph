import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
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

/**
 * A middle ellipsis keeps the distinguishing tail of a fund name: a family's sub-funds
 * share a long prefix, so cutting the end collapses them all to the same visible label.
 * The full name stays in the node's <title>.
 */
function shorten(name: string, max = 24): string {
  if (name.length <= max) return name;
  const head = Math.ceil((max - 3) / 2);
  const tail = Math.floor((max - 3) / 2);
  return `${name.slice(0, head)}...${name.slice(name.length - tail)}`;
}

const WIDTH = 760;
const HEIGHT = 500;
/** Room kept at the sides for a label that reads outward from its node. */
const LABEL_ROOM = 150;
const TICKS = 320;
/**
 * A label's box in viewBox units. The face is IBM Plex Mono at 12: Chrome measures 7.2 per
 * character, 12.3 above the baseline and 3.1 below. The box is taken a little larger, so a
 * fallback monospace face does not bring two labels into contact either.
 */
const LABEL_CHAR = 7.4;
const LABEL_ASCENT = 12.6;
const LABEL_DESCENT = 3.4;
/** From a circle's edge to its label, and the clearance kept around every label. */
const LABEL_GAP = 7;
const LABEL_PAD = 2;

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

/** Where a label sits, relative to its node: the baseline start, middle or end point. */
interface LabelSpot {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function labelBox(node: SimNode, spot: LabelSpot, text: string): Box {
  const width = text.length * LABEL_CHAR;
  const shift = spot.anchor === 'start' ? 0 : spot.anchor === 'middle' ? width / 2 : width;
  const left = node.x + spot.x - shift;
  return {
    left: left - LABEL_PAD,
    right: left + width + LABEL_PAD,
    top: node.y + spot.y - LABEL_ASCENT - LABEL_PAD,
    bottom: node.y + spot.y + LABEL_DESCENT + LABEL_PAD,
  };
}

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Places to try for a label, best first. A neighbour's label reads outward along its spoke,
 * which keeps a hub and its ring of neighbours legible; when that spot is taken it moves level
 * with the node, then above or below it, then to the side facing the centre.
 */
function spotsFor(node: SimNode, centre: { x: number; y: number }, radius: number, isCentre: boolean): LabelSpot[] {
  const above: LabelSpot = { x: 0, y: -(radius + 3 + LABEL_DESCENT), anchor: 'middle' };
  if (isCentre) return [{ x: 0, y: radius + 13, anchor: 'middle' }, above];
  const dx = node.x - centre.x;
  const dy = node.y - centre.y;
  const length = Math.hypot(dx, dy) || 1;
  const reach = radius + LABEL_GAP;
  const outward = dx >= 0 ? 1 : -1;
  const below: LabelSpot = { x: 0, y: radius + 3 + LABEL_ASCENT, anchor: 'middle' };
  return [
    { x: (dx / length) * reach, y: (dy / length) * reach + 3, anchor: outward > 0 ? 'start' : 'end' },
    { x: outward * reach, y: 4, anchor: outward > 0 ? 'start' : 'end' },
    ...(dy >= 0 ? [below, above] : [above, below]),
    { x: -outward * reach, y: 4, anchor: outward > 0 ? 'end' : 'start' },
  ];
}

/**
 * Picks a spot for each label in the order the nodes arrive (the centre, then lineage, then
 * holders by value), taking the first that stays inside the view and clears every label placed
 * so far and every other node. A label with no such spot is not drawn; the node keeps its full
 * name in its accessible name and its tooltip, and the list under the graph names it too. The
 * centre's label is always drawn.
 */
function placeLabels(
  nodes: SimNode[],
  centreId: string,
  centre: { x: number; y: number },
): Map<string, LabelSpot & { text: string }> {
  const circles = nodes.map((node) => {
    const r = radiusFor(node, node.id === centreId) + 1;
    return { id: node.id, box: { left: node.x - r, right: node.x + r, top: node.y - r, bottom: node.y + r } };
  });
  const placed: Box[] = [];
  const spots = new Map<string, LabelSpot & { text: string }>();
  for (const node of nodes) {
    const isCentre = node.id === centreId;
    const text = shorten(node.name);
    const candidates = spotsFor(node, centre, radiusFor(node, isCentre), isCentre);
    const spot = candidates.find((candidate) => {
      const box = labelBox(node, candidate, text);
      return box.left >= 0 && box.right <= WIDTH && box.top >= 0 && box.bottom <= HEIGHT
        && !placed.some((other) => intersects(other, box))
        && !circles.some((circle) => circle.id !== node.id && intersects(circle.box, box));
    }) ?? (isCentre ? candidates[0] : undefined);
    if (!spot) continue;
    placed.push(labelBox(node, spot, text));
    spots.set(node.id, { ...spot, text });
  }
  return spots;
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
    return { nodes, links, at, labels: placeLabels(nodes, data.center, centre) };
  }, [data]);

  return (
    <div className="canvas">
      {/*
        * Not role="img": the circles inside are focusable buttons, and a graphics role would
        * hide them from assistive technology. Explorer renders the same neighbours as a list
        * of buttons underneath, which is the path that does not depend on SVG focus.
        */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label="Neighbourhood graph of the selected entity"
      >
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
            const label = layout.labels.get(node.id);
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
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    // Space scrolls the page unless the activation consumes it.
                    event.preventDefault();
                    onExpand(node.id);
                  }}
                >
                  <title>{`${node.name} (${node.kinds.join(', ')})`}</title>
                </circle>
                {expanded.has(node.id) && !isCentre ? (
                  <circle r={radiusFor(node, false) + 4} fill="none" stroke="var(--accent-line)" strokeDasharray="2 2" />
                ) : null}
                {label ? (
                  <text className="node-label" x={label.x} y={label.y} textAnchor={label.anchor}>
                    {label.text}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
