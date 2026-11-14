// エンジン（暦・九星・スコア・ローテーション）の回帰テスト。
// 実行: TZ=Asia/Tokyo node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./load-engine.js');

const NAMES = [
  'restaurants', 'SHOP_GEO', 'SHOP_MAP_POS', 'getRokuyo', 'getLunarDate', 'getMoonPhase', 'getDayKan',
  'getDayKyusei', 'getMonthBoard', 'getYearBoard', 'getSetsuDay', 'calculateRestaurantScores',
  'generateReason', 'lfnApplyRotation', 'lfnRecordTop', 'lfnRecordShown', 'lfnPreview3', 'lfnFoodOf',
  'lfnMoodMatch', 'lfnNow', 'getTimePt', 'lfnClosedNote',
];
const fresh = () => loadEngine(NAMES);
const at = s => new Date(s);              // TZ=Asia/Tokyo 前提のローカル時刻

test('暦・九星: これまでに外部の値と照合した点', () => {
  const E = fresh();
  assert.deepEqual(['2026-07-13', '2026-07-14', '2026-07-15'].map(s => E.getDayKyusei(at(s + 'T12:00:00')).name),
    ['三碧木星', '二黒土星', '一白水星']);
  assert.equal(E.getYearBoard(at('2025-06-01T12:00:00')), '五黄土星');
  assert.equal(E.getYearBoard(at('2026-06-01T12:00:00')), '一白水星');
  assert.equal(E.getSetsuDay(2024, 7), 6, '2024年の小暑は7/6');
  assert.equal(E.getSetsuDay(2025, 2), 3, '2025年の立春は2/3');
  assert.equal(E.getYearBoard(at('2025-02-03T12:00:00')), '五黄土星', '立春当日は新しい年盤');
  assert.deepEqual(E.getLunarDate(at('2026-09-23T15:30:00')), { month: 8, day: 13, leap: false });
  assert.equal(E.getMoonPhase(at('2026-09-23T15:30:00')).phase, '十三夜の月');
});

test('データ: 全38店に方位・座標があり、階が一致する', () => {
  const E = fresh();
  assert.equal(E.restaurants.length, 38);
  for (const s of E.restaurants) {
    assert.ok(E.SHOP_GEO[s.name], s.name + ' の方位');
    assert.ok(E.SHOP_MAP_POS[s.name], s.name + ' の座標');
    assert.equal(E.SHOP_MAP_POS[s.name].floor, s.floor, s.name + ' の階');
    assert.ok(s.cats.length > 0, s.name + ' の食事カテゴリ');
  }
  assert.deepEqual(E.SHOP_MAP_POS['カフェ イタリアン・トマト'], { floor: '1F', x: 65.5, y: 58.0 });
});

test('スコア: 0〜99.9 の範囲に収まり、日によって上端が動く', () => {
  const E = fresh();
  const tops = new Set();
  for (let i = 0; i < 40; i++) {
    for (const h of [10, 12, 15, 19]) {
      for (const mood of [null, 'hearty', 'light', 'noodle', 'sweet', 'cafe']) {
        const d = new Date(2026, 9, 1 + i, h, 30);
        for (const s of E.calculateRestaurantScores(d, mood)) assert.ok(s.score >= 0 && s.score <= 99.9, s.score);
      }
    }
    tops.add(E.calculateRestaurantScores(new Date(2026, 9, 1 + i, 12), null)[0].score);
  }
  assert.ok(tops.size > 5, '1位の点数が毎日同じではない');
});

test('時間帯×ジャンル: おやつ時はスイーツ、昼は定食、夜は夕食向きが高い', () => {
  const E = fresh();
  const shop = n => E.restaurants.find(s => s.name === n);
  assert.ok(E.getTimePt(shop('サーティワンアイスクリーム'), 15) >= 13);
  assert.ok(E.getTimePt(shop('いきなりステーキ'), 15) <= 4);
  assert.equal(E.getTimePt(shop('とんかつ 濱かつ'), 12), 14);
  assert.equal(E.getTimePt(shop('紅虎餃子房'), 19), 14);
  assert.ok(!shop('いきなりステーキ').cats.includes('drink'), 'ドリンクバーでドリンク扱いにしない');
});

test('理由文と代表メニュー', () => {
  const E = fresh();
  const now = at('2026-09-23T15:30:00');
  for (const s of E.calculateRestaurantScores(now, null)) assert.ok(!E.generateReason(s, 5, now).startsWith('。'), s.name);
  assert.equal(E.lfnFoodOf(E.restaurants.find(s => s.name === 'タリーズコーヒー')), 'コーヒー');
  assert.ok(!E.lfnMoodMatch(E.restaurants.find(s => s.name === 'とんかつ 濱かつ'), 'light'));
});

test('ローテーション: 3日予測は実際に占った1位と一致する', () => {
  const E = fresh();
  let hit = 0, total = 0;
  for (let s = 0; s < 30; s++) {
    E.__storage.clear();
    for (let k = -3; k <= 0; k++) {
      const d = new Date(2026, 9, 1 + s + k, 12);
      const l = E.lfnApplyRotation(E.calculateRestaurantScores(d, null).filter(x => x.isOpen), d);
      E.lfnRecordTop(d, l[0].name); E.lfnRecordShown(d, l);
    }
    const base = new Date(2026, 9, 1 + s, 12);
    const pred = [...E.lfnPreview3(base).matchAll(/font-weight:700;">([^<]+)<\/span>/g)].map(m => m[1]);
    for (let i = 1; i <= 3; i++) {
      const d = new Date(base.getTime() + i * 86400000); d.setHours(12, 0, 0, 0);
      const l = E.lfnApplyRotation(E.calculateRestaurantScores(d, null).filter(x => x.isOpen), d);
      E.lfnRecordTop(d, l[0].name); E.lfnRecordShown(d, l);
      total++; if (l[0].name === pred[i - 1]) hit++;
    }
  }
  assert.equal(hit, total);
});

test('ローテーション: 60日で上位3位に30種類以上の店が出る（いつも同じ店にならない）', () => {
  const E = fresh();
  E.__storage.clear();
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const d = new Date(2026, 9, 1 + i, 12);
    const l = E.lfnApplyRotation(E.calculateRestaurantScores(d, null).filter(x => x.isOpen), d);
    E.lfnRecordTop(d, l[0].name); E.lfnRecordShown(d, l);
    l.slice(0, 3).forEach(x => seen.add(x.name));
  }
  assert.ok(seen.size >= 30, String(seen.size));
});

test('時刻: lfnNow は端末のタイムゾーンによらず日本時間の壁時計を返す', () => {
  const E = fresh();
  const realNow = Date.now;
  try {
    Date.now = () => Date.UTC(2026, 10, 14, 3, 30);      // = JST 12:30
    const n = E.lfnNow();
    assert.equal(n.getHours(), 12);
    assert.equal(n.getMinutes(), 30);
  } finally { Date.now = realNow; }
});

test('ローテーション: 「順番を譲っています」は本来の上位3位から下がった店だけに付く', () => {
  const E = fresh();
  E.__storage.clear();
  for (let i = 0; i < 30; i++) {
    const d = new Date(2026, 9, 1 + i, 12);
    const open = E.calculateRestaurantScores(d, null).filter(x => x.isOpen);   // raw 降順 = 本来の順位
    const l = E.lfnApplyRotation(open, d);
    E.lfnRecordTop(d, l[0].name); E.lfnRecordShown(d, l);
    const marked = l.filter(x => x._yielded);
    assert.ok(marked.length <= 3, `${i}日目: ${marked.length}枚`);
    for (const x of marked) {
      const natural = open.findIndex(o => o.name === x.name);
      assert.ok(natural < 3, `${x.name} は本来 ${natural + 1} 位`);
      assert.ok(l.indexOf(x) > natural, `${x.name} は下がっていない`);
    }
  }
});

test('営業時間: 閉店30分前を過ぎた店は「今すぐ行ける店」に入れない', () => {
  const E = fresh();
  const byName = (d, n) => E.calculateRestaurantScores(d, null).find(s => s.name === n);
  // コメダは 10:00〜22:00、スタバ(South Mall)は 10:00〜21:00
  assert.equal(byName(at('2026-11-14T21:20:00'), 'コメダ珈琲店').isOpen, true, '閉店40分前は営業中');
  assert.equal(byName(at('2026-11-14T21:20:00'), 'コメダ珈琲店').minutesLeft, 40);
  assert.equal(byName(at('2026-11-14T21:31:00'), 'コメダ珈琲店').isOpen, false, '閉店29分前は対象外');
  assert.equal(byName(at('2026-11-14T21:31:00'), 'コメダ珈琲店').closingSoon, true);
  assert.equal(byName(at('2026-11-14T20:40:00'), 'スターバックスコーヒー イオンモール宮崎 South Mall 1階店').isOpen, false);
  assert.equal(byName(at('2026-11-14T10:00:00'), 'コメダ珈琲店').isOpen, true, '開店ちょうどは営業中');
  assert.equal(byName(at('2026-11-14T09:59:00'), 'コメダ珈琲店').isOpen, false);
});

test('営業時間: 全店がラストオーダーを過ぎたら閉店の案内を出す', () => {
  const E = fresh();
  assert.match(E.lfnClosedNote(at('2026-11-14T21:40:00')), /まもなく全店/);
  assert.match(E.lfnClosedNote(at('2026-11-14T22:10:00')), /本日の営業は終了/);
  assert.match(E.lfnClosedNote(at('2026-11-14T07:10:00')), /まだ開店前/);
});
