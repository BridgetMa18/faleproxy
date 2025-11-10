const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  // Modify the app to use a test port
  beforeAll(async () => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    // Allow localhost and 127.0.0.1 for supertest/axios
    nock.enableNetConnect(/(127\.0\.0\.1|localhost)/);
    
    // Create a temporary app file that Jest won't treat as a test
    await execAsync('cp app.js app.spawn.js');
    // Set test port in a cross-platform way (avoid sed differences)
    {
      const p = path.resolve(__dirname, '..', 'app.spawn.js');
      let src = fs.readFileSync(p, 'utf8');
      src = src.replace(/const PORT = \d+/, `const PORT = ${TEST_PORT}`);
      fs.writeFileSync(p, src, 'utf8');
    }
    
    // Inject sample HTML via file so the spawned server can read it
    const samplePath = path.resolve(__dirname, 'sample.html');
    fs.writeFileSync(samplePath, sampleHtmlWithYale, 'utf8');
    process.env.FALEPROXY_TEST_HTML_FILE = samplePath;
    // Prepend env injection directly into the spawned app file for reliability
    const appSpawnPath = path.resolve(__dirname, '..', 'app.spawn.js');
    const original = fs.readFileSync(appSpawnPath, 'utf8');
    fs.writeFileSync(
      appSpawnPath,
      `process.env.FALEPROXY_TEST_HTML_FILE = ${JSON.stringify(samplePath)};\n` + original,
      'utf8'
    );
    
    // Start the test server
    server = require('child_process').spawn('node', ['app.spawn.js'], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 10000); // Increase timeout for server startup

  afterAll(async () => {
    // Kill the test server and clean up
    if (server && server.pid) {
      process.kill(-server.pid);
    }
    await execAsync('rm app.spawn.js');
    await execAsync(`rm -f ${path.resolve(__dirname, 'sample.html')}`);
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    // Make a request to our proxy app
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');
    
    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);
    
    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
  }, 10000); // Increase timeout for this test

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
