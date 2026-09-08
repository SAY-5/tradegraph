# Sample dataset

A committed, deterministic dataset used by tests, CI and `make demo`.

| File | Source | Records |
|---|---|---|
| `issuers.json` | First 3,600 issuers of the public SEC `company_tickers.json` snapshot (real CIK, ticker, name) | 3,600 |
| `funds.json` | 58 listed asset managers, banks and insurers from the same snapshot (real CIK) plus synthetic sub-funds under each | 410 |
| `subsidiaries.json` | Synthetic Exhibit 21 style subsidiary lists for the first 420 issuers, up to two levels deep | 2,148 |
| `holdings/*.json` | Synthetic 13F-HR style information tables, one file per fund family | 12,373 positions |

Total legal entities: 6,100 (the 58 asset managers are both issuers and 13F filers). Holdings quantities, values, CUSIPs, accession
numbers and subsidiary names are synthetic and derived from a fixed seed.
Only issuer identities (CIK, ticker, name) and fund manager identities come
from SEC data. Do not treat the values as real market data.

Rebuild with:

```
curl -A "TradeGraph ETL you@example.com" -o /tmp/company_tickers.json \
  https://www.sec.gov/files/company_tickers.json
uv run python scripts/make_sample.py --tickers /tmp/company_tickers.json --out sample
```
