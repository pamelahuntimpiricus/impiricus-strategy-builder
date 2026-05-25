const https = require("https");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { segments, topics, context } = body;

  if (!segments || !topics) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing segments or topics" }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set" }) };
  }

  const systemPrompt = `You are an expert pharmaceutical HCP marketing strategist at Impiricus. Generate a 4-message HCP SMS strategy matrix. Return ONLY valid JSON, no markdown, no explanation, no code fences, in this exact structure: {"segments":["seg1"],"matrix":[{"messageNumber":1,"timing":"Early Campaign","cells":[{"segment":"seg1","topic":"chosen topic","headline":"8-12 word headline","strategy":"2-3 sentence rationale","keyData":"stat or empty string"}]}]}`;

  const userPrompt = `Generate a 4-message HCP SMS strategy matrix.
SEGMENTS: ${segments.join(", ")}
SELECTED TOPICS: ${topics.join(", ")}
STRATEGIC CONTEXT: ${context || "No additional context provided."}
Rules: 4 message rows, one cell per segment per row, vary topics across journey, early=educate late=drive action, only use listed topics, return only valid JSON.`;

  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.content || !parsed.content[0]) {
            resolve({
              statusCode: 500,
              body: JSON.stringify({ error: "No content in Claude response", raw: data.substring(0, 300) }),
            });
            return;
          }
          const text = parsed.content[0].text.replace(/```json|```/g, "").trim();
          const matrix = JSON.parse(text);
          resolve({
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(matrix),
          });
        } catch (e) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: "Parse error: " + e.message, raw: data.substring(0, 300) }),
          });
        }
      });
    });

    req.on("error", (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: "Request error: " + e.message }) });
    });

    req.write(requestBody);
    req.end();
  });
};
