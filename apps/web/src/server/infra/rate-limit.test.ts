import { beforeEach, describe, expect, it } from 'vitest';
import { __resetReportRateLimit, checkReportRateLimit } from './rate-limit';

describe('checkReportRateLimit', () => {
  beforeEach(() => __resetReportRateLimit());

  it('teléfono: deja pasar 5 hits y marca el 6º', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(checkReportRateLimit(['tel:573001112222'], t0 + i * 1_000).limited).toBe(false);
    }
    expect(checkReportRateLimit(['tel:573001112222'], t0 + 6_000))
      .toEqual({ limited: true, key: 'tel:573001112222' });
  });

  it('IP: cupo mucho más alto que el teléfono (CGNAT)', () => {
    const t0 = 1_500_000;
    for (let i = 0; i < 20; i += 1) {
      expect(checkReportRateLimit(['ip:190.0.0.1'], t0 + i).limited).toBe(false);
    }
    expect(checkReportRateLimit(['ip:190.0.0.1'], t0 + 21).limited).toBe(true);
  });

  it('claves distintas no se contaminan entre sí', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 6; i += 1) checkReportRateLimit(['tel:AAA'], t0 + i * 500);
    expect(checkReportRateLimit(['tel:AAA'], t0 + 6_000).limited).toBe(true);
    expect(checkReportRateLimit(['ip:BBB'], t0 + 6_000).limited).toBe(false);
  });

  it('marca limited si CUALQUIERA de las claves supera su cupo', () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 6; i += 1) checkReportRateLimit(['tel:X'], t0 + i * 100);
    const mixed = checkReportRateLimit(['ip:fresca', 'tel:X'], t0 + 1_000);
    expect(mixed).toEqual({ limited: true, key: 'tel:X' });
  });

  it('dedupeKey: un reintento del mismo POST no consume cupo', () => {
    const t0 = 3_500_000;
    // 4 hits legítimos.
    for (let i = 0; i < 4; i += 1) checkReportRateLimit(['tel:Z'], t0 + i * 100);
    // El 5º llega con dedupeKey y se reintenta 10 veces: debe contar UNA sola vez.
    for (let i = 0; i < 10; i += 1) {
      expect(checkReportRateLimit(['tel:Z'], t0 + 500 + i, 'idem-abc').limited).toBe(false);
    }
    // Un 6º hit REAL (sin dedupeKey, o con otra) sí supera: 5 reales previos + este.
    expect(checkReportRateLimit(['tel:Z'], t0 + 2_000).limited).toBe(true);
  });

  it('la ventana de 60s se desliza y las claves vacías se purgan', () => {
    const t0 = 4_000_000;
    for (let i = 0; i < 6; i += 1) checkReportRateLimit(['tel:Y'], t0 + i * 1_000);
    expect(checkReportRateLimit(['tel:Y'], t0 + 6_000).limited).toBe(true);
    // Muy pasada la ventana: los hits viejos caducaron y la clave se purgó.
    expect(checkReportRateLimit(['tel:otra'], t0 + 200_000).limited).toBe(false);
    expect(checkReportRateLimit(['tel:Y'], t0 + 200_100).limited).toBe(false);
  });
});
