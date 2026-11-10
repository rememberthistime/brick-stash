// Which copy of the project to trust when the app opens: this browser's, or the server's.

export type StartupAction =
  /** take the server's copy */
  | 'useServer'
  /** this browser has something the server hasn't: send it */
  | 'pushLocal'
  /** both changed since they last agreed, so neither can safely replace the other */
  | 'conflict'
  /** nothing anywhere yet */
  | 'nothing';

export function startupAction(s: {
  /** this browser holds a project with something in it */
  hasLocal: boolean;
  /** this browser has edits the server hasn't confirmed */
  dirty: boolean;
  /** the server version this browser last agreed with */
  savedRev: string | null;
  /** the server's version now, or null if it has no project */
  serverRev: string | null;
}): StartupAction {
  if (s.serverRev === null) return s.hasLocal ? 'pushLocal' : 'nothing';
  if (!s.dirty) return 'useServer';
  return s.savedRev === s.serverRev ? 'pushLocal' : 'conflict';
}
