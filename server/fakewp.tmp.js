const http = require('http');
const json = (res, payload, status = 200) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(payload)); };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/wp-json/') {
    return json(res, { name: 'Demo Site', namespaces: ['wp/v2'], authentication: { 'application-passwords': { endpoints: { authorization: 'https://demo.test/wp-admin/authorize-application.php' } } } });
  }
  if (url.pathname.startsWith('/wp-json/wp/v2/')) {
    return json(res, { code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
  }
  json(res, { code: 'rest_no_route' }, 404);
});
server.listen(5199, '127.0.0.1', () => console.log('fake wp up'));
