// One public port for the single-container deploy (Modal, or any Docker host): WebSockets on /ws go to the realtime server, everything else to the web app.
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.ROUTER_PORT ?? 7860);
const WEB = { host: "127.0.0.1", port: Number(process.env.WEB_PORT ?? 3000) };
const REALTIME = { host: "127.0.0.1", port: Number(process.env.REALTIME_PORT ?? 4000) };

const targetFor = (url = "/") => (url === "/ws" || url.startsWith("/ws?") ? REALTIME : WEB);

const server = http.createServer((req, res) => {
  const target = targetFor(req.url);
  const upstream = http.request({ ...target, method: req.method, path: req.url, headers: req.headers }, (reply) => {
    res.writeHead(reply.statusCode ?? 502, reply.headers);
    reply.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("Stage Ready is starting. Try again in a few seconds.");
  });
  req.pipe(upstream);
});

// WebSocket upgrades: replay the request line and headers to the target, then pipe both ways.
server.on("upgrade", (req, socket, head) => {
  const target = targetFor(req.url);
  const upstream = net.connect(target.port, target.host, () => {
    const headers = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, () => console.log(`router on :${PORT} (/ws -> :${REALTIME.port}, rest -> :${WEB.port})`));
