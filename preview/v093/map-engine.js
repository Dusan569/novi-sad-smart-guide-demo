/* Novi Sad Smart Guide — lightweight map renderer, no external JS/CSS dependencies.
   Temporary, viewport-only raster solution for the 2026-11-16 demo.
   Tiles are NOT downloaded in bulk or cached by our service worker. */
(function(){
'use strict';
const SIZE=256, MINZOOM=11, MAXZOOM=18;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const normalizeHeading=n=>((n%360)+360)%360;
const invRotation=(x,y,bearing)=>{
 const a=bearing*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
 return {x:x*c-y*sn,y:x*sn+y*c};
};
function world(lat,lng,z){
  const n=SIZE*Math.pow(2,z), safeLat=clamp(lat,-85.05112878,85.05112878);
  const s=Math.sin(safeLat*Math.PI/180);
  return {x:(lng+180)/360*n,y:(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n};
}
function ll(x,y,z){
  const n=SIZE*Math.pow(2,z);return {lng:x/n*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI};
}
class SimpleTourMap{
  constructor(element,options){
    this.host=element;this.zoom=clamp(options.zoom||14,MINZOOM,MAXZOOM);this.bearing=0;this.heading=null;this.onUserGesture=options.onUserGesture||(()=>{});
    this.center={lat:options.lat,lng:options.lng};this.style=options.style||'modern';this.cartoEnabled=Boolean(window.NSSG_MAP_CONFIG?.cartoPublicKey?.trim());
    this.onStatus=options.onStatus||(()=>{});this.destroyed=false;this.renderSerial=0;this.loaded=false;
    this.host.classList.add('tour-raster');this.host.setAttribute('aria-label','Interaktivna mapa turističkih mesta');
    this.host.innerHTML='<div class="raster-tiles" aria-hidden="true"></div><div class="raster-overlay"></div><div class="raster-zoom"><button type="button" data-zoom="in" aria-label="Uvećaj mapu">+</button><button type="button" data-zoom="out" aria-label="Umanji mapu">−</button></div><div class="raster-attribution">© <a target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · testna mapa</div>';
    this.tiles=this.host.querySelector('.raster-tiles');this.overlay=this.host.querySelector('.raster-overlay');this.mapAttribution=this.host.querySelector('.raster-attribution');
    this.zoomButtons=this.host.querySelector('.raster-zoom');
    this.zoomClick=e=>{const b=e.target.closest('button');if(b)this.changeZoom(b.dataset.zoom==='in'?1:-1);};
    this.zoomButtons.addEventListener('click',this.zoomClick);
    // Keep all active touches instead of treating the second finger as another pan.
    // A new gesture anchor is taken on each pointer-count transition.
    this.pointers=new Map();this.gesture=null;this.pendingFrame=0;this.tileNodes=new Map();
    this.gestureStart=()=>{
      const list=[...this.pointers.values()];
      if(!list.length){this.gesture=null;return;}
      const rect=this.host.getBoundingClientRect();
      const mid={x:(list[0].x+(list[1]?.x??list[0].x))/2-rect.left,
                 y:(list[0].y+(list[1]?.y??list[0].y))/2-rect.top};
      const width=this.host.clientWidth,height=this.host.clientHeight;
      const c=world(this.center.lat,this.center.lng,this.zoom);
      const offset=invRotation(mid.x-width/2,mid.y-height/2,this.bearing);
      this.gesture={kind:list.length>=2?'pinch':'pan',zoom:this.zoom,bearing:this.bearing,
        mid,startCenter:{...this.center},anchor:ll(c.x+offset.x,c.y+offset.y,this.zoom),
        angle:list.length>=2?Math.atan2(list[1].y-list[0].y,list[1].x-list[0].x):0,
        dist:list.length>=2?Math.max(1,Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y)):1};
    };
    // Marker buttons must still allow panning if the touch is dragged.
    // Do not capture a marker on pointerdown: a stationary tap should still click it.
    this.markerSelector='.raster-tour-stop,.raster-cluster,.raster-pin,.raster-poi';
    this.dragBlockedClickUntil=0;
    this.suppressDragClick=e=>{
      if(Date.now()<this.dragBlockedClickUntil&&e.target.closest(this.markerSelector)){
        e.preventDefault();e.stopImmediatePropagation();
      }
    };
    this.host.addEventListener('click',this.suppressDragClick,true);
    this.pointerDown=e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const marker=e.target.closest(this.markerSelector);
      if(e.target.closest('button,a,select,input')&&!marker)return;
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,fromMarker:!!marker,captured:false});
      if(!marker){
        e.preventDefault();
        try{this.host.setPointerCapture(e.pointerId);}catch(_){}
      }
      this.gestureStart();
    };
    this.pointerMove=e=>{
      if(!this.pointers.has(e.pointerId))return;
      e.preventDefault();
      const pointer=this.pointers.get(e.pointerId);
      const moved=Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY);
      if(pointer.fromMarker&&moved>7&&!pointer.captured){
        pointer.captured=true;this.dragBlockedClickUntil=Date.now()+450;
        try{this.host.setPointerCapture(e.pointerId);}catch(_){}
      }
      this.pointers.set(e.pointerId,{...pointer,x:e.clientX,y:e.clientY});
      const list=[...this.pointers.values()],g=this.gesture;
      if(!g)return;
      const rect=this.host.getBoundingClientRect();
      const mid={x:(list[0].x+(list[1]?.x??list[0].x))/2-rect.left,
                 y:(list[0].y+(list[1]?.y??list[0].y))/2-rect.top};
      let z=g.zoom;
      let bearing=g.bearing;
      if(g.kind==='pinch'&&list.length>=2){
        const dist=Math.max(1,Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y));
        z=clamp(g.zoom+Math.log2(dist/g.dist),MINZOOM,MAXZOOM);
        const angle=Math.atan2(list[1].y-list[0].y,list[1].x-list[0].x);
        const delta=Math.atan2(Math.sin(angle-g.angle),Math.cos(angle-g.angle));
        bearing=normalizeHeading(g.bearing-delta*180/Math.PI);
      }
      // The original geographic point under the gesture anchor must stay fixed
      // in both the zoom and the rotated map projection.
      const aw=world(g.anchor.lat,g.anchor.lng,z);
      const offset=invRotation(mid.x-this.host.clientWidth/2,mid.y-this.host.clientHeight/2,bearing);
      this.center=ll(aw.x-offset.x,aw.y-offset.y,z);
      this.zoom=z;this.bearing=bearing;
      if(Math.hypot(mid.x-g.mid.x,mid.y-g.mid.y)>3 || Math.abs(z-g.zoom)>.02 || Math.abs(bearing-g.bearing)>.5)this.onUserGesture();
      this.scheduleRender();
    };
    this.pointerUp=e=>{
      if(!this.pointers.has(e.pointerId))return;
      this.pointers.delete(e.pointerId);
      try{if(this.host.hasPointerCapture(e.pointerId))this.host.releasePointerCapture(e.pointerId);}catch(_){}
      this.gestureStart();this.scheduleRender();
    };
    this.wheelAccum=0;
    this.wheel=e=>{
      if(this.destroyed)return;
      e.preventDefault();
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?100:1);
      if(e.ctrlKey){this.changeZoom(clamp(-delta*.013,-.45,.45));return;}
      this.wheelAccum-=delta;
      if(Math.abs(this.wheelAccum)>=60){this.changeZoom(Math.sign(this.wheelAccum));this.wheelAccum=0;}
    };
    this.host.addEventListener('pointerdown',this.pointerDown);
    this.host.addEventListener('pointermove',this.pointerMove);
    this.host.addEventListener('pointerup',this.pointerUp);
    this.host.addEventListener('pointercancel',this.pointerUp);
    this.host.addEventListener('lostpointercapture',this.pointerUp);
    // Some iOS embedded browsers scroll the document over an overlay button.
    // Keep native scroll inside actual navigation and settings panels.
    this.touchNoPageScroll=e=>{
      if(e.target.closest('.tour-overview-panel,.discovery-map-tray,.route-panel,.raster-tour-menu,.raster-cluster-menu,.poi-popup,.nav-hud'))return;
      if(e.cancelable)e.preventDefault();
    };
    this.host.addEventListener('touchmove',this.touchNoPageScroll,{passive:false,capture:true});
    this.host.addEventListener('wheel',this.wheel,{passive:false});
    this.resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>this.scheduleRender()):null;
    if(this.resize)this.resize.observe(this.host);
    this.places=[];this.pois=[];this.position=null;this.radius=3000;this.accuracy=null;this.routeCoords=[];this.routeDestination=null;this.tourStops=[];
    this.render();
  }
  getZoom(){return this.zoom}
  getCenter(){return {...this.center}}
  getBearing(){return this.bearing}
  setBearing(n){if(!Number.isFinite(n))return;this.bearing=normalizeHeading(n);this.scheduleRender()}
  setHeading(n){this.heading=Number.isFinite(n)?normalizeHeading(n):null;this.drawOverlay()}
  setPois(items){this.pois=Array.isArray(items)?items.slice(0,60):[];this.drawOverlay()}
  changeZoom(d){const z=clamp(this.zoom+d,MINZOOM,MAXZOOM);if(z!==this.zoom){this.zoom=z;this.scheduleRender()}}
  easeTo(opts){if(opts.center){this.center={lng:opts.center[0],lat:opts.center[1]}}if(opts.zoom)this.zoom=clamp(Math.round(opts.zoom),MINZOOM,MAXZOOM);this.render()}
  setStyle(s){if(this.style!==s){this.style=s;this.render()}}
  setPlaces(arr){this.places=arr;this.drawOverlay()}
  setRoute(coords,destination){
    if(!Array.isArray(coords)||coords.length<2||coords.length>20000)throw Error('Invalid route geometry');
    if(!coords.every(c=>Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)))throw Error('Invalid route coordinates');
    this.routeCoords=coords;this.routeDestination=destination||null;this.fitRoute(coords);
  }
  clearRoute(){this.routeCoords=[];this.routeDestination=null;this.drawOverlay();}
  setTourStops(stops){
    this.tourStops=Array.isArray(stops)?stops.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).slice(0,30):[];
    this.drawOverlay();
  }
  fitPoints(pts,padding={}){
    if(!Array.isArray(pts)||!pts.length)return false;
    const points=pts.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=85&&Math.abs(p.lng)<=180);
    if(!points.length)return false;
    const w=this.host.clientWidth,h=this.host.clientHeight;if(w<30||h<30)return false;
    const ref=16,coords=points.map(p=>world(p.lat,p.lng,ref));
    const minX=Math.min(...coords.map(p=>p.x)),maxX=Math.max(...coords.map(p=>p.x));
    const minY=Math.min(...coords.map(p=>p.y)),maxY=Math.max(...coords.map(p=>p.y));
    const top=Number.isFinite(padding.top)?padding.top:65,bottom=Number.isFinite(padding.bottom)?padding.bottom:65;
    const left=Number.isFinite(padding.left)?padding.left:40,right=Number.isFinite(padding.right)?padding.right:40;
    const availW=Math.max(55,w-left-right),availH=Math.max(55,h-top-bottom);
    const spanX=Math.max(64,maxX-minX),spanY=Math.max(64,maxY-minY);
    const scale=Math.min(availW/spanX,availH/spanY);
    const zoom=clamp(ref+Math.log2(Math.max(.001,scale)),MINZOOM,Math.min(MAXZOOM,padding.maxZoom??17));
    const f=Math.pow(2,zoom-ref),cX=(minX+maxX)/2+(right-left)/(2*f),cY=(minY+maxY)/2+(bottom-top)/(2*f);
    this.center=ll(cX,cY,ref);this.zoom=zoom;
    this.render();return true;
  }
  fitRoute(coords,padding={}){
    if(!Array.isArray(coords)||coords.length<2)return false;
    return this.fitPoints(coords.map(c=>({lng:c[0],lat:c[1]})),{top:60,bottom:110,left:40,right:40,maxZoom:17,...padding});
  }
  setPosition(pos,accuracy,radius){this.position=pos;this.accuracy=accuracy;this.radius=radius;this.drawOverlay()}
  scheduleRender(){
    if(this.destroyed||this.pendingFrame)return;
    this.pendingFrame=requestAnimationFrame(()=>{this.pendingFrame=0;this.render()});
  }
  remove(){
    this.destroyed=true;this.renderSerial++;
    if(this.pendingFrame)cancelAnimationFrame(this.pendingFrame);
    if(this.failTimer)clearTimeout(this.failTimer);
    if(this.resize)this.resize.disconnect();
    this.zoomButtons.removeEventListener('click',this.zoomClick);
    for(const [evt,fn] of [['pointerdown',this.pointerDown],['pointermove',this.pointerMove],
      ['pointerup',this.pointerUp],['pointercancel',this.pointerUp],
      ['lostpointercapture',this.pointerUp],['wheel',this.wheel]])this.host.removeEventListener(evt,fn);
    this.host.removeEventListener('touchmove',this.touchNoPageScroll,true);
    this.host.removeEventListener('click',this.suppressDragClick,true);
    this.pointers.clear();this.tileNodes.clear();this.host.innerHTML='';
  }
  tileUrl(z,x,y){
    // CARTO tiles need a valid public key; never embed private API credentials in a web bundle.
    const key=window.NSSG_MAP_CONFIG?.cartoPublicKey;
    if(this.cartoEnabled&&typeof key==='string'&&key.trim()){
      const theme=this.style==='minimal'?'light_all':'voyager';
      // 2x raster images improve sharpness on Retina and high-density phone screens.
      const pixelRatio=(typeof window.devicePixelRatio==='number'&&window.devicePixelRatio>=1.5)?'@2x':'';
      return `https://basemaps.cartocdn.com/${theme==='light_all'?'': 'rastertiles/'}${theme}/${z}/${x}/${y}${pixelRatio}.png?key=${encodeURIComponent(key.trim())}`;
    }
    // Keyless demo fallback. Never prefetch bulk tiles; provider terms apply.
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
  render(){
    if(this.destroyed)return;
    const w=this.host.clientWidth,h=this.host.clientHeight;if(w<1||h<1)return;
    // Raster tiles are requested only at integer source zoom levels; during pinch
    // the same images scale smoothly instead of being discarded each frame.
    const z=Math.floor(this.zoom),scale=Math.pow(2,this.zoom-z),tileSize=SIZE*scale;
    const c=world(this.center.lat,this.center.lng,this.zoom),topX=c.x-w/2,topY=c.y-h/2;
    // Cover the viewport's diagonal, not just its axis-aligned rectangle:
    // rotation would otherwise show empty corners. Retain a tile overscan.
    const padX=(Math.hypot(w,h)-w)/2,padY=(Math.hypot(w,h)-h)/2;
    const xmin=Math.floor((topX-padX)/tileSize)-1,xmax=Math.floor((topX+w+padX)/tileSize)+1;
    const ymin=Math.floor((topY-padY)/tileSize)-1,ymax=Math.floor((topY+h+padY)/tileSize)+1;
    const count=Math.pow(2,z),needed=new Set();
    const source=this.cartoEnabled?'carto-'+this.style:'osm';
    for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
      if(y<0||y>=count)continue;
      const ix=((x%count)+count)%count,key=source+'/'+z+'/'+x+'/'+y;
      needed.add(key);
      let tile=this.tileNodes.get(key);
      if(!tile){
        tile=document.createElement('img');tile.className='raster-tile';tile.alt='';tile.decoding='async';
        tile.draggable=false;tile.style.opacity='0';tile.dataset.source=source;
        this.tileNodes.set(key,tile);this.tiles.appendChild(tile);
        tile.onload=()=>{
          if(this.destroyed||!this.tileNodes.has(key))return;
          tile.dataset.loaded='true';tile.style.opacity='1';
          if(!this.loaded){this.loaded=true;this.onStatus('ready');}
        };
        tile.onerror=()=>{
          if(this.destroyed||!this.tileNodes.has(key))return;
          tile.dataset.failed='true';
          // Avoid switching provider on one transient tile/network failure.
          const same=[...this.tileNodes.values()].filter(t=>t.dataset.source===source);
          if(this.cartoEnabled&&same.filter(t=>t.dataset.failed).length>=3 &&
             !same.some(t=>t.dataset.loaded==='true')){
            this.cartoEnabled=false;this.loaded=false;this.scheduleRender();
          }
        };
        tile.src=this.tileUrl(z,ix,y);
      }
      tile.style.left=(x*tileSize-topX)+'px';tile.style.top=(y*tileSize-topY)+'px';
      tile.style.width=tileSize+'px';tile.style.height=tileSize+'px';
    }
    // DOM node identity stays stable while panning. This prevents repeated
    // image downloads and the map 'scrambling' on phones.
    for(const [key,tile] of this.tileNodes){
      if(!needed.has(key)){tile.onload=null;tile.onerror=null;tile.remove();this.tileNodes.delete(key);}
    }
    this.tiles.style.transform='rotate('+(-this.bearing)+'deg)';
    this.overlay.style.transform='rotate('+(-this.bearing)+'deg)';
    this.tiles.classList.toggle('raster-soft',this.style==='minimal'&&!this.cartoEnabled);
    this.tiles.classList.toggle('raster-modern',this.style==='modern'&&!this.cartoEnabled);
    if(this.mapAttribution)this.mapAttribution.innerHTML=this.cartoEnabled?
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors · © <a href="https://carto.com/attribution/" target="_blank" rel="noopener noreferrer">CARTO</a>':
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors · demo';
    this.drawOverlay();
    if(!this.loaded){
      clearTimeout(this.failTimer);
      this.failTimer=setTimeout(()=>{
        if(!this.destroyed&&!this.loaded){
          const tiles=[...this.tileNodes.values()];
          if(tiles.length && !tiles.some(t=>t.dataset.loaded==='true'))this.onStatus('tiles');
        }
      },9500);
    }
  }
  drawOverlay(){
    if(this.destroyed)return;
    const w=this.host.clientWidth,h=this.host.clientHeight;if(w<1||h<1)return;
    const c=world(this.center.lat,this.center.lng,this.zoom),points=document.createDocumentFragment();
    const xy=(lat,lng)=>{const p=world(lat,lng,this.zoom);return {x:p.x-c.x+w/2,y:p.y-c.y+h/2}};
    const ring=(lat,lng,metres,type)=>{
      const p=xy(lat,lng),resolution=156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,this.zoom);
      const radius=Math.max(1,metres/resolution);const circle=document.createElement('div');circle.className='raster-circle '+type;
      circle.style.left=p.x+'px';circle.style.top=p.y+'px';circle.style.width=radius*2+'px';circle.style.height=radius*2+'px';points.appendChild(circle);
    };
    if(this.routeCoords.length){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');
      svg.setAttribute('class','raster-route');
      const pointsValue=this.routeCoords.map(c=>{const p=xy(c[1],c[0]);return p.x.toFixed(1)+','+p.y.toFixed(1)}).join(' ');
      for(const [cls,width,stroke] of [['route-halo',11,'rgba(255,255,255,.95)'],['route-main',6,'#2189e8']]){
        const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',pointsValue);
        line.setAttribute('stroke',stroke);line.setAttribute('stroke-width',String(width));line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');line.setAttribute('fill','none');line.setAttribute('class',cls);svg.appendChild(line);
      }
      points.appendChild(svg);
      if(this.routeDestination){const end=xy(this.routeDestination.lat,this.routeDestination.lng);const pin=document.createElement('div');pin.className='route-end-marker';pin.style.left=end.x+'px';pin.style.top=end.y+'px';pin.textContent='⚑';pin.title='Odredište';points.appendChild(pin);}
    }
    if(this.position){ring(this.position.lat,this.position.lng,this.radius,'raster-search-radius');if(this.accuracy)ring(this.position.lat,this.position.lng,this.accuracy,'raster-accuracy');const p=xy(this.position.lat,this.position.lng);const marker=document.createElement('div');marker.className='raster-you';marker.style.left=p.x+'px';marker.style.top=p.y+'px';marker.title='Tvoja GPS lokacija';
      if(this.heading!==null){const arrow=document.createElement('div');arrow.className='raster-heading-arrow';
        // Parent overlay rotates with the map: a compass heading is world-relative.
        arrow.style.transform='translate(-50%,-100%) rotate('+this.heading+'deg)';marker.appendChild(arrow);}
      points.appendChild(marker);}
    // Cluster overlapping editorial pins rather than obscuring the city centre.
    if(this.tourStops.length){
      const clusters=[];
      for(const stop of this.tourStops){
        const p=xy(stop.lat,stop.lng);
        if(p.x < -25||p.x>w+25||p.y < -25||p.y>h+25)continue;
        const close=clusters.find(g=>Math.hypot(g.x-p.x,g.y-p.y)<38);
        if(close){const n=close.items.length;close.items.push(stop);close.x=(close.x*n+p.x)/(n+1);close.y=(close.y*n+p.y)/(n+1);}
        else clusters.push({x:p.x,y:p.y,items:[stop]});
      }
      for(const cluster of clusters){
        const b=document.createElement('button');b.type='button';b.className='raster-tour-stop';
        const list=cluster.items.sort((a,b)=>a.number-b.number);
        b.textContent=list.length===1?String(list[0].number):list.map(x=>x.number).join('–');
        if(list.length>1)b.classList.add('raster-tour-group');
        b.style.left=cluster.x+'px';b.style.top=cluster.y+'px';
        b.title=list.map(x=>x.number+'. '+x.label).join(', ');b.setAttribute('aria-label',b.title);
        b.addEventListener('click',e=>{
          e.stopPropagation();
          if(list.length===1){list[0].click?.();return;}
          this.host.querySelector('.raster-tour-menu')?.remove();
          const menu=document.createElement('section');menu.className='raster-tour-menu';
          menu.style.left=Math.min(Math.max(8,cluster.x-90),Math.max(8,w-212))+'px';
          menu.style.top=Math.min(Math.max(8,cluster.y+20),Math.max(8,h-176))+'px';
          const title=document.createElement('strong');title.textContent='Stanice šetnje';menu.appendChild(title);
          for(const stop of list){const button=document.createElement('button');button.type='button';
            button.textContent=stop.number+'. '+stop.label;
            button.onclick=()=>{menu.remove();stop.click?.()};menu.appendChild(button);}
          this.host.appendChild(menu);
        });points.appendChild(b);
      }
    }
    const visible=this.places.map(item=>({item,p:xy(item.lat,item.lng)})).filter(({p})=>p.x>=-42&&p.y>=-42&&p.x<=w+42&&p.y<=h+42);
    const groups=[];
    for(const marker of visible){
      const nearby=groups.find(g=>Math.hypot(g.x-marker.p.x,g.y-marker.p.y)<50);
      if(nearby){nearby.items.push(marker.item);const n=nearby.items.length;
        nearby.x+=(marker.p.x-nearby.x)/n;nearby.y+=(marker.p.y-nearby.y)/n;}
      else groups.push({x:marker.p.x,y:marker.p.y,items:[marker.item]});
    }
    for(const g of groups){
      if(g.items.length===1){const item=g.items[0];
        const b=document.createElement('button');b.type='button';b.className='raster-pin';b.style.left=g.x+'px';b.style.top=g.y+'px';b.textContent=item.emoji;
        b.title=item.label;b.setAttribute('aria-label',item.label);
        b.addEventListener('click',e=>{e.stopPropagation();item.click()});points.appendChild(b);
      }else{
        const b=document.createElement('button');b.type='button';b.className='raster-cluster';b.style.left=g.x+'px';b.style.top=g.y+'px';b.textContent=String(g.items.length);
        b.title=g.items.map(x=>x.label).join(', ');b.setAttribute('aria-label',g.items.length+' places — open list');
        b.addEventListener('click',e=>{e.stopPropagation();
          if(this.zoom<16){const place=g.items[0];this.easeTo({center:[place.lng,place.lat],zoom:Math.min(17,this.zoom+2),duration:350});return;}
          const older=this.host.querySelector('.raster-cluster-menu');if(older)older.remove();
          const menu=document.createElement('div');menu.className='raster-cluster-menu';
          menu.style.left=Math.min(Math.max(10,g.x-80),Math.max(10,w-206))+'px';
          menu.style.top=Math.min(Math.max(10,g.y+10),Math.max(10,h-190))+'px';
          const title=document.createElement('strong');title.textContent=g.items.length+' places nearby';menu.appendChild(title);
          for(const item of g.items){const option=document.createElement('button');option.type='button';option.textContent=item.emoji+' '+item.label;
            option.addEventListener('click',()=>{menu.remove();item.click()});menu.appendChild(option);}
          this.host.appendChild(menu);
        });points.appendChild(b);
      }
    }
    // OSM POIs are separate real data overlays. Printed names on raster tiles are not interactive.
    if(this.zoom>=14){
      const used=[];
      const offsets=[[0,0],[38,-21],[-38,21],[38,28],[-38,-28],[0,45],[0,-45],[60,0],[-60,0],[65,45],[-65,-45]];
      for(const item of this.pois){
        const origin=xy(item.lat,item.lng);
        // Closely spaced real-world POIs need collision avoidance so all visible icons can be clicked.
        // Offsets are DISPLAY ONLY and don't change the actual routing coordinates.
        const chosen=offsets.map(([dx,dy])=>({x:origin.x+dx,y:origin.y+dy})).find(pos=>pos.x>=17&&pos.y>=17&&pos.x<=w-17&&pos.y<=h-17&&!used.some(other=>Math.hypot(other.x-pos.x,other.y-pos.y)<35));
        if(!chosen)continue;used.push(chosen);
        const marker=document.createElement('button');marker.type='button';marker.className='raster-poi';
        marker.style.left=chosen.x+'px';marker.style.top=chosen.y+'px';marker.textContent=item.emoji;
        marker.title=item.label;marker.setAttribute('aria-label',item.label);
        marker.addEventListener('click',event=>{event.stopPropagation();item.click()});points.appendChild(marker);
      }
    }
    this.overlay.replaceChildren(points);
  }
}
window.SimpleTourMap=SimpleTourMap;
})();
