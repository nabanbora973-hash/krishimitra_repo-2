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
  if (root.body) root.body.setAttribute('data-lang', LANG);
}

export const LANG_KEY = KEY;
export const _dict = D;          // tests read this
