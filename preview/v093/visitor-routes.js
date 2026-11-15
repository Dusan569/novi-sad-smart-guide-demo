/* Only the keyless visitor map uses pedestrian routes derived from OpenStreetMap. */
(function(root){
  let paths;
  const version=new URL(document.currentScript.src).search;
  async function route(points){
    if(!paths)paths=fetch('./walk-paths.json'+version).then(async response=>{
      if(!response.ok)throw Error('walks-unavailable');
      return (await response.json()).legs;
    }).catch(error=>{paths=null;throw error;});
    const legs=await paths;
    const key=p=>p.lat.toFixed(6)+','+p.lng.toFixed(6);
    const segments=points.slice(1).map((p,i)=>legs[key(points[i])+';'+key(p)]);
    if(segments.length && segments.every(Boolean)){
      return {coords:segments.flatMap(s=>s.coords),meters:segments.reduce((n,s)=>n+s.meters,0),
        minutes:segments.reduce((n,s)=>n+s.seconds,0)/60};
    }
    const waypoints=points.map(p=>p.lng+','+p.lat).join(';');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('https://routing.openstreetmap.de/routed-foot/route/v1/driving/'+waypoints+
        '?overview=full&geometries=geojson',{signal:controller.signal});
      if(!response.ok)throw Error('routing-service');
      const data=await response.json();
      const walk=data.routes?.[0];
      if(data.code!=='Ok'||!walk?.geometry?.coordinates?.length)throw Error('no-walk');
      return {coords:walk.geometry.coordinates,meters:walk.distance,minutes:walk.duration/60};
    }finally{clearTimeout(timer);}
  }
  root.NSSG_VISITOR_ROUTES={route};
})(window);
