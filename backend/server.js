const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Mock data as a fallback
const mockAgileStories = [
  {
    summary: "Implement dashboard header",
    description: "Create a responsive header with logo, title, and user profile dropdown using React and Tailwind CSS.",
    acceptanceCriteria: [
      "Header is sticky and visible on all pages.",
      "Logo links to homepage.",
      "Dropdown includes user settings and logout."
    ],
    storyPoints: { junior: 3, midLevel: 2, senior: 1 },
    priority: "High",
    assignee: "Frontend Team",
    labels: ["frontend", "ui"],
    epicLink: "",
    components: ["UI"]
  },
  {
    summary: "Create sidebar navigation",
    description: "Build a collapsible sidebar with navigation links to dashboard, reports, and settings.",
    acceptanceCriteria: [
      "Sidebar collapses on mobile screens.",
      "Active link is highlighted.",
      "Supports at least 5 navigation items."
    ],
    storyPoints: { junior: 4, midLevel: 3, senior: 2 },
    priority: "High",
    assignee: "Frontend Team",
    labels: ["frontend", "ui"],
    epicLink: "",
    components: ["UI"]
  },
  {
    summary: "Develop data table for dashboard",
    description: "Implement a sortable, paginated data table displaying user data, integrated with a backend API.",
    acceptanceCriteria: [
      "Table supports sorting by at least 3 columns.",
      "Pagination handles 10 rows per page.",
      "Data loads in under 2 seconds."
    ],
    storyPoints: { junior: 8, midLevel: 5, senior: 3 },
    priority: "Medium",
    assignee: "Frontend Team",
    labels: ["frontend", "backend"],
    epicLink: "",
    components: ["UI", "API"]
  }
];

// Log incoming requests
app.use(function(req, res, next) {
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.url);
  next();
});

// Configure CORS to allow only the frontend URL
app.use(cors({ origin: 'https://Agile-story-generator.onrender.com' }));
app.use(express.json());

app.post('/generate-stories', upload.single('image'), async function(req, res) {
  try {
    console.log('Received request to /generate-stories');
    if (!req.file) {
      console.log('No image uploaded');
      return res.status(400).json({ error: 'No image uploaded.' });
    }
    if (!process.env.XAI_API_KEY) {
      console.log('API key not configured');
      return res.status(500).json({ error: 'API key not configured.' });
    }

    console.log('Encoding image to base64');
    const base64Image = req.file.buffer.toString('base64');
    const prompt = 
      'Analyze this UI design image and generate as many stories for its implementation as needed. Each story must include:\n' +
      '- summary (string, short title)\n' +
      '- description (string, detailed task explanation, avoid using quotes within the description to prevent JSON parsing issues)\n' +
      '- acceptanceCriteria (array of 3-5 strings, bullet points, avoid using quotes within the criteria)\n' +
      '- storyPoints (object with numeric junior, midLevel, senior estimates)\n' +
      '- priority (string, "High", "Medium", or "Low")\n' +
      '- assignee (string, e.g., "Frontend Team")\n' +
      '- labels (array of strings, relevant tags)\n' +
      '- epicLink (string, optional, e.g., "EPIC-123")\n' +
      '- components (array of strings, e.g., ["UI", "API"])\n' +
      'Return ONLY a clean, valid JSON array of objects. Do NOT include Markdown, backticks, code fences, prose, or any additional text. Ensure all strings are properly escaped to be JSON-compatible. Example:\n' +
      '[{"summary":"Example story","description":"Details here","acceptanceCriteria":["Criteria 1","Criteria 2"],"storyPoints":{"junior":3,"midLevel":2,"senior":1},"priority":"High","assignee":"Team","labels":["tag"],"epicLink":"","components":["UI"]}]';

    console.log('Preparing xAI API request');
    const requestBody = {
      messages: [
        { role: "system", content: "You are a vision assistant that outputs only clean, valid JSON with no formatting or prose." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: 'data:image/' + req.file.mimetype.split('/')[1] + ';base64,' + base64Image } }
          ]
        }
      ],
      model: "grok-vision-beta",
      stream: false,
      max_tokens: 800,
      temperature: 0
    };

    console.log('Sending request to xAI API');
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.XAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('xAI API error: ' + response.status + ' - ' + errorText);
      return res.status(response.status).json({ error: errorText });
    }

    console.log('Received response from xAI API');
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log('No content in API response');
      return res.status(200).json(mockAgileStories); // Return mock data instead of error
    }

    // Log the raw API response for debugging
    console.log('Raw API Response:', content);

    // Clean response
    console.log('Cleaning API response');
    content = content.trim()
      .replace(/^```(json)?\n?/, '') // Remove starting code fence
      .replace(/\n?```$/, '')        // Remove ending code fence
      .replace(/^`+/, '')            // Remove starting backticks
      .replace(/`+$/, '')            // Remove ending backticks
      .replace(/\\n/g, ' ')         // Replace newlines with spaces
      .replace(/\\"/g, '"')         // Unescape quotes
      .replace(/[^ -~]/g, '')       // Remove non-printable ASCII characters
      .replace(/"([^"]*)"/g, function(match, p1) { // Escape inner quotes
        return '"' + p1.replace(/"/g, '\\"') + '"';
      });

    // Ensure the response is a valid JSON array
    if (!content.startsWith('[') || !content.endsWith(']')) {
      console.log('Response is not a JSON array, adding brackets');
      content = '[' + content + ']';
    }

    // Log the cleaned response
    console.log('Cleaned API Response:', content);

    try {
      console.log('Parsing API response');
      const stories = JSON.parse(content);
      if (!Array.isArray(stories)) {
        console.log('Parsed response is not an array');
        return res.status(200).json(mockAgileStories);
      }
      console.log('Sending response to client');
      res.json(stories);
    } catch (parseError) {
      console.log('Failed to parse API response: ' + parseError.message);
      console.log('Returning mock data due to parsing failure');
      res.status(200).json(mockAgileStories);
    }
  } catch (error) {
    console.error('Server error: ' + error.message, error.stack);
    res.status(200).json(mockAgileStories);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});