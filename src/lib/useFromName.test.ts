import { describe, expect, it } from 'vitest';
import { useFromName } from './unitJobs';

describe('a drawer use read from its name', () => {
  const cases: [string, ReturnType<typeof useFromName>][] = [
    ['Plates 2x6 and longer', { what: 'plates', size: 'long' }],
    ['Plates 2x2, 2x3, 2x4', { what: 'plates' }],
    ['Bricks 1x2', { what: 'bricks' }],
    ['Bricks sloped 1x2, 1x3, 1x4', { what: 'slopes' }],
    ['Curved bricks 1x3 and longer', { what: 'slopes', size: 'long' }],
    ['Technic pins', { what: 'technic-conn' }],
    ['Axels & Pins', { what: 'technic-conn' }],
    ['Technic Bricks', { what: 'technic-struct' }],
    ['Plants & Flowers', { what: 'nature' }],
    ['Small windows & doors', { what: 'building' }],
    ['Wall panels and columns', { what: 'building' }],
    ['Vehicles: Windscreens & misc.', { what: 'wheels' }],
    ['Hinges and joints', { what: 'snot' }],
    ['Minifigure accessories', { what: 'minifig-acc' }],
    ['Brackets', { what: 'plate-special' }],
    ['Bricks: Studs', { what: 'group:bricks' }],
    ['Tiles: 2 x Circles', { what: 'group:plates' }],
    ['Tiles: Cheese wedges', { what: 'slopes' }],
    ['Clips and connectors', null],
    ['Plates and Bricks: 2 x circles', null],
    ['Odds and ends', null],
    ['', null],
  ];
  for (const [name, job] of cases) it(`"${name}"`, () => expect(useFromName(name)).toEqual(job));
});
