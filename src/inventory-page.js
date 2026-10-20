import {inventoryQuery,inventoryDefense,selectInventoryItems} from './inventory-query.js';

// One app-owned result for consecutive page changes on the same committed
// state. Filters always select afresh. The caller clears this on a full render;
// transactions never read it and the ordinary view/selector remain stateless.
export function createInventoryPageSelection() {
  let snapshot=null,items=null,criteria=null,selection=null,runId=null;
  return {
    read(state,ui,{pageOnly=false}={}) {
      const next=[ui.inventorySlot||'',ui.inventoryRarity??'',inventoryQuery(ui.inventoryQuery).toLowerCase(),inventoryDefense(ui.inventoryDefense),ui.inventorySort||'power'];
      if (!pageOnly || snapshot!==state || items!==state.player.items || runId!==state.runId
          || !criteria || next.some((value,index)=>value!==criteria[index])) {
        selection=selectInventoryItems(state.player.items,ui);
        snapshot=state;items=state.player.items;criteria=next;runId=state.runId;
      }
      return selection;
    },
    clear() { snapshot=null;items=null;criteria=null;selection=null;runId=null; },
  };
}
