// Static regression checks for Qonto private cash-flow tracking.
const fs=require('node:fs'),assert=require('node:assert/strict');
const q=fs.readFileSync(require('node:path').join(__dirname,'../qonto.js'),'utf8');
assert.match(q,/classification\(t\).*unklar/);
assert.match(q,/Privater Geldabfluss/);
assert.match(q,/Geliehen \/ Geldtransfer/);
assert.match(q,/qontoClassify/);
assert.match(q,/bar:amount,karte:0/);
assert.doesNotMatch(q,/bar:amount,karte:amount/);
console.log('PASS Qonto private classification, summary and non-duplicating bank income');
