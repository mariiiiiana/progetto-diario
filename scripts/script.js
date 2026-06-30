const BASE_WORLD_W = 800;
const WORLD_H = 920;
let worldW = BASE_WORLD_W;

let viewW = window.innerWidth;
let viewH = window.innerHeight;
let originX = 0;
let originY = 0;
let mapScale = 1;

let diaryData = null;
let diaryLoadPromise = null;

function hasTextDescenders(text){
  return /[gjpqy]/i.test(String(text || ''));
}

function loadDiaryData() {
  if(diaryLoadPromise) return diaryLoadPromise;
  diaryLoadPromise = (async () => {
    try {
      const response = await fetch("data/dati_diario_landing.json");

      if (!response.ok) {
        throw new Error("Error loading JSON file");
      }

      diaryData = await response.json();
      syncEmotionCatalog(diaryData);
      patternData = buildEmotionData(diaryData);
      if(!window.__EMOTION_DETAIL_PAGE__){
        rebuildBaseBlocks();
        resizeCanvas();
      }
    } catch (error) {
      console.error("Diary loading error:", error);
    }
  })();
  return diaryLoadPromise;
}

if(!window.__EMOTION_DETAIL_PAGE__) loadDiaryData();

const FACE_TILE_BLEED = 1.08;
const FACE_TILE_OVERLAP = 1.25;
const BLOCK_BREATHE_AMP = 0.026;
const BLOCK_ISO_TILT_AMP = 0.017;
const BLOCK_H_PULSE_AMP = 0.02;
const BLOCK_HOVER_LIFT = 6.2;
const BLOCK_HOVER_TILT_X = 8.5;
const BLOCK_HOVER_TILT_Y = 5;
const BLOCK_RELATED_LIFT = 1.8;
const emotionStrips = {};
let emotionImagesReady = false;
let emotionManifest = null;
const emotionManifestPromise = fetch('data/emotion-images.json')
  .then(res => res.ok ? res.json() : null)
  .then(manifest => {
    if(manifest) emotionManifest = manifest;
    return manifest;
  })
  .catch(() => null);
function loadImage(src){
  return new Promise((resolve, reject) => {
    const im = new Image();
    let done = false;
    const finish = (fn, arg) => { if(done) return; done = true; fn(arg); };
    im.onload = () => finish(resolve, im);
    im.onerror = () => finish(reject, new Error('Failed: ' + src));
    setTimeout(() => finish(reject, new Error('Timeout: ' + src)), 8000);
    im.src = src;
  });
}
function partitionFaceImages(images){
  const faces = { top: [], left: [], right: [] };
  const ready = images.filter(im => im.complete && im.naturalWidth);
  if(!ready.length) return faces;
  ready.forEach((img, i) => {
    const bucket = i % 3 === 0 ? 'top' : i % 3 === 1 ? 'left' : 'right';
    faces[bucket].push(img);
  });
  if(ready.length === 1){
    faces.left.push(ready[0]);
    faces.right.push(ready[0]);
  } else if(ready.length === 2 && !faces.right.length){
    faces.right.push(ready[1]);
  }
  return faces;
}
async function loadEmotionImages(){
  try {
    const manifest = await emotionManifestPromise;
    if(!manifest) throw new Error('emotion-images.json missing');
    await Promise.all(Object.entries(manifest).map(async ([id, paths]) => {
      const loaded = [];
      await Promise.all(paths.map(async src => {
        try {
          const img = await loadImage(src);
          loaded.push(img);
          // aggiorna subito: la box mostra le sue foto man mano che arrivano,
          // invece di aspettare che TUTTE le immagini di quell'emozione siano pronte
          emotionStrips[id] = { images: loaded, faces: partitionFaceImages(loaded) };
        } catch { /* skip broken file */ }
      }));
    }));
  } catch (error) {
    console.error('Emotion images loading error:', error);
  } finally {
    emotionImagesReady = true;
  }
}
function emotionStripMeta(id){
  return emotionStrips[id] || emotionStrips.neutra || null;
}
const emotionImagesBoot = loadEmotionImages();
const canvas = document.getElementById('iso');
const ctx = canvas ? canvas.getContext('2d') : null;
if(canvas){
  // Su mobile, con molti drawImage continui per il loop di animazione, il
  // browser puo' perdere il backing store del canvas (context loss) e
  // lasciarlo nero. Qui intercettiamo l'evento e lo ricostruiamo da soli,
  // invece di lasciare l'utente con lo schermo nero finche' non ricarica.
  canvas.addEventListener('contextlost', (e) => {
    e.preventDefault();
    console.warn('Canvas context lost, attendo il recupero automatico del browser');
  });
  canvas.addEventListener('contextrestored', () => {
    try { resizeCanvas(); } catch(err){ console.error('resizeCanvas dopo contextrestored error', err); }
  });
}
const explodeLayer = document.getElementById('explodeLayer');
const links = document.getElementById('links');
const stageEl = document.querySelector('.stage');
let explodeLayout = { key: null };

// Each room is a unique emotional microsystem — balanced between lighter and heavier poles.
const POSITIVE_EMOTIONS = ['sollievo','serenita','desiderio','speranza','gioia','entusiasmo','gratitudine','amore','fiducia','sorpresa'];
const NEGATIVE_EMOTIONS = ['tristezza','stress','malinconia','frustrazione','incertezza','rabbia','vulnerabilita','solitudine','ansia','paura','vergogna','colpa','rimpianto','nostalgia','noia'];
const FALLBACK_TOP_EMOTIONS = ['tristezza','sollievo','stress','serenita','malinconia','desiderio','frustrazione','speranza','rabbia','gioia','incertezza','entusiasmo','vulnerabilita','gratitudine','solitudine','ansia','paura','nostalgia','amore'];
let topEmotions = [...FALLBACK_TOP_EMOTIONS];

const EMOTION_LABELS = {
  tristezza: 'sadness', sollievo: 'relief', stress: 'stress', serenita: 'serenity',
  malinconia: 'melancholy', desiderio: 'desire', frustrazione: 'frustration', speranza: 'hope',
  rabbia: 'anger', gioia: 'joy', incertezza: 'uncertainty', entusiasmo: 'enthusiasm',
  vulnerabilita: 'vulnerability', gratitudine: 'gratitude', solitudine: 'loneliness', ansia: 'anxiety',
  paura: 'fear', nostalgia: 'nostalgia', amore: 'love', fiducia: 'trust', sorpresa: 'surprise',
  vergogna: 'shame', colpa: 'guilt', rimpianto: 'regret', noia: 'boredom'
};
const THEME_LABELS = {
  'ansia per il peso': 'weight worries',
  'ansia per l\'esame': 'exam nerves',
  'ansietà per la vita personale': 'personal life worries',
  'paura della laurea': 'thesis pressure',
  'controllo alimentare': 'restrictive eating',
  'autocontrollo alimentare': 'food discipline', 'controllo del peso': 'weight obsession',
  'controllo della dieta': 'diet rules', 'controllo della fame': 'managing hunger',
  'controllo dell\'alimentazione': 'eating control', 'controllo degli impulsi alimentari': 'resisting binge urges',
  'controllo personale': 'self-control',
  'salute mentale': 'mental health', 'ritorno a casa': 'going home', 'peso corporeo': 'body weight',
  'sentimento di inadeguatezza': 'not measuring up', 'sentimento di disperazione': 'hopelessness',
  'senso di disperazione': 'hopelessness', 'emozioni negative': 'heavy feelings',
  'emotività negative': 'heavy feelings', 'tristezza/depressione': 'feeling low',
  'scherzo': 'sarcasm',
  'relazioni familiari': 'family dynamics',
  'attività fisica': 'exercise', 'giornata positiva': 'good day', 'giorno libero': 'day off',
  'camminata outdoor': 'walk outside', 'aspetto fisico': 'how I look', 'auto-critica': 'self-criticism',
  'auto-ostilità': 'self-loathing', 'autoostilezza negativa': 'self-loathing',
  'autovalutazione negativa': 'harsh self-judgment',
  'autovalutazione personale': 'personal self-assessment',
  'crisi d\'ansia': 'panic spiral', 'crisi alimentare': 'food falling apart', 'body image': 'body image',
  'binge eating': 'binge eating', 'burnout': 'burnout',
  'aggressione verbale': 'verbal aggression', 'auto-sabotaggio': 'self-sabotage',
  'attivita fisica': 'exercise', 'peso corporeo': 'body weight', 'giornata positiva': 'good day',
  'libertà': 'freedom', 'liberta': 'freedom',
  'inutilità': 'pointlessness', 'inutilita': 'pointlessness',
  'lunedì': 'Monday', 'martedì': 'Tuesday', 'mercoledì': 'Wednesday', 'giovedì': 'Thursday',
  'venerdì': 'Friday', 'sabato': 'Saturday', 'domenica': 'Sunday',
  'lunedi': 'Monday', 'martedi': 'Tuesday', 'mercoledi': 'Wednesday', 'giovedi': 'Thursday',
  'venerdi': 'Friday', 'auto-odio': 'self-hatred', 'autolesionismo': 'self-harm',
  'disgusto per se stesso': 'self-disgust', 'disprezzo per se stesso': 'self-loathing',
  'odio per se stesso': 'self-hatred', 'senza scopo': 'aimlessness',
  'isolamento emotivo': 'feeling cut off', 'problemi personali': 'personal struggles', 'pensieri negativi': 'negative spiraling',
  'disturbo alimentare': 'eating disorder', 'disturbi alimentari': 'eating disorders',
  'giorno di riposo': 'rest day', 'senso di disconnessione': 'feeling disconnected', 'perdita di controllo': 'losing control',
  'spesa eccessiva': 'overspending', 'realizzazione personale': 'finding purpose',
  'imperfezione personale': 'feeling flawed', 'abuso di cibo': 'bingeing',   'impatto emotivo': 'personal toll',
  'giorno della settimana': 'weekday', 'relazione con la madre': 'issues with mom', 'ritorno alla routine': 'back to routine',
  'senza speranza': 'hopelessness', 'ansia di controllo': 'need for control',
  'preoccupazione per l\'aspetto fisico': 'body image worries',
  'presa di responsabilita': 'stepping up', 'presa di responsabilità': 'stepping up',
  'giornata sprecata': 'day felt wasted',
  'sentimento di alienazione': 'feeling alienated', 'nostalgia per l\'adolescenza': 'missing adolescence',
  'bassa soddisfazione': 'underwhelmed', 'mancanza di motivazione': 'no drive left',
  'repressione delle emozioni': 'bottling things up',
  'bruciore emotivo': 'aching inside',
  'senso di vuoto': 'emptiness',
  'tornata alla normalita': 'settling back in', 'tornata alla normalità': 'settling back in',
  'gestione del tempo': 'juggling time',
  'senso di tempo che scivola via': 'time slipping away', 'modi di vita': 'ways of living',
  'rifiuto di aiuto': 'pushing help away', 'mal di testa': 'headache', 'dolori generalizzati': 'aches all over',
  'insicurezza sociale': 'social awkwardness',
  'senso di isolamento': 'feeling cut off', 'difficolta di adattamento': 'struggling to adjust',
  'difficoltà di adattamento': 'struggling to adjust', 'insicurezza futura': 'uncertainty about the future',
  'senso di suffocamento': 'feeling trapped', 'odio per la situazione attuale': 'hating how things are',
  'torna a torino': 'back in Turin', 'attrazione romantica': 'crush', 'mangiare troppo': 'overeating',
  'preoccupazione per la salute mentale': 'mental health worries',
  'trasformazione personale': 'trying to change',
  'paura dell\'esame': 'exam nerves',
  'aspettative non soddisfatte': 'things fell short',
  'fine del fine settimana': 'weekend ending',
  'lavori di gruppo': 'group projects',
  'speranza di risoluzione del conflitto': 'hoping things resolve', 'disordinato alimentare': 'disordered eating',
  'progetti di gruppo': 'group projects', 'organizzazione': 'getting organized', 'partenza': 'leaving',
  'aiuto': 'asking for help', 'autostima': 'self-worth',
  'insicurezza': 'self-doubt', 'obesita': 'obesity', 'obesità': 'obesity',
  'responsabilita': 'responsibility', 'responsabilità': 'responsibility', 'liti con i coinquilini': 'roommate fights',
  'tornare a casa': 'going home', 'rientro a casa': 'coming home',
  'auto-umiliazione': 'tearing yourself down', 'autoostilezza': 'self-loathing',
  'autovalutazione negativa': 'harsh self-judgment', 'autovalutazione': 'self-judgment',
  'crisi d\'ansia': 'panic spiral', 'crisi alimentare': 'food falling apart',
  'aspetto fisico': 'how I look', 'camminata': 'walking', 'camminata outdoor': 'walk outside',
  'infotizione': 'crush', 'annoiosità': 'tedium', 'annoiosita': 'tedium',
  'desiderio di cambiamento': 'wanting change',
  'senso della vita': 'purpose in life',
  'ripetizione': 'same old loop',   'insoddisfazione': 'not enough', 'confusione': 'mental fog',
  'università': 'college life', 'universita': 'college life',
  'innamoramento': 'falling for someone', 'dissociazione': 'dissociation', 'disorientamento': 'disorientation',
  'procrastinazione': 'procrastinating', 'inadeguatezza': 'not measuring up',
  'autodisprezzo': 'self-loathing', 'autoconsapevolezza': 'self-awareness', 'autodisciplina': 'discipline',
  'autocontrollo': 'self-control', 'autoaccettazione': 'self-acceptance', 'socializzazione': 'socializing',
  'focalizzazione': 'hyperfocus', 'determinazione': 'determination', 'perdita di peso': 'weight loss',
  'rispetto per se stesso': 'self-respect', 'sonnambulismo': 'sleepwalking', 'vita': 'life',
  'amicizia problematica': 'strained friendship', 'amicizia universitaria': 'college friendships',
  'senso di essere ingannato': 'feeling betrayed', 'arrivo dei cugini': 'cousins visiting',
  'uso del telefono': 'too much screen time', 'cugini': 'cousins', 'ingannato': 'betrayed', uso: 'use'
};
const SEMANTIC_TAIL_LABELS = {
  inadeguatezza: 'not measuring up', disperazione: 'hopelessness',
  isolamento: 'feeling cut off',
  suffocamento: 'feeling trapped', disconnessione: 'feeling disconnected',
  motivazione: 'drive', scopo: 'purpose', normalita: 'normal life', normalità: 'normal life',
  routine: 'routine', cambiamento: 'change',
  peso: 'weight', cibo: 'food', vita: 'life', futuro: 'the future',
  esame: 'exams', esami: 'exams', aspetto: 'appearance', salute: 'health', corpo: 'body',
  adolescenza: 'being young', conflitto: 'the conflict', aiuto: 'help', tempo: 'time',
  adattamento: 'adjusting', situazione: 'how things are', alimentazione: 'eating', fame: 'hunger',
  impulsi: 'urges', 'impulsi alimentari': 'food urges', dieta: 'diet', 'peso corporeo': 'body weight',
  'se stesso': 'yourself', 'se stessa': 'yourself'
};
const IT_WORDS = {
  ansia:'anxiety', ansietà:'anxiety', frustrazione:'frustration', autostima:'self-esteem', insicurezza:'insecurity',
  stress:'stress', rabbia:'anger', disappunto:'disappointment', camminata:'walk', paura:'fear',
  speranza:'hope', noia:'boredom', isolamento:'isolation',
  tristezza:'sadness', odio:'hatred', umiliazione:'humiliation', disperazione:'hopelessness', peso:'weight',
  incertezza:'uncertainty', motivazione:'motivation', solitudine:'loneliness', colpa:'guilt', disgusto:'disgust',
  famiglia:'family', stanchezza:'tiredness', salute:'health', controllo:'control', alimentare:'food-related',
  nostalgia:'nostalgia', insoddisfazione:'dissatisfaction', cibo:'food', disillusione:'disillusionment',
  preoccupazione:'worry', partenza:'departure', attività:'activity', attivita:'activity', fisica:'physical',
  critica:'criticism', sentimento:'feeling', inadeguatezza:'inadequacy', crisi:'crisis', emotiva:'emotional',
  emotivo:'emotional', soddisfazione:'satisfaction', corporeo:'bodily', esame:'exam', esami:'exams',
  angoscia:'anguish', delusione:'disappointment', autonomia:'autonomy', irritazione:'irritation',
  emozioni:'emotions', emozione:'emotion', negative:'negative', negativa:'negative', negativo:'negative',
  depressione:'depression', aspettative:'expectations', aspettativa:'expectation', organizzazione:'organization',
  relazioni:'relationships', familiari:'family', senso:'sense', aiuto:'help', ritorno:'return', casa:'home',
  autovalutazione:'self-assessment', mentale:'mental', rimpianto:'regret', dolore:'pain', malinconia:'melancholy',
  dubbio:'doubt', tesi:'thesis', lavoro:'work', spesa:'spending', dimenticanza:'forgetfulness', laurea:'graduation',
  ironia:'irony', aspetto:'appearance', alimentazione:'eating', inutilità:'uselessness', inutilita:'uselessness',
  amore:'love', amici:'friends', amicizia:'friendship', solitudine:'loneliness', vergogna:'shame', apatia:'apathy',
  solitudine:'loneliness', abbandono:'abandonment', accettazione:'acceptance', alimentazione:'eating', depressione:'depression',
  autonomia:'autonomy', delusione:'disappointment', partenza:'departure', arrivo:'arrival', attesa:'waiting',
  corpo:'body', notte:'night', sera:'evening', studio:'study', università:'university', universita:'university',
  città:'city', citta:'city', viaggio:'travel', sonno:'sleep', routine:'routine', futuro:'future', memoria:'memory',
  relazioni:'relationships', motivazione:'motivation', per:'for', il:'the', lo:'the', la:'the', i:'the', le:'the',
  di:'of', del:'of the', della:'of the', dei:'of the', delle:'of the', che:'that', non:'not', con:'with',
  una:'a', uno:'a', un:'a', e:'and', personali:'personal', personale:'personal', sociale:'social', fisica:'physical',
  fisico:'physical', alimentari:'food-related', peso:'weight', esame:'exam', esami:'exams', negative:'negative',
  aiutami:'help me', almeno:'at least', altro:'other', bello:'beautiful', debba:'should',
  due:'two', farcela:'make it', finalmente:'finally', fine:'end', finire:'finish', meglio:'better',
  nessuno:'nobody', penso:'think', riposo:'rest', ripresa:'recovery', risolto:'resolved',
  seminario:'seminar', sia:'be', situazione:'situation', smetterla:'stop it', soldi:'money', spendendo:'spending',
  uffa:'ugh', ultimo:'last', vivere:'live', volta:'time', boh:'dunno', dare:'give',
  madre:'mother', pace:'peace', ahiii:'ugh', aridaje:'goodbye', ruben:'Ruben',
  più:'more', perché:'because', perche:'because', però:'but', pero:'but',
  auto:'self', stesso:'same', perdita:'loss', relazione:'relationship', giorno:'day', senza:'without',
  morte:'death', problemi:'problems', disprezzo:'contempt', responsabilita:'responsibility', liberta:'freedom',
  fuga:'escape', sul:'on the', pensieri:'thoughts', progetto:'project', rifiuto:'rejection', settimana:'week',
  dieta:'diet', giornata:'day', cambiamento:'change', preoccupazioni:'worries', ciclo:'cycle',
  autocontrollo:'self-control', scopo:'purpose', lunedi:'Monday', sprecata:'wasted', mancanza:'lack',
  abuso:'abuse', mercoledi:'Wednesday', stagnazione:'stagnation', difficolta:'difficulty', persone:'people',
  negativi:'negative', emotivita:'emotionality', corporea:'bodily', desperazione:'desperation',
  pessimismo:'pessimism', periodo:'period', distrazione:'distraction', impegno:'commitment', disturbi:'disorders',
  crediti:'credits', musica:'music', disconnessione:'disconnection', addio:'goodbye', coinquilini:'roommates',
  procrastinazione:'procrastination', tempo:'time', impazienza:'impatience', febbraio:'February',
  insicoltura:'shyness', realizzazione:'realization', dimagrimento:'weight loss', capelli:'hair', schifo:'disgust',
  palle:'annoyance', espressione:'expression', infedelta:'infidelity', impatto:'impact',
  confusione:'confusion', eccitazione:'excitement', rispetto:'respect', aggressione:'aggression',
  disillusone:'disillusionment', autoconsapevolezza:'self-awareness', appetito:'appetite', impotenza:'helplessness',
  disturbo:'disorder', immagine:'image', autodisprezzo:'self-loathing', autodisciplina:'self-discipline',
  guerra:'war', nulla:'nothing', nervosismo:'nervousness', luglio:'July', insulto:'insult', progetti:'projects',
  sostanze:'substances', mal:'bad', irritabilita:'irritability', distruzione:'destruction', voto:'grade',
  eccessiva:'excessive', troppo:'too much', fare:'doing', trasformazione:'transformation', persona:'person',
  dissociazione:'dissociation', gruppo:'group', liberazione:'liberation', identita:'identity', rientro:'return',
  pigrizia:'laziness', forma:'shape', proprio:'own', dicembre:'December',
  socializzazione:'socializing', ripensamento:'reconsideration', sabato:'Saturday', dimensioni:'size',
  abitudini:'habits', verbale:'verbal', gennaio:'January', marzo:'March', aprile:'April', maggio:'May',
  giugno:'June', settembre:'September', ottobre:'October', novembre:'November', agosto:'August',
  solitudine:'loneliness', sola:'alone', relazioni:'relationships', amicizia:'friendship', famiglia:'family',
  soluzione:'solution', sofferenza:'suffering', separazione:'separation', solitudine:'loneness', paure:'fears',
  pausa:'break', passione:'passion', passeggiata:'walk', passato:'past', pensiero:'thought', perduto:'lost',
  perfezione:'perfection', personalita:'personality', piacere:'pleasure', pieta:'pity', problema:'problem',
  problematica:'problematic', progresso:'progress', progressi:'progress', pudore:'shyness', rabbia:'anger',
  ricordo:'memory', ricordi:'memories', riflesso:'reflection', rilassamento:'relaxation', riminiscenza:'reminiscence',
  risoluzione:'resolution', ritardo:'delay', romantica:'romantic', rottura:'breakup', sabotaggio:'sabotage',
  sacrificio:'sacrifice', sconforto:'discouragement', scrittura:'writing', scrivere:'writing', seduzione:'seduction',
  sensazione:'sensation', sentimenti:'feelings', serata:'evening', sessuale:'sexual', sforzo:'effort',
  sicurezza:'security', sonno:'sleep', sopraffazione:'overwhelm', sorella:'sister', sorprezza:'surprise',
  sofferenza:'suffering', stress:'stress', successo:'success', suicidi:'suicide', sviluppo:'development',
  taglio:'cut', tecnico:'technical', telefono:'phone', testa:'head', tomba:'grave', tossica:'toxic',
  tranquillita:'calm', trasferta:'trip', trattamento:'treatment', trauma:'trauma', tregua:'truce',
  uff:'ugh', umorismo:'humor', universitaria:'university', uomini:'men', uscita:'exit', vacanza:'vacation',
  valore:'value', valutazione:'assessment', vestiti:'clothes', via:'away', violenza:'violence',
  visita:'visit', voglia:'desire', volonta:'will', abbuffarsi:'bingeing', accademia:'academia', accollarsi:'taking on',
  alzarsi:'getting up', amarezza:'bitterness', anonimita:'anonymity', apparenza:'appearance', appunti:'notes',
  arte:'art', aspirazione:'aspiration', attrazione:'attraction', autorevazione:'self-loathing', autovergogna:'self-shame',
  avvilita:'discouraged', bevande:'drinks', brutta:'ugly', brutto:'ugly', bullismo:'bullying', buon:'good',
  caffe:'coffee', caffeina:'caffeine', cambiamento:'change', carino:'cute', casalingo:'domestic', casino:'mess',
  cimitero:'cemetery', collera:'rage', compleanno:'birthday', complicato:'complicated', compulsione:'compulsion',
  condizionamento:'conditioning', conflitto:'conflict', consumo:'consumption', contratto:'contract', contro:'against',
  controllare:'controlling', corporea:'bodily', corso:'course', corsi:'courses', costrizione:'constraint',
  creativita:'creativity', crescita:'growth', cucina:'kitchen', cugini:'cousins', decisione:'decision',
  degno:'worthy', desolazione:'desolation', determinazione:'determination', detox:'detox', difficile:'difficult',
  dipendenza:'dependency', disagio:'discomfort', disegno:'drawing', disgustoso:'disgusting', disorientamento:'disorientation',
  dispiacere:'displeasure', distanza:'distance', distorsione:'distortion', dolori:'pains', dottorato:'doctorate',
  eliminare:'eliminate', emotivi:'emotional', energia:'energy', errore:'error', esercizio:'exercise',
  esistenza:'existence', esperienza:'experience', evitare:'avoiding', evoluzione:'evolution', facolta:'faculty',
  fastidio:'annoyance', fatica:'effort', felicita:'happiness', festa:'party', figura:'figure', finale:'final',
  finanza:'finance', finito:'finished', fitness:'fitness', focalizzazione:'focus', frustrazione:'frustration',
  fumo:'smoking', futura:'future', gestione:'management', giudicato:'judged', gola:'throat', gonfiore:'bloating',
  gradita:'welcome', grazie:'thanks', gruppi:'groups', guardaroba:'wardrobe', imbarazzo:'embarrassment',
  immortalizzare:'immortalizing', impossibile:'impossible', impulsi:'impulses', inattivita:'inactivity',
  incapacita:'inability', incomprensione:'misunderstanding', ingannato:'deceived', inimicizia:'enmity',
  innamoramento:'falling in love', insecurita:'insecurity', intolleranza:'intolerance', introspezione:'introspection',
  invidia:'envy', istruzione:'education', legame:'bond', leggero:'light', lettera:'letter', lezione:'lesson',
  lezioni:'lessons', libero:'free', libro:'book', limitazione:'limitation', limiti:'limits', liti:'arguments',
  litigi:'arguments', litigio:'argument', magra:'thin', magro:'thin', malattia:'illness', malumore:'bad mood',
  mamma:'mom', manutenzione:'maintenance', menopausa:'menopause', mestruazioni:'period', miracolo:'miracle',
  miseria:'misery', moda:'fashion', momenti:'moments', mortificare:'humiliating', motivo:'reason', nascita:'birth',
  noioso:'boring', scherzo:'sarcasm', normalita:'normality', obbligo:'obligation', obesita:'obesity', omicidio:'murder',
  orgoglio:'pride', ormonale:'hormonal', ossessione:'obsession', ossessivita:'obsessiveness', ostilita:'hostility',
  ottimismo:'optimism', padre:'father', panico:'panic', paralisi:'paralysis', parlare:'talking', parole:'words',
  pedante:'pedantic', pena:'pain', percezione:'perception', post:'post', potere:'power', poverta:'poverty',
  preparazione:'preparation', presentazione:'presentation', presto:'soon', primo:'first', priorita:'priority',
  produttivita:'productivity', professore:'professor', psicologia:'psychology', psicoterapia:'therapy',
  raffreddore:'cold', ragazzo:'boy', realta:'reality', rebranding:'rebranding', regresso:'regression',
  repressione:'repression', resistenza:'resistance', revisione:'revision',
  ricominciare:'starting over', riempire:'filling', risata:'laugh', rompimento:'breakup', sangue:'blood',
  scherzo:'sarcasm', scocciatura:'nuisance', scolastici:'school', scopo:'purpose', segno:'sign', sensazione:'feeling',
  sesso:'sex', sfida:'challenge', sfogo:'outburst', sfortuna:'misfortune', sgabello:'stool', shock:'shock',
  sogni:'dreams', sogno:'dream', solidarieta:'solidarity', sopportare:'enduring', speranza:'hope',
  spreco:'waste', spronare:'pushing', squilibrio:'imbalance', stanchezza:'tiredness', storia:'story',
  strada:'road', stretta:'tight', stronza:'bitch', stronzo:'asshole', stufa:'fed up', sudore:'sweat',
  suggerimento:'suggestion', supporto:'support', svedese:'Swedish', svolta:'turning point', talento:'talent',
  tardivo:'late', tedio:'tedium', telefonata:'phone call', tensione:'tension', terapia:'therapy',
  terribile:'terrible', terrore:'terror', timore:'fear', titubanza:'hesitation', tormento:'torment',
  tradimento:'betrayal', traffico:'traffic', tragico:'tragic', training:'training', transizione:'transition',
  triste:'sad', tristezza:'sadness', turismo:'tourism', tuttora:'still', ubriaca:'drunk', ubriaco:'drunk',
  uccidere:'kill', ultime:'latest', umiliazione:'humiliation', unica:'only', unico:'unique', unita:'unity',
  umore:'mood', umore:'mood', urgenza:'urgency', vacanze:'vacation', vagina:'vagina', vanita:'vanity',
  vendetta:'revenge', vergogna:'shame', verita:'truth', vertigini:'dizziness', vibrazione:'vibration',
  vicinanza:'closeness', vigilia:'eve', vile:'cowardly', vincere:'winning', vincita:'win', virtuale:'virtual',
  viso:'face', vite:'lives', vittima:'victim', vittoria:'victory', vizi:'vices', vizio:'vice', voce:'voice',
  volonta:'willpower', vuoto:'void', zittire:'silencing', zona:'zone', abbandono:'abandonment',
  accettazione:'acceptance', acquisto:'purchase', adattamento:'adaptation', alcool:'alcohol', alienazione:'alienation',
  altri:'others', amorose:'love', anatomia:'anatomy', anno:'year', annoiosita:'boredom', annotazione:'annotation',
  assicurata:'insured', attuale:'current', aumento:'increase', autoaccettazione:'self-acceptance',
  autocritica:'self-criticism', autodistruzione:'self-destruction', autolesione:'self-harm', autorevazione:'self-revulsion',
  benessere:'wellbeing', biliancio:'balance', bollente:'hot', bruciore:'burning', buon:'good', calma:'calm',
  capelli:'hair', casalingo:'domestic', chiaveca:'key', collare:'collar', colombo:'dove', colorazione:'coloring',
  comenti:'comments', commenti:'comments', comprensiva:'understanding', concerto:'concert', consistenza:'consistency',
  controllare:'control', copiatura:'copying', coppionamento:'pairing', costantemente:'constantly', costume:'costume',
  crampi:'cramps', cranico:'cranial', crash:'crash', crispo:'crisp', criticism:'criticism', danni:'damage',
  decisione:'decision', dehydrated:'dehydrated', desiderato:'desired', desideri:'desires', design:'design',
  disconezza:'disconnection', disconoscimento:'non-recognition', discriminazione:'discrimination',
  disfunzionalita:'dysfunction', disorganizzazione:'disorganization', disordinato:'messy', disordinamento:'disorder',
  dispiacimento:'regret', dissapatezza:'disappointment', dissapointamento:'disappointment', dissidio:'conflict',
  dissonanza:'dissonance', disuguaglianza:'inequality', dolorosi:'painful', dubbiosi:'doubtful', eccitazione:'excitement',
  embarrassamento:'embarrassment', estrazione:'extraction', eta:'age', euforia:'euphoria',
  esibizione:'exhibition', esistenzialismo:'existentialism', esprimersi:'expressing oneself', fantasma:'ghost',
  faticanza:'tiredness', festeggiamenti:'celebrations', festivita:'holiday', finanziaria:'financial',
  flirt:'flirting', focalizzarsi:'focusing', fonte:'source', freedom:'freedom', gaeta:'Gaeta', gatti:'cats',
  generalizzati:'generalized', giacomo:'Giacomo', ginnastica:'gymnastics', giovanna:'Giovanna', gli:'the',
  gola:'throat', grief:'grief', growth:'growth', hobby:'hobby', immortalizzare:'immortalize', impaginazione:'layout',
  impostazione:'setting', imprevistabilita:'unpredictability', inaspettata:'unexpected', inconvenienze:'inconveniences',
  independenza:'independence', indurimento:'hardening', infotizione:'infatuation', infuria:'fury', ingannato:'tricked',
  inglese:'English', iniziando:'starting', iniziare:'starting', insegretezza:'secrecy', insuccesso:'failure',
  intensa:'intense', interazione:'interaction', interesse:'interest', interna:'internal', intorno:'around',
  intubazione:'intubation', iperattivita:'hyperactivity', ira:'wrath', italia:'Italy', joan:'Joan', lattosio:'lactose',
  laureata:'graduated', lavori:'works', lazy:'lazy', lethargia:'lethargy', liquidi:'liquids', litigare:'arguing',
  manifesting:'manifesting', masters:'masters', menstruali:'menstrual', mentali:'mental',
  merda:'shit', merito:'merit', metro:'subway', michele:'Michele', mimi:'Mimi', modi:'ways', modifiche:'changes',
  motivazionale:'motivational', napoli:'Naples', nozione:'notion', numb:'numb', nuovo:'new', odo:'hate',
  ogni:'every', omofobia:'homophobia', open:'open', outdoor:'outdoor', papino:'daddy',
  parascandolo:'excuse', passa:'passes', pay:'pay', positiva:'positive', positive:'positive',
  poste:'post office', preciclo:'pre-cycle', presa:'grip', professoressa:'professor', produttiva:'productive',
  propria:'own', pulizia:'cleaning', pura:'pure', purging:'purging', raffreddore:'cold', realizzate:'achieved',
  reciproca:'mutual', relax:'relax', relievo:'relief', ricominciare:'restart', rimozione:'removal',
  ringraziamento:'gratitude', ripetizione:'repetition', ripetuta:'repeated', romantica:'romantic',
  romanticismo:'romanticism', romanticizzazione:'romanticizing', ruben:'Ruben', scivola:'slips', scolastici:'school',
  self:'self', semman:'Semman', senza:'without', sesso:'sex', sigarette:'cigarettes', sito:'site',
  sketchbook:'sketchbook', slices:'slices', sociali:'social', soddisfatte:'satisfied', soggezione:'subjection',
  specificata:'specified', spice:'spice', spirale:'spiral', sta:'is', streak:'streak', studi:'studies',
  studiosi:'scholars', studioso:'scholar', suffocamento:'suffocation', superstizione:'superstition',
  telecom:'telecom', tempera:'tempera', tese:'thesis', thrifting:'thrifting', torna:'returns', tornata:'returned',
  ugh:'ugh', valigie:'luggage',   webinar:'webinar', zeno:'Zeno', zorba:'Zorba',
  faccio:'I do', facciamo:'we do', fai:'you do', facci:'you do', fatto:'done', fare:'doing',
  essere:'being', sono:'am', sei:'are', siamo:'we are', erano:'were', stato:'been', stata:'been',
  pensare:'thinking', pensiero:'thought', pensieri:'thoughts', venire:'coming', vieni:'you come',
  riuscire:'succeeding', riesco:'I manage', vengo:'I come', passi:'steps', passo:'step',
  come:'like', cose:'things', fuori:'outside', dentro:'inside', avere:'having', era:'was',
  infelicita:'unhappiness', infelicità:'unhappiness', felicita:'happiness', felicità:'happiness',
  disgustio:'disgust', disordere:'disorder', autolesionismo:'self-harm', autoodio:'self-hatred',
  lunedi:'Monday', lunedi:'Monday', martedi:'Tuesday', martedì:'Tuesday', mercoledi:'Wednesday',
  mercoledì:'Wednesday', giovedi:'Thursday', giovedì:'Thursday', venerdi:'Friday', venerdì:'Friday',
  sabato:'Saturday', domenica:'Sunday', imperfezione:'imperfection', incidente:'incident',
  conflittuale:'conflictual', eccessivo:'excessive', belle:'beautiful', bassa:'low', basso:'low',
  emotivita:'emotionality', emotività:'emotionality', infedelta:'infidelity', infedeltà:'infidelity',
  inutilita:'uselessness', inutilità:'uselessness', responsabilita:'responsibility', responsabilità:'responsibility',
  libertà:'freedom', abstinenzia:'abstinence', imperfezione:'imperfection', accademico:'academic',
  academia:'academia', babysitting:'babysitting', binge:'binge', bingere:'bingeing', calma:'calm',
  dall:'from the', dalla:'from the', dalle:'from the', dal:'from the', alla:'to the', alle:'to the',
  dell:'of the', degli:'of the', delle:'of the', della:'of the', del:'of the', dei:'of the',
  senso:'sense', sentimento:'feeling', esercizio:'exercise', gradite:'welcome', fuori:'outside',
  stesso:'oneself', stessa:'oneself', situazione:'situation', attuale:'current', normalita:'normality',
  normalità:'normality', testa:'head', adattamento:'adaptation', suffocamento:'suffocation', scivola:'slipping',
  vede:'sees', carino:'cute', ragazzo:'boy', ogni:'every', belle:'beautiful', cose:'things', vita:'life',
  vivi:'living', bello:'beautiful', troppo:'too much', torino:'Turin', giovanna:'Giovanna', conflitto:'conflict',
  risoluzione:'resolution', disordinato:'disordered', progetti:'projects', gruppo:'group', lavori:'works',
  settimana:'week', weekend:'weekend', fine:'end', soddisfatte:'satisfied', insoddisfatte:'unsatisfied',
  alienazione:'alienation', disconnessione:'disconnection', bruciore:'burning', vuoto:'emptiness', rompimento:'outburst',
  generalizzati:'generalized', dolori:'pains', morte:'death', futura:'future', sociale:'social', personale:'personal',
  personali:'personal', negativi:'negative', sprecata:'wasted', giornata:'day', coinquilini:'roommates',
  sostanze:'substances', annotazione:'annotation', specificata:'specified', nessuna:'none', madre:'mother',
  routine:'routine', speranza:'hope', scopo:'purpose', imperfezione:'imperfection', realizzazione:'fulfillment',
  impatto:'impact', disturbo:'disorder', disturbi:'disorders', isolamento:'isolation', pensieri:'thoughts',
  problemi:'problems', riposo:'rest', rientro:'return', tornare:'return', torna:'return', tornata:'returned',
  insicoltura:'shyness', aspettative:'expectations', soddisfatte:'met', risoluzione:'resolution', belle:'nice',
  piacere:'pleasure', piacevoli:'pleasant', aiuto:'help', rifiuto:'refusal', modi:'ways', gestione:'management',
  perdita:'loss', abuso:'abuse', flirt:'flirting', repressione:'repression', mancanza:'lack', bassa:'low',
  bruciore:'burning', romantica:'romantic', attrazione:'attraction', trasformazione:'transformation',
  organizzazione:'organization', partenza:'departure', dimenticanza:'forgetfulness', laurea:'graduation',
  ironia:'irony', aspetto:'appearance', alimentazione:'eating', inutilita:'uselessness', autoostilezza:'self-hatred',
  organizzazione:'organization', mercoledi:'Wednesday', mercoledì:'Wednesday', sabato:'Saturday', domenica:'Sunday',
  lunedi:'Monday', lunedì:'Monday', martedi:'Tuesday', martedì:'Tuesday', giovedi:'Thursday', giovedì:'Thursday',
  venerdi:'Friday', venerdì:'Friday', gennaio:'January', febbraio:'February', marzo:'March', aprile:'April',
  maggio:'May', giugno:'June', luglio:'July', agosto:'August', settembre:'September', ottobre:'October',
  novembre:'November', dicembre:'December', piú:'more', più:'more'
};
const WORD_LABELS = {
  devo:'must', cazzo:'damn', solo:'only', mia:'my', mio:'my', voglio:'want', fatto:'done', casa:'home',
  oggi:'today', stare:'staying', mangiare:'eating', ora:'now', odio:'hate', basta:'enough', tornare:'return',
  prima:'before', possibile:'possible', andare:'go', quello:'that', vita:'life', sento:'feel',
  davvero:'really', vorrei:'wish', giorni:'days', sempre:'always', ancora:'still', niente:'nothing', tutto:'everything',
  molto:'very', poco:'little', bene:'well', male:'badly', cosa:'thing', cosi:'so', così:'so', sono:'am',
  ho:'have', hai:'have', stato:'been', stata:'been', corpo:'body', sera:'evening', notte:'night', vuoto:'void',
  lontano:'far', attesa:'waiting', lista:'list', uscire:'go out', stanza:'room', silenzio:'silence', domani:'tomorrow',
  camminata:'walk', camminato:'walked', camminare:'walking', mangiato:'eaten', studiare:'studying', studiato:'studied',
  torino:'Turin', palestra:'gym', università:'university', universita:'university', scuola:'school', lavoro:'work',
  famiglia:'family', amici:'friends', amica:'friend', amico:'friend', solitudine:'loneliness', ansia:'anxiety',
  paura:'fear', tristezza:'sadness', rabbia:'anger', noia:'boredom', casa:'home', corpo:'body', peso:'weight',
  cibo:'food', fame:'hunger', dormire:'sleep', svegliare:'wake', svegliata:'woke', piangere:'cry', pianto:'crying',
  gross:'gross', grosso:'big', grossa:'big', inutile:'useless', lei:'she', altra:'other', possibile:'possible'
};
const EMOTION_IDS = [...POSITIVE_EMOTIONS, ...NEGATIVE_EMOTIONS, ...Object.keys(EMOTION_LABELS)];
const THEME_LABEL_WHITELIST = new Set([
  'sarcasm', 'heavy feelings', 'feeling low', 'hopelessness'
]);
const EMOTION_THEME_WORDS = [
  ...Object.values(EMOTION_LABELS),
  ...POSITIVE_EMOTIONS,
  ...NEGATIVE_EMOTIONS,
  'misery', 'dread', 'disgust', 'annoyance', 'hurt', 'contentment', 'helplessness', 'embarrassment',
  'nervousness', 'laziness', 'discomfort', 'excitement', 'relaxation', 'desperation', 'despair',
  'exhaustion', 'emotionality', 'violence', 'hate', 'contempt', 'pity', 'rage', 'wrath', 'sorrow',
  'grief', 'jealousy', 'envy', 'boredom', 'irritation', 'panic', 'apathy', 'euphoria', 'happiness',
  'unhappiness', 'depression', 'anxiety', 'stress', 'fear', 'anger', 'frustration', 'sadness', 'joy',
  'hope', 'love', 'guilt', 'shame', 'loneliness', 'nostalgia', 'regret', 'surprise', 'trust',
  'vulnerability', 'enthusiasm', 'uncertainty', 'gratitude', 'desire', 'serenity', 'melancholy',
  'relief', 'isolation', 'worry', 'doubt', 'irony', 'bad mood', 'death', 'emotion', 'feelings',
  'feeling', 'emotions', 'fury', 'bitterness', 'suffering', 'discouragement', 'desolation',
  'humiliation', 'self-love', 'self-harm', 'studying', 'weekday', 'pointlessness', 'aimlessness',
  'spacing out', 'impatience', 'stagnation', 'lethargy', 'mental fog', 'negative spiraling',
  'emotional breakdown', 'emotional toll', 'emotional stress', 'emotional spiral',
  'emotionally paralyzed', 'emotionally frozen', 'emotional growth', 'emotional reckoning',
  'emotional guardedness', 'stuck emotionally', 'keeping emotions in check', 'keeping feelings in check',
  'managing anxiety', 'venting frustration', 'snapping from frustration', 'anger at men',
  'anger and frustration', 'frustration with mom', 'guilt and self-blame', 'stress and anxiety',
  'lost love', 'body disgust', 'exam dread', 'dreading monday', 'dreading class with zeno',
  'hormonal health worries', 'fear of living', 'fear of messing up', 'fear of gaining weight',
  'fear of not being thin', 'fear of being unfit', 'fear of change', 'body image dread',
  'health anxiety', 'presentation anxiety', 'graduation anxiety', 'anxiety about losing weight',
  'anxiety about staying thin', 'food-related stress', 'source of anxiety', 'disillusionment',
  'letdown', 'melancholy', 'boredom', 'euforia', 'euphoria', 'apatia', 'apathy', 'infuria',
  'fury', 'disprezzo', 'contempt', 'schifo', 'disgust', 'fastidio', 'annoyance', 'pietà', 'pity'
];
const GENERIC_SINGLE_THEMES = new Set([
  'weight', 'food', 'exam', 'exams', 'family', 'health', 'work', 'sleep', 'music', 'mom', 'gym',
  'life', 'control', 'drive', 'eating', 'leaving', 'appearance', 'project', 'credits', 'discipline',
  'shopping', 'graduation', 'thesis', 'walking', 'worry', 'doubt', 'weekday', 'saturday', 'monday',
  'wednesday', 'tuesday', 'thursday', 'friday', 'sunday', 'studying', 'marketing', 'crush', 'concert',
  'faith', 'abandonment', 'distraction', 'hunger', 'exercise', 'expectations', 'fears', 'graduation',
  'commitment', 'travel', 'home', 'memory', 'freedom', 'independence', 'thesis', 'body', 'energy',
  'party', 'phone', 'people', 'class', 'classes', 'college', 'university', 'day', 'time', 'world'
].map(k => deaccent(k)));
const OUT_OF_PLACE_THEME_RE = /\b(?:death|dying|mort[aeiou]\b|hormon\w*|zeno\b|dreading\b|afraid of|anxious about|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|infelicit|tristezza\b|felicit|emotivit|emozion|emotional(?:ly)?\s+(?:breakdown|toll|stress|spiral|growth|reckoning|guardedness|paralyzed|frozen)|keeping\s+(?:emotions|feelings)\s+in\s+check|managing\s+anxiety|venting\s+frustration|snapping\s+from\s+frustration|anger\s+(?:at|and)|frustration\s+with|guilt\s+and\s+self|stress\s+and\s+anxiety|lost\s+love|body\s+disgust|exam\s+dread|fear\s+of\b|hormonal\s+health|source\s+of\s+anxiety|emotionally?\s+paralyzed|food-related\s+stress|presentation\s+anxiety|graduation\s+anxiety|health\s+anxiety|anxiety\s+about|weight\s+anxiety|social\s+anxiety|\bfears\b|trying to enjoy myself|emozione\s*:|senso\s+di\s+(?:noia|sollievo|tristezza|felicit|euforia|apatia))\b/i;
const EMOTION_THEME_STOP = (() => {
  const stop = new Set();
  const add = (w) => {
    const d = deaccent(String(w || '').toLowerCase().trim());
    if(d) stop.add(d);
  };
  EMOTION_THEME_WORDS.forEach(add);
  EMOTION_IDS.forEach(add);
  Object.values(EMOTION_LABELS).forEach(add);
  EMOTION_IDS.forEach(id => add(IT_WORDS[id]));
  Object.entries(IT_WORDS).forEach(([it, en]) => {
    const key = deaccent(it);
    if(EMOTION_IDS.includes(key) || EMOTION_LABELS[key]) add(it), add(en);
  });
  ['noia','angoscia','depressione','apatia','irritazione','ansietà','emozioni','emozione',
    'emozioni negative','emozione negativa','negative emotions','negative emotion',
    'ottimismo','optimism','pessimismo','pessimism','felicita','felicità','happiness',
    'infelicita','infelicità','unhappiness','euforia','euphoria','depression','apathy',
    'irritation','panic','panico','wrath','ira','emotion','feelings','sentiment','sentimento',
    'morte','death','ormonale','ormoni','hormonal','zeno','paura delle lezioni con zeno',
    'preoccupazioni per la salute ormonale','ansia per la fine del fine settimana',
    'paura del futuro','ansia per il futuro','ansietà per il futuro','paura della morte',
    'paura della vita','paura dell errore','paura dell\'errore','paura di cambiamento',
    'paura di non essere magra','paura di non essere in forma','paura dell obesita',
    'paura dell\'obesità','paura della propria immagine corporea','espressione di frustrazione',
    'odio per gli uomini','stress e ansia','colpa e autocrítica','fonte di ansia',
    'evoluzione emotiva','biliancio emotivo','stress emotivo','paralisi emotiva',
    'paralisi dell animo','paralisi dell\'animo','stagnazione emotiva','amore perduto',
    'frustrazione con la madre','senso di noia','senso di sollievo','dispersione',
    'infelicità','infelicita','tristezza','rabbia','gioia','ansia','paura','stress',
    'solitudine','vergogna','colpa','malinconia','frustrazione','nostalgia','gratitudine'
  ].forEach(add);
  return stop;
})();
function isOutOfPlaceTheme(label){
  const k = deaccent(String(label || '').toLowerCase().trim());
  if(!k) return true;
  if(THEME_LABEL_WHITELIST.has(k)) return false;
  if(BANNED_THEME_LABELS.has(k)) return true;
  if(GENERIC_SINGLE_THEMES.has(k)) return true;
  if(EMOTION_THEME_STOP.has(k)) return true;
  if(OUT_OF_PLACE_THEME_RE.test(k)) return true;
  if(isEmotionTheme(k)) return true;
  const tokens = k.split(/\s+/).filter(Boolean);
  if(tokens.length === 1 && EMOTION_THEME_STOP.has(tokens[0])) return true;
  if(tokens.length > 1 && tokens.every(token => EMOTION_THEME_STOP.has(token))) return true;
  return false;
}
function normTheme(t){ return String(t || '').toLowerCase().trim(); }
const RELIGION_REF_RE = /\b(?:dio|gesu|gesù|jesus|cristo|christ|god|madonna|religione|religion|fede|preghiera|chiesa|sant[oaie]?|ringraziare|ringrazia|porco\w*|amen|paradiso|inferno|diavolo|angelo|angels?|bible|bibbia|messa|vaticano|papa|prete|suora)\b/i;
function isReligionRef(text){
  return RELIGION_REF_RE.test(deaccent(normTheme(text)));
}
const WEEKDAY_THEME_RE = /\b(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const GENERIC_THEME_RE = /\b(?:autostima|self-esteem|insicurezza|insecurity|ironia|irony|crispo|crisp|spesa|spending|thrifting|caffeina|caffeine|spice|male|non|esami|exams|camminata|walk)\b/i;
const THEME_SOURCE_STOP = new Set([
  'giovanna', 'relazione con giovanna', 'accollarsi', 'condizionamento',
  'progresso', 'progressi', 'hobby', 'serata brutta', 'omofobia', 'no', 'crisi alimentare',
  'nessuna annotazione specificata', 'michele parascandolo', 'vott a passa', 'sta semman',
  'gruppi di colombo', "nozione di 'useless' ripetuta", 'joan of arc', 'dehydrated apple slices',
  'cj', 'collare', 'duchessa', 'porco', 'porcodio', 'porcoddio', 'madonna santa',
  'crisi di menopausa', 'ansia di nascita', 'egitto', 'gross', 'ammessa al polimi',
  'intolleranza al lattosio', 'sigarette', 'uff', 'uffa', 'ugh', 'bullismo', 'punti',
  'focalizzarsi sul dottorato', 'ottimismo', 'pessimismo', 'ansia', 'depressione', 'anxiety', 'depression',
  'pensieri suicidi', 'desiderio di morte', 'infedelta', 'infedeltà', 'rabbia contro se stesso',
  'dipendenza alimentare', 'danni emotivi', 'finalmente una lezione', 'ritardo del ciclo', 'ciclo',
  'mestruazioni', 'periodo', 'preciclo', 'problemi con il ciclo', 'preoccupazione per il ciclo',
  'problemi menstruali', 'paura del successo', 'flirt con ogni ragazzo carino che vede', 'abuso di sostanze',
  'noioso', 'motivo per scrivere la tesi', 'era ora', 'paura della morte', 'rabbia, disperazione',
  'sentimento di disperazione e frustrazione',
  'morte', 'death', 'preoccupazioni per la salute ormonale', 'paura delle lezioni con zeno',
  'paura del futuro', 'ansietà per il futuro', 'ansia per la fine del fine settimana',
  'paura della morte', 'paura della vita',
  'paura di cambiamento', 'paura di non essere magra', 'paura di non essere in forma',
  'paura dell obesita', 'paura dell\'obesità', 'paura della propria immagine corporea',
  'espressione di frustrazione', 'odio per gli uomini', 'stress e ansia', 'colpa e autocrítica',
  'fonte di ansia', 'evoluzione emotiva', 'biliancio emotivo', 'stress emotivo', 'paralisi emotiva',
  'paralisi dell animo', 'paralisi dell\'animo', 'stagnazione emotiva', 'amore perduto',
  'frustrazione con la madre', 'senso di noia', 'senso di sollievo', 'infelicità', 'infelicita',
  'tristezza', 'rabbia', 'gioia', 'ansia', 'paura', 'stress', 'solitudine', 'vergogna', 'colpa',
  'malinconia', 'frustrazione', 'nostalgia', 'gratitudine', 'emozione: ansia', 'emozione: euforia',
  'emozione: eccitazione', 'emozione negativa', 'sentimenti di rabbia e frustrazione',
  'infelicità (-4)', 'infelicità (3)', 'tristezza (4)', 'solitudine (3)', 'boredom (2)',
  'dispersione (5)', 'inadeguatezza (4)', 'emotività negative', 'emozioni negative',
  'paure', 'paura della laurea', 'fare cose belle'
].map(k => deaccent(k)));
const BANNED_THEME_LABELS = new Set([
  'taking on', 'giovanna', 'conditioning', 'hobby', 'evening ugly',
  'hobby evening ugly', 'progress', 'giacomo',
  'friendship problematic', 'being tricked', 'arrival of the cousins', 'eating crisis',
  'fighting food urges', 'uso of the phone', 'dynamic with giovanna', 'relationship with giovanna',
  'homophobia', 'no', 'food falling apart',
  'optimism', 'pessimism', 'feeling gross', 'gross', 'points', 'happiness', 'unhappiness',
  'euphoria', 'apathy', 'depression', 'emotion', 'feelings',
  'period crash', 'menopause crisis', 'dreading my birthday', 'birth anxiety',
  'egypt', 'bullying', 'exam prep', 'accepted to polimi', 'ugh', 'cigarettes',
  'lactose intolerance', 'phd stress', 'suicidal thoughts', 'infidelity', 'anger at myself',
  'food dependency', 'dark moods', 'emotional damage', 'joke', 'finally a class', 'late period',
  'fear of succeeding', 'crushes on cute guys', 'substance abuse', 'boring', 'sadness and depression',
  'despair', 'reason to write the thesis', 'about time', 'fear of dying', 'anxiety', 'depression',
  'anxiety and depression', 'not wanting to be alive', 'being cheated on', 'mad at myself',
  "can't stop eating", 'emotional scars', 'a good lecture at last', 'period running late',
  'menstrual cycle', 'on my period', 'that time of month', 'period', "scared i'll actually succeed",
  'flirting with every cute guy', 'using to cope', 'painfully dull', 'thesis to feel useful',
  'high time', 'afraid of dying', 'rage and hopelessness', 'hopelessness and frustration',
  'death', 'hormonal health worries', 'hormonal issues', 'dreading class with zeno', 'exam dread',
  'dreading monday', 'dreading the future', 'misery', 'dread', 'disgust', 'annoyance', 'hurt',
  'contentment', 'helplessness', 'embarrassment', 'nervousness', 'laziness', 'discomfort',
  'excitement', 'relaxation', 'emotionality', 'bad mood', 'emotional breakdown', 'emotional toll',
  'emotional stress', 'emotional spiral', 'emotionally paralyzed', 'emotionally frozen',
  'emotional growth', 'emotional reckoning', 'emotional guardedness', 'stuck emotionally',
  'keeping emotions in check', 'keeping feelings in check', 'managing anxiety', 'venting frustration',
  'snapping from frustration', 'anger at men', 'anger and frustration', 'frustration with mom',
  'guilt and self-blame', 'stress and anxiety', 'lost love', 'body disgust', 'fear of living',
  'fear of messing up', 'fear of gaining weight', 'fear of not being thin', 'fear of being unfit',
  'fear of change', 'body image dread', 'health anxiety', 'presentation anxiety', 'graduation anxiety',
  'anxiety about losing weight', 'anxiety about staying thin', 'food-related stress', 'source of anxiety',
  'weight anxiety', 'social anxiety', 'sadness', 'joy', 'anger', 'frustration', 'anxiety', 'fear',
  'love', 'guilt', 'shame', 'loneliness', 'boredom', 'stress', 'hope', 'trust', 'surprise',
  'melancholy', 'desire', 'gratitude', 'enthusiasm', 'vulnerability', 'uncertainty', 'nostalgia',
  'regret', 'serenity', 'relief', 'isolation', 'misery', 'despair', 'desperation', 'irony',
  'pointlessness', 'aimlessness', 'disillusionment', 'letdown', 'exhaustion', 'violence', 'hate',
  'contempt', 'self-love', 'self-harm', 'studying', 'weekday', 'saturday', 'monday', 'wednesday',
  'tuesday', 'thursday', 'friday', 'sunday', 'happiness', 'unhappiness', 'euphoria', 'apathy',
  'emotion', 'feelings', 'feeling', 'emotions', 'mental fog', 'negative spiraling', 'impatience',
  'stagnation', 'spacing out', 'lethargy', 'discouragement', 'desolation', 'suffering', 'bitterness',
  'fury', 'rage', 'wrath', 'sorrow', 'grief', 'pity', 'panic', 'misery', 'disgust', 'annoyance',
  'trying to enjoy myself', 'dreading graduation', 'fears', 'afraid of change'
]);
function isBannedThemeLabel(label){
  const k = String(label || '').toLowerCase().trim();
  return !k || BANNED_THEME_LABELS.has(k);
}
function isThemeNoise(theme){
  const k = deaccent(normTheme(theme));
  if(THEME_SOURCE_STOP.has(k)) return true;
  return !k || k === ':' || k === 'no' || k.length < 2
    || /^\d{1,2}\s+\w+\s+\d{4}$/.test(k)
    || isReligionRef(k)
    || /\binfelicita\b/.test(k)
    || WEEKDAY_THEME_RE.test(k)
    || GENERIC_THEME_RE.test(k)
    || /[{}\[\]":]/.test(k)
    || k.length > 48;
}
function deaccent(value){
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '');
}
function themeKey(theme){
  return normTheme(theme).replace(/\s*\(\d+\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
function themeDisplayKey(theme){
  return deaccent(themeKey(theme));
}
function dedupeThemes(themes){
  const seen = new Set();
  return themes.filter(theme => {
    const key = themeDisplayKey(theme);
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function isEmotionTheme(theme){
  const k = deaccent(themeKey(theme));
  if(!k) return false;
  if(EMOTION_THEME_STOP.has(k)) return true;
  const tokens = k.split(/\s+/).filter(Boolean);
  if(tokens.length === 1 && EMOTION_THEME_STOP.has(tokens[0])) return true;
  if(tokens.length === 1) return false;
  if(tokens.every(token => EMOTION_THEME_STOP.has(token))) return true;
  if(tokens.length === 2 && EMOTION_THEME_STOP.has(tokens[0])
    && /^(?:negativa?|negativo|negative)$/i.test(tokens[1])) return true;
  const senseTail = k.match(/^(?:senso|sentimento|feeling|sense)\s+(?:di|of|del|della|delle|dei|degli)\s+(.+)$/);
  if(senseTail && EMOTION_THEME_STOP.has(deaccent(senseTail[1].trim()))) return true;
  return false;
}
const NEGATIVE_THEME_RE = /\b(?:inutil\w*|useless\w*|palle|annoyance|fastidio|fastidi\w*|nulla|nothing|repressione|disperazione|despair|senso di colpa|worthless|vuoto|void|morte|death|suicid\w*|odio|hatred|schifo|disgust|depressione|depression|autoostile\w*|auto-ostile\w*|autodisprezzo|self-hatred|crisi emotiva|emotional crisis|infelic\w*|unhappiness|disperazione|desperation|colpa|guilt|vergogna|shame|isolamento|isolation)\b/i;
const POSITIVE_THEME_RE = /\b(?:gioia|joy|felic\w*|happiness|gratitudine|gratitude|speranza|hope|serenit\w*|serenity|entusiasmo|enthusiasm|eccitazione|excitement|amore|love|fiducia|trust|rilassamento|relaxation|giornata positiva|good day|giorno di riposo|rest day)\b/i;
function maxNegativeEmotionScore(entry){
  return Math.max(...NEGATIVE_EMOTIONS.map(id => emotionScore(entry, id)), 0);
}
function isIncongruentTheme(theme, emotion){
  const k = deaccent(themeKey(theme));
  if(!k) return true;
  if(POSITIVE_EMOTIONS.includes(emotion) && NEGATIVE_THEME_RE.test(k)) return true;
  if(NEGATIVE_EMOTIONS.includes(emotion) && POSITIVE_THEME_RE.test(k)) return true;
  return false;
}
const _labelIndexCache = new WeakMap();
function lookupLabel(map, key){
  if(!map || key == null || key === '') return null;
  if(map[key]) return map[key];
  const plain = deaccent(String(key));
  if(map[plain]) return map[plain];
  let idx = _labelIndexCache.get(map);
  if(!idx){
    idx = {};
    for(const [k, v] of Object.entries(map)){
      const dk = deaccent(k);
      if(dk && !idx[dk]) idx[dk] = v;
    }
    _labelIndexCache.set(map, idx);
  }
  return idx[plain] || null;
}
const IT_MARKERS_RE = /[àèéìòù]|(?:^|\s)(del|dello|della|dei|degli|delle|dell|che|non|sono|perché|perche|essere|questo|questa|molto|tutto|niente|ancora|sempre|giorno|senso|sentimento|gestione|difficolt|emozioni|universit|responsabilit|obesit|mercoled|venerd|gioved|marted|luned|domenic|sabato|mancanza|repressione|insicurezza|preoccupazione|relazione|ritorno|tornare|bruciore|isolamento|disturbo|autocontrollo|alimentare|corporeo|familiari|personali|negativi|disperazione|frustrazione|alienazione|disconnessione|suffocamento|adattamento|normalit|motivazione|soddisfazione|organizzazione|partenza|depressione|autostima|angoscia|irritazione|dimenticanza|spesa|laurea|dolore|malinconia|nostalgia|solitudine|ansia|tristezza|rabbia|noia)\b/i;
function looksItalian(text){
  return IT_MARKERS_RE.test(String(text || ''));
}
function lookupEnglishToken(key){
  const k = deaccent(String(key || '').toLowerCase().trim());
  if(!k) return '';
  return lookupLabel(THEME_LABELS, k)
    || lookupLabel(SEMANTIC_TAIL_LABELS, k)
    || lookupLabel(WORD_LABELS, k)
    || lookupLabel(EMOTION_LABELS, k)
    || lookupLabel(IT_WORDS, k)
    || '';
}
function lookupThemeLabel(key){
  const k = deaccent(String(key || '').toLowerCase().trim());
  if(!k) return '';
  return lookupLabel(THEME_LABELS, k)
    || (typeof THEME_SEMANTIC_LABELS !== 'undefined' ? lookupLabel(THEME_SEMANTIC_LABELS, k) : null)
    || lookupLabel(SEMANTIC_TAIL_LABELS, k)
    || '';
}
function isLiteralThemeGarbage(label){
  const k = String(label || '').toLowerCase().trim();
  if(!k) return true;
  if(/\b(dynamic with|arrival of|pairing of|afraid of the|hating the|lesson of story|writing of the|consumption excessive|purchase of a|removal of|increase of|delay of the|riavvio of the|focusing on the|control the|comments of family|war of words with the|love for se|feeling of being)\b/.test(k)) return true;
  if(/\buso of\b/.test(k)) return true;
  if(/\bfriendship (?!strained|college)\w+/.test(k)) return true;
  if(/\b\w+ of the \w+/.test(k) && !/\b(back in|end of the weekend)\b/.test(k)) return true;
  return false;
}
function semanticPart(text, depth = 0){
  if(depth > 5) return '';
  const raw = themeKey(text);
  if(!raw) return '';
  const direct = lookupThemeLabel(raw);
  if(direct) return direct;
  return '';
}
function translateItalianPhrase(text, depth = 0){
  if(depth > 5) return '';
  const raw = themeKey(text);
  if(!raw) return '';
  const direct = lookupThemeLabel(raw);
  if(direct) return direct;
  const part = (s) => semanticPart(s, depth + 1) || '';
  const rules = [
    [/^senso di essere (.+)$/i, m => /ingannat/i.test(m[1]) ? 'feeling betrayed' : `feeling ${part(m[1])}`],
    [/^senso di (.+)$/i, m => part(m[1])],
    [/^sentimento di (.+)$/i, m => part(m[1])],
    [/^senso della (.+)$/i, m => /vita/i.test(m[1]) ? 'purpose in life' : part(m[1])],
    [/^mancanza di (.+)$/i, m => /motivazione/i.test(m[1]) ? 'no drive left' : (part(m[1]) ? `missing ${part(m[1])}` : '')],
    [/^perdita di (.+)$/i, m => {
      if(/controllo/i.test(m[1])) return 'losing control';
      if(/peso/i.test(m[1])) return 'weight loss';
      const s = part(m[1]);
      return s ? `losing ${s}` : '';
    }],
    [/^gestione del(?:la|lo|le|li|gli)?\s+(.+)$/i, m => /tempo/i.test(m[1]) ? 'juggling time' : (part(m[1]) ? `managing ${part(m[1])}` : '')],
    [/^abuso di (.+)$/i, m => /cibo/i.test(m[1]) ? 'bingeing' : (part(m[1]) ? `misusing ${part(m[1])}` : '')],
    [/^paura dell(?:a|')(.+)$/i, m => {
      if(/laurea/i.test(m[1])) return 'thesis pressure';
      if(/morte|futuro|error/i.test(m[1])) return '';
      const s = part(m[1]);
      return s ? `worried about ${s}` : '';
    }],
    [/^paura del(?:la|lo|li|gli)?\s+(.+)$/i, m => {
      if(/morte/i.test(m[1])) return '';
      const s = part(m[1]);
      return s ? `worried about ${s}` : '';
    }],
    [/^paura di (.+)$/i, m => {
      if(/morte|cambiamento|non essere magr|non essere in form|obesit|iniziare|vivere/i.test(m[1])) return '';
      const s = part(m[1]);
      return s ? `worried about ${s}` : '';
    }],
    [/^ansiet[aà] per (?:la|il|lo|l')(.+)$/i, m => {
      if(/vita personale/i.test(m[1])) return 'personal life worries';
      if(/futuro|salute fisica/i.test(m[1])) return '';
      if(/peso/i.test(m[1])) return 'weight worries';
      if(/esame/i.test(m[1])) return 'exam nerves';
      const s = part(m[1]);
      return s ? `worried about ${s}` : '';
    }],
    [/^ansia per (?:la|il|lo|i|gli|le|l')(.+)$/i, m => {
      if(/futuro/i.test(m[1])) return '';
      if(/peso/i.test(m[1])) return 'weight worries';
      if(/esame/i.test(m[1])) return 'exam nerves';
      const s = part(m[1]);
      return s ? `worried about ${s}` : '';
    }],
    [/^ansia di (.+)$/i, m => /controllo/i.test(m[1]) ? 'need for control' : `anxious about ${part(m[1])}`],
    [/^preoccupazione per (?:la|il|lo|l')(.+)$/i, m => `worried about ${part(m[1])}`],
    [/^odio per (?:la|il|lo|l')(.+)$/i, m => /situazione attuale/i.test(m[0]) ? 'hating how things are' : `hating ${part(m[1])}`],
    [/^odio per (.+)$/i, m => /se stess/i.test(m[1]) ? 'self-hatred' : `hating ${part(m[1])}`],
    [/^disgusto per (.+)$/i, m => /se stess/i.test(m[1]) ? 'self-disgust' : `disgusted with ${part(m[1])}`],
    [/^disprezzo per (.+)$/i, m => /se stess/i.test(m[1]) ? 'self-loathing' : `contempt for ${part(m[1])}`],
    [/^nostalgia per (?:la|il|l')(.+)$/i, m => /adolescenza/i.test(m[1]) ? 'missing adolescence' : `nostalgia for ${part(m[1])}`],
    [/^giorno di (.+)$/i, m => /riposo/i.test(m[1]) ? 'rest day' : `${part(m[1])} day`],
    [/^giorno del(?:la)?\s+(.+)$/i, m => `${part(m[1])} day`],
    [/^mal di (.+)$/i, m => /testa/i.test(m[1]) ? 'headache' : `${part(m[1])} ache`],
    [/^senza (.+)$/i, m => {
      if(/scopo/i.test(m[1])) return 'aimlessness';
      if(/speranza/i.test(m[1])) return 'hopelessness';
      const s = part(m[1]);
      return s ? `without ${s}` : '';
    }],
    [/^difficolta di (.+)$/i, m => /adattamento/i.test(m[1]) ? 'struggling to adjust' : (part(m[1]) ? `trouble with ${part(m[1])}` : '')],
    [/^difficoltà di (.+)$/i, m => /adattamento/i.test(m[1]) ? 'struggling to adjust' : (part(m[1]) ? `trouble with ${part(m[1])}` : '')],
    [/^desiderio di (.+)$/i, m => {
      if(/morte/i.test(m[1])) return '';
      if(/cambiamento/i.test(m[1])) return 'wanting change';
      const s = part(m[1]);
      return s ? `wanting ${s}` : '';
    }],
    [/^repressione delle (.+)$/i, m => /emozioni/i.test(m[1]) ? 'bottling things up' : (part(m[1]) ? `suppressing ${part(m[1])}` : '')],
    [/^controllo dell(?:a|')(.+)$/i, m => {
      if(/alimentazione/i.test(m[1])) return 'eating control';
      if(/ansia/i.test(m[1])) return 'managing anxiety';
      return part(m[1]) ? `managing ${part(m[1])}` : '';
    }],
    [/^controllo degli (.+)$/i, m => /impulsi alimentari/i.test(m[1]) ? 'resisting binge urges' : (part(m[1]) ? `managing ${part(m[1])}` : '')],
    [/^controllo del(?:la|lo|li)?\s+(.+)$/i, m => {
      if(/peso/i.test(m[1])) return 'weight obsession';
      if(/dieta/i.test(m[1])) return 'diet rules';
      if(/fame/i.test(m[1])) return 'managing hunger';
      return part(m[1]) ? `managing ${part(m[1])}` : '';
    }],
    [/^arrivo dei (.+)$/i, m => /cugini/i.test(m[1]) ? 'cousins visiting' : `${part(m[1])} arriving`],
    [/^uso del (.+)$/i, m => /telefono/i.test(m[1]) ? 'too much screen time' : `living on ${part(m[1])}`],
    [/^amicizia (.+)$/i, m => {
      if(/problematica/i.test(m[1])) return 'strained friendship';
      if(/universitaria/i.test(m[1])) return 'college friendships';
      return part(m[1]) ? `${part(m[1])} friendship` : 'friendship';
    }],
    [/^ritorno a(?:lla)?\s+(.+)$/i, m => {
      if(/routine/i.test(m[1])) return 'back to routine';
      if(/casa/i.test(m[1])) return 'going home';
      const s = part(m[1]);
      return s ? `back to ${s}` : '';
    }],
    [/^tornare a (.+)$/i, m => /casa/i.test(m[1]) ? 'going home' : `back to ${part(m[1])}`],
    [/^rientro a (.+)$/i, m => /casa/i.test(m[1]) ? 'coming home' : `back to ${part(m[1])}`],
    [/^torna a (.+)$/i, m => /torino/i.test(m[1]) ? 'back in Turin' : `back to ${part(m[1])}`],
    [/^tornata alla (.+)$/i, m => /normalit/i.test(m[1]) ? 'settling back in' : `back to ${part(m[1])}`],
    [/^relazione con (?:la|il|lo|l')?(.+)$/i, m => {
      if(/madre/i.test(m[1])) return 'issues with mom';
      if(/giovanna/i.test(m[1])) return '';
      if(/altri coinquilini/i.test(m[1])) return 'other roommates';
      if(/se stess/i.test(m[1])) return 'relationship with yourself';
      const s = part(m[1]);
      return s ? `dynamic with ${s}` : '';
    }],
    [/^relazioni (.+)$/i, m => /familiari/i.test(m[1]) ? 'family dynamics' : `${part(m[1])} relationships`],
    [/^problemi (.+)$/i, m => /personali/i.test(m[1]) ? 'personal struggles' : `${part(m[1])} problems`],
    [/^pensieri (.+)$/i, m => /negativi/i.test(m[1]) ? 'negative spiraling' : `${part(m[1])} thoughts`],
    [/^emozioni (.+)$/i, m => /negativ/i.test(m[1]) ? 'heavy feelings' : `${part(m[1])} feelings`],
    [/^emozione (.+)$/i, m => /negativ/i.test(m[1]) ? 'bad mood' : `${part(m[1])} mood`],
    [/^disturbo (.+)$/i, m => /alimentare/i.test(m[1]) ? 'eating disorder' : `${part(m[1])} disorder`],
    [/^disturbi (.+)$/i, m => /alimentari/i.test(m[1]) ? 'eating disorders' : `${part(m[1])} disorders`],
    [/^insicurezza (.+)$/i, m => /sociale/i.test(m[1]) ? 'social anxiety' : /futura/i.test(m[1]) ? 'uncertainty about the future' : `${part(m[1])} insecurity`],
    [/^impatto (.+)$/i, m => /emotivo/i.test(m[1]) ? 'emotional toll' : `${part(m[1])} impact`],
    [/^isolamento (.+)$/i, m => /emotivo/i.test(m[1]) ? 'feeling cut off' : `${part(m[1])} isolation`],
    [/^realizzazione (.+)$/i, m => /personale/i.test(m[1]) ? 'finding purpose' : `${part(m[1])} fulfillment`],
    [/^trasformazione (.+)$/i, m => /personale/i.test(m[1]) ? 'trying to change' : `personal ${part(m[1])}`],
    [/^imperfezione (.+)$/i, m => /personale/i.test(m[1]) ? 'feeling flawed' : `personal ${part(m[1])}`],
    [/^presa di (.+)$/i, m => /responsabilit/i.test(m[1]) ? 'stepping up' : `taking on ${part(m[1])}`],
    [/^rifiuto di (.+)$/i, m => /aiuto/i.test(m[1]) ? 'pushing help away' : `refusing ${part(m[1])}`],
    [/^modi di (.+)$/i, m => /vita/i.test(m[1]) ? 'ways of living' : `ways of ${part(m[1])}`],
    [/^fare (.+)$/i, m => /cose belle/i.test(m[1]) ? '' : `doing ${part(m[1])}`],
    [/^mangiare (.+)$/i, m => /troppo/i.test(m[1]) ? 'overeating' : `eating ${part(m[1])}`],
    [/^liti con (?:i|gli|le)?\s*(.+)$/i, m => /coinquilini/i.test(m[1]) ? 'roommate fights' : `fighting with ${part(m[1])}`],
    [/^flirt con (.+)$/i, () => ''],
    [/^spesa (.+)$/i, m => /eccessiva/i.test(m[1]) ? 'overspending' : `${part(m[1])} shopping`],
    [/^aspettative (.+)$/i, m => /non soddisfatte/i.test(m[0]) ? 'things fell short' : `${part(m[1])} expectations`],
    [/^speranza di (.+)$/i, m => /risoluzione del conflitto/i.test(m[1]) ? 'hoping things resolve' : `hoping for ${part(m[1])}`],
    [/^bruciore (.+)$/i, m => /emotivo/i.test(m[1]) ? 'aching inside' : `${part(m[1])} burning`],
    [/^dolori (.+)$/i, m => /generalizzati/i.test(m[1]) ? 'aches all over' : `${part(m[1])} pain`],
    [/^rompimento di (.+)$/i, m => /frustrazione/i.test(m[1]) ? 'snapping from frustration' : `breaking from ${part(m[1])}`],
    [/^crisi (.+)$/i, m => {
      if(/emotiva/i.test(m[1])) return 'emotional breakdown';
      if(/ansia/i.test(m[1])) return 'panic spiral';
      if(/alimentare/i.test(m[1])) return 'food falling apart';
      return `${part(m[1])} crisis`;
    }],
    [/^controllo (.+)$/i, m => {
      if(/alimentare/i.test(m[1])) return 'restrictive eating';
      if(/emotivo/i.test(m[1])) return 'keeping emotions in check';
      if(/personale/i.test(m[1])) return 'self-control';
      return part(m[1]) ? `${part(m[1])} control` : '';
    }],
    [/^autocontrollo (.+)$/i, m => /alimentare/i.test(m[1]) ? 'food discipline' : 'self-control'],
    [/^bassa (.+)$/i, m => /soddisfazione/i.test(m[1]) ? 'underwhelmed' : `low ${part(m[1])}`],
    [/^giornata (.+)$/i, m => /sprecata/i.test(m[1]) ? 'day felt wasted' : `${part(m[1])} day`],
    [/^fine del (.+)$/i, m => /fine settimana/i.test(m[1]) ? 'weekend ending' : `end of ${part(m[1])}`]
  ];
  for(const [re, build] of rules){
    const m = raw.match(re);
    if(!m) continue;
    const out = build(m).replace(/\s+/g, ' ').trim();
    if(out && !looksItalian(out)) return out;
  }
  return '';
}
function translateAllTokens(text, depth = 0){
  const raw = String(text || '').trim();
  if(!raw) return '';
  const phrase = translateItalianPhrase(raw, depth);
  if(phrase) return phrase;
  const tokens = raw.split(/[\s,·\-/()]+/).filter(Boolean);
  if(!tokens.length) return '';
  const out = tokens.map(token => {
    const hit = lookupEnglishToken(token);
    if(hit) return hit;
    const sub = translateItalianPhrase(token, depth + 1);
    if(sub) return sub;
    return looksItalian(token) ? '' : token;
  }).filter(Boolean);
  return out.join(' ');
}
function englishLabelInner(text, depth = 0){
  const raw = String(text || '').trim();
  if(!raw || raw === '—') return raw === '—' ? raw : '';
  const phrase = translateItalianPhrase(raw, depth);
  if(phrase) return phrase;
  const direct = lookupEnglishToken(themeKey(raw));
  if(direct) return direct;
  const tokens = translateAllTokens(raw, depth);
  return tokens && !looksItalian(tokens) ? tokens : '';
}
function englishLabel(text){
  return englishLabelInner(text, 0);
}
function englishThemeLabel(text, depth = 0){
  const raw = String(text || '').trim();
  if(!raw || raw === '—') return '';
  const phrase = translateItalianPhrase(raw, depth);
  if(phrase) return phrase;
  return lookupThemeLabel(themeKey(raw)) || '';
}
function emotionLabel(id){
  return lookupLabel(EMOTION_LABELS, id) || String(id || '').replace(/_/g, ' ');
}
function themeLabel(theme){
  const raw = themeKey(theme);
  if(/\bgiovanna\b/i.test(raw)) return '';
  const preset = lookupThemeLabel(raw);
  if(preset && !isOutOfPlaceTheme(preset) && !isLiteralThemeGarbage(preset)) return preset;
  if(isThemeNoise(theme)) return '';
  if(isEmotionTheme(theme)) return '';
  const out = englishThemeLabel(theme);
  if(!out || looksItalian(out) || isOutOfPlaceTheme(out) || isLiteralThemeGarbage(out)) return '';
  if(/\bgiovanna\b/i.test(out)) return '';
  return out;
}
const BANNED_WORD_LABELS = new Set(['unhappiness', 'world', 'can', 'at least']);
function wordLabel(word){
  const out = englishLabel(word);
  if(!out || looksItalian(out)) return '';
  return BANNED_WORD_LABELS.has(String(out).toLowerCase()) ? '' : out;
}

function emotionCounts(entries){
  const counts = {};
  entries.forEach(e => {
    Object.entries(e.analisi?.emozioni || {}).forEach(([k, v]) => {
      if(v > 0) counts[k] = (counts[k] || 0) + 1;
    });
  });
  return counts;
}
function rankedEmotions(counts, pool){
  return pool.filter(k => counts[k] > 0).sort((a, b) => counts[b] - counts[a]);
}
function deriveTopEmotions(entries){
  const counts = emotionCounts(entries);
  const pos = rankedEmotions(counts, POSITIVE_EMOTIONS);
  const neg = rankedEmotions(counts, NEGATIVE_EMOTIONS);
  const mixed = [];
  const maxSide = Math.max(pos.length, neg.length);
  for(let i = 0; i < maxSide; i++){
    if(i < neg.length) mixed.push(neg[i]);
    if(i < pos.length) mixed.push(pos[i]);
  }
  const used = new Set(mixed);
  const rest = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter(k => !used.has(k));
  return [...mixed, ...rest];
}
const LAYOUT_SLOT_COUNT = 25;
const LAYOUT_EXTRA_EMOTIONS = ['noia'];
function padEmotionsForLayout(emotions){
  const out = [...emotions];
  const used = new Set(out);
  const fillPool = [...LAYOUT_EXTRA_EMOTIONS, ...NEGATIVE_EMOTIONS, ...POSITIVE_EMOTIONS];
  for(const extra of fillPool){
    if(out.length >= LAYOUT_SLOT_COUNT) break;
    if(!used.has(extra)){
      out.push(extra);
      used.add(extra);
    }
  }
  while(out.length < LAYOUT_SLOT_COUNT){
    out.push(emotions[out.length % Math.max(emotions.length, 1)]);
  }
  return out;
}
function layoutEmotionCatalog(entries){
  const derived = entries?.length ? deriveTopEmotions(entries) : [...FALLBACK_TOP_EMOTIONS];
  return padEmotionsForLayout(derived);
}
function syncEmotionCatalog(entries){
  topEmotions = layoutEmotionCatalog(entries);
}
function emotionEntryCount(id){
  return patternData[id]?.countNum || FALLBACK_COUNTS[id] || 40;
}
function blockSizeForCount(count, baseW, baseH, minCount, maxCount, layoutIndex = 0){
  const minScale = 0.56;
  const maxScale = 1.42;
  const t = maxCount <= minCount ? 0.5 : (count - minCount) / (maxCount - minCount);
  const countScale = minScale + Math.pow(t, 0.68) * (maxScale - minScale);
  const layoutJitter = 0.84 + ((layoutIndex * 37) % 13) * 0.03;
  const scale = countScale * layoutJitter;
  return {
    w: Math.round(Math.max(54, Math.min(178, baseW * scale))),
    h: Math.round(Math.max(58, Math.min(204, baseH * scale)))
  };
}
const WORD_STOP = new Set('il lo la i gli le un una uno di a da in con su per che non mi io tu si ma se come più anche questo questa sono era essere ho hai stato stata del della dei delle al nel nella nei nelle al allo alla alle the and can but for you your was were have has had this that with from they them their what when where why how all any out our just not are been being would could should about into over after before than then very much many some such only other another while during through because until unless since though although anche ancora sempre mai già qui lì dove quando perché perchè quindi cioè tipo proprio niente nulla tutto tutta tutti tutte molto poco troppo bene male così cosi cosa cose sto sta stai stiamo state stati fat get got want feel like need know think going gonna dont im ive its thats theres wasnt isnt cant wont myself yourself himself herself itself ourselves themselves hate fucking fuck shit damn day days keep still even really maybe something someone anything everything nothing outdoor indoor body disgusting anymore passi passo don more faccio fare video tag support does not'.split(/\s+/));
const EMOTION_WORD_OVERRIDES = {
  speranza: ['possible', 'life', 'starting', 'good', 'change'],
  tristezza: ['alone', 'emptiness', 'crying', 'memory', 'loss'],
  sollievo: ['return', 'home', 'goodbye', 'pause', 'calm'],
  noia: ['boredom', 'routine', 'nothing', 'waiting', 'empty']
};
const EMOTION_THEME_OVERRIDES = {
  tristezza: ['memory', 'home', 'distance'],
  sollievo: ['autonomy', 'return home', 'pause'],
  stress: ['routine', 'work', 'tiredness'],
  serenita: ['rest', 'calm', 'free day'],
  malinconia: ['memory', 'distance', 'night'],
  desiderio: ['departure', 'future', 'motivation'],
  frustrazione: ['self-criticism', 'disappointment', 'study'],
  speranza: ['motivation', 'change', 'health'],
  rabbia: ['conflict', 'humiliation', 'arguments'],
  gioia: ['freedom', 'health', 'good day'],
  incertezza: ['confusion', 'choices', 'future'],
  entusiasmo: ['new beginnings', 'energy', 'projects'],
  vulnerabilita: ['humiliation', 'exposure', 'fragility'],
  gratitudine: ['reflection', 'support', 'connection'],
  solitudine: ['abandonment', 'home', 'distance'],
  sorpresa: ['unexpected', 'recovery', 'moment'],
  ansia: ['control', 'future', 'body image'],
  paura: ['uncertainty', 'body image', 'change'],
  nostalgia: ['memory', 'past', 'distance'],
  amore: ['relationships', 'family', 'connection'],
  fiducia: ['exams', 'relationships', 'commitment'],
  vergogna: ['humiliation', 'body image', 'exposure'],
  colpa: ['self-blame', 'regret', 'past'],
  rimpianto: ['past', 'loss', 'choices'],
  noia: ['routine', 'emptiness', 'waiting']
};
const FALLBACK_WORDS = {
  tristezza:'alone · emptiness · crying · memory · loss', sollievo:'return · home · goodbye · pause · calm', stress:'study · list · waiting', malinconia:'night · void · distance',
  frustrazione:'again · enough · loop', ansia:'tomorrow · body · waiting', solitudine:'home · room · silence',
  desiderio:'tomorrow · going out · again', speranza:'possible · life · starting · good · change',
  noia:'routine · nothing · waiting · empty'
};
const FALLBACK_THEMES = {
  tristezza:'memory, home, distance', sollievo:'autonomy, return home, pause',
  stress:'routine, work, tiredness', serenita:'rest, calm, free day',
  malinconia:'memory, distance, night', desiderio:'departure, future, motivation',
  frustrazione:'self-criticism, disappointment, study', speranza:'motivation, change, health',
  rabbia:'conflict, humiliation, arguments', gioia:'freedom, health, good day',
  incertezza:'confusion, choices, future', entusiasmo:'new beginnings, energy, projects',
  vulnerabilita:'humiliation, exposure, fragility', gratitudine:'reflection, support, connection',
  solitudine:'abandonment, home, distance', sorpresa:'unexpected, recovery, moment',
  ansia:'control, future, body image', paura:'uncertainty, body image, change',
  nostalgia:'memory, past, distance', amore:'relationships, family, connection',
  fiducia:'exams, relationships, commitment', vergogna:'humiliation, body image, exposure',
  colpa:'self-blame, regret, past', rimpianto:'past, loss, choices',
  noia:'routine, emptiness, waiting'
};
const FALLBACK_COUNTS = {tristezza:240,stress:159,sollievo:180,frustrazione:113,malinconia:128,incertezza:124,desiderio:189,rabbia:110,vulnerabilita:95,solitudine:86,noia:24};

function emotionScore(entry, emotion){
  return entry.analisi?.emozioni?.[emotion] || 0;
}
function emotionMaxScore(entry){
  return Math.max(...Object.values(entry.analisi?.emozioni || {}), 0);
}
function emotionSecondScore(entry){
  const vals = Object.values(entry.analisi?.emozioni || {}).filter(v => v > 0).sort((a, b) => b - a);
  return vals[1] || 0;
}
function dominantEmotions(entry){
  const max = emotionMaxScore(entry);
  return Object.entries(entry.analisi?.emozioni || {})
    .filter(([, v]) => v === max)
    .map(([k]) => k);
}
const ED_ENTRY_PATTERN = /\b(?:fasting|omad|kcal|calories?|mukbang|edtwt|wieiad|binge|purged?|purging|restricting)\b/i;
function isEdNoiseEntry(entry){
  return ED_ENTRY_PATTERN.test(entry.testo_originale || '');
}
function entriesForThemeEmotion(entries, themeId){
  const key = deaccent(themeId);
  return entries.filter(e => (e.analisi?.temi || []).some(t => deaccent(themeKey(t)) === key));
}
function entriesForEmotion(entries, emotion){
  if(LAYOUT_EXTRA_EMOTIONS.includes(emotion)){
    return entriesForThemeEmotion(entries, emotion);
  }
  return entries.filter(e => {
    const score = emotionScore(e, emotion);
    if(score < 3) return false;
    if(score !== emotionMaxScore(e)) return false;
    const tied = dominantEmotions(e);
    if(POSITIVE_EMOTIONS.includes(emotion) && tied.some(t => NEGATIVE_EMOTIONS.includes(t))) return false;
    if(POSITIVE_EMOTIONS.includes(emotion)){
      const maxNeg = maxNegativeEmotionScore(e);
      if(maxNeg > 0 && score - maxNeg < 2) return false;
    }
    return true;
  });
}
function entriesForEmotionWords(entries, emotion){
  return entriesForEmotion(entries, emotion).filter(e => !isEdNoiseEntry(e));
}
function stripAnnotationNoise(text){
  return String(text || '')
    .replace(/\b\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\w*\s+\d{4}\b/gi, ' ')
    .replace(/\b(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)\w*\b/gi, ' ')
    .replace(/\bcamminata\s+outdoor\s+[\d.,]+\s*km(?:\s*[·]?\s*\d{1,2}:\d{2}(?::\d{2})?)?/gi, ' ')
    .replace(/\bcamminata\s+[\d.,]+\s*passi\b/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/does not support the video tag/gi, ' ')
    .replace(/[^a-zàèéìòùáéíóúäöüñç'\s]/gi, ' ');
}
const EXTRA_WORD_STOP = new Set([
  'solo','sola','soli','sole','mia','mio','mie','miei','tua','tuo','tue','tuoi','sua','suo','sue','suoi',
  'nostro','nostra','nostri','nostre','vostro','vostra','vostri','vostre','loro','proprio','propria','propri','proprie',
  'stesso','stessa','stessi','stesse','questo','questa','questi','queste','quello','quella','quelli','quelle',
  'ci','vi','ne','ce','gli','li','le','lo','co','col','colui','colei','coloro','cui','chi','che','c','un','una',
  'devo','devi','deve','devono','dovevo','posso','puoi','può','puo','potrei','voglio','vuoi','vuole','vorrei','volevo',
  'sono','sei','siamo','siete','ero','eri','era','fui','fu','fosse','essi','essa','essi','essere','sto','sta','stai',
  'stare','stato','stata','stati','state','ho','hai','ha','hanno','avevo','aveva','avere','avuto','avuta',
  'fa','fai','faccio','fanno','facevo','fatto','fatta','fatti','fate','fare','fate','dato','data','dati',
  'vado','vai','va','vanno','andare','andato','andata','venire','venuto','venuta','dire','detto','detta',
  'ora','oggi','ieri','domani','poi','quindi','proprio','davvero','veramente','letteralmente','praticamente',
  'he','him','his','she','her','hers','it','its','we','us','our','ours','they','them','theirs','my','mine',
  'who','whom','whose','which','an','as','at','by','do','did','done','does','doing','am','is','be','will',
  'shall','may','might','must','need','got','get','gets','getting','go','goes','went','gone','come','came',
  'see','saw','seen','know','knew','known','think','thought','say','said','tell','told','make','made',
  'take','took','taken','give','gave','given','look','looked','want','wanted','feel','felt','seem','seems',
  'let','put','use','used','find','found','keep','kept','start','stop','try','tried','call','turn','show',
  'move','live','believe','hold','bring','happen','write','sit','stand','lose','pay','meet','include',
  'continue','set','learn','change','lead','watch','follow','create','speak','read','spend','grow',
  'open','walk','win','offer','remember','consider','appear','buy','wait','serve','send','expect','build',
  'stay','fall','cut','reach','pass','sell','require','report','decide','pull','today','tonight','yesterday',
  'tomorrow','time','now','here','there','then','while','back','off','way','fact','guess','thing','things',
  'something','anything','everything','nothing','someone','anyone','everyone','hopefully','actually','basically',
  'literally','really','maybe','perhaps','still','even','already','yet','again','also','too','very','much',
  'lot','lots','kind','sort','type','yeah','yes','no','not','dont','doesnt','didnt','wasnt','isnt','cant',
  'wont','im','ive','youre','theyre','were','shes','hes','thats','theres','heres','whats','lets',
  'spero','spera','sperano','speri','speriamo','prima','gia','cosi','cioe','piu','perche','puo',
  'pero','please','kcal','cal','grams','grammi',
  'eating','fasting','omad','weight','calories','calorie','gross','fat','fats','skinny',
  'restrict','restricting','restriction','binge','purged','purge','purging','mukbang','edtwt','wieiad',
  'burned','passi','steps','weigh','weighed','scale','peso','pesare','mangiare','mangiato','mangiata',
  'smettere','palestra','workout','caloric','ate','eat','eats','eaten','food','foods','hunger','hungry','fast','fasted',
  'thank','god','long','barely','year','alone',
  'slay','dopo','vedo','vedere','vede','sees','after',
  'mondo','world','riesco','infelicita','infelicità','unhappiness',
  'almeno','least'
].map(w => w.normalize('NFD').replace(/\p{M}/gu, '')));
const RELIGION_WORD_STOP = new Set([
  'dio','gesu','gesù','jesus','cristo','christ','god','madonna','religione','religion','fede','faith',
  'preghiera','prayer','chiesa','church','santo','santa','santi','ringraziare','ringrazia','ringraziamento',
  'porco','porcodio','porcoddio','peccato','sin','bibbia','bible','amen','paradiso','inferno','diavolo',
  'angelo','angels','messa','vaticano','papa','prete','suora','slay'
].map(w => w.normalize('NFD').replace(/\p{M}/gu, '')));
const DOMAIN_WORD_STOP = new Set([
  'eating','fasting','omad','kcal','cal','weight','calories','calorie','gross','fat','fats','skinny',
  'restrict','restricting','restriction','binge','purged','purge','purging','mukbang','edtwt','wieiad',
  'burned','passi','km','steps','weigh','weighed','scale','peso','pesare','mangiare','mangiato','mangiata',
  'smettere','palestra','gym','workout','caloric','ate','eat','eats','eaten','food','foods','hunger','hungry','fast','fasted'
].map(w => w.normalize('NFD').replace(/\p{M}/gu, '')));
function normalizeWordToken(w){
  return String(w || '').toLowerCase().replace(/^'+|'+$/g, '')
    .normalize('NFD').replace(/\p{M}/gu, '');
}
function mergeStopSets(...sets){
  const merged = new Set();
  for(const set of sets){
    for(const w of set){
      merged.add(w);
      const n = normalizeWordToken(w);
      if(n) merged.add(n);
    }
  }
  return merged;
}
const ALL_WORD_STOP = mergeStopSets(WORD_STOP, EXTRA_WORD_STOP, DOMAIN_WORD_STOP, RELIGION_WORD_STOP);
function isUsefulWord(w){
  const token = normalizeWordToken(w);
  if(!token || token.length < 3 || token.length > 18 || /\d/.test(token)) return false;
  if(ALL_WORD_STOP.has(token)) return false;
  if(/^(?:gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\w*$/i.test(token)) return false;
  if(/^(?:mio|mia|mie|miei|tuo|tua|tue|tuoi|suo|sua|sue|suoi|nostr|vostr|gliel|colui|colei|coloro)/.test(token)) return false;
  if(/(.)\1{3,}/.test(token)) return false;
  return true;
}
function topWordsForEmotion(entries, emotion, limit = 5){
  const pool = entries.filter(e => !isEdNoiseEntry(e));
  const minDocs = pool.length >= 25 ? 2 : 1;
  const counts = {};
  const docs = {};
  pool.forEach(e => {
    const score = emotionScore(e, emotion);
    const margin = score - emotionSecondScore(e);
    const weight = score + Math.max(0, margin);
    stripAnnotationNoise(e.testo_originale).toLowerCase().split(/\s+/).forEach(raw => {
      const w = normalizeWordToken(raw);
      if(!isUsefulWord(w)) return;
      counts[w] = (counts[w] || 0) + weight;
      docs[w] = (docs[w] || 0) + 1;
    });
  });
  const rank = (min) => Object.entries(counts)
    .filter(([w]) => (docs[w] || 0) >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  let picked = rank(minDocs).slice(0, limit);
  if(picked.length < limit && minDocs > 1) picked = rank(1).slice(0, limit);
  return picked;
}
function topThemesForEmotion(entries, emotion, limit = 3){
  const pool = entries.filter(e => !isEdNoiseEntry(e));
  const counts = new Map();
  pool.forEach(e => {
    const score = emotionScore(e, emotion);
    const margin = score - emotionSecondScore(e);
    const weight = score + Math.max(0, margin);
    (e.analisi?.temi || []).forEach(t => {
      const k = normTheme(t);
      if(!k || k === emotion || isThemeNoise(t) || isEmotionTheme(t) || isIncongruentTheme(t, emotion)) return;
      const label = themeLabel(t);
      if(!label || isOutOfPlaceTheme(label)) return;
      const key = themeDisplayKey(label);
      const prev = counts.get(key);
      counts.set(key, { label, weight: (prev?.weight || 0) + weight });
    });
  });
  return [...counts.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(item => item.label);
}
function formatWordList(words){
  if(!words.length) return '—';
  const line = words.join(' · ');
  if(line.length <= 64) return line;
  const cut = line.slice(0, 64);
  const split = cut.lastIndexOf(' · ');
  return (split > 20 ? cut.slice(0, split) : cut) + '…';
}
function buildEmotionRelated(id, matchMap, catalog){
  const co = {};
  catalog.forEach(other => {
    if(other === id) return;
    let n = 0;
    (matchMap[id] || []).forEach(e => { if((matchMap[other] || []).includes(e)) n++; });
    if(n) co[other] = n;
  });
  return Object.entries(co).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([oid, n]) => ({
    id: oid,
    reason: `co-occurs in ${n} entries`
  }));
}
function buildEmotionData(entries){
  const catalog = layoutEmotionCatalog(entries);
  const matchMap = {};
  catalog.forEach(id => { matchMap[id] = entries ? entriesForEmotion(entries, id) : []; });
  const result = {};
  catalog.forEach(id => {
    const matched = matchMap[id];
    const wordEntries = entries ? entriesForEmotionWords(entries, id) : [];
    const count = entries ? matched.length : (FALLBACK_COUNTS[id] || 40);
    let words = entries
      ? (EMOTION_WORD_OVERRIDES[id] || topWordsForEmotion(wordEntries, id).map(wordLabel).filter(Boolean))
      : [];
    if(entries && !words.length && FALLBACK_WORDS[id]){
      words = FALLBACK_WORDS[id].split(' · ').filter(w => w && w !== '—');
    }
    let themes = entries ? dedupeThemes(topThemesForEmotion(wordEntries, id)) : [];
    if(entries && !themes.length && EMOTION_THEME_OVERRIDES[id]){
      themes = dedupeThemes(EMOTION_THEME_OVERRIDES[id]);
    }
    if(entries && !themes.length && FALLBACK_THEMES[id]){
      themes = dedupeThemes(FALLBACK_THEMES[id].split(', ').filter(t => t && t !== '—'));
    }
    const fallbackWords = (FALLBACK_WORDS[id] || '—').split(' · ').filter(w => w && w !== '—');
    const fallbackThemes = (FALLBACK_THEMES[id] || '—').split(', ').filter(t => t && t !== '—');
    result[id] = {
      label: emotionLabel(id),
      count: `x${count}`,
      countNum: count,
      words: entries ? words : fallbackWords,
      themes: entries ? themes : fallbackThemes,
      meta: `frequent words · ${count} dominant entries`,
      quote: entries ? formatWordList(words) : (FALLBACK_WORDS[id] || '—'),
      related: entries ? buildEmotionRelated(id, matchMap, catalog) : []
    };
  });
  return result;
}
function block(id,cx,y,w,h,slow=1){ return {id,cx,y,w,h,slow}; }
const BASE_LAYOUT = [
  {nx:.0567,ny:.1047,w:140,h:90,imgSet:[0,1,2],slow:.61},
  {nx:.2909,ny:.06,w:118,h:112,imgSet:[3,4,5],slow:1.34},
  {nx:.5418,ny:.0898,w:84,h:158,imgSet:[7,3,13],slow:.52},
  {nx:.8095,ny:.1495,w:106,h:84,imgSet:[10,2,7],slow:1.28},
  {nx:.9433,ny:.2241,w:88,h:140,imgSet:[11,6,1],slow:1.16},
  {nx:.04,ny:.4031,w:142,h:106,imgSet:[2,6,10],slow:.72},
  {nx:.2575,ny:.3434,w:92,h:172,imgSet:[9,10,11],slow:1.37},
  {nx:.5084,ny:.4031,w:98,h:128,imgSet:[15,0,5],slow:.48},
  {nx:.7425,ny:.3732,w:116,h:88,imgSet:[6,7,8],slow:.24},
  {nx:.96,ny:.4776,w:88,h:118,imgSet:[12,13,14],slow:.98},
  {nx:.0902,ny:.6268,w:108,h:94,imgSet:[4,8,12],slow:1.08},
  {nx:.3578,ny:.6715,w:128,h:92,imgSet:[12,5,10],slow:.44},
  {nx:.6422,ny:.6417,w:104,h:110,imgSet:[14,7,2],slow:1.48},
  {nx:.8764,ny:.6864,w:88,h:126,imgSet:[9,0,11],slow:1.06},
  {nx:.9349,ny:.761,w:108,h:98,imgSet:[8,15,3],slow:.78},
  {nx:.2073,ny:.8803,w:96,h:102,imgSet:[1,4,9],slow:1.12},
  {nx:.4916,ny:.94,w:102,h:104,imgSet:[5,11,14],slow:.86},
  {nx:.776,ny:.8953,w:94,h:118,imgSet:[3,8,13],slow:1.22},
  {nx:.0651,ny:.2688,w:110,h:96,imgSet:[0,6,15],slow:.93},
  {nx:.36,ny:.58,w:86,h:134,imgSet:[2,10,4],slow:1.19},
  {nx:.7091,ny:.8654,w:100,h:108,imgSet:[7,12,1],slow:.67},
  {nx:.5251,ny:.5224,w:120,h:88,imgSet:[13,5,8],slow:1.31},
  {nx:.3244,ny:.2539,w:90,h:120,imgSet:[14,3,9],slow:.55},
  {nx:.8429,ny:.3136,w:98,h:100,imgSet:[11,0,7],slow:1.05},
  {nx:.978,ny:.058,w:94,h:96,imgSet:[4,14,8],slow:1.14}
];
topEmotions = padEmotionsForLayout(topEmotions);
let patternData = buildEmotionData(null);
let baseBlocks = [];
const BLOCK_LAYOUT_GAP = -38;
const BLOCK_LAYOUT_GAP_SOFT = -52;
const LAYOUT_EMOTION_OVERRIDES = {
  amore: { nx: 0.36, ny: 0.58 }
};
const MAX_STACK_AT_POINT = 4;
const STACK_RADIUS = 66;
function syncWorldWidth(){
  if(viewH <= 0) return;
  const isMobilePortrait = viewW < 600 && viewH > viewW;
  if(isMobilePortrait){
    // Su mobile non forziamo la larghezza minima desktop (800): la lasciamo
    // libera di seguire l'aspect ratio reale dello schermo, cosi' la mappa
    // riempie lo schermo a una scala piu' grande (box e distanze piu' leggibili).
    worldW = Math.max(280, Math.round((viewW / viewH) * WORLD_H));
    return;
  }
  worldW = Math.max(BASE_WORLD_W, Math.round((viewW / viewH) * WORLD_H));
}
function worldCenterX(){
  return worldW * 0.5;
}
function layoutNormPosition(layout){
  const bounds = blockContainmentBounds();
  const spanX = bounds.right - bounds.left;
  const spanY = bounds.bottom - bounds.top;
  const compress = 0.70;
  const nx = layout.nx;
  const ny = layout.ny;
  return {
    cx: bounds.left + (0.5 + (nx - 0.5) * compress) * spanX,
    y: bounds.top + (0.5 + (ny - 0.5) * compress) * spanY
  };
}
function layoutSeedPosition(layout, emotionId){
  const override = LAYOUT_EMOTION_OVERRIDES[emotionId];
  if(!override) return layoutNormPosition(layout);
  return layoutNormPosition({ ...layout, nx: override.nx, ny: override.ny });
}
function blockPadsOverlap(a, b){
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}
function separateBlocks(blocks, gap = BLOCK_LAYOUT_GAP, iterations = 200){
  for(let iter = 0; iter < iterations; iter++){
    let moved = false;
    for(let i = 0; i < blocks.length; i++){
      for(let j = i + 1; j < blocks.length; j++){
        const a = blocks[i];
        const b = blocks[j];
        const ra = blockWorldBounds(a.cx, a.y, a.w, a.h, gap);
        const rb = blockWorldBounds(b.cx, b.y, b.w, b.h, gap);
        if(!blockPadsOverlap(ra, rb)) continue;
        moved = true;
        const overlapX = Math.min(ra.right - rb.left, rb.right - ra.left);
        const overlapY = Math.min(ra.bottom - rb.top, rb.bottom - ra.top);
        const push = (Math.min(overlapX, overlapY) + 0.4) * 0.38;
        if(overlapX <= overlapY){
          if(a.cx < b.cx){ a.cx -= push; b.cx += push; }
          else { a.cx += push; b.cx -= push; }
        } else if(a.y < b.y){
          a.y -= push; b.y += push;
        } else {
          a.y += push; b.y -= push;
        }
      }
    }
    blocks.forEach(b => {
      const pos = clampBlockPosition(b.cx, b.y, b.w, b.h);
      b.cx = pos.cx;
      b.y = pos.y;
    });
    if(!moved) break;
  }
}
function enforceMaxStack(blocks, limit = MAX_STACK_AT_POINT, radius = STACK_RADIUS, iterations = 140){
  for(let pass = 0; pass < iterations; pass++){
    let moved = false;
    const seen = new Set();
    for(let i = 0; i < blocks.length; i++){
      if(seen.has(i)) continue;
      const clusterIdx = blocks
        .map((b, j) => ({ b, j }))
        .filter(({ b }) => Math.hypot(b.cx - blocks[i].cx, b.y - blocks[i].y) < radius)
        .map(({ j }) => j);
      clusterIdx.forEach(j => seen.add(j));
      if(clusterIdx.length <= limit) continue;
      const sorted = [...clusterIdx].sort((a, b) => a - b);
      for(let k = limit; k < sorted.length; k++){
        const b = blocks[sorted[k]];
        moved = true;
        const towardLeft = b.cx <= worldCenterX();
        const pushX = Math.max(28, worldW * 0.035);
        b.cx += towardLeft ? -pushX : pushX;
        b.y += ((sorted[k] % 3) - 1) * 18;
        const pos = clampBlockPosition(b.cx, b.y, b.w, b.h);
        b.cx = pos.cx;
        b.y = pos.y;
      }
    }
    if(!moved) break;
  }
}
function expandHorizontal(blocks){
  const bounds = blockContainmentBounds();
  const span = bounds.right - bounds.left;
  const sorted = blocks.slice().sort((a, b) => a.cx - b.cx);
  const n = sorted.length;
  if(n <= 1) return;
  const flankInset = span * 0.14;
  sorted.forEach((b, rank) => {
    const edgeTarget = bounds.left + flankInset + (span - flankInset * 2) * (rank / (n - 1));
    b.cx += (edgeTarget - b.cx) * 0.30;
    const centerBias = (b.cx - worldCenterX()) / Math.max(BASE_WORLD_W * 0.5, span * 0.5);
    if(Math.abs(centerBias) < 0.28){
      b.cx += centerBias < 0 ? -span * 0.018 : span * 0.018;
    }
    const pos = clampBlockPosition(b.cx, b.y, b.w, b.h);
    b.cx = pos.cx;
    b.y = pos.y;
  });
}
function blockWorldBounds(cx, y, w, h, pad = 10){
  return {
    left: cx - w - pad,
    right: cx + w + pad,
    top: y - pad,
    bottom: y + w * .96 + h + pad
  };
}
function blockContainmentBounds(){
  const isMobilePortrait = viewW < 600 && viewH > viewW;
  const pad = isMobilePortrait ? 24 : 20;
  return {
    left: pad,
    right: worldW - pad,
    top: pad,
    bottom: WORLD_H - pad
  };
}
function clampBlockPosition(cx, y, w, h){
  const bounds = blockContainmentBounds();
  const fp = blockWorldBounds(cx, y, w, h, 0);
  let nx = cx;
  let ny = y;
  if(fp.left < bounds.left) nx += bounds.left - fp.left;
  if(fp.right > bounds.right) nx += bounds.right - fp.right;
  if(fp.top < bounds.top) ny += bounds.top - fp.top;
  if(fp.bottom > bounds.bottom) ny += bounds.bottom - fp.bottom;
  return { cx: nx, y: ny };
}
function rebuildBaseBlocks(){
  const isMobilePortrait = viewW < 600 && viewH > viewW;
  const sizeScale = isMobilePortrait ? 0.66 : 1;
  const ids = BASE_LAYOUT.map((_, i) => topEmotions[i]);
  const counts = ids.map(emotionEntryCount);
  const minC = Math.min(...counts);
  const maxC = Math.max(...counts);
  baseBlocks = BASE_LAYOUT.map((layout, i) => {
    const id = ids[i];
    const { w, h } = blockSizeForCount(emotionEntryCount(id), layout.w * sizeScale, layout.h * sizeScale, minC, maxC, i);
    const seed = layoutSeedPosition(layout, id);
    const pos = clampBlockPosition(seed.cx, seed.y, w, h);
    return block(id, pos.cx, pos.y, w, h, layout.slow);
  });
  // Su mobile distribuiamo le box con piu' margine cosi' da renderle
  // chiaramente separate (ora che la mappa usa una scala piu' grande,
  // un gap eccessivo non serve piu').
  const gap = isMobilePortrait ? 22 : BLOCK_LAYOUT_GAP;
  const gapSoft = isMobilePortrait ? 6 : BLOCK_LAYOUT_GAP_SOFT;
  const stackLimit = isMobilePortrait ? 3 : MAX_STACK_AT_POINT;
  separateBlocks(baseBlocks, gap, 140);
  enforceMaxStack(baseBlocks, stackLimit);
  expandHorizontal(baseBlocks);
  separateBlocks(baseBlocks, gapSoft, 70);
  enforceMaxStack(baseBlocks, stackLimit);
  blocks = [...baseBlocks];
  syncParallaxDepth();
}
const PARALLAX_SCREEN = 18;
const PARALLAX_EASE = 0.075;
let parallaxMouse = { x: 0, y: 0 };
let parallaxMouseTarget = { x: 0, y: 0 };
let parallaxInfluence = 0;
let parallaxInfluenceTarget = 0;
function parallaxRestPoint(){
  return { x: worldCenterX(), y: WORLD_H * 0.48 };
}
function syncParallaxDepth(){
  if(!blocks.length) return;
  const depths = blocks.map(b => b.y + b.h * 0.55);
  const minD = Math.min(...depths);
  const maxD = Math.max(...depths);
  const span = Math.max(maxD - minD, 1);
  blocks.forEach(b => {
    const t = ((b.y + b.h * 0.55) - minD) / span;
    b.parallaxDepth = 0.12 + t * 0.88;
    b.parallaxAnchor = { x: b.cx, y: b.y + b.w * 0.48 + b.h * 0.42 };
  });
}
function pointerToParallaxWorld(clientX, clientY){
  const r = canvas.getBoundingClientRect();
  parallaxMouseTarget.x = (clientX - r.left - originX) / mapScale;
  parallaxMouseTarget.y = (clientY - r.top - originY) / mapScale;
  parallaxInfluenceTarget = 1;
}
function resetParallaxTarget(){
  const rest = parallaxRestPoint();
  parallaxMouseTarget.x = rest.x;
  parallaxMouseTarget.y = rest.y;
  parallaxInfluenceTarget = 0;
}
function tickParallax(){
  parallaxMouse.x += (parallaxMouseTarget.x - parallaxMouse.x) * PARALLAX_EASE;
  parallaxMouse.y += (parallaxMouseTarget.y - parallaxMouse.y) * PARALLAX_EASE;
  parallaxInfluence += (parallaxInfluenceTarget - parallaxInfluence) * PARALLAX_EASE;
}
function blockParallaxOffset(b){
  if(parallaxInfluence < 0.001) return { dx: 0, dy: 0 };
  
  const depth = b.parallaxDepth ?? 0.5;
  const anchor = b.parallaxAnchor || { x: b.cx, y: b.y + b.w * 0.48 };
  
  // Rendi il calcolo del mouse più sensibile (es. togliendo la divisione per l'intero mondo o riducendola)
  const relX = (parallaxMouse.x - anchor.x) / 300; // Prova con un raggio fisso in pixel
  const relY = (parallaxMouse.y - anchor.y) / 300;
  
  const mix = parallaxInfluence * depth;
  
  // Moltiplica per mapScale (invece di dividere) o lascialo puro se si muove già nello spazio di disegno
  const geo = PARALLAX_SCREEN * mix * mapScale; 
  
  return {
    dx: relX * geo,
    dy: relY * geo
  };
}
let hover = null;
let hoverTarget = null;
let touchHoverLocked = false;      // quello che il mouse vuole
let hoverDebounceTimer = null;
let displayAlphas = {};      // alpha corrente per ogni block, interpolato
let lastPointer = null;
function blockMotion(b, t){
  const i = blocks.indexOf(b);
  const phase = t * .000045 + i * .69;
  const breathe = 1 + Math.sin(phase * 1.08 + i * 0.17) * BLOCK_BREATHE_AMP;
  const hPulse = 1 + Math.cos(phase * 0.94 + i * 0.23) * BLOCK_H_PULSE_AMP;
  const motion = {
    scaleW: breathe,
    scaleH: breathe * hPulse,
    isoTilt: Math.sin(phase * 0.86 + i * 0.31) * BLOCK_ISO_TILT_AMP,
    lift: 0,
    tiltX: 0,
    tiltY: 0,
    shadowBoost: 1
  };
  const active = hover;
  if(active === b){
    motion.lift = -BLOCK_HOVER_LIFT;
    motion.shadowBoost = 1.62;
    if(parallaxInfluence > 0.01){
      const anchor = b.parallaxAnchor || { x: b.cx, y: b.y + b.w * 0.48 };
      const nx = clamp((parallaxMouse.x - anchor.x) / Math.max(worldW * 0.46, 1), -1, 1);
      const ny = clamp((parallaxMouse.y - anchor.y) / Math.max(WORLD_H * 0.46, 1), -1, 1);
      motion.tiltX = nx * BLOCK_HOVER_TILT_X;
      motion.tiltY = ny * BLOCK_HOVER_TILT_Y;
    }
  } else if(active){
    const related = (patternData[active.id]?.related || []).map(r => typeof r === 'string' ? r : r.id);
    if(related.includes(b.id)){
      motion.lift = -BLOCK_RELATED_LIFT;
      motion.shadowBoost = 1.18;
    }
  }
  return motion;
}
function blockPointsAt(b, cx, y, motion = {}){
  const iso = 0.48 + (motion.isoTilt || 0);
  const bw = b.w * (motion.scaleW ?? 1);
  const bh = b.h * (motion.scaleH ?? 1);
  const tx = motion.tiltX || 0;
  const ty = motion.tiltY || 0;
  const lift = motion.lift || 0;
  const cy = y + lift;
  const cx0 = cx + tx * 0.22;
  const topBias = ty * 0.42;
  const N={x:cx0 + tx, y:cy + topBias};
  const E={x:cx0 + bw + tx * 0.55, y:cy + bw * iso + ty * 0.14};
  const S={x:cx0, y:cy + bw * iso * 2};
  const W={x:cx0 - bw + tx * 0.55, y:cy + bw * iso + ty * 0.14};
  const D={x:tx * 0.1, y:bh};
  const bottom=[
    {x:N.x+D.x,y:N.y+D.y},
    {x:E.x+D.x,y:E.y+D.y},
    {x:S.x+D.x,y:S.y+D.y},
    {x:W.x+D.x,y:W.y+D.y},
  ];
  const backLeft=[W,N,{x:N.x+D.x,y:N.y+D.y},{x:W.x+D.x,y:W.y+D.y}];
  const backRight=[N,E,{x:E.x+D.x,y:E.y+D.y},{x:N.x+D.x,y:N.y+D.y}];
  return {N,E,S,W,D,
    top:[N,E,S,W],
    bottom,
    backLeft,
    backRight,
    left:[W,S,{x:S.x+D.x,y:S.y+D.y},{x:W.x+D.x,y:W.y+D.y}],
    right:[E,S,{x:S.x+D.x,y:S.y+D.y},{x:E.x+D.x,y:E.y+D.y}],
    anchor:{x:cx0,y:cy + bw * iso + bh * 0.55},
    linkAnchor:{x:cx0,y:cy + bw * iso * 2 + bh * 0.9},
    label:{x:cx0 - bw * 0.58,y:cy + bw * iso + bh * 0.16},
    motion
  };
}
function blockPointsStatic(b){
  return blockPointsAt(b, b.cx, b.y);
}
function pts(b, t){
  const i = blocks.indexOf(b);
  const phase = t * .000045 + i * .69;
  const ampX = 2 + (i % 6) * 0.85;
  const ampY = 1.45 + (i % 5) * 0.9;
  const sx = Math.sin(phase * (0.82 + (i % 4) * 0.14)) * ampX;
  const sy = Math.cos(phase * (1.08 + (i % 3) * 0.11)) * ampY;
  const motion = blockMotion(b, t);
  const effW = b.w * motion.scaleW;
  const effH = b.h * motion.scaleH;
  const { dx, dy } = blockParallaxOffset(b);
  const clamped = clampBlockPosition(b.cx + sx + dx, b.y + sy + dy, effW, effH);
  return blockPointsAt(b, clamped.cx, clamped.y, motion);
}
function drawBlockShadow(b, p, alpha, motion = {}){
  const boost = motion.shadowBoost ?? 1;
  if(boost <= 1.2) return;
  const foot = p.S;
  const rx = b.w * 0.36 * boost;
  const ry = Math.max(3.5, b.w * 0.1 * boost);
  const ox = (motion.tiltX || 0) * 0.18;
  const oy = (motion.lift || 0) * -0.08 + 2;
  ctx.save();
  ctx.globalAlpha = alpha * (boost > 1.2 ? 0.36 : 0.24);
  const g = ctx.createRadialGradient(foot.x + ox, foot.y + oy, 0, foot.x + ox, foot.y + oy, rx);
  g.addColorStop(0, 'rgba(43,25,40,.42)');
  g.addColorStop(0.55, 'rgba(43,25,40,.14)');
  g.addColorStop(1, 'rgba(43,25,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(foot.x + ox, foot.y + oy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function poly(p){ ctx.beginPath(); ctx.moveTo(p[0].x,p[0].y); for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y); ctx.closePath(); }
function faceMetrics(p){
  const p0 = p[0];
  const p1 = p[1];
  const p3 = p[3];
  const cellW = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), 1);
  const cellH = Math.max(Math.hypot(p3.x - p0.x, p3.y - p0.y), 1);
  return { p0, p1, p3, cellW, cellH };
}
function drawFaceTile(img, x, y, w, h){
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if(!iw || !ih) return;
  ctx.drawImage(img, x, y, w, h);
}
function face(faceImages,p,off,faceKind,alpha=1){
  const images = faceImages?.length ? faceImages : [];
  ctx.save(); poly(p); ctx.clip(); ctx.globalAlpha=alpha;
  if(!images.length){
    ctx.fillStyle = faceKind === 'top' ? 'rgba(43,25,40,.10)' : 'rgba(43,25,40,.07)';
    ctx.fill();
    ctx.restore();
    return;
  }
  const { p0, p1, p3, cellW, cellH } = faceMetrics(p);
  ctx.transform(
    (p1.x - p0.x) / cellW, (p1.y - p0.y) / cellW,
    (p3.x - p0.x) / cellH, (p3.y - p0.y) / cellH,
    p0.x, p0.y
  );
  const step = cellW;
  const tileW = step + FACE_TILE_OVERLAP;
  const tileH = cellH * FACE_TILE_BLEED;
  const tileY = -(tileH - cellH) * 0.5;
  const span = Math.max(step, images.length * step);
  const scroll = ((off % span) + span) % span;
  const idx = Math.floor(scroll / step) % images.length;
  const slide = scroll % step;
  for(let n = -1; n <= 2; n++){
    const image = images[(idx + n + images.length) % images.length];
    const x = -slide + n * step - FACE_TILE_OVERLAP * 0.5;
    drawFaceTile(image, x, tileY, tileW, tileH);
  }
  ctx.restore();
}
function shade(p, color){ ctx.save(); poly(p); ctx.globalCompositeOperation='multiply'; ctx.fillStyle=color; ctx.fill(); ctx.restore(); }
function shadeInteriorWall(p, alpha){
  const top = { x: (p[0].x + p[1].x) * 0.5, y: (p[0].y + p[1].y) * 0.5 };
  const bot = { x: (p[2].x + p[3].x) * 0.5, y: (p[2].y + p[3].y) * 0.5 };
  ctx.save();
  poly(p);
  ctx.clip();
  const g = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y);
  g.addColorStop(0, `rgba(251,247,246,${0.14 * alpha})`);
  g.addColorStop(0.45, `rgba(237,229,232,${0.10 * alpha})`);
  g.addColorStop(1, `rgba(43,25,40,${0.30 * alpha})`);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
function drawInteriorRim(p, alpha){
  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = 'rgba(43,25,40,.34)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(p.W.x, p.W.y);
  ctx.lineTo(p.N.x, p.N.y);
  ctx.lineTo(p.E.x, p.E.y);
  ctx.stroke();
  ctx.restore();
}
function capitalizeLabel(s){
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
function labelLayoutForBlock(b){
  if(b.w < 72) return {title:9.5, count:7.5, words:5.5, lines:1, padY:0};
  if(b.w < 105) return {title:10.5, count:8, words:5.5, lines:1, padY:2};
  if(b.w < 140) return {title:11.5, count:8.5, words:6, lines:2, padY:4};
  return {title:12.5, count:9, words:6.5, lines:2, padY:6};
}
function isoStrokeText(text, x, y, font, fill, stroke='rgba(251,247,246,.94)', lw=3.2, letterSpacing=''){
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.letterSpacing = letterSpacing;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}
function titleFontForFace(title, baseSize, maxWidth, minSize = 7.5){
  let size = baseSize;
  ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
  while(size > minSize && ctx.measureText(title).width > maxWidth){
    size -= 0.45;
    ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
  }
  return size;
}
function wordLinesForFace(text, maxLines, maxLen){
  const clean = String(text || '').trim();
  if(!clean || clean === '—') return [];
  const parts = clean.split(' · ').filter(Boolean);
  const lines = [];
  let line = '';
  parts.forEach(part => {
    const next = line ? `${line} · ${part}` : part;
    if(next.length > maxLen && line){
      lines.push(line);
      line = part;
    } else {
      line = next;
    }
  });
  if(line) lines.push(line);
  if(lines[0] && lines[0].length > maxLen + 6){
    const cut = lines[0].slice(0, maxLen);
    const split = cut.lastIndexOf(' · ');
    lines[0] = `${(split > 12 ? cut.slice(0, split) : cut).trim()}…`;
  }
  return lines.slice(0, maxLines);
}
function drawTopLabel(b, p, alpha, isActive){
  const data = patternData[b.id];
  if(!data || b.w < 58) return;
  const layout = labelLayoutForBlock(b);
  const p0 = p.top[0], p1 = p.top[1], p3 = p.top[3];
  const iw = b.w * 1.85;
  const ih = b.w * 0.9;
  const cx = iw * 0.5;
  const cy = ih * 0.5;
  const title = capitalizeLabel(data.label);
  const count = data.count || '';
  const wordLines = layout.lines > 1 ? wordLinesForFace(data.quote, layout.lines, Math.max(18, Math.floor(b.w * 0.34))) : [];
  const titleSize = titleFontForFace(title, layout.title, iw * 0.76, layout.words * 1.35);
  const wordSize = Math.min(layout.words, titleSize * 0.58);
  const blockH = (wordLines.length ? (wordSize + 3) * wordLines.length : 0) + layout.count + titleSize + 10;
  let y = cy - blockH * 0.5 + titleSize * 0.5 + layout.padY;

  ctx.save();
  poly(p.top);
  ctx.clip();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha * (isActive ? 0.9 : 0.78);
  ctx.fillStyle = 'rgba(251,247,246,.84)';
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.transform(
    (p1.x - p0.x) / iw, (p1.y - p0.y) / iw,
    (p3.x - p0.x) / ih, (p3.y - p0.y) / ih,
    p0.x, p0.y
  );
  isoStrokeText(
    title,
    cx,
    y,
    `900 ${titleSize}px Arial, Helvetica, sans-serif`,
    isActive ? 'rgba(40,23,38,.98)' : 'rgba(40,23,38,.92)',
    'rgba(251,247,246,.95)',
    isActive ? 3.6 : 3
  );
  y += titleSize * 0.58 + layout.count * 0.5;
  isoStrokeText(
    count,
    cx,
    y,
    `700 ${layout.count}px Georgia, "Times New Roman", serif`,
    isActive ? 'rgba(111,98,106,1)' : 'rgba(111,98,106,.9)',
    'rgba(251,247,246,.92)',
    2.8,
    '-0.03em'
  );
  y += layout.count * 0.48 + 5;
  wordLines.forEach((line, i) => {
    isoStrokeText(
      line,
      cx,
      y + i * (wordSize + 3),
      `400 ${wordSize}px Arial, Helvetica, sans-serif`,
      isActive ? 'rgba(111,98,106,.78)' : 'rgba(111,98,106,.62)',
      'rgba(251,247,246,.9)',
      2.2
    );
  });
  if(isActive){
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = 'rgba(43,25,40,.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(iw * 0.12, ih * 0.14, iw * 0.76, ih * 0.72);
  }
  ctx.restore();
}
function pointInPoly(pt, vs){
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 0.000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function hitTest(pt,t){
  if(hover){
    const hp = pts(hover, t);
    if(pointInPoly(pt, hp.bottom) || pointInPoly(pt, hp.backLeft) || pointInPoly(pt, hp.backRight)) return hover;
  }
  const sorted=[...blocks].map((b,i)=>({b,i})).sort((a,b)=> (a.b.y+a.b.h)-(b.b.y+b.b.h));
  for(let k=sorted.length-1;k>=0;k--){
    const b=sorted[k].b, p=pts(b,t);
    if(pointInPoly(pt,p.bottom) || pointInPoly(pt,p.backLeft) || pointInPoly(pt,p.backRight)) return b;
  }
  return null;
}
function drawWorldLinks(active, t){
  const data = patternData[active.id];
  if(!data?.related?.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  data.related.forEach(item => {
    const rid = typeof item === 'string' ? item : item.id;
    const target = currentBlock(rid);
    if(!target) return;
    const a = pts(active, t).linkAnchor;
    const b = pts(target, t).linkAnchor;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const cy = my + Math.min(110, Math.abs(a.x - b.x) * 0.12 + 42);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(mx, cy, mx, cy, b.x, b.y);
    ctx.strokeStyle = 'rgba(43,25,40,.72)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = -t * 0.018;
    ctx.stroke();
    [a, b].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(43,25,40,.82)';
      ctx.fill();
    });
  });
  ctx.restore();
}
let __lastDrawT = 0;
function draw(t){
  if(window.__EMOTION_DETAIL_PAGE__) return;
  if(window.innerWidth < 700){
    if(t - __lastDrawT < 32){ requestAnimationFrame(draw); return; }
    __lastDrawT = t;
  }
  try {
    tickParallax();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0,0,viewW,viewH);
    ctx.fillStyle='rgba(251,247,246,1)'; ctx.fillRect(0,0,viewW,viewH);
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(mapScale, mapScale);
    if(lastPointer && !touchHoverLocked) hover = hitTest(lastPointer,t);
    const activeBlock = hover;
    const relatedIds = activeBlock
      ? (patternData[activeBlock.id]?.related || []).map(r => typeof r === 'string' ? r : r.id)
      : [];
    const sorted=[...blocks].sort((a,b)=> (a.y+a.h)-(b.y+b.h));
    sorted.forEach((b,i)=>{
      const p=pts(b,t);
      const off = t*.055*b.slow + i*35;
      const media = emotionStripMeta(b.id);
      const faceSets = media?.faces || { top: [], left: [], right: [] };
      const isHover = hover === b;
      const isActive = activeBlock === b;
      const isRelated = relatedIds.includes(b.id);
      const alpha = !activeBlock ? .94 : isActive ? 1 : isRelated ? .52 : .18;
      const motion = p.motion || {};
      drawBlockShadow(b, p, alpha, motion);
      face(faceSets.top, p.bottom, off, 'top', alpha);
      face(faceSets.left, p.backLeft, off + 56, 'left', alpha);
      face(faceSets.right, p.backRight, off + 80, 'right', alpha);
      shadeInteriorWall(p.backLeft, alpha);
      shadeInteriorWall(p.backRight, alpha);
      drawInteriorRim(p, alpha);
      if(isActive){
        ctx.save();
        poly(p.bottom);
        ctx.globalCompositeOperation='screen';
        ctx.fillStyle='rgba(255,255,255,.18)';
        ctx.fill();
        ctx.restore();
      }
    });
    if(activeBlock) drawWorldLinks(activeBlock, t);
    ctx.restore();
    positionText();
  } catch(err){
    // Non lasciare mai che un errore in un singolo frame interrompa il loop
    // (causa storica dello schermo nero al ritorno dalla pagina temi su mobile).
    console.error('draw frame error', err);
  }
  requestAnimationFrame(draw);
}
function firstBlock(id){ return blocks.find(b=>b.id===id); }
function currentBlock(id){ return hover && hover.id === id ? hover : firstBlock(id); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function rectsOverlap(a, b, pad = 8){
  return !(a.right + pad < b.left || a.left > b.right + pad || a.bottom + pad < b.top || a.top > b.bottom + pad);
}
function blockScreenRect(b, t, pad = 16, useStatic = false){
  const p = useStatic ? blockPointsStatic(b) : pts(b, t);
  const ptsList = [...p.bottom, ...p.backLeft, ...p.backRight];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  ptsList.forEach(pt => {
    const sx = originX + pt.x * mapScale;
    const sy = originY + pt.y * mapScale;
    left = Math.min(left, sx);
    top = Math.min(top, sy);
    right = Math.max(right, sx);
    bottom = Math.max(bottom, sy);
  });
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}
function allBlockScreenRects(t, skipBlock, useStatic = false){
  return blocks.filter(b => b !== skipBlock).map(b => blockScreenRect(b, t, 16, useStatic));
}
function burstOverlapsAny(rect, obstacles, pad = 10){
  return obstacles.some(o => rectsOverlap(rect, o, pad));
}
function pickWhiteSpacePosition(block, layer, burst, t, useStatic = true){
  const bounds = getCanvasTextBounds();
  const obstacles = allBlockScreenRects(t, block, useStatic);
  const idx = Math.max(0, blocks.indexOf(block));
  const slots = [0.15, 0.27, 0.39, 0.51, 0.63, 0.75, 0.86];
  const baseY = bounds.top + (bounds.bottom - bounds.top) * slots[idx % slots.length];
  const span = bounds.right - bounds.left;
  const preferRight = block.cx < worldW * 0.4;
  const preferLeft = block.cx > worldW * 0.62;
  const xCandidates = preferRight
    ? [bounds.left + span * 0.84, bounds.left + span * 0.76, bounds.right - 36]
    : preferLeft
      ? [bounds.left + span * 0.16, bounds.left + span * 0.24, bounds.left + 36]
      : (idx % 2
        ? [bounds.left + span * 0.84, bounds.left + span * 0.76]
        : [bounds.left + span * 0.16, bounds.left + span * 0.24]);
  const yCandidates = [baseY, baseY - 72, baseY + 72, bounds.top + (bounds.bottom - bounds.top) * 0.2, bounds.top + (bounds.bottom - bounds.top) * 0.82];
  let best = null;
  let bestScore = -Infinity;
  for(const x of xCandidates){
    for(const y of yCandidates){
      layer.style.left = `${x}px`;
      layer.style.top = `${y}px`;
      layer.style.transform = 'translate(-50%,0)';
      layoutExplodeBurst(burst);
      const r = burstContentRect(burst);
      if(r.left < bounds.left || r.right > bounds.right || r.top < bounds.top || r.bottom > bounds.bottom) continue;
      if(burstOverlapsAny(r, obstacles)) continue;
      const boxRect = blockScreenRect(block, t, 8, useStatic);
      const boxCx = (boxRect.left + boxRect.right) * 0.5;
      const textCx = (r.left + r.right) * 0.5;
      const separation = Math.abs(textCx - boxCx);
      const edgeBonus = preferRight ? (bounds.right - r.right) : preferLeft ? (r.left - bounds.left) : Math.min(r.left - bounds.left, bounds.right - r.right);
      const score = separation + edgeBonus * 0.35 - Math.abs(((r.top + r.bottom) * 0.5) - y) * 0.08;
      if(score > bestScore){
        bestScore = score;
        best = { x, y };
      }
    }
  }
  if(best) return best;
  const boxRect = blockScreenRect(block, t, 8, useStatic);
  const boxCx = (boxRect.left + boxRect.right) * 0.5;
  const canvasCx = (bounds.left + bounds.right) * 0.5;
  return {
    x: boxCx < canvasCx ? bounds.left + span * 0.84 : bounds.left + span * 0.16,
    y: clamp(baseY, bounds.top + 8, bounds.bottom - 120)
  };
}
function nudgeAwayFromBlocks(layer, burst, obstacles, bounds){
  if(!obstacles.length) return;
  for(let i = 0; i < 18; i++){
    layoutExplodeBurst(burst);
    const r = burstContentRect(burst);
    let dx = 0;
    let dy = 0;
    obstacles.forEach(o => {
      if(!rectsOverlap(r, o, 12)) return;
      const pushL = r.right - o.left + 14;
      const pushR = o.right - r.left + 14;
      const pushT = r.bottom - o.top + 14;
      const pushB = o.bottom - r.top + 14;
      if(Math.min(pushL, pushR) < Math.min(pushT, pushB)){
        dx += pushL < pushR ? -pushL : pushR;
      } else {
        dy += pushT < pushB ? -pushT : pushB;
      }
    });
    if(!dx && !dy) break;
    let x = (parseFloat(layer.style.left) || 0) + dx;
    let y = (parseFloat(layer.style.top) || 0) + dy;
    layer.style.left = `${x}px`;
    layer.style.top = `${y}px`;
    layoutExplodeBurst(burst);
    const r2 = burstContentRect(burst);
    if(r2.left < bounds.left) x += bounds.left - r2.left;
    if(r2.right > bounds.right) x += bounds.right - r2.right;
    if(r2.top < bounds.top) y += bounds.top - r2.top;
    if(r2.bottom > bounds.bottom) y += bounds.bottom - r2.bottom;
    layer.style.left = `${x}px`;
    layer.style.top = `${y}px`;
  }
}
function getCanvasTextBounds(){
  const margin = 16;
  const canvasRect = canvas.getBoundingClientRect();
  const bottom = canvasRect.bottom - margin;
  return {
    left: canvasRect.left + margin,
    top: canvasRect.top + margin,
    right: canvasRect.right - margin,
    bottom
  };
}
function burstContentRect(burst){
  const els = burst.querySelectorAll('.ex-bg-num, .ex-title, .ex-count, .ex-word, .ex-theme, .ex-meta');
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let found = false;
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    if(r.width <= 0 && r.height <= 0) return;
    found = true;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  });
  return found ? { left, top, right, bottom } : burst.getBoundingClientRect();
}
function contentShiftForBounds(layer, burst, bounds){
  const r = burstContentRect(burst);
  let dx = 0;
  let dy = 0;
  if(r.left < bounds.left) dx = bounds.left - r.left;
  else if(r.right > bounds.right) dx = bounds.right - r.right;
  if(r.top < bounds.top) dy = bounds.top - r.top;
  else if(r.bottom > bounds.bottom) dy = bounds.bottom - r.bottom;
  return { dx, dy, fits: !dx && !dy, rect: r };
}
function localRect(el, container){
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return {
    left: er.left - cr.left,
    top: er.top - cr.top,
    right: er.right - cr.left,
    bottom: er.bottom - cr.top
  };
}
function syncBurstTypeScale(burst){
  const title = burst.querySelector('.ex-title');
  if(!title) return;
  const titleSize = parseFloat(getComputedStyle(title).fontSize) || 48;
  burst.style.setProperty('--ex-title', `${titleSize}px`);
  burst.querySelectorAll('.ex-word').forEach(el => { el.style.fontSize = ''; });
}
function headTextMaxWidth(burst){
  const head = burst.querySelector('.ex-head');
  const bgNum = burst.querySelector('.ex-bg-num');
  if(!head) return Math.max(120, burst.clientWidth - 16);
  const headGap = parseFloat(getComputedStyle(head).gap) || 8;
  const numW = bgNum ? bgNum.getBoundingClientRect().width : 0;
  return Math.max(120, burst.clientWidth - numW - headGap - 12);
}
function fitBurstTitle(burst){
  const title = burst.querySelector('.ex-title');
  if(!title) return;
  title.style.fontSize = '';
  const maxW = headTextMaxWidth(burst);
  let size = parseFloat(getComputedStyle(title).fontSize);
  const minTitle = 26;
  for(let i = 0; i < 48 && title.scrollWidth > maxW && size > minTitle; i++){
    size -= 1;
    title.style.fontSize = `${size}px`;
  }
  syncBurstTypeScale(burst);
}
function layoutExplodeBurst(burst){
  const title = burst.querySelector('.ex-title');
  const headText = burst.querySelector('.ex-head-text');
  if(title){
    title.style.paddingLeft = '';
    title.classList.toggle('has-descenders', hasTextDescenders(title.textContent));
  }
  if(headText) headText.style.marginLeft = '';
  fitBurstTitle(burst);
  syncBurstTypeScale(burst);
  burst.querySelectorAll('.ex-word').forEach(el => {
    el.classList.toggle('has-descenders', hasTextDescenders(el.textContent));
  });
}
function enforceTitleClearance(layer, burst){
  if(!burst) return;
  const minTop = getCanvasTextBounds().top;
  let y = parseFloat(layer.style.top) || 0;
  for(let i = 0; i < 24; i++){
    let overflow = 0;
    burst.querySelectorAll('.ex-word, .ex-theme, .ex-meta, .ex-count, .ex-title, .ex-bg-num').forEach(el => {
      const top = el.getBoundingClientRect().top;
      if(top < minTop) overflow = Math.max(overflow, minTop - top);
    });
    if(overflow <= 0.5) break;
    y += overflow;
    layer.style.top = `${y}px`;
  }
}
function nudgeLayerIntoBounds(layer, burst, bounds, x, y){
  for(let pass = 0; pass < 20; pass++){
    layoutExplodeBurst(burst);
    const { dx, dy, fits } = contentShiftForBounds(layer, burst, bounds);
    if(fits) return { x, y, fits: true };
    x += dx;
    y += dy;
    layer.style.left = `${x}px`;
    layer.style.top = `${y}px`;
  }
  return { x, y, fits: contentShiftForBounds(layer, burst, bounds).fits };
}
function fitExplodeToCanvas(layer, x, y, t = 0, activeBlock = null, useStatic = true){
  const bounds = getCanvasTextBounds();
  const burst = layer.querySelector('.ex-burst');
  if(!burst) return { x, y };
  const obstacles = activeBlock ? allBlockScreenRects(t, activeBlock, useStatic) : [];

  const availW = bounds.right - bounds.left;
  const availH = bounds.bottom - bounds.top;
  burst.style.maxWidth = `${Math.floor(availW)}px`;
  burst.style.boxSizing = 'border-box';

  let scale = parseFloat((burst.style.transform.match(/scale\(([\d.]+)\)/) || [])[1]) || 1;
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  layer.style.transform = 'translate(-50%,0)';

  for(let attempt = 0; attempt < 36; attempt++){
    layoutExplodeBurst(burst);
    let placed = nudgeLayerIntoBounds(layer, burst, bounds, x, y);
    x = placed.x;
    y = placed.y;
    enforceTitleClearance(layer, burst);
    placed = nudgeLayerIntoBounds(layer, burst, bounds, x, y);
    x = placed.x;
    y = placed.y;
    if(placed.fits) break;

    const r = burstContentRect(burst);
    const shrink = Math.min(availW / Math.max(r.width, 1), availH / Math.max(r.height, 1), 0.92);
    if(shrink >= 0.998 && scale <= 0.38) break;
    scale = Math.max(0.38, scale * shrink);
    burst.style.transform = `scale(${scale.toFixed(3)})`;
  }

  nudgeAwayFromBlocks(layer, burst, obstacles, bounds);
  x = parseFloat(layer.style.left) || x;
  y = parseFloat(layer.style.top) || y;
  nudgeLayerIntoBounds(layer, burst, bounds, x, y);
  enforceTitleClearance(layer, burst);
  x = parseFloat(layer.style.left) || x;
  y = parseFloat(layer.style.top) || y;
  nudgeLayerIntoBounds(layer, burst, bounds, x, y);
  return { x, y };
}
function boxTopCenter(p){
  return {
    x: (p.N.x + p.E.x + p.S.x + p.W.x) / 4,
    y: (p.N.y + p.E.y + p.S.y + p.W.y) / 4
  };
}
function renderExplodedBurst(data, block, mapScale){
  const words = data.words?.length ? data.words : ['—'];
  const count = data.countNum || Number(String(data.count || '').replace('x', '')) || 0;
  const maxScale = clamp(Math.min(viewW, viewH) / 480, 0.82, 1.65);
  const scale = clamp(block.w * mapScale / 72, 0.85, maxScale);
  const wordHtml = words.slice(0, 5).map((word, i) => {
    const tier = Math.min(i, 4);
    return `<span class="ex-word ex-word--${tier}">${word}</span>`;
  }).join('');
  return `
    <div class="ex-burst" style="transform:scale(${scale.toFixed(3)})">
      <div class="ex-head">
        <div class="ex-bg-num">${count}</div>
        <div class="ex-head-text">
          <h2 class="ex-title">${data.label}</h2>
        </div>
      </div>
      <div class="ex-words">${wordHtml}</div>
    </div>
  `;
}
function explodeLayoutKey(active){
  const maxScale = clamp(Math.min(viewW, viewH) / 480, 0.82, 1.65);
  const scale = clamp(active.w * mapScale / 72, 0.85, maxScale);
  return `${active.id}|${Math.round(scale * 1000)}|${Math.round(mapScale * 1000)}|${viewW}|${viewH}`;
}
function navigateToEmotion(emotionId){
  window.location.href = `emotion.html?e=${encodeURIComponent(emotionId)}`;
}
function positionText(){
  const active = hover;
  if(!active){
    if(explodeLayout.key !== null){
      explodeLayout.key = null;
      explodeLayer.classList.remove('active');
      explodeLayer.innerHTML = '';
    }
    return;
  }
  const data = patternData[active.id];
  if(!data) return;
  const layoutKey = explodeLayoutKey(active);
  if(explodeLayout.key === layoutKey) return;
  explodeLayout.key = layoutKey;
  explodeLayer.innerHTML = renderExplodedBurst(data, active, mapScale);
  const burst = explodeLayer.querySelector('.ex-burst');
  if(burst){
    const anchor = pickWhiteSpacePosition(active, explodeLayer, burst, 0, true);
    fitExplodeToCanvas(explodeLayer, anchor.x, anchor.y, 0, active, true);
  }
  explodeLayer.classList.add('active');
}
function updatePointerFromClient(clientX, clientY){
  const r = canvas.getBoundingClientRect();
  lastPointer = { x: (clientX - r.left - originX) / mapScale, y: (clientY - r.top - originY) / mapScale };
  pointerToParallaxWorld(clientX, clientY);
}
if(canvas){
  canvas.addEventListener('mousemove', e=>{
    updatePointerFromClient(e.clientX, e.clientY); // parallasse: immediata

    // hover sulle box: debounced
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = setTimeout(() => {
      hover = lastPointer ? hitTest(lastPointer, performance.now()) : null;
    }, 160);
  });
  canvas.addEventListener('mouseleave', ()=>{
    lastPointer = null;
    hover = null;
    resetParallaxTarget();
  });
  canvas.addEventListener('touchmove', e=>{
    if(!e.touches.length) return;
    e.preventDefault();
    updatePointerFromClient(e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:false});
  canvas.addEventListener('touchend', e=>{
    if(e.touches.length) return;
    resetParallaxTarget();
  });
  canvas.addEventListener('click', e=>{
    const r=canvas.getBoundingClientRect();
    const pt={x:(e.clientX-r.left-originX)/mapScale, y:(e.clientY-r.top-originY)/mapScale};
    lastPointer=pt;
    const hit = hitTest(pt, performance.now());
    if(hit) navigateToEmotion(hit.id);
  });
  let lastTapBlock = null;
  let lastTapTime = 0;
  canvas.addEventListener('touchstart', e=>{
    if(!e.touches.length) return;
    e.preventDefault();
    const t0=e.touches[0];
    updatePointerFromClient(t0.clientX, t0.clientY);
    const hit = hitTest(lastPointer, performance.now());
    const now = Date.now();
    if(hit){
      if(hit === lastTapBlock && now - lastTapTime < 400){
        // doppio tap: naviga
        touchHoverLocked = false;
        lastTapBlock = null;
        lastTapTime = 0;
        navigateToEmotion(hit.id);
      } else {
        // singolo tap: mostra preview, blocca draw() dal resettare hover
        hover = hit;
        touchHoverLocked = true;
        lastTapBlock = hit;
        lastTapTime = now;
      }
    } else {
      // tap su vuoto: resetta
      hover = null;
      touchHoverLocked = false;
      lastPointer = null;
      lastTapBlock = null;
      lastTapTime = 0;
    }
  }, {passive:false});
}
  
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){ hover=null; lastPointer=null; resetParallaxTarget(); }
});

function resizeCanvas(){
  const stage = document.querySelector('.stage');
  const stageRect = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  viewW = Math.max(1, Math.round(stageRect.width));
  viewH = Math.max(1, Math.round(stageRect.height));
  if(canvas){
    canvas.width = viewW;
    canvas.height = viewH;
  }
  if(links){
    links.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
    links.setAttribute('width', viewW);
    links.setAttribute('height', viewH);
  }
  syncWorldWidth();
  explodeLayout.key = null;
  mapScale = Math.min(viewW / worldW, viewH / WORLD_H);
  originX = (viewW - worldW * mapScale) / 2;
  originY = (viewH - WORLD_H * mapScale) / 2;
  rebuildBaseBlocks();
  const rest = parallaxRestPoint();
  parallaxMouse.x = rest.x;
  parallaxMouse.y = rest.y;
  parallaxMouseTarget.x = rest.x;
  parallaxMouseTarget.y = rest.y;
  parallaxInfluence = 0;
  parallaxInfluenceTarget = 0;
}

let mainExperienceStarted = false;
function startMainExperience(){
  if(mainExperienceStarted) return;
  mainExperienceStarted = true;
  window.addEventListener('resize', resizeCanvas);
  if(stageEl && typeof ResizeObserver !== 'undefined'){
    new ResizeObserver(resizeCanvas).observe(stageEl);
  }
  try { resizeCanvas(); } catch(err){ console.error('resizeCanvas error', err); }
  requestAnimationFrame(draw);
  initGuide();
  // Su mobile, tornando dalla pagina dei temi (back button / bfcache) il
  // canvas puo' restare nero: forziamo un resize/redraw quando la pagina
  // torna visibile.
  const isMobile = () => window.innerWidth < 700;
  const recoverCanvas = () => {
    if(!mainExperienceStarted || !isMobile()) return;
    resizeCanvas();
  };
  window.addEventListener('pageshow', e => {
    if(e.persisted) recoverCanvas();
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') recoverCanvas();
  });
}

function shouldSkipLanding(){
  try{
    if(sessionStorage.getItem('diary.archive.map.entered') === '1') return true;
  }catch(_){}
  const params = new URLSearchParams(window.location.search);
  if(params.has('map')) return true;
  return window.location.hash === '#map';
}

const LANDING_UNITS = [
  { word: 'everything', slots: 3, wordFirst: true },
  { word: 'i', slots: 2, wordFirst: false },
  { word: "can't", slots: 2, wordFirst: false },
  { word: 'say', slots: 2, wordFirst: false },
  { word: 'aloud', slots: 3, wordFirst: true }
];
const LANDING_FALLBACK_IMAGES = [
  'box_emozioni/Amore/2024-02-17_40CF126E-0917-4553-928C-21FB74A00438.webp',
  'box_emozioni/Amore/2024-02-28_1D28872E-69D0-49C2-9879-5090370FFB2A.webp',
  'box_emozioni/Amore/2024-02-28_2479BEF8-291C-4268-BADD-174285EEE9B7.webp',
  'box_emozioni/Amore/2024-03-07_188D4B05-536D-402D-9FD8-964F2F59A19F.webp',
  'box_emozioni/Amore/2024-08-26_4C37321D-C6DA-46C7-A727-8C81CFB2BCD3.webp',
  'box_emozioni/Amore/2024-08-26_549D177D-8A53-40B4-8717-C416CAA04C3E.webp',
  'box_emozioni/Amore/2024-09-15_CB07ABE3-5BA0-4565-8295-68993BC42A99.webp',
  'box_emozioni/Amore/2024-11-21_C936C180-A99B-417B-89B4-9E82D54315B2.webp',
  'box_emozioni/Amore/2025-03-14_9ED7C464-7B1A-4D44-BB1A-F4D7EC1F3A2A.webp',
  'box_emozioni/Amore/2025-04-04_F030B08F-2E0C-402F-AAE1-A1078C82B362.webp',
  'box_emozioni/Amore/2025-10-09_D6F2BA27-9EE7-436D-98D4-4F9FA4377FF7.webp',
  'box_emozioni/Amore/2025-12-23_1A3955FD-D52A-4B6A-A3B4-63E5A92922FE.webp',
  'box_emozioni/Amore/2025-12-29_2BE5796C-9978-400C-B5D3-345E690BEB0F.webp',
  'box_emozioni/Amore/2025-12-29_549BBA9E-974C-4044-9668-49CB2DEA9E2C.webp',
  'box_emozioni/Amore/2025-12-30_4CF7E8E1-7059-480A-9DEB-0C600C5D8907.webp',
  'box_emozioni/Amore/2025-12-30_55285026-EFA1-4506-BD7B-3BE92FD9B6BE.webp',
  'box_emozioni/Amore/2025-12-30_93EB2231-8454-4C5E-A442-082B0752E8DD.webp',
  'box_emozioni/Amore/2026-03-20_71FB6CA4-AF2A-489F-B3CA-C3CFE39BA6E6.webp',
  'box_emozioni/Amore/2026-03-20_92945F18-6993-4AFA-AF14-F764A316BE00.webp',
  'box_emozioni/Amore/2026-03-23_4629AD2F-0160-45D9-8665-399B8602B565.webp',
  'box_emozioni/Ansia/2024-05-28_39BD31B8-248E-4778-8687-273B78359FC6.webp',
  'box_emozioni/Ansia/2024-09-14_A0A8A516-E8BC-4943-A2DB-68CD46C317E4.webp',
  'box_emozioni/Ansia/2024-09-14_B1F3C022-8DFF-4584-B658-C6692CCF874F.webp',
  'box_emozioni/Ansia/2024-09-18_09F1EACE-80B6-4AE3-B01D-1264E58E6EB4.webp',
  'box_emozioni/Ansia/2024-09-18_0EF43A83-0303-4611-8D70-B3B384438681.webp',
  'box_emozioni/Ansia/2024-09-18_7C942C65-1131-401E-B8DA-2624762BD35B.webp',
  'box_emozioni/Ansia/2024-09-18_F4400609-575A-4C49-8B83-BEC5E2CCB58B.webp',
  'box_emozioni/Ansia/2024-11-27_CBD79A9D-7297-412F-A561-C2A87A1232B6.webp',
  'box_emozioni/Ansia/2024-12-16_7FDCF547-8063-4E04-A155-1E224AFC16C6.webp',
  'box_emozioni/Ansia/2024-12-28_71FED2AF-9A28-48EE-B050-1D5C7E9F9EA9.webp',
  'box_emozioni/Ansia/2024-12-28_B7B55896-BE61-42BF-BB2B-A1830B2A4D0C.webp',
  'box_emozioni/Ansia/2024-12-28_E1A0BB0A-9994-450A-8497-F5D28D1B8494.webp'
];

function shuffleList(list){
  const out = [...list];
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function landingImagePool(limit = 5){
  await emotionManifestPromise;
  let all = emotionManifest ? Object.values(emotionManifest).flat().filter(Boolean) : [];
  if(!all.length){
    try {
      const res = await fetch('emotion-images.json');
      if(res.ok){
        const manifest = await res.json();
        emotionManifest = manifest;
        all = Object.values(manifest).flat().filter(Boolean);
      }
    } catch { /* file:// or offline */ }
  }
  if(!all.length) all = [...LANDING_FALLBACK_IMAGES];
  const shuffled = shuffleList(all);
  const picked = [];
  const seen = new Set();
  for(const src of shuffled){
    if(seen.has(src)) continue;
    seen.add(src);
    picked.push(src);
    if(picked.length >= limit) break;
  }
  return picked;
}

function landingRevealDelay(){
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 480;
}

async function revealLandingPhotos(slots, sources){
  if(!slots.length) return;
  const delay = landingRevealDelay();
  const pool = sources.length ? sources : shuffleList([...LANDING_FALLBACK_IMAGES]);
  for(let i = 0; i < slots.length; i++){
    const slot = slots[i];
    const src = pool[i % pool.length];
    slot.replaceChildren();
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = src;
    slot.appendChild(img);
    await new Promise(resolve => {
      let done = false;
      const finish = () => {
        if(done) return;
        done = true;
        slot.classList.add('is-visible');
        resolve();
      };
      if(img.complete && img.naturalWidth) finish();
      else {
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        setTimeout(finish, 12000);
      }
    });
    if(delay && i < slots.length - 1) await new Promise(r => setTimeout(r, delay));
  }
}

async function initLandingCollage(){
  if(typeof window.bootLandingPhotos === 'function'){
    return window.bootLandingPhotos();
  }
  const cloud = document.getElementById('landingCloud');
  const slots = cloud?.querySelectorAll('.landing-slot');
  if(!slots?.length) return;
  const slotList = [...slots];
  const sources = await landingImagePool(slotList.length);
  await revealLandingPhotos(slotList, sources);
}

function appendLandingUnit(parent, item, slots){
  const unit = document.createElement('span');
  unit.className = `landing-unit${item.wordFirst ? ' landing-unit--word-first' : ''}`;
  const open = document.createElement('span');
  open.className = 'landing-paren landing-paren--open';
  open.textContent = '(';
  unit.appendChild(open);
  const slotWrap = document.createElement('span');
  slotWrap.className = 'landing-slots';
  const slotCount = Math.max(1, item.slots || 1);
  for(let i = 0; i < slotCount; i++){
    const slot = document.createElement('div');
    slot.className = 'landing-slot';
    slotWrap.appendChild(slot);
    slots.push(slot);
  }
  const word = document.createElement('span');
  word.className = 'landing-word';
  if(hasTextDescenders(item.word)) word.classList.add('has-descenders');
  word.textContent = item.word;
  if(item.wordFirst){
    unit.appendChild(word);
    unit.appendChild(slotWrap);
  } else {
    unit.appendChild(slotWrap);
    unit.appendChild(word);
  }
  const close = document.createElement('span');
  close.className = 'landing-paren landing-paren--close';
  close.textContent = ')';
  unit.appendChild(close);
  parent.appendChild(unit);
}

function buildLandingCollage(cloud){
  if(!cloud) return [];
  cloud.innerHTML = '';
  const slots = [];
  const phrase = document.createElement('div');
  phrase.className = 'landing-phrase';
  LANDING_UNITS.forEach(item => appendLandingUnit(phrase, item, slots));
  cloud.appendChild(phrase);
  return slots;
}

function dismissLanding(){
  const landing = document.getElementById('landing');
  const poster = document.getElementById('poster');
  document.body.classList.remove('landing-active');
  if(landing){
    landing.classList.add('is-dismissed');
    landing.setAttribute('aria-hidden', 'true');
    landing.style.display = 'none';
  }
  poster?.removeAttribute('aria-hidden');
  try{ sessionStorage.setItem('diary.archive.map.entered', '1'); }catch(_){}
}

async function bootMapExperience(){
  // rimuovi ?landing dall'URL senza ricaricare la pagina
  if(new URLSearchParams(window.location.search).has('landing')){
    const clean = window.location.pathname;
    history.replaceState(null, '', clean);
  }
  dismissLanding();
  await loadDiaryData();
  startMainExperience();
}

function initLanding(){
  const landing = document.getElementById('landing');
  const enter = document.getElementById('landingEnter');
  const cloud = document.getElementById('landingCloud');
  if(!landing || !enter){
    bootMapExperience();
    return;
  }
  if(shouldSkipLanding()){
    bootMapExperience();
    return;
  }
  landing.classList.remove('is-dismissed');
  landing.removeAttribute('aria-hidden');
  landing.style.display = '';
  document.body.classList.add('landing-active');
  if(cloud && !cloud.querySelector('.landing-slot')){
    buildLandingCollage(cloud);
  }
  window.addEventListener('pageshow', e => {
    if(!e.persisted || shouldSkipLanding()) return;
    if(typeof window.bootLandingPhotos === 'function') void window.bootLandingPhotos();
    else void initLandingCollage().catch(err => console.error('Landing collage error:', err));
  });
  document.querySelectorAll('#landingEnter, .landing-enter').forEach(btn => {
    btn.addEventListener('click', () => bootMapExperience());
  });
}

function initGuide(){
  const backdrop = document.getElementById('guideBackdrop');
  const trigger = document.getElementById('guideTrigger');
  const closeBtn = document.getElementById('guideClose');
  const dismissBtn = document.getElementById('guideDismiss');
  if(!backdrop || !trigger) return;

  const STORAGE_KEY = 'diary.archive.guide.dismissed';

  function openGuide(){
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('guide-open');
    dismissBtn?.focus();
  }
  function closeGuide(persist){
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('guide-open');
    if(persist){
      try{ localStorage.setItem(STORAGE_KEY, '1'); }catch(_){}
    }
    trigger.focus();
  }

  trigger.addEventListener('click', openGuide);
  closeBtn?.addEventListener('click', () => closeGuide(true));
  dismissBtn?.addEventListener('click', () => closeGuide(true));
  backdrop.addEventListener('click', e => {
    if(e.target === backdrop) closeGuide(true);
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && backdrop.classList.contains('is-open')) closeGuide(true);
  });

  let dismissed = false;
  try{ dismissed = localStorage.getItem(STORAGE_KEY) === '1'; }catch(_){}
  if(!dismissed) openGuide();
}

if(!window.__EMOTION_DETAIL_PAGE__){
  initLanding();
} else {
  loadDiaryData();
}
document.querySelector('.site-brand')?.addEventListener('click', function() {
  try { sessionStorage.removeItem('diary.archive.map.entered'); } catch(_) {}

  const landing = document.getElementById('landing');
  const poster = document.getElementById('poster');
  if(!landing) return;

  landing.classList.remove('is-dismissed');
  landing.removeAttribute('aria-hidden');
  landing.style.display = '';
  document.body.classList.add('landing-active');
  poster?.setAttribute('aria-hidden', 'true');

  document.querySelectorAll('#landingEnter, .landing-enter').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  document.querySelectorAll('#landingEnter, .landing-enter').forEach(btn => {
    btn.addEventListener('click', () => bootMapExperience());
  });

  const cloud = document.getElementById('landingCloud');
  if(cloud) {
    buildLandingCollage(cloud);
    window.__resetLandingBoot?.();
    setTimeout(() => {
      if(typeof window.bootLandingPhotos === 'function'){
        void window.bootLandingPhotos();
      } else {
        void initLandingCollage().catch(err => console.error(err));
      }
    }, 50);
  }
});