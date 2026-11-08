// Tiny static server for the harness (content scripts only run on http/https).
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;
const port = Number(process.argv[2] || 8765);
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'harness.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('harness on http://localhost:' + port));
