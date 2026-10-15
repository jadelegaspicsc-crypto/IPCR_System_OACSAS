const CFG = window.IPCR_CONFIG || {};
const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("YOUR-PROJECT")
  && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes("YOUR_ANON");

const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const state = {
  session: null,
  profile: null,
  currentIpcr: null,
  items: [],
  page: "dashboard"
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

function toast(message, type="info") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  el.hidden = false;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.hidden = true, 3500);
}

function esc(v="") {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function moneyOrNumber(v) {
  return v == null || v === "" ? "—" : Number(v).toFixed(3);
}

function statusBadge(s) {
  const label = String(s || "Draft").replaceAll("_"," ");
  return `<span class="status ${esc(s || "draft")}">${esc(label)}</span>`;
}

function roleLabel(r) {
  return ({employee:"Employee", supervisor:"Supervisor", head:"Head of Office", admin:"Administrator"}[r] || r || "Employee");
}

async function init() {
  if (!configured) $("#configWarning").hidden = false;
  $("#loginForm").addEventListener("submit", login);
  $("#forgotPassword").addEventListener("click", forgotPassword);
  $("#logoutBtn").addEventListener("click", logout);
  $("#closeDialog").addEventListener("click", () => $("#ipcrDialog").close());
  $("#saveDraftBtn").addEventListener("click", () => saveIpcr("draft"));
  $("#submitBtn").addEventListener("click", () => saveIpcr("for_review"));
  $("#addItemBtn").addEventListener("click", () => addItem());
  $$(".nav").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.page)));

  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (session) await startApp(session);
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await startApp(session);
    else showAuth();
  });
}

function showAuth() {
  $("#authView").hidden = false;
  $("#appView").hidden = true;
}

async function startApp(session) {
  state.session = session;
  const { data: profile, error } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) {
    toast("Your account exists, but its profile could not be loaded. Run supabase.sql first.", "error");
    return;
  }
  state.profile = profile;
  $("#authView").hidden = true;
  $("#appView").hidden = false;
  $("#userBadge").textContent = `${profile.full_name || session.user.email} · ${roleLabel(profile.role)}`;
  const elevated = ["supervisor","head","admin"].includes(profile.role);
  $("#teamNav").hidden = !elevated;
  $("#usersNav").hidden = profile.role !== "admin";
  await navigate("dashboard");
}

async function login(e) {
  e.preventDefault();
  if (!sb) return toast("Configure config.js before signing in.", "error");
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) toast(error.message, "error");
}

async function forgotPassword() {
  if (!sb) return toast("Configure config.js first.", "error");
  const email = $("#loginEmail").value.trim();
  if (!email) return toast("Enter your email address first.", "error");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) toast(error.message, "error");
  else toast("Password reset instructions were sent if the account exists.", "success");
}

async function logout() {
  if (sb) await sb.auth.signOut();
  showAuth();
}

async function navigate(page) {
  state.page = page;
  $$(".page").forEach(p => p.hidden = true);
  $$(".nav").forEach(n => n.classList.toggle("active", n.dataset.page === page));
  $(`#page-${page}`).hidden = false;

  if (page === "dashboard") await renderDashboard();
  if (page === "ipcr") await renderMyIpcr();
  if (page === "team") await renderTeam();
  if (page === "users") await renderUsers();
}

async function renderDashboard() {
  const el = $("#page-dashboard");
  const { data: ipcrs, error } = await sb.from("ipcrs")
    .select("id,year,period,status,total_rating,created_at,updated_at")
    .eq("user_id", state.profile.id)
    .order("year", {ascending:false})
    .order("period");
  if (error) return el.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;

  const counts = {draft:0, for_review:0, for_approval:0, approved:0, returned:0};
  (ipcrs || []).forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);

  el.innerHTML = `
    <div class="page-title"><div><h2>Dashboard</h2><p>Welcome, ${esc(state.profile.full_name || "")}.</p></div>
      <button class="primary" onclick="openNewIpcr()">+ New IPCR</button>
    </div>
    <div class="stats">
      <div><span>Drafts</span><strong>${counts.draft || 0}</strong></div>
      <div><span>For Review</span><strong>${counts.for_review || 0}</strong></div>
      <div><span>For Approval</span><strong>${counts.for_approval || 0}</strong></div>
      <div><span>Approved</span><strong>${counts.approved || 0}</strong></div>
    </div>
    <div class="card">
      <div class="section-head"><h3>My IPCRs</h3><button class="secondary" onclick="navigate('ipcr')">Open My IPCR</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Year</th><th>Period</th><th>Status</th><th>Final Rating</th><th>Action</th></tr></thead>
        <tbody>${(ipcrs||[]).map(x => `<tr>
          <td>${x.year}</td><td>${esc(x.period)}</td><td>${statusBadge(x.status)}</td>
          <td>${x.total_rating == null ? "—" : Number(x.total_rating).toFixed(3)}</td>
          <td><button class="link-button" onclick="editIpcr('${x.id}')">Open</button></td>
        </tr>`).join("") || `<tr><td colspan="5" class="muted center">No IPCR records yet.</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
}

async function renderMyIpcr() {
  const el = $("#page-ipcr");
  const { data, error } = await sb.from("ipcrs")
    .select("id,year,period,status,total_rating,created_at,updated_at")
    .eq("user_id", state.profile.id)
    .order("year", {ascending:false});
  if (error) return el.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  el.innerHTML = `
    <div class="page-title"><div><h2>My IPCR</h2><p>Create, update, submit, and print your IPCR.</p></div>
      <button class="primary" onclick="openNewIpcr()">+ New IPCR</button></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Year</th><th>Period</th><th>Status</th><th>Rating</th><th>Action</th></tr></thead>
      <tbody>${(data||[]).map(x=>`<tr><td>${x.year}</td><td>${esc(x.period)}</td><td>${statusBadge(x.status)}</td>
      <td>${x.total_rating == null ? "—" : Number(x.total_rating).toFixed(3)}</td>
      <td><button class="link-button" onclick="editIpcr('${x.id}')">Open</button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}

async function openNewIpcr() {
  state.currentIpcr = null; state.items = [];
  $("#ipcrDialogTitle").textContent = "Create IPCR";
  $("#ipcrId").value = "";
  $("#ipcrYear").value = new Date().getFullYear();
  $("#ipcrPeriod").value = new Date().getMonth() < 6 ? "1st Semester" : "2nd Semester";
  $("#ipcrEmployee").value = state.profile.full_name || "";
  $("#itemsContainer").innerHTML = "";
  addItem("core", 0.03);
  addItem("strategic", 0.10);
  addItem("support", 0.005);
  recalc();
  $("#ipcrDialog").showModal();
}

async function editIpcr(id) {
  const { data: ipcr, error } = await sb.from("ipcrs").select("*").eq("id", id).single();
  if (error) return toast(error.message, "error");
  const { data: items, error: ie } = await sb.from("ipcr_items").select("*").eq("ipcr_id", id).order("sort_order");
  if (ie) return toast(ie.message, "error");
  state.currentIpcr = ipcr; state.items = items || [];
  $("#ipcrDialogTitle").textContent = `IPCR ${ipcr.year} – ${ipcr.period}`;
  $("#ipcrId").value = ipcr.id;
  $("#ipcrYear").value = ipcr.year;
  $("#ipcrPeriod").value = ipcr.period;
  $("#ipcrEmployee").value = state.profile.full_name || "";
  $("#itemsContainer").innerHTML = "";
  state.items.forEach(item => addItem(item.function_type, item.weight, item));
  recalc();
  $("#ipcrDialog").showModal();
}

function addItem(functionType="core", weight=0.03, item=null) {
  const frag = $("#itemTemplate").content.cloneNode(true);
  const card = $(".item-card", frag);
  $(".function-type", card).value = item?.function_type || functionType;
  $(".weight", card).value = item?.weight ?? weight;
  $(".output", card).value = item?.output_outcome || "";
  $(".indicator", card).value = item?.success_indicator || "";
  $(".accomplishment", card).value = item?.actual_accomplishment || "";
  $(".q", card).value = item?.quality ?? "";
  $(".e", card).value = item?.efficiency ?? "";
  $(".t", card).value = item?.timeliness ?? "";
  $(".avg", card).value = item?.average_rating == null ? "" : Number(item.average_rating).toFixed(3);
  $(".weighted", card).value = item?.weighted_rating == null ? "" : Number(item.weighted_rating).toFixed(3);
  $(".remarks", card).value = item?.remarks || "";
  $(".remove-item", card).addEventListener("click", () => { card.remove(); renumber(); recalc(); });
  $$(".q,.e,.t,.weight", card).forEach(x => x.addEventListener("input", recalc));
  $(".function-type", card).addEventListener("change", recalc);
  $("#itemsContainer").appendChild(frag);
  renumber();
}

function renumber() {
  $$(".item-card").forEach((card,i) => $(".item-no",card).textContent = `Indicator ${i+1}`);
}

function getItemsFromForm() {
  return $$(".item-card").map((card,i) => {
    const q = parseFloat($(".q",card).value);
    const e = parseFloat($(".e",card).value);
    const t = parseFloat($(".t",card).value);
    const vals = [q,e,t].filter(Number.isFinite);
    const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    const weight = parseFloat($(".weight",card).value) || 0;
    return {
      sort_order:i+1,
      function_type:$(".function-type",card).value,
      weight,
      output_outcome:$(".output",card).value.trim(),
      success_indicator:$(".indicator",card).value.trim(),
      actual_accomplishment:$(".accomplishment",card).value.trim(),
      quality:Number.isFinite(q)?q:null,
      efficiency:Number.isFinite(e)?e:null,
      timeliness:Number.isFinite(t)?t:null,
      average_rating:avg,
      weighted_rating:avg == null ? null : avg*weight,
      remarks:$(".remarks",card).value.trim()
    };
  });
}

function recalc() {
  const items = getItemsFromForm();
  let total = 0, weighted = 0;
  const sums = {core:0, strategic:0, support:0};
  items.forEach((it,i) => {
    sums[it.function_type] += Number(it.weight)||0;
    if (it.average_rating != null) { total += it.average_rating; weighted += it.weighted_rating || 0; }
    const cards = $$(".item-card");
    if (cards[i]) {
      $(".avg",cards[i]).value = it.average_rating == null ? "" : it.average_rating.toFixed(3);
      $(".weighted",cards[i]).value = it.weighted_rating == null ? "" : it.weighted_rating.toFixed(3);
    }
  });
  $("#coreWeight").textContent = `${(sums.core*100).toFixed(1)}%`;
  $("#strategicWeight").textContent = `${(sums.strategic*100).toFixed(1)}%`;
  $("#supportWeight").textContent = `${(sums.support*100).toFixed(1)}%`;
  $("#totalWeight").textContent = `${((sums.core+sums.strategic+sums.support)*100).toFixed(1)}%`;
  $("#finalRating").textContent = items.length ? weighted.toFixed(3) : "—";
  $("#weightedRating").textContent = items.length ? weighted.toFixed(3) : "—";
}

async function saveIpcr(targetStatus="draft") {
  const items = getItemsFromForm();
  const year = parseInt($("#ipcrYear").value,10);
  const period = $("#ipcrPeriod").value;
  if (!year || !period) return toast("Year and period are required.", "error");
  if (!items.length) return toast("Add at least one performance indicator.", "error");
  const totalWeight = items.reduce((s,x)=>s+(Number(x.weight)||0),0);
  if (totalWeight > 1.0005) return toast("Total weight cannot exceed 100%.", "error");

  const totalRating = items.reduce((s,x)=>s+(x.weighted_rating||0),0);
  const existingId = $("#ipcrId").value || null;
  const payload = {
    user_id:state.profile.id, year, period, status:targetStatus,
    total_rating:totalRating || null,
    updated_at:new Date().toISOString(),
    submitted_at:targetStatus === "for_review" ? new Date().toISOString() : state.currentIpcr?.submitted_at || null
  };
  let id = existingId;
  let error;
  if (id) ({error} = await sb.from("ipcrs").update(payload).eq("id",id));
  else {
    const res = await sb.from("ipcrs").insert(payload).select("id").single();
    error=res.error; id=res.data?.id;
  }
  if (error) return toast(error.message,"error");

  if (existingId) {
    const del = await sb.from("ipcr_items").delete().eq("ipcr_id",id);
    if (del.error) return toast(del.error.message,"error");
  }
  const rows = items.map(x => ({...x, ipcr_id:id}));
  const ins = await sb.from("ipcr_items").insert(rows);
  if (ins.error) return toast(ins.error.message,"error");

  await sb.from("ipcr_audit").insert({ipcr_id:id, actor_id:state.profile.id, action:targetStatus==="for_review"?"submitted":"saved_draft", details:{year,period}});
  state.currentIpcr = {...state.currentIpcr, id, status:targetStatus};
  toast(targetStatus==="for_review" ? "IPCR submitted for review." : "Draft saved.","success");
  $("#ipcrDialog").close();
  await navigate("dashboard");
}

async function renderTeam() {
  const el = $("#page-team");
  if (!["supervisor","head","admin"].includes(state.profile.role)) {
    el.innerHTML = `<div class="alert error">You are not authorized to access Team Review.</div>`; return;
  }
  const { data, error } = await sb.from("ipcr_review_queue").select("*").order("year",{ascending:false});
  if (error) return el.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
  el.innerHTML = `
    <div class="page-title"><div><h2>Team Review</h2><p>Review submitted IPCRs and move them through the approval workflow.</p></div></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Period</th><th>Status</th><th>Rating</th><th>Action</th></tr></thead>
      <tbody>${(data||[]).map(x=>`<tr><td>${esc(x.employee_name||x.email||"")}</td><td>${x.year} – ${esc(x.period)}</td>
      <td>${statusBadge(x.status)}</td><td>${x.total_rating==null?"—":Number(x.total_rating).toFixed(3)}</td>
      <td><button class="link-button" onclick="reviewIpcr('${x.id}')">Review</button></td></tr>`).join("") || `<tr><td colspan="5" class="center muted">No team IPCRs available.</td></tr>`}</tbody>
    </table></div></div>
  `;
}

async function reviewIpcr(id) {
  const { data: ipcr, error } = await sb.from("ipcrs").select("*, profiles!ipcrs_user_id_fkey(full_name,email)").eq("id",id).single();
  if (error) return toast(error.message,"error");
  const { data: items, error: ie } = await sb.from("ipcr_items").select("*").eq("ipcr_id",id).order("sort_order");
  if (ie) return toast(ie.message,"error");
  state.currentIpcr=ipcr; state.items=items||[];
  $("#ipcrDialogTitle").textContent = `Review: ${ipcr.profiles?.full_name || "Employee"} – ${ipcr.year} ${ipcr.period}`;
  $("#ipcrId").value=id; $("#ipcrYear").value=ipcr.year; $("#ipcrPeriod").value=ipcr.period;
  $("#ipcrEmployee").value=ipcr.profiles?.full_name || ipcr.profiles?.email || "";
  $("#itemsContainer").innerHTML="";
  state.items.forEach(item=>addItem(item.function_type,item.weight,item));
  recalc();
  const canApprove = state.profile.role==="head" || state.profile.role==="admin";
  $("#saveDraftBtn").style.display="none";
  $("#submitBtn").textContent = canApprove ? "Approve IPCR" : "Return / Forward";
  $("#submitBtn").onclick = () => reviewAction(id, canApprove ? "approved" : "for_approval");
  $("#ipcrDialog").showModal();
}

async function reviewAction(id,status) {
  const {error}=await sb.from("ipcrs").update({
    status,
    reviewed_at:new Date().toISOString(),
    approved_at:status==="approved"?new Date().toISOString():null
  }).eq("id",id);
  if(error)return toast(error.message,"error");
  await sb.from("ipcr_audit").insert({ipcr_id:id,actor_id:state.profile.id,action:status,details:{}});
  $("#ipcrDialog").close();
  $("#saveDraftBtn").style.display="";
  $("#submitBtn").textContent="Submit for review";
  $("#submitBtn").onclick=()=>saveIpcr("for_review");
  toast(`IPCR status updated to ${status.replaceAll("_"," ")}.`,"success");
  navigate("team");
}

async function renderUsers() {
  const el=$("#page-users");
  if(state.profile.role!=="admin"){el.innerHTML=`<div class="alert error">Administrator access required.</div>`;return;}
  const {data,error}=await sb.from("profiles").select("*").order("full_name");
  if(error)return el.innerHTML=`<div class="alert error">${esc(error.message)}</div>`;
  el.innerHTML=`
    <div class="page-title"><div><h2>User Administration</h2><p>Profiles are created automatically when an Auth user is created.</p></div></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Employee No.</th><th>Supervisor</th></tr></thead>
      <tbody>${(data||[]).map(u=>`<tr><td>${esc(u.full_name||"")}</td><td>${esc(u.email||"")}</td>
      <td><select onchange="changeRole('${u.id}',this.value)" ${u.id===state.profile.id?"":"data-role"}>
        ${["employee","supervisor","head","admin"].map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${roleLabel(r)}</option>`).join("")}
      </select></td><td>${esc(u.employee_no||"")}</td><td>${esc(u.supervisor_id||"")}</td></tr>`).join("")}</tbody>
    </table></div></div>`;
}

async function changeRole(id,role){
  if(state.profile.role!=="admin")return;
  const {error}=await sb.from("profiles").update({role}).eq("id",id);
  if(error)toast(error.message,"error"); else {toast("Role updated.","success"); if(id===state.profile.id) await startApp(state.session);}
}

window.openNewIpcr=openNewIpcr;
window.editIpcr=editIpcr;
window.navigate=navigate;
window.reviewIpcr=reviewIpcr;
window.changeRole=changeRole;

init();
