import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import * as d3 from 'd3';
import { GraphLink, GraphNode, NeighborGraph } from '../models';

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  rel: GraphLink['rel'];
  weight: number;
}

const COLORS: Record<string, string> = {
  Fund: '#4ea1ff',
  Issuer: '#f0a33a',
  Subsidiary: '#9aa7b5',
};

export function nodeColor(kinds: string[]): string {
  for (const k of ['Fund', 'Issuer', 'Subsidiary']) {
    if (kinds.includes(k)) {
      return COLORS[k];
    }
  }
  return COLORS['Subsidiary'];
}

/** Force directed neighbourhood of one entity. Clicking a node asks the host to expand it. */
@Component({
  selector: 'tg-graph-view',
  template: `
    <div class="wrap">
      <svg #svg></svg>
      <div class="legend">
        <span><i style="background:#4ea1ff"></i>Fund</span>
        <span><i style="background:#f0a33a"></i>Issuer</span>
        <span><i style="background:#9aa7b5"></i>Subsidiary</span>
        <span class="muted">solid: holds, dashed: subsidiary of, click: expand, drag: pin</span>
      </div>
    </div>
  `,
  styles: `
    .wrap { position: relative; height: 100%; min-height: 420px; }
    svg { width: 100%; height: 100%; display: block; background: var(--bg); border-radius: 8px; }
    .legend { position: absolute; left: 10px; bottom: 8px; display: flex; gap: 14px; font-size: 12px; color: var(--muted); }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
  `,
})
export class GraphView {
  readonly graph = input<NeighborGraph | null>(null);
  readonly expand = output<string>();
  readonly selectNode = output<string>();
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private simulation?: d3.Simulation<SimNode, SimLink>;
  private positions = new Map<string, { x: number; y: number }>();

  constructor() {
    effect(() => {
      const g = this.graph();
      if (g) {
        this.render(g);
      }
    });
  }

  private render(graph: NeighborGraph): void {
    const svgEl = this.svgRef().nativeElement;
    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 480;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    this.simulation?.stop();

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, ...this.positions.get(n.id) }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = graph.links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)!, rel: l.rel, weight: l.weight }));
    const maxWeight = Math.max(1, ...links.map((l) => l.weight));

    const root = svg.append('g');
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => root.attr('transform', event.transform)),
    );

    const link = root
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => (d.rel === 'holds' ? '#3d5a80' : '#4b5563'))
      .attr('stroke-opacity', 0.9)
      .attr('stroke-dasharray', (d) => (d.rel === 'subsidiaryOf' ? '4 3' : null))
      .attr('stroke-width', (d) => (d.rel === 'holds' ? 1 + (3 * Math.log1p(d.weight)) / Math.log1p(maxWeight) : 1.2));

    const node = root
      .append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_, d) => {
        this.selectNode.emit(d.id);
        this.expand.emit(d.id);
      })
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) {
              this.simulation?.alphaTarget(0.3).restart();
            }
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) {
              this.simulation?.alphaTarget(0);
            }
            this.positions.set(d.id, { x: d.x ?? 0, y: d.y ?? 0 });
          }),
      );

    node
      .append('circle')
      .attr('r', (d) => (d.id === graph.center ? 11 : 7))
      .attr('fill', (d) => nodeColor(d.kinds))
      .attr('stroke', (d) => (d.id === graph.center ? '#ffffff' : '#0d1117'))
      .attr('stroke-width', (d) => (d.id === graph.center ? 2 : 1));

    node
      .append('text')
      .text((d) => (d.name.length > 28 ? d.name.slice(0, 26) + '..' : d.name))
      .attr('x', 12)
      .attr('y', 4)
      .attr('fill', '#e6edf3')
      .attr('font-size', (d) => (d.id === graph.center ? 13 : 11))
      .attr('paint-order', 'stroke')
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 3);

    node.append('title').text((d) => `${d.name} (${d.kinds.join(', ')})`);

    this.simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((d) => (d.rel === 'holds' ? 120 : 70)))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(22))
      .on('tick', () => {
        link
          .attr('x1', (d) => (d.source as SimNode).x ?? 0)
          .attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0)
          .attr('y2', (d) => (d.target as SimNode).y ?? 0);
        node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      })
      .on('end', () => {
        for (const n of nodes) {
          this.positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        }
      });
  }
}
