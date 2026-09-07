import { INCIDENT_TYPE } from '@dispatch/contracts';
import { describe, expect, it } from 'vitest';
import { classifyAllIncidentTypes, classifyIncidentType } from './voice.js';

describe('classifyIncidentType', () => {
  it.each([
    ['Hubo un choque de dos carros en la esquina', 'TRAFFIC_ACCIDENT'],
    ['Mi papá tiene un dolor de pecho fuerte', 'CARDIAC'],
    ['La señora no responde, está inconsciente', 'UNCONSCIOUS'],
    ['Se cayó de una escalera', 'FALL'],
    ['Tiene una herida que sangra mucho', 'TRAUMA'],
    ['No puede respirar bien', 'RESPIRATORY'],
    ['Mi esposa está embarazada y con contracciones', 'OBSTETRIC'],
  ] as const)('clasifica %j como %s', (text, expected) => {
    expect(classifyIncidentType(text)).toBe(expected);
  });

  it('devuelve null cuando ningún patrón coincide (la UI deja "OTHER" al criterio del usuario)', () => {
    expect(classifyIncidentType('Hay una situación rara en la calle')).toBeNull();
  });

  it('no distingue mayúsculas/minúsculas ni tildes al buscar la palabra clave', () => {
    expect(classifyIncidentType('CHOQUE de motos')).toBe('TRAFFIC_ACCIDENT');
  });

  it('nunca sugiere un tipo fuera del vocabulario controlado', () => {
    const result = classifyIncidentType('choque con herida y sangrado y no respira');
    expect(result === null || (INCIDENT_TYPE as readonly string[]).includes(result)).toBe(true);
  });

  it.each([
    ['amputa', 'TRAUMA'],
    ['sin piernas', 'TRAUMA'],
    ['el bus le cortó las piernas', 'TRAUMA'],
    ['perdió el brazo', 'TRAUMA'],
  ] as const)('detecta trauma catastrófico: %j', (text, expected) => {
    expect(classifyIncidentType(text)).toBe(expected);
  });
});

describe('classifyIncidentType — léxico costeño / coloquial', () => {
  it.each([
    // Sin 'moto'/'carro'/'choque': solo la frase costeña dispara la regla.
    ['el bus se llevó por delante al ciclista', 'TRAFFIC_ACCIDENT'],
    ['el camión se llevo por delante a un peatón', 'TRAFFIC_ACCIDENT'],
    ['al viejo le dio algo en el pecho', 'CARDIAC'],
    ['se agarra el pecho y no puede ni hablar', 'CARDIAC'],
    ['se privó ahí en plena calle', 'UNCONSCIOUS'],
    ['a la señora le dio un patatús', 'UNCONSCIOUS'],
    ['está botado en el piso y no se mueve', 'UNCONSCIOUS'],
    ['el man no se despierta', 'UNCONSCIOUS'],
    ['se quedó tieso de un momento a otro', 'UNCONSCIOUS'],
    ['lo chuzaron en el barrio', 'TRAUMA'],
    ['unos tipos lo pincharon', 'TRAUMA'],
    ['le metieron un cuchillo en la pelea', 'TRAUMA'],
    ['lo pelaron con una botella', 'TRAUMA'],
    ['está sangra a chorro por el brazo', 'TRAUMA'],
    ['el niño no coge aire', 'RESPIRATORY'],
    ['no le entra el aire', 'RESPIRATORY'],
  ] as const)('clasifica %j como %s', (text, expected) => {
    expect(classifyIncidentType(text)).toBe(expected);
  });

  it('"guayabo" no se clasifica (es resaca, ambiguo)', () => {
    expect(classifyIncidentType('el man está con un guayabo tremendo')).toBeNull();
  });

  it.each([
    // Substrings demasiado laxos que se afinaron: NO deben disparar el tipo.
    ['el poste está botado en la vía desde ayer', 'UNCONSCIOUS'],
    ['vamos para el chuzo de la esquina a comer algo', 'TRAUMA'],
  ] as const)('%j NO clasifica como %s', (text, notExpected) => {
    expect(classifyAllIncidentTypes(text)).not.toContain(notExpected);
  });

  it('"pincharon la llanta" no añade TRAUMA (es mecánica, no un arma)', () => {
    expect(classifyAllIncidentTypes('pincharon la llanta del carro en la autopista'))
      .not.toContain('TRAUMA');
  });
});

describe('classifyAllIncidentTypes', () => {
  it('devuelve TODOS los tipos que coinciden, no solo el primero', () => {
    const result = classifyAllIncidentTypes('está inconsciente y el bus le cortó las piernas');
    expect(result).toEqual(expect.arrayContaining(['UNCONSCIOUS', 'TRAUMA']));
  });

  it('devuelve arreglo vacío cuando no coincide nada', () => {
    expect(classifyAllIncidentTypes('una situación rara')).toEqual([]);
  });

  it('classifyIncidentType es el primer elemento de classifyAllIncidentTypes', () => {
    const text = 'choque con herida';
    expect(classifyIncidentType(text)).toBe(classifyAllIncidentTypes(text)[0] ?? null);
  });
});
