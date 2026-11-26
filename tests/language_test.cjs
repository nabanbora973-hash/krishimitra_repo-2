const {JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<html><body><select id="langSel"><option value="en">English</option><option value="hi">हिन्दी</option><option value="as">অসমীয়া</option></select><h2>Sell decision <span>LIVE</span></h2><label>Crop <input value="24"></label><button id="go">Get my call</button><div id="dynamic"></div></body></html>',{url:'https://example.com'});
 for(const k of ['window','document','localStorage','MutationObserver'])global[k]=dom.window[k];
 const {setLang,applyI18n}=await import('../src/js/i18n.js');
 let n=0; const check=(v,msg)=>{if(!v)throw Error(msg);n++};
 let clicks=0;document.querySelector('#go').onclick=()=>clicks++;
 applyI18n();
 for(const [lang,label]of [['hi','मेरी सलाह देखें'],['as','মোৰ পৰামৰ্শ চাওক'],['en','Get my call']]){
  setLang(lang);check(document.querySelector('#go').textContent===label,lang+' button');
  check(document.documentElement.lang===lang,lang+' html');
  check(document.querySelector('input').value==='24',lang+' input preserved');
 }
 setLang('hi'); document.querySelector('#dynamic').innerHTML='<b>Field weather</b>';await new Promise(r=>setTimeout(r,100));
 check(document.querySelector('#dynamic b').textContent==='खेत का मौसम','dynamic render');
 setLang('as');check(document.querySelector('#dynamic b').textContent==='পথাৰৰ বতৰ','dynamic switch');
 document.querySelector('#go').click();check(clicks===1,'handler preserved');
 check(!require('fs').readFileSync('src/js/app.js','utf8').includes('import "./video.js"'),'demo import removed');
 console.log(n+' language checks passed');dom.window.close();
})().catch(e=>{console.error(e);process.exit(1)});
