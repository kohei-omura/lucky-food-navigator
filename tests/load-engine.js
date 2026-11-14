// index.html の <script> を Node で読み込むための最小限の土台（ブラウザAPIの代用品）。
// 依存パッケージなしで `node --test tests/` だけで動く。
'use strict';
const fs = require('fs');
const path = require('path');

function makeShim() {
  const store = {};
  const el = () => ({
    textContent: '', innerHTML: '', style: {}, dataset: {}, className: '', id: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {}, appendChild() {}, insertBefore() {}, setAttribute() {},
    getAttribute() { return ''; }, querySelector() { return el(); }, focus() {}, select() {},
    scrollTo() {}, clientWidth: 400, clientHeight: 283, parentNode: null,
  });
  return {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; },
    },
    document: {
      getElementById: () => el(), createElement: el, addEventListener() {},
      activeElement: null, visibilityState: 'visible',
      body: { appendChild() {}, removeChild() {} },
    },
    navigator: {},
    window: { addEventListener() {} },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
  };
}

// 公開したい関数名を並べると、それらを持つオブジェクトを返す
function loadEngine(names) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const shim = makeShim();
  const params = Object.keys(shim);
  const body = src + '\n;return {' + names.map(n => `${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',') + '};';
  const api = new Function(...params, body)(...params.map(k => shim[k]));
  api.__storage = shim.localStorage;
  return api;
}

module.exports = { loadEngine };
