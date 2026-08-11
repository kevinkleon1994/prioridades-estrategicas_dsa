(() => {
"use strict";

const $=id=>document.getElementById(id);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const AREAS={"Identidade":"#ff0046","Liderança":"#00bddd","Novas Gerações":"#ffb800","Discipulado":"#00c97b"};
const AREA_ICONS={"Identidade":"assets/icone_identidade.png","Liderança":"assets/icone_lideranca.png","Novas Gerações":"assets/icone_novasgeracoes.png","Discipulado":"assets/icone_discipulado.png"};
const MONTHS=[["1","Janeiro"],["2","Fevereiro"],["3","Março"],["4","Abril"],["5","Maio"],["6","Junho"],["7","Julho"],["8","Agosto"],["9","Setembro"],["10","Outubro"],["11","Novembro"],["12","Dezembro"]];
const MODULE_TO_VIEW={dashboard:"dashboard",prioridades:"priorities",planner:"planner",linha_tempo:"timeline",relatorios:"reports",requisitos:"requirements",minha_igreja:"myChurch",desenvolvedor:"admin"};
const VIEW_TITLES={dashboard:"Dashboard Executivo",priorities:"Prioridades Estratégicas",planner:"Planner",timeline:"Linha do tempo",reports:"Relatórios",requirements:"Requisitos",myChurch:"Minha Igreja",admin:"Opções do Desenvolvedor"};

let state={
  token:localStorage.getItem("prioridades_token")||"",
  user:null,modules:[],scope:{polos:[],distritos:[],igrejas:[],filtros:{}},
  context:{polo_id:"",distrito_id:"",igreja_id:"",data_inicio:"",data_fim:""},
  dashboard:null,requirements:[],results:[],planner:[],reports:[],difficulties:[],
  churchProfile:null,departments:[],users:[],developer:null,
  currentPriority:"Identidade",selectedRequirementId:"",currentAiReport:"",editingReportId:""
};

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const num=v=>Number(v||0);
const pct=(a,b)=>b?Math.max(0,Math.min(100,a/b*100)):0;
const fmt=v=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:1});
const percent=v=>`${Number(v||0).toFixed(1).replace(".",",")}%`;

function toast(msg){const e=$("toast");if(!e)return;e.textContent=msg;e.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.classList.remove("show"),2800)}
function loading(on,text="Carregando..."){$("loadingText").textContent=text;$("loadingOverlay").classList.toggle("hidden-v111",!on)}
function endpoint(){return String(window.APP_CONFIG?.API_PROXY_URL||"").replace(/\/+$/,"")}
async function api(action,payload={}){
  const body={...payload,action};
  if(state.token&&!body.token)body.token=state.token;
  let response;
  try{
    response=await fetch(endpoint(),{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8"},body:JSON.stringify(body),cache:"no-store"});
  }catch(e){throw new Error("Falha ao comunicar com a API do Prioridades DSA.")}
  const text=await response.text();let data;
  try{data=JSON.parse(text)}catch(e){throw new Error("A API retornou uma resposta inválida.")}
  if(!response.ok||!data?.ok)throw new Error(data?.error||`Erro HTTP ${response.status}.`);
  return data;
}
function hardLogout(){localStorage.removeItem("prioridades_token");state.token="";state.user=null}
function logout(){hardLogout();location.reload()}

function periodPayload(){
  const mode=$("periodMode").value;
  if(mode==="ano")return{modo:"ano",ano:+$("yearSingle").value};
  if(mode==="mes")return{modo:"mes",ano:+$("yearSingle").value,mes:+$("monthSingle").value};
  if(mode==="anos")return{modo:"anos",ano_inicio:+$("yearStart").value,ano_fim:+$("yearEnd").value};
  if(mode==="meses")return{modo:"meses",ano_inicio:+$("yearStart").value,mes_inicio:+$("monthStart").value,ano_fim:+$("yearEnd").value,mes_fim:+$("monthEnd").value};
  return{data_inicio:$("dateStart").value,data_fim:$("dateEnd").value};
}
function currentRequest(){
  return {...periodPayload(),
    polo_id:$("poleFilterWrap").classList.contains("hidden-v111")?"":$("poleFilter").value,
    distrito_id:$("districtFilterWrap").classList.contains("hidden-v111")?"":$("districtFilter").value,
    igreja_id:state.scope?.filtros?.igreja_fixa?(state.scope.igrejas?.[0]?.igreja_id||""):$("churchFilter").value
  };
}
function selectedChurchId(){return currentRequest().igreja_id}
function selectedChurch(){const id=selectedChurchId();return(state.scope.igrejas||[]).find(x=>x.igreja_id===id)||null}

async function login(){
  $("loginMessage").textContent="";$("loginButton").disabled=true;$("loginButton").textContent="Entrando...";
  try{
    const r=await api("login",{login:$("loginEmail").value.trim(),senha:$("loginCode").value});
    state.token=r.token;state.user=r.user;state.modules=r.modules||[];state.scope=r.scope||state.scope;
    localStorage.setItem("prioridades_token",state.token);
    startApp();await bootstrap();
  }catch(e){$("loginMessage").textContent=e.message}
  finally{$("loginButton").disabled=false;$("loginButton").innerHTML='Entrar <span aria-hidden="true">→</span>'}
}
async function restore(){
  if(!state.token)return false;
  try{const r=await api("session");state.user=r.user;state.modules=r.modules||[];return true}catch(e){hardLogout();return false}
}
function startApp(){
  $("loginScreen").classList.add("hidden");$("appRoot").classList.remove("hidden");
  $("profileName").textContent=state.user?.nome||"Usuário";$("profileRole").textContent=state.user?.perfil||"";
  $("profilePhoto").src=state.user?.foto_url||"assets/icone_192.png";
  applyModules();
}
function applyModules(){
  const allowed=new Set((state.modules||[]).map(x=>x.modulo));
  qsa(".nav-button[data-view]").forEach(btn=>{
    const module=Object.entries(MODULE_TO_VIEW).find(([,v])=>v===btn.dataset.view)?.[0];
    btn.classList.toggle("hidden",module&&!allowed.has(module));
  });
  const hasPriorities=allowed.has("prioridades");
  $("prioritiesToggle").classList.toggle("hidden",!hasPriorities);
  $("prioritySubmenu").classList.toggle("hidden",!hasPriorities);
}
async function bootstrap(){
  loading(true,"Carregando ambiente...");
  try{
    const r=await api("bootstrap",periodPayload());
    state.user=r.user||state.user;state.modules=r.modules||state.modules;state.scope=r.scope||state.scope;state.dashboard=r.dashboard||null;
    applyModules();setupTerritory();renderProfile();if(r.dashboard){state.context={...state.context,...r.dashboard.context};renderDashboard(r.dashboard)}else await loadDashboard();
  }finally{loading(false)}
}
function renderProfile(){
  $("profileName").textContent=state.user?.nome||"";$("profileRole").textContent=state.user?.perfil||"";
  $("profilePhoto").src=state.user?.foto_url||"assets/icone_192.png";
}
function setupTerritory(){
  const f=state.scope?.filtros||{};
  $("poleFilterWrap").classList.toggle("hidden-v111",!f.mostrar_polo);
  $("districtFilterWrap").classList.toggle("hidden-v111",!f.mostrar_distrito);
  $("churchFilterWrap").classList.toggle("hidden-v111",f.igreja_fixa===true);
  fillPoles();fillDistricts();fillChurches();
}
function fillPoles(){
  const all=state.scope?.filtros?.permitir_todos_polos;
  const arr=[...(all?[{polo_id:"",polo:"Todos"}]:[]),...(state.scope.polos||[])];
  $("poleFilter").innerHTML=arr.map(x=>`<option value="${esc(x.polo_id)}">${esc(x.polo)}</option>`).join("");
}
function fillDistricts(){
  const pole=$("poleFilter").value;let arr=state.scope.distritos||[];if(pole)arr=arr.filter(x=>x.polo_id===pole);
  const all=state.scope?.filtros?.permitir_todos_distritos;
  $("districtFilter").innerHTML=[...(all?[{distrito_id:"",distrito:"Todos"}]:[]),...arr].map(x=>`<option value="${esc(x.distrito_id)}">${esc(x.distrito)}</option>`).join("");
}
function fillChurches(){
  const d=$("districtFilter").value;let arr=state.scope.igrejas||[];if(d)arr=arr.filter(x=>x.distrito_id===d);
  const all=state.scope?.filtros?.permitir_todas_igrejas;
  $("churchFilter").innerHTML=[...(all?[{igreja_id:"",igreja:"Todas"}]:[]),...arr].map(x=>`<option value="${esc(x.igreja_id)}">${esc(x.igreja)}</option>`).join("");
}
function setupPeriod(){
  const years=[];for(let y=2026;y<=2035;y++)years.push(y);
  ["yearSingle","yearStart","yearEnd","goalYearInput"].forEach(id=>$(id).innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join(""));
  ["monthSingle","monthStart","monthEnd"].forEach(id=>$(id).innerHTML=MONTHS.map(([v,n])=>`<option value="${v}">${n}</option>`).join(""));
  const now=new Date(),y=Math.max(2026,now.getFullYear());$("yearSingle").value=y;$("yearStart").value=2026;$("yearEnd").value=y;$("monthSingle").value=now.getMonth()+1;$("monthStart").value=1;$("monthEnd").value=12;$("dateStart").value="2026-01-01";$("dateEnd").value=`${y}-12-31`;
  updatePeriodVisibility();
}
function updatePeriodVisibility(){
  const m=$("periodMode").value,show={yearSingleWrap:["ano","mes"].includes(m),monthSingleWrap:m==="mes",yearStartWrap:["anos","meses"].includes(m),monthStartWrap:m==="meses",yearEndWrap:["anos","meses"].includes(m),monthEndWrap:m==="meses",dateStartWrap:m==="personalizado",dateEndWrap:m==="personalizado"};
  Object.entries(show).forEach(([id,on])=>$(id).classList.toggle("hidden-v111",!on));
}
function renderContext(){
  const c=selectedChurch(),d=(state.scope.distritos||[]).find(x=>x.distrito_id===currentRequest().distrito_id),p=(state.scope.polos||[]).find(x=>x.polo_id===currentRequest().polo_id);
  const names=[window.APP_CONFIG.FIELD,p?.polo,d?.distrito,c?.igreja].filter(Boolean);
  $("fieldContext").textContent=names.join(" · ").toUpperCase();
  $("contextText").textContent=`${c?.igreja||d?.distrito||p?.polo||window.APP_CONFIG.FIELD} · ${state.context.data_inicio||""} a ${state.context.data_fim||""}`;
  $("lastUpdate").textContent="Última atualização: "+new Date().toLocaleString("pt-BR");
}
async function applyFilters(){
  loading(true,"Aplicando filtros...");
  try{
    await loadDashboard();
    const active=document.querySelector(".view.active")?.id;
    if(active==="prioritiesView")await loadPriorities();
    if(active==="plannerView")await loadPlanner();
    if(active==="timelineView")await loadTimeline();
    if(active==="reportsView")await loadReports();
    if(active==="requirementsView")await loadRequirements();
    if(active==="myChurchView")await loadMyChurch();
  }catch(e){toast(e.message)}finally{loading(false)}
}
async function loadDashboard(){
  $("syncBadge").innerHTML="<i style='background:#ffb800'></i>Sincronizando";
  const r=await api("dashboard",currentRequest());state.dashboard=r;state.context={...state.context,...r.context};renderDashboard(r);renderContext();$("syncBadge").innerHTML="<i></i>Conectado";
}
function renderDashboard(d){
  const g=d.geral||{},p=num(g.percentual);$("overallRadial").style.setProperty("--value",p);$("overallPercent").textContent=Math.round(p)+"%";$("overallGoal").textContent=fmt(g.meta);$("overallReached").textContent=fmt(g.alcancado);
  $("dailyBibleVerse").textContent=`Resultados de ${d.context?.data_inicio||""} a ${d.context?.data_fim||""}.`;
  $("priorityCards").innerHTML=(d.prioridades||[]).map(x=>`<button class="priority-card" data-area="${esc(x.prioridade)}" style="--accent:${AREAS[x.prioridade]||'#102333'}"><div style="display:flex;align-items:center;justify-content:space-between"><img class="priority-card-icon-v8" src="${AREA_ICONS[x.prioridade]||'assets/icone_192.png'}"><strong>${Math.round(num(x.percentual))}%</strong></div><h3>${esc(x.prioridade)}</h3><p>${fmt(x.alcancado)} de ${fmt(x.meta)} realizados</p><div class="progress"><i style="width:${Math.min(100,num(x.percentual))}%"></i></div></button>`).join("");
  qsa(".priority-card").forEach(b=>b.onclick=()=>openPriority(b.dataset.area));
  $("trafficGrid").innerHTML=(d.prioridades||[]).map(x=>{const c=num(x.percentual)>=80?"#00c97b":num(x.percentual)>=60?"#ffb800":"#ff0046";return`<div class="traffic-card"><strong><i class="traffic-status-dot" style="background:${c}"></i>${esc(x.prioridade)}</strong><span>${percent(x.percentual)} alcançado</span><img class="traffic-priority-icon" src="${AREA_ICONS[x.prioridade]}"></div>`}).join("");
  $("alertsList").innerHTML=(d.alertas||[]).map(x=>`<div class="alert-item"><img class="alert-priority-icon" src="${AREA_ICONS[x.prioridade]||'assets/icone_192.png'}"><div><strong>${esc(x.titulo)}</strong><span>${esc(x.igreja||"")} · ${esc(x.prioridade||"")}</span></div><strong>${Math.round(num(x.percentual))}%</strong></div>`).join("")||'<div class="empty-v111">Nenhum alerta no contexto atual.</div>';
  $("rankingList").innerHTML=(d.ranking||[]).map(x=>`<div class="ranking-item"><b>${x.posicao}</b><div><strong>${esc(x.igreja)}</strong><span>${fmt(x.alcancado)} de ${fmt(x.meta)}</span></div><strong>${Math.round(num(x.percentual))}%</strong></div>`).join("")||'<div class="empty-v111">Sem ranking disponível.</div>';
  drawEvolution(d.evolucao_mensal||[]);
}
function drawEvolution(items){
  const c=$("evolutionChart"),ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle="#dbe6ea";ctx.lineWidth=1;
  for(let i=1;i<5;i++){const y=i*h/5;ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(w-20,y);ctx.stroke()}
  if(!items.length){ctx.fillStyle="#6f818b";ctx.font="14px Inter";ctx.fillText("Sem dados mensais no período.",50,h/2);return}
  const max=Math.max(...items.map(x=>num(x.alcancado)),1);ctx.strokeStyle="#00bddd";ctx.lineWidth=4;ctx.beginPath();
  items.forEach((x,i)=>{const px=45+(items.length===1?(w-70)/2:i*(w-70)/(items.length-1)),py=h-30-num(x.alcancado)*(h-55)/max;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke();
  ctx.fillStyle="#102333";ctx.font="11px Inter";items.forEach((x,i)=>{const px=35+(items.length===1?(w-70)/2:i*(w-70)/(items.length-1));ctx.fillText(String(x.periodo||""),px,h-8)});
}

async function showView(name){
  qsa(".view").forEach(v=>v.classList.remove("active"));$(name+"View")?.classList.add("active");qsa(".nav-button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$("viewTitle").textContent=VIEW_TITLES[name]||name;$("sidebar").classList.remove("open");
  try{
    if(name==="priorities")await loadPriorities();
    else if(name==="planner")await loadPlanner();
    else if(name==="timeline")await loadTimeline();
    else if(name==="reports")await loadReports();
    else if(name==="requirements")await loadRequirements();
    else if(name==="myChurch")await loadMyChurch();
    else if(name==="admin")await loadDeveloper();
  }catch(e){toast(e.message)}
}
function openPriority(area){state.currentPriority=area;state.selectedRequirementId="";showView("priorities")}
async function loadPriorities(){
  loading(true,"Carregando prioridades...");
  try{
    const [rq,rs]=await Promise.all([api("list_requirements",currentRequest()),api("list_results",currentRequest())]);state.requirements=rq.data||[];state.results=rs.data||[];renderPriorities();
  }finally{loading(false)}
}
function effectiveGoal(req){
  const year=Number(String(state.context.data_inicio||$("yearSingle").value).slice(0,4));const e=(req.metas_efetivas||[]).find(x=>+x.ano===year);return e?num(e.meta):num(req.meta_padrao)
}
function reachedFor(reqId){return(state.results||[]).filter(x=>x.requisito_id===reqId).reduce((s,x)=>s+num(x.alcancado),0)}
function renderPriorities(){
  document.documentElement.style.setProperty("--current",AREAS[state.currentPriority]);
  const desc={"Identidade":"Fortalecer a identidade profética da Igreja, as crenças fundamentais e o estilo de vida adventista.","Liderança":"Formar e desenvolver líderes, fortalecendo competências espirituais, administrativas e pastorais.","Novas Gerações":"Integrar crianças, adolescentes e jovens à comunhão, fidelidade, liderança e missão.","Discipulado":"Desenvolver comunhão, relacionamento, missão e multiplicação por meio de uma jornada contínua de discipulado."};
  $("priorityAreaTitle").textContent=state.currentPriority;$("priorityAreaDescription").textContent=desc[state.currentPriority];$("priorityShapeV7").src=AREA_ICONS[state.currentPriority];$("priorityWatermarkV8").src=AREA_ICONS[state.currentPriority];
  $("priorityTabs").innerHTML=Object.entries(AREAS).map(([a,c])=>`<button class="priority-tab-v7 ${a===state.currentPriority?"active":""}" data-area="${a}" style="--tab:${c}"><span class="priority-tab-copy-v7"><img class="priority-tab-icon-v8" src="${AREA_ICONS[a]}">${a}</span><small>${state.requirements.filter(r=>r.prioridade===a).length} critérios</small></button>`).join("");
  qsa(".priority-tab-v7").forEach(b=>b.onclick=()=>{state.currentPriority=b.dataset.area;state.selectedRequirementId="";renderPriorities()});
  const rows=state.requirements.filter(r=>r.prioridade===state.currentPriority);const totals=rows.reduce((a,r)=>{const g=effectiveGoal(r),v=reachedFor(r.requisito_id);a.g+=g;a.v+=v;return a},{g:0,v:0}),pp=pct(totals.v,totals.g);
  $("priorityPercentV7").textContent=Math.round(pp)+"%";$("priorityProgressV7").style.width=pp+"%";$("priorityGoalV7").textContent=fmt(totals.g);$("priorityReachedV7").textContent=fmt(totals.v);$("priorityCountV7").textContent=rows.length;
  const status=$("criteriaStatusFilter").value;
  const visible=rows.filter(r=>{const p=pct(reachedFor(r.requisito_id),effectiveGoal(r));const s=p>=100?"Concluído":p>=60?"Em andamento":"Atenção";return status==="Todos"||s===status});
  $("criteriaListV51").innerHTML=visible.map((r,i)=>{const p=pct(reachedFor(r.requisito_id),effectiveGoal(r));const s=p>=100?"Concluído":p>=60?"Em andamento":"Atenção";return`<button class="criterion-v51 ${state.selectedRequirementId===r.requisito_id?"active":""}" data-id="${r.requisito_id}"><b>${String(i+1).padStart(2,"0")}</b><span><strong>${esc(r.titulo)}</strong><small>${s}</small></span><em>${Math.round(p)}%</em></button>`}).join("");
  qsa(".criterion-v51").forEach(b=>b.onclick=()=>{state.selectedRequirementId=b.dataset.id;renderCriterion()});
  if(!state.selectedRequirementId&&rows[0])state.selectedRequirementId=rows[0].requisito_id;renderCriterion();
}
function renderCriterion(){
  const r=state.requirements.find(x=>x.requisito_id===state.selectedRequirementId);if(!r)return;
  const goal=effectiveGoal(r),reached=reachedFor(r.requisito_id),p=pct(reached,goal),churchId=selectedChurchId(),last=[...state.results].reverse().find(x=>x.requisito_id===r.requisito_id&&(!churchId||x.igreja_id===churchId))||{};
  $("criterionTitleV51").textContent=r.titulo;$("criterionStatusV51").textContent=p>=100?"Concluído":p>=60?"Em andamento":"Atenção";$("criterionDescriptionV51").textContent=r.direcionamento||"—";$("criterionQuestionV51").textContent=r.pergunta||"—";
  $("actionPlanV51").value=last.plano_acao||"";$("goalInputV51").value=goal;$("reachedInputV51").value=last.alcancado??"";$("responsibleInputV51").value=last.responsavel||"";$("dateInputV51").value=last.data_realizacao||"";$("voteInputV51").value=last.voto||"";$("materialInputV51").value=last.material||"";updateLive();
  const disabled=!churchId;["actionPlanV51","reachedInputV51","responsibleInputV51","dateInputV51","voteInputV51","materialInputV51","saveCriterionV51"].forEach(id=>$(id).disabled=disabled);$("goalInputV51").disabled=true;$("saveCriterionV51").textContent=disabled?"Selecione uma igreja para editar":"Salvar";
}
function updateLive(){const g=num($("goalInputV51").value),r=num($("reachedInputV51").value),p=pct(r,g);$("livePercentV51").textContent=Math.round(p)+"%";$("liveProgressV51").style.width=p+"%"}
async function saveCriterion(){
  const churchId=selectedChurchId();if(!churchId)return toast("Selecione uma igreja.");
  loading(true,"Salvando resultado...");
  try{await api("save_result",{igreja_id:churchId,requisito_id:state.selectedRequirementId,data_realizacao:$("dateInputV51").value||new Date().toISOString().slice(0,10),alcancado:num($("reachedInputV51").value),plano_acao:$("actionPlanV51").value,responsavel:$("responsibleInputV51").value,data_inicial:$("dateInputV51").value,voto:$("voteInputV51").value,material:$("materialInputV51").value});await loadPriorities();await loadDashboard();toast("Resultado salvo.")}finally{loading(false)}
}

async function loadPlanner(){loading(true,"Carregando Planner...");try{const r=await api("list_planner",currentRequest());state.planner=r.data||[];renderPlanner()}finally{loading(false)}}
function renderPlanner(){
  const statuses=["Não iniciado","Em andamento","Concluído"];
  $("kanbanBoard").innerHTML=statuses.map(s=>`<section class="kanban-column"><h3>${s}</h3>${state.planner.filter(t=>t.status===s).map(t=>`<article class="task-card" style="--task-color:${AREAS[t.prioridade]||'#9aaab3'}"><button class="task-edit-button" data-task="${t.tarefa_id}">✎</button><span class="task-card-area"><img src="${AREA_ICONS[t.prioridade]||'assets/icone_192.png'}">${esc(t.prioridade||"")}</span><strong>${esc(t.titulo)}</strong><span>${esc(t.responsavel||"Não definido")}</span><span>Prazo: ${esc(t.prazo||"—")}</span></article>`).join("")}</section>`).join("");
  qsa("[data-task]").forEach(b=>b.onclick=()=>openTaskModal(b.dataset.task));$("newTaskButton").disabled=!selectedChurchId();
}
function openTaskModal(id=""){
  if(!selectedChurchId())return toast("Selecione uma igreja.");
  const t=state.planner.find(x=>x.tarefa_id===id)||{};$("taskModalTitle").textContent=id?"Editar item do planejamento":"Nova tarefa";$("taskId").value=id;$("taskTitle").value=t.titulo||"";$("taskArea").value=t.prioridade||"Identidade";$("taskOwner").value=t.responsavel||"";$("taskDue").value=t.prazo||"";$("taskStatus").value=t.status||"Não iniciado";$("deleteTask").classList.toggle("hidden",!id);$("taskModal").classList.add("open")
}
async function saveTask(){
  if(!selectedChurchId())return toast("Selecione uma igreja.");const title=$("taskTitle").value.trim();if(!title)return toast("Informe o título.");
  loading(true,"Salvando tarefa...");try{await api("save_planner_task",{tarefa_id:$("taskId").value,igreja_id:selectedChurchId(),titulo:title,prioridade:$("taskArea").value,responsavel:$("taskOwner").value,prazo:$("taskDue").value,status:$("taskStatus").value});$("taskModal").classList.remove("open");await loadPlanner();toast("Tarefa salva.")}finally{loading(false)}
}
async function reauth(){const senha=prompt("Confirme sua senha para continuar:");if(!senha)return false;try{await api("reauth",{senha});return true}catch(e){toast(e.message);return false}}
async function deleteTask(){if(!await reauth())return;loading(true,"Excluindo tarefa...");try{await api("delete_planner_task",{tarefa_id:$("taskId").value});$("taskModal").classList.remove("open");await loadPlanner();toast("Tarefa excluída.")}finally{loading(false)}}
async function loadTimeline(){loading(true,"Carregando linha do tempo...");try{const r=await api("timeline",currentRequest());state.planner=r.data||[];renderTimeline()}finally{loading(false)}}
function renderTimeline(){$("timelineList").innerHTML=state.planner.map(t=>`<article class="timeline-item" style="--timeline-color:${AREAS[t.prioridade]||'#00bddd'}"><strong>${esc(t.titulo)}</strong><span class="timeline-area"><img src="${AREA_ICONS[t.prioridade]||'assets/icone_192.png'}">${esc(t.prioridade||"")}</span><span>${esc(t.responsavel||"")} · ${esc(t.status||"")} · ${esc(t.evento_data||t.prazo||t.data_conclusao||"Sem prazo")}</span></article>`).join("")||'<div class="empty-v111">Nenhum item na linha do tempo.</div>'}

async function loadRequirements(){loading(true,"Carregando requisitos...");try{const r=await api("requirement_goal_view",currentRequest());state.requirements=r.requirements||[];state.goalView=r;renderRequirements()}finally{loading(false)}}
function canAdminRequirements(){return["Desenvolvedor","Administrador"].includes(state.user?.perfil)}
function renderRequirements(){
  $("newRequirementButton").classList.toggle("hidden",!canAdminRequirements());const q=($("requirementSearch").value||"").toLowerCase();
  const rows=state.requirements.filter(r=>`${r.codigo||""} ${r.titulo||""} ${r.prioridade||""}`.toLowerCase().includes(q));$("requirementsCount").textContent=`${rows.length} requisito${rows.length===1?"":"s"}`;
  $("requirementsGrid").innerHTML=rows.map(r=>`<article class="requirement-card req-card-v111" style="--current:${AREAS[r.prioridade]||'#102333'}"><div class="requirement-top"><span class="requirement-code">${esc(r.codigo||"")}</span><span class="access-pill ${r.ativo===false?"inactive":"active"}"><i></i>${r.ativo===false?"Inativo":"Ativo"}</span></div><h3>${esc(r.titulo||"")}</h3><p>${esc(r.direcionamento||"")}</p><div class="requirement-meta"><span>${esc(r.prioridade||"")}</span><span>Meta padrão: ${fmt(r.meta_padrao)}</span></div>${canAdminRequirements()?`<button class="requirement-edit" data-edit-req="${r.requisito_id}">Editar</button><button class="secondary-button" data-goal-req="${r.requisito_id}">Meta</button>`:""}</article>`).join("");
  qsa("[data-edit-req]").forEach(b=>b.onclick=()=>openRequirement(b.dataset.editReq));qsa("[data-goal-req]").forEach(b=>b.onclick=()=>openGoal(b.dataset.goalReq));
}
function openRequirement(id=""){
  const r=state.requirements.find(x=>x.requisito_id===id)||{};$("requirementModalTitle").textContent=id?"Editar requisito":"Novo requisito";$("requirementOriginalCode").value=id;$("requirementCodeInput").value=r.codigo||"";$("requirementAreaInput").value=r.prioridade||"Identidade";$("requirementTitleInput").value=r.titulo||"";$("requirementDescriptionInput").value=r.direcionamento||"";$("requirementQuestionInput").value=r.pergunta||"";$("requirementGoalInput").value=r.meta_padrao??0;$("requirementActiveInput").value=String(r.ativo!==false);$("requirementModal").classList.add("open")
}
async function saveRequirement(){
  loading(true,"Salvando requisito...");try{await api("save_requirement",{requisito_id:$("requirementOriginalCode").value,codigo:$("requirementCodeInput").value,prioridade:$("requirementAreaInput").value,titulo:$("requirementTitleInput").value,direcionamento:$("requirementDescriptionInput").value,pergunta:$("requirementQuestionInput").value,meta_padrao:num($("requirementGoalInput").value),ativo:$("requirementActiveInput").value==="true"});$("requirementModal").classList.remove("open");await loadRequirements();toast("Requisito salvo.")}finally{loading(false)}
}
function openGoal(id){
  const r=state.requirements.find(x=>x.requisito_id===id)||{};$("goalRequirementId").value=id;$("goalModalTitle").textContent=selectedChurchId()?`Meta específica — ${r.titulo}`:`Meta global — ${r.titulo}`;$("goalYearInput").value=String(new Date().getFullYear());$("goalValueInput").value=r.meta_padrao??0;$("resetGoalButton").classList.toggle("hidden",!selectedChurchId());$("goalModal").classList.add("open")
}
async function saveGoal(){
  const id=$("goalRequirementId").value,meta=num($("goalValueInput").value),year=+$("goalYearInput").value;loading(true,"Salvando meta...");
  try{if(selectedChurchId())await api("save_church_goal",{igreja_id:selectedChurchId(),requisito_id:id,ano:year,meta});else await api("save_global_goal",{requisito_id:id,meta});$("goalModal").classList.remove("open");await loadRequirements();toast("Meta salva.")}finally{loading(false)}
}
async function resetGoal(){loading(true,"Restaurando meta...");try{await api("reset_church_goal",{igreja_id:selectedChurchId(),requisito_id:$("goalRequirementId").value,ano:+$("goalYearInput").value});$("goalModal").classList.remove("open");await loadRequirements();toast("Meta padrão restaurada.")}finally{loading(false)}}

async function loadMyChurch(){
  const id=selectedChurchId();loading(true,"Carregando igreja...");
  try{const r=await api("get_my_church",{igreja_id:id});state.churchProfile=r.profile||null;state.departments=r.departments||[];renderMyChurch(r)}finally{loading(false)}
}
function renderMyChurch(r={}){
  const p=state.churchProfile||{};$("churchProfileName").textContent=p.igreja||"Selecione uma igreja";const disabled=!p.igreja_id;$("churchEldersInput").value=p.quantidade_anciaos||0;$("churchFamiliesInput").value=p.quantidade_familias||0;$("churchUapgsInput").value=p.quantidade_uapgs||0;$("churchFirstElderInput").value=p.primeiro_anciao_diretor||"";$("churchFirstElderPhoneInput").value=p.contato_primeiro_anciao_diretor||"";$("churchAddressInput").value=p.endereco||"";$("churchEmailInput").value=p.email||"";$("churchNotesInput").value=p.observacoes||"";
  $("churchOfficersChecks").innerHTML=(state.departments||[]).map(d=>`<label class="dept-item-v111"><input type="checkbox" data-dept="${d.departamento_id}" ${d.tem_lider?"checked":""}><span><strong>${esc(d.departamento)}</strong><input type="text" data-dept-name="${d.departamento_id}" value="${esc(d.nome_lider||"")}" placeholder="Nome do líder"></span></label>`).join("");
  ["churchEldersInput","churchFamiliesInput","churchUapgsInput","churchFirstElderInput","churchFirstElderPhoneInput","churchAddressInput","churchEmailInput","churchNotesInput","saveChurchProfileButton"].forEach(id=>$(id).disabled=disabled)
}
async function saveMyChurch(){
  if(!selectedChurchId())return toast("Selecione uma igreja.");loading(true,"Salvando igreja...");
  try{
    await api("save_my_church",{igreja_id:selectedChurchId(),quantidade_anciaos:+$("churchEldersInput").value,quantidade_familias:+$("churchFamiliesInput").value,quantidade_uapgs:+$("churchUapgsInput").value,primeiro_anciao_diretor:$("churchFirstElderInput").value,contato_primeiro_anciao_diretor:$("churchFirstElderPhoneInput").value,endereco:$("churchAddressInput").value,email:$("churchEmailInput").value,observacoes:$("churchNotesInput").value});
    const items=qsa("[data-dept]").map(cb=>({departamento_id:cb.dataset.dept,tem_lider:cb.checked,nome_lider:document.querySelector(`[data-dept-name="${cb.dataset.dept}"]`)?.value||""}));
    await api("save_church_departments_batch",{igreja_id:selectedChurchId(),departamentos:items});await loadMyChurch();toast("Informações salvas.")
  }finally{loading(false)}
}

async function loadReports(){loading(true,"Carregando relatórios...");try{const [r,d]=await Promise.all([api("list_reports",currentRequest()),api("list_difficulties",{})]);state.reports=r.data||[];state.difficulties=d.data||[];renderReports()}finally{loading(false)}}
function renderReports(){
  $("reportDifficultyChecks").innerHTML=(state.difficulties||[]).map(d=>`<label class="check-v101"><input type="checkbox" value="${d.dificuldade_id}"><span>${esc(d.descricao||d.dificuldade||"")}</span></label>`).join("");
  $("reportHistoryList").innerHTML=(state.reports||[]).map(r=>`<article class="report-history-item-v111"><strong>${esc(r.titulo||"Relatório")} — ${esc(r.igreja||"")}</strong><span>${esc(r.data_inicio||"")} a ${esc(r.data_fim||"")} · ${esc(r.gerado_em||"")}</span><div class="report-history-actions-v111"><button data-report-open="${r.relatorio_id}">Visualizar</button><button data-report-pdf="${r.relatorio_id}">PDF</button><button data-report-wa="${r.relatorio_id}">WhatsApp</button><button data-report-edit="${r.relatorio_id}">Editar</button></div></article>`).join("")||'<div class="empty-v111">Nenhum relatório gerado.</div>';
  qsa("[data-report-open]").forEach(b=>b.onclick=()=>openReport(b.dataset.reportOpen));qsa("[data-report-pdf]").forEach(b=>b.onclick=()=>{openReport(b.dataset.reportPdf);setTimeout(()=>window.print(),200)});qsa("[data-report-wa]").forEach(b=>b.onclick=()=>shareReport(b.dataset.reportWa));qsa("[data-report-edit]").forEach(b=>b.onclick=()=>editReport(b.dataset.reportEdit));
  $("aiReportButton").disabled=!selectedChurchId();
}
function markdownToHtml(md){let t=esc(md||"");t=t.replace(/^### (.*)$/gm,"<h3>$1</h3>").replace(/^## (.*)$/gm,"<h2>$1</h2>").replace(/^# (.*)$/gm,"<h1>$1</h1>").replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>");return t}
function openReport(id){const r=state.reports.find(x=>x.relatorio_id===id);if(!r)return;state.currentAiReport=r.conteudo_completo||"";$("aiReportTitle").textContent=r.titulo||"Relatório Completo";$("aiReportContext").textContent=`${r.igreja} · ${r.data_inicio} a ${r.data_fim}`;$("aiReportContent").innerHTML=markdownToHtml(state.currentAiReport);$("aiReportModal").classList.add("open")}
function editReport(id){const r=state.reports.find(x=>x.relatorio_id===id);if(!r)return;state.editingReportId=id;$("editingReportId").value=id;$("editingReportText").value=r.conteudo_completo||"";$("reportEditModal").classList.add("open")}
async function saveEditedReport(){
  const r=state.reports.find(x=>x.relatorio_id===state.editingReportId);if(!r)return;loading(true,"Salvando relatório...");
  try{await api("save_report",{relatorio_id:r.relatorio_id,igreja_id:r.igreja_id,data_inicio:r.data_inicio,data_fim:r.data_fim,titulo:r.titulo,conteudo_completo:$("editingReportText").value,resumo_whatsapp:r.resumo_whatsapp,resultado_geral:r.resultado_geral,status:r.status,observacoes:r.observacoes});$("reportEditModal").classList.remove("open");await loadReports();toast("Relatório atualizado.")}finally{loading(false)}
}
async function shareReport(id){const r=state.reports.find(x=>x.relatorio_id===id);if(!r)return;window.open("https://wa.me/?text="+encodeURIComponent(r.resumo_whatsapp||r.conteudo_completo||r.titulo),"_blank")}
async function generateAI(){
  if(!selectedChurchId())return toast("Selecione uma igreja.");$("aiReportModal").classList.add("open");$("aiReportLoading").classList.remove("hidden");$("aiReportContent").innerHTML="";$("aiReportButton").disabled=true;
  try{const difficulty_ids=qsa("#reportDifficultyChecks input:checked").map(x=>x.value);const r=await api("generate_ai_report",{...currentRequest(),igreja_id:selectedChurchId(),dificuldades:difficulty_ids});const report=r.report||r.data||r;state.currentAiReport=String(report.conteudo_completo||report.report||"");$("aiReportTitle").textContent=report.titulo||"Relatório Completo";$("aiReportContext").textContent=`${selectedChurch()?.igreja||""} · ${state.context.data_inicio} a ${state.context.data_fim}`;$("aiReportContent").innerHTML=markdownToHtml(state.currentAiReport);await loadReports()}catch(e){$("aiReportContent").innerHTML=`<div class="inline-message">${esc(e.message)}</div>`}finally{$("aiReportLoading").classList.add("hidden");$("aiReportButton").disabled=false}
}
async function whatsappSummary(){try{const r=await api("whatsapp_summary",currentRequest());window.open("https://wa.me/?text="+encodeURIComponent(r.text||r.resumo||r.data||""),"_blank")}catch(e){toast(e.message)}}
function exportCSV(){const rows=state.results||[];if(!rows.length)return toast("Nenhum resultado carregado.");const keys=["igreja","data_realizacao","prioridade","titulo","alcancado","plano_acao","responsavel"];const csv=[keys,...rows.map(r=>keys.map(k=>r[k]??""))].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));a.download="prioridades-dsa.csv";a.click();URL.revokeObjectURL(a.href)}

async function loadDeveloper(){if(state.user?.perfil!=="Desenvolvedor")return;loading(true,"Carregando usuários...");try{const r=await api("developer_bootstrap",{});state.developer=r;state.users=r.usuarios||[];if(r.polos)state.scope.polos=r.polos;if(r.distritos)state.scope.distritos=r.distritos;if(r.igrejas)state.scope.igrejas=r.igrejas;if(!state.users.length){const u=await api("list_users_admin",{});state.users=u.data||[]}renderUsers()}finally{loading(false)}}
function renderUsers(){const q=($("userSearch").value||"").toLowerCase(),rows=state.users.filter(u=>`${u.nome} ${u.login} ${u.perfil}`.toLowerCase().includes(q));$("usersCount").textContent=`${rows.length} usuário${rows.length===1?"":"s"}`;$("usersTableBody").innerHTML=rows.map(u=>`<tr><td><strong>${esc(u.nome)}</strong></td><td>${esc(u.perfil)}</td><td>${esc(u.polo_id||"")} / ${esc(u.distrito_id||"")} / ${esc(u.igreja_id||"")}</td><td>${esc(u.login)}</td><td>••••••</td><td><span class="access-pill ${u.ativo?"active":"inactive"}"><i></i>${u.ativo?"Ativo":"Inativo"}</span></td><td><div class="user-actions"><button class="user-action edit" data-user="${u.usuario_id}">Editar</button><button class="user-action toggle" data-toggle="${u.usuario_id}">${u.ativo?"Inativar":"Ativar"}</button></div></td></tr>`).join("");qsa("[data-user]").forEach(b=>b.onclick=()=>openUser(b.dataset.user));qsa("[data-toggle]").forEach(b=>b.onclick=()=>toggleUser(b.dataset.toggle))}
function populateUserTerritory(u={}){
  $("userPoleInput").innerHTML='<option value="">—</option>'+state.scope.polos.map(x=>`<option value="${x.polo_id}">${esc(x.polo)}</option>`).join("");
  $("userDistrictInput").innerHTML='<option value="">—</option>'+state.scope.distritos.map(x=>`<option value="${x.distrito_id}">${esc(x.distrito)}</option>`).join("");
  $("userChurchInput").innerHTML='<option value="">—</option>'+state.scope.igrejas.map(x=>`<option value="${x.igreja_id}">${esc(x.igreja)}</option>`).join("");
  $("userPoleInput").value=u.polo_id||"";$("userDistrictInput").value=u.distrito_id||"";$("userChurchInput").value=u.igreja_id||"";
}
async function openUser(id=""){
  let detail=null,userModules=[];if(id){const r=await api("get_user_admin",{usuario_id:id});detail=r.data||r;userModules=detail.modules||[];detail=detail.user||detail}
  const u=detail||{};$("editingUserId").value=id;$("userModalTitle").textContent=id?"Editar usuário":"Novo usuário";$("userNameInput").value=u.nome||"";$("userRoleInput").value=u.perfil||"Secretário(a)";$("userLoginInput").value=u.login||"";$("userPasswordInput").value="";$("userActiveInput").value=String(u.ativo!==false);populateUserTerritory(u);
  const modulesBase=(state.developer?.modulos||[]);const permittedIds=new Set(userModules.filter(x=>x.permitido).map(x=>x.modulo_id));
  $("userModulesChecks").innerHTML=modulesBase.map(m=>`<label class="check-v101"><input type="checkbox" value="${m.modulo_id}" ${id?permittedIds.has(m.modulo_id):"checked"}><span>${esc(m.titulo||m.modulo)}</span></label>`).join("");$("userModal").classList.add("open")
}
async function saveUser(){
  if(!await reauth())return;const payload={usuario_id:$("editingUserId").value,nome:$("userNameInput").value,login:$("userLoginInput").value,senha:$("userPasswordInput").value,perfil:$("userRoleInput").value,polo_id:$("userPoleInput").value,distrito_id:$("userDistrictInput").value,igreja_id:$("userChurchInput").value,ativo:$("userActiveInput").value==="true"};
  loading(true,"Salvando usuário...");try{const r=await api("save_user_admin",payload);const id=r.usuario_id||payload.usuario_id;await api("save_user_modules_admin",{usuario_id:id,modulos:qsa("#userModulesChecks input").map(x=>({modulo_id:x.value,permitido:x.checked}))});const file=$("userPhotoInput").files[0];if(file){const base64=await fileBase64(file);await api("upload_user_photo_admin",{usuario_id:id,file_name:file.name,mime_type:file.type,base64:base64.split(",")[1]})}$("userModal").classList.remove("open");await loadDeveloper();toast("Usuário salvo.")}finally{loading(false)}
}
function fileBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file)})}
async function toggleUser(id){if(!await reauth())return;const u=state.users.find(x=>x.usuario_id===id);loading(true,"Atualizando acesso...");try{await api(u.ativo?"deactivate_user_admin":"reactivate_user_admin",{usuario_id:id});await loadDeveloper();toast("Acesso atualizado.")}finally{loading(false)}}

function toggleSidebar(){document.body.classList.toggle("sidebar-collapsed");localStorage.setItem("sidebarCollapsed",document.body.classList.contains("sidebar-collapsed")?"1":"0")}
async function presentation(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch(e){toast("Não foi possível alternar o modo apresentação.")}}
let deferredPrompt=null;
function setupPWA(){window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e});$("installButton").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else $("installHelpModal").classList.add("open")};if("serviceWorker"in navigator)navigator.serviceWorker.register("./service-worker.js",{scope:"./"}).catch(console.warn)}

function bind(){
  $("loginButton").onclick=login;["loginEmail","loginCode"].forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter")login()}));$("logoutButton").onclick=logout;
  qsa(".nav-button[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));$("prioritiesToggle").onclick=()=>$("prioritySubmenu").classList.toggle("open");qsa("[data-priority]").forEach(b=>b.onclick=()=>openPriority(b.dataset.priority));
  $("poleFilter").onchange=()=>{fillDistricts();fillChurches()};$("districtFilter").onchange=fillChurches;$("periodMode").onchange=updatePeriodVisibility;$("applyFiltersButton").onclick=applyFilters;$("refreshButton").onclick=applyFilters;
  $("sidebarLogoButton").onclick=toggleSidebar;$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");$("presentationButton").onclick=presentation;
  $("criteriaStatusFilter").onchange=renderPriorities;["goalInputV51","reachedInputV51"].forEach(id=>$(id).oninput=updateLive);$("saveCriterionV51").onclick=saveCriterion;
  $("newTaskButton").onclick=()=>openTaskModal();$("saveTask").onclick=saveTask;$("deleteTask").onclick=deleteTask;
  $("newRequirementButton").onclick=()=>openRequirement();$("saveRequirementButton").onclick=saveRequirement;$("requirementSearch").oninput=renderRequirements;$("saveGoalButton").onclick=saveGoal;$("resetGoalButton").onclick=resetGoal;
  $("saveChurchProfileButton").onclick=saveMyChurch;
  $("aiReportButton").onclick=generateAI;$("printAiReportButton").onclick=()=>window.print();$("shareAiReportButton").onclick=()=>window.open("https://wa.me/?text="+encodeURIComponent(state.currentAiReport),"_blank");$("whatsappButton").onclick=whatsappSummary;$("excelButton").onclick=exportCSV;$("pdfButton").onclick=()=>window.print();$("emailButton").onclick=()=>toast("Envio por e-mail será conectado em atualização posterior.");$("saveEditedReportButton").onclick=saveEditedReport;
  $("newUserButton").onclick=()=>openUser();$("saveUserButton").onclick=saveUser;$("userSearch").oninput=renderUsers;
  qsa("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close)?.classList.remove("open"));
  $("closeInstallHelpButton").onclick=()=>$("installHelpModal").classList.remove("open");
}
async function init(){setupPeriod();bind();setupPWA();if(localStorage.getItem("sidebarCollapsed")==="1")document.body.classList.add("sidebar-collapsed");if(await restore()){startApp();try{await bootstrap()}catch(e){toast(e.message)}}}
document.addEventListener("DOMContentLoaded",init);
})();
