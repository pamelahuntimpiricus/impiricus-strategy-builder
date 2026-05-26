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
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  const prompt = `You are a pharma HCP marketing strategist. Generate a 4-message SMS journey matrix.

SEGMENTS: ${segments.join(", ")}
TOPICS: ${topics.join(", ")}
CONTEXT: ${(context || "").substring(0, 1000)}

Return ONLY this JSON structure, no other text:
{"segments":${JSON.stringify(segments)},"matrix":[{"messageNumber":1,"timing":"Early Campaign","cells":[{"segment":"SEGMENT_NAME","topic":"TOPIC","headline":"short headline","strategy":"one sentence rationale","keyData":""}]},{"messageNumber":2,"timing":"Mid Campaign","cells":[...]},{"messageNumber":3,"timing":"Late Campaign","cells":[...]},{"messageNumber":4,"timing":"Close Campaign","cells":[...]}]}

Rules: one cell per segment per message, vary topics, early=educate late=action, only use listed topics, keep headline under 12 words, keep strategy to one sentence, return only valid JSON.`;

  const requestBody = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
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
            resolve({ statusCode: 500, body: JSON.stringify({ error: "No response", raw: data.substring(0, 200) }) });
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
          resolve({ statusCode: 500, body: JSON.stringify({ error: "Parse error: " + e.message, raw: data.substring(0, 200) }) });
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
