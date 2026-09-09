const http = require('http');
const json = (res, payload, status = 200) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(payload)); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/wp-json/') return json(res, { name: 'Demo', namespaces: ['wp/v2'], authentication: { 'application-passwords': { endpoints: {} } } });
  return json(res, { code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
}).listen(5200, '127.0.0.1', () => console.log('fake wp up'));
