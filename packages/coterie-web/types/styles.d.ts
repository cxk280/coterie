// xterm ships a plain CSS file (no exports map / types); declare it so the
// side-effect import in app/terminal/page.tsx typechecks.
declare module "@xterm/xterm/css/xterm.css";
