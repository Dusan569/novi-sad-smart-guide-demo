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
function fitTour(){
 if(!tourPreview||!state.map)return;
 const points=currentStops().map(({lat,lng})=>({lat,lng}));
 // Show actual GPS on the overview only if it is reasonably close to the city tour.
 if(state.fromGps&&points.some(p=>distKm(p,state.position)<6))points.push({...state.position});
 state.map.setBearing(0);
 state.map.fitPoints(points,{top:72,right:38,bottom:140,left:38,maxZoom:16.6});
}

let tourRouteSequence=0;
const tourMeters=v=>Number.isFinite(v)?(v<1000?Math.round(v)+' m':(v/1000).toFixed(1)+' km'):'—';
function routeErrorCopy(code){
 if(code==='CONFIG')return label('Google ne dozvoljava pešačku rutu ovom API ključu. Proveri Routes API, ograničenja ključa i billing.','Google Routes is not permitted for this API key. Check Routes API, key restrictions and billing.');
 if(code==='QUOTA')return label('Google Routes kvota je dostignuta. Pokušaj kasnije.','Google Routes quota was exceeded. Try again later.');
 if(code==='NO_ROUTE')return label('Google nije našao prohodnu pešačku putanju za sve stanice.','Google found no walkable path through every stop.');
 if(code==='NETWORK')return label('Nema odgovora Google servisa. Proveri internet vezu.','Google did not respond. Check your connection.');
 return label('Google nije uspeo da izračuna celu šetnju. Stanice su ipak prikazane bez izmišljene linije.','Google could not calculate the full walk. Stops remain visible without a made-up line.');
}
function tourWaypoints(){
 const stops=currentStops();
 // Very close sights (e.g. Liberty Square and its church) share a walking waypoint
 // while both remain numbered and documented in the tour.
 const points=[];
 if(tourPreview?.startFromGps&&state.fromGps&&distKm(state.position,stops[0])>.04)points.push({...state.position});
 for(const stop of stops){
   const pt={lat:stop.lat,lng:stop.lng};
   if(!points.length||distKm(points[points.length-1],pt)>.022)points.push(pt);
 }
 return points;
}
async function computeFullTour(id,seq){
 if(!tourPreview||tourPreview.id!==id||seq!==tourRouteSequence)return;
 const points=tourWaypoints();
 tourPreview.routing='loading';
 tourPreview.message='';
 renderTourOverview();
 if(points.length<2){tourPreview.routing='error';tourPreview.message=label('Nema dovoljno različitih stanica.','Not enough distinct stops.');renderTourOverview();return;}
 try{
   const provider=window.NSSG_GOOGLE_ENGINE;
   if(!provider?.googleTourRoute)throw new Error('google_tour_provider_missing');
   const result=await provider.googleTourRoute(points,state.lang);
   if(seq!==tourRouteSequence||tourPreview?.id!==id||state.page!=='explore')return;
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
     isDemo:!tourPreview.startFromGps,rerouteAt:0,maneuvers,
     stopIds:tourPreview.ids.slice(),distanceMeters:result.meters,minutes:result.minutes};
   tourPreview.routing='ready';
   tourPreview.meters=Number(result.meters);
   tourPreview.minutes=Number(result.minutes);
   state.map?.setRoute(result.coords,dest);
   state.map?.fitRoute(result.coords,{top:68,bottom:180,left:35,right:35,maxZoom:16});
   const list=steps.slice(0,25).map(step=>'<li>'+escapeHTML(step.instruction)+'</li>').join('');
   const stats=label('Ukupno','Total')+': '+tourMeters(tourPreview.meters)+
     (Number.isFinite(tourPreview.minutes)&&tourPreview.minutes>0?' · ~'+Math.ceil(tourPreview.minutes)+' min':'');
   routePanel('<div class="route-panel-head"><div><strong>🚶 '+escapeHTML(label(tourPreview.titleSr,tourPreview.titleEn))+
     '</strong><p>'+escapeHTML(stats)+'</p></div>'+
     '<button class="route-close" onclick="hideRoutePanel()" aria-label="'+label('Sakrij','Hide')+'">×</button></div>'+
     (list?'<ol class="route-steps-preview">'+list+'</ol>':'')+
     '<div class="route-panel-actions"><button onclick="hideRoutePanel()">'+label('Sakrij uputstva','Hide directions')+'</button>'+
     '<button onclick="closeRoute()">'+label('Završi navigaciju','End navigation')+'</button></div>');
   refreshCalmMarkers();
   renderTourOverview();
 }catch(error){
   if(seq!==tourRouteSequence||tourPreview?.id!==id||state.page!=='explore')return;
   console.warn('Google whole-tour walking route error:',error?.code||error?.message||error);
   tourPreview.routing='error';
   tourPreview.message=routeErrorCopy(error?.code||window.NSSG_GOOGLE_ENGINE?.classifyRouteError?.(error)||'UNKNOWN');
   if(state.activeRoute?.isTour)closeRoute();
   refreshCalmMarkers();renderTourOverview();fitTour();
 }
}
function renderTourOverview(){
 const panel=panelEl();if(!panel||!state.map)return;
 if(!tourPreview||(state.activeRoute?.coords?.length&&!state.activeRoute.isTour)){panel.classList.add('hidden');return;}
 const stops=currentStops(),active=state.activeRoute?.isTour&&state.activeRoute?.tourId===tourPreview.id;
 const next=stops.find(x=>!tourPreview.completed.includes(x.id))||stops[0];
 const title=label(tourPreview.titleSr,tourPreview.titleEn);
 const status=active?label('GOOGLE · PEŠAČKA RUTA','GOOGLE · WALKING ROUTE'):
   tourPreview.routing==='loading'?label('RAČUNAMO PEŠAČKU RUTU','CALCULATING WALKING ROUTE'):
   tourPreview.routing==='error'?label('RUTA NIJE DOBIJENA','ROUTE UNAVAILABLE'):
   label('PREGLED STANICA','STOP OVERVIEW');
 const stats=active?(tourMeters(tourPreview.meters)+
   (Number.isFinite(tourPreview.minutes)&&tourPreview.minutes>0?' · ~'+Math.ceil(tourPreview.minutes)+' min':'')+
   ' · '+stops.length+' '+label('stanica','stops')):
   tourPreview.routing==='loading'?label('Google spaja sve stanice po pešačkim stazama…','Google is connecting all stops using walking paths…'):
   tourPreview.routing==='error'?tourPreview.message:
   label('Prikaz stanica nije pešačka putanja.','Pins alone are not a walking route.');
 panel.classList.remove('hidden');
 panel.innerHTML='<div class="tour-overview-top"><div><span>'+status+'</span><strong>'+
   escapeHTML(title)+'</strong><small>'+escapeHTML(stats)+'</small>'+
   '<div class="tour-overview-next"><span>'+label('SLEDEĆA STANICA','NEXT STOP')+'</span><strong>'+
   (next?escapeHTML(next.number+'. '+next.label):'—')+'</strong></div></div>'+
   '<button type="button" id="tourOverviewDetails" aria-label="'+label('Lista stanica','Stop list')+'">'+label('Stanice','Stops')+'</button>'+
   '<button type="button" id="tourOverviewClose" aria-label="'+label('Zatvori obilazak','Close tour')+'">×</button></div>'+
   '<div class="tour-overview-actions">'+
   '<button type="button" id="tourOverviewFit">▣ '+label('Cela ruta','Full walk')+'</button>'+
   (active?'<button type="button" id="tourOverviewNext">↗ '+label('Uputstva','Directions')+'</button>':
    tourPreview.routing==='loading'?'<button type="button" disabled>'+label('Računamo…','Calculating…')+'</button>':
    '<button type="button" id="tourOverviewRetry">↻ '+label('Pokušaj ponovo','Retry route')+'</button>')+
   '</div>';
 panel.querySelector('#tourOverviewClose').addEventListener('click',stopPreview);
 panel.querySelector('#tourOverviewDetails').addEventListener('click',()=>window.openDiscoveryTour(tourPreview.id));
 panel.querySelector('#tourOverviewFit').addEventListener('click',()=>active?state.map?.fitRoute(state.activeRoute.coords,{top:68,bottom:180,left:35,right:35,maxZoom:16}):fitTour());
 panel.querySelector('#tourOverviewNext')?.addEventListener('click',restoreRoutePanel);
 panel.querySelector('#tourOverviewRetry')?.addEventListener('click',()=>computeFullTour(tourPreview.id,++tourRouteSequence));
}
function stopPreview(){tourRouteSequence++;if(state.activeRoute?.isTour)closeRoute();tourPreview=null;if(state.map){state.map.setTourStops([]);refreshCalmMarkers();}panelEl()?.classList.add('hidden');}
window.previewDiscoveryTour=function(id){
 const w=tourById(id);if(!w)return;
 // Clicking a walk starts a real Google multi-stop WALKING route, not just static pins.
 nativeOpenDiscoveryTour(id);
 closeModal();
 ++tourRouteSequence;
 if(state.activeRoute)nativeCloseRoute();
 let stored=null;try{stored=JSON.parse(localStorage.getItem('nssg-discovery-tour')||'null')}catch(_){}
 const first=places.find(p=>p.id===w.ids[0]);
 const gpsNear=!!(state.fromGps&&first&&distKm(state.position,first)<6);
 const useGps=gpsNear&&window.confirm(label(
    'Da za početak obilaska pošaljemo tvoju trenutnu lokaciju Google Routes servisu?',
    'Use your current location as the start of this tour and share it with Google Routes?'));
 tourPreview={...w,completed:(stored?.id===w.id?stored.completed:[])||[],routing:'loading',startFromGps:useGps};
 state.cat='all';state.search='';state.nearbyOnly=false;
 showPage('explore');
 const seq=tourRouteSequence,startedAt=Date.now();
 const showTourAfterGoogleMap=()=>{
   if(seq!==tourRouteSequence||!tourPreview||tourPreview.id!==w.id||state.page!=='explore')return;
   if(state.map){refreshCalmMarkers();renderTourOverview();fitTour();computeFullTour(w.id,seq);}
   else if(Date.now()-startedAt<20000)setTimeout(showTourAfterGoogleMap,180);
   else{tourPreview.routing='error';tourPreview.message=label('Google mapa nije učitana. Proveri vezu i API ključ.','Google map did not load. Check your connection and API key.');}
 };
 showTourAfterGoogleMap();
};
window.openDiscoveryTour=function(id){
 nativeOpenDiscoveryTour(id);
 const footer=document.querySelector('#modal .tour-detail-footer');if(!footer)return;
 const btn=document.createElement('button');btn.type='button';btn.className='btn btn-white tour-preview-link';
 btn.textContent=label('🚶 Pokreni celu pešačku rutu','🚶 Start full walking route');
 btn.addEventListener('click',()=>window.previewDiscoveryTour(id));
 footer.prepend(btn);
};
window.navigateTourStop=function(pid){
 stopPreview();
 // No premature pan to the destination: route calculation and user focus own the viewport.
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
     state.map.setPois(showVenuePins?filteredPois().slice(0,12):[]);
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
closeRoute=function(){nativeCloseRoute();if(tourPreview){tourPreview.routing='idle';tourPreview.message='';}refreshCalmMarkers();renderTourOverview()};
updateNavigationHUD=function(){nativeUpdateNavigationHUD();const nav=document.getElementById('navHud');if(nav)nav.classList.toggle('calm-nav-active',!!state.activeRoute?.coords?.length)};
applyPosition=function(pos){const firstFix=!state.fromGps;nativeApplyPosition(pos);if(tourPreview){refreshCalmMarkers();if(firstFix)requestAnimationFrame(fitTour);}};
// Existing routes are never treated as completed merely because the user opened a tour.

const nsgV052OldStartRoute=startRoute;
startRoute=function(destination,name){
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
})();
