(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const qs = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];

  const MONTHS = [
    ["1","Janeiro"],["2","Fevereiro"],["3","Março"],["4","Abril"],
    ["5","Maio"],["6","Junho"],["7","Julho"],["8","Agosto"],
    ["9","Setembro"],["10","Outubro"],["11","Novembro"],["12","Dezembro"]
  ];

  const AREA_ICONS = {
    "Identidade":"./assets/icone_identidade.png",
    "Liderança":"./assets/icone_lideranca.png",
    "Novas Gerações":"./assets/icone_novasgeracoes.png",
    "Discipulado":"./assets/icone_discipulado.png"
  };

  const TITLES = {
    dashboard:"Dashboard Executivo",
    priorities:"Prioridades",
    planner:"Planner",
    timeline:"Linha do Tempo",
    reports:"Relatórios",
    requirements:"Requisitos",
    myChurch:"Minha Igreja",
    developer:"Opções do Desenvolvedor"
  };

  const state = {
    token: localStorage.getItem("prioridades_token") || "",
    user: null,
    modules: [],
    scope: {polos:[],distritos:[],igrejas:[],filtros:{}},
    context: {
      polo_id:"",
      distrito_id:"",
      igreja_id:"",
      data_inicio:"",
      data_fim:""
    },
    dashboard: null,
    installPrompt: null
  };

  function endpoint(){
    const url = String(window.APP_CONFIG?.APPS_SCRIPT_URL || "").trim();
    if(!url || url.includes("COLE_AQUI")){
      throw new Error("Configure APPS_SCRIPT_URL em config.js.");
    }
    return url;
  }

  async function api(action, payload={}){
    const body = Object.assign({}, payload, {action});
    if(state.token && !body.token) body.token = state.token;

    const response = await fetch(endpoint(), {
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(body),
      redirect:"follow"
    });

    const text = await response.text();
    let data;
    try{ data = JSON.parse(text); }
    catch(_e){ throw new Error("Resposta inválida do Apps Script."); }

    if(!data?.ok){
      if(/Sessão inválida|expirada/i.test(String(data?.error||""))) hardLogout();
      throw new Error(data?.error || "Falha na API.");
    }
    return data;
  }

  function setLoading(on, text="Carregando..."){
    $("loadingText").textContent = text;
    $("loadingOverlay").classList.toggle("hidden-v19", !on);
  }

  async function login(){
    $("loginMessage").textContent = "";
    const login = $("loginEmail").value.trim();
    const senha = $("loginCode").value;
    if(!login || !senha){
      $("loginMessage").textContent = "Informe usuário e senha.";
      return;
    }
    $("loginButton").disabled = true;
    setLoading(true, "Entrando...");
    try{
      const result = await api("login", {login, senha});
      state.token = result.token;
      state.user = result.user;
      state.modules = result.modules || [];
      state.scope = result.scope || state.scope;
      localStorage.setItem("prioridades_token", state.token);
      startApp();
      await bootstrap();
    }catch(err){
      $("loginMessage").textContent = err.message;
    }finally{
      $("loginButton").disabled = false;
      setLoading(false);
    }
  }

  function hardLogout(){
    localStorage.removeItem("prioridades_token");
    state.token = "";
    state.user = null;
    state.modules = [];
  }

  function logout(){
    hardLogout();
    location.reload();
  }

  async function restoreSession(){
    if(!state.token) return false;
    try{
      const session = await api("session");
      state.user = session.user;
      state.modules = session.modules || [];
      return true;
    }catch(_e){
      hardLogout();
      return false;
    }
  }

  function startApp(){
    $("loginScreen").classList.add("hidden");
    $("appRoot").classList.remove("hidden");
    $("profileName").textContent = state.user?.nome || "Usuário";
    $("profileRole").textContent = state.user?.perfil || "Perfil";
    $("profileAvatar").src = state.user?.foto_url || "./assets/icone_192.png";
    applyModuleVisibility();
  }

  function applyModuleVisibility(){
    const allowed = new Set((state.modules||[]).map(m => m.modulo));
    qsa("[data-module]").forEach(btn => {
      btn.classList.toggle("hidden-v19", !allowed.has(btn.dataset.module));
    });
  }

  async function bootstrap(){
    setLoading(true, "Carregando contexto...");
    try{
      const request = Object.assign({}, periodPayload());
      const data = await api("bootstrap", request);
      state.user = data.user || state.user;
      state.modules = data.modules || state.modules;
      state.scope = data.scope || state.scope;
      if(data.context) state.context = Object.assign(state.context, data.context);
      state.dashboard = data.dashboard || null;
      applyModuleVisibility();
      setupTerritoryFilters();
      setupFilterVisibility();
      renderProfile();
      renderContext();
      if(state.dashboard) renderDashboard(state.dashboard);
      else await loadDashboard();
    }finally{
      setLoading(false);
    }
  }

  function renderProfile(){
    $("profileName").textContent = state.user?.nome || "Usuário";
    $("profileRole").textContent = state.user?.perfil || "";
    $("profileAvatar").src = state.user?.foto_url || "./assets/icone_192.png";
  }

  function setupTerritoryFilters(){
    const f = state.scope?.filtros || {};
    $("poleFilterWrap").classList.toggle("hidden-v19", !f.mostrar_polo);
    $("districtFilterWrap").classList.toggle("hidden-v19", !f.mostrar_distrito);
    $("churchFilterWrap").classList.toggle("hidden-v19", f.igreja_fixa === true);

    fillPoleOptions();
    fillDistrictOptions();
    fillChurchOptions();

    if(f.igreja_fixa && state.scope.igrejas?.length === 1){
      state.context.igreja_id = state.scope.igrejas[0].igreja_id;
    }
  }

  function fillPoleOptions(){
    const all = state.scope?.filtros?.permitir_todos_polos;
    const items = state.scope?.polos || [];
    $("poleFilter").innerHTML = [
      ...(all ? [{polo_id:"",polo:"Todos"}] : []),
      ...items
    ].map(x => `<option value="${esc(x.polo_id)}">${esc(x.polo)}</option>`).join("");
    $("poleFilter").value = state.context.polo_id || "";
  }

  function fillDistrictOptions(){
    const poleId = $("poleFilter")?.value || state.context.polo_id || "";
    let items = state.scope?.distritos || [];
    if(poleId) items = items.filter(x => x.polo_id === poleId);

    const all = state.scope?.filtros?.permitir_todos_distritos;
    $("districtFilter").innerHTML = [
      ...(all ? [{distrito_id:"",distrito:"Todos"}] : []),
      ...items
    ].map(x => `<option value="${esc(x.distrito_id)}">${esc(x.distrito)}</option>`).join("");

    if(items.some(x => x.distrito_id === state.context.distrito_id)){
      $("districtFilter").value = state.context.distrito_id;
    }else{
      $("districtFilter").value = "";
      state.context.distrito_id = "";
    }
  }

  function fillChurchOptions(){
    const districtId = $("districtFilter")?.value || state.context.distrito_id || "";
    let items = state.scope?.igrejas || [];
    if(districtId) items = items.filter(x => x.distrito_id === districtId);

    const all = state.scope?.filtros?.permitir_todas_igrejas;
    $("churchFilter").innerHTML = [
      ...(all ? [{igreja_id:"",igreja:"Todas"}] : []),
      ...items
    ].map(x => `<option value="${esc(x.igreja_id)}">${esc(x.igreja)}</option>`).join("");

    if(items.some(x => x.igreja_id === state.context.igreja_id)){
      $("churchFilter").value = state.context.igreja_id;
    }else if(!state.scope?.filtros?.igreja_fixa){
      $("churchFilter").value = "";
      state.context.igreja_id = "";
    }
  }

  function setupPeriodSelectors(){
    const years = [];
    for(let y=2026; y<=2035; y++) years.push(y);
    ["yearSingle","yearStart","yearEnd"].forEach(id => {
      $(id).innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    });
    ["monthSingle","monthStart","monthEnd"].forEach(id => {
      $(id).innerHTML = MONTHS.map(([v,n]) => `<option value="${v}">${n}</option>`).join("");
    });

    const now = new Date();
    const defaultYear = Math.max(2026, now.getFullYear());
    $("yearSingle").value = String(defaultYear);
    $("yearStart").value = "2026";
    $("yearEnd").value = String(defaultYear);
    $("monthSingle").value = String(now.getMonth()+1);
    $("monthStart").value = "1";
    $("monthEnd").value = "12";
    $("dateStart").value = "2026-01-01";
    $("dateEnd").value = `${defaultYear}-12-31`;
  }

  function setupFilterVisibility(){
    const mode = $("periodMode").value;
    const map = {
      yearSingleWrap: mode==="ano" || mode==="mes",
      monthSingleWrap: mode==="mes",
      yearStartWrap: mode==="anos" || mode==="meses",
      yearEndWrap: mode==="anos" || mode==="meses",
      monthStartWrap: mode==="meses",
      monthEndWrap: mode==="meses",
      dateStartWrap: mode==="personalizado",
      dateEndWrap: mode==="personalizado"
    };
    Object.entries(map).forEach(([id,show]) => $(id).classList.toggle("hidden-v19", !show));
  }

  function periodPayload(){
    const mode = $("periodMode")?.value || "ano";
    if(mode==="ano") return {modo:"ano",ano:Number($("yearSingle")?.value || 2026)};
    if(mode==="mes") return {modo:"mes",ano:Number($("yearSingle").value),mes:Number($("monthSingle").value)};
    if(mode==="anos") return {modo:"anos",ano_inicio:Number($("yearStart").value),ano_fim:Number($("yearEnd").value)};
    if(mode==="meses") return {
      modo:"meses",
      ano_inicio:Number($("yearStart").value),mes_inicio:Number($("monthStart").value),
      ano_fim:Number($("yearEnd").value),mes_fim:Number($("monthEnd").value)
    };
    return {data_inicio:$("dateStart").value,data_fim:$("dateEnd").value};
  }

  function currentRequest(){
    return Object.assign({}, periodPayload(), {
      polo_id: $("poleFilterWrap").classList.contains("hidden-v19") ? "" : $("poleFilter").value,
      distrito_id: $("districtFilterWrap").classList.contains("hidden-v19") ? "" : $("districtFilter").value,
      igreja_id: state.scope?.filtros?.igreja_fixa
        ? (state.scope.igrejas?.[0]?.igreja_id || "")
        : $("churchFilter").value
    });
  }

  async function applyFilters(){
    setLoading(true, "Aplicando filtros...");
    try{
      await loadDashboard();
    }catch(err){
      alert(err.message);
    }finally{
      setLoading(false);
    }
  }

  async function loadDashboard(){
    $("syncBadge").innerHTML = "<i></i>Sincronizando";
    const data = await api("dashboard", currentRequest());
    state.dashboard = data;
    state.context = Object.assign(state.context, data.context || {});
    renderDashboard(data);
    renderContext();
    $("syncBadge").innerHTML = "<i></i>Conectado";
  }

  function renderDashboard(data){
    const geral = data.geral || {};
    const pct = Number(geral.percentual || 0);
    $("overallPercent").textContent = `${pct.toFixed(1).replace(".",",")}%`;
    $("overallGoal").textContent = fmt(geral.meta);
    $("overallReached").textContent = fmt(geral.alcancado);
    $("overallRadial").style.setProperty("--value", Math.max(0,Math.min(100,pct)));
    $("dashboardPeriodText").textContent = `${data.context?.data_inicio || ""} a ${data.context?.data_fim || ""}`;

    $("priorityCards").innerHTML = (data.prioridades||[]).map(p => `
      <article class="priority-card">
        <img class="priority-image-icon" src="${AREA_ICONS[p.prioridade] || "./assets/icone_192.png"}" alt="">
        <div>
          <span>${esc(p.prioridade)}</span>
          <strong>${percent(p.percentual)}</strong>
          <small>${esc(p.status || "")}</small>
        </div>
      </article>
    `).join("") || `<div class="empty-state-v19">Sem dados para o período selecionado.</div>`;

    $("trafficGrid").innerHTML = (data.prioridades||[]).map(p => {
      const cls = p.percentual>=80 ? "green" : p.percentual>=60 ? "yellow" : "red";
      return `<div class="traffic-item"><i class="${cls}"></i><div><strong>${esc(p.prioridade)}</strong><span>${percent(p.percentual)} · ${esc(p.status)}</span></div></div>`;
    }).join("");

    $("alertsList").innerHTML = (data.alertas||[]).map(a => `
      <div class="alert-item">
        <div><strong>${esc(a.titulo)}</strong><span>${esc(a.igreja || "")} · ${esc(a.prioridade || "")}</span></div>
        <b>${percent(a.percentual)}</b>
      </div>
    `).join("") || `<div class="empty-state-v19">Nenhuma pendência prioritária no contexto atual.</div>`;

    $("rankingList").innerHTML = (data.ranking||[]).map(r => `
      <div class="ranking-item">
        <b>${r.posicao}º</b>
        <div><strong>${esc(r.igreja)}</strong><span>${fmt(r.alcancado)} / ${fmt(r.meta)}</span></div>
        <em>${percent(r.percentual)}</em>
      </div>
    `).join("") || `<div class="empty-state-v19">Sem ranking disponível.</div>`;

    drawEvolution(data.evolucao_mensal || []);
  }

  function drawEvolution(items){
    const canvas = $("evolutionChart");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle = "#dce6e9";
    ctx.lineWidth = 1;
    for(let i=1;i<=4;i++){
      const y = (h-50)*i/4;
      ctx.beginPath();ctx.moveTo(45,y);ctx.lineTo(w-20,y);ctx.stroke();
    }
    if(!items.length){
      ctx.fillStyle = "#6c7d86";
      ctx.font = "16px Inter, sans-serif";
      ctx.fillText("Sem dados mensais no período selecionado.", 55, h/2);
      return;
    }
    const max = Math.max(...items.map(x => Number(x.alcancado||0)),1);
    const left=50,right=20,top=20,bottom=40;
    const plotW=w-left-right, plotH=h-top-bottom;
    ctx.strokeStyle="#102333";ctx.lineWidth=3;ctx.beginPath();
    items.forEach((item,i)=>{
      const x=left+(items.length===1?plotW/2:(plotW*i/(items.length-1)));
      const y=top+plotH-(Number(item.alcancado||0)/max)*plotH;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.fillStyle="#102333";
    items.forEach((item,i)=>{
      const x=left+(items.length===1?plotW/2:(plotW*i/(items.length-1)));
      const y=top+plotH-(Number(item.alcancado||0)/max)*plotH;
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
      ctx.font="12px Inter, sans-serif";
      ctx.fillText(String(item.periodo||""), Math.max(0,x-24), h-14);
    });
  }

  function renderContext(){
    const pole = (state.scope.polos||[]).find(x => x.polo_id === state.context.polo_id)?.polo;
    const district = (state.scope.distritos||[]).find(x => x.distrito_id === state.context.distrito_id)?.distrito;
    const church = (state.scope.igrejas||[]).find(x => x.igreja_id === state.context.igreja_id)?.igreja;
    const territorial = church || district || pole || window.APP_CONFIG.FIELD || "Missão Oeste do Pará";
    $("contextText").textContent = `${territorial} · ${state.context.data_inicio || ""} a ${state.context.data_fim || ""}`;
    $("fieldContextEyebrow").textContent = [window.APP_CONFIG.FIELD, pole, district, church].filter(Boolean).join(" · ");
  }

  function selectView(view){
    qsa(".view").forEach(v => v.classList.remove("active"));
    const el = $(`${view}View`);
    if(el) el.classList.add("active");
    qsa(".nav-button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view===view));
    $("viewTitle").textContent = TITLES[view] || "Prioridades Estratégicas";
  }

  function toggleSidebar(){
    $("sidebar").classList.toggle("collapsed");
    $("profileCard").classList.toggle("collapsed-user", $("sidebar").classList.contains("collapsed"));
  }

  function fmt(v){
    const n=Number(v||0);
    return Number.isInteger(n)?String(n):n.toLocaleString("pt-BR",{maximumFractionDigits:1});
  }
  function percent(v){return `${Number(v||0).toFixed(1).replace(".",",")}%`;}
  function esc(v){
    return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  function bind(){
    $("loginButton").addEventListener("click", login);
    $("loginCode").addEventListener("keydown", e => {if(e.key==="Enter") login();});
    $("logoutButton").addEventListener("click", logout);
    $("refreshButton").addEventListener("click", applyFilters);
    $("applyFiltersButton").addEventListener("click", applyFilters);
    $("periodMode").addEventListener("change", setupFilterVisibility);

    $("poleFilter").addEventListener("change", () => {
      state.context.polo_id = $("poleFilter").value;
      state.context.distrito_id = "";
      state.context.igreja_id = "";
      fillDistrictOptions(); fillChurchOptions();
    });
    $("districtFilter").addEventListener("change", () => {
      state.context.distrito_id = $("districtFilter").value;
      state.context.igreja_id = "";
      fillChurchOptions();
    });
    $("churchFilter").addEventListener("change", () => {
      state.context.igreja_id = $("churchFilter").value;
    });

    qsa(".nav-button[data-view]").forEach(btn => btn.addEventListener("click", () => selectView(btn.dataset.view)));
    $("sidebarLogoButton").addEventListener("click", toggleSidebar);
    $("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("mobile-open"));

    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault(); state.installPrompt=e; $("installButton").classList.remove("hidden-v19");
    });
    $("installButton").addEventListener("click", async () => {
      if(!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt=null;
    });
  }

  async function init(){
    setupPeriodSelectors();
    bind();

    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
    }

    if(await restoreSession()){
      startApp();
      try{ await bootstrap(); }
      catch(err){ console.error(err); alert(err.message); }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
