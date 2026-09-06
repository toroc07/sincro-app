import { describe, expect, it } from 'vitest';
import { listFacilities } from './index';

describe('facilities module', () => {
  it('retorna hospitales y centros de trauma desde la base de datos', async () => {
    const mockDb = {
      many: async () => [
        {
          id: 'f-serena',
          name: 'Hospital Serena del Mar',
          type: 'TRAUMA_CENTER' as const,
          lat: 10.5069,
          lng: -75.4633,
          capabilities: JSON.stringify(['TRAUMA', 'CARDIAC', 'SURGERY']),
        },
        {
          id: 'f-bocagrande',
          name: 'Hospital Bocagrande',
          type: 'HOSPITAL' as const,
          lat: 10.3993,
          lng: -75.5556,
          capabilities: JSON.stringify(['EMERGENCY', 'CARDIAC']),
        },
      ],
      one: async () => null,
      run: async () => {},
    };

    const facilities = await listFacilities(mockDb as any);
    expect(facilities).toHaveLength(2);
    expect(facilities[0]!.name).toBe('Hospital Serena del Mar');
    expect(facilities[0]!.type).toBe('TRAUMA_CENTER');
    expect(facilities[0]!.capabilities).toContain('TRAUMA');
  });

  it('degrada limpiamente a MOCK_FACILITIES si la base de datos falla', async () => {
    const brokenDb = {
      many: async () => {
        throw new Error('Connection refused');
      },
      one: async () => null,
      run: async () => {},
    };

    const facilities = await listFacilities(brokenDb as any);
    expect(facilities.length).toBeGreaterThan(0);
    expect(facilities.some((f) => f.id === 'f-serena')).toBe(true);
  });
});
