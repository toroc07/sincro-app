import { scryptSync } from 'node:crypto';
import { MOCK_FACILITIES, MOCK_ZONES } from '@dispatch/contracts';
import { tx, type Queryable } from '../src/client.js';
import { runMigrations } from '../src/migrations.js';

const VEHICLE_COUNT = 30;
const LEVELS = ['BLS', 'BLS', 'ALS', 'MEDICAL_MOTO', 'RESCUE'] as const;

export async function seedDatabase(): Promise<void> {
  await runMigrations();

  // Las POSICIONES son deterministas (se derivan geométricamente del índice),
  // pero los TIMESTAMPS deben ser frescos en cada seed.
  //
  // Con una constante fija aquí, el GPS sembrado nacía con meses de antigüedad
  // y el motor excluía TODA la flota por LOCATION_TOO_STALE (corte: 5 min):
  // cada incidente terminaba en NO_RESOURCE y la demo mostraba cero unidades
  // disponibles. La demo sigue siendo reproducible; lo que se mueve es el reloj.
  const now = Date.now();

  await tx(async (t: Queryable) => {
    await t.run(
      `INSERT INTO organizations (id, name, type, created_at)
       VALUES ('org-ems', 'Red de Emergencias Cartagena', 'EMS', ?)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type`,
      [now],
    );

    const hashPass = (pass: string, salt: string) => `${salt}:${scryptSync(pass, salt, 64).toString('hex')}`;
    const users: Array<[string, string, string, string, string, string]> = [
      ['user-dispatcher', 'DISPATCHER', 'Operador Demo', 'dispatcher@sincro.co', '3007654321', hashPass('dispatcher123', 'sincro_disp')],
      ['user-responder', 'RESPONDER', 'Tripulación Demo', 'responder@sincro.co', '3001234567', hashPass('responder123', 'sincro_resp')],
      ['user-admin', 'ADMIN', 'Administrador Demo', 'admin@sincro.co', '3009999999', hashPass('admin123', 'sincro_adm')],
    ];
    for (const [id, role, name, email, phone, passHash] of users) {
      await t.run(
        `INSERT INTO users (id, org_id, role, name, email, phone, password_hash, created_at)
         VALUES (?, 'org-ems', ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name,
           email = EXCLUDED.email, phone = EXCLUDED.phone, password_hash = EXCLUDED.password_hash`,
        [id, role, name, email, phone, passHash, now],
      );
    }

    for (const f of MOCK_FACILITIES) {
      await t.run(
        `INSERT INTO facilities (id, name, type, lat, lng, capabilities, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
           lat = EXCLUDED.lat, lng = EXCLUDED.lng, capabilities = EXCLUDED.capabilities`,
        [f.id, f.name, f.type, f.lat, f.lng, JSON.stringify(f.capabilities), now],
      );
    }

    for (const z of MOCK_ZONES) {
      await t.run(
        `INSERT INTO zones (id, name, polygon, center_lat, center_lng,
                            target_coverage_units, population_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, polygon = EXCLUDED.polygon,
           center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
           target_coverage_units = EXCLUDED.target_coverage_units,
           population_weight = EXCLUDED.population_weight`,
        [z.id, z.name, JSON.stringify(z.polygon), z.centerLat, z.centerLng,
         z.targetCoverageUnits, z.populationWeight],
      );
    }

    // Reseed idempotente: se limpian solo los vehículos sembrados, respetando
    // el orden de las claves foráneas. Los vehículos reales no se tocan.
    const seededIds = Array.from(
      { length: VEHICLE_COUNT },
      (_, i) => `seed-vehicle-${String(i + 1).padStart(2, '0')}`,
    );
    const list = seededIds.map(() => '?').join(',');
    await t.run(`DELETE FROM dispatch_candidates WHERE vehicle_id IN (${list})`, seededIds);
    await t.run(`DELETE FROM assignments WHERE vehicle_id IN (${list})`, seededIds);
    await t.run(`UPDATE dispatch_runs SET recommended_vehicle_id = NULL WHERE recommended_vehicle_id IN (${list})`, seededIds);
    await t.run(`DELETE FROM vehicle_current_location WHERE vehicle_id IN (${list})`, seededIds);
    await t.run(`DELETE FROM vehicle_locations WHERE vehicle_id IN (${list})`, seededIds);
    await t.run(`DELETE FROM shifts WHERE vehicle_id IN (${list})`, seededIds);
    await t.run(`DELETE FROM vehicles WHERE id IN (${list})`, seededIds);

    for (let index = 0; index < VEHICLE_COUNT; index += 1) {
      const ordinal = index + 1;
      const id = seededIds[index]!;
      const zone = MOCK_ZONES[index % MOCK_ZONES.length]!;
      const ring = Math.floor(index / MOCK_ZONES.length) + 1;
      // Ángulo áureo: reparte las unidades alrededor del centro de zona sin
      // que se apilen sobre una misma línea.
      const angle = ((index * 137.5) * Math.PI) / 180;
      const lat = zone.centerLat + Math.sin(angle) * ring * 0.0012;
      const lng = zone.centerLng + Math.cos(angle) * ring * 0.0012;
      const level = LEVELS[index % LEVELS.length]!;
      const isReserve = ordinal >= 29;
      const shiftId = isReserve ? null : `seed-shift-${String(ordinal).padStart(2, '0')}`;
      const status = isReserve ? 'OFFLINE' : 'AVAILABLE';
      const capabilities = level === 'ALS'
        ? ['OXYGEN', 'DEFIB', 'MONITOR']
        : level === 'RESCUE' ? ['EXTRICATION', 'OXYGEN'] : ['OXYGEN'];
      const homeBaseId = zone.id === 'z-crespo' || zone.id === 'z-boquilla'
        ? 'f-base-crespo' : 'f-base-centro';
      const heading = (index * 47) % 360;

      await t.run(
        `INSERT INTO vehicles (id, org_id, callsign, status, capability_level, capabilities,
           home_base_id, operating_zone_id, current_assignment_id, active_shift_id,
           is_simulated, updated_at)
         VALUES (?, 'org-ems', ?, ?, ?, ?, ?, ?, NULL, ?, TRUE, ?)`,
        [id, `A${String(ordinal).padStart(2, '0')}`, status, level, JSON.stringify(capabilities),
         homeBaseId, zone.id, shiftId, now],
      );
      if (!isReserve) {
        const crewUserIds = id === 'seed-vehicle-05' ? '["user-responder"]' : `["crew-${String(ordinal).padStart(2, '0')}"]`;
        await t.run(
          `INSERT INTO shifts (id, vehicle_id, crew_user_ids, started_at, ended_at)
           VALUES (?, ?, ?, ?, NULL)`,
          [shiftId, id, crewUserIds, now - 3_600_000],
        );
      }
      await t.run(
        `INSERT INTO vehicle_locations (id, vehicle_id, lat, lng, heading, speed_kmh, recorded_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [`seed-location-${String(ordinal).padStart(2, '0')}`, id, lat, lng, heading, now],
      );
      await t.run(
        `INSERT INTO vehicle_current_location (vehicle_id, lat, lng, heading, speed_kmh, recorded_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT (vehicle_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
           heading = EXCLUDED.heading, recorded_at = EXCLUDED.recorded_at`,
        [id, lat, lng, heading, now],
      );
    }
  });
}
