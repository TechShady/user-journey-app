const steps = [
  {label:'Landing',identifiers:['/','/home','/index'],type:'view'},
  {label:'Browse',identifiers:['/products','/category/*','/search'],type:'view'},
  {label:'Detail',identifiers:['/product/*','/products/:id:'],type:'view'},
  {label:'Cart',identifiers:['/cart'],type:'view'},
  {label:'Checkout',identifiers:['/checkout','/order/confirm*'],type:'view'},
];

function identifierFilter(id, type) {
  const field = 'view.name';
  const startsW = id.startsWith('*');
  const endsW = id.endsWith('*');
  const midIdx = id.indexOf('*', 1);
  if (!startsW && !endsW && midIdx > 0) {
    const parts = id.split('*');
    if (parts.length === 2) return `(startsWith(${field}, "${parts[0]}") and endsWith(${field}, "${parts[1]}"))`;
  }
  if (startsW && endsW && id.length > 2) return `contains(${field}, "${id.slice(1, -1)}")`;
  if (endsW) return `startsWith(${field}, "${id.slice(0, -1)}")`;
  if (startsW) return `endsWith(${field}, "${id.slice(1)}")`;
  return `${field} == "${id}"`;
}

function stepFilter(s) {
  const filters = s.identifiers.map(id => identifierFilter(id, s.type));
  return filters.length === 1 ? filters[0] : `(${filters.join(" or ")})`;
}

function anyStepFilter(steps) { return steps.map(stepFilter).join(" or "); }

const firstExpr = stepFilter(steps[0]);
const lastExpr = stepFilter(steps[steps.length - 1]);

const query = `fetch user.events, from: now() - 7d
| filter frontend.name == "Product_Browse"
| filter ${anyStepFilter(steps)}
| fieldsAdd country = geo.country.iso_code
| fieldsAdd is_entry = ${firstExpr}
| fieldsAdd is_conv = ${lastExpr}
| summarize
    total_sessions = countDistinct(dt.rum.session.id),
    entry_sessions = countDistinctIf(dt.rum.session.id, is_entry == true),
    conv_sessions = countDistinctIf(dt.rum.session.id, is_conv == true),
    by: {country}
| fieldsAdd conv_rate = if(entry_sessions > 0, toDouble(conv_sessions) / toDouble(entry_sessions) * 100.0, else: 0.0)
| sort total_sessions desc
| limit 10`;

console.log("=== Generated Query ===");
console.log(query);
