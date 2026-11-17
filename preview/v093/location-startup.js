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
  status(error?.code===1?
   text('Pregledač je blokirao lokaciju. Dozvoli lokaciju ovom sajtu u meniju pregledača.','Your browser blocked location. Allow location for this site in the browser menu.'):
   text('Telefon još nije pronašao lokaciju. Proveri da li je lokacija uključena i pokušaj ponovo.','Your phone has not found its location. Check that location is enabled and retry.'),true);
 }
 function locate(highAccuracy){
  try{
   navigator.geolocation.getCurrentPosition(finish,error=>{
    if(highAccuracy&&(error?.code===2||error?.code===3)){
     status(text('Pokušavamo ponovo da pronađemo lokaciju…','Trying again to find your location…'));
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
   status(text('Lokacija nije dostupna u ovom pregledaču. Otvori HTTPS link u Safariju ili Chrome-u.','Location is unavailable in this browser. Open the HTTPS link in Safari or Chrome.'));
   return;
  }
  pending=true;
  status(text('Tražimo tvoju lokaciju. Ako telefon pita za pristup, izaberi Dozvoli.','Finding your location. If your phone asks for access, choose Allow.'));
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
