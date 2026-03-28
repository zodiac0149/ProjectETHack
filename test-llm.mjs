import fs from "fs";

async function run() {
  const env = Object.fromEntries(
    fs.readFileSync(".env", "utf8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      .map(line => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      })
  );

  const model = env.GROQ_MODEL || "llama-3.1-8b-instant";
  const apiKey = env.GROQ_API_KEY;

  const system = "You are a professional news analyst providing personalized briefings.";
  const prompt = `
Divide the news into 3-5 distinct sections. Each section MUST follow this JSON structure:
{
  "title": "Precise, actionable title here",
  "summary": "A high-impact, 2-3 sentence executive summary here",
  "points": ["Precise, concise point 1 (merge facts, no fluff/labels)", "Point 2", "Point 3"]
}

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "title": "Overall Briefing Title",
  "query": "The user query",
  "generatedAt": "ISO date string",
  "sections": [
    {
      "title": "Precise, actionable title here",
      "summary": "A high-impact, 2-3 sentence executive summary here",
      "points": ["Precise, concise point 1", "Point 2", "Point 3"]
    }
  ]
}

USER CONTEXT:
Role: General Reader
Query: Software Engineer AI Trends

SOURCE NEWS ATOMS:
- (Atom 1) The role of software engineers is shifting towards AI systems integration.
- (Atom 2) Demand for machine learning skills is up 50% year-over-year.
`;

  console.log("Sending to Groq: " + model);
  
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
  
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

run();
