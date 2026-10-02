let DATA={facturas:[],proyectos:[],clientes:[]};
let monthlyChart=null,statusChart=null,annualChart=null;
const MONTHS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const CURRENT_YEAR=new Date().getFullYear();
let projectYearChart=null;
const money=n=>"S/ "+Number(n||0).toLocaleString("es-PE",{minimumFractionDigits:0,maximumFractionDigits:0});
const clean=v=>String(v??"").trim();

async function loadData(){
  try{
    const r=await fetch("/.netlify/functions/getData", {cache:"no-store"});
    const payload=await r.json();
    if(!r.ok) throw new Error(payload.detail || payload.error || ("HTTP "+r.status));
    if(!payload || typeof payload !== "object") throw new Error("Respuesta inválida del servidor.");
    DATA={
      facturas:Array.isArray(payload.Facturas)?payload.Facturas:(Array.isArray(payload.facturas)?payload.facturas:[]),
      proyectos:Array.isArray(payload["Resumen cotizaciones"])?payload["Resumen cotizaciones"]:(Array.isArray(payload.proyectos)?payload.proyectos:[]),
      clientes:Array.isArray(payload.Clientes)?payload.Clientes:(Array.isArray(payload.clientes)?payload.clientes:[])
    };
    setConnectionStatus("Conectado a Google Sheets", true);
  }catch(e){
    console.error("Error de conexión:",e);
    DATA={facturas:[],proyectos:[],clientes:[]};
    setConnectionStatus("Sin conexión · "+e.message, false);
  }
  return DATA;
}
function setConnectionStatus(message, ok){
  document.querySelectorAll("[data-connection-status]").forEach(el=>{
    el.textContent=message;
    el.classList.toggle("connection-ok", !!ok);
    el.classList.toggle("connection-error", !ok);
  });
}

function parseDate(v){if(!v)return null;const s=String(v);let d;if(/^\d{4}-\d{2}-\d{2}/.test(s)){const [y,m,dd]=s.slice(0,10).split("-").map(Number);d=new Date(y,m-1,dd)}else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){const [dd,m,y]=s.split("/").map(Number);d=new Date(y,m-1,dd)}else d=new Date(s);return isNaN(d)?null:d}
function getYear(r){const d=parseDate(r.Fecha||r["Fecha Emisión"]||r.Mes);return d?.getFullYear()||null}
function getMonth(r){const d=parseDate(r.Fecha||r["Fecha Emisión"]||r.Mes);return d?.getMonth()+1||null}
function normalizeInvoice(r){return {Factura:r.Factura||"",Empresa:r.Empresa||"",Codigo:r.Codigo||r.CODIGO||"",Monto:Number(r["Monto S/."]||r.Monto||0),Estado:clean(r.Estado).toUpperCase(),Fecha:r["Fecha Emisión"]||r.Fecha||r.Mes,Pago:r["Fecha de Pago"]||""}}
function normalizeProject(r){return {Codigo:r.Codigo||r.CODIGO||"",Gestor:r.Gestor||"",Monto:Number(r.Monto||0),Estado:clean(r.Estado).toUpperCase(),Fecha:r.Fecha||"",Factura:r.Factura||""}}
function setupFilters(){
  const years=[...new Set(DATA.facturas.map(getYear).filter(Boolean))].sort((a,b)=>b-a);
  const allYears=[...new Set([CURRENT_YEAR,...years])].sort((a,b)=>b-a);
  document.getElementById("yearFilter").innerHTML=allYears.map(y=>`<option value="${y}" ${y===CURRENT_YEAR?"selected":""}>${y}</option>`).join("")+`<option value="all">Todos los años</option>`;
  document.getElementById("monthFilter").innerHTML='<option value="all">Todos los meses</option>'+MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("");
  document.getElementById("yearFilter").onchange=renderDashboard;
  document.getElementById("monthFilter").onchange=renderDashboard;
}
function filteredInvoices(){
  let a=DATA.facturas.map(normalizeInvoice);
  const y=document.getElementById("yearFilter")?.value||"all",m=document.getElementById("monthFilter")?.value||"all";
  return a.filter(r=>(y==="all"||getYear(r)==y)&&(m==="all"||getMonth(r)==m));
}
function renderDashboard(){
  const inv=filteredInvoices(), total=inv.reduce((s,r)=>s+r.Monto,0), paid=inv.filter(r=>r.Estado==="CANCELADO").reduce((s,r)=>s+r.Monto,0), pending=inv.filter(r=>r.Estado==="PENDIENTE").reduce((s,r)=>s+r.Monto,0);
  const proj=DATA.proyectos.map(normalizeProject), toInvoice=proj.filter(r=>["FALTA EMITIR","PENDIENTE"].includes(r.Factura));
  const toInvoiceTotal=toInvoice.reduce((s,r)=>s+r.Monto,0);
  const selectedYear=document.getElementById("yearFilter")?.value||String(CURRENT_YEAR);
  setText("heroTotal",money(total));
  setText("heroPeriod",selectedYear==="all"?"Todos los años":`Año ${selectedYear}`);
  setText("kFacturado",money(total));setText("kCobrado",money(paid));setText("kPendiente",money(pending));setText("kPorFacturar",money(toInvoiceTotal));
  const byMonth=Array(12).fill(0);inv.forEach(r=>{const m=getMonth(r);if(m)byMonth[m-1]+=r.Monto});
  drawMonthly(byMonth);drawStatus(inv);drawAnnualBilling();renderAttention(proj);renderRecent(inv);
}

function drawAnnualBilling(){
  const all=DATA.facturas.map(normalizeInvoice);
  const map={};
  all.forEach(r=>{const y=getYear(r);if(y)map[y]=(map[y]||0)+r.Monto});
  const years=Object.keys(map).map(Number).sort((a,b)=>a-b);
  const values=years.map(y=>map[y]);
  const total=values.reduce((s,v)=>s+v,0);
  const currentYear=Number(document.getElementById("yearFilter")?.value||CURRENT_YEAR);
  const current=map[currentYear]||0;
  const average=years.length?total/years.length:0;
  setText("annualTotal",money(total));
  setText("annualCurrent",money(current));
  setText("annualAverage",money(average));
  setText("annualInvoices",all.length.toLocaleString("es-PE"));
  const ctx=document.getElementById("annualChart");
  if(!ctx)return;
  if(annualChart)annualChart.destroy();
  annualChart=new Chart(ctx,{type:"bar",data:{labels:years,datasets:[{label:"Facturación",data:values,backgroundColor:"rgba(139,124,255,.42)",borderColor:"#8b7cff",borderWidth:1,borderRadius:7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>" S/ "+Number(ctx.raw||0).toLocaleString("es-PE")}}},scales:{x:{grid:{display:false},ticks:{color:"#697384"}},y:{grid:{color:"rgba(36,42,54,.7)"},ticks:{color:"#697384",callback:v=>"S/ "+Number(v).toLocaleString("es-PE")}}}}});
}
function drawMonthly(data){const ctx=document.getElementById("monthlyChart");if(!ctx)return;if(monthlyChart)monthlyChart.destroy();monthlyChart=new Chart(ctx,{type:"bar",data:{labels:MONTHS,datasets:[{data,backgroundColor:"rgba(139,124,255,.42)",borderColor:"#8b7cff",borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:"#697384",font:{size:10}}},y:{grid:{color:"rgba(36,42,54,.7)"},ticks:{color:"#697384",font:{size:9},callback:v=>"S/ "+Number(v).toLocaleString("es-PE")}}}}})}
function drawStatus(inv){const groups={CANCELADO:0,PENDIENTE:0,"NO PAGADO":0,ANULADO:0,OTROS:0};inv.forEach(r=>groups[groups[r.Estado]!=null?r.Estado:"OTROS"]+=r.Monto);const labels=["CANCELADO","PENDIENTE","NO PAGADO","ANULADO","OTROS"];const vals=labels.map(k=>groups[k]);const ctx=document.getElementById("statusChart");if(!ctx)return;if(statusChart)statusChart.destroy();statusChart=new Chart(ctx,{type:"doughnut",data:{labels,datasets:[{data:vals,backgroundColor:["#48c78e","#e7ad55","#ee6b78","#5ca9ff","#4b5362"],borderWidth:0}]},options:{cutout:"70%",plugins:{legend:{display:false}}}});document.getElementById("statusLegend").innerHTML=labels.map((l,i)=>`<div class="legend-row"><span>${l}</span><b>${money(vals[i])}</b></div>`).join("")}
function renderAttention(proj){const rows=proj.filter(r=>["FALTA EMITIR","PENDIENTE"].includes(r.Factura)||r.Estado==="POR APROBAR").slice(0,5);document.getElementById("attentionList").innerHTML=rows.length?rows.map(r=>`<div class="attention"><div><strong>${esc(r.Codigo)}</strong><small>${esc(r.Gestor)} · ${money(r.Monto)}</small></div><span class="badge ${r.Factura==="FALTA EMITIR"?"warn":r.Estado==="POR APROBAR"?"red":"green"}">${esc(r.Factura||r.Estado)}</span></div>`).join(""):'<div class="empty-note">No hay elementos que requieran atención.</div>'}
function renderRecent(inv){const rows=inv.slice().sort((a,b)=>(parseDate(b.Fecha)||0)-(parseDate(a.Fecha)||0)).slice(0,5);document.getElementById("recentInvoices").innerHTML='<div class="mini-row head"><span>Factura</span><span>Empresa</span><span>Monto</span><span>Estado</span></div>'+rows.map(r=>`<div class="mini-row"><span>${esc(r.Factura)}</span><span>${esc(r.Empresa)}</span><span class="money">${money(r.Monto)}</span><span>${esc(r.Estado)}</span></div>`).join("")}
function setupProjectFilters(){const p=DATA.proyectos.map(normalizeProject),states=[...new Set(p.map(x=>x.Estado).filter(Boolean))],years=[...new Set(p.map(getYear).filter(Boolean))].sort((a,b)=>b-a);
  document.getElementById("projectYear").innerHTML=years.length?years.map(y=>`<option value="${y}" ${y===CURRENT_YEAR?"selected":""}>${y}</option>`).join(""):`<option value="${CURRENT_YEAR}">${CURRENT_YEAR}</option>`;
  if(!years.includes(CURRENT_YEAR)) document.getElementById("projectYear").innerHTML=`<option value="all">Todos los años</option>`+years.map(y=>`<option value="${y}">${y}</option>`).join("");
  document.getElementById("projectStatus").innerHTML='<option value="all">Todos los estados</option>'+states.map(s=>`<option>${esc(s)}</option>`).join("");
  document.getElementById("projectYear").onchange=renderProjects;
  drawProjectYearChart(p);
}
function renderProjects(){const p=DATA.proyectos.map(normalizeProject),q=clean(document.getElementById("projectSearch")?.value).toLowerCase(),st=document.getElementById("projectStatus")?.value||"all",yr=document.getElementById("projectYear")?.value||String(CURRENT_YEAR);const rows=p.filter(r=>(yr==="all"||getYear(r)==yr)&&(st==="all"||r.Estado===st)&&(!q||[r.Codigo,r.Gestor,r.Factura].join(" ").toLowerCase().includes(q))).sort((a,b)=>(parseDate(b.Fecha)||0)-(parseDate(a.Fecha)||0));const pScope=p.filter(r=>yr==="all"||getYear(r)==yr);setText("projectCount",rows.length+" registros");setText("pAprobar",pScope.filter(r=>r.Estado==="POR APROBAR").length);setText("pEntregados",pScope.filter(r=>r.Estado==="ENTREGADO").length);setText("pFalta",pScope.filter(r=>r.Factura==="FALTA EMITIR").length);setText("pPagados",pScope.filter(r=>["CANCELADO","PAGADO"].includes(r.Factura)).length);document.getElementById("projectBody").innerHTML=rows.slice(0,150).map(r=>`<tr><td><b>${esc(r.Codigo)}</b></td><td>${esc(r.Gestor)}</td><td class="money">${money(r.Monto)}</td><td><span class="badge ${r.Estado==="ENTREGADO"?"green":r.Estado==="POR APROBAR"?"red":"warn"}">${esc(r.Estado)}</span></td><td>${formatDate(r.Fecha)}</td><td>${esc(r.Factura)}</td><td><button class="icon-btn" onclick="alert('El detalle/modal se implementará con el vínculo al registro de Google Sheets.')">→</button></td></tr>`).join("")}
function setupInvoiceFilters(){const inv=DATA.facturas.map(normalizeInvoice),states=[...new Set(inv.map(x=>x.Estado).filter(Boolean))],years=[...new Set(inv.map(getYear).filter(Boolean))].sort((a,b)=>b-a);
  const yf=document.getElementById("invoiceYear");
  yf.innerHTML=`<option value="all">Todos los años</option>`+years.map(y=>`<option value="${y}" ${y===CURRENT_YEAR?"selected":""}>${y}</option>`).join("");
  if(!years.includes(CURRENT_YEAR) && years.length) yf.value=String(years[0]);
  yf.onchange=renderInvoices;
  document.getElementById("invoiceStatus").innerHTML='<option value="all">Todos los estados</option>'+states.map(s=>`<option>${esc(s)}</option>`).join("")
}
function renderInvoices(){const all=DATA.facturas.map(normalizeInvoice),q=clean(document.getElementById("invoiceSearch")?.value).toLowerCase(),st=document.getElementById("invoiceStatus")?.value||"all",yr=document.getElementById("invoiceYear")?.value||"all";const rows=all.filter(r=>(yr==="all"||getYear(r)==yr)&&(st==="all"||r.Estado===st)&&(!q||[r.Factura,r.Empresa,r.Codigo].join(" ").toLowerCase().includes(q))).sort((a,b)=>(parseDate(b.Fecha)||0)-(parseDate(a.Fecha)||0));const scope=all.filter(r=>yr==="all"||getYear(r)==yr);setText("iTotal",scope.length);setText("iPaid",scope.filter(r=>r.Estado==="CANCELADO").length);setText("iPending",scope.filter(r=>r.Estado==="PENDIENTE").length);setText("iUnpaid",scope.filter(r=>r.Estado==="NO PAGADO").length);setText("invoiceCount",rows.length+" registros");document.getElementById("invoiceBody").innerHTML=rows.slice(0,250).map(r=>`<tr><td><b>${esc(r.Factura)}</b></td><td>${esc(r.Empresa)}</td><td>${esc(r.Codigo)}</td><td>${formatDate(r.Fecha)}</td><td class="money">${money(r.Monto)}</td><td><span class="badge ${r.Estado==="CANCELADO"?"green":r.Estado==="ANULADO"?"red":"warn"}">${esc(r.Estado||"—")}</span></td><td>${formatDate(r.Pago)}</td></tr>`).join("")}
function renderClients(){const c=DATA.clientes||[];document.getElementById("clientsList").innerHTML=c.slice(0,100).map(x=>`<div class="data-item"><strong>${esc(x.Empresa||x.Nombre||"—")}</strong><small>${esc(x.RUC||x.Observacion||"")}</small></div>`).join("")||'<div class="empty-note">Los clientes se cargarán desde Google Sheets.</div>'}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v}
function formatDate(v){const d=parseDate(v);return d?d.toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit",year:"numeric"}):"—"}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function drawProjectYearChart(p){const ctx=document.getElementById("projectYearChart");if(!ctx)return;const map={};p.forEach(r=>{const y=getYear(r);if(y)map[y]=(map[y]||0)+r.Monto});const years=Object.keys(map).map(Number).sort((a,b)=>a-b);if(projectYearChart)projectYearChart.destroy();projectYearChart=new Chart(ctx,{type:"bar",data:{labels:years,datasets:[{label:"Monto",data:years.map(y=>map[y]),backgroundColor:"rgba(139,124,255,.42)",borderColor:"#8b7cff",borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:"#697384"}},y:{grid:{color:"rgba(36,42,54,.7)"},ticks:{color:"#697384",callback:v=>"S/ "+Number(v).toLocaleString("es-PE")}}}}})}
