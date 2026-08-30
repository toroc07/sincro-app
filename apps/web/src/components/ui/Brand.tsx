/**
 * Marca SINCRO.
 *
 * Dos piezas y dos tintas, nada más: el lockup (isotipo + SINCRO) para las
 * pantallas de entrada, donde hace falta decir quién responde, y el isotipo
 * suelto para las cabeceras de trabajo. La tinta `white` existe porque la
 * cabecera del responder es un bloque de color plano y el logo a color se
 * ensucia encima.
 *
 * El lockup NO lleva el descriptor ("sistema de despacho coordinado…"): a la
 * altura a la que cabe un logo en un móvil se convierte en una mancha gris. Va
 * en la vista previa al compartir (og-sincro.png), que sí se ve a 1200 px.
 *
 * Siempre con width/height explícitos: la cabecera es lo primero que pinta la
 * pantalla y un logo sin dimensiones empuja el titular hacia abajo al cargar,
 * justo cuando alguien ya está intentando tocar el botón.
 */

const LOCKUP_RATIO = 900 / 278;
const MARK_RATIO = 512 / 511;

const LOCKUP_ALT = 'SINCRO · Sistema de despacho coordinado de emergencias, Cartagena';

type Tone = 'color' | 'white';

/** Logo completo: isotipo + nombre + descriptor. */
export function BrandLockup({ height = 40, tone = 'color', className = '' }: {
  height?: number; tone?: Tone; className?: string;
}) {
  return (
    <img
      src={tone === 'white' ? '/images/sincro-lockup-white.png' : '/images/sincro-lockup.png'}
      alt={LOCKUP_ALT}
      width={Math.round(height * LOCKUP_RATIO)}
      height={height}
      className={`block h-auto max-w-full ${className}`}
      style={{ width: Math.round(height * LOCKUP_RATIO) }}
      decoding="async"
    />
  );
}

/**
 * Isotipo suelto. Por defecto es decorativo: casi siempre va pegado a un
 * titular que ya nombra la pantalla, y repetir "SINCRO" en el lector de
 * pantalla solo estorba. `labelled` lo activa cuando va solo.
 */
export function BrandMark({ size = 40, tone = 'color', className = '', labelled = false }: {
  size?: number; tone?: Tone; className?: string; labelled?: boolean;
}) {
  return (
    <img
      src={tone === 'white' ? '/images/sincro-mark-white.png' : '/images/sincro-mark.png'}
      alt={labelled ? LOCKUP_ALT : ''}
      aria-hidden={labelled ? undefined : true}
      width={Math.round(size * MARK_RATIO)}
      height={size}
      className={`block shrink-0 ${className}`}
      style={{ width: Math.round(size * MARK_RATIO), height: size }}
      decoding="async"
    />
  );
}
