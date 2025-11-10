const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format; allow only valid absolute URLs
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      throw new Error('Invalid URL');
    }

    // Fetch the content from the provided URL, or use injected test HTML when targeting example.com
    let html;
    if (process.env.FALEPROXY_TEST_HTML_FILE || process.env.FALEPROXY_TEST_HTML) {
      if (parsedUrl.hostname === 'example.com') {
        html = process.env.FALEPROXY_TEST_HTML_FILE
          ? fs.readFileSync(process.env.FALEPROXY_TEST_HTML_FILE, 'utf8')
          : process.env.FALEPROXY_TEST_HTML;
      } else {
        const response = await axios.get(url);
        html = response.data;
      }
    } else {
      const response = await axios.get(url);
      html = response.data;
    }

    // Use cheerio to parse HTML and selectively replace text content, not URLs
    const $ = cheerio.load(html);
    // Process text nodes in the body
    $('body *').contents().filter(function() {
      return this.nodeType === 3; // Text nodes only
    }).each(function() {
      // Replace text content but not in URLs or attributes
      const text = $(this).text();
      const newText = text.replace(/Yale/gi, 'Fale');
      if (text !== newText) {
        $(this).replaceWith(newText);
      }
    });
    
    // Process title separately
    const title = $('title').text().replace(/Yale/gi, 'Fale');
    $('title').text(title);
    
    return res.json({ 
      success: true, 
      content: $.html(),
      title: title,
      originalUrl: url
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({ 
      error: `Failed to fetch content: ${error.message}` 
    });
  }
});

// Start the server only if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
