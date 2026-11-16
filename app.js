// たべもの なかまわけ げーむ v3.0 — 月〜金のクイズを共通の保存先（Google Apps Script）に置く版。
(() => {
'use strict';
const $ = id => document.getElementById(id);
const DAYS = [['mon', '月'], ['tue', '火'], ['wed', '水'], ['thu', '木'], ['fri', '金']];
const COLOR = {
    red: { name: 'あか', role: '（からだを つくる）' },
    yellow: { name: 'きいろ', role: '（ちからを くれる）' },
    green: { name: 'みどり', role: '（からだを まもる）' }
};
const emoji = e => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="100">${e}</text></svg>`);
const DEFAULT_ICONS = { red: emoji('🥩'), yellow: emoji('🍙'), green: emoji('🥦') };
const STORE = { cache: 'foodWeek.cache.v1', day: 'foodWeek.day', pw: 'foodWeek.password', api: 'foodWeek.api' };

const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できない環境でも遊べる */ } }
};
const emptyDay = () => ({ data: { foods: [], icons: {} }, updatedAt: 0 });
let week = {};
DAYS.forEach(([d]) => week[d] = emptyDay());
try { const c = JSON.parse(store.get(STORE.cache) || 'null'); if (c) DAYS.forEach(([d]) => { if (c[d]) week[d] = c[d]; }); } catch { /* 壊れたキャッシュは使わない */ }

function todayKey() { const w = new Date().getDay(); return w >= 1 && w <= 5 ? DAYS[w - 1][0] : 'mon'; }
let day = todayKey();
let tab = 'game';
let saving = false;
// 学校のGoogleアカウント（Workspace）では …/a/macros/<ドメイン>/s/…/exec の形になる。
const validApi = v => /^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/.test(v) || /^http:\/\/127\.0\.0\.1:\d+\/api$/.test(v);
// 「保存先つきのURL」（?api=…）で開いた端末は、その保存先を覚えてアドレスから消す。
(() => { try { const p = new URLSearchParams(location.search).get('api'); if (p && validApi(p.trim())) { store.set(STORE.api, p.trim()); history.replaceState(null, '', location.pathname); } } catch { /* 無視 */ } })();
const apiUrl = () => (window.QUIZ_API_URL || store.get(STORE.api) || '').trim();
const safeUrl = u => /^https:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '';

function setStatus(text, warn = false) { const el = $('sync-status'); el.textContent = text; el.classList.toggle('warn', warn); }
function dayName(d = day) { return DAYS.find(x => x[0] === d)[1] + '曜日'; }
function current() { return week[day].data; }
function icons() { const i = current().icons || {}; return { red: safeUrl(i.red) || DEFAULT_ICONS.red, yellow: safeUrl(i.yellow) || DEFAULT_ICONS.yellow, green: safeUrl(i.green) || DEFAULT_ICONS.green }; }

// ---------- 保存先とのやりとり ----------
async function api(body) {
    const url = apiUrl();
    if (!url) throw new Error('no_api');
    const res = body
        ? await fetch(url, { method: 'POST', body: JSON.stringify(body) })   // text/plain（事前確認の要らない形）
        : await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('http_' + res.status);
    return res.json();
}

async function loadWeek(quiet = false) {
    if (!apiUrl()) { setStatus('保存先が まだ設定されていません（せってい → 保存先の設定）', true); return; }
    if (!quiet) setStatus('さいしんの クイズを よみこみ中…');
    try {
        const r = await api(null);
        if (!r.ok || !r.days) throw new Error('bad');
        DAYS.forEach(([d]) => { if (r.days[d]) week[d] = r.days[d]; });
        store.set(STORE.cache, JSON.stringify(week));
        setStatus('');
        return true;
    } catch {
        setStatus('保存先に つながりません（ネットワーク、または保存先の公開が「全員」になっていない）。前に よみこんだ クイズで あそべます。', true);
        return false;
    }
}

const ERR = {
    password: 'あいことばが ちがいます。',
    no_password_set: '保存先に あいことば（EDIT_PASSWORD）が まだ設定されていません。',
    too_large: '登録が多すぎて保存できません。いくつか けしてください。',
    busy: 'ほかの端末が保存中でした。少し待って、もう一度おしてください。',
    no_api: '保存先が まだ設定されていません。'
};

// 変更は「その曜日だけ」を保存。ほかの端末が先に保存していたら上書きせず、最新を読み直す。
async function saveDay(change) {
    if (saving) return false;
    const pw = $('teacher-password').value;
    if (!pw) { alert('先生の あいことばを 入れてください。'); $('teacher-password').focus(); return false; }
    const target = day;
    const draft = JSON.parse(JSON.stringify(week[target].data));
    change(draft);
    saving = true; setBusy(true); setStatus(dayName(target) + 'を 保存中…');
    try {
        const r = await api({ action: 'save', day: target, password: pw, data: draft, baseUpdatedAt: week[target].updatedAt });
        if (r.ok) {
            week[target] = { data: r.data, updatedAt: r.updatedAt };
            store.set(STORE.cache, JSON.stringify(week));
            store.set(STORE.pw, pw);
            setStatus(dayName(target) + 'を 保存しました。');
            return true;
        }
        if (r.error === 'conflict') {
            week[target] = r.current;
            store.set(STORE.cache, JSON.stringify(week));
            setStatus('', false);
            alert('ほかの端末で ' + dayName(target) + ' が更新されていました。最新を読み込んだので、もう一度 操作してください。');
            return false;
        }
        setStatus(ERR[r.error] || '保存できませんでした。', true);
        alert(ERR[r.error] || '保存できませんでした。');
        return false;
    } catch (e) {
        const msg = e.message === 'no_api' ? ERR.no_api : '保存先に つながらず、保存できませんでした。';
        setStatus(msg, true); alert(msg);
        return false;
    } finally {
        saving = false; setBusy(false);
        renderSettings();
        if (target === day) initGame();
    }
}
function setBusy(b) { document.querySelectorAll('#settings button, #settings input, #settings select').forEach(el => { if (!el.closest('.api-box')) el.disabled = b; }); }

// ---------- 画面の組み立て ----------
function renderDayTabs() {
    const today = todayKey(), real = new Date().getDay();
    $('day-tabs').replaceChildren(...DAYS.map(([d, label]) => {
        const b = document.createElement('button');
        b.className = 'day-tab' + (d === day ? ' active' : '');
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', d === day);
        b.textContent = label;
        if (d === today && real >= 1 && real <= 5) { const t = document.createElement('span'); t.className = 'today'; t.textContent = 'きょう'; b.append(t); }
        b.onclick = () => selectDay(d);
        return b;
    }));
}
function selectDay(d) {
    if (saving || d === day) return;
    day = d; store.set(STORE.day, d);
    clearShare();
    renderDayTabs(); renderSettings(); initGame();
}
function switchTab(t) {
    tab = t;
    ['game', 'settings'].forEach(id => { $(id).classList.toggle('active', id === t); $('tab-' + id).classList.toggle('active', id === t); });
    if (t === 'settings') renderSettings(); else initGame();
    loadWeek(true).then(ok => { if (ok && !saving) { renderSettings(); if (tab === 'game') initGame(); } });
}

function applyIcons() { const ic = icons(); ['red', 'yellow', 'green'].forEach(c => $('icon-img-' + c).src = ic[c]); }

function renderSettings() {
    $('settings-title').textContent = dayName() + 'の クイズ';
    const data = current();
    const i = data.icons || {};
    ['red', 'yellow', 'green'].forEach(c => { const el = $('setting-icon-' + c); if (document.activeElement !== el) el.value = i[c] || ''; });
    const list = $('food-list');
    if (!data.foods.length) { const p = document.createElement('p'); p.className = 'empty-list'; p.textContent = 'まだ 登録が ありません。'; list.replaceChildren(p); return; }
    list.replaceChildren(...data.foods.map((food, index) => {
        const item = document.createElement('div');
        item.className = 'setting-item' + (food.isActive === false ? ' inactive' : '');
        const main = document.createElement('div'); main.className = 'item-main';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'toggle-checkbox'; cb.checked = food.isActive !== false; cb.title = 'チェックを外すと出題されません';
        cb.onchange = () => saveDay(dd => { dd.foods[index].isActive = cb.checked; });
        const no = document.createElement('span'); no.className = 'item-no'; no.textContent = (index + 1) + '.';
        const label = document.createElement('span'); label.textContent = `${food.name} (${COLOR[food.color]?.name || ''})`;
        main.append(cb, no, label);
        const btns = document.createElement('div'); btns.className = 'item-buttons';
        const mk = (text, cls, fn, disabled) => { const b = document.createElement('button'); b.className = 'action-btn ' + cls; b.textContent = text; b.disabled = !!disabled; b.onclick = fn; return b; };
        btns.append(
            mk('↑', 'btn-updown', () => saveDay(dd => { [dd.foods[index - 1], dd.foods[index]] = [dd.foods[index], dd.foods[index - 1]]; }), index === 0),
            mk('↓', 'btn-updown', () => saveDay(dd => { [dd.foods[index + 1], dd.foods[index]] = [dd.foods[index], dd.foods[index + 1]]; }), index === data.foods.length - 1),
            mk('けす', 'btn-delete', () => { if (confirm(`「${food.name}」を けしますか？`)) saveDay(dd => { dd.foods.splice(index, 1); }); })
        );
        item.append(main, btns);
        return item;
    }));
}

// ---------- ゲーム（2.0.3 と同じ流れ） ----------
let remainingFoods = [], currentFood = null, questionHistory = [], currentAnswered = false, audioContext = null;

function initAudio() { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    try { initAudio(); } catch { return; }
    const o = audioContext.createOscillator(), g = audioContext.createGain(), t = audioContext.currentTime;
    o.connect(g); g.connect(audioContext.destination);
    if (type === 'correct') { o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1108.73, t + 0.1); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.5); o.start(); o.stop(t + 0.5); }
    else if (type === 'wrong') { o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.3); o.start(); o.stop(t + 0.3); }
    else if (type === 'finish') { o.type = 'sine'; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * 0.15)); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 1.5); o.start(); o.stop(t + 1.5); }
}
const judgeButtons = () => document.querySelectorAll('#play-screen .judge-btn');
function showFood(food) {
    $('food-name-display').textContent = food.name;
    const src = safeUrl(food.url);
    $('food-image').hidden = !src; if (src) $('food-image').src = src; else $('food-image').removeAttribute('src');
    $('message-area').replaceChildren(); $('message-area').className = '';
    $('next-btn').classList.remove('show'); $('next-btn').textContent = 'つぎへ！';
    $('button-container').hidden = false;
    judgeButtons().forEach(b => b.disabled = false);
}
function updateBackButton() { $('back-btn').disabled = questionHistory.length === 0; }

function initGame() {
    applyIcons();
    questionHistory = []; currentAnswered = false; currentFood = null; remainingFoods = [];
    updateBackButton();
    $('play-screen').hidden = false; $('finish-screen').hidden = true;
    const active = current().foods.filter(f => f.isActive !== false);
    if (!active.length) {
        $('food-name-display').textContent = current().foods.length ? 'しゅつだいが すべて オフ になっています。' : dayName() + 'の クイズは まだ ありません。';
        $('food-image').hidden = true; $('food-image').removeAttribute('src');
        $('message-area').replaceChildren(); $('next-btn').classList.remove('show');
        $('button-container').hidden = false; judgeButtons().forEach(b => b.disabled = true);
        return;
    }
    remainingFoods = [...active];
    nextQuestion();
}
function nextQuestion() {
    if (currentFood && currentAnswered) questionHistory.push(currentFood);
    if (!remainingFoods.length) { currentFood = null; updateBackButton(); showFinishScreen(); return; }
    currentFood = remainingFoods.shift(); currentAnswered = false;
    showFood(currentFood); updateBackButton();
}
function goBackQuestion() {
    if (!questionHistory.length) return;
    if (currentFood) remainingFoods.unshift(currentFood);
    currentFood = questionHistory.pop(); currentAnswered = false;
    $('finish-screen').hidden = true; $('play-screen').hidden = false;
    showFood(currentFood); updateBackButton();
}
function checkAnswer(color) {
    if (!currentFood || currentAnswered) return;
    const area = $('message-area');
    if (color === currentFood.color) {
        playSound('correct'); currentAnswered = true;
        $('button-container').hidden = true;
        const img = document.createElement('img'); img.className = 'result-icon ' + color; img.alt = 'えらんだイラスト'; img.src = icons()[color];
        const sub = document.createElement('span'); sub.className = 'result-sub'; sub.textContent = `${COLOR[color].name}の たべもの ${COLOR[color].role}`;
        area.replaceChildren(img, 'せいかい！🎉', document.createElement('br'), sub); area.className = 'good';
        $('next-btn').textContent = remainingFoods.length ? 'つぎへ！' : 'けっかをみる！';
        $('next-btn').classList.add('show');
    } else {
        playSound('wrong'); area.textContent = 'ちがうよ！もういちど かんがえてみよう🤔'; area.className = 'retry';
    }
}
function showFinishScreen() { playSound('finish'); $('play-screen').hidden = true; $('finish-screen').hidden = false; }

// ---------- 操作 ----------
judgeButtons().forEach(b => b.onclick = () => checkAnswer(b.dataset.color));
$('next-btn').onclick = nextQuestion;
$('back-btn').onclick = goBackQuestion;
$('replay-btn').onclick = initGame;
$('tab-game').onclick = () => switchTab('game');
$('tab-settings').onclick = () => switchTab('settings');

$('add-food').onclick = async () => {
    const name = $('new-name').value.trim(), url = $('new-url').value.trim(), color = $('new-color').value;
    if (!name || !url) { alert('なまえ と URL を いれてください。'); return; }
    if (!safeUrl(url)) { alert('画像のURLは https:// で はじまる物を いれてください。'); return; }
    if (await saveDay(d => d.foods.push({ name, url, color, isActive: true }))) {
        $('new-name').value = ''; $('new-url').value = '';
        alert(`${name} を ${dayName()}に ついかしました！`);
    }
};
$('save-icons').onclick = async () => {
    const vals = {};
    for (const c of ['red', 'yellow', 'green']) {
        const v = $('setting-icon-' + c).value.trim();
        if (v && !safeUrl(v)) { alert('イラストのURLは https:// で はじまる物を いれてください。'); return; }
        if (v) vals[c] = v;
    }
    if (await saveDay(d => { d.icons = vals; })) alert('ボタンのイラストを ほぞんしました！');
};
$('teacher-password').value = store.get(STORE.pw) || '';
$('password-check').onclick = async () => {
    const pw = $('teacher-password').value, st = $('password-status');
    if (!pw) { st.textContent = 'あいことばを 入れてください。'; st.className = 'note ng'; return; }
    st.textContent = 'たしかめ中…'; st.className = 'note';
    try {
        const r = await api({ action: 'check', password: pw });
        if (r.ok) { store.set(STORE.pw, pw); st.textContent = 'OK。この端末で登録できます。'; st.className = 'note ok'; }
        else { st.textContent = ERR[r.error] || 'たしかめられませんでした。'; st.className = 'note ng'; }
    } catch (e) { st.textContent = e.message === 'no_api' ? ERR.no_api : '保存先に つながりません。'; st.className = 'note ng'; }
};
// ---------- 共有コード（2.0.3 と同じ形：FG1＝圧縮、FG0＝圧縮なし。前の版のコードも読める） ----------
async function compressText(text) {
    if (!window.CompressionStream) throw new Error('unsupported');
    const buf = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}
async function decompressText(b64) {
    if (!window.DecompressionStream) throw new Error('unsupported');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
}
const legacyEncode = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const legacyDecode = s => JSON.parse(decodeURIComponent(escape(atob(s))));
async function decodeShare(text) {
    text = text.trim();
    const m = text.match(/FG[01]:[A-Za-z0-9+/=_-]+/); if (m) text = m[0];
    try { const p = new URL(text).searchParams.get('data'); if (p) text = p; } catch { /* URLでなければそのまま */ }
    if (text.startsWith('FG1:')) return JSON.parse(await decompressText(text.slice(4)));
    if (text.startsWith('z:')) return JSON.parse(await decompressText(text.slice(2)));
    if (text.startsWith('FG0:')) return legacyDecode(text.slice(4));
    return legacyDecode(text);
}
$('share-make').onclick = async () => {
    const target = day, d = current();
    const obj = { foods: d.foods, icons: d.icons || {} };
    let code;
    try { code = 'FG1:' + await compressText(JSON.stringify(obj)); } catch { code = 'FG0:' + legacyEncode(obj); }
    if (target !== day) return;
    $('share-code-output').value = code;
    try { await navigator.clipboard.writeText(code); } catch { /* コピーできない環境でも表示はする */ }
    $('share-status').textContent = `${dayName()}の共有コードを作りました（${code.length.toLocaleString()}文字）。`;
};
$('share-copy').onclick = async () => {
    const code = $('share-code-output').value.trim();
    if (!code) { alert('先に「共有コードを作る」を押してください。'); return; }
    try { await navigator.clipboard.writeText(code); alert('共有コードをコピーしました！チャットなどに貼り付けて送れます。'); }
    catch { $('share-code-output').focus(); $('share-code-output').select(); alert('自動コピーできませんでした。選択された文字をコピーしてください。'); }
};
$('share-import').onclick = async () => {
    const text = $('import-data-text').value.trim();
    if (!text) { alert('共有コードを貼り付けてください。'); return; }
    let obj;
    try { obj = await decodeShare(text); if (!obj || !Array.isArray(obj.foods)) throw new Error('bad'); }
    catch { alert('共有コードを読めませんでした。コピーした文字が途中で切れている可能性があります。'); return; }
    if (!confirm(`${dayName()}の こんだては、共有コードの内容で上書きされます。よろしいですか？`)) return;
    const foods = obj.foods.map(f => ({ name: String(f.name || ''), url: String(f.url || ''), color: f.color, isActive: f.isActive !== false }));
    const dropped = foods.filter(f => f.url && !safeUrl(f.url)).length;
    if (await saveDay(d => { d.foods = foods; d.icons = obj.icons || {}; })) {
        $('import-data-text').value = '';
        alert('データを読み込みました！' + (dropped ? `\n（https で始まらない画像のURL ${dropped}件は、使えないため外しました）` : ''));
    }
};
const clearShare = () => { $('share-code-output').value = ''; $('share-status').textContent = ''; };

function updateOpenLink() {
    const u = apiUrl();
    $('open-link').value = u ? location.origin + location.pathname + '?api=' + encodeURIComponent(u) : '';
    $('api-box').open = !u;
}
$('api-url').value = store.get(STORE.api) || window.QUIZ_API_URL || '';
$('api-save').onclick = () => {
    const v = $('api-url').value.trim();
    if (v && !validApi(v)) { alert('Apps Script のウェブアプリのURL（https://script.google.com/…/exec）を入れてください。'); return; }
    store.set(STORE.api, v);
    updateOpenLink();
    loadWeek().then(() => { renderSettings(); initGame(); });
};
$('open-link-copy').onclick = async () => {
    const link = $('open-link').value;
    if (!link) { alert('先に保存先のURLを入れてください。'); return; }
    try { await navigator.clipboard.writeText(link); alert('保存先つきのURLをコピーしました。ほかの端末で開いてください。'); }
    catch { $('open-link').focus(); $('open-link').select(); alert('自動コピーできませんでした。選択された文字をコピーしてください。'); }
};
updateOpenLink();

window.addEventListener('keydown', e => {
    if (tab !== 'game' || e.target?.closest?.('input, select, textarea')) return;
    const k = e.key === 'Enter' ? 'red' : (e.key === ' ' || e.code === 'Space') ? 'yellow' : e.key === 'Shift' ? 'green' : null;
    if (!k) return;
    if (!$('finish-screen').hidden) { e.preventDefault(); initGame(); return; }
    if (!currentFood) return;
    e.preventDefault();
    if ($('next-btn').classList.contains('show')) nextQuestion(); else checkAnswer(k);
});

const saved = store.get(STORE.day);
if (saved && DAYS.some(([d]) => d === saved) && new Date().getDay() % 6 === 0) day = saved;  // 土日は前に選んだ曜日
renderDayTabs(); renderSettings(); initGame();
loadWeek().then(ok => { if (ok) { renderSettings(); initGame(); } });
})();
