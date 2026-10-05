// Test-only S3-compatible transport. Never deploy this server.
import { createServer } from "node:http";
const objects = new Map();
createServer(async (req, res) => {
  const key = new URL(req.url, "http://localhost").pathname;
  if (key === "/healthz") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  if (req.method === "PUT") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    objects.set(key, {
      bytes: Buffer.concat(chunks),
      type: req.headers["content-type"] || "application/octet-stream",
    });
    res.writeHead(200, { etag: '"test-object"' });
    res.end();
  } else if (req.method === "DELETE") {
    objects.delete(key);
    res.writeHead(204);
    res.end();
  } else if (req.method === "GET" || req.method === "HEAD") {
    const object = objects.get(key);
    if (!object) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": object.type,
      "content-length": object.bytes.length,
    });
    res.end(req.method === "HEAD" ? undefined : object.bytes);
  } else {
    res.writeHead(405);
    res.end();
  }
}).listen(9000, "127.0.0.1");
