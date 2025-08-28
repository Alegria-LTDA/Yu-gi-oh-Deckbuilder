// Config
const API_BASE = 'https://db.ygoprodeck.com/api/v7';

// Helpers
const $ = sel => document.querySelector(sel);
const create = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el };

// State
const state = { results: [], deckMain: [], deckExtra: [], mode: 'main' };

// Persistence keys
const STORAGE_KEY = 'ygodb_decks_v1';

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    state.deckMain = obj.deckMain || [];
    state.deckExtra = obj.deckExtra || [];
  }catch(e){ console.warn('failed to load state', e); }
}

function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify({ deckMain: state.deckMain, deckExtra: state.deckExtra })); }
  catch(e){ console.warn('failed to save state', e); }
}

// Elements
const searchInput = $('#searchInput');
const langSelect = $('#langSelect');
const searchBtn = $('#searchBtn');
const cardsList = $('#cardsList');
const cardModal = $('#cardModal');
const modalBody = $('#modalBody');
const closeModal = $('#closeModal');
const deckList = $('#deckList');
const exportTxt = $('#exportTxt');
const exportJson = $('#exportJson');
const downloadImagesBtn = $('#downloadImages');
const clearDeck = $('#clearDeck');
const deckModeMain = $('#deckModeMain');
const deckModeExtra = $('#deckModeExtra');
const mainCountSpan = $('#mainCount');
const extraCountSpan = $('#extraCount');

// Events
searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() });
closeModal?.addEventListener('click', () => cardModal.classList.add('hidden'));
exportTxt.addEventListener('click', exportDeckTxt);
exportJson.addEventListener('click', exportDeckJson);
downloadImagesBtn.addEventListener('click', downloadDeckImagesZip);
clearDeck.addEventListener('click', () => { clearCurrentDeck(); renderDeck(); });
deckModeMain.addEventListener('click', () => { setMode('main'); });
deckModeExtra.addEventListener('click', () => { setMode('extra'); });

function setMode(m){
  state.mode = m;
  deckModeMain.classList.toggle('active', m === 'main');
  deckModeExtra.classList.toggle('active', m === 'extra');
  renderDeck();
}

function clearCurrentDeck(){
  if (state.mode === 'main') state.deckMain = [];
  else state.deckExtra = [];
}

async function doSearch(){
  const q = searchInput.value.trim();
  if (!q) return alert('Digite um termo para buscar');
  const lang = langSelect.value === 'Portuguese' ? 'pt' : 'en';
  // Try several URL variants in a robust order: fuzzy without language, with language, exact name, then language-name
  const encoded = encodeURIComponent(q);
  const attempts = [
    `${API_BASE}/cardinfo.php?fname=${encoded}`,
    `${API_BASE}/cardinfo.php?language=${lang}&fname=${encoded}`,
    `${API_BASE}/cardinfo.php?name=${encoded}`,
    `${API_BASE}/cardinfo.php?language=${lang}&name=${encoded}`
  ];

  // prevent rapid repeated searches
  searchBtn.disabled = true;
  cardsList.innerHTML = 'Carregando...';
  let found = false;
  for (const url of attempts){
    try{
      const res = await fetch(url);
      if (!res.ok) { continue; }
      const data = await res.json();
      // API returns { data: [...] } on success, or { error: '...' }
      if (data && data.data && Array.isArray(data.data) && data.data.length > 0){
        state.results = data.data;
        found = true;
        break;
      }
      // if API returned a single object (older endpoints) try to normalize
      if (Array.isArray(data)) { state.results = data; found = true; break; }
      // otherwise keep trying
    }catch(err){
      // network or parse error, try next
      console.warn('attempt failed', url, err);
    }
  }
  if (!found){
    cardsList.innerHTML = '<p>Nenhuma carta encontrada ou erro na API. Veja o console para mais detalhes.</p>';
    state.results = [];
    searchBtn.disabled = false;
    return;
  }
  renderResults();
  searchBtn.disabled = false;
}

function renderResults(){
  cardsList.innerHTML = '';
  if (!state.results || state.results.length === 0){
    cardsList.innerHTML = '<p>Nenhuma carta encontrada.</p>';
    return;
  }

  state.results.forEach(card => {
    const c = create('div','card');
    const img = create('img');
    // Prefer small thumbnail when available to avoid heavy downloads in the list
    const imgUrl = (card.card_images && card.card_images[0] && (card.card_images[0].image_url_small || card.card_images[0].image_url)) || card.image_url || '';
    img.loading = 'lazy';
    img.src = imgUrl;
    img.alt = card.name;
    c.appendChild(img);

    const info = create('div','info');
    const h = create('h3'); h.textContent = card.name;
    const sub = create('div'); sub.style.fontSize='12px'; sub.style.color='#9aa8b7';
    sub.textContent = `${card.type || ''} ${card.race ? '— '+card.race : ''}`;
    info.appendChild(h); info.appendChild(sub);
    c.appendChild(info);

    const actions = create('div','actions');
    const btnDetails = create('button'); btnDetails.textContent='Detalhes';
    btnDetails.addEventListener('click', () => showDetails(card));
    const btnAdd = create('button'); btnAdd.textContent='Adicionar';
    btnAdd.addEventListener('click', () => { addToDeck(card); });
    actions.appendChild(btnDetails); actions.appendChild(btnAdd);
    c.appendChild(actions);

    cardsList.appendChild(c);
  });
}

function showDetails(card){
  modalBody.innerHTML = '';
  const title = create('h2'); title.textContent = card.name;
  const top = create('div'); top.style.display='flex'; top.style.gap='12px';
  // show a reasonably sized preview in the modal; the download button fetches the original image
  const img = create('img'); img.src = (card.card_images && card.card_images[0] && (card.card_images[0].image_url || card.card_images[0].image_url_small)) || card.image_url || '';
  img.style.width='220px'; img.style.height='320px'; img.style.objectFit='cover';
  top.appendChild(img);

  const meta = create('div');
  meta.innerHTML = `
    <p><strong>Tipo:</strong> ${card.type || '-'}</p>
    <p><strong>Atributo:</strong> ${card.attribute || '-'}</p>
    <p><strong>Nível/Rank:</strong> ${card.level || card.rank || '-'}</p>
    <p><strong>ATK / DEF:</strong> ${card.atk ?? '-'} / ${card.def ?? '-'}</p>
  `;
  top.appendChild(meta);
  modalBody.appendChild(title);
  modalBody.appendChild(top);

  const desc = create('div'); desc.innerHTML = `<h3>Descrição</h3><p>${card.desc || ''}</p>`;
  modalBody.appendChild(desc);

  const imagesSection = create('div'); imagesSection.style.marginTop='12px';
  imagesSection.innerHTML = '<h3>Imagens</h3>';
  const imgsWrap = create('div'); imgsWrap.style.display='flex'; imgsWrap.style.flexWrap='wrap'; imgsWrap.style.gap='8px';
  (card.card_images || []).forEach(ci => {
    const i = create('img'); i.src = ci.image_url; i.style.width='120px'; i.style.height='170px'; i.style.objectFit='cover'; i.style.cursor='pointer';
    i.addEventListener('click', () => downloadImage(ci.image_url, `${card.name}.jpg`));
    imgsWrap.appendChild(i);
  });
  imagesSection.appendChild(imgsWrap);
  modalBody.appendChild(imagesSection);

  // Export/Download buttons
  const actions = create('div'); actions.style.marginTop='12px';
  const addBtn = create('button'); addBtn.textContent='Adicionar ao deck'; addBtn.addEventListener('click', () => { addToDeck(card); });
  const dlBtn = create('button'); dlBtn.textContent='Baixar imagem (HD)'; dlBtn.addEventListener('click', () => {
    const url = (card.card_images && card.card_images[0] && card.card_images[0].image_url) || card.image_url;
    if (url) downloadImage(url, `${card.name}.jpg`);
  });
  actions.appendChild(addBtn); actions.appendChild(dlBtn);
  modalBody.appendChild(actions);

  cardModal.classList.remove('hidden');
}

function addToDeck(card){
  // store entries with qty: try increment existing, else add new
  const image = (card.card_images && card.card_images[0] && card.card_images[0].image_url) || card.image_url;
  const target = state.mode === 'main' ? state.deckMain : state.deckExtra;
  const maxTotal = state.mode === 'main' ? 60 : 15;
  const maxPerCard = 3;

  // compute current total count
  const currentTotal = target.reduce((s,i) => s + (i.qty || 1), 0);
  if (currentTotal >= maxTotal) return alert(`Deck ${state.mode==='main'?'Principal':'Adicional'} já atingiu o máximo de ${maxTotal} cartas`);

  const existing = target.find(t => t.id === card.id);
  if (existing){
    const existingQty = existing.qty || 1;
    if (existingQty >= maxPerCard) return alert('Já existe o máximo de 3 cópias desta carta no deck');
    // check total if incrementing
    if (currentTotal + 1 > maxTotal) return alert('Adicionar esta cópia excederia o limite do deck');
    existing.qty = existingQty + 1;
  }else{
    target.push({ id: card.id, name: card.name, image, type: card.type || '', race: card.race || '', qty: 1 });
  }
  saveState();
  renderDeck();
}

function renderDeck(){
  deckList.innerHTML = '';
  const current = state.mode === 'main' ? state.deckMain : state.deckExtra;
  mainCountSpan.textContent = state.deckMain.length;
  extraCountSpan.textContent = state.deckExtra.length;
  // update counts (by qty)
  const totalMain = state.deckMain.reduce((s,i) => s + (i.qty || 1), 0);
  const totalExtra = state.deckExtra.reduce((s,i) => s + (i.qty || 1), 0);
  mainCountSpan.textContent = totalMain;
  extraCountSpan.textContent = totalExtra;

  // update deck summary counts (Monster/Spell/Trap)
  const counts = { monster:0, spell:0, trap:0 };
  const sumSource = state.mode === 'main' ? state.deckMain : state.deckExtra;
  sumSource.forEach(it => {
    const t = (it.type || '').toLowerCase();
    const qty = it.qty || 1;
    if (t.includes('monster')) counts.monster += qty;
    else if (t.includes('spell')) counts.spell += qty;
    else if (t.includes('trap')) counts.trap += qty;
  });
  $('#countMonster').textContent = counts.monster;
  $('#countSpell').textContent = counts.spell;
  $('#countTrap').textContent = counts.trap;

  if (current.length === 0){ deckList.innerHTML = '<p>Deck vazio</p>'; return }
  current.forEach((c, idx) => {
    const el = create('div','deck-item');
    const img = create('img'); img.src = c.image || '';
    const span = create('div'); span.textContent = c.name;
    const qtyControls = create('div','qty-controls');
    const btnMinus = create('button'); btnMinus.textContent='−'; btnMinus.addEventListener('click', () => { changeQty(idx, -1); });
    const badge = create('div','qty-badge'); badge.textContent = c.qty || 1;
    const btnPlus = create('button'); btnPlus.textContent='+'; btnPlus.addEventListener('click', () => { changeQty(idx, +1); });
    qtyControls.appendChild(btnMinus); qtyControls.appendChild(badge); qtyControls.appendChild(btnPlus);
    const remove = create('button'); remove.textContent='Remover'; remove.addEventListener('click', () => { removeFromCurrent(idx); });
    el.appendChild(img); el.appendChild(span); el.appendChild(qtyControls); el.appendChild(remove);
    deckList.appendChild(el);
  });
}

function changeQty(idx, delta){
  const target = state.mode === 'main' ? state.deckMain : state.deckExtra;
  const maxPerCard = 3;
  const maxTotal = state.mode === 'main' ? 60 : 15;
  const item = target[idx];
  if (!item) return;
  const currentTotal = target.reduce((s,i) => s + (i.qty || 1), 0);
  if (delta > 0){
    if ((item.qty || 1) >= maxPerCard) return alert('Já há 3 cópias desta carta');
    if (currentTotal + 1 > maxTotal) return alert('Adicionar esta cópia excederia o limite do deck');
    item.qty = (item.qty || 1) + 1;
  }else{
    item.qty = (item.qty || 1) - 1;
    if (item.qty <= 0){ target.splice(idx,1); }
  }
  saveState();
  renderDeck();
}

function removeFromCurrent(idx){
  if (state.mode === 'main') state.deckMain.splice(idx,1);
  else state.deckExtra.splice(idx,1);
  saveState();
  renderDeck();
}

async function downloadImage(url, filename){
  try{
    const res = await fetch(url);
    const blob = await res.blob();
    // use FileSaver if available
    if (window.saveAs) saveAs(blob, filename);
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }catch(e){
    console.error('download failed', e);
    // fallback: open image in a new tab so user can save manually
    try{ window.open(url, '_blank'); alert('Não foi possível baixar automaticamente. A imagem será aberta em nova aba para que você possa salvar manualmente.'); }
    catch(err){ alert('Falha ao baixar imagem e ao abrir a imagem em nova aba. Veja o console.'); }
  }
}



function exportDeckTxt(){
  const current = state.mode === 'main' ? state.deckMain : state.deckExtra;
  if (current.length===0) return alert('Deck vazio');
  const lines = [];
  current.forEach(c => { const qty = c.qty || 1; for(let i=0;i<qty;i++) lines.push(c.name); });
  const filename = state.mode === 'main' ? 'deck_main.txt' : 'deck_extra.txt';
  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  if (window.saveAs) saveAs(blob, filename);
}

function exportDeckJson(){
  const current = state.mode === 'main' ? state.deckMain : state.deckExtra;
  if (current.length===0) return alert('Deck vazio');
  const filename = state.mode === 'main' ? 'deck_main.json' : 'deck_extra.json';
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
  if (window.saveAs) saveAs(blob, filename);
}

async function downloadDeckImagesZip(){
  const current = state.mode === 'main' ? state.deckMain : state.deckExtra;
  if (current.length===0) return alert('Deck vazio');
  // confirm if many images to avoid hammering the API
  const totalImages = current.reduce((s,i) => s + (i.qty || 1), 0);
  if (totalImages > 10){
    const ok = confirm(`Você está prestes a baixar ${totalImages} imagens. Isso pode gerar muitas requisições. Deseja continuar?`);
    if (!ok) return;
  }

  const zip = new JSZip();
  const folder = zip.folder('images');
  const failed = [];

  // limited concurrency
  const concurrency = 3;
  const queue = [];
  current.forEach(c => {
    for(let i=0;i<(c.qty||1);i++) queue.push(c);
  });

  async function worker(){
    while(queue.length){
      const c = queue.shift();
      const url = c.image;
      if (!url) continue;
      try{
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const ext = url.split('.').pop().split(/\?|#/)[0] || 'jpg';
        folder.file(`${sanitizeFilename(c.name)}.${ext}`, blob);
      }catch(e){
        console.warn('failed to fetch image for', c.name, e);
        failed.push(c.name);
      }
    }
  }

  // start workers
  const workers = [];
  for(let i=0;i<concurrency;i++) workers.push(worker());
  await Promise.all(workers);

  const content = await zip.generateAsync({ type: 'blob' });
  const filename = state.mode === 'main' ? 'deck_main_images.zip' : 'deck_extra_images.zip';
  saveAs(content, filename);
  if (failed && failed.length>0) alert(`Algumas imagens falharam ao baixar: ${failed.length} (ver console)`);
}

function sanitizeFilename(name){ return name.replace(/[\\/:*?"<>|]/g,'_') }

// Initial render
// load persisted decks and render
loadState();
setMode('main');
