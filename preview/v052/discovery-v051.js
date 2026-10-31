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
function renderTourOverview(){
 const panel=panelEl(),map=state.map;if(!panel||!map)return;
 if(!tourPreview||state.activeRoute?.coords?.length){panel.classList.add('hidden');return;}
 const stops=currentStops();
 panel.classList.remove('hidden');
 const next=stops.find(x=>!tourPreview.completed.includes(x.id))||stops[0];
 panel.innerHTML=`<div class="tour-overview-top"><div><span>${label('PREGLED ŠETNJE · NIJE NAVIGACIJA','WALK OVERVIEW · NOT NAVIGATION')}</span><strong>${escapeHTML(label(tourPreview.titleSr,tourPreview.titleEn))}</strong><small>${stops.length} ${label('stanica — brojevi označavaju redosled','stops — numbers indicate order')}</small></div><button type="button" id="tourOverviewDetails" aria-label="${label('Lista stanica','Stop details')}">☷</button><button type="button" id="tourOverviewClose" aria-label="${label('Zatvori pregled','Close overview')}">×</button></div><div class="tour-overview-actions"><button type="button" id="tourOverviewFit">▣ ${label('Sve stanice','All stops')}</button><button type="button" id="tourOverviewNext">↗ ${label('Vodi do naredne','Navigate to next')}</button></div>`;
 panel.querySelector('#tourOverviewClose').addEventListener('click',stopPreview);
 panel.querySelector('#tourOverviewDetails').addEventListener('click',()=>window.openDiscoveryTour(tourPreview.id));
 panel.querySelector('#tourOverviewFit').addEventListener('click',fitTour);
 panel.querySelector('#tourOverviewNext').addEventListener('click',()=>{if(next)window.navigateTourStop(next.id)});
}
function stopPreview(){tourPreview=null;if(state.map){state.map.setTourStops([]);refreshCalmMarkers();}panelEl()?.classList.add('hidden');}
window.previewDiscoveryTour=function(id){
 const w=tourById(id);if(!w)return;
 // Initialize progress on first selection, then present the map automatically.
 nativeOpenDiscoveryTour(id);
 closeModal();
 if(state.activeRoute){nativeCloseRoute();}
 let stored=null;try{stored=JSON.parse(localStorage.getItem('nssg-discovery-tour')||'null')}catch(_){}
 tourPreview={...w,completed:(stored?.id===w.id?stored.completed:[])||[]};
 state.cat='all';state.search='';
 showPage('explore');
 requestAnimationFrame(()=>{refreshCalmMarkers();renderTourOverview();fitTour();});
};
window.openDiscoveryTour=function(id){
 nativeOpenDiscoveryTour(id);
 const footer=document.querySelector('#modal .tour-detail-footer');if(!footer)return;
 const btn=document.createElement('button');btn.type='button';btn.className='btn btn-white tour-preview-link';
 btn.textContent=label('▣ Prikaži sve stanice na mapi','▣ Preview all stops on map');
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
 if(tourPreview&&!state.activeRoute){
   state.map.setPlaces([]);state.map.setPois([]);state.map.setTourStops(currentStops());
 }else{
   state.map.setTourStops([]);
   if(state.activeRoute){
     state.map.setPlaces([]);state.map.setPois([]);
   }else{
     const candidates=filtered();
     const selected=allPins||state.cat!=='all'?candidates:candidates.slice().sort((a,b)=>distKm(a,state.position)-distKm(b,state.position)).slice(0,5);
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
   bar.innerHTML='<span><strong>'+(state.lang==='sr'?'Otkrij Novi Sad':'Discover Novi Sad')+'</strong><small>'+(state.lang==='sr'?'Istraži spomenike, kulturu i šetnje — bez zatrpavanja mape.':'Discover sights, culture and walks, without cluttering the map.')+'</small></span><button type="button" id="citywideToggle">'+(state.lang==='sr'?'Ceo grad':'Whole city')+'</button><button type="button" id="loadVenuesNew">'+(state.lang==='sr'?'☕ Prikaži lokale':'☕ Show venues')+'</button>';
   filterBar.insertAdjacentElement('afterend',bar);
   bar.querySelector('#citywideToggle').onclick=()=>{
      const all=state.radius<10000;state.radius=all?10000:3000;
      const sel=el.querySelector('.radius-select');if(sel){
       if(!sel.querySelector('option[value="10000"]'))sel.insertAdjacentHTML('beforeend','<option value="10000">10 km</option>');
       sel.value=String(state.radius);
      }
      bar.querySelector('#citywideToggle').textContent=all?(state.lang==='sr'?'✓ Ceo grad':'✓ Whole city'):(state.lang==='sr'?'Ceo grad':'Whole city');
      updateResults();
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
   if(state.fromGps)requestAnimationFrame(focusCurrentRoute);
   refreshCalmMarkers();
 }
};
closeRoute=function(){nativeCloseRoute();refreshCalmMarkers()};
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
