/**
 * Reglas de extracción (regex puras, sin LLM, sin BD). Cubre cada tipo, cada
 * señal crítica, el conteo de pacientes y CADA término costeño/coloquial nuevo.
 *
 * Prueba de mutación mental: los casos costeños usan frases que NO disparan
 * ninguna regla previa — si se borra la regla nueva, el test falla.
 */

import { describe, expect, it } from 'vitest';
import { extractFromTranscript, extractPatientCount } from './extract.js';

const normalize = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

describe('extractFromTranscript — tipos (reglas base)', () => {
  it.each([
    ['Hubo un choque de dos carros en la esquina', 'TRAFFIC_ACCIDENT'],
    ['Mi papá tiene dolor en el pecho', 'CARDIAC'],
    ['No puede respirar, le falta el aire', 'RESPIRATORY'],
    ['Mi esposa está embarazada y con contracciones', 'OBSTETRIC'],
    ['El señor se cayó de una escalera', 'FALL'],
    ['Está inconsciente, no responde', 'UNCONSCIOUS'],
    ['Le dieron un golpe con un machete', 'TRAUMA'],
  ] as const)('clasifica %j como %s', (text, expected) => {
    expect(extractFromTranscript(text).suggestedType).toBe(expected);
  });

  it('sin patrón reconocible => suggestedType null', () => {
    expect(extractFromTranscript('Hay una situación rara en la calle').suggestedType).toBeNull();
  });

  it.each([
    // Bug de flexiones (FIX 6): los stems con `\b` de cierre no matcheaban
    // palabras flexionadas. Cada frase NO dispara ninguna regla previa.
    ['Lo apuñalaron en el barrio anoche', 'TRAUMA'],
    ['Le dispararon dos veces en la pierna', 'TRAUMA'],
    ['Se escucharon varios disparos y hay un hombre tirado sangrando', 'TRAUMA'],
    ['El señor tiene una herida abierta', 'TRAUMA'],
    ['Quedó con el brazo fracturado', 'TRAUMA'],
    ['Tiene quemaduras graves en el brazo', 'TRAUMA'],
    ['Se quemó con aceite hirviendo', 'TRAUMA'],
    ['Está toda quemada del lado izquierdo', 'TRAUMA'],
    ['Se cortó la mano con un cuchillo', 'TRAUMA'],
    ['Unos tipos lo golpearon entre varios', 'TRAUMA'],
    ['Se desmayó de un momento a otro', 'UNCONSCIOUS'],
  ] as const)('flexiones: %j => %s', (text, expected) => {
    expect(extractFromTranscript(text).suggestedType).toBe(expected);
  });

  it.each([
    // Recall de dolor torácico: el acotado no puede tragarse el fraseo real.
    ['tiene un dolor bien fuerte en la mitad del pecho', 'CARDIAC'],
    ['un dolor que le agarra desde el brazo hasta el pecho', 'CARDIAC'],
    ['siente una opresion muy fuerte aqui en todo el pecho', 'CARDIAC'],
    ['el pecho, dice que le duele muchisimo', 'CARDIAC'],
  ] as const)('dolor torácico: %j => %s', (text, expected) => {
    expect(extractFromTranscript(text).suggestedType).toBe(expected);
  });

  it.each([
    // Anti-casos: quitar el `\b` / las flexiones no deben sobre-clasificar
    // habla cotidiana de Cartagena.
    'Eso que dices es un disparate',
    'El piso del andén quedó todo disparejo',
    'La vía está cortada por un árbol caído, no pasa nadie',
    'Hay un carro quemado abandonado en la mitad de la vía',
    'Se cortó la luz en todo el barrio',
    'Me cortaron la llamada y no pude avisar',
    'Se quemó el transformador de la esquina',
    'Se quemó la comida y hay humo en la casa',
  ])('anti-flexión: %j NO es TRAUMA', (text) => {
    expect(extractFromTranscript(text).suggestedType).not.toBe('TRAUMA');
  });

  it('dolor en otra parte del cuerpo Y roce en el pecho NO es CARDIAC (frontera de cláusula)', () => {
    const out = extractFromTranscript(
      'se cayo de la moto, tiene un dolor horrible en la pierna y raspones en el pecho',
    );
    expect(out.suggestedType).not.toBe('CARDIAC');
  });

  it.each([
    // Anti-casos FIX 4: `.*` greedy / "calle" en el patrón "botado".
    ['la moto quedó botada en la calle y el conductor salió corriendo', 'UNCONSCIOUS'],
    ['no puede entrar la ambulancia, están al aire libre esperando', 'RESPIRATORY'],
    ['se agarró de la baranda para no caerse y le quedó doliendo el brazo', 'CARDIAC'],
  ] as const)('%j NO clasifica como %s', (text, notExpected) => {
    expect(extractFromTranscript(text).suggestedType).not.toBe(notExpected);
  });
});

describe('extractFromTranscript — señales críticas (reglas base)', () => {
  it.each([
    ['El bebé no está respirando', 'notBreathing'],
    ['La señora está inconsciente y no reacciona', 'unconscious'],
    ['Sangra mucho, no para de sangrar', 'severeBleeding'],
    ['Está debajo del carro y no puede salir', 'trapped'],
  ] as const)('%j marca signals.%s', (text, signal) => {
    expect(extractFromTranscript(text).signals[signal]).toBe(true);
  });
});

describe('extractPatientCount', () => {
  it.each([
    ['hay dos heridos en el piso', 2],
    ['3 personas lesionadas', 3],
    ['cinco pacientes', 5],
  ] as const)('%j => %i', (text, expected) => {
    expect(extractPatientCount(normalize(text))).toBe(expected);
  });

  it('plural sin número ("varios heridos") => 3', () => {
    expect(extractPatientCount(normalize('hay varios heridos'))).toBe(3);
  });

  it('sin mención de víctimas => null (aplica el default de 1 aguas arriba)', () => {
    expect(extractPatientCount(normalize('un choque en la avenida'))).toBeNull();
  });
});

describe('léxico costeño — tipos', () => {
  it.each([
    // TRAFFIC_ACCIDENT — no contienen choc/estrell/accident (mutación).
    ['una moto contra un bus en la troncal', 'TRAFFIC_ACCIDENT'],
    ['el carro se lo llevo por delante', 'TRAFFIC_ACCIDENT'],
    // CARDIAC — sin "dolor"/"aprieta"/"opresión" (mutación).
    ['al viejo le dio algo en el pecho', 'CARDIAC'],
    ['se agarra el pecho y no puede hablar', 'CARDIAC'],
    // RESPIRATORY — sin "no puede respirar"/"ahog"/"asfixi" (mutación).
    ['el niño no coge aire', 'RESPIRATORY'],
    ['no le entra el aire', 'RESPIRATORY'],
    // UNCONSCIOUS — sin "inconsciente"/"desmay"/"no responde" (mutación).
    ['se privo ahí mismo en la esquina', 'UNCONSCIOUS'],
    ['a la señora le dio el patatus', 'UNCONSCIOUS'],
    ['está botado en el piso y no se mueve', 'UNCONSCIOUS'],
    // TRAUMA — sin "apuñal"/"herid"/"cortad"/"golpe" (mutación).
    ['lo chuzaron en el barrio', 'TRAUMA'],
    ['un tipo lo pincharon en la pelea', 'TRAUMA'],
    ['le metieron un cuchillo en la barriga', 'TRAUMA'],
    ['lo pelaron con una botella', 'TRAUMA'],
    ['sangra a chorro por la pierna', 'TRAUMA'],
    ['está botando mucha sangre', 'TRAUMA'],
  ] as const)('%j => %s', (text, expected) => {
    expect(extractFromTranscript(text).suggestedType).toBe(expected);
  });

  it('"se esta ahogando" sigue clasificando RESPIRATORY (cubierto por `ahog`)', () => {
    expect(extractFromTranscript('el hombre se esta ahogando').suggestedType).toBe('RESPIRATORY');
  });

  it('"guayabo" NO clasifica como accidente ni nada (es resaca, ambiguo)', () => {
    expect(extractFromTranscript('el man tiene un guayabo tremendo').suggestedType).toBeNull();
  });
});

describe('léxico costeño — señales', () => {
  it.each([
    ['sangra a chorro', 'severeBleeding'],
    ['está botando mucha sangre', 'severeBleeding'],
    ['hay un charco de sangre en el piso', 'severeBleeding'],
    ['no se despierta por nada', 'unconscious'],
    ['se quedo tieso en el piso', 'unconscious'],
  ] as const)('%j marca signals.%s', (text, signal) => {
    expect(extractFromTranscript(text).signals[signal]).toBe(true);
  });

  it('"charco de sangre" marca la señal aunque no fije un tipo', () => {
    const out = extractFromTranscript('hay un charco de sangre en el piso');
    expect(out.signals.severeBleeding).toBe(true);
  });

  it('FIX 5: "botando sangre por la nariz" NO es hemorragia catastrófica', () => {
    const out = extractFromTranscript('el niño está botando sangre por la nariz');
    expect(out.signals.severeBleeding).toBeUndefined();
    // Sigue siendo TRAUMA como tipo — solo NO marca la señal P1/ALS.
    expect(out.suggestedType).toBe('TRAUMA');
  });

  it.each([
    ['lo dejaron atrapado bajo los escombros', 'trapped'],
    ['están atrapados dentro del bus', 'trapped'],
  ] as const)('flexiones FIX 6: %j marca signals.%s', (text, signal) => {
    expect(extractFromTranscript(text).signals[signal]).toBe(true);
  });
});
