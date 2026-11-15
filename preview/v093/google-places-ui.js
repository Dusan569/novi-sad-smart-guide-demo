/* Google Places (New) nearby search — OPTIONAL AND OPT-IN.
 * Only a deliberate user tap triggers a billable request.
 * Data stays in memory, is not cached as a permanent directory and shows Google's attribution.
 */
(function(root){
'use strict';
const allowedTypes=['restaurant','cafe','coffee_shop','bakery','bar','museum','art_gallery','tourist_attraction','book_store','shopping_mall','pharmacy','atm'];
function localized(sr,en){return state.lang==='sr'?sr:en;}
function makePoint(p){
 const loc=p?.location;
 const lat=typeof loc?.lat==='function'?loc.lat():+loc?.lat;
 const lng=typeof loc?.lng==='function'?loc.lng():+loc?.lng;
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
 const name=typeof p.displayName==='string'?p.displayName:p.displayName?.text;
 if(!name||typeof name!=='string'||name.length>140)return null;
 const id=String(p.id||p.googleMapsURI||name+'@'+lat+','+lng).slice(0,170);
 const type=String(p.primaryType||p.types?.[0]||'');
 const isFood=['restaurant','cafe','coffee_shop','bakery','bar','meal_takeaway'].includes(type);
 const cat=isFood?'food':type==='museum'||type==='art_gallery'?'culture':type==='tourist_attraction'?'sights':'other';
 const info={cat,label:cat==='food'?'Hrana i piće':cat==='culture'?'Kultura':cat==='sights'?'Znamenitosti':'Lokali'};
 return {
  id:'google:'+id,googlePlaceId:id,googlePlaces:true,lat,lng,
  label:name.slice(0,90),category:info,
  emoji:isFood?'☕':cat==='culture'?'🏛️':'📍',
  address:String(p.formattedAddress||'').slice(0,180),
  googleMapsURI:typeof p.googleMapsURI==='string'?p.googleMapsURI:null
 };
}
async function nearby(){
 if(state.poiLoading)return;
 const cfg=root.NSSG_GOOGLE_CONFIG||{};
 if(!cfg.enablePlacesSearch){
   showPoiInfo(localized('Google Places pretraga još nije uključena. Potrebno je aktivirati Places API (New) i dozvoliti potrošnju.','Google Places is not enabled yet. Activate Places API (New) and explicitly allow its usage.'));
   return;
 }
 if(!state.map||!state.map.getCenter)return;
 const center=state.map.getCenter(),now=Date.now();
 if(!center||!Number.isFinite(center.lat)||!Number.isFinite(center.lng))return;
 if(center.lat<45.12||center.lat>45.40||center.lng<19.60||center.lng>20.05){
   showPoiInfo(localized('Pretraga lokala za sada je ograničena na Novi Sad.','For now, business discovery is limited to Novi Sad.'));
   return;
 }
 if(now-(state.googlePlacesLastRequest||0)<60000){
   showPoiInfo(localized('Sačekaj minut pre novog Google Places upita.','Please wait a minute before searching Google Places again.'));
   return;
 }
 if(!root.confirm(localized(
   'Za Google Places pretragu šaljemo približan centar mape Google-u. Ova pretraga može da se naplati na Google Cloud nalogu. Nastaviti?',
   'Searching Google Places sends the map center to Google and may incur Google Cloud charges. Continue?')))return;
 state.googlePlacesLastRequest=now;state.poiLoading=true;
 const button=document.getElementById('poiToggle');
 if(button){button.disabled=true;button.textContent=localized('Učitavanje…','Loading…');}
 showPoiInfo(localized('Google Places traži lokale u okolini mape…','Finding nearby businesses on Google Places…'));
 try{
   await root.NSSG_GOOGLE_ENGINE.loadGoogle();
   const {Place,SearchNearbyRankPreference}=await google.maps.importLibrary('places');
   const radius=Math.min(1500,Math.max(200,Number(state.radius)||1100));
   const {places}=await Place.searchNearby({
     fields:['id','displayName','location','primaryType','formattedAddress','googleMapsURI'],
     locationRestriction:{center,radius},
     includedPrimaryTypes:allowedTypes,
     maxResultCount:15,
     rankPreference:SearchNearbyRankPreference.DISTANCE,
     language:state.lang==='sr'?'sr':'en',
     region:'rs'
   });
   const points=(places||[]).map(makePoint).filter(Boolean);
   state.poiList=points.map(p=>({...p,click:()=>openGooglePlacePopup(p.id)}));
   state.googlePlacesCenter=center;
   closePoiPopup();
   updateResults();
   // Render the actual Places results independently of the user's saved GPS,
   // since the Places search intentionally uses the visible map center.
   state.map?.setPois(state.poiList);
   showPoiInfo(localized(
     'Google Places: '+points.length+' lokala u blizini centra mape. Rezultati nisu kompletan katalog grada.',
     'Google Places: '+points.length+' results near the map center. This is not a complete city directory.'
   ));
 }catch(e){
   console.warn('Google Places (New) unavailable:',e?.message||e);
   showPoiInfo(localized(
     'Google Places trenutno nije dostupan. Proveri Places API (New), ograničenja ključa i kvotu. Znamenitosti ostaju dostupne.',
     'Google Places is unavailable. Check Places API (New), key restrictions and quota. Curated attractions remain available.'
   ));
 }finally{
   state.poiLoading=false;
   if(button){button.disabled=false;button.textContent=localized('⌕ Prikaži lokale','⌕ Show businesses');}
 }
}
function openGooglePlacePopup(id){
 const item=state.poiList.find(x=>x.id===id&&x.googlePlaces);if(!item)return;
 state.poiSelected=item;
 state.map?.easeTo({center:[item.lng,item.lat],zoom:Math.max(15,state.map.getZoom())});
 const panel=document.getElementById('poiPopup');if(!panel)return;
 const url=item.googleMapsURI&&/^https:\/\/(?:www\.)?google\.com\/maps\//.test(item.googleMapsURI)?
   item.googleMapsURI:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(item.lat+','+item.lng);
 panel.innerHTML='<button class="poi-popup-x" type="button" aria-label="Zatvori">×</button>'+
   '<span class="poi-popup-label">Google Places</span><strong></strong><p></p>'+
   '<div class="poi-popup-actions"><button id="poiRouteButton" type="button">🚶 '+localized('Pešačka ruta','Walking route')+
   '</button><a id="poiGoogleLink" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div>';
 panel.querySelector('strong').textContent=item.label;
 panel.querySelector('p').textContent=item.address||localized('Radno vreme nije provereno.','Opening hours not verified.');
 panel.querySelector('.poi-popup-x').onclick=()=>closePoiPopup();
 panel.querySelector('#poiRouteButton').onclick=()=>{closePoiPopup();startRoute({lat:item.lat,lng:item.lng},item.label)};
 panel.querySelector('#poiGoogleLink').href=url;
 panel.classList.remove('hidden');
}
root.NSSG_GOOGLE_PLACES=Object.freeze({nearby,openGooglePlacePopup,makePoint});
})(window);
