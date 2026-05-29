const DESIGN_TYPES = [
  ["hero", "Hero Product Image", "Create a clean, premium ecommerce hero image. Keep the product dominant, use studio lighting, strong readable composition, and a polished marketplace-ready layout."],
  ["promo", "Promo Banner", "Create a wide promotional banner with clear negative space for offer text, energetic commercial styling, and strong conversion-focused hierarchy."],
  ["features", "Feature Highlights", "Create a product feature graphic that highlights the most important selling points with simple callouts, neat spacing, and a professional ecommerce look."],
  ["lifestyle", "Lifestyle Scene", "Place the product in a believable lifestyle scene for the target customer. Make the image feel aspirational, natural, and useful for social commerce."],
  ["compare", "Comparison", "Create a clean comparison graphic that shows why this product is better than common alternatives. Use clear sections and avoid clutter."],
  ["texture", "Texture Detail", "Create a close-up detail image emphasizing material, finish, texture, and craftsmanship. Use macro lighting and a premium product photography style."],
  ["ugc", "UGC Style", "Create a realistic buyer-style product photo that feels authentic, casual, and social-media ready while still looking clean and trustworthy."],
  ["trust", "Trust Badge", "Create a trust-building ecommerce graphic with warranty, safety, delivery, or quality proof elements. Keep it clean, credible, and easy to scan."],
  ["custom", "Custom", ""]
];

const LANGUAGES = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Dutch", "Japanese", "Korean", "Simplified Chinese", "Traditional Chinese", "Thai", "Vietnamese", "Indonesian", "Arabic"];
const COSTS = { "1K": 2, "2K": 3, "4K": 5 };
const PACKS = [
  ["starter", "Starter", 9, 90, "", "45 basic 1K images"],
  ["growth", "Growth", 29, 330, "+15% Bonus", "Includes 40 bonus points"],
  ["pro", "Pro", 59, 740, "+25% Bonus", "Includes 150 bonus points"]
];

const state = {
  route: "app",
  adminTab: "Design Types",
  loggedIn: false,
  email: "hi@lazy60.com",
  authToken: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  stripeEnabled: false,
  points: 0,
  paid: false,
  freeAvailable: true,
  uploads: [],
  productName: "",
  language: "English",
  typeId: "hero",
  requirements: DESIGN_TYPES[0][2],
  resolution: "1K",
  jobs: [],
  modal: null,
  selected: null,
  compareOpen: false,
  waitlistOpen: false,
  apiOnline: false
};

const demoEmail = new URLSearchParams(window.location.search).get("email");
if (demoEmail) state.email = demoEmail.trim().toLowerCase();

function image(kind = "generated") {
  const palettes = {
    coffee: ["#f5ede2", "#af7a4d", "#2b1c17", "#fffaf2"],
    latte: ["#eef0e8", "#6f8b67", "#d8a160", "#1d2320"],
    serum: ["#f7f4ef", "#d9c0a5", "#9d7357", "#ffffff"],
    generated: ["#f3f1ec", "#111111", "#d7b381", "#ffffff"],
    before: ["#e7e4dc", "#8f8371", "#4b3a2f", "#ffffff"]
  };
  const [bg, accent, dark, light] = palettes[kind] || palettes.generated;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><rect width="900" height="900" fill="${bg}"/><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3"/><feComponentTransfer><feFuncA type="table" tableValues="0 .16"/></feComponentTransfer></filter><rect width="900" height="900" filter="url(#n)"/><circle cx="450" cy="430" r="245" fill="${light}"/><circle cx="450" cy="430" r="198" fill="${accent}"/><circle cx="450" cy="430" r="154" fill="${dark}" opacity=".92"/><circle cx="342" cy="320" r="86" fill="${light}" opacity=".45"/><rect x="610" y="344" width="190" height="100" rx="50" fill="${light}"/></svg>`)}`;
}

function render() {
  document.getElementById("root").innerHTML = `
    <header class="topbar">
      <button class="brand" data-action="route" data-route="app">LAZY60</button>
      <nav class="topnav">
        <button class="${state.route === "app" ? "active-link" : ""}" data-action="route" data-route="app">Generator</button>
        <button class="${state.route === "admin" ? "active-link" : ""}" data-action="route" data-route="admin">Admin</button>
      </nav>
      <div class="auth">${authHtml()}</div>
    </header>
    ${state.route === "app" ? appHtml() : adminHtml()}
    ${modalHtml()}
    <input id="file-picker" type="file" accept="image/*" multiple hidden />
  `;
  bind();
  checkApiOnce();
}

function authHtml() {
  if (!state.loggedIn) return `<button class="black" data-action="login">G Sign in with Google</button>`;
  return `<div class="user-chip">${esc(state.email)}</div><div class="points">${state.points} Points</div><button class="black small" data-action="topup">+ Top-up</button>`;
}

function appHtml() {
  return `<main class="shell">
    <aside class="founder">
      <h2>Founder Service</h2>
      <div class="avatar">Maker</div>
      <p>AI did not nail it? Let the founder design for you directly.</p>
      <ul><li>Image detail edits</li><li>Ad layouts and social covers</li><li>Portfolio-backed ecommerce design</li></ul>
      <div class="contact-row"><button><span class="icon whatsapp-icon"></span>WhatsApp</button><button><span class="icon messenger-icon"></span>Messenger</button></div>
      <button class="portfolio">[ View My Portfolio -> ]</button>
      <a class="email" href="mailto:hi@lazy60.com">hi@lazy60.com</a>
      <span class="copyright">&copy; LAZY60 STUDIO</span>
    </aside>
    <section class="workspace">
      ${title("1", "Upload Product Images")}
      <div class="upload-row">${uploadHtml()}</div>
      <div class="form-grid">
        <label>${title("2", "Product Description", true)}<input id="product" value="${esc(state.productName)}" placeholder="A 900ml large coffee cup" /></label>
        <label>${title("", "Target Output Language", true)}<div class="select-wrap"><select id="language">${LANGUAGES.map((l) => `<option ${l === state.language ? "selected" : ""}>${l}</option>`).join("")}</select><span>v</span></div></label>
      </div>
      ${title("3", "Design Config")}
      <div class="type-grid">${DESIGN_TYPES.map(([id, label]) => `<button class="type ${id === state.typeId ? "active" : ""}" data-action="type" data-id="${id}">${id === state.typeId ? '<span class="dot"></span>' : ""}${label}</button>`).join("")}</div>
      <div class="prompt-box"><textarea id="requirements" placeholder="Describe the design you want, or use AI Auto Fill for preset types...">${esc(state.requirements)}</textarea><button class="black autofill" data-action="autofill">* AI Auto Fill</button></div>
      <div class="generator-footer">
        <div class="res-row"><span>RES:</span>${["1K", "2K", "4K"].map((r) => resButton(r)).join("")}</div>
        ${state.loggedIn && !state.paid ? `<p class="refresh">Free credit refreshes in ${refresh()}</p>` : ""}
        <button class="black generate" data-action="generate">${generateLabel()}</button>
      </div>
    </section>
    <aside class="results">${resultsHtml()}</aside>
  </main>`;
}

function uploadHtml() {
  const tiles = state.uploads.map((u, i) => `<div class="upload-tile filled"><img src="${u.url}" alt="" /><button class="remove" data-action="remove-upload" data-id="${u.id}">x</button><span>${i === 0 ? "Main" : `Ref ${i}`}</span></div>`);
  if (state.uploads.length < 4) tiles.push(`<button class="upload-tile" data-action="upload"><span class="upload-icon">+</span><span>${state.uploads.length === 0 ? "Upload Main Product" : `Add Detail Ref ${state.uploads.length}`}</span></button>`);
  return tiles.join("");
}

function uploadsForApi() {
  return state.uploads.map((upload) => upload.dataUrl).filter(Boolean);
}

function resultsHtml() {
  const showcase = [
    { id: "s1", title: "Coffee Cup", type: "Hero Product Image", image: image("coffee"), prompt: "Premium overhead ecommerce hero image for a ceramic coffee cup on a warm wooden table." },
    { id: "s2", title: "Jewelry", type: "Promo Banner", image: image("latte"), prompt: "Soft lifestyle banner with greenery, gentle daylight, and clean text space." },
    { id: "s3", title: "Skin Serum", type: "Texture Detail", image: image("serum"), prompt: "Macro skincare texture image with premium reflections and minimal luxury layout." }
  ];
  const items = state.loggedIn ? state.jobs : showcase;
  return `<div class="result-head"><h2>${state.loggedIn ? "Your Generations" : "Community Showcase"}</h2><p>${state.loggedIn ? "Async status and history" : "Log in to view your own logs"}</p></div>
  ${items.length ? items.map(cardHtml).join("") : `<div class="empty">Your generations will appear here.</div>`}`;
}

function cardHtml(item) {
  if (item.status === "processing") return `<article class="result-card"><div class="processing"><strong>Generating...</strong><div class="bar"><span style="width:${item.progress}%"></span></div></div><p>${esc(item.productName)} &middot; ${item.type}</p></article>`;
  if (item.status === "failed") return `<article class="result-card"><div class="failed"><strong>Task failed</strong><p>${item.failureReason}</p><button data-action="refund" data-id="${item.id}">Refund points</button></div><p>${esc(item.productName)} &middot; ${item.type}</p></article>`;
  return `<article class="result-card"><button class="image-button" data-action="open" data-id="${item.id}"><img src="${item.image}" alt="" /></button><p>${esc(item.title || item.productName)} &middot; ${item.type}</p></article>`;
}

function adminHtml() {
  const tabs = ["Design Types", "Prompt Presets", "API Generation Logs", "Featured Showcase", "User Orders"];
  return `<main class="admin">
    <aside class="admin-side"><h2>Data Management</h2>${tabs.map((x) => `<button class="${state.adminTab === x ? "selected" : ""}" data-action="admin-tab" data-tab="${x}">${state.adminTab === x ? '<span class="dot"></span>' : ""} ${x}</button>`).join("")}</aside>
    <section class="admin-main">
      ${adminContent()}
    </section>
  </main>`;
}

function adminContent() {
  if (state.adminTab === "Design Types") {
    return `<div class="admin-top"><div><h1>Config / Design Types</h1><p>Manage the button options shown under Design Config.</p></div><button class="black">+ Add New Type</button></div>
    <table><thead><tr><th>Sort</th><th>Type Name</th><th>System Preset Prompt</th><th>Actions</th></tr></thead><tbody>${DESIGN_TYPES.map(([id, label, prompt], i) => `<tr><td>${i + 1}</td><td>${label}</td><td>${id === "custom" ? "Uses clean preset02 and only follows the user's custom requirement." : prompt}</td><td><button class="link">[ Edit ]</button><button class="danger">[ Delete ]</button></td></tr>`).join("")}</tbody></table>`;
  }

  if (state.adminTab === "Prompt Presets") {
    return `<div class="admin-top"><div><h1>Prompt Presets</h1><p>Edit the text sent to autofill and image generation models.</p></div><button class="black">+ Add Preset</button></div>
    <table><thead><tr><th>Name</th><th>Use Case</th><th>Prompt</th><th>Actions</th></tr></thead><tbody>
      <tr><td>preset01</td><td>Preset design types</td><td>Product + design type + target output language + user requirement.</td><td><button class="link">[ Edit ]</button></td></tr>
      <tr><td>preset02</td><td>Custom</td><td>Clean prompt that follows the user's custom requirement without forcing a preset layout.</td><td><button class="link">[ Edit ]</button></td></tr>
      <tr><td>autofill</td><td>Requirement suggestions</td><td>Returns mapped JSON for hero, promo, features, lifestyle, compare, texture, ugc, trust.</td><td><button class="link">[ Edit ]</button></td></tr>
    </tbody></table>`;
  }

  if (state.adminTab === "API Generation Logs") {
    return `<div class="admin-top"><div><h1>API Generation Logs</h1><p>Failed, refunded, and successful jobs appear here.</p></div></div>
    <table><thead><tr><th>Status</th><th>User</th><th>Resolution</th><th>Cost</th><th>Prompt</th></tr></thead><tbody>${state.jobs.length ? state.jobs.map((j) => `<tr class="${j.status === "failed" ? "warn" : ""}"><td>${j.status}</td><td>${esc(state.email)}</td><td>${j.resolution}</td><td>${j.cost} pts</td><td>${esc(j.prompt)}</td></tr>`).join("") : `<tr><td colspan="5">No generation jobs yet. Failed and refunded jobs will be highlighted here.</td></tr>`}</tbody></table>`;
  }

  if (state.adminTab === "Featured Showcase") {
    return `<div class="admin-top"><div><h1>Featured Showcase</h1><p>Cold-start examples and curated user generations.</p></div><button class="black">+ Add Example</button></div>
    <table><thead><tr><th>Title</th><th>Type</th><th>Source</th><th>Actions</th></tr></thead><tbody>
      <tr><td>Coffee Cup</td><td>Hero Product Image</td><td>Manual seed</td><td><button class="link">[ Edit ]</button></td></tr>
      <tr><td>Jewelry</td><td>Promo Banner</td><td>Manual seed</td><td><button class="link">[ Edit ]</button></td></tr>
      <tr><td>Skin Serum</td><td>Texture Detail</td><td>Manual seed</td><td><button class="link">[ Edit ]</button></td></tr>
    </tbody></table>`;
  }

  return `<div class="admin-top"><div><h1>User Orders</h1><p>Stripe sessions, point top-ups, and ledger events will be listed here.</p></div></div>
  <table><thead><tr><th>User</th><th>Pack</th><th>Points</th><th>Status</th></tr></thead><tbody><tr><td>hi@lazy60.com</td><td>Growth Pack</td><td>330</td><td>Mock checkout</td></tr></tbody></table>`;
}

function modalHtml() {
  if (state.modal === "topup") {
    return `<div class="overlay"><div class="modal topup"><button class="close" data-action="close">[ X ]</button><h2>Top-up Points</h2><p>Pay as you go. No subscriptions. Points never expire.</p><div class="packs">${PACKS.map(([id, name, dollars, points, bonus, note]) => `<article class="pack ${name === "Growth" ? "primary" : ""}">${bonus ? `<div class="bonus">${bonus}</div>` : ""}<h3>${name}</h3><strong>${points}<span> Pts</span></strong><p>${note}</p><small>1K Base: $${(dollars / (points / 2)).toFixed(2)}/img</small><small>2K HD: $${(dollars / (points / 3)).toFixed(2)}/img</small><b>$${dollars}</b><button class="${name === "Growth" ? "black" : ""}" data-action="buy" data-pack="${id}" data-points="${points}">Purchase - $${dollars}</button></article>`).join("")}</div><div class="checkout">Safe checkout <span>stripe</span><span>VISA</span><span>Mastercard</span><span>AmEx</span></div></div></div>`;
  }
  if (state.modal === "snapshot" && state.selected) {
    const j = state.selected;
    return `<div class="overlay"><div class="modal snapshot"><section class="preview"><img src="${j.image}" alt="" /></section><aside class="snapshot-info"><button class="close" data-action="close">[ X ]</button><h2>Design Snapshot</h2><div class="meta"><img src="${j.source || image("before")}" alt="" /><span>${j.type}</span><span>${j.resolution || "1024x1024"}</span></div><div class="prompt-read"><strong>Design Prompt:</strong><p>${esc(j.prompt)}</p></div><button class="soon" data-action="waitlist">[ Keep Style & Generate Series ]<small>[ coming soon ]</small></button><div class="action-row"><button class="black">[ Download ]</button><button data-action="compare">[ Compare ]</button></div></aside></div></div>${state.compareOpen ? compareHtml() : ""}${state.waitlistOpen ? waitlistHtml() : ""}`;
  }
  return "";
}

function compareHtml() {
  return `<div class="overlay compare-layer"><div class="modal compare-modal"><button class="close" data-action="close-compare">[ X ]</button><h2>Before / After</h2><div class="compare-grid"><div><span>Before</span><img src="${state.selected.source || image("before")}" /></div><div><span>After</span><img src="${state.selected.image}" /></div></div></div></div>`;
}

function waitlistHtml() {
  return `<div class="overlay waitlist-layer"><div class="modal waitlist"><button class="close" data-action="close-waitlist">[ X ]</button><h2>Keep Style Series</h2><p>Join the waiting list to get early access when consistent series generation is ready.</p><input placeholder="you@example.com" /><button class="black" data-action="close-waitlist">Join Waiting List</button></div></div>`;
}

function bind() {
  document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", handle));
  const product = document.getElementById("product");
  if (product) product.addEventListener("input", (e) => (state.productName = e.target.value));
  const language = document.getElementById("language");
  if (language) language.addEventListener("change", (e) => (state.language = e.target.value));
  const req = document.getElementById("requirements");
  if (req) req.addEventListener("input", (e) => (state.requirements = e.target.value));
  const picker = document.getElementById("file-picker");
  picker.addEventListener("change", async (e) => {
    const files = [...e.target.files].slice(0, 4 - state.uploads.length);
    const uploads = await Promise.all(files.map(async (file, i) => ({
      id: `${Date.now()}-${i}`,
      url: URL.createObjectURL(file),
      dataUrl: await readFileAsDataUrl(file),
      name: file.name
    })));
    state.uploads.push(...uploads);
    render();
  });
}

async function handle(e) {
  const a = e.currentTarget.dataset.action;
  if (a === "route") state.route = e.currentTarget.dataset.route;
  if (a === "admin-tab") state.adminTab = e.currentTarget.dataset.tab;
  if (a === "login") await login();
  if (a === "topup") state.modal = "topup";
  if (a === "close") {
    state.modal = null;
    state.compareOpen = false;
    state.waitlistOpen = false;
  }
  if (a === "close-compare") state.compareOpen = false;
  if (a === "close-waitlist") state.waitlistOpen = false;
  if (a === "upload") document.getElementById("file-picker").click();
  if (a === "remove-upload") state.uploads = state.uploads.filter((u) => u.id !== e.currentTarget.dataset.id);
  if (a === "type") {
    state.typeId = e.currentTarget.dataset.id;
    const type = DESIGN_TYPES.find(([id]) => id === state.typeId);
    state.requirements = state.typeId === "custom" ? "" : type[2];
  }
  if (a === "res") {
    const next = e.currentTarget.dataset.res;
    if (!state.paid && next !== "1K") {
      state.modal = "topup";
      toast("Top up points to unlock HD and Ultra HD generations.");
    } else {
      state.resolution = next;
    }
  }
  if (a === "autofill") autofill();
  if (a === "generate") generate();
  if (a === "buy") {
    await startCheckout(e.currentTarget.dataset.pack, Number(e.currentTarget.dataset.points));
  }
  if (a === "open") {
    state.selected = findItem(e.currentTarget.dataset.id);
    state.modal = "snapshot";
  }
  if (a === "compare") state.compareOpen = true;
  if (a === "waitlist") state.waitlistOpen = true;
  if (a === "refund") refund(e.currentTarget.dataset.id);
  render();
}

async function autofill() {
  if (!state.uploads.length || !state.productName.trim()) return toast("Upload at least one product image and enter a product name first.");
  if (state.typeId === "custom") return toast("Auto Fill is available for preset design types.");
  try {
    const data = await apiPost("/api/autofill", {
      productName: state.productName,
      language: state.language,
      images: uploadsForApi()
    });
    const selected = data.requirements?.[state.typeId];
    if (!selected) throw new Error("Autofill did not return this design type.");
    state.requirements = selected;
    toast(`AI Auto Fill ready (${data.source}).`);
    render();
  } catch (error) {
    const type = DESIGN_TYPES.find(([id]) => id === state.typeId);
    state.requirements = `${type[2]} Focus on ${state.productName.trim()} and make the message concise for ${state.language} buyers.`;
    toast(`Local fallback used: ${error.message}`);
    render();
  }
}

async function generate() {
  if (!state.loggedIn) return toast("Sign in with Google to get 1 free 1K image every day.");
  if (!state.uploads.length || !state.productName.trim() || !state.requirements.trim()) return toast("Add a product image, product name, and design requirement before generating.");
  const cost = COSTS[state.resolution];
  const free = !state.paid && state.resolution === "1K" && state.freeAvailable;
  if (!free && state.points < cost) {
    state.modal = "topup";
    return toast("Add points to unlock this resolution without watermark.");
  }
  const type = DESIGN_TYPES.find(([id]) => id === state.typeId);
  const draft = {
    productName: state.productName,
    type: type[1],
    typeId: state.typeId,
    prompt: state.requirements,
    language: state.language,
    resolution: state.resolution,
    images: uploadsForApi()
  };

  try {
    const data = await apiPost("/api/generate", draft);
    const job = normalizeApiJob(data.job, state.uploads[0].url);
    applyUser(data.job.user);
    state.jobs.unshift(job);
    pollJob(job.id);
    toast(job.cost === 0 ? "Free 1K generation started for today." : `${job.cost} points deducted. Generation started.`);
  } catch (error) {
    if (String(error.message).includes("Not enough points")) {
      state.modal = "topup";
      toast(error.message);
      render();
      return;
    }
    const fallbackCost = free ? 0 : cost;
    if (!free) state.points -= cost;
    state.jobs.unshift({ id: `job-${Date.now()}`, ...draft, cost: fallbackCost, watermark: free, source: state.uploads[0].url, status: "processing", progress: 1, createdAt: Date.now(), image: image("generated") });
    toast(`Local fallback generation started: ${error.message}`);
  }
  render();
}

async function refund(id) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job || job.status === "refunded") return;
  try {
    const data = await apiPost(`/api/jobs/${id}/refund`, {});
    applyUser(data.user);
    updateLocalJob(id, data.job);
    toast("Points returned. The failed task is still visible in API Generation Logs.");
  } catch (error) {
    state.points += job.cost || 0;
    job.status = "refunded";
    toast(`Local refund applied: ${error.message}`);
    render();
  }
}

function findItem(id) {
  const showcase = [
    { id: "s1", productName: "Coffee Cup", type: "Hero Product Image", image: image("coffee"), source: image("before"), prompt: "Premium overhead ecommerce hero image for a ceramic coffee cup on a warm wooden table.", resolution: "1024x1024", watermark: false },
    { id: "s2", productName: "Jewelry", type: "Promo Banner", image: image("latte"), source: image("before"), prompt: "Soft lifestyle banner with greenery, gentle daylight, and clean text space.", resolution: "1024x1024", watermark: false },
    { id: "s3", productName: "Skin Serum", type: "Texture Detail", image: image("serum"), source: image("before"), prompt: "Macro skincare texture image with premium reflections and minimal luxury layout.", resolution: "1024x1024", watermark: false }
  ];
  return state.jobs.find((j) => j.id === id) || showcase.find((s) => s.id === id);
}

async function pollJob(id) {
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    if (Date.now() - startedAt > 180000) {
      clearInterval(timer);
      updateLocalJob(id, { status: "failed", failureReason: "Timed out after 3 minutes.", progress: 100 });
      return;
    }

    try {
      const data = await apiGet(`/api/jobs/${id}`);
      updateLocalJob(id, normalizeApiJob(data.job));
      if (["succeeded", "failed", "refunded"].includes(data.job.status)) clearInterval(timer);
    } catch (error) {
      clearInterval(timer);
      updateLocalJob(id, { status: "failed", failureReason: error.message, progress: 100 });
    }
  }, 2500);
}

function updateLocalJob(id, patch) {
  state.jobs = state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
  render();
}

function normalizeApiJob(job, fallbackSource = "") {
  return {
    ...job,
    remote: true,
    source: fallbackSource || job.source || "",
    image: job.image || "",
    progress: job.progress || 1
  };
}

async function login() {
  if (!state.supabaseUrl || !state.supabaseAnonKey) await checkApiOnce();
  if (state.supabaseUrl && state.supabaseAnonKey) {
    const redirectTo = window.location.origin + window.location.pathname;
    const authUrl = `${state.supabaseUrl}/auth/v1/authorize?provider=google&flow_type=implicit&redirect_to=${encodeURIComponent(redirectTo)}`;
    window.location.href = authUrl;
    return;
  }
  state.loggedIn = true;
  try {
    const data = await apiGet("/api/me");
    applyUser(data.user);
    await loadJobs();
  } catch {
    state.points = 0;
    state.paid = false;
  }
}

async function loadJobs() {
  const data = await apiGet("/api/jobs");
  state.jobs = (data.jobs || []).map((job) => normalizeApiJob(job));
}

async function topup(points) {
  try {
    const data = await apiPost("/api/topup", { points, pack: `${points}_points` });
    applyUser(data.user);
    state.modal = null;
    toast("Points added. Stripe Checkout will replace this mock action.");
  } catch (error) {
    state.points += points;
    state.paid = true;
    state.modal = null;
    toast(`Local points added: ${error.message}`);
  }
}

async function startCheckout(pack, points) {
  try {
    localStorage.setItem("lazy60_checkout_email", state.email);
    const data = await apiPost("/api/stripe/create-checkout-session", { pack });
    if (data.mode === "stripe" && data.url) {
      window.location.href = data.url;
      return;
    }
    await topup(points);
  } catch (error) {
    toast(`Stripe unavailable, using local top-up: ${error.message}`);
    await topup(points);
  }
}

function applyUser(user) {
  if (!user) return;
  state.points = user.points;
  state.paid = user.paid;
  state.freeAvailable = user.freeAvailable;
}

setInterval(() => {
  let changed = false;
  state.jobs.forEach((job) => {
    if (job.remote || job.status !== "processing") return;
    const elapsed = Date.now() - job.createdAt;
    if (elapsed > 180000) {
      job.status = "failed";
      job.failureReason = "Timed out after 3 minutes.";
    } else if (elapsed > 9000) {
      job.status = "succeeded";
      job.progress = 100;
    } else {
      job.progress = Math.min(95, Math.round(elapsed / 90));
    }
    changed = true;
  });
  if (changed) render();
}, 1000);

async function checkApiOnce() {
  if (state.apiOnline) return;
  try {
    const data = await apiGet("/api/health");
    state.apiOnline = true;
    state.supabaseUrl = data.supabaseUrl || "";
    state.supabaseAnonKey = data.supabaseAnonKey || "";
    state.stripeEnabled = Boolean(data.stripe);
    await restoreSupabaseSession();
    await handleCheckoutReturn();
  } catch {
    state.apiOnline = false;
  }
}

async function handleCheckoutReturn() {
  const query = new URLSearchParams(window.location.search);
  if (query.get("checkout") !== "success") return;
  const checkoutEmail = localStorage.getItem("lazy60_checkout_email");
  if (checkoutEmail) {
    state.email = checkoutEmail;
    state.loggedIn = true;
  }
  if (!state.loggedIn) {
    toast("Checkout returned. Please sign in again to add points.");
    return;
  }
  const pack = query.get("pack");
  const found = PACKS.find(([id]) => id === pack);
  if (found) {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      await topup(found[3]);
      toast("Checkout success. Points added in development mode.");
    } else {
      const data = await apiGet("/api/me");
      applyUser(data.user);
      toast("Checkout success. Points will update after Stripe confirms payment.");
    }
    await loadJobs();
  }
  localStorage.removeItem("lazy60_checkout_email");
  window.history.replaceState({}, document.title, window.location.pathname);
  render();
}

async function restoreSupabaseSession() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const code = query.get("code");

  if (accessToken) {
    state.authToken = accessToken;
    if (refreshToken) localStorage.setItem("lazy60_refresh_token", refreshToken);
    window.history.replaceState({}, document.title, window.location.pathname);
    await loadSupabaseUser(accessToken);
    return;
  }

  if (code) {
    await exchangeCodeForSession(code);
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  const savedToken = localStorage.getItem("lazy60_access_token");
  if (savedToken) {
    state.authToken = savedToken;
    await loadSupabaseUser(savedToken);
  }
}

async function exchangeCodeForSession(code) {
  const response = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": state.supabaseAnonKey
    },
    body: JSON.stringify({ auth_code: code })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || "Could not exchange auth code.");
  if (data.access_token) {
    state.authToken = data.access_token;
    localStorage.setItem("lazy60_access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("lazy60_refresh_token", data.refresh_token);
    await loadSupabaseUser(data.access_token);
  }
}

async function loadSupabaseUser(token) {
  const response = await fetch(`${state.supabaseUrl}/auth/v1/user`, {
    headers: {
      "apikey": state.supabaseAnonKey,
      "Authorization": `Bearer ${token}`
    }
  });
  const data = await response.json();
  if (!response.ok || !data.email) {
    localStorage.removeItem("lazy60_access_token");
    return;
  }
  state.loggedIn = true;
  state.email = data.email.toLowerCase();
  localStorage.setItem("lazy60_access_token", token);
  const me = await apiGet("/api/me");
  applyUser(me.user);
  await loadJobs();
  render();
}

async function apiGet(path) {
  const response = await fetch(path, { headers: apiHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed ${response.status}`);
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed ${response.status}`);
  return data;
}

function apiHeaders(extra = {}) {
  return {
    "Accept": "application/json",
    "X-Demo-User-Email": state.email,
    ...(state.authToken ? { "Authorization": `Bearer ${state.authToken}` } : {}),
    ...extra
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function title(step, text, compact = false) {
  return `<div class="section-title ${compact ? "compact" : ""}">${step ? `<span>${step} /</span>` : ""}<h2>${text}</h2></div>`;
}

function resButton(r) {
  const locked = !state.paid && r !== "1K";
  const label = r === "1K" && !state.paid && state.freeAvailable ? "1K Free" : r;
  return `<button class="res-option ${state.resolution === r ? "active" : ""} ${locked ? "locked" : ""}" data-action="res" data-res="${r}">${label}${locked ? '<span class="lock">lock</span>' : ""}</button>`;
}

function generateLabel() {
  if (!state.loggedIn) return "Sign in with Google - 1 free 1K image every day";
  if (!state.paid && state.freeAvailable && state.resolution === "1K") return "Generate 1K Image - Free Today";
  return `Generate ${state.resolution} Image - ${COSTS[state.resolution]} Points`;
}

function refresh() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  const diff = next - now;
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
