/* Isolated LIVE smoke test. No GPS, fallback geometry, key logging or automatic retries. */
(function(){
  'use strict';
  const origin={lat:45.25562,lng:19.84548}; // Existing catalog: Trg slobode
  const destination={lat:45.256231,lng:19.851065}; // Existing catalog: Dunavska ulica
  const button=document.getElementById('check'),output=document.getElementById('result');
  let map;
  button.addEventListener('click',async()=>{
    button.disabled=true;
    output.textContent='Google WALKING…';
    document.getElementById('steps').replaceChildren();
    map?.clearRoute();
    try{
      const engine=window.NSSG_GOOGLE_ENGINE;
      const result=await engine.googleWalkingRoute(origin,destination,document.getElementById('language').value);
      if(!map)map=new engine.GoogleTourMap(document.getElementById('map'));
      map.setRoute(result.coords,destination);map.fitRoute(result.coords);
      output.textContent=JSON.stringify({test:'LIVE Google Maps JavaScript Route.computeRoutes',status:'PASS',
        sdk:google.maps.version,meters:result.meters,minutes:result.minutes,
        pathPoints:result.coords.length,instructions:result.maneuvers.length},null,2);
      for(const step of result.maneuvers){
        const li=document.createElement('li');li.textContent=step.instruction;
        document.getElementById('steps').append(li);
      }
    }catch(error){
      output.textContent=JSON.stringify({test:'LIVE Google Maps JavaScript Route.computeRoutes',status:'FAIL',
        diagnostic:window.NSSG_GOOGLE_ENGINE.diagnoseRouteError(error)},null,2);
    }finally{button.disabled=false;}
  });
})();
