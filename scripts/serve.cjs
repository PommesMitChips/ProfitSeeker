const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "../tmp/harness");
http
  .createServer((req, res) => {
    const name =
      req.url?.split("?")[0] === "/"
        ? "index.html"
        : decodeURIComponent(req.url?.split("?")[0] ?? "").replace(/^\//, "");
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.setHeader(
        "Content-Type",
        target.endsWith(".html")
          ? "text/html; charset=utf-8"
          : target.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream",
      );
      res.end(data);
    });
  })
  .listen(Number(process.argv[2] ?? 4182), "127.0.0.1", () =>
    console.log(
      `Profit Seeker fixture harness: http://127.0.0.1:${process.argv[2] ?? 4182}`,
    ),
  );
