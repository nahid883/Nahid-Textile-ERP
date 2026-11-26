/* Nahid Textile ERP - Cloud add-on (login + roles + shared data via Supabase + PWA). Load AFTER the main script. */
(function(){
"use strict";
const SB=window.supabase.createClient("https://fqzwwplzizuncsjljcbr.supabase.co","sb_publishable_Npk6ThHaEr071InxR18YPQ_sX5r_NnU");
const $=id=>document.getElementById(id), wait=ms=>new Promise(r=>setTimeout(r,ms));
const KV=["orders","manualOrders","mainData","newData","categories","grey_report"], P=["p1","p2","p3"];
const pd=(v,p)=>(v&&v[p])||[], pe=(v,p)=>((v&&v.entries)||[]).filter(e=>e.person===p);
const oPut=idbPut,oGet=idbGet,oSave=saveCategoryFile,oDel=deleteCategoryFile;
let me=null,booted="",rt=null,busy=false,again=false,st=null;
const base={},pend={},timers={},lastPay={};
const isAdmin=()=>me&&me.role==="admin", canWrite=()=>me&&me.active&&(me.role==="admin"||me.role==="editor");
/* Daily Work (FOC / RFD / Finish Reconciliation) Submit-e role check-এর জন্য — viewer hole false */
window.__erpCanWrite=canWrite;window.__erpIsAdmin=isAdmin;window.__erpRole=()=>me?me.role:null;
const ver=()=>{try{return JSON.parse(localStorage.getItem("erp_ver")||"{}")}catch(e){return{}}};
const setVer=o=>localStorage.setItem("erp_ver",JSON.stringify(o));

/* ---------- styles ---------- */
const css=document.createElement("style");
css.textContent=`#authGate{position:fixed;inset:0;z-index:10000;background:var(--bg);display:none;align-items:center;justify-content:center;padding:16px}
#authGate .box{background:#fff;padding:24px;border-radius:12px;max-width:380px;width:100%;box-shadow:var(--shadow)}
body.auth-lock .container{display:none}
@media(min-width:700px){nav{grid-template-columns:repeat(auto-fit,minmax(110px,1fr))!important}}
body[data-role=viewer] #entry,body[data-role=viewer] nav [data-page=entry],body[data-role=viewer] nav [data-page=wip],body[data-role=viewer] nav [data-page=matching],body[data-role=viewer] #threeSheetsUploadContainer{display:none!important}
body[data-role=viewer] nav [data-page=dailyWork],body[data-role=viewer] #dailyWork,body[data-role=viewer] nav [data-page=update],body[data-role=viewer] #update{display:none!important}
body:not([data-role=admin]) #deleteDeliveryBtn,body:not([data-role=admin]) #deleteOrderStatusBtn,body:not([data-role=admin]) #deleteWipBtn,body:not([data-role=admin]) #deleteGreyBtn,body:not([data-role=admin]) #clearOrdersBtn,body:not([data-role=admin]) #orderTable .danger,body:not([data-role=admin]) #wipReset{display:none!important}`;
document.head.appendChild(css);
document.body.classList.add("auth-lock");

/* ---------- compress / decompress ---------- */
async function pack(v){
 const s=new Blob([JSON.stringify(v===undefined?null:v)]).stream().pipeThrough(new CompressionStream("gzip"));
 const u=new Uint8Array(await new Response(s).arrayBuffer());let b="";
 for(let i=0;i<u.length;i+=8192)b+=String.fromCharCode.apply(null,u.subarray(i,i+8192));
 return btoa(b);
}
async function unpack(t){
 const u=Uint8Array.from(atob(t),c=>c.charCodeAt(0));
 return JSON.parse(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}

/* ---------- push to cloud ---------- */
function push(key,val){
 if(!canWrite())return;
 pend[key]=val;clearTimeout(timers[key]);timers[key]=setTimeout(()=>flush(key),700);
}
async function flush(key){
 if(!(key in pend))return;
 const val=pend[key];delete pend[key];
 try{
  const payload=await pack(val);
  if(lastPay[key]===payload)return;
  const {data,error}=await SB.from("erp_store").upsert({key,payload}).select("updated_at").single();
  if(error)throw error;
  lastPay[key]=payload;const v=ver();v[key]=data.updated_at;setVer(v);
 }catch(e){console.error(e);showToast("Cloud save failed: "+(e.message||e),"error",7000);}
}
async function delKey(key){
 const {error}=await SB.from("erp_store").delete().eq("key",key);
 if(error){showToast("Cloud delete failed: "+error.message,"error");return;}
 const v=ver();delete v[key];setVer(v);delete lastPay[key];
}

/* ---------- hook the existing local-save functions ---------- */
window.idbPut=async function(store,key,val){
 await oPut(store,key,val);
 if(store!=="app_data")return;
 if(KV.includes(key))push("kv:"+key,val);
 else if(key==="wip_data")P.forEach(p=>{const s=JSON.stringify(pd(val,p));if(s!==base["d"+p]){base["d"+p]=s;push("wipd:"+p,pd(val,p));}});
 else if(key==="wip_excel")P.forEach(p=>{const s=JSON.stringify(pe(val,p));if(s!==base["e"+p]){base["e"+p]=s;push("wipe:"+p,{at:(val&&val.submittedAt)||"",entries:pe(val,p)});}});
};
window.idbGet=async function(store,key){
 const v=await oGet(store,key);
 if(store==="app_data"&&key==="wip_data")P.forEach(p=>base["d"+p]=JSON.stringify(pd(v,p)));
 if(store==="app_data"&&key==="wip_excel")P.forEach(p=>base["e"+p]=JSON.stringify(pe(v,p)));
 return v;
};
window.saveCategoryFile=async function(c,d){
 if(!canWrite()){showToast("View only account: cannot upload.","error");throw new Error("view only");}
 await oSave(c,d);push("file:"+c,d);
};
window.deleteCategoryFile=async function(c){
 if(!isAdmin()){showToast("Only Admin can delete.","error");throw new Error("admin only");}
 await oDel(c);await delKey("file:"+c);
};

/* ---------- pull from cloud ---------- */
async function apply(key,val){
 const i=key.indexOf(":"),t=key.slice(0,i),n=key.slice(i+1);
 if(t==="file"){if(val===undefined)await oDel(n);else await oSave(n,val);}
 else if(t==="kv")await oPut("app_data",n,val===undefined?null:val);
 else if(t==="wipd"){const c=(await oGet("app_data","wip_data"))||{p1:[],p2:[],p3:[]};c[n]=val||[];await oPut("app_data","wip_data",c);}
 else if(t==="wipe"){
  const c=(await oGet("app_data","wip_excel"))||{submittedAt:"",entries:[]};
  const en=(c.entries||[]).filter(e=>e.person!==n).concat((val&&val.entries)||[]);
  const at=[c.submittedAt,val&&val.at].filter(Boolean).sort().pop()||"";
  await oPut("app_data","wip_excel",en.length?{submittedAt:at,entries:en}:null);
 }
}
async function refresh(){
 await loadInitialState();renderOrders();renderMatching();await refreshUploadedSheetsUI();
 if(window.__greyReload)await window.__greyReload();
 if(window.__wipReload)window.__wipReload();
}
const idbAll=s=>new Promise((res,rej)=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
async function hasLocal(){return (await idbAll("files")).length>0||(await idbAll("app_data")).some(r=>r.val&&(!Array.isArray(r.val)||r.val.length));}
async function pushAllLocal(){
 showLoading("Uploading this device's data to cloud...");
 for(const f of await idbAll("files"))pend["file:"+f.category]=f.data;
 for(const r of await idbAll("app_data")){
  if(KV.includes(r.key))pend["kv:"+r.key]=r.val;
  else if(r.key==="wip_data")P.forEach(p=>pend["wipd:"+p]=pd(r.val,p));
  else if(r.key==="wip_excel")P.forEach(p=>pend["wipe:"+p]={at:(r.val&&r.val.submittedAt)||"",entries:pe(r.val,p)});
 }
 await Promise.all(Object.keys(pend).map(flush));
 hideLoading();showToast("Data uploaded to cloud. Other users will see it now.","success",6000);
}
async function doSync(first){
 const {data:list,error}=await SB.from("erp_store").select("key,updated_at");
 if(error){showToast("Cloud read failed: "+error.message,"error");return;}
 if(!list.length&&first&&canWrite()&&await hasLocal()&&confirm("Cloud is empty. Upload the data saved on THIS device to the cloud now?")){await pushAllLocal();return;}
 const v=ver(),srv={};list.forEach(r=>srv[r.key]=r.updated_at);
 const changed=list.filter(r=>v[r.key]!==r.updated_at).map(r=>r.key);
 const gone=Object.keys(v).filter(k=>!(k in srv));
 if(!changed.length&&!gone.length)return;
 for(const key of changed){
  const {data,error:e}=await SB.from("erp_store").select("payload").eq("key",key).single();
  if(e)continue;
  await apply(key,await unpack(data.payload));lastPay[key]=data.payload;v[key]=srv[key];
 }
 for(const key of gone){await apply(key,undefined);delete v[key];}
 setVer(v);await refresh();
}
async function syncDown(first){
 if(busy){again=true;return;}
 busy=true;
 try{await doSync(first);}catch(e){console.error(e);}
 finally{busy=false;if(again){again=false;sched();}}
}
function sched(){clearTimeout(st);st=setTimeout(()=>{if(me&&me.active)syncDown(false);},1200);}
function startRT(){
 if(rt)SB.removeChannel(rt);
 rt=SB.channel("erp").on("postgres_changes",{event:"*",schema:"public",table:"erp_store"},sched).subscribe();
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)sched();});
setInterval(()=>{if(!document.hidden)sched();},60000);

/* ---------- login screen ---------- */
function gate(html){
 let g=$("authGate");
 if(!g){g=document.createElement("div");g.id="authGate";document.body.appendChild(g);}
 g.innerHTML=html;g.style.display="flex";document.body.classList.add("auth-lock");
}
function loginUI(up,msg){
 gate(`<div class="box"><h2 style="display:block;margin-bottom:6px">NAHID TEXTILE ERP</h2><p class="muted" style="margin:0 0 10px">${up?"Request access":"Login"}</p>
 <label>Email</label><input id="aEmail" type="email" autocomplete="username">
 ${up?'<label>Full name</label><input id="aName" autocomplete="name">':""}
 <label>Password${up?" (min 8 characters)":""}</label><input id="aPass" type="password" autocomplete="${up?"new-password":"current-password"}">
 <button id="aGo" style="width:100%">${up?"Create account":"Login"}</button>
 <p class="muted" id="aMsg"></p><p class="muted"><a href="#" id="aSw">${up?"Already have an account? Login":"New user? Request access"}</a></p></div>`);
 $("aMsg").textContent=msg||"";
 $("aSw").onclick=e=>{e.preventDefault();loginUI(!up);};
 const go=async()=>{
  const email=$("aEmail").value.trim(),password=$("aPass").value;
  if(!email||!password){$("aMsg").textContent="Enter email and password.";return;}
  $("aGo").disabled=true;
  if(up){
   if(password.length<8){$("aMsg").textContent="Password must be at least 8 characters.";$("aGo").disabled=false;return;}
   const {data,error}=await SB.auth.signUp({email,password,options:{data:{full_name:($("aName").value||"").trim()}}});
   if(error){$("aMsg").textContent=error.message;$("aGo").disabled=false;return;}
   if(!data.session)loginUI(false,"Account created. Confirm your email if asked, then login. Admin must approve you.");
  }else{
   const {error}=await SB.auth.signInWithPassword({email,password});
   if(error){$("aMsg").textContent="Login failed: "+error.message;$("aGo").disabled=false;}
  }
 };
 $("aGo").onclick=go;
 $("aPass").addEventListener("keydown",e=>{if(e.key==="Enter")go();});
}
function pendingUI(u){
 gate(`<div class="box"><h2 style="display:block">Waiting for approval</h2><p class="muted">Your account (${"<b id='pe'></b>"}) is created but not active yet. Ask the Admin to approve it.</p>
 <button id="aRe" style="width:100%">Check again</button><button id="aOut" class="outline" style="width:100%;margin-top:8px">Logout</button></div>`);
 $("pe").textContent=u.email;
 $("aRe").onclick=()=>{booted="";boot(u);};
 $("aOut").onclick=logout;
}
async function wipeLocal(){
 await Promise.all(Object.keys(pend).map(flush));
 await new Promise(r=>{const t=db.transaction(["files","app_data"],"readwrite");t.objectStore("files").clear();t.objectStore("app_data").clear();t.oncomplete=r;t.onerror=r;});
 localStorage.removeItem("erp_ver");
}
async function logout(){
 try{await wipeLocal();}catch(e){}
 await SB.auth.signOut();location.reload();
}

/* ---------- after login ---------- */
function header(){
 let b=$("cloudBar");
 if(!b){b=document.createElement("div");b.id="cloudBar";b.style.cssText="margin-top:8px;font-size:12px;color:#cce3f9;display:flex;gap:10px;align-items:center;flex-wrap:wrap";document.querySelector("header").appendChild(b);}
 b.innerHTML='<span id="cbT"></span><button class="small outline" id="cbOut" style="color:#fff;border-color:#fff">Logout</button>';
 $("cbT").textContent="☁️ "+me.email+" • "+me.role;
 $("cbOut").onclick=logout;
}
function usersPage(){
 if($("usersPage")||!isAdmin())return;
 const btn=document.createElement("button");btn.dataset.page="usersPage";btn.textContent="👤 Users";
 btn.onclick=()=>{switchPage("usersPage");loadUsers();};document.querySelector("nav").appendChild(btn);
 const sec=document.createElement("section");sec.id="usersPage";sec.className="page";
 sec.innerHTML='<h2>👤 Users</h2><p class="muted">New people sign up on the login screen, then you activate them here. Admin = everything, Editor = upload/enter data, Viewer = view only.</p><div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Active</th><th></th></tr></thead><tbody id="uBody"></tbody></table></div>';
 document.querySelector(".container").insertBefore(sec,document.querySelector("footer"));
}
async function loadUsers(){
 const {data,error}=await SB.from("erp_profiles").select("*").order("created_at");
 const b=$("uBody");b.innerHTML="";
 if(error){showToast(error.message,"error");return;}
 data.forEach(u=>{
  const tr=document.createElement("tr"),self=u.id===me.id;
  [u.email,u.full_name||""].forEach(t=>{const td=document.createElement("td");td.textContent=t;tr.appendChild(td);});
  const sel=document.createElement("select");sel.style.margin="0";
  ["admin","editor","viewer"].forEach(r=>{const o=document.createElement("option");o.value=o.textContent=r;sel.appendChild(o);});
  sel.value=u.role;sel.disabled=self;
  const act=document.createElement("input");act.type="checkbox";act.checked=u.active;act.disabled=self;act.style.cssText="width:auto;margin:0";
  const save=document.createElement("button");save.className="small";save.textContent="Save";save.disabled=self;
  save.onclick=async()=>{
   const {error:e}=await SB.from("erp_profiles").update({role:sel.value,active:act.checked}).eq("id",u.id);
   showToast(e?e.message:"Saved",e?"error":"success");
  };
  [sel,act,save].forEach(x=>{const td=document.createElement("td");td.appendChild(x);tr.appendChild(td);});
  b.appendChild(tr);
 });
}
async function boot(u){
 booted=u.id;
 let prof=null;
 const {data,error}=await SB.from("erp_profiles").select("*").eq("id",u.id).single();
 if(!error&&data){prof=data;localStorage.setItem("erp_me",JSON.stringify(data));}
 else{try{const c=JSON.parse(localStorage.getItem("erp_me")||"null");if(c&&c.id===u.id)prof=c;}catch(e){}}
 if(!prof){gate('<div class="box"><p>Could not load your profile. Check internet and reload.</p></div>');booted="";return;}
 me=prof;
 if(!me.active){pendingUI(u);return;}
 while(!db)await wait(100);
 document.body.dataset.role=me.role;
 $("authGate").style.display="none";document.body.classList.remove("auth-lock");
 header();usersPage();
 showLoading("Syncing with cloud...");
 await syncDown(true);
 hideLoading();startRT();
}
SB.auth.onAuthStateChange((ev,s)=>{
 setTimeout(()=>{
  if(!s){me=null;booted="";loginUI(false);return;}
  if(booted!==s.user.id)boot(s.user);
 },0);
});
loginUI(false);

/* ---------- PWA ---------- */
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
