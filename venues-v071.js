/* Novi Sad Smart Guide v0.6.11 — tourist-friendly local venue recommendations.
 * Editor-selected addresses are not live business data or guessed coordinates.
 * Actual map pins are ALWAYS resolved from consented OSM/Google place results.
 * No API keys and no personal coordinates persisted by this module.
 */
(function(root){
'use strict';
const t=(sr,en)=>state.lang==='sr'?sr:en;
const CITY={lat:45.25565,lng:19.84563};
const inNoviSad=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)
 &&p.lat>=45.13&&p.lat<=45.38&&p.lng>=19.64&&p.lng<=20.04;
const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/đ/g,'dj').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const editorial=[
 {id:'spajz',name:'Špajz salaša 137',aliases:['Špajz','Spajz salasa 137'],address:'Trifkovićev trg 2',
  type:'food',emoji:'🍲',sr:'Domaća vojvođanska kuhinja, doručak i tradicionalni specijaliteti u srcu grada.',
  en:'Traditional Vojvodina cuisine, breakfasts and local specialties in the city centre.',
  source:'https://novisad.travel/restorani/spajz-salasa-137-2/'},
 {id:'lazin',name:'Lazin Salaš',aliases:['Lazin Salas','Lazin salaš'],address:'Laze Telečkog 5',
  type:'food',emoji:'🍽️',sr:'Vojvođanski restoran i atmosfera stare gradske kafane.',
  en:'A traditional Vojvodina restaurant and an old-town tavern atmosphere.',
  source:'https://lazinsalas.com/kontakt/'},
 {id:'veliki',name:'Veliki',aliases:['Cafe Veliki','Caffe Veliki','Restoran Veliki'],address:'Nikole Pašića 24',
  type:'food',emoji:'🥘',sr:'Poznato mesto za ukuse različitih vojvođanskih kuhinja.',
  en:'Well-known for a mix of traditional Vojvodina culinary influences.',
  source:'https://novisad.travel/restorani/'},
 {id:'kombinat',name:'Kombinat',aliases:['Kombinat caffe','Kombinat Cafe'],address:'Bulevar Mihajla Pupina 5',
  type:'coffee',emoji:'☕',sr:'Urbana opcija za doručak, kafu i predah između znamenitosti.',
  en:'An urban spot for breakfast, coffee and a break between landmarks.',
  source:'https://www.visitnovisad.rs/sr/najbolji-restorani-u-novom-sadu'},
 {id:'gondola',name:'Gondola',aliases:['Restoran Gondola'],address:'Bulevar Mihajla Pupina 18',
  type:'coffee',emoji:'🌿',sr:'Kafa ili ručak blizu Dunavskog parka.',
  en:'Coffee or lunch near Danube Park.',
  source:'https://www.visitnovisad.rs/sr/najbolji-restorani-u-novom-sadu'},
 {id:'petrus',name:'Petrus',aliases:['Petrus Caffe','Petrus Caffe Gallery Bar'],address:'Trg slobode 4',
  type:'coffee',emoji:'☕',sr:'Gradski kafe-restoran blizu Trga slobode.',
  en:'A city-centre café restaurant near Liberty Square.',
  source:'https://eatnovisad.com/restorani/'}
];
let currentTab='recommend',open=false;
function origin(){
 if(state.fromGps&&inNoviSad(state.position) &&
   Number(state.locationAccuracy)<=120 &&
   Date.now()-(state.gpsFixAt||0)<120000)return {point:{...state.position},kind:'gps'};
 const mapCenter=state.map?.getCenter?.();
 return {point:inNoviSad(mapCenter)?{lat:mapCenter.lat,lng:mapCenter.lng}:{...CITY},
   kind:'area'};
}
function meterDistance(point,c){
 const R=6371000,rad=x=>x*Math.PI/180;
 const latDelta=rad(point.lat-c.lat),lngDelta=rad(point.lng-c.lng);
 const a=Math.sin(latDelta/2)**2+Math.cos(rad(c.lat))*Math.cos(rad(point.lat))*Math.sin(lngDelta/2)**2;
 return Math.round(R*2*Math.asin(Math.min(1,Math.sqrt(a))));
}
const formatDist=n=>n<1000?n+' m':(n/1000).toFixed(1)+' km';
function matchEditorial(p){
 const name=norm(p?.label);if(!name)return null;
 return editorial.find(e=>[e.name,...e.aliases].some(alias=>{
   const a=norm(alias);return name===a||(a.length>5&&name.startsWith(a+' '));
 }))||null;
}
function findLive(e){
 return (state.poiList||[]).find(p=>p.category?.cat==='food'&&matchEditorial(p)?.id===e.id)||null;
}
function modal(){
 let sheet=document.getElementById('nssgVenueSheet');
 if(sheet)return sheet;
 sheet=document.createElement('section');
 sheet.id='nssgVenueSheet';sheet.hidden=true;sheet.className='nssg-venue-screen';
 sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
 sheet.setAttribute('aria-labelledby','nssgVenueTitle');
 sheet.innerHTML='<div class="venue-backdrop" data-venue-close></div>'+
  '<div class="venue-surface"><header class="venue-header"><div>'+
  '<small class="venue-kicker">'+t('NOVI SAD · PREPORUKE','NOVI SAD · RECOMMENDATIONS')+'</small>'+
  '<h2 id="nssgVenueTitle">'+t('Gde da svratim?','Where should I stop?')+'</h2>'+
  '<p>'+t('Kafa, domaća hrana i zanimljivi lokali — sve u aplikaciji.','Coffee, local food and places worth discovering — right here in the app.')+'</p></div>'+
  '<button type="button" class="venue-close" data-venue-close aria-label="'+t('Zatvori lokale','Close venues')+'">×</button></header>'+
  '<div class="venue-switches" role="tablist" aria-label="'+t('Vrsta lokala','Venue type')+'">'+
  '<button type="button" data-venue-tab="recommend" role="tab"></button>'+
  '<button type="button" data-venue-tab="nearby" role="tab"></button>'+
  '<button type="button" data-venue-tab="coffee" role="tab"></button>'+
  '<button type="button" data-venue-tab="food" role="tab"></button></div>'+
  '<div id="venueMessage" class="venue-message" role="status"></div>'+
  '<div id="venueItems" class="venue-items"></div>'+
  '<footer class="venue-footer">'+t('Preporuke su urednički predlozi, ne plaćene reklame. Podaci za mapu: OpenStreetMap doprinosioci. Udaljenosti su vazdušnom linijom; proveri radno vreme pre dolaska.','Suggestions are editorial picks, not paid ads. Map lookup data: OpenStreetMap contributors. Distances are straight-line; check hours before visiting.')+'</footer></div>';
 document.body.appendChild(sheet);
 sheet.querySelectorAll('[data-venue-close]').forEach(n=>n.addEventListener('click',close));
 sheet.querySelectorAll('[data-venue-tab]').forEach(btn=>btn.addEventListener('click',()=>{
   currentTab=btn.dataset.venueTab;render();
 }));
 sheet.addEventListener('click',async event=>{
   const btn=event.target.closest('[data-venue-action]');
   if(!btn||!sheet.contains(btn))return;
   const action=btn.dataset.venueAction,id=btn.dataset.venueId;
   if(action==='load')return load();
   if(action==='find')return findSelected(id);
   if(action==='map')return showLiveOnMap(id);
   if(action==='details')return describe(id);
 });
 return sheet;
}
function close(){
 const sheet=document.getElementById('nssgVenueSheet');
 if(sheet){sheet.hidden=true;open=false;}
 document.removeEventListener('keydown',onKey,true);
}
function onKey(e){
 if(!open||e.key!=='Escape')return;
 e.preventDefault();e.stopPropagation();close();
}
function createCard(item,kind){
 const card=document.createElement('article');
 card.className='venue-card';
 const p=kind==='live'?item:findLive(item);
 const isFeatured=kind!=='live';
 const e=isFeatured?item:matchEditorial(item);
 const title=isFeatured?item.name:item.label;
 const description=isFeatured?t(item.sr,item.en):(e?t(e.sr,e.en):t('Lokal iz OpenStreetMap-a u izabranom delu grada.','A place from OpenStreetMap in the selected area.'));
 const address=isFeatured?item.address:(item.tags?.['addr:street']?
   item.tags['addr:street']+' '+(item.tags['addr:housenumber']||''):item.address||'');
 const distance=p&&Number.isFinite(p.lat)?formatDist(meterDistance(p,state.poiQueryCenter||origin().point)):null;
 const top=document.createElement('div');top.className='venue-card-top';
 const emoji=document.createElement('span');emoji.className='venue-icon';emoji.textContent=isFeatured?item.emoji:(e?.emoji||item.emoji||'☕');
 const body=document.createElement('div');body.className='venue-card-body';
 const name=document.createElement('strong');name.textContent=title;
 const info=document.createElement('small');info.textContent=address+(distance?' · '+distance:'');
 const detail=document.createElement('p');detail.textContent=description;
 body.append(name,info,detail);top.append(emoji,body);card.appendChild(top);
 const controls=document.createElement('div');controls.className='venue-card-actions';
 const details=document.createElement('button');details.type='button';
 details.dataset.venueAction='details';
 details.dataset.venueId=isFeatured?item.id:item.id;
 details.textContent=t('Detalji','Details');
 controls.appendChild(details);
 if(p){
   const onMap=document.createElement('button');onMap.type='button';onMap.dataset.venueAction='map';
   onMap.dataset.venueId=p.id;onMap.className='venue-card-primary';
   onMap.textContent=t('📍 Pokaži na mapi','📍 Show on map');
   controls.append(onMap);
 }else if(isFeatured){
   const find=document.createElement('button');find.type='button';find.dataset.venueAction='find';find.dataset.venueId=item.id;
   find.className='venue-card-primary';find.textContent=t('⌕ Pronađi na mapi','⌕ Find on map');
   controls.appendChild(find);
 }
 card.appendChild(controls);
 return card;
}
function render(){
 const sheet=modal();if(!open)return;
 const items=sheet.querySelector('#venueItems'),message=sheet.querySelector('#venueMessage');
 sheet.querySelectorAll('[data-venue-tab]').forEach(el=>{
   const tabs={recommend:t('⭐ Preporuke','⭐ Picks'),nearby:t('📍 U blizini','📍 Nearby'),
     coffee:t('☕ Kafa','☕ Coffee'),food:t('🍽 Hrana','🍽 Food')};
   el.textContent=tabs[el.dataset.venueTab];
   el.setAttribute('aria-selected',String(el.dataset.venueTab===currentTab));
 });
 items.replaceChildren();
 const nearby=(state.poiList||[]).filter(p=>p.category?.cat==='food'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
 const center=state.poiQueryCenter||origin().point;
 nearby.sort((a,b)=>meterDistance(a,center)-meterDistance(b,center));
 if(currentTab==='recommend'){
   editorial.forEach(x=>items.appendChild(createCard(x,'editorial')));
   message.textContent=t('Predlozi za centar Novog Sada. Kada učitaš obližnje lokale, potvrđene oznake se pojavljuju na mapi.','Picks for central Novi Sad. Load nearby venues to resolve their map pins.');
 }else{
   const filter=p=>{
     const types=[p.category?.type,p.tags?.amenity,p.tags?.shop,p.tags?.cuisine].filter(Boolean).join(' ').toLowerCase();
     if(currentTab==='coffee')return /cafe|coffee|bakery/.test(types);
     if(currentTab==='food')return /restaurant|fast_food|bakery|pub|bar/.test(types);
     return true;
   };
   const subset=nearby.filter(filter).slice(0,35);
   subset.forEach(x=>items.appendChild(createCard(x,'live')));
   if(!subset.length){
     const empty=document.createElement('p');empty.className='venue-empty';
     empty.textContent=t('Još nema učitanih lokala za ovaj izbor.','No venues have been loaded for this selection yet.');
     items.appendChild(empty);
   }
   const button=document.createElement('button');button.type='button';button.className='venue-load';
   button.dataset.venueAction='load';button.textContent=t('⌕ Pronađi lokale u ovom delu grada','⌕ Find venues in this area');
   items.prepend(button);
   message.textContent=state.poiLoading?t('Pretražujemo…','Searching…'):
     (state.poiQueryOrigin==='gps'?t('Rezultati oko tvoje GPS lokacije.','Results around your GPS position.'):
     t('Rezultati oko izabranog dela Novog Sada.','Results around the selected area of Novi Sad.'));
 }
}
function describe(id){
 const entry=editorial.find(x=>x.id===id);
 const p=(state.poiList||[]).find(x=>x.id===id)|| (entry?findLive(entry):null);
 const e=entry||matchEditorial(p);
 const sheet=modal();
 if(!p&&!e)return;
 const title=e?.name||p?.label||'',body=e?t(e.sr,e.en):t('Lokal iz dostupnog javnog registra.','A venue from an available public directory.');
 const address=e?.address||(p?.tags?.['addr:street']||'')+' '+(p?.tags?.['addr:housenumber']||'');
 sheet.querySelector('#venueMessage').textContent=title+' · '+address+' — '+body+' '+t('Radno vreme i cene nisu potvrđeni.','Hours and prices are not confirmed.');
 sheet.querySelector('#venueMessage').scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function resolveEditorial(e){
 // Recommended address => verified live pin from a separate opt-in OSM lookup.
 // Do not invent a point for walking directions if the lookup fails.
 if(!state.poiConsent)return null;
 const names=[e.name,...e.aliases].slice(0,4);
 const selectors=names.map(n=>'nwr(around:7000,45.25565,19.84563)["name"="'+
   n.replace(/[\\"]/g,'')+'"];').join('\n');
 const query='[out:json][timeout:14];('+selectors+');out center 30;';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),14500);
 try{
   const response=await fetchOverpassFallback(query,controller.signal);
   const candidates=(response.elements||[]).filter(x=>
     Number.isFinite(x.lat??x.center?.lat)&&Number.isFinite(x.lon??x.center?.lon)
     &&typeof x.tags?.name==='string'&&
     ['restaurant','cafe','pub','bar','fast_food'].includes(x.tags.amenity));
   const match=candidates.find(x=>[e.name,...e.aliases].some(n=>norm(n)===norm(x.tags.name)));
   if(!match)return null;
   const id='poi-'+match.id;
   const original=(state.poiList||[]).find(x=>x.id===id);
   if(original)return original;
   const p={id,osmType:match.type,osmId:match.id,
     lat:match.lat??match.center.lat,lng:match.lon??match.center.lon,
     label:match.tags.name.slice(0,90),tags:match.tags,category:poiCategory(match.tags),
     emoji:poiCategory(match.tags).emoji,click:()=>openPoiPopup(id)};
   if(p.category.cat!=='food')return null;
   state.poiList.push(p);updateResults();return p;
 }catch(err){console.warn('Editorial place lookup unavailable:',String(err));return null;}
 finally{clearTimeout(timeout);}
}
async function findSelected(id){
 const e=editorial.find(x=>x.id===id);if(!e)return;
 if(findLive(e))return showLiveOnMap(findLive(e).id);
 currentTab='nearby';
 render();
 await load();
 let match=findLive(e);
 if(!match&&state.poiConsent)match=await resolveEditorial(e);
 if(match)return showLiveOnMap(match.id);
 const msg=modal().querySelector('#venueMessage');
 msg.textContent=t('Još nismo potvrdili tačnu oznaku za „'+e.name+'”. Adresa: '+e.address+'. Prikazujemo druga dostupna mesta u okolini.','An exact map pin for '+e.name+' is not yet verified. Address: '+e.address+'. Showing other nearby venues.');
}
async function load(){
 if(state.poiLoading)return;
 if(!state.map){
   modal().querySelector('#venueMessage').textContent=t('Mapa se još učitava. Pokušaj ponovo.','Map still loading. Please retry.');return;
 }
 const selected=origin();
 state.poiQueryCenter=selected.point;
 state.poiQueryOrigin=selected.kind;
 state.cat='food';state.nearbyOnly=false;state.search='';
 state.radius=1800;
 const button=document.querySelector('#venueItems .venue-load');
 if(button){button.disabled=true;button.textContent=t('Učitavanje…','Loading…');}
 modal().querySelector('#venueMessage').textContent=t('Pronalazimo stvarne kafiće i restorane; upit se šalje tek uz tvoju saglasnost.','Looking up real cafes and restaurants; your permission is required first.');
 try{await loadNearbyPois();}finally{
   // The original OSM function handles cache, rate limits, consent and errors.
   // Never claim Google data or ratings when only an OSM listing was returned.
   if(state.page==='explore'){
     state.localVenueVisible=true;
     updateResults();
     state.map?.setPois(filteredPois().slice(0,12));
   }
   if(open)render();
 }
}
function showLiveOnMap(id){
 const p=(state.poiList||[]).find(x=>x.id===id);
 if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return;
 if(window.NSSG_TOUR_SESSION?.snapshot()?.guiding){
   modal().querySelector('#venueMessage').textContent=t('Prvo izađi iz aktivnog vođenja dugmetom „Nazad”, pa pregledaj lokal na mapi. Ruta ostaje sačuvana.','First exit active navigation using “Back”, then open this venue on the map. The tour stays saved.');
   return;
 }
 close();
 if(!state.map){showPage('explore');showToast(t('Mapa se učitava.','Map is loading.'));return;}
 state.map.easeTo({center:[p.lng,p.lat],zoom:16.5,duration:350});
 if(window.NSSG_TOUR_SESSION?.snapshot()?.guiding){
   showToast(t('Prikaz lokala. Aktivan obilazak ostaje sačuvan.','Showing a venue. Your tour is still saved.'));
   return;
 }
 openPoiPopup(p.id);
}
function show(){
 if(state.page!=='explore')showPage('explore');
 const sheet=modal();
 open=true;sheet.hidden=false;currentTab='recommend';
 render();
 document.addEventListener('keydown',onKey,true);
 sheet.querySelector('.venue-close')?.focus({preventScroll:true});
}
// The ordinary Food chip should open recommendations, not a raw empty POI list.
const oldSetCat=setCat;
setCat=function(cat){
 if(cat!=='food')return oldSetCat(cat);
 state.cat='food';
 if(state.page!=='explore')showPage('explore');
 show();
};
root.toggleCalmVenues=()=>show();
root.NSSG_VENUES=Object.freeze({open:show,close,load,origin,matchEditorial,findLive,
 snapshot:()=>({open,currentTab,count:(state.poiList||[]).filter(p=>p.category?.cat==='food').length})});
})(window);
