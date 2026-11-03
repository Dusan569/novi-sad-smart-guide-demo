/* Novi Sad Smart Guide — private Google Maps prototype.
 * The repository has no keys. A user may enter a personal Google Maps Demo Key
 * for prototype testing (free, subject to Google eligibility and quota).
 * Never enter private/server credentials here.
 */
(function(root){
  'use strict';
  const store='nssg_google_demo_key_session_v1';
  const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{20,}$/.test(x);
  let browserKey='';
  try {
    const x=root.sessionStorage?.getItem(store)||'';
    if(valid(x))browserKey=x;
  } catch (_) {}
  root.NSSG_GOOGLE_CONFIG=Object.freeze({
    browserKey,
    mapId:'DEMO_MAP_ID',
    language:'sr',
    enablePlacesSearch:false
  });
  function showKeySetup(){
    if(browserKey||!root.document?.body||root.document.getElementById('nssg-demo-key-ui'))return;
    const ui=root.document.createElement('section');
    ui.id='nssg-demo-key-ui';
    ui.innerHTML='<style>'+
      '#nssg-demo-key-ui{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(8,22,45,.83);padding:18px;font-family:system-ui,-apple-system,sans-serif}'+
      '#nssg-demo-key-ui .panel{box-sizing:border-box;width:min(100%,460px);background:#fff;color:#12253f;border-radius:19px;padding:23px;box-shadow:0 20px 65px #0007}'+
      '#nssg-demo-key-ui h2{font-size:21px;margin:0 0 12px}'+
      '#nssg-demo-key-ui p{font-size:14px;color:#465a71;line-height:1.5;margin:0 0 13px}'+
      '#nssg-demo-key-ui a{font-weight:700;color:#0868b9}'+
      '#nssg-demo-key-ui label{display:block;font-size:14px;font-weight:700;margin:10px 0 6px}'+
      '#nssg-demo-key-ui input{box-sizing:border-box;width:100%;font-size:16px;padding:12px;border:1px solid #9caec5;border-radius:10px}'+
      '#nssg-demo-key-ui .actions{display:flex;gap:10px;margin:12px 0}'+
      '#nssg-demo-key-ui button{border:0;border-radius:10px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:12px}'+
      '#nssg-demo-key-ui button[type=submit]{background:#096fc5;color:#fff;flex:1}'+
      '#nssg-demo-key-ui button[data-skip]{background:#e8eef4;color:#1c314d}'+
      '#nssg-demo-key-ui [role=alert]{color:#bd2130}'+
      '</style><div class="panel" role="dialog" aria-modal="true" aria-labelledby="nssg-demo-title">'+
      '<h2 id="nssg-demo-title">🗺️ Prava Google mapa — demo</h2>'+
      '<p>Za originalnu Google mapu Novog Sada potreban je besplatan Google Maps Demo Key.</p>'+
      '<p><a href="https://developers.google.com/maps/documentation/javascript/demo-key" target="_blank" rel="noopener noreferrer">Nabavi demo ključ na Google sajtu ↗</a></p>'+
      '<form id="nssg-demo-form"><label for="nssg-demo-input">Demo API ključ</label>'+
      '<input id="nssg-demo-input" type="password" autocomplete="off" spellcheck="false" required placeholder="Nalepi svoj demo ključ">'+
      '<p id="nssg-demo-error" role="alert" aria-live="polite"></p>'+
      '<div class="actions"><button type="submit">Prikaži Google mapu</button><button type="button" data-skip>Nastavi bez mape</button></div></form>'+
      '<p>Ključ ostaje samo u kartici pregledača (sessionStorage), nije u GitHub-u. Ovo je prototip; važe Google kvote.</p></div>';
    root.document.body.appendChild(ui);
    ui.querySelector('[data-skip]').addEventListener('click',()=>ui.remove());
    ui.querySelector('#nssg-demo-form').addEventListener('submit',e=>{
      e.preventDefault();
      const key=ui.querySelector('#nssg-demo-input').value.trim();
      const error=ui.querySelector('#nssg-demo-error');
      if(!valid(key)){error.textContent='Proveri ključ: najmanje 20 dozvoljenih znakova.';return;}
      try {root.sessionStorage.setItem(store,key);}
      catch (_) {error.textContent='Pregledač blokira privremeno čuvanje. Otvori običan tab.';return;}
      root.location.reload();
    });
  }
  if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',showKeySetup,{once:true});
  else showKeySetup();
})(window);
