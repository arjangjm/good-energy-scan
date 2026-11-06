// Good Energy | Scan the Can
// Scan-to-earn demo built from the Good Energy BrandScript.
// In the Android app, a Solana wallet connects through Mobile Wallet Adapter
// and signs every scan claim. No real money moves.
(() => {
  'use strict';

  // ---------- Config ----------
  const PRICE_CENTS = 299;                                   // about $2.99 a can
  const BACK_RATE = 0.33;                                    // 33% back on every can
  const BACK_CENTS = Math.round(PRICE_CENTS * BACK_RATE);    // 99 cents a scan
  const STORE_KEY = 'good-energy-scan-v1';
  const SHARE_URL = 'https://drinkgoodenergy.com';
  const FLAVORS = [
    { id: 'key-lime', name: 'Key Lime', color: '#B8E04A' },
    { id: 'cherry', name: 'Cherry', color: '#E8334A' },
    { id: 'orange', name: 'Orange', color: '#FF8A1F' },
    { id: 'sol-surge', name: 'Sol Surge', color: '#9B5CFF' },
  ];

  // Injected by the Android app (MainActivity.kt). Missing in a normal browser.
  const Native = window.GoodEnergyNative || null;

  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  const blank = () => ({ scans: [], codes: [], adult: false, flavor: FLAVORS[0].id });
  let state = load();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.scans) && Array.isArray(s.codes)) return Object.assign(blank(), s);
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------- Helpers ----------
  const money = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = () => state.scans.reduce((sum, s) => sum + s.cents, 0);
  const flavorOf = (id) => FLAVORS.find((f) => f.id === id) || FLAVORS[0];
  const short = (s) => (s ? s.slice(0, 4) + '...' + s.slice(-4) : '');
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
  const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');

  function randomFrom(alphabet, n) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    let out = '';
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  }
  // Each demo tap is a brand new can with its own code.
  const randomCode = () => { const s = randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8); return 'GE-' + s.slice(0, 4) + '-' + s.slice(4); };
  // Looks like a Solana signature. Used only for unsigned demo scans.
  const demoTx = () => randomFrom('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 88);

  function timeAgo(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  // Days in a row with at least one scan. Today counts if you scanned, otherwise the run ending yesterday.
  function streak() {
    const days = new Set(state.scans.map((s) => dayKey(s.ts)));
    if (!days.size) return 0;
    const d = new Date(); d.setHours(12, 0, 0, 0);
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---------- The chirp ----------
  // Sharp chirp attack plus a coin-shimmer tail. Original sound, synthesized live, under 1 second.
  let audio;
  function chirp() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const master = audio.createGain();
      master.gain.value = 0.32;
      master.connect(audio.destination);

      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(2900, t);
      o.frequency.exponentialRampToValueAtTime(3400, t + 0.06);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.1);

      [2637, 3520, 4186, 5274].forEach((f, i) => {
        const s = audio.createOscillator();
        const sg = audio.createGain();
        const st = t + 0.08 + i * 0.045;
        s.type = 'sine';
        s.frequency.setValueAtTime(f, st);
        sg.gain.setValueAtTime(0.0001, st);
        sg.gain.exponentialRampToValueAtTime(0.35, st + 0.005);
        sg.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
        s.connect(sg).connect(master);
        s.start(st); s.stop(st + 0.4);
      });
    } catch (e) { /* no audio, no problem */ }
  }

  // ---------- Effects ----------
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  let flashTimer;
  function flashLogo() { // logo flashes lower right for exactly 1 second
    const el = $('flash');
    el.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('on'), 1000);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  let shown = 0, anim = 0;
  function countTo(target, animate) {
    const el = $('balance');
    cancelAnimationFrame(anim);
    if (!animate) { shown = target; el.textContent = money(target); return; }
    const from = shown, start = performance.now(), dur = 650;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      shown = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = money(shown);
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- Wallet (Mobile Wallet Adapter, through the Android app) ----------
  let wallet = null;          // { address, label }
  let walletBusy = '';        // '', 'connecting' or 'disconnecting'
  let disconnectArmedAt = 0;
  const pending = new Map();  // claim signatures waiting on the wallet
  let requestSeq = 0;

  if (Native && typeof Native.currentWallet === 'function') {
    try {
      const saved = JSON.parse(Native.currentWallet() || 'null');
      if (saved && saved.address) wallet = { address: saved.address, label: saved.label || '' };
    } catch (e) { /* no saved wallet */ }
  }

  function renderWallet() {
    const b = $('walletBtn');
    b.disabled = Boolean(walletBusy);
    b.classList.toggle('connected', Boolean(wallet) && !walletBusy);
    if (walletBusy === 'connecting') b.textContent = 'Connecting...';
    else if (walletBusy === 'disconnecting') b.textContent = 'Disconnecting...';
    else if (wallet) b.textContent = Date.now() - disconnectArmedAt < 3000 ? 'Disconnect?' : short(wallet.address);
    else b.textContent = 'Connect wallet';

    $('walletLine').textContent = wallet
      ? 'Claims are signed by ' + (wallet.label ? wallet.label + ' ' : '') + short(wallet.address) + '.'
      : Native ? 'Connect a Solana wallet to sign your claims.' : 'Wallet connect runs in the Android app.';
  }

  function onWalletButton() {
    if (walletBusy) return;
    if (!Native) { toast('Wallet connect runs in the Android app.'); return; }
    if (!wallet) {
      walletBusy = 'connecting';
      renderWallet();
      Native.connect();
      return;
    }
    if (Date.now() - disconnectArmedAt > 3000) { // first tap arms, second tap disconnects
      disconnectArmedAt = Date.now();
      renderWallet();
      setTimeout(renderWallet, 3050);
      return;
    }
    disconnectArmedAt = 0;
    walletBusy = 'disconnecting';
    renderWallet();
    Native.disconnect();
  }

  function settle(id, err, value) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (err) p.reject(err); else p.resolve(value);
  }

  function signWithWallet(message) {
    return new Promise((resolve, reject) => {
      const id = 'claim-' + (++requestSeq);
      pending.set(id, { resolve, reject });
      try { Native.signClaim(id, message); } catch (e) { pending.delete(id); reject(e); }
    });
  }

  // The Android app calls these when the wallet answers.
  window.GoodEnergyWallet = {
    onConnected(address, label) {
      const fresh = walletBusy === 'connecting';
      wallet = { address, label: label || '' };
      walletBusy = '';
      renderWallet();
      if (fresh) toast('Wallet connected. Your scans now sign with it.');
    },
    onDisconnected() {
      wallet = null;
      walletBusy = '';
      renderWallet();
      toast('Wallet disconnected.');
    },
    onError(message) {
      walletBusy = '';
      renderWallet();
      toast(message || 'The wallet did not connect.');
    },
    onSigned(id, signature, address) {
      if (address && wallet && address !== wallet.address) { wallet.address = address; renderWallet(); }
      settle(id, null, { signature, address: address || (wallet && wallet.address) || '' });
    },
    onSignFailed(id, message) {
      settle(id, new Error(message || 'Not signed.'));
    },
  };

  // ---------- Render ----------
  function render(animate) {
    const sum = total();
    const rem = sum % PRICE_CENTS;
    const pct = Math.round((rem / PRICE_CENTS) * 100);
    countTo(sum, animate);
    $('meterFill').style.width = pct + '%';
    $('meter').setAttribute('aria-valuenow', String(pct));
    $('meterNote').textContent = money(PRICE_CENTS - rem) + ' to your next can on us';
    $('statCans').textContent = state.scans.length;
    $('statFree').textContent = Math.floor(sum / PRICE_CENTS);
    $('statStreak').textContent = streak();
    renderFlavors();
    renderLedger();
    renderWallet();
  }

  function renderFlavors() {
    const wrap = $('flavors');
    if (!wrap.childElementCount) {
      FLAVORS.forEach((f) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.id = f.id;
        b.setAttribute('role', 'radio');
        const dot = document.createElement('i');
        dot.style.background = f.color;
        b.append(dot, document.createTextNode(f.name));
        b.addEventListener('click', () => { state.flavor = f.id; save(); renderFlavors(); });
        wrap.appendChild(b);
      });
    }
    wrap.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === state.flavor)));
  }

  function renderLedger() {
    const ol = $('ledger');
    const recent = state.scans.slice(-25).reverse();
    ol.textContent = '';
    $('ledgerEmpty').hidden = recent.length > 0;
    recent.forEach((s) => {
      const f = flavorOf(s.flavor);
      const li = document.createElement('li');
      li.classList.toggle('signed', Boolean(s.signed));
      const dot = document.createElement('i');
      dot.style.background = f.color;
      const who = document.createElement('span');
      who.className = 'who';
      const name = document.createElement('b');
      name.textContent = f.name;
      const meta = document.createElement('small');
      meta.textContent = timeAgo(s.ts) + ' · ' + (s.signed
        ? 'signed by ' + short(s.wallet) + ' · sig ' + short(s.tx)
        : 'demo tx ' + short(s.tx));
      who.append(name, meta);
      const amt = document.createElement('b');
      amt.className = 'amt';
      amt.textContent = '+' + money(s.cents);
      li.append(dot, who, amt);
      ol.appendChild(li);
    });
  }

  // ---------- 18+ gate ----------
  function ensureAdult() {
    return new Promise((resolve) => {
      if (state.adult) return resolve(true);
      const done = (ok) => {
        if (ok) { state.adult = true; save(); } else { toast('Come back on your 18th. Touch grass till then.'); }
        resolve(ok);
      };
      const dlg = $('ageGate');
      if (typeof dlg.showModal !== 'function') return done(window.confirm('Scan payouts are 18+. Are you 18 or older?'));
      dlg.returnValue = '';
      dlg.addEventListener('close', () => done(dlg.returnValue === 'yes'), { once: true });
      dlg.showModal();
    });
  }

  // ---------- Claim a can ----------
  let claiming = false;
  function scanBusy(on) {
    $('scanBtn').disabled = on;
    $('scanLabel').textContent = on ? 'Check your wallet' : 'Scan the can';
  }

  async function claim(rawCode, source) {
    const code = normCode(rawCode);
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) { toast('That code looks off. Check under the tab.'); return false; }
    if (state.codes.includes(code)) { toast('Already scanned. Each can pays once.'); return false; }
    if (claiming) return false;
    if (!(await ensureAdult())) return false;

    // With a wallet connected, the wallet signs the claim. No signature, no claim.
    let proof = null;
    if (wallet && Native) {
      claiming = true;
      scanBusy(true);
      const message = [
        'Good Energy scan claim',
        'Can: ' + code,
        'Wallet: ' + wallet.address,
        'Cashback: ' + money(BACK_CENTS),
        'Time: ' + new Date().toISOString(),
      ].join('\n');
      try {
        proof = await signWithWallet(message);
      } catch (e) {
        toast('Not signed, not claimed. ' + ((e && e.message) || ''));
        return false;
      } finally {
        claiming = false;
        scanBusy(false);
      }
    }

    const before = Math.floor(total() / PRICE_CENTS);
    state.codes.push(code);
    state.scans.push({
      code,
      flavor: state.flavor,
      cents: BACK_CENTS,
      ts: Date.now(),
      tx: proof ? proof.signature : demoTx(),
      signed: Boolean(proof),
      wallet: proof ? proof.address : null,
    });
    save();

    chirp();
    const ua = navigator.userActivation;
    if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate([18, 30, 18]);
    flashLogo();
    $('float').textContent = '+' + money(BACK_CENTS);
    restart($('float'), 'go');
    restart($('scanBtn'), 'pop');
    render(true);

    const after = Math.floor(total() / PRICE_CENTS);
    if (after > before) toast('Free can unlocked. Next one is on us.');
    else if (proof) toast('Signed by your wallet. +' + money(BACK_CENTS));
    else if (state.scans.length === 1) toast(Native ? 'Chirp. Connect a wallet to sign your claims.' : 'Chirp. You just got paid.');
    else if (source !== 'tap') toast('Code claimed. +' + money(BACK_CENTS));
    return true;
  }

  // ---------- Calculator ----------
  function calc() {
    const n = Number($('perDay').value);
    const perDay = n * BACK_CENTS;
    $('perDayOut').textContent = n;
    $('perDayNote').textContent = n === 10 ? 'Literally.' : '';
    $('calcMonth').textContent = money(perDay * 30);
    $('calcYear').textContent = money(perDay * 365);
    $('calcFree').textContent = Math.floor((perDay * 365) / PRICE_CENTS).toLocaleString('en-US');
  }

  // ---------- Share + reset ----------
  async function share() {
    const sum = total();
    const text = sum
      ? 'I got paid to drink an energy drink. ' + money(sum) + ' back so far. Scan the can.'
      : 'The first drink that pays you to drink it. Scan the can.';
    if (Native && typeof Native.share === 'function') { Native.share(text + ' ' + SHARE_URL); return; }
    const url = location.href.split(/[?#]/)[0];
    try {
      if (navigator.share) { await navigator.share({ title: 'Good Energy', text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url);
      toast('Copied. Go post it.');
    } catch (e) {
      if (!e || e.name !== 'AbortError') toast('Could not share this time.');
    }
  }

  let resetArmedAt = 0;
  function reset() {
    const b = $('resetBtn');
    if (Date.now() - resetArmedAt > 3000) {
      resetArmedAt = Date.now();
      b.textContent = 'Tap again to reset';
      setTimeout(() => { b.textContent = 'Reset demo'; }, 3000);
      return;
    }
    resetArmedAt = 0;
    const adult = state.adult;
    state = blank();
    state.adult = adult;
    save();
    b.textContent = 'Reset demo';
    render(false);
    toast('Fresh start.');
  }

  // ---------- Wire up ----------
  $('walletBtn').addEventListener('click', onWalletButton);
  $('scanBtn').addEventListener('click', () => claim(randomCode(), 'tap'));
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('codeInput');
    if (await claim(input.value, 'code')) input.value = '';
  });
  $('perDay').addEventListener('input', calc);
  $('shareBtn').addEventListener('click', share);
  $('resetBtn').addEventListener('click', reset);
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); $('scanBtn').click(); }
  });
  setInterval(renderLedger, 30000);

  render(false);
  calc();

  // A QR on the can can open goodenergy://scan?can=CODE (app) or ?can=CODE (web). Each code pays once.
  const linked = new URLSearchParams(location.search).get('can');
  if (linked) {
    history.replaceState(null, '', location.href.split('?')[0]);
    claim(linked, 'link');
  }
})();
