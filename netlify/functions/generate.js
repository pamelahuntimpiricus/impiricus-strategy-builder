exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { segments, topics, context } = JSON.parse(event.body || "{}");

  if (!segments || !topics) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing segments or topics" }) };
  }

  const systemPrompt = `You are an expert pharmaceutical HCP marketing strategist at Impiricus, the AI-powered HCP Engagement Engine. Generate a 4-message HCP SMS strategy matrix.

Return ONLY valid JSON — no markdown, no explanation, no code fences — in this exact structure:
{
  "segments": ["seg1","seg2"],
  "matrix": [
    {
      "messageNumber": 1,
      "timing": "Early Campaign",
      "cells": [
        {
          "segment": "seg1",
          "topic": "chosen topic",
          "headline": "8-12 word message headline",
          "strategy": "2-3 sentence rationale for why this topic, why now, and what action it drives",
          "keyData": "one key stat or clinical hook if relevant, else empty string"
        }
      ]
    }
  ]
}`;

  const userPrompt = `Generate a 4-message HCP SMS strategy matrix.

SEGMENTS: ${segments.join(", ")}
SELECTED TOPICS: ${topics.join(", ")}
STRATEGIC CONTEXT: ${context || "No additional context provided."}

Rules:
- 4 message rows total, one cell per segment per row
- Messages run as a timeline: early messages educate, later messages drive action or remove barriers
- Vary topics meaningfully across the journey — do not repeat the same topic for the same segment
- Only use topics from the SELECTED TOPICS list
- Make strategy rationale specific to each segment's prescribing behavior and clinical context
- Return only valid JSON, nothing else`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await response.json();

    if (!data.content || !data.content[0]) {
      return { statusCode: 500, body: JSON.stringify({ error: "No response from Claude" }) };
    }

    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Something went wrong" }),
    };
  }
};
