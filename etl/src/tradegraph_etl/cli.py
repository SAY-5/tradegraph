"""Command line entry point: ``tradegraph-etl build|load|stats``."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import click
from rdflib import Dataset as RdfDataset
from rdflib import URIRef

from tradegraph_etl import quality, transform
from tradegraph_etl.load import GraphStoreLoader, StoreEndpoints, changed_since
from tradegraph_etl.sources.sample import DEFAULT_SAMPLE_DIR, read_sample

ONTOLOGY_PATH = Path(__file__).resolve().parents[3] / "ontology" / "tradegraph.ttl"
QUALITY_FILE = "quality.json"
GRAPH_FILES = {
    transform.GRAPH_ENTITIES: "entities.nt",
    transform.GRAPH_POSITIONS: "positions.nt",
    transform.GRAPH_ONTOLOGY: "ontology.nt",
}


@click.group()
def main() -> None:
    """TradeGraph ETL."""


@main.command()
@click.option("--sample", "use_sample", is_flag=True, help="Use the committed sample dataset.")
@click.option("--live", "use_live", is_flag=True, help="Pull from SEC EDGAR.")
@click.option("--sample-dir", type=click.Path(path_type=Path), default=DEFAULT_SAMPLE_DIR)
@click.option("--user-agent", envvar="SEC_USER_AGENT", default=None)
@click.option("--funds", type=int, default=None, help="Live mode: number of default 13F filers.")
@click.option("--fund-cik", "fund_ciks", multiple=True, help="Live mode: 13F filer CIK.")
@click.option("--issuer-limit", type=int, default=None)
@click.option("--ontology", type=click.Path(path_type=Path), default=ONTOLOGY_PATH)
@click.option("--out", type=click.Path(path_type=Path), default=Path("build"))
def build(
    use_sample, use_live, sample_dir, user_agent, funds, fund_ciks, issuer_limit, ontology, out
):
    """Transform source data to N-Triples files, one per named graph."""
    if use_sample == use_live:
        raise click.UsageError("choose exactly one of --sample or --live")
    started = time.monotonic()
    if use_sample:
        ds = read_sample(sample_dir)
    else:
        from tradegraph_etl.sources.edgar import DEFAULT_13F_FILERS, EdgarClient, build_live

        if not user_agent:
            raise click.UsageError("--user-agent or SEC_USER_AGENT is required in live mode")
        ciks = list(fund_ciks) or (DEFAULT_13F_FILERS[:funds] if funds else None)
        ds = build_live(EdgarClient(user_agent), ciks, issuer_limit, log=click.echo)
    problems = transform.validate(ds)
    if problems:
        for p in problems[:20]:
            click.echo(f"error: {p}", err=True)
        sys.exit(1)
    store = transform.to_rdf(ds, ontology.read_text() if ontology.exists() else None)
    out.mkdir(parents=True, exist_ok=True)
    for graph_iri, filename in GRAPH_FILES.items():
        store.graph(graph_iri).serialize(destination=out / filename, format="nt", encoding="utf-8")
    summary = {**ds.counts(), "periods": ds.periods(), "graphs": transform.graph_sizes(store)}
    summary["triples"] = sum(summary["graphs"].values())
    summary["seconds"] = round(time.monotonic() - started, 2)
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    click.echo(json.dumps(summary, indent=2))


@main.command()
@click.option("--endpoint", required=True, help="Dataset base URL, e.g. http://localhost:3030/ds")
@click.option("--store", type=click.Choice(["fuseki", "stardog"]), default="fuseki")
@click.option("--user", envvar="STORE_USER", default=None)
@click.option("--password", envvar="STORE_PASSWORD", default=None)
@click.option("--build-dir", type=click.Path(path_type=Path), default=Path("build"))
@click.option(
    "--since",
    type=click.DateTime(formats=["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"]),
    default=None,
    help="Only push graph files modified at or after this time.",
)
def load(endpoint, store, user, password, build_dir, since):
    """PUT the named graphs from the build directory into the store."""
    auth = (user, password) if user else None
    loader = GraphStoreLoader(StoreEndpoints.for_store(endpoint, store), auth=auth)
    started = time.monotonic()
    present = {build_dir / f: iri for iri, f in GRAPH_FILES.items() if (build_dir / f).exists()}
    due = set(changed_since(present, since))
    loaded, skipped = [], []
    for path, graph_iri in present.items():
        if path not in due:
            skipped.append(path.name)
            continue
        loader.put_graph(URIRef(graph_iri), path.read_bytes())
        loaded.append(path.name)
        click.echo(f"loaded {path.name} -> {graph_iri}")
    for name in skipped:
        click.echo(f"unchanged since {since:%Y-%m-%dT%H:%M:%S}, skipped {name}")
    click.echo(
        json.dumps(
            {
                "loaded": loaded,
                "skipped": skipped,
                "entities": loader.count_entities(),
                "triples": loader.count_triples(),
                "seconds": round(time.monotonic() - started, 2),
            }
        )
    )


@main.command()
@click.option("--sample", "use_sample", is_flag=True, help="Check the committed sample dataset.")
@click.option("--sample-dir", type=click.Path(path_type=Path), default=DEFAULT_SAMPLE_DIR)
@click.option("--shapes", type=click.Path(path_type=Path), default=None)
@click.option("--ontology", type=click.Path(path_type=Path), default=ONTOLOGY_PATH)
@click.option("--out", type=click.Path(path_type=Path), default=Path("build"))
@click.option(
    "--fail-on-violation", is_flag=True, help="Exit non zero when the report is not clean."
)
def validate(use_sample, sample_dir, shapes, ontology, out, fail_on_violation):
    """Check the dataset against the SHACL shapes and write the quality report."""
    if not use_sample:
        raise click.UsageError("--sample is the only source this command reads")
    ds = read_sample(sample_dir)
    store = transform.to_rdf(ds, ontology.read_text() if ontology.exists() else None)
    shapes_path = shapes or quality.default_shapes_path()
    report = quality.report(ds, store, shapes_path.read_text() if shapes_path.exists() else None)
    out.mkdir(parents=True, exist_ok=True)
    payload = report.to_json()
    (out / QUALITY_FILE).write_text(json.dumps(payload, indent=2))
    click.echo(json.dumps(payload, indent=2))
    if fail_on_violation and not report.conforms:
        sys.exit(1)


@main.command()
@click.option("--endpoint", required=True)
@click.option("--store", type=click.Choice(["fuseki", "stardog"]), default="fuseki")
@click.option("--user", envvar="STORE_USER", default=None)
@click.option("--password", envvar="STORE_PASSWORD", default=None)
def stats(endpoint, store, user, password):
    """Print entity and triple counts from the store."""
    auth = (user, password) if user else None
    loader = GraphStoreLoader(StoreEndpoints.for_store(endpoint, store), auth=auth)
    click.echo(json.dumps({"entities": loader.count_entities(), "triples": loader.count_triples()}))


def load_build_dir(build_dir: Path) -> RdfDataset:
    """Helper used by tests: read the N-Triples files back into a Dataset."""
    store = RdfDataset()
    for graph_iri, filename in GRAPH_FILES.items():
        path = build_dir / filename
        if path.exists():
            store.graph(graph_iri).parse(path, format="nt")
    return store
