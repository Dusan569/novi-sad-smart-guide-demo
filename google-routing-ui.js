/* Google walking route UI adapter — never calls Valhalla on a Google map. */
(function(root){
'use strict';
function text(sr,en){return state.lang==='sr'?sr:en;}
function geoDist(pt,coords){
  const lat=typeof pt.lat==='function'?pt.lat():+pt.lat;
  const lng=typeof pt.lng==='function'?pt.lng():+pt.lng;
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  let best=0,min=Infinity;
  for(let i=0;i<coords.length;i++){
    const dx=(coords[i][0]-lng)*Math.cos(lat*Math.PI/180),dy=coords[i][1]-lat;
    const d=dx*dx+dy*dy;if(d<min){min=d;best=i;}
  }
  return best;
}
async function start(destination,destinationName){
  if(!destination||!Number.isFinite(+destination.lat)||!Number.isFinite(+destination.lng))return;
  const id=++state.routeRequestSeq;
  const origin={lat:state.position.lat,lng:state.position.lng};
  state.activeRoute={destination,name:destinationName,coords:[],isDemo:!state.fromGps};
  if(!document.getElementById('map'))showPage('explore');
  updateNavigationHUD();
  routePanel('<div class="route-panel-head"><div><strong>🚶 '+escapeHTML(destinationName)+'</strong><p>'+
    text('Google Maps računa pešačku rutu','Google Maps calculating walking directions')+
    (state.fromGps?'':' · DEMO polazak')+'…</p></div><button class="route-close" onclick="hideRoutePanel()">×</button></div>');
  state.map?.clearRoute();
  if(state.fromGps&&!window.confirm(text(
    'Da izračunamo rutu, tvoju GPS poziciju i odredište šaljemo servisu Google Maps. Nastaviti?',
    'Your GPS location and destination will be sent to Google Maps for walking directions. Continue?'))){
    closeRoute();return;
  }
  try{
    const data=await root.NSSG_GOOGLE_ENGINE.googleWalkingRoute(origin,destination,state.lang);
    if(id!==state.routeRequestSeq)return;
    const coords=data.coords;if(!Array.isArray(coords)||coords.length<2)throw Error('empty-route');
    const maneuvers=(data.maneuvers||[]).map(step=>{
      const pt=step.anchor?.latLng||step.anchor;
      const index=pt?geoDist(pt,coords):null;
      return {index,instruction:step.instruction};
    });
    state.activeRoute={destination,name:destinationName,coords,
      maneuvers:maneuvers.filter(x=>Number.isInteger(x.index)),
      isDemo:!state.fromGps,rerouteAt:0,provider:'google'};
    state.map?.setRoute(coords,destination);
    // One clear initial camera: show the entire real walking route, GPS included,
    // with enough space for the phone's bottom navigation sheet.
    state.map?.fitRoute(coords,{top:75,bottom:180,left:35,right:35,maxZoom:16});
    updateNavigationHUD();
    const distance=Number(data.meters),minutes=Number(data.minutes);
    let stats='';
    if(Number.isFinite(distance)&&distance>=0)stats+='<span>'+(distance<1000?Math.round(distance)+' m':(distance/1000).toFixed(1)+' km')+'</span>';
    if(Number.isFinite(minutes)&&minutes>0)stats+='<span>~'+Math.ceil(minutes)+' min</span>';
    if(!state.fromGps)stats+='<span>DEMO polazak</span>';
    const instructions=maneuvers.map(x=>x.instruction).filter(Boolean).slice(0,16);
    const list=instructions.length?'<ol class="route-steps-preview">'+instructions.map(x=>'<li>'+escapeHTML(x)+'</li>').join('')+'</ol>':'';
    const external='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination.lat+','+destination.lng)+'&travelmode=walking';
    routePanel('<div class="route-panel-head"><div><strong>🚶 '+escapeHTML(destinationName)+'</strong><p>Google Maps · '+
      text('pešačka ruta','walking route')+'</p></div><button class="route-close" onclick="hideRoutePanel()">×</button></div>'+
      '<div class="route-stats">'+stats+'</div>'+list+
      '<p class="route-panel-foot">'+text('Procena; nema glasovne navigacije ni praćenja u pozadini.','Estimate only, no voice or background navigation.')+'</p>'+
      '<div class="route-panel-actions"><button onclick="hideRoutePanel()">'+text('Sakrij uputstva','Hide directions')+'</button>'+
      '<button class="route-end-btn" onclick="closeRoute()">'+text('Završi rutu','End route')+'</button>'+
      '<a href="'+external+'" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div>');
  }catch(error){
    if(id!==state.routeRequestSeq)return;
    console.warn('Google walking route unavailable:',error?.message||error);
    state.map?.clearRoute();
    showRouteError(text('Ruta nije dostupna','Route unavailable'),
      text('Google nije vratio pešačku putanju. Proveri API dozvole, kvote ili mrežu; nećemo prikazati izmišljenu rutu.',
           'Google did not return a walking route. Check API access, quotas or network; no fictional route is drawn.'),destination);
  }
}
root.NSSG_GoogleWalkingUI=Object.freeze({start});
})(window);
