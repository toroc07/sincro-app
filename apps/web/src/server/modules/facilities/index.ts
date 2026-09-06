import { MOCK_FACILITIES, type Facility } from '@dispatch/contracts';
import { db, type Queryable } from '@/src/server/infra/db';

interface FacilityRow {
  id: string;
  name: string;
  type: 'HOSPITAL' | 'BASE' | 'TRAUMA_CENTER';
  lat: number;
  lng: number;
  capabilities: string;
}

export async function listFacilities(q: Queryable = db()): Promise<Facility[]> {
  try {
    const rows = await q.many<FacilityRow>(
      `SELECT id, name, type, lat, lng, capabilities FROM facilities ORDER BY name ASC`,
    );
    if (rows && rows.length > 0) {
      return rows.map((r) => {
        let caps: string[] = [];
        try {
          caps = typeof r.capabilities === 'string' ? JSON.parse(r.capabilities) : r.capabilities;
        } catch {
          caps = [];
        }
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          lat: Number(r.lat),
          lng: Number(r.lng),
          capabilities: Array.isArray(caps) ? caps : [],
        };
      });
    }
  } catch (err) {
    console.warn('Error reading facilities table, falling back to mock facilities:', err);
  }
  return MOCK_FACILITIES;
}
