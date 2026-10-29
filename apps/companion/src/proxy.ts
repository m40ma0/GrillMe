import http from "node:http";

export interface NetworkSignal {
  url: string;
  status: number;
  durationMs: number;
  ts: number;
}

/**
 * A local HTTP proxy in front of the demo app. Point the browser (or the app's API base URL) at it;
 * every response's status and timing is reported, and requests that take longer than `timeoutMs`
 * are answered with 504 and reported as timeouts (status 0).
 */
export function startProxy(opts: { target: string; port: number; timeoutMs: number; onSignal: (s: NetworkSignal) => void }): Promise<http.Server> {
  const target = new URL(opts.target);
  const server = http.createServer((req, res) => {
    const started = performance.now();
    const path = req.url ?? "/";
    let reported = false;
    const report = (status: number) => {
      if (reported) return;
      reported = true;
      opts.onSignal({ url: path.split("?")[0] ?? path, status, durationMs: Math.round(performance.now() - started), ts: Date.now() });
    };
    const upstream = http.request(
      { protocol: target.protocol, hostname: target.hostname, port: target.port, method: req.method, path, headers: { ...req.headers, host: target.host }, timeout: opts.timeoutMs },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
        up.on("end", () => report(up.statusCode ?? 502));
      },
    );
    upstream.on("timeout", () => {
      upstream.destroy();
      report(0);
      if (!res.headersSent) res.writeHead(504, { "content-type": "text/plain" });
      res.end("The demo app did not answer in time (Stage Ready companion).");
    });
    upstream.on("error", () => {
      report(502);
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("The demo app is not reachable (Stage Ready companion).");
    });
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve(server));
  });
}
