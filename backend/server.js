const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Configure CORS to allow only the frontend URL
app.use(cors({ origin: 'https://jira-story-backend.onrender.com' }));
app.use(express.json());

app.post('/generate-stories', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded.' });
    }
    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured.' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const prompt = `
You are a professional Project Manager whos built dozens of Enterprise grade applications. You have a high attention to detail, and an intuitive mind when it comes to what the business wants and needs. 
Analyze this UI design image and generate 5 Jira stories for its implementation. Each story must include:
- summary (string, short title)
- description (string, detailed task explanation)
- acceptanceCriteria (array of 3-5 strings, bullet points)
- storyPoints (object with numeric junior, midLevel, senior estimates)
- priority (string, "High", "Medium", or "Low")
- assignee (string, e.g., "Frontend Team")
- labels (array of strings, relevant tags)
- epicLink (string, optional, e.g., "EPIC-123")
- components (array of strings, e.g., ["UI", "API"])
Return only a clean, valid JSON array of objects, with no Markdown, backticks, code fences, prose, or additional text. Ensure the output is parseable as JSON. Example:
[{"summary":"Example story","description":"Details","acceptanceCriteria":["Criteria 1","Criteria 2"],"storyPoints":{"junior":3,"midLevel":2,"senior":1},"priority":"High","assignee":"Team","labels":["tag"],"epicLink":"","components":["UI"]}]
    `;

    const requestBody = {
      messages: [
        { role: "system", content: "You are a vision assistant that outputs only clean, valid JSON with no formatting or prose." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/${req.file.mimetype.split('/')[1]};base64,${base64Image}` } }
          ]
        }
      ],
      model: "grok-vision-beta",
      stream: false,
      max_tokens: 1000,
      temperature: 0
    };

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'No content in API response.' });
    }

    // Clean response
    content = content.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').replace(/^`+/, '').replace(/`+$/, '');
    const jsonMatch = content.match(/(\[\s*{[\s\S]*?}\s*\])/);
    content = jsonMatch ? jsonMatch[1] : content;

    try {
      const stories = JSON.parse(content);
      if (!Array.isArray(stories)) {
        throw new Error('Parsed response is not an array.');
      }
      res.json(stories);
    } catch (parseError) {
      res.status(500).json({ error: `Failed to parse API response: ${parseError.message}` });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));