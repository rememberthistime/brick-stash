import { describe, expect, it } from 'vitest';
import { startupAction } from './sync';

describe('startupAction', () => {
  it('moves an existing browser project up to an empty server', () => {
    expect(startupAction({ hasLocal: true, dirtyBase: null, serverRev: null })).toBe('pushLocal');
  });

  it('has nothing to do when neither side has a project', () => {
    expect(startupAction({ hasLocal: false, dirtyBase: null, serverRev: null })).toBe('nothing');
  });

  it('gives a new device the server’s project', () => {
    expect(startupAction({ hasLocal: false, dirtyBase: null, serverRev: '5' })).toBe('useServer');
  });

  it('takes the server’s project over a browser with nothing unsent', () => {
    expect(startupAction({ hasLocal: true, dirtyBase: null, serverRev: '5' })).toBe('useServer');
  });

  it('sends edits the server missed, if the server hasn’t moved on', () => {
    expect(startupAction({ hasLocal: true, dirtyBase: '5', serverRev: '5' })).toBe('pushLocal');
  });

  it('won’t overwrite either side if both have changed', () => {
    expect(startupAction({ hasLocal: true, dirtyBase: '4', serverRev: '5' })).toBe('conflict');
  });

  it('won’t send edits made before the server had a project over one it has since been given', () => {
    expect(startupAction({ hasLocal: true, dirtyBase: '', serverRev: '5' })).toBe('conflict');
  });
});
