const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "build");
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" || ext === ".webmanifest" ? "no-cache" : "public, max-age=3600",
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(response, filePath);
      return;
    }
    if (!error && stats.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      fs.stat(indexPath, (indexError, indexStats) => {
        if (!indexError && indexStats.isFile()) sendFile(response, indexPath);
        else sendFile(response, path.join(root, "index.html"));
      });
      return;
    }
    // BrowserRouter paths (/ru/faq, etc.) fall back to the SPA shell.
    sendFile(response, path.join(root, "index.html"));
  });
});

server.listen(port, host, () => {
  console.log(`MapartCraft Local Studio: http://${host}:${port}`);
  console.log(`Serving: ${root}`);
});
