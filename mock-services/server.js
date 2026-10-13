"use strict";

const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3001);
const logs = [];

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ raw });
      }
    });
    req.on("error", reject);
  });
}

function log(event, data) {
  const entry = { at: new Date().toISOString(), event, ...data };
  logs.unshift(entry);
  if (logs.length > 200) logs.pop();
  console.log(JSON.stringify(entry));
}

function scoreLead(lead) {
  const budget = Number(lead.budget_usd || lead.budget || 0);
  const company = String(lead.company || "").toLowerCase();
  const email = String(lead.email || "");
  let score = 40;
  const reasons = [];

  if (budget >= 25000) {
    score += 35;
    reasons.push("High budget (≥ $25k)");
  } else if (budget >= 10000) {
    score += 22;
    reasons.push("Solid budget (≥ $10k)");
  } else if (budget >= 5000) {
    score += 12;
    reasons.push("Moderate budget");
  }

  if (company.includes("enterprise") || company.includes("global")) {
    score += 15;
    reasons.push("Enterprise-style company name");
  }

  if (email.endsWith(".edu")) {
    score -= 10;
    reasons.push("Academic email — lower fit");
  }

  if (lead.source === "referral") {
    score += 10;
    reasons.push("Referral source");
  }

  if (lead.force_tier === "hot" || lead.force_tier === "warm" || lead.force_tier === "cold") {
    const forced = lead.force_tier;
    score = forced === "hot" ? 92 : forced === "warm" ? 68 : 25;
    reasons.push(`Demo override: force_tier=${forced}`);
  }

  score = Math.max(0, Math.min(100, score));
  let tier = "cold";
  if (score >= 80) tier = "hot";
  else if (score >= 55) tier = "warm";

  return {
    score,
    tier,
    model: "mock-gemini-2.5-flash",
    summary: `Lead ${lead.name || "unknown"} @ ${lead.company || "n/a"} scored ${score}/100 (${tier}).`,
    reasons,
  };
}

function openAiStyleResponse(lead, qualification) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: "chat.completion",
    model: "gpt-4o-mini-mock",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({
            score: qualification.score,
            tier: qualification.tier,
            summary: qualification.summary,
            reasons: qualification.reasons,
          }),
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && path === "/health") {
    json(res, 200, { ok: true, service: "mock-services", logs: logs.length });
    return;
  }

  if (req.method === "GET" && path === "/logs") {
    json(res, 200, { logs });
    return;
  }

  if (req.method === "POST" && path === "/v1/chat/completions") {
    const body = await readBody(req);
    const simulateFailure = url.searchParams.get("fail") === "1" || body.simulate_openai_failure;
    if (simulateFailure) {
      log("openai_simulated_failure", { body });
      json(res, 503, { error: { message: "Simulated OpenAI outage for demo fallback" } });
      return;
    }

    let lead = body.lead || {};
    if (!lead.email && body.messages) {
      const userMsg = body.messages.find((m) => m.role === "user");
      if (userMsg && typeof userMsg.content === "string") {
        try {
          lead = JSON.parse(userMsg.content);
        } catch {
          lead = { raw: userMsg.content };
        }
      }
    }

    const qualification = scoreLead(lead);
    const response = openAiStyleResponse(lead, qualification);
    log("openai_qualify", { lead: lead.email, tier: qualification.tier, score: qualification.score });
    json(res, 200, response);
    return;
  }

  if (req.method === "POST" && path === "/api/qualify/fallback") {
    const lead = await readBody(req);
    const qualification = scoreLead(lead);
    qualification.model = "rules-engine-fallback";
    qualification.summary = `[Fallback] ${qualification.summary}`;
    log("qualify_fallback", { lead: lead.email, tier: qualification.tier });
    json(res, 200, qualification);
    return;
  }

  if (req.method === "POST" && path === "/api/crm/upsert") {
    const lead = await readBody(req);
    const record = {
      id: `crm_${Buffer.from(lead.email || "anon").toString("base64url").slice(0, 12)}`,
      provider: "hubspot-mock",
      status: "upserted",
      lead,
      synced_at: new Date().toISOString(),
    };
    log("crm_upsert", { email: lead.email, id: record.id });
    json(res, 200, record);
    return;
  }

  if (req.method === "POST" && path === "/api/sheets/append") {
    const row = await readBody(req);
    const record = {
      provider: "google-sheets-mock",
      sheet: "Leads",
      row,
      appended_at: new Date().toISOString(),
    };
    log("sheets_append", { email: row.email, tier: row.tier });
    json(res, 200, record);
    return;
  }

  if (req.method === "POST" && path === "/api/whatsapp/send") {
    const payload = await readBody(req);
    const record = {
      provider: "whatsapp-cloud-mock",
      to: payload.to || payload.phone,
      message: payload.message,
      status: "queued",
      sent_at: new Date().toISOString(),
    };
    log("whatsapp_send", { to: record.to });
    json(res, 200, record);
    return;
  }

  if (req.method === "POST" && path === "/api/email/send") {
    const payload = await readBody(req);
    const record = {
      provider: "smtp-mock",
      to: payload.to || payload.email,
      subject: payload.subject,
      status: "queued",
      sent_at: new Date().toISOString(),
    };
    log("email_send", { to: record.to });
    json(res, 200, record);
    return;
  }

  json(res, 404, { error: "not_found", path });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`mock-services listening on :${PORT}`);
});
