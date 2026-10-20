// Settings can redraw the game underneath a native dialog. Keep a logical
// return target because showModal's original opener may have been replaced.
// This request belongs only to settings, never to a payment/import review.
export function createSettingsFocus(app, dialog) {
  const doc = app.ownerDocument;
  let request = null;
  return {
    capture(control, context) {
      request = app.contains(control) && control?.dataset?.action === 'settings'
        ? {...context} : null;
    },
    cancel() { request = null; },
    restore(context) {
      if (dialog.open) return false;
      const before = request; request = null;
      if (!before || ['screen','view','runId'].some(key => before[key] !== context[key])) return false;
      const active = doc.activeElement;
      // An intervening click or Tab belongs to the player. Do not steal it.
      if (active && active !== doc.body && active !== doc.documentElement
          && !dialog.contains(active) && active.dataset?.action !== 'settings') return false;
      const target = app.querySelector('[data-action="settings"]');
      if (!target || target.disabled || !target.getClientRects().length) return false;
      if (target !== active) target.focus({preventScroll:true});
      return true;
    },
  };
}
