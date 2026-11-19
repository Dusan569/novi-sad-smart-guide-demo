/* Viewport entrance motion for screens, cards and sheets. Map surfaces stay stationary. */
(function(){
 'use strict';
 const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
 if(!window.IntersectionObserver||!Element.prototype.animate)return;
 const selector=[
  '.page-head','.editorial-page-head','.discovery-intro',
  '.discover-tour-card','.spot-card','.discovery-next',
  '.saved-editorial-card','.saved-empty','.about-editorial-card','.about-disclosure',
  '.city-discovery-bar','.results-panel .place',
  '.guide-kicker','.guide-lead','.guide-meta','.guide-audio','.guide-feature','.guide-fact','.guide-tip','.guide-notes',
  '.guide-nearby','.guide-source','.guide-photo-credit','.guide-actions',
  '.tour-detail-meta','.tour-detail-stop','.tour-detail-footer',
  '.venue-surface','.venue-card','.venue-switches',
  '.tour-selection-note','.guide-picks-heading','.guide-pick','.editorial-credits'
 ].join(',');
 const page=document.getElementById('page');
 const fadeDuration=200;
 let pageAnimation=null;

 function enterPage(){
  pageAnimation?.cancel();
  if(preference.matches||!page)return;
  page.classList.add('ns-page-entering');
  const animation=page.animate([{opacity:.36},{opacity:1}],{
   duration:fadeDuration,easing:'ease-out'
  });
  pageAnimation=animation;
  animation.finished.catch(()=>{}).finally(()=>{
   if(pageAnimation!==animation)return;
   pageAnimation=null;
   page.classList.remove('ns-page-entering');
  });
 }
 window.NSSG_PAGE_MOTION=Object.freeze({enter:enterPage});

 const seen=new WeakSet();
 const active=new Set();
 function eligible(element){
  return element.matches(selector)&&!element.closest('#map,.map-wrap');
 }
 const observer=new IntersectionObserver(entries=>{
  let order=0;
  for(const entry of entries){
   const element=entry.target;
   if(!entry.isIntersecting)continue;
   observer.unobserve(element);
   if(preference.matches||!element.isConnected)continue;
   element.classList.add('ns-motion-item');
   // Keep the initial reveal pose during the page fade, then stagger visible items.
   const fadeRemaining=pageAnimation&&page.contains(element)
    ?Math.max(0,fadeDuration-(pageAnimation.currentTime??0)):0;
   const animation=element.animate([
    {opacity:.12,transform:'translateY(16px)'},
    {opacity:1,transform:'translateY(0)'}
   ],{duration:420,delay:fadeRemaining+Math.min(order++,4)*45,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'});
   active.add(animation);
   animation.finished.catch(()=>{}).finally(()=>active.delete(animation));
  }
 },{threshold:.06});
 function register(root){
  if(!(root instanceof Element)||root.closest('#map,.map-wrap'))return;
  const elements=[...(eligible(root)?[root]:[]),...root.querySelectorAll(selector)];
  for(const element of elements){
   if(!eligible(element)||seen.has(element))continue;
   seen.add(element);
   observer.observe(element);
  }
 }
 register(page);
 const mutations=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes'){
    if(record.target.matches('.nssg-venue-screen')&&!record.target.hidden){
     const sheet=record.target.querySelector('.venue-surface');
     if(sheet)seen.delete(sheet);
     register(record.target);
    }
    continue;
   }
   if(record.target instanceof Element&&record.target.closest('#map,.map-wrap'))continue;
   for(const node of record.addedNodes)register(node);
   // Release detached cards when the screen or result list is replaced.
   for(const node of record.removedNodes){
    if(!(node instanceof Element))continue;
    observer.unobserve(node);
    for(const element of node.querySelectorAll(selector))observer.unobserve(element);
   }
  }
 });
 mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 preference.addEventListener('change',()=>{
  if(!preference.matches)return;
  pageAnimation?.cancel();
  for(const animation of active)animation.cancel();
 });
})();
