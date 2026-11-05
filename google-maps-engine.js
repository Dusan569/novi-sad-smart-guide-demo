/* Google Maps foundation v0.6.0 — intentionally disabled without a restricted public browser key.
 * The existing raster implementation is preserved in git for rollback but NOT selected here.
 * Google Maps content and Google Routes must stay on Google Maps. No Valhalla/OSM overlay.
 */
(function(root){
  'use strict';
  const cfg=()=>root.NSSG_GOOGLE_CONFIG||{};
  const valid=p=>p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lng);
  const coordinates=p=>({lat:+p.lat,lng:+p.lng});
  const toLatLng=p=>({lat:+p[1],lng:+p[0]});
  let loaderPromise=null;
  function loadGoogle(){
    if(loaderPromise)return loaderPromise;
    const key=cfg().browserKey;
    if(!key || !/^[A-Za-z0-9_-]{20,}$/.test(key)){
      return Promise.reject(new Error('google_maps_key_missing'));
    }
    loaderPromise=new Promise((resolve,reject)=>{
      if(root.google?.maps?.importLibrary){resolve(root.google.maps);return;}
      const callback='NSSG_google_maps_ready';
      let settled=false;
      const finish=(error)=>{
        if(settled)return;
        settled=true;clearTimeout(timeout);
        try{delete root[callback]}catch(_){}
        if(error){loaderPromise=null;reject(error);}
        else resolve(root.google.maps);
      };
      const timeout=setTimeout(()=>finish(new Error('google_maps_timeout')),18000);
      root[callback]=()=>finish();
      const script=document.createElement('script');
      script.async=true;
      script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+
        '&v=weekly&loading=async&libraries=maps,marker&callback='+callback+'&language='+encodeURIComponent(cfg().language||'sr');
      script.referrerPolicy='strict-origin-when-cross-origin';
      script.onerror=()=>finish(new Error('google_maps_network_error'));
      document.head.append(script);
    });
    return loaderPromise;
  }
  const mkContent=(name,tag)=>{
    const el=document.createElement('div');
    el.className='google-guide-marker';
    const dot=document.createElement('span');dot.className='google-guide-marker-icon';dot.textContent=tag;
    const label=document.createElement('span');label.className='google-guide-marker-label';label.textContent=name;
    el.append(dot,label);el.title=name;return el;
  };
  class GoogleTourMap{
    constructor(host,options={}){
      if(!root.google?.maps?.Map)throw new Error('google_maps_not_loaded');
      this.host=host;this.opts=options;this.removed=false;
      this.positionMarker=null;this.accuracyCircle=null;this.areaCircle=null;this.routeLine=null;
      this.markers=[];this.poiMarkers=[];this.stopMarkers=[];this.heading=null;
      this.map=new google.maps.Map(host,{
        center:{lat:+options.lat||45.25565,lng:+options.lng||19.84563},
        zoom:Number.isFinite(options.zoom)?options.zoom:14,
        mapId:cfg().mapId||'DEMO_MAP_ID',
        gestureHandling:'greedy', // one finger pans map instead of entire page
        headingInteractionEnabled:true,tiltInteractionEnabled:false,
        tilt:0,heading:0,disableDefaultUI:true,
        zoomControl:true,streetViewControl:false,mapTypeControl:false,
        clickableIcons:true,keyboardShortcuts:true,
        isFractionalZoomEnabled:true
      });
      this.listeners=[
        this.map.addListener('dragstart',()=>this.opts.onUserGesture?.()),
        this.map.addListener('heading_changed',()=>this.opts.onUserGesture?.())
      ];
      this.map.addListener('idle',()=>{
        if(!this.removed){this.opts.onStatus?.('ready');}
      });
      host.classList.add('google-guide-map');
      host.closest('.map-wrap')?.classList.add('google-map-active');
      // Avoid the old raster-specific zoom widgets, the browser handles gestures.
    }
    getCenter(){const c=this.map.getCenter();return c?{lat:c.lat(),lng:c.lng()}:{lat:45.25565,lng:19.84563};}
    getZoom(){return this.map.getZoom()||14;}
    getBearing(){return this.map.getHeading()||0;}
    setBearing(n){if(Number.isFinite(n))this.map.setHeading(((n%360)+360)%360);}
    setHeading(n){this.heading=Number.isFinite(n)?n:null;this._updateHeading();}
    changeZoom(step){this.map.setZoom(Math.max(3,Math.min(21,this.getZoom()+step)));}
    setStyle(){/* Appearance controlled through Google Map ID and its cloud map style. */}
    easeTo({center,zoom,bearing}={}){
      if(center&&center.length===2)this.map.panTo({lat:+center[1],lng:+center[0]});
      if(Number.isFinite(zoom))this.map.setZoom(zoom);
      if(Number.isFinite(bearing))this.setBearing(bearing);
    }
    _clear(which){(this[which]||[]).forEach(m=>{m.map=null});this[which]=[];}
    _addPins(items,which,kind){
      this._clear(which);
      if(!Array.isArray(items))return;
      for(const item of items){
        if(!valid(item))continue;
        const text=String(item.label||'Lokacija').slice(0,100);
        const tag=kind==='tour'?String(item.number||'•'):kind==='poi'?'☕':String(item.emoji||'📍');
        const el=mkContent(text,tag);
        const marker=new google.maps.marker.AdvancedMarkerElement({
          map:this.map,position:coordinates(item),gmpClickable:true,
          title:text,zIndex:kind==='tour'?90:kind==='poi'?20:40
        });
        marker.append(el);
        // SDK owns dragging: unlike the custom map, a gesture beginning over a pin
        // must not become page-scroll. Use the marker's native click event.
        marker.addEventListener('gmp-click',()=>{
          if(typeof item.click==='function')item.click();
        });
        this[which].push(marker);
      }
    }
    setPlaces(items){
      this._addPins(items,'markers','place');
    }
    setPois(items){
      this._addPins(items,'poiMarkers','poi');
    }
    setTourStops(stops){this._addPins(stops,'stopMarkers','tour');}
    setPosition(pos,accuracy,radius){
      if(this.positionMarker){this.positionMarker.map=null;this.positionMarker=null;}
      if(this.accuracyCircle){this.accuracyCircle.setMap(null);this.accuracyCircle=null;}
      if(this.areaCircle){this.areaCircle.setMap(null);this.areaCircle=null;}
      if(!valid(pos))return;
      const el=document.createElement('span');el.className='google-user-dot';el.setAttribute('role','img');el.setAttribute('aria-label','Tvoja GPS lokacija');
      this.positionMarker=new google.maps.marker.AdvancedMarkerElement({map:this.map,position:coordinates(pos),content:el,title:'Tvoja GPS lokacija',zIndex:1000});
      if(Number.isFinite(accuracy)&&accuracy>0 && accuracy<1000){
        this.accuracyCircle=new google.maps.Circle({map:this.map,center:coordinates(pos),radius:accuracy,
          strokeColor:'#0C98DA',strokeOpacity:.35,strokeWeight:1,fillColor:'#2387D9',fillOpacity:.08,clickable:false});
      }
      if(Number.isFinite(radius)&&radius>0){
        this.areaCircle=new google.maps.Circle({map:this.map,center:coordinates(pos),radius,
          strokeColor:'#0D9B90',strokeOpacity:.28,strokeWeight:1,fillColor:'#0EAFA2',fillOpacity:.035,clickable:false});
      }
      this._updateHeading();
    }
    _updateHeading(){
      const el=this.positionMarker?.content;
      if(!el)return;
      el.style.setProperty('--heading',Number.isFinite(this.heading)?this.heading+'deg':'0deg');
      el.classList.toggle('has-heading',Number.isFinite(this.heading));
    }
    setRoute(coords,destination){
      this.clearRoute();
      if(!Array.isArray(coords)||coords.length<2)return;
      const path=coords.filter(x=>Array.isArray(x)&&Number.isFinite(+x[0])&&Number.isFinite(+x[1])).map(toLatLng);
      if(path.length<2)return;
      this.routeLine=new google.maps.Polyline({map:this.map,path,
        strokeColor:'#1678E7',strokeOpacity:.97,strokeWeight:7,zIndex:80,geodesic:false,clickable:false});
      this.routeCoords=coords;
      if(valid(destination)){
        const el=mkContent('Odredište','⚑');
        this.destinationMarker=new google.maps.marker.AdvancedMarkerElement({map:this.map,position:coordinates(destination),content:el,title:'Odredište',zIndex:200});
      }
    }
    clearRoute(){
      if(this.routeLine){this.routeLine.setMap(null);this.routeLine=null;}
      if(this.destinationMarker){this.destinationMarker.map=null;this.destinationMarker=null;}
      this.routeCoords=[];
    }
    fitPoints(items,padding={}){
      const arr=(items||[]).filter(valid);if(!arr.length)return;
      const b=new google.maps.LatLngBounds();arr.forEach(p=>b.extend(coordinates(p)));
      this.map.fitBounds(b,{top:padding.top??75,right:padding.right??35,bottom:padding.bottom??145,left:padding.left??35});
      const max=Number.isFinite(padding.maxZoom)?padding.maxZoom:17;
      google.maps.event.addListenerOnce(this.map,'idle',()=>{if(this.map.getZoom()>max)this.map.setZoom(max)});
    }
    fitRoute(coords,padding={}){this.fitPoints((coords||[]).map(toLatLng),padding);}
    remove(){
      this.removed=true;
      this._clear('markers');this._clear('poiMarkers');this._clear('stopMarkers');
      this.clearRoute();this.setPosition(null);
      this.listeners.forEach(x=>x.remove());google.maps.event.clearInstanceListeners(this.map);
      this.host.innerHTML='';
    }
  }
  function diagnoseRouteError(cause){
    // Never report key values or URLs. A public client-side Maps key is not a password,
    // but disclosing an unrestricted key and service request details is unnecessary.
    const raw=[cause?.code,cause?.status,cause?.statusCode,cause?.name,cause?.message]
      .filter(v=>v!==undefined&&v!==null).map(String).join(' ');
    const upper=raw.toUpperCase();
    let category='UNKNOWN',code='UNKNOWN';
    if(/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|QUOTA|RATE.LIMIT|HTTP.?429/.test(upper)){category='QUOTA';code='RESOURCE_EXHAUSTED';}
    else if(/PERMISSION_DENIED|REQUEST_DENIED|FORBIDDEN|HTTP.?403|API.TARGET.BLOCKED|NOT.ENABLED|NOT.AUTHORIZ/.test(upper)){category='CONFIG';code='PERMISSION_DENIED';}
    else if(/BILLING.NOT.ENABLED|BILLING_DISABLED|BILLING/.test(upper)){category='CONFIG';code='BILLING_NOT_ENABLED';}
    else if(/INVALID_ARGUMENT|INVALID.REQUEST|BAD.REQUEST|HTTP.?400/.test(upper)){category='REQUEST';code='INVALID_ARGUMENT';}
    else if(/UNAUTHENTICATED|INVALID.API.KEY|API.KEY.INVALID|HTTP.?401/.test(upper)){category='CONFIG';code='INVALID_KEY';}
    else if(/ZERO_RESULTS|NO_WALKING_ROUTE|NO.ROUTE|EMPTY.ROUTE/.test(upper)){category='NO_ROUTE';code='ZERO_RESULTS';}
    else if(/NETWORK|TIMEOUT|FETCH|OFFLINE|FAILED.TO.LOAD|INTERNET/.test(upper)){category='NETWORK';code='NETWORK_FAILURE';}
    else if(/INVALID_INTERMEDIATES|INVALID_COORDINATE|BAD_ROUTE_COORDINATES|INVALID_TOUR_STOPS/.test(upper)){category='REQUEST';code='INVALID_COORDINATES';}
    // Keep only a safe, compact message for debugging; scrub credentials,
    // query strings and full URLs, and avoid exposing the whole Google response.
    let summary=String(cause?.message||cause?.name||'').slice(0,350)
      .replace(/AIzaSy[A-Za-z0-9_-]{8,}/g,'[redacted]')
      .replace(/(?:key|api[_-]?key)\s*[=:]\s*[^&\s]+/gi,'key=[redacted]')
      .replace(/https?:\/\/\S+/gi,'[URL redacted]')
      .replace(/[\r\n\t]+/g,' ').slice(0,170);
    return {category,code,summary};
  }
  function classifyRouteError(error){return diagnoseRouteError(error).category;}
  async function googleWalkingRoute(origin,destination,language='sr',intermediates=[]){
   try{
    if(!valid(origin)||!valid(destination))throw new Error('invalid_coordinate');
    if(!Array.isArray(intermediates)||intermediates.length>10||!intermediates.every(valid))throw new Error('invalid_intermediates');
    await loadGoogle();
    const {Route}=await google.maps.importLibrary('routes');
    const {routes}=await Route.computeRoutes({
      origin:coordinates(origin),destination:coordinates(destination),
      ...(intermediates.length?{intermediates:intermediates.map(p=>({location:coordinates(p)}))}:{}),
      travelMode:'WALKING',language:language==='sr'?'sr':'en',
      fields:['path','distanceMeters','durationMillis','legs']
    });
    const r=routes?.[0];if(!r||!Array.isArray(r.path)||r.path.length<2)throw new Error('no_walking_route');
    const path=r.path.map(p=>[typeof p.lng==='function'?p.lng():p.lng,typeof p.lat==='function'?p.lat():p.lat]);
    if(!path.every(p=>p.every(Number.isFinite)))throw new Error('bad_route_coordinates');
    const maneuvers=(r.legs||[]).flatMap(l=>l.steps||[]).filter(s=>s.instructions).map(s=>({
      instruction:String(s.instructions).slice(0,240),
      anchor:s.startLocation?.latLng||s.startLocation||null
    }));
    return {coords:path,meters:r.distanceMeters,minutes:Math.ceil((r.durationMillis||0)/60000),
      maneuvers,routesProvider:'Google Maps Routes'};
   }catch(cause){
     const diagnostic=diagnoseRouteError(cause);
     const error=new Error(diagnostic.code);
     error.code=diagnostic.category;
     error.diagnostic=diagnostic;
     throw error;
   }
  }
  function googleTourRoute(points,language='sr'){
    if(!Array.isArray(points)||points.length<2||points.length>12||!points.every(valid)){
      return Promise.reject(new Error('invalid_tour_stops'));
    }
    return googleWalkingRoute(points[0],points[points.length-1],language,points.slice(1,-1));
  }
  root.NSSG_GOOGLE_ENGINE=Object.freeze({loadGoogle,GoogleTourMap,googleWalkingRoute,googleTourRoute,classifyRouteError,diagnoseRouteError});
})(window);
