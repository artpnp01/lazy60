const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const jobs = new Map();
const defaultUser = {
  id: "demo-user",
  email: "hi@lazy60.com",
  points: 0,
  paid: false,
  freeUsedDate: "",
  ledger: []
};
let user = { ...defaultUser };
let supabaseReady = false;

loadEnv();
supabaseReady = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
}).listen(port, host, () => {
  console.log(`LAZY60 preview: http://${host}:${port}`);
  console.log("KIE mode:", process.env.KIE_API_KEY ? "enabled" : "demo fallback");
  console.log("Supabase mode:", supabaseReady ? "enabled" : "memory fallback");
});

async function handleApi(request, response, url) {
  setRequestUser(request);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      kie: Boolean(process.env.KIE_API_KEY),
      supabase: supabaseReady,
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    if (supabaseReady) await ensureSupabaseUser();
    sendJson(response, 200, { user: publicUser() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/topup") {
    const body = await readJson(request);
    const points = Number(body.points || 0);
    if (!Number.isFinite(points) || points <= 0) {
      sendJson(response, 400, { error: "Invalid points amount" });
      return;
    }
    await addPoints(points, { type: "topup", pack: body.pack || "manual" });
    sendJson(response, 200, { user: publicUser() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stripe/create-checkout-session") {
    const body = await readJson(request);
    const pack = getStripePack(body.pack);
    if (!pack) {
      sendJson(response, 400, { error: "Invalid top-up pack" });
      return;
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      sendJson(response, 200, { mode: "mock", pack });
      return;
    }
    const session = await createStripeCheckoutSession(pack, request);
    sendJson(response, 200, { mode: "stripe", url: session.url, id: session.id });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
    const raw = await readRaw(request);
    let body;
    try {
      body = verifyStripeWebhook(request, raw);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    const session = body.data?.object;
    if (body.type !== "checkout.session.completed" || !session) {
      sendJson(response, 200, { received: true, ignored: true });
      return;
    }
    const pack = getStripePack(session.metadata?.pack);
    const email = session.client_reference_id || session.customer_email;
    if (!pack || !email) {
      sendJson(response, 400, { error: "Missing pack or email in Stripe session" });
      return;
    }
    const previousEmail = user.email;
    user = { ...defaultUser, email: String(email).trim().toLowerCase() };
    await addPoints(pack.points, {
      type: "stripe_checkout_completed",
      pack: pack.id,
      stripeSessionId: session.id
    });
    user = { ...defaultUser, email: previousEmail };
    sendJson(response, 200, { received: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/autofill") {
    const body = await readJson(request);
    const result = demoAutofill(body);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    const body = await readJson(request);
    const billing = await reserveGeneration(body);
    if (!billing.ok) {
      sendJson(response, 402, { error: billing.error, user: publicUser() });
      return;
    }
    const job = await createJob({ ...body, ...billing });
    sendJson(response, 202, { job });
    runGeneration(job.id, body);
    return;
  }

  const refundMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/refund$/);
  if (request.method === "POST" && refundMatch) {
    const job = jobs.get(refundMatch[1]);
    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return;
    }
    if (job.status !== "failed") {
      sendJson(response, 400, { error: "Only failed jobs can be refunded" });
      return;
    }
    if (job.refunded) {
      sendJson(response, 200, { job, user: publicUser() });
      return;
    }
    if (job.cost > 0) {
      await addPoints(job.cost, { type: "refund", jobId: job.id });
    }
    await updateJob(job.id, { status: "refunded", refunded: true });
    sendJson(response, 200, { job: jobs.get(job.id), user: publicUser() });
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return;
    }
    sendJson(response, 200, { job });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/jobs") {
    const history = supabaseReady ? await listSupabaseJobs() : [...jobs.values()];
    sendJson(response, 200, { jobs: history });
    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

function setRequestUser(request) {
  const email = request.headers["x-demo-user-email"] || defaultUser.email;
  if (email === user.email) return;
  user = { ...defaultUser, email: String(email).trim().toLowerCase() || defaultUser.email };
}

function serveStatic(pathname, response) {
  let cleanPath = decodeURIComponent(pathname);
  if (cleanPath === "/") cleanPath = "/index.html";

  const file = path.join(root, cleanPath);
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream"
    });
    response.end(data);
  });
}

async function createJob(body) {
  const id = body.id || `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let job = {
    id,
    status: "queued",
    progress: 1,
    productName: body.productName,
    type: body.type,
    prompt: body.prompt,
    language: body.language,
    resolution: body.resolution,
    cost: body.cost || 0,
    watermark: Boolean(body.watermark),
    billingType: body.billingType || "points",
    refunded: false,
    user: body.user || publicUser(),
    source: body.images?.[0] || "",
    image: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    failureReason: ""
  };
  if (supabaseReady) {
    try {
      job = await createSupabaseJob(job);
    } catch (error) {
      console.warn("Supabase job insert failed:", error.message);
    }
  }
  jobs.set(job.id, job);
  return job;
}

async function reserveGeneration(body) {
  if (supabaseReady) await ensureSupabaseUser();
  const resolution = body.resolution || "1K";
  const costs = { "1K": 2, "2K": 3, "4K": 5 };
  const cost = costs[resolution];
  if (!cost) return { ok: false, error: "Invalid resolution" };

  const free = !user.paid && resolution === "1K" && user.freeUsedDate !== todayKey();
  if (free) {
    user.freeUsedDate = todayKey();
    await writeLedger({ type: "free_generation", points: 0, resolution });
    await saveSupabaseUser();
    return { ok: true, cost: 0, watermark: true, billingType: "daily_free", user: publicUser() };
  }

  if (user.points < cost) {
    return { ok: false, error: `Not enough points. ${resolution} costs ${cost} points.` };
  }

  user.points -= cost;
  await writeLedger({ type: "generation_charge", points: -cost, resolution });
  await saveSupabaseUser();
  return { ok: true, cost, watermark: false, billingType: "points", user: publicUser() };
}

async function runGeneration(id, body) {
  const job = jobs.get(id);
  if (!job) return;

  await updateJob(id, { status: "processing", progress: 12 });

  try {
    if (shouldForceFailure(body)) {
      await wait(1200);
      throw new Error("Forced demo failure for refund testing.");
    }
    const image = process.env.KIE_API_KEY
      ? await generateWithKie(body)
      : await demoGenerate(body);
    await updateJob(id, { status: "succeeded", progress: 100, image });
  } catch (error) {
    await updateJob(id, {
      status: "failed",
      progress: 100,
      failureReason: error.message || "Generation failed"
    });
  }
}

function shouldForceFailure(body) {
  const text = `${body.productName || ""} ${body.prompt || ""}`.toLowerCase();
  return text.includes("force_fail") || text.includes("test_refund");
}

async function updateJob(id, patch) {
  const current = jobs.get(id);
  if (!current) return;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  jobs.set(id, next);
  if (supabaseReady) {
    await updateSupabaseJob(id, next);
  }
}

function demoAutofill(body) {
  const product = body.productName || "this product";
  const language = body.language || "English";
  return {
    requirements: {
      hero: `Create a clean premium ecommerce hero image for ${product}. Keep the product large, clear, and marketplace ready for ${language} buyers.`,
      promo: `Create a concise promotional banner for ${product}. Leave space for offer text and make the visual feel energetic but clean.`,
      features: `Show the top selling points of ${product} with simple callouts, clear hierarchy, and a polished ecommerce layout.`,
      lifestyle: `Place ${product} in a believable lifestyle scene. Make it aspirational, natural, and useful for social commerce.`,
      compare: `Create a simple comparison graphic showing why ${product} is better than common alternatives. Keep it readable and uncluttered.`,
      texture: `Create a close-up detail image for ${product}. Emphasize material, finish, texture, and craftsmanship.`,
      ugc: `Create an authentic buyer-style image for ${product}. Keep it casual, trustworthy, and social-media ready.`,
      trust: `Create a trust-building image for ${product}. Highlight warranty, safety, delivery, quality proof, or customer confidence.`
    },
    source: "demo"
  };
}

async function demoGenerate(body) {
  await wait(3500);
  return demoSvg();
}

async function generateWithKie(body) {
  const inputUrls = await uploadImagesToKie(body.images || []);
  const prompt = [
    `This is ${body.productName}.`,
    `Create a high-quality ecommerce promotional design.`,
    `Design requirement: ${body.prompt}`,
    `All visible text in the final design must use this target language: ${body.language || "English"}.`,
    body.typeId === "custom"
      ? "Follow the user's custom requirement directly without forcing a preset layout."
      : `Design type: ${body.type}.`
  ].join("\n");

  const created = await kieJson("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    body: {
      model: "gpt-image-2-image-to-image",
      input: {
        prompt,
        input_urls: inputUrls,
        aspect_ratio: body.aspectRatio || "1:1",
        resolution: body.resolution || "1K"
      }
    }
  });

  const taskId = created.data?.taskId;
  if (!taskId) throw new Error(created.msg || "KIE did not return taskId.");

  const result = await pollKieTask(taskId);
  const resultJson = JSON.parse(result.resultJson || "{}");
  const url = resultJson.resultUrls?.[0];
  if (!url) throw new Error("KIE task succeeded but returned no image URL.");
  return url;
}

async function uploadImagesToKie(images) {
  const urls = [];
  for (const [index, imageData] of images.slice(0, 4).entries()) {
    if (/^https?:\/\//.test(imageData)) {
      urls.push(imageData);
      continue;
    }
    const uploaded = await kieJson("https://kieai.redpandaai.co/api/file-base64-upload", {
      method: "POST",
      body: {
        base64Data: imageData,
        uploadPath: "images/lazy60",
        fileName: `lazy60-${Date.now()}-${index}.png`
      }
    });
    const url = uploaded.data?.downloadUrl || uploaded.data?.fileUrl;
    if (!url) throw new Error(uploaded.msg || "KIE file upload returned no URL.");
    urls.push(url);
  }
  return urls;
}

async function pollKieTask(taskId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    await wait(3000);
    const data = await kieJson(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      method: "GET"
    });
    const record = data.data;
    if (!record) throw new Error(data.msg || "KIE returned no task record.");
    if (record.state === "success") return record;
    if (record.state === "fail") throw new Error(record.failMsg || record.failCode || "KIE task failed.");
  }
  throw new Error("KIE task timed out after 3 minutes.");
}

async function kieJson(url, options) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Authorization": `Bearer ${process.env.KIE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  if (!response.ok || (data.code && data.code !== 200) || data.success === false) {
    throw new Error(data.msg || `KIE API error ${response.status}`);
  }
  return data;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON request body"));
      }
    });
    request.on("error", reject);
  });
}

function readRaw(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function verifyStripeWebhook(request, rawBody) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  const signature = request.headers["stripe-signature"];
  if (!signature) throw new Error("Missing Stripe signature");

  const parts = String(signature).split(",").reduce((acc, item) => {
    const [key, value] = item.split("=");
    if (!acc[key]) acc[key] = [];
    acc[key].push(value);
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw new Error("Invalid Stripe signature header");

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const verified = signatures.some((sig) => safeEqual(sig, expected));
  if (!verified) throw new Error("Invalid Stripe webhook signature");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Stripe webhook signature expired");

  return JSON.parse(rawBody.toString("utf8"));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function publicUser() {
  return {
    id: user.id,
    email: user.email,
    points: user.points,
    paid: user.paid,
    freeAvailable: !user.paid && user.freeUsedDate !== todayKey(),
    nextFreeRefresh: nextRefreshIso()
  };
}

function getStripePack(packId) {
  const packs = {
    starter: { id: "starter", name: "Starter Pack", dollars: 9, points: 90 },
    growth: { id: "growth", name: "Growth Pack", dollars: 29, points: 330 },
    pro: { id: "pro", name: "Pro Pack", dollars: 59, points: 740 }
  };
  return packs[packId] || null;
}

async function createStripeCheckoutSession(pack, request) {
  const origin = request.headers.origin || `http://${request.headers.host}`;
  const successUrl = `${origin}?checkout=success&pack=${encodeURIComponent(pack.id)}`;
  const cancelUrl = `${origin}?checkout=cancel`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", user.email);
  params.set("customer_email", user.email);
  params.set("metadata[pack]", pack.id);
  params.set("metadata[points]", String(pack.points));
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(pack.dollars * 100));
  params.set("line_items[0][price_data][product_data][name]", `${pack.name} - ${pack.points} Points`);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe error ${response.status}`);
  }
  return data;
}

async function ensureSupabaseUser() {
  const rows = await supabaseSelect("profiles", `email=eq.${encodeURIComponent(user.email)}`);
  if (rows[0]) {
    applyProfile(rows[0]);
    return rows[0];
  }

  const created = await supabaseInsert("profiles", {
    email: user.email,
    display_name: "LAZY60 Demo",
    points: user.points,
    paid: user.paid,
    free_used_date: user.freeUsedDate || null
  });
  applyProfile(created[0]);
  return created[0];
}

function applyProfile(profile) {
  if (!profile) return;
  user.id = profile.id;
  user.email = profile.email;
  user.points = profile.points || 0;
  user.paid = Boolean(profile.paid);
  user.freeUsedDate = profile.free_used_date || "";
}

async function saveSupabaseUser() {
  if (!supabaseReady) return;
  await supabasePatch("profiles", `id=eq.${user.id}`, {
    points: user.points,
    paid: user.paid,
    free_used_date: user.freeUsedDate || null,
    updated_at: new Date().toISOString()
  });
}

async function addPoints(points, metadata) {
  if (supabaseReady) await ensureSupabaseUser();
  if (metadata.stripeSessionId && await ledgerHasStripeSession(metadata.stripeSessionId)) {
    return;
  }
  user.points += points;
  if (points > 0 && metadata.type === "topup") user.paid = true;
  await writeLedger({ ...metadata, points });
  await saveSupabaseUser();
}

async function ledgerHasStripeSession(stripeSessionId) {
  if (!stripeSessionId) return false;
  if (user.ledger.some((entry) => entry.stripeSessionId === stripeSessionId)) return true;
  if (!supabaseReady) return false;
  const rows = await supabaseSelect(
    "point_ledger",
    `stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}`
  );
  return rows.length > 0;
}

async function writeLedger(entry) {
  user.ledger.push({ ...entry, at: Date.now() });
  if (!supabaseReady) return;
  await supabaseInsert("point_ledger", {
    user_id: user.id,
    type: entry.type,
    points: entry.points,
    job_id: isUuid(entry.jobId) ? entry.jobId : null,
    stripe_session_id: entry.stripeSessionId || null,
    metadata: entry
  });
}

async function createSupabaseJob(job) {
  await ensureSupabaseUser();
  const created = await supabaseInsert("generation_jobs", supabaseJobRow(job));
  if (!created[0]?.id) return job;
  return { ...job, id: created[0].id };
}

async function updateSupabaseJob(id, job) {
  if (!isUuid(id)) return;
  await supabasePatch("generation_jobs", `id=eq.${id}`, {
    status: job.status,
    progress: job.progress,
    output_image_url: job.image || null,
    failure_reason: job.failureReason || null,
    refunded: Boolean(job.refunded),
    updated_at: new Date().toISOString()
  });
}

async function listSupabaseJobs() {
  await ensureSupabaseUser();
  const rows = await supabaseSelect(
    "generation_jobs",
    `user_id=eq.${user.id}&order=created_at.desc&limit=30`
  );
  return rows.map(jobFromSupabaseRow);
}

function jobFromSupabaseRow(row) {
  return {
    id: row.id,
    status: row.status,
    progress: row.progress,
    productName: row.product_name,
    type: row.design_type_label,
    typeId: row.design_type_id,
    prompt: row.prompt,
    language: row.target_language,
    resolution: row.resolution,
    cost: row.cost,
    billingType: row.billing_type,
    watermark: row.watermark,
    refunded: row.refunded,
    source: row.source_images?.[0] || "",
    image: row.output_image_url || "",
    failureReason: row.failure_reason || "",
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    remote: true
  };
}

function supabaseJobRow(job) {
  return {
    user_id: user.id,
    status: job.status,
    progress: job.progress,
    product_name: job.productName,
    design_type_id: job.typeId || "unknown",
    design_type_label: job.type,
    prompt: job.prompt,
    target_language: job.language,
    resolution: job.resolution,
    cost: job.cost,
    billing_type: job.billingType,
    watermark: job.watermark,
    refunded: job.refunded,
    source_images: job.source ? [job.source] : [],
    output_image_url: job.image || null,
    failure_reason: job.failureReason || null
  };
}

async function supabaseSelect(table, query) {
  return supabaseRequest(`/rest/v1/${table}?${query}&select=*`, { method: "GET" });
}

async function supabaseInsert(table, row) {
  return supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: row
  });
}

async function supabasePatch(table, query, row) {
  return supabaseRequest(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: row
  });
}

async function supabaseRequest(pathname, options) {
  const response = await fetch(`${process.env.SUPABASE_URL}${pathname}`, {
    method: options.method,
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase error ${response.status}`);
  }
  return data;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function nextRefreshIso() {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function demoSvg() {
  return `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><rect width="900" height="900" fill="#f3f1ec"/><circle cx="450" cy="430" r="245" fill="#fffaf2"/><circle cx="450" cy="430" r="198" fill="#d7b381"/><circle cx="450" cy="430" r="154" fill="#111"/><rect x="610" y="344" width="190" height="100" rx="50" fill="#fffaf2"/></svg>')}`;
}

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
