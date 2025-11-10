const request = require('supertest');
const app = require('..//app');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

describe('App coverage via supertest', () => {
  beforeAll(() => {
    // Ensure the app uses injected HTML for example.com fetches
    process.env.FALEPROXY_TEST_HTML = sampleHtmlWithYale;
  });

  afterAll(() => {
    delete process.env.FALEPROXY_TEST_HTML;
  });

  test('POST /fetch returns transformed content using injected HTML', async () => {
    const res = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' })
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Fale University Test Page');
    expect(res.body.content).toContain('Welcome to Fale University');
    expect(res.body.content).toContain('>About Fale<');
    // URLs should remain unchanged
    expect(res.body.content).toContain('https://www.yale.edu/about');
  });

  test('POST /fetch with invalid URL returns 500', async () => {
    const res = await request(app)
      .post('/fetch')
      .send({ url: 'not-a-valid-url' })
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('Failed to fetch content');
  });

  test('POST /fetch with missing URL returns 400', async () => {
    const res = await request(app)
      .post('/fetch')
      .send({})
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('URL is required');
  });

  test('POST /fetch uses axios when env set but non-example host', async () => {
    // Env is set from beforeAll; choose a different host so code uses axios
    nock('https://google.com').get('/').reply(200, sampleHtmlWithYale);
    const res = await request(app)
      .post('/fetch')
      .send({ url: 'https://google.com/' })
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Fale University Test Page');
  });

  test('POST /fetch uses axios when no env injection present', async () => {
    const prevHtml = process.env.FALEPROXY_TEST_HTML;
    const prevFile = process.env.FALEPROXY_TEST_HTML_FILE;
    delete process.env.FALEPROXY_TEST_HTML;
    delete process.env.FALEPROXY_TEST_HTML_FILE;

    nock('https://faleproxy.test').get('/').reply(200, sampleHtmlWithYale);
    const res = await request(app)
      .post('/fetch')
      .send({ url: 'https://faleproxy.test/' })
      .set('Content-Type', 'application/json');

    // Restore env for other tests
    if (prevHtml) process.env.FALEPROXY_TEST_HTML = prevHtml;
    if (prevFile) process.env.FALEPROXY_TEST_HTML_FILE = prevFile;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Fale University Test Page');
  });

  test('GET / serves index page', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
