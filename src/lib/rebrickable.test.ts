import { describe, expect, it } from 'vitest';
import { formatSetLines, parseSetLines, parseSetList } from './rebrickable';

describe('set lists', () => {
  it("reads Rebrickable's set list export", () => {
    const csv = ['Set Number,Quantity,Includes Spares,Inventory Ver', '75908-1,1,True,1', '31137-1,2,True,1'].join('\n');
    expect(parseSetList(csv)).toEqual([
      { setNum: '75908-1', copies: 1 },
      { setNum: '31137-1', copies: 2 },
    ]);
  });

  it('counts a set listed under two inventory versions as two copies', () => {
    const csv = ['Set Number,Quantity,Inventory Ver', '6285-1,1,1', '6285-1,1,2', '6276-1,1,1'].join('\n');
    expect(parseSetList(csv)).toEqual([
      { setNum: '6285-1', copies: 2 },
      { setNum: '6276-1', copies: 1 },
    ]);
  });

  it('does not mistake a parts list for a set list', () => {
    expect(parseSetList('Part,Color,Quantity\n3001,4,2')).toBeNull();
    expect(parseSetList('10294\n75192')).toBeNull();
  });

  it('round-trips through the text box', () => {
    const sets = [
      { setNum: '6285-1', copies: 2 },
      { setNum: '6276-1', copies: 1 },
    ];
    expect(parseSetLines(formatSetLines(sets))).toEqual(sets);
  });

  it('accepts typed lines and pasted spreadsheet rows', () => {
    expect(parseSetLines('10294\n75192 x2')).toEqual([
      { setNum: '10294-1', copies: 1 },
      { setNum: '75192-1', copies: 2 },
    ]);
    // Stray quantity and version columns aren't sets
    expect(parseSetLines('6981-1,1,2\n6672-1,1,1')).toEqual([
      { setNum: '6981-1', copies: 1 },
      { setNum: '6672-1', copies: 1 },
    ]);
  });
});
