# tradegraph-explorer

Angular 22 standalone application for browsing the TradeGraph API: entity
search, a d3 force-directed neighbour graph with expand-on-click, a lineage
tree and an exposure panel with per-line path explanations.

```
npm ci
npm start        # dev server on :4200, /api proxied to http://localhost:8080
npm run lint
npm test         # vitest, jsdom
npm run build    # dist/explorer/browser
```

The container image (`deploy/Dockerfile.explorer`) serves the build with nginx
and proxies `/api/` to the `api` service.
