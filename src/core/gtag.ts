/**
 * Empile une commande gtag dans `window.dataLayer`.
 *
 * **La forme empilée est un objet `arguments`, jamais un `Array`.** `gtag.js`
 * ne dispatche une entrée de la file vers son registre de commandes que
 * depuis sa branche « arguments » : il teste
 * `Object.prototype.toString.call(a) === "[object Arguments]"` (ou la
 * présence d'une propriété propre `callee`). Un vrai `Array` empilé dans
 * `dataLayer` est traité comme un *événement* de data layer, jamais comme une
 * commande : le `consent update` n'atteint donc jamais Google et l'état
 * Consent Mode reste `denied` pour toute la session, même après un
 * consentement explicite. Idem pour `js` / `config`, qui ne configurent
 * jamais GA4.
 *
 * C'est exactement ce que fait le shim de phase 1
 * (`function gtag(){dataLayer.push(arguments);}`) ; cette fonction en est
 * l'équivalent local. **On ne s'appuie jamais sur un `window.gtag` global** :
 * un consommateur Next.js qui monte `<ConsentManager>` sans le script de
 * phase 1 n'en a pas, et le module doit rester autonome.
 */
export function gtag(...args: unknown[]): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(toArguments(...args));
}

/** Construit un véritable objet `arguments` à partir d'une liste de valeurs. */
function toArguments(...args: unknown[]): IArguments {
  const capture = function (): IArguments {
    // eslint-disable-next-line prefer-rest-params
    return arguments;
  } as unknown as (...a: unknown[]) => IArguments;
  return capture(...args);
}
