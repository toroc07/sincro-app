-- Normaliza los teléfonos ya guardados con el MISMO criterio que
-- `normalizePhone()` en la aplicación (solo dígitos; y si quedan 12 dígitos
-- que empiezan por 57 —móvil colombiano con prefijo país— se recorta el 57),
-- para que el upsert por teléfono de Fase E sea consistente.
--
-- El seed no crea ciudadanos, así que en local esto es no-op. Se asume base
-- limpia: si hubiera duplicados por dígitos, el UPDATE chocaría con
-- ux_citizens_phone (aceptable para una demo).
UPDATE citizens SET phone = CASE
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 12
   AND regexp_replace(phone, '\D', '', 'g') LIKE '57%'
    THEN substr(regexp_replace(phone, '\D', '', 'g'), 3)
  ELSE regexp_replace(phone, '\D', '', 'g')
END;
