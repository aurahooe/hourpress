const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const $ = (id) => document.getElementById(id);
let session = null;
function tick() {
  const now = new Date();
  $("clock-time").textContent = now.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  const ms = next - now;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  $("clock-left").textContent = `${m}m ${String(s).padStart(2, "0")}s until reprint`;
}
async function loadEdition() {
  const { data } = await sb.from("features").select("*").order("created_at", { ascending: false }).limit(24);
  const hours = data || [];
  const current = hours[0];
  if (current) {
    $("ed-kicker").textContent = current.kicker || current.hour_key;
    $("ed-title").textContent = current.title;
    $("ed-body").textContent = current.body;
  } else {
    $("ed-kicker").textContent = "This hour";
    $("ed-title").textContent = "The press is warming";
    $("ed-body").textContent = "The first edition will land on the hour.";
  }
  $("hours").innerHTML = hours.map((h) => `
    <article class="hour">
      <time>${h.hour_key}</time>
      <div>
        <h4>${escapeHtml(h.title)}</h4>
        <p>${escapeHtml(h.body)}</p>
      </div>
    </article>`).join("");
}
async function loadPublic() {
  const res = await sb.from("notes").select("id,title,body,created_at,user_id,is_public").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
  const notes = res.data || [];
  $("public-notes").innerHTML = notes.length ? notes.map(card).join("") : `<p class="muted">The floor is empty. Write something and mark it public.</p>`;
}
async function loadMine() {
  if (!session) {
    $("my-notes").innerHTML = `<p class="muted">Sign in to keep a desk.</p>`;
    return;
  }
  const { data } = await sb.from("notes").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
  $("my-notes").innerHTML = (data || []).map((n) => card(n, true)).join("") || `<p class="muted">No notes yet.</p>`;
}
function card(n, mine = false) {
  const when = new Date(n.created_at).toLocaleString();
  const actions = mine ? `<button type="button" class="ghost" data-toggle="${n.id}" data-public="${n.is_public}">${n.is_public ? "Pull from floor" : "Send to floor"}</button>
    <button type="button" class="ghost" data-del="${n.id}">Delete</button>` : "";
  return `<article class="card">
    <h4>${escapeHtml(n.title)}</h4>
    <p>${escapeHtml(n.body)}</p>
    <p class="meta">${when}${n.is_public ? " · public" : " · private"} ${actions}</p>
  </article>`;
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function show(id) {
  ["floor", "desk", "archive"].forEach((k) => $(k).classList.toggle("hidden", k !== id));
}
async function ensureProfile(user) {
  const handle = (user.email || "reader").split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 20) || "reader";
  await sb.from("profiles").upsert({ id: user.id, handle: handle + user.id.slice(0, 4), display_name: handle });
}
async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  $("auth-btn").textContent = session ? "Sign out" : "Sign in";
  if (session) await ensureProfile(session.user);
  await loadMine();
}
$("auth-btn").addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    session = null;
    $("auth-btn").textContent = "Sign in";
    await loadMine();
    return;
  }
  $("auth-modal").classList.remove("hidden");
});
$("auth-close").addEventListener("click", () => $("auth-modal").classList.add("hidden"));
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("auth-err").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: fd.get("email"), password: fd.get("password") });
  if (error) { $("auth-err").textContent = error.message; return; }
  $("auth-modal").classList.add("hidden");
  await refreshAuth();
});
$("signup-btn").addEventListener("click", async () => {
  const fd = new FormData($("auth-form"));
  $("auth-err").textContent = "";
  const { error } = await sb.auth.signUp({ email: fd.get("email"), password: fd.get("password") });
  if (error) { $("auth-err").textContent = error.message; return; }
  $("auth-err").textContent = "Account created. If confirm-email is on, check your inbox; otherwise sign in now.";
});
$("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) { $("auth-modal").classList.remove("hidden"); return; }
  const fd = new FormData(e.target);
  const { error } = await sb.from("notes").insert({
    user_id: session.user.id,
    title: fd.get("title"),
    body: fd.get("body"),
    is_public: fd.get("is_public") === "on",
  });
  if (error) { alert(error.message); return; }
  e.target.reset();
  await loadMine();
  await loadPublic();
});
document.addEventListener("click", async (e) => {
  const go = e.target.closest("[data-go]");
  if (go) show(go.dataset.go);
  const tog = e.target.closest("[data-toggle]");
  if (tog && session) {
    await sb.from("notes").update({ is_public: tog.dataset.public !== "true" }).eq("id", tog.dataset.toggle);
    await loadMine();
    await loadPublic();
  }
  const del = e.target.closest("[data-del]");
  if (del && session) {
    await sb.from("notes").delete().eq("id", del.dataset.del);
    await loadMine();
    await loadPublic();
  }
});
sb.auth.onAuthStateChange(() => refreshAuth());
tick();
setInterval(tick, 1000);
loadEdition();
loadPublic();
refreshAuth();
