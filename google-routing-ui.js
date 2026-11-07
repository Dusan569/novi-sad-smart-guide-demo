/* Google walking route UI adapter — never calls Valhalla on a Google map. */
(function(root){
'use strict';
function text(sr,en){return state.lang==='sr'?sr:en;}
function distanceMeters(a,b){
 const rad=Math.PI/180, dlat=(Number(b.lat)-Number(a.lat))*rad,dlng=(Number(b.lng)-Number(a.lng))*rad;
 const x=Math.sin(dlat/2)**2+Math.cos(Number(a.lat)*rad)*Math.cos(Number(b.lat)*rad)*Math.sin(dlng/2)**2;
 return 12742000*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
}
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
  // The demo city centre is beside some landmark pins; asking Google to route
  // from exactly the same point can return an empty route, not an API error.
  const straightLine=distanceMeters(origin,destination);
  if(Number.isFinite(straightLine)&&straightLine<18){
    state.activeRoute=null;
    state.map?.clearRoute();
    routePanel('<div class="route-panel-head"><div><strong>📍 '+escapeHTML(destinationName)+'</strong><p>'+
      (state.fromGps
       ? text('Odredište je neposredno uz tvoju trenutnu lokaciju.','The destination is right by your location.')
       : text('Odredište je već na demonstracionoj polaznoj tački. Uključi GPS ili izaberi udaljenije mesto.','The destination is at the demo starting point. Allow GPS or choose a farther place.'))+
      '</p></div><button class="route-close" onclick="hideRoutePanel()" aria-label="Sakrij">×</button></div>');
    updateNavigationHUD();
    return;
  }
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
    const instructions=maneuvers.map(x=>x.instruction).filter(Boolean);
    const list=instructions.length?'<ol class="route-steps-preview">'+instructions.map(x=>'<li>'+escapeHTML(x)+'</li>').join('')+'</ol>':'';
    const external='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination.lat+','+destination.lng)+'&travelmode=walking';
    routePanel('<div class="route-panel-head"><div><strong>🚶 '+escapeHTML(destinationName)+'</strong><p>Google Maps · '+
      text('pešačka ruta','walking route')+'</p></div><button class="route-close" onclick="hideRoutePanel()">×</button></div>'+
      '<div class="route-stats">'+stats+'</div>'+list+
      (data.warnings||[]).map(w=>'<p class="route-panel-foot">'+escapeHTML(w)+'</p>').join('')+
      '<p class="route-panel-foot">'+text('Procena; nema glasovne navigacije ni praćenja u pozadini.','Estimate only, no voice or background navigation.')+'</p>'+
      '<div class="route-panel-actions"><button onclick="hideRoutePanel()">'+text('Sakrij uputstva','Hide directions')+'</button>'+
      '<button class="route-end-btn" onclick="closeRoute()">'+text('Završi rutu','End route')+'</button>'+
      '<a href="'+external+'" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div>');
  }catch(error){
    if(id!==state.routeRequestSeq)return;
    console.warn('Google walking route unavailable:',root.NSSG_GOOGLE_ENGINE.diagnoseRouteError(error).code);
    state.map?.clearRoute();
    const code=error?.code||'UNKNOWN';
    const messages={
      CONFIG:[
        text('Navigacija se još podešava','Walking directions not yet configured'),
        text('Google mapa radi, ali pešačke rute zahtevaju omogućen Routes API i odgovarajuće Google Cloud dozvole.','The map works, but walking directions require an enabled Routes API and correct Google Cloud permissions.')
      ],
      QUOTA:[
        text('Navigacija je trenutno zauzeta','Routing is temporarily unavailable'),
        text('Google Routes kvota je dostignuta. Pokušaj ponovo kasnije.','Google Routes quota was reached. Please retry later.')
      ],
      NETWORK:[
        text('Problem sa vezom','Connection problem'),
        text('Trenutno nema odgovora Google servisa. Mapa i znamenitosti ostaju dostupne.','Google is not responding. The map and attractions remain available.')
      ],
      NO_ROUTE:[
        text('Nema pešačke rute','No walking route'),
        text('Za ove dve lokacije Google nije pronašao pešačku putanju.','Google found no walking path between these locations.')
      ],
      REQUEST:[
        text('Google ne prihvata parametre rute','Google rejected route parameters'),
        text('Google je odbio zahtev za rutiranje. Otvori detalje greške ispod.','Google rejected the route request. Expand error details below.')
      ],
      UNKNOWN:[
        text('Ruta trenutno nije dostupna','Route temporarily unavailable'),
        text('Lokacija je prikazana na mapi. Pokušaj ponovo ili izaberi drugo odredište.','The place is still on the map. Retry or choose another destination.')
      ]
    };
    const [title,reason]=messages[code]||messages.UNKNOWN;
    showRouteError(title,reason,destination);
    const diag=error?.diagnostic||root.NSSG_GOOGLE_ENGINE?.diagnoseRouteError?.(error);
    const panel=document.querySelector('#routePanel');
    if(panel&&diag){
      const details=document.createElement('details');
      details.className='route-diagnostic';
      const summary=document.createElement('summary');
      summary.textContent=text('Zašto navigacija ne radi?','Why did directions fail?');
      const p=document.createElement('p');
      p.textContent='Google status: '+String(diag.code||'UNKNOWN')+(diag.stage?' · '+diag.stage:'')+(diag.httpStatus?' · HTTP '+diag.httpStatus:'')+(diag.summary?' · '+diag.summary:'');
      details.append(summary,p);
      panel.append(details);
    }
  }
}
root.NSSG_GoogleWalkingUI=Object.freeze({start});
})(window);
