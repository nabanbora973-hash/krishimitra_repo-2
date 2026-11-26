// ============================================================================
//  LANGUAGE  —  English · हिन्दी · অসমীয়া
// ----------------------------------------------------------------------------
//  Scope is deliberate: this translates the parts a farmer acts on — the verdict,
//  the three screens around it, and the buttons. It is NOT a full-app rewrite;
//  the honest label is "3 languages for the decision screens".
//
//  Numbers stay in Latin digits (₹2,345) on purpose: every mandi board, every
//  bank passbook and every SMS the farmer receives uses them. Translating digits
//  would make the app harder to read, not easier.
// ============================================================================
import { state } from './state.js';

const KEY = 'km_lang';
export const LANGS = [
  { code: 'en', label: 'English',  native: 'English' },
  { code: 'hi', label: 'Hindi',    native: 'हिन्दी' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া' }
];

// key → [en, hi, as]
const D = {
  'ui.offline':['Offline — saved information only. New prices need internet.','ऑफलाइन — केवल सहेजी जानकारी। नए भाव के लिए इंटरनेट चाहिए।','অফলাইন — কেৱল সংৰক্ষিত তথ্য। নতুন দামৰ বাবে ইণ্টাৰনেট লাগে।'],
  'ui.todayWeather':['Today’s weather','आज का मौसम','আজিৰ বতৰ'],
  'ui.forecast':['5-day forecast','5 दिन का पूर्वानुमान','৫ দিনৰ পূৰ্বাভাস'],
  'ui.priceHistory':['Price history & market trends','पिछले भाव और मंडी रुझान','পূৰ্বৰ দাম আৰু বজাৰৰ ধাৰা'],
  'ui.takeHome':['YOUR HARVEST · THE ESTIMATE','आपकी उपज · अनुमान','আপোনাৰ উৎপাদন · অনুমান'],
  'ui.breakdown':['View earnings breakdown','कमाई का पूरा हिसाब देखें','উপাৰ্জনৰ সম্পূৰ্ণ হিচাপ চাওক'],
  'ui.estimateNote':['Estimate, not a guaranteed selling price. Check the reporting date and confirm with the market.','यह अनुमान है, पक्का बिक्री भाव नहीं। रिपोर्ट की तारीख देखें और मंडी से पुष्टि करें।','এইটো অনুমান, নিশ্চিত বিক্ৰী দাম নহয়। প্ৰতিবেদনৰ তাৰিখ চাওক আৰু বজাৰত নিশ্চিত কৰক।'],
  'price.lastReported': ['LAST REPORTED','पिछला प्रकाशित भाव','শেষ প্ৰকাশিত দাম'],
  'price.governmentFeed': ['GOVERNMENT FEED','सरकारी डेटा','চৰকাৰী তথ্য'],
  'price.reported': ['Reported','रिपोर्ट की तारीख','প্ৰতিবেদনৰ তাৰিখ'],
  'price.unknownDate': ['date unavailable','तारीख उपलब्ध नहीं','তাৰিখ উপলব্ধ নহয়'],
  'price.daysOld': ['days old','दिन पुराना','দিন পুৰণি'],
  // ── first-run onboarding (3 cards) — added Nov 2026 ─────────────
  'ob.s1.title': ['One clear call, not five numbers',
                  'एक साफ़ फ़ैसला, पाँच अलग नंबर नहीं',
                  'এটা স্পষ্ট সিদ্ধান্ত, পাঁচটা আলাদা সংখ্যা নহয়'],
  'ob.s1.body':  ['Mandi price, weather and harvest timing are read together and turned into one verdict: SELL NOW, SELL 60%, WAIT or STORE — with three reasons you can check yourself.',
                  'मंडी भाव, मौसम और कटाई का समय एक साथ देखकर ऐप एक फ़ैसला देता है: अभी बेचें, 60% बेचें, रुकें या स्टोर करें — तीन कारणों के साथ जो आप खुद जाँच सकते हैं।',
                  'মণ্ডীৰ দাম, বতৰ আৰু চপোৱাৰ সময় একেলগে চাই এপ্পে এটা সিদ্ধান্ত দিয়ে: এতিয়াই বিক্ৰী কৰক, 60% বিক্ৰী কৰক, ৰ’ব নে ভৰাই ৰাখক — তিনিটা কাৰণৰ সৈতে যিটো আপুনি নিজেই পৰীক্ষা কৰিব পাৰে।'],
  'ob.s2.title': ['Where a number came from is on the screen',
                  'हर आँकड़ा कहाँ से आया, स्क्रीन पर लिखा होता है',
                  'প্ৰতিটো সংখ্যা ক’ৰ পৰা আহিল, স্ক্ৰীণত লিখা থাকে'],
  'ob.s2.body':  ['LIVE = fetched from the government feed just now. LAST KNOWN = our saved copy, with its date. DEMO = sample data, labelled everywhere. The app never invents a price.',
                  'LIVE = सरकारी फ़ीड से अभी लिया गया। LAST KNOWN = हमारी सहेजी कॉपी, तारीख़ के साथ। DEMO = नमूना डेटा, हर स्क्रीन पर लिखा हुआ। ऐप कभी भाव नहीं बनाता।',
                  'LIVE = চৰকাৰী ফীডৰ পৰা এতিয়াই লোৱা। LAST KNOWN = আমাৰ ৰখা কপি, তাৰিখসহ। DEMO = নমুনা তথ্য, প্ৰতিটো স্ক্ৰীণত লিখা। এপ্পে কেতিয়াও দাম সাজি নুলিয়ায়।'],
  'ob.s3.title': ['Install it once, it opens without internet',
                  'एक बार इंस्टॉल करें, बिना इंटरनेट भी खुलेगा',
                  'এবাৰ ইনষ্টল কৰক, ইণ্টাৰনেট নোহোৱাকৈও খুলিব'],
  'ob.s3.body':  ['Tap Install app (or Chrome menu → Add to home screen). After the first load the app is cached, so it opens offline and the last price stays visible with its date.',
                  'Install app दबाएँ (या Chrome मेन्यू → Add to home screen)। पहली बार खुलने के बाद ऐप कैश में रहता है, इसलिए बिना इंटरनेट खुलता है और पिछला भाव तारीख़ के साथ दिखता रहता है।',
                  'Install app টিপক (বা Chrome মেনু → Add to Home screen)। প্ৰথমবাৰ খোলাৰ পিছত এপ্প কেশত থাকে, সেইদেখি ইণ্টাৰনেট নোহোৱাকৈ খুলে আৰু আগতে লোৱা দাম তাৰিখসহ দেখাই থাকে।'],
  'ob.next':     ['Next', 'आगे', 'আগলৈ'],
  'ob.done':     ['Got it', 'समझ गया', 'বুজি পালোঁ'],
  'ob.skip':     ['Skip', 'छोड़ें', 'এৰি দিয়ক'],
  'ob.lang':     ['Language', 'भाषा', 'ভাষা'],

  'auth.start':       ['Start — no account needed', 'शुरू करें — खाता नहीं चाहिए', 'আৰম্ভ কৰক — একাউণ্ট নালাগে'],
  'auth.noaccount':   ['Everything works on this phone. An account only adds cloud backup.',
                       'सब कुछ इसी फ़ोन पर चलता है। खाता सिर्फ़ क्लाउड बैकअप के लिए है।',
                       'সকলো এই ফোনতে চলে। একাউণ্ট কেৱল ক্লাউড বেকআপৰ বাবে।'],
  'auth.haveAccount': ['I already have an account', 'मेरा खाता है', 'মোৰ একাউণ্ট আছে'],
  'auth.whyAccount':  ['An account keeps your records safe if this phone is lost.',
                       'खाता होने पर फ़ोन खोने पर भी रिकॉर्ड सुरक्षित रहता है।',
                       'একাউণ্ট থাকিলে ফোন হেৰালেও ৰেকৰ্ড সুৰক্ষিত থাকে।'],
  'nav.sell':        ['Sell', 'बेचें या रुकें', 'বিক্ৰী কৰক'],
  'nav.markets':     ['Markets', 'मंडी तुलना', 'বজাৰ তুলনা'],
  'nav.alerts':      ['Alerts', 'चेतावनी', 'সতৰ্কবাণী'],
  'nav.demand':      ['Demand board', 'मांग बोर्ड', 'চাহিদা ফলি'],
  'nav.deskbuy':     ['Buy list', 'खरीद सूची', 'ক্ৰয় তালিকা'],
  'nav.sales':       ['Sales', 'मेरी बिक्री', 'মোৰ বিক্ৰী'],
  'nav.assistant':   ['Ask KrishiMitra', 'कृषिमित्र से पूछें', 'কৃষিমিত্ৰক সোধক'],
  'nav.dashboard':   ['Dashboard', 'डैशबोर्ड', 'ডেশবৰ্ড'],
  'nav.profile':     ['Farm Profile', 'खेत प्रोफ़ाइल', 'পথাৰ প্ৰফাইল'],
  'nav.season':      ['Season & Crop', 'फसल चक्र', 'শস্য চক্ৰ'],
  'nav.guidance':    ['Guidance', 'सलाह', 'পৰামৰ্শ'],

  'action.share':    ['Share on WhatsApp', 'WhatsApp पर भेजें', 'WhatsApp ত পঠিয়াওক'],
  'action.listen':   ['Listen', 'सुनें', 'শুনক'],
  'action.stop':     ['Stop', 'रोकें', 'বন্ধ কৰক'],
  'action.copy':     ['Copy', 'कॉपी करें', 'কপি কৰক'],
  'action.save':     ['Save', 'सेव करें', 'ছেভ কৰক'],
  'action.send':     ['Send', 'भेजें', 'পঠিয়াওক'],

  'verdict.sell':    ['SELL NOW', 'अभी बेचें', 'এতিয়া বিক্ৰী কৰক'],
  'verdict.wait':    ['WAIT', 'रुकें', "ৰ'ব"],
  'verdict.thisWeek':['This week', 'इस हफ़्ते', 'এই সপ্তাহত'],

  'market.nearest':  ['Nearest first', 'पास वाली पहले', 'ওচৰৰ প্ৰথমে'],
  'market.bestNet':  ['Best net first', 'सबसे ज़्यादा शुद्ध पहले', 'সৰ্বাধিক নিট প্ৰথমে'],
  'market.price':    ['Price ₹/qtl', 'भाव ₹/क्विंटल', 'দাম ₹/কুইণ্টল'],
  'market.net':      ['Net ₹/qtl', 'शुद्ध ₹/क्विंटल', 'নিট ₹/কুইণ্টল'],
  'market.distance': ['Distance', 'दूरी', 'দূৰত্ব'],
  'market.transport':['Transport', 'ढुलाई', 'পৰিবহন'],
  'market.total':    ['Est. total', 'अनुमानित कुल', 'আনুমানিক মুঠ'],

  'alert.title':     ['Price alerts', 'भाव चेतावनी', 'দামৰ সতৰ্কবাণী'],
  'alert.add':       ['Tell me when the price crosses', 'भाव पार करे तो बताएं', 'দাম পাৰ হ’লে জনাওক'],
  'alert.watch':     ['Watch this price', 'इस भाव पर नज़र', 'এই দামত চকু'],
  'alert.none':      ['No alerts yet.', 'अभी कोई चेतावनी नहीं।', 'এতিয়া কোনো সতৰ্কবাণী নাই।'],
  'alert.fired':     ['Price crossed your line', 'भाव आपकी लाइन पार कर गया', 'দামে আপোনাৰ ৰেখা পাৰ হ’ল'],

  'share.text':      ['today at', 'आज', 'আজি'],
  'share.net':       ['after transport', 'ढुलाई के बाद', 'পৰিবহনৰ পিছত'],

  'lang.switch':     ['भाषा', 'भाषा', 'ভাষা'],
  'voice.listening': ['Listening…', 'सुन रहे हैं…', 'শুনি আছো…'],
  'voice.unsupported':['Voice input is not supported in this browser.', 'इस ब्राउज़र में आवाज़ नहीं चलती।', 'এই ব্ৰাউজাৰত মাত নচলে।'],

  'fpo.title':       ['Farmer group', 'किसान समूह', 'কৃষক গোট'],
  'fpo.join':        ['Join a group', 'समूह जुड़ें', 'গোটত যোগ দিয়ক'],
  'fpo.code':        ['Group code', 'समूह कोड', 'গোটৰ কোড'],
  'fpo.members':     ['members', 'सदस्य', 'সদস্য'],
  'fpo.stock':       ['Combined stock', 'कुल माल', 'মুঠ মাল'],

  'receipt.title':   ['Sale receipt', 'बिक्री रसीद', 'বিক্ৰী ৰছিদ'],
  'receipt.party':   ['Buyer', 'खरीदार', 'ক্ৰেতা'],
  'receipt.amount':  ['Amount', 'रकम', 'ৰাশি']
};

let LANG = 'en';
try { LANG = localStorage.getItem(KEY) || 'en'; } catch {}

export const getLang = () => LANG;
export const isRTL = () => false;

export function setLang(code){
  LANG = LANGS.some(l => l.code === code) ? code : 'en';
  try { localStorage.setItem(KEY, LANG); } catch {}
  state.lang = LANG;
  applyI18n();
  return LANG;
}

// t('nav.sell') → the current language's string, English as the safety net.
export function t(key){
  const row = D[key];
  if (!row) return key;
  const i = { en: 0, hi: 1, as: 2 }[LANG] ?? 0;
  return row[i] || row[0];
}

// Elements marked data-i18n="key" get re-labelled in place.
export function applyI18n(root = typeof document !== 'undefined' ? document : null){
  if (!root) return;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    const v = t(k);
    if (v) el.textContent = v;
  });
  translateVisibleText(root);
  if (root.body) root.body.setAttribute('data-lang', LANG);
  if (root.documentElement) root.documentElement.lang = LANG;
  const selector = root.querySelector('#langSel');
  if (selector) selector.value = LANG;
  watchTranslations();
}

export const LANG_KEY = KEY;
export const _dict = D;          // tests read this

// Preserve the English source per text node, so switching back never loses it.
// Text-node updates preserve buttons, inputs and their attached event handlers.
const UI_TEXT = [
 ['Sell decision','बेचने का फैसला','বিক্ৰীৰ সিদ্ধান্ত'],
 ['Crop','फसल','শস্য'],
 ['Location (village / town)','स्थान (गाँव / शहर)','স্থান (গাঁও / চহৰ)'],
 ['Area (acres)','क्षेत्रफल (एकड़)','মাটিৰ পৰিমাণ (একৰ)'],
 ['Expected harvest (quintals)','अनुमानित उपज (क्विंटल)','সম্ভাব্য উৎপাদন (কুইণ্টল)'],
 ['Get my call','मेरी सलाह देखें','মোৰ পৰামৰ্শ চাওক'],
 ['📡 Use my location','📡 मेरा स्थान लें','📡 মোৰ স্থান ব্যৱহাৰ কৰক'],
 ['Field weather','खेत का मौसम','পথাৰৰ বতৰ'],
 ['What you would actually earn','आपकी अनुमानित शुद्ध कमाई','আপোনাৰ সম্ভাব্য নিট উপাৰ্জন'],
 ['Net to you','आपको मिलने वाली रकम','আপুনি পোৱা নিট ধন'],
 ['MARKET','मंडी','বজাৰ'],
 ['Nearest to my farm','मेरे खेत के सबसे पास','মোৰ পথাৰৰ আটাইতকৈ ওচৰত'],
 ['TODAY','आज','আজি'],['SUN','रवि','ৰবি'],['MON','सोम','সোম'],
 ['TUE','मंगल','মঙ্গল'],['WED','बुध','বুধ'],['THU','गुरु','বৃহস্পতি'],
 ['FRI','शुक्र','শুক্ৰ'],['SAT','शनि','শনি'],
 ['Log out','लॉग आउट','লগ আউট'],['More','और','অধিক'],
 ['LIVE','लाइव','লাইভ'],['DEMO','डेमो','ডেমো'],['LAST KNOWN','पिछली जानकारी','শেষ উপলব্ধ তথ্য'],
 ['Combines prices, your harvest window, weather and storage into one call — change any field and it recalculates.',
 'भाव, कटाई का समय, मौसम और भंडारण से एक सलाह मिलती है — कोई भी जानकारी बदलें तो हिसाब फिर होगा।',
 'দাম, চপোৱাৰ সময়, বতৰ আৰু সংৰক্ষণ মিলাই পৰামৰ্শ দিয়ে — তথ্য সলনি কৰিলে পুনৰ হিচাপ হয়।'],
 ['Distances are measured from','दूरियाँ मापी जाती हैं','দূৰত্ব জোখা হয়'],
 ['your farm','आपके खेत से','আপোনাৰ পথাৰৰ পৰা'],
 ['to each mandi — change the location and every number moves with it.\n      Stored with your profile; only the crop changes each season.',
 'हर मंडी तक — स्थान बदलने पर हिसाब बदलता है। जानकारी प्रोफ़ाइल में रहती है; हर मौसम में फसल बदलें।',
 'প্ৰতিখন বজাৰলৈ — স্থান সলনি কৰিলে হিচাপ সলনি হয়। তথ্য প্ৰফাইলত থাকে; প্ৰতিটো ঋতুত শস্য সলনি কৰক।']
];
const originalText = new WeakMap();
let languageObserver;
function translatedText(source) {
 const i = {en:0,hi:1,as:2}[LANG] || 0;
 const row = UI_TEXT.find(r=>r[0]===source) || Object.values(D).find(r=>r[0]===source);
 if(row) return row[i] || row[0];
 let m = source.match(/^(\d+)-day price trend$/);
 if(m) return i===1 ? m[1]+' दिन का भाव रुझान' : i===2 ? m[1]+' দিনৰ দামৰ ধাৰা' : source;
 m = source.match(/^(\d+) days$/);
 if(m) return i===1 ? m[1]+' दिन' : i===2 ? m[1]+' দিন' : source;
 return source;
}
function translateVisibleText(root){
 const doc = root.ownerDocument || root;
 if(!doc.createTreeWalker) return;
 const walker = doc.createTreeWalker(root, 4);
 let node;
 while((node=walker.nextNode())) {
  if(node.parentElement?.closest('script,style,textarea,[data-i18n],#langSel,.kmob')) continue;
  const current=node.nodeValue;
  const saved=originalText.get(node);
  const source=saved && saved.output===current ? saved.source : current;
  const core=source.trim();
  if(!core) continue;
  const translated=translatedText(core);
  const output=source.replace(core,translated);
  originalText.set(node,{source,output});
  if(current!==output) node.nodeValue=output;
 }
}
function watchTranslations(){
 if(languageObserver || typeof MutationObserver==='undefined') return;
 let pending=false;
 languageObserver=new MutationObserver(()=>{
  if(pending) return;
  pending=true;
  setTimeout(()=>{
  languageObserver.disconnect();
  document.body.querySelectorAll('[data-i18n]').forEach(el=>{
    const value=t(el.getAttribute('data-i18n'));
    if(value && el.textContent!==value) el.textContent=value;
  });
  translateVisibleText(document.body);
  languageObserver.observe(document.body,{childList:true,subtree:true});
  pending=false;
  },50);
 });
 languageObserver.observe(document.body,{childList:true,subtree:true});
}
