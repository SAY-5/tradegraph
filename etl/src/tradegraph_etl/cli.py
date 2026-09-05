"""Command line entry point: ``tradegraph-etl build|load|stats``."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import click
from rdflib import Dataset as RdfDataset
from rdflib import URIRef

from tradegraph_etl import transform
from tradegraph_etl.load import GraphStoreLoader, StoreEndpoints
from tradegraph_etl.sources.sample import DEFAULT_SAMPLE_DIR, read_sample

ONTOLOGY_PATH = Path(__file__).resolve().parents[3] / "ontology" / "tradegraph.ttl"
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
    summary = {**ds.counts(), "graphs": transform.graph_sizes(store)}
    summary["triples"] = sum(summary["graphs"].values())
    summary["seconds"] = round(time.monotonic() - started, 2)
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    click.echo(json.dumps(summary, indent=2))


@main.command()
@click.option(
    "--endpoint", required=True, help="Dataset base URL, e.g. http://localhost:3030/tradegraph"
)
@click.option("--store", type=click.Choice(["fuseki", "stardog"]), default="fuseki")
@click.option("--user", envvar="STORE_USER", default=None)
@click.option("--password", envvar="STORE_PASSWORD", default=None)
@click.option("--build-dir", type=click.Path(path_type=Path), default=Path("build"))
def load(endpoint, store, user, password, build_dir):
    """PUT every named graph from the build directory into the store."""
    auth = (user, password) if user else None
    loader = GraphStoreLoader(StoreEndpoints.for_store(endpoint, store), auth=auth)
    started = time.monotonic()
    for graph_iri, filename in GRAPH_FILES.items():
        path = build_dir / filename
        if not path.exists():
            continue
        loader.put_graph(URIRef(graph_iri), path.read_bytes())
        click.echo(f"loaded {filename} -> {graph_iri}")
    click.echo(
        json.dumps(
            {
                "entities": loader.count_entities(),
                "triples": loader.count_triples(),
                "seconds": round(time.monotonic() - started, 2),
            }
        )
    )


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
