// Only view choices use this updater. It receives a freshly generated complete
// inventory view; gameplay commits and external save changes use full render().
// Retain unchanged regions and identical full cards, without caching a model or
// suppressing current filtering, ordering, comparison or recycling calculations.
const cardId=node=>node.nodeType===1&&node.classList.contains('item-card')
  ? node.querySelector('[data-action="lock"][data-id]')?.dataset.id : null;

function updateList(current,next) {
  const original=[...current.childNodes],cards=new Map();
  for(const node of original){const id=cardId(node);if(id&&!cards.has(id))cards.set(id,node);}
  const used=new Set();
  let cursor=current.firstChild;
  for(const incoming of [...next.childNodes]){
    const id=cardId(incoming),old=id?cards.get(id):null;
    const node=old&&!used.has(old)&&old.isEqualNode(incoming)?old:incoming;
    used.add(node);
    if(node!==cursor)current.insertBefore(node,cursor);
    cursor=node.nextSibling;
  }
  for(const node of original)if(!used.has(node))node.remove();
}

export function updateInventoryDOM(app,html) {
  const current=app.querySelector('.inventory-screen');
  if(!current)return false;
  const template=app.ownerDocument.createElement('template');
  template.innerHTML=html;
  const next=template.content.firstElementChild;
  if(!next?.classList.contains('inventory-screen')||template.content.childElementCount!==1
      ||!current.cloneNode(false).isEqualNode(next.cloneNode(false)))return false;
  const original=[...current.childNodes],incoming=[...next.childNodes];
  if(original.length!==incoming.length)return false;
  // Live input/select values are not compared by isEqualNode. A clear action
  // must clear a dirty native input even if its original value attribute was
  // already empty, and native selects must reflect the current UI selection.
  const values=[...next.querySelectorAll('#inventory-query, #inventory-rarity, #inventory-sort, #inventory-defense')]
    .map(node=>({id:node.id,value:node.value}));
  for(let index=0;index<original.length;index++){
    const node=original[index],replacement=incoming[index];
    if(node.isEqualNode(replacement))continue;
    if(node.nodeType===1&&replacement.nodeType===1&&node.classList.contains('inventory-list')&&replacement.classList.contains('inventory-list')
        &&node.cloneNode(false).isEqualNode(replacement.cloneNode(false)))
      updateList(node,replacement);
    else node.replaceWith(replacement);
  }
  for(const {id,value} of values){const node=current.querySelector(`#${CSS.escape(id)}`);if(node&&node.value!==value)node.value=value;}
  return true;
}
