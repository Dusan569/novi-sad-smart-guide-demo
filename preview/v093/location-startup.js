/* Direct foreground location request with a visible status and one gesture retry. */
(function(root){
 'use strict';
 let pending=false,waitingForVisible=false,retryOnTouch=false;
 const text=(sr,en)=>state.lang==='sr'?sr:en;
 function status(message,canRetry=false){
  let box=document.getElementById('locationStatus');
  if(!box){
   box=document.createElement('section');
   box.id='locationStatus';
   box.setAttribute('role','status');
   box.innerHTML='<span></span><button type="button"></button>';
   const page=document.getElementById('page');
   if(!page)return;
   page.before(box);
   box.querySelector('button').onclick=()=>start();
  }
  box.hidden=false;
  box.querySelector('span').textContent=message;
  const button=box.querySelector('button');
  button.hidden=!canRetry;
  button.textContent=text('Pokušaj ponovo','Try again');
 }
 function finish(pos){
  pending=false;retryOnTouch=false;
  applyPosition(pos);
  const box=document.getElementById('locationStatus');
  if(box)box.hidden=true;
  const copy=document.querySelector('.editorial-home .discovery-next p');
  if(copy)copy.textContent=text('Istraži mesta oko svoje lokacije.','Explore places near your location.');
 }
 function fail(error){
  pending=false;
  // A denial may represent an explicit user choice. Retry only on request.
  if(error?.code===1)retryOnTouch=false;
  status(error?.code===1?
   text('Lokacija je blokirana u pregledaču.','Location blocked in the browser.'):
   text('Lokacija nije pronađena.','Location not found.'),true);
 }
 function locate(highAccuracy){
  try{
   navigator.geolocation.getCurrentPosition(finish,error=>{
    if(highAccuracy&&(error?.code===2||error?.code===3)){
     status(text('Tražimo lokaciju…','Finding location…'));
     locate(false);
    }else fail(error);
   },{enableHighAccuracy:highAccuracy,maximumAge:highAccuracy?30000:0,timeout:highAccuracy?18000:12000});
  }catch(error){fail(error);}
 }
 function start(){
  if(pending)return;
  if(document.hidden){waitingForVisible=true;return;}
  waitingForVisible=false;
  if(!root.isSecureContext||!navigator.geolocation){
   status(text('Lokacija nije dostupna u ovom pregledaču.','Location unavailable in this browser.'));
   return;
  }
  pending=true;
  status(text('Tražimo lokaciju…','Finding location…'));
  // A Permissions API query can disagree with the native prompt or never resolve.
  // Ask geolocation directly and use its actual response.
  locate(true);
 }
 function gestureRetry(event){
  if(!event.isTrusted||pending||state.fromGps||!retryOnTouch)return;
  retryOnTouch=false;
  start();
 }
 retryOnTouch=true;
 document.addEventListener('click',gestureRetry,{capture:true});
 document.addEventListener('visibilitychange',()=>{if(waitingForVisible&&!document.hidden)start();});
 root.NSSG_LOCATION_STARTUP=Object.freeze({start});
})(window);
