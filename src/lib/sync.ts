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
  /**
   * The server version this browser's unsent edits were made on top of ('' if the server had no project then), or
   * null if it has nothing unsent. It's recorded with the edits themselves: the version the browser last agreed with
   * is shared by every tab, so another tab's save would make stale edits here look up to date.
   */
  dirtyBase: string | null;
  /** the server's version now, or null if it has no project */
  serverRev: string | null;
}): StartupAction {
  if (s.serverRev === null) return s.hasLocal ? 'pushLocal' : 'nothing';
  if (s.dirtyBase === null) return 'useServer';
  return s.dirtyBase === s.serverRev ? 'pushLocal' : 'conflict';
}
