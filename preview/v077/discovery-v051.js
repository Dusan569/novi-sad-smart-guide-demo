/* v0.5.1 — calm map and guided tour overview. No estimated multi-stop walking route. */
(function(){
'use strict';
const label=(sr,en)=>state.lang==='sr'?sr:en;
const nativeExplore=explore;
const nativeUpdateMarkers=updateMarkers;
const nativeOpenDiscoveryTour=window.openDiscoveryTour;
const nativeRoutePanel=routePanel;
const nativeCloseRoute=closeRoute;
const nativeUpdateNavigationHUD=updateNavigationHUD;
const nativeApplyPosition=applyPosition;
const nativeNavigateTourStop=window.navigateTourStop;
const tourById=id=>(window.NSSG_DISCOVERY_WALKS||[]).find(w=>w.id===id);
const distKm=(a,b)=>{
 const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad, dlng=(b.lng-a.lng)*rad;
 const s=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
 return 12742*Math.atan2(Math.sqrt(s),Math.sqrt(Math.max(0,1-s)));
};
let tourPreview=null,allPins=false,showVenuePins=false;
const currentStops=()=>tourPreview?.ids.map((id,i)=>{
 const p=places.find(x=>x.id===id);
 return p&&{lat:p.lat,lng:p.lng,label:name(p),number:i+1,id:p.id,click:()=>openPlace(p.id)};
}).filter(Boolean)||[];
const panelEl=()=>document.getElementById('tourOverviewPanel');

const TOUR_SESSION_KEY='nssg-active-tour-v067';
function readTourSession(){
 try{
   const raw=JSON.parse(localStorage.getItem(TOUR_SESSION_KEY)||'null');
   const walk=raw&&tourById(raw.id);
   if(raw?.version!==1||!walk||!Array.isArray(raw.completed))return null;
   return {id:walk.id,completed:raw.completed.filter(id=>walk.ids.includes(id)),startedAt:Number(raw.startedAt)||Date.now()};
 }catch(_){return null;}
}
let savedTourSession=readTourSession();
function saveTourSession(){
 if(!tourPreview)return;
 savedTourSession={id:tourPreview.id,completed:tourPreview.completed.slice(),startedAt:tourPreview.startedAt||Date.now()};
 try{localStorage.setItem(TOUR_SESSION_KEY,JSON.stringify({version:1,...savedTourSession}));}catch(_){}
}
function forgetTourSession(){
 savedTourSession=null;
 try{localStorage.removeItem(TOUR_SESSION_KEY);}catch(_){}
}
function tourStateForUI(){
 const data=tourPreview||savedTourSession;
 if(!data)return null;
 const walk=tourById(data.id);if(!walk)return null;
 const completed=(data.completed||[]).filter(id=>walk.ids.includes(id));
 const nextId=walk.ids.find(id=>!completed.includes(id));
 return {walk,completed,next:nextId?places.find(p=>p.id===nextId):null,
   currentNumber:nextId?walk.ids.indexOf(nextId)+1:walk.ids.length,
   active:!!tourPreview,arrived:false};
}
function renderPersistentTour(){
 let bar=document.getElementById('nssgPersistentTour');
 if(!bar){bar=document.createElement('aside');bar.id='nssgPersistentTour';bar.setAttribute('aria-label',label('Tvoj aktivni obilazak','Your active tour'));document.body.appendChild(bar);}
 const info=tourStateForUI();
 if(!info){bar.hidden=true;return;}
 // On the map, the numbered stops and bottom tour overview are the primary controls.
 const mapOverview=state.page==='explore'&&!!tourPreview&&!!panelEl();
 if(mapOverview){bar.hidden=true;return;}
 bar.hidden=false;
 const {walk,next,completed,currentNumber,active}=info;
 const near=next&&gpsFixUsable()&&state.locationAccuracy<=80&&distKm(state.position,next)*1000<=70;
 const nextName=next?escapeHTML(name(next)):label('Sve stanice su završene','All stops completed');
 const status=near?label('📍 Stigao si blizu stanice','📍 Near your next stop'):
    !active?label('Sačuvan obilazak · nastavi','Saved tour · resume'):
    label('Obilazak je u toku','Your walk is active');
 bar.innerHTML='<div class="tour-sticky-copy"><span class="tour-sticky-eyebrow">🚶 '+escapeHTML(status)+'</span>'+
   '<strong>'+escapeHTML(label(walk.titleSr,walk.titleEn))+'</strong>'+
   '<small>'+currentNumber+'/'+walk.ids.length+' · '+nextName+' · '+completed.length+'/'+walk.ids.length+' ✓</small></div>'+
   '<div class="tour-sticky-actions">'+
   '<button type="button" data-tour-action="resume">'+label('🗺 Nastavi','🗺 Resume')+'</button>'+
   (next?'<button type="button" data-tour-action="story">'+label('📖 Priča','📖 Story')+'</button>':'')+
   (next&&active?'<button type="button" data-tour-action="done">'+label('✓ Obiđeno','✓ Visited')+'</button>':'')+
   '<button type="button" data-tour-action="finish" class="tour-sticky-finish">'+label('Završi','Finish')+'</button></div>';
 bar.querySelector('[data-tour-action="resume"]').addEventListener('click',resumeTour);
 bar.querySelector('[data-tour-action="story"]')?.addEventListener('click',()=>{
   if(next)openPlace(next.id);
 });
 bar.querySelector('[data-tour-action="done"]')?.addEventListener('click',markNextStop);
 bar.querySelector('[data-tour-action="finish"]').addEventListener('click',()=>finishTour());
}
function resumeTour(){
 const saved=readTourSession();
 if(!tourPreview){
   if(saved)window.previewDiscoveryTour(saved.id);
   return;
 }
 closeModal();
 if(state.page!=='explore')showPage('explore');
 else if(state.map){
   if(state.activeRoute?.isTour&&state.activeRoute.coords?.length){
     state.map.fitRoute(state.activeRoute.coords,{top:68,bottom:180,left:35,right:35,maxZoom:16});
   }else fitTour();
   renderTourOverview();
 }
 renderPersistentTour();
}
function markNextStop(){
 const info=tourStateForUI(),p=info?.next;
 if(!info?.active||!p)return;
 const shade=document.getElementById('modalShade');
 const hadModal=!!shade&&!shade.classList.contains('hidden');
 window.toggleTourStop(info.walk.id,p.id);
 if(!hadModal)closeModal();
}

/* v0.6.9: a proper, focused walking experience. Tour preview is planning;
 * pressing Start is an explicit transition to foreground navigation. */
function ensureMapEmergencyExit(){
 let btn=document.getElementById('nssgMapEmergencyExit');
 if(btn)return btn;
 btn=document.createElement('button');
 btn.type='button';btn.id='nssgMapEmergencyExit';
 btn.textContent=label('← Nazad iz mape','← Exit map');
 btn.setAttribute('aria-label',label('Vrati se iz prikaza mape preko celog ekrana','Exit full-screen map'));
 btn.addEventListener('click',()=>{
   pauseGuidedWalk();
   if(state.page==='explore'&&!state.map)showPage('explore');
 });
 document.body.appendChild(btn);
 return btn;
}
function walkHudElements(){
 const wrap=document.querySelector('.discovery-map-wrap.calm-map');
 if(!wrap)return null;
 let hud=wrap.querySelector('#nssgWalkHud');
 if(hud)return hud;
 hud=document.createElement('section');
 hud.id='nssgWalkHud';
 hud.className='nssg-walk-hud hidden';
 hud.setAttribute('aria-label',label('Vođenje kroz grad','Guided city walk'));
 hud.innerHTML='<div class="nssg-walk-top">'+
   '<div class="nssg-walk-turn"><span class="nssg-walk-arrow" aria-hidden="true">↗</span>'+
   '<div class="nssg-walk-turn-copy"><strong id="walkNextInstruction"></strong>'+
   '<small id="walkInstructionDistance"></small></div></div>'+
   '<button class="nssg-walk-pause" id="walkPause" type="button">'+label('← Nazad','← Back')+'</button></div>'+
   '<div class="nssg-walk-bottom"><div class="nssg-walk-target">'+
   '<div><span class="nssg-walk-kicker" id="walkStopProgress"></span>'+
   '<strong id="walkStopName"></strong><small id="walkStopDistance"></small>'+
   '<p id="walkStoryTeaser" class="hidden"></p></div>'+
   '<button type="button" class="nssg-walk-recenter" id="walkRecenter" aria-label="'+label('Vrati me na moju lokaciju','Recenter on my location')+'">⌖</button>'+
   '</div><div class="nssg-walk-buttons">'+
   '<button type="button" id="walkStory" class="nssg-walk-primary">'+label('📖 Priča','📖 Story')+'</button>'+
   '<button type="button" id="walkVisited">'+label('✓ Obiđeno','✓ Visited')+'</button>'+
   '<button type="button" id="walkStations">'+label('Stanice','Stops')+'</button></div></div>';
 wrap.appendChild(hud);
 hud.querySelector('#walkPause').addEventListener('click',()=>{
   if(tourPreview?.mapPeekPlaceId){focusGuidedCamera();return;}
   pauseGuidedWalk();
 });
 hud.querySelector('#walkRecenter').addEventListener('click',focusGuidedCamera);
 hud.querySelector('#walkStory').addEventListener('click',()=>{
   const stop=remainingTourStops()[0];if(stop)openPlace(stop.id);
 });
 hud.querySelector('#walkVisited').addEventListener('click',markNextStop);
 hud.querySelector('#walkStations').addEventListener('click',()=>{
   if(tourPreview)window.openDiscoveryTour(tourPreview.id);
 });
 return hud;
}
function focusGuidedCamera(){
 if(!tourPreview?.guiding||!state.map)return;
 tourPreview.mapPeekPlaceId=null;
 // Expired or inaccurate GPS must never move the camera or resume follow mode.
 if(!gpsFixUsable()){
   state.followMode=false;
   showToast(label('GPS signal nije pouzdan — sačekaj novu lokaciju.','GPS signal unreliable — wait for a fresh location.'));
   updateWalkHud();
   return;
 }
 state.followMode=true;
 if(state.fromGps){
   state.map.easeTo({center:[state.position.lng,state.position.lat],
     zoom:Math.max(16,Math.min(17.3,state.map.getZoom()>17.3?17.3:16.7)),duration:400});
   if(state.compassEnabled&&state.headingSource==='compass')state.map.setBearing(state.heading);
 }else{
   showToast(label('Lokacija nije dostupna — uključi GPS.','Location unavailable — enable GPS.'));
 }
 updateWalkHud();
}
function showTourLandmarkOnMap(id){
 if(!tourPreview?.guiding||state.page!=='explore'||!state.map)return false;
 const landmark=places.find(p=>p.id===id);
 if(!landmark)return false;
 tourPreview.mapPeekPlaceId=id;
 state.followMode=false;
 state.map.easeTo({center:[landmark.lng,landmark.lat],zoom:16.5,duration:350});
 // No rerender, no modal-overlaid map replacement and no new route request.
 const hud=walkHudElements();
 hud?.classList.remove('hidden');
 updateWalkHud();
 return true;
}
function startGuidedWalk(){
 if(!tourPreview)return;
 if(!state.activeRoute?.isTour||!state.activeRoute.coords?.length){
   showToast(label('Prvo sačekaj da Google izračuna rutu.','Please wait for Google to calculate the walking route.'));
   return;
 }
 if(!tourPreview.routeFromGps||!gpsFixUsable()){
   // Never pretend to navigate from the user if their fix was denied or stale.
   tourPreview.pendingGuidedStart=true;
   enableTourGps();return;
 }
 tourPreview.pendingGuidedStart=false;
 tourPreview.guiding=true;
 tourPreview.mapPeekPlaceId=null;
 state.followMode=true;
 ensureMapEmergencyExit();
 closeModal();
 hideRoutePanel();
 const hud=walkHudElements();
 if(!hud){tourPreview.guiding=false;return;}
 document.body.classList.add('nssg-guided-active');
 hud.classList.remove('hidden');
 panelEl()?.classList.add('hidden');
 renderPersistentTour();
 if(state.navWatchId===null)startRouteTracking();
 updateWalkHud();
 requestAnimationFrame(()=>requestAnimationFrame(focusGuidedCamera));
}
function pauseGuidedWalk(){
 if(tourPreview){tourPreview.guiding=false;tourPreview.mapPeekPlaceId=null;}
 document.body.classList.remove('nssg-guided-active');
 document.getElementById('nssgWalkHud')?.classList.add('hidden');
 // Pausing leaves the itinerary/progress saved, but stops foreground tracking.
 if(state.navWatchId!==null)stopRouteTracking();
 renderTourOverview();renderPersistentTour();
 if(state.map&&state.activeRoute?.isTour){
   state.map.fitRoute(state.activeRoute.coords,{top:68,bottom:150,left:35,right:35,maxZoom:16});
 }
}
function updateWalkHud(){
 const hud=document.getElementById('nssgWalkHud');
 if(!hud||!tourPreview?.guiding)return;
 const route=state.activeRoute,stop=remainingTourStops()[0];
 const set=(id,value)=>{const n=hud.querySelector('#'+id);if(n)n.textContent=value;};
 const peek=tourPreview.mapPeekPlaceId&&places.find(p=>p.id===tourPreview.mapPeekPlaceId);
 set('walkPause',peek?label('← Na rutu','← To route'):label('← Nazad','← Back'));
 if(peek){
   set('walkNextInstruction',label('Razgledaš znamenitost','Viewing a landmark'));
   set('walkInstructionDistance',name(peek)+' · '+label('Dodirni „Na rutu” da nastaviš','Tap “To route” to return'));
 }else if(!route?.isTour||!route.coords?.length){
   set('walkNextInstruction',label('Preračunavamo putanju…','Recalculating your route…'));
   set('walkInstructionDistance',label('Sačekaj Google pešačku rutu.','Waiting for the Google walking route.'));
 }else{
   // Do not infer live turn distances from a previously granted but stale GPS fix.
   const validFix=gpsFixUsable();
   const guidance=validFix?navigationProgress(route,state.position):null;
   const instruction=!validFix?label('GPS signal nije pouzdan — proveri lokaciju','GPS signal unreliable — check location'):
     guidance?.step?.instruction||label('Prati plavu pešačku putanju','Follow the blue walking line');
   set('walkNextInstruction',instruction);
   set('walkInstructionDistance',!validFix?label('Sačekaj novu GPS poziciju','Waiting for a fresh GPS fix'):
     guidance?label('Do narednog skretanja ≈ ','To next turn ≈ ')+
       tourMeters(Math.max(0,guidance.remaining)):
       label('Nema pouzdanog uputstva za skretanje','No reliable turn instruction'));
 }
 if(!stop){
   set('walkStopProgress',label('Sve stanice obiđene','All stops visited'));
   set('walkStopName',label('Obilazak je završen!','Tour complete!'));
   set('walkStopDistance',label('Hvala što si istražio Novi Sad.','Thanks for exploring Novi Sad.'));
   return;
 }
 const ordinal=tourPreview.ids.indexOf(stop.id)+1;
 const meters=gpsFixUsable()?Math.round(distKm(state.position,stop)*1000):null;
 const arrived=meters!==null&&state.locationAccuracy<=55&&meters<=55;
 set('walkStopProgress',arrived?label('📍 STIGAO SI!','📍 YOU HAVE ARRIVED!'):
   label('SLEDEĆA STANICA','NEXT STOP')+' · '+ordinal+'/'+tourPreview.ids.length);
 set('walkStopName',stop.label);
 set('walkStopDistance',meters===null?label('GPS lokacija još nije dostupna','GPS location is not available yet'):
   label('Do znamenitosti, vazdušno: ','Straight-line to landmark: ')+tourMeters(meters));
 const teaser=hud.querySelector('#walkStoryTeaser');
 const fact=window.NSSG_ATTRACTIONS_GUIDE?.stories?.[stop.id]?.fact;
 if(teaser){
   const txt=arrived?fact?.[state.lang]||label('Pogledaj znamenitost i otvori njenu priču u aplikaciji.','Look around and open the landmark story in the app.'):'';
   teaser.textContent=txt;teaser.classList.toggle('hidden',!txt);
 }
 hud.querySelector('#walkVisited')?.toggleAttribute('disabled',!route?.isTour&&!arrived);
}

function finishTour(){
 const data=tourStateForUI();if(!data)return;
 if(!window.confirm(label('Završiti ovaj obilazak? Ruta i aktivni vodič će biti zatvoreni, a sačuvana omiljena mesta ostaju.','Finish this tour? The route and active guide will close. Your favourite places stay saved.')))return;
 stopPreview();
 showToast(label('Obilazak je završen. Možeš započeti novu šetnju.','Tour finished. You can start another walk.'));
}
function tourOnMapReady(){
 if(!tourPreview||!state.map){renderPersistentTour();return;}
 refreshCalmMarkers();
 if(state.activeRoute?.isTour&&state.activeRoute.coords?.length){
   state.map.setRoute(state.activeRoute.coords,state.activeRoute.destination);
   if(tourPreview.guiding)focusGuidedCamera();
   else state.map.fitRoute(state.activeRoute.coords,{top:68,bottom:180,left:35,right:35,maxZoom:16});
 }else fitTour();
 renderTourOverview();
 if(tourPreview.guiding){walkHudElements()?.classList.remove('hidden');updateWalkHud();}
 renderPersistentTour();
}
function tourOnPosition(){
 if(!tourPreview)return;
 if(tourPreview.guiding)updateWalkHud();
 const route=state.activeRoute;
 const good=state.locationAccuracy<=55&&gpsFixUsable();
 const next=remainingTourStops()[0];
 const near=!!(next&&good&&distKm(state.position,next)*1000<=55);
 if(tourPreview.lastNear!==near){
   tourPreview.lastNear=near;
   renderTourOverview();
   renderPersistentTour();
 }
 // Once a visitor opts in, recompute real Google walking directions only
 // after sustained off-route movement; throttle to avoid excessive requests.
 if(tourPreview.startFromGps&&good&&route?.isTour&&route.coords?.length&&state.navWatchId!==null){
   const progress=navigationProgress(route,state.position);
   if(progress&&progress.offRoute>100 && next&&distKm(state.position,next)*1000>75){
     if(!tourOffRouteSince)tourOffRouteSince=Date.now();
     if(Date.now()-tourOffRouteSince>=15000&&Date.now()-tourRerouteAt>=120000){
       tourRerouteAt=Date.now();
       recalculateGuidedTour();
     }
   }else tourOffRouteSince=0;
 }
}

function fitTour(){
 if(!tourPreview||!state.map)return;
 const points=currentStops().map(({lat,lng})=>({lat,lng}));
 // Keep the visitor and the tour in the same overview when GPS is enabled.
 if(tourPreview.startFromGps&&gpsFixUsable())points.push({...state.position});
 state.map.setBearing(0);
 state.map.fitPoints(points,{top:72,right:38,bottom:140,left:38,maxZoom:16.6});
}

let tourRouteSequence=0;
let tourOffRouteSince=0;
let tourRerouteAt=0;
const GPS_MAX_ACCURACY=120;
const GPS_RECENT_MS=120000;
const gpsFixUsable=()=>state.fromGps&&Number.isFinite(state.position?.lat)&&Number.isFinite(state.position?.lng)
  &&Number.isFinite(state.locationAccuracy)&&state.locationAccuracy<=GPS_MAX_ACCURACY
  &&Date.now()-(state.gpsFixAt||0)<GPS_RECENT_MS;
function askTourGps(previouslyApproved=false){
 if(!previouslyApproved&&!window.confirm(label(
  'Da te vodimo OD TVOJE TRENUTNE LOKACIJE do prve znamenitosti, pa kroz celu šetnju? Uz dozvolu koristićemo GPS i poslati lokaciju Google Routes servisu radi izračunavanja pešačke rute. GPS prati samo dok je aplikacija otvorena.',
  'Navigate FROM YOUR CURRENT LOCATION to the first landmark and along the entire tour? With consent, GPS location is sent to Google Routes to calculate walking directions. Tracking works only while the app is open.'
  )))return Promise.resolve(false);
 if(gpsFixUsable())return Promise.resolve(true);
 if(!navigator.geolocation||!window.isSecureContext){
   showToast(label('GPS zahteva HTTPS i dozvolu za lokaciju. Prikazujemo plan od prve stanice.','GPS needs HTTPS and location permission. Showing the plan from the first stop.'));
   return Promise.resolve(false);
 }
 return new Promise(resolve=>navigator.geolocation.getCurrentPosition(
   pos=>{
     applyPosition(pos);
     const good=gpsFixUsable();
     if(!good)showToast(label('GPS nije dovoljno precizan. Ruta je za sada od prve stanice; probaj ponovo napolju.','GPS is not accurate enough. The route currently begins at the first stop; retry outdoors.'));
     resolve(good);
   },
   err=>{
     showToast(err?.code===1?label('Lokacija nije dozvoljena. Prikazujemo plan šetnje, ne navigaciju od tebe.','Location was denied. Showing the sightseeing plan, not directions from you.'):
       label('Lokacija nije dostupna. Plan ostaje vidljiv; pokušaj ponovo.','Location unavailable. The plan remains visible; retry.'));
     resolve(false);
   },{enableHighAccuracy:true,maximumAge:0,timeout:16000}
 ));
}
function remainingTourStops(){
 return currentStops().filter(stop=>!tourPreview?.completed?.includes(stop.id));
}
function recalculateGuidedTour(){
 if(!tourPreview)return;
 tourOffRouteSince=0;
 const seq=++tourRouteSequence;
 if(state.activeRoute?.isTour){
   state.activeRoute=null;state.map?.clearRoute();
   document.getElementById('routePanel')?.classList.add('hidden');
   updateNavigationHUD();
 }
 if(!remainingTourStops().length){
   tourPreview.routing='complete';tourPreview.message='';
   if(tourPreview.guiding)pauseGuidedWalk();
   renderTourOverview();renderPersistentTour();
   return;
 }
 computeFullTour(tourPreview.id,seq);
}
async function enableTourGps(){
 if(!tourPreview)return;
 const approved=await askTourGps(tourPreview.startFromGps);
 if(!tourPreview)return;
 if(!approved){renderTourOverview();renderPersistentTour();return;}
 tourPreview.startFromGps=true;
 state.followMode=true;
 recalculateGuidedTour();
}
const tourMeters=v=>Number.isFinite(v)?(v<1000?Math.round(v)+' m':(v/1000).toFixed(1)+' km'):'—';
function routeErrorCopy(code){
 if(code==='CONFIG')return label('Google ne dozvoljava pešačku rutu ovom API ključu. Proveri Routes API, ograničenja ključa i billing.','Google Routes is not permitted for this API key. Check Routes API, key restrictions and billing.');
 if(code==='QUOTA')return label('Google Routes kvota je dostignuta. Pokušaj kasnije.','Google Routes quota was exceeded. Try again later.');
 if(code==='NO_ROUTE')return label('Google nije našao prohodnu pešačku putanju za sve stanice.','Google found no walkable path through every stop.');
 if(code==='RESPONSE')return label('Google odgovor nema sve segmente ili podatke rute.','The Google response is missing route legs or metrics.');
 if(code==='REQUEST')return label('Google je odbio parametre rute. Otvori „Zašto ruta ne radi?” da vidiš kod greške.','Google rejected route parameters. Open the error details to inspect the status.');
 if(code==='NETWORK')return label('Nema odgovora Google servisa. Proveri internet vezu.','Google did not respond. Check your connection.');
 return label('Google nije uspeo da izračuna celu šetnju. Stanice su ipak prikazane bez izmišljene linije.','Google could not calculate the full walk. Stops remain visible without a made-up line.');
}
function tourWaypoints(){
 const stops=remainingTourStops();
 const points=[];
 // Always include the real device origin if consent was given, regardless
 // of distance to the city (no arbitrary six-kilometre cutoff).
 if(tourPreview?.startFromGps&&gpsFixUsable()&&stops.length){
   const pt=stops[0];
   if(distKm(state.position,pt)>0.015)points.push({...state.position});
 }
 for(const stop of stops){
   const pt={lat:stop.lat,lng:stop.lng};
   if(!points.length||distKm(points[points.length-1],pt)>0.005)points.push(pt);
 }
 return points;
}
async function computeFullTour(id,seq){
 if(!tourPreview||tourPreview.id!==id||seq!==tourRouteSequence)return;
 const points=tourWaypoints();
 tourPreview.routing='loading';
 // Keep the actual path's origin for UI and regression tests; never save it to storage.
 // The first waypoint may coincide with the user's GPS within map/GPS noise.
 // Within 20 metres, the visitor is already at the first remaining stop;
 // this is still an actual location-based walking plan, not a city-centre demo.
 tourPreview.routeFromGps=!!(tourPreview.startFromGps&&gpsFixUsable()&&points.length&&distKm(points[0],state.position)<0.020);
 tourPreview.message='';
 tourPreview.diagnostic=null;
 renderTourOverview();
 if(points.length<2){
  tourPreview.routing='idle';
  tourPreview.message=label('Jedna stanica je ostala. Uključi „Vodi me odavde” ili je označi kada je obiđeš.','One stop remains. Choose “Navigate from here” or mark it visited.');
  renderTourOverview();return;
 }
 try{
   const provider=window.NSSG_GOOGLE_ENGINE;
   if(!provider?.googleTourRoute)throw new Error('google_tour_provider_missing');
   const result=await provider.googleTourRoute(points,state.lang);
   if(seq!==tourRouteSequence||tourPreview?.id!==id)return;
   if(!Array.isArray(result?.coords)||result.coords.length<2)throw new Error('no_walking_route');
   const steps=(result.maneuvers||[]).filter(m=>m.instruction);
   const maneuvers=steps.map(step=>{
     const anchor=step.anchor?.latLng||step.anchor;
     const lat=typeof anchor?.lat==='function'?anchor.lat():anchor?.lat;
     const lng=typeof anchor?.lng==='function'?anchor.lng():anchor?.lng;
     if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
     let index=0,best=Infinity;
     result.coords.forEach(([x,y],i)=>{const d=distKm({lat,lng},{lat:y,lng:x});if(d<best){best=d;index=i;}});
     return {index,instruction:step.instruction};
   }).filter(Boolean);
   const dest=points[points.length-1];
   state.activeRoute={coords:result.coords,provider:'google',isTour:true,tourId:id,
     destination:dest,name:label(tourPreview.titleSr,tourPreview.titleEn),
     isDemo:!tourPreview.routeFromGps,rerouteAt:0,maneuvers,
     stopIds:tourPreview.ids.slice(),distanceMeters:result.meters,minutes:result.minutes};
   tourPreview.routing='ready';
   tourPreview.meters=Number(result.meters);
   tourPreview.minutes=Number(result.minutes);
   state.map?.setRoute(result.coords,dest);
   if(tourPreview.guiding)focusGuidedCamera();
   else state.map?.fitRoute(result.coords,{top:68,bottom:180,left:35,right:35,maxZoom:16});
   if(tourPreview.routeFromGps&&state.fromGps){
     state.followMode=true;
     // One consent at tour start is also the opt-in for foreground GPS tracking.
     if(state.navWatchId===null)startRouteTracking();
   }
   const list=steps.map(step=>'<li>'+escapeHTML(step.instruction)+'</li>').join('');
   const stats=(tourPreview.routeFromGps?label('Od tvoje lokacije','From your location'):label('Plan od prve znamenitosti (bez GPS-a)','Plan from first landmark (no GPS)'))+' · '+
     label('Ukupno','Total')+': '+tourMeters(tourPreview.meters)+
     (Number.isFinite(tourPreview.minutes)&&tourPreview.minutes>0?' · ~'+Math.ceil(tourPreview.minutes)+' min':'');
   routePanel('<div class="route-panel-head"><div><strong>🚶 '+escapeHTML(label(tourPreview.titleSr,tourPreview.titleEn))+
     '</strong><p>'+escapeHTML(stats)+'</p></div>'+
     '<button class="route-close" onclick="hideRoutePanel()" aria-label="'+label('Sakrij','Hide')+'">×</button></div>'+
     (result.warnings||[]).map(w=>'<p class="route-panel-foot">'+escapeHTML(w)+'</p>').join('')+
     (list?'<ol class="route-steps-preview">'+list+'</ol>':'')+
     '<div class="route-panel-actions"><button onclick="hideRoutePanel()">'+label('Sakrij uputstva','Hide directions')+'</button>'+
     '<button onclick="closeRoute()">'+label('Završi navigaciju','End navigation')+'</button></div>');
   refreshCalmMarkers();
   renderTourOverview();
   saveTourSession();renderPersistentTour();
   if(tourPreview.pendingGuidedStart){
     if(tourPreview.routeFromGps)startGuidedWalk();
     else tourPreview.pendingGuidedStart=false;
   }else if(tourPreview.guiding)updateWalkHud();
 }catch(error){
   if(seq!==tourRouteSequence||tourPreview?.id!==id)return;
   console.warn('Google whole-tour walking route error:',window.NSSG_GOOGLE_ENGINE.diagnoseRouteError(error).code);
   tourPreview.routing='error';
   tourPreview.message=routeErrorCopy(error?.code||window.NSSG_GOOGLE_ENGINE?.classifyRouteError?.(error)||'UNKNOWN');
   tourPreview.diagnostic=error?.diagnostic||window.NSSG_GOOGLE_ENGINE?.diagnoseRouteError?.(error)||{code:'UNKNOWN',summary:''};
   if(state.activeRoute?.isTour)nativeCloseRoute();
   if(tourPreview.guiding)pauseGuidedWalk();
   refreshCalmMarkers();renderTourOverview();fitTour();renderPersistentTour();
 }
}
function renderTourOverview(){
 const panel=panelEl();if(!panel||!state.map)return;
 if(tourPreview?.guiding){panel.classList.add('hidden');updateWalkHud();return;}
 if(!tourPreview||(state.activeRoute?.coords?.length&&!state.activeRoute.isTour)){panel.classList.add('hidden');return;}
 const stops=currentStops(),active=state.activeRoute?.isTour&&state.activeRoute?.tourId===tourPreview.id;
 const originIsUser=!!(tourPreview.startFromGps&&gpsFixUsable());

 const next=stops.find(x=>!tourPreview.completed.includes(x.id));
 const closeToNext=next&&originIsUser&&state.locationAccuracy<=65&&distKm(state.position,next)*1000<=55;
 const nextDistance=next&&originIsUser?Math.round(distKm(state.position,next)*1000):null;
 const title=label(tourPreview.titleSr,tourPreview.titleEn);
 const status=tourPreview.routing==='complete'?label('SVE STANICE OBIĐENE','ALL STOPS VISITED'):
   active?label('GOOGLE · PEŠAČKA RUTA','GOOGLE · WALKING ROUTE'):
   tourPreview.routing==='loading'?label('RAČUNAMO PEŠAČKU RUTU','CALCULATING WALKING ROUTE'):
   tourPreview.routing==='error'?label('RUTA NIJE DOBIJENA','ROUTE UNAVAILABLE'):
   label('PREGLED STANICA','STOP OVERVIEW');
 const stats=active?((tourPreview.routeFromGps?label('Od tvoje lokacije','From your location'):
   label('Plan od prve znamenitosti · uključi GPS','Plan from the first landmark · enable GPS'))+' · '+
   tourMeters(tourPreview.meters)+
   (Number.isFinite(tourPreview.minutes)&&tourPreview.minutes>0?' · ~'+Math.ceil(tourPreview.minutes)+' min':'')+
   ' · '+stops.length+' '+label('stanica','stops')):
   tourPreview.routing==='loading'?label('Google računa rutu kroz preostale stanice…','Google is routing through the remaining stops…'):
   tourPreview.routing==='complete'?label('Obilazak je završen. Možeš zatvoriti turu.','Tour complete. You can finish it.'):
   tourPreview.routing==='error'?tourPreview.message:
   label('Prikaz stanica nije pešačka putanja.','Pins alone are not a walking route.');
 panel.classList.remove('hidden');
 panel.innerHTML='<div class="tour-overview-top"><div><span>'+status+'</span><strong>'+
   escapeHTML(title)+'</strong><small>'+escapeHTML(stats)+'</small>'+
   '<div class="tour-overview-next"><span>'+label('SLEDEĆA STANICA','NEXT STOP')+'</span><strong>'+
   (next?escapeHTML(next.number+'. '+next.label):label('Sve stanice završene','All stops completed'))+'</strong>'+
   (nextDistance!==null?'<small>'+label('Vazdušna udaljenost do stanice','Straight-line distance to stop')+': '+tourMeters(nextDistance)+'</small>':'')+   (closeToNext?'<small>📍 '+label('Blizu si sledeće stanice. Pročitaj priču i označi je kada je obiđeš.','You are near the next stop. Read its story and mark it once visited.')+'</small>':'')+'</div></div>'+
   '<button type="button" id="tourOverviewDetails" aria-label="'+label('Lista stanica','Stop list')+'">'+label('Stanice','Stops')+'</button>'+
   '<button type="button" id="tourOverviewClose" aria-label="'+label('Zatvori obilazak','Close tour')+'">×</button></div>'+
   (tourPreview.routing==='error'?
     '<details class="tour-diagnostic"><summary>'+label('Zašto ruta ne radi?','Why did the route fail?')+'</summary>'+
     '<strong>'+label('Google status:','Google status:')+' '+escapeHTML(tourPreview.diagnostic?.code||'UNKNOWN')+'</strong>'+
     '<p>'+escapeHTML([tourPreview.diagnostic?.stage,tourPreview.diagnostic?.httpStatus?'HTTP '+tourPreview.diagnostic.httpStatus:''].filter(Boolean).join(' · '))+'</p>'+
     (tourPreview.diagnostic?.summary?'<p>'+escapeHTML(tourPreview.diagnostic.summary)+'</p>':'')+
     '<p>'+label('Ovo nije problem sa prikazom mape. Proveri dozvole za Routes API, Google Demo Key i dostupnu kvotu.','The map can render while Google Routes is denied. Check Routes API permissions, Demo Key eligibility and quota.')+'</p></details>':'')+
   '<div class="tour-preview-lead">'+
   (active?'<button type="button" class="tour-start-button" id="tourStartWalking">▶ '+label('KRENI U OBILAZAK','START WALKING')+'</button>':
     tourPreview.routing==='error'?'<button type="button" class="tour-start-button" id="tourOverviewRetry">↻ '+label('POKUŠAJ PONOVO','RETRY WALK')+'</button>':
     tourPreview.routing==='complete'?'<button type="button" class="tour-start-button" id="tourOverviewComplete">'+label('ZAVRŠI OBILAZAK','FINISH TOUR')+'</button>':
     tourPreview.routing==='loading'?'<span class="tour-preview-loading">'+label('Računamo pešačku rutu…','Calculating your walking route…')+'</span>':'')+
   '</div>'+
   '<details class="tour-extra-options" id="tourExtraOptions"><summary>'+label('Još opcija','More options')+'</summary><div class="tour-overview-actions">'+
   '<button type="button" id="tourOverviewFit">▣ '+label('Cela ruta','Full walk')+'</button>'+
   (next?'<button type="button" id="tourOverviewFromHere">'+
      (originIsUser?label('↻ Preračunaj odavde','↻ Reroute from here'):
       label('⌖ Vodi me od moje lokacije','⌖ Navigate from my location'))+'</button>':'')+
   (active?'<button type="button" id="tourOverviewNext">↗ '+label('Uputstva','Directions')+'</button>':
    tourPreview.routing==='loading'?'<button type="button" disabled>'+label('Računamo…','Calculating…')+'</button>':'')+
   (next?'<button type="button" id="tourOverviewStory">📖 '+label('Priča','Story')+'</button>':'')+
   (next?'<button type="button" id="tourOverviewVisited">✓ '+label('Obiđeno','Visited')+'</button>':'')+
   (active||tourPreview.routing==='complete'?'<button type="button" id="tourOverviewTrack"'+(tourPreview.routing==='complete'?' disabled':'')+'>'+
     (state.navWatchId!==null?label('■ Zaustavi GPS','■ Stop GPS'):label('⌖ Prati me','⌖ Track me'))+'</button>':'')+
   '</div></details>';
 panel.querySelector('#tourStartWalking')?.addEventListener('click',startGuidedWalk);
 panel.querySelector('#tourOverviewComplete')?.addEventListener('click',finishTour);
 panel.querySelector('#tourOverviewClose').addEventListener('click',finishTour);
 panel.querySelector('#tourOverviewDetails').addEventListener('click',()=>window.openDiscoveryTour(tourPreview.id));
 panel.querySelector('#tourOverviewFit').addEventListener('click',()=>active?state.map?.fitRoute(state.activeRoute.coords,{top:68,bottom:180,left:35,right:35,maxZoom:16}):fitTour());
 panel.querySelector('#tourOverviewNext')?.addEventListener('click',restoreRoutePanel);
 panel.querySelector('#tourOverviewFromHere')?.addEventListener('click',()=>{
   if(tourPreview.startFromGps&&gpsFixUsable()){recalculateGuidedTour();return;}
   enableTourGps();
 });
 panel.querySelector('#tourOverviewStory')?.addEventListener('click',()=>{if(next)openPlace(next.id);});
 panel.querySelector('#tourOverviewVisited')?.addEventListener('click',markNextStop);
 panel.querySelector('#tourOverviewTrack')?.addEventListener('click',()=>{
   if(!tourPreview.startFromGps){enableTourGps();return;}
   toggleRouteTracking();renderTourOverview();
 });
 panel.querySelector('#tourOverviewRetry')?.addEventListener('click',()=>computeFullTour(tourPreview.id,++tourRouteSequence));
}
function stopPreview(){
  if(tourPreview?.guiding)pauseGuidedWalk();
  tourRouteSequence++;
  if(state.activeRoute?.isTour)nativeCloseRoute();
  tourPreview=null;forgetTourSession();
  if(state.map){state.map.setTourStops([]);refreshCalmMarkers();}
  panelEl()?.classList.add('hidden');renderPersistentTour();
 }
window.previewDiscoveryTour=async function(id){
 const w=tourById(id);if(!w)return;
 if(tourPreview?.id===id&&state.activeRoute?.isTour){
   resumeTour();return;
 }
 const previous=tourPreview?.id||savedTourSession?.id;
 if(previous&&previous!==id&&!window.confirm(label(
  'Drugi obilazak je u toku. Zameniti ga novim?',
  'Another tour is active. Replace it with this one?')))return;
 // Clicking a walk starts a real Google multi-stop WALKING route, not just static pins.
 nativeOpenDiscoveryTour(id);
 closeModal();
 ++tourRouteSequence;
 if(state.activeRoute)nativeCloseRoute();
 let stored=null;try{stored=JSON.parse(localStorage.getItem('nssg-discovery-tour')||'null')}catch(_){}
 // Request foreground location from this actual user click. Never silently use a
 // demo city-centre point as if it were the visitor's real starting position.
 const originPromise=askTourGps();
 const resume=readTourSession();
 tourPreview={...w,completed:(resume?.id===w.id?resume.completed:(stored?.id===w.id?stored.completed:[]))||[],
   startedAt:resume?.id===w.id?resume.startedAt:Date.now(),routing:'loading',startFromGps:false,routeFromGps:false};
 saveTourSession();
 state.cat='all';state.search='';state.nearbyOnly=false;
 showPage('explore');renderPersistentTour();
 const seq=tourRouteSequence,startedAt=Date.now();
 const readyFromGps=await originPromise;
 if(seq!==tourRouteSequence||tourPreview?.id!==w.id)return;
 tourPreview.startFromGps=readyFromGps;
 renderTourOverview();
 const showTourAfterGoogleMap=()=>{
   if(seq!==tourRouteSequence||!tourPreview||tourPreview.id!==w.id||state.page!=='explore')return;
   if(state.map){refreshCalmMarkers();renderTourOverview();fitTour();computeFullTour(w.id,seq);}
   else if(Date.now()-startedAt<20000)setTimeout(showTourAfterGoogleMap,180);
   else{tourPreview.routing='error';tourPreview.message=label('Google mapa nije učitana. Proveri vezu i API ključ.','Google map did not load. Check your connection and API key.');renderPersistentTour();}
 };
 showTourAfterGoogleMap();
};
window.openDiscoveryTour=function(id){
 if(tourPreview&&tourPreview.id!==id){
   showToast(label('Prvo završi aktivni obilazak pre prelaska na drugu turu.','Finish your active tour before switching.'));
   return;
 }
 nativeOpenDiscoveryTour(id);
 const footer=document.querySelector('#modal .tour-detail-footer');if(!footer)return;
 const btn=document.createElement('button');btn.type='button';btn.className='btn btn-white tour-preview-link';
 btn.textContent=label('🚶 Pokreni celu pešačku rutu','🚶 Start full walking route');
 btn.addEventListener('click',()=>window.previewDiscoveryTour(id));
 footer.prepend(btn);
};
window.navigateTourStop=function(pid){
 if(tourPreview){
   closeModal();
   const next=remainingTourStops()[0];
   if(state.page!=='explore')showPage('explore');
   if(!tourPreview.startFromGps){enableTourGps();return;}
   // A guided tour remains ordered. "Navigate" must reveal the actual Google
   // walking directions to the next stop rather than simply panning the map.
   if(next&&next.id===pid){
     if(state.activeRoute?.isTour&&state.activeRoute.coords?.length){
       if(state.fromGps)recenterDuringRoute();
       restoreRoutePanel();
     }else recalculateGuidedTour();
   }else{
     showToast(label('Obilazak vodi redom. Sledeća stanica: ','This walk follows the planned order. Next stop: ')+(next?next.label:'—'));
     if(state.activeRoute?.isTour&&state.activeRoute.coords?.length)restoreRoutePanel();
   }
   renderTourOverview();renderPersistentTour();return;
 }
 // Standalone navigation does not erase a saved tour.
 closeModal();state.cat='all';showPage('explore');
 const p=places.find(x=>x.id===pid);if(!p)return;
 startRoute({lat:p.lat,lng:p.lng},name(p));
 if(state.fromGps)requestAnimationFrame(focusCurrentRoute);
};
function focusCurrentRoute(){
 if(!state.map||!state.fromGps)return;
 const accuracy=state.locationAccuracy;
 const zoom=Number.isFinite(accuracy)&&accuracy>150?15:16.4;
 state.map.easeTo({center:[state.position.lng,state.position.lat],zoom,duration:400});
}
window.showEntireRoute=function(){
 if(state.activeRoute?.coords?.length&&state.map)state.map.fitRoute(state.activeRoute.coords,{top:75,bottom:115,left:42,right:42});
};
function refreshCalmMarkers(){
 if(!state.map)return;
 if(tourPreview&&(!state.activeRoute||state.activeRoute.isTour)){
   state.map.setPlaces([]);state.map.setPois([]);state.map.setTourStops(currentStops());
 }else{
   state.map.setTourStops([]);
   if(state.activeRoute){
     state.map.setPlaces([]);state.map.setPois([]);
   }else{
     const candidates=filtered();
     const markerCenter=state.nearbyOnly?state.position:center;
     const selected=allPins||state.cat!=='all'?candidates:candidates.slice().sort((a,b)=>distKm(a,markerCenter)-distKm(b,markerCenter)).slice(0,5);
     state.map.setPlaces(selected.map(p=>({lat:p.lat,lng:p.lng,emoji:p.emoji,label:name(p),click:()=>openPlace(p.id)})));
     state.map.setPois(showVenuePins||(state.localVenueVisible&&state.cat==='food')?filteredPois().slice(0,12):[]);
   }
 }
 const btn=document.getElementById('calmPinToggle');if(btn){btn.textContent=allPins?label('✓ Sva mesta na mapi','✓ All places on map'):label('○ Prikaži više oznaka','○ Show more markers');btn.setAttribute('aria-pressed',String(allPins));}
}
updateMarkers=function(){nativeUpdateMarkers();refreshCalmMarkers()};
window.toggleCalmPins=function(){allPins=!allPins;refreshCalmMarkers()};
window.toggleCalmVenues=async function(){
 if(state.activeRoute){showToast(state.lang==='sr'?'Završi rutu pre prikaza lokala.':'Finish navigation before showing venues.');return;}
 if(showVenuePins){showVenuePins=false;refreshCalmMarkers();showToast(state.lang==='sr'?'Lokali sakriveni.':'Venue pins hidden.');return;}
 if(!state.poiList.length||!filteredPois().length)await loadNearbyPois();
 if(state.poiList.length && !filteredPois().length && state.map){
   state.radius=10000;updateResults();
 }
 if(!state.poiList.length){
   showToast(state.lang==='sr'?'Javni servis nije vratio lokale; pokušaj kasnije.':'Venue service returned no places; try again later.');return;
 }
 showVenuePins=true;refreshCalmMarkers();
 showToast(state.lang==='sr'?'U listi '+filteredPois().length+' OSM mesta; na mapi najviše 12, da ne bude gužve.':'List: '+filteredPois().length+' OSM places; up to 12 map pins for clarity.');
};
explore=function(el){
 nativeExplore(el);
 const filterBar=el.querySelector('.filter-bar');
 if(filterBar){
   const bar=document.createElement('div');bar.className='city-discovery-bar';
   bar.innerHTML='<button type="button" id="citywideToggle" aria-pressed="'+String(!state.nearbyOnly)+'">🏙 '+label('Ceo grad','Whole city')+'</button>'+
     '<button type="button" id="nearbyToggle" aria-pressed="'+String(state.nearbyOnly)+'">⌖ '+label('U blizini','Nearby')+'</button>'+
     '<button type="button" id="loadVenuesNew">☕ '+label('Lokali','Venues')+'</button>';
   filterBar.insertAdjacentElement('afterend',bar);
   const syncMode=()=>{
     for(const [id,active] of [['citywideToggle',!state.nearbyOnly],['nearbyToggle',state.nearbyOnly]]){
       const button=bar.querySelector('#'+id);if(!button)return;
       button.setAttribute('aria-pressed',String(active));
       button.classList.toggle('active',active);
     }
   };
   window.syncNearbyUI=syncMode;
   syncMode();
   bar.querySelector('#citywideToggle').onclick=()=>{
     setNearbyOnly(false);
     allPins=false;
     refreshCalmMarkers();
     state.map?.fitPoints(places.map(p=>({lat:p.lat,lng:p.lng})),{top:65,right:36,bottom:95,left:36,maxZoom:13.5});
     syncMode();
   };
   bar.querySelector('#nearbyToggle').onclick=()=>{
     setNearbyOnly(true);
     if(state.fromGps)state.map?.easeTo({center:[state.position.lng,state.position.lat],zoom:14.5});
     syncMode();
   };
   bar.querySelector('#loadVenuesNew').onclick=()=>window.toggleCalmVenues();
 }

 const wrap=el.querySelector('.discovery-map-wrap');if(!wrap)return;
 wrap.classList.add('calm-map');
 const quick=wrap.querySelector('.discovery-map-quick');
 if(quick){quick.innerHTML=`<button type="button" id="discoveryGps" onclick="gps()" aria-label="${label('Pronađi me','Locate me')}">⌖</button><button type="button" id="discoveryOptions" aria-expanded="false" aria-controls="discoveryMapTray" onclick="toggleDiscoveryMapTray()" aria-label="${label('Opcije mape','Map options')}">☷</button>`;}
 const badge=wrap.querySelector('.map-badge');if(badge){badge.setAttribute('aria-live','polite');badge.title=label('Lokacija zahteva dozvolu uređaja','Location requires device permission');}
 const tray=wrap.querySelector('#discoveryMapTray');
 if(tray){
   tray.insertAdjacentHTML('afterbegin',`<div class="calm-tray-head"><strong>${label('Opcije mape','Map options')}</strong><button type="button" aria-label="${label('Zatvori','Close')}" onclick="toggleDiscoveryMapTray(false)">×</button></div><button type="button" id="calmPinToggle" class="calm-tool" aria-pressed="false" onclick="toggleCalmPins()"></button><button type="button" class="calm-tool" onclick="toggleCalmVenues()">☕ ${label('Prikaži/sakrij oznake lokala','Show/hide venue markers')}</button>`);
   const tracking=wrap.querySelector('#navLiveControls');if(tracking){tracking.classList.add('calm-nav-tools');tray.appendChild(tracking);}
   const zoom=wrap.querySelector('.raster-zoom');if(zoom){zoom.classList.add('calm-zoom-tools');tray.appendChild(zoom);}
 }
 const nav=wrap.querySelector('#navHud');if(nav){
   const whole=document.createElement('button');whole.type='button';whole.id='routeFitButton';whole.textContent='▣';whole.title=label('Prikaži celu rutu','Fit entire route');whole.setAttribute('aria-label',label('Prikaži celu rutu','Fit entire route'));whole.onclick=window.showEntireRoute;
   nav.appendChild(whole);
 }
 const panel=document.createElement('section');panel.id='tourOverviewPanel';panel.className='tour-overview-panel hidden';panel.setAttribute('aria-label',label('Pregled stanica ture','Tour stops overview'));wrap.appendChild(panel);
 // A tour overview has numbered markers and no fictitious connecting walk polyline.
 if(tourPreview){refreshCalmMarkers();requestAnimationFrame(()=>{renderTourOverview();fitTour()})}else refreshCalmMarkers();
};
routePanel=function(html){
 nativeRoutePanel(html);
 refreshCalmMarkers();
 if(state.activeRoute?.coords?.length){
   hideRoutePanel();
   if(state.fromGps&&!state.activeRoute.isTour)requestAnimationFrame(focusCurrentRoute);
   refreshCalmMarkers();
 }
};
closeRoute=function(){
 if(tourPreview&&state.activeRoute?.isTour){finishTour();return;}
 nativeCloseRoute();
 if(tourPreview){tourPreview.routing='idle';tourPreview.message='';}
 refreshCalmMarkers();renderTourOverview();renderPersistentTour();
};
updateNavigationHUD=function(){
 nativeUpdateNavigationHUD();
 if(tourPreview?.guiding)updateWalkHud();
 const nav=document.getElementById('navHud');if(nav)nav.classList.toggle('calm-nav-active',!!state.activeRoute?.coords?.length);
 if(tourPreview&&state.activeRoute?.isTour&&state.fromGps){
   const next=remainingTourStops()[0],info=document.getElementById('navDetail'),headline=document.getElementById('navHeadline');
   if(next&&info&&headline){
     const near=state.locationAccuracy<=65&&distKm(state.position,next)*1000<=55;
     const distance=tourMeters(distKm(state.position,next)*1000);
     const stepInfo=info.textContent;
     info.textContent=label('Sledeća: ','Next stop: ')+next.label+
       ' · '+label('vazdušno ','straight-line ')+distance+
       (stepInfo?' · '+stepInfo:'');
     if(near)headline.textContent=label('📍 Stigao si blizu znamenitosti — otvori priču','📍 Near the landmark — read its story');
   }
 }
};
applyPosition=function(pos){const firstFix=!state.fromGps;nativeApplyPosition(pos);if(tourPreview){refreshCalmMarkers();if(firstFix&&!tourPreview.guiding)requestAnimationFrame(fitTour);if(tourPreview.guiding)updateWalkHud();}};
// Existing routes are never treated as completed merely because the user opened a tour.

const nsgV052OldStartRoute=startRoute;
startRoute=function(destination,name){
 if(tourPreview){showToast(label('Obilazak je aktivan. Otvori Stanice da izabereš znamenitost, bez gašenja rute.','Tour is active. Choose a stop without ending your route.'));return;}
 const result=nsgV052OldStartRoute(destination,name);
 refreshCalmMarkers();
 return result;
};
const nsgV052OldShowRouteError=showRouteError;
showRouteError=function(...args){
 const result=nsgV052OldShowRouteError(...args);
 state.activeRoute=null;
 refreshCalmMarkers();
 return result;
};
const originalToggleTourStop=window.toggleTourStop;
window.toggleTourStop=function(wid,pid){
 originalToggleTourStop(wid,pid);
 if(tourPreview?.id===wid){
   let saved=null;
   try{saved=JSON.parse(localStorage.getItem('nssg-discovery-tour')||'null');}catch(_){}
   if(saved?.id===wid&&Array.isArray(saved.completed)){
     const updated=saved.completed.filter(id=>tourPreview.ids.includes(id));
     const changed=JSON.stringify(updated)!==JSON.stringify(tourPreview.completed);
     tourPreview.completed=updated;
     saveTourSession();
     if(changed)recalculateGuidedTour();
     renderTourOverview();renderPersistentTour();
   }
 }
};
const nativeRequestReroute=requestReroute;
requestReroute=function(){
 if(tourPreview&&tourPreview.startFromGps){
   if(!gpsFixUsable()){enableTourGps();return;}
   recalculateGuidedTour();return;
 }
 return nativeRequestReroute();
};
const nativeGps=gps;
gps=function(callback){
 if(tourPreview&&!tourPreview.startFromGps)return enableTourGps();
 return nativeGps(callback);
};
const nativeOpenDirections=openDirections;
openDirections=function(id){
 if(tourPreview){
   const p=places.find(x=>x.id===id);
   if(!p)return;
   closeModal();
   window.navigateTourStop(id);
   return;
 }
 return nativeOpenDirections(id);
};
// Defensive cleanup: no page change or content rerender may leave body in
// full-screen navigation after the map HUD was removed.
const oldAppShowPage=showPage;
showPage=function(...args){
 if(tourPreview?.guiding)pauseGuidedWalk();
 return oldAppShowPage(...args);
};
const oldAppRender=render;
render=function(...args){
 if(tourPreview?.guiding)pauseGuidedWalk();
 return oldAppRender(...args);
};
// Escape exits walking mode only if a details modal is not open.
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||!tourPreview?.guiding)return;
 const shade=document.getElementById('modalShade');
 if(shade&&!shade.classList.contains('hidden'))return;
 e.preventDefault();
 pauseGuidedWalk();
},true);
window.NSSG_TOUR_SESSION=Object.freeze({
 resume:resumeTour,finish:finishTour,markNext:markNextStop,
 begin:startGuidedWalk,pause:pauseGuidedWalk,showLandmarkOnMap:showTourLandmarkOnMap,
 onMapReady:tourOnMapReady,onPage:()=>{if(state.page!=='explore'&&tourPreview?.guiding)pauseGuidedWalk();renderPersistentTour();},onGpsPosition:tourOnPosition,
 snapshot:()=>{const d=tourStateForUI();return d?{id:d.walk.id,completed:d.completed.slice(),nextId:d.next?.id||null,active:d.active,guiding:!!tourPreview?.guiding}:null;}
});
renderPersistentTour();
})();
