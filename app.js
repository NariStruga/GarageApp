/* ═══════════════════════════════════════════════════════════════
   GARAGE. — Ultimate Car OS
   Complete Application Logic v4
   ═══════════════════════════════════════════════════════════════ */

const G = (() => {
  'use strict';

  /* ═══ STATE ═══ */
  let db = null;
  let carId = null;        // active car
  let tab = 'fuel';        // active tab
  let editId = null;       // item being edited
  let editType = '';       // 'car','fuel','svc','part'
  let tmpPhotos = [];      // temp photos for forms
  let deferredInstall = null;
  let sheetCb = null;

  const STORES = ['cars','fuels','services','parts'];
  const CATEGORIES = [
    'Motor','Kühlung','Kraftstoff','Ansaugung','Abgas','Getriebe','Kupplung',
    'Differential','Fahrwerk','Lenkung','Bremsen','Räder & Reifen','Elektrik',
    'Batterie','Beleuchtung','Innenraum','Außen','Karosserie','Rost','Flüssigkeiten',
    'Sensoren','ECU / Tuning','Klimaanlage','Sicherheit','Sonstiges'
  ];

  /* ═══ INDEXEDDB ═══ */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('GarageOS', 3);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, {keyPath:'id'}); });
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e);
    });
  }

  function dbPut(store, obj) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(obj);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e);
    });
  }

  function dbGet(store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = e => reject(e);
    });
  }

  function dbAll(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = e => reject(e);
    });
  }

  function dbDel(store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e);
    });
  }

  /* ═══ HELPERS ═══ */
  const $ = id => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = s => { if(!s) return ''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
  const today = () => new Date().toISOString().slice(0,10);
  const fmtD = d => { if(!d) return '–'; const p=d.split('-'); return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:d; };
  const fmtN = n => n ? parseFloat(n).toLocaleString('de-DE') : '0';
  const fmtE = n => n ? parseFloat(n).toFixed(2).replace('.',',')+' €' : '–';

  /* ═══ TOAST ═══ */
  let toastT = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('on'), 2400);
  }

  /* ═══ CONFIRM SHEET ═══ */
  function confirm(title, msg, btnTxt, cb) {
    $('shTitle').textContent = title;
    $('shMsg').textContent = msg;
    $('shOk').textContent = btnTxt || 'Löschen';
    sheetCb = cb;
    $('shBg').classList.add('on');
  }
  function closeSheet() { $('shBg').classList.remove('on'); sheetCb = null; }

  /* ═══ IMAGE VIEWER ═══ */
  function viewImg(src) { $('vwImg').src = src; $('vw').classList.add('on'); }
  function closeVw() { $('vw').classList.remove('on'); setTimeout(()=>$('vwImg').src='',300); }

  /* ═══ IMAGE COMPRESSION ═══ */
  function compressImg(file, maxDim=1200, maxKB=500) {
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          let w=img.width, h=img.height;
          if(w>maxDim||h>maxDim){ if(w>=h){h=Math.round(h*maxDim/w);w=maxDim}else{w=Math.round(w*maxDim/h);h=maxDim} }
          c.width=w; c.height=h;
          c.getContext('2d').drawImage(img,0,0,w,h);
          let q=0.7, res=c.toDataURL('image/jpeg',q);
          while(res.length>maxKB*1370&&q>0.15){q-=0.08;res=c.toDataURL('image/jpeg',q);}
          resolve(res);
        };
        img.onerror=()=>resolve(null);
        img.src=e.target.result;
      };
      r.onerror=()=>resolve(null);
      r.readAsDataURL(file);
    });
  }

  /* ═══ PHOTO HELPERS ═══ */
  async function processFiles(files, arr, renderFn) {
    for(const f of files){ const b=await compressImg(f); if(b) arr.push(b); }
    renderFn();
  }

  function renderPhotos(gridId, arr, delCb) {
    const g=$(gridId);
    if(!arr.length){g.innerHTML='';return;}
    g.innerHTML=arr.map((s,i)=>`
      <div class="pg-th">
        <img src="${s}" alt="Foto ${i+1}">
        <button class="pg-th-x" data-i="${i}">×</button>
      </div>`).join('');
    g.querySelectorAll('img').forEach(img=>img.addEventListener('click',e=>{e.stopPropagation();viewImg(img.src);}));
    g.querySelectorAll('.pg-th-x').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();delCb(parseInt(b.dataset.i));}));
  }

  /* ═══ NAVIGATION ═══ */
  function nav(page, opts) {
    document.querySelectorAll('.pg').forEach(p=>{p.classList.remove('on');p.style.display='none';});
    document.querySelectorAll('.nb').forEach(n=>n.classList.remove('on'));

    const el = $(page);
    if(!el) return;
    el.style.display='';
    void el.offsetWidth;
    el.classList.add('on');
    window.scrollTo({top:0,behavior:'instant'});

    switch(page){
      case 'pgHome': renderHome(); hlNav('home'); break;
      case 'pgAddCar': initCarForm(opts); hlNav('add'); break;
      case 'pgDetail': renderDetail(); hlNav('home'); break;
      case 'pgAddFuel': initFuelForm(opts); break;
      case 'pgAddSvc': initSvcForm(opts); break;
      case 'pgAddPart': initPartForm(opts); break;
      case 'pgCosts': renderCosts(); hlNav('costs'); break;
      case 'pgBackup': hlNav('more'); break;
    }
  }

  function hlNav(n) { document.querySelectorAll('.nb').forEach(b=>b.classList.toggle('on',b.dataset.n===n)); }

  /* ═══ HOME PAGE ═══ */
  async function renderHome() {
    const cars = await dbAll('cars');
    const list = $('homeList');
    const empty = $('homeEmpty');
    const addBtn = $('homeAdd');

    if(!cars.length){ list.innerHTML=''; empty.style.display=''; addBtn.style.display='none'; return; }
    empty.style.display='none'; addBtn.style.display='';

    let html = '';
    for(const car of cars){
      const fuels = (await dbAll('fuels')).filter(f=>f.carId===car.id);
      const svcs = (await dbAll('services')).filter(s=>s.carId===car.id);
      const parts = (await dbAll('parts')).filter(p=>p.carId===car.id);
      const totalCost = (car.purchasePrice||0)
        + fuels.reduce((s,f)=>s+(f.price||0),0)
        + svcs.reduce((s,e)=>s+(e.costParts||0)+(e.costLabor||0),0)
        + parts.reduce((s,p)=>s+(p.price||0),0);

      html += `<div class="cd" onclick="G.openCar('${car.id}')"><div class="cc">
        ${car.photos&&car.photos.length
          ?`<img class="cc-img" src="${car.photos[0]}" alt="${esc(car.name)}">`
          :`<div class="cc-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0013.7 5H10.3c-.6 0-1.2.3-1.6.8L6 9l-2.5 1.1C2.7 10.7 2 11.5 2 12.4V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg></div>`}
        <div class="cc-bd"><h3>${esc(car.name)}</h3>
          <p>${esc(car.model||'')}${car.year?' · '+car.year:''}${totalCost?' · '+fmtN(Math.round(totalCost))+' €':''}</p>
        </div>
        <div class="cc-arr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div></div>`;
    }
    list.innerHTML = html;
  }

  function openCar(id) { carId=id; tab='fuel'; nav('pgDetail'); }

  /* ═══ ADD / EDIT CAR ═══ */
  function initCarForm(opts) {
    editId = opts&&opts.edit ? opts.edit : null;
    editType = 'car';
    $('carHd').textContent = editId ? 'Auto bearbeiten' : 'Neues Auto';
    $('delCar').style.display = editId ? '' : 'none';

    if(editId){
      dbGet('cars',editId).then(car=>{
        if(!car)return;
        $('fCName').value=car.name||'';
        $('fCModel').value=car.model||'';
        $('fCYear').value=car.year||'';
        $('fCEngine').value=car.engine||'';
        $('fCTrans').value=car.transmission||'';
        $('fCVin').value=car.vin||'';
        $('fCKm').value=car.mileage||'';
        $('fCPDate').value=car.purchaseDate||'';
        $('fCPrice').value=car.purchasePrice||'';
        $('fCNotes').value=car.notes||'';
        tmpPhotos=car.photos?[...car.photos]:[];
        renderPhotos('carPG',tmpPhotos,i=>{tmpPhotos.splice(i,1);renderPhotos('carPG',tmpPhotos,i=>{tmpPhotos.splice(i,1);renderCarPhotos();});});
      });
    } else {
      ['fCName','fCModel','fCYear','fCEngine','fCTrans','fCVin','fCKm','fCPDate','fCPrice','fCNotes'].forEach(id=>$(id).value='');
      tmpPhotos=[];
    }
    renderCarPhotos();
  }

  function renderCarPhotos() {
    renderPhotos('carPG',tmpPhotos,i=>{tmpPhotos.splice(i,1);renderCarPhotos();});
  }

  async function saveCar() {
    const name=$('fCName').value.trim();
    if(!name){toast('Bitte Name eingeben');return;}
    const obj={
      name, model:$('fCModel').value.trim(), year:$('fCYear').value.trim(),
      engine:$('fCEngine').value.trim(), transmission:$('fCTrans').value,
      vin:$('fCVin').value.trim(), mileage:parseInt($('fCKm').value)||0,
      purchaseDate:$('fCPDate').value, purchasePrice:parseFloat($('fCPrice').value)||0,
      notes:$('fCNotes').value.trim(), photos:tmpPhotos
    };
    if(editId){ obj.id=editId; await dbPut('cars',obj); carId=editId; toast('Auto aktualisiert ✓'); nav('pgDetail'); }
    else { obj.id=uid(); obj.createdAt=today(); await dbPut('cars',obj); carId=obj.id; toast('Auto hinzugefügt ✓'); nav('pgDetail'); }
  }

  function deleteCar() {
    confirm('Auto löschen?','Alle Daten (Tankfüllungen, Wartungen, Teile) werden unwiderruflich gelöscht.','Endgültig löschen',async()=>{
      const id=editId;
      await dbDel('cars',id);
      const fuels=await dbAll('fuels'); for(const f of fuels){if(f.carId===id)await dbDel('fuels',f.id);}
      const svcs=await dbAll('services'); for(const s of svcs){if(s.carId===id)await dbDel('services',s.id);}
      const parts=await dbAll('parts'); for(const p of parts){if(p.carId===id)await dbDel('parts',p.id);}
      toast('Auto gelöscht'); nav('pgHome');
    });
  }

  /* ═══ CAR DETAIL ═══ */
  async function renderDetail() {
    const car = await dbGet('cars',carId);
    if(!car){nav('pgHome');return;}

    $('btnEditCar').onclick=()=>nav('pgAddCar',{edit:car.id});

    // Header
    let hd='';
    if(car.photos&&car.photos.length) hd+=`<img class="hero" src="${car.photos[0]}" alt="${esc(car.name)}" onclick="G.viewImg(this.src)">`;
    hd+=`<h1 style="margin-bottom:3px">${esc(car.name)}</h1>`;
    hd+=`<p style="color:var(--txt2);font-size:.86rem;margin-bottom:4px">${esc(car.model||'')}${car.year?' · Bj. '+car.year:''}${car.engine?' · '+esc(car.engine):''}</p>`;
    if(car.mileage) hd+=`<p style="color:var(--txt3);font-size:.78rem;margin-bottom:18px">${fmtN(car.mileage)} km${car.vin?' · VIN: '+esc(car.vin):''}</p>`;
    else hd+=`<div style="height:18px"></div>`;

    // Dashboard Stats
    const fuels=(await dbAll('fuels')).filter(f=>f.carId===carId);
    const svcs=(await dbAll('services')).filter(s=>s.carId===carId);
    const parts=(await dbAll('parts')).filter(p=>p.carId===carId);

    const fuelCost=fuels.reduce((s,f)=>s+(f.price||0),0);
    const svcCost=svcs.reduce((s,e)=>s+(e.costParts||0)+(e.costLabor||0),0);
    const partCost=parts.reduce((s,p)=>s+(p.price||0),0);
    const totalInvest=(car.purchasePrice||0)+fuelCost+svcCost+partCost;

    // Health score
    const overdue=svcs.filter(s=>s.nextDueDate&&s.nextDueDate<today()).length;
    const healthPct=Math.max(0,100-overdue*20);
    const healthCls=healthPct>=70?'good':healthPct>=40?'warn':'bad';

    hd+=`<div class="st-g">
      <div class="st-b"><div class="lb">Investition</div><div class="vl">${fmtN(Math.round(totalInvest))}<span class="un">€</span></div></div>
      <div class="st-b ${healthPct>=70?'grn':healthPct>=40?'':' red'}"><div class="lb">Zustand</div><div class="vl">${healthPct}%</div><div class="hbar"><div class="hbar-fill ${healthCls}" style="width:${healthPct}%"></div></div></div>
    </div>`;

    $('detailHd').innerHTML=hd;
    switchTab(tab);
  }

  function switchTab(t) {
    tab=t;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
    ['panelFuel','panelSvc','panelParts'].forEach(id=>$(id).style.display='none');
    if(t==='fuel'){$('panelFuel').style.display='';renderFuels();}
    else if(t==='svc'){$('panelSvc').style.display='';renderSvcs();}
    else if(t==='parts'){$('panelParts').style.display='';renderParts();}
  }

  /* ═══ FUEL CRUD ═══ */
  function initFuelForm(opts) {
    editId=opts&&opts.edit?opts.edit:null; editType='fuel';
    $('fuelHd').textContent=editId?'Eintrag bearbeiten':'Neue Tankfüllung';
    $('delFuel').style.display=editId?'':'none';
    if(editId){
      dbGet('fuels',editId).then(f=>{
        if(!f)return;
        $('fFDate').value=f.date||'';$('fFLiters').value=f.liters||'';
        $('fFPrice').value=f.price||'';$('fFKm').value=f.km||'';
        $('fFStation').value=f.station||'';$('fFNotes').value=f.notes||'';
        $('fFFull').checked=f.fullTank!==false;
      });
    } else {
      $('fFDate').value=today();['fFLiters','fFPrice','fFKm','fFStation','fFNotes'].forEach(id=>$(id).value='');
      $('fFFull').checked=true;
    }
  }

  async function saveFuel() {
    const liters=parseFloat($('fFLiters').value);
    if(!liters||liters<=0){toast('Bitte Liter eingeben');return;}
    const obj={
      carId, date:$('fFDate').value||today(), liters,
      price:parseFloat($('fFPrice').value)||0,
      km:parseInt($('fFKm').value)||0,
      station:$('fFStation').value.trim(),
      notes:$('fFNotes').value.trim(),
      fullTank:$('fFFull').checked
    };
    if(editId){obj.id=editId;await dbPut('fuels',obj);toast('Aktualisiert ✓');}
    else{obj.id=uid();await dbPut('fuels',obj);toast('Tankfüllung gespeichert ✓');}
    tab='fuel';nav('pgDetail');
  }

  function deleteFuel() {
    confirm('Tankfüllung löschen?','Dieser Eintrag wird unwiderruflich gelöscht.','Löschen',async()=>{
      await dbDel('fuels',editId);toast('Gelöscht');tab='fuel';nav('pgDetail');
    });
  }

  async function renderFuels() {
    const fuels=(await dbAll('fuels')).filter(f=>f.carId===carId).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const stats=$('fuelStats');const list=$('fuelList');const empty=$('fuelEmpty');

    if(!fuels.length){list.innerHTML='';stats.innerHTML='';empty.style.display='';return;}
    empty.style.display='none';

    const totalL=fuels.reduce((s,f)=>s+(f.liters||0),0);
    const totalC=fuels.reduce((s,f)=>s+(f.price||0),0);
    let avg='–';
    const wk=fuels.filter(f=>f.km>0&&f.fullTank!==false).sort((a,b)=>a.km-b.km);
    if(wk.length>=2){const d=wk[wk.length-1].km-wk[0].km;const l=wk.slice(1).reduce((s,f)=>s+(f.liters||0),0);if(d>0)avg=(l/d*100).toFixed(1);}
    let avgP='–';if(totalL>0&&totalC>0)avgP=(totalC/totalL).toFixed(2);

    stats.innerHTML=`
      <div class="st-b"><div class="lb">Ø Verbrauch</div><div class="vl">${avg}<span class="un">L/100km</span></div></div>
      <div class="st-b blu"><div class="lb">Ø Preis/L</div><div class="vl">${avgP}<span class="un">€</span></div></div>
      <div class="st-b"><div class="lb">Gesamt L</div><div class="vl">${totalL.toFixed(0)}<span class="un">L</span></div></div>
      <div class="st-b red"><div class="lb">Gesamtkosten</div><div class="vl">${totalC.toFixed(0)}<span class="un">€</span></div></div>`;

    list.innerHTML=fuels.map((f,i)=>`
      <div class="er" style="animation-delay:${i*.03}s" onclick="G.nav('pgAddFuel',{edit:'${f.id}'})">
        <div class="er-dot fuel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16"/><path d="M13 10h4a2 2 0 012 2v10"/></svg></div>
        <div class="er-bd"><div class="tt">${f.liters} Liter${f.station?' · '+esc(f.station):''}</div><div class="mt">${fmtD(f.date)}${f.km?' · '+fmtN(f.km)+' km':''}</div></div>
        <div class="er-end"><div class="am">${f.price?fmtE(f.price):'–'}</div>${f.price&&f.liters?`<div class="su">${(f.price/f.liters).toFixed(3)} €/L</div>`:''}</div>
      </div>`).join('');
  }

  /* ═══ SERVICE / MAINTENANCE CRUD ═══ */
  function initSvcForm(opts) {
    editId=opts&&opts.edit?opts.edit:null; editType='svc';
    $('svcHd').textContent=editId?'Wartung bearbeiten':'Neue Wartung';
    $('delSvc').style.display=editId?'':'none';

    // Build category select
    const sel=$('fSCat');
    if(sel.options.length<=1){
      CATEGORIES.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
    }

    if(editId){
      dbGet('services',editId).then(s=>{
        if(!s)return;
        $('fSTitle').value=s.title||'';$('fSCat').value=s.category||'';
        $('fSDate').value=s.date||'';$('fSKm').value=s.km||'';
        $('fSCostP').value=s.costParts||'';$('fSCostL').value=s.costLabor||'';
        $('fSTime').value=s.timeSpent||'';$('fSWorkshop').value=s.workshop||'';
        $('fSDiff').value=s.difficulty||'';$('fSStatus').value=s.status||'done';
        $('fSPriority').value=s.priority||'normal';
        $('fSPartNums').value=s.partNumbers||'';
        $('fSNotes').value=s.notes||'';
        $('fSNextKm').value=s.nextDueKm||'';$('fSNextDate').value=s.nextDueDate||'';
        tmpPhotos=s.photos?[...s.photos]:[];
        renderSvcPhotos();
      });
    } else {
      ['fSTitle','fSKm','fSCostP','fSCostL','fSTime','fSWorkshop','fSPartNums','fSNotes','fSNextKm','fSNextDate'].forEach(id=>$(id).value='');
      $('fSDate').value=today();$('fSCat').value='';$('fSDiff').value='';$('fSStatus').value='done';$('fSPriority').value='normal';
      tmpPhotos=[];
      renderSvcPhotos();
    }
  }

  function renderSvcPhotos() {
    renderPhotos('svcPG',tmpPhotos,i=>{tmpPhotos.splice(i,1);renderSvcPhotos();});
  }

  async function saveSvc() {
    const title=$('fSTitle').value.trim();
    if(!title){toast('Bitte Titel eingeben');return;}
    const obj={
      carId, title, category:$('fSCat').value, date:$('fSDate').value||today(),
      km:parseInt($('fSKm').value)||0,
      costParts:parseFloat($('fSCostP').value)||0,
      costLabor:parseFloat($('fSCostL').value)||0,
      timeSpent:$('fSTime').value.trim(),
      workshop:$('fSWorkshop').value.trim(),
      difficulty:$('fSDiff').value,
      status:$('fSStatus').value||'done',
      priority:$('fSPriority').value||'normal',
      partNumbers:$('fSPartNums').value.trim(),
      notes:$('fSNotes').value.trim(),
      nextDueKm:parseInt($('fSNextKm').value)||0,
      nextDueDate:$('fSNextDate').value,
      photos:tmpPhotos
    };
    if(editId){obj.id=editId;await dbPut('services',obj);toast('Wartung aktualisiert ✓');}
    else{obj.id=uid();await dbPut('services',obj);toast('Wartung gespeichert ✓');}
    tab='svc';nav('pgDetail');
  }

  function deleteSvc() {
    confirm('Wartung löschen?','Dieser Eintrag wird unwiderruflich gelöscht.','Löschen',async()=>{
      await dbDel('services',editId);toast('Gelöscht');tab='svc';nav('pgDetail');
    });
  }

  async function renderSvcs() {
    const svcs=(await dbAll('services')).filter(s=>s.carId===carId).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const stats=$('svcStats');const list=$('svcList');const empty=$('svcEmpty');

    if(!svcs.length){list.innerHTML='';stats.innerHTML='';empty.style.display='';return;}
    empty.style.display='none';

    const totalCP=svcs.reduce((s,e)=>s+(e.costParts||0),0);
    const totalCL=svcs.reduce((s,e)=>s+(e.costLabor||0),0);
    const overdue=svcs.filter(s=>s.nextDueDate&&s.nextDueDate<today()).length;

    stats.innerHTML=`
      <div class="st-b"><div class="lb">Einträge</div><div class="vl">${svcs.length}</div></div>
      <div class="st-b"><div class="lb">Teilekosten</div><div class="vl">${totalCP.toFixed(0)}<span class="un">€</span></div></div>
      <div class="st-b blu"><div class="lb">Arbeitskosten</div><div class="vl">${totalCL.toFixed(0)}<span class="un">€</span></div></div>
      <div class="st-b ${overdue?'red':'grn'}"><div class="lb">Überfällig</div><div class="vl">${overdue}</div></div>`;

    list.innerHTML=svcs.map((s,i)=>{
      const cost=(s.costParts||0)+(s.costLabor||0);
      const statusTag=s.status==='planned'?'<span class="tag tag-b">Geplant</span>':s.status==='progress'?'<span class="tag tag-o">In Arbeit</span>':'';
      const overTag=s.nextDueDate&&s.nextDueDate<today()?'<span class="tag tag-r">Überfällig</span>':'';
      return `<div class="er" style="animation-delay:${i*.03}s" onclick="G.nav('pgAddSvc',{edit:'${s.id}'})">
        <div class="er-dot svc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg></div>
        <div class="er-bd"><div class="tt">${esc(s.title)} ${statusTag}${overTag}</div>
          <div class="mt">${fmtD(s.date)}${s.category?' · '+esc(s.category):''}${s.photos&&s.photos.length?' · '+s.photos.length+' Foto'+(s.photos.length>1?'s':''):''}</div>
          <div class="pdf-l" onclick="event.stopPropagation();G.exportPDF('${s.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>PDF</div>
        </div>
        <div class="er-end"><div class="am">${cost?fmtE(cost):'–'}</div></div>
      </div>`;
    }).join('');
  }

  /* ═══ PARTS CRUD ═══ */
  function initPartForm(opts) {
    editId=opts&&opts.edit?opts.edit:null; editType='part';
    $('partHd').textContent=editId?'Teil bearbeiten':'Neues Teil';
    $('delPart').style.display=editId?'':'none';

    if(editId){
      dbGet('parts',editId).then(p=>{
        if(!p)return;
        $('fPName').value=p.name||'';$('fPBrand').value=p.brand||'';
        $('fPNum').value=p.partNum||'';$('fPPrice').value=p.price||'';
        $('fPDate').value=p.installDate||'';$('fPLife').value=p.lifespan||'';
        $('fPType').value=p.type||'installed';$('fPNotes').value=p.notes||'';
      });
    } else {
      ['fPName','fPBrand','fPNum','fPPrice','fPDate','fPLife','fPNotes'].forEach(id=>$(id).value='');
      $('fPType').value='installed';
    }
  }

  async function savePart() {
    const name=$('fPName').value.trim();
    if(!name){toast('Bitte Name eingeben');return;}
    const obj={
      carId, name, brand:$('fPBrand').value.trim(),
      partNum:$('fPNum').value.trim(),
      price:parseFloat($('fPPrice').value)||0,
      installDate:$('fPDate').value,
      lifespan:$('fPLife').value.trim(),
      type:$('fPType').value||'installed',
      notes:$('fPNotes').value.trim()
    };
    if(editId){obj.id=editId;await dbPut('parts',obj);toast('Teil aktualisiert ✓');}
    else{obj.id=uid();await dbPut('parts',obj);toast('Teil gespeichert ✓');}
    tab='parts';nav('pgDetail');
  }

  function deletePart() {
    confirm('Teil löschen?','Dieser Eintrag wird unwiderruflich gelöscht.','Löschen',async()=>{
      await dbDel('parts',editId);toast('Gelöscht');tab='parts';nav('pgDetail');
    });
  }

  async function renderParts() {
    const parts=(await dbAll('parts')).filter(p=>p.carId===carId).sort((a,b)=>(b.installDate||'').localeCompare(a.installDate||''));
    const stats=$('partStats');const list=$('partList');const empty=$('partEmpty');

    if(!parts.length){list.innerHTML='';stats.innerHTML='';empty.style.display='';return;}
    empty.style.display='none';

    const totalC=parts.reduce((s,p)=>s+(p.price||0),0);
    const installed=parts.filter(p=>p.type==='installed').length;

    stats.innerHTML=`
      <div class="st-b"><div class="lb">Gesamt</div><div class="vl">${parts.length}</div></div>
      <div class="st-b pur"><div class="lb">Verbaut</div><div class="vl">${installed}</div></div>
      <div class="st-b"><div class="lb">Teilekosten</div><div class="vl">${totalC.toFixed(0)}<span class="un">€</span></div></div>`;

    list.innerHTML=parts.map((p,i)=>`
      <div class="er" style="animation-delay:${i*.03}s" onclick="G.nav('pgAddPart',{edit:'${p.id}'})">
        <div class="er-dot part"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
        <div class="er-bd"><div class="tt">${esc(p.name)}${p.brand?' · '+esc(p.brand):''}</div>
          <div class="mt">${fmtD(p.installDate)}${p.partNum?' · #'+esc(p.partNum):''} · <span class="tag ${p.type==='installed'?'tag-g':'tag-b'}">${p.type==='installed'?'Verbaut':'Lager'}</span></div></div>
        <div class="er-end"><div class="am">${p.price?fmtE(p.price):'–'}</div></div>
      </div>`).join('');
  }

  /* ═══ COST ANALYTICS ═══ */
  async function renderCosts() {
    const cars=await dbAll('cars');
    if(!cars.length){$('costsContent').innerHTML='<div class="ey"><h3>Keine Daten</h3><p>Füge zuerst ein Auto hinzu.</p></div>';return;}

    let totalPurchase=0,totalFuel=0,totalSvc=0,totalParts=0;
    for(const car of cars){
      totalPurchase+=(car.purchasePrice||0);
      const f=(await dbAll('fuels')).filter(x=>x.carId===car.id);
      totalFuel+=f.reduce((s,x)=>s+(x.price||0),0);
      const sv=(await dbAll('services')).filter(x=>x.carId===car.id);
      totalSvc+=sv.reduce((s,x)=>s+(x.costParts||0)+(x.costLabor||0),0);
      const p=(await dbAll('parts')).filter(x=>x.carId===car.id);
      totalParts+=p.reduce((s,x)=>s+(x.price||0),0);
    }
    const total=totalPurchase+totalFuel+totalSvc+totalParts;

    // Simple bar chart
    const max=Math.max(totalPurchase,totalFuel,totalSvc,totalParts,1);
    const bar=(val,color)=>`<div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-top:4px"><div style="height:100%;width:${(val/max*100).toFixed(1)}%;background:var(--${color});border-radius:4px;transition:width .6s var(--ease)"></div></div>`;

    $('costsContent').innerHTML=`
      <div class="st-b cd-s" style="text-align:center;padding:24px;margin-bottom:20px">
        <div class="lb">GESAMTINVESTITION</div>
        <div style="font-family:var(--mono);font-size:2.2rem;font-weight:700;color:var(--accent);letter-spacing:-0.04em;margin-top:4px">${fmtN(Math.round(total))} €</div>
      </div>
      <div style="margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;font-size:.84rem"><span>Kaufpreis</span><span style="font-family:var(--mono);font-weight:600">${fmtN(Math.round(totalPurchase))} €</span></div>${bar(totalPurchase,'accent')}
        <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-top:14px"><span>Kraftstoff</span><span style="font-family:var(--mono);font-weight:600">${fmtN(Math.round(totalFuel))} €</span></div>${bar(totalFuel,'blue')}
        <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-top:14px"><span>Wartung & Service</span><span style="font-family:var(--mono);font-weight:600">${fmtN(Math.round(totalSvc))} €</span></div>${bar(totalSvc,'green')}
        <div style="display:flex;justify-content:space-between;font-size:.84rem;margin-top:14px"><span>Teile & Upgrades</span><span style="font-family:var(--mono);font-weight:600">${fmtN(Math.round(totalParts))} €</span></div>${bar(totalParts,'purple')}
      </div>`;
  }

  /* ═══ PDF EXPORT ═══ */
  async function exportPDF(svcId) {
    const car=await dbGet('cars',carId);
    const entry=await dbGet('services',svcId);
    if(!car||!entry){toast('Fehler');return;}
    if(!window.jspdf){toast('PDF-Bibliothek lädt...');return;}

    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const m=20;let y=20;

    // Header bar
    doc.setFillColor(9,9,11);doc.rect(0,0,210,48,'F');
    doc.setTextColor(217,169,98);doc.setFontSize(22);doc.setFont('helvetica','bold');
    doc.text('GARAGE.',m,y+8);
    doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(148,148,163);
    doc.text('Wartungsbericht',m,y+15);
    y=54;

    doc.setDrawColor(217,169,98);doc.setLineWidth(0.5);doc.line(m,y,190,y);y+=12;

    // Car
    doc.setTextColor(120);doc.setFontSize(8);doc.text('FAHRZEUG',m,y);y+=6;
    doc.setTextColor(30);doc.setFontSize(12);doc.setFont('helvetica','bold');
    doc.text(car.name+(car.model?' – '+car.model:'')+(car.year?' ('+car.year+')':''),m,y);y+=12;

    // Fields
    const fields=[
      ['TITEL',entry.title||'–'],['KATEGORIE',entry.category||'–'],
      ['DATUM',fmtD(entry.date)],['KM-STAND',entry.km?fmtN(entry.km)+' km':'–'],
      ['TEILEKOSTEN',entry.costParts?entry.costParts.toFixed(2)+' €':'–'],
      ['ARBEITSKOSTEN',entry.costLabor?entry.costLabor.toFixed(2)+' €':'–'],
      ['STATUS',entry.status==='planned'?'Geplant':entry.status==='progress'?'In Arbeit':'Erledigt'],
      ['WERKSTATT / DIY',entry.workshop||'–'],
      ['TEILENUMMERN',entry.partNumbers||'–']
    ];
    fields.forEach(([l,v])=>{
      doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(120);doc.text(l,m,y);
      doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(30);doc.text(String(v),m+38,y);
      y+=8;
    });

    if(entry.notes){
      y+=4;doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(120);doc.text('NOTIZEN',m,y);y+=5;
      doc.setFontSize(9);doc.setTextColor(50);
      const lines=doc.splitTextToSize(entry.notes,160);doc.text(lines,m,y);y+=lines.length*5+4;
    }

    if(entry.photos&&entry.photos.length){
      y+=6;doc.setFontSize(7);doc.setTextColor(120);doc.text('FOTOS / BELEGE',m,y);y+=6;
      for(const img of entry.photos){
        if(y>235){doc.addPage();y=20;}
        try{doc.addImage(img,'JPEG',m,y,70,52);y+=58;}catch{}
      }
    }

    const pgs=doc.getNumberOfPages();
    for(let i=1;i<=pgs;i++){
      doc.setPage(i);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(160);
      doc.text('GARAGE. · '+fmtD(today())+' · Seite '+i+'/'+pgs,m,290);
    }

    const safe=entry.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\-]/g,'_').toLowerCase();
    doc.save('garage-wartung-'+safe+'-'+(entry.date||'x')+'.pdf');
    toast('PDF heruntergeladen ✓');
  }

  /* ═══ BACKUP / RESTORE ═══ */
  async function exportBackup() {
    const data={};
    for(const s of STORES) data[s]=await dbAll(s);
    data._meta={version:4,exportedAt:new Date().toISOString(),app:'GARAGE. Car OS'};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;
    a.download='garage-backup-'+today()+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Backup exportiert ✓');
  }

  async function importBackup(file) {
    try {
      const text=await file.text();
      const data=JSON.parse(text);
      for(const s of STORES){
        if(data[s]&&Array.isArray(data[s])){
          for(const item of data[s]) await dbPut(s,item);
        }
      }
      toast('Backup importiert ✓');
      nav('pgHome');
    } catch(e) { toast('Fehler beim Import: '+e.message); }
  }

  /* ═══ EVENT BINDING ═══ */
  function bind() {
    // Car
    $('saveCarBtn').addEventListener('click',saveCar);
    $('delCar').addEventListener('click',deleteCar);
    $('carUZ').addEventListener('click',()=>$('carFI').click());
    $('carFI').addEventListener('change',async e=>{await processFiles(e.target.files,tmpPhotos,renderCarPhotos);e.target.value='';});

    // Fuel
    $('saveFuelBtn').addEventListener('click',saveFuel);
    $('delFuel').addEventListener('click',deleteFuel);

    // Service
    $('saveSvcBtn').addEventListener('click',saveSvc);
    $('delSvc').addEventListener('click',deleteSvc);
    $('svcUZ').addEventListener('click',()=>$('svcFI').click());
    $('svcFI').addEventListener('change',async e=>{await processFiles(e.target.files,tmpPhotos,renderSvcPhotos);e.target.value='';});

    // Parts
    $('savePartBtn').addEventListener('click',savePart);
    $('delPart').addEventListener('click',deletePart);

    // Viewer
    $('vw').addEventListener('click',e=>{if(e.target===$('vw'))closeVw();});
    $('vwX').addEventListener('click',e=>{e.stopPropagation();closeVw();});

    // Sheet
    $('shBg').addEventListener('click',e=>{if(e.target===$('shBg'))closeSheet();});
    $('shNo').addEventListener('click',closeSheet);
    $('shOk').addEventListener('click',()=>{if(sheetCb){sheetCb();closeSheet();}});

    // Backup
    $('btnExport').addEventListener('click',exportBackup);
    $('btnImport').addEventListener('click',()=>$('importFI').click());
    $('importFI').addEventListener('change',e=>{if(e.target.files[0])importBackup(e.target.files[0]);e.target.value='';});

    // PWA
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('instBar').classList.add('on');});
    $('instBtn').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();const r=await deferredInstall.userChoice;if(r.outcome==='accepted')$('instBar').classList.remove('on');deferredInstall=null;});
    $('instDm').addEventListener('click',()=>$('instBar').classList.remove('on'));

    // Escape
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeVw();closeSheet();}});
  }

  /* ═══ SERVICE WORKER ═══ */
  function regSW() {
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW:',e));
    }
  }

  /* ═══ INIT ═══ */
  async function init() {
    await openDB();
    bind();
    regSW();
    nav('pgHome');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();

  /* ═══ PUBLIC ═══ */
  return { nav, openCar, switchTab, viewImg, exportPDF };
})();
