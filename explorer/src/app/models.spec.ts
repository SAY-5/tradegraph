import { NeighborGraph, mergeGraphs } from './models';

describe('mergeGraphs', () => {
  const base: NeighborGraph = {
    center: 'a',
    nodes: [
      { id: 'a', name: 'A', kinds: ['Issuer'] },
      { id: 'b', name: 'B', kinds: ['Fund'] },
    ],
    links: [{ source: 'b', target: 'a', rel: 'holds', weight: 10 }],
  };

  it('adds new nodes and links without duplicating existing ones', () => {
    const extra: NeighborGraph = {
      center: 'b',
      nodes: [
        { id: 'b', name: 'B', kinds: ['Fund'] },
        { id: 'c', name: 'C', kinds: ['Subsidiary'] },
      ],
      links: [
        { source: 'b', target: 'a', rel: 'holds', weight: 10 },
        { source: 'c', target: 'b', rel: 'subsidiaryOf', weight: 0 },
      ],
    };
    const merged = mergeGraphs(base, extra);
    expect(merged.center).toBe('a');
    expect(merged.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(merged.links).toHaveLength(2);
  });
});
