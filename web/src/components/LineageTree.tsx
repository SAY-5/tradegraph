import type { LineageNode } from '../graph';

/** The descendant tree LineageService assembles from the lineage_down edges. */
function Branch({ node, onSelect }: { node: LineageNode; onSelect: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="result-btn" style={{ padding: '2px 6px' }} onClick={() => onSelect(node.id)}>
        <span className="name">{node.name}</span>
        {node.jurisdiction ? <span className="jur">{node.jurisdiction}</span> : null}
      </button>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => <Branch key={child.id} node={child} onSelect={onSelect} />)}
        </ul>
      ) : null}
    </li>
  );
}

export function LineageTree({ root, onSelect }: { root: LineageNode; onSelect: (id: string) => void }) {
  if (root.children.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 14 }}>No subsidiaries in the slice for this entity.</p>;
  }
  return (
    <ul className="tree">
      <Branch node={root} onSelect={onSelect} />
    </ul>
  );
}
