// The embeddable script. Vite wraps this module in an IIFE and assigns its exports to
// window.Parbot, so the names exported here are the widget's public API.
import { boot } from './boot';

export { ask, close, open, setMode, toggle } from './boot';

void boot();
